# Target Model — Formula Reference

All calculations are **backend-only**. Every number shown in the UI is derived by `app.py → compute_metrics()` or `→ monthly_plan()`.  
The frontend never computes — it sends current form values to `/api/compute` (POST), receives JSON, and renders it.  
This file is the **single source of truth** for every derived number across all pages.

> **All examples use Deepak Pod · June 2026 actual seeded values.**

---

## Input vs Auto-Calculated

| Color in UI | Meaning |
|---|---|
| 🔵 Blue cell / input | Editable — you type a value, everything downstream recalculates |
| ⬜ Grey / auto span | Computed — never editable, always derived from blue inputs |

---

## Section A — The Goal (Global Setup)

**Inputs:** `net_po_target`, `exit_budget`, `target_selects_month`, `sel_ob_rate`

| Output Field | Python Variable | Formula | Why |
|---|---|---|---|
| **Gross PO Needed** | `gross_po_needed` | `net_po_target + exit_budget` | Total revenue the pod must generate to net the target after exits |
| **Target Onboards** | `target_onboards` | `round(target_selects_month × sel_ob_rate)` | Not every select joins; this converts the select target to expected actual joiners |
| **Avg PO / OB Blended** | `avg_po_per_ob_blended` | `gross_po_needed ÷ target_onboards` | Average revenue per onboard across the whole pod — a sanity-check against per-customer figures |

**June 2026 example:**
```
gross_po_needed       = 100 + 5                = 105.0 ₹L
target_onboards       = round(50 × 0.8)        = 40
avg_po_per_ob_blended = 105 ÷ 40               = 2.625 ₹L
```

---

## Section B — Customer Revenue Targets (per customer)

**Inputs per customer:** `c.net_po_target`, `c.exit_alloc`, `c.avg_po_per_ob`  
**Global inputs used:** `sel_ob_rate`, `working_days`

| UI Column | Python Variable | Formula | Why |
|---|---|---|---|
| **Gross PO** | `c.gross_po` | `c.net_po_target + c.exit_alloc` | Revenue target including exit buffer allocated to this customer |
| **OBs Needed** | `c.obs_needed` | `round(c.gross_po ÷ c.avg_po_per_ob)` | Headcount that must onboard to hit the revenue target at this customer's avg offer value |
| **Selects** | `c.selects_needed` | `round(c.obs_needed ÷ sel_ob_rate)` | Not all selects onboard (offer drops, rejections) — back-calculate selects needed from OBs |
| **Daily Sels** | `c.daily_selects` | `c.selects_needed ÷ working_days` | Pace: how many selects per working day to hit the monthly target |
| **Daily OBs** | `c.daily_obs` | `c.obs_needed ÷ working_days` | Pace: how many onboards per working day |

**June 2026 examples (all 5 customers):**
```
Customer        Net PO  Exit  Gross PO  Avg PO/OB  OBs  Selects  D.Sels  D.OBs
Deloitte MB      40.0   1.5    41.5      1.52       27     34      1.55    1.23
DTICI            25.0   1.5    26.5      1.80       15     19      0.86    0.68
BSH              20.0   1.0    21.0      2.61        8     10      0.45    0.36
Arcelor Mittal   10.0   0.5    10.5      3.23        3      4      0.18    0.14
Pure Storage      5.0   0.5     5.5      1.50        4      5      0.23    0.18
──────────────────────────────────────────────────────────────────────────────
TOTAL           100.0   5.0   105.0        —        57     72       —       —
```

---

## Section B2 — Demand Classification & Submission Volume (per customer)

Demand is split into two types:
- **Repeat demand** — roles previously filled; recruiters already have profiles, need fewer submissions
- **New demand** — first-time roles, split into Phase 1 (urgent, send 2 first) and Phase 2 (after client validation, send 2 more)

### Step 1 — Avg Submissions per Demand Opening

**Inputs:** `c.repeat_demand_pct`, `c.subs_repeat`, `c.subs_new_phase1`, `c.subs_new_phase2`

```
avg_subs_demand = (repeat_pct × subs_repeat)
                + ((1 − repeat_pct) × (subs_new_phase1 + subs_new_phase2))
```

| Python Variable | Formula | Why |
|---|---|---|
| `c.avg_subs_demand` | `(c.repeat_demand_pct × c.subs_repeat) + ((1 − c.repeat_demand_pct) × (c.subs_new_phase1 + c.subs_new_phase2))` | Weighted average — repeat roles consume fewer submissions because profiles are ready; new roles need a full 2+2 cycle |

