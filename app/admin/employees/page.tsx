"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/components/providers/AuthContext";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2, Edit3, Link as LinkIcon, Copy, Check, ToggleLeft, ToggleRight, Loader2, X, Building2 } from "lucide-react";

interface Employee {
    id: string;
    username: string;
    name: string;
    brandId: string;
    brandName: string;
    isActive: boolean;
    createdAt: string;
}

interface Brand {
    id: string;
    name: string;
}

export default function EmployeesPage() {
    const { user: authUser } = useAuth();
    const router = useRouter();

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Employee | null>(null);
    const [saving, setSaving] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [form, setForm] = useState({ username: "", name: "", brandId: "", isActive: true });

    useEffect(() => {
        if (authUser && authUser.role !== "ADMIN") {
            router.push("/");
        }
    }, [authUser, router]);

    const fetchEmployees = async () => {
        try {
            const res = await fetch("/api/admin/employees");
            if (res.ok) {
                const data = await res.json();
                setEmployees(data);
            }
        } catch {}
        setLoading(false);
    };

    const fetchBrands = async () => {
        try {
            const res = await fetch("/api/brands");
            if (res.ok) {
                const data = await res.json();
                setBrands(data);
            }
        } catch {}
    };

    useEffect(() => {
        fetchEmployees();
        fetchBrands();
    }, []);

    const openCreate = () => {
        setEditing(null);
        setForm({ username: "", name: "", brandId: brands[0]?.id || "", isActive: true });
        setModalOpen(true);
    };

    const openEdit = (emp: Employee) => {
        setEditing(emp);
        setForm({ username: emp.username, name: emp.name, brandId: emp.brandId, isActive: emp.isActive });
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.username.trim() || !form.name.trim() || !form.brandId) return;
        setSaving(true);
        try {
            const method = editing ? "PUT" : "POST";
            const body = editing
                ? { id: editing.id, ...form }
                : form;

            const res = await fetch("/api/admin/employees", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                setModalOpen(false);
                fetchEmployees();
            } else {
                const data = await res.json();
                alert(data.error || "Failed to save");
            }
        } catch {
            alert("Failed to save");
        }
        setSaving(false);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete employee "${name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/admin/employees?id=${id}`, { method: "DELETE" });
            if (res.ok) fetchEmployees();
        } catch {}
    };

    const toggleActive = async (emp: Employee) => {
        try {
            await fetch("/api/admin/employees", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: emp.id, isActive: !emp.isActive }),
            });
            fetchEmployees();
        } catch {}
    };

    const getEmployeeUrl = (username: string) => {
        if (typeof window !== "undefined") {
            return `${window.location.origin}/shopify/create/${username}`;
        }
        return `/shopify/create/${username}`;
    };

    const copyUrl = (username: string, id: string) => {
        navigator.clipboard.writeText(getEmployeeUrl(username));
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const slugify = (val: string) => {
        return val.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
    };

    if (authUser?.role !== "ADMIN") return null;

    return (
        <DashboardLayout>
            <div className="p-6 lg:p-10">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Employee Management</h1>
                        <p className="text-sm text-gray-500 mt-1">Create employees and share their unique order creation links</p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <UserPlus size={18} />
                        Add Employee
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="animate-spin text-gray-400" size={32} />
                    </div>
                ) : employees.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                        <UserPlus className="mx-auto text-gray-300 mb-4" size={48} />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Employees Yet</h3>
                        <p className="text-sm text-gray-500 mb-6">Add employees so they can create WhatsApp orders through their own unique links.</p>
                        <button onClick={openCreate} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors">
                            Add First Employee
                        </button>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="text-left px-5 py-3 font-semibold text-gray-600">Name</th>
                                        <th className="text-left px-5 py-3 font-semibold text-gray-600">Username</th>
                                        <th className="text-left px-5 py-3 font-semibold text-gray-600">Brand</th>
                                        <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                                        <th className="text-left px-5 py-3 font-semibold text-gray-600">Link</th>
                                        <th className="text-left px-5 py-3 font-semibold text-gray-600">Created</th>
                                        <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.map(emp => (
                                        <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-5 py-3.5 font-medium text-gray-900">{emp.name}</td>
                                            <td className="px-5 py-3.5">
                                                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{emp.username}</span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="flex items-center gap-1.5 text-gray-700">
                                                    <Building2 size={14} className="text-gray-400" />
                                                    {emp.brandName}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <button onClick={() => toggleActive(emp)} className="flex items-center gap-1.5">
                                                    {emp.isActive ? (
                                                        <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                                            <ToggleRight size={14} /> Active
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full text-xs font-medium">
                                                            <ToggleLeft size={14} /> Inactive
                                                        </span>
                                                    )}
                                                </button>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <button
                                                    onClick={() => copyUrl(emp.username, emp.id)}
                                                    className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-xs font-medium transition-colors"
                                                >
                                                    {copiedId === emp.id ? (
                                                        <><Check size={14} /> Copied!</>
                                                    ) : (
                                                        <><Copy size={14} /> Copy Link</>
                                                    )}
                                                </button>
                                            </td>
                                            <td className="px-5 py-3.5 text-gray-500 text-xs">
                                                {new Date(emp.createdAt).toLocaleDateString("en-PK", { dateStyle: "medium" })}
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => openEdit(emp)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors">
                                                        <Edit3 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDelete(emp.id, emp.name)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {modalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {editing ? "Edit Employee" : "Add Employee"}
                                </h3>
                                <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                    <X size={20} className="text-gray-400" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={e => {
                                            setForm(f => ({ ...f, name: e.target.value }));
                                            if (!editing) {
                                                setForm(f => ({ ...f, name: e.target.value, username: slugify(e.target.value) }));
                                            }
                                        }}
                                        placeholder="e.g. Shahab"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Username (URL slug)</label>
                                    <input
                                        type="text"
                                        value={form.username}
                                        onChange={e => setForm(f => ({ ...f, username: slugify(e.target.value) }))}
                                        placeholder="e.g. shahab"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    />
                                    {form.username && (
                                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                            <LinkIcon size={12} />
                                            /shopify/create/{form.username}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Brand</label>
                                    <select
                                        value={form.brandId}
                                        onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    >
                                        <option value="">Select a brand</option>
                                        {brands.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-700">Active</label>
                                    <button
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isActive ? "bg-green-500" : "bg-gray-300"}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isActive ? "translate-x-6" : "translate-x-1"}`} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setModalOpen(false)}
                                    className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !form.username || !form.name || !form.brandId}
                                    className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                                >
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {editing ? "Save Changes" : "Create Employee"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
