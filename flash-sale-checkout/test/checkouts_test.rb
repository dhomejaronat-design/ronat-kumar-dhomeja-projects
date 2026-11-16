require "test_helper"

class CheckoutsTest < FlashSaleTest
  def items(pairs)
    pairs.map { |sku, qty| { "sku" => sku, "qty" => qty } }
  end

  def test_create_holds_stock_and_prices_the_cart
    stock("shirt", 10, price_cents: 2_000)
    stock("mug", 10, price_cents: 1_500)

    checkout = @checkouts.create(items: items("shirt" => 3, "mug" => 1), codes: ["SAVE10"])

    assert_equal "reserved", checkout[:status]
    assert_equal 7_500, checkout[:subtotal_cents]
    assert_equal 750, checkout[:discount_cents]
    assert_equal 6_750, checkout[:total_cents]
    assert_equal ["SAVE10"], checkout[:applied_codes]
    assert_equal 7, @inventory.find("shirt")[:available]
  end

  def test_create_is_all_or_nothing
    stock("hat", 5)
    stock("sock", 1)

    assert_raises(FlashSale::InsufficientStock) do
      @checkouts.create(items: items("hat" => 1, "sock" => 5))
    end

    assert_equal 5, @inventory.find("hat")[:available], "the hat must not stay held"
    assert_equal 1, @inventory.find("sock")[:available]
  end

  def test_a_shopper_can_take_the_very_last_unit
    stock("hat", 5)

    assert_equal "reserved", @checkouts.create(items: items("hat" => 5))[:status]
    assert_raises(FlashSale::InsufficientStock) { @checkouts.create(items: items("hat" => 1)) }
  end

  def test_repeated_skus_in_one_cart_are_added_together
    stock("hat", 5)

    checkout = @checkouts.create(items: [{ "sku" => "hat", "qty" => 2 }, { "sku" => "hat", "qty" => 2 }])

    assert_equal [{ sku: "hat", qty: 4, unit_price_cents: 2_000 }], checkout[:lines]
    assert_raises(FlashSale::InsufficientStock) { @checkouts.create(items: items("hat" => 2)) }
  end

  def test_rejects_bad_carts
    stock("hat", 5)

    assert_raises(FlashSale::ValidationError) { @checkouts.create(items: []) }
    assert_raises(FlashSale::ValidationError) { @checkouts.create(items: nil) }
    assert_raises(FlashSale::ValidationError) { @checkouts.create(items: items("hat" => 0)) }
    assert_raises(FlashSale::ValidationError) { @checkouts.create(items: items("hat" => -3)) }
    assert_raises(FlashSale::ValidationError) { @checkouts.create(items: items("hat" => 1.5)) }
    assert_raises(FlashSale::ValidationError) { @checkouts.create(items: items("ghost" => 1)) }
    assert_equal 5, @inventory.find("hat")[:available]
  end

  def test_paying_turns_the_hold_into_a_sale
    stock("hat", 5)
    checkout = @checkouts.create(items: items("hat" => 4))

    paid = @checkouts.pay(checkout[:id])

    assert_equal "paid", paid[:status]
    variant = @inventory.find("hat")
    assert_equal 1, variant[:on_hand]
    assert_equal 0, variant[:reserved]
  end

  def test_paying_twice_does_not_ship_twice
    stock("hat", 5)
    checkout = @checkouts.create(items: items("hat" => 2))

    @checkouts.pay(checkout[:id])
    again = @checkouts.pay(checkout[:id])

    assert_equal "paid", again[:status]
    assert_equal 3, @inventory.find("hat")[:on_hand]
    assert_equal 1, @checkouts.events.size
  end

  def test_cancelling_gives_the_stock_back
    stock("hat", 5)
    checkout = @checkouts.create(items: items("hat" => 3))

    assert_equal "cancelled", @checkouts.cancel(checkout[:id])[:status]
    assert_equal "cancelled", @checkouts.cancel(checkout[:id])[:status]
    assert_equal 5, @inventory.find("hat")[:available]
  end

  def test_a_paid_checkout_cannot_be_cancelled_and_a_cancelled_one_cannot_be_paid
    stock("hat", 5)
    paid = @checkouts.create(items: items("hat" => 1))
    cancelled = @checkouts.create(items: items("hat" => 1))
    @checkouts.pay(paid[:id])
    @checkouts.cancel(cancelled[:id])

    assert_raises(FlashSale::InvalidState) { @checkouts.cancel(paid[:id]) }
    assert_raises(FlashSale::InvalidState) { @checkouts.pay(cancelled[:id]) }
    assert_raises(FlashSale::NotFound) { @checkouts.pay("no-such-id") }
  end

  def test_a_hold_expires_and_the_stock_goes_to_the_next_shopper
    stock("hat", 1)
    slow = @checkouts.create(items: items("hat" => 1))
    assert_raises(FlashSale::InsufficientStock) { @checkouts.create(items: items("hat" => 1)) }

    @clock.advance(FlashSale::Checkouts::HOLD_SECONDS)

    fast = @checkouts.create(items: items("hat" => 1))
    assert_equal "reserved", fast[:status]
    assert_equal "expired", @checkouts.find(slow[:id])[:status]
    assert_raises(FlashSale::HoldExpired) { @checkouts.pay(slow[:id]) }
    assert_equal "paid", @checkouts.pay(fast[:id])[:status]
    assert_equal 0, @inventory.find("hat")[:on_hand]
  end

  def test_a_hold_can_be_paid_just_before_it_expires
    stock("hat", 1)
    checkout = @checkouts.create(items: items("hat" => 1))

    @clock.advance(FlashSale::Checkouts::HOLD_SECONDS - 1)

    assert_equal "paid", @checkouts.pay(checkout[:id])[:status]
  end

  def test_the_same_idempotency_key_returns_the_same_checkout
    stock("hat", 5)

    first = @checkouts.create(items: items("hat" => 2), idempotency_key: "key-1")
    retry_ = @checkouts.create(items: items("hat" => 2), idempotency_key: "key-1")

    refute first[:replayed]
    assert retry_[:replayed]
    assert_equal first[:id], retry_[:id]
    assert_equal 3, @inventory.find("hat")[:available], "the retry must not hold stock again"
  end

  def test_reusing_a_key_for_a_different_cart_is_refused
    stock("hat", 5)
    @checkouts.create(items: items("hat" => 2), idempotency_key: "key-1")

    assert_raises(FlashSale::IdempotencyConflict) do
      @checkouts.create(items: items("hat" => 3), idempotency_key: "key-1")
    end
    assert_equal 3, @inventory.find("hat")[:available]
  end

  def test_a_failed_checkout_does_not_use_up_its_key
    stock("hat", 1)

    assert_raises(FlashSale::InsufficientStock) do
      @checkouts.create(items: items("hat" => 2), idempotency_key: "key-1")
    end
    @inventory.add(sku: "hat", name: "Hat", price_cents: 2_000, stock: 1)

    assert_equal "reserved", @checkouts.create(items: items("hat" => 2), idempotency_key: "key-1")[:status]
  end

  def test_paying_records_a_signed_event
    stock("hat", 5)
    checkout = @checkouts.create(items: items("hat" => 2))
    @checkouts.pay(checkout[:id])

    event = @checkouts.events.first

    assert_equal "orders/paid", event[:topic]
    assert_equal checkout[:id], JSON.parse(event[:payload])["checkout_id"]
    assert FlashSale::Webhooks.valid?(event[:payload], event[:signature], SECRET)
    refute FlashSale::Webhooks.valid?(event[:payload].sub("4000", "1"), event[:signature], SECRET)
    refute FlashSale::Webhooks.valid?(event[:payload], event[:signature], "wrong-secret")
    refute FlashSale::Webhooks.valid?(event[:payload], nil, SECRET)
  end
end
