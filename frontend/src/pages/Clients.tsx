import { useEffect, useRef, useState } from 'react';
import { Plus, X, Pencil, Trash2, Globe, Building2, Clock } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

interface ClientRecord {
  id: number;
  name: string;
  short_name: string | null;
  website_url: string | null;
  logo_data: string | null;
  description: string | null;
  last_updated_by: string | null;
  updated_at: string | null;
}

export default function Clients() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [clients, setClients]     = useState<ClientRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<ClientRecord | null>(null);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState<number | null>(null);
  const [toast, setToast]         = useState('');

  const [form, setForm] = useState({
    name: '', short_name: '', website_url: '', logo_data: '', description: '',
  });

  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchClients = () => {
    setLoading(true);
    api.get<ClientRecord[]>('/clients')
      .then(r => setClients(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchClients(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', short_name: '', website_url: '', logo_data: '', description: '' });
    setShowModal(true);
  };

  const openEdit = (c: ClientRecord) => {
    setEditing(c);
    setForm({
      name:        c.name,
      short_name:  c.short_name  ?? '',
      website_url: c.website_url ?? '',
      logo_data:   c.logo_data   ?? '',
      description: c.description ?? '',
    });
    setShowModal(true);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, logo_data: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Client name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name:        form.name.trim(),
        short_name:  form.short_name  || null,
        website_url: form.website_url || null,
        logo_data:   form.logo_data   || null,
        description: form.description || null,
      };
      if (editing) {
        await api.patch(`/clients/${editing.id}`, payload);
        showToast('Client updated.');
      } else {
        await api.post('/clients', payload);
        showToast('Client added.');
      }
      setShowModal(false);
      fetchClients();
    } catch {
      showToast('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.delete(`/clients/${id}`);
      showToast('Client deleted.');
      fetchClients();
    } catch {
      showToast('Delete failed.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Layout title="Client Management">

      {toast && (
        <div className="fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-white border border-slate-200 text-slate-800">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-500">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 shadow-sm"
          style={{ backgroundColor: '#3b82f6' }}
        >
          <Plus size={16} /> Add Client
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-white rounded-2xl border border-slate-100" />)}
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Building2 size={44} className="opacity-20 mb-3" />
          <p className="font-medium text-slate-500">No clients added yet.</p>
          <p className="text-sm mt-1">Add clients to use them in job openings and email templates.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3">
              {/* Logo */}
              <div className="h-20 flex items-center justify-center bg-slate-50 rounded-xl overflow-hidden">
                {c.logo_data ? (
                  <img src={c.logo_data} alt={c.name} className="max-h-16 max-w-full object-contain" />
                ) : (
                  <Building2 size={32} className="text-slate-300" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 text-base">{c.name}</h3>
                {c.short_name && <p className="text-xs text-slate-500 mt-0.5">{c.short_name}</p>}
                {c.website_url && (
                  <a href={c.website_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1">
                    <Globe size={11} />{c.website_url}
                  </a>
                )}
                {c.description && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">{c.description}</p>
                )}
              </div>

              {/* Last updated by */}
              {c.last_updated_by && (
                <div className="flex items-center gap-1 text-slate-400" style={{ fontSize: '10px' }}>
                  <Clock size={10} />
                  <span>Updated by <span className="font-semibold text-slate-500">{c.last_updated_by}</span></span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-slate-50">
                <button
                  onClick={() => openEdit(c)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  <Pencil size={12} /> Edit
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deleting === c.id}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 border border-red-100 hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-800">{editing ? 'Edit Client' : 'Add Client'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Logo upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Company Logo</label>
                <div
                  className="flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {form.logo_data ? (
                    <>
                      <img src={form.logo_data} alt="logo" className="max-h-16 max-w-48 object-contain" />
                      <p className="text-xs text-slate-400">Click to change</p>
                    </>
                  ) : (
                    <>
                      <Building2 size={24} className="text-slate-300" />
                      <p className="text-sm text-slate-500 font-medium">Click to upload logo</p>
                      <p className="text-xs text-slate-400">PNG, JPG, SVG — will be embedded in emails</p>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" className="hidden"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload} />
                {form.logo_data && (
                  <button onClick={() => setForm(f => ({ ...f, logo_data: '' }))}
                    className="mt-1.5 text-xs text-red-400 hover:text-red-600">
                    Remove logo
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Client Name *</label>
                <input type="text" placeholder="e.g. Sony" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Short Name / Display Name</label>
                <input type="text" placeholder="e.g. Sony IN" value={form.short_name}
                  onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Website URL</label>
                <input type="url" placeholder="https://www.sony.co.in" value={form.website_url}
                  onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Company Description</label>
                <textarea rows={5} placeholder="Brief about the client — shown in the consultant email template…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                  style={{ backgroundColor: '#3b82f6' }}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Client'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
