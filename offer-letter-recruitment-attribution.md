# Offer Letter MySQL — Recruitment Attribution Reference

> **Companion to:** [`offer-letter-db-schema.md`](./offer-letter-db-schema.md)
> **Purpose:** Document the role hierarchy, attribution chains, and analyst-validated SQL patterns for computing recruitment metrics (demands, submissions, interviews, selections, onboarding) per delivery lead / business head.
>
> **When to consult:** Any time you build or modify a feature that aggregates recruitment activity by delivery lead, account manager, or business head — especially the Offer Letter dashboard, scorecards, headcount planning, and the DL daily performance table.

---

## 1. Role Hierarchy

The `users` table has a `role_id` and `reporting_to` column. The recruitment org is a 4-level tree:

```
Recruiter (role_id=3)
  ↓ reporting_to
Lead / Delivery Lead (role_id=6)
  ↓ reporting_to
Account Manager (role_id=5)
  ↓ reporting_to
Business Head (role_id=23)
```

**Key role IDs from the `roles` table** (full list in `offer-letter-db-schema.md`):

| `role_id` | Name | Notes |
|---|---|---|
| 1 | admin | |
| 2 | client | |
| **3** | **recruiter** | Performs submissions/interview scheduling/etc. |
| 4 | candidate | The job seeker (NOT a J2W employee) |
| **5** | **account_manager** | A.k.a. "Manager" in analyst queries |
| **6** | **lead** | The "Delivery Lead" in the email reports |
| **23** | **business_head** | Top of the recruitment chain |

**Important caveat:** A role-5 Account Manager may also be the immediate `reporting_to` of recruiters in some teams (skipping the role-6 Lead level). Always handle both 3-level and 4-level cases when traversing the hierarchy.

### Filtering active users

- `users.locked = 0` — account is not locked. Necessary but not sufficient for "active recruiter".
- `user_details.status = 0` — user is currently active in the org. **This is the authoritative active filter.** A recruiter with `users.locked = 0` but `user_details.status = 1` (or no `user_details` row) should NOT be counted in headcount.
- The "Total Recruiter Count" in the email reports = COUNT of recruiters where `role_id = 3 AND locked = 0 AND user_details.status = 0`.

### "Present" recruiter count

Two paths depending on whether the requested date is today or historical:

**Today (fast path):** `users.current_sign_in_at >= CURDATE()` — single column scan. The `current_sign_in_at` field is destructive: it stores only the most recent sign-in and is overwritten on every login.

**Historical (audits-table reconstruction):** the `audits` table is a Rails Audited gem log that captures every User-row update — including every Devise sign-in — going back to **2015-09-28**. Each sign-in writes a row with `auditable_type='User'`, `action='update'`, and an `audited_changes` YAML payload containing the new `current_sign_in_at` value. To reconstruct "who was present on date X":

```sql
SELECT DISTINCT a.auditable_id
FROM audits a
INNER JOIN users u ON u.id = a.auditable_id
INNER JOIN user_details ud ON ud.user_id = u.id AND ud.status = 0
WHERE a.auditable_type = 'User'
  AND a.action = 'update'
  AND a.created_at >= ?  -- start of date in IST
  AND a.created_at < DATE_ADD(?, INTERVAL 1 DAY)
  AND a.audited_changes LIKE '%current_sign_in_at%'
  AND u.role_id = 3
  AND u.locked = 0;
```

Validation: today's audits-based count matches the `current_sign_in_at` count to within ±1 (drift comes from sign-ins happening between the two queries). 30-day aggregated query benchmarked at ~170ms against production. Implementation in [`olGetDeliveryLeads`](../server/src/db/offer-letter-db.ts) — passes the `forDate` parameter through to a `LEFT JOIN` on the audits subquery.

**Other tables ruled out:**
- `attendances` — stale (last data 2022), uses `emp_id varchar` not user IDs.
- `sessions` — Rails session-store, no `user_id` column, only ~10 days retention.
- `versions` — PaperTrail audit log scoped to `JobPosting` only.

---

## 2. Customer & BH Ownership

A customer (in `clients.company_name`) is "owned" by exactly one BH. The static `BH_CUSTOMER_MAP` in [`server/src/lib/operations/bh-customer-map.ts`](../server/src/lib/operations/bh-customer-map.ts) is the source of truth — it maps each company name to a BH.

