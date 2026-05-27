from pathlib import Path

_SQL_DIR    = Path(__file__).parent.parent / "db" / "mrr"
_OL_SQL_DIR = Path(__file__).parent.parent / "db" / "ol"


def load_sql(name: str) -> str:
    return (_SQL_DIR / name).read_text()


def load_sql_list(name: str) -> list[str]:
    content = load_sql(name)
    return [s.strip() for s in content.split(";") if s.strip()]


def load_ol_sql(name: str) -> str:
    return (_OL_SQL_DIR / name).read_text().strip()

