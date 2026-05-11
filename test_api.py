#!/usr/bin/env python3
"""
J2W Recruiter Tracking — API Test Suite
Run:  python3 test_api.py [--base http://localhost:8000]
      (from backend/ dir)  uv run python3 ../test_api.py
"""

import argparse
import os
import sys
import time
from typing import Any

import requests

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

passed = failed = skipped = 0


def ok(label: str, detail: str = ""):
    global passed
    passed += 1
    suffix = f"  {CYAN}({detail}){RESET}" if detail else ""
    print(f"  {GREEN}✓{RESET} {label}{suffix}")


def fail(label: str, detail: str = ""):
    global failed
    failed += 1
    suffix = f"  {RED}{detail}{RESET}" if detail else ""
    print(f"  {RED}✗{RESET} {label}{suffix}")


def skip(label: str, reason: str = ""):
    global skipped
    skipped += 1
    suffix = f"  {YELLOW}[{reason}]{RESET}" if reason else ""
    print(f"  {YELLOW}~{RESET} {label}{suffix}")


def section(title: str):
    print(f"\n{BOLD}{CYAN}{'─'*62}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─'*62}{RESET}")


def check(
    label: str,
    resp: requests.Response,
    expected: int = 200,
    extract: str | None = None,
) -> Any:
    if resp.status_code != expected:
        fail(label, f"HTTP {resp.status_code} (want {expected}) — {resp.text[:120]}")
        return None
    ok(label, f"HTTP {resp.status_code}")
    if extract:
        try:
            return resp.json()[extract]
        except Exception:
            return None
    try:
        return resp.json()
    except Exception:
        return None


