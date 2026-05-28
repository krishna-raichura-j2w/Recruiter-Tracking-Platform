# Target Model — Formula Reference

All calculations live in `app.py → compute_metrics()` and `→ api_compute()`.  
The frontend sends raw inputs to `/api/compute`; this file is the single source of truth for every derived number shown in the UI.

---

## Inputs vs Auto-Calculated

| Color in UI | Meaning |
|---|---|
| 🔵 Blue cell | Editable input — you type a value |
| ⬜ Grey cell | Auto-calculated — derived from blue inputs via formulas below |

---

## Section A — The Goal (Global Setup)

These three values are derived from the global pod-level inputs.

| Output Field | Formula | Inputs Used | Why |
|---|---|---|---|
| **Gross PO Needed** | `Net PO Target + Exit Budget` | net_po_target, exit_budget | Total revenue the pod must generate — net target plus a buffer for exits/attrition |
| **Target Onboards** | `round(Target Selects / Month × Sel→OB Rate)` | target_selects_month, sel_ob_rate | Not every select turns into an onboard; this converts the select target into expected actual joiners |
| **Avg PO / OB Blended** | `Gross PO Needed ÷ Target Onboards` | gross_po_needed, target_onboards | Average revenue per onboard needed across the full pod — used as a sanity check against per-customer avg PO/OB values |

**Example** (defaults):
```
Gross PO Needed      = 100 + 5 = 105 ₹L
Target Onboards      = round(50 × 0.8) = 40
Avg PO/OB Blended    = 105 ÷ 40 = 2.625 ₹L
```

---

## Section B — Customer Targets (per customer)

Each customer has its own Net PO target, exit allocation, and avg revenue per onboard.  
Five fields are auto-calculated from these inputs.

| Output Field | Formula | Inputs Used | Why |
|---|---|---|---|
| **Gross PO** | `Net PO Target + Exit Alloc` | c.net_po_target, c.exit_alloc | Total revenue target for this customer including the exit buffer portion allocated to them |
| **OBs Needed** | `round(Gross PO ÷ Avg PO/OB)` | gross_po, c.avg_po_per_ob | How many people need to onboard at this customer to hit the revenue target, given their average offer value |
| **Selects Needed** | `round(OBs Needed ÷ Sel→OB Rate)` | obs_needed, setup.sel_ob_rate | Because not all selects onboard (offer drops, rejections), you need more selects than OBs. Uses the global sel→OB rate |
| **Daily Selects** | `Selects Needed ÷ Working Days` | selects_needed, setup.working_days | Selects target broken into a daily number so recruiters know how many to close per day |
| **Daily OBs** | `OBs Needed ÷ Working Days` | obs_needed, setup.working_days | Daily onboarding pace needed to hit the monthly OB target |

**Example** (Deloitte MB defaults):
```
Gross PO       = 40 + 1.5 = 41.5 ₹L
OBs Needed     = round(41.5 ÷ 1.52) = 27
Selects Needed = round(27 ÷ 0.8) = 34
Daily Selects  = 34 ÷ 22 = 1.55
Daily OBs      = 27 ÷ 22 = 1.23
```

---

## Section B2 — Demand Classification (per customer)

This section calculates how many submissions and interviews are needed, based on the open demand pool and the mix of repeat vs new demand.

### Step 1 — Avg Subs per Demand Opening

Demand is split into two types:
- **Repeat demand** — roles that have been filled before; recruiters already have profiles, so fewer submissions are needed
- **New demand** — fresh roles split into Phase 1 (urgent/high priority) and Phase 2 (standard)

| Output Field | Formula | Inputs Used | Why |
|---|---|---|---|
| **Avg Subs / Demand** | `(Repeat % × Subs/Repeat) + ((1 − Repeat %) × (Subs/New P1 + Subs/New P2))` | repeat_demand_pct, subs_repeat, subs_new_phase1, subs_new_phase2 | Weighted average of submissions needed per open position, accounting for the demand mix. Repeat roles need fewer subs; new roles need more |

**Example** (Deloitte MB: repeat=80%, subs_repeat=4, p1=2, p2=2):
```
Avg Subs/Demand = (0.8 × 4) + (0.2 × (2 + 2))
               = 3.2 + 0.8
               = 4.0
```

### Step 2 — Monthly Volume

