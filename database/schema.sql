-- =====================================================================
--  VASTRA — PostgreSQL schema (PostgreSQL 13+)
--  Idempotent: safe to run multiple times.
-- =====================================================================

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- users & addresses ----------
CREATE TABLE IF NOT EXISTS users (
    id             BIGSERIAL PRIMARY KEY,
    full_name      VARCHAR(120) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash  VARCHAR(255) NOT NULL,
    phone          VARCHAR(20),
    role           VARCHAR(20)  NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    session_version INT         NOT NULL DEFAULT 0,  -- bump to sign out every device
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS addresses (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label        VARCHAR(40)  NOT NULL DEFAULT 'Home',
    full_name    VARCHAR(120) NOT NULL,
    phone        VARCHAR(20)  NOT NULL,
    line1        VARCHAR(200) NOT NULL,
    line2        VARCHAR(200),
    city         VARCHAR(80)  NOT NULL,
    state        VARCHAR(80)  NOT NULL,
    postal_code  VARCHAR(12)  NOT NULL,
    country      VARCHAR(60)  NOT NULL DEFAULT 'India',
    is_default   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS addresses_user_idx ON addresses(user_id);

-- ---------- catalog ----------
CREATE TABLE IF NOT EXISTS categories (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL,
    slug         VARCHAR(90)  NOT NULL UNIQUE,
    description  TEXT         NOT NULL DEFAULT '',
    image_url    VARCHAR(255),
    sort_order   INT          NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS brands (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL UNIQUE,
    slug         VARCHAR(90)  NOT NULL UNIQUE,
    logo_url     VARCHAR(255),
    description  TEXT         NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
    id                BIGSERIAL PRIMARY KEY,
    name              VARCHAR(160)  NOT NULL,
    slug              VARCHAR(180)  NOT NULL UNIQUE,
    description       TEXT          NOT NULL DEFAULT '',
    brand_id          INT REFERENCES brands(id) ON DELETE SET NULL,
    category_id       INT REFERENCES categories(id) ON DELETE SET NULL,
    gender            VARCHAR(10)   NOT NULL DEFAULT 'unisex'
                      CHECK (gender IN ('men', 'women', 'kids', 'unisex')),
    price             NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    compare_at_price  NUMERIC(10,2) CHECK (compare_at_price IS NULL OR compare_at_price >= price),
    material          VARCHAR(160),
    care              VARCHAR(255),
    fit               VARCHAR(60),
    tags              TEXT[]        NOT NULL DEFAULT '{}',
    is_featured       BOOLEAN       NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    search_vector     tsvector GENERATED ALWAYS AS (
                          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
                          setweight(to_tsvector('english', coalesce(material, '')), 'B') ||
                          setweight(to_tsvector('english', coalesce(description, '')), 'C')
                      ) STORED
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS products_brand_idx    ON products(brand_id);
CREATE INDEX IF NOT EXISTS products_gender_idx   ON products(gender);
CREATE INDEX IF NOT EXISTS products_tags_idx     ON products USING GIN (tags);
CREATE INDEX IF NOT EXISTS products_search_idx   ON products USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS product_images (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT       NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url         VARCHAR(255) NOT NULL,
    alt         VARCHAR(200) NOT NULL DEFAULT '',
    color       VARCHAR(40),            -- optional: image belongs to a colour variant
    sort_order  INT          NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images(product_id);

CREATE TABLE IF NOT EXISTS product_variants (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku         VARCHAR(60) NOT NULL UNIQUE,
    size        VARCHAR(12) NOT NULL,
    color       VARCHAR(40) NOT NULL,
    color_hex   VARCHAR(7)  NOT NULL DEFAULT '#000000',
    stock       INT         NOT NULL DEFAULT 0 CHECK (stock >= 0),
    UNIQUE (product_id, size, color)
);
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS reviews (
    id           BIGSERIAL PRIMARY KEY,
    product_id   BIGINT       NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating       SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title        VARCHAR(120) NOT NULL DEFAULT '',
    body         TEXT         NOT NULL DEFAULT '',
    is_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews(product_id);

-- ---------- cart & wishlist ----------
CREATE TABLE IF NOT EXISTS carts (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      BIGINT      UNIQUE REFERENCES users(id) ON DELETE CASCADE,  -- NULL = guest cart
    coupon_code  VARCHAR(30),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
    id          BIGSERIAL PRIMARY KEY,
    cart_id     UUID   NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id  BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity    INT    NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

-- ---------- promotions ----------
CREATE TABLE IF NOT EXISTS coupons (
    id             SERIAL PRIMARY KEY,
    code           VARCHAR(30)   NOT NULL UNIQUE CHECK (code = upper(code)),
    description    VARCHAR(200)  NOT NULL DEFAULT '',
    discount_type  VARCHAR(10)   NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    value          NUMERIC(10,2) NOT NULL CHECK (value > 0),
    min_order      NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_discount   NUMERIC(10,2),
    usage_limit    INT,
    used_count     INT           NOT NULL DEFAULT 0,
    expires_at     TIMESTAMPTZ,
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (discount_type <> 'percent' OR value <= 90)
);

-- ---------- orders ----------
CREATE TABLE IF NOT EXISTS orders (
    id                    BIGSERIAL PRIMARY KEY,
    order_number          VARCHAR(20)   UNIQUE,
    user_id               BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status                VARCHAR(20)   NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
    payment_method        VARCHAR(10)   NOT NULL CHECK (payment_method IN ('cod', 'card', 'upi')),
    payment_status        VARCHAR(10)   NOT NULL DEFAULT 'pending'
                          CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
    subtotal              NUMERIC(10,2) NOT NULL,
    discount              NUMERIC(10,2) NOT NULL DEFAULT 0,
    shipping_fee          NUMERIC(10,2) NOT NULL DEFAULT 0,
    total                 NUMERIC(10,2) NOT NULL,
    coupon_code           VARCHAR(30),
    shipping_name         VARCHAR(120)  NOT NULL,
    shipping_phone        VARCHAR(20)   NOT NULL,
    shipping_line1        VARCHAR(200)  NOT NULL,
    shipping_line2        VARCHAR(200),
    shipping_city         VARCHAR(80)   NOT NULL,
    shipping_state        VARCHAR(80)   NOT NULL,
    shipping_postal_code  VARCHAR(12)   NOT NULL,
    shipping_country      VARCHAR(60)   NOT NULL,
    notes                 VARCHAR(500),
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user_idx    ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx  ON orders(status);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id    BIGINT REFERENCES products(id) ON DELETE SET NULL,
    variant_id    BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name  VARCHAR(160)  NOT NULL,
    product_slug  VARCHAR(180)  NOT NULL,
    brand_name    VARCHAR(80),
    size          VARCHAR(12)   NOT NULL,
    color         VARCHAR(40)   NOT NULL,
    image_url     VARCHAR(255),
    unit_price    NUMERIC(10,2) NOT NULL,
    quantity      INT           NOT NULL CHECK (quantity > 0),
    line_total    NUMERIC(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id);

CREATE TABLE IF NOT EXISTS order_status_history (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL,
    note        VARCHAR(255) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON order_status_history(order_id);

-- ---------- engagement ----------
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id          BIGSERIAL PRIMARY KEY,
    email       VARCHAR(255) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_messages (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    subject     VARCHAR(160) NOT NULL DEFAULT '',
    message     TEXT         NOT NULL,
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- updated_at triggers ----------
DROP TRIGGER IF EXISTS users_updated_at    ON users;
CREATE TRIGGER users_updated_at    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS carts_updated_at    ON carts;
CREATE TRIGGER carts_updated_at    BEFORE UPDATE ON carts    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS orders_updated_at   ON orders;
CREATE TRIGGER orders_updated_at   BEFORE UPDATE ON orders   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