**Example** (all customers: repeat=80%, subs_repeat=4, p1=2, p2=2):
```
avg_subs_demand = (0.8 × 4) + (0.2 × (2 + 2))
               = 3.2 + 0.8
               = 4.0   ← same for all 5 customers since inputs are identical
```

### Step 2 — Monthly & Daily Volume

**Inputs:** `c.avg_subs_demand`, `c.open_demand_pool`, `c.target_interviews_day`, `working_days`

| UI Column | Python Variable | Formula | Why |
|---|---|---|---|
| **Monthly Subs** | `c.monthly_subs` | `round(c.avg_subs_demand × c.open_demand_pool)` | Total subs needed = avg submissions per demand × total open demands at this customer |
| **Subs/Day** | `c.daily_subs` | `c.monthly_subs ÷ working_days` | Breaks the monthly target into a daily pace |
| **Monthly Int** | `c.monthly_interviews` | `c.target_interviews_day × working_days` | Total interviews = daily KAM interview target × number of working days |

**June 2026 example:**
```
Customer        Pool  Avg Subs/D  Monthly Subs  Subs/Day  Int/Day  Monthly Int
Deloitte MB     250      4.0          1000        45.5      20         440
DTICI           200      4.0           800        36.4      14         308
BSH              60      4.0           240        10.9       7         154
Arcelor Mittal   50      4.0           200         9.1       5         110
Pure Storage     25      4.0           100         4.5       4          88
──────────────────────────────────────────────────────────────────────────────
TOTAL           585       —           2340        106.4      50        1100
```

---

## Section C — Funnel Efficiency (per customer)

Measures whether the conversion rates embedded in the plan are achievable vs history.

**Inputs:** `c.monthly_interviews`, `c.monthly_subs`, `c.int_sel_target`

| UI Column | Python Variable | Formula | Why |
|---|---|---|---|
| **Sub→Int Required %** | `c.sub_int_required` | `c.monthly_interviews ÷ c.monthly_subs` | The submission-to-interview rate the team **must** hit. Compare against historical to flag risk |
| **Exp Selects** | `c.expected_selects` | `round(c.monthly_interviews × c.int_sel_target)` | How many selects result from the planned interviews at the target int→select conversion rate |

**June 2026 example (Deloitte MB):**
```
sub_int_required = 440 ÷ 1000             = 0.44 (44.0%) — historical is 26%, so plan needs improvement
expected_selects = round(440 × 0.08)      = round(35.2) = 35
```

> **Diagnostic:** If `sub_int_required >> sub_int_historical`, the plan requires a conversion rate improvement over what the team has historically achieved. This is a risk flag — either increase the demand pool, or accept fewer selects.

---

## Section E — Recruiter Capacity Check (per customer)

Checks whether the recruiter headcount assigned to each customer is sufficient to produce the submission volume.

**How assignment works:** Each recruiter has a `primary_customer` and `secondary_customer`. A recruiter's `subs_per_day` counts toward **both** customers' capacity totals.

| Python Variable | Formula | Why |
|---|---|---|
| `c.monthly_subs_capacity` | `sum(r.subs_per_day for r where r.primary == c OR r.secondary == c) × working_days` | Maximum subs this customer can receive from its assigned recruiters across the whole month |
| `c.subs_gap` | `c.monthly_subs_capacity − c.monthly_subs` | Positive = spare capacity. Negative = shortfall — team physically cannot produce enough |
| `c.cap_status` | `"OK" if subs_gap >= 0 else "SHORTFALL"` | Pass/fail badge in the UI |
| `c.interviews_per_kam` | `c.target_interviews_day ÷ num_kams` | Interview load per KAM if distributed evenly across all KAMs |

**June 2026 example (Deloitte MB — 8 recruiters assigned, all at 6 subs/day):**
```
Primary:   A Arun Kumar, Aishwarya, Akula Swathi, Kiren, Nagalakshmi, Nithya  → 6 × 6 = 36/day
Secondary: Aravindhan, Nikita                                                  → 2 × 6 = 12/day
Total cap/day = 48

monthly_subs_capacity = 48 × 22           = 1056
subs_gap              = 1056 − 1000       = +56  → OK
interviews_per_kam    = 20 ÷ 4            = 5.0
```

