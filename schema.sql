-- Deal Scanner database (Cloudflare D1 / SQLite)

-- Sets the scanner knows about. q is the eBay search phrase; released drives the new-release rule.
CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  q TEXT NOT NULL,
  released TEXT,
  vintage INTEGER NOT NULL DEFAULT 0
);

-- Every product the scanner will price: one row per card + grade (raw NM, PSA 10, PSA 9...) or sealed item.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,                 -- Pulse product id
  name TEXT NOT NULL,
  set_id TEXT NOT NULL REFERENCES sets(id),
  number TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('raw', 'slab', 'sealed')),
  category TEXT NOT NULL,
  material TEXT,
  promo TEXT,                          -- stamps / editions: "1st Edition", "Pokémon Center"...
  grader TEXT,
  grade TEXT,
  card_key TEXT,                       -- set|number|material|promo, shared by the raw and graded versions
  p10 REAL,                            -- PSA 10 rate from population (raw cards)
  lp REAL,                             -- lightly played price (raw cards)
  pulse_url TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS products_set ON products(set_id);
CREATE INDEX IF NOT EXISTS products_card ON products(card_key);

-- Latest market numbers per product.
CREATE TABLE IF NOT EXISTS market (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  market REAL NOT NULL,
  t7 REAL, t30 REAL, s7 INTEGER, s30 INTEGER, src REAL,
  source TEXT NOT NULL DEFAULT 'pulse',
  updated_at TEXT NOT NULL
);

-- One row per product per Pulse refresh (twice a day). This is the history that sharpens sentiment over time.
CREATE TABLE IF NOT EXISTS market_snapshots (
  product_id TEXT NOT NULL,
  at TEXT NOT NULL,
  market REAL NOT NULL,
  t7 REAL, t30 REAL, s7 INTEGER, s30 INTEGER, src REAL,
  PRIMARY KEY (product_id, at)
);

-- The live ladder: every current UK listing of a product (price + postage), refreshed every few hours.
CREATE TABLE IF NOT EXISTS ladders (
  product_id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  items TEXT NOT NULL                  -- JSON [{id, total}]
);

-- Our own sold record: listings that dropped off a product's ladder between checks (likely sales).
CREATE TABLE IF NOT EXISTS observed_sales (
  item_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  price REAL NOT NULL,
  first_seen TEXT NOT NULL,
  gone_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observed_sales_product ON observed_sales(product_id, gone_at);

-- eBay searches, generated from sets. Each search covers one or more sets.
CREATE TABLE IF NOT EXISTS searches (
  id TEXT PRIMARY KEY,
  q TEXT NOT NULL,
  set_ids TEXT NOT NULL,               -- JSON array
  min_price REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS seen (
  key TEXT PRIMARY KEY,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  item_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  day TEXT NOT NULL,
  found_at TEXT NOT NULL,
  title TEXT, price REAL, post REAL, fee REAL, fee_included INTEGER, total REAL,
  market REAL, market_source TEXT, pulse_market REAL, net REAL, pct REAL,
  conf INTEGER, label TEXT, factors TEXT,
  resale_net REAL, mania_net REAL,
  hold_days REAL, hold_cls TEXT, ladder TEXT, sold TEXT,
  grade_ev REAL, grade_gain REAL,
  cert TEXT, cert_status TEXT,
  seller TEXT, feedback TEXT, account_type TEXT, format TEXT,
  image TEXT, url TEXT, listed_at TEXT,
  instant INTEGER NOT NULL DEFAULT 0,
  alerted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  gone_at TEXT,
  checked_at TEXT
);
CREATE INDEX IF NOT EXISTS deals_day ON deals(day);

-- New UK listings matched per product per day: the supply signal.
CREATE TABLE IF NOT EXISTS product_daily (
  product_id TEXT NOT NULL,
  day TEXT NOT NULL,
  listings INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, day)
);

-- Market index per category per day (median 7d and 30d change across the catalogue).
CREATE TABLE IF NOT EXISTS index_daily (
  day TEXT NOT NULL,
  category TEXT NOT NULL,
  t7 REAL, t30 REAL, n INTEGER,
  PRIMARY KEY (day, category)
);

CREATE TABLE IF NOT EXISTS stats (
  day TEXT PRIMARY KEY,
  scans INTEGER NOT NULL DEFAULT 0,
  listings INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0
);

-- Recent rejections, so bad rules can be spotted and tuned.
CREATE TABLE IF NOT EXISTS rejects (
  at TEXT NOT NULL,
  search_id TEXT,
  title TEXT,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Pulse prices for raw cards in lower conditions (NM is the market price). Kept in its own table so older databases need no migration.
CREATE TABLE IF NOT EXISTS cond_prices (
  product_id TEXT PRIMARY KEY,
  lp REAL,
  mp REAL,
  hp REAL,
  updated_at TEXT
);

-- Your verdict on each flagged deal: was the match right, wrong (and why), or a fake card. Feeds the accuracy report.
CREATE TABLE IF NOT EXISTS reviews (
  item_id TEXT PRIMARY KEY,
  verdict TEXT NOT NULL,          -- good | bad | fake
  reason TEXT,                    -- for bad: why (see REVIEW_REASONS in src/review.js)
  note TEXT,
  at TEXT NOT NULL
);
