"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function safeRelativeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginAuthChecked, setLoginAuthChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (pathname === "/login") {
      setLoginAuthChecked(false);
      checkAuth().finally(() => setLoginAuthChecked(true));
    } else {
      setLoginAuthChecked(false);
    }
  }, [pathname, checkAuth]);

  useEffect(() => {
    const publicPaths = ["/login", "/landing", "/pricing"];
    const isPublic = publicPaths.includes(pathname) || pathname.startsWith("/shopify/create/");
    if (!loading && !user && !isPublic) {
      const next = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`;
      router.push(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
    } else if (!loading && loginAuthChecked && user && pathname === "/login") {
      const next = typeof window === "undefined"
        ? null
        : safeRelativeNext(new URLSearchParams(window.location.search).get("next"));
      if (next) router.replace(next);
      else if (user.email === "admin@hublogistic.com") router.replace("/admin/users");
      else router.replace("/");
    }
  }, [loading, user, loginAuthChecked, pathname, router]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || "Login failed" };
      }
      setUser(data.user);
      const next = typeof window === "undefined"
        ? null
        : safeRelativeNext(new URLSearchParams(window.location.search).get("next"));
      if (next) router.push(next);
      else if (data.user.email === "admin@hublogistic.com") router.push("/admin/users");
      else router.push("/");
      return {};
    } catch {
      return { error: "Login failed" };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
