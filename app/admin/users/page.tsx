"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Users, Plus, Trash2, Edit3, Shield, User, X, Building2, Link2 } from "lucide-react";

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
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

export default function AdminUsersPage() {
  const { user: authUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "USER" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [brandUser, setBrandUser] = useState<UserRecord | null>(null);
  const [allBrands, setAllBrands] = useState<BrandOption[]>([]);
  const [assignedBrands, setAssignedBrands] = useState<BrandAssignment[]>([]);
  const [brandLoading, setBrandLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (e) {
      console.error("Failed to load users:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && authUser?.role !== "ADMIN") {
      router.push("/");
    }
  }, [authLoading, authUser, router]);

  useEffect(() => {
    if (authUser?.role === "ADMIN") loadUsers();
  }, [authUser, loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user");
        setSubmitting(false);
        return;
      }
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "USER" });
      loadUsers();
    } catch {
      setError("Failed to create user");
    }
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
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update user");
        setSubmitting(false);
        return;
      }
      setEditUser(null);
      setForm({ name: "", email: "", password: "", role: "USER" });
      loadUsers();
    } catch {
      setError("Failed to update user");
    }
    setSubmitting(false);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? Their brands will also be deleted.")) return;
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`, { method: "DELETE" });
      if (res.ok) loadUsers();
    } catch (e) {
      console.error("Failed to delete user:", e);
    }
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
        fetch(`/api/admin/user-brands?userId=${u.id}`)
      ]);
      if (brandsRes.ok) setAllBrands(await brandsRes.json());
      if (assignedRes.ok) setAssignedBrands(await assignedRes.json());
    } catch (e) {
      console.error("Failed to load brands:", e);
    }
    setBrandLoading(false);
  };

  const assignBrand = async (brandId: string) => {
    if (!brandUser) return;
    try {
      const res = await fetch("/api/admin/user-brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: brandUser.id, brandId })
      });
      if (res.ok) {
        const newAssignment = await res.json();
        setAssignedBrands(prev => [...prev, newAssignment]);
      }
    } catch (e) {
      console.error("Failed to assign brand:", e);
    }
  };

  const unassignBrand = async (brandId: string) => {
    if (!brandUser) return;
    try {
      const res = await fetch(`/api/admin/user-brands?userId=${brandUser.id}&brandId=${brandId}`, { method: "DELETE" });
      if (res.ok) {
        setAssignedBrands(prev => prev.filter(a => a.brandId !== brandId));
      }
    } catch (e) {
      console.error("Failed to unassign brand:", e);
    }
  };

  const availableBrands = allBrands.filter(b => !assignedBrands.some(a => a.brandId === b.id) && b.userId !== brandUser?.id);

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (authUser?.role !== "ADMIN") return null;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-xl">
                <Users size={24} className="text-indigo-600" />
              </div>
              User Management
            </h1>
            <p className="text-gray-500 mt-1">Create and manage user accounts</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditUser(null); setForm({ name: "", email: "", password: "", role: "USER" }); setError(""); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-violet-700 transition-all shadow-md"
          >
            <Plus size={18} /> Add User
          </button>
        </div>

        {(showCreate || editUser) && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
              <button onClick={() => { setShowCreate(false); setEditUser(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold text-gray-900 mb-4">{editUser ? "Edit User" : "Create New User"}</h2>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}
              <form onSubmit={editUser ? handleUpdate : handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password {editUser && <span className="text-gray-400 font-normal">(leave empty to keep current)</span>}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900"
                    {...(!editUser ? { required: true } : {})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900"
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowCreate(false); setEditUser(null); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {submitting ? "Saving..." : (editUser ? "Update" : "Create")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {brandUser && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative">
              <button onClick={() => { setBrandUser(null); setAssignedBrands([]); setAllBrands([]); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Building2 size={20} className="text-indigo-600" />
                Brand Access for {brandUser.name}
              </h2>
              <p className="text-sm text-gray-500 mb-5">Manage which brands this user can access</p>

              {brandLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-3 border-indigo-600 border-t-transparent rounded-full"></div>
                </div>
              ) : (
                <>
                  {assignedBrands.length > 0 && (
                    <div className="mb-5">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Assigned Brands</h3>
                      <div className="space-y-2">
                        {assignedBrands.map(a => (
                          <div key={a.brandId} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
                            <div className="flex items-center gap-2">
                              <Link2 size={14} className="text-green-600" />
                              <span className="text-sm font-medium text-gray-900">{a.brandName}</span>
                            </div>
                            <button
                              onClick={() => unassignBrand(a.brandId)}
                              className="text-xs px-2.5 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium transition-colors"
                            >
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
                        {availableBrands.map(b => (
                          <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl">
                            <div className="flex items-center gap-2">
                              <Building2 size={14} className="text-gray-400" />
                              <span className="text-sm text-gray-700">{b.name}</span>
                            </div>
                            <button
                              onClick={() => assignBrand(b.id)}
                              className="text-xs px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium transition-colors"
                            >
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

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Brands</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                <th className="text-right px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white font-semibold text-sm ${u.role === "ADMIN" ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-gradient-to-br from-indigo-500 to-violet-500"}`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${u.role === "ADMIN" ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>
                      {u.role === "ADMIN" ? <Shield size={12} /> : <User size={12} />}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{u._count.brands}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openBrandAssignment(u)} className="p-2 hover:bg-green-50 rounded-lg text-gray-500 hover:text-green-600 transition-colors" title="Manage brand access">
                        <Building2 size={16} />
                      </button>
                      <button onClick={() => openEdit(u)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-indigo-600 transition-colors" title="Edit user">
                        <Edit3 size={16} />
                      </button>
                      {u.id !== authUser?.id && (
                        <button onClick={() => handleDelete(u.id)} className="p-2 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors" title="Delete user">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