---

## Pod-Level Capacity (Dashboard)

Aggregated across all customers. Powers the two capacity alert cards on the dashboard.

| Python Variable | Formula | Why |
|---|---|---|
| `rec_cap_day` | `subs_per_recruiter_day × num_recruiters` | Pod's total daily submission capacity |
| `subs_day` | `round(total_subs_needed ÷ working_days)` | Pod's daily submission need to hit all customer targets |
| `rec_gap` | `rec_cap_day − subs_day` | +ve = spare capacity; −ve = shortfall |
| `recs_needed` | `ceil(abs(rec_gap) ÷ subs_per_recruiter_day)` if gap < 0, else 0 | Exact recruiter headcount needed to close a shortfall |
| `int_day` | `round(total_monthly_interviews ÷ working_days)` | Pod's daily interview need across all customers |
| `kam_cap_day` | `interviews_per_kam_day × num_kams` | KAM team's total daily interview capacity |
| `kam_gap` | `kam_cap_day − int_day` | +ve = spare capacity; −ve = KAMs overloaded |
| `kams_needed` | `ceil(abs(kam_gap) ÷ interviews_per_kam_day)` if gap < 0, else 0 | Additional KAMs needed to close a shortfall |

**June 2026 example:**
```
rec_cap_day   = 6 × 16          = 96 subs/day
subs_day      = round(2340 ÷ 22) = 106 subs/day
rec_gap       = 96 − 106        = −10  → need ceil(10 ÷ 6) = 2 more recruiters

kam_cap_day   = 12 × 4          = 48 int/day
int_day       = round(1100 ÷ 22) = 50 int/day
kam_gap       = 48 − 50         = −2   → need ceil(2 ÷ 12) = 1 more KAM
```

---

## 22-Day Submission Plan (Plan Page — `/plan`)

**Source:** `app.py → monthly_plan()`

Distributes each customer's monthly submission target optimally across the 22 working days, respecting the recruiter capacity ceiling for that customer.

### Step 1 — Customer Max Capacity per Day

```
max_per_day[c] = sum(r.subs_per_day
                     for r in recruiters
                     if r.primary_customer == c.name
                     OR r.secondary_customer == c.name)
```

This is customer-level capacity (not pod-level) — only recruiters assigned to that customer count.

### Step 2 — Days Needed

```
days_needed[c] = ceil(monthly_subs[c] ÷ max_per_day[c])
buffer_days[c] = working_days − days_needed[c]
```

- If `days_needed < working_days` → there are buffer days where this customer needs zero submissions
- If `days_needed > working_days` → shortfall — even working every day at max, the target cannot be hit

### Step 3 — Daily Plan Distribution

**Case A: Flat distribution (flat_daily ≤ max_per_day)**

When the average daily need is within recruiter capacity, distribute evenly.  
Integer arithmetic ensures the total sums to exactly `monthly_subs`:

```
flat_daily = monthly_subs ÷ working_days

base  = monthly_subs // working_days          ← floor division
extra = monthly_subs  % working_days          ← remainder

day[i] = base + 1   if i < extra              ← first `extra` days get +1
day[i] = base       if i >= extra             ← rest get base
```

Sum check: `extra × (base+1) + (working_days − extra) × base = monthly_subs` ✅

**Case B: Shortfall (flat_daily > max_per_day)**

When the average exceeds capacity, front-load at maximum and stop when target is met:

```
remaining = monthly_subs

for each working day i:
    if remaining >= max_per_day:
        day[i] = max_per_day
        remaining -= max_per_day
    elif remaining > 0:
        day[i] = remaining      ← partial last day
        remaining = 0
    else:
        day[i] = 0              ← target already met, this day is free
```

### June 2026 Plan — All Customers

| Customer | Monthly Subs | Max/Day | Flat/Day | Case | Days Needed | Buffer Days |
|---|---|---|---|---|---|---|
| Deloitte MB | 1000 | 48 | 45.5 | A (flat) | 21 | 1 |
| DTICI | 800 | 48 | 36.4 | A (flat) | 17 | 5 |
| BSH | 240 | 36 | 10.9 | A (flat) | 7 | 15 |
| Arcelor Mittal | 200 | 36 | 9.1 | A (flat) | 6 | 16 |
| Pure Storage | 100 | 12 | 4.5 | A (flat) | 9 | 13 |

