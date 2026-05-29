"""Seed June 2026 pod plans for Deepak (pod 5) and Sadhna (pod 3) in production RDS."""
import json
import psycopg2

DB_URL = "postgresql://postgres:J2W%23MRR%24Tracking%21%24joUle%24ToWatT%21_7aa@mrr-tracking.ca8kj4bjkq5a.ap-south-1.rds.amazonaws.com:5432/postgres"

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# ── helpers ───────────────────────────────────────────────────────────────────

def clean_pod(pod_id):
    cur.execute("DELETE FROM bh_weekly_ob_targets WHERE setup_id IN (SELECT id FROM bh_pod_setups WHERE pod_id=%s)", (pod_id,))
    cur.execute("DELETE FROM bh_daily_actuals    WHERE setup_id IN (SELECT id FROM bh_pod_setups WHERE pod_id=%s)", (pod_id,))
    cur.execute("DELETE FROM bh_kam_assignments  WHERE setup_id IN (SELECT id FROM bh_pod_setups WHERE pod_id=%s)", (pod_id,))
    cur.execute("DELETE FROM bh_recruiter_assignments WHERE setup_id IN (SELECT id FROM bh_pod_setups WHERE pod_id=%s)", (pod_id,))
    cur.execute("DELETE FROM bh_customer_targets WHERE setup_id IN (SELECT id FROM bh_pod_setups WHERE pod_id=%s)", (pod_id,))
    cur.execute("DELETE FROM bh_pod_setups WHERE pod_id=%s", (pod_id,))
    print(f"  Cleaned pod {pod_id}")

def insert_setup(pod_id, bh_user_id, data):
    cur.execute("""
        INSERT INTO bh_pod_setups
          (pod_id, bh_user_id, month, net_po_target, exit_budget, working_days,
           target_selects_month, sel_ob_rate, subs_per_recruiter_day, num_recruiters,
           interviews_per_kam_day, num_kams)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (pod_id, bh_user_id,
          data['month'], data['net_po_target'], data['exit_budget'], data['working_days'],
          data['target_selects_month'], data['sel_ob_rate'],
          data['subs_per_recruiter_day'], data['num_recruiters'],
          data['interviews_per_kam_day'], data['num_kams']))
    return cur.fetchone()[0]

def insert_customer(setup_id, c, display_order):
    cur.execute("""
        INSERT INTO bh_customer_targets
          (setup_id, customer_name, client_id, net_po_target_cust, exit_alloc,
           avg_po_per_ob, open_demand_pool, repeat_demand_pct,
           subs_repeat, subs_new_phase1, subs_new_phase2,
           target_interviews_day, int_sel_target, display_order)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (setup_id, c['name'], c.get('client_id'),
          c['net_po'], c['exit_alloc'], c['avg_po'],
          c['demand_pool'], c['repeat_pct'],
          c['subs_repeat'], c['subs_new1'], c['subs_new2'],
          c['int_day'], c['int_sel'], display_order))
    return cur.fetchone()[0]

def insert_recruiter(setup_id, user_id, cust_id_map, r):
    pc_id = cust_id_map.get(r['primary'])
    sc_id = cust_id_map.get(r['secondary'])
    cur.execute("""
        INSERT INTO bh_recruiter_assignments
          (setup_id, user_id, primary_customer_id, secondary_customer_id, subs_per_day, primary_subs)
        VALUES (%s,%s,%s,%s,%s,%s)
    """, (setup_id, user_id, pc_id, sc_id, r['spd'], None))

def insert_kam(setup_id, user_id, targets_dict, tat, action):
    cur.execute("""
        INSERT INTO bh_kam_assignments
          (setup_id, user_id, customer_targets, tat_focus, key_action)
        VALUES (%s,%s,%s,%s,%s)
    """, (setup_id, user_id, json.dumps(targets_dict), tat, action))

