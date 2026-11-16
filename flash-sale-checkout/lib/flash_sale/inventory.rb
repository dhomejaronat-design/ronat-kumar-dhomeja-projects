module FlashSale
  # Stock is tracked with two numbers per SKU:
  #   on_hand  - units physically in the warehouse
  #   reserved - units held by checkouts that have not paid yet
  # A shopper can only buy what is available: on_hand minus reserved.
  class Inventory
    def initialize(database)
      @database = database
    end

    # Creates a SKU, or adds stock to one that already exists.
    def add(sku:, name:, price_cents:, stock:)
      raise ValidationError, "sku is required" unless sku.is_a?(String) && !sku.strip.empty?
      raise ValidationError, "name is required" unless name.is_a?(String) && !name.strip.empty?
      raise ValidationError, "price_cents must be a whole number of 0 or more" unless whole?(price_cents)
      raise ValidationError, "stock must be a whole number of 0 or more" unless whole?(stock)

      @database.transaction do |db|
        db.execute(<<~SQL, [sku, name, price_cents, stock])
          INSERT INTO variants (sku, name, price_cents, on_hand)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (sku) DO UPDATE SET
            name = excluded.name,
            price_cents = excluded.price_cents,
            on_hand = on_hand + excluded.on_hand
        SQL
      end
      find(sku)
    end

    def find(sku)
      row = @database.with do |db|
        db.get_first_row("SELECT * FROM variants WHERE sku = ?", [sku])
      end
      raise NotFound, "unknown sku: #{sku}" unless row

      present(row)
    end

    # SKUs whose available count is at or below the threshold, A to Z.
    def low_stock(threshold)
      rows = @database.with do |db|
        db.execute(<<~SQL, [threshold])
          SELECT * FROM variants
          WHERE on_hand - reserved <= ?
          ORDER BY sku
        SQL
      end
      rows.map { |row| present(row) }
    end

    # The three methods below must run inside an open transaction.

    # Holds units for a checkout. The stock check and the update are one SQL
    # statement, so two shoppers can never both take the last unit.
    def self.hold(db, sku, qty)
      db.execute(<<~SQL, [qty, sku, qty])
        UPDATE variants
        SET reserved = reserved + ?
        WHERE sku = ? AND on_hand - reserved >= ?
      SQL
      db.changes == 1
    end

    # Gives held units back (the checkout was cancelled or ran out of time).
    def self.release(db, sku, qty)
      db.execute("UPDATE variants SET reserved = reserved - ? WHERE sku = ?", [qty, sku])
    end

    # The shopper paid, so the held units leave the warehouse for good.
    def self.ship(db, sku, qty)
      db.execute(<<~SQL, [qty, qty, sku])
        UPDATE variants
        SET on_hand = on_hand - ?, reserved = reserved - ?
        WHERE sku = ?
      SQL
    end

    private

    def whole?(value)
      value.is_a?(Integer) && value >= 0
    end

    def present(row)
      {
        sku: row["sku"],
        name: row["name"],
        price_cents: row["price_cents"],
        on_hand: row["on_hand"],
        reserved: row["reserved"],
        available: row["on_hand"] - row["reserved"]
      }
    end
  end
end
