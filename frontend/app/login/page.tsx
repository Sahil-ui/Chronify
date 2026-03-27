"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { API_BASE_URL, isAuthenticated, storeToken, storeUser } from "@/lib/auth";

type LoginResponse = {
  token: string;
  user: { id: string; name: string; email: string };
};

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = (await res.json()) as Partial<LoginResponse> & {
        message?: string;
      };

      if (!res.ok) {
        throw new Error(json.message || "Login failed");
      }

      if (!json.token) {
        throw new Error("Login succeeded but no token was returned");
      }

      storeToken(json.token);
      if (json.user) storeUser(json.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 pb-16 pt-14">
        <header className="space-y-2 text-center animate-cf-fade-up">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Chronify
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-slate-300">
            Sign in to continue to your dashboard.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 animate-cf-fade-up cf-anim-delay-100"
        >
          {error && (
            <p className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-xs text-slate-300">Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-600 focus:border-emerald-400"
                placeholder="you@company.com"
                autoComplete="email"
              />
            </label>

            <label className="block space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Password</span>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Forgot Password?
                </Link>
              </div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-600 focus:border-emerald-400"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="cf-shimmer inline-flex w-full items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110 disabled:opacity-70"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            New to Chronify?{" "}
            <Link href="/signup" className="text-slate-200 hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}