**Critical insight:** The role-based reporting chain (`recruiter → DL → AM → BH`) does NOT necessarily match BH-customer ownership. A recruiter under one BH's reporting chain may submit candidates exclusively for customers owned by a *different* BH. **The email reports filter by BH-customer ownership, not by reporting chain.** When matching email numbers exactly, you must filter `WHERE clients.company_name IN (<that BH's customers>)`, not by traversing `reporting_to`.

For real-time dashboards that show "this DL's daily activity" (regardless of which BH owns the customer), the reporting-chain attribution (via `applied_by_id → reporting_to`) is fine and preferable.

**Excluded clients** (test/internal data — always filter out):
- `clients.id NOT IN (1, 2)`
- The internal user ID `887485` is also commonly excluded from recruiter joins.

---

## 3. Attribution Chains by Metric

Every recruitment metric attributes back to a recruiter (and hence DL/AM/BH) via a different field. **These are the canonical chains** — use them whenever you need per-recruiter/per-DL aggregates.

### 3.1 Demands (job openings)

```
job_postings.user_id  →  users (creator: recruiter or DL)
                          ↓ reporting_to
                         (DL → AM → BH chain)
```

- `job_postings.no_of_opening` is the demand count (sum it).
- Filter: `job_postings.created_at` between dates, `clients.id NOT IN (1, 2)`.

### 3.2 Submissions

```
applied_jobs.applied_by_id  →  users (the recruiter, role_id=3)
                                ↓ reporting_to
                               users (the Lead/DL, role_id=6)
                                ↓ reporting_to
                               users (the AM, role_id=5)
                                ↓ reporting_to
                               users (the BH, role_id=23)
```

- A submission = `applied_jobs` row where `current_step > 6` (past "Client Submit" stage).
- Date filter: `applied_jobs.created_at` between range.
- Count `COUNT(DISTINCT aj.id)`.
- **The email's submission count is a noon-time snapshot** — it does not reflect end-of-day totals. Real-time queries will return higher numbers as the day progresses; this is correct behavior for a live dashboard.

### 3.3 Interviews (L1 / L2)

```
validation_screens.applied_candidate_id      →  users (the candidate)
                  .applied_candidate_for_job_id →  job_postings
                  .candidate_work_flow_step    →  candidate_work_flows.step_id
                                                   ↓ workflow_step (text)
applied_jobs (joined on BOTH job_posting_id AND user_id = candidate_id)
  .applied_by_id → users (recruiter) → reporting_to chain
```

**Critical:** `validation_screens` does NOT have a `user_id` column. The only way to get a 1:1 candidate-job match (and hence the correct recruiter) is to join `applied_jobs` on **both** `job_posting_id` AND `aj.user_id = vs.applied_candidate_id`. Joining on `job_posting_id` alone causes multi-attribution when multiple recruiters submit different candidates to the same posting.

**L1 / L2 split:** Detect via regex on `candidate_work_flows.workflow_step` text. Examples:
- L1 steps (regex: `'L1'`): "Schedule L1 Interview", "Reschedule L1 Interview", "L1 No Show", "L1 Reject", "L1 Select", "L1 – Position On Hold", "L1 - Position Closed", "L1 Panel Unavailable"
- L2 steps (regex: `'L2'`): same set with L2

The numeric step IDs (9-13 for L1, 14-18 for L2) cover the main flow but **miss** the "On Hold" / "Position Closed" / "Panel Unavailable" variants (steps 75, 77, 86-89, 109, 110). The regex on `workflow_step` text is the analyst-validated approach.

- Date filter: `validation_screens.interview_date = CURDATE()` (or BETWEEN range). This is a `DATE` column — `BETWEEN` is safe.

### 3.4 Selections

```
selected_candidates.applied_jobs_id  →  applied_jobs.id
                                          ↓ applied_by_id
                                         users (recruiter) → reporting_to chain
```

- Date filter: `selected_candidates.created_at` between range (`DATETIME` — use `>= start AND < next_day_start`).
- Deduplicate by candidate email: `COUNT(DISTINCT us.email)` where `us` joins `applied_jobs.user_id = us.id`.

### 3.5 Onboarding (HC + PO)

```
offer_letters.created_by_id  →  users (recruiter who drafted the offer)
                                  ↓ reporting_to
                                 (chain to BH)
