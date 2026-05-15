/**
 * Generates the multi-sheet pod report Excel exactly matching the
 * "Mehr Pod" format — one sheet per recruiter plus Leaderboard,
 * Demand Status, Dashboard, KAM Accountability, DL Allocation, Bottleneck.
 */
import ExcelJS from 'exceljs';

// ── Colour palette (matches original) ────────────────────────────────────────
const C = {
  darkBlue:    '1a2744',
  blue:        '1e40af',
  teal:        '0f766e',
  amber:       'b45309',
  violet:      '6d28d9',
  green:       '166534',
  red:         '991b1b',
  orange:      'c2410c',
  white:       'FFFFFF',
  headerBg:    'dbeafe',
  sectionBg:   'f0fdf4',
  subTotalBg:  'fef9c3',
  totalBg:     'fde68a',
  lightGray:   'f1f5f9',
  midGray:     'e2e8f0',
  darkText:    '1a202c',
};

type Fill = ExcelJS.Fill;
type Alignment = Partial<ExcelJS.Alignment>;

const fill = (hex: string): Fill => ({
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex },
});
const font = (bold: boolean, color = C.darkText, sz = 10): Partial<ExcelJS.Font> => ({
  bold, color: { argb: 'FF' + color }, size: sz, name: 'Arial',
});
const border = (): Partial<ExcelJS.Borders> => ({
  top:    { style: 'thin', color: { argb: 'FFcbd5e1' } },
  bottom: { style: 'thin', color: { argb: 'FFcbd5e1' } },
  left:   { style: 'thin', color: { argb: 'FFcbd5e1' } },
  right:  { style: 'thin', color: { argb: 'FFcbd5e1' } },
});
const hdrCell = (ws: ExcelJS.Worksheet, addr: string, val: string,
                 bgHex: string, fgHex = C.white, bold = true, sz = 10) => {
  const cell = ws.getCell(addr);
  cell.value = val;
  cell.fill   = fill(bgHex);
  cell.font   = font(bold, fgHex, sz);
  cell.border = border();
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
};
const dataCell = (ws: ExcelJS.Worksheet, addr: string, val: unknown,
                  bgHex = C.white, bold = false, align: Alignment['horizontal'] = 'left') => {
  const cell = ws.getCell(addr);
  cell.value = val as ExcelJS.CellValue;
  if (bgHex !== C.white) cell.fill = fill(bgHex);
  cell.font   = font(bold, C.darkText, 10);
  cell.border = border();
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: false };
};

// Status → background colour
const statusBg: Record<string, string> = {
  'Sourced':               'e0f2fe',
  'Pool Verified':         'f0fdf4',
  'Handed To Recruiter':   'fef9c3',
  'Call In Progress':      'fef3c7',
  'Ready For Validation':  'e0e7ff',
  'Validated':             'dcfce7',
  'Needs Rework':          'fee2e2',
  'On Hold':               'f1f5f9',
  'Rejected':              'fecaca',
  'Submitted To Client':   'dbeafe',
  'Interview Stage':       'ede9fe',
  'Offer Rolled Out':      'd1fae5',
  'Joined':                'bbf7d0',
  'Backed Out':            'f8fafc',
};

const scoreBg = (v: string) => {
  const n = parseFloat(v);
  if (isNaN(n)) return C.white;
  if (n >= 4)    return 'dcfce7';
  if (n >= 3.25) return 'fef9c3';
  return 'fee2e2';
};

