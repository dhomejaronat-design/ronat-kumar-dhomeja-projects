require_relative "lib/flash_sale"

run FlashSale::App.build(
  path: ENV.fetch("DATABASE_PATH", "flash_sale.db"),
  secret: ENV.fetch("WEBHOOK_SECRET", "dev-secret")
)