**Example — Deloitte MB distribution:**
```
monthly_subs = 1000, working_days = 22

base  = 1000 // 22 = 45
extra = 1000  % 22 = 10

Day  1–10: 46 subs each  (45 + 1, the +1 days)
Day 11–22: 45 subs each  (base)

Sum = (10 × 46) + (12 × 45) = 460 + 540 = 1000 ✅
Max capacity = 48/day → 46 < 48, within capacity ✅
```

---

## Recruiter Alignment (Plan Page — `/plan`)

**Source:** `app.py → monthly_plan()`, benchmarked against `setup.subs_per_recruiter_day` from Assumptions tab and recruiter assignments from Recruiters tab.

Answers the question: *"Do we have the right number of recruiters for each customer's monthly target?"*

### Step 1 — Recruiters Needed (Theoretical)

```
recs_needed[c] = ceil(monthly_subs[c] ÷ (subs_per_recruiter_day × working_days))
```

`subs_per_recruiter_day` is the **benchmark from the Assumptions tab** (pod-level assumption, same for all customers).  
This is the minimum headcount if every recruiter works every day at benchmark pace.

**June 2026 example (subs_per_recruiter_day = 6, working_days = 22):**
```
Deloitte MB:     ceil(1000 ÷ (6 × 22)) = ceil(7.58) = 8
DTICI:           ceil( 800 ÷ (6 × 22)) = ceil(6.06) = 7
BSH:             ceil( 240 ÷ (6 × 22)) = ceil(1.82) = 2
Arcelor Mittal:  ceil( 200 ÷ (6 × 22)) = ceil(1.52) = 2
Pure Storage:    ceil( 100 ÷ (6 × 22)) = ceil(0.76) = 1
```

### Step 2 — Assigned Recruiters (Actual, from Recruiters Tab)

```
primary_recs[c]   = [r for r in recruiters if r.primary_customer == c.name]
secondary_recs[c] = [r for r in recruiters if r.secondary_customer == c.name]
assigned_all[c]   = primary_recs[c] + secondary_recs[c]
assigned_count[c] = len(assigned_all[c])
```

A recruiter counted as secondary for customer C contributes to C's capacity just as much as a primary recruiter — both are expected to submit for C daily.

### Step 3 — Capacity Per Day and Per Month

```
assigned_cap_day[c]   = sum(r.subs_per_day for r in assigned_all[c])
assigned_cap_month[c] = assigned_cap_day[c] × working_days
```

Note: `r.subs_per_day` may differ per recruiter (stored in `recruiters` table). The sum reflects the actual declared capacity, not the benchmark.

### Step 4 — Gaps

```
rec_count_gap[c] = assigned_count[c] − recs_needed[c]
                   (positive = over-staffed, negative = under-staffed)

rec_cap_gap[c]   = assigned_cap_month[c] − monthly_subs[c]
                   (positive = spare capacity, negative = shortfall)
```

### June 2026 Recruiter Alignment (full table)

| Customer | Monthly Subs | Recs Needed | Assigned (P+S) | Cap/Day | Cap/Month | Count Gap | Capacity Gap |
|---|---|---|---|---|---|---|---|
| Deloitte MB | 1000 | 8 | 8 (6P+2S) | 48 | 1056 | 0 | +56 |
| DTICI | 800 | 7 | 9 (4P+5S) | 54 | 1188 | +2 | +388 |
| BSH | 240 | 2 | 7 (3P+4S) | 42 | 924 | +5 | +684 |
| Arcelor Mittal | 200 | 2 | 5 (2P+3S) | 30 | 660 | +3 | +460 |
| Pure Storage | 100 | 1 | 3 (1P+2S) | 18 | 396 | +2 | +296 |

- **Count Gap = 0**: Exactly the right number of recruiters at benchmark pace
- **Count Gap > 0**: More recruiters assigned than strictly needed (but may be intentional for resilience or secondary allocation)
- **Capacity Gap > 0**: Total assigned recruiter capacity exceeds the monthly target — buffer exists

### Where These Values Appear

