"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users, Plus, Trash2, Edit3, Shield, User, X, Building2, Link2,
  Search, Ban, CheckCircle, Key, StickyNote, Clock, ChevronDown,
  ChevronUp, AlertTriangle, Mail, Calendar, Loader2
} from "lucide-react";

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  isActive: boolean;
  lastLoginAt: string | null;
  adminNotes: string;
  createdAt: string;
  _count: { brands: number };
}

interface BrandOption {
  id: string;
  name: string;
  userId: string | null;
}

interface BrandAssignment {
  id: string;
  brandId: string;
  brandName: string;
}

type FilterTab = "all" | "active" | "suspended" | "admins";

const AVATAR_COLORS: Record<string, string> = {
  ADMIN: "from-amber-500 to-orange-500",
  USER: "from-indigo-500 to-violet-500",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PK", { dateStyle: "medium" });
}

export default function AdminUsersPage() {
  const { user: authUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const [brandUser, setBrandUser] = useState<UserRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserRecord | null>(null);

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "USER" });
  const [resetPassword, setResetPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [allBrands, setAllBrands] = useState<BrandOption[]>([]);
  const [assignedBrands, setAssignedBrands] = useState<BrandAssignment[]>([]);
  const [brandLoading, setBrandLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error("Failed to load users:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && authUser?.role !== "ADMIN") router.push("/");
  }, [authLoading, authUser, router]);

  useEffect(() => {
    if (authUser?.role === "ADMIN") loadUsers();
  }, [authUser, loadUsers]);

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ||
      (filter === "active" && u.isActive) ||
      (filter === "suspended" && !u.isActive) ||
      (filter === "admins" && u.role === "ADMIN");
    return matchSearch && matchFilter;
  });

  const stats = {
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    suspended: users.filter((u) => !u.isActive).length,
    admins: users.filter((u) => u.role === "ADMIN").length,
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create user"); setSubmitting(false); return; }
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "USER" });
      loadUsers();
    } catch { setError("Failed to create user"); }
    setSubmitting(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setError("");
    setSubmitting(true);
    try {
      const body: any = { id: editUser.id, name: form.name, email: form.email, role: form.role };
      if (form.password) body.password = form.password;
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to update user"); setSubmitting(false); return; }
      setEditUser(null);
      setForm({ name: "", email: "", password: "", role: "USER" });
      setUsers((prev) => prev.map((u) => (u.id === data.id ? { ...u, ...data } : u)));
    } catch { setError("Failed to update user"); }
    setSubmitting(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser || !resetPassword) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetUser.id, password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to reset password"); setSubmitting(false); return; }
      setResetUser(null);
      setResetPassword("");
    } catch { setError("Failed to reset password"); }
    setSubmitting(false);
  };

  const toggleSuspend = async (u: UserRecord) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, isActive: !u.isActive }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...data } : x)));
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/admin/users?id=${deleteConfirm.id}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== deleteConfirm.id));
        setDeleteConfirm(null);
      }
    } catch (e) { console.error(e); }
  };

  const openEdit = (u: UserRecord) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setError("");
  };

  const openBrandAssignment = async (u: UserRecord) => {
    setBrandUser(u);
    setBrandLoading(true);
    try {
      const [brandsRes, assignedRes] = await Promise.all([
        fetch("/api/admin/user-brands"),
        fetch(`/api/admin/user-brands?userId=${u.id}`),
      ]);
      if (brandsRes.ok) setAllBrands(await brandsRes.json());
      if (assignedRes.ok) setAssignedBrands(await assignedRes.json());
    } catch (e) { console.error(e); }
    setBrandLoading(false);
  };

  const assignBrand = async (brandId: string) => {
    if (!brandUser) return;
    try {
      const res = await fetch("/api/admin/user-brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: brandUser.id, brandId }),
      });
      if (res.ok) {
        const newAssignment = await res.json();
        setAssignedBrands((prev) => [...prev, newAssignment]);
      }
    } catch (e) { console.error(e); }
  };

  const unassignBrand = async (brandId: string) => {
    if (!brandUser) return;
    try {
      const res = await fetch(`/api/admin/user-brands?userId=${brandUser.id}&brandId=${brandId}`, { method: "DELETE" });
      if (res.ok) setAssignedBrands((prev) => prev.filter((a) => a.brandId !== brandId));
    } catch (e) { console.error(e); }
  };

  const openNotes = (u: UserRecord) => {
    setExpandedNotes(u.id);
    setNoteDraft(u.adminNotes || "");
  };

  const saveNote = async (userId: string) => {
    setSavingNote(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, adminNotes: noteDraft }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, adminNotes: noteDraft } : u)));
        setExpandedNotes(null);
      }
    } catch (e) { console.error(e); }
    setSavingNote(false);
  };

  const availableBrands = allBrands.filter(
    (b) => !assignedBrands.some((a) => a.brandId === b.id) && b.userId !== brandUser?.id
  );

  const TABS: { key: FilterTab; label: string; count: number; color: string }[] = [
    { key: "all", label: "All Users", count: stats.total, color: "text-gray-700" },
    { key: "active", label: "Active", count: stats.active, color: "text-emerald-700" },
    { key: "suspended", label: "Suspended", count: stats.suspended, color: "text-red-600" },
    { key: "admins", label: "Admins", count: stats.admins, color: "text-amber-700" },
  ];

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      </DashboardLayout>
    );
  }

  if (authUser?.role !== "ADMIN") return null;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-xl">
                <Users size={22} className="text-indigo-600" />
              </div>
              User Management
            </h1>
            <p className="text-gray-500 mt-1 text-sm">Manage accounts, permissions, and brand access</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditUser(null); setForm({ name: "", email: "", password: "", role: "USER" }); setError(""); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-violet-700 transition-all shadow-md text-sm"
          >
            <Plus size={16} /> Add User
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Users", value: stats.total, icon: Users, bg: "bg-indigo-50", iconColor: "text-indigo-600", textColor: "text-indigo-700" },
            { label: "Active", value: stats.active, icon: CheckCircle, bg: "bg-emerald-50", iconColor: "text-emerald-600", textColor: "text-emerald-700" },
            { label: "Suspended", value: stats.suspended, icon: Ban, bg: "bg-red-50", iconColor: "text-red-500", textColor: "text-red-600" },
            { label: "Admins", value: stats.admins, icon: Shield, bg: "bg-amber-50", iconColor: "text-amber-600", textColor: "text-amber-700" },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 border border-white/80`}>
              <div className="flex items-center justify-between mb-2">
                <s.icon size={18} className={s.iconColor} />
                <span className={`text-2xl font-bold ${s.textColor}`}>{s.value}</span>
              </div>
              <p className={`text-xs font-medium ${s.textColor} opacity-80`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm text-gray-900 bg-white"
            />
          </div>
          <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === t.key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              >
                {t.label} <span className={`ml-1 ${filter === t.key ? t.color : "text-gray-400"}`}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* User Cards */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <Users className="mx-auto text-gray-300 mb-4" size={40} />
            <p className="text-gray-500">No users match your search</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => (
              <div
                key={u.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${!u.isActive ? "border-red-100 opacity-80" : "border-gray-100"}`}
              >
                <div className="flex items-center gap-4 px-5 py-4 flex-wrap">
                  {/* Avatar + name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br shrink-0 ${AVATAR_COLORS[u.role]}`}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 truncate">{u.name}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${u.role === "ADMIN" ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>
                          {u.role === "ADMIN" ? <Shield size={9} /> : <User size={9} />}
                          {u.role}
                        </span>
                        {!u.isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700">
                            <Ban size={9} /> Suspended
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Mail size={11} /> {u.email}
                      </p>
                    </div>
                  </div>

                  {/* Meta info */}
                  <div className="hidden md:flex items-center gap-6 text-xs text-gray-400 shrink-0">
                    <div className="text-center">
                      <p className="font-semibold text-gray-700 text-sm">{u._count.brands}</p>
                      <p>Brands</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-gray-600 flex items-center gap-1">
                        <Clock size={11} /> {timeAgo(u.lastLoginAt)}
                      </p>
                      <p>Last login</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-gray-600 flex items-center gap-1">
                        <Calendar size={11} /> {new Date(u.createdAt).toLocaleDateString("en-PK", { dateStyle: "medium" })}
                      </p>
                      <p>Joined</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap">
                    <button
                      onClick={() => openBrandAssignment(u)}
                      title="Manage brand access"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                    >
                      <Building2 size={13} /> Brands
                    </button>
                    <button
                      onClick={() => { setResetUser(u); setResetPassword(""); setError(""); }}
                      title="Reset password"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <Key size={13} /> Reset
                    </button>
                    <button
                      onClick={() => (expandedNotes === u.id ? setExpandedNotes(null) : openNotes(u))}
                      title="Admin notes"
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${u.adminNotes ? "text-violet-700 bg-violet-50 hover:bg-violet-100" : "text-gray-600 bg-gray-100 hover:bg-gray-200"}`}
                    >
                      <StickyNote size={13} />
                      Notes
                      {expandedNotes === u.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    <button
                      onClick={() => openEdit(u)}
                      title="Edit user"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                    {u.id !== authUser?.id && (
                      <>
                        <button
                          onClick={() => toggleSuspend(u)}
                          title={u.isActive ? "Suspend user" : "Activate user"}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${u.isActive ? "text-red-600 bg-red-50 hover:bg-red-100" : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"}`}
                        >
                          {u.isActive ? <><Ban size={13} /> Suspend</> : <><CheckCircle size={13} /> Activate</>}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(u)}
                          title="Delete user"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Admin Notes Panel */}
                {expandedNotes === u.id && (
                  <div className="border-t border-gray-100 bg-violet-50/40 px-5 py-4">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <StickyNote size={12} /> Admin Notes
                    </p>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={3}
                      placeholder="Add private notes about this user (only visible to admins)..."
                      className="w-full px-3 py-2 rounded-xl border border-violet-200 focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none text-sm text-gray-800 bg-white resize-none"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => saveNote(u.id)}
                        disabled={savingNote}
                        className="px-4 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        {savingNote ? "Saving..." : "Save Note"}
                      </button>
                      <button
                        onClick={() => setExpandedNotes(null)}
                        className="px-4 py-1.5 text-gray-600 bg-white border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit User Modal */}
      {(showCreate || editUser) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <button onClick={() => { setShowCreate(false); setEditUser(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editUser ? "Edit User" : "Create New User"}</h2>
            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
            <form onSubmit={editUser ? handleUpdate : handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editUser && <span className="text-gray-400 font-normal">(leave empty to keep current)</span>}
                </label>
                <input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900"
                  {...(!editUser ? { required: true } : {})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900">
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); setEditUser(null); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? "Saving..." : (editUser ? "Update" : "Create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
            <button onClick={() => setResetUser(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-100 rounded-xl">
                <Key size={20} className="text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Reset Password</h2>
                <p className="text-xs text-gray-500">For {resetUser.name}</p>
              </div>
            </div>
            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none text-gray-900"
                  required minLength={6} />
                <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setResetUser(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50">
                  {submitting ? "Saving..." : "Set Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Brand Access Modal */}
      {brandUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative">
            <button onClick={() => { setBrandUser(null); setAssignedBrands([]); setAllBrands([]); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Building2 size={20} className="text-indigo-600" />
              Brand Access — {brandUser.name}
            </h2>
            <p className="text-sm text-gray-500 mb-5">Manage which brands this user can access</p>

            {brandLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-indigo-600" size={28} />
              </div>
            ) : (
              <>
                {assignedBrands.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Assigned Brands</h3>
                    <div className="space-y-2">
                      {assignedBrands.map((a) => (
                        <div key={a.brandId} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
                          <div className="flex items-center gap-2">
                            <Link2 size={14} className="text-green-600" />
                            <span className="text-sm font-medium text-gray-900">{a.brandName}</span>
                          </div>
                          <button onClick={() => unassignBrand(a.brandId)}
                            className="text-xs px-2.5 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium transition-colors">
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {availableBrands.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Available Brands</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {availableBrands.map((b) => (
                        <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl">
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-gray-400" />
                            <span className="text-sm text-gray-700">{b.name}</span>
                          </div>
                          <button onClick={() => assignBrand(b.id)}
                            className="text-xs px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium transition-colors">
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {assignedBrands.length === 0 && availableBrands.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">No brands available to assign</div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-red-100 rounded-xl">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Delete User</h2>
                <p className="text-xs text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-5">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? Their brands and all associated data will also be removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700">
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
