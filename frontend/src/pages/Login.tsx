import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import LottieLib from 'lottie-react';
import hiringAnim from '../assets/lottie-hiring.json';

// lottie-react CJS/ESM interop fix for Vite
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lottie: React.ComponentType<any> = (LottieLib as any).default ?? LottieLib;

interface LoginForm {
  email: string;
  password: string;
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError('');
    setIsLoading(true);
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Left: Brand panel ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10"
        style={{ backgroundColor: '#0B1437' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Joulestowatts" className="object-contain" style={{ maxHeight: 40 }} />
        </div>

        {/* Lottie + headline */}
        <div className="flex flex-col items-center text-center">
          <Lottie
            animationData={hiringAnim}
            loop
            style={{ width: 320, height: 320 }}
          />
          <h2 className="text-3xl font-black text-white leading-tight mt-4">
            MRR Tracking Tool
          </h2>
          <p className="text-slate-400 text-sm mt-3 max-w-xs leading-relaxed">
            From sourcing to joining — your entire recruitment pipeline in one unified view.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {['Pipeline Tracking', 'Role-based Access', 'Quality Control', 'Interview Tracking'].map((f) => (
              <span
                key={f}
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{ backgroundColor: '#3b82f611', color: '#93c5fd', border: '1px solid #3b82f633' }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-xs text-center">
          © 2026 Joulestowatts. All rights reserved.
        </p>
      </div>

      {/* ── Right: Login form ── */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <img src="/logo.jpg" alt="Joulestowatts" className="object-contain" style={{ maxHeight: 36 }} />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800">Welcome back</h2>
            <p className="text-slate-500 text-sm mt-1">
              Sign in to <span className="font-semibold text-slate-700">MRR Tracking Tool</span>
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@joulestowatts.com"
                className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none focus:ring-2 ${
                  errors.email
                    ? 'border-red-300 focus:ring-red-100'
                    : 'border-slate-200 focus:border-blue-400 focus:ring-blue-50'
                }`}
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email' },
                })}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 pr-11 rounded-xl border text-sm transition-colors outline-none focus:ring-2 ${
                    errors.password
                      ? 'border-red-300 focus:ring-red-100'
                      : 'border-slate-200 focus:border-blue-400 focus:ring-blue-50'
                  }`}
                  {...register('password', { required: 'Password is required' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span className="text-red-500 text-xs">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-6 rounded-xl text-white text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: '#0B1437' }}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            Powered by{' '}
            <span className="font-semibold text-slate-500">Joulestowatts</span>
          </p>
        </div>
      </div>
    </div>
  );
}
