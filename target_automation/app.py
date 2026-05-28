from flask import Flask, render_template, request, jsonify, redirect, url_for
import sqlite3
import json
from datetime import datetime, date, timedelta
import calendar
import os

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'target_model.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def row_to_dict(row):
    return dict(row) if row else None


def rows_to_list(rows):
    return [dict(r) for r in rows]


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS setup (
            id INTEGER PRIMARY KEY,
            pod_name TEXT NOT NULL DEFAULT 'Deepak Pod',
            month TEXT NOT NULL DEFAULT 'June 2026',
            net_po_target REAL DEFAULT 100,
            exit_budget REAL DEFAULT 5,
            working_days INTEGER DEFAULT 22,
            target_selects_month INTEGER DEFAULT 50,
            sel_ob_rate REAL DEFAULT 0.8,
            repeat_demand_pct_global REAL DEFAULT 0.8,
            subs_per_recruiter_day INTEGER DEFAULT 6,
            num_recruiters INTEGER DEFAULT 16,
            interviews_per_kam_day INTEGER DEFAULT 12,
            num_kams INTEGER DEFAULT 4,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY,
            setup_id INTEGER NOT NULL REFERENCES setup(id),
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            net_po_target REAL DEFAULT 0,
            exit_alloc REAL DEFAULT 0,
            avg_po_per_ob REAL DEFAULT 2,
            may_carryforward_obs INTEGER DEFAULT 0,
            open_demand_pool INTEGER DEFAULT 0,
            repeat_demand_pct REAL DEFAULT 0.8,
            subs_repeat INTEGER DEFAULT 4,
            subs_new_phase1 INTEGER DEFAULT 2,
            subs_new_phase2 INTEGER DEFAULT 2,
            target_interviews_day INTEGER DEFAULT 10,
            sub_int_historical REAL DEFAULT 0.2,
            int_sel_historical REAL DEFAULT 0.05,
            int_sel_target REAL DEFAULT 0.08,
            sel_ob_tat_historical INTEGER DEFAULT 10,
            sel_ob_tat_target INTEGER DEFAULT 8,
            screen_reject_rate REAL DEFAULT 0.4
        );

        CREATE TABLE IF NOT EXISTS recruiters (
            id INTEGER PRIMARY KEY,
            setup_id INTEGER NOT NULL REFERENCES setup(id),
            name TEXT NOT NULL,
            subs_per_day INTEGER DEFAULT 6,
            primary_customer TEXT DEFAULT '',
            secondary_customer TEXT DEFAULT '',
            notes TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS daily_actuals (
            id INTEGER PRIMARY KEY,
            setup_id INTEGER NOT NULL,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            date TEXT NOT NULL,
            actual_subs INTEGER DEFAULT 0,
            actual_interviews INTEGER DEFAULT 0,
            actual_selects INTEGER DEFAULT 0,
            actual_obs INTEGER DEFAULT 0,
            UNIQUE(customer_id, date)
        );

        CREATE TABLE IF NOT EXISTS weekly_ob_targets (
            id INTEGER PRIMARY KEY,
            setup_id INTEGER NOT NULL,
            customer_id INTEGER NOT NULL,
            week_num INTEGER NOT NULL,
            week_label TEXT NOT NULL,
            week_start TEXT NOT NULL,
            week_end TEXT NOT NULL,
            ob_target INTEGER DEFAULT 0,
            UNIQUE(customer_id, week_num)
        );

        CREATE TABLE IF NOT EXISTS kams (
            id INTEGER PRIMARY KEY,
            setup_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            customer_targets TEXT DEFAULT '{}',
            total_int_day INTEGER DEFAULT 0,
            monthly_int INTEGER DEFAULT 0,
            tat_focus TEXT DEFAULT '',
            key_action TEXT DEFAULT ''
        );
    ''')

    c.execute('SELECT COUNT(*) as cnt FROM setup')
    if c.fetchone()['cnt'] == 0:
        c.execute('''INSERT INTO setup (pod_name, month, net_po_target, exit_budget, working_days,
                     target_selects_month, sel_ob_rate, repeat_demand_pct_global,
                     subs_per_recruiter_day, num_recruiters, interviews_per_kam_day, num_kams)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
                  ('Deepak Pod', 'June 2026', 100, 5, 22, 50, 0.8, 0.8, 6, 16, 12, 4))
        sid = c.lastrowid

        customers_seed = [
            ('Deloitte MB',    1, 40,  1.5, 1.52, 2, 250, 0.8, 4, 2, 2, 20, 0.26,  0.048, 0.08, 11, 8,  0.40),
            ('DTICI',          2, 25,  1.5, 1.80, 2, 200, 0.8, 4, 2, 2, 14, 0.177, 0.154, 0.18,  9, 7,  0.35),
            ('BSH',            3, 20,  1.0, 2.61, 1,  60, 0.8, 4, 2, 2,  7, 0.347, 0.059, 0.10,  8, 6,  0.30),
            ('Arcelor Mittal', 4, 10,  0.5, 3.23, 1,  50, 0.8, 4, 2, 2,  5, 0.106, 0.043, 0.07, 16, 12, 0.45),
            ('Pure Storage',   5,  5,  0.5, 1.50, 0,  25, 0.8, 4, 2, 2,  4, 0.200, 0.050, 0.08, 12, 10, 0.40),
        ]
        for row in customers_seed:
            c.execute('''INSERT INTO customers
                (setup_id,name,sort_order,net_po_target,exit_alloc,avg_po_per_ob,
                 may_carryforward_obs,open_demand_pool,repeat_demand_pct,subs_repeat,
                 subs_new_phase1,subs_new_phase2,target_interviews_day,
                 sub_int_historical,int_sel_historical,int_sel_target,
                 sel_ob_tat_historical,sel_ob_tat_target,screen_reject_rate)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                      (sid, *row))

        recruiters_seed = [
            ('A Arun Kumar',  6, 'Deloitte MB',    'DTICI'),
            ('Aishwarya',     6, 'Deloitte MB',    'BSH'),
            ('Akula Swathi',  6, 'Deloitte MB',    'BSH'),
            ('Aravindhan',    6, 'DTICI',           'Deloitte MB'),
            ('G Rekha',       6, 'DTICI',           'Arcelor Mittal'),
            ('Gopal',         6, 'BSH',             'DTICI'),
            ('Harish',        6, 'BSH',             'Arcelor Mittal'),
            ('Harshitha',     6, 'Arcelor Mittal',  'BSH'),
            ('Kiren',         6, 'Deloitte MB',    'DTICI'),
            ('Nagalakshmi',   6, 'Deloitte MB',    'Arcelor Mittal'),
            ('Nikita',        6, 'DTICI',           'Deloitte MB'),
            ('Nithya',        6, 'Deloitte MB',    'DTICI'),
            ('Shivani',       6, 'BSH',             'Pure Storage'),
            ('Sravani RA',    6, 'DTICI',           'BSH'),
            ('Sridhar',       6, 'Pure Storage',    'DTICI'),
            ('Vyasam Lalith', 6, 'Arcelor Mittal',  'Pure Storage'),
        ]
        for row in recruiters_seed:
            c.execute('''INSERT INTO recruiters (setup_id, name, subs_per_day, primary_customer, secondary_customer)
                         VALUES (?,?,?,?,?)''', (sid, *row))

        _seed_weekly_obs(c, sid)
        _seed_kams(c, sid)

    else:
        # Seed new tables for existing setup if empty
        sid = c.execute('SELECT id FROM setup ORDER BY id DESC LIMIT 1').fetchone()['id']
        if c.execute('SELECT COUNT(*) FROM weekly_ob_targets WHERE setup_id=?', (sid,)).fetchone()[0] == 0:
            _seed_weekly_obs(c, sid)
        if c.execute('SELECT COUNT(*) FROM kams WHERE setup_id=?', (sid,)).fetchone()[0] == 0:
            _seed_kams(c, sid)

    conn.commit()
    conn.close()


def _seed_weekly_obs(c, sid):
    # Weekly OB targets from Deepak Pod June 2026 Excel Sheet 2
    # Weeks: W1=Jun1-5, W2=Jun8-12, W3=Jun15-19, W4=Jun22-26, W5=Jun29-30
    weeks = [
        (1, 'Week 1 (Jun 1–5)',   '2026-06-01', '2026-06-05'),
        (2, 'Week 2 (Jun 8–12)',  '2026-06-08', '2026-06-12'),
        (3, 'Week 3 (Jun 15–19)', '2026-06-15', '2026-06-19'),
        (4, 'Week 4 (Jun 22–26)', '2026-06-22', '2026-06-26'),
        (5, 'Week 5 (Jun 29–30)', '2026-06-29', '2026-06-30'),
    ]
    # customer_name → [W1, W2, W3, W4, W5]
    ob_data = {
        'Deloitte MB':    [6, 7, 6, 6, 3],
        'DTICI':          [3, 4, 3, 4, 1],
        'BSH':            [2, 2, 2, 2, 1],
        'Arcelor Mittal': [1, 1, 1, 1, 0],
        'Pure Storage':   [1, 1, 1, 1, 0],
    }
    for cname, targets in ob_data.items():
        row = c.execute('SELECT id FROM customers WHERE setup_id=? AND name=?', (sid, cname)).fetchone()
        if not row:
            continue
        cid = row['id'] if hasattr(row, '__getitem__') and 'id' in row.keys() else row[0]
        for (wnum, wlabel, wstart, wend), ob_tgt in zip(weeks, targets):
            c.execute('''INSERT OR IGNORE INTO weekly_ob_targets
                         (setup_id, customer_id, week_num, week_label, week_start, week_end, ob_target)
                         VALUES (?,?,?,?,?,?,?)''',
                      (sid, cid, wnum, wlabel, wstart, wend, ob_tgt))


def _seed_kams(c, sid):
    kams_data = [
        ('Saravanan P',     {'Deloitte MB': 4, 'DTICI': 2, 'BSH': 2, 'Arcelor Mittal': 2, 'Pure Storage': 1}, 11, 242,
         'Reduce TAT → target 7–8 days', 'BSH & Deloitte — confirm slots 24h ahead. Reduce TAT for L1 to ≤8 days'),
        ('Tamil C',         {'Deloitte MB': 4, 'DTICI': 2, 'BSH': 1, 'Arcelor Mittal': 1, 'Pure Storage': 1}, 9, 198,
         'Reduce TAT → target 7–8 days', 'DTICI & BSH — ensure L2 slots available. Feedback within 24h'),
        ('Smithesh Sukumar', {'Deloitte MB': 3, 'DTICI': 2, 'BSH': 2, 'Arcelor Mittal': 1, 'Pure Storage': 1}, 9, 198,
         'Reduce TAT → target 7–8 days', 'Arcelor & Deloitte — lock slots with procurement team. Proactive follow-up'),
        ('Rajat Tyagi',     {'Deloitte MB': 3, 'DTICI': 1, 'BSH': 1, 'Arcelor Mittal': 2, 'Pure Storage': 1}, 8, 176,
         'Reduce TAT → target 7–8 days', 'DTICI & Arcelor — build relationship with hiring managers. Weekly call'),
    ]
    for name, targets, total_day, monthly, tat, action in kams_data:
        c.execute('''INSERT INTO kams (setup_id, name, customer_targets, total_int_day, monthly_int, tat_focus, key_action)
                     VALUES (?,?,?,?,?,?,?)''',
                  (sid, name, json.dumps(targets), total_day, monthly, tat, action))


def compute_metrics(setup, customers, recruiters):
    s = dict(setup)
    wd = s['working_days']
    if not wd:
        wd = 1

    gross_po_needed = s['net_po_target'] + s['exit_budget']
    target_onboards = round(s['target_selects_month'] * s['sel_ob_rate'])
    avg_po_per_ob_blended = round(gross_po_needed / target_onboards, 3) if target_onboards else 0

    cust_metrics = []
    total_subs_needed = 0
    total_monthly_interviews = 0
    total_selects_needed = 0
    total_obs_needed = 0

    for c in customers:
        c = dict(c)
        # Section B
        gross_po = c['net_po_target'] + c['exit_alloc']
        obs_needed = round(gross_po / c['avg_po_per_ob']) if c['avg_po_per_ob'] else 0
        selects_needed = round(obs_needed / s['sel_ob_rate']) if s['sel_ob_rate'] else 0
        daily_selects = round(selects_needed / wd, 2)
        daily_obs = round(obs_needed / wd, 2)

        # Section B2
        avg_subs_demand = (c['repeat_demand_pct'] * c['subs_repeat'] +
                           (1 - c['repeat_demand_pct']) * (c['subs_new_phase1'] + c['subs_new_phase2']))
        monthly_subs = round(avg_subs_demand * c['open_demand_pool'])
        daily_subs = round(monthly_subs / wd, 1)
        monthly_interviews = c['target_interviews_day'] * wd

        # Section C
        sub_int_required = round(monthly_interviews / monthly_subs, 3) if monthly_subs else 0
        expected_selects = round(monthly_interviews * c['int_sel_target'])

        # Recruiter capacity for this customer (primary + secondary assignment)
        cust_rec_cap_day = sum(
            r['subs_per_day'] for r in recruiters
            if r['primary_customer'] == c['name'] or r['secondary_customer'] == c['name']
        )
        monthly_subs_capacity = cust_rec_cap_day * wd
        subs_gap = monthly_subs_capacity - monthly_subs

        interviews_per_kam = round(c['target_interviews_day'] / s['num_kams'], 1) if s['num_kams'] else 0

        cap_status = 'OK' if subs_gap >= 0 else 'SHORTFALL'

        c.update({
            'gross_po': round(gross_po, 2),
            'obs_needed': obs_needed,
            'selects_needed': selects_needed,
            'daily_selects': daily_selects,
            'daily_obs': daily_obs,
            'avg_subs_demand': round(avg_subs_demand, 2),
            'monthly_subs': monthly_subs,
            'daily_subs': daily_subs,
            'monthly_interviews': monthly_interviews,
            'sub_int_required': sub_int_required,
            'expected_selects': expected_selects,
            'monthly_subs_capacity': monthly_subs_capacity,
            'subs_gap': subs_gap,
            'interviews_per_kam': interviews_per_kam,
            'cap_status': cap_status,
        })
        cust_metrics.append(c)
        total_subs_needed += monthly_subs
        total_monthly_interviews += monthly_interviews
        total_selects_needed += selects_needed
        total_obs_needed += obs_needed

    # Pod-level capacity
    rec_cap_day = s['subs_per_recruiter_day'] * s['num_recruiters']
    subs_day = round(total_subs_needed / wd)
    rec_gap = rec_cap_day - subs_day
    recs_needed = max(0, (-rec_gap + s['subs_per_recruiter_day'] - 1) // s['subs_per_recruiter_day']) if rec_gap < 0 else 0

    int_day = round(total_monthly_interviews / wd)
    kam_cap_day = s['interviews_per_kam_day'] * s['num_kams']
    kam_gap = kam_cap_day - int_day
    kams_needed = max(0, (-kam_gap + s['interviews_per_kam_day'] - 1) // s['interviews_per_kam_day']) if kam_gap < 0 else 0

    return {
        'gross_po_needed': round(gross_po_needed, 2),
        'target_onboards': target_onboards,
        'avg_po_per_ob_blended': avg_po_per_ob_blended,
        'customers': cust_metrics,
        'total_subs_needed': total_subs_needed,
        'total_monthly_interviews': total_monthly_interviews,
        'total_selects_needed': total_selects_needed,
        'total_obs_needed': total_obs_needed,
        'rec_cap_day': rec_cap_day,
        'subs_day': subs_day,
        'rec_gap': rec_gap,
        'recs_needed': int(recs_needed),
        'int_day': int_day,
        'kam_cap_day': kam_cap_day,
        'kam_gap': kam_gap,
        'kams_needed': int(kams_needed),
    }


def _get_week_info(date_str):
    """Return (week_num, week_start, week_end, week_label) for the given date, or None if not in a known week."""
    d = date.fromisoformat(date_str)
    weeks = [
        (1, date(2026,6,1),  date(2026,6,5),  'Week 1 (Jun 1–5)'),
        (2, date(2026,6,8),  date(2026,6,12), 'Week 2 (Jun 8–12)'),
        (3, date(2026,6,15), date(2026,6,19), 'Week 3 (Jun 15–19)'),
        (4, date(2026,6,22), date(2026,6,26), 'Week 4 (Jun 22–26)'),
        (5, date(2026,6,29), date(2026,6,30), 'Week 5 (Jun 29–30)'),
    ]
    for wnum, wstart, wend, wlabel in weeks:
        if wstart <= d <= wend:
            return wnum, wstart.isoformat(), wend.isoformat(), wlabel
    return None, None, None, None


def get_active_setup():
    conn = get_db()
    setup = row_to_dict(conn.execute('SELECT * FROM setup ORDER BY id DESC LIMIT 1').fetchone())
    if not setup:
        conn.close()
        return None, [], [], {}
    sid = setup['id']
    customers = rows_to_list(conn.execute('SELECT * FROM customers WHERE setup_id=? ORDER BY sort_order', (sid,)).fetchall())
    recruiters = rows_to_list(conn.execute('SELECT * FROM recruiters WHERE setup_id=? ORDER BY name', (sid,)).fetchall())
    conn.close()
    metrics = compute_metrics(setup, customers, recruiters)
    return setup, customers, recruiters, metrics


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route('/')
def dashboard():
    setup, customers, recruiters, metrics = get_active_setup()
    conn = get_db()
    sid = setup['id']
    kams_raw = rows_to_list(conn.execute('SELECT * FROM kams WHERE setup_id=? ORDER BY id', (sid,)).fetchall())
    for k in kams_raw:
        k['customer_targets'] = json.loads(k['customer_targets'])
    # Weekly OB targets: {customer_id: {week_num: ob_target}}
    weekly_rows = rows_to_list(conn.execute(
        'SELECT * FROM weekly_ob_targets WHERE setup_id=? ORDER BY customer_id, week_num', (sid,)).fetchall())
    weeks_meta = [(1,'W1\nJun 1–5'),(2,'W2\nJun 8–12'),(3,'W3\nJun 15–19'),(4,'W4\nJun 22–26'),(5,'W5\nJun 29–30')]
    conn.close()
    return render_template('dashboard.html', setup=setup, metrics=metrics, kams=kams_raw,
                           weekly_rows=weekly_rows, weeks_meta=weeks_meta)


@app.route('/assumptions', methods=['GET', 'POST'])
def assumptions():
    setup, customers, recruiters, metrics = get_active_setup()
    if request.method == 'POST':
        conn = get_db()
        sid = setup['id']
        f = request.form

        conn.execute('''UPDATE setup SET pod_name=?,month=?,net_po_target=?,exit_budget=?,
                        working_days=?,target_selects_month=?,sel_ob_rate=?,repeat_demand_pct_global=?,
                        subs_per_recruiter_day=?,num_recruiters=?,interviews_per_kam_day=?,num_kams=?
                        WHERE id=?''',
                     (f.get('pod_name'), f.get('month'),
                      float(f.get('net_po_target', 100)),
                      float(f.get('exit_budget', 5)),
                      int(f.get('working_days', 22)),
                      int(f.get('target_selects_month', 50)),
                      float(f.get('sel_ob_rate', 0.8)),
                      float(f.get('repeat_demand_pct_global', 0.8)),
                      int(f.get('subs_per_recruiter_day', 6)),
                      int(f.get('num_recruiters', 16)),
                      int(f.get('interviews_per_kam_day', 12)),
                      int(f.get('num_kams', 4)),
                      sid))

        cust_ids = request.form.getlist('cust_id')
        for i, cid in enumerate(cust_ids):
            conn.execute('''UPDATE customers SET
                net_po_target=?, exit_alloc=?, avg_po_per_ob=?, may_carryforward_obs=?,
                open_demand_pool=?, repeat_demand_pct=?, subs_repeat=?, subs_new_phase1=?,
                subs_new_phase2=?, target_interviews_day=?,
                sub_int_historical=?, int_sel_historical=?, int_sel_target=?,
                sel_ob_tat_historical=?, sel_ob_tat_target=?, screen_reject_rate=?
                WHERE id=? AND setup_id=?''',
                         (
                             float(request.form.getlist('net_po_target[]')[i] or 0),
                             float(request.form.getlist('exit_alloc[]')[i] or 0),
                             float(request.form.getlist('avg_po_per_ob[]')[i] or 2),
                             int(request.form.getlist('may_carryforward_obs[]')[i] or 0),
                             int(request.form.getlist('open_demand_pool[]')[i] or 0),
                             float(request.form.getlist('repeat_demand_pct[]')[i] or 0.8),
                             int(request.form.getlist('subs_repeat[]')[i] or 4),
                             int(request.form.getlist('subs_new_phase1[]')[i] or 2),
                             int(request.form.getlist('subs_new_phase2[]')[i] or 2),
                             int(request.form.getlist('target_interviews_day[]')[i] or 10),
                             float(request.form.getlist('sub_int_historical[]')[i] or 0),
                             float(request.form.getlist('int_sel_historical[]')[i] or 0),
                             float(request.form.getlist('int_sel_target[]')[i] or 0),
                             int(request.form.getlist('sel_ob_tat_historical[]')[i] or 0),
                             int(request.form.getlist('sel_ob_tat_target[]')[i] or 0),
                             float(request.form.getlist('screen_reject_rate[]')[i] or 0),
                             int(cid), sid,
                         ))
        conn.commit()
        conn.close()
        return redirect(url_for('assumptions'))

    return render_template('assumptions.html', setup=setup, customers=customers, metrics=metrics)


@app.route('/recruiters', methods=['GET', 'POST'])
def recruiters_page():
    setup, customers, recruiters, metrics = get_active_setup()
    if request.method == 'POST':
        action = request.form.get('action')
        conn = get_db()
        sid = setup['id']
        if action == 'save':
            ids = request.form.getlist('rec_id')
            for i, rid in enumerate(ids):
                conn.execute('''UPDATE recruiters SET name=?, subs_per_day=?, primary_customer=?, secondary_customer=?, notes=?
                                WHERE id=? AND setup_id=?''',
                             (request.form.getlist('rec_name[]')[i],
                              int(request.form.getlist('rec_subs_day[]')[i] or 6),
                              request.form.getlist('rec_primary[]')[i],
                              request.form.getlist('rec_secondary[]')[i],
                              request.form.getlist('rec_notes[]')[i],
                              int(rid), sid))
        elif action == 'add':
            conn.execute('''INSERT INTO recruiters (setup_id, name, subs_per_day, primary_customer, secondary_customer)
                            VALUES (?,?,?,?,?)''',
                         (sid, request.form.get('new_name', 'New Recruiter'), 6, '', ''))
        elif action == 'delete':
            rid = request.form.get('rec_id')
            conn.execute('DELETE FROM recruiters WHERE id=? AND setup_id=?', (int(rid), sid))
        conn.commit()
        conn.close()
        return redirect(url_for('recruiters_page'))

    return render_template('recruiters.html', setup=setup, customers=customers, recruiters=recruiters, metrics=metrics)


@app.route('/daily', methods=['GET', 'POST'])
def daily():
    setup, customers, recruiters, metrics = get_active_setup()
    if not setup:
        return redirect(url_for('dashboard'))

    today = date.today().isoformat()
    sel_date = request.args.get('date', today)

    if request.method == 'POST':
        conn = get_db()
        sid = setup['id']
        entry_date = request.form.get('entry_date', sel_date)
        cust_ids = request.form.getlist('cust_id')
        for i, cid in enumerate(cust_ids):
            conn.execute('''INSERT INTO daily_actuals (setup_id, customer_id, date, actual_subs, actual_interviews, actual_selects, actual_obs)
                            VALUES (?,?,?,?,?,?,?)
                            ON CONFLICT(customer_id, date) DO UPDATE SET
                            actual_subs=excluded.actual_subs,
                            actual_interviews=excluded.actual_interviews,
                            actual_selects=excluded.actual_selects,
                            actual_obs=excluded.actual_obs''',
                         (sid, int(cid), entry_date,
                          int(request.form.getlist('actual_subs[]')[i] or 0),
                          int(request.form.getlist('actual_interviews[]')[i] or 0),
                          int(request.form.getlist('actual_selects[]')[i] or 0),
                          int(request.form.getlist('actual_obs[]')[i] or 0)))
        conn.commit()
        conn.close()
        return redirect(url_for('daily', date=entry_date))

    conn = get_db()
    sid = setup['id']
    actuals_rows = conn.execute(
        'SELECT * FROM daily_actuals WHERE setup_id=? AND date=?', (sid, sel_date)
    ).fetchall()
    actuals = {r['customer_id']: dict(r) for r in actuals_rows}

    month_prefix = sel_date[:7]
    monthly_rows = conn.execute(
        '''SELECT customer_id,
                  SUM(actual_subs) as subs, SUM(actual_interviews) as interviews,
                  SUM(actual_selects) as selects, SUM(actual_obs) as obs,
                  COUNT(DISTINCT date) as days_entered
           FROM daily_actuals WHERE setup_id=? AND date LIKE ?
           GROUP BY customer_id''',
        (sid, f'{month_prefix}%')
    ).fetchall()
    monthly_actuals = {r['customer_id']: dict(r) for r in monthly_rows}

    # Weekly OB data for current week
    wnum, wstart, wend, wlabel = _get_week_info(sel_date)
    week_ob_targets = {}
    week_ob_actuals = {}
    if wnum:
        wtgts = rows_to_list(conn.execute(
            'SELECT customer_id, ob_target, week_label FROM weekly_ob_targets WHERE setup_id=? AND week_num=?',
            (sid, wnum)).fetchall())
        week_ob_targets = {r['customer_id']: r for r in wtgts}

        wact_rows = conn.execute(
            '''SELECT customer_id, SUM(actual_obs) as obs
               FROM daily_actuals WHERE setup_id=? AND date>=? AND date<=?
               GROUP BY customer_id''',
            (sid, wstart, wend)).fetchall()
        week_ob_actuals = {r['customer_id']: r['obs'] or 0 for r in wact_rows}

    working_days_list = _get_working_days(sel_date)
    conn.close()

    return render_template('daily.html',
                           setup=setup,
                           customers=metrics['customers'],
                           actuals=actuals,
                           monthly_actuals=monthly_actuals,
                           sel_date=sel_date,
                           working_days=working_days_list,
                           metrics=metrics,
                           week_num=wnum,
                           week_label=wlabel,
                           week_ob_targets=week_ob_targets,
                           week_ob_actuals=week_ob_actuals)


def _get_working_days(ref_date_str: str):
    d = date.fromisoformat(ref_date_str)
    first = d.replace(day=1)
    last_day = calendar.monthrange(d.year, d.month)[1]
    last = d.replace(day=last_day)
    days = []
    cur = first
    while cur <= last:
        if cur.weekday() < 5:
            days.append(cur.isoformat())
        cur += timedelta(days=1)
    return days


@app.route('/plan')
def monthly_plan():
    import math
    setup, customers, recruiters, metrics = get_active_setup()
    working_days = _get_working_days(date.today().isoformat())

    customer_plans = []
    for c in metrics['customers']:
        monthly_target = c['monthly_subs']
        # Max subs this customer can receive per day (all assigned recruiters)
        max_per_day = sum(
            r['subs_per_day'] for r in recruiters
            if r['primary_customer'] == c['name'] or r['secondary_customer'] == c['name']
        )
        if max_per_day == 0:
            daily_plan = [0] * len(working_days)
            days_needed = 0
        else:
            days_needed = math.ceil(monthly_target / max_per_day)
            days_needed = min(days_needed, len(working_days))
            flat = monthly_target / len(working_days)

            if flat <= max_per_day:
                # Distribute evenly — base + 1 for the first `remainder` days
                base = monthly_target // len(working_days)
                extra = monthly_target % len(working_days)
                daily_plan = [base + (1 if i < extra else 0) for i in range(len(working_days))]
            else:
                # Shortfall: max out each day until target is met, rest = 0
                daily_plan = []
                remaining = monthly_target
                for i in range(len(working_days)):
                    if remaining >= max_per_day:
                        daily_plan.append(max_per_day)
                        remaining -= max_per_day
                    elif remaining > 0:
                        daily_plan.append(remaining)
                        remaining = 0
                    else:
                        daily_plan.append(0)

        active_days = sum(1 for d in daily_plan if d > 0)
        buffer_days = len(working_days) - active_days
        customer_plans.append({
            'name': c['name'],
            'monthly_target': monthly_target,
            'max_per_day': max_per_day,
            'daily_target': c['daily_subs'],
            'days_needed': days_needed,
            'buffer_days': buffer_days,
            'daily_plan': daily_plan,
            'shortfall': flat > max_per_day if max_per_day else True,
        })

    return render_template('plan.html',
                           setup=setup, metrics=metrics,
                           working_days=working_days,
                           customer_plans=customer_plans)


@app.route('/api/metrics')
def api_metrics():
    setup, customers, recruiters, metrics = get_active_setup()
    return jsonify(metrics)


@app.route('/api/compute', methods=['POST'])
def api_compute():
    """Live recalc: receives current form values, returns computed metrics without saving to DB."""
    f = request.form

    setup = {
        'net_po_target':            float(f.get('net_po_target') or 0),
        'exit_budget':              float(f.get('exit_budget') or 0),
        'working_days':             max(1, int(f.get('working_days') or 1)),
        'target_selects_month':     int(f.get('target_selects_month') or 0),
        'sel_ob_rate':              float(f.get('sel_ob_rate') or 0),
        'repeat_demand_pct_global': float(f.get('repeat_demand_pct_global') or 0),
        'subs_per_recruiter_day':   max(1, int(f.get('subs_per_recruiter_day') or 1)),
        'num_recruiters':           int(f.get('num_recruiters') or 0),
        'interviews_per_kam_day':   max(1, int(f.get('interviews_per_kam_day') or 1)),
        'num_kams':                 max(1, int(f.get('num_kams') or 1)),
    }

    cust_ids   = f.getlist('cust_id')
    cust_names = f.getlist('cust_name')

    def _fl(key, i):  return float(f.getlist(key)[i] or 0) if i < len(f.getlist(key)) else 0
    def _int(key, i): return int(f.getlist(key)[i] or 0)   if i < len(f.getlist(key)) else 0

    customers = []
    for i, cid in enumerate(cust_ids):
        customers.append({
            'id':                    int(cid),
            'name':                  cust_names[i] if i < len(cust_names) else '',
            'net_po_target':         _fl('net_po_target[]', i),
            'exit_alloc':            _fl('exit_alloc[]', i),
            'avg_po_per_ob':         _fl('avg_po_per_ob[]', i) or 1,
            'open_demand_pool':      _int('open_demand_pool[]', i),
            'repeat_demand_pct':     _fl('repeat_demand_pct[]', i),
            'subs_repeat':           _int('subs_repeat[]', i),
            'subs_new_phase1':       _int('subs_new_phase1[]', i),
            'subs_new_phase2':       _int('subs_new_phase2[]', i),
            'target_interviews_day': _int('target_interviews_day[]', i),
            'int_sel_target':        _fl('int_sel_target[]', i),
            'may_carryforward_obs':  0,
            'sub_int_historical':    0,
            'int_sel_historical':    0,
            'sel_ob_tat_historical': 0,
            'sel_ob_tat_target':     0,
            'screen_reject_rate':    0,
            'sort_order':            i,
        })

    conn = get_db()
    sid_row = conn.execute('SELECT id FROM setup ORDER BY id DESC LIMIT 1').fetchone()
    recruiters = rows_to_list(
        conn.execute('SELECT * FROM recruiters WHERE setup_id=?', (sid_row['id'],)).fetchall()
    ) if sid_row else []
    conn.close()

    metrics = compute_metrics(setup, customers, recruiters)
    return jsonify(metrics)


if __name__ == '__main__':
    init_db()
    print('🚀  Target Model Server → http://localhost:8090')
    app.run(debug=True, port=8090)