```

- Status filter: `ol.status IN (5, 6)` (5 = Onboarded, 6 = Active Employee).
- `ol.employee_type <> 0` (excludes "Standard Contract" type 0 — these are not real onboardings).
- `ol.job_posting_id IS NOT NULL` (excludes ad-hoc offers).
- Date column: `client_onboard_date` (`DATE` type — `BETWEEN` is safe). **Not** `joining_date` for "today's onboarding" calculations.
- HC = `COUNT(DISTINCT ol.id)`. PO in lakhs = `SUM(ol.p_o_value) / 100000`. Margin in lakhs = `SUM(ol.margin) / 100000`.
- Note: there's a separate `olGetMonthOnboardings()` that uses `joining_date` for HC planning cascade — that one matches a different analyst definition. Use the right one for the right purpose.

### 3.6 Onboarding Pipeline (offered, not yet onboarded)

```
offer_letters where status IN (3, 4) AND joining_date > CURDATE()
              + same created_by_id chain as 3.5
```

- Status 3/4 = offer issued / accepted but not yet joined.
- `joining_date > CURDATE()` = future joiners.
- Use the same `employee_type <> 0` and `job_posting_id IS NOT NULL` filters.

---

## 4. Workflow Steps Reference

The `candidate_work_flows` table maps `step_id` → `workflow_step` (text). Critical step IDs:

| Stage | Step IDs | Names |
|---|---|---|
| **Submission funnel** | 1-7 | 1=Applied, 2=Validate, 3=Validation Reject, 4=Internal Submit, 5=Lead/Manager Validation, 6=Internal Reject, **7=Client Submit** |
| **Client screening** | 8 | Client Screen Reject |
| **L1 Interview** | 9-13, 75, 86, 87, 109 | 9=Schedule, 10=Reschedule, 11=No Show, 12=Reject, 13=Select, 75=On Hold, 86=Closed, 87=Closed by Client, 109=Panel Unavailable |
| **L2 Interview** | 14-18, 77, 88, 89, 110 | same pattern as L1 |
| **L3 Interview** | 19-23 | |
| **Offer letter workflow** | 26-39 | |
| **Onboarding** | 41=Confirm Onboarding, 43=Set Contract End Date, 44=Onboarded |
| **Exit** | 45-46 | |

**Submissions** = `current_step > 6` (past Client Submit).
**L1/L2 detection from `validation_screens`** — prefer regex on `candidate_work_flows.workflow_step` text via `cwf.step_id = vs.candidate_work_flow_step`. The numeric range (9-13 / 14-18) misses the on-hold/closed variants.

---

## 5. Analyst-Validated Reference Queries

These queries were provided by the J2W data analyst and represent the **canonical** way to compute each metric. Use them as reference patterns when building new queries.

### 5.1 Demands

```sql
SELECT j.id, j.title, j.designation, c.company_name,
  CONCAT(u.first_name, ' ', u.last_name) AS Created_by,
  j.no_of_opening,
  j.created_at,
  c.id AS Client_id
FROM job_postings j
  LEFT JOIN users u ON j.user_id = u.id
  LEFT JOIN clients c ON c.user_id = j.client_id
WHERE j.created_at BETWEEN ? AND ?
  AND c.id NOT IN (1, 2)
ORDER BY j.created_at DESC
```

### 5.2 Submissions

```sql
SELECT
  CONVERT_TZ(aj.created_at, '+00:00', '+05:30') AS date,
  CONVERT_TZ(aj.updated_at, '+00:00', '+05:30') AS Updation_date,
  jp.id AS job_ID, jp.client_job_id, jp.title,
  cl.company_name AS client,
  CONCAT(u.first_name, ' ', u.last_name) AS Candidate,
  ud.contact_phone AS contact, u.email AS mail_ID,
  cw.workflow_step AS status, r.reason,
  CONCAT(us.first_name, ' ', us.last_name) AS Recruiter1,
  CONCAT(usr.first_name, ' ', usr.last_name) AS Lead1,
  CONCAT(users.first_name, ' ', users.last_name) AS Manager,
  cl.id AS client_id
FROM applied_jobs aj
  LEFT JOIN job_postings jp ON aj.job_posting_id = jp.id
  LEFT JOIN users u ON aj.user_id = u.id                 -- candidate
  LEFT JOIN users us ON aj.applied_by_id = us.id          -- recruiter
  LEFT JOIN clients cl ON jp.client_id = cl.user_id
  LEFT JOIN candidate_work_flows cw ON aj.current_step = cw.step_id
  LEFT JOIN reasons r ON aj.id = r.applied_job_id
  LEFT JOIN users usr ON us.reporting_to = usr.id         -- Lead (DL)
  LEFT JOIN users ON usr.reporting_to = users.id          -- Manager (AM)
  LEFT JOIN user_details ud ON u.id = ud.user_id
