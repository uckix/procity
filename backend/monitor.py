"""Live process monitoring for PROCITY.

Collects per-process and system-wide statistics using psutil, without root
privileges and without touching process memory or internals. Handles the usual
psutil error races (NoSuchProcess, ZombieProcess, AccessDenied) gracefully.

Identity: "<pid>:<create_time>" — stable while the process lives and immune to
PID recycling once a process exits.
"""
from __future__ import annotations

import math
import os
import random
import threading
import time
from typing import List, Optional

import psutil

from gpu_monitor import get_gpu_stats


def _identity(pid: int, create_time: float) -> str:
    return f"{pid}:{int(create_time)}"


class ProcessMonitor:
    """Produces one Snapshot dict per call. Thread-safe."""

    def __init__(
        self,
        interval: float = 1.0,
        max_processes: Optional[int] = None,
        demo: bool = False,
    ):
        self.interval = max(0.25, float(interval))
        self.max_processes = int(
            max_processes or os.environ.get("PROCITY_MAX", "1000")
        )
        self.demo = bool(demo)
        self._lock = threading.Lock()
        self._demo = _DemoCity(max_processes=self.max_processes) if demo else None
        if not demo:
            self._prime()

    # ------------------------------------------------------------------ #
    def _prime(self) -> None:
        """Prime psutil CPU samplers so the first snapshot is not bogus."""
        try:
            psutil.cpu_percent(interval=None)
            psutil.cpu_percent(interval=None, percpu=True)
        except Exception:
            pass
        try:
            for proc in psutil.process_iter():
                try:
                    proc.cpu_percent(interval=None)
                except psutil.Error:
                    continue
        except Exception:
            pass

    # ------------------------------------------------------------------ #
    def snapshot(self) -> dict:
        with self._lock:
            if self.demo and self._demo is not None:
                return self._demo.tick()
            return self._snapshot_live()

    def find_process(self, pid: int, create_time: Optional[float] = None) -> Optional[dict]:
        """Return a fresh detail dict for one PID, or None.

        If create_time is given and does not match the live process, the PID
        was recycled and None is returned.
        """
        with self._lock:
            if self.demo and self._demo is not None:
                return self._demo.find(pid, create_time)
        try:
            proc = psutil.Process(pid)
            ct = proc.create_time()
            if create_time is not None and abs(ct - create_time) > 1.0:
                return None
            return self._collect_one(proc, cpu_interval=0.15)
        except psutil.Error:
            return None

    # ------------------------------------------------------------------ #
    def _snapshot_live(self) -> dict:
        processes: List[dict] = []
        for proc in psutil.process_iter():
            info = self._collect_one(proc, cpu_interval=None)
            if info is not None:
                processes.append(info)

        total = len(processes)
        truncated = total > self.max_processes
        if truncated:
            # Keep the most resource-intensive processes.
            processes.sort(key=lambda p: (p["cpu_percent"], p["mem_bytes"]), reverse=True)
            processes = processes[: self.max_processes]

        processes.sort(key=lambda p: p["mem_bytes"], reverse=True)
        return self._make_snapshot(processes, total, truncated, demo=False)

    def _collect_one(self, proc: psutil.Process, cpu_interval: Optional[float]) -> Optional[dict]:
        pid = proc.pid
        try:
            create_time = float(proc.create_time())
        except (psutil.NoSuchProcess, psutil.ZombieProcess, psutil.AccessDenied, OSError):
            return None

        info = {
            "identity": _identity(pid, create_time),
            "pid": pid,
            "ppid": 0,
            "name": "unknown",
            "username": None,
            "uid": None,
            "cmdline": None,
            "cpu_percent": 0.0,
            "mem_bytes": 0,
            "mem_mb": 0.0,
            "mem_percent": 0.0,
            "num_threads": None,
            "status": "unknown",
            "create_time": create_time,
        }
        if cpu_interval is not None:
            # A blocking sample must run outside oneshot(): oneshot caches
            # /proc/<pid>/stat, so both reads would be identical and yield 0%.
            try:
                info["cpu_percent"] = min(float(proc.cpu_percent(interval=cpu_interval)), 8000.0)
            except (psutil.Error, OSError):
                pass
        try:
            with proc.oneshot():
                if cpu_interval is None:
                    try:
                        info["cpu_percent"] = min(float(proc.cpu_percent(interval=None)), 8000.0)
                    except (psutil.Error, OSError):
                        pass
                try:
                    info["name"] = proc.name()
                except (psutil.Error, OSError):
                    pass
                try:
                    info["ppid"] = proc.ppid()
                except (psutil.Error, OSError):
                    pass
                try:
                    info["status"] = proc.status()
                except (psutil.Error, OSError):
                    pass
                try:
                    info["cmdline"] = proc.cmdline() or None
                except (psutil.Error, OSError):
                    pass
                try:
                    info["username"] = proc.username()
                except (psutil.Error, OSError):
                    pass
                try:
                    info["uid"] = proc.uids().real
                except (psutil.Error, OSError):
                    pass
                try:
                    info["num_threads"] = proc.num_threads()
                except (psutil.Error, OSError):
                    pass
                try:
                    rss = proc.memory_info().rss
                    info["mem_bytes"] = int(rss)
                    info["mem_mb"] = round(rss / (1024 * 1024), 2)
                except (psutil.Error, OSError):
                    pass
                try:
                    info["mem_percent"] = round(float(proc.memory_percent()), 3)
                except (psutil.Error, OSError, ZeroDivisionError):
                    pass
        except (psutil.NoSuchProcess, psutil.ZombieProcess, psutil.AccessDenied, OSError):
            # Process vanished mid-collection; keep whatever we already have.
            pass
        return info

    # ------------------------------------------------------------------ #
    def _system_stats(self, process_count: int) -> dict:
        cpu_total = psutil.cpu_percent(interval=None)
        try:
            per_core = [round(c, 2) for c in psutil.cpu_percent(interval=None, percpu=True)]
        except Exception:
            per_core = []
        vm = psutil.virtual_memory()
        sm = psutil.swap_memory()
        try:
            uptime = time.time() - psutil.boot_time()
        except Exception:
            uptime = 0.0
        gpu = get_gpu_stats()
        return {
            "cpu_total": round(float(cpu_total), 2),
            "cpu_per_core": per_core,
            "ram_total_mb": round(vm.total / (1024 * 1024), 1),
            "ram_used_mb": round(vm.used / (1024 * 1024), 1),
            "ram_available_mb": round(vm.available / (1024 * 1024), 1),
            "ram_percent": round(vm.percent, 1),
            "swap_total_mb": round(sm.total / (1024 * 1024), 1),
            "swap_used_mb": round(sm.used / (1024 * 1024), 1),
            "process_count": process_count,
            "uptime_s": round(uptime, 1),
            "gpu": gpu,
        }

    def _make_snapshot(
        self,
        processes: List[dict],
        total: int,
        truncated: bool,
        demo: bool,
        system: Optional[dict] = None,
    ) -> dict:
        if system is None:
            try:
                system = self._system_stats(total)
            except Exception:
                system = {}
        return {
            "ts": time.time(),
            "demo": demo,
            "truncated": truncated,
            "total_processes": total,
            "display_limit": self.max_processes,
            "interval_s": self.interval,
            "system": system,
            "processes": processes,
        }


