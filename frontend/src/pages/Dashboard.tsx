import { useEffect, useState } from 'react';
import { useSignal } from '../context/RealtimeContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Users, Briefcase, Send, UserCheck } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import type { DashboardData } from '../types';

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex items-center gap-4">
      <div
        className="flex items-center justify-center rounded-xl text-white flex-shrink-0"
        style={{ width: 48, height: 48, backgroundColor: color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-black text-slate-800">{value.toLocaleString()}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-slate-200 flex-shrink-0" />
      <div className="space-y-2 flex-1">
        <div className="h-6 bg-slate-200 rounded w-16" />
        <div className="h-4 bg-slate-100 rounded w-28" />
      </div>
    </div>
  );
}

const STAGE_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#10b981', '#84cc16',
];

const stageLabels: Record<string, string> = {
  sourced: 'Sourced',
  pool_verified: 'Pool Verified',
  handed_to_recruiter: 'Handed Over',
  call_in_progress: 'Call in Progress',
  ready_for_validation: 'Ready for Validation',
  validated: 'Validated',
  needs_rework: 'Needs Rework',
  on_hold: 'On Hold',
  rejected: 'Rejected',
  submitted_to_client: 'Submitted',
  interview_stage: 'Interview',
  offer_rolled_out: 'Offer Rolled',
  joined: 'Joined',
  backed_out: 'Backed Out',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const dashSignal = useSignal('dashboard');

  useEffect(() => {
    api
      .get<DashboardData>('/dashboard')
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashSignal]);

  const pipelineData =
    data?.pipeline
      .filter((p) => p.count > 0)
      .slice(0, 8)
      .map((p) => ({ ...p, stageName: stageLabels[p.stage] ?? p.stage })) ?? [];

  return (
    <Layout title="Dashboard">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <div className="col-span-4 text-center py-12 text-red-500">{error}</div>
        ) : data ? (
          <>
            <StatCard
              label="Total Candidates"
              value={data.total_candidates}
              icon={<Users size={22} />}
              color="#3b82f6"
            />
            <StatCard
              label="Open Jobs"
              value={data.total_jobs}
              icon={<Briefcase size={22} />}
              color="#6366f1"
            />
            <StatCard
              label="Submitted This Month"
              value={data.submitted_this_month}
              icon={<Send size={22} />}
              color="#8b5cf6"
            />
            <StatCard
              label="Joined This Month"
              value={data.joined_this_month}
              icon={<UserCheck size={22} />}
              color="#22c55e"
            />
          </>
        ) : null}
      </div>

      {/* Pipeline chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
        <h2 className="text-base font-bold text-slate-800 mb-6">Pipeline Overview</h2>
        {loading ? (
          <div className="animate-pulse space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-3 items-center">
                <div className="h-3 bg-slate-200 rounded w-28" />
                <div
                  className="h-6 bg-slate-100 rounded"
                  style={{ width: `${Math.random() * 60 + 20}%` }}
                />
              </div>
            ))}
          </div>
        ) : pipelineData.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No pipeline data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={pipelineData}
              layout="vertical"
              margin={{ top: 0, right: 40, bottom: 0, left: 100 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="stageName"
                width={100}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: 'none',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                  fontSize: 13,
                }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Bar dataKey="count" name="Candidates" radius={[0, 6, 6, 0]}>
                {pipelineData.map((_, index) => (
                  <Cell key={index} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recruiter performance table */}
      {(user?.role === 'admin' || user?.role === 'delivery_lead') && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-base font-bold text-slate-800 mb-4">Recruiter Performance</h2>
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 rounded-xl" />
              ))}
            </div>
          ) : !data?.recruiter_stats || data.recruiter_stats.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No recruiter data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Recruiter
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Assigned
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Called
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Validated
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Conv. Rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.recruiter_stats.map((r, i) => {
                    const rate = r.assigned > 0 ? ((r.validated / r.assigned) * 100).toFixed(0) : '0';
                    return (
                      <tr
                        key={r.name}
                        className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/50'
                          }`}
                      >
                        <td className="py-3 px-4 font-medium text-slate-800">{r.name}</td>
                        <td className="py-3 px-4 text-center text-slate-600">{r.assigned}</td>
                        <td className="py-3 px-4 text-center text-slate-600">{r.called}</td>
                        <td className="py-3 px-4 text-center text-slate-600">{r.validated}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${Number(rate) >= 50
                                ? 'bg-green-100 text-green-700'
                                : Number(rate) >= 25
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-600'
                              }`}
                          >
                            {rate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
