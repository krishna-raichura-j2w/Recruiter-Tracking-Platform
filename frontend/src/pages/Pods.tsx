import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, UserPlus, Users, Pencil, X, ChevronRight,
  ChevronDown, RefreshCw, Crown, Briefcase, ClipboardList, UserCheck,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type RoleKey = 'bh' | 'kam' | 'delivery_lead' | 'recruiter';

interface MemberShort {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface MemberNode extends MemberShort {
  parent_user_id: number | null;
  children: MemberNode[];
}

interface PodTree {
  id: number;
  name: string;
  bh_user_id: number | null;
  bh: MemberNode | null;
  orphans: MemberNode[];
  member_count: number;
}

interface PodListResp { pods: PodTree[]; }
interface AssignableResp { users: MemberShort[]; }

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_META: Record<RoleKey, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  bh:            { label: 'BH',         color: '#14532D', bg: '#DCFCE7', icon: <Crown size={14} /> },
  kam:           { label: 'KAM',        color: '#6B21A8', bg: '#F3E8FF', icon: <Briefcase size={14} /> },
  delivery_lead: { label: 'Delivery Lead', color: '#9A3412', bg: '#FFEDD5', icon: <UserCheck size={14} /> },
  recruiter:     { label: 'Recruiter',  color: '#1D4ED8', bg: '#DBEAFE', icon: <ClipboardList size={14} /> },
};