# ---------------------------------------------------------------------- #
class _DemoCity:
    """Synthetic data source for Demo Mode (backend --demo / PROCITY_DEMO=1)."""

    NAMES = [
        "systemd", "hyprland", "waybar", "alacritty", "kitty", "firefox",
        "firefox-bin", "Web Content", "node", "v8", "python3", "uvicorn",
        "dunst", "pipewire", "wireplumber", "polkitd", "dbus-daemon",
        "NetworkManager", "sshd", "systemd-journal", "systemd-logind",
        "systemd-udevd", "wpa_supplicant", "clatd", "bluetoothd", "gvfsd",
        "gvfsd-fuse", "at-spi-bus-launcher", "xdg-desktop-portal",
        "xdg-desktop-portal-hyprland", "rtkit-daemon", "upowerd", "journald",
        "kwin_wayland", "swayidle", "swaylock", "mpv", "grim", "slurp",
        "wl-copy", "fish", "bash", "zsh", "nvim", "vim", "git", "curl",
        "clang", "rust-analyzer", "cargo", "make", "gcc", "ld.gold",
        "opencode", "claude", "steam", "gamescope", "pulseaudio",
    ]

    RAM_TOTAL_MB = 16384.0

    def __init__(self, max_processes: int = 260):
        self.max_processes = max_processes
        self.next_pid = 1000
        self.procs: dict[str, dict] = {}
        self.t = 0.0
        for _ in range(240):
            self._spawn()

    def _spawn(self) -> None:
        pid = self.next_pid
        self.next_pid += random.randint(1, 7)
        name = random.choice(self.NAMES)
        create_time = time.time() - random.uniform(0, 3600)
        identity = _identity(pid, create_time)
        uid = random.choice([0, 1000, 1000, 1000, 33, 65534])
        p = {
            "identity": identity,
            "pid": pid,
            "ppid": random.choice([1, 2, 1000, pid - 1]),
            "name": name,
            "username": {0: "root", 1000: "demo", 33: "www-data", 65534: "nobody"}.get(uid, "user"),
            "uid": uid,
            "cmdline": [f"/usr/bin/{name}", "--demo-flag"] if random.random() > 0.2 else None,
            "cpu_percent": 0.0,
            # Log-normal: most processes are a few MB, a handful take hundreds.
            "mem_bytes": int(random.lognormvariate(math.log(8), 1.4) * 1024 * 1024),
            "mem_mb": 0.0,
            "mem_percent": 0.0,
            "num_threads": max(1, int(random.expovariate(0.1))),
            "status": random.choice(["running", "running", "sleeping", "sleeping", "idle"]),
            "create_time": create_time,
        }
        p["mem_mb"] = round(p["mem_bytes"] / (1024 * 1024), 2)
        p["mem_percent"] = round(min(p["mem_mb"] / self.RAM_TOTAL_MB * 100.0, 100.0), 3)
        # Mostly idle, a few busy: each process fluctuates around its own base load.
        p["_base_cpu"] = random.choice([0.0] * 20 + [0.2, 0.5, 1.0, 2.0, 4.0, 8.0, 30.0])
        p["cpu_percent"] = p["_base_cpu"]
        p["_base_mem"] = p["mem_bytes"]
        self.procs[identity] = p

    def tick(self) -> dict:
        self.t += 1.0
        # Fluctuate resource usage.
        for p in self.procs.values():
            base = p["_base_cpu"]
            p["cpu_percent"] = round(max(0.0, min(base + random.gauss(0, base * 0.35 + 0.1), 120.0)), 1)
            p["mem_bytes"] = max(1024, int(p["_base_mem"] * random.uniform(0.94, 1.06)))
            p["mem_mb"] = round(p["mem_bytes"] / (1024 * 1024), 2)
            p["mem_percent"] = round(min(p["mem_mb"] / self.RAM_TOTAL_MB * 100.0, 100.0), 3)
        # Spawn / terminate a few processes.
        for _ in range(random.randint(0, 2)):
            self._spawn()
        for _ in range(random.randint(0, 2)):
            if len(self.procs) > 40:
                self.procs.pop(random.choice(list(self.procs.keys())))

        procs = sorted(
            ({k: v for k, v in p.items() if not k.startswith("_")} for p in self.procs.values()),
            key=lambda p: p["mem_bytes"],
            reverse=True,
        )
        total = len(procs)
        truncated = total > self.max_processes
        if truncated:
            procs = procs[: self.max_processes]
        cores = [max(0.0, min(100.0, 18 + random.gauss(0, 12))) for _ in range(16)]
        ram_used = round(min(sum(p["mem_mb"] for p in self.procs.values()) + 1800, self.RAM_TOTAL_MB * 0.93), 1)
        system = {
            "cpu_total": round(sum(cores) / len(cores), 2),
            "cpu_per_core": [round(c, 2) for c in cores],
            "ram_total_mb": self.RAM_TOTAL_MB,
            "ram_used_mb": ram_used,
            "ram_available_mb": round(self.RAM_TOTAL_MB - ram_used, 1),
            "ram_percent": round(ram_used / self.RAM_TOTAL_MB * 100.0, 1),
            "swap_total_mb": 4096,
            "swap_used_mb": 312,
            "process_count": total,
            "uptime_s": 3600 * 27 + random.randint(0, 3599),
            "gpu": None,
        }
        return {
            "ts": time.time(),
            "demo": True,
            "truncated": truncated,
            "total_processes": total,
            "display_limit": self.max_processes,
            "interval_s": 1.0,
            "system": system,
            "processes": procs,
        }

    def find(self, pid: int, create_time: Optional[float]) -> Optional[dict]:
        for p in self.procs.values():
            if p["pid"] == pid:
                if create_time is not None and abs(p["create_time"] - create_time) > 1.0:
                    return None
                return {k: v for k, v in p.items() if not k.startswith("_")}
        return None
