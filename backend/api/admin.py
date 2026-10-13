"""Back-office API: dashboard, products, inventory, orders, customers, coupons, messages."""
from __future__ import annotations

import re
import uuid
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from psycopg2 import errors as pg_errors

from .. import db
from ..security import admin_required, current_user_id
from ..utils import HEX_RE, ApiError, integer, json_body, money, slugify, text
from .orders import ORDER_FIELDS, cancel_order, order_detail

bp = Blueprint("admin", __name__, url_prefix="/admin")

ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]
GENDERS = {"men", "women", "kids", "unisex"}


@bp.before_request
@admin_required
def _guard():
    return None


def _page() -> tuple[int, int]:
    page = integer(request.args.get("page"), default=1, minimum=1, label="page")
    per_page = integer(request.args.get("per_page"), default=20, minimum=1, maximum=100, label="per_page")
    return page, per_page


# ------------------------------------------------------------ dashboard
@bp.get("/stats")
def stats():
    totals = db.query_one(
        """
        SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0) AS revenue,
               COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed', 'processing')) AS open_orders,
               COALESCE(AVG(total) FILTER (WHERE status <> 'cancelled'), 0) AS avg_order_value,
               COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'
                         AND created_at > now() - interval '30 days'), 0) AS revenue_30d
          FROM orders
        """
    )
    totals["customers"] = db.scalar("SELECT COUNT(*) FROM users WHERE role = 'customer'")
    totals["products"] = db.scalar("SELECT COUNT(*) FROM products WHERE is_active")
    totals["unread_messages"] = db.scalar("SELECT COUNT(*) FROM contact_messages WHERE NOT is_read")
    totals["subscribers"] = db.scalar("SELECT COUNT(*) FROM newsletter_subscribers")

    sales = db.query(
        """
        SELECT d::date AS day,
               COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'), 0) AS revenue,
               COUNT(o.id) AS orders
          FROM generate_series((current_date - 13)::timestamp, current_date::timestamp, interval '1 day') d
          LEFT JOIN orders o ON o.created_at::date = d::date
         GROUP BY d ORDER BY d
        """
    )
    by_status = db.query("SELECT status, COUNT(*) AS count FROM orders GROUP BY status")
    top_products = db.query(
        """
        SELECT oi.product_name AS name, oi.product_slug AS slug,
               SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'cancelled'
         GROUP BY oi.product_name, oi.product_slug ORDER BY units DESC LIMIT 5
        """
    )
    low_stock = db.query(
        """
        SELECT v.id, v.sku, v.size, v.color, v.stock, p.id AS product_id, p.name
          FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE p.is_active AND v.stock <= 5 ORDER BY v.stock, p.name LIMIT 10
        """
    )
    recent = db.query(
        f"""
        SELECT {ORDER_FIELDS}, u.email AS customer_email FROM orders o
          LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 8
        """
    )
    return jsonify({
        "totals": totals, "sales": sales, "by_status": by_status,
        "top_products": top_products, "low_stock": low_stock, "recent_orders": recent,
    })


# ------------------------------------------------------------ lookups
@bp.get("/lookups")
def lookups():
    return jsonify({
        "categories": db.query("SELECT id, name, slug FROM categories ORDER BY sort_order, name"),
        "brands": db.query("SELECT id, name, slug FROM brands ORDER BY name"),
        "order_statuses": ORDER_STATUSES,
    })


