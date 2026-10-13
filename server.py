"""VASTRA — entry point.

Development:   python server.py
CLI:           flask --app server init-db | seed-db | create-admin
Production:    gunicorn -w 4 -b 0.0.0.0:8000 "server:app"
"""
import os

from dotenv import load_dotenv

load_dotenv()  # must run before the config module is imported

from backend import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    print(f"VASTRA running at http://{host}:{port}")
    app.run(host=host, port=port, debug=app.config["DEBUG"])