// ── Sheet: 1. Todays Leaderboard ─────────────────────────────────────────────
function buildLeaderboard(wb: ExcelJS.Workbook, data: PodReport) {
  const ws = wb.addWorksheet('1. Todays Leaderboard');
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  ws.properties.defaultRowHeight = 20;

  // Row 1: pod header
  ws.mergeCells('A1:M1');
  const t = ws.getCell('A1');
  t.value = `J2W RECRUITER TRACKER  ·  TODAY'S LEADERBOARD  ·  ${data.pod_stats.report_date}`;
  t.fill = fill(C.darkBlue); t.font = font(true, C.white, 13);
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;

  // Row 2: pod stats bar
  ws.mergeCells('A2:M2');
  const s = ws.getCell('A2');
  s.value = `Pod total demands: ${data.pod_stats.total_demands}  ·  Sourced: ${data.pod_stats.total_sourced}  ·  Submitted: ${data.pod_stats.total_submitted}  ·  L1: ${data.pod_stats.total_l1}  ·  L2: ${data.pod_stats.total_l2}  ·  Selections: ${data.pod_stats.total_selections}  ·  Today subs: ${data.pod_stats.today_subs}`;
  s.fill = fill(C.blue); s.font = font(true, C.white, 10);
  s.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 22;

  // Row 3: blank separator
  ws.getRow(3).height = 8;

  // ── Section A: Recruiter Leaderboard ──────────────────────────────────────
  const recHdrs = ['Recruiter', 'Type', 'DL', 'Active Calls', 'Sourced MTD', 'Submitted MTD', 'L1 MTD', 'Selections MTD', 'Overall Score Avg', 'Status'];
  const recCols = [20, 10, 18, 14, 13, 15, 8, 15, 18, 15];
  ws.columns = recCols.map(w => ({ width: w }));

  ws.mergeCells('A4:J4');
  hdrCell(ws, 'A4', '▼  RECRUITER LEADERBOARD', C.teal, C.white, true, 11);
  ws.getRow(4).height = 22;

  const recHdrRow = ws.getRow(5);
  recHdrRow.height = 18;
  recHdrs.forEach((h, i) => hdrCell(ws, `${String.fromCharCode(65+i)}5`, h, C.lightGray, C.darkText, true, 9));

  let row = 6;
  for (const r of data.recruiters) {
    const scores = r.candidates.map(c => parseFloat(c.overall_score)).filter(n => !isNaN(n));
    const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '—';
    const sourced  = r.candidates.length;
    const submitted = r.candidates.filter(c => c.submitted_to_client).length;
    const l1 = r.candidates.filter(c => ['l1_scheduled','l1_cleared','l1_feedback_pending','l1_rejected','l2_scheduled','l2_cleared','l2_rejected','final_scheduled','final_cleared','final_rejected','offer_rolled_out','joined'].includes(c.current_stage)).length;
    const sels = r.candidates.filter(c => ['joined','final_cleared','offer_accepted'].includes(c.current_stage)).length;
    const vals = [r.name, r.recruiter_type, r.dl_name, r.calling_load, sourced, submitted, l1, sels, avgScore,
                  sourced >= 5 ? '✓ Active' : sourced >= 2 ? '~ Building' : '○ Not started'];
    const bg = row % 2 === 0 ? C.white : C.lightGray;
    vals.forEach((v, i) => dataCell(ws, `${String.fromCharCode(65+i)}${row}`, v, bg, i === 0, i >= 3 ? 'center' : 'left'));
    row++;
  }

  // totals row
  dataCell(ws, `A${row}`, 'POD TOTAL', C.totalBg, true, 'left');
  dataCell(ws, `D${row}`, data.recruiters.reduce((s, r) => s + r.calling_load, 0), C.totalBg, true, 'center');
  dataCell(ws, `E${row}`, data.pod_stats.total_sourced, C.totalBg, true, 'center');
  dataCell(ws, `F${row}`, data.pod_stats.total_submitted, C.totalBg, true, 'center');
  dataCell(ws, `G${row}`, data.pod_stats.total_l1, C.totalBg, true, 'center');
  dataCell(ws, `H${row}`, data.pod_stats.total_selections, C.totalBg, true, 'center');
  ws.getRow(row).height = 20;
  row += 2;

  // ── Section B: KAM Accountability Summary ─────────────────────────────────
  ws.mergeCells(`A${row}:J${row}`);
  hdrCell(ws, `A${row}`, '▼  KAM ACCOUNTABILITY SUMMARY', C.violet, C.white, true, 11);
  ws.getRow(row).height = 22;
  row++;

  const kamHdrs = ['KAM', 'Open Demands', 'Total Sourced', 'Total Submitted', '→ L1', '→ L2', 'Selections', '% Sub→L1', '% L1→L2', '% L2→Sel'];
  kamHdrs.forEach((h, i) => hdrCell(ws, `${String.fromCharCode(65+i)}${row}`, h, C.lightGray, C.darkText, true, 9));
  ws.getRow(row).height = 18;
  row++;

  for (const k of data.kam_data) {
    const subs   = k.demands.reduce((s, d) => s + d.total_submitted, 0);
    const l1     = k.demands.reduce((s, d) => s + d.l1_count, 0);
    const l2     = k.demands.reduce((s, d) => s + d.l2_count, 0);
    const sel    = k.demands.reduce((s, d) => s + d.selections, 0);
    const src    = k.demands.reduce((s, d) => s + d.total_sourced, 0);
    const bg = row % 2 === 0 ? C.white : C.lightGray;
    const vals = [k.kam_name, k.demands.length, src, subs, l1, l2, sel,
                  subs ? `${Math.round(l1/subs*100)}%` : '—',
                  l1 ? `${Math.round(l2/l1*100)}%` : '—',
                  l2 ? `${Math.round(sel/l2*100)}%` : '—'];
    vals.forEach((v, i) => dataCell(ws, `${String.fromCharCode(65+i)}${row}`, v, bg, i === 0, i >= 1 ? 'center' : 'left'));
    row++;
  }
}

