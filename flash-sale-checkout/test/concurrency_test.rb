require "test_helper"

# The point of the whole project: many shoppers, few units, no overselling.
class ConcurrencyTest < FlashSaleTest
  def race(shoppers)
    start = Queue.new
    threads = shoppers.times.map do |n|
      Thread.new do
        start.pop # every thread waits here, then they all go at once
        yield n
      end
    end
    shoppers.times { start << :go }
    threads.map(&:value)
  end

  def test_fifty_shoppers_racing_for_ten_units_sell_exactly_ten
    stock("drop", 10)

    results = race(50) do
      checkout = @checkouts.create(items: [{ "sku" => "drop", "qty" => 1 }])
      @checkouts.pay(checkout[:id])
      :bought
    rescue FlashSale::InsufficientStock
      :sold_out
    end

    assert_equal 10, results.count(:bought)
    assert_equal 40, results.count(:sold_out)
    variant = @inventory.find("drop")
    assert_equal 0, variant[:on_hand]
    assert_equal 0, variant[:reserved]
    assert_equal 10, @checkouts.events.size
  end

  def test_twenty_retries_with_one_key_create_one_checkout
    stock("drop", 10)

    ids = race(20) do
      @checkouts.create(items: [{ "sku" => "drop", "qty" => 1 }], idempotency_key: "same-key")[:id]
    end

    assert_equal 1, ids.uniq.size
    assert_equal 9, @inventory.find("drop")[:available]
  end

  def test_carts_that_cannot_be_filled_leave_no_partial_holds
    stock("shoe", 6)
    stock("lace", 3)

    results = race(12) do
      @checkouts.create(items: [{ "sku" => "shoe", "qty" => 1 }, { "sku" => "lace", "qty" => 1 }])
      :held
    rescue FlashSale::InsufficientStock
      :sold_out
    end

    assert_equal 3, results.count(:held)
    assert_equal 3, @inventory.find("shoe")[:reserved], "shoes are only held together with laces"
    assert_equal 3, @inventory.find("lace")[:reserved]
  end
end
