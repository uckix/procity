"""PROCity backend — FastAPI REST + WebSocket server bound to localhost.

Run (from backend/):  python -m uvicorn main:app --host 127.0.0.1 --port 8901
Environment:
  PROCITY_PORT     default 8901
  PROCITY_INTERVAL monitoring interval seconds, default 1.0
  PROCITY_MAX      max buildings shown, default 1000
  PROCITY_DEMO     "1" to serve synthetic demo data
"""
from __future__ import annotations

import asyncio
import contextlib
import os
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
import uvicorn

from monitor import ProcessMonitor
from models import ProcessInfo, Snapshot

DEMO = os.environ.get("PROCITY_DEMO", "0") == "1"
PORT = int(os.environ.get("PROCITY_PORT", "8901"))
INTERVAL = float(os.environ.get("PROCITY_INTERVAL", "1.0"))
MAX_PROC = int(os.environ.get("PROCITY_MAX", "1000"))

# Browsers let any web page open a WebSocket to localhost (CORS does not apply),
# so only our own UI (served here, or the Vite dev server) may stream data.
ALLOWED_ORIGINS = {
    f"http://127.0.0.1:{PORT}",
    f"http://localhost:{PORT}",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
}

monitor = ProcessMonitor(interval=INTERVAL, max_processes=MAX_PROC, demo=DEMO)


class _Latest:
    """The most recent snapshot, shared by every client (one sampler for all)."""

    snap: Optional[dict] = None
    version = 0
    clients = 0
    last_demand = 0.0
    cond: Optional[asyncio.Condition] = None


def _publish(snap: dict) -> None:
    _Latest.snap = snap
    _Latest.version += 1


async def _sampler() -> None:
    """Sample once per interval while anyone is watching; broadcast to all."""
    with contextlib.suppress(Exception):
        await asyncio.to_thread(monitor.snapshot)  # warm-up: CPU deltas need a baseline
    while True:
        await asyncio.sleep(monitor.interval)
        if _Latest.clients or time.monotonic() - _Latest.last_demand < 5.0:
            try:
                snap = await asyncio.to_thread(monitor.snapshot)
                async with _Latest.cond:
                    _publish(snap)
                    _Latest.cond.notify_all()
            except Exception:
                pass


async def _current_snapshot() -> dict:
    _Latest.last_demand = time.monotonic()
    snap = _Latest.snap
    if snap is None or time.time() - snap["ts"] > 2 * monitor.interval + 1:
        snap = await asyncio.to_thread(monitor.snapshot)
        _publish(snap)
    return snap


@contextlib.asynccontextmanager
async def _lifespan(_app: FastAPI):
    _Latest.snap, _Latest.version, _Latest.clients = None, 0, 0
    _Latest.cond = asyncio.Condition()
    task = asyncio.create_task(_sampler())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        if _Latest.cond is not None:
            async with _Latest.cond:
                _Latest.cond.notify_all()



app = FastAPI(title="PROCity API", docs_url=None, redoc_url=None, lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
# Rejects DNS-rebinding requests (a foreign hostname resolving to 127.0.0.1).
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "demo": monitor.demo, "version": "1.0.0"}


@app.get("/api/snapshot", response_model=Snapshot)
async def snapshot() -> dict:
    return await _current_snapshot()


@app.get("/api/processes")
async def processes() -> dict:
    snap = await _current_snapshot()
    return {
        "processes": snap["processes"],
        "truncated": snap["truncated"],
        "total_processes": snap["total_processes"],
        "display_limit": snap["display_limit"],
        "demo": snap["demo"],
    }


@app.get("/api/processes/{pid}", response_model=ProcessInfo)
async def process_detail(
    pid: int,
    create_time: Optional[float] = Query(default=None, ge=0.0),
) -> dict:
    if pid < 1:
        raise HTTPException(status_code=422, detail="pid out of range")
    info = await asyncio.to_thread(monitor.find_process, pid, create_time)
    if info is None:
        raise HTTPException(status_code=404, detail="process not found (exited or pid recycled)")
    return info


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    origin = ws.headers.get("origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return
    await ws.accept()
    _Latest.clients += 1
    try:
        await ws.send_json(await _current_snapshot())
        seen = _Latest.version
        while True:
            async with _Latest.cond:
                await _Latest.cond.wait_for(lambda: _Latest.version != seen)
                snap, seen = _Latest.snap, _Latest.version
            await ws.send_json(snap)
    except Exception:
        # Client went away (disconnect / send on closed socket): just stop.
        return
    finally:
        _Latest.clients -= 1


# Serve the built frontend (production mode) if present.
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if (_DIST / "index.html").is_file():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="app")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="PROCity backend: live 3D Linux process visualizer.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    parser.add_argument("--port", "-p", type=int, default=PORT, help=f"Port to bind to (default: {PORT})")
    parser.add_argument("--interval", "-i", type=float, default=INTERVAL, help=f"Monitoring interval in seconds (default: {INTERVAL})")
    parser.add_argument("--max", "-m", type=int, default=MAX_PROC, help=f"Max processes to track (default: {MAX_PROC})")
    parser.add_argument("--demo", action="store_true", default=DEMO, help="Serve synthetic demo data")
    args = parser.parse_args()

    if args.demo != monitor.demo or args.interval != monitor.interval or args.max != monitor.max_processes:
        monitor = ProcessMonitor(interval=args.interval, max_processes=args.max, demo=args.demo)
    ALLOWED_ORIGINS.add(f"http://{args.host}:{args.port}")
    ALLOWED_ORIGINS.add(f"http://127.0.0.1:{args.port}")
    ALLOWED_ORIGINS.add(f"http://localhost:{args.port}")

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")