// ── Sheet: 2a. Demand Status ──────────────────────────────────────────────────
function buildDemandStatus(wb: ExcelJS.Workbook, data: PodReport) {
  const ws = wb.addWorksheet('2a. Demand Status');
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 5 }];

  // Title
  ws.mergeCells('A1:AK1');
  const t = ws.getCell('A1');
  t.value = `DEMAND STATUS  ·  ${data.pod_stats.report_date}  ·  ${data.pod_stats.total_demands} open demands`;
  t.fill = fill(C.darkBlue); t.font = font(true, C.white, 12);
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;

  // Notes row
  ws.mergeCells('A2:AK2');
  const n = ws.getCell('A2');
  n.value = 'IDENTITY columns: Customer, Demand ID, KAM, DL, Recruiter — manual inputs. ACTIVITY columns: Subs, L1, L2, Selections — auto from tracker DB.';
  n.fill = fill('fef9c3'); n.font = font(false, C.amber, 9);
  n.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(2).height = 16;

  // Blank rows 3-4, then headers at row 5
  ws.getRow(3).height = 6;
  ws.getRow(4).height = 6;

  const COLS: { label: string; w: number }[] = [
    { label: 'Customer',        w: 16 },
    { label: 'Demand ID',       w: 12 },
    { label: 'Demand Type',     w: 12 },
    { label: 'Date Opened',     w: 12 },
    { label: 'Skill / Role',    w: 25 },
    { label: '# Positions',     w: 10 },
    { label: 'Priority',        w: 10 },
    { label: 'Notes',           w: 20 },
    { label: '',                w: 4  },  // I - spacer
    { label: 'KAM',             w: 14 },
    { label: 'DL',              w: 14 },
    { label: 'Sourcer',         w: 16 },
    { label: '',                w: 4  },  // M - spacer
    { label: 'Total Subs',      w: 10 },
    { label: 'Last Sub Date',   w: 12 },
    { label: '',                w: 4  },  // P
    { label: 'Sub Rejected',    w: 10 },
    { label: '',                w: 4  },
    { label: '',                w: 4  },
    { label: 'L1 Done',         w: 10 },
    { label: 'L1 Date',         w: 12 },
    { label: '',                w: 4  },
    { label: 'L1 Rejected',     w: 10 },
    { label: '',                w: 4  },
    { label: '',                w: 4  },
    { label: 'L2 Done',         w: 10 },
    { label: 'L2 Date',         w: 12 },
    { label: '',                w: 4  },
    { label: 'L2 Rejected',     w: 10 },
    { label: '',                w: 4  },
    { label: '',                w: 4  },
    { label: 'Selections',      w: 10 },
    { label: 'Sel Date',        w: 12 },
    { label: '',                w: 4  },
    { label: '',                w: 4  },
    { label: 'Sourcing Target', w: 14 },
    { label: 'Status',          w: 14 },
    { label: 'Bottleneck',      w: 22 },
  ];

  ws.columns = COLS.map(c => ({ width: c.w }));

  // Header row at row 5
  const headerBgs = [
    C.teal, C.teal, C.teal, C.teal, C.teal, C.teal, C.teal, C.teal, C.white,
    C.violet, C.violet, C.violet, C.white,
    C.blue, C.blue, C.white, C.blue, C.white, C.white,
    C.orange, C.orange, C.white, C.orange, C.white, C.white,
    C.darkBlue, C.darkBlue, C.white, C.darkBlue, C.white, C.white,
    C.green, C.green, C.white, C.white,
    C.amber, C.red, C.orange,
  ];
  COLS.forEach((c, i) => {
    if (c.label) {
      hdrCell(ws, `${colLetter(i)}5`, c.label, headerBgs[i] || C.lightGray, C.white, true, 9);
    }
  });
  ws.getRow(5).height = 22;

  // Data rows from row 6
  let row = 6;
  let prevClient = '';
  for (const j of data.jobs) {
    const isNewClient = j.client_name !== prevClient;
    prevClient = j.client_name;
    const bg = isNewClient ? C.headerBg : (row % 2 === 0 ? C.white : C.lightGray);

    const bottleneck = j.today_subs === 0 && j.total_sourced === 0 ? '⚠ NO SUBS yet'
                     : j.selections > 0 ? '✓ Selections logged'
                     : j.l2_count > 0 ? '~ In L2'
                     : j.l1_count > 0 ? '~ In L1'
                     : j.total_submitted > 0 ? '⚠ Subs awaiting feedback'
                     : j.total_sourced > 0 ? '~ Sourced, not submitted'
                     : '○ No subs yet';

    const rowData: (string | number)[] = [
      j.client_name, j.client_job_id, j.demand_type, j.created_at,
      j.role_title, j.headcount, '', '', '',
      j.kam_name, j.dl_name, [...new Set([...(j.sourcer_names??[]),...(j.caller_names??[])])].join(', '), '',
      j.total_submitted, '', '', j.rejections, '', '',
      j.l1_count, '', '', '', '', '',
      j.l2_count, '', '', '', '', '',
      j.selections, '', '', '',
      j.sourcing_target ?? '', j.status.replace(/_/g,' '), bottleneck,
    ];

    rowData.forEach((v, i) => {
      const scoreBgHex = i === 36 ? (j.selections > 0 ? 'dcfce7' : j.l1_count > 0 ? 'fef9c3' : 'fee2e2') : bg;
      dataCell(ws, `${colLetter(i)}${row}`, v, i === 37 ? scoreBgHex : bg, i === 0 || i === 4, i >= 5 && i !== 9 && i !== 10 && i !== 11 && i !== 12 ? 'center' : 'left');
    });
    ws.getRow(row).height = 18;
    row++;
  }

  // Totals row
  const totCols: Record<number, number> = {
    5: data.jobs.reduce((s, j) => s + j.headcount, 0),
    13: data.pod_stats.total_submitted,
    16: data.jobs.reduce((s, j) => s + j.rejections, 0),
    19: data.pod_stats.total_l1,
    25: data.pod_stats.total_l2,
    31: data.pod_stats.total_selections,
  };
  dataCell(ws, `A${row}`, 'POD TOTAL', C.totalBg, true, 'left');
  Object.entries(totCols).forEach(([col, val]) => {
    dataCell(ws, `${colLetter(Number(col))}${row}`, val, C.totalBg, true, 'center');
  });
  ws.getRow(row).height = 20;
}

