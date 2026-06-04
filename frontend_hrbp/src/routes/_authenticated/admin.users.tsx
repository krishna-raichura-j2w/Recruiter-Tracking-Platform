import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Search, Pencil, KeyRound, UserX, UserCheck2, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { LottieIcon } from "@/components/LottieIcon";
import { TableLoader } from "@/components/Loader";
import { CustomTablePagination } from "@/components/CustomPagination";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  resetAdminUserPassword,
  type AdminUser,
} from "@/apiService/adminApi";

export const Route = createFileRoute("/_authenticated/admin/users")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("j2w_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u.role !== "admin") throw redirect({ to: "/dashboard" });
      }
    }
  },
  component: AdminUsersPage,
});

const ROLES = ["admin", "hrbp", "bh", "ops_head", "coo", "ceo", "po_finance"];

function roleBadgeColor(role: string) {
  const map: Record<string, string> = {
    admin: "bg-red-100 text-red-700",
    hrbp: "bg-blue-100 text-blue-700",
    bh: "bg-violet-100 text-violet-700",
    ops_head: "bg-amber-100 text-amber-700",
    coo: "bg-emerald-100 text-emerald-700",
    ceo: "bg-slate-100 text-slate-700",
  };
  return map[role] ?? "bg-slate-100 text-slate-600";
}

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "hrbp", phone: "" });

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", role: "", is_active: true });
  const [editing, setEditing] = useState(false);

  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await getAdminUsers({
        role: roleFilter !== "all" ? roleFilter : undefined,
        include_inactive: includeInactive,
      });
      setUsers(res.data);
    } catch (e: any) {
      toast.error(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [roleFilter, includeInactive]);

  const filtered = useMemo(
    () => users.filter(
      (u) =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()),
    ),
    [users, search],
  );

  const paginated = useMemo(
    () => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filtered, page, rowsPerPage],
  );

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    hrbp: users.filter((u) => u.role === "hrbp").length,
    bh: users.filter((u) => u.role === "bh").length,
  }), [users]);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password || !form.role) {
      toast.error("Name, email, password and role are required");
      return;
    }
    try {
      setCreating(true);
      await createAdminUser({ ...form, phone: form.phone || undefined });
      toast.success("User created successfully");
      setCreateOpen(false);
      setForm({ name: "", email: "", password: "", role: "hrbp", phone: "" });
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setEditForm({ name: u.name, email: u.email, phone: u.phone ?? "", role: u.role, is_active: u.is_active });
  };

  const handleEdit = async () => {
    if (!editUser) return;
    try {
      setEditing(true);
      await updateAdminUser(editUser.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone || undefined,
        role: editForm.role,
        is_active: editForm.is_active,
      });
      toast.success("User updated");
      setEditUser(null);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || "Failed to update user");
    } finally {
      setEditing(false);
    }
  };

  const handleReset = async () => {
    if (!resetUser || !newPassword) return;
    try {
      setResetting(true);
      await resetAdminUserPassword(resetUser.id, newPassword);
      toast.success("Password reset. User must change on next login.");
      setResetUser(null);
      setNewPassword("");
    } catch (e: any) {
      toast.error(e.message || "Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const toggleActive = async (u: AdminUser) => {
    try {
      await updateAdminUser(u.id, { is_active: !u.is_active });
      toast.success(u.is_active ? "User deactivated" : "User activated");
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || "Failed to update user");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-slate-800">
      <TopBar title="User Management" subtitle="Create and manage system users" />
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Users", value: stats.total, color: "text-sky-600", src: "/json/employee-colored.json" },
            { label: "Active", value: stats.active, color: "text-emerald-600", src: "/json/reviewed.json" },
            { label: "HRBPs", value: stats.hrbp, color: "text-blue-600", src: "/json/hiring.json" },
            { label: "Business Heads", value: stats.bh, color: "text-violet-600", src: "/json/team-working-on-project.json" },
          ].map(({ label, value, color, src }) => (
            <Card key={label} className="flex items-center gap-4 p-4 border border-slate-100 shadow-sm bg-white rounded-xl">
              <div className="shrink-0">
                <LottieIcon src={src} size={40} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name or email…"
              className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36 h-10 border-slate-200 shadow-sm bg-white">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>{r.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-slate-300"
            />
            Include inactive
          </label>
          <Button onClick={() => setCreateOpen(true)} className="ml-auto gap-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
            <Plus className="h-4 w-4" /> New User
          </Button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={6} />
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-slate-400">No users found.</TableCell>
                </TableRow>
              ) : (
                paginated.map((u) => (
                  <TableRow key={u.id} className="hover:bg-slate-50">
                    <TableCell className="font-medium text-slate-800">{u.name}</TableCell>
                    <TableCell className="text-slate-600 text-sm">{u.email}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadgeColor(u.role)}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">{u.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "default" : "secondary"} className={u.is_active ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                        {u.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-blue-600" onClick={() => openEdit(u)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-amber-600" onClick={() => setResetUser(u)} title="Reset password">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className={`h-8 w-8 ${u.is_active ? "text-slate-500 hover:text-red-500" : "text-slate-400 hover:text-emerald-600"}`} onClick={() => toggleActive(u)} title={u.is_active ? "Deactivate" : "Activate"}>
                          {u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <CustomTablePagination
          count={filtered.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_: any, p: number) => setPage(p)}
          onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </main>

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { label: "Full Name *", key: "name", type: "text", placeholder: "Sara Thomas" },
              { label: "Email *", key: "email", type: "email", placeholder: "sara@joulestowatts.com" },
              { label: "Temporary Password *", key: "password", type: "password", placeholder: "••••••••" },
              { label: "Phone", key: "phone", type: "tel", placeholder: "+91 9876543210" },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  type={type}
                  placeholder={placeholder}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-500">User will be required to change password on first login.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) setEditUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { label: "Full Name", key: "name", type: "text" },
              { label: "Email", key: "email", type: "email" },
              { label: "Phone", key: "phone", type: "tel" },
            ].map(({ label, key, type }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  type={type}
                  value={(editForm as any)[key]}
                  onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editing} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              {editing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={!!resetUser} onOpenChange={(o) => { if (!o) { setResetUser(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">Set a new temporary password for <span className="font-semibold">{resetUser?.name}</span>. They will be required to change it on next login.</p>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetUser(null); setNewPassword(""); }}>Cancel</Button>
            <Button onClick={handleReset} disabled={resetting || !newPassword} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm">
              {resetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
