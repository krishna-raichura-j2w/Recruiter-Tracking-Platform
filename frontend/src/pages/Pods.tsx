import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, UserPlus, Users, Pencil, X, ChevronRight,
  ChevronDown, RefreshCw, Crown, Briefcase, ClipboardList, UserCheck,
  Search,
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
  team_members?: MemberShort[];   // present only on DL nodes
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

// KAMs, DLs, and Recruiters are all flat peers under the BH. Recruiters do
// NOT formally report to a DL in the tree — instead each DL picks recruiters
// from the pod into their own working team (see <DlTeam> below).
const CHILD_ROLES: Record<RoleKey, RoleKey[]> = {
  bh: ['kam', 'delivery_lead', 'recruiter'],
  kam: [],
  delivery_lead: [],
  recruiter: [],
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
  // A pod has exactly one BH, so BH stays single-select. Everything else is multi-select.
  const isMulti = role !== 'bh';

  const [options, setOptions] = useState<MemberShort[]>([]);
  const [picked, setPicked]   = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');

  useEffect(() => {
    setLoading(true);
    api.get<AssignableResp>(`/pods/_assignable/${role}`, { params: { pod_id: podId } })
      .then(r => setOptions(r.data.users))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load users'))
      .finally(() => setLoading(false));
  }, [podId, role]);

  const toggle = (id: number) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (isMulti) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [options, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(u => picked.has(u.id));
  const toggleAllFiltered = () => {
    setPicked(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach(u => next.delete(u.id));
      else                     filtered.forEach(u => next.add(u.id));
      return next;
    });
  };

  const submit = async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    setError('');
    setSaving(true);
    try {
      if (role === 'bh') {
        await api.patch(`/pods/${podId}`, { bh_user_id: ids[0] });
      } else {
        // Add each picked user under the same parent. Collect per-user failures
        // so partial successes still propagate to the tree refresh.
        const failed: { name: string; reason: string }[] = [];
        for (const uid of ids) {
          try {
            await api.post(`/pods/${podId}/members`, { user_id: uid, parent_user_id: parentUserId });
          } catch (e) {
            const err = e as { response?: { data?: { detail?: string } } };
            const u = options.find(o => o.id === uid);
            failed.push({ name: u?.name ?? `#${uid}`, reason: err?.response?.data?.detail || 'Failed' });
          }
        }
        if (failed.length > 0) {
          setError('Could not add: ' + failed.map(f => `${f.name} (${f.reason})`).join('; '));
          onDone();           // refresh anyway — some may have succeeded
          setSaving(false);
          return;
        }
      }
      onDone();
      onClose();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const submitLabel = isMulti && picked.size > 1 ? `Add (${picked.size})` : 'Add';

  const labelLower = meta(role).label.toLowerCase();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(10, 10, 10, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden animate-panel-in"
        style={{ background: 'var(--surface-card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-pop)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: meta(role).bg, color: meta(role).color }}>
              {meta(role).icon}
            </div>
            <div>
              <h3 className="text-[14.5px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>
                Add {meta(role).label}{isMulti ? 's' : ''}
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                {isMulti ? 'Pick one or more to add to this pod' : `Select a ${labelLower} to head this pod`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md transition-colors" style={{ color: 'var(--ink-3)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {error && (
            <div className="mb-3 px-3 py-2 rounded-md text-[12px] font-medium"
                 style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid #FCA5A5' }}>
              {error}
            </div>
          )}

          {options.length > 0 && (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
                <input
                  type="text"
                  placeholder={`Search ${labelLower}s…`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-7 pr-2.5 py-1.5 rounded-md text-[12.5px] focus:outline-none"
                  style={{ background: 'var(--surface-muted)', border: '1px solid transparent', color: 'var(--ink)' }}
                />
              </div>
              {isMulti && filtered.length > 0 && (
                <button
                  onClick={toggleAllFiltered}
                  className="text-[11px] font-semibold whitespace-nowrap transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  {allFilteredSelected ? 'Clear' : `Select all · ${filtered.length}`}
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>Loading…</div>
          ) : options.length === 0 ? (
            <div className="py-10 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
              No unassigned {labelLower}s available. Create one in <span className="font-medium" style={{ color: 'var(--ink-2)' }}>Users</span> first.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>No matches.</div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md scrollbar-thin"
                 style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-hairline)' }}>
              {filtered.map(u => {
                const checked = picked.has(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors"
                    style={{
                      background: checked ? 'var(--surface-card)' : 'transparent',
                      borderBottom: '1px solid var(--border-hairline)',
                    }}
                    onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.02)'; }}
                    onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <input
                      type={isMulti ? 'checkbox' : 'radio'}
                      name="pickuser"
                      checked={checked}
                      onChange={() => toggle(u.id)}
                      className="accent-[#2563EB]"
                    />
                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10.5px] font-semibold font-mono"
                         style={{ background: 'var(--surface-card)', color: 'var(--ink-2)', border: '1px solid var(--border-hairline)' }}>
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--ink)' }}>{u.name}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--ink-4)' }}>{u.email}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border-hairline)', background: 'var(--surface-muted)' }}>
          <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--ink-3)' }}>
            {picked.size > 0 ? `${picked.size} selected` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
                    className="px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-colors"
                    style={{ color: 'var(--ink-2)', background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={picked.size === 0 || loading || saving}
              className="px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: 'var(--ink)', color: '#FFFFFF', boxShadow: 'var(--shadow-1)' }}
            >
              {saving ? 'Saving…' : submitLabel}
            </button>
          </div>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(10, 10, 10, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden animate-panel-in"
        style={{ background: 'var(--surface-card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-pop)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>
              Create Pod
            </h3>
            <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Each pod has one BH and multiple team members.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md transition-colors" style={{ color: 'var(--ink-3)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          {error && (
            <div className="mb-3 px-3 py-2 rounded-md text-[12px] font-medium"
                 style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid #FCA5A5' }}>
              {error}
            </div>
          )}
          <label className="label-caps mb-1.5 block">Pod name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. Mehr Pod"
            className="w-full px-3 py-2 rounded-md text-[13.5px] focus:outline-none transition-colors"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink)' }}
          />
        </div>
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border-hairline)', background: 'var(--surface-muted)' }}>
          <button onClick={onClose}
                  className="px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-colors"
                  style={{ color: 'var(--ink-2)', background: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-card)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ background: 'var(--ink)', color: '#FFFFFF', boxShadow: 'var(--shadow-1)' }}
          >
            Create Pod
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

// ── Team picker (recruiters within a pod, scoped to a single DL) ─────────────

function TeamPickerDialog({
  podId, dlId, podRecruiters, alreadyInTeam, onClose, onDone,
}: {
  podId: number;
  dlId: number;
  podRecruiters: MemberShort[];
  alreadyInTeam: Set<number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const options = useMemo(
    () => podRecruiters.filter(r => !alreadyInTeam.has(r.id)),
    [podRecruiters, alreadyInTeam],
  );
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [options, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(u => picked.has(u.id));
  const toggleAllFiltered = () => {
    setPicked(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach(u => next.delete(u.id));
      else                     filtered.forEach(u => next.add(u.id));
      return next;
    });
  };
  const toggle = (id: number) =>
    setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    setSaving(true);
    setError('');
    const failed: { name: string; reason: string }[] = [];
    for (const uid of ids) {
      try {
        await api.post(`/pods/${podId}/dl-team/${dlId}/members`, { user_id: uid });
      } catch (e) {
        const err = e as { response?: { data?: { detail?: string } } };
        const u = options.find(o => o.id === uid);
        failed.push({ name: u?.name ?? `#${uid}`, reason: err?.response?.data?.detail || 'Failed' });
      }
    }
    setSaving(false);
    onDone();
    if (failed.length > 0) {
      setError('Could not add: ' + failed.map(f => `${f.name} (${f.reason})`).join('; '));
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(10, 10, 10, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden animate-panel-in"
        style={{ background: 'var(--surface-card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-pop)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border-hairline)' }}>
          <div>
            <h3 className="text-[14.5px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>
              Add recruiters to team
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Recruiters already in this DL's team won't show here.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md transition-colors" style={{ color: 'var(--ink-3)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {error && (
            <div className="mb-3 px-3 py-2 rounded-md text-[12px] font-medium"
                 style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid #FCA5A5' }}>
              {error}
            </div>
          )}

          {options.length > 0 && (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
                <input
                  type="text" placeholder="Search pod recruiters…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-7 pr-2.5 py-1.5 rounded-md text-[12.5px] focus:outline-none"
                  style={{ background: 'var(--surface-muted)', border: '1px solid transparent', color: 'var(--ink)' }}
                />
              </div>
              {filtered.length > 0 && (
                <button
                  onClick={toggleAllFiltered}
                  className="text-[11px] font-semibold whitespace-nowrap transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  {allFilteredSelected ? 'Clear' : `Select all · ${filtered.length}`}
                </button>
              )}
            </div>
          )}

          {options.length === 0 ? (
            <div className="py-10 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
              All pod recruiters are already in this team.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>No matches.</div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md scrollbar-thin"
                 style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-hairline)' }}>
              {filtered.map(u => {
                const checked = picked.has(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors"
                    style={{ background: checked ? 'var(--surface-card)' : 'transparent', borderBottom: '1px solid var(--border-hairline)' }}
                    onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.02)'; }}
                    onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(u.id)} className="accent-[#2563EB]" />
                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10.5px] font-semibold font-mono"
                         style={{ background: 'var(--surface-card)', color: 'var(--ink-2)', border: '1px solid var(--border-hairline)' }}>
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--ink)' }}>{u.name}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--ink-4)' }}>{u.email}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border-hairline)', background: 'var(--surface-muted)' }}>
          <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--ink-3)' }}>
            {picked.size > 0 ? `${picked.size} selected` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
                    className="px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-colors"
                    style={{ color: 'var(--ink-2)', background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={picked.size === 0 || saving}
              className="px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: 'var(--ink)', color: '#FFFFFF', boxShadow: 'var(--shadow-1)' }}
            >
              {saving ? 'Saving…' : (picked.size > 1 ? `Add ${picked.size}` : 'Add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DL inline team section ───────────────────────────────────────────────────

function DlTeam({
  podId, dl, podRecruiters, canEditTeam, onChange,
}: {
  podId: number;
  dl: MemberNode;
  podRecruiters: MemberShort[];
  canEditTeam: boolean;
  onChange: () => void;
}) {
  const [open, setOpen]     = useState(false);
  const [picker, setPicker] = useState(false);
  const members = dl.team_members ?? [];

  const removeFromTeam = async (recruiterId: number, name: string) => {
    if (!confirm(`Remove ${name} from ${dl.name}'s team?`)) return;
    try {
      await api.delete(`/pods/${podId}/dl-team/${dl.id}/members/${recruiterId}`);
      onChange();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      alert(err?.response?.data?.detail || 'Failed');
    }
  };

  return (
    <div className="ml-7 mt-0.5 mb-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium transition-colors"
        style={{ color: open ? 'var(--ink-2)' : 'var(--ink-3)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink-2)')}
        onMouseLeave={e => (e.currentTarget.style.color = open ? 'var(--ink-2)' : 'var(--ink-3)')}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>Team</span>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
          {members.length}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 pl-4" style={{ borderLeft: '2px solid var(--border-hairline)' }}>
          {members.length === 0 ? (
            <p className="text-[11.5px] py-1" style={{ color: 'var(--ink-4)' }}>No team members yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 py-1">
              {members.map(m => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-md text-[11.5px] font-medium"
                  style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
                >
                  {m.name}
                  {canEditTeam && (
                    <button
                      onClick={() => removeFromTeam(m.id, m.name)}
                      className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                      style={{ color: '#1D4ED8' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#DBEAFE')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      title={`Remove ${m.name} from team`}
                    >
                      <X size={9} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {canEditTeam && (
            <button
              onClick={() => setPicker(true)}
              className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors"
              style={{ color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid #BFDBFE' }}
            >
              <UserPlus size={10} /> Add recruiters
            </button>
          )}
        </div>
      )}
      {picker && (
        <TeamPickerDialog
          podId={podId}
          dlId={dl.id}
          podRecruiters={podRecruiters}
          alreadyInTeam={new Set(members.map(m => m.id))}
          onClose={() => setPicker(false)}
          onDone={onChange}
        />
      )}
    </div>
  );
}

// ── Recursive tree row ────────────────────────────────────────────────────────

function TreeNode({
  node, depth, podId, isAdmin, currentUserId, podRecruiters, onChange,
}: {
  node: MemberNode;
  depth: number;
  podId: number;
  isAdmin: boolean;
  currentUserId: number;
  podRecruiters: MemberShort[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const [picker, setPicker] = useState<RoleKey | null>(null);
  const childRoles = CHILD_ROLES[node.role as RoleKey] ?? [];
  const mt = meta(node.role);
  const isDL = node.role === 'delivery_lead';
  const canEditTree = isAdmin;                            // Only admins edit the tree itself
  const canEditTeam = isAdmin || node.id === currentUserId; // DL may edit own team

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
      <div className="flex items-center gap-2 py-1.5 rounded-md transition-colors group"
           style={{ paddingLeft: 4, paddingRight: 4 }}
           onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
           onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        {node.children.length > 0 ? (
          <button onClick={() => setOpen(o => !o)} className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                  style={{ color: 'var(--ink-3)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 h-5 inline-block" />
        )}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold uppercase tracking-wider flex-shrink-0"
          style={{ background: mt.bg, color: mt.color, letterSpacing: '0.05em' }}
        >
          {mt.icon} {mt.label}
        </span>
        <span className="text-[13.5px] font-medium" style={{ color: 'var(--ink)' }}>{node.name}</span>
        <span className="text-[11.5px] truncate font-mono" style={{ color: 'var(--ink-4)' }}>{node.email}</span>
        <div className="flex-1" />
        {canEditTree && childRoles.map(cr => (
          <button
            key={cr}
            onClick={() => setPicker(cr)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
            style={{ color: 'var(--ink-2)', background: 'var(--surface-card)', border: '1px solid var(--border-hairline)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-card)')}
            title={`Add ${meta(cr).label} to pod`}
          >
            <UserPlus size={11} /> Add {meta(cr).label}{cr !== 'recruiter' ? 's' : 's'}
          </button>
        ))}
        {canEditTree && node.role !== 'bh' && (
          <button
            onClick={removeMember}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium transition-colors"
            style={{ color: 'var(--danger)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-soft)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title="Remove from pod"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {/* DL's working team — inline expandable section */}
      {isDL && (
        <DlTeam
          podId={podId}
          dl={node}
          podRecruiters={podRecruiters}
          canEditTeam={canEditTeam}
          onChange={onChange}
        />
      )}
      {open && node.children.map(c => (
        <TreeNode
          key={c.id}
          node={c}
          depth={depth + 1}
          podId={podId}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          podRecruiters={podRecruiters}
          onChange={onChange}
        />
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

  // All recruiters in this pod (peers under BH). DLs use this list when
  // building their working team.
  const podRecruiters: MemberShort[] = useMemo(
    () => (pod.bh?.children ?? []).filter(c => c.role === 'recruiter'),
    [pod.bh],
  );

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
    <div className="surface overflow-hidden">
      <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-hairline)', background: 'var(--surface-muted)' }}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)' }}>
          <Users size={14} style={{ color: 'var(--ink-2)' }} />
        </div>
        {renaming ? (
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onBlur={rename}
            onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setNewName(pod.name); setRenaming(false); } }}
            className="px-2 py-1 rounded text-[14px] font-semibold focus:outline-none"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--accent)', color: 'var(--ink)' }}
          />
        ) : (
          <h2 className="text-[14.5px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>{pod.name}</h2>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-mono font-semibold tabular-nums"
              style={{ background: 'var(--surface-card)', color: 'var(--ink-2)', border: '1px solid var(--border-hairline)' }}>
          {pod.member_count} {pod.member_count === 1 ? 'member' : 'members'}
        </span>
        <div className="flex-1" />
        {isAdmin && (
          <>
            <button
              onClick={() => setRenaming(true)}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--ink-3)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-card)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)'; }}
              title="Rename pod"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={deletePod}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--ink-3)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)'; }}
              title="Delete pod"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      <div className="px-4 py-3">
        {pod.bh ? (
          <TreeNode
            node={pod.bh}
            depth={0}
            podId={pod.id}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            podRecruiters={podRecruiters}
            onChange={onChange}
          />
        ) : (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
                 style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-hairline)' }}>
              <Crown size={18} style={{ color: 'var(--ink-3)' }} />
            </div>
            <p className="text-[13px] mb-3" style={{ color: 'var(--ink-3)' }}>No BH assigned yet.</p>
            {isAdmin && (
              <button
                onClick={() => setPicker('bh')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors"
                style={{ background: 'var(--ink)', color: '#FFFFFF', boxShadow: 'var(--shadow-1)' }}
              >
                <Plus size={12} /> Assign BH
              </button>
            )}
          </div>
        )}

        {pod.orphans.length > 0 && (
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border-hairline)' }}>
            <p className="label-caps mb-2" style={{ color: 'var(--warning)' }}>
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
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={fetchPods}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium transition-colors disabled:opacity-50"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', color: 'var(--ink-2)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors"
            style={{ background: 'var(--ink)', color: '#FFFFFF', boxShadow: 'var(--shadow-1)' }}
          >
            <Plus size={13} /> Create Pod
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-md text-[13px] font-medium"
             style={{ background: 'var(--danger-soft)', border: '1px solid #FCA5A5', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {loading && pods.length === 0 ? (
        <div className="surface p-16 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>Loading…</div>
      ) : pods.length === 0 ? (
        <div className="rounded-[14px] p-16 text-center text-[13px]"
             style={{ background: 'var(--surface-card)', border: '1px dashed var(--border-strong)', color: 'var(--ink-3)' }}>
          {isAdmin ? 'No pods yet. Click “Create Pod” to set up your first team.' : 'You are not part of any pod yet.'}
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
