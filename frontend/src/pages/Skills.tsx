import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Sparkles, FileText, AlignLeft, Loader2,
  Copy, Check, X, Plus, ExternalLink, Target, Zap, Trash2, Briefcase,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../api/client';
import type { Job } from '../types';

type ExtractTab = 'jd' | 'paste' | 'upload';
type SkillStatus = 'mandatory' | 'optional' | 'excluded' | 'ignored';

interface ApiSkill {
  name: string;
  type: 'must' | 'good';
  rarity?: 'common' | 'niche' | 'rare';
  coverage?: 'high' | 'medium' | 'low';
  synonyms?: string[];
  evidence?: string;
}
interface ExtractResponse {
  job_title: string;
  experience_required: string;
  skills: ApiSkill[];
  boolean_string: string;
  boolean_char_count: number;
  reasoning?: string;
  strictness: number;
  extracted_text_preview?: string;
}
interface Skill extends ApiSkill {
  status: SkillStatus;
}

const STRICTNESS_LABELS: Record<number, { label: string; desc: string }> = {
  1: { label: 'Very Broad', desc: 'Max reach — many synonyms, fewer AND blocks' },
  2: { label: 'Broad',      desc: 'Wide net with some precision anchors' },
  3: { label: 'Balanced',   desc: 'Equal recall and precision (default)' },
  4: { label: 'Strict',     desc: 'Fewer synonyms, more AND blocks' },
  5: { label: 'Very Strict',desc: 'Exact matches only — max precision' },
};

const NAUKRI_URL = 'https://www.naukri.com/recruit/dashboard';

/** Build a JD text blob from a Job record — prefers raw text, falls back to
 *  summary, otherwise stitches the structured fields together. */
function jobToJdText(job: Job): string {
  if (job.jd_raw_text && job.jd_raw_text.trim().length > 40) return job.jd_raw_text.trim();
  if (job.jd_summary  && job.jd_summary.trim().length  > 40) {
    return [
      `Job Title: ${job.role_title}`,
      job.client_name ? `Client: ${job.client_name}` : '',
      job.location    ? `Location: ${job.location}` : '',
      job.skill_stack ? `Skills: ${job.skill_stack}` : '',
      (job.min_experience != null || job.max_experience != null)
        ? `Experience: ${job.min_experience ?? '?'} – ${job.max_experience ?? '?'} years`
        : '',
      '',
      job.jd_summary,
    ].filter(Boolean).join('\n');
  }
  return [
    `Job Title: ${job.role_title}`,
    job.client_name ? `Client: ${job.client_name}` : '',
    job.location    ? `Location: ${job.location}` : '',
    job.skill_stack ? `Required Skills: ${job.skill_stack}` : '',
    (job.min_experience != null || job.max_experience != null)
      ? `Experience: ${job.min_experience ?? '?'} – ${job.max_experience ?? '?'} years`
      : '',
    job.work_mode ? `Work Mode: ${job.work_mode}` : '',
    job.salary_range ? `Salary: ${job.salary_range}` : '',
  ].filter(Boolean).join('\n');
}

