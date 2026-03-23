"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/auth";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const { token } = use(params);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic frontend validation
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/resetpassword/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Failed to reset password");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6 animate-cf-fade-up">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Password Reset Complete</h1>
          <p className="text-sm text-slate-300">
            Your password has been securely updated. You can now sign in with your new password.
          </p>
          <Link
            href="/login"
            className="cf-shimmer inline-flex w-full items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 pb-16 pt-14">
        <header className="space-y-2 text-center animate-cf-fade-up">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Chronify
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Set New Password</h1>
          <p className="text-sm text-slate-300">
            Please enter your new password below.
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
              <span className="text-xs text-slate-300">New Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-600 focus:border-emerald-400"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs text-slate-300">Confirm New Password</span>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                required
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-600 focus:border-emerald-400"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="cf-shimmer inline-flex w-full items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110 disabled:opacity-70"
            >
              {loading ? "Saving…" : "Reset Password"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
