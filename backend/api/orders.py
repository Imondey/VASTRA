"""Checkout and order history."""
from __future__ import annotations

import secrets
import string

from flask import Blueprint, jsonify, request

from .. import db
from ..security import current_user_id, login_required
from ..services.cart import CART_ITEMS_SQL, get_cart_id, price_items
from ..utils import ApiError, integer, json_body, text
from .auth import parse_address, save_address

bp = Blueprint("orders", __name__)

PAYMENT_METHODS = {"cod", "card", "upi"}
CUSTOMER_CANCELLABLE = {"pending", "confirmed"}

ORDER_FIELDS = """
    o.id, o.order_number, o.status, o.payment_method, o.payment_status, o.subtotal, o.discount,
    o.shipping_fee, o.total, o.coupon_code, o.shipping_name, o.shipping_phone, o.shipping_line1,
    o.shipping_line2, o.shipping_city, o.shipping_state, o.shipping_postal_code,
    o.shipping_country, o.notes, o.created_at, o.updated_at
"""


def _order_number() -> str:
    alphabet = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"
    return "VS" + "".join(secrets.choice(alphabet) for _ in range(8))


def order_detail(order: dict) -> dict:
    order["items"] = db.query(
        """
        SELECT id, product_id, variant_id, product_name, product_slug, brand_name, size, color,
               image_url, unit_price, quantity, line_total
          FROM order_items WHERE order_id = %s ORDER BY id
        """,
        (order["id"],),
    )
    order["history"] = db.query(
        "SELECT status, note, created_at FROM order_status_history WHERE order_id = %s ORDER BY created_at, id",
        (order["id"],),
    )
    order["can_cancel"] = order["status"] in CUSTOMER_CANCELLABLE
    return order


def restock_order(order_id: int) -> None:
    # Lock variants in id order (same order as checkout) to avoid deadlocks.
    db.query(
        """
        SELECT v.id FROM product_variants v
         WHERE v.id IN (SELECT variant_id FROM order_items WHERE order_id = %s)
         ORDER BY v.id FOR UPDATE
        """,
        (order_id,),
    )
    db.execute(
        """
        UPDATE product_variants v SET stock = v.stock + t.qty
          FROM (SELECT variant_id, SUM(quantity) AS qty FROM order_items
                 WHERE order_id = %s AND variant_id IS NOT NULL GROUP BY variant_id) t
         WHERE v.id = t.variant_id
        """,
        (order_id,),
    )


def cancel_order(order: dict, note: str) -> None:
    restock_order(order["id"])
    db.execute(
        """
        UPDATE orders SET status = 'cancelled',
               payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END
         WHERE id = %s
        """,
        (order["id"],),
    )
    if order.get("coupon_code"):
        db.execute(
            "UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE code = %s",
            (order["coupon_code"],),
        )
    db.execute(
        "INSERT INTO order_status_history (order_id, status, note) VALUES (%s, 'cancelled', %s)",
        (order["id"], note),
    )


