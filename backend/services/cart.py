"""Cart persistence and pricing (shared by the cart and checkout APIs)."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from flask import current_app, session

from .. import db
from ..security import current_user_id
from ..utils import ApiError, to_money

ZERO = Decimal("0.00")

CART_ITEMS_SQL = """
    SELECT ci.id, ci.quantity,
           v.id AS variant_id, v.sku, v.size, v.color, v.color_hex, v.stock,
           p.id AS product_id, p.name, p.slug, p.price, p.compare_at_price, p.is_active,
           b.name AS brand,
           (SELECT pi.url FROM product_images pi
             WHERE pi.product_id = p.id
             ORDER BY (pi.color IS NOT DISTINCT FROM v.color) DESC, pi.sort_order, pi.id
             LIMIT 1) AS image
      FROM cart_items ci
      JOIN product_variants v ON v.id = ci.variant_id
      JOIN products p         ON p.id = v.product_id
      LEFT JOIN brands b      ON b.id = p.brand_id
     WHERE ci.cart_id = %s
"""


# ------------------------------------------------------------ cart lookup
def get_cart_id(create: bool = False) -> str | None:
    user_id = current_user_id()
    if user_id:
        cart_id = db.scalar("SELECT id FROM carts WHERE user_id = %s", (user_id,))
        if cart_id is None and create:
            cart_id = db.scalar(
                "INSERT INTO carts (user_id) VALUES (%s) "
                "ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id",
                (user_id,),
            )
        return str(cart_id) if cart_id else None

    cart_id = session.get("cart_id")
    if cart_id:
        exists = db.scalar(
            "SELECT 1 FROM carts WHERE id = %s::uuid AND user_id IS NULL", (cart_id,)
        )
        if not exists:
            session.pop("cart_id", None)
            cart_id = None
    if cart_id is None and create:
        cart_id = str(db.scalar("INSERT INTO carts DEFAULT VALUES RETURNING id"))
        session.permanent = True
        session["cart_id"] = cart_id
    return cart_id


def merge_guest_cart(user_id: int) -> None:
    """Move items from the pre-login guest cart into the user's cart."""
    guest_id = session.pop("guest_cart_id", None)
    if not guest_id:
        return
    guest = db.query_one(
        "SELECT id, coupon_code FROM carts WHERE id = %s::uuid AND user_id IS NULL FOR UPDATE",
        (guest_id,),
    )
    if not guest:
        return
    user_cart = db.scalar(
        "INSERT INTO carts (user_id) VALUES (%s) "
        "ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id",
        (user_id,),
    )
    db.execute(
        """
        INSERT INTO cart_items (cart_id, variant_id, quantity)
        SELECT %s, variant_id, quantity FROM cart_items WHERE cart_id = %s
        ON CONFLICT (cart_id, variant_id)
        DO UPDATE SET quantity = LEAST(%s, cart_items.quantity + EXCLUDED.quantity)
        """,
        (user_cart, guest["id"], current_app.config["MAX_QTY_PER_ITEM"]),
    )
    if guest["coupon_code"]:
        db.execute(
            "UPDATE carts SET coupon_code = COALESCE(coupon_code, %s) WHERE id = %s",
            (guest["coupon_code"], user_cart),
        )
    db.execute("DELETE FROM carts WHERE id = %s", (guest["id"],))