// ── Sheet: 3. Dashboard ───────────────────────────────────────────────────────
function buildDashboard(wb: ExcelJS.Workbook, data: PodReport) {
  const ws = wb.addWorksheet('3. Dashboard');
  ws.columns = [{ width: 22 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 12 }];
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  ws.mergeCells('A1:F1');
  const t = ws.getCell('A1');
  t.value = `POD DASHBOARD  ·  ${data.pod_stats.report_date}`;
  t.fill = fill(C.darkBlue); t.font = font(true, C.white, 13);
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 8;

  // Section A: Pod-level headline
  ws.mergeCells('A3:F3');
  hdrCell(ws, 'A3', '▼  POD-LEVEL PLAN vs MTD', C.darkBlue, C.white, true, 11);
  ws.getRow(3).height = 22;

  const hdrs = ['Metric', 'Plan', 'MTD Actual', '% of Plan', '', ''];
  hdrs.forEach((h, i) => { if (h) hdrCell(ws, `${colLetter(i)}4`, h, C.lightGray, C.darkText, true, 9); });
  ws.getRow(4).height = 18;

  const metrics = [
    ['Demands',    data.pod_stats.total_demands,   data.pod_stats.total_demands,   '100%'],
    ['Sourced',    '—',  data.pod_stats.total_sourced,   '—'],
    ['Submitted',  '—',  data.pod_stats.total_submitted, '—'],
    ['L1 Interviews', '—', data.pod_stats.total_l1,      '—'],
    ['L2 Interviews', '—', data.pod_stats.total_l2,      '—'],
    ['Selections',    '—', data.pod_stats.total_selections, '—'],
  ];
  metrics.forEach(([m, plan, mtd, pct], i) => {
    const bg = i % 2 === 0 ? C.white : C.lightGray;
    dataCell(ws, `A${5 + i}`, m as string, bg, true);
    dataCell(ws, `B${5 + i}`, plan as string, bg, false, 'center');
    dataCell(ws, `C${5 + i}`, mtd as string | number, bg, true, 'center');
    dataCell(ws, `D${5 + i}`, pct as string, bg, false, 'center');
  });
  ws.getRow(11).height = 8;

  // Section B: Per-client breakdown
  ws.mergeCells('A12:F12');
  hdrCell(ws, 'A12', '▼  PER-CLIENT BREAKDOWN', C.blue, C.white, true, 11);
  ws.getRow(12).height = 22;

  const clientHdrs = ['Client', 'Demands', 'Sourced', 'Submitted', 'L1', 'Selections'];
  clientHdrs.forEach((h, i) => hdrCell(ws, `${colLetter(i)}13`, h, C.lightGray, C.darkText, true, 9));

  // Group jobs by client
  const byClient: Record<string, typeof data.jobs> = {};
  for (const j of data.jobs) {
    byClient[j.client_name] = byClient[j.client_name] || [];
    byClient[j.client_name].push(j);
  }
  let row = 14;
  for (const [client, jds] of Object.entries(byClient).sort()) {
    const bg = row % 2 === 0 ? C.white : C.lightGray;
    dataCell(ws, `A${row}`, client, bg, true);
    dataCell(ws, `B${row}`, jds.length, bg, false, 'center');
    dataCell(ws, `C${row}`, jds.reduce((s, j) => s + j.total_sourced, 0), bg, false, 'center');
    dataCell(ws, `D${row}`, jds.reduce((s, j) => s + j.total_submitted, 0), bg, false, 'center');
    dataCell(ws, `E${row}`, jds.reduce((s, j) => s + j.l1_count, 0), bg, false, 'center');
    dataCell(ws, `F${row}`, jds.reduce((s, j) => s + j.selections, 0), bg, false, 'center');
    row++;
  }
  // Pod total
  dataCell(ws, `A${row}`, 'POD TOTAL', C.totalBg, true);
  dataCell(ws, `B${row}`, data.pod_stats.total_demands, C.totalBg, true, 'center');
  dataCell(ws, `C${row}`, data.pod_stats.total_sourced, C.totalBg, true, 'center');
  dataCell(ws, `D${row}`, data.pod_stats.total_submitted, C.totalBg, true, 'center');
  dataCell(ws, `E${row}`, data.pod_stats.total_l1, C.totalBg, true, 'center');
  dataCell(ws, `F${row}`, data.pod_stats.total_selections, C.totalBg, true, 'center');
}

// ── Sheet: 6. KAM Accountability ─────────────────────────────────────────────
function buildKAMAccountability(wb: ExcelJS.Workbook, data: PodReport) {
  const ws = wb.addWorksheet('6. KAM Accountability');
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.columns = [
    { width: 12 }, { width: 16 }, { width: 25 }, { width: 16 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 28 },
  ];

  ws.mergeCells('A1:O1');
  const t = ws.getCell('A1');
  t.value = `KAM ACCOUNTABILITY  ·  ${data.pod_stats.report_date}  ·  KAMs update funnel movement below.`;
  t.fill = fill(C.violet); t.font = font(true, C.white, 12);
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 8;

  // Column headers
  const hdrs = ['Demand ID', 'Customer', 'Skill / Role', 'Recruiter', 'D-2 Subs', 'D-1 Subs', 'Today Subs', 'Total Subs', 'Sub Rej', '→ L1', 'L1 Rej', '→ L2', 'L2 Rej', 'Selected', 'Bottleneck Status'];
  hdrs.forEach((h, i) => hdrCell(ws, `${colLetter(i)}3`, h, C.lightGray, C.darkText, true, 9));
  ws.getRow(3).height = 18;

  let row = 4;
  for (const k of data.kam_data) {
    // KAM group header
    ws.mergeCells(`A${row}:O${row}`);
    hdrCell(ws, `A${row}`, `▼  KAM: ${k.kam_name}  (${k.demands.length} demands)`, C.violet, C.white, true, 10);
    ws.getRow(row).height = 20;
    row++;

    for (const d of k.demands) {
      const bg = row % 2 === 0 ? C.white : C.lightGray;
      const bottleneck = d.selections > 0 ? '✓ Selection logged'
                       : d.l2_count > 0 ? '~ In L2 stage'
                       : d.l1_count > 0 ? `⚠ L1 awaiting feedback (${d.l1_count})`
                       : d.total_submitted > 0 ? `⚠ Subs awaiting feedback (${d.total_submitted})`
                       : '○ No subs yet';
      const recruiterName = d.sourcer_names?.join(', ') || '';
      const vals: (string | number)[] = [
        d.client_job_id, d.client_name, d.role_title, recruiterName,
        d.d2_subs, d.d1_subs, d.today_subs, d.total_submitted,
        d.rejections, d.l1_count, 0, d.l2_count, 0, d.selections,
        bottleneck,
      ];
      vals.forEach((v, i) => {
        const bgHex = i === 14
          ? (d.selections > 0 ? 'dcfce7' : d.l1_count > 0 ? 'fef9c3' : 'fee2e2')
          : bg;
        dataCell(ws, `${colLetter(i)}${row}`, v, bgHex, i < 4, i >= 4 ? 'center' : 'left');
      });
      ws.getRow(row).height = 18;
      row++;
    }

    // KAM subtotal
    const totSubs = k.demands.reduce((s, d) => s + d.total_submitted, 0);
    const totL1   = k.demands.reduce((s, d) => s + d.l1_count, 0);
    const totL2   = k.demands.reduce((s, d) => s + d.l2_count, 0);
    const totSel  = k.demands.reduce((s, d) => s + d.selections, 0);
    dataCell(ws, `A${row}`, `${k.kam_name} TOTAL`, C.subTotalBg, true);
    dataCell(ws, `H${row}`, totSubs, C.subTotalBg, true, 'center');
    dataCell(ws, `J${row}`, totL1,   C.subTotalBg, true, 'center');
    dataCell(ws, `L${row}`, totL2,   C.subTotalBg, true, 'center');
    dataCell(ws, `N${row}`, totSel,  C.subTotalBg, true, 'center');
    ws.getRow(row).height = 18;
    row += 2;
  }
}

