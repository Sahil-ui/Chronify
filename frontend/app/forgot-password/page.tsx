"use client";

import Link from "next/link";
import { useState } from "react";
import { API_BASE_URL } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgotpassword`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Failed to send reset email");
      }

      setMsg({ type: "success", text: "Password reset link sent! Check your email." });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to send reset email" });
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
          <h1 className="text-2xl font-semibold tracking-tight">Forgot Password</h1>
          <p className="text-sm text-slate-300">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 animate-cf-fade-up cf-anim-delay-100"
        >
          {msg && (
            <p
              className={`mb-4 rounded-2xl border px-4 py-3 text-xs ${
                msg.type === "error"
                  ? "border-red-500/40 bg-red-950/40 text-red-100"
                  : "border-emerald-500/40 bg-emerald-950/40 text-emerald-100"
              }`}
            >
              {msg.text}
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

            <button
              type="submit"
              disabled={loading}
              className="cf-shimmer inline-flex w-full items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110 disabled:opacity-70"
            >
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            Remember your password?{" "}
            <Link href="/login" className="text-slate-200 hover:underline">
              Back to login
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