# ------------------------------------------------------------ products
@bp.get("/products")
def list_products():
    page, per_page = _page()
    q = request.args.get("q", "").strip()[:100]
    where, params = ["TRUE"], []
    if q:
        where.append("(p.name ILIKE %s OR p.slug ILIKE %s OR b.name ILIKE %s)")
        params += [f"%{q}%"] * 3
    status = request.args.get("status")
    if status == "active":
        where.append("p.is_active")
    elif status == "archived":
        where.append("NOT p.is_active")
    clause = " AND ".join(where)
    total = db.scalar(
        f"SELECT COUNT(*) FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE {clause}", params
    )
    rows = db.query(
        f"""
        SELECT p.id, p.name, p.slug, p.price, p.compare_at_price, p.gender, p.is_active, p.is_featured,
               b.name AS brand, c.name AS category,
               (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image,
               (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = p.id) AS stock,
               (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) AS variant_count
          FROM products p
          LEFT JOIN brands b ON b.id = p.brand_id
          LEFT JOIN categories c ON c.id = p.category_id
         WHERE {clause}
         ORDER BY p.created_at DESC, p.id DESC LIMIT %s OFFSET %s
        """,
        params + [per_page, (page - 1) * per_page],
    )
    return jsonify({"items": rows, "total": total, "page": page, "pages": max(1, -(-total // per_page))})


def _product_payload(data: dict) -> dict:
    name = text(data, "name", required=True, max_len=160, label="Name")
    slug = slugify(text(data, "slug", max_len=180) or name)
    price = money(data.get("price"), label="Price")
    compare = money(data.get("compare_at_price"), label="Compare-at price", allow_none=True)
    if compare is not None and compare < price:
        raise ApiError("Compare-at price must be greater than or equal to the price.")
    gender = text(data, "gender", default="unisex") or "unisex"
    if gender not in GENDERS:
        raise ApiError("Invalid gender.")
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    tags = sorted({slugify(str(t)) for t in tags if str(t).strip()})[:20]

    images = []
    for i, img in enumerate(data.get("images") or []):
        if not isinstance(img, dict):
            continue
        url = text(img, "url", max_len=255)
        if not url:
            continue
        if not (url.startswith("/") or url.startswith("images/") or url.startswith("uploads/")
                or re.match(r"^https://", url)):
            raise ApiError(f"Image URL '{url}' is not allowed.")
        images.append({"url": url, "alt": text(img, "alt", max_len=200) or name,
                       "color": text(img, "color", max_len=40) or None, "sort_order": i})

    variants, seen = [], set()
    for v in data.get("variants") or []:
        if not isinstance(v, dict):
            continue
        size = text(v, "size", required=True, max_len=12, label="Variant size").upper()
        color = text(v, "color", required=True, max_len=40, label="Variant colour")
        hex_code = text(v, "color_hex", max_len=7) or "#000000"
        if not HEX_RE.match(hex_code):
            raise ApiError(f"Colour code for {color} must look like #1A2B3C.")
        key = (size, color.lower())
        if key in seen:
            raise ApiError(f"Duplicate variant {color} / {size}.")
        seen.add(key)
        original = v.get("original_stock")
        variants.append({"size": size, "color": color, "color_hex": hex_code,
                         "stock": integer(v.get("stock"), default=0, minimum=0, maximum=100000, label="Stock"),
                         "original_stock": None if original in (None, "") else
                         integer(original, minimum=0, maximum=100000, label="Stock")})
    if not variants:
        raise ApiError("Add at least one size / colour variant.")

    def fk(key: str, table: str) -> int | None:
        value = data.get(key)
        if value in (None, ""):
            return None
        ident = integer(value, label=key)
        if not db.scalar(f"SELECT 1 FROM {table} WHERE id = %s", (ident,)):
            raise ApiError(f"Unknown {key.replace('_id', '')}.")
        return ident

    return {
        "name": name, "slug": slug, "price": price, "compare_at_price": compare,
        "description": text(data, "description", max_len=5000),
        "material": text(data, "material", max_len=160) or None,
        "care": text(data, "care", max_len=255) or None,
        "fit": text(data, "fit", max_len=60) or None,
        "gender": gender, "tags": tags,
        "brand_id": fk("brand_id", "brands"), "category_id": fk("category_id", "categories"),
        "is_featured": bool(data.get("is_featured")),
        "is_active": bool(data.get("is_active", True)),
        "images": images, "variants": variants,
    }


def _sku(product_id: int, color: str, size: str) -> str:
    return re.sub(r"[^A-Z0-9-]", "", f"VS{product_id}-{color[:6].upper()}-{size}")[:60]


def _write_children(product_id: int, payload: dict) -> None:
    db.execute("DELETE FROM product_images WHERE product_id = %s", (product_id,))
    db.execute_many(
        "INSERT INTO product_images (product_id, url, alt, color, sort_order) VALUES (%s, %s, %s, %s, %s)",
        [(product_id, i["url"], i["alt"], i["color"], i["sort_order"]) for i in payload["images"]],
    )
    keep = []
    for v in payload["variants"]:
        variant_id = db.scalar(
            """
            INSERT INTO product_variants (product_id, sku, size, color, color_hex, stock)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (product_id, size, color)
            DO UPDATE SET color_hex = EXCLUDED.color_hex,
                          -- apply the admin's change as a delta so concurrent sales are not overwritten
                          stock = CASE WHEN %s::int IS NULL THEN EXCLUDED.stock
                                       ELSE GREATEST(0, product_variants.stock + EXCLUDED.stock - %s::int) END
            RETURNING id
            """,
            (product_id, _sku(product_id, v["color"], v["size"]) + "-" + uuid.uuid4().hex[:4].upper(),
             v["size"], v["color"], v["color_hex"], v["stock"], v["original_stock"], v["original_stock"]),
        )
        keep.append(variant_id)
    db.execute("DELETE FROM product_variants WHERE product_id = %s AND NOT (id = ANY(%s))",
               (product_id, keep))


PRODUCT_COLUMNS = ("name", "slug", "description", "brand_id", "category_id", "gender", "price",
                   "compare_at_price", "material", "care", "fit", "tags", "is_featured", "is_active")


def _admin_product(product_id: int) -> dict:
    product = db.query_one(
        f"SELECT id, {', '.join(PRODUCT_COLUMNS)}, created_at, updated_at FROM products WHERE id = %s",
        (product_id,),
    )
    if not product:
        raise ApiError("Product not found.", 404)
    product["images"] = db.query(
        "SELECT url, alt, color FROM product_images WHERE product_id = %s ORDER BY sort_order, id", (product_id,)
    )
    product["variants"] = db.query(
        "SELECT id, sku, size, color, color_hex, stock FROM product_variants WHERE product_id = %s "
        "ORDER BY color, array_position(ARRAY['XS','S','M','L','XL','XXL'], size::text), size",
        (product_id,),
    )
    return product


@bp.get("/products/<int:product_id>")
def get_product(product_id: int):
    return jsonify(_admin_product(product_id))


@bp.post("/products")
def create_product():
    payload = _product_payload(json_body())
    try:
        product_id = db.scalar(
            f"INSERT INTO products ({', '.join(PRODUCT_COLUMNS)}) "
            f"VALUES ({', '.join('%(' + c + ')s' for c in PRODUCT_COLUMNS)}) RETURNING id",
            payload,
        )
    except pg_errors.UniqueViolation:
        raise ApiError("Another product already uses this URL slug.", 409, {"slug": "Taken"}) from None
    _write_children(product_id, payload)
    return jsonify(_admin_product(product_id)), 201


@bp.put("/products/<int:product_id>")
def update_product(product_id: int):
    payload = _product_payload(json_body())
    try:
        updated = db.execute(
            f"UPDATE products SET {', '.join(c + ' = %(' + c + ')s' for c in PRODUCT_COLUMNS)} "
            "WHERE id = %(id)s",
            {**payload, "id": product_id},
        )
    except pg_errors.UniqueViolation:
        raise ApiError("Another product already uses this URL slug.", 409, {"slug": "Taken"}) from None
    if not updated:
        raise ApiError("Product not found.", 404)
    _write_children(product_id, payload)
    return jsonify(_admin_product(product_id))


@bp.delete("/products/<int:product_id>")
def delete_product(product_id: int):
    has_orders = db.scalar("SELECT 1 FROM order_items WHERE product_id = %s LIMIT 1", (product_id,))
    if has_orders:
        db.execute("UPDATE products SET is_active = FALSE WHERE id = %s", (product_id,))
        return jsonify({"ok": True, "archived": True,
                        "message": "Product has orders, so it was archived instead of deleted."})
    if not db.execute("DELETE FROM products WHERE id = %s", (product_id,)):
        raise ApiError("Product not found.", 404)
    return jsonify({"ok": True, "archived": False})


@bp.patch("/variants/<int:variant_id>")
def update_stock(variant_id: int):
    stock = integer(json_body().get("stock"), minimum=0, maximum=100000, label="Stock")
    if not db.execute("UPDATE product_variants SET stock = %s WHERE id = %s", (stock, variant_id)):
        raise ApiError("Variant not found.", 404)
    return jsonify({"ok": True, "stock": stock})


@bp.post("/uploads")
def upload_image():
    file = request.files.get("file")
    if not file or not file.filename:
        raise ApiError("Choose an image to upload.")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in current_app.config["ALLOWED_IMAGE_EXTENSIONS"]:
        raise ApiError("Only JPG, PNG or WebP images are allowed.")
    head = file.stream.read(16)
    file.stream.seek(0)
    signatures = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")
    if not (head.startswith(signatures) or (head[:4] == b"RIFF" and head[8:12] == b"WEBP")):
        raise ApiError("The file does not look like a valid image.")
    upload_dir = current_app.config["UPLOAD_DIR"]
    upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{datetime.now():%Y%m}-{uuid.uuid4().hex[:12]}.{'jpg' if ext == 'jpeg' else ext}"
    file.save(upload_dir / name)
    return jsonify({"url": f"uploads/{name}"}), 201


# ------------------------------------------------------------ orders
@bp.get("/orders")
def list_orders():
    page, per_page = _page()
    where, params = ["TRUE"], []
    status = request.args.get("status")
    if status in ORDER_STATUSES:
        where.append("o.status = %s")
        params.append(status)
    q = request.args.get("q", "").strip()[:100]
    if q:
        where.append("(o.order_number ILIKE %s OR o.shipping_name ILIKE %s OR u.email ILIKE %s)")
        params += [f"%{q}%"] * 3
    clause = " AND ".join(where)
    total = db.scalar(f"SELECT COUNT(*) FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE {clause}", params)
    rows = db.query(
        f"""
        SELECT {ORDER_FIELDS}, u.email AS customer_email,
               (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count
          FROM orders o LEFT JOIN users u ON u.id = o.user_id
         WHERE {clause} ORDER BY o.created_at DESC LIMIT %s OFFSET %s
        """,
        params + [per_page, (page - 1) * per_page],
    )
    return jsonify({"items": rows, "total": total, "page": page, "pages": max(1, -(-total // per_page))})


def _order(order_id: int, lock: bool = False) -> dict:
    order = db.query_one(
        f"SELECT {ORDER_FIELDS}, u.email AS customer_email FROM orders o "
        f"LEFT JOIN users u ON u.id = o.user_id WHERE o.id = %s" + (" FOR UPDATE OF o" if lock else ""),
        (order_id,),
    )
    if not order:
        raise ApiError("Order not found.", 404)
    return order


@bp.get("/orders/<int:order_id>")
def get_order(order_id: int):
    return jsonify(order_detail(_order(order_id)))


@bp.patch("/orders/<int:order_id>")
def update_order(order_id: int):
    data = json_body()
    status = text(data, "status", required=True, max_len=20, label="Status")
    if status not in ORDER_STATUSES:
        raise ApiError("Invalid status.")
    note = text(data, "note", max_len=255)
    order = _order(order_id, lock=True)
    if order["status"] == "cancelled":
        raise ApiError("Cancelled orders cannot be changed.", 409)
    if status == order["status"]:
        return jsonify(order_detail(order))
    if status == "cancelled":
        cancel_order(order, note or "Cancelled by VASTRA")
    else:
        db.execute(
            """
            UPDATE orders SET status = %s,
                   payment_status = CASE WHEN %s = 'delivered' AND payment_method = 'cod'
                                         THEN 'paid' ELSE payment_status END
             WHERE id = %s
            """,
            (status, status, order_id),
        )
        db.execute("INSERT INTO order_status_history (order_id, status, note) VALUES (%s, %s, %s)",
                   (order_id, status, note))
    return jsonify(order_detail(_order(order_id)))


# ------------------------------------------------------------ customers
@bp.get("/customers")
def list_customers():
    page, per_page = _page()
    q = request.args.get("q", "").strip()[:100]
    where, params = "TRUE", []
    if q:
        where = "(u.full_name ILIKE %s OR u.email ILIKE %s)"
        params = [f"%{q}%", f"%{q}%"]
    total = db.scalar(f"SELECT COUNT(*) FROM users u WHERE {where}", params)
    rows = db.query(
        f"""
        SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at,
               COUNT(o.id) AS order_count,
               COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'), 0) AS total_spent,
               MAX(o.created_at) AS last_order_at
          FROM users u LEFT JOIN orders o ON o.user_id = u.id
         WHERE {where} GROUP BY u.id ORDER BY u.created_at DESC LIMIT %s OFFSET %s
        """,
        params + [per_page, (page - 1) * per_page],
    )
    return jsonify({"items": rows, "total": total, "page": page, "pages": max(1, -(-total // per_page))})


@bp.patch("/customers/<int:user_id>")
def update_customer(user_id: int):
    if user_id == current_user_id():
        raise ApiError("You cannot change your own account here.", 409)
    data = json_body()
    fields, params = [], []
    if "is_active" in data:
        fields.append("is_active = %s")
        params.append(bool(data["is_active"]))
        fields.append("session_version = session_version + 1")
    if data.get("role") in {"customer", "admin"}:
        fields.append("role = %s")
        params.append(data["role"])
    if not fields:
        raise ApiError("Nothing to update.")
    if not db.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = %s", params + [user_id]):
        raise ApiError("Customer not found.", 404)
    return jsonify({"ok": True})


# ------------------------------------------------------------ coupons
@bp.get("/coupons")
def list_coupons():
    return jsonify(db.query("SELECT * FROM coupons ORDER BY created_at DESC"))


@bp.post("/coupons")
def create_coupon():
    data = json_body()
    code = text(data, "code", required=True, max_len=30, label="Code").upper()
    if not re.match(r"^[A-Z0-9_-]{3,30}$", code):
        raise ApiError("Codes may contain letters, numbers, dashes and underscores (3–30 chars).")
    discount_type = data.get("discount_type")
    if discount_type not in {"percent", "fixed"}:
        raise ApiError("Discount type must be percent or fixed.")
    value = money(data.get("value"), label="Value")
    if value <= 0 or (discount_type == "percent" and value > 90):
        raise ApiError("Percent discounts must be between 1 and 90.")
    expires = text(data, "expires_at", max_len=40) or None
    try:
        coupon = db.query_one(
            """
            INSERT INTO coupons (code, description, discount_type, value, min_order, max_discount,
                                 usage_limit, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *
            """,
            (
                code, text(data, "description", max_len=200), discount_type, value,
                money(data.get("min_order"), label="Minimum order", allow_none=True) or 0,
                money(data.get("max_discount"), label="Maximum discount", allow_none=True),
                integer(data.get("usage_limit"), minimum=1, label="Usage limit") if data.get("usage_limit") else None,
                expires,
            ),
        )
    except pg_errors.UniqueViolation:
        raise ApiError("A coupon with this code already exists.", 409) from None
    except (pg_errors.InvalidDatetimeFormat, pg_errors.DatetimeFieldOverflow):
        raise ApiError("Expiry date is invalid.") from None
    return jsonify(coupon), 201


@bp.patch("/coupons/<int:coupon_id>")
def toggle_coupon(coupon_id: int):
    is_active = bool(json_body().get("is_active"))
    if not db.execute("UPDATE coupons SET is_active = %s WHERE id = %s", (is_active, coupon_id)):
        raise ApiError("Coupon not found.", 404)
    return jsonify({"ok": True})


@bp.delete("/coupons/<int:coupon_id>")
def delete_coupon(coupon_id: int):
    if not db.execute("DELETE FROM coupons WHERE id = %s", (coupon_id,)):
        raise ApiError("Coupon not found.", 404)
    return jsonify({"ok": True})


# ------------------------------------------------------------ messages
@bp.get("/messages")
def list_messages():
    return jsonify({
        "messages": db.query("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100"),
        "subscribers": db.query("SELECT email, created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 200"),
    })


@bp.patch("/messages/<int:message_id>")
def mark_message(message_id: int):
    db.execute("UPDATE contact_messages SET is_read = %s WHERE id = %s",
               (bool(json_body().get("is_read", True)), message_id))
    return jsonify({"ok": True})
