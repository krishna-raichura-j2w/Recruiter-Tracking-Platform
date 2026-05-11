import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, RefreshCw, Filter, Users } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BH { id: number; name: string; email: string | null; phone: string | null; }

interface ExportRow {
  business_head: string;
  client_name: string;
  job_title: string;
  job_status: string;
  candidate_name: string;
  mobile: string;
  email: string;
  linkedin: string;
  city: string;
  current_company: string;
  candidate_status: string;
  lead_source: string;
  sourced_by: string;
  caller: string;
  sourcing_date: string;
  total_exp: string;
  relevant_exp: string;
  skills: string;
  current_ctc: string;
  expected_ctc: string;
  hike_pct: string;
  notice_period: string;
  last_working_day: string;
  deploying_client: string;
  reason_for_change: string;
  offers_in_hand: string;
  current_city: string;
  comm_score: string;
  tech_score: string;
  soft_skill_score: string;
  overall_score: string;
  auto_recommendation: string;
  pass_to_validation: string;
}

// ── Column config ──────────────────────────────────────────────────────────────

const COLUMNS: { key: keyof ExportRow; label: string; width: number; group?: string }[] = [
  { key: 'business_head',      label: 'Business Head',        width: 140, group: 'JD Info' },
  { key: 'client_name',        label: 'Client',               width: 100, group: 'JD Info' },
  { key: 'job_title',          label: 'Role',                 width: 160, group: 'JD Info' },
  { key: 'candidate_name',     label: 'Candidate Name',       width: 150, group: 'Candidate' },
  { key: 'mobile',             label: 'Phone',                width: 110, group: 'Candidate' },
  { key: 'email',              label: 'Email',                width: 160, group: 'Candidate' },
  { key: 'city',               label: 'City',                 width: 100, group: 'Candidate' },
  { key: 'current_company',    label: 'Current Company',      width: 150, group: 'Candidate' },
  { key: 'candidate_status',   label: 'Status',               width: 130, group: 'Candidate' },
  { key: 'sourced_by',         label: 'Sourced By',           width: 110, group: 'Team' },
  { key: 'caller',             label: 'Caller',               width: 110, group: 'Team' },
  { key: 'sourcing_date',      label: 'Sourcing Date',        width: 110, group: 'Team' },
  { key: 'total_exp',          label: 'Total Exp',            width: 90,  group: 'Profile' },
  { key: 'relevant_exp',       label: 'Relevant Exp',         width: 100, group: 'Profile' },
  { key: 'skills',             label: 'Skills',               width: 200, group: 'Profile' },
  { key: 'current_ctc',        label: 'Current CTC',          width: 100, group: 'CTC' },
  { key: 'expected_ctc',       label: 'Expected CTC',         width: 100, group: 'CTC' },
  { key: 'hike_pct',           label: 'Hike %',               width: 80,  group: 'CTC' },
  { key: 'notice_period',      label: 'Notice Period',        width: 110, group: 'Profile' },
  { key: 'last_working_day',   label: 'LWD',                  width: 100, group: 'Profile' },
  { key: 'deploying_client',   label: 'Deploying Client',     width: 130, group: 'Profile' },
  { key: 'reason_for_change',  label: 'Reason for Change',    width: 160, group: 'Profile' },
  { key: 'offers_in_hand',     label: 'Offers in Hand',       width: 110, group: 'Profile' },
  { key: 'overall_score',      label: 'Overall Score',        width: 100, group: 'Score' },
  { key: 'tech_score',         label: 'Tech Score',           width: 90,  group: 'Score' },
  { key: 'soft_skill_score',   label: 'Soft Score',           width: 90,  group: 'Score' },
  { key: 'auto_recommendation',label: 'Recommendation',       width: 130, group: 'Score' },
  { key: 'pass_to_validation', label: 'Verdict',              width: 120, group: 'Score' },
];

const STATUS_COLORS: Record<string, string> = {
  sourced:               '#e0f2fe',
  pool_verified:         '#f0fdf4',
  handed_to_recruiter:   '#fef9c3',
  call_in_progress:      '#fef3c7',
  ready_for_validation:  '#e0e7ff',
  validated:             '#dcfce7',
  needs_rework:          '#fee2e2',
  on_hold:               '#f1f5f9',
  rejected:              '#fecaca',
  submitted_to_client:   '#dbeafe',
  interview_stage:       '#ede9fe',
  offer_rolled_out:      '#d1fae5',
  joined:                '#bbf7d0',
  backed_out:            '#f8fafc',
};