| Value | Plan page summary table | Plan page per-customer card |
|---|:---:|:---:|
| `recs_needed_full` | ✅ "Recs Needed" | ✅ mini-KPI |
| `assigned_count` | ✅ "Assigned (P+S)" | ✅ mini-KPI |
| `rec_count_gap` | ✅ "Count Gap" | ✅ mini-KPI (green/red) |
| `assigned_cap_day` | ✅ "Assigned Cap/Day" | |
| `assigned_cap_month` | ✅ "Cap/Month" | |
| `rec_cap_gap` | ✅ "Capacity Gap" | ✅ mini-KPI (green/red) |
| `primary_recs` | | ✅ name chips (blue) |
| `secondary_recs` | | ✅ name chips (light blue) |

---

## Weekly OB Targets (Dashboard + Daily Tracker)

**Source:** `weekly_ob_targets` table (seeded from Excel Sheet 2 — Deepak Pod June 2026)

June 2026 has 5 checkpoint weeks. OBs are not tracked daily — they are checked on **Fridays** (or the last day of the week).

### Week Definitions

| Week | Date Range | Checkpoint Date |
|---|---|---|
| Week 1 | Jun 1–5 | Friday Jun 5 |
| Week 2 | Jun 8–12 | Friday Jun 12 |
| Week 3 | Jun 15–19 | Friday Jun 19 |
| Week 4 | Jun 22–26 | Friday Jun 26 |
| Week 5 | Jun 29–30 | Tuesday Jun 30 (month-end) |

### OB Target Table (from Excel Sheet 2)

| Customer | W1 | W2 | W3 | W4 | W5 | Monthly Total |
|---|---|---|---|---|---|---|
| Deloitte MB | 6 | 7 | 6 | 6 | 3 | **28** |
| DTICI | 3 | 4 | 3 | 4 | 1 | **15** |
| BSH | 2 | 2 | 2 | 2 | 1 | **9** |
| Arcelor Mittal | 1 | 1 | 1 | 1 | 0 | **4** |
| Pure Storage | 1 | 1 | 1 | 1 | 0 | **4** |
| **Pod Total** | **13** | **15** | **13** | **14** | **5** | **60** |

### Weekly Actual Calculation (Daily Tracker)

For the selected date, the app determines which week it falls in, then queries:

```
week_ob_actual[customer] = SUM(actual_obs)
                           FROM daily_actuals
                           WHERE date >= week_start
                             AND date <= week_end
                             AND customer_id = c.id

remaining[customer] = ob_target[customer][week_num] − week_ob_actual[customer]
```

Status logic:
```
if ob_target == 0             → "No target"
elif actual >= ob_target      → "On Track"  (green)
elif actual > 0               → "In Progress"  (amber)
else                          → "Not Started"  (red)
```

---

## KAM Interview Assignment (Dashboard)

**Source:** `kams` table (seeded from Excel Sheet 2 — KAM Interview Capacity section)

Each KAM has a `customer_targets` JSON field mapping customer name → interviews/day assigned to that KAM for that customer.

### Stored Values (June 2026)

| KAM | Deloitte MB | DTICI | BSH | Arcelor Mittal | Pure Storage | Total/Day | Monthly |
|---|---|---|---|---|---|---|---|
| Saravanan P | 4 | 2 | 2 | 2 | 1 | **11** | 242 |
| Tamil C | 4 | 2 | 1 | 1 | 1 | **9** | 198 |
| Smithesh Sukumar | 3 | 2 | 2 | 1 | 1 | **9** | 198 |
| Rajat Tyagi | 3 | 1 | 1 | 2 | 1 | **8** | 176 |
| **Customer Need** | **20** | **14** | **7** | **5** | **4** | **50** | **1100** |

### Derived Fields

```
k.total_int_day  = sum(k.customer_targets.values())
k.monthly_int    = k.total_int_day × working_days

KAM capacity total = sum(k.total_int_day for all KAMs)
                   = 11 + 9 + 9 + 8 = 37/day (planned allocation)

Note: Pod KAM cap (setup level) = num_kams × interviews_per_kam_day = 4 × 12 = 48/day
      The 37/day is the actual planned allocation, not the theoretical max.
      Gap vs customer need: 37 − 50 = −13 (planned gap, distinct from capacity gap)
```

---

## Full Dependency Chain

When **any blue input changes**, the frontend calls `/api/compute` (POST). The backend recomputes the full chain top-to-bottom and returns JSON. The JS applies each value to its DOM span — no formula logic in the browser.