def H(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ═════════════════════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8000")
    args = parser.parse_args()
    BASE = args.base.rstrip("/")

    print(f"\n{BOLD}J2W API Test Suite{RESET}  →  {BASE}\n")

    # ── 0. Health ─────────────────────────────────────────────────────────────
    section("Health")
    check("GET /", requests.get(BASE + "/"))

    # ── 1. Authentication ─────────────────────────────────────────────────────
    section("Authentication")

    creds = {
        "admin":            ("admin@j2w.com",     "admin123"),
        "pod_lead":         ("priya@j2w.com",      "pod123"),
        "caller":           ("shwetha@j2w.com",    "caller123"),
        "sourcing_partner": ("ravi@j2w.com",       "source123"),
        "validator":        ("validator@j2w.com",  "valid123"),
        "kam":              ("kam@j2w.com",        "kam123"),
    }
    tokens: dict[str, str] = {}

    for role, (email, pwd) in creds.items():
        tok = check(
            f"POST /api/auth/login  [{role}]",
            requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}),
            extract="access_token",
        )
        if tok:
            tokens[role] = tok

    check(
        "POST /api/auth/login  [bad creds → 401]",
        requests.post(f"{BASE}/api/auth/login", json={"email": "x@x.com", "password": "wrong"}),
        expected=401,
    )

    adm = tokens.get("admin", "")

    if adm:
        check("GET /api/auth/me", requests.get(f"{BASE}/api/auth/me", headers=H(adm)))

    # ── 2. Users ──────────────────────────────────────────────────────────────
    section("Users")

    users = check("GET /api/users  [admin]", requests.get(f"{BASE}/api/users", headers=H(adm))) or []

    _uid = int(time.time())
    new_user = check(
        "POST /api/users",
        requests.post(f"{BASE}/api/users", headers=H(adm),
                      json={"name": "API Test User", "email": f"apitest_{_uid}@j2w.com",
                            "password": "test123", "role": "caller"}),
    )
    new_user_id = new_user.get("id") if isinstance(new_user, dict) else None

    if new_user_id:
        check(
            f"PATCH /api/users/{new_user_id}",
            requests.patch(f"{BASE}/api/users/{new_user_id}", headers=H(adm),
                           json={"name": "API Test User Updated"}),
        )

    if "caller" in tokens:
        check(
            "GET /api/users  [caller → 403]",
            requests.get(f"{BASE}/api/users", headers=H(tokens["caller"])),
            expected=403,
        )

    if "sourcing_partner" in tokens:
        check(
            "GET /api/users  [sourcing_partner → 403]",
            requests.get(f"{BASE}/api/users", headers=H(tokens["sourcing_partner"])),
            expected=403,
        )

    # ── 3. Jobs ───────────────────────────────────────────────────────────────
    section("Jobs")

    jobs = check("GET /api/jobs  [admin]", requests.get(f"{BASE}/api/jobs", headers=H(adm))) or []
    check("GET /api/jobs?status=open", requests.get(f"{BASE}/api/jobs?status=open", headers=H(adm)))

    new_job = check(
        "POST /api/jobs  [admin]",
        requests.post(f"{BASE}/api/jobs", headers=H(adm),
                      json={
                          "client_name":    "TestCo",
                          "role_title":     "Test Engineer",
                          "skill_stack":    "Python, FastAPI",
                          "work_mode":      "Remote",
                          "headcount":      2,
                          "location":       "Bangalore",
                          "jd_summary":     "Senior Python engineer for API testing.",
                          "min_experience": 2,
                          "max_experience": 5,
                          "salary_range":   "10-15 LPA",
                      }),
    )
    new_job_id = new_job.get("id") if isinstance(new_job, dict) else None

    if new_job_id:
        check(f"GET /api/jobs/{new_job_id}", requests.get(f"{BASE}/api/jobs/{new_job_id}", headers=H(adm)))
        check(
            f"PATCH /api/jobs/{new_job_id}  [status=on_hold]",
            requests.patch(f"{BASE}/api/jobs/{new_job_id}", headers=H(adm), json={"status": "on_hold"}),
        )
        check(
            f"PATCH /api/jobs/{new_job_id}  [status=open]",
            requests.patch(f"{BASE}/api/jobs/{new_job_id}", headers=H(adm), json={"status": "open"}),
        )

    if "sourcing_partner" in tokens:
        check("GET /api/jobs  [sourcing_partner]",
              requests.get(f"{BASE}/api/jobs", headers=H(tokens["sourcing_partner"])))

    if "caller" in tokens:
        check(
            "POST /api/jobs  [caller → 403]",
            requests.post(f"{BASE}/api/jobs", headers=H(tokens["caller"]),
                          json={"client_name": "X", "role_title": "Y", "headcount": 1}),
            expected=403,
        )

    job_id = new_job_id or (jobs[0]["id"] if jobs else None)

    # ── 4. Candidates ─────────────────────────────────────────────────────────
    section("Candidates")

    cands = check("GET /api/candidates  [admin]",
                  requests.get(f"{BASE}/api/candidates", headers=H(adm))) or []

    if not job_id:
        skip("POST /api/candidates", "no job available")
        new_cand_id = None
    else:
        new_cand = check(
            "POST /api/candidates",
            requests.post(f"{BASE}/api/candidates", headers=H(adm),
                          json={
                              "job_id":          job_id,
                              "full_name":       "API Test Candidate",
                              "mobile":          "9900000001",
                              "email":           "apicand@example.com",
                              "education":       "B.Tech/BE",
                              "city":            "Bangalore",
                              "exp_range":       "3-5 yrs",
                              "current_company": "TestCorp",
                              "skills":          "Python, FastAPI",
                              "naukri_active":   "Yes",
                              "immediate_joiner":"No",
                              "lead_source":     "Naukri",
                          }),
        )
        new_cand_id = new_cand.get("id") if isinstance(new_cand, dict) else None

    if new_cand_id:
        check(f"GET /api/candidates/{new_cand_id}",
              requests.get(f"{BASE}/api/candidates/{new_cand_id}", headers=H(adm)))
        check(
            f"PATCH /api/candidates/{new_cand_id}",
            requests.patch(f"{BASE}/api/candidates/{new_cand_id}", headers=H(adm),
                           json={"city": "Hyderabad", "pool_verified": True}),
        )

    if cands:
        check(f"GET /api/candidates/{cands[0]['id']}",
              requests.get(f"{BASE}/api/candidates/{cands[0]['id']}", headers=H(adm)))

    if "sourcing_partner" in tokens:
        check("GET /api/candidates  [sourcing_partner — scoped]",
              requests.get(f"{BASE}/api/candidates", headers=H(tokens["sourcing_partner"])))

    if "caller" in tokens:
        check("GET /api/candidates  [caller — scoped]",
              requests.get(f"{BASE}/api/candidates", headers=H(tokens["caller"])))

    # assign candidate to caller
    if new_cand_id:
        caller_list = requests.get(f"{BASE}/api/users?role=caller", headers=H(adm))
        callers = caller_list.json() if caller_list.ok else []
        if callers:
            check(
                f"POST /api/candidates/{new_cand_id}/assign",
                requests.post(f"{BASE}/api/candidates/{new_cand_id}/assign?user_id={callers[0]['id']}",
                              headers=H(adm)),
            )

    cand_id = new_cand_id or (cands[0]["id"] if cands else None)

    # ── 5. Calls / Assessment ─────────────────────────────────────────────────
    section("Calls / Assessment")

    if cand_id:
        # log a call
        check(
            "POST /api/calls/log",
            requests.post(f"{BASE}/api/calls/log", headers=H(adm),
                          json={"candidate_id": cand_id, "outcome": "5_10min",
                                "notes": "Good call"}),
        )

        # upsert assessment
        check(
            "POST /api/calls/assessment",
            requests.post(f"{BASE}/api/calls/assessment", headers=H(adm),
                          json={
                              "candidate_id":      cand_id,
                              "resume_skill_score": 4.0,
                              "comm_score":         4.0,
                              "confidence_score":   3.5,
                              "pass_to_validation": "No",
                          }),
        )

        # get assessment (will 404 if none stored yet, which is fine after upsert)
        check(
            f"GET /api/calls/assessment/{cand_id}",
            requests.get(f"{BASE}/api/calls/assessment/{cand_id}", headers=H(adm)),
        )

        # caller forbidden from jd-extract
        if "caller" in tokens:
            check(
                "POST /api/calls/assessment  [caller allowed]",
                requests.post(f"{BASE}/api/calls/assessment", headers=H(tokens["caller"]),
                              json={"candidate_id": cand_id, "pass_to_validation": "Yes"}),
            )
    else:
        skip("Calls / Assessment", "no candidate available")

    # ── 6. Validation ─────────────────────────────────────────────────────────
    section("Validation")

    val_tok = tokens.get("validator", adm)

    check("GET /api/validation/queue",
          requests.get(f"{BASE}/api/validation/queue", headers=H(val_tok)))

    if cand_id:
        check(
            "POST /api/validation/action",
            requests.post(f"{BASE}/api/validation/action", headers=H(val_tok),
                          json={"candidate_id": cand_id, "status": "validated",
                                "comments": "Profile looks good", "submitted_to_client": "N"}),
        )
    else:
        skip("POST /api/validation/action", "no candidate")

    if "caller" in tokens:
        check(
            "GET /api/validation/queue  [caller → 403]",
            requests.get(f"{BASE}/api/validation/queue", headers=H(tokens["caller"])),
            expected=403,
        )

    # ── 7. Consultant Profile ─────────────────────────────────────────────────
    section("Consultant Profile")

    if cand_id:
        check(f"GET /api/consultant-profile/{cand_id}",
              requests.get(f"{BASE}/api/consultant-profile/{cand_id}", headers=H(val_tok)))
        check(
            f"POST /api/consultant-profile/{cand_id}",
            requests.post(f"{BASE}/api/consultant-profile/{cand_id}", headers=H(val_tok),
                          json={"personal_laptop": "Yes", "immediate_joinee": "No",
                                "notice_period": "30 days"}),
        )
        check(
            f"PATCH /api/consultant-profile/{cand_id}",
            requests.patch(f"{BASE}/api/consultant-profile/{cand_id}", headers=H(val_tok),
                           json={"personal_laptop": "No"}),
        )
        if "caller" in tokens:
            check(
                f"GET /api/consultant-profile/{cand_id}  [caller → 403]",
                requests.get(f"{BASE}/api/consultant-profile/{cand_id}",
                             headers=H(tokens["caller"])),
                expected=403,
            )
    else:
        skip("Consultant Profile", "no candidate")

    # ── 8. Submissions ────────────────────────────────────────────────────────
    section("Submissions")

    kam_tok = tokens.get("kam", adm)

    check("GET /api/submissions", requests.get(f"{BASE}/api/submissions", headers=H(kam_tok)))
    check("GET /api/submissions?closed=true",
          requests.get(f"{BASE}/api/submissions?closed=true", headers=H(kam_tok)))
    check("GET /api/submissions/ready",
          requests.get(f"{BASE}/api/submissions/ready", headers=H(kam_tok)))

    if cand_id:
        sub = check(
            "POST /api/submissions  [submit candidate]",
            requests.post(f"{BASE}/api/submissions", headers=H(adm),
                          json={"candidate_id": cand_id, "notes": "Ready to submit"}),
        )
        sub_id = sub.get("id") if isinstance(sub, dict) else None

        if sub_id:
            check(
                f"PATCH /api/submissions/{sub_id}  [stage update]",
                requests.patch(f"{BASE}/api/submissions/{sub_id}", headers=H(kam_tok),
                               json={"current_stage": "ta_review",
                                     "ta_feedback": "Looks promising",
                                     "next_action": "Follow up in 2 days"}),
            )
    else:
        skip("POST /api/submissions", "no candidate")

    if "sourcing_partner" in tokens:
        check(
            "GET /api/submissions  [sourcing_partner → 403]",
            requests.get(f"{BASE}/api/submissions", headers=H(tokens["sourcing_partner"])),
            expected=403,
        )

    # ── 9. Dashboard ─────────────────────────────────────────────────────────
    section("Dashboard")

    check("GET /api/dashboard  [admin]",
          requests.get(f"{BASE}/api/dashboard", headers=H(adm)))

    if "pod_lead" in tokens:
        check("GET /api/dashboard  [pod_lead]",
              requests.get(f"{BASE}/api/dashboard", headers=H(tokens["pod_lead"])))

    if "caller" in tokens:
        check("GET /api/dashboard  [caller]",
              requests.get(f"{BASE}/api/dashboard", headers=H(tokens["caller"])))

    check("GET /api/dashboard/notifications",
          requests.get(f"{BASE}/api/dashboard/notifications", headers=H(adm)))

    # ── 10. Resume Extract ───────────────────────────────────────────────────
    section("Resume Extract  (AI — optional if AZURE_OPENAI_API_KEY set)")

    src_tok = tokens.get("sourcing_partner", adm)

    # missing input → 400
    check("POST /api/resume-extract  [no input → 400]",
          requests.post(f"{BASE}/api/resume-extract", headers=H(src_tok), data={}),
          expected=400)

    if os.getenv("AZURE_OPENAI_API_KEY"):
        check(
            "POST /api/resume-extract  [text]",
            requests.post(f"{BASE}/api/resume-extract", headers=H(src_tok),
                          data={"text": "John Doe, 5 yrs Python, john@mail.com, Bangalore, TCS"}),
        )
    else:
        skip("POST /api/resume-extract  [text]", "AZURE_OPENAI_API_KEY not in env")

    # validator cannot call this
    if "validator" in tokens:
        check(
            "POST /api/resume-extract  [validator → 403]",
            requests.post(f"{BASE}/api/resume-extract", headers=H(tokens["validator"]), data={"text": "x"}),
            expected=403,
        )

    # ── 11. JD Extract ───────────────────────────────────────────────────────
    section("JD Extract  (AI — optional if AZURE_OPENAI_API_KEY set)")

    check("POST /api/jd-extract  [no input → 400]",
          requests.post(f"{BASE}/api/jd-extract", headers=H(adm), data={}),
          expected=400)

    if os.getenv("AZURE_OPENAI_API_KEY"):
        check(
            "POST /api/jd-extract  [text]",
            requests.post(f"{BASE}/api/jd-extract", headers=H(adm),
                          data={"text": "Python Engineer at GEHC, Bangalore. 3-5 yrs. Skills: Python, SQL."}),
        )
    else:
        skip("POST /api/jd-extract  [text]", "AZURE_OPENAI_API_KEY not in env")

    if "sourcing_partner" in tokens:
        check(
            "POST /api/jd-extract  [sourcing_partner → 403]",
            requests.post(f"{BASE}/api/jd-extract", headers=H(tokens["sourcing_partner"]),
                          data={"text": "test"}),
            expected=403,
        )

    # ── 12. Auth guards ───────────────────────────────────────────────────────
    section("Auth guards  (no token)")

    check("GET /api/candidates  [no token → 401]",
          requests.get(f"{BASE}/api/candidates"), expected=401)
    check("GET /api/jobs  [no token → 401]",
          requests.get(f"{BASE}/api/jobs"), expected=401)
    check("GET /api/submissions  [no token → 401]",
          requests.get(f"{BASE}/api/submissions"), expected=401)
    check("GET /api/validation/queue  [no token → 401]",
          requests.get(f"{BASE}/api/validation/queue"), expected=401)

    # ── Summary ───────────────────────────────────────────────────────────────
    total = passed + failed + skipped
    print(f"\n{BOLD}{'═'*62}{RESET}")
    print(f"{BOLD}  Results:  "
          f"{GREEN}{passed} passed{RESET}  "
          f"{RED}{failed} failed{RESET}  "
          f"{YELLOW}{skipped} skipped{RESET}  "
          f"/ {total} total{RESET}")
    print(f"{BOLD}{'═'*62}{RESET}\n")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
