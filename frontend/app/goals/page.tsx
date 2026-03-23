"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import {
  API_BASE_URL,
  authHeader,
  getStoredToken,
  isAuthenticated,
} from "@/lib/auth";

// ─── Types ─────────────────────────────────────────────────────────────────────

type GoalStatus = "active" | "paused" | "completed" | "archived";

type Goal = {
  _id: string;
  title: string;
  description?: string;
  deadline: string;
  dailyAvailableHours: number;
  status: GoalStatus;
  tags: string[];
  createdAt: string;
};

type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const statusConfig: Record<GoalStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-500/10 text-emerald-300" },
  paused: { label: "Paused", color: "bg-amber-500/10 text-amber-300" },
  completed: { label: "Completed", color: "bg-sky-500/10 text-sky-300" },
  archived: { label: "Archived", color: "bg-slate-700/40 text-slate-400" },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const daysUntil = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  return `${days}d left`;
};

const toDateInputValue = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ─── Confirm Delete Dialog ─────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-cf-fade-up rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <p className="text-sm text-slate-200">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-full border border-slate-700 bg-slate-900 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-full bg-red-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/30 transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Goal Form (shared for create & edit) ──────────────────────────────────────

type GoalFormProps = {
  initial?: Goal;
  onSaved: (goal: Goal) => void;
  onCancel: () => void;
};