```
── GLOBAL INPUTS ──────────────────────────────────────────────────────────────

net_po_target ──┐
exit_budget    ──┴──► gross_po_needed ──► avg_po_per_ob_blended
                                   ▲
target_selects_month ──► target_onboards ──┘
sel_ob_rate          ──►/        │
                                 └──► c.selects_needed (all customers)

── PER-CUSTOMER REVENUE (Section B) ───────────────────────────────────────────

c.net_po_target ──┐
c.exit_alloc    ──┴──► c.gross_po ──► c.obs_needed ──► c.selects_needed ──► c.daily_selects
c.avg_po_per_ob ──────────────────►/               └──► c.daily_obs

── PER-CUSTOMER DEMAND (Section B2) ───────────────────────────────────────────

c.open_demand_pool  ──┐
c.repeat_demand_pct ──┤
c.subs_repeat       ──┼──► c.avg_subs_demand ──► c.monthly_subs ──► c.daily_subs
c.subs_new_phase1   ──┤                                         └──► c.sub_int_required (C)
c.subs_new_phase2   ──┘                                         └──► c.subs_gap (E)

c.target_interviews_day ──┐
working_days            ──┴──► c.monthly_interviews ──► c.sub_int_required (C)
                                                    └──► c.expected_selects (C)
                                                    └──► c.daily_subs (B2)
                                                    └──► c.daily_selects, c.daily_obs (B)

── PER-CUSTOMER FUNNEL (Section C) ────────────────────────────────────────────

c.int_sel_target ──► c.expected_selects

── PER-CUSTOMER CAPACITY (Section E) ──────────────────────────────────────────

recruiters (assignments) ──► c.monthly_subs_capacity ──► c.subs_gap ──► c.cap_status
num_kams                 ──► c.interviews_per_kam

── POD-LEVEL (Dashboard) ──────────────────────────────────────────────────────

subs_per_recruiter_day ──┐
num_recruiters         ──┴──► rec_cap_day ──┐
                                            ├──► rec_gap ──► recs_needed
total_subs_needed ──► subs_day ────────────┘

interviews_per_kam_day ──┐
num_kams               ──┴──► kam_cap_day ──┐
                                            ├──► kam_gap ──► kams_needed
total_monthly_interviews ──► int_day ───────┘

── 22-DAY PLAN (Plan Page) ─────────────────────────────────────────────────────

c.monthly_subs + recruiters(assigned) ──► max_per_day[c]
                                      ──► days_needed[c]
                                      ──► buffer_days[c]
                                      ──► daily_plan[c][0..21]   (Case A or B)

── RECRUITER ALIGNMENT (Plan Page) ────────────────────────────────────────────

subs_per_recruiter_day (Assumptions) ──┐
working_days                          ──┼──► recs_needed_full[c]
c.monthly_subs                        ──┘

recruiters(primary_customer==c)   ──┐
recruiters(secondary_customer==c) ──┴──► assigned_count[c] ──► rec_count_gap[c]
                                    └──► assigned_cap_day[c] ──► assigned_cap_month[c] ──► rec_cap_gap[c]

── WEEKLY OB TRACKER (Daily Tracker) ──────────────────────────────────────────

weekly_ob_targets[c][week_num] ──┐
daily_actuals[c][week_dates]   ──┴──► remaining ──► status badge
```

---

## Where Each Value Appears in the UI

