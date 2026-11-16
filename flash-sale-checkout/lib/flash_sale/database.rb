module FlashSale
  # A small pool of SQLite connections. Each request borrows one connection,
  # so two threads never share a transaction.
  class Database
    SCHEMA = <<~SQL
      CREATE TABLE IF NOT EXISTS variants (
        sku         TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        on_hand     INTEGER NOT NULL CHECK (on_hand >= 0),
        reserved    INTEGER NOT NULL DEFAULT 0
                    CHECK (reserved >= 0 AND reserved <= on_hand)
      );

      CREATE TABLE IF NOT EXISTS checkouts (
        id             TEXT PRIMARY KEY,
        status         TEXT NOT NULL
                       CHECK (status IN ('reserved', 'paid', 'cancelled', 'expired')),
        subtotal_cents INTEGER NOT NULL,
        discount_cents INTEGER NOT NULL,
        total_cents    INTEGER NOT NULL,
        applied_codes  TEXT NOT NULL,
        expires_at     INTEGER NOT NULL,
        created_at     INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS checkouts_by_expiry
        ON checkouts (status, expires_at);

      CREATE TABLE IF NOT EXISTS checkout_lines (
        checkout_id      TEXT NOT NULL REFERENCES checkouts (id),
        sku              TEXT NOT NULL REFERENCES variants (sku),
        qty              INTEGER NOT NULL CHECK (qty > 0),
        unit_price_cents INTEGER NOT NULL,
        PRIMARY KEY (checkout_id, sku)
      );

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key          TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        checkout_id  TEXT NOT NULL REFERENCES checkouts (id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        topic      TEXT NOT NULL,
        payload    TEXT NOT NULL,
        signature  TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    SQL

    def initialize(path, pool_size: 5)
      @connections = []
      @pool = Queue.new
      pool_size.times do
        connection = connect(path)
        @connections << connection
        @pool << connection
      end
      with { |db| db.execute_batch(SCHEMA) }
    end

    # Borrow a connection for the length of the block.
    def with
      connection = @pool.pop
      yield connection
    ensure
      @pool << connection if connection
    end

    # BEGIN IMMEDIATE takes the write lock up front, so a transaction never
    # fails halfway because another writer got in first. If the block raises,
    # everything inside it is rolled back.
    def transaction
      with do |db|
        db.transaction(:immediate) { yield db }
      end
    end

    def close
      @connections.each(&:close)
    end

    private

    def connect(path)
      db = SQLite3::Database.new(path, results_as_hash: true)
      db.busy_timeout = 5_000
      db.execute("PRAGMA journal_mode = WAL")
      db.execute("PRAGMA foreign_keys = ON")
      db
    end
  end
end