WHERE aj.created_at BETWEEN ? AND ?
  AND aj.current_step > 6
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
GROUP BY Manager, Lead1, Recruiter1, Candidate, contact, mail_ID,
         Updation_date, status, job_ID, client, r.reason
```

**Note:** This query stops at AM ("Manager") and does not chain to BH. To go to BH, add `LEFT JOIN users bh ON users.reporting_to = bh.id` (where `users` is the AM alias from `LEFT JOIN users ON usr.reporting_to = users.id`).

### 5.3 Interviews

```sql
SELECT us.email, cwf.workflow_step,
  jp.id AS job_id,
  CONCAT(ur.first_name, ' ', ur.last_name) AS Recruiter1,
  CONCAT(vs.interview_date, ' ', vs.interview_time) AS Interview_date,
  cl.company_name, cl.id AS client_id
FROM validation_screens vs
  LEFT JOIN users us ON us.id = vs.applied_candidate_id
  LEFT JOIN candidate_work_flows cwf ON cwf.step_id = vs.candidate_work_flow_step
  LEFT JOIN job_postings jp ON jp.id = vs.applied_candidate_for_job_id
  LEFT JOIN applied_jobs aj
    ON aj.job_posting_id = jp.id
    AND aj.user_id = us.id              -- 1:1 candidate-job match (CRITICAL)
  LEFT JOIN users ur ON ur.id = aj.applied_by_id
  LEFT JOIN clients cl ON jp.client_id = cl.user_id
WHERE vs.interview_date BETWEEN ? AND ?
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
```

### 5.4 Selections

```sql
SELECT
  CONCAT(u.first_name, ' ', u.last_name) AS recruiter,
  CONCAT(usr.first_name, ' ', usr.last_name) AS Lead1,
  jp.id,
  CONCAT(m.first_name, ' ', m.last_name) AS Manager,
  CONCAT(us.first_name, ' ', us.last_name) AS candidate,
  us.email, ol.status, ol.joining_date,
  sc.created_at AS selection_date,
  DATE(aj.created_at) AS Submission_date,
  c.company_name, sc.po, sc.margin, aj.current_step,
  c.id AS Client_id
FROM selected_candidates sc
  LEFT JOIN applied_jobs aj ON sc.applied_jobs_id = aj.id
  LEFT JOIN offer_letters ol ON aj.user_id = ol.candidate_id
  LEFT JOIN users u ON aj.applied_by_id = u.id            -- recruiter
  LEFT JOIN users us ON aj.user_id = us.id                -- candidate
  JOIN job_postings jp ON jp.id = aj.job_posting_id
  JOIN clients c ON jp.client_id = c.user_id
  LEFT JOIN users usr ON u.reporting_to = usr.id          -- Lead (DL)
  LEFT JOIN users m ON usr.reporting_to = m.id            -- Manager (AM)
WHERE sc.created_at BETWEEN ? AND ?
  AND jp.id IS NOT NULL
  AND c.id NOT IN (1, 2)
GROUP BY us.email
```

### 5.5 Onboarded

```sql
SELECT
  CONCAT(users.first_name, ' ', users.last_name) AS recruiter_name,
  CONCAT(usr.first_name, ' ', usr.last_name) AS Lead,
  CONCAT(us.first_name, ' ', us.last_name) AS manager_name,
  offer_letters.full_name, offer_letters.employee_type,
  ed.employee_id, offer_letters.joining_date AS display_date,
  offer_letters.p_o_value, offer_letters.margin,
  offer_letters.job_posting_id, clients.company_name,
  offer_letters.status, selected_candidates.created_at AS Selection_date,
  offer_letters.created_at AS offer_created_date
FROM offer_letters
  LEFT JOIN users ON offer_letters.created_by_id = users.id        -- recruiter
  LEFT JOIN users us ON offer_letters.approved_by_id = us.id        -- manager (AM)
  LEFT JOIN clients ON offer_letters.client_id = clients.user_id
  LEFT JOIN employee_details ed ON offer_letters.id = ed.offer_letter_id
  LEFT JOIN users usr ON users.reporting_to = usr.id                -- Lead (DL)
  LEFT JOIN applied_jobs aj ON aj.user_id = offer_letters.candidate_id
  LEFT JOIN selected_candidates ON selected_candidates.applied_jobs_id = aj.id
