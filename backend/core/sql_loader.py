from pathlib import Path

_SQL_DIR = Path(__file__).parent.parent / "db" / "mrr"


def load_sql(name: str) -> str:
    """Load a single SQL file from the sql/ directory."""
    return (_SQL_DIR / name).read_text()


def load_sql_list(name: str) -> list[str]:
    """Load a SQL file and split into individual statements by semicolon."""
    content = load_sql(name)
    return [s.strip() for s in content.split(";") if s.strip()]
