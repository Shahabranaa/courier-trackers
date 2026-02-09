"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  User,
  Eye,
  EyeOff,
  X,
  Check,
  Loader2,
  Building2,
} from "lucide-react";

interface UserData {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  brands: { id: string; name: string }[];
}

interface BrandData {
  id: string;
  name: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    role: "user",
    brandIds: [] as string[],
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/");
    }
  }, [user, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, brandsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/brands"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (brandsRes.ok) setBrands(await brandsRes.json());
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role === "admin") fetchData();
  }, [user, fetchData]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({ username: "", password: "", role: "user", brandIds: [] });
    setError("");
    setShowModal(true);
  };

  const openEditModal = (u: UserData) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: "",
      role: u.role,
      brandIds: u.brands.map((b) => b.id),
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const url = editingUser ? `/api/admin/users/${editingUser.id}` : "/api/admin/users";
      const method = editingUser ? "PUT" : "POST";

      const body: any = {
        username: formData.username,
        role: formData.role,
        brandIds: formData.brandIds,
      };
      if (formData.password) body.password = formData.password;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Operation failed");
      } else {
        setShowModal(false);
        fetchData();
      }
    } catch {
      setError("Network error");
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchData();
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const toggleBrand = (brandId: string) => {
    setFormData((prev) => ({
      ...prev,
      brandIds: prev.brandIds.includes(brandId)
        ? prev.brandIds.filter((id) => id !== brandId)
        : [...prev.brandIds, brandId],
    }));
  };

  if (!user || user.role !== "admin") return null;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-500 mt-1">Manage users and their brand access</p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all"
          >
            <Plus size={16} />
            Create User
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {users.map((u) => (
              <div key={u.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl ${u.role === "admin" ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-600"}`}>
                      {u.role === "admin" ? <Shield size={20} /> : <User size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{u.username}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                          {u.role}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">
                        Created {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(u)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    >
                      <Pencil size={16} />
                    </button>
                    {u.id !== user.id && (
                      deleteConfirm === u.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-all"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(u.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      )
                    )}
                  </div>
                </div>

                {u.brands.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Building2 size={14} className="text-gray-400" />
                    {u.brands.map((b) => (
                      <span key={b.id} className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-600">
                        {b.name}
                      </span>
                    ))}
                  </div>
                )}

                {u.role !== "admin" && u.brands.length === 0 && (
                  <p className="mt-3 text-sm text-amber-600 flex items-center gap-1">
                    No brands assigned — user won't see any data
                  </p>
                )}
              </div>
            ))}

            {users.length === 0 && (
              <div className="text-center py-12 text-gray-400">No users found</div>
            )}
          </div>
        )}

        {showModal && (
          <>
            <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setShowModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <form
                onSubmit={handleSubmit}
                className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">
                    {editingUser ? "Edit User" : "Create User"}
                  </h2>
                  <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password {editingUser && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none pr-12"
                      placeholder={editingUser ? "Leave blank to keep current" : "At least 6 characters"}
                      required={!editingUser}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: "user" })}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${formData.role === "user" ? "bg-gray-100 border-gray-300 text-gray-900" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                    >
                      <User size={16} className="inline mr-1.5" />
                      User
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: "admin" })}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${formData.role === "admin" ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                    >
                      <Shield size={16} className="inline mr-1.5" />
                      Admin
                    </button>
                  </div>
                </div>

                {formData.role !== "admin" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Assigned Brands
                    </label>
                    {brands.length === 0 ? (
                      <p className="text-sm text-gray-400">No brands exist yet. Create brands in Settings first.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {brands.map((brand) => (
                          <label
                            key={brand.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${formData.brandIds.includes(brand.id) ? "bg-indigo-50 border-indigo-200" : "border-gray-200 hover:border-gray-300"}`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.brandIds.includes(brand.id)}
                              onChange={() => toggleBrand(brand.id)}
                              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-gray-700">{brand.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {formData.role === "admin" && (
                      <p className="text-xs text-gray-400 mt-1">Admins have access to all brands</p>
                    )}
                  </div>
                )}

                {formData.role === "admin" && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <p className="text-sm text-indigo-700">
                      <Shield size={14} className="inline mr-1" />
                      Admins have access to all brands and can manage users.
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : editingUser ? "Save Changes" : "Create User"}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