WHERE offer_letters.status IN (5, 6)
  AND clients.id NOT IN (1, 2)
  AND offer_letters.client_onboard_date BETWEEN ? AND ?
  AND offer_letters.employee_type <> 0
  AND offer_letters.job_posting_id IS NOT NULL
GROUP BY offer_letters.full_name, ed.employee_id
```

**Note on the analyst's onboarded query:** `offer_letters.approved_by_id` is treated as the "manager", which differs from following `created_by_id → reporting_to`. The two paths usually agree but can diverge — when in doubt, prefer the `reporting_to` chain for consistency with the other metrics.

---

## 6. Email Report Behavior — Important Caveats

The "Delivery Lead Performance" daily email contains the following non-obvious behaviors. **Do not assume real-time dashboard numbers will match the email exactly.**

1. **Submissions are a noon-time snapshot.** The email is generated around 12:00 IST and shows cumulative counts up to that moment. Real-time queries against `applied_jobs.created_at` for the full day will return larger numbers as more submissions accumulate through the afternoon.

2. **Excludes ITES.** The header literally says "(Excluding ITES)". To match the email exactly, filter out customers where `CUSTOMER_DOMAIN_MAP[customer] === 'ITES'` (see [`bh-customer-map.ts`](../server/src/lib/operations/bh-customer-map.ts)).

3. **Filters by BH-customer ownership, not reporting chain.** A recruiter physically reporting through Deepak Desai's chain may submit only for Sadhna Shukla's customers. The email shows their numbers under Sadhna's report, not Deepak's. For dashboards that show "this DL's daily activity end-to-end", the reporting-chain attribution is correct and preferable.

4. **Present recruiter is real-time only.** `current_sign_in_at` is destructive — it stores only the most recent sign-in. Historical "present on date X" cannot be reconstructed. The email captures this at the moment of generation.

5. **Total Recruiter Count** uses `user_details.status = 0` (active in the org). `users.locked = 0` alone is too permissive (returns archived/terminated users).

6. **"Target for the Day"** = `present_recruiters * 6`. This is a per-recruiter daily submission target hardcoded by the analyst. Verified from the screenshot: 9 present × 6 = 54 target.

---

## 7. Implementation Pointers

When implementing a new metric or feature using these patterns:

- **Existing query helpers** in [`server/src/db/offer-letter-db.ts`](../server/src/db/offer-letter-db.ts):
  - `olQuery()`, `olQueryLimited()` — basic query wrappers (read-only enforced)
  - `olGetMonthSubmissions()`, `olGetMonthInterviews()`, `olGetMonthSelections()`, `olGetMonthOnboardedByClientDate()` — month-scoped per-customer counts using `client_recruiters` for team mapping
  - `olGetDeliveryLeads()` — base DL list with recruiter counts (uses `user_details.status = 0`)
  - `olGetDlDailyPerformance()` — full 14-column daily DL performance table
  - `resolveClientUserIds()` — maps team IDs to client user IDs
- **`BH_USER_IDS`** in [`server/src/lib/operations/bh-customer-map.ts`](../server/src/lib/operations/bh-customer-map.ts) maps BH names to their MySQL user IDs (role_id=23 accounts).
- **`BH_CUSTOMER_MAP`** in the same file maps each customer name to its owning BH and domain (Captive / Services / ITES).
- **Timezone:** The MySQL pool is configured with `timezone: '+05:30'` (IST). `CURDATE()` returns the IST date. Use this when comparing dates from `applied_jobs.created_at` which is UTC stored.
- **DL daily performance endpoint:** `GET /api/operations/scorecard/:bhName/delivery-leads/daily` (3-min cache).

---

## 8. Things That Don't Work (Investigated and Ruled Out)

- **`attendances` table** for present recruiter count — last data 2022, uses `emp_id` varchar (employee codes), not user IDs.
- **`validation_screens.user_id`** — column does not exist. Use `vs.applied_candidate_id` for the candidate FK.
- **Joining `validation_screens → applied_jobs` on `job_posting_id` alone** — causes multi-attribution when multiple candidates from different recruiters apply to the same job posting. Always include `AND aj.user_id = vs.applied_candidate_id`.
- **Numeric step ranges (9-13 / 14-18)** for L1/L2 split — misses on-hold (75/77), position-closed (86-89), panel-unavailable (109/110) variants. Use regex on `candidate_work_flows.workflow_step` text instead.
- **`users.reporting_to` traversal alone** to attribute work to a BH — doesn't match email reports because email filters by customer ownership, not reporting chain.