// ── Sheet: 5. Daily DL Allocation ────────────────────────────────────────────
function buildDLAllocation(wb: ExcelJS.Workbook, data: PodReport) {
  const ws = wb.addWorksheet('5. Daily DL Allocation');
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.columns = [
    { width: 16 }, { width: 25 }, { width: 14 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 10 }, { width: 10 }, { width: 12 },
  ];

  ws.mergeCells('A1:I1');
  const t = ws.getCell('A1');
  t.value = `DAILY DL ALLOCATION  ·  ${data.pod_stats.report_date}  ·  DLs allocate demands to recruiters`;
  t.fill = fill(C.teal); t.font = font(true, C.white, 12);
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 8;

  const hdrs = ['Customer', 'Skill / Role', 'Sourcer 1', 'Caller 1', 'Target (Subs)', 'DL', 'Sourced', 'Submitted', 'Status'];
  hdrs.forEach((h, i) => hdrCell(ws, `${colLetter(i)}3`, h, C.lightGray, C.darkText, true, 9));
  ws.getRow(3).height = 18;

  let row = 4;
  for (const dl of data.dl_teams) {
    ws.mergeCells(`A${row}:I${row}`);
    hdrCell(ws, `A${row}`, `▼  DL: ${dl.dl_name}  (${dl.demands.length} demands · Team: ${dl.recruiters.join(', ')})`, C.teal, C.white, true, 10);
    ws.getRow(row).height = 20;
    row++;

    let subTotalTarget = 0, subTotalSourced = 0, subTotalSubmitted = 0;
    for (const d of dl.demands) {
      const bg = row % 2 === 0 ? C.white : C.lightGray;
      const status = d.selections > 0 ? '✓ Done' : d.total_submitted > 0 ? '~ Active' : d.total_sourced > 0 ? '⚠ Behind' : '○ Not started';
      const vals: (string | number)[] = [
        d.client_name, d.role_title,
        [...new Set([...(d.sourcer_names??[]),...(d.caller_names??[])])].join(', ') || '',
        d.sourcing_target ?? '',
        dl.dl_name,
        d.total_sourced, d.total_submitted, status,
      ];
      subTotalTarget    += d.sourcing_target ?? 0;
      subTotalSourced   += d.total_sourced;
      subTotalSubmitted += d.total_submitted;
      vals.forEach((v, i) => dataCell(ws, `${colLetter(i)}${row}`, v, bg, false, i >= 4 ? 'center' : 'left'));
      ws.getRow(row).height = 18;
      row++;
    }

    // DL subtotal
    dataCell(ws, `A${row}`, `${dl.dl_name} SUBTOTAL`, C.subTotalBg, true);
    dataCell(ws, `E${row}`, subTotalTarget,    C.subTotalBg, true, 'center');
    dataCell(ws, `G${row}`, subTotalSourced,   C.subTotalBg, true, 'center');
    dataCell(ws, `H${row}`, subTotalSubmitted, C.subTotalBg, true, 'center');
    ws.getRow(row).height = 18;
    row += 2;
  }

  // Pod grand total
  dataCell(ws, `A${row}`, 'POD GRAND TOTAL', C.totalBg, true);
  dataCell(ws, `E${row}`, data.jobs.reduce((s, j) => s + (j.sourcing_target ?? 0), 0), C.totalBg, true, 'center');
  dataCell(ws, `G${row}`, data.pod_stats.total_sourced, C.totalBg, true, 'center');
  dataCell(ws, `H${row}`, data.pod_stats.total_submitted, C.totalBg, true, 'center');
  ws.getRow(row).height = 20;
}

