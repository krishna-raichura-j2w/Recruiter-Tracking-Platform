import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Edit2, Check, X,
  Eye, EyeOff, Save, RotateCcw, GripVertical,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'score';

interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  visible: boolean;
  db_column: string | null;
  options: string[];
  placeholder: string;
  order: number;
}

interface FormSection {
  id: string;
  label: string;
  order: number;
  fields: FormField[];
}

interface FormTemplate {
  form_name: string;
  label: string;
  sections: FormSection[];
}

interface TemplateMeta {
  form_name: string;
  label: string;
  updated_at: string | null;
  updated_by: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Text (single line)' },
  { value: 'textarea', label: 'Text (multi-line)' },
  { value: 'number',   label: 'Number' },
  { value: 'date',     label: 'Date' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'score',    label: 'Score (1–5)' },
];

const TYPE_BADGE: Record<FieldType, string> = {
  text:     'bg-blue-50 text-blue-600',
  textarea: 'bg-purple-50 text-purple-600',
  number:   'bg-amber-50 text-amber-600',
  date:     'bg-teal-50 text-teal-600',
  select:   'bg-orange-50 text-orange-600',
  score:    'bg-green-50 text-green-600',
};

function uid() {
  return `cust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({
  field, onEdit, onDelete, onToggleVisible, onMoveUp, onMoveDown, isFirst, isLast,
}: {
  field: FormField;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisible: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${field.visible ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'} group`}>
      <GripVertical size={14} className="text-slate-300 flex-shrink-0" />

      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className={`font-medium text-sm text-slate-800 ${!field.visible ? 'line-through text-slate-400' : ''}`}>
          {field.label}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[field.type]}`}>
          {field.type}
        </span>
        {field.required && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-500">required</span>
        )}
        {field.db_column === null && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-600">custom</span>
        )}
        {field.options.length > 0 && (
          <span className="text-xs text-slate-400 truncate max-w-[200px]">
            [{field.options.slice(0, 3).join(', ')}{field.options.length > 3 ? '…' : ''}]
          </span>
        )}
      </div>

      {/* Actions — visible on hover */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onMoveUp} disabled={isFirst} title="Move up"
          className="p-1 rounded hover:bg-slate-100 disabled:opacity-25 transition-colors">
          <ChevronUp size={14} />
        </button>
        <button onClick={onMoveDown} disabled={isLast} title="Move down"
          className="p-1 rounded hover:bg-slate-100 disabled:opacity-25 transition-colors">
          <ChevronDown size={14} />
        </button>
        <button onClick={onToggleVisible} title={field.visible ? 'Hide field' : 'Show field'}
          className="p-1 rounded hover:bg-slate-100 transition-colors">
          {field.visible ? <Eye size={14} className="text-slate-400" /> : <EyeOff size={14} className="text-slate-400" />}
        </button>
        <button onClick={onEdit} title="Edit field"
          className="p-1 rounded hover:bg-blue-50 text-blue-500 transition-colors">
          <Edit2 size={14} />
        </button>
        <button onClick={onDelete} title="Delete field"
          className="p-1 rounded hover:bg-red-50 text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function FieldEditor({
  initial, onSave, onCancel,
}: {
  initial: Partial<FormField>;
  onSave: (f: FormField) => void;
  onCancel: () => void;
}) {
  const [label, setLabel]           = useState(initial.label ?? '');
  const [type, setType]             = useState<FieldType>(initial.type ?? 'text');
  const [required, setRequired]     = useState(initial.required ?? false);
  const [placeholder, setPlaceholder] = useState(initial.placeholder ?? '');
  const [optionsRaw, setOptionsRaw] = useState((initial.options ?? []).join('\n'));
  const [error, setError]           = useState('');

  const handleSave = () => {
    if (!label.trim()) { setError('Label is required'); return; }
    const opts = optionsRaw.split('\n').map(s => s.trim()).filter(Boolean);
    onSave({
      id:          initial.id ?? uid(),
      label:       label.trim(),
      type,
      required,
      visible:     initial.visible ?? true,
      db_column:   initial.db_column ?? null,
      options:     opts,
      placeholder: placeholder.trim(),
      order:       initial.order ?? 999,
    });
  };

  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3 mt-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Field Label *</label>
          <input value={label} onChange={e => { setLabel(e.target.value); setError(''); }}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
            placeholder="e.g. Total Experience" />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Field Type</label>
          <select value={type} onChange={e => setType(e.target.value as FieldType)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400">
            {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Placeholder</label>
          <input value={placeholder} onChange={e => setPlaceholder(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
            placeholder="Hint text for the input" />
        </div>
        {type === 'select' && (
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Dropdown Options <span className="font-normal text-slate-400">(one per line)</span>
            </label>
            <textarea value={optionsRaw} onChange={e => setOptionsRaw(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400 resize-none font-mono"
              placeholder={"Option A\nOption B\nOption C"} />
          </div>
        )}
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" id="req" checked={required} onChange={e => setRequired(e.target.checked)}
            className="w-4 h-4 rounded" />
          <label htmlFor="req" className="text-sm text-slate-600 cursor-pointer">Mark as required</label>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
          <Check size={14} /> Save Field
        </button>
        <button onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          <X size={14} /> Cancel
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  section, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast,
}: {
  section: FormSection;
  onUpdate: (s: FormSection) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [addingField, setAddingField]       = useState(false);
  const [editingLabel, setEditingLabel]     = useState(false);
  const [labelInput, setLabelInput]         = useState(section.label);

  const updateField = (updated: FormField) => {
    onUpdate({
      ...section,
      fields: section.fields.map(f => f.id === updated.id ? updated : f),
    });
    setEditingFieldId(null);
  };

  const deleteField = (id: string) => {
    if (!confirm('Delete this field?')) return;
    onUpdate({ ...section, fields: section.fields.filter(f => f.id !== id) });
  };

  const toggleVisible = (id: string) => {
    onUpdate({
      ...section,
      fields: section.fields.map(f => f.id === id ? { ...f, visible: !f.visible } : f),
    });
  };

  const moveField = (id: string, dir: 'up' | 'down') => {
    const fields = [...section.fields].sort((a, b) => a.order - b.order);
    const idx = fields.findIndex(f => f.id === id);
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= fields.length) return;
    [fields[idx].order, fields[swap].order] = [fields[swap].order, fields[idx].order];
    onUpdate({ ...section, fields });
  };

  const addField = (f: FormField) => {
    onUpdate({ ...section, fields: [...section.fields, { ...f, order: section.fields.length }] });
    setAddingField(false);
  };

  const saveLabel = () => {
    if (labelInput.trim()) onUpdate({ ...section, label: labelInput.trim() });
    setEditingLabel(false);
  };

  const sortedFields = [...section.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-800 text-white">
        <GripVertical size={15} className="text-slate-400 flex-shrink-0" />

        {editingLabel ? (
          <input
            autoFocus
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditingLabel(false); }}
            className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-sm font-semibold text-white focus:outline-none"
          />
        ) : (
          <span className="flex-1 font-semibold text-sm">{section.label}</span>
        )}

        <div className="flex items-center gap-1">
          {editingLabel ? (
            <>
              <button onClick={saveLabel} className="p-1 rounded hover:bg-white/10"><Check size={14} /></button>
              <button onClick={() => setEditingLabel(false)} className="p-1 rounded hover:bg-white/10"><X size={14} /></button>
            </>
          ) : (
            <button onClick={() => { setEditingLabel(true); setLabelInput(section.label); }}
              className="p-1 rounded hover:bg-white/10" title="Rename section">
              <Edit2 size={14} />
            </button>
          )}
          <button onClick={onMoveUp} disabled={isFirst} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
            <ChevronUp size={14} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
            <ChevronDown size={14} />
          </button>
          <button onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/30 text-red-300" title="Delete section">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="p-3 space-y-2 bg-white">
        {sortedFields.length === 0 && (
          <p className="text-center text-slate-400 text-xs py-3">No fields yet — add one below.</p>
        )}
        {sortedFields.map((field, idx) => (
          <div key={field.id}>
            <FieldRow
              field={field}
              isFirst={idx === 0}
              isLast={idx === sortedFields.length - 1}
              onEdit={() => setEditingFieldId(editingFieldId === field.id ? null : field.id)}
              onDelete={() => deleteField(field.id)}
              onToggleVisible={() => toggleVisible(field.id)}
              onMoveUp={() => moveField(field.id, 'up')}
              onMoveDown={() => moveField(field.id, 'down')}
            />
            {editingFieldId === field.id && (
              <FieldEditor
                initial={field}
                onSave={updateField}
                onCancel={() => setEditingFieldId(null)}
              />
            )}
          </div>
        ))}

        {addingField && (
          <FieldEditor
            initial={{ order: section.fields.length }}
            onSave={addField}
            onCancel={() => setAddingField(false)}
          />
        )}

        <button
          onClick={() => { setAddingField(true); setEditingFieldId(null); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-slate-200 text-xs text-slate-400 font-medium hover:border-blue-300 hover:text-blue-500 transition-colors mt-1"
        >
          <Plus size={13} /> Add Field
        </button>
      </div>
    </div>
  );
}

// ── Email Field Row editor ────────────────────────────────────────────────────

interface EmailRow {
  id: string; left_label: string; left_field: string;
  right_label: string; right_field: string; visible: boolean;
}

function EmailFieldEditor({ rows, onChange }: { rows: EmailRow[]; onChange: (r: EmailRow[]) => void }) {
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...rows];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  };
  const toggle = (idx: number) => {
    const next = rows.map((r, i) => i === idx ? { ...r, visible: !r.visible } : r);
    onChange(next);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
        <h3 className="font-semibold text-sm text-slate-700">Consultant Data Block — Row Order</h3>
        <p className="text-xs text-slate-400 mt-0.5">Reorder or hide rows in the generated email. Each row has a left column and right column.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row, idx) => (
          <div key={row.id}
            className={`flex items-center gap-3 px-5 py-3 transition-colors ${row.visible ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
            <GripVertical size={14} className="text-slate-300 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-400 w-5 text-right flex-shrink-0">{idx + 1}</span>
            <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
              <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Left</p>
                <p className="text-xs font-medium text-slate-700 truncate">{row.left_label}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">{row.left_field}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Right</p>
                <p className="text-xs font-medium text-slate-700 truncate">{row.right_label}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">{row.right_field}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => move(idx, -1)} disabled={idx === 0}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-20" title="Move up">
                <ChevronUp size={14} className="text-slate-500" />
              </button>
              <button onClick={() => move(idx, 1)} disabled={idx === rows.length - 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-20" title="Move down">
                <ChevronDown size={14} className="text-slate-500" />
              </button>
              <button onClick={() => toggle(idx)}
                className="p-1 rounded hover:bg-slate-100" title={row.visible ? 'Hide row' : 'Show row'}>
                {row.visible
                  ? <Eye size={14} className="text-emerald-500" />
                  : <EyeOff size={14} className="text-slate-400" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FormBuilder() {
  const [metas, setMetas]             = useState<TemplateMeta[]>([]);
  const [activeForm, setActiveForm]   = useState<string>('caller_assessment');
  const [template, setTemplate]       = useState<FormTemplate | null>(null);
  const [emailRows, setEmailRows]     = useState<EmailRow[] | null>(null);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState('');
  const [addingSectionName, setAddingSectionName] = useState('');
  const [showAddSection, setShowAddSection]       = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchMetas = useCallback(() => {
    api.get<TemplateMeta[]>('/form-config').then(r => setMetas(r.data)).catch(() => {});
  }, []);

  const fetchTemplate = useCallback((name: string) => {
    setLoading(true);
    api.get<FormTemplate & { rows?: EmailRow[] }>(`/form-config/${name}`)
      .then(r => {
        if (name === 'email_fields') {
          setEmailRows(r.data.rows ?? []);
          setTemplate(null);
        } else {
          setTemplate(r.data);
          setEmailRows(null);
        }
      })
      .catch(() => showToast('Failed to load template'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMetas(); }, [fetchMetas]);
  useEffect(() => { if (activeForm) fetchTemplate(activeForm); }, [activeForm, fetchTemplate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeForm === 'email_fields' && emailRows) {
        await api.put('/form-config/email_fields', { label: 'Email Field Order', rows: emailRows });
      } else if (template) {
        await api.put(`/form-config/${template.form_name}`, {
          label: template.label,
          sections: template.sections,
        });
      }
      showToast('✅ Saved successfully!');
      fetchMetas();
    } catch {
      showToast('❌ Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset this form to its original default? All your changes will be lost.')) return;
    try {
      const { data } = await api.post<FormTemplate & { rows?: EmailRow[] }>(`/form-config/${activeForm}/reset`);
      if (activeForm === 'email_fields') {
        setEmailRows((data as unknown as { rows: EmailRow[] }).rows ?? []);
      } else {
        setTemplate(data);
      }
      showToast('Reset to defaults.');
    } catch {
      showToast('Reset failed.');
    }
  };

  const updateSection = (updated: FormSection) => {
    setTemplate(prev => prev ? {
      ...prev,
      sections: prev.sections.map(s => s.id === updated.id ? updated : s),
    } : prev);
  };

  const deleteSection = (id: string) => {
    if (!confirm('Delete this entire section and all its fields?')) return;
    setTemplate(prev => prev ? { ...prev, sections: prev.sections.filter(s => s.id !== id) } : prev);
  };

  const moveSection = (id: string, dir: 'up' | 'down') => {
    if (!template) return;
    const sections = [...template.sections].sort((a, b) => a.order - b.order);
    const idx = sections.findIndex(s => s.id === id);
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sections.length) return;
    [sections[idx].order, sections[swap].order] = [sections[swap].order, sections[idx].order];
    setTemplate({ ...template, sections });
  };

  const addSection = () => {
    if (!addingSectionName.trim() || !template) return;
    const newSec: FormSection = {
      id: uid(),
      label: addingSectionName.trim(),
      order: template.sections.length,
      fields: [],
    };
    setTemplate({ ...template, sections: [...template.sections, newSec] });
    setAddingSectionName('');
    setShowAddSection(false);
  };

  const sortedSections = template ? [...template.sections].sort((a, b) => a.order - b.order) : [];
  const activeMeta = metas.find(m => m.form_name === activeForm);

  return (
    <Layout title="Form Builder">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-white border border-slate-200">
          {toast}
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeMeta?.updated_by
              ? `Last edited by ${activeMeta.updated_by} · ${fmtDate(activeMeta.updated_at ?? null)}`
              : 'Configure form sections and fields'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <RotateCcw size={14} /> Reset to Default
          </button>
          <button onClick={handleSave} disabled={saving || !template}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors">
            <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Form tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        {metas.map(m => (
          <button
            key={m.form_name}
            onClick={() => setActiveForm(m.form_name)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeForm === m.form_name ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Legend — hidden for email_fields tab */}
      {activeForm !== 'email_fields' && (
        <div className="flex flex-wrap gap-3 mb-5 text-xs">
          {FIELD_TYPES.map(ft => (
            <span key={ft.value} className={`px-2 py-0.5 rounded font-medium ${TYPE_BADGE[ft.value]}`}>
              {ft.value} = {ft.label}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded font-medium bg-violet-50 text-violet-600">custom = not tied to a DB column</span>
        </div>
      )}

      {/* Sections / Email editor */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl" />)}
        </div>
      ) : activeForm === 'email_fields' && emailRows ? (
        <EmailFieldEditor rows={emailRows} onChange={setEmailRows} />
      ) : (
        <div className="space-y-4">
          {sortedSections.map((section, idx) => (
            <SectionCard
              key={section.id}
              section={section}
              isFirst={idx === 0}
              isLast={idx === sortedSections.length - 1}
              onUpdate={updateSection}
              onDelete={() => deleteSection(section.id)}
              onMoveUp={() => moveSection(section.id, 'up')}
              onMoveDown={() => moveSection(section.id, 'down')}
            />
          ))}

          {/* Add section */}
          {showAddSection ? (
            <div className="flex items-center gap-2 p-4 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50/30">
              <input
                autoFocus
                value={addingSectionName}
                onChange={e => setAddingSectionName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setShowAddSection(false); }}
                placeholder="Section name, e.g. Background Check"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
              />
              <button onClick={addSection}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                <Check size={14} /> Add
              </button>
              <button onClick={() => setShowAddSection(false)}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 font-medium hover:border-blue-300 hover:text-blue-500 transition-colors"
            >
              <Plus size={16} /> Add New Section
            </button>
          )}
        </div>
      )}
    </Layout>
  );
}