# ------------------------------------------------------------ pricing
def evaluate_coupon(code: str, subtotal: Decimal, *, lock: bool = False) -> tuple[Decimal, dict]:
    """Return (discount, coupon_row) or raise ApiError if the coupon cannot be applied."""
    coupon = db.query_one(
        "SELECT * FROM coupons WHERE code = %s" + (" FOR UPDATE" if lock else ""),
        (code.upper(),),
    )
    if not coupon or not coupon["is_active"]:
        raise ApiError("This coupon code is not valid.")
    if coupon["expires_at"] is not None and coupon["expires_at"] < datetime.now(timezone.utc):
        raise ApiError("This coupon has expired.")
    if coupon["usage_limit"] is not None and coupon["used_count"] >= coupon["usage_limit"]:
        raise ApiError("This coupon has reached its usage limit.")
    if subtotal < coupon["min_order"]:
        raise ApiError(f"Add items worth ₹{coupon['min_order'] - subtotal:,.0f} more to use this coupon.")

    if coupon["discount_type"] == "percent":
        discount = subtotal * coupon["value"] / Decimal(100)
        if coupon["max_discount"] is not None:
            discount = min(discount, coupon["max_discount"])
    else:
        discount = coupon["value"]
    return to_money(min(discount, subtotal)), coupon


def price_items(items: list[dict], coupon_code: str | None, *, lock_coupon: bool = False) -> dict:
    cfg = current_app.config
    subtotal = ZERO
    mrp_total = ZERO
    count = 0
    for item in items:
        item["available"] = bool(item["is_active"]) and item["stock"] > 0
        item["exceeds_stock"] = item["quantity"] > item["stock"]
        item["line_total"] = to_money(item["price"] * item["quantity"])
        if item["available"]:
            subtotal += item["line_total"]
            mrp_total += to_money((item["compare_at_price"] or item["price"]) * item["quantity"])
            count += item["quantity"]

    discount = ZERO
    coupon_info = None
    coupon_error = None
    if coupon_code and subtotal > 0:
        try:
            discount, coupon = evaluate_coupon(coupon_code, subtotal, lock=lock_coupon)
            coupon_info = {"code": coupon["code"], "description": coupon["description"]}
        except ApiError as err:
            coupon_error = err.message

    after_discount = subtotal - discount
    if count == 0 or after_discount >= cfg["FREE_SHIPPING_THRESHOLD"]:
        shipping = ZERO
    else:
        shipping = to_money(cfg["SHIPPING_FEE"])

    return {
        "items": items,
        "count": count,
        "subtotal": to_money(subtotal),
        "mrp_total": to_money(mrp_total),
        "savings": to_money(mrp_total - subtotal + discount),
        "discount": discount,
        "shipping": shipping,
        "total": to_money(after_discount + shipping),
        "coupon": coupon_info,
        "coupon_code": coupon_code,
        "coupon_error": coupon_error,
        "free_shipping_threshold": cfg["FREE_SHIPPING_THRESHOLD"],
        "free_shipping_remaining": to_money(
            max(ZERO, cfg["FREE_SHIPPING_THRESHOLD"] - after_discount)
        ),
    }


def empty_summary() -> dict:
    return price_items([], None)


def build_cart(cart_id: str | None) -> dict:
    if not cart_id:
        return empty_summary()
    coupon_code = db.scalar("SELECT coupon_code FROM carts WHERE id = %s::uuid", (cart_id,))
    items = db.query(CART_ITEMS_SQL + " ORDER BY ci.added_at, ci.id", (cart_id,))
    return price_items(items, coupon_code)


def serialize_item(item: dict) -> dict:
    return {
        "id": item["id"],
        "variant_id": item["variant_id"],
        "product_id": item["product_id"],
        "name": item["name"],
        "slug": item["slug"],
        "brand": item["brand"],
        "image": item["image"],
        "size": item["size"],
        "color": item["color"],
        "color_hex": item["color_hex"],
        "sku": item["sku"],
        "price": item["price"],
        "compare_at_price": item["compare_at_price"],
        "quantity": item["quantity"],
        "stock": item["stock"],
        "available": item["available"],
        "exceeds_stock": item["exceeds_stock"],
        "line_total": item["line_total"],
    }


def serialize_summary(summary: dict) -> dict:
    data = {k: v for k, v in summary.items() if k != "items"}
    data["items"] = [serialize_item(i) for i in summary["items"]]
    return data