// ── Sheet: Bottleneck Analysis ────────────────────────────────────────────────
function buildBottleneck(wb: ExcelJS.Workbook, data: PodReport) {
  const ws = wb.addWorksheet('Bottleneck Analysis');
  ws.columns = [{ width: 12 }, { width: 16 }, { width: 25 }, { width: 12 }, { width: 20 }, { width: 30 }];
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  ws.mergeCells('A1:F1');
  const t = ws.getCell('A1');
  t.value = `BOTTLENECK ANALYSIS  ·  ${data.pod_stats.report_date}`;
  t.fill = fill(C.red); t.font = font(true, C.white, 12);
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  const hdrs = ['Demand ID', 'Customer', 'Skill / Role', 'Days Open', 'Status', 'Bottleneck Flag'];
  hdrs.forEach((h, i) => hdrCell(ws, `${colLetter(i)}2`, h, C.lightGray, C.darkText, true, 9));
  ws.getRow(2).height = 18;

  let row = 3;
  const today = new Date().toISOString().slice(0, 10);
  for (const j of data.jobs) {
    const daysOpen = j.created_at ? Math.floor((Date.parse(today) - Date.parse(j.created_at)) / 86400000) : '';
    const flag = j.selections > 0 ? '✓ Selections logged'
               : j.l2_count > 0   ? '~ In L2 stage'
               : j.l1_count > 0   ? '⚠ L1 awaiting feedback'
               : j.today_subs === 0 && j.total_submitted === 0 && j.total_sourced === 0
                 ? '⚠ NO SUBS in 3+ days'
               : j.total_submitted > 0 ? '⚠ Sub→L1 SLA breach'
               : '○ No subs yet';
    const flagBg = flag.startsWith('✓') ? 'dcfce7' : flag.startsWith('⚠') ? 'fee2e2' : flag.startsWith('~') ? 'fef9c3' : C.white;
    const bg = row % 2 === 0 ? C.white : C.lightGray;
    dataCell(ws, `A${row}`, j.client_job_id, bg, false, 'center');
    dataCell(ws, `B${row}`, j.client_name, bg, true);
    dataCell(ws, `C${row}`, j.role_title, bg, false);
    dataCell(ws, `D${row}`, daysOpen, bg, false, 'center');
    dataCell(ws, `E${row}`, j.status.replace(/_/g, ' '), bg, false);
    dataCell(ws, `F${row}`, flag, flagBg, false);
    ws.getRow(row).height = 18;
    row++;
  }
}