def insert_weekly_obs(setup_id, cust_id_map, weekly_data):
    weeks = [
        (1, 'Week 1 (Jun 1–5)',   '2026-06-01', '2026-06-05'),
        (2, 'Week 2 (Jun 8–12)',  '2026-06-08', '2026-06-12'),
        (3, 'Week 3 (Jun 15–19)', '2026-06-15', '2026-06-19'),
        (4, 'Week 4 (Jun 22–26)', '2026-06-22', '2026-06-26'),
        (5, 'Week 5 (Jun 29–30)', '2026-06-29', '2026-06-30'),
    ]
    for cname, targets in weekly_data.items():
        ct_id = cust_id_map[cname]
        for (wn, wlabel, ws, we), ob in zip(weeks, targets):
            cur.execute("""
                INSERT INTO bh_weekly_ob_targets
                  (setup_id, customer_target_id, week_num, week_label, week_start, week_end, ob_target)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
            """, (setup_id, ct_id, wn, wlabel, ws, we, ob))

# ═══════════════════════════════════════════════════════════════════════════════
# DEEPAK — pod_id=5, bh_user_id=848
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== DEEPAK (pod 5) ===")
clean_pod(5)

setup_id_d = insert_setup(5, 848, {
    'month': 'June 2026',
    'net_po_target': 100, 'exit_budget': 5, 'working_days': 22,
    'target_selects_month': 50, 'sel_ob_rate': 0.8,
    'subs_per_recruiter_day': 6, 'num_recruiters': 16,
    'interviews_per_kam_day': 12, 'num_kams': 1,
})
print(f"  Setup id={setup_id_d}")

