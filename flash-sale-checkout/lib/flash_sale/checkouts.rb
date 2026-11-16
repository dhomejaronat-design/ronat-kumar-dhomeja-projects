module FlashSale
  # A checkout moves through these states:
  #
  #   reserved --pay-----> paid
  #   reserved --cancel--> cancelled
  #   reserved --timeout-> expired
  #
  # Creating a checkout holds stock for a few minutes. Paying turns the hold
  # into a sale. Cancelling or timing out gives the stock back.
  class Checkouts
    HOLD_SECONDS = 600

    def initialize(database, secret:, clock: -> { Time.now.to_i }, hold_seconds: HOLD_SECONDS)
      @database = database
      @secret = secret
      @clock = clock
      @hold_seconds = hold_seconds
    end

    # items: [{ "sku" => "TEE", "qty" => 2 }, ...]
    #
    # All or nothing: if any line is short on stock, the transaction rolls
    # back and nothing is held.
    #
    # idempotency_key: if the client retries with the same key (for example
    # after a network timeout), it gets the original checkout back instead of
    # a second one.
    def create(items:, codes: [], idempotency_key: nil)
      lines = normalize_items(items)
      codes = Discounts.normalize(codes)
      request_hash = Digest::SHA256.hexdigest(JSON.generate([lines, codes]))

      expire_stale!

      @database.transaction do |db|
        if idempotency_key
          seen = db.get_first_row("SELECT * FROM idempotency_keys WHERE key = ?", [idempotency_key])
          if seen
            unless seen["request_hash"] == request_hash
              raise IdempotencyConflict, "this idempotency key was already used for a different cart"
            end
            next load(db, seen["checkout_id"]).merge(replayed: true)
          end
        end

        priced = lines.map do |sku, qty|
          variant = db.get_first_row("SELECT price_cents FROM variants WHERE sku = ?", [sku])
          raise ValidationError, "unknown sku: #{sku}" unless variant
          raise InsufficientStock, "not enough stock for #{sku}" unless Inventory.hold(db, sku, qty)

          { sku: sku, qty: qty, unit_price_cents: variant["price_cents"] }
        end

        totals = Discounts.price(priced, codes)
        id = SecureRandom.uuid
        now = @clock.call

        db.execute(<<~SQL, [id, totals[:subtotal_cents], totals[:discount_cents], totals[:total_cents], JSON.generate(totals[:applied_codes]), now + @hold_seconds, now])
          INSERT INTO checkouts
            (id, status, subtotal_cents, discount_cents, total_cents, applied_codes, expires_at, created_at)
          VALUES (?, 'reserved', ?, ?, ?, ?, ?, ?)
        SQL
        priced.each do |line|
          db.execute(
            "INSERT INTO checkout_lines (checkout_id, sku, qty, unit_price_cents) VALUES (?, ?, ?, ?)",
            [id, line[:sku], line[:qty], line[:unit_price_cents]]
          )
        end
        if idempotency_key
          db.execute(
            "INSERT INTO idempotency_keys (key, request_hash, checkout_id) VALUES (?, ?, ?)",
            [idempotency_key, request_hash, id]
          )
        end

        load(db, id).merge(replayed: false)
      end
    end

    def find(id)
      checkout = @database.with { |db| load(db, id) }
      raise NotFound, "unknown checkout: #{id}" unless checkout

      checkout
    end

    # Paying twice is safe: the second call returns the same paid checkout
    # and does not touch stock again.
    def pay(id)
      expire_stale!

      @database.transaction do |db|
        checkout = load(db, id)
        raise NotFound, "unknown checkout: #{id}" unless checkout
        next checkout if checkout[:status] == "paid"

        if checkout[:status] == "expired" || (checkout[:status] == "reserved" && checkout[:expires_at] <= @clock.call)
          raise HoldExpired, "the hold on this checkout has expired"
        end
        raise InvalidState, "cannot pay a #{checkout[:status]} checkout" unless checkout[:status] == "reserved"

        checkout[:lines].each { |line| Inventory.ship(db, line[:sku], line[:qty]) }
        db.execute("UPDATE checkouts SET status = 'paid' WHERE id = ?", [id])
        record_event(db, "orders/paid", {
          checkout_id: id,
          total_cents: checkout[:total_cents],
          lines: checkout[:lines]
        })

        load(db, id)
      end
    end

    def cancel(id)
      @database.transaction do |db|
        checkout = load(db, id)
        raise NotFound, "unknown checkout: #{id}" unless checkout
        next checkout if checkout[:status] == "cancelled"
        raise InvalidState, "cannot cancel a #{checkout[:status]} checkout" unless checkout[:status] == "reserved"

        checkout[:lines].each { |line| Inventory.release(db, line[:sku], line[:qty]) }
        db.execute("UPDATE checkouts SET status = 'cancelled' WHERE id = ?", [id])

        load(db, id)
      end
    end

    # Gives stock back from every checkout whose hold has run out.
    # Returns how many checkouts were expired.
    def expire_stale!
      @database.transaction do |db|
        stale = db.execute(
          "SELECT id FROM checkouts WHERE status = 'reserved' AND expires_at <= ?",
          [@clock.call]
        )
        stale.each do |row|
          lines(db, row["id"]).each { |line| Inventory.release(db, line[:sku], line[:qty]) }
          db.execute("UPDATE checkouts SET status = 'expired' WHERE id = ?", [row["id"]])
        end
        stale.size
      end
    end

    def events
      rows = @database.with { |db| db.execute("SELECT * FROM events ORDER BY id") }
      rows.map do |row|
        { id: row["id"], topic: row["topic"], payload: row["payload"], signature: row["signature"] }
      end
    end

    private

    # Turns the request into a sorted list of [sku, qty] pairs, adding up
    # repeated SKUs, so the same cart always produces the same request hash.
    def normalize_items(items)
      raise ValidationError, "items must be a non-empty list" unless items.is_a?(Array) && !items.empty?

      merged = Hash.new(0)
      items.each do |item|
        raise ValidationError, "each item needs a sku and a qty" unless item.is_a?(Hash)

        sku = item["sku"] || item[:sku]
        qty = item["qty"] || item[:qty]
        raise ValidationError, "each item needs a sku" unless sku.is_a?(String) && !sku.strip.empty?
        raise ValidationError, "qty must be a whole number above 0" unless qty.is_a?(Integer) && qty.positive?

        merged[sku] += qty
      end
      merged.sort
    end

    def load(db, id)
      row = db.get_first_row("SELECT * FROM checkouts WHERE id = ?", [id])
      return nil unless row

      {
        id: row["id"],
        status: row["status"],
        subtotal_cents: row["subtotal_cents"],
        discount_cents: row["discount_cents"],
        total_cents: row["total_cents"],
        applied_codes: JSON.parse(row["applied_codes"]),
        expires_at: row["expires_at"],
        lines: lines(db, id)
      }
    end

    def lines(db, checkout_id)
      rows = db.execute(
        "SELECT sku, qty, unit_price_cents FROM checkout_lines WHERE checkout_id = ? ORDER BY sku",
        [checkout_id]
      )
      rows.map { |row| { sku: row["sku"], qty: row["qty"], unit_price_cents: row["unit_price_cents"] } }
    end

    # Events go into an outbox table in the same transaction as the sale, so
    # an order can never be paid without its event being recorded.
    def record_event(db, topic, data)
      payload = JSON.generate(data)
      db.execute(
        "INSERT INTO events (topic, payload, signature, created_at) VALUES (?, ?, ?, ?)",
        [topic, payload, Webhooks.sign(payload, @secret), @clock.call]
      )
    end
  end
end
