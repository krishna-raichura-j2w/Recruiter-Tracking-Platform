import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Users, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import api from '../api/client';

interface RecruiterRow {
  recruiter_id: number;
  recruiter_name: string;
  day_target: number;
  done: number;
  verified: number;
  pct: number;
  status: 'On Track' | 'Behind';
  rejections: number;
  ack_sent: number;
  performance: 'needs discussion' | 'below average' | 'average' | 'high' | 'good performance';
}

interface Totals {
  day_target: number;
  done: number;
  verified: number;
  rejections: number;
  ack_sent: number;
  pct: number;
  status: 'On Track' | 'Behind';
}

interface ApiResponse {
  rows: RecruiterRow[];
  totals: Totals;
  day_target: number;
  today: string;
}

const PERF_STYLES: Record<RecruiterRow['performance'], string> = {
  'needs discussion':  'text-red-600',
  'below average':     'text-orange-600',
  'average':           'text-slate-600',
  'high':              'text-emerald-600',
  'good performance':  'text-emerald-700 font-semibold',
};

export default function CooDashboard() {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchData = () => {
    setLoading(true);
    api.get<ApiResponse>('/coo/recruiter-leaderboard')
      .then((r) => { setData(r.data); setError(''); })
      .catch(() => setError('Failed to load recruiter leaderboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <Layout title="Dashboard" subtitle="Executive overview">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-slate-500" />
            <h2 className="text-base font-bold text-slate-800">
              Recruiter Leaderboard — submissions today (live)
            </h2>
            {data && (
              <span className="ml-2 text-xs text-slate-400">{data.today}</span>
            )}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 py-8 text-center">{error}</div>
        )}

        {!error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Recruiter</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Day target</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Done (subs)</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Verified by DL</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">% of target</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rejections</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acknowledgment sent</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Performance category</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-slate-400">Loading…</td>
                  </tr>
                ) : data?.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-slate-400">No recruiters found.</td>
                  </tr>
                ) : (
                  data?.rows.map((row) => (
                    <tr key={row.recruiter_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-700">{row.recruiter_name}</td>
                      <td className="py-2.5 px-3 text-center text-slate-600">{row.day_target}</td>
                      <td className="py-2.5 px-3 text-center text-slate-700">{row.done || ''}</td>
                      <td className="py-2.5 px-3 text-center text-slate-700">{row.verified || ''}</td>
                      <td className="py-2.5 px-3 text-center text-slate-600">{row.pct}%</td>
                      <td className="py-2.5 px-3 text-center">
                        {row.status === 'On Track' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-xs">
                            <CheckCircle2 size={12} /> On Track
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs">
                            <AlertTriangle size={12} /> Behind
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-700">{row.rejections || ''}</td>
                      <td className="py-2.5 px-3 text-center text-slate-700">{row.ack_sent || ''}</td>
                      <td className={`py-2.5 px-3 text-center text-xs capitalize ${PERF_STYLES[row.performance]}`}>
                        {row.performance}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {data && data.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-700">
                    <td className="py-2.5 px-3">POD TOTAL</td>
                    <td className="py-2.5 px-3 text-center">{data.totals.day_target}</td>
                    <td className="py-2.5 px-3 text-center">{data.totals.done}</td>
                    <td className="py-2.5 px-3 text-center">{data.totals.verified}</td>
                    <td className="py-2.5 px-3 text-center">{data.totals.pct}%</td>
                    <td className="py-2.5 px-3 text-center">
                      {data.totals.status === 'On Track' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                          <CheckCircle2 size={12} /> Pod on track
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                          <AlertTriangle size={12} /> Pod behind
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">{data.totals.rejections}</td>
                    <td className="py-2.5 px-3 text-center">{data.totals.ack_sent}</td>
                    <td className="py-2.5 px-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