| Calculated Value | Assumptions | Dashboard | Plan | Daily Tracker |
|---|:---:|:---:|:---:|:---:|
| `gross_po_needed` | ✅ A | ✅ KPI | | |
| `target_onboards` | ✅ A | ✅ KPI | | |
| `avg_po_per_ob_blended` | ✅ A | ✅ KPI | | |
| `c.gross_po` | ✅ B | ✅ B table | | |
| `c.obs_needed` | ✅ B | ✅ B table | | ✅ Monthly Progress |
| `c.selects_needed` | ✅ B | ✅ B table | | ✅ Monthly Progress |
| `c.daily_selects` | ✅ B | | | ✅ Entry form |
| `c.daily_obs` | ✅ B | | | |
| `c.avg_subs_demand` | ✅ B2 | | | |
| `c.monthly_subs` | ✅ B2 | ✅ Summary + B2/C | ✅ per customer | ✅ Monthly Progress |
| `c.daily_subs` | ✅ B2 | ✅ Summary | ✅ per day cell | ✅ Entry form |
| `c.monthly_interviews` | ✅ B2 | ✅ Summary + B2/C | | ✅ Monthly Progress |
| `c.target_interviews_day` | ✅ B2 | ✅ Summary | | ✅ Entry form |
| `c.sub_int_required` | ✅ C | ✅ B2/C table | | |
| `c.expected_selects` | ✅ C | ✅ B2/C table | | |
| `c.monthly_subs_capacity` | ✅ E | ✅ B2/C table | | |
| `c.subs_gap` | ✅ E | ✅ B2/C table | | |
| `c.cap_status` | ✅ E | ✅ B2/C table | | |
| `c.interviews_per_kam` | ✅ E | | | |
| `rec_cap_day` | | ✅ Cap card | ✅ Pod total | |
| `rec_gap` | | ✅ Cap card | ✅ Pod total | |
| `recs_needed` | | ✅ Cap card | | |
| `kam_cap_day` | | ✅ Cap card | | |
| `kam_gap` | | ✅ Cap card | | |
| `kams_needed` | | ✅ Cap card | | |
| `max_per_day[c]` | | | ✅ per customer | |
| `days_needed[c]` | | | ✅ per customer | |
| `buffer_days[c]` | | | ✅ per customer | |
| `daily_plan[c][i]` | | | ✅ day tiles + table | |
| `recs_needed_full[c]` | | | ✅ summary + KPI card | |
| `assigned_count[c]` | | | ✅ summary + KPI card | |
| `rec_count_gap[c]` | | | ✅ summary + KPI card | |
| `assigned_cap_day[c]` | | | ✅ summary table | |
| `assigned_cap_month[c]` | | | ✅ summary table | |
| `rec_cap_gap[c]` | | | ✅ summary + KPI card | |
| `primary_recs[c]` | | | ✅ name chips (blue) | |
| `secondary_recs[c]` | | | ✅ name chips (light) | |
| `weekly_ob_targets[c][w]` | | ✅ Weekly OB table | | ✅ OB Checkpoint |
| `week_ob_actual[c]` | | | | ✅ OB Checkpoint |
| `remaining[c]` | | | | ✅ OB Checkpoint |
| `k.total_int_day` | | ✅ KAM table | | |
| `k.monthly_int` | | ✅ KAM table | | |

---

## Data Flow — How a Live Recalc Works

```
1. User changes any blue input on Assumptions page
2. oninput → debounce 200ms → recalcAll()
3. JS collects ALL form values as FormData (all sections, all customers)
4. POST /api/compute  {FormData}
5. Backend: parse → build setup{} + customers[] + load recruiters from DB
6. compute_metrics(setup, customers, recruiters)  ← all formulas run here
7. Return JSON  { gross_po_needed, target_onboards, customers: [...], rec_gap, ... }
8. JS _apply(m): for each span id, set textContent = computed value
9. Section E gap colors + cap_status badges also updated in JS
10. No page reload. No formula in browser. Single source of truth = Python.
```

---

## Key Constraints & Business Rules

| Rule | Formula / Logic |
|---|---|
| OBs are NOT tracked daily | Weekly checkpoints only (Fridays). `actual_obs` in daily_actuals is summed per week |
| Recruiters count toward both primary AND secondary customer capacity | `monthly_subs_capacity` sums all assigned recruiters, primary + secondary both |
| Daily plan sums to exactly monthly_subs | Integer floor+remainder distribution guarantees this (Case A) |
| Buffer days are genuine free days | `day[i] = 0` when target already met — team can flex to other customers |
| Shortfall flag is per-customer | A customer with `flat_daily > max_per_day` gets ⚠️ flag independently of pod-level gap |
| avg_po_per_ob must be > 0 | Backend guards: `if c.avg_po_per_ob else 0` to prevent division errors |
| working_days must be ≥ 1 | Backend guards: `wd = max(1, working_days)` |
| Recruiter alignment uses benchmark, not individual rate | `recs_needed` uses `subs_per_recruiter_day` from Assumptions (pod-level), not per-recruiter `subs_per_day` |
| Secondary recruiters count fully toward customer capacity | `max_per_day[c]` and `assigned_cap_day[c]` both sum primary + secondary recruiters without weighting |
| Count Gap and Capacity Gap can disagree | Count Gap > 0 with Capacity Gap > 0 means over-staffed but each recruiter submits more than benchmark — both gaps must be read together |
