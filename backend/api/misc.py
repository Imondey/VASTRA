"""Newsletter sign-ups, contact form and health check."""
from __future__ import annotations

from flask import Blueprint, jsonify

from .. import db
from ..security import rate_limit
from ..utils import email, json_body, text

bp = Blueprint("misc", __name__)


@bp.get("/health")
def health():
    db.scalar("SELECT 1")
    return jsonify({"status": "ok"})


@bp.post("/newsletter")
@rate_limit("newsletter", limit=5, window=600)
def subscribe():
    address = email(json_body())
    db.execute(
        "INSERT INTO newsletter_subscribers (email) VALUES (%s) ON CONFLICT (email) DO NOTHING",
        (address,),
    )
    return jsonify({"ok": True, "message": "Welcome to the VASTRA list."}), 201


@bp.post("/contact")
@rate_limit("contact", limit=5, window=600)
def contact():
    data = json_body()
    db.execute(
        "INSERT INTO contact_messages (name, email, subject, message) VALUES (%s, %s, %s, %s)",
        (
            text(data, "name", required=True, max_len=120, label="Name"),
            email(data),
            text(data, "subject", max_len=160),
            text(data, "message", required=True, max_len=4000, label="Message"),
        ),
    )
    return jsonify({"ok": True, "message": "Thank you — our concierge will reply within 24 hours."}), 201
