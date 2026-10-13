"""VASTRA application factory."""
from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import psycopg2
from flask import Blueprint, Flask, jsonify, request, send_from_directory
from flask.json.provider import DefaultJSONProvider
from werkzeug.exceptions import HTTPException

from . import cli, db, security
from .config import Config
from .utils import ApiError

log = logging.getLogger(__name__)


class JSONProvider(DefaultJSONProvider):
    sort_keys = False

    @staticmethod
    def default(o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, date):
            return o.isoformat()
        if isinstance(o, UUID):
            return str(o)
        return DefaultJSONProvider.default(o)


def create_app(config: type[Config] = Config) -> Flask:
    frontend = str(config.FRONTEND_DIR)
    app = Flask(__name__, static_folder=frontend, static_url_path="")
    app.config.from_object(config)
    if not app.config["SECRET_KEY"] or (
        app.config["ENV"] == "production" and app.config["SECRET_KEY"] == "dev-only-insecure-key"
    ):
        raise RuntimeError("Set a strong SECRET_KEY environment variable before running in production.")
    app.json = JSONProvider(app)

    security.init_app(app)
    db.init_app(app)  # registered last so its commit hook runs first
    cli.init_app(app)

    from .api import admin, auth, cart, catalog, misc, orders

    api = Blueprint("api", __name__, url_prefix="/api")
    for module in (catalog, auth, cart, orders, misc):
        api.register_blueprint(module.bp)
    api.register_blueprint(admin.bp)
    app.register_blueprint(api)

    # ---------------- errors
    @app.errorhandler(ApiError)
    def handle_api_error(err: ApiError):
        db.mark_failed()
        return jsonify({"error": err.message, "fields": err.fields}), err.status

    @app.errorhandler(psycopg2.OperationalError)
    def handle_db_down(err):
        db.mark_failed()
        log.exception("Database unavailable")
        return jsonify({"error": "Our store is briefly unavailable. Please try again shortly."}), 503

    @app.errorhandler(HTTPException)
    def handle_http(err: HTTPException):
        db.mark_failed()
        if request.path.startswith("/api/"):
            return jsonify({"error": err.description or err.name}), err.code
        if err.code == 404:
            return send_from_directory(frontend, "404.html"), 404
        return err

    @app.errorhandler(Exception)
    def handle_unexpected(err: Exception):
        db.mark_failed()
        log.exception("Unhandled error")
        if request.path.startswith("/api/"):
            return jsonify({"error": "Something went wrong on our side. Please try again."}), 500
        return "Internal server error", 500

    # ---------------- pages
    @app.get("/")
    def index():
        return send_from_directory(frontend, "index.html")

    @app.get("/admin")
    def admin_page():
        return send_from_directory(frontend, "admin.html")

    return app
