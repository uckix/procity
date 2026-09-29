"""Data models shared across the PROCITY backend."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ProcessInfo(BaseModel):
    """A single running process as exposed to the frontend."""

    identity: str = Field(description="Stable identity: '<pid>:<create_time>'")
    pid: int
    ppid: int = 0
    name: str = "unknown"
    username: Optional[str] = None
    uid: Optional[int] = None
    cmdline: Optional[List[str]] = None
    cpu_percent: float = 0.0
    mem_bytes: int = 0
    mem_mb: float = 0.0
    mem_percent: float = 0.0
    num_threads: Optional[int] = None
    status: str = "unknown"
    create_time: float = 0.0


class GpuStats(BaseModel):
    utilization: float = 0.0
    mem_used_mb: float = 0.0
    mem_total_mb: float = 0.0
    temperature_c: float = 0.0
    power_w: float = 0.0
    name: str = ""


class SystemStats(BaseModel):
    cpu_total: float = 0.0
    cpu_per_core: List[float] = Field(default_factory=list)
    ram_total_mb: float = 0.0
    ram_used_mb: float = 0.0
    ram_available_mb: float = 0.0
    ram_percent: float = 0.0
    swap_total_mb: float = 0.0
    swap_used_mb: float = 0.0
    process_count: int = 0
    uptime_s: float = 0.0
    gpu: Optional[GpuStats] = None


class Snapshot(BaseModel):
    """One monitoring tick: every visible process plus system-wide stats."""

    ts: float = 0.0
    demo: bool = False
    truncated: bool = False
    total_processes: int = 0
    display_limit: int = 0
    interval_s: float = 1.0
    system: SystemStats = Field(default_factory=SystemStats)
    processes: List[ProcessInfo] = Field(default_factory=list)
