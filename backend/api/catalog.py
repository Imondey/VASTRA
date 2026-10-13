"""Public catalogue: categories, brands, products, search and reviews."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from .. import db
from ..security import current_user_id, login_required
from ..utils import ApiError, csv_arg, integer, json_body, money, text

bp = Blueprint("catalog", __name__)

SORTS = {
    "newest": "p.created_at DESC, p.id DESC",
    "price_asc": "p.price ASC, p.id",
    "price_desc": "p.price DESC, p.id",
    "rating": "COALESCE(r.avg_rating, 0) DESC, COALESCE(r.review_count, 0) DESC, p.id",
    "popular": "COALESCE(s.sold, 0) DESC, p.created_at DESC",
    "discount": "(COALESCE(p.compare_at_price, p.price) - p.price) / NULLIF(COALESCE(p.compare_at_price, p.price), 0) DESC, p.id",
}

CARD_SELECT = """
    SELECT p.id, p.name, p.slug, p.price, p.compare_at_price, p.gender, p.tags,
           p.is_featured, p.created_at,
           (p.created_at > now() - interval '45 days') AS is_new,
           b.name AS brand, b.slug AS brand_slug,
           c.name AS category, c.slug AS category_slug,
           img.images,
           COALESCE(r.avg_rating, 0) AS rating,
           COALESCE(r.review_count, 0) AS review_count,
           vc.colors, vc.sizes, COALESCE(vc.total_stock, 0) AS total_stock
      FROM products p
      LEFT JOIN brands b     ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
            SELECT array_agg(url ORDER BY sort_order, id) AS images
              FROM (SELECT url, sort_order, id FROM product_images
                     WHERE product_id = p.id ORDER BY sort_order, id LIMIT 2) t
      ) img ON TRUE
      LEFT JOIN LATERAL (
            SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS review_count
              FROM reviews WHERE product_id = p.id
      ) r ON TRUE
      LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(oi.quantity), 0) AS sold
              FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE oi.product_id = p.id AND o.status <> 'cancelled'
      ) s ON TRUE
      LEFT JOIN LATERAL (
            SELECT json_agg(DISTINCT jsonb_build_object('name', color, 'hex', color_hex)) AS colors,
                   array_agg(DISTINCT size) AS sizes,
                   SUM(stock) AS total_stock
              FROM product_variants WHERE product_id = p.id
      ) vc ON TRUE