const CHILD_ROLE: Record<RoleKey, RoleKey | null> = {
  bh: 'kam', kam: 'delivery_lead', delivery_lead: 'recruiter', recruiter: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function meta(role: string) {
  return ROLE_META[role as RoleKey] ?? { label: role, color: '#475569', bg: '#F1F5F9', icon: null };
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Add-member picker dialog ──────────────────────────────────────────────────

function PickerDialog({
  podId, role, parentUserId, onClose, onDone,
}: {
  podId: number;
  role: RoleKey;
  parentUserId: number | null;   // null only when picking the BH (parent is the pod itself)
  onClose: () => void;
  onDone: () => void;
}) {
  const [options, setOptions] = useState<MemberShort[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get<AssignableResp>(`/pods/_assignable/${role}`, { params: { pod_id: podId } })
      .then(r => setOptions(r.data.users))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load users'))
      .finally(() => setLoading(false));
  }, [podId, role]);

  const submit = async () => {
    if (!pick) return;
    setError('');
    try {
      if (role === 'bh') {
        await api.patch(`/pods/${podId}`, { bh_user_id: pick });
      } else {
        await api.post(`/pods/${podId}/members`, { user_id: pick, parent_user_id: parentUserId });
      }
      onDone();
      onClose();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail || 'Failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-800">
            Add {meta(role).label}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-medium">{error}</div>}
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : options.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No unassigned {meta(role).label.toLowerCase()}s available. Create one in Users first.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100">
            {options.map(u => (
              <label
                key={u.id}
                className="flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="radio" name="pickuser"
                  checked={pick === u.id}
                  onChange={() => setPick(u.id)}
                  className="accent-blue-500"
                />
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-600">
                  {initials(u.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                </div>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={submit}
            disabled={!pick || loading}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create-pod dialog ─────────────────────────────────────────────────────────

function CreatePodDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    if (!name.trim()) return;
    setError('');
    try {
      await api.post('/pods', { name: name.trim() });
      onDone();
      onClose();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail || 'Failed');
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-800">Create Pod</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-medium">{error}</div>}
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Pod name (e.g. Mehr Pod)"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Member chip ───────────────────────────────────────────────────────────────

function MemberChip({
  m, onRemove, removable,
}: {
  m: MemberShort & { parent_user_id?: number | null };
  onRemove: () => void;
  removable: boolean;
}) {
  const mt = meta(m.role);
  return (
    <div
      className="inline-flex items-center gap-2 pl-2 pr-1 py-1 rounded-full border text-xs font-semibold"
      style={{ background: mt.bg, color: mt.color, borderColor: mt.color + '40' }}
    >
      <span className="opacity-70 flex-shrink-0">{mt.icon}</span>
      <span>{m.name}</span>
      {removable && (
        <button
          onClick={onRemove}
          className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/60"
          title="Remove from pod"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ── Recursive tree row ────────────────────────────────────────────────────────

function TreeNode({
  node, depth, podId, canEdit, onChange,
}: {
  node: MemberNode;
  depth: number;
  podId: number;
  canEdit: (n: MemberNode) => boolean;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const [picker, setPicker] = useState<RoleKey | null>(null);
  const childRole = CHILD_ROLE[node.role as RoleKey];
  const mt = meta(node.role);

  const removeMember = async () => {
    if (!confirm(`Remove ${node.name} from this pod?`)) return;
    try {
      await api.delete(`/pods/${podId}/members/${node.id}`);
      onChange();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      alert(err?.response?.data?.detail || 'Failed');
    }
  };

  return (
    <div style={{ marginLeft: depth * 22 }}>
      <div className="flex items-center gap-2 py-1.5">
        {node.children.length > 0 ? (
          <button onClick={() => setOpen(o => !o)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 h-5 inline-block" />
        )}
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider flex-shrink-0"
          style={{ background: mt.bg, color: mt.color }}
        >
          {mt.icon} {mt.label}
        </span>
        <span className="text-sm font-semibold text-slate-800">{node.name}</span>
        <span className="text-[11px] text-slate-400 truncate">{node.email}</span>
        <div className="flex-1" />
        {childRole && canEdit(node) && (
          <button
            onClick={() => setPicker(childRole)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
            title={`Add ${meta(childRole).label} under ${node.name}`}
          >
            <UserPlus size={11} /> Add {meta(childRole).label}
          </button>
        )}
        {canEdit(node) && node.role !== 'bh' && (
          <button
            onClick={removeMember}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-red-500 hover:bg-red-50"
            title="Remove from pod"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {open && node.children.map(c => (
        <TreeNode key={c.id} node={c} depth={depth + 1} podId={podId} canEdit={canEdit} onChange={onChange} />
      ))}
      {picker && (
        <PickerDialog
          podId={podId}
          role={picker}
          parentUserId={node.id}
          onClose={() => setPicker(null)}
          onDone={onChange}
        />
      )}
    </div>
  );
}

// ── Pod card ──────────────────────────────────────────────────────────────────

function PodCard({
  pod, isAdmin, currentUserId, onChange,
}: {
  pod: PodTree;
  isAdmin: boolean;
  currentUserId: number;
  onChange: () => void;
}) {
  const [picker, setPicker] = useState<RoleKey | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(pod.name);

  // Edit rules:
  // - Admin: edit anything.
  // - DL: only add/remove recruiters directly under themselves.
  const canEdit = (node: MemberNode): boolean => {
    if (isAdmin) return true;
    return node.id === currentUserId && node.role === 'delivery_lead';
  };

  const rename = async () => {
    if (!newName.trim() || newName === pod.name) { setRenaming(false); return; }
    try {
      await api.patch(`/pods/${pod.id}`, { name: newName.trim() });
      setRenaming(false);
      onChange();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      alert(err?.response?.data?.detail || 'Failed');
      setRenaming(false);
    }
  };

  const deletePod = async () => {
    if (!confirm(`Delete pod "${pod.name}"? Members will be detached but not deleted.`)) return;
    try {
      await api.delete(`/pods/${pod.id}`);
      onChange();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      alert(err?.response?.data?.detail || 'Failed');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
        <Users size={16} className="text-slate-400" />
        {renaming ? (
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onBlur={rename}
            onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setNewName(pod.name); setRenaming(false); } }}
            className="px-2 py-1 rounded border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-400"
          />
        ) : (
          <h2 className="text-sm font-bold text-slate-800">{pod.name}</h2>
        )}
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
          {pod.member_count} members
        </span>
        <div className="flex-1" />
        {isAdmin && (
          <>
            <button
              onClick={() => setRenaming(true)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded"
              title="Rename pod"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={deletePod}
              className="text-red-400 hover:text-red-600 p-1 rounded"
              title="Delete pod"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      <div className="p-5">
        {pod.bh ? (
          <TreeNode node={pod.bh} depth={0} podId={pod.id} canEdit={canEdit} onChange={onChange} />
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-slate-500 mb-3">No BH assigned yet.</p>
            {isAdmin && (
              <button
                onClick={() => setPicker('bh')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
              >
                <Plus size={12} /> Assign BH
              </button>
            )}
          </div>
        )}

        {pod.orphans.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-2">
              ⚠ Orphan members (parent missing in pod)
            </p>
            <div className="flex flex-wrap gap-2">
              {pod.orphans.map(o => (
                <MemberChip
                  key={o.id}
                  m={o}
                  removable={isAdmin}
                  onRemove={async () => {
                    try { await api.delete(`/pods/${pod.id}/members/${o.id}`); onChange(); }
                    catch (e) {
                      const err = e as { response?: { data?: { detail?: string } } };
                      alert(err?.response?.data?.detail || 'Failed');
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {picker && (
        <PickerDialog
          podId={pod.id}
          role={picker}
          parentUserId={null}
          onClose={() => setPicker(null)}
          onDone={onChange}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Pods() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [pods, setPods] = useState<PodTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPods = () => {
    setLoading(true);
    api.get<PodListResp>('/pods')
      .then(r => { setPods(r.data.pods); setError(''); })
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load pods'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPods(); }, []);

  const subtitle = useMemo(() => {
    if (isAdmin) return 'Manage pod structure: BH → KAMs → Delivery Leads → Recruiters';
    return 'Your pod';
  }, [isAdmin]);

  return (
    <Layout title="Pods" subtitle={subtitle}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={fetchPods}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
          >
            <Plus size={13} /> Create Pod
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      {loading && pods.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 text-sm">Loading…</div>
      ) : pods.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 text-sm border border-dashed border-slate-200">
          {isAdmin ? 'No pods yet. Click "Create Pod" to set up your first team.' : 'You are not part of any pod yet.'}
        </div>
      ) : (
        <div className="space-y-4">
          {pods.map(p => (
            <PodCard key={p.id} pod={p} isAdmin={isAdmin} currentUserId={user?.user_id ?? 0} onChange={fetchPods} />
          ))}
        </div>
      )}

      {creating && <CreatePodDialog onClose={() => setCreating(false)} onDone={fetchPods} />}
    </Layout>
  );
}
