require "test_helper"

class DiscountsTest < Minitest::Test
  CART = [
    { sku: "shirt", qty: 3, unit_price_cents: 2_000 },
    { sku: "mug", qty: 1, unit_price_cents: 1_500 }
  ].freeze

  def total(codes, cart = CART)
    FlashSale::Discounts.price(cart, codes)[:total_cents]
  end

  def test_no_code_charges_the_subtotal
    assert_equal 7_500, total([])
  end

  def test_save10_takes_ten_percent_off
    assert_equal 6_750, total(["SAVE10"])
  end

  def test_bogo_makes_every_second_unit_free
    assert_equal 5_500, total(["BOGO:shirt"])
    assert_equal 4_000, total(["BOGO:shirt"], [{ sku: "shirt", qty: 4, unit_price_cents: 2_000 }])
  end

  def test_bogo_on_a_single_unit_changes_nothing
    assert_equal 7_500, total(["BOGO:mug"])
  end

  def test_bogo_applies_before_save10
    assert_equal 4_950, total(["SAVE10", "BOGO:shirt"])
  end

  def test_a_repeated_code_counts_once
    assert_equal 6_750, total(["SAVE10", "SAVE10"])
    assert_equal 5_500, total(["BOGO:shirt", "BOGO:shirt"])
  end

  def test_unknown_codes_are_ignored
    assert_equal 7_500, total(["FAKE", "BOGO:hat", "save10"])
  end

  def test_rounding_is_down_and_stays_in_whole_cents
    result = FlashSale::Discounts.price([{ sku: "pen", qty: 1, unit_price_cents: 1_999 }], ["SAVE10"])

    assert_equal 1_799, result[:total_cents]
    assert_kind_of Integer, result[:total_cents]
    assert_equal 200, result[:discount_cents]
  end

  def test_reports_only_the_codes_that_applied
    result = FlashSale::Discounts.price(CART, ["FAKE", "SAVE10", "BOGO:shirt", "BOGO:hat"])

    assert_equal ["BOGO:shirt", "SAVE10"], result[:applied_codes]
  end

  def test_an_empty_cart_costs_nothing
    assert_equal 0, total(["SAVE10"], [])
  end

  def test_codes_must_be_a_list
    assert_raises(FlashSale::ValidationError) { FlashSale::Discounts.normalize("SAVE10") }
  end
end