// ── Sheet: Per-Recruiter Workspace ────────────────────────────────────────────
function buildRecruiterSheet(wb: ExcelJS.Workbook, recruiter: RecruiterData, reportDate: string) {
  const ws = wb.addWorksheet(recruiter.name);
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 9 }];

  const cands = recruiter.candidates;
  const maxCols = Math.max(cands.length, 5);
  // Col A = field label, Cols B onwards = one candidate per column
  ws.getColumn(1).width = 28;
  for (let i = 2; i <= maxCols + 1; i++) ws.getColumn(i).width = 22;

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  const titleEnd = colLetter(maxCols);
  ws.mergeCells(`A1:${titleEnd}1`);
  const t = ws.getCell('A1');
  t.value = `JOULESTOWATTS  ·  CONSULTANT TRACKER  ·  ${recruiter.name.toUpperCase()}`;
  t.fill = fill(C.darkBlue); t.font = font(true, C.white, 13);
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;

  // ── Row 2: Status bar ─────────────────────────────────────────────────────
  ws.mergeCells(`A2:${titleEnd}2`);
  const s = ws.getCell('A2');
  s.value = `Recruiter: ${recruiter.name}  ·  Viewing: ${reportDate}  ·  DL: ${recruiter.dl_name}  ·  Type: ${recruiter.recruiter_type}  ·  Active candidates: ${cands.length}`;
  s.fill = fill(C.blue); s.font = font(false, C.white, 10);
  s.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 22;

  // ── Row 3: My Demands section ─────────────────────────────────────────────
  ws.mergeCells(`A3:${titleEnd}3`);
  hdrCell(ws, 'A3', '▼  MY DEMANDS — allocations from DL', C.teal, C.white, true, 10);
  ws.getRow(3).height = 20;

  // Demands table (rows 4-8)
  const demHdrs = ['#', 'Demand ID', 'Customer', 'Skill / Slot', 'KAM', 'Subs Target', 'Sourced', 'Submitted', 'Status'];
  demHdrs.forEach((h, i) => hdrCell(ws, `${colLetter(i)}4`, h, C.lightGray, C.darkText, true, 9));
  ws.getRow(4).height = 18;

  recruiter.assigned_jobs.forEach((j, idx) => {
    const row = 5 + idx;
    const bg = idx % 2 === 0 ? C.white : C.lightGray;
    const status = j.selections > 0 ? '✓ Done' : j.total_submitted > 0 ? '~ Active' : j.total_sourced > 0 ? '⚠ Behind' : '○ Not started';
    [idx+1, j.client_job_id, j.client_name, j.role_title, j.kam_name, j.sourcing_target ?? '—', j.total_sourced, j.total_submitted, status].forEach((v, i) => {
      dataCell(ws, `${colLetter(i)}${row}`, v as string | number, bg, false, i >= 5 ? 'center' : 'left');
    });
    ws.getRow(row).height = 18;
  });
  if (recruiter.assigned_jobs.length === 0) {
    ws.mergeCells(`A5:${titleEnd}5`);
    dataCell(ws, 'A5', 'No demands assigned today.', 'fef9c3', false);
    ws.getRow(5).height = 18;
  }

  // ── Row 9: Pool Block header ───────────────────────────────────────────────
  ws.mergeCells(`A9:${titleEnd}9`);
  hdrCell(ws, 'A9', '▼  POOL BLOCK — consultant profiles (one column per candidate)', C.violet, C.white, true, 10);
  ws.getRow(9).height = 20;

  // Field labels (row 10 header) + col headers (B-onwards per candidate)
  hdrCell(ws, 'A10', 'Field', C.lightGray, C.darkText, true, 9);
  cands.forEach((_, i) => hdrCell(ws, `${colLetter(i+1)}10`, `Consultant ${i+1}`, C.lightGray, C.darkText, true, 9));
  ws.getRow(10).height = 18;

  // Profile data rows (rows 11-24, matching original structure)
  const POOL_FIELDS: { label: string; key: keyof CandidateRow; bg: string }[] = [
    { label: 'Sourcing Date',            key: 'sourcing_date',      bg: C.white },
    { label: 'Pool Verified?',           key: 'pool_verified',      bg: C.white },
    { label: 'DL Calibration (Approved)',key: 'dl_validated',       bg: 'fef9c3' },
    { label: 'Name of the Consultant',   key: 'full_name',          bg: C.white },
    { label: 'Mobile Number',            key: 'mobile',             bg: C.white },
    { label: 'Email',                    key: 'email',              bg: C.white },
    { label: 'LinkedIn URL',             key: 'linkedin_url',       bg: C.white },
    { label: 'Education Background',     key: 'education',          bg: C.white },
    { label: 'Current Location',         key: 'city',               bg: C.white },
    { label: 'Profile Active in Naukri', key: 'naukri_active',      bg: C.white },
    { label: 'Experience Range',         key: 'exp_range',          bg: C.white },
    { label: 'Current Company',          key: 'current_company',    bg: C.white },
    { label: 'Relevant Skills',          key: 'skills',             bg: C.white },
    { label: 'Whether Immediate Joinee', key: 'immediate_joiner',   bg: C.white },
  ];

  POOL_FIELDS.forEach(({ label, key, bg }, fi) => {
    const rowIdx = 11 + fi;
    hdrCell(ws, `A${rowIdx}`, label, C.lightGray, C.darkText, true, 9);
    cands.forEach((c, ci) => {
      const val = key === 'dl_validated' ? (c.dl_validated ? 'Yes' : 'No') : (c[key] as string) || '—';
      const cellBg = key === 'dl_validated' ? (c.dl_validated ? 'dcfce7' : 'fee2e2') : bg;
      dataCell(ws, `${colLetter(ci+1)}${rowIdx}`, val, cellBg, false);
    });
    ws.getRow(rowIdx).height = 18;
  });

  // ── Call Details rows (rows 25-77) ─────────────────────────────────────────
  const CALL_FIELDS: { label: string; key: keyof CandidateRow; section?: string; bg?: string }[] = [
    { label: '▼ CALL META', key: 'full_name', section: 'CALL META', bg: C.orange },
    { label: 'Total Experience',         key: 'total_exp',          bg: 'fffbeb' },
    { label: 'Relevant Experience',      key: 'relevant_exp',       bg: 'fffbeb' },
    { label: 'Qualification',            key: 'education',          bg: 'fffbeb' },
    { label: 'Last Company',             key: 'current_company',    bg: 'fffbeb' },
    { label: 'Notice Period',            key: 'notice_period_weeks',bg: 'fffbeb' },
    { label: 'Last Working Day',         key: 'last_working_day',   bg: 'fffbeb' },
    { label: 'Deploying Client',         key: 'deploying_client',   bg: 'fffbeb' },
    { label: '▼ CTC BLOCK',              key: 'full_name', section: 'CTC', bg: C.amber },
    { label: 'Current CTC (LPA)',        key: 'current_ctc',        bg: 'fffbeb' },
    { label: 'Expected CTC (LPA)',       key: 'expected_ctc',       bg: 'fffbeb' },
    { label: 'Hike %',                   key: 'hike_pct',           bg: 'fffbeb' },
    { label: 'Reason for Change',        key: 'reason_for_change',  bg: 'fffbeb' },
    { label: 'Offers in Hand',           key: 'offers_in_hand',     bg: 'fffbeb' },
    { label: '▼ SCORE BLOCK',            key: 'full_name', section: 'SCORE', bg: C.violet },
    { label: 'Comm Score (1-5)',         key: 'comm_score',         bg: 'f5f3ff' },
    { label: 'Tech Score',               key: 'tech_score',         bg: 'f5f3ff' },
    { label: 'Soft Skill Score',         key: 'soft_skill_score',   bg: 'f5f3ff' },
    { label: 'Overall Score',            key: 'overall_score',      bg: 'f5f3ff' },
    { label: 'Auto Recommendation',      key: 'auto_recommendation',bg: 'f5f3ff' },
    { label: 'Recruiter Notes',          key: 'caller_notes',       bg: 'f5f3ff' },
    { label: '▼ VERDICT BLOCK',          key: 'full_name', section: 'VERDICT', bg: C.green },
    { label: 'Recruiter Verdict',        key: 'pass_to_validation', bg: 'f0fdf4' },
    { label: 'DL Validated',             key: 'dl_validated',       bg: 'f0fdf4' },
    { label: 'Submitted to Client',      key: 'submitted_to_client',bg: 'f0fdf4' },
    { label: 'Current Stage',            key: 'current_stage',      bg: 'f0fdf4' },
  ];

  CALL_FIELDS.forEach(({ label, key, section, bg: fieldBg }, fi) => {
    const rowIdx = 25 + fi;
    const isSection = !!section;
    if (isSection) {
      ws.mergeCells(`A${rowIdx}:${titleEnd}${rowIdx}`);
      hdrCell(ws, `A${rowIdx}`, label, fieldBg || C.lightGray, C.white, true, 10);
    } else {
      hdrCell(ws, `A${rowIdx}`, label, C.lightGray, C.darkText, true, 9);
      cands.forEach((c, ci) => {
        let val: string;
        if (key === 'dl_validated')       val = c.dl_validated ? 'Approved' : 'Pending';
        else if (key === 'submitted_to_client') val = c.submitted_to_client ? 'Yes' : 'No';
        else val = (c[key] as string) || '—';
        const cellBg = key === 'overall_score' ? scoreBg(val)
                     : key === 'dl_validated' ? (c.dl_validated ? 'dcfce7' : 'fef9c3')
                     : key === 'submitted_to_client' ? (c.submitted_to_client ? 'dcfce7' : C.white)
                     : fieldBg || C.white;
        dataCell(ws, `${colLetter(ci+1)}${rowIdx}`, val, cellBg, false);
      });
    }
    ws.getRow(rowIdx).height = isSection ? 20 : 18;
  });

  // Status row summary (row 52+)
  const summaryRow = 52;
  ws.mergeCells(`A${summaryRow}:${titleEnd}${summaryRow}`);
  hdrCell(ws, `A${summaryRow}`, '▼  CANDIDATE STATUS SUMMARY', C.darkBlue, C.white, true, 10);
  ws.getRow(summaryRow).height = 20;

  hdrCell(ws, `A${summaryRow+1}`, 'Candidate Status', C.lightGray, C.darkText, true, 9);
  cands.forEach((c, i) => {
    const bg = statusBg[c.status] || C.white;
    dataCell(ws, `${colLetter(i+1)}${summaryRow+1}`, c.status, bg, true, 'center');
  });

  // Job info row
  hdrCell(ws, `A${summaryRow+2}`, 'Demand / Client', C.lightGray, C.darkText, true, 9);
  cands.forEach((c, i) => {
    dataCell(ws, `${colLetter(i+1)}${summaryRow+2}`, `${c.demand_id} / ${c.job_client}`, C.white, false);
  });

  ws.getRow(summaryRow+1).height = 18;
  ws.getRow(summaryRow+2).height = 18;
}

