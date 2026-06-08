from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


# ── helpers ───────────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    return dict(row._mapping) if hasattr(row, "_mapping") else dict(row)


# ── customers ─────────────────────────────────────────────────────────────────

def list_customers(db: Session, bh_user_id: Optional[int] = None) -> list[dict]:
    q = """
        SELECT c.*, u.name AS bh_name
        FROM sales_effort_customers c
        LEFT JOIN users u ON u.id = c.bh_user_id
    """
    params: dict = {}
    if bh_user_id:
        q += " WHERE c.bh_user_id = :bh_user_id"
        params["bh_user_id"] = bh_user_id
    q += " ORDER BY c.bh_user_id, c.bucket, c.customer_name"
    rows = db.execute(text(q), params).mappings().all()
    return [dict(r) for r in rows]


def get_customer(db: Session, customer_id: int) -> Optional[dict]:
    row = db.execute(
        text("SELECT * FROM sales_effort_customers WHERE id = :id"),
        {"id": customer_id},
    ).mappings().first()
    return dict(row) if row else None


def _client_name(db: Session, client_id: int) -> str:
    row = db.execute(text("SELECT name FROM clients WHERE id = :id"), {"id": client_id}).mappings().first()
    if not row:
        raise HTTPException(404, f"Client {client_id} not found")
    return row["name"]


def upsert_customer(db: Session, data: dict, acting_user) -> dict:
    """Create a customer. BH users can only set their own bh_user_id."""
    role = acting_user.role.value
    bh_user_id = data.get("bh_user_id")

    if role == "bh":
        bh_user_id = acting_user.id
    elif not bh_user_id:
        raise HTTPException(400, "bh_user_id is required for admin/coo")

    client_id = data["client_id"]
    customer_name = _client_name(db, client_id)

    row = db.execute(
        text("""
            INSERT INTO sales_effort_customers (customer_name, client_id, bucket, bh_user_id, consolidated_net_po_rl)
            VALUES (:customer_name, :client_id, :bucket, :bh_user_id, :consolidated_net_po_rl)
            RETURNING *
        """),
        {
            "customer_name": customer_name,
            "client_id": client_id,
            "bucket": data.get("bucket"),
            "bh_user_id": bh_user_id,
            "consolidated_net_po_rl": data.get("consolidated_net_po_rl"),
        },
    ).mappings().first()
    db.commit()
    return dict(row)


def update_customer(db: Session, customer_id: int, data: dict, acting_user) -> dict:
    existing = get_customer(db, customer_id)
    if not existing:
        raise HTTPException(404, "Customer not found")

    role = acting_user.role.value
    if role == "bh" and existing["bh_user_id"] != acting_user.id:
        raise HTTPException(403, "Cannot edit another BH's customer")

    # Build dynamic update
    fields = []
    params: dict = {"id": customer_id}
    if "client_id" in data and data["client_id"]:
        fields.append("client_id = :client_id")
        params["client_id"] = data["client_id"]
        fields.append("customer_name = :customer_name")
        params["customer_name"] = _client_name(db, data["client_id"])

    for key in ("bucket", "consolidated_net_po_rl"):
        if key in data and data[key] is not None:
            fields.append(f"{key} = :{key}")
            params[key] = data[key]
    # bh_user_id only admin/coo can change
    if "bh_user_id" in data and data["bh_user_id"] is not None and role in ("admin", "coo"):
        fields.append("bh_user_id = :bh_user_id")
        params["bh_user_id"] = data["bh_user_id"]

    if not fields:
        return existing

    fields.append("updated_at = NOW()")
    q = f"UPDATE sales_effort_customers SET {', '.join(fields)} WHERE id = :id RETURNING *"
    row = db.execute(text(q), params).mappings().first()
    db.commit()
    return dict(row)


