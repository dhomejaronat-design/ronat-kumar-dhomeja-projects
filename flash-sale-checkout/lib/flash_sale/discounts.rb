module FlashSale
  # Prices a cart in whole cents.
  #
  # Rules:
  #   * "BOGO:<sku>" makes every second unit of that SKU free.
  #   * "SAVE10" takes 10% off whatever is left after BOGO.
  #   * A code counts once, even if it is sent twice.
  #   * Unknown codes, and BOGO codes for a SKU that is not in the cart,
  #     are ignored.
  #   * Rounding happens once, at the end, and always rounds down.
  module Discounts
    PERCENT_OFF = { "SAVE10" => 10 }.freeze
    BOGO_PREFIX = "BOGO:".freeze

    def self.normalize(codes)
      raise ValidationError, "codes must be a list" unless codes.nil? || codes.is_a?(Array)

      Array(codes).map { |code| code.to_s.strip }.reject(&:empty?).uniq.sort
    end

    # lines: [{ sku:, qty:, unit_price_cents: }]
    def self.price(lines, codes)
      codes = normalize(codes)
      skus_in_cart = lines.map { |line| line[:sku] }.to_set

      bogo_skus = codes
        .select { |code| code.start_with?(BOGO_PREFIX) }
        .map { |code| code.delete_prefix(BOGO_PREFIX) }
        .select { |sku| skus_in_cart.include?(sku) }
        .to_set

      subtotal = lines.sum { |line| line[:unit_price_cents] * line[:qty] }
      free_units = lines.sum do |line|
        bogo_skus.include?(line[:sku]) ? line[:unit_price_cents] * (line[:qty] / 2) : 0
      end

      percent_code = codes.find { |code| PERCENT_OFF.key?(code) }
      percent = percent_code ? PERCENT_OFF.fetch(percent_code) : 0
      total = (subtotal - free_units) * (100 - percent) / 100

      applied = bogo_skus.map { |sku| "#{BOGO_PREFIX}#{sku}" }.sort
      applied << percent_code if percent_code

      {
        subtotal_cents: subtotal,
        discount_cents: subtotal - total,
        total_cents: total,
        applied_codes: applied
      }
    end
  end
end
