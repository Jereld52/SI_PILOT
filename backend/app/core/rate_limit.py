import threading
import time
from collections import deque


class SlidingWindowRateLimiter:
    """Limiteur en mémoire adapté à un déploiement mono-processus.

    En production multi-workers, remplacer par un stockage partagé (Redis ou table dédiée).
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_cleanup = time.monotonic()

    def check(self, key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = max(1, int(window_seconds - (now - hits[0])))
                return False, retry_after
            hits.append(now)
            self._cleanup(now)
            return True, 0

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def _cleanup(self, now: float) -> None:
        if now - self._last_cleanup < 300:
            return
        stale = [key for key, hits in self._hits.items() if not hits or hits[-1] < now - 3600]
        for key in stale:
            self._hits.pop(key, None)
        self._last_cleanup = now


login_limiter = SlidingWindowRateLimiter()
