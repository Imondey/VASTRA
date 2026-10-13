"""Registration, sign-in, profile, password and address book."""
from __future__ import annotations

from flask import Blueprint, g, jsonify
from psycopg2 import errors as pg_errors
from werkzeug.security import check_password_hash, generate_password_hash

from .. import db
from ..security import (current_user_id, load_current_user, login_required, login_user,
                        logout_user, rate_limit, revoke_other_sessions)
from ..services.cart import merge_guest_cart
from ..utils import ApiError, email, json_body, phone, text, PIN_RE

bp = Blueprint("auth", __name__)

# Pre-computed hash used to keep login timing constant for unknown emails.
_DUMMY_HASH = generate_password_hash("vastra-timing-equaliser")


def _validate_password(password: str, key: str = "password") -> None:
    if len(password) < 8:
        raise ApiError("Password must be at least 8 characters.", fields={key: "Too short"})
    if len(password) > 128:
        raise ApiError("Password is too long.", fields={key: "Too long"})
    if password.isalpha() or password.isdigit():
        raise ApiError("Use a mix of letters and numbers in your password.", fields={key: "Too weak"})


def _public_user(user: dict | None) -> dict | None:
    if not user:
        return None
    return {
        "id": user["id"],
        "full_name": user["full_name"],
        "first_name": user["full_name"].split(" ")[0],
        "email": user["email"],
        "phone": user.get("phone"),
        "role": user["role"],
        "is_admin": user["role"] == "admin",
        "created_at": user.get("created_at"),
    }


@bp.post("/auth/register")
@rate_limit("register", limit=10, window=600)
def register():
    data = json_body()
    full_name = text(data, "full_name", required=True, max_len=120, label="Full name")
    address = email(data)
    password = data.get("password") or ""
    if not isinstance(password, str):
        raise ApiError("Password is invalid.")
    _validate_password(password)

    if db.scalar("SELECT 1 FROM users WHERE email = %s", (address,)):
        raise ApiError("An account with this email already exists.", 409, {"email": "Already registered"})
    try:
        user_id = db.scalar(
            "INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s) RETURNING id",
            (full_name, address, generate_password_hash(password)),
        )
    except pg_errors.UniqueViolation:
        raise ApiError("An account with this email already exists.", 409) from None

    login_user(user_id)
    merge_guest_cart(user_id)
    return jsonify({"user": _public_user(load_current_user())}), 201


@bp.post("/auth/login")
@rate_limit("login", limit=10, window=300)
def login():
    data = json_body()
    address = email(data)
    password = data.get("password") or ""
    user = db.query_one(
        "SELECT id, password_hash, is_active FROM users WHERE email = %s", (address,)
    )
    if not user:
        check_password_hash(_DUMMY_HASH, str(password))
        raise ApiError("Incorrect email or password.", 401)
    if not check_password_hash(user["password_hash"], str(password)):
        raise ApiError("Incorrect email or password.", 401)
    if not user["is_active"]:
        raise ApiError("This account has been deactivated. Please contact support.", 403)

    login_user(user["id"])
    merge_guest_cart(user["id"])
    return jsonify({"user": _public_user(load_current_user())})


@bp.post("/auth/logout")
def logout():
    logout_user()
    return jsonify({"ok": True})


@bp.get("/auth/me")
def me():
    return jsonify({"user": _public_user(load_current_user())})


# ------------------------------------------------------------ profile
@bp.put("/account/profile")
@login_required
def update_profile():
    data = json_body()
    full_name = text(data, "full_name", required=True, max_len=120, label="Full name")
    number = phone(data, required=False)
    db.execute(
        "UPDATE users SET full_name = %s, phone = NULLIF(%s, '') WHERE id = %s",
        (full_name, number, current_user_id()),
    )
    g.pop("user", None)
    return jsonify({"user": _public_user(load_current_user())})


@bp.put("/account/password")
@login_required
@rate_limit("password", limit=10, window=600)
def change_password():
    data = json_body()
    current = str(data.get("current_password") or "")
    new = str(data.get("new_password") or "")
    stored = db.scalar("SELECT password_hash FROM users WHERE id = %s", (current_user_id(),))
    if not check_password_hash(stored, current):
        raise ApiError("Your current password is incorrect.", 400, {"current_password": "Incorrect"})
    _validate_password(new, "new_password")
    user_id = current_user_id()
    db.execute("UPDATE users SET password_hash = %s WHERE id = %s", (generate_password_hash(new), user_id))
    revoke_other_sessions(user_id)  # sign out every other device
    return jsonify({"ok": True})


