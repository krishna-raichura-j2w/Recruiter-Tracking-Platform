import React, { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Sparkles, AlignLeft, Image, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { uploadToS3 } from '../api/upload';
import type { DriveCandidate } from '../types';

// Mirrors the normal sourcing form (Candidates.tsx) so a drive candidate is a
// first-class candidate record. Posts to /drives/:driveId/candidates which runs
// the SAME create-flow as POST /candidates (OL checks, caller assignment, etc.).

const EDUCATION_OPTIONS = ['B.Tech/BE', 'M.Tech/ME', 'BCA', 'MCA', 'B.Sc', 'M.Sc', 'B.Com', 'MBA', 'Diploma', 'PhD', 'Other'];
const EXP_RANGES = ['0-1 yr', '1-3 yrs', '3-5 yrs', '5-8 yrs', '8-12 yrs', '12-15 yrs', '15+ yrs'];
const CITIES = ['Bangalore', 'Hyderabad', 'Chennai', 'Mumbai', 'Delhi', 'Pune', 'Noida', 'Other'];
const LEAD_SOURCES = ['Naukri', 'LinkedIn', 'Referral', 'Direct', 'Other'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];

interface CandidateForm {
  full_name: string;
  mobile: string;
  email: string;
  linkedin_url: string;
  education: string;
  city: string;
  exp_range: string;
  current_company: string;
  skills: string;
  naukri_active: string;
  immediate_joiner: string;
  lead_source: string;
  sourcing_date: string;
  first_name: string;
  last_name: string;
  contact_phone: string;
  gender: string;
  location: string;
  designation: string;
  employer: string;
  min_experience: number | string;
  max_experience: number | string;
  current_ctc: number | string;
  expected_ctc: number | string;
}

type ExtractTab = 'text' | 'image' | 'pdf';

interface Props {
  driveId: number;
  jobId: number;
  jobLabel?: string;
  onClose: () => void;
  onAdded: (c: DriveCandidate) => void;
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50';

export default function DriveAddCandidateModal({ driveId, jobId, jobLabel, onClose, onAdded }: Props) {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const sr = user?.secondary_role ?? '';
  const canExtract = role === 'recruiter' || sr === 'recruiter' || role === 'delivery_lead' || sr === 'delivery_lead';

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CandidateForm>();

  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [emailCheckError, setEmailCheckError] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);

  // AI extraction
  const [extractTab, setExtractTab] = useState<ExtractTab>('text');
  const [extractText, setExtractText] = useState('');
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extracted, setExtracted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resume upload
  const [resumeKey, setResumeKey] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState('');
  const [resumeUploading, setResumeUploading] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const TAB_CONFIG: { id: ExtractTab; label: string; icon: React.ReactNode }[] = [
    { id: 'text', label: 'Paste Text', icon: <AlignLeft size={14} /> },
    { id: 'image', label: 'Upload Image', icon: <Image size={14} /> },
    { id: 'pdf', label: 'Upload PDF / Word', icon: <FileText size={14} /> },
  ];

  const handleResumeUpload = async (file: File) => {
    setResumeUploading(true);
    try {
      const { key, url } = await uploadToS3(file, 'resumes');
      setResumeKey(key);
      setResumeUrl(url);
      setResumeName(file.name);
    } catch {
      setApiError('Resume upload failed. Please try again.');
    } finally {
      setResumeUploading(false);
    }
  };

  const handleExtract = async () => {
    setExtractError('');
    if (extractTab === 'text' && !extractText.trim()) { setExtractError('Paste resume text before extracting.'); return; }
    if ((extractTab === 'image' || extractTab === 'pdf') && !extractFile) { setExtractError('Select a file before extracting.'); return; }
    setExtracting(true);
    try {
      const fd = new FormData();
      if (extractTab === 'text') fd.append('text', extractText.trim());
      else fd.append('file', extractFile!);
      const res = await api.post('/resume-extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const p = res.data.profile;
      if (p.name) {
        setValue('full_name', p.name);
        const parts = String(p.name).trim().split(/\s+/);
        if (parts.length) setValue('first_name', parts[0]);
        if (parts.length > 1) setValue('last_name', parts.slice(1).join(' '));
      }
      if (p.mobile_number) { setValue('mobile', p.mobile_number); setValue('contact_phone', p.mobile_number); }
      if (p.email) setValue('email', p.email);
      if (p.linkedin_url && p.linkedin_url !== 'N/A') setValue('linkedin_url', p.linkedin_url);
      if (p.education) setValue('education', p.education);
      if (p.current_location) setValue('city', p.current_location);
      if (p.experience_range) {
        setValue('exp_range', p.experience_range);
        const m = String(p.experience_range).match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
        if (m) { setValue('min_experience', parseFloat(m[1])); setValue('max_experience', parseFloat(m[2])); }
      }
      if (p.current_company) { setValue('current_company', p.current_company); setValue('employer', p.current_company); }
      if (p.designation) setValue('designation', p.designation);
      if (p.relevant_skills) setValue('skills', p.relevant_skills);
      if (p.immediate_joinee) setValue('immediate_joiner', p.immediate_joinee);
      if (p.sourcing_date) setValue('sourcing_date', p.sourcing_date);
      if (p.profile_active_naukri) setValue('naukri_active', p.profile_active_naukri);
      setExtracted(true);
    } catch {
      setExtractError('Extraction failed. Please check your input and try again.');
    } finally {
      setExtracting(false);
    }
  };

  const onSubmit = async (data: CandidateForm) => {
    setApiError('');
    if (emailCheckError) { setApiError('Cannot add this candidate — they are already onboarded in the Offer Letter system.'); return; }
    if (!resumeKey) { setApiError('Resume is required. Please upload a PDF or Word document.'); return; }
    setSubmitting(true);
    try {
      const res = await api.post<DriveCandidate>(`/drives/${driveId}/candidates`, {
        ...data,
        job_id: jobId,
        min_experience: Number(data.min_experience),
        max_experience: Number(data.max_experience),
        current_ctc: Number(data.current_ctc),
        expected_ctc: Number(data.expected_ctc),
        resume: resumeKey,
        resume_data: resumeKey,
      });
      reset();
      onAdded(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } };
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409 && detail) setApiError(detail);
      else setApiError('Failed to add candidate. Please check all required fields.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-base font-bold text-slate-800">Add Candidate to Drive</h3>
            {jobLabel && <p className="text-xs text-slate-400 mt-0.5">{jobLabel}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* AI Extraction panel — recruiter / DL only */}
        {canExtract && (
          <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-br from-violet-50 to-blue-50">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-violet-100"><Sparkles size={14} className="text-violet-600" /></div>
              <span className="text-sm font-bold text-violet-700">AI Profile Extract</span>
              <span className="text-xs text-slate-400 ml-1">— paste or upload to auto-fill below</span>
            </div>
            <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-slate-200 w-fit">
              {TAB_CONFIG.map((t) => (
                <button key={t.id} type="button"
                  onClick={() => { setExtractTab(t.id); setExtractFile(null); setExtractError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${extractTab === t.id ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
            {extractTab === 'text' ? (
              <textarea rows={5} placeholder="Paste the candidate's resume or profile text here…"
                value={extractText} onChange={(e) => setExtractText(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 resize-none font-mono text-slate-700 placeholder-slate-300" />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-slate-200 bg-white cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}>
                {extractFile ? (
                  <>
                    <div className="p-2 rounded-lg bg-violet-100">{extractTab === 'pdf' ? <FileText size={18} className="text-violet-600" /> : <Image size={18} className="text-violet-600" />}</div>
                    <p className="text-sm font-semibold text-violet-700">{extractFile.name}</p>
                    <p className="text-xs text-slate-400">Click to change</p>
                  </>
                ) : (
                  <>
                    <div className="p-2 rounded-lg bg-slate-100">{extractTab === 'pdf' ? <FileText size={18} className="text-slate-400" /> : <Image size={18} className="text-slate-400" />}</div>
                    <p className="text-sm text-slate-500 font-medium">Click to select {extractTab === 'pdf' ? 'a PDF or Word file' : 'an image'}</p>
                    <p className="text-xs text-slate-400">{extractTab === 'pdf' ? '.pdf, .docx, .doc' : 'JPG, PNG, WebP, GIF'}</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" className="hidden"
                  accept={extractTab === 'pdf' ? '.pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword' : 'image/jpeg,image/png,image/webp,image/gif'}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setExtractFile(f);
                    setExtractError('');
                    // A PDF/Word picked for extraction IS the resume — auto-attach it so
                    // the recruiter doesn't upload the same file again below. Removable.
                    if (f && extractTab === 'pdf' && !resumeKey) handleResumeUpload(f);
                  }} />
              </div>
            )}
            {extractError && <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{extractError}</p>}
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={handleExtract} disabled={extracting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all hover:opacity-90" style={{ backgroundColor: '#7c3aed' }}>
                {extracting ? <><Loader2 size={14} className="animate-spin" /> Extracting…</> : <><Sparkles size={14} /> Extract with AI</>}
              </button>
              {extracted && <span className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">Fields filled — review and confirm below</span>}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name *</label>
              <input type="text" placeholder="Priya Sharma" className={inputCls} {...register('full_name', { required: true })} />
              {errors.full_name && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name *</label>
              <input type="text" placeholder="Priya" className={inputCls} {...register('first_name', { required: true })} />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name *</label>
              <input type="text" placeholder="Sharma" className={inputCls} {...register('last_name', { required: true })} />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email *</label>
              <div className="relative">
                <input type="email" placeholder="priya@example.com"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${emailCheckError ? 'border-red-400 focus:border-red-400 focus:ring-red-50' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-50'}`}
                  {...register('email', { required: true })}
                  onBlur={async (e) => {
                    const email = e.target.value.trim();
                    setEmailCheckError('');
                    if (!email || !email.includes('@')) return;
                    setCheckingEmail(true);
                    try {
                      const res = await api.get<{ onboarded: boolean; checked: boolean }>(`/candidates/check-email?email=${encodeURIComponent(email)}`);
                      if (res.data.checked && res.data.onboarded) setEmailCheckError('This candidate is already onboarded in the Offer Letter system and cannot be added to this job.');
                    } catch { /* ignore check failures */ } finally { setCheckingEmail(false); }
                  }} />
                {checkingEmail && <span className="absolute right-3 top-2.5 text-xs text-slate-400 animate-pulse">Checking…</span>}
              </div>
              {errors.email && <p className="text-red-500 text-xs mt-1">Required</p>}
              {emailCheckError && <p className="text-red-600 text-xs mt-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 flex items-center gap-1">🚫 {emailCheckError}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact Phone *</label>
              <input type="tel" placeholder="+91 9XXXXXXXXX" className={inputCls} {...register('contact_phone', { required: true })} />
              {errors.contact_phone && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Gender *</label>
              <select className={inputCls} {...register('gender', { required: true })}>
                <option value="">Select</option>
                {GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              {errors.gender && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location *</label>
              <input type="text" placeholder="Bangalore" className={inputCls} {...register('location', { required: true })} />
              {errors.location && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Designation *</label>
              <input type="text" placeholder="Software Engineer" className={inputCls} {...register('designation', { required: true })} />
              {errors.designation && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employer *</label>
              <input type="text" placeholder="TCS, Infosys…" className={inputCls} {...register('employer', { required: true })} />
              {errors.employer && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Min Experience (yrs) *</label>
              <input type="number" step="0.1" placeholder="3" className={inputCls} {...register('min_experience', { required: true, valueAsNumber: true })} />
              {errors.min_experience && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max Experience (yrs) *</label>
              <input type="number" step="0.1" placeholder="5" className={inputCls} {...register('max_experience', { required: true, valueAsNumber: true })} />
              {errors.max_experience && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current CTC (LPA) *</label>
              <input type="number" step="0.1" placeholder="12.5" className={inputCls} {...register('current_ctc', { required: true, valueAsNumber: true })} />
              {errors.current_ctc && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expected CTC (LPA) *</label>
              <input type="number" step="0.1" placeholder="18" className={inputCls} {...register('expected_ctc', { required: true, valueAsNumber: true })} />
              {errors.expected_ctc && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mobile</label>
              <input type="tel" placeholder="+91 9XXXXXXXXX" className={inputCls} {...register('mobile')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">LinkedIn URL</label>
              <input type="url" placeholder="https://linkedin.com/in/…" className={inputCls} {...register('linkedin_url')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Education</label>
              <select className={inputCls} {...register('education')}>
                <option value="">Select</option>
                {EDUCATION_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
              <select className={inputCls} {...register('city')}>
                <option value="">Select</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exp Range</label>
              <select className={inputCls} {...register('exp_range')}>
                <option value="">Select</option>
                {EXP_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current Company</label>
              <input type="text" placeholder="TCS, Infosys…" className={inputCls} {...register('current_company')} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Skills</label>
              <input type="text" placeholder="React, Python, AWS…" className={inputCls} {...register('skills')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Naukri Active</label>
              <select className={inputCls} {...register('naukri_active')}>
                <option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Immediate Joiner</label>
              <select className={inputCls} {...register('immediate_joiner')}>
                <option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Lead Source</label>
              <select className={inputCls} {...register('lead_source')}>
                <option value="">Select</option>
                {LEAD_SOURCES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sourcing Date</label>
              <input type="date" className={inputCls} {...register('sourcing_date')} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Resume (PDF / Word) *</label>
              <input type="file" ref={resumeInputRef}
                accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleResumeUpload(e.target.files[0]); }} />
              {resumeKey ? (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-green-200 bg-green-50">
                  <FileText size={15} className="text-green-600 flex-shrink-0" />
                  <a href={resumeUrl ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-green-700 font-medium truncate flex-1 hover:underline">{resumeName}</a>
                  <button type="button" onClick={() => { setResumeKey(null); setResumeUrl(null); setResumeName(''); }} className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0">Remove</button>
                </div>
              ) : (
                <button type="button" onClick={() => resumeInputRef.current?.click()} disabled={resumeUploading}
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 text-sm hover:border-blue-400 hover:text-blue-600 transition-colors justify-center disabled:opacity-60">
                  {resumeUploading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  {resumeUploading ? 'Uploading…' : 'Upload Resume (PDF)'}
                </button>
              )}
            </div>
          </div>

          {apiError && <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">{apiError}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
              style={{ backgroundColor: canExtract ? '#7c3aed' : '#3b82f6' }}>
              {submitting ? 'Adding…' : canExtract ? 'Confirm & Add' : 'Add Candidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
