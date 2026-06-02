"""Lightweight observability: per-request and per-SQL-query timing logs.

Everything is written to a SINGLE log file per calendar date:
  /app/logs/app-YYYY-MM-DD.log

Each line is one event, tagged so the two kinds are distinguishable:
  <time> REQ  GET /api/jobs -> 200  63.1ms
  <time> SQL  17.8ms  [GET /api/dashboard/nav-counts]  SELECT ...

The file rolls over automatically at midnight (a new app-<date>.log is created).
Lines also echo to stdout so `docker logs` shows them. The directory is a mounted
volume so files persist on the host:  tail -f logs/app-$(date +%F).log
"""
import contextvars
import logging
import os
import time

LOG_DIR = os.getenv("APP_LOG_DIR", "/app/logs")

# Log SQL queries slower than this many ms. 0 = log every query (as requested).
SLOW_QUERY_MS = float(os.getenv("SLOW_QUERY_MS", "0"))

# Tracks which API request is currently running, so each SQL line can show the
# endpoint that issued it. Propagates into the threadpool (anyio copies context).
_current_request: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_request", default="-",
)
_current_user: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_user", default="-",
)


def set_current_request(label: str) -> None:
    _current_request.set(label)


def set_current_user(email: str) -> None:
    _current_user.set(email or "-")


class DailyFileHandler(logging.Handler):
    """Writes to <log_dir>/<prefix>-YYYY-MM-DD.log, switching files when the
    local date changes. Append mode → safe for multiple worker processes sharing
    one dated file (line-buffered appends interleave cleanly for normal lines).
    """

    def __init__(self, log_dir: str, prefix: str) -> None:
        super().__init__()
        self.log_dir = log_dir
        self.prefix = prefix
        self._date: str | None = None
        self._stream = None

    def _ensure_stream(self) -> None:
        today = time.strftime("%Y-%m-%d")
        if today != self._date or self._stream is None:
            if self._stream is not None:
                try:
                    self._stream.close()
                except Exception:  # noqa: BLE001
                    pass
            os.makedirs(self.log_dir, exist_ok=True)
            path = os.path.join(self.log_dir, f"{self.prefix}-{today}.log")
            self._stream = open(path, "a", buffering=1, encoding="utf-8")  # noqa: SIM115
            self._date = today

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._ensure_stream()
            self._stream.write(self.format(record) + "\n")
        except Exception:  # noqa: BLE001
            self.handleError(record)


# Single combined logger → one dated file holds requests AND queries.
_logger = logging.getLogger("rtp")
_configured = False


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    _logger.setLevel(logging.INFO)
    _logger.propagate = False
    fmt = logging.Formatter("%(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    try:
        _logger.addHandler(_make_daily_handler(fmt))
    except Exception as exc:  # noqa: BLE001 — never let logging break the app
        print(f"[obs] could not open daily log: {exc}")
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    _logger.addHandler(sh)
    _configured = True


def _make_daily_handler(fmt: logging.Formatter) -> logging.Handler:
    h = DailyFileHandler(LOG_DIR, "app")
    h.setFormatter(fmt)
    return h


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
            # Full statement (whitespace collapsed), tagged with the user + the
            # API endpoint that issued it so you can see WHO and WHERE.
            sql = " ".join(statement.split())
            who = _current_user.get()
            where = _current_request.get()
            tag = "SLOW " if ms >= 1000 else ""
            _logger.info("SQL  %s%.1fms  [%s | %s]  %s", tag, ms, who, where, sql)

    @event.listens_for(engine, "handle_error")
    def _on_error(exc_ctx):  # noqa: ANN001
        # A query failed — mark it clearly with the user + endpoint + the error.
        try:
            stmt = " ".join((exc_ctx.statement or "").split())
            who = _current_user.get()
            where = _current_request.get()
            err = type(exc_ctx.original_exception).__name__
            _logger.info("SQL  FAIL  [%s | %s]  %s :: %s", who, where, err, stmt)
        except Exception:  # noqa: BLE001
            pass


def log_request(method: str, path: str, status: int, ms: float, user: str = "-") -> None:
    # Mark failures: 4xx/5xx get a FAIL tag; slow (>1s) get SLOW.
    marks = ""
    if status >= 500:
        marks += "ERROR "
    elif status >= 400:
        marks += "FAIL "
    if ms >= 1000:
        marks += "SLOW "
    _logger.info("REQ  %s%s %s -> %s  %.1fms  user=%s", marks, method, path, status, ms, user or "-")