# ------------------------------------------------------------ addresses
ADDRESS_FIELDS = "id, label, full_name, phone, line1, line2, city, state, postal_code, country, is_default"


def parse_address(data: dict) -> dict:
    postal = text(data, "postal_code", required=True, max_len=12, label="PIN code")
    if not PIN_RE.match(postal):
        raise ApiError("Please enter a valid PIN / postal code.", fields={"postal_code": "Invalid"})
    return {
        "label": text(data, "label", max_len=40, default="Home") or "Home",
        "full_name": text(data, "full_name", required=True, max_len=120, label="Full name"),
        "phone": phone(data),
        "line1": text(data, "line1", required=True, max_len=200, label="Address line 1"),
        "line2": text(data, "line2", max_len=200),
        "city": text(data, "city", required=True, max_len=80, label="City"),
        "state": text(data, "state", required=True, max_len=80, label="State"),
        "postal_code": postal,
        "country": text(data, "country", max_len=60, default="India") or "India",
    }


def save_address(user_id: int, address: dict, make_default: bool) -> dict:
    has_any = db.scalar("SELECT 1 FROM addresses WHERE user_id = %s LIMIT 1", (user_id,))
    is_default = make_default or not has_any
    if is_default:
        db.execute("UPDATE addresses SET is_default = FALSE WHERE user_id = %s", (user_id,))
    return db.query_one(
        f"""
        INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state,
                               postal_code, country, is_default)
        VALUES (%(user_id)s, %(label)s, %(full_name)s, %(phone)s, %(line1)s, %(line2)s, %(city)s,
                %(state)s, %(postal_code)s, %(country)s, %(is_default)s)
        RETURNING {ADDRESS_FIELDS}
        """,
        {**address, "user_id": user_id, "is_default": is_default},
    )


@bp.get("/account/addresses")
@login_required
def list_addresses():
    return jsonify(db.query(
        f"SELECT {ADDRESS_FIELDS} FROM addresses WHERE user_id = %s ORDER BY is_default DESC, id DESC",
        (current_user_id(),),
    ))


@bp.post("/account/addresses")
@login_required
def create_address():
    data = json_body()
    count = db.scalar("SELECT COUNT(*) FROM addresses WHERE user_id = %s", (current_user_id(),))
    if count >= 10:
        raise ApiError("You can save up to 10 addresses.")
    address = save_address(current_user_id(), parse_address(data), bool(data.get("is_default")))
    return jsonify(address), 201


@bp.put("/account/addresses/<int:address_id>")
@login_required
def update_address(address_id: int):
    data = json_body()
    user_id = current_user_id()
    address = parse_address(data)
    if data.get("is_default"):
        db.execute("UPDATE addresses SET is_default = FALSE WHERE user_id = %s", (user_id,))
    row = db.query_one(
        f"""
        UPDATE addresses SET label = %(label)s, full_name = %(full_name)s, phone = %(phone)s,
               line1 = %(line1)s, line2 = %(line2)s, city = %(city)s, state = %(state)s,
               postal_code = %(postal_code)s, country = %(country)s,
               is_default = is_default OR %(make_default)s
         WHERE id = %(id)s AND user_id = %(user_id)s
        RETURNING {ADDRESS_FIELDS}
        """,
        {**address, "id": address_id, "user_id": user_id, "make_default": bool(data.get("is_default"))},
    )
    if not row:
        raise ApiError("Address not found.", 404)
    return jsonify(row)


@bp.delete("/account/addresses/<int:address_id>")
@login_required
def delete_address(address_id: int):
    user_id = current_user_id()
    was_default = db.scalar(
        "DELETE FROM addresses WHERE id = %s AND user_id = %s RETURNING is_default",
        (address_id, user_id),
    )
    if was_default is None:
        raise ApiError("Address not found.", 404)
    if was_default:
        db.execute(
            "UPDATE addresses SET is_default = TRUE WHERE id = "
            "(SELECT id FROM addresses WHERE user_id = %s ORDER BY id DESC LIMIT 1)",
            (user_id,),
        )
    return jsonify({"ok": True})
