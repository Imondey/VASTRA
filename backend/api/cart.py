"""Shopping bag and wishlist."""
from __future__ import annotations

from flask import Blueprint, current_app, jsonify

from .. import db
from ..security import current_user_id, login_required
from ..services.cart import build_cart, evaluate_coupon, get_cart_id, serialize_summary
from ..utils import ApiError, integer, json_body, text
from .catalog import CARD_SELECT, serialize_card

bp = Blueprint("cart", __name__)


def _cart_response(status: int = 200):
    return jsonify(serialize_summary(build_cart(get_cart_id()))), status


def _variant(variant_id: int) -> dict:
    variant = db.query_one(
        """
        SELECT v.id, v.stock, p.is_active FROM product_variants v
          JOIN products p ON p.id = v.product_id WHERE v.id = %s
        """,
        (variant_id,),
    )
    if not variant or not variant["is_active"]:
        raise ApiError("This item is no longer available.", 404)
    return variant


@bp.get("/cart")
def get_cart():
    return _cart_response()


@bp.post("/cart/items")
def add_item():
    data = json_body()
    max_qty = current_app.config["MAX_QTY_PER_ITEM"]
    variant_id = integer(data.get("variant_id"), label="Size / colour")
    quantity = integer(data.get("quantity"), default=1, minimum=1, maximum=max_qty, label="Quantity")
    variant = _variant(variant_id)
    if variant["stock"] <= 0:
        raise ApiError("Sorry, this size is sold out.", 409)

    cart_id = get_cart_id(create=True)
    existing = db.scalar(
        "SELECT quantity FROM cart_items WHERE cart_id = %s AND variant_id = %s", (cart_id, variant_id)
    ) or 0
    new_qty = min(existing + quantity, max_qty, variant["stock"])
    if new_qty <= existing:
        raise ApiError(f"Only {variant['stock']} piece(s) available in this size.", 409)
    db.execute(
        """
        INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (%s, %s, %s)
        ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity
        """,
        (cart_id, variant_id, new_qty),
    )
    db.execute("UPDATE carts SET updated_at = now() WHERE id = %s", (cart_id,))
    return _cart_response(201)


@bp.patch("/cart/items/<int:item_id>")
def update_item(item_id: int):
    data = json_body()
    cart_id = get_cart_id()
    if not cart_id:
        raise ApiError("Your bag is empty.", 404)
    quantity = integer(data.get("quantity"), minimum=0,
                       maximum=current_app.config["MAX_QTY_PER_ITEM"], label="Quantity")
    if quantity == 0:
        db.execute("DELETE FROM cart_items WHERE id = %s AND cart_id = %s", (item_id, cart_id))
        return _cart_response()
    stock = db.scalar(
        """
        SELECT v.stock FROM cart_items ci JOIN product_variants v ON v.id = ci.variant_id
         WHERE ci.id = %s AND ci.cart_id = %s
        """,
        (item_id, cart_id),
    )
    if stock is None:
        raise ApiError("Item not found in your bag.", 404)
    if quantity > stock:
        raise ApiError(f"Only {stock} piece(s) available.", 409)
    db.execute("UPDATE cart_items SET quantity = %s WHERE id = %s AND cart_id = %s",
               (quantity, item_id, cart_id))
    return _cart_response()


@bp.delete("/cart/items/<int:item_id>")
def remove_item(item_id: int):
    cart_id = get_cart_id()
    if cart_id:
        db.execute("DELETE FROM cart_items WHERE id = %s AND cart_id = %s", (item_id, cart_id))
    return _cart_response()


@bp.post("/cart/coupon")
def apply_coupon():
    code = text(json_body(), "code", required=True, max_len=30, label="Coupon code").upper()
    cart_id = get_cart_id()
    summary = build_cart(cart_id)
    if not cart_id or summary["count"] == 0:
        raise ApiError("Add items to your bag before applying a coupon.")
    evaluate_coupon(code, summary["subtotal"])  # raises with a helpful message
    db.execute("UPDATE carts SET coupon_code = %s WHERE id = %s", (code, cart_id))
    return _cart_response()


@bp.delete("/cart/coupon")
def remove_coupon():
    cart_id = get_cart_id()
    if cart_id:
        db.execute("UPDATE carts SET coupon_code = NULL WHERE id = %s", (cart_id,))
    return _cart_response()


@bp.get("/coupons/public")
def public_coupons():
    return jsonify(db.query(
        """
        SELECT code, description, discount_type, value, min_order FROM coupons
         WHERE is_active AND (expires_at IS NULL OR expires_at > now())
           AND (usage_limit IS NULL OR used_count < usage_limit)
         ORDER BY min_order LIMIT 5
        """
    ))


# ------------------------------------------------------------ wishlist
@bp.get("/wishlist")
@login_required
def get_wishlist():
    rows = db.query(
        f"""{CARD_SELECT}
            JOIN wishlist_items w ON w.product_id = p.id AND w.user_id = %s
           WHERE p.is_active ORDER BY w.created_at DESC""",
        (current_user_id(),),
    )
    return jsonify([serialize_card(r) for r in rows])


@bp.get("/wishlist/ids")
def wishlist_ids():
    user_id = current_user_id()
    if not user_id:
        return jsonify([])
    rows = db.query("SELECT product_id FROM wishlist_items WHERE user_id = %s", (user_id,))
    return jsonify([r["product_id"] for r in rows])


@bp.post("/wishlist")
@login_required
def add_to_wishlist():
    product_id = integer(json_body().get("product_id"), label="Product")
    if not db.scalar("SELECT 1 FROM products WHERE id = %s AND is_active", (product_id,)):
        raise ApiError("Product not found.", 404)
    db.execute(
        "INSERT INTO wishlist_items (user_id, product_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
        (current_user_id(), product_id),
    )
    return jsonify({"ok": True}), 201


@bp.delete("/wishlist/<int:product_id>")
@login_required
def remove_from_wishlist(product_id: int):
    db.execute("DELETE FROM wishlist_items WHERE user_id = %s AND product_id = %s",
               (current_user_id(), product_id))
    return jsonify({"ok": True})
