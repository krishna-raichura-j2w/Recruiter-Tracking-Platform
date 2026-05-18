import { useEffect, useMemo, useState } from 'react';
import { Calendar, X } from 'lucide-react';
import api from '../api/client';

export interface FilterValues {
  from_date: string;        // YYYY-MM-DD
  to_date: string;          // YYYY-MM-DD
  client_name: string;
  business_head_id: string; // "" or numeric string
  kam_id: string;
  delivery_lead_id: string;
}

export const emptyFilters: FilterValues = {
  from_date: '', to_date: '', client_name: '',
  business_head_id: '', kam_id: '', delivery_lead_id: '',
};

interface NamedOption { id: number | string; name: string; }

interface Props {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  /** Hide individual filters when not applicable (e.g. hide KAM if user is a KAM) */
  show?: Partial<Record<keyof FilterValues, boolean>>;
  /** Show a small chip with the active count */
  className?: string;
}

const TODAY = () => new Date().toISOString().slice(0, 10);
const DAYS_AGO = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today',       range: () => [TODAY(), TODAY()] },
  { label: 'Yesterday',   range: () => [DAYS_AGO(1), DAYS_AGO(1)] },
  { label: 'Last 7 days', range: () => [DAYS_AGO(6), TODAY()] },
  { label: 'Last 30 days',range: () => [DAYS_AGO(29), TODAY()] },
];

export default function FilterBar({ value, onChange, show, className = '' }: Props) {
  const [clients, setClients]    = useState<NamedOption[]>([]);
  const [kams, setKams]          = useState<NamedOption[]>([]);
  const [dls, setDls]            = useState<NamedOption[]>([]);
  const [bhs, setBhs]            = useState<NamedOption[]>([]);

  const visible = {
    from_date: show?.from_date !== false,
    to_date: show?.to_date !== false,
    client_name: show?.client_name !== false,
    business_head_id: show?.business_head_id !== false,
    kam_id: show?.kam_id !== false,
    delivery_lead_id: show?.delivery_lead_id !== false,
  };

  useEffect(() => {
    if (visible.client_name) {
      api.get<NamedOption[]>('/clients').then(r => setClients(r.data)).catch(() => setClients([]));
    }
    if (visible.kam_id) {
      api.get<NamedOption[]>('/users/kams').then(r => setKams(r.data)).catch(() => setKams([]));
    }
    if (visible.delivery_lead_id) {
      api.get<NamedOption[]>('/users/delivery-leads').then(r => setDls(r.data)).catch(() => setDls([]));
    }
    if (visible.business_head_id) {
      api.get<NamedOption[]>('/business-heads').then(r => setBhs(r.data)).catch(() => setBhs([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCount = useMemo(() => Object.values(value).filter(v => v !== '').length, [value]);
  const clear = () => onChange(emptyFilters);

  const setOne = <K extends keyof FilterValues>(k: K, v: FilterValues[K]) =>
    onChange({ ...value, [k]: v });

  const applyPreset = (range: [string, string]) =>
    onChange({ ...value, from_date: range[0], to_date: range[1] });

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-3 ${className}`}>
      <div className="flex items-center flex-wrap gap-2">
        {/* Date range */}
        {(visible.from_date || visible.to_date) && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
            <Calendar size={13} className="text-slate-400" />
            <input
              type="date"
              value={value.from_date}
              onChange={e => setOne('from_date', e.target.value)}
              className="text-xs bg-transparent focus:outline-none text-slate-700"
              max={value.to_date || undefined}
            />
            <span className="text-slate-300 text-xs">→</span>
            <input
              type="date"
              value={value.to_date}
              onChange={e => setOne('to_date', e.target.value)}
              className="text-xs bg-transparent focus:outline-none text-slate-700"
              min={value.from_date || undefined}
            />
          </div>
        )}

        {/* Quick presets */}
        {(visible.from_date || visible.to_date) && (
          <div className="flex items-center gap-1">
            {PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => applyPreset(p.range())}
                className="text-[11px] px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 font-medium">
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="h-5 w-px bg-slate-200 mx-1" />

        {/* Company */}
        {visible.client_name && (
          <select
            value={value.client_name}
            onChange={e => setOne('client_name', e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400 min-w-32 max-w-44"
          >
            <option value="">All Companies</option>
            {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        )}
        {/* Business Head */}
        {visible.business_head_id && (
          <select
            value={value.business_head_id}
            onChange={e => setOne('business_head_id', e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400 min-w-32 max-w-44"
          >
            <option value="">All Business Heads</option>
            {bhs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {/* KAM */}
        {visible.kam_id && (
          <select
            value={value.kam_id}
            onChange={e => setOne('kam_id', e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400 min-w-32 max-w-44"
          >
            <option value="">All KAMs</option>
            {kams.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        )}
        {/* DL */}
        {visible.delivery_lead_id && (
          <select
            value={value.delivery_lead_id}
            onChange={e => setOne('delivery_lead_id', e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400 min-w-32 max-w-44"
          >
            <option value="">All Delivery Leads</option>
            {dls.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}

        {/* Active filter chip + clear */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-semibold hover:bg-red-100"
          >
            <X size={12} /> Clear ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}

/** Turn FilterValues into URLSearchParams-friendly object (drops empties). */
export function toQueryParams(f: FilterValues): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (f.from_date)        params.from_date        = f.from_date;
  if (f.to_date)          params.to_date          = f.to_date;
  if (f.client_name)      params.client_name      = f.client_name;
  if (f.business_head_id) params.business_head_id = f.business_head_id;
  if (f.kam_id)           params.kam_id           = f.kam_id;
  if (f.delivery_lead_id) params.delivery_lead_id = f.delivery_lead_id;
  return params;
}
