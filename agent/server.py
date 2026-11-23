"""Serves the dashboard and the agent API.

    pip install -r agent/requirements.txt
    python agent/train.py
    python agent/server.py        # http://localhost:3000
Optional: export ANTHROPIC_API_KEY=... for Claude-written summaries and chat.
"""
import json
import os
import sys

from flask import Flask, jsonify, request, send_from_directory

sys.path.insert(0, os.path.dirname(__file__))
from agent import DiamondAgent  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
app = Flask(__name__, static_folder=None)
_cache = {}


def load_base():
    return json.load(open(os.path.join(ROOT, "diamonds.json"), encoding="utf-8"))["questions"]


def get_agent(extra=None):
    """Train (or reuse) an agent for base dataset + any user-added questions."""
    qs = load_base() + [q for q in (extra or []) if q.get("question") and q.get("answer")]
    probe = DiamondAgent(qs)
    if probe.fingerprint not in _cache:
        _cache.clear()
        try:
            probe.train()
        except ValueError as e:
            return None, str(e)
        probe._report = probe.report()
        _cache[probe.fingerprint] = probe
    return _cache[probe.fingerprint], None


def _extra():
    return (request.get_json(silent=True) or {}).get("questions", [])


@app.post("/api/agent/analyze")
def analyze():
    agent, err = get_agent(_extra())
    return (jsonify(error=err), 400) if err else jsonify(agent._report)


@app.post("/api/agent/chat")
def chat():
    body = request.get_json(silent=True) or {}
    msg = (body.get("message") or "").strip()
    if not msg:
        return jsonify(error="message required"), 400
    agent, err = get_agent(body.get("questions"))
    return (jsonify(error=err), 400) if err else jsonify(agent.chat(msg))


@app.post("/api/agent/classify")
def classify():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify(error="text required"), 400
    agent, err = get_agent(body.get("questions"))
    return (jsonify(error=err), 400) if err else jsonify(agent.classify(text))


@app.get("/api/agent/status")
def status():
    return jsonify(ok=True, llm=DiamondAgent.llm_available())


@app.get("/agent/analysis.json")
def static_analysis():
    return send_from_directory(os.path.dirname(__file__), "analysis.json")


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:p>")
def static_files(p):
    return send_from_directory(ROOT, p)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 3000)), debug=False)
