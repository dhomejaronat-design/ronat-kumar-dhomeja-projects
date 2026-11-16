require "test_helper"

class InventoryTest < FlashSaleTest
  def test_adding_the_same_sku_twice_adds_the_stock_together
    stock("hat", 5)
    variant = stock("hat", 3)

    assert_equal 8, variant[:on_hand]
    assert_equal 8, variant[:available]
  end

  def test_unknown_sku_is_not_found
    assert_raises(FlashSale::NotFound) { @inventory.find("ghost") }
  end

  def test_rejects_bad_input
    assert_raises(FlashSale::ValidationError) { @inventory.add(sku: "", name: "Hat", price_cents: 100, stock: 1) }
    assert_raises(FlashSale::ValidationError) { @inventory.add(sku: "hat", name: "Hat", price_cents: -1, stock: 1) }
    assert_raises(FlashSale::ValidationError) { @inventory.add(sku: "hat", name: "Hat", price_cents: 100, stock: -5) }
    assert_raises(FlashSale::ValidationError) { @inventory.add(sku: "hat", name: "Hat", price_cents: 9.99, stock: 1) }
  end

  def test_held_units_are_not_available
    stock("hat", 5)
    @checkouts.create(items: [{ "sku" => "hat", "qty" => 3 }])

    variant = @inventory.find("hat")
    assert_equal 5, variant[:on_hand]
    assert_equal 3, variant[:reserved]
    assert_equal 2, variant[:available]
  end

  def test_low_stock_uses_available_units_and_sorts_by_sku
    stock("hat", 5)
    stock("sock", 2)
    stock("belt", 1)
    stock("coat", 9)
    @checkouts.create(items: [{ "sku" => "hat", "qty" => 4 }])

    assert_equal %w[belt hat sock], @inventory.low_stock(2).map { |v| v[:sku] }
    assert_equal %w[belt hat], @inventory.low_stock(1).map { |v| v[:sku] }
    assert_empty @inventory.low_stock(0)
  end

  def test_the_database_itself_refuses_to_oversell
    stock("hat", 1)

    assert_raises(SQLite3::ConstraintException) do
      @database.with { |db| db.execute("UPDATE variants SET reserved = 2 WHERE sku = 'hat'") }
    end
  end
end
