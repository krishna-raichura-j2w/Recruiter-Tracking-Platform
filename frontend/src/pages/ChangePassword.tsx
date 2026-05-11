import { useState } from 'react';
import { Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import type { AuthUser } from '../types';

interface Props {
  user: AuthUser;
  onDone: (updated: AuthUser) => void;
}

export default function ChangePassword({ user, onDone }: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const weak = newPassword.length > 0 && newPassword.length < 6;
  const valid = newPassword.length >= 6 && newPassword === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        new_password: newPassword,
        confirm_password: confirm,
      });
      // Server returns a fresh token with must_change_password=false
      onDone(data as AuthUser);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? 'Failed to change password. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="px-7 pt-7 pb-5 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#1a2744' }}>
            <KeyRound size={24} className="text-white" />
          </div>
          <h2 className="text-lg font-black text-slate-800">Set Your Password</h2>
          <p className="text-sm text-slate-500 mt-1">
            Welcome, <span className="font-semibold text-slate-700">{user.name}</span>! Choose a new password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-7 pb-7 space-y-4">
          {/* New password */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className={`w-full pr-10 pl-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-1 transition-colors ${
                  weak ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                       : newPassword.length >= 6 ? 'border-green-300 focus:border-green-400 focus:ring-green-100'
                       : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'
                }`}
                autoFocus
              />
              <button type="button" tabIndex={-1} onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {weak && <p className="text-xs text-red-500 mt-1">Must be at least 6 characters</p>}
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                className={`w-full pr-10 pl-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-1 transition-colors ${
                  mismatch ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                           : valid ? 'border-green-300 focus:border-green-400 focus:ring-green-100'
                           : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'
                }`}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {mismatch && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
            {valid && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle2 size={12} /> Passwords match
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!valid || submitting}
            className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#1a2744' }}
          >
            {submitting ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