"""


def serialize_card(row: dict) -> dict:
    images = row.get("images") or []
    price = row["price"]
    compare = row["compare_at_price"]
    return {
        "id": row["id"],
        "name": row["name"],
        "slug": row["slug"],
        "price": price,
        "compare_at_price": compare,
        "discount_percent": int(round((compare - price) * 100 / compare)) if compare and compare > price else 0,
        "brand": row["brand"],
        "brand_slug": row["brand_slug"],
        "category": row["category"],
        "category_slug": row["category_slug"],
        "gender": row["gender"],
        "tags": row["tags"],
        "image": images[0] if images else None,
        "hover_image": images[1] if len(images) > 1 else None,
        "rating": float(row["rating"] or 0),
        "review_count": int(row["review_count"] or 0),
        "colors": row.get("colors") or [],
        "is_new": row["is_new"],
        "is_featured": row["is_featured"],
        "in_stock": int(row["total_stock"] or 0) > 0,
    }


def _filters() -> tuple[str, list, bool]:
    where = ["p.is_active"]
    params: list = []
    q = request.args.get("q", "").strip()[:100]
    if q:
        where.append(
            "(p.search_vector @@ websearch_to_tsquery('english', %s) "
            " OR p.name ILIKE %s OR b.name ILIKE %s OR c.name ILIKE %s OR %s = ANY(p.tags))"
        )
        like = f"%{q}%"
        params += [q, like, like, like, q.lower()]

    for arg, column in (("category", "c.slug"), ("brand", "b.slug"), ("gender", "p.gender")):
        values = csv_arg(arg)
        if values:
            where.append(f"{column} = ANY(%s)")
            params.append(values)

    tags = [t.lower() for t in csv_arg("tag")]
    if tags:
        where.append("p.tags && %s::text[]")
        params.append(tags)

    sizes = csv_arg("size")
    if sizes:
        where.append(
            "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id "
            "AND v.size = ANY(%s) AND v.stock > 0)"
        )
        params.append(sizes)

    colors = csv_arg("color")
    if colors:
        where.append(
            "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id "
            "AND v.color = ANY(%s))"
        )
        params.append(colors)

    min_price = money(request.args.get("min_price"), allow_none=True, label="Minimum price")
    max_price = money(request.args.get("max_price"), allow_none=True, label="Maximum price")
    if min_price is not None:
        where.append("p.price >= %s")
        params.append(min_price)
    if max_price is not None:
        where.append("p.price <= %s")
        params.append(max_price)

    if request.args.get("sale") == "1":
        where.append("p.compare_at_price > p.price")
    if request.args.get("featured") == "1":
        where.append("p.is_featured")
    if request.args.get("new") == "1":
        where.append("p.created_at > now() - interval '45 days'")
    if request.args.get("in_stock") == "1":
        where.append(
            "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.stock > 0)"
        )
    exclude = request.args.get("exclude")
    if exclude:
        where.append("p.id <> %s")
        params.append(integer(exclude, label="exclude"))
    return " AND ".join(where), params, bool(q)


@bp.get("/products")
def list_products():
    where, params, has_query = _filters()
    page = integer(request.args.get("page"), default=1, minimum=1, label="page")
    per_page = integer(request.args.get("per_page"), default=12, minimum=1, maximum=48, label="per_page")
    sort = request.args.get("sort", "")
    params_order: list = []
    if sort in SORTS:
        order = SORTS[sort]
    elif has_query:
        order = "ts_rank(p.search_vector, websearch_to_tsquery('english', %s)) DESC, p.id DESC"
        params_order = [request.args.get("q", "").strip()[:100]]
    else:
        order = "p.is_featured DESC, p.created_at DESC, p.id DESC"

    base_from = (
        "FROM products p LEFT JOIN brands b ON b.id = p.brand_id "
        "LEFT JOIN categories c ON c.id = p.category_id"
    )
    total = db.scalar(f"SELECT COUNT(*) {base_from} WHERE {where}", params)
    rows = db.query(
        f"{CARD_SELECT} WHERE {where} ORDER BY {order} LIMIT %s OFFSET %s",
        params + params_order + [per_page, (page - 1) * per_page],
    )
    return jsonify({
        "items": [serialize_card(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
    })


@bp.get("/catalog/filters")
def catalog_filters():
    categories = db.query(
        """
        SELECT c.id, c.name, c.slug, c.description, c.image_url,
               COUNT(p.id) FILTER (WHERE p.is_active) AS product_count
          FROM categories c LEFT JOIN products p ON p.category_id = c.id
         GROUP BY c.id ORDER BY c.sort_order, c.name
        """
    )
    brands = db.query(
        """
        SELECT b.id, b.name, b.slug, b.logo_url,
               COUNT(p.id) FILTER (WHERE p.is_active) AS product_count
          FROM brands b LEFT JOIN products p ON p.brand_id = b.id
         GROUP BY b.id ORDER BY b.name
        """
    )
    sizes = db.query(
        """
        SELECT size FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE p.is_active GROUP BY size
         ORDER BY array_position(ARRAY['XS','S','M','L','XL','XXL','2-3Y','4-5Y','6-7Y','8-9Y','10-11Y',
                                       '28','30','32','34','36','38','FREE'], size::text), size
        """
    )
    colors = db.query(
        """
        SELECT color AS name, MIN(color_hex) AS hex FROM product_variants v
          JOIN products p ON p.id = v.product_id WHERE p.is_active
         GROUP BY color ORDER BY color
        """
    )
    price = db.query_one(
        "SELECT COALESCE(MIN(price), 0) AS min, COALESCE(MAX(price), 0) AS max "
        "FROM products WHERE is_active"
    )
    return jsonify({
        "categories": categories,
        "brands": brands,
        "sizes": [s["size"] for s in sizes],
        "colors": colors,
        "price": price,
        "genders": ["men", "women", "kids", "unisex"],
    })


@bp.get("/categories")
def list_categories():
    return jsonify(db.query("SELECT id, name, slug, description, image_url FROM categories ORDER BY sort_order, name"))


@bp.get("/brands")
def list_brands():
    return jsonify(db.query("SELECT id, name, slug, logo_url, description FROM brands ORDER BY name"))


@bp.get("/search/suggest")
def suggest():
    q = request.args.get("q", "").strip()[:60]
    if len(q) < 2:
        return jsonify({"products": [], "categories": [], "brands": []})
    like = f"%{q}%"
    products = db.query(
        """
        SELECT p.name, p.slug, p.price,
               (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image,
               b.name AS brand
          FROM products p LEFT JOIN brands b ON b.id = p.brand_id
         WHERE p.is_active AND (p.name ILIKE %s OR b.name ILIKE %s
               OR p.search_vector @@ websearch_to_tsquery('english', %s))
         ORDER BY (p.name ILIKE %s) DESC, p.is_featured DESC, p.id DESC LIMIT 6
        """,
        (like, like, q, f"{q}%"),
    )
    categories = db.query("SELECT name, slug FROM categories WHERE name ILIKE %s LIMIT 4", (like,))
    brands = db.query("SELECT name, slug FROM brands WHERE name ILIKE %s LIMIT 4", (like,))
    return jsonify({"products": products, "categories": categories, "brands": brands})


@bp.get("/products/<slug>")
def product_detail(slug: str):
    row = db.query_one(f"{CARD_SELECT} WHERE p.slug = %s AND p.is_active", (slug,))
    if not row:
        raise ApiError("Product not found.", 404)
    extra = db.query_one(
        "SELECT description, material, care, fit, brand_id, category_id FROM products WHERE id = %s",
        (row["id"],),
    )
    product = serialize_card(row)
    product.update({
        "description": extra["description"],
        "material": extra["material"],
        "care": extra["care"],
        "fit": extra["fit"],
        "images": db.query(
            "SELECT url, alt, color FROM product_images WHERE product_id = %s ORDER BY sort_order, id",
            (row["id"],),
        ),
        "variants": db.query(
            "SELECT id, sku, size, color, color_hex, stock FROM product_variants "
            "WHERE product_id = %s ORDER BY color, "
            "array_position(ARRAY['XS','S','M','L','XL','XXL'], size::text), size",
            (row["id"],),
        ),
        "rating_breakdown": {
            str(r["rating"]): r["n"] for r in db.query(
                "SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id = %s GROUP BY rating",
                (row["id"],),
            )
        },
    })
    user_id = current_user_id()
    product["in_wishlist"] = bool(user_id and db.scalar(
        "SELECT 1 FROM wishlist_items WHERE user_id = %s AND product_id = %s", (user_id, row["id"])
    ))
    related = db.query(
        f"{CARD_SELECT} WHERE p.is_active AND p.id <> %s AND (p.category_id = %s OR p.brand_id = %s) "
        "ORDER BY (p.category_id = %s) DESC, p.is_featured DESC, p.created_at DESC LIMIT 4",
        (row["id"], extra["category_id"], extra["brand_id"], extra["category_id"]),
    )
    product["related"] = [serialize_card(r) for r in related]
    return jsonify(product)


# ------------------------------------------------------------ reviews
def _product_id(slug: str) -> int:
    product_id = db.scalar("SELECT id FROM products WHERE slug = %s AND is_active", (slug,))
    if not product_id:
        raise ApiError("Product not found.", 404)
    return product_id


@bp.get("/products/<slug>/reviews")
def list_reviews(slug: str):
    product_id = _product_id(slug)
    reviews = db.query(
        """
        SELECT r.id, r.rating, r.title, r.body, r.is_verified, r.created_at,
               split_part(u.full_name, ' ', 1) AS author, (r.user_id = %s) AS is_mine
          FROM reviews r JOIN users u ON u.id = r.user_id
         WHERE r.product_id = %s ORDER BY r.created_at DESC LIMIT 50
        """,
        (current_user_id() or 0, product_id),
    )
    return jsonify(reviews)


@bp.post("/products/<slug>/reviews")
@login_required
def add_review(slug: str):
    product_id = _product_id(slug)
    data = json_body()
    rating = integer(data.get("rating"), minimum=1, maximum=5, label="Rating")
    title = text(data, "title", max_len=120)
    body = text(data, "body", required=True, max_len=2000, label="Review")
    user_id = current_user_id()
    verified = bool(db.scalar(
        """
        SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.user_id = %s AND oi.product_id = %s AND o.status <> 'cancelled' LIMIT 1
        """,
        (user_id, product_id),
    ))
    review = db.query_one(
        """
        INSERT INTO reviews (product_id, user_id, rating, title, body, is_verified)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (product_id, user_id) DO UPDATE
           SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body,
               is_verified = EXCLUDED.is_verified, created_at = now()
        RETURNING id, rating, title, body, is_verified, created_at
        """,
        (product_id, user_id, rating, title, body, verified),
    )
    return jsonify(review), 201
