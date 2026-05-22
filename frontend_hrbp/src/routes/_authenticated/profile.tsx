import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getUserProfile, updateUserProfile } from "@/apiService/api";
import type { UserProfileData } from "@/apiService/types";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User as UserIcon,
  Mail,
  Phone,
  Shield,
  Activity,
  Calendar,
  Clock,
  ArrowLeft,
  Loader2,
  Lock,
  Edit2,
  Check,
  X,
} from "lucide-react";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, updateUserState } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [updating, setUpdating] = useState(false);

  const fetchProfile = async () => {
    const storedId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
    const resolvedId = user?.id || (storedId ? Number(storedId) : null);

    if (!resolvedId) {
      setError("User ID not found in session");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getUserProfile(resolvedId);
      if (res.meta.status && res.data) {
        setProfile(res.data);
        setEditName(res.data.name || "");
        setEditPhone(res.data.phone || "");
      } else {
        setError(res.meta.message || "Failed to load profile");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      toast.error(err.message || "Error fetching profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user?.id]);

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    const storedId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
    const resolvedId = user?.id || (storedId ? Number(storedId) : null);
    if (!resolvedId) {
      toast.error("User ID not resolved");
      return;
    }

    setUpdating(true);
    try {
      const res = await updateUserProfile(resolvedId, {
        name: editName.trim(),
        phone: editPhone.trim(),
      });

      if (res.meta.status && res.data) {
        setProfile(res.data);
        updateUserState({ name: res.data.name });
        setIsEditing(false);
        toast.success(res.meta.message || "Profile updated successfully");
      } else {
        toast.error(res.meta.message || "Failed to update profile");
      }
    } catch (err: any) {
      toast.error(err.message || "Error updating profile");
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setEditName(profile.name || "");
      setEditPhone(profile.phone || "");
    }
    setIsEditing(false);
  };

  // Generate initials for avatar
  const getInitials = (name?: string) => {
    if (!name) return "HR";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/60 text-slate-800">
      <TopBar title="My Profile" subtitle="Manage your account settings and credentials." />

      <main className="flex-1 p-6 max-w-5xl w-full mx-auto space-y-6">
        {/* Navigation Shortcut */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            asChild
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 gap-2 transition-all"
          >
            {/* <Link to="/dashboard">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link> */}
          </Button>

          {!loading && !error && profile && (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    onClick={handleSave}
                    disabled={updating}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow-sm"
                  >
                    {updating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Save Changes
                  </Button>
                  <Button
                    onClick={handleCancel}
                    disabled={updating}
                    variant="ghost"
                    className="text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setIsEditing(true)}
                  className="bg-sky-600 hover:bg-sky-500 text-white font-semibold gap-1.5 shadow-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </Button>
              )}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
            <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
            <p className="text-slate-500 text-sm animate-pulse">
              Retrieving your profile details...
            </p>
          </div>
        )}

        {error && (
          <Card className="bg-red-50 border-red-200 text-red-700">
            <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
              <p className="text-base font-semibold">{error}</p>
              <Button onClick={fetchProfile} className="bg-red-600 hover:bg-red-500 text-white">
                Retry Fetch
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && profile && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-sky-500/5 blur-3xl rounded-full" />
              <div className="absolute bottom-[-50px] left-[-50px] w-48 h-48 bg-purple-500/5 blur-3xl rounded-full" />

              <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
                {/* Initial Avatar */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full blur opacity-40 group-hover:opacity-60 transition duration-300" />
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white border border-slate-200 overflow-hidden shadow-inner">
                    <img src="/profile-icon.svg" className="h-16 w-16 opacity-90" alt="Profile" />
                  </div>
                </div>

                {/* Main Identity */}
                <div className="text-center sm:text-left space-y-2 w-full max-w-md">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-md px-3 py-1 text-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 w-full"
                        placeholder="Enter full name"
                        disabled={updating}
                      />
                    ) : (
                      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                        {profile.name}
                      </h2>
                    )}
                    <Badge className="bg-sky-50 text-sky-600 border-sky-200/80 font-bold uppercase tracking-wider text-xs py-0.5 px-2 shrink-0">
                      {profile.role}
                    </Badge>
                  </div>
                  <p className="text-slate-500 text-sm font-medium">{profile.email}</p>
                  <p className="text-xs text-emerald-600 flex items-center justify-center sm:justify-start gap-1.5 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    Active Account Status
                  </p>
                </div>
              </div>
            </div>

            {/* Profile Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Details */}
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition-all">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                    <UserIcon className="w-5 h-5 text-sky-500" />
                    <h3 className="font-bold text-lg text-slate-900">Personal Information</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Full Name
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 w-full"
                          disabled={updating}
                        />
                      ) : (
                        <p className="text-sm font-semibold text-slate-700">{profile.name}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Email Address
                        </span>
                        <Badge
                          variant="outline"
                          className="text-slate-400 border-slate-200 text-[10px] py-0 px-1 gap-1"
                        >
                          <Lock className="w-2.5 h-2.5" /> Read-Only
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span>{profile.email}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Phone Number
                      </span>
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 w-full"
                            placeholder="Enter phone number"
                            disabled={updating}
                          />
                        ) : (
                          <span>{profile.phone || "+91 98765 43210 (Mock)"}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Roles & Security */}
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition-all">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                    <Shield className="w-5 h-5 text-purple-500" />
                    <h3 className="font-bold text-lg text-slate-900">Role & Security</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Primary Role
                        </span>
                        <Badge
                          variant="outline"
                          className="text-slate-400 border-slate-200 text-[10px] py-0 px-1 gap-1"
                        >
                          <Lock className="w-2.5 h-2.5" /> Read-Only
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-slate-500 capitalize">
                        {profile.role}
                      </p>
                    </div>

                    {profile.secondary_role && (
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Secondary Role
                        </span>
                        <p className="text-sm font-semibold text-slate-700 capitalize">
                          {profile.secondary_role}
                        </p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Force Password Change
                      </span>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Lock className="w-4 h-4 text-slate-400" />
                        <span
                          className={
                            profile.must_change_password ? "text-amber-600" : "text-emerald-600"
                          }
                        >
                          {profile.must_change_password
                            ? "Required on next sign-in"
                            : "Not required"}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* System Info */}
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition-all md:col-span-2">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    <h3 className="font-bold text-lg text-slate-900">System Information</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Last Login At
                        </span>
                        <p className="text-sm font-semibold text-slate-700">
                          {profile.last_login_at
                            ? new Date(profile.last_login_at).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Member Since
                        </span>
                        <p className="text-sm font-semibold text-slate-700">
                          {profile.created_at
                            ? new Date(profile.created_at).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
