require "minitest/autorun"
require "rack/test"
require "tmpdir"

require "flash_sale"

# A clock the tests can move forward by hand, so nothing has to sleep.
class FakeClock
  attr_accessor :now

  def initialize(now = 1_000_000)
    @now = now
  end

  def call = @now

  def advance(seconds)
    @now += seconds
  end
end

class FlashSaleTest < Minitest::Test
  SECRET = "test-secret"

  def setup
    @dir = Dir.mktmpdir("flash-sale")
    @database = FlashSale::Database.new(File.join(@dir, "test.db"), pool_size: 4)
    @clock = FakeClock.new
    @inventory = FlashSale::Inventory.new(@database)
    @checkouts = FlashSale::Checkouts.new(@database, secret: SECRET, clock: @clock)
  end

  def teardown
    @database.close
    FileUtils.remove_entry(@dir)
  end

  def stock(sku, units, price_cents: 2_000)
    @inventory.add(sku: sku, name: sku.capitalize, price_cents: price_cents, stock: units)
  end
end
