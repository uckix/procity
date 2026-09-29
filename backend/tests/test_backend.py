"""Backend tests for PROCITY: monitoring, identity stability, API, WebSocket."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import psutil
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from monitor import ProcessMonitor, _identity  # noqa: E402
from gpu_monitor import get_gpu_stats  # noqa: E402


def _snap(mon: ProcessMonitor) -> dict:
    time.sleep(0.05)
    return mon.snapshot()


class TestProcessMonitor:
    def test_snapshot_shape(self):
        mon = ProcessMonitor()
        snap = _snap(mon)
        assert snap["demo"] is False
        assert snap["total_processes"] > 0
        assert len(snap["processes"]) > 0
        sysstats = snap["system"]
        assert 0.0 <= sysstats["cpu_total"] <= 100.0
        assert sysstats["cpu_per_core"], "per-core CPU list should not be empty"
        assert sysstats["ram_total_mb"] > 0
        assert sysstats["uptime_s"] > 0
        assert sysstats["process_count"] == snap["total_processes"]

    def test_process_fields(self):
        snap = _snap(ProcessMonitor())
        p = snap["processes"][0]
        for key in (
            "identity", "pid", "name", "cpu_percent", "mem_bytes",
            "mem_mb", "num_threads", "status", "ppid", "create_time",
        ):
            assert key in p, f"missing field {key}"
        assert p["mem_bytes"] >= 0
        assert p["pid"] >= 1

    def test_identity_is_pid_plus_create_time(self):
        assert _identity(1234, 1727500000.123) == "1234:1727500000"

    def test_identity_stable_across_snapshots(self):
        mon = ProcessMonitor()
        s1 = _snap(mon)
        s2 = _snap(mon)
        ids1 = {p["identity"] for p in s1["processes"]}
        for p in s2["processes"]:
            if p["pid"] in {int(i.split(":")[0]) for i in ids1}:
                assert p["identity"] in ids1, "identity changed while process lived"

    def test_pid_recycling_detection(self):
        mon = ProcessMonitor()
        # A live process must be findable by pid+create_time.
        snap = _snap(mon)
        p = snap["processes"][0]
        found = mon.find_process(p["pid"], create_time=p["create_time"])
        assert found is not None and found["pid"] == p["pid"]
        # Same pid but wrong create_time must be rejected (recycled pid).
        assert mon.find_process(p["pid"], create_time=p["create_time"] - 5000.0) is None

    def test_missing_process_returns_none_or_404(self):
        mon = ProcessMonitor()
        assert mon.find_process(99999999) is None

    def test_truncation_and_limit(self):
        mon = ProcessMonitor(max_processes=5)
        snap = _snap(mon)
        assert snap["truncated"] is True
        assert len(snap["processes"]) == 5
        assert snap["total_processes"] > 5
        assert snap["display_limit"] == 5

    def test_no_truncation_flag_when_under_limit(self):
        mon = ProcessMonitor(max_processes=100000)
        snap = _snap(mon)
        assert snap["truncated"] is False
        assert len(snap["processes"]) == snap["total_processes"]

    def test_vanishing_process_does_not_raise(self, monkeypatch):
        """Processes that die mid-iteration must be skipped, not crash."""
        class Vanishing:
            pid = 424242

            def create_time(self):
                raise psutil.NoSuchProcess(424242)

        def fake_iter(attrs=None):
            return [Vanishing()]

        monkeypatch.setattr(psutil, "process_iter", fake_iter)
        snap = ProcessMonitor().snapshot()
        assert snap["processes"] == []

    def test_access_denied_does_not_raise(self, monkeypatch):
        class Denied:
            pid = 1

            def create_time(self):
                return time.time()

            def oneshot(self):
                return self

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def cpu_percent(self, interval=None):
                raise psutil.AccessDenied(1)

            def name(self):
                raise psutil.AccessDenied(1)

            def ppid(self):
                raise psutil.AccessDenied(1)

            def status(self):
                raise psutil.AccessDenied(1)

            def cmdline(self):
                raise psutil.AccessDenied(1)

            def username(self):
                raise psutil.AccessDenied(1)

            def uids(self):
                raise psutil.AccessDenied(1)

            def num_threads(self):
                raise psutil.AccessDenied(1)

            def memory_info(self):
                raise psutil.AccessDenied(1)

            def memory_percent(self):
                raise psutil.AccessDenied(1)

        monkeypatch.setattr(psutil, "process_iter", lambda attrs=None: [Denied()])
        snap = ProcessMonitor().snapshot()
        assert snap["processes"][0]["name"] == "unknown"
        assert snap["processes"][0]["cpu_percent"] == 0.0

    def test_demo_mode_snapshot(self):
        mon = ProcessMonitor(demo=True)
        snap = mon.snapshot()
        assert snap["demo"] is True
        assert len(snap["processes"]) > 0
        # demo evolves over ticks
        ids_a = {p["identity"] for p in snap["processes"]}
        time.sleep(0.05)
        mon.snapshot()
        assert snap["system"]["process_count"] > 0


class TestGpuMonitor:
    def test_never_raises(self):
        stats = get_gpu_stats()
        if stats is not None:
            for key in ("utilization", "mem_used_mb", "mem_total_mb", "temperature_c", "power_w"):
                assert key in stats

    def test_amd_sysfs_parsing(self, tmp_path, monkeypatch):
        from gpu_monitor import _via_amd_sysfs
        card = tmp_path / "card0"
        dev = card / "device"
        dev.mkdir(parents=True)
        (dev / "gpu_busy_percent").write_text("42\n")
        (dev / "mem_info_vram_used").write_text(str(512 * 1024 * 1024) + "\n")
        (dev / "mem_info_vram_total").write_text(str(4096 * 1024 * 1024) + "\n")
        hwmon = dev / "hwmon" / "hwmon0"
        hwmon.mkdir(parents=True)
        (hwmon / "temp1_input").write_text("55000\n")
        (hwmon / "power1_average").write_text("25000000\n")

        monkeypatch.setattr("gpu_monitor.glob.glob", lambda pat: [str(hwmon)] if "hwmon" in pat else [str(card)] if "card" in pat else [])
        stats = _via_amd_sysfs()
        assert stats is not None
        assert stats["utilization"] == 42.0
        assert stats["mem_used_mb"] == 512.0
        assert stats["mem_total_mb"] == 4096.0
        assert stats["temperature_c"] == 55.0
        assert stats["power_w"] == 25.0
        assert "AMD" in stats["name"]

    def test_intel_sysfs_parsing(self, tmp_path, monkeypatch):
        from gpu_monitor import _via_intel_sysfs
        card = tmp_path / "card0"
        card.mkdir(parents=True)
        (card / "gt_act_freq_mhz").write_text("450\n")
        (card / "gt_max_freq_mhz").write_text("900\n")
        monkeypatch.setattr("gpu_monitor.glob.glob", lambda pat: [str(card)] if "card" in pat else [])
        stats = _via_intel_sysfs()
        assert stats is not None
        assert stats["utilization"] == 50.0
        assert "Intel" in stats["name"]



class TestApi:
    @pytest.fixture()
    def client(self):
        from fastapi.testclient import TestClient
        import main as main_mod

        main_mod.monitor = ProcessMonitor(max_processes=10000)
        with TestClient(main_mod.app) as c:
            yield c

    def test_health(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_snapshot_endpoint(self, client):
        r = client.get("/api/snapshot")
        assert r.status_code == 200
        body = r.json()
        assert body["total_processes"] > 0
        assert len(body["processes"]) > 0
        assert 0.0 <= body["system"]["cpu_total"] <= 100.0

    def test_processes_endpoint(self, client):
        r = client.get("/api/processes")
        assert r.status_code == 200
        body = r.json()
        assert {"processes", "truncated", "total_processes"} <= set(body)

    def test_process_detail_ok(self, client):
        snap = client.get("/api/snapshot").json()
        p = snap["processes"][0]
        r = client.get(f"/api/processes/{p['pid']}", params={"create_time": p["create_time"]})
        assert r.status_code == 200
        assert r.json()["pid"] == p["pid"]

    def test_process_detail_recycled_pid(self, client):
        snap = client.get("/api/snapshot").json()
        p = snap["processes"][0]
        r = client.get(f"/api/processes/{p['pid']}", params={"create_time": 12345.0})
        assert r.status_code == 404

    def test_process_detail_not_found(self, client):
        assert client.get("/api/processes/99999999").status_code == 404

    def test_process_detail_invalid_pid(self, client):
        assert client.get("/api/processes/abc").status_code == 422
        assert client.get("/api/processes/0").status_code == 422

    def test_websocket_delivers_snapshots(self, client):
        with client.websocket_connect("/ws") as ws:
            data = ws.receive_json()
            assert data["total_processes"] > 0
            assert len(data["processes"]) > 0
            data2 = ws.receive_json()
            assert data2["ts"] >= data["ts"]

    def test_websocket_reconnect(self, client):
        # One client disconnects, a new one connects and keeps receiving data.
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
        with client.websocket_connect("/ws") as ws2:
            assert len(ws2.receive_json()["processes"]) > 0

    def test_websocket_rejects_foreign_origin(self, client):
        from starlette.websockets import WebSocketDisconnect

        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws", headers={"origin": "https://evil.example"}) as ws:
                ws.receive_json()

    def test_websocket_accepts_own_origin(self, client):
        import main as main_mod

        origin = f"http://127.0.0.1:{main_mod.PORT}"
        with client.websocket_connect("/ws", headers={"origin": origin}) as ws:
            assert len(ws.receive_json()["processes"]) > 0

    def test_rejects_foreign_host_header(self, client):
        # DNS-rebinding protection: a page on attacker.example resolving to 127.0.0.1.
        assert client.get("/api/snapshot", headers={"host": "attacker.example"}).status_code == 400


class TestDetailCpu:
    def test_detail_reports_real_cpu_for_busy_process(self):
        """Regression: sampling inside oneshot() always returned 0%."""
        import subprocess

        busy = subprocess.Popen([sys.executable, "-c", "while True: pass"])
        try:
            time.sleep(0.3)
            info = ProcessMonitor().find_process(busy.pid)
            assert info is not None and info["cpu_percent"] > 20.0
        finally:
            busy.kill()
            busy.wait()


def test_uvicorn_has_websocket_library():
    """Regression: without websockets/wsproto, uvicorn 404s /ws and the UI falls back to demo data."""
    import importlib.util

    assert importlib.util.find_spec("websockets") or importlib.util.find_spec("wsproto")
