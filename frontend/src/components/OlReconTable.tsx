import { useMemo, useState } from 'react';
import type { BHOlReconRow } from '../api/podPlan';

// Color the Offer-Letter status badge by keyword (mirrors export_ol_candidate_status._ol_color).
export function olStatusBadgeStyle(status: string | null): { background: string; color: string } {
  const s = (status || '').toLowerCase();
  if (s.includes('join') || s.includes('onboard')) return { background: '#dcfce7', color: '#166534' };
  if (s.includes('offer')) return { background: '#d1fae5', color: '#065f46' };
  if (s.includes('select') || s.includes('cleared') || s.includes('pass')) return { background: '#cffafe', color: '#155e75' };
  if (s.includes('reject') || s.includes('fail') || s.includes('drop')) return { background: '#fee2e2', color: '#991b1b' };
  if (s.includes('interview')) return { background: '#fef9c3', color: '#854d0e' };
  if (s.includes('not found') || s.includes('no application') || s.includes('unavailable')) return { background: '#f1f5f9', color: '#94a3b8' };
  return { background: '#e0e7ff', color: '#3730a3' };
}

interface Props {
  rows: BHOlReconRow[];
  loading: boolean;
  title: string;
  subtitle?: string;
  /** Message when there are no rows at all (before filtering). */
  emptyText?: string;
}

/**
 * Offer-Letter reconciliation table: DL-verified candidates with their current
 * Offer-Letter status, plus Status / Recruiter / Client filters. Shared by the BH
 * leaderboard and the per-user Candidates Status tab.
 */
export function OlReconTable({ rows, loading, title, subtitle, emptyText = 'No DL-verified candidates in this period.' }: Props) {
  const [fltStatus, setFltStatus] = useState('');
  const [fltRecruiter, setFltRecruiter] = useState('');
  const [fltClient, setFltClient] = useState('');

  const options = useMemo(() => {
    const uniq = (vals: (string | null)[]) =>
      Array.from(new Set(vals.map(v => (v || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      statuses: uniq(rows.map(r => r.ol_status)),
      recruiters: uniq(rows.map(r => r.recruiter_name)),
      clients: uniq(rows.map(r => r.client_name)),
    };
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r =>
    (!fltStatus || (r.ol_status || '') === fltStatus)
    && (!fltRecruiter || (r.recruiter_name || '') === fltRecruiter)
    && (!fltClient || (r.client_name || '') === fltClient)
  ), [rows, fltStatus, fltRecruiter, fltClient]);

  const fltActive = !!(fltStatus || fltRecruiter || fltClient);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{title}</span>
        {subtitle && (
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 10 }}>
            {subtitle}
            {rows.length > 0 ? (fltActive ? ` · ${filtered.length}/${rows.length}` : ` · ${rows.length}`) : ''}
          </span>
        )}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {([
              { label: 'Status', value: fltStatus, set: setFltStatus, opts: options.statuses },
              { label: 'Recruiter', value: fltRecruiter, set: setFltRecruiter, opts: options.recruiters },
              { label: 'Client', value: fltClient, set: setFltClient, opts: options.clients },
            ] as const).map(f => (
              <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)}
                style={{ padding: '5px 9px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontWeight: 600,
                         color: f.value ? '#1e3a5f' : '#6b7280', background: f.value ? '#eff6ff' : '#fff', maxWidth: 220 }}>
                <option value="">All {f.label}s</option>
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            {fltActive && (
              <button onClick={() => { setFltStatus(''); setFltRecruiter(''); setFltClient(''); }}
                style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#dc2626', background: '#fff', cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>
      {loading && <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>{emptyText}</div>
      )}
      {!loading && rows.length > 0 && filtered.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No rows match the selected filters.</div>
      )}
      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                {['Client', 'Demand ID', 'Job Title', 'Candidate Name', 'Candidate Email', 'Offer Letter Status', 'Recruiter'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.candidate_id} style={{ background: i % 2 ? '#fbfdff' : '#fff' }}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' }}>{row.client_name || '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>{row.demand_id ?? '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' }}>{row.role_title || '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', color: '#1e293b', fontWeight: 600 }}>{row.candidate_name || '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>{row.candidate_email || '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ ...olStatusBadgeStyle(row.ol_status), display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>
                      {row.ol_status || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{row.recruiter_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
