"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  API_BASE_URL,
  authHeader,
  clearToken,
  getStoredToken,
  getStoredUser,
} from "@/lib/auth";

type NavbarProps = {
  active?: "dashboard" | "goals";
};

export default function Navbar({ active }: NavbarProps) {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (user?.name) setUserName(user.name);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const token = getStoredToken();
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: authHeader(token),
      });
    } catch {
      // Logout best-effort — always clear locally
    } finally {
      clearToken();
      router.push("/login");
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 md:px-10 lg:px-16">
        {/* Brand */}
        <Link href="/dashboard" className="inline-flex items-center gap-2 group">
          <span className="h-2 w-2 rounded-full bg-emerald-400 transition group-hover:shadow-[0_0_8px_2px] group-hover:shadow-emerald-400/60" />
          <span className="text-sm font-semibold tracking-tight text-slate-100">
            Chronify
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              active === "dashboard"
                ? "bg-slate-800 text-slate-100"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            Dashboard
          </Link>

          <Link
            href="/goals"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              active === "goals"
                ? "bg-slate-800 text-slate-100"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Goals
          </Link>
        </div>

        {/* Right: user + logout */}
        <div className="flex items-center gap-3">
          <a
            href="mailto:chronify140@gmail.com"
            className="hidden text-[11px] font-medium text-slate-500 transition hover:text-emerald-400 lg:block"
            title="Contact support for help or feedback"
          >
            Support
          </a>
          
          {userName && (
            <span className="hidden text-xs text-slate-400 sm:block">
              {userName}
            </span>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:opacity-60"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </nav>
  );
}
