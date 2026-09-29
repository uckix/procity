"""Linux GPU statistics with graceful multi-vendor fallback.

Tries, in order:
  1. NVIDIA pynvml (nvidia-ml-py package)
  2. `nvidia-smi` CLI parsing
  3. AMD DRM sysfs (/sys/class/drm/card*/device/gpu_busy_percent)
  4. Intel DRM sysfs (/sys/class/drm/card*/gt_act_freq_mhz)
  5. Returns None (no GPU data) without ever raising to the caller.
"""
from __future__ import annotations

import glob
import os
import threading
import time
from typing import Optional

_lock = threading.Lock()
_cache: tuple[float, Optional[dict]] = (0.0, None)
_CACHE_TTL = 2.0
_MISS_TTL = 30.0


def _via_pynvml() -> Optional[dict]:
    try:
        import pynvml  # type: ignore

        pynvml.nvmlInit()
        try:
            if pynvml.nvmlDeviceGetCount() < 1:
                return None
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            try:
                power = float(pynvml.nvmlDeviceGetPowerUsage(handle)) / 1000.0
            except Exception:
                power = 0.0
            try:
                name = pynvml.nvmlDeviceGetName(handle)
                name = name.decode() if isinstance(name, bytes) else str(name)
            except Exception:
                name = ""
            return {
                "utilization": float(util.gpu),
                "mem_used_mb": mem.used / (1024 * 1024),
                "mem_total_mb": mem.total / (1024 * 1024),
                "temperature_c": float(temp),
                "power_w": power,
                "name": name,
            }
        finally:
            pynvml.nvmlShutdown()
    except Exception:
        return None


def _via_nvidia_smi() -> Optional[dict]:
    import subprocess

    try:
        out = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,memory.used,memory.total,"
                "temperature.gpu,power.draw",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if out.returncode != 0 or not out.stdout.strip():
            return None
        parts = [p.strip() for p in out.stdout.strip().splitlines()[0].split(",")]
        if len(parts) < 6:
            return None

        def _f(i: int) -> float:
            try:
                return float(parts[i])
            except ValueError:
                return 0.0

        return {
            "utilization": _f(1),
            "mem_used_mb": _f(2),
            "mem_total_mb": _f(3),
            "temperature_c": _f(4),
            "power_w": _f(5),
            "name": parts[0],
        }
    except Exception:
        return None


def _via_amd_sysfs() -> Optional[dict]:
    """Parse AMD GPU stats from Linux DRM sysfs."""
    try:
        for card in sorted(glob.glob("/sys/class/drm/card[0-9]*")):
            dev = os.path.join(card, "device")
            busy_file = os.path.join(dev, "gpu_busy_percent")
            if not os.path.exists(busy_file):
                continue
            with open(busy_file) as f:
                util = float(f.read().strip())

            vram_used = 0.0
            vram_total = 0.0
            used_file = os.path.join(dev, "mem_info_vram_used")
            total_file = os.path.join(dev, "mem_info_vram_total")
            if os.path.exists(used_file) and os.path.exists(total_file):
                try:
                    with open(used_file) as f1, open(total_file) as f2:
                        vram_used = float(f1.read().strip()) / (1024 * 1024)
                        vram_total = float(f2.read().strip()) / (1024 * 1024)
                except Exception:
                    pass

            temp = 0.0
            power = 0.0
            for hw in glob.glob(os.path.join(dev, "hwmon", "hwmon*")):
                temp_file = os.path.join(hw, "temp1_input")
                if os.path.exists(temp_file):
                    try:
                        with open(temp_file) as f:
                            temp = float(f.read().strip()) / 1000.0
                    except Exception:
                        pass
                power_file = os.path.join(hw, "power1_average")
                if os.path.exists(power_file):
                    try:
                        with open(power_file) as f:
                            power = float(f.read().strip()) / 1000000.0
                    except Exception:
                        pass

            return {
                "utilization": min(100.0, max(0.0, util)),
                "mem_used_mb": round(vram_used, 1),
                "mem_total_mb": round(vram_total, 1),
                "temperature_c": round(temp, 1),
                "power_w": round(power, 1),
                "name": "AMD Radeon Graphics",
            }
    except Exception:
        pass
    return None


def _via_intel_sysfs() -> Optional[dict]:
    """Parse Intel GPU stats from Linux DRM sysfs."""
    try:
        for card in sorted(glob.glob("/sys/class/drm/card[0-9]*")):
            act_file = os.path.join(card, "gt_act_freq_mhz")
            max_file = os.path.join(card, "gt_max_freq_mhz")
            if not (os.path.exists(act_file) and os.path.exists(max_file)):
                act_file = os.path.join(card, "gt", "gt0", "rps_act_freq_mhz")
                max_file = os.path.join(card, "gt", "gt0", "rps_max_freq_mhz")
            if not (os.path.exists(act_file) and os.path.exists(max_file)):
                continue

            with open(act_file) as f1, open(max_file) as f2:
                act = float(f1.read().strip())
                max_f = float(f2.read().strip())
            util = round(min(100.0, max(0.0, (act / max_f) * 100.0 if max_f > 0 else 0.0)), 1)

            # Try to get temperature from coretemp or hwmon
            temp = 0.0
            for hw in glob.glob("/sys/class/hwmon/hwmon*"):
                try:
                    name_p = os.path.join(hw, "name")
                    if os.path.exists(name_p):
                        with open(name_p) as fn:
                            hname = fn.read().strip()
                        if hname in ("coretemp", "i915", "xe"):
                            tfile = os.path.join(hw, "temp1_input")
                            if os.path.exists(tfile):
                                with open(tfile) as ft:
                                    temp = float(ft.read().strip()) / 1000.0
                                    break
                except Exception:
                    pass

            return {
                "utilization": util,
                "mem_used_mb": 0.0,
                "mem_total_mb": 0.0,
                "temperature_c": round(temp, 1),
                "power_w": 0.0,
                "name": "Intel Graphics",
            }
    except Exception:
        pass
    return None


def get_gpu_stats() -> Optional[dict]:
    """Return GPU stats dict or None. Cached for _CACHE_TTL seconds. Never raises."""
    global _cache
    now = time.monotonic()
    with _lock:
        ts, cached = _cache
        # No GPU found: back off instead of re-probing every tick.
        ttl = _CACHE_TTL if cached is not None else _MISS_TTL
        if ts and now - ts < ttl:
            return cached
    stats = _via_pynvml() or _via_nvidia_smi() or _via_amd_sysfs() or _via_intel_sysfs()
    with _lock:
        _cache = (now, stats)
    return stats

