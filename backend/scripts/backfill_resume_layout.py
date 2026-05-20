"""One-shot migration: copy legacy resume objects to the canonical
mrr_tracking/uploads/candidates/resumes/<id>/<filename> layout and rewrite
the candidates.resume / candidates.resume_data columns to store filename only.

Idempotent: skips rows whose resume value already has no "/" (already migrated),
and skips S3 copies when the target key already exists.

Run inside the app container:
    docker compose exec app python -m scripts.backfill_resume_layout
"""
import sys
from botocore.exceptions import ClientError
from sqlalchemy import text
from core.database import SessionLocal
from core.sql_loader import load_sql
from infra.s3 import _s3, _bucket, build_resume_key, copy_resume_to_canonical


def _object_exists(key: str) -> bool:
    try:
        _s3().head_object(Bucket=_bucket(), Key=key)
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def main() -> int:
    db = SessionLocal()
    rows = db.execute(text(load_sql("028-select_candidates_for_resume_backfill.sql"))).fetchall()

    total = len(rows)
    moved, skipped, errors = 0, 0, 0
    print(f"[backfill] {total} candidate(s) need migration")

    for cid, resume, resume_data in rows:
        # Prefer resume_data when both are set — historically that one was always populated
        source_key = resume_data if (resume_data and resume_data != "None") else resume
        if not source_key or source_key == "None":
            skipped += 1
            continue
        if "/" not in source_key:
            skipped += 1
            continue

        filename = source_key.rsplit("/", 1)[-1]
        target_key = build_resume_key(cid, filename)

        try:
            if _object_exists(target_key):
                pass  # already migrated in S3, just rewrite DB
            elif _object_exists(source_key):
                copy_resume_to_canonical(source_key, cid)
            else:
                print(f"[backfill]   id={cid} source missing in S3 ({source_key!r}) — rewriting DB only")
            db.execute(
                text(load_sql("029-update_candidate_resume_path.sql")),
                {"f": filename, "id": cid},
            )
            db.commit()
            moved += 1
            print(f"[backfill]   id={cid:>3}  {source_key!r} -> {target_key!r}")
        except Exception as e:
            db.rollback()
            errors += 1
            print(f"[backfill]   id={cid:>3}  ERROR: {e!r}")

    print(f"[backfill] done. moved={moved} skipped={skipped} errors={errors}")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
