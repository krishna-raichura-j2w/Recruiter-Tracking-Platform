import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { Shield, TrendingUp, Users, Eye, EyeOff } from 'lucide-react';

interface LoginForm {
  email: string;
  password: string;
}

const seedCredentials = [
  { email: 'admin@j2w.com',   password: 'admin123', role: 'Admin' },
  { email: 'priya@j2w.com',   password: 'kam123',   role: 'KAM' },
  { email: 'dl@j2w.com',      password: 'dl123',    role: 'Delivery Lead' },
  { email: 'ravi@j2w.com',    password: 'rec123',   role: 'Recruiter' },
  { email: 'shwetha@j2w.com', password: 'rec123',   role: 'Recruiter' },
];

const benefits = [
  {
    icon: <TrendingUp size={20} />,
    title: 'Real-time Pipeline Visibility',
    desc: 'Track every candidate from sourcing to joining in one unified view.',
  },
  {
    icon: <Users size={20} />,
    title: 'Role-based Workflows',
    desc: 'Tailored views for pod leads, delivery leads, sourcing partners, and callers.',
  },
  {
    icon: <Shield size={20} />,
    title: 'Structured Quality Control',
    desc: 'Multi-step validation with scoring rubrics ensures only top talent moves forward.',
  },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
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

  const fillCredential = (email: string, password: string) => {
    setValue('email', email);
    setValue('password', password);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left: Brand panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ backgroundColor: '#1a2744' }}
      >
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div
              className="flex items-center justify-center rounded-2xl font-black text-white text-2xl"
              style={{ width: 52, height: 52, backgroundColor: '#3b82f6' }}
            >
              J2W
            </div>
            <div>
              <p className="text-white font-bold text-xl">J2W</p>
              <p className="text-blue-300 text-sm">Recruiter Tracking</p>
            </div>
          </div>

          <h2 className="text-4xl font-black text-white leading-tight mb-4">
            One platform.
            <br />
            <span style={{ color: '#3b82f6' }}>Complete visibility.</span>
          </h2>
          <p className="text-slate-400 text-lg mb-12">
            From sourcing to joining — manage your entire recruitment pipeline with precision.
          </p>

          <div className="space-y-6">
            {benefits.map((b) => (
              <div key={b.title} className="flex gap-4">
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-xl text-white mt-0.5"
                  style={{ width: 40, height: 40, backgroundColor: '#3b82f6' + '22' }}
                >
                  <span style={{ color: '#3b82f6' }}>{b.icon}</span>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{b.title}</p>
                  <p className="text-slate-400 text-sm mt-0.5">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-xs">© 2026 J2W. All rights reserved.</p>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div
              className="flex items-center justify-center rounded-xl font-black text-white text-lg"
              style={{ width: 40, height: 40, backgroundColor: '#3b82f6' }}
            >
              J2W
            </div>
            <p className="text-slate-800 font-bold text-xl">J2W Recruiter Tracking</p>
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm mb-8">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none focus:ring-2 ${errors.email
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
                  className={`w-full px-4 py-3 pr-11 rounded-xl border text-sm transition-colors outline-none focus:ring-2 ${errors.password
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

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span className="text-red-500 text-xs">{error}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-6 rounded-xl text-white text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: '#3b82f6' }}
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

          {/* Seed credentials helper */}
          {/* <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Demo Credentials
            </p>
            <div className="space-y-1.5">
              {seedCredentials.map((cred) => (
                <button
                  key={cred.email}
                  type="button"
                  onClick={() => fillCredential(cred.email, cred.password)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm transition-all text-left group border border-transparent hover:border-slate-200"
                >
                  <div>
                    <span className="text-xs font-medium text-slate-700">{cred.email}</span>
                    <span className="text-xs text-slate-400 ml-2">/ {cred.password}</span>
                  </div>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {cred.role}
                  </span>
                </button>
              ))}
            </div>
          </div> */}
        </div>
      </div>
    </div>
  );
}