def delete_customer(db: Session, customer_id: int) -> None:
    existing = get_customer(db, customer_id)
    if not existing:
        raise HTTPException(404, "Customer not found")
    db.execute(text("DELETE FROM sales_effort_customers WHERE id = :id"), {"id": customer_id})
    db.commit()


# ── effort lines ──────────────────────────────────────────────────────────────

def list_lines_for_customer(db: Session, customer_id: int) -> list[dict]:
    rows = db.execute(
        text("SELECT * FROM sales_effort_lines WHERE customer_id = :cid ORDER BY id"),
        {"cid": customer_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def get_line(db: Session, line_id: int) -> Optional[dict]:
    row = db.execute(
        text("SELECT * FROM sales_effort_lines WHERE id = :id"),
        {"id": line_id},
    ).mappings().first()
    return dict(row) if row else None


def add_effort_line(db: Session, customer_id: int, data: dict, acting_user) -> dict:
    customer = get_customer(db, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")

    role = acting_user.role.value
    if role == "bh" and customer["bh_user_id"] != acting_user.id:
        raise HTTPException(403, "Cannot add effort line to another BH's customer")

    row = db.execute(
        text("""
            INSERT INTO sales_effort_lines (
                customer_id, effort_line, leadership_contact, opportunity_type,
                track, target_rl, budget, bottleneck, escalation,
                current_hc, six_mo_delta_hc, six_mo_delta_net_po_rl,
                stage, ldr_mtg, mtg_date, next_action, due_date, status, comments
            ) VALUES (
                :customer_id, :effort_line, :leadership_contact, :opportunity_type,
                :track, :target_rl, :budget, :bottleneck, :escalation,
                :current_hc, :six_mo_delta_hc, :six_mo_delta_net_po_rl,
                :stage, :ldr_mtg, :mtg_date, :next_action, :due_date, :status, :comments
            ) RETURNING *
        """),
        {
            "customer_id": customer_id,
            "effort_line": data.get("effort_line"),
            "leadership_contact": data.get("leadership_contact"),
            "opportunity_type": data.get("opportunity_type"),
            "track": data.get("track"),
            "target_rl": data.get("target_rl"),
            "budget": data.get("budget"),
            "bottleneck": data.get("bottleneck"),
            "escalation": data.get("escalation"),
            "current_hc": data.get("current_hc"),
            "six_mo_delta_hc": data.get("six_mo_delta_hc"),
            "six_mo_delta_net_po_rl": data.get("six_mo_delta_net_po_rl"),
            "stage": data.get("stage"),
            "ldr_mtg": data.get("ldr_mtg"),
            "mtg_date": data.get("mtg_date"),
            "next_action": data.get("next_action"),
            "due_date": data.get("due_date"),
            "status": data.get("status", "Not Started"),
            "comments": data.get("comments"),
        },
    ).mappings().first()
    db.commit()
    return dict(row)


def update_effort_line(db: Session, line_id: int, data: dict, acting_user) -> dict:
    line = get_line(db, line_id)
    if not line:
        raise HTTPException(404, "Effort line not found")

    customer = get_customer(db, line["customer_id"])
    role = acting_user.role.value
    if role == "bh" and (not customer or customer["bh_user_id"] != acting_user.id):
        raise HTTPException(403, "Cannot edit another BH's effort line")

    updatable = (
        "effort_line", "leadership_contact", "opportunity_type", "track",
        "target_rl", "budget", "bottleneck", "escalation",
        "current_hc", "six_mo_delta_hc", "six_mo_delta_net_po_rl",
        "stage", "ldr_mtg", "mtg_date", "next_action", "due_date",
        "status", "comments",
    )
    fields = []
    params: dict = {"id": line_id}
    for key in updatable:
        if key in data and data[key] is not None:
            fields.append(f"{key} = :{key}")
            params[key] = data[key]

    if not fields:
        return line

    fields.append("updated_at = NOW()")
    q = f"UPDATE sales_effort_lines SET {', '.join(fields)} WHERE id = :id RETURNING *"
    row = db.execute(text(q), params).mappings().first()
    db.commit()
    return dict(row)


def delete_effort_line(db: Session, line_id: int) -> None:
    line = get_line(db, line_id)
    if not line:
        raise HTTPException(404, "Effort line not found")
    db.execute(text("DELETE FROM sales_effort_lines WHERE id = :id"), {"id": line_id})
    db.commit()


# ── flat tracker ──────────────────────────────────────────────────────────────

def get_flat_tracker(db: Session, bh_user_id: Optional[int] = None) -> list[dict]:
    """Return all customers + effort lines joined together as flat rows.
    Customers with no effort lines still appear as one row (effort line fields are NULL).
    """
    q = """
        SELECT
            c.id              AS customer_id,
            c.customer_name,
            c.client_id,
            c.bucket,
            c.bh_user_id,
            c.consolidated_net_po_rl,
            u.name            AS bh_name,
            l.id              AS line_id,
            l.effort_line,
            l.leadership_contact,
            l.opportunity_type,
            l.track,
            l.target_rl,
            l.budget,
            l.bottleneck,
            l.escalation,
            l.current_hc,
            l.six_mo_delta_hc,
            l.six_mo_delta_net_po_rl,
            l.stage,
            l.ldr_mtg,
            l.mtg_date,
            l.next_action,
            l.due_date,
            l.status,
            l.comments
        FROM sales_effort_customers c
        LEFT JOIN users u ON u.id = c.bh_user_id
        LEFT JOIN sales_effort_lines l ON l.customer_id = c.id
    """
    params: dict = {}
    if bh_user_id:
        q += " WHERE c.bh_user_id = :bh_user_id"
        params["bh_user_id"] = bh_user_id
    q += " ORDER BY u.name, c.bucket, c.customer_name, l.id"
    rows = db.execute(text(q), params).mappings().all()
    return [dict(r) for r in rows]


# ── summary stats ─────────────────────────────────────────────────────────────

def get_summary_stats(db: Session, bh_user_id: Optional[int] = None) -> dict:
    """Compute summary KPIs:
    - revenue_booked_rl: sum of target_rl where status = 'Won'
    - open_pipeline_rl: sum of target_rl where status = 'In Progress'
    - active_engagements: count of distinct customers with at least one In Progress line
    - proposals_out: count of lines in stage = 'Proposal Sent'
    """
    where = "WHERE c.bh_user_id = :bh_user_id" if bh_user_id else ""
    params: dict = {}
    if bh_user_id:
        params["bh_user_id"] = bh_user_id

    row = db.execute(
        text(f"""
            SELECT
                COALESCE(SUM(CASE WHEN l.status = 'Won' THEN l.target_rl ELSE 0 END), 0)          AS revenue_booked_rl,
                COALESCE(SUM(CASE WHEN l.status = 'In Progress' THEN l.target_rl ELSE 0 END), 0)   AS open_pipeline_rl,
                COUNT(DISTINCT CASE WHEN l.status = 'In Progress' THEN c.id ELSE NULL END)          AS active_engagements,
                COUNT(CASE WHEN l.stage = 'Proposal Sent' THEN 1 ELSE NULL END)                     AS proposals_out
            FROM sales_effort_customers c
            LEFT JOIN sales_effort_lines l ON l.customer_id = c.id
            {where}
        """),
        params,
    ).mappings().first()

    return {
        "revenue_booked_rl": float(row["revenue_booked_rl"]),
        "open_pipeline_rl": float(row["open_pipeline_rl"]),
        "active_engagements": int(row["active_engagements"]),
        "proposals_out": int(row["proposals_out"]),
    }


# ── bh users ──────────────────────────────────────────────────────────────────

def get_bh_users(db: Session) -> list[dict]:
    rows = db.execute(
        text("SELECT id, name FROM users WHERE role = 'bh' AND is_active = true ORDER BY name"),
    ).mappings().all()
    return [dict(r) for r in rows]
