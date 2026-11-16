module FlashSale
  # The JSON HTTP API. It is a plain Rack app: `call` takes a request and
  # returns [status, headers, body].
  class App
    ROUTES = [
      ["GET",  %r{\A/health\z},                          :health],
      ["POST", %r{\A/variants\z},                        :create_variant],
      ["GET",  %r{\A/variants/(?<sku>[^/]+)\z},          :show_variant],
      ["GET",  %r{\A/inventory/low_stock\z},             :low_stock],
      ["POST", %r{\A/checkouts\z},                       :create_checkout],
      ["GET",  %r{\A/checkouts/(?<id>[^/]+)\z},          :show_checkout],
      ["POST", %r{\A/checkouts/(?<id>[^/]+)/pay\z},      :pay_checkout],
      ["POST", %r{\A/checkouts/(?<id>[^/]+)/cancel\z},   :cancel_checkout],
      ["GET",  %r{\A/events\z},                          :list_events]
    ].freeze

    def self.build(path:, secret:, clock: -> { Time.now.to_i })
      database = Database.new(path)
      new(
        inventory: Inventory.new(database),
        checkouts: Checkouts.new(database, secret: secret, clock: clock)
      )
    end

    def initialize(inventory:, checkouts:)
      @inventory = inventory
      @checkouts = checkouts
    end

    def call(env)
      request = Rack::Request.new(env)

      ROUTES.each do |verb, pattern, handler|
        next unless request.request_method == verb

        match = pattern.match(request.path_info)
        next unless match

        status, body = send(handler, request, match)
        return json(status, body)
      end

      json(404, { error: "no such route" })
    rescue Error => e
      json(e.status, { error: e.message })
    rescue JSON::ParserError
      json(400, { error: "the request body must be valid JSON" })
    end

    private

    def health(_request, _match)
      [200, { status: "ok" }]
    end

    def create_variant(request, _match)
      body = parse(request)
      variant = @inventory.add(
        sku: body["sku"],
        name: body["name"],
        price_cents: body["price_cents"],
        stock: body["stock"]
      )
      [201, variant]
    end

    def show_variant(_request, match)
      [200, @inventory.find(param(match, :sku))]
    end

    def low_stock(request, _match)
      threshold = Integer(request.params.fetch("threshold", "5"), exception: false)
      raise ValidationError, "threshold must be a whole number" unless threshold

      [200, { variants: @inventory.low_stock(threshold) }]
    end

    def create_checkout(request, _match)
      body = parse(request)
      checkout = @checkouts.create(
        items: body["items"],
        codes: body["codes"],
        idempotency_key: utf8(request.get_header("HTTP_IDEMPOTENCY_KEY"))
      )
      [checkout[:replayed] ? 200 : 201, checkout]
    end

    def show_checkout(_request, match)
      [200, @checkouts.find(param(match, :id))]
    end

    def pay_checkout(_request, match)
      [200, @checkouts.pay(param(match, :id))]
    end

    def cancel_checkout(_request, match)
      [200, @checkouts.cancel(param(match, :id))]
    end

    def list_events(_request, _match)
      [200, { events: @checkouts.events }]
    end

    # Rack hands us the path as raw bytes. SQLite compares text with text, so
    # the value has to be marked as UTF-8 before it is used in a query.
    def param(match, name)
      utf8(match[name])
    end

    def utf8(text)
      text&.dup&.force_encoding(Encoding::UTF_8)
    end

    def parse(request)
      raw = request.body&.read.to_s
      body = raw.empty? ? {} : JSON.parse(raw)
      raise ValidationError, "the request body must be a JSON object" unless body.is_a?(Hash)

      body
    end

    def json(status, body)
      [status, { "content-type" => "application/json" }, [JSON.generate(body)]]
    end
  end
end