# Customers — updated from Deepak_Pod_June2026_Target_Model_v1 3.xlsx
# Section B (revenue) + B2 (demand) + Daily Rhythm (int_day)
# "Pure Storage" tracks existing pipeline OBs (0 new subs/interviews in June)
d_customers = [
    {'name': 'Deloitte MB',    'client_id': 1367710, 'net_po': 50,  'exit_alloc': 1.5, 'avg_po': 1.52, 'demand_pool': 60,  'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 20, 'int_sel': 0.08},
    {'name': 'DTICI',          'client_id': 1219430, 'net_po': 15,  'exit_alloc': 1.5, 'avg_po': 1.8,  'demand_pool': 70,  'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 8,  'int_sel': 0.18},
    {'name': 'BSH',            'client_id': 1128423, 'net_po': 10,  'exit_alloc': 1.0, 'avg_po': 2.61, 'demand_pool': 17,  'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 2,  'int_sel': 0.10},
    {'name': 'Arcelor Mittal', 'client_id': 1378268, 'net_po': 15,  'exit_alloc': 0.5, 'avg_po': 3.23, 'demand_pool': 26,  'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 5,  'int_sel': 0.07},
    {'name': 'Pure Storage',   'client_id': 1128456, 'net_po': 10,  'exit_alloc': 0.5, 'avg_po': 1.5,  'demand_pool': 11,  'repeat_pct': 0.0, 'subs_repeat': 0, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 0,  'int_sel': 0.08},
]
d_cust_ids = {}
for i, c in enumerate(d_customers):
    d_cust_ids[c['name']] = insert_customer(setup_id_d, c, i)
    print(f"  Customer '{c['name']}' id={d_cust_ids[c['name']]}")

# Recruiters — subs/day updated from Section D of v1 3 Excel
d_recruiters = [
    {'user_id': 858, 'name': 'A Arun Kumar',  'primary': 'Deloitte MB',    'secondary': 'DTICI',          'spd': 5},
    {'user_id': 824, 'name': 'Aishwarya',     'primary': 'Deloitte MB',    'secondary': 'BSH',            'spd': 4},
    {'user_id': 855, 'name': 'Akula Swathi',  'primary': 'Deloitte MB',    'secondary': 'BSH',            'spd': 5},
    {'user_id': 852, 'name': 'Aravindhan',    'primary': 'DTICI',          'secondary': 'Deloitte MB',    'spd': 6},
    {'user_id': 856, 'name': 'G Rekha',       'primary': 'DTICI',          'secondary': 'Arcelor Mittal', 'spd': 5},
    {'user_id': 854, 'name': 'Gopal',         'primary': 'BSH',            'secondary': 'DTICI',          'spd': 5},
    {'user_id': 850, 'name': 'Harish',        'primary': 'BSH',            'secondary': 'Arcelor Mittal', 'spd': 2},
    {'user_id': 859, 'name': 'Harshitha',     'primary': 'Arcelor Mittal', 'secondary': 'BSH',            'spd': 5},
    {'user_id': 821, 'name': 'Kiren',         'primary': 'Deloitte MB',    'secondary': 'DTICI',          'spd': 4},
    {'user_id': 860, 'name': 'Nagalakshmi',   'primary': 'Deloitte MB',    'secondary': 'Arcelor Mittal', 'spd': 5},
    {'user_id': 822, 'name': 'Nikita',        'primary': 'DTICI',          'secondary': 'Deloitte MB',    'spd': 6},
    {'user_id': 823, 'name': 'Nithya',        'primary': 'Deloitte MB',    'secondary': 'DTICI',          'spd': 6},
    {'user_id': 853, 'name': 'Shivani',       'primary': 'BSH',            'secondary': 'Pure Storage',   'spd': 6},
    {'user_id': 857, 'name': 'Sravani RA',    'primary': 'DTICI',          'secondary': 'BSH',            'spd': 5},
    {'user_id': 849, 'name': 'Shridhar',      'primary': 'Pure Storage',   'secondary': 'DTICI',          'spd': 6},
    {'user_id': 851, 'name': 'Vyasam Lalith', 'primary': 'Arcelor Mittal', 'secondary': 'Pure Storage',   'spd': 4},
]
for r in d_recruiters:
    insert_recruiter(setup_id_d, r['user_id'], d_cust_ids, r)
    print(f"  Recruiter {r['name']}: {r['primary']} / {r['secondary']} @ {r['spd']}/day")

# KAMs — P Saravanan (id=827) and Smithesh Sukumar (id=861)
# Interview targets updated to match new int_day: Deloitte=20, DTICI=8, BSH=2, Arcelor=5, Pure=0
# Split ~18/day Saravanan + 17/day Smithesh = 35 total
insert_kam(setup_id_d, 827,
    {'Deloitte MB': 10, 'DTICI': 4, 'BSH': 1, 'Arcelor Mittal': 3, 'Pure Storage': 0},
    'Reduce TAT → target 7–8 days',
    'Deloitte & DTICI primary. Confirm slots 24h ahead. Target L1 TAT ≤8 days.')
insert_kam(setup_id_d, 861,
    {'Deloitte MB': 10, 'DTICI': 4, 'BSH': 1, 'Arcelor Mittal': 2, 'Pure Storage': 0},
    'Reduce TAT → target 7–8 days',
    'Arcelor & Deloitte — lock slots with procurement. Proactive follow-up.')
print("  KAMs: P Saravanan, Smithesh Sukumar")

# Weekly OBs — from Daily Rhythm sheet, v1 3 Excel
# Weeks: W1=Jun1-5, W2=Jun8-12, W3=Jun15-19, W4=Jun22-26, W5=Jun29-30
insert_weekly_obs(setup_id_d, d_cust_ids, {
    'Deloitte MB':    [8, 7, 8, 8, 3],
    'DTICI':          [2, 3, 2, 2, 1],
    'BSH':            [1, 1, 1, 2, 0],
    'Arcelor Mittal': [1, 1, 1, 2, 0],
    'Pure Storage':   [2, 1, 2, 1, 1],
})
print("  Weekly OBs inserted")

# ═══════════════════════════════════════════════════════════════════════════════
# SADHNA — pod_id=3, bh_user_id=229
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== SADHNA (pod 3) ===")
clean_pod(3)

setup_id_s = insert_setup(3, 229, {
    'month': 'June 2026',
    'net_po_target': 30, 'exit_budget': 20, 'working_days': 22,
    'target_selects_month': 40, 'sel_ob_rate': 0.80,
    'subs_per_recruiter_day': 4, 'num_recruiters': 10,
    'interviews_per_kam_day': 9, 'num_kams': 3,
})
print(f"  Setup id={setup_id_s}")

# All 5 customers — repeat=80%, subs_repeat=4, subs_new1=2, subs_new2=2, int_sel=0.60 (Int→Sel rate)
# Cohesity not in of_clients → client_id=NULL
s_customers = [
    {'name': 'Trane',           'client_id': 1221820, 'net_po': 8,  'exit_alloc': 5, 'avg_po': 2.0, 'demand_pool': 24, 'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 7, 'int_sel': 0.60},
    {'name': 'Bosch',           'client_id': 1122118, 'net_po': 5,  'exit_alloc': 3, 'avg_po': 2.4, 'demand_pool': 15, 'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 4, 'int_sel': 0.60},
    {'name': 'Bread Financial', 'client_id': 1174225, 'net_po': 16, 'exit_alloc': 7, 'avg_po': 1.0, 'demand_pool': 28, 'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 8, 'int_sel': 0.60},
    {'name': 'Schneider',       'client_id': 848297,  'net_po': 12, 'exit_alloc': 4, 'avg_po': 2.4, 'demand_pool': 14, 'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 4, 'int_sel': 0.60},
    {'name': 'Cohesity',        'client_id': None,    'net_po': 3,  'exit_alloc': 1, 'avg_po': 1.5, 'demand_pool': 6,  'repeat_pct': 0.8, 'subs_repeat': 4, 'subs_new1': 2, 'subs_new2': 2, 'int_day': 2, 'int_sel': 0.60},
]
s_cust_ids = {}
for i, c in enumerate(s_customers):
    s_cust_ids[c['name']] = insert_customer(setup_id_s, c, i)
    print(f"  Customer '{c['name']}' id={s_cust_ids[c['name']]}")

# Recruiters — 10 from Excel, mapped to pod 3 DB members, 4 subs/day each
s_recruiters = [
    # DL: Nupur (id=47)
    {'user_id': 50, 'name': 'Chenji Hreesh (Harish)',     'primary': 'Trane',           'secondary': 'Bosch',           'spd': 4},
    {'user_id': 48, 'name': 'Indumathi H (Indumati)',     'primary': 'Trane',           'secondary': 'Bosch',           'spd': 4},
    {'user_id': 51, 'name': 'Nepuni Mekreo (Nipuni)',     'primary': 'Bosch',           'secondary': 'Trane',           'spd': 4},
    # DL: Manjunath (id=32)
    {'user_id': 52, 'name': 'Gudeti Amrutha (Amrita)',    'primary': 'Bread Financial', 'secondary': 'Schneider',       'spd': 4},
    {'user_id': 34, 'name': 'Rahul Kambanoor (Rahul)',    'primary': 'Bread Financial', 'secondary': 'Schneider',       'spd': 4},
    {'user_id': 38, 'name': 'Ankita Sen',                 'primary': 'Bread Financial', 'secondary': 'Cohesity',        'spd': 4},
    {'user_id': 39, 'name': 'Ankita Samel (Ankita Samal)','primary': 'Schneider',       'secondary': 'Bread Financial', 'spd': 4},
    {'user_id': 40, 'name': 'Swati',                      'primary': 'Schneider',       'secondary': 'Bread Financial', 'spd': 4},
    {'user_id': 36, 'name': 'Lakshmi Nandana A (Lakshmi)','primary': 'Bread Financial', 'secondary': 'Cohesity',        'spd': 4},
    {'user_id': 35, 'name': 'Revathi R (Revathi)',        'primary': 'Cohesity',        'secondary': 'Bread Financial', 'spd': 4},
]
for r in s_recruiters:
    insert_recruiter(setup_id_s, r['user_id'], s_cust_ids, r)
    print(f"  Recruiter {r['name']}: {r['primary']} / {r['secondary']}")

# KAMs — Shailesh(42), Sushma(41), Sujith(43)
insert_kam(setup_id_s, 42,
    {'Trane': 5, 'Bosch': 2},
    '≤8 days TAT',
    'Trane primary (5/day). Bosch secondary. Front-load Trane to use May carry-fwd.')
insert_kam(setup_id_s, 41,
    {'Bread Financial': 6, 'Cohesity': 2},
    '≤8 days TAT',
    'Bread Financial primary (6/day). Cohesity secondary. Drive L2 closures fast.')
insert_kam(setup_id_s, 43,
    {'Trane': 2, 'Bosch': 2, 'Bread Financial': 2, 'Schneider': 4},
    '≤8 days TAT',
    'Schneider primary (4/day). Trane+Bosch+Bread backup. Zero slot gaps on Schneider.')
print("  KAMs: Shailesh, Sushma, Sujith")

# Weekly OBs — from Excel Daily Rhythm sheet
insert_weekly_obs(setup_id_s, s_cust_ids, {
    'Trane':           [2, 2, 2, 2, 0],
    'Bosch':           [2, 1, 1, 1, 0],
    'Bread Financial': [3, 2, 2, 2, 1],
    'Schneider':       [2, 1, 1, 1, 0],
    'Cohesity':        [2, 0, 0, 0, 0],
})
print("  Weekly OBs inserted")

conn.commit()
conn.close()
print("\n✅ Both pods seeded successfully.")