| Output Field | Formula | Inputs Used | Why |
|---|---|---|---|
| **Monthly Subs** | `round(Avg Subs/Demand × Demand Pool)` | avg_subs_demand, open_demand_pool | Total submissions the team must generate this month across all open positions at this customer |
| **Subs / Day** | `Monthly Subs ÷ Working Days` | monthly_subs, working_days | Daily submission target for recruiters assigned to this customer |
| **Monthly Interviews** | `Int/Day Target × Working Days` | target_interviews_day, working_days | Total interviews needed this month — driven by the KAM's daily interview capacity target |

**Example** (Deloitte MB: pool=250, int/day=20, wd=22):
```
Monthly Subs      = round(4.0 × 250) = 1000
Subs/Day          = 1000 ÷ 22 = 45.5
Monthly Interviews = 20 × 22 = 440
```

---

## Section C — Funnel Assumptions (per customer)

This section measures the efficiency of converting submissions into interviews and finally into selects.

| Output Field | Formula | Inputs Used | Why |
|---|---|---|---|
| **Sub→Int Required %** | `(Monthly Interviews ÷ Monthly Subs) × 100` | monthly_interviews, monthly_subs | The conversion rate the team *must* achieve to get enough interviews from their submissions. If this is much higher than historical, it's a risk flag |
| **Expected Selects** | `round(Monthly Interviews × Int→Sel Target)` | monthly_interviews, int_sel_target | How many selects are expected from interviews, based on the target int→select conversion rate |

**Example** (Deloitte MB: int=440, subs=1000, int_sel_target=0.08):
```
Sub→Int Required = (440 ÷ 1000) × 100 = 44.0%
Expected Selects = round(440 × 0.08) = 35
```

> **Note:** Sub→Int Required is a *diagnostic* — compare it against Sub→Int Historical to see if the plan requires an improvement over past conversion rates.

---

## Section E — Capacity Check (per customer, auto-calculated)

This section checks whether the recruiter team assigned to each customer has enough capacity to meet the submission demand.

### Recruiter Capacity per Customer

Capacity is calculated from recruiter assignments in the Recruiters page.  
Each recruiter counts toward a customer's capacity if that customer is their **primary or secondary** assignment.

| Output Field | Formula | Inputs Used | Why |
|---|---|---|---|
| **Monthly Subs Capacity** | `sum(subs_per_day for each recruiter assigned to customer) × Working Days` | recruiter assignments, subs_per_day, working_days | Total submissions the assigned recruiters can physically produce this month at their current productivity |
| **Subs Gap** | `Monthly Subs Capacity − Monthly Subs Needed` | monthly_subs_capacity, monthly_subs | Positive = surplus capacity. Negative = shortfall, meaning the team cannot produce enough submissions to hit the monthly target |
| **Cap Status** | `OK if Subs Gap ≥ 0, else SHORTFALL` | subs_gap | Simple pass/fail indicator shown as a badge in the UI |

| Output Field | Formula | Inputs Used | Why |
|---|---|---|---|
| **Int / Day Needed** | mirrors `target_interviews_day` from B2 | target_interviews_day | Shows the KAM interview load required for this customer in the E table for easy cross-reference |
| **Int / KAM / Day** | `target_interviews_day ÷ num_kams` | target_interviews_day, setup.num_kams | How many interviews each KAM must run per day for this customer, assuming interviews are distributed evenly across all KAMs |

**Example** (Deloitte MB: 8 recruiters assigned at 6 subs/day, wd=22, monthly_subs=1000):
```
Monthly Subs Capacity = (6+6+6+6+6+6+6+6) × 22 = 48 × 22 = 1056
Subs Gap              = 1056 − 1000 = +56  → OK
Int/KAM/Day           = 20 ÷ 4 = 5.0
```

---

## Pod-Level Capacity (shown on Dashboard)

These are aggregate numbers across all customers, used for the recruiter and KAM capacity alert cards.

