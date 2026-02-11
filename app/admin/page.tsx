"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";

interface UserBrandInfo {
  brandId: string;
  brand: { id: string; name: string };
}

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  isActive: boolean;
  createdAt: string;
  userBrands: UserBrandInfo[];
}

interface BrandOption {
  id: string;
  name: string;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    displayName: "",
    role: "USER" as "SUPER_ADMIN" | "ADMIN" | "USER",
    brandIds: [] as string[],
  });

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error("Failed to fetch users:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/brands");
      if (res.ok) {
        const data = await res.json();
        setBrands(data);
      }
    } catch (e) {
      console.error("Failed to fetch brands:", e);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "SUPER_ADMIN")) {
      router.push("/");
      return;
    }
    if (user && user.role === "SUPER_ADMIN") {
      fetchUsers();
      fetchBrands();
    }
  }, [user, authLoading, router, fetchUsers, fetchBrands]);

  const resetForm = () => {
    setFormData({ username: "", password: "", displayName: "", role: "USER", brandIds: [] });
    setFormError("");
    setFormSuccess("");
    setEditingUser(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (u: AdminUser) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: "",
      displayName: u.displayName,
      role: u.role,
      brandIds: u.userBrands.map((ub) => ub.brandId),
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    try {
      if (editingUser) {
        const body: any = {
          displayName: formData.displayName,
          role: formData.role,
          brandIds: formData.brandIds,
        };
        if (formData.username !== editingUser.username) body.username = formData.username;
        if (formData.password) body.password = formData.password;

        const res = await fetch(`/api/admin/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || "Update failed");
          return;
        }

        setFormSuccess("User updated successfully");
        await fetchUsers();
        setTimeout(() => setShowModal(false), 1000);
      } else {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || "Create failed");
          return;
        }

        setFormSuccess("User created successfully");
        await fetchUsers();
        setTimeout(() => setShowModal(false), 1000);
      }
    } catch {
      setFormError("Network error");
    }
  };

  const toggleUserActive = async (u: AdminUser) => {
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      if (res.ok) fetchUsers();
    } catch {}
  };

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`Are you sure you want to delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (res.ok) fetchUsers();
    } catch {}
  };

  const toggleBrand = (brandId: string) => {
    setFormData((prev) => ({
      ...prev,
      brandIds: prev.brandIds.includes(brandId)
        ? prev.brandIds.filter((id) => id !== brandId)
        : [...prev.brandIds, brandId],
    }));
  };

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
        </div>
      </DashboardLayout>
    );
  }

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: "bg-red-100 text-red-800",
    ADMIN: "bg-purple-100 text-purple-800",
    USER: "bg-blue-100 text-blue-800",
  };

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    USER: "User",
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-500 mt-1">Manage users and their brand access</p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add User
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500">Total Users</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{users.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500">Active Users</div>
            <div className="text-3xl font-bold text-green-600 mt-1">
              {users.filter((u) => u.isActive).length}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500">Total Brands</div>
            <div className="text-3xl font-bold text-indigo-600 mt-1">{brands.length}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Brands</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                          {(u.displayName || u.username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{u.displayName || u.username}</div>
                          <div className="text-sm text-gray-500">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${roleColors[u.role]}`}>
                        {roleLabels[u.role]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {u.role === "SUPER_ADMIN" ? (
                        <span className="text-sm text-gray-500 italic">All brands</span>
                      ) : u.userBrands.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.userBrands.map((ub) => (
                            <span key={ub.brandId} className="inline-flex px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700">
                              {ub.brand.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">No brands assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-sm ${u.isActive ? "text-green-600" : "text-gray-400"}`}>
                        <span className={`w-2 h-2 rounded-full ${u.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleUserActive(u)}
                          className={`p-2 rounded-lg transition-colors ${u.isActive ? "text-gray-400 hover:text-amber-600 hover:bg-amber-50" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}
                          title={u.isActive ? "Deactivate" : "Activate"}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {u.isActive ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                          </svg>
                        </button>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => deleteUser(u)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingUser ? "Edit User" : "Create New User"}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {formError && (
                  <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-200">
                    {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm border border-green-200">
                    {formSuccess}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                    required
                    minLength={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {editingUser ? "New Password (leave blank to keep current)" : "Password"}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                    required={!editingUser}
                    minLength={6}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.role === "SUPER_ADMIN" && "Full access to all brands and admin panel"}
                    {formData.role === "ADMIN" && "Can manage assigned brands and view analytics"}
                    {formData.role === "USER" && "Can view and sync data for assigned brands only"}
                  </p>
                </div>

                {formData.role !== "SUPER_ADMIN" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Brand Access</label>
                    {brands.length === 0 ? (
                      <p className="text-sm text-gray-400">No brands created yet. Create a brand first in Settings.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                        {brands.map((brand) => (
                          <label key={brand.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-1.5 rounded-md">
                            <input
                              type="checkbox"
                              checked={formData.brandIds.includes(brand.id)}
                              onChange={() => toggleBrand(brand.id)}
                              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">{brand.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                  >
                    {editingUser ? "Update User" : "Create User"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
