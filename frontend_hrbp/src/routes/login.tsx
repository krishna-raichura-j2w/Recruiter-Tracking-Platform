import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "react-toastify";
import Lottie from "lottie-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, user, ready } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    fetch("/json/checking-resume.json")
      .then((res) => res.json())
      .then((data) => setAnimationData(data))
      .catch((err) => console.error("Error loading Lottie:", err));
  }, []);

  if (ready && user) return <Navigate to="/dashboard" />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !pwd) {
      toast.error("Enter email and password");
      return;
    }
    setLoading(true);
    try {
      await login(email, pwd);
      toast.success("Successfully signed in");
      nav({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex bg-white text-slate-900 overflow-hidden">
      {/* Left Panel - Animation & Branding */}
      <div className="hidden lg:flex lg:w-1/2 h-full flex-col items-center justify-between p-12 bg-gradient-to-br from-white via-slate-50 to-slate-100 border-r border-slate-200/60 relative overflow-hidden">
        {/* Decorative background blobs */}
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-sky-200/30 blur-[100px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-100/30 blur-[100px] rounded-full" />
        </div>

        {/* Top brand header */}
        <div className="w-full relative z-10 flex items-center gap-3.5">
          <img
            src="/J2W_Logo.png"
            alt="JoulesToWatts Logo"
            className="h-12 w-auto object-contain"
          />
          <div className="h-7 w-[1px] bg-slate-300" />
          <span className="text-sm uppercase tracking-wider font-extrabold text-slate-500">
            HRBP System
          </span>
        </div>

        {/* Center content with Lottie */}
        <div className="relative z-10 w-full max-w-lg space-y-6 text-center my-auto">
          <div className="w-full max-w-xs mx-auto h-72 flex items-center justify-center">
            {animationData ? (
              <Lottie
                animationData={animationData}
                loop={true}
                className="w-full h-full drop-shadow-[0_0_20px_rgba(14,165,233,0.1)]"
              />
            ) : (
              <div className="w-48 h-48 bg-slate-100/50 animate-pulse rounded-full flex items-center justify-center">
                <span className="text-xs text-slate-400">Loading animation...</span>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 lg:text-4xl">
              J2W <span className="text-sky-600">HRBP Console</span>
            </h1>
            <p className="text-base text-slate-600 font-medium max-w-md mx-auto leading-relaxed">
              Managing end-to-end consultant lifecycle, deployments, and client operations
              efficiently.
            </p>
          </div>
        </div>

        {/* Footer brand spacer */}
        <div className="w-full h-6 relative z-10" />
      </div>

      {/* Right Panel - Login Form (Contrasting Sapphire Blue Background) */}
      <div className="w-full lg:w-1/2 h-full flex items-center justify-center p-6 sm:p-12 bg-[#0f2249] text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-400/20 blur-[100px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-sky-400/20 blur-[100px] rounded-full" />
        </div>

        <div className="w-full max-w-md space-y-8 relative z-10">
          {/* Logo on small screens */}
          <div className="flex flex-col items-center text-center space-y-4 lg:hidden">
            <img
              src="/J2W_Logo.png"
              alt="JoulesToWatts Logo"
              className="h-12 w-auto object-contain brightness-0 invert"
            />
            <div className="space-y-1">
              <h2 className="text-3xl font-extrabold text-white">J2W HRBP System</h2>
              <p className="text-sm text-slate-300">
                Sign in to manage consultant lifecycle operations
              </p>
            </div>
          </div>

          {/* Centered Welcome Header */}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-white">Welcome Back</h2>
            <p className="text-slate-300 text-sm sm:text-base max-w-sm mx-auto">
              Enter your HRBP credentials to access the console
            </p>
          </div>

          {/* Form container with glassmorphism */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-2xl shadow-2xl shadow-black/20 space-y-6 backdrop-blur-md">
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-bold uppercase tracking-wider text-slate-300 ml-1"
                >
                  Work Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@joulestowatts.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-[#091835]/50 border-white/10 focus:bg-[#091835]/80 focus:border-white/30 focus:ring-white/5 text-base text-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="pwd"
                  className="text-xs font-bold uppercase tracking-wider text-slate-300 ml-1"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="pwd"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    required
                    className="h-12 bg-[#091835]/50 border-white/10 pr-10 focus:bg-[#091835]/80 focus:border-white/30 focus:ring-white/5 text-base text-white placeholder-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold bg-white hover:bg-slate-100 text-[#0f2249] shadow-lg shadow-black/10 hover:scale-[1.01] transition-all"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