| Output Field | Formula | Inputs Used | Why |
|---|---|---|---|
| **Rec Cap Day** | `Subs/Recruiter/Day × Num Recruiters` | subs_per_recruiter_day, num_recruiters | Total submissions the full pod can produce per day |
| **Subs Day** | `round(Total Monthly Subs ÷ Working Days)` | total_subs_needed, working_days | How many submissions the pod *needs* to produce per day to hit all customer targets |
| **Rec Gap** | `Rec Cap Day − Subs Day` | rec_cap_day, subs_day | Pod-level surplus/shortfall in daily submission capacity |
| **Recs Needed** | `ceil(abs(Rec Gap) ÷ Subs/Recruiter/Day)` if gap < 0 else 0 | rec_gap, subs_per_recruiter_day | How many additional recruiters need to be hired to close the shortfall |
| **Int Day** | `round(Total Monthly Interviews ÷ Working Days)` | total_monthly_interviews, working_days | Total interviews the pod needs to run per day across all customers |
| **KAM Cap Day** | `Interviews/KAM/Day × Num KAMs` | interviews_per_kam_day, num_kams | Total interview capacity the KAM team can handle per day |
| **KAM Gap** | `KAM Cap Day − Int Day` | kam_cap_day, int_day | Surplus/shortfall in KAM interview capacity. Negative means KAMs are overloaded |
| **KAMs Needed** | `ceil(abs(KAM Gap) ÷ Interviews/KAM/Day)` if gap < 0 else 0 | kam_gap, interviews_per_kam_day | Additional KAMs needed if there is a shortfall |

**Example** (defaults: 16 recruiters × 6 subs/day, 4 KAMs × 12 int/day):
```
Rec Cap Day   = 6 × 16 = 96 subs/day
Subs Day      = round(2340 ÷ 22) = 106 subs/day
Rec Gap       = 96 − 106 = −10  → Need 2 more recruiters

KAM Cap Day   = 12 × 4 = 48 int/day
Int Day       = round(1100 ÷ 22) = 50 int/day
KAM Gap       = 48 − 50 = −2   → Need 1 more KAM
```

---

## Full Dependency Chain

When any input changes, here is what gets recalculated downstream:

```
net_po_target (global)  ──► gross_po_needed ──► avg_po_per_ob_blended
exit_budget             ──►/
target_selects_month    ──► target_onboards ──► avg_po_per_ob_blended
sel_ob_rate             ──►/             └──► selects_needed (all customers)

c.net_po_target ──► c.gross_po ──► c.obs_needed ──► c.selects_needed ──► c.daily_selects
c.exit_alloc    ──►/             └──────────────────────────────────► c.daily_obs
c.avg_po_per_ob ──────────────►/

c.open_demand_pool  ──► c.monthly_subs ──► c.daily_subs
c.repeat_demand_pct ──►/              └──► c.sub_int_required (Section C)
c.subs_repeat       ──►/              └──► c.subs_gap (Section E)
c.subs_new_phase1   ──►/              └──► c.cap_status (Section E)
c.subs_new_phase2   ──►/

c.target_interviews_day ──► c.monthly_interviews ──► c.sub_int_required (Section C)
working_days            ──►/                     └──► c.expected_selects (Section C)
                                                  └──► c.daily_subs (B2)
                                                  └──► c.daily_selects, c.daily_obs (B)

c.int_sel_target ──► c.expected_selects (Section C)

num_kams ──► c.interviews_per_kam (Section E, all customers)
```

---

## Where Each Value Appears in the UI

| Calculated Value | Section A | Section B | Section B2 | Section C | Section E | Dashboard |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| gross_po_needed | ✅ | | | | | ✅ |
| target_onboards | ✅ | | | | | ✅ |
| avg_po_per_ob_blended | ✅ | | | | | ✅ |
| c.gross_po | | ✅ | | | | ✅ |
| c.obs_needed | | ✅ | | | | ✅ |
| c.selects_needed | | ✅ | | | | ✅ |
| c.daily_selects | | ✅ | | | | |
| c.daily_obs | | ✅ | | | | |
| c.avg_subs_demand | | | ✅ | | | |
| c.monthly_subs | | | ✅ | | ✅ | ✅ |
| c.daily_subs | | | ✅ | | | ✅ |
| c.monthly_interviews | | | ✅ | | | ✅ |
| c.sub_int_required | | | | ✅ | | ✅ |
| c.expected_selects | | | | ✅ | | ✅ |
| c.monthly_subs_capacity | | | | | ✅ | ✅ |
| c.subs_gap | | | | | ✅ | ✅ |
| c.cap_status | | | | | ✅ | ✅ |
| c.interviews_per_kam | | | | | ✅ | |
| rec_cap_day | | | | | | ✅ |
| rec_gap | | | | | | ✅ |
| kam_cap_day | | | | | | ✅ |
| kam_gap | | | | | | ✅ |
