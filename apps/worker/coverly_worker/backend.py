"""Talks to Supabase from the worker.

Deliberately a thin REST client rather than the Supabase SDK: the worker needs six operations, and
a hand-rolled client keeps the GPU image small and makes every request auditable. It always uses
the service_role key, which bypasses row level security — that is the point, since the worker acts
on behalf of every user, but it also means this module must never run anywhere near a browser.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


class BackendError(RuntimeError):
    pass


@dataclass
class Job:
    job_id: str
    cover_id: str
    user_id: str
    voice_id: str
    source_type: str
    source_url: str | None
    original_file_url: str | None
    start_seconds: float
    duration_seconds: float
    pitch_shift: int
    cover_type: str
    title: str = ""


@dataclass
class VoiceConfig:
    voice_id: str
    name: str
    """Fine-tuned checkpoint name in the models volume; None means fall back to zero-shot."""
    model_reference: str | None
    sample_path: str | None


class Backend:
    def __init__(self, url: str | None = None, service_key: str | None = None) -> None:
        self.url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
        self.key = service_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not self.url or not self.key:
            raise BackendError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        self._client = httpx.Client(
            timeout=60.0,
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
            },
        )

    # -- REST helpers ---------------------------------------------------------------------------
    def _rest(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self._client.request(method, f"{self.url}/rest/v1/{path}", **kwargs)
        if response.status_code >= 400:
            raise BackendError(f"{method} {path} -> {response.status_code}: {response.text[:500]}")
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    # -- job lifecycle --------------------------------------------------------------------------
    def claim_next_job(self, worker_id: str) -> Job | None:
        """Take the oldest queued job, or None.

        Claiming is a conditional update on `status = queued`: whichever worker's UPDATE lands
        first wins the row and every other worker's UPDATE matches nothing, so the same job is
        never processed twice.
        """
        queued = self._rest(
            "GET",
            "generation_jobs",
            params={"status": "eq.queued", "order": "created_at.asc", "limit": "1",
                    "select": "id,cover_id"},
        )
        if not queued:
            return None
        job_id = queued[0]["id"]

        claimed = self._rest(
            "PATCH",
            "generation_jobs",
            params={"id": f"eq.{job_id}", "status": "eq.queued"},
            headers={"Prefer": "return=representation"},
            json={"status": "processing", "worker_id": worker_id, "started_at": _now()},
        )
        if not claimed:
            return None  # another worker took it between the read and the write
        return self.load_job(job_id)

    def load_job(self, job_id: str) -> Job | None:
        rows = self._rest(
            "GET",
            "generation_jobs",
            params={
                "id": f"eq.{job_id}",
                "select": "id,cover_id,covers(user_id,voice_id,source_type,source_url,"
                          "original_file_url,preview_start_seconds,preview_duration_seconds,"
                          "pitch_shift,type,title)",
            },
        )
        if not rows:
            return None
        row = rows[0]
        cover = row["covers"]
        return Job(
            job_id=row["id"],
            cover_id=row["cover_id"],
            user_id=cover["user_id"],
            voice_id=cover["voice_id"],
            source_type=cover["source_type"],
            source_url=cover["source_url"],
            original_file_url=cover["original_file_url"],
            start_seconds=float(cover["preview_start_seconds"] or 0),
            duration_seconds=float(cover["preview_duration_seconds"] or 30),
            pitch_shift=int(cover["pitch_shift"] or 0),
            cover_type=cover["type"],
            title=cover.get("title") or "",
        )

    def job_for_cover(self, cover_id: str) -> Job | None:
        rows = self._rest("GET", "generation_jobs",
                          params={"cover_id": f"eq.{cover_id}", "select": "id", "limit": "1"})
        return self.load_job(rows[0]["id"]) if rows else None

    def mark_processing(self, job: Job, worker_id: str) -> None:
        self._rest("PATCH", "generation_jobs", params={"id": f"eq.{job.job_id}"},
                   json={"status": "processing", "worker_id": worker_id, "started_at": _now()})
        self._rest("PATCH", "covers", params={"id": f"eq.{job.cover_id}"},
                   json={"status": "processing"})

    def complete(self, job: Job, result_path: str) -> None:
        now = _now()
        self._rest("PATCH", "covers", params={"id": f"eq.{job.cover_id}"},
                   json={"status": "completed", "result_url": result_path, "completed_at": now})
        self._rest("PATCH", "generation_jobs", params={"id": f"eq.{job.job_id}"},
                   json={"status": "completed", "completed_at": now})

    def fail(self, job: Job, message: str) -> None:
        now = _now()
        self._rest("PATCH", "covers", params={"id": f"eq.{job.cover_id}"},
                   json={"status": "failed", "completed_at": now})
        self._rest("PATCH", "generation_jobs", params={"id": f"eq.{job.job_id}"},
                   json={"status": "failed", "error_message": message[:1000], "completed_at": now})
        # A paid generation must never cost a credit it did not deliver (PRD §39).
        if job.cover_type == "full":
            self.refund_credit(job.user_id, job.cover_id)

    def refund_credit(self, user_id: str, cover_id: str) -> None:
        self._client.post(
            f"{self.url}/rest/v1/rpc/refund_credit",
            json={"p_user_id": user_id, "p_cover_id": cover_id},
        )

    def record_metrics(self, cover_id: str, metrics: dict, gpu_type: str,
                       estimated_cost_usd: float) -> None:
        self._rest("POST", "generation_metrics", json={
            "cover_id": cover_id,
            "audio_duration_seconds": metrics.get("audio_duration_seconds"),
            "gpu_type": gpu_type,
            "gpu_seconds": metrics.get("total_seconds"),
            "separation_seconds": metrics.get("separation_seconds"),
            "voice_conversion_seconds": metrics.get("voice_conversion_seconds"),
            "mixing_seconds": metrics.get("mixing_seconds"),
            "peak_vram_mb": metrics.get("peak_vram_mb"),
            "estimated_gpu_cost_usd": estimated_cost_usd,
            "source_f0_low": metrics.get("source_f0_low"),
            "source_f0_median": metrics.get("source_f0_median"),
            "source_f0_high": metrics.get("source_f0_high"),
            "pitch_shift": metrics.get("pitch_shift"),
        })

    def record_song_range(self, title: str, artist: str, low: float, median: float,
                          high: float, peak: float = 0.0) -> None:
        """Teach song_ranges what this upload actually measured.

        A measured row always beats a seed estimate. Repeated measurements of the same song are
        averaged rather than overwritten, so one badly cropped upload cannot define a song.
        """
        if median <= 0 or not title.strip():
            return
        key = {"title": f"eq.{title.strip()[:200]}", "artist": f"eq.{artist.strip()[:100]}"}
        rows = self._rest("GET", "song_ranges", params={
            **key, "select": "id,f0_low,f0_median,f0_high,measured_count,source"}) or []

        if not rows:
            self._rest("POST", "song_ranges", json={
                "title": title.strip()[:200], "artist": artist.strip()[:100],
                "f0_low": low, "f0_median": median, "f0_high": high,
                "f0_peak": peak or None,
                "source": "measured", "measured_count": 1})
            return

        row = rows[0]
        n = row["measured_count"] if row["source"] == "measured" else 0
        blend = lambda old, new: new if not n else (float(old) * n + new) / (n + 1)  # noqa: E731
        self._rest("PATCH", "song_ranges", params={"id": f"eq.{row['id']}"}, json={
            "f0_low": blend(row.get("f0_low") or low, low),
            "f0_median": blend(row.get("f0_median") or median, median),
            "f0_high": blend(row.get("f0_high") or high, high),
            "f0_peak": blend(row.get("f0_peak") or peak, peak) if peak else row.get("f0_peak"),
            "source": "measured", "measured_count": n + 1,
            "updated_at": "now()"})

    def load_voice(self, voice_id: str) -> VoiceConfig | None:
        rows = self._rest("GET", "voices", params={
            "id": f"eq.{voice_id}", "select": "id,name,model_reference,sample_url"})
        if not rows:
            return None
        row = rows[0]
        return VoiceConfig(row["id"], row["name"], row.get("model_reference"), row.get("sample_url"))

    # -- storage --------------------------------------------------------------------------------
    def download(self, bucket: str, path: str, dest: Path) -> Path:
        response = self._client.get(f"{self.url}/storage/v1/object/{bucket}/{path}")
        if response.status_code >= 400:
            raise BackendError(f"download {bucket}/{path} -> {response.status_code}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(response.content)
        return dest

    def upload(self, bucket: str, path: str, source: Path, content_type: str = "audio/mpeg") -> str:
        response = self._client.post(
            f"{self.url}/storage/v1/object/{bucket}/{path}",
            content=source.read_bytes(),
            headers={"Content-Type": content_type, "x-upsert": "true"},
        )
        if response.status_code >= 400:
            raise BackendError(f"upload {bucket}/{path} -> {response.status_code}: {response.text[:300]}")
        return path


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