export default function Skills() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialJobId = searchParams.get('job_id');

  const [tab, setTab] = useState<ExtractTab>(initialJobId ? 'jd' : 'paste');
  const [jd, setJd] = useState('');
  const [strictness, setStrictness] = useState(3);

  // Assigned-JDs picker
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | ''>(initialJobId ? Number(initialJobId) : '');

  const [skills, setSkills] = useState<Skill[]>([]);
  const [booleanString, setBooleanString] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [experienceRequired, setExperienceRequired] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [textPreview, setTextPreview] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind: 'idle' | 'ok' | 'err' | 'busy' }>({
    msg: 'Paste a JD or upload a file to get started.', kind: 'idle',
  });

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [copiedSkill, setCopiedSkill] = useState<string | null>(null);
  const [copiedBoolean, setCopiedBoolean] = useState(false);
  const [customSkill, setCustomSkill] = useState('');

  const setMsg = (msg: string, kind: typeof status.kind = 'idle') => setStatus({ msg, kind });

  const skillCounts = useMemo(() => ({
    mandatory: skills.filter(s => s.status === 'mandatory').length,
    optional:  skills.filter(s => s.status === 'optional').length,
    excluded:  skills.filter(s => s.status === 'excluded').length,
  }), [skills]);

  // ─── boolean rebuild ────────────────────────────────────────────────────────
  const rebuildBoolean = useCallback((arr: Skill[]) => {
    const q = (t: string) => (t.includes(' ') ? `"${t}"` : t);
    const blocks: string[] = [];

    arr.filter(s => s.status === 'mandatory').forEach(s => {
      const terms = [s.name, ...(s.synonyms ?? [])].map(q);
      const dedup = [...new Set(terms)];
      blocks.push(dedup.length > 1 ? `(${dedup.join(' OR ')})` : dedup[0]);
    });

    const optTerms = new Set<string>();
    arr.filter(s => s.status === 'optional').forEach(s => {
      [s.name, ...(s.synonyms ?? [])].forEach(t => optTerms.add(q(t)));
    });
    if (optTerms.size > 0) blocks.push(`(${[...optTerms].join(' OR ')})`);

    let out = blocks.join(' AND ');
    const ex = arr.filter(s => s.status === 'excluded').map(s => q(s.name));
    if (ex.length) out += ` NOT (${ex.join(' OR ')})`;
    setBooleanString(out);
  }, []);

  // ─── apply API response ─────────────────────────────────────────────────────
  function applyResult(payload: ExtractResponse) {
    const normalized: Skill[] = (payload.skills || []).map(s => ({
      ...s,
      status: s.type === 'must' ? 'mandatory' : 'optional',
    }));
    setSkills(normalized);
    setBooleanString(payload.boolean_string || '');
    setJobTitle(payload.job_title || '');
    setExperienceRequired(payload.experience_required || '');
    setReasoning(payload.reasoning || '');
    if (payload.extracted_text_preview) setTextPreview(payload.extracted_text_preview);
    setMsg(
      normalized.length
        ? `Extracted ${normalized.length} skill${normalized.length === 1 ? '' : 's'} — review and tweak below.`
        : 'No clear skills identified.',
      normalized.length ? 'ok' : 'idle'
    );
  }

  // ─── load assigned/visible JDs once ─────────────────────────────────────────
  useEffect(() => {
    setLoadingJobs(true);
    api.get<{ items: Job[] } | Job[]>('/jobs', { params: { limit: 200 } })
      .then(r => {
        const items = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
        // Only show open / pending-review JDs — closed ones aren't sourced
        const usable = items.filter(j => j.status === 'open' || j.status === 'pending_review');
        setJobs(usable);
      })
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  // ─── auto-load JD from ?job_id= or dropdown selection ───────────────────────
  const selectedJob = useMemo(
    () => jobs.find(j => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!selectedJob || autoLoadedRef.current) return;
    if (initialJobId && Number(initialJobId) === selectedJob.id) {
      autoLoadedRef.current = true;
      // Auto-extract immediately when user arrived via "Generate Boolean" button
      void extractFromJob(selectedJob);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJob]);

  async function extractFromJob(job: Job) {
    const jdText = jobToJdText(job);
    if (!jdText.trim()) {
      setMsg('This JD has no extractable text yet — upload or paste the raw JD instead.', 'err');
      return;
    }
    setLoading(true);
    setMsg(`Analyzing "${job.role_title}" (${job.client_name})…`, 'busy');
    setSkills([]); setBooleanString(''); setTextPreview('');
    setJobTitle(''); setExperienceRequired(''); setReasoning('');
    try {
      const res = await api.post<ExtractResponse>('/skills/extract', { jd: jdText, strictness });
      applyResult(res.data);
      // Reflect the choice in the URL so it's bookmarkable
      setSearchParams({ job_id: String(job.id) }, { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMsg(msg || 'Unable to extract skills.', 'err');
    } finally {
      setLoading(false);
    }
  }

  // ─── paste-text extract ─────────────────────────────────────────────────────
  async function onExtract() {
    const value = jd.trim();
    if (!value) { setMsg('Please paste a job description first.', 'err'); return; }
    setLoading(true);
    setMsg('Analyzing job description with AI…', 'busy');
    setSkills([]); setBooleanString(''); setTextPreview('');
    setJobTitle(''); setExperienceRequired(''); setReasoning('');
    try {
      const res = await api.post<ExtractResponse>('/skills/extract', { jd: value, strictness });
      applyResult(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMsg(msg || 'Unable to extract skills.', 'err');
    } finally {
      setLoading(false);
    }
  }

  // ─── upload-file extract ────────────────────────────────────────────────────
  async function onUploadExtract() {
    if (!uploadedFile) { setMsg('Please upload a file first.', 'err'); return; }
    setLoading(true);
    setMsg(`Reading "${uploadedFile.name}"…`, 'busy');
    setSkills([]); setBooleanString(''); setTextPreview('');
    setJobTitle(''); setExperienceRequired(''); setReasoning('');
    try {
      const form = new FormData();
      form.append('file', uploadedFile);
      form.append('strictness', String(strictness));
      const res = await api.post<ExtractResponse>('/skills/extract-file', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      applyResult(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMsg(msg || 'Unable to process file.', 'err');
    } finally {
      setLoading(false);
    }
  }

  function pickFile(file: File | null | undefined) {
    if (!file) { setMsg('No file selected.', 'err'); return; }
    const ok = /\.(pdf|docx?|)$/i.test(file.name) && !!file.name.match(/\.(pdf|doc|docx)$/i);
    if (!ok) { setMsg('Only PDF, DOC, and DOCX files are supported.', 'err'); return; }
    setUploadedFile(file);
    setMsg(`Selected "${file.name}". Click Generate to continue.`, 'ok');
  }

  // ─── skill manipulation ─────────────────────────────────────────────────────
  function setSkillStatus(idx: number, next: SkillStatus) {
    const arr = [...skills];
    arr[idx].status = arr[idx].status === next ? 'ignored' : next;
    setSkills(arr);
    rebuildBoolean(arr);
  }
  function removeSkill(idx: number) {
    const arr = skills.filter((_, i) => i !== idx);
    setSkills(arr);
    rebuildBoolean(arr);
  }
  function addCustomSkill() {
    const name = customSkill.trim();
    if (!name) return;
    const newSkill: Skill = {
      name, type: 'must', status: 'mandatory',
      synonyms: [], evidence: 'Manually added',
    };
    const arr = [...skills, newSkill];
    setSkills(arr);
    setCustomSkill('');
    rebuildBoolean(arr);
    setMsg(`Added "${name}".`, 'ok');
  }

  // ─── copy actions ───────────────────────────────────────────────────────────
  async function copyBoolean() {
    if (!booleanString) return;
    await navigator.clipboard.writeText(booleanString);
    setCopiedBoolean(true);
    setMsg('Boolean string copied. Paste into Naukri.', 'ok');
    setTimeout(() => setCopiedBoolean(false), 1800);
  }
  async function copySkill(name: string) {
    await navigator.clipboard.writeText(name);
    setCopiedSkill(name);
    setTimeout(() => setCopiedSkill(null), 1500);
  }

  function clearAll() {
    setJd(''); setSkills([]); setBooleanString(''); setUploadedFile(null);
    setTextPreview(''); setJobTitle(''); setExperienceRequired(''); setReasoning('');
    setSelectedJobId('');
    if (searchParams.get('job_id')) setSearchParams({}, { replace: true });
    autoLoadedRef.current = false;
    setMsg('Ready. Pick a JD, paste text, or upload a file.', 'idle');
  }

  // ─── render ─────────────────────────────────────────────────────────────────
  return (
    <Layout title="Boolean Builder">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ─── INPUT PANEL (2 cols) ─── */}
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-violet-50 to-blue-50">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-violet-100"><Sparkles size={14} className="text-violet-600" /></div>
              <h2 className="text-sm font-bold text-slate-800">Job Description</h2>
            </div>
            <p className="text-xs text-slate-500">Paste JD text or upload a PDF/Word file — AI generates a Naukri-ready boolean string.</p>
          </div>

          {/* Strictness slider */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Target size={12} className="text-slate-400" /> Boolean Strictness
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                strictness <= 2 ? 'bg-emerald-100 text-emerald-700'
                : strictness === 3 ? 'bg-blue-100 text-blue-700'
                : 'bg-orange-100 text-orange-700'
              }`}>
                {STRICTNESS_LABELS[strictness].label}
              </span>
            </div>
            <input
              type="range" min={1} max={5} step={1}
              value={strictness}
              disabled={loading}
              onChange={e => setStrictness(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
              <span>Broad</span><span>Balanced</span><span>Strict</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 italic">{STRICTNESS_LABELS[strictness].desc}</p>
          </div>

          {/* Tabs */}
          <div className="px-5 pt-4">
            <div className="inline-flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
              <button
                type="button"
                onClick={() => setTab('jd')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === 'jd' ? 'bg-white shadow-sm text-violet-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Briefcase size={12} /> From My JDs
              </button>
              <button
                type="button"
                onClick={() => setTab('paste')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === 'paste' ? 'bg-white shadow-sm text-violet-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <AlignLeft size={12} /> Paste Text
              </button>
              <button
                type="button"
                onClick={() => setTab('upload')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === 'upload' ? 'bg-white shadow-sm text-violet-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileText size={12} /> Upload File
              </button>
            </div>
          </div>

          <div className="px-5 py-4">
            {tab === 'jd' ? (
              <>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Pick a JD assigned to you
                </label>
                <select
                  value={selectedJobId}
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : '';
                    setSelectedJobId(val);
                    autoLoadedRef.current = false;
                  }}
                  disabled={loading || loadingJobs}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 disabled:opacity-60"
                >
                  <option value="">
                    {loadingJobs ? 'Loading your JDs…' : jobs.length ? '— Select a JD —' : 'No assigned open JDs found'}
                  </option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.client_name} · {j.role_title}{j.client_job_id ? ` (${j.client_job_id})` : ''}
                    </option>
                  ))}
                </select>

                {selectedJob && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <div><span className="text-slate-400">Client</span><p className="font-semibold text-slate-700">{selectedJob.client_name}</p></div>
                      <div><span className="text-slate-400">Role</span><p className="font-semibold text-slate-700">{selectedJob.role_title}</p></div>
                      {selectedJob.location && (
                        <div><span className="text-slate-400">Location</span><p className="font-semibold text-slate-700">{selectedJob.location}</p></div>
                      )}
                      {(selectedJob.min_experience != null || selectedJob.max_experience != null) && (
                        <div><span className="text-slate-400">Experience</span>
                          <p className="font-semibold text-slate-700">{selectedJob.min_experience ?? '?'}–{selectedJob.max_experience ?? '?'} yrs</p>
                        </div>
                      )}
                      {selectedJob.skill_stack && (
                        <div className="col-span-2"><span className="text-slate-400">Skills</span>
                          <p className="font-semibold text-slate-700 truncate">{selectedJob.skill_stack}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => selectedJob && extractFromJob(selectedJob)}
                    disabled={loading || !selectedJob}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60"
                  >
                    {loading ? <><Loader2 size={14} className="animate-spin" /> Extracting…</> : <><Zap size={14} /> Generate Boolean</>}
                  </button>
                  <button type="button" onClick={clearAll} disabled={loading}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Uses the JD's parsed text from when it was uploaded. If empty, switch to Paste or Upload.
                </p>
              </>
            ) : tab === 'paste' ? (
              <>
                <div className="relative">
                  <textarea
                    rows={9}
                    value={jd}
                    onChange={e => setJd(e.target.value)}
                    placeholder="Paste the complete job description here…&#10;&#10;e.g. We are looking for a Senior React Developer with 5+ years…"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 font-mono text-slate-700 resize-none"
                    spellCheck={false}
                  />
                  {jd.length > 0 && (
                    <span className="absolute bottom-2 right-3 text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded">
                      {jd.length.toLocaleString()} chars
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={onExtract}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60"
                  >
                    {loading ? <><Loader2 size={14} className="animate-spin" /> Extracting…</> : <><Zap size={14} /> Extract Skills</>}
                  </button>
                  <button type="button" onClick={clearAll} disabled={loading}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                    <X size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div
                  className={`flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    dragOver ? 'border-violet-400 bg-violet-50' : uploadedFile ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/30'
                  }`}
                  onClick={() => !loading && fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                >
                  {uploadedFile ? (
                    <>
                      <div className="p-2.5 rounded-xl bg-emerald-100"><Check size={20} className="text-emerald-700" /></div>
                      <p className="text-sm font-semibold text-emerald-800">{uploadedFile.name}</p>
                      <p className="text-xs text-slate-500">Click to replace</p>
                    </>
                  ) : (
                    <>
                      <div className="p-2.5 rounded-xl bg-slate-100"><FileText size={20} className="text-slate-400" /></div>
                      <p className="text-sm text-slate-600 font-medium">Drag &amp; drop your JD file</p>
                      <p className="text-xs text-slate-400">or click to browse — PDF, DOC, DOCX</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </div>

                {textPreview && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Extracted preview</p>
                    <p className="text-xs text-slate-600 line-clamp-3">{textPreview}…</p>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={onUploadExtract}
                    disabled={loading || !uploadedFile}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60"
                  >
                    {loading ? <><Loader2 size={14} className="animate-spin" /> Extracting…</> : <><Zap size={14} /> Generate Skills</>}
                  </button>
                  <button type="button" onClick={clearAll} disabled={loading}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                    <X size={14} />
                  </button>
                </div>
              </>
            )}

            {/* Status */}
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${
              status.kind === 'ok'   ? 'bg-emerald-50 text-emerald-700'
              : status.kind === 'err'  ? 'bg-red-50 text-red-700'
              : status.kind === 'busy' ? 'bg-blue-50 text-blue-700'
              : 'bg-slate-50 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                status.kind === 'ok' ? 'bg-emerald-500'
                : status.kind === 'err' ? 'bg-red-500'
                : status.kind === 'busy' ? 'bg-blue-500 animate-pulse'
                : 'bg-slate-300'
              }`} />
              <span>{status.msg}</span>
            </div>
          </div>
        </section>

        {/* ─── RESULTS PANEL (3 cols) ─── */}
        <section className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Results</h2>
              <p className="text-xs text-slate-500">
                {skills.length
                  ? `${skillCounts.mandatory} mandatory · ${skillCounts.optional} optional · ${skillCounts.excluded} excluded`
                  : 'Skills and boolean string will appear here.'}
              </p>
            </div>
            <a
              href={NAUKRI_URL} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink size={12} /> Open Naukri
            </a>
          </div>

          {/* JD Summary */}
          {(jobTitle || experienceRequired) && (
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Job Title</p>
                <p className="text-sm font-semibold text-slate-700">{jobTitle || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Experience</p>
                <p className="text-sm font-semibold text-slate-700">{experienceRequired || '—'}</p>
              </div>
            </div>
          )}

          {/* Boolean String */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Naukri Boolean Query</p>
              <span className="text-[10px] text-slate-400">{booleanString.length} / 500 chars</span>
            </div>
            <div className="relative">
              <textarea
                rows={4}
                value={booleanString}
                readOnly
                placeholder="Boolean search string will appear here after extraction…"
                className="w-full px-3 py-2.5 pr-12 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-mono text-slate-700 resize-none focus:outline-none focus:border-violet-400"
              />
              <button
                type="button"
                onClick={copyBoolean}
                disabled={!booleanString}
                className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 disabled:opacity-40 transition-colors"
              >
                {copiedBoolean ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
            {reasoning && (
              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer font-semibold hover:text-slate-700">Reasoning</summary>
                <p className="mt-1 italic">{reasoning}</p>
              </details>
            )}
          </div>

          {/* Add custom skill */}
          {skills.length > 0 && (
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/30 flex gap-2">
              <input
                type="text"
                placeholder="Add a missing skill (e.g. Python)"
                value={customSkill}
                onChange={e => setCustomSkill(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomSkill(); }}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-violet-400"
              />
              <button
                type="button"
                onClick={addCustomSkill}
                disabled={!customSkill.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
              >
                <Plus size={13} /> Add
              </button>
            </div>
          )}

          {/* Skills */}
          {skills.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="inline-flex p-3 rounded-2xl bg-slate-100 mb-3">
                <Sparkles size={20} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">Skills will appear here after extraction.</p>
              <p className="text-xs text-slate-400 mt-1">Toggle each skill as <b>AND</b> (must), <b>OR</b> (optional), or <b>NOT</b> (exclude) to refine the boolean string in real time.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {skills.map((s, i) => (
                <li
                  key={`${s.name}-${i}`}
                  className={`px-5 py-3 transition-colors ${
                    s.status === 'mandatory' ? 'bg-emerald-50/40'
                    : s.status === 'optional' ? 'bg-blue-50/40'
                    : s.status === 'excluded' ? 'bg-red-50/40 opacity-70'
                    : 'bg-slate-50/40 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{s.name}</span>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          s.type === 'must' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {s.type === 'must' ? 'Must' : 'Good'}
                        </span>
                        {s.rarity && s.rarity !== 'common' && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            {s.rarity}
                          </span>
                        )}
                      </div>
                      {(s.synonyms?.length ?? 0) > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          <span className="font-semibold text-slate-400">aka:</span> {s.synonyms!.join(' · ')}
                        </p>
                      )}
                      {s.evidence && (
                        <p className="text-[11px] text-slate-400 italic mt-0.5 truncate">"{s.evidence}"</p>
                      )}
                    </div>

                    {/* Status toggles */}
                    <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-0.5 flex-shrink-0">
                      {(['mandatory', 'optional', 'excluded'] as const).map(st => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSkillStatus(i, st)}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                            s.status === st
                              ? st === 'mandatory' ? 'bg-emerald-500 text-white'
                                : st === 'optional' ? 'bg-blue-500 text-white'
                                : 'bg-red-500 text-white'
                              : 'text-slate-400 hover:bg-slate-50'
                          }`}
                          title={st === 'mandatory' ? 'Must have (AND)' : st === 'optional' ? 'Optional (OR)' : 'Exclude (NOT)'}
                        >
                          {st === 'mandatory' ? 'AND' : st === 'optional' ? 'OR' : 'NOT'}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => copySkill(s.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 flex-shrink-0"
                      title="Copy skill name"
                    >
                      {copiedSkill === s.name ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSkill(i)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                      title="Remove skill"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