const SCORE_COLOR = (s: string) => {
  const n = parseFloat(s);
  if (isNaN(n)) return '';
  if (n >= 4) return '#dcfce7';
  if (n >= 3.25) return '#fef9c3';
  return '#fee2e2';
};

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Export() {
  const [bhs, setBhs]               = useState<BH[]>([]);
  const [rows, setRows]             = useState<ExportRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [selectedAm, setSelectedAm] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  useEffect(() => {
    api.get<BH[]>('/business-heads').then(r => setBhs(r.data)).catch(() => {});
    fetchData();
  }, []);

  const fetchData = async (amId?: string, status?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (amId) params.business_head_id = amId;
      if (status) params.status = status;
      const { data } = await api.get<ExportRow[]>('/export/candidates', { params });
      setRows(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const onFilter = () => fetchData(selectedAm, selectedStatus);

  const exportExcel = () => {
    const headers = COLUMNS.map(c => c.label);
    const data = rows.map(r => COLUMNS.map(c => r[c.key]));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    // Column widths
    ws['!cols'] = COLUMNS.map(c => ({ wch: Math.round(c.width / 7) }));

    // Header row style (XLSX community edition doesn't support full cell styling,
    // but we set a bold row via the sheet freeze)
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    XLSX.writeFile(wb, `J2W_Candidates_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Group columns by section for the header
  const groups = COLUMNS.reduce<Record<string, typeof COLUMNS>>((acc, col) => {
    const g = col.group ?? 'Other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(col);
    return acc;
  }, {});

  return (
    <Layout title="Export & Reports">

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <Filter size={15} className="text-slate-400 flex-shrink-0" />

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Business Head</label>
          <select
            value={selectedAm}
            onChange={e => setSelectedAm(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 min-w-[160px]"
          >
            <option value="">All</option>
            {bhs.map(bh => <option key={bh.id} value={String(bh.id)}>{bh.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Status</label>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 min-w-[160px]"
          >
            <option value="">All</option>
            {Object.keys(STATUS_COLORS).map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <button
          onClick={onFilter}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
          style={{ backgroundColor: '#1a2744' }}
        >
          <RefreshCw size={13} /> Apply
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400">
            <Users size={12} className="inline mr-1" />
            {rows.length} candidates
          </span>
          <button
            onClick={exportExcel}
            disabled={rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: '#16a34a' }}
          >
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw size={24} className="animate-spin mr-3" /> Loading data…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Users size={44} className="opacity-20 mb-3" />
          <p className="font-medium text-slate-500">No candidates match the selected filters.</p>
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-slate-200 shadow-sm" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'Arial, sans-serif', whiteSpace: 'nowrap' }}>
            {/* Group headers */}
            <thead>
              <tr>
                {Object.entries(groups).map(([group, cols]) => (
                  <th
                    key={group}
                    colSpan={cols.length}
                    style={{
                      padding: '6px 10px',
                      background: group === 'JD Info' ? '#1a2744' :
                                  group === 'Candidate' ? '#1e40af' :
                                  group === 'Team' ? '#0f766e' :
                                  group === 'CTC' ? '#b45309' :
                                  group === 'Score' ? '#6d28d9' : '#374151',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      borderRight: '2px solid rgba(255,255,255,0.2)',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {group}
                  </th>
                ))}
              </tr>
              {/* Column headers */}
              <tr>
                {COLUMNS.map((col, i) => (
                  <th
                    key={col.key}
                    style={{
                      padding: '6px 10px',
                      background: '#f1f5f9',
                      color: '#374151',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      textAlign: 'left',
                      position: 'sticky',
                      top: 30,
                      zIndex: 15,
                      border: '1px solid #cbd5e1',
                      minWidth: col.width,
                      borderRight: i === COLUMNS.length - 1 ? '1px solid #cbd5e1' : '1px solid #cbd5e1',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, ri) => {
                const isNewAm = ri === 0 || rows[ri - 1].business_head !== row.business_head;
                const isNewClient = ri === 0 || rows[ri - 1].client_name !== row.client_name || rows[ri - 1].business_head !== row.business_head;
                return (
                  <tr
                    key={ri}
                    style={{ backgroundColor: ri % 2 === 0 ? '#ffffff' : '#f8fafc' }}
                  >
                    {COLUMNS.map((col, ci) => {
                      const val = row[col.key];
                      let bg = ri % 2 === 0 ? '#ffffff' : '#f8fafc';
                      // Highlight AM changes
                      if (col.key === 'business_head' && isNewAm) bg = '#dbeafe';
                      if (col.key === 'client_name' && isNewClient) bg = '#eff6ff';
                      // Status colour
                      if (col.key === 'candidate_status') {
                        const raw = val.replace(/ /g, '_');
                        bg = STATUS_COLORS[raw] ?? bg;
                      }
                      // Score colour
                      if (['overall_score','tech_score','soft_skill_score'].includes(col.key)) {
                        bg = SCORE_COLOR(val) || bg;
                      }
                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: '5px 10px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: bg,
                            maxWidth: col.width,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: col.key === 'candidate_name' ? 'bold' : 'normal',
                            color: col.key === 'business_head' ? '#1e40af' : '#1a202c',
                            borderLeft: ci === 0 ? '1px solid #e2e8f0' :
                              (col.key === 'candidate_name' || col.key === 'total_exp' ||
                               col.key === 'current_ctc' || col.key === 'overall_score' ||
                               col.key === 'sourced_by') ? '2px solid #cbd5e1' : '1px solid #e2e8f0',
                          }}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