@bp.post("/orders")
@login_required
def place_order():
    data = json_body()
    user_id = current_user_id()
    payment_method = text(data, "payment_method", required=True, max_len=10, label="Payment method")
    if payment_method not in PAYMENT_METHODS:
        raise ApiError("Please choose a valid payment method.")
    notes = text(data, "notes", max_len=500)

    # ---- shipping address
    if data.get("address_id"):
        address = db.query_one(
            "SELECT * FROM addresses WHERE id = %s AND user_id = %s",
            (integer(data["address_id"], label="Address"), user_id),
        )
        if not address:
            raise ApiError("Please choose a delivery address.", 400)
    elif isinstance(data.get("address"), dict):
        address = parse_address(data["address"])
    else:
        raise ApiError("Please provide a delivery address.")

    # ---- lock cart lines and stock
    cart_id = get_cart_id()
    if not cart_id:
        raise ApiError("Your bag is empty.")
    items = db.query(CART_ITEMS_SQL + " ORDER BY v.id FOR UPDATE OF v, ci", (cart_id,))
    if not items:
        raise ApiError("Your bag is empty.")
    problems = []
    for item in items:
        if not item["is_active"] or item["stock"] <= 0:
            problems.append(f"{item['name']} ({item['size']}) is sold out")
        elif item["quantity"] > item["stock"]:
            problems.append(f"Only {item['stock']} left of {item['name']} ({item['size']})")
    if problems:
        raise ApiError("Some items in your bag need attention: " + "; ".join(problems) + ".", 409)

    coupon_code = db.scalar("SELECT coupon_code FROM carts WHERE id = %s", (cart_id,))
    summary = price_items(items, coupon_code, lock_coupon=True)
    if summary["coupon_error"]:
        db.execute("UPDATE carts SET coupon_code = NULL WHERE id = %s", (cart_id,))
        db.commit()  # persist the coupon removal so the bag reflects reality
        raise ApiError(f"Coupon removed: {summary['coupon_error']} Please review your total.", 409)

    if not data.get("address_id") and data.get("save_address"):
        saved = db.scalar("SELECT COUNT(*) FROM addresses WHERE user_id = %s", (user_id,))
        if saved < 10:
            save_address(user_id, address, make_default=False)

    paid_online = payment_method in {"card", "upi"}
    order = db.query_one(
        """
        INSERT INTO orders (order_number, user_id, status, payment_method, payment_status,
                            subtotal, discount, shipping_fee, total, coupon_code,
                            shipping_name, shipping_phone, shipping_line1, shipping_line2,
                            shipping_city, shipping_state, shipping_postal_code, shipping_country, notes)
        VALUES (%s, %s, 'confirmed', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, order_number
        """,
        (
            _order_number(), user_id, payment_method, "paid" if paid_online else "pending",
            summary["subtotal"], summary["discount"], summary["shipping"], summary["total"],
            summary["coupon"]["code"] if summary["coupon"] else None,
            address["full_name"], address["phone"], address["line1"], address.get("line2") or None,
            address["city"], address["state"], address["postal_code"], address["country"],
            notes or None,
        ),
    )
    db.execute_many(
        """
        INSERT INTO order_items (order_id, product_id, variant_id, product_name, product_slug,
                                 brand_name, size, color, image_url, unit_price, quantity, line_total)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (order["id"], i["product_id"], i["variant_id"], i["name"], i["slug"], i["brand"],
             i["size"], i["color"], i["image"], i["price"], i["quantity"], i["line_total"])
            for i in items
        ],
    )
    db.execute_many(
        "UPDATE product_variants SET stock = stock - %s WHERE id = %s",
        [(i["quantity"], i["variant_id"]) for i in items],
    )
    if summary["coupon"]:
        db.execute("UPDATE coupons SET used_count = used_count + 1 WHERE code = %s",
                   (summary["coupon"]["code"],))
    db.execute(
        "INSERT INTO order_status_history (order_id, status, note) VALUES (%s, 'confirmed', %s)",
        (order["id"], "Payment received" if paid_online else "Cash on delivery"),
    )
    db.execute("DELETE FROM cart_items WHERE cart_id = %s AND id = ANY(%s)",
               (cart_id, [i["id"] for i in items]))
    db.execute("UPDATE carts SET coupon_code = NULL WHERE id = %s", (cart_id,))
    return jsonify({"order_number": order["order_number"]}), 201


@bp.get("/orders")
@login_required
def list_orders():
    page = integer(request.args.get("page"), default=1, minimum=1, label="page")
    orders = db.query(
        f"""
        SELECT {ORDER_FIELDS},
               (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count,
               (SELECT array_agg(image_url ORDER BY id) FROM
                    (SELECT image_url, id FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 4) t
               ) AS thumbnails
          FROM orders o WHERE o.user_id = %s
         ORDER BY o.created_at DESC LIMIT 20 OFFSET %s
        """,
        (current_user_id(), (page - 1) * 20),
    )
    return jsonify(orders)


def _own_order(order_number: str, lock: bool = False) -> dict:
    order = db.query_one(
        f"SELECT {ORDER_FIELDS} FROM orders o WHERE o.order_number = %s AND o.user_id = %s"
        + (" FOR UPDATE" if lock else ""),
        (order_number, current_user_id()),
    )
    if not order:
        raise ApiError("Order not found.", 404)
    return order


@bp.get("/orders/<order_number>")
@login_required
def get_order(order_number: str):
    return jsonify(order_detail(_own_order(order_number)))


@bp.post("/orders/<order_number>/cancel")
@login_required
def customer_cancel(order_number: str):
    order = _own_order(order_number, lock=True)
    if order["status"] not in CUSTOMER_CANCELLABLE:
        raise ApiError("This order can no longer be cancelled.", 409)
    cancel_order(order, "Cancelled by customer")
    return jsonify(order_detail(_own_order(order_number)))
