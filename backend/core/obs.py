"""Lightweight observability: per-request and per-SQL-query timing logs.

Writes two append-only log files (one line per event):
  /app/logs/requests.log  — METHOD path -> status  durationms  (one per API call)
  /app/logs/queries.log   — durationms  SQL...     (one per executed SQL statement)

Both also echo to stdout so `docker logs` shows them too. The directory is a
mounted volume (see docker-compose) so the files persist on the host and can be
tailed live:  tail -f logs/requests.log  /  tail -f logs/queries.log
"""
import contextvars
import logging
import os
import time
from logging.handlers import RotatingFileHandler

LOG_DIR = os.getenv("APP_LOG_DIR", "/app/logs")

# Log SQL queries slower than this many ms. 0 = log every query (as requested).
SLOW_QUERY_MS = float(os.getenv("SLOW_QUERY_MS", "0"))

# Tracks which API request is currently running, so each SQL line can show the
# endpoint that issued it. Propagates into the threadpool (anyio copies context).
_current_request: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_request", default="-",
)


def set_current_request(label: str) -> None:
    _current_request.set(label)


_request_logger = logging.getLogger("rtp.requests")
_query_logger = logging.getLogger("rtp.queries")
_configured = False


def _make_logger(logger: logging.Logger, filename: str) -> None:
    logger.setLevel(logging.INFO)
    logger.propagate = False
    fmt = logging.Formatter("%(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        # 50 MB per file, keep 3 rotations. delay=True so the file opens lazily.
        fh = RotatingFileHandler(
            os.path.join(LOG_DIR, filename),
            maxBytes=50 * 1024 * 1024,
            backupCount=3,
            delay=True,
        )
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    except Exception as exc:  # noqa: BLE001 — never let logging break the app
        print(f"[obs] could not open {filename}: {exc}")
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    logger.addHandler(sh)


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    _make_logger(_request_logger, "requests.log")
    _make_logger(_query_logger, "queries.log")
    _configured = True


def instrument_engine(engine) -> None:
    """Attach SQLAlchemy cursor-timing events to log each statement's duration."""
    from sqlalchemy import event

    @event.listens_for(engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        context._q_start = time.monotonic()

    @event.listens_for(engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        start = getattr(context, "_q_start", None)
        if start is None:
            return
        ms = (time.monotonic() - start) * 1000.0
        if ms >= SLOW_QUERY_MS:
            # Full statement (whitespace collapsed), tagged with the API endpoint
            # that issued it so you can see WHERE the query is used.
            sql = " ".join(statement.split())
            where = _current_request.get()
            tag = "SLOW " if ms >= 1000 else ""
            _query_logger.info("%s%.1fms  [%s]  %s", tag, ms, where, sql)


def log_request(method: str, path: str, status: int, ms: float) -> None:
    tag = "SLOW " if ms >= 1000 else ""
    _request_logger.info("%s%s %s -> %s  %.1fms", tag, method, path, status, ms)
