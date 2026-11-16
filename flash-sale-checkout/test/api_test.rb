require "test_helper"

class ApiTest < FlashSaleTest
  include Rack::Test::Methods

  def app
    @app ||= FlashSale::App.new(inventory: @inventory, checkouts: @checkouts)
  end

  def post_json(path, body, headers = {})
    headers.each { |name, value| header name, value }
    post path, JSON.generate(body), "CONTENT_TYPE" => "application/json"
    JSON.parse(last_response.body)
  end

  def get_json(path)
    get path
    JSON.parse(last_response.body)
  end

  def test_health
    assert_equal({ "status" => "ok" }, get_json("/health"))
    assert_equal "application/json", last_response.headers["content-type"]
  end

  def test_the_whole_purchase_flow
    variant = post_json("/variants", { sku: "tee", name: "Launch Tee", price_cents: 2_500, stock: 3 })
    assert_equal 201, last_response.status
    assert_equal 3, variant["available"]

    checkout = post_json("/checkouts", { items: [{ sku: "tee", qty: 2 }], codes: ["BOGO:tee"] })
    assert_equal 201, last_response.status
    assert_equal 2_500, checkout["total_cents"]
    assert_equal 1, get_json("/variants/tee")["available"]

    paid = post_json("/checkouts/#{checkout["id"]}/pay", {})
    assert_equal 200, last_response.status
    assert_equal "paid", paid["status"]
    assert_equal 1, get_json("/variants/tee")["on_hand"]
    assert_equal "paid", get_json("/checkouts/#{checkout["id"]}")["status"]

    events = get_json("/events")["events"]
    assert_equal ["orders/paid"], events.map { |event| event["topic"] }
  end

  def test_a_retry_with_the_same_key_answers_200_with_the_same_checkout
    post_json("/variants", { sku: "tee", name: "Tee", price_cents: 2_500, stock: 3 })
    body = { items: [{ sku: "tee", qty: 1 }] }

    first = post_json("/checkouts", body, "Idempotency-Key" => "abc")
    assert_equal 201, last_response.status
    second = post_json("/checkouts", body, "Idempotency-Key" => "abc")
    assert_equal 200, last_response.status

    assert_equal first["id"], second["id"]
    assert_equal 2, get_json("/variants/tee")["available"]
  end

  def test_errors_map_to_http_statuses
    post_json("/variants", { sku: "tee", name: "Tee", price_cents: 2_500, stock: 1 })

    post_json("/checkouts", { items: [{ sku: "tee", qty: 2 }] })
    assert_equal 409, last_response.status

    post_json("/checkouts", { items: [] })
    assert_equal 422, last_response.status

    post_json("/checkouts", { items: [{ sku: "tee", qty: 1 }], codes: "SAVE10" })
    assert_equal 422, last_response.status

    get "/variants/ghost"
    assert_equal 404, last_response.status

    post "/checkouts/nope/pay"
    assert_equal 404, last_response.status

    post "/checkouts", "{not json", "CONTENT_TYPE" => "application/json"
    assert_equal 400, last_response.status

    post "/checkouts", "[1, 2]", "CONTENT_TYPE" => "application/json"
    assert_equal 422, last_response.status

    get "/nowhere"
    assert_equal 404, last_response.status
    assert_equal 1, get_json("/variants/tee")["available"], "failed requests must not hold stock"
  end

  def test_low_stock_report
    post_json("/variants", { sku: "tee", name: "Tee", price_cents: 2_500, stock: 2 })
    post_json("/variants", { sku: "cap", name: "Cap", price_cents: 1_800, stock: 40 })

    assert_equal ["tee"], get_json("/inventory/low_stock?threshold=5")["variants"].map { |v| v["sku"] }

    get "/inventory/low_stock?threshold=lots"
    assert_equal 422, last_response.status
  end

  def test_cancel_over_http
    post_json("/variants", { sku: "tee", name: "Tee", price_cents: 2_500, stock: 2 })
    checkout = post_json("/checkouts", { items: [{ sku: "tee", qty: 2 }] })

    cancelled = post_json("/checkouts/#{checkout["id"]}/cancel", {})

    assert_equal "cancelled", cancelled["status"]
    assert_equal 2, get_json("/variants/tee")["available"]
  end
end
