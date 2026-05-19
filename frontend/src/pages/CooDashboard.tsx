import Layout from '../components/Layout';
import { Users } from 'lucide-react';

export default function CooDashboard() {
  return (
    <Layout title="Dashboard" subtitle="Executive overview">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-slate-500" />
          <h2 className="text-base font-bold text-slate-800">KAMs</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Active Jobs
                </th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Submissions
                </th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                  No KAM data available yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