function GoalForm({ initial, onSaved, onCancel }: GoalFormProps) {
  const formRef = useRef<HTMLDivElement>(null);
  const isEditing = !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [deadline, setDeadline] = useState(
    initial ? toDateInputValue(initial.deadline) : ""
  );
  const [dailyHours, setDailyHours] = useState(
    String(initial?.dailyAvailableHours ?? "2")
  );
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [status, setStatus] = useState<GoalStatus>(initial?.status ?? "active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = getStoredToken();
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const body = {
        title,
        description: description || undefined,
        deadline: new Date(deadline).toISOString(),
        dailyAvailableHours: Number(dailyHours),
        tags: parsedTags,
        ...(isEditing ? { status } : {}),
      };

      const url = isEditing
        ? `${API_BASE_URL}/goals/${initial!._id}`
        : `${API_BASE_URL}/goals`;
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeader(token) },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to save goal");
      onSaved(json as Goal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={formRef}
      className="animate-cf-fade-up rounded-3xl border border-emerald-700/40 bg-slate-900 p-6"
    >
      <h3 className="mb-4 text-sm font-semibold text-slate-100">
        {isEditing ? "Edit goal" : "New goal"}
      </h3>

      {error && (
        <p className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-2.5 text-xs text-red-100">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs text-slate-400">
            Goal title <span className="text-red-400">*</span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="e.g. Launch my SaaS product"
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs text-slate-400">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="What does success look like?"
            className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-slate-400">
              Deadline <span className="text-red-400">*</span>
            </span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400 [color-scheme:dark]"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-slate-400">
              Hours/day <span className="text-red-400">*</span>
            </span>
            <input
              type="number"
              value={dailyHours}
              onChange={(e) => setDailyHours(e.target.value)}
              required
              min={0.5}
              max={16}
              step={0.5}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
            />
          </label>
        </div>

        {isEditing && (
          <label className="block space-y-1.5">
            <span className="text-xs text-slate-400">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as GoalStatus)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs text-slate-400">
            Tags{" "}
            <span className="text-slate-600">(comma-separated)</span>
          </span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. work, coding, health"
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400"
          />
        </label>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-slate-700 bg-slate-900 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="cf-shimmer flex-1 rounded-full bg-emerald-400 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Saving…" : isEditing ? "Save changes" : "Create goal"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Goal Card ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  onEdit: (g: Goal) => void;
  onDelete: (g: Goal) => void;
}) {
  const status = statusConfig[goal.status] ?? statusConfig.active;
  const urgency = daysUntil(goal.deadline);
  const overdue = urgency === "Overdue";

  return (
    <div className="cf-card-hover flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium text-slate-100">{goal.title}</p>
          {goal.description && (
            <p className="line-clamp-2 text-xs text-slate-500">
              {goal.description}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium ${status.color}`}
        >
          {status.label}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className={`font-medium ${overdue ? "text-red-400" : "text-slate-400"}`}>
          📅 {formatDate(goal.deadline)} · {urgency}
        </span>
        <span className="text-slate-500">⏱ {goal.dailyAvailableHours}h/day</span>
      </div>

      {/* Tags */}
      {goal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {goal.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-medium text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 border-t border-slate-800 pt-3">
        <button
          onClick={() => onEdit(goal)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </button>
        <button
          onClick={() => onDelete(goal)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-950/60"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────────

function EmptyGoals({ onAdd, onAddAi }: { onAdd: () => void; onAddAi: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-slate-800 bg-slate-950/60 px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-3xl">
        🎯
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-200">No goals yet</p>
        <p className="max-w-xs text-xs text-slate-500">
          Set a goal and Chronify will help you plan tasks to achieve it.
        </p>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={onAddAi}
          className="cf-shimmer inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-violet-500/30 transition hover:brightness-110"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Generate with AI
        </button>
        <button
          onClick={onAdd}
          className="cf-shimmer inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition hover:brightness-110"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New goal
        </button>
      </div>
    </div>
  );
}

// ─── Goals Page ────────────────────────────────────────────────────────────────

function GoalsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<GoogleCalendarStatus | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // null = no form; undefined = create new; Goal = edit existing
  const [formGoal, setFormGoal] = useState<Goal | undefined | null>(null);

  // AI Modal state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDurationValue, setAiDurationValue] = useState("30");
  const [aiDurationUnit, setAiDurationUnit] = useState<"days" | "months">("days");
  const [aiDailyHours, setAiDailyHours] = useState("2");
  const [aiExamTemplate, setAiExamTemplate] = useState("auto");
  const [aiCurrentLevel, setAiCurrentLevel] = useState("beginner");
  const [aiWeakAreas, setAiWeakAreas] = useState("");
  const [aiPreferredWindow, setAiPreferredWindow] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    const fetchGoals = async () => {
      try {
        setLoading(true);
        const token = getStoredToken();
        const res = await fetch(`${API_BASE_URL}/goals`, {
          headers: authHeader(token),
        });
        if (!res.ok) throw new Error("Failed to load goals");
        setGoals(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load goals");
      } finally {
        setLoading(false);
      }
    };
    fetchGoals();
  }, []);

  useEffect(() => {
    const syncState = searchParams.get("google_calendar");
    if (!syncState) return;

    const messageMap: Record<string, string> = {
      connected: "Google Calendar connected successfully.",
      failed: "Google Calendar connection failed. Please try again.",
      error: "Google denied the request. Please try again.",
      invalid_state: "Google auth state expired. Please reconnect.",
      invalid_callback: "Missing Google callback parameters.",
      not_configured: "Google Calendar is not configured on server.",
    };

    setNotice(messageMap[syncState] || "Google Calendar update received.");
    router.replace("/goals");
  }, [router, searchParams]);

  const fetchGoogleCalendarStatus = async () => {
    if (!isAuthenticated()) return;
    try {
      setCalendarLoading(true);
      const token = getStoredToken();
      const res = await fetch(
        `${API_BASE_URL}/auth/google-calendar/status?t=${Date.now()}`,
        {
        headers: authHeader(token),
          cache: "no-store",
        }
      );
      if (!res.ok) {
        throw new Error("Failed to fetch calendar status");
      }
      setCalendarStatus((await res.json()) as GoogleCalendarStatus);
    } catch (err) {
      setCalendarStatus(null);
    } finally {
      setCalendarLoading(false);
    }
  };

  useEffect(() => {
    fetchGoogleCalendarStatus();
  }, []);

  const handleGoogleCalendarConnect = async () => {
    try {
      setCalendarLoading(true);
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/auth/google-calendar/connect`, {
        method: "POST",
        headers: authHeader(token),
      });
      const data = await res.json();
      if (!res.ok || !data.authUrl) {
        throw new Error(data.message || "Failed to start Google connect");
      }
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Google Calendar");
      setCalendarLoading(false);
    }
  };

  const handleGoogleCalendarDisconnect = async () => {
    try {
      setCalendarLoading(true);
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/auth/google-calendar/disconnect`, {
        method: "POST",
        headers: authHeader(token),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to disconnect Google Calendar");
      }
      setNotice("Google Calendar disconnected.");
      await fetchGoogleCalendarStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Google Calendar");
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleSaved = (goal: Goal) => {
    setGoals((prev) => {
      const exists = prev.find((g) => g._id === goal._id);
      return exists
        ? prev.map((g) => (g._id === goal._id ? goal : g))
        : [goal, ...prev];
    });
    setFormGoal(null);
  };

  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    const durationValue = Number(aiDurationValue);
    const dailyHours = Number(aiDailyHours);
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      setError("Please enter a valid duration.");
      return;
    }
    if (!Number.isFinite(dailyHours) || dailyHours <= 0) {
      setError("Please enter valid daily hours.");
      return;
    }
    
    setLoading(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/ai/generate-goal`, {
        method: 'POST',
        headers: { "Content-Type": "application/json", ...authHeader(token) },
        body: JSON.stringify({
          prompt: aiPrompt,
          targetDurationValue: durationValue,
          targetDurationUnit: aiDurationUnit,
          dailyAvailableHours: dailyHours,
          examTemplate: aiExamTemplate,
          currentLevel: aiCurrentLevel,
          weakAreas: aiWeakAreas
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          preferredStudyWindow: aiPreferredWindow || undefined,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to generate AI goal");
      
      setGoals(prev => [data.goal, ...prev]);
      setIsAiModalOpen(false);
      setAiPrompt("");
      setAiDurationValue("30");
      setAiDurationUnit("days");
      setAiDailyHours("2");
      setAiExamTemplate("auto");
      setAiCurrentLevel("beginner");
      setAiWeakAreas("");
      setAiPreferredWindow("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI goal");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/goals/${deleteTarget._id}`, {
        method: "DELETE",
        headers: authHeader(token),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || "Failed to delete goal");
      }
      setGoals((prev) => prev.filter((g) => g._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete goal");
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = goals.filter((g) => g.status === "active").length;
  const totalCount = goals.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <Navbar active="goals" />

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-16 pt-8 md:gap-12 md:px-10 lg:px-16">
        {/* Header */}
        <header className="flex flex-col justify-between gap-4 animate-cf-fade-up sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Goals</h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">
              Define what you&apos;re working towards and Chronify will help you stay on track.
            </p>
          </div>
          {formGoal === null && (
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <button
                onClick={() => setIsAiModalOpen(true)}
                className="cf-shimmer inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-violet-500/30 transition hover:brightness-110"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate with AI
              </button>
              <button
                onClick={() => setFormGoal(undefined)}
                className="cf-shimmer inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition hover:brightness-110"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New goal
              </button>
            </div>
          )}
        </header>

        {/* Google Calendar sync */}
        <section className="animate-cf-fade-up cf-anim-delay-100 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-100">Google Calendar Sync</p>
              <p className="mt-1 text-xs text-slate-400">
                {!calendarStatus && calendarLoading
                  ? "Checking calendar integration..."
                  : calendarStatus
                  ? calendarStatus.configured
                    ? calendarStatus.connected
                      ? `Connected as ${calendarStatus.email || "your Google account"}`
                      : "Not connected. Connect to auto-sync task events."
                    : "Server is not configured for Google Calendar yet."
                  : "Unable to load calendar integration status."}
              </p>
              {calendarStatus?.lastSyncError && (
                <p className="mt-1 text-xs text-amber-300">
                  Last sync issue: {calendarStatus.lastSyncError}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {calendarStatus?.connected ? (
                <button
                  onClick={handleGoogleCalendarDisconnect}
                  disabled={calendarLoading}
                  className="inline-flex rounded-full border border-red-800 bg-red-950/30 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-900/30 disabled:opacity-60"
                >
                  {calendarLoading ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={handleGoogleCalendarConnect}
                  disabled={calendarLoading}
                  className="inline-flex rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {calendarLoading ? "Connecting..." : "Connect Google"}
                </button>
              )}
            </div>
          </div>
        </section>

        {notice && (
          <p className="rounded-2xl border border-sky-500/30 bg-sky-950/20 px-4 py-3 text-xs text-sky-100">
            {notice}
          </p>
        )}

        {/* Stats */}
        {totalCount > 0 && (
          <section className="grid gap-4 sm:grid-cols-3 animate-cf-fade-up cf-anim-delay-100">
            <div className="cf-card-hover rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
              <p className="text-xs text-slate-400">Total goals</p>
              <p className="mt-2 text-3xl font-semibold text-slate-100">{totalCount}</p>
            </div>
            <div className="cf-card-hover rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
              <p className="text-xs text-slate-400">Active</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-400">{activeCount}</p>
            </div>
            <div className="cf-card-hover rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
              <p className="text-xs text-slate-400">Completed</p>
              <p className="mt-2 text-3xl font-semibold text-sky-400">
                {goals.filter((g) => g.status === "completed").length}
              </p>
            </div>
          </section>
        )}

        {/* Create / Edit form */}
        {formGoal !== null && (
          <section>
            <GoalForm
              initial={formGoal}
              onSaved={handleSaved}
              onCancel={() => setFormGoal(null)}
            />
          </section>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100">
            {error}
          </p>
        )}

        {/* Goals list */}
        <section className="animate-cf-fade-up cf-anim-delay-200">
          {loading && (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-8 text-center text-xs text-slate-500">
              Loading your goals…
            </div>
          )}

          {!loading && goals.length === 0 && formGoal === null && (
            <EmptyGoals 
              onAdd={() => setFormGoal(undefined)} 
              onAddAi={() => setIsAiModalOpen(true)}
            />
          )}

          {!loading && goals.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {goals.map((goal) => (
                <GoalCard
                  key={goal._id}
                  goal={goal}
                  onEdit={(g) => setFormGoal(g)}
                  onDelete={(g) => setDeleteTarget(g)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* AI Mentor Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-lg animate-cf-fade-up rounded-3xl border border-violet-500/30 bg-slate-900 p-6 shadow-2xl shadow-violet-900/40">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs text-violet-300">✨</span>
                AI Mentor Goal Generator
              </h2>
                <button
                onClick={() => {
                  setIsAiModalOpen(false);
                  setError(null);
                }}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleAiGenerate}>
              <p className="mb-4 text-sm text-slate-300">
                Describe what you want to achieve, and Chronify&apos;s AI Mentor will build a complete goal with scheduled daily tasks.
              </p>
              
              {error && (
                <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100">
                  {error}
                </div>
              )}
              
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., 'Learn React hooks in 3 days' or 'Build a portfolio website this week'"
                rows={3}
                required
                className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500"
              />

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                <label className="block space-y-1.5">
                  <span className="text-xs text-slate-400">
                    In how much time do you want to achieve this goal?
                  </span>
                  <input
                    type="number"
                    value={aiDurationValue}
                    onChange={(e) => setAiDurationValue(e.target.value)}
                    min={1}
                    step={1}
                    required
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs text-slate-400">Unit</span>
                  <select
                    value={aiDurationUnit}
                    onChange={(e) => setAiDurationUnit(e.target.value as "days" | "months")}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs text-slate-400">Template pack</span>
                  <select
                    value={aiExamTemplate}
                    onChange={(e) => setAiExamTemplate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                  >
                    <option value="auto">Auto detect</option>
                    <option value="ima">IMA</option>
                    <option value="nda">NDA</option>
                    <option value="cds">CDS</option>
                    <option value="upsc">UPSC</option>
                    <option value="jee">JEE</option>
                    <option value="neet">NEET</option>
                    <option value="cat">CAT</option>
                    <option value="gate">GATE</option>
                    <option value="interview">Interview prep</option>
                    <option value="general">General plan</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs text-slate-400">Current level</span>
                  <select
                    value={aiCurrentLevel}
                    onChange={(e) => setAiCurrentLevel(e.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
              </div>

              <label className="mt-3 block space-y-1.5">
                <span className="text-xs text-slate-400">
                  How much time per day can you give to this goal?
                </span>
                <input
                  type="number"
                  value={aiDailyHours}
                  onChange={(e) => setAiDailyHours(e.target.value)}
                  min={0.5}
                  max={16}
                  step={0.5}
                  required
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                />
              </label>

              <label className="mt-3 block space-y-1.5">
                <span className="text-xs text-slate-400">
                  Weak areas (optional, comma separated)
                </span>
                <input
                  type="text"
                  value={aiWeakAreas}
                  onChange={(e) => setAiWeakAreas(e.target.value)}
                  placeholder="e.g. algebra, current affairs, reasoning"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500"
                />
              </label>

              <label className="mt-3 block space-y-1.5">
                <span className="text-xs text-slate-400">
                  Preferred study window (optional)
                </span>
                <input
                  type="text"
                  value={aiPreferredWindow}
                  onChange={(e) => setAiPreferredWindow(e.target.value)}
                  placeholder="e.g. 6-8 AM and 9-10 PM"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500"
                />
              </label>
              
              <div className="mt-6 flex gap-3">
                 <button
                    type="button"
                    onClick={() => {
                      setIsAiModalOpen(false);
                      setError(null);
                    }}
                    className="flex-1 rounded-full border border-slate-700 bg-slate-900 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !aiPrompt.trim() ||
                      !aiDurationValue.trim() ||
                      !aiDailyHours.trim()
                    }
                    className="cf-shimmer flex-1 flex items-center justify-center gap-2 rounded-full bg-violet-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition hover:brightness-110 disabled:opacity-60"
                  >
                    {loading ? "Generating..." : "Generate ✨"}
                  </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense>
      <GoalsPageInner />
    </Suspense>
  );
}