// ── Helper: column letter from 0-based index ──────────────────────────────────
function colLetter(idx: number): string {
  let s = '';
  idx++;
  while (idx > 0) {
    idx--;
    s = String.fromCharCode(65 + (idx % 26)) + s;
    idx = Math.floor(idx / 26);
  }
  return s;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CandidateRow {
  sourcing_date: string;
  pool_verified: string;
  full_name: string;
  mobile: string;
  email: string;
  linkedin_url: string;
  education: string;
  city: string;
  naukri_active: string;
  exp_range: string;
  current_company: string;
  skills: string;
  immediate_joiner: string;
  status: string;
  lead_source: string;
  demand_id: string;
  job_client: string;
  job_title: string;
  total_exp: string;
  relevant_exp: string;
  current_ctc: string;
  expected_ctc: string;
  hike_pct: string;
  notice_period_weeks: string;
  last_working_day: string;
  deploying_client: string;
  reason_for_change: string;
  offers_in_hand: string;
  comm_score: string;
  tech_score: string;
  soft_skill_score: string;
  overall_score: string;
  auto_recommendation: string;
  pass_to_validation: string;
  red_flags: string;
  caller_notes: string;
  dl_validated: boolean;
  submitted_to_client: boolean;
  current_stage: string;
}

interface JobData {
  id: number;
  client_name: string;
  client_job_id: string;
  demand_type: string;
  demand_exclusivity: string;
  role_title: string;
  headcount: number;
  skill_stack: string;
  status: string;
  created_at: string;
  deadline: string;
  sourcing_target: number | null;
  kam_name: string;
  dl_name: string;
  bh_name: string;
  sourcer_names: string[];
  caller_names: string[];
  total_sourced: number;
  validated: number;
  total_submitted: number;
  l1_count: number;
  l2_count: number;
  selections: number;
  rejections: number;
  today_subs: number;
  d1_subs: number;
  d2_subs: number;
}

interface RecruiterData {
  id: number;
  name: string;
  recruiter_type: string;
  dl_name: string;
  sourcing_load: number;
  calling_load: number;
  assigned_jobs: JobData[];
  candidates: CandidateRow[];
}

interface DLTeam {
  dl_name: string;
  recruiters: string[];
  demands: JobData[];
}

interface KAMData {
  kam_name: string;
  demands: JobData[];
}

interface PodReport {
  jobs: JobData[];
  recruiters: RecruiterData[];
  dl_teams: DLTeam[];
  kam_data: KAMData[];
  pod_stats: {
    report_date: string;
    total_demands: number;
    total_sourced: number;
    total_validated: number;
    total_submitted: number;
    total_l1: number;
    total_l2: number;
    total_selections: number;
    today_subs: number;
    recruiters_count: number;
  };
}

// ── Main export function ──────────────────────────────────────────────────────
export async function generatePodReport(data: PodReport): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'J2W Recruiter Tracker';
  wb.created = new Date();

  buildLeaderboard(wb, data);
  buildDemandStatus(wb, data);
  buildDashboard(wb, data);
  buildDLAllocation(wb, data);
  buildKAMAccountability(wb, data);
  buildBottleneck(wb, data);

  // One sheet per recruiter
  for (const r of data.recruiters) {
    buildRecruiterSheet(wb, r, data.pod_stats.report_date);
  }

  // Download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = `J2W_Pod_Report_${data.pod_stats.report_date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export type { PodReport };
