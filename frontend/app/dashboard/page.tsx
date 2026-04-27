"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import {
  API_BASE_URL,
  authHeader,
  getStoredToken,
  isAuthenticated,
} from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = "scheduled" | "completed" | "missed" | "skipped";

type TaskChecklistStep = {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string | null;
};

type TaskInstructions = {
  summary?: string;
  steps?: TaskChecklistStep[];
  tips?: string[];
  expectedOutcome?: string;
  generatedAt?: string;
};

type Task = {
  _id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  status: TaskStatus;
  source: "ai" | "manual";
  goalId?: string | null;
  reminderOffsetMinutes?: number | null;
  instructionProgress?: number;
  aiInstructions?: TaskInstructions;
};

type Goal = {
  _id: string;
  title: string;
  status: string;
};

type OverviewResponse = {
  today: {
    date: string;
    completionRate: number;
    tasksCompleted: number;
    tasksScheduled: number;
  };
  weeklyStreak: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTimeRange = (start: string, end: string) => {
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${fmt(new Date(start))} – ${fmt(new Date(end))}`;
};

const todayLocalISO = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const toDateTimeLocal = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toDateString = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toTimeString = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const getTaskRange = (windowDays: number) => {
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const toDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + Math.max(1, windowDays)
  );
  return {
    fromDate,
    toDate,
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString(),
  };
};

const isWithinTaskRange = (iso: string, windowDays: number) => {
  const { fromDate, toDate } = getTaskRange(windowDays);
  const time = new Date(iso).getTime();
  return time >= fromDate.getTime() && time < toDate.getTime();
};

const formatTaskDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

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

// ─── Task Modal (shared for Add & Edit) ────────────────────────────────────────

type TaskModalProps = {
  initial?: Task;
  goals: Goal[];
  onClose: () => void;
  onSaved: (task: Task) => void;
};

function TaskModal({ initial, goals, onClose, onSaved }: TaskModalProps) {
  const isEditing = !!initial;
  const today = todayLocalISO();
  const activeGoals = goals.filter((g) => g.status === "active");

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startDate, setStartDate] = useState(
    initial ? toDateString(initial.startTime) : today
  );
  const [startTime, setStartTime] = useState(
    initial ? toTimeString(initial.startTime) : "09:00"
  );
  const [endDate, setEndDate] = useState(
    initial ? toDateString(initial.endTime) : today
  );
  const [endTime, setEndTime] = useState(
    initial ? toTimeString(initial.endTime) : "10:00"
  );
  const [goalId, setGoalId] = useState(
    initial?.goalId ?? (activeGoals[0]?._id || "")
  );
  const [reminderOffset, setReminderOffset] = useState(
    initial?.reminderOffsetMinutes != null
      ? String(initial.reminderOffsetMinutes)
      : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // We only close if the user explicitly clicked the background overlay.
    // For this specific modal (task creation), we disable background-click closure 
    // to prevent accidental data loss when interacting with browser-native pickers.
    if (e.target === overlayRef.current) {
      // If we really want to keep it, we could add a confirmation, 
      // but for now, the user requested that "clicking outside should ONLY close the picker".
      // So we'll skip closing the modal here.
      // onClose();
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const sDateTime = new Date(`${startDate}T${startTime}`);
    const eDateTime = new Date(`${endDate}T${endTime}`);

    if (eDateTime <= sDateTime) {
      setError("End time must be after start time.");
      setLoading(false);
      return;
    }
    if (!goalId) {
      setError("Please select a goal for this task.");
      setLoading(false);
      return;
    }

    try {
      const token = getStoredToken();
      const body: Record<string, unknown> = {
        title,
        description: description || undefined,
        startTime: new Date(`${startDate}T${startTime}`).toISOString(),
        endTime: new Date(`${endDate}T${endTime}`).toISOString(),
        goalId,
      };
      if (reminderOffset !== "") body.reminderOffsetMinutes = Number(reminderOffset);
      if (!isEditing) body.source = "manual";

      const url = isEditing
        ? `${API_BASE_URL}/tasks/${initial!._id}`
        : `${API_BASE_URL}/tasks`;
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeader(token) },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to save task");

      onSaved(json as Task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md animate-cf-fade-up rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/60">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            {isEditing ? "Edit task" : "Add task"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-2.5 text-xs text-red-100">
            {error}
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs text-slate-400">Title <span className="text-red-400">*</span></span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={300}
              placeholder="e.g. Write project proposal"
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
              placeholder="Optional details…"
              className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">Start date <span className="text-red-400">*</span></span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400 [color-scheme:dark]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">Start time <span className="text-red-400">*</span></span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400 [color-scheme:dark]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">End date <span className="text-red-400">*</span></span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400 [color-scheme:dark]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">End time <span className="text-red-400">*</span></span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400 [color-scheme:dark]"
              />
            </label>
          </div>

          {activeGoals.length > 0 ? (
            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">Goal <span className="text-red-400">*</span></span>
              <select
                value={goalId as string}
                onChange={(e) => setGoalId(e.target.value)}
                required
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
              >
                {activeGoals.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="rounded-2xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
              Create an active goal first. Every task must be linked to exactly one goal.
            </p>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs text-slate-400">Remind me before (minutes)</span>
            <input
              type="number"
              value={reminderOffset}
              onChange={(e) => setReminderOffset(e.target.value)}
              min={0}
              max={1440}
              placeholder="e.g. 15"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400"
            />
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-slate-700 bg-slate-900 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || activeGoals.length === 0}
              className="cf-shimmer flex-1 rounded-full bg-emerald-400 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Saving…" : isEditing ? "Save changes" : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard Page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [roadmapDays, setRoadmapDays] = useState<1 | 7 | 30>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [updatingStepKey, setUpdatingStepKey] = useState<string | null>(null);
  const [replanNotice, setReplanNotice] = useState<string | null>(null);

  // AI Modal state
  const [aiSuggestionTask, setAiSuggestionTask] = useState<Task | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // Modal state: null = closed, undefined = new task, Task = edit task
  const [modalTask, setModalTask] = useState<Task | undefined | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const runWeeklyReplanIfNeeded = async (token: string | null) => {
    const key = `chronify_weekly_replan_${todayLocalISO()}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) {
      return { updatedGoals: 0 };
    }

    const res = await fetch(`${API_BASE_URL}/ai/replan-weekly`, {
      method: "POST",
      headers: authHeader(token),
    });

    if (!res.ok) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(key, "1");
      }
      return { updatedGoals: 0 };
    }

    const data = (await res.json()) as { updatedGoals?: number };
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key, "1");
    }
    return { updatedGoals: Number(data.updatedGoals || 0) };
  };

  useEffect(() => {
    if (!isAuthenticated()) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = getStoredToken();
        const replanResult = await runWeeklyReplanIfNeeded(token);
        if (replanResult.updatedGoals > 0) {
          setReplanNotice(
            `Adaptive weekly plan updated for ${replanResult.updatedGoals} active goal(s).`
          );
        } else {
          setReplanNotice(null);
        }

        const { fromIso, toIso } = getTaskRange(roadmapDays);
        const [tasksRes, overviewRes, goalsRes] = await Promise.all([
          fetch(
            `${API_BASE_URL}/tasks?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
            {
              headers: authHeader(token),
            }
          ),
          fetch(`${API_BASE_URL}/analytics/overview`, { headers: authHeader(token) }),
          fetch(`${API_BASE_URL}/goals`, { headers: authHeader(token) }),
        ]);

        if (!tasksRes.ok) throw new Error("Failed to load tasks");
        if (!overviewRes.ok) throw new Error("Failed to load analytics");

        setTasks((await tasksRes.json()) as Task[]);
        setOverview((await overviewRes.json()) as OverviewResponse);
        if (goalsRes.ok) setGoals((await goalsRes.json()) as Goal[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [roadmapDays]);

  const refreshOverview = async (token: string | null) => {
    const res = await fetch(`${API_BASE_URL}/analytics/overview`, {
      headers: authHeader(token),
    });
    if (res.ok) setOverview((await res.json()) as OverviewResponse);
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      setUpdatingTaskId(taskId);
      setError(null);
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader(token) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      const updated = (await res.json()) as Task;
      setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
      await refreshOverview(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const toggleChecklistStep = async ({
    taskId,
    stepId,
    completed,
  }: {
    taskId: string;
    stepId: string;
    completed: boolean;
  }) => {
    const updateKey = `${taskId}:${stepId}`;

    try {
      setUpdatingStepKey(updateKey);
      setError(null);
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/checklist/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader(token) },
        body: JSON.stringify({ completed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to update checklist step");
      const updated = json as Task;
      setTasks((prev) => prev.map((task) => (task._id === updated._id ? updated : task)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update checklist step");
    } finally {
      setUpdatingStepKey(null);
    }
  };

  const handleTaskSaved = (task: Task) => {
    setTasks((prev) => {
      const exists = prev.find((t) => t._id === task._id);
      if (exists) {
        // Edit: replace in place
        return prev
          .map((t) => (t._id === task._id ? task : t))
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      }
      // New: add only if it belongs to active roadmap window
      if (isWithinTaskRange(task.startTime, roadmapDays)) {
        return [...prev, task].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
      }
      return prev;
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/tasks/${deleteTarget._id}`, {
        method: "DELETE",
        headers: authHeader(token),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || "Failed to delete task");
      }
      setTasks((prev) => prev.filter((t) => t._id !== deleteTarget._id));
      setDeleteTarget(null);
      await refreshOverview(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  };

  const completionRate = overview?.today.completionRate ?? 0;
  const tasksCompleted = overview?.today.tasksCompleted ?? 0;
  const tasksScheduled = overview?.today.tasksScheduled ?? 0;
  const weeklyStreak = overview?.weeklyStreak ?? 0;

  const statusColors: Record<TaskStatus, string> = {
    scheduled: "text-slate-400",
    completed: "text-emerald-400",
    missed: "text-red-400",
    skipped: "text-slate-500",
  };
  const roadmapTitle =
    roadmapDays === 1 ? "Today's schedule" : `Roadmap for next ${roadmapDays} days`;
  const emptyRoadmapText =
    roadmapDays === 1
      ? "No tasks scheduled for today yet."
      : `No tasks planned in the next ${roadmapDays} days yet.`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <Navbar active="dashboard" />

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-16 pt-8 md:gap-12 md:px-10 lg:px-16">
        {/* Header */}
        <header className="flex flex-col justify-between gap-4 animate-cf-fade-up sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Today&apos;s focus
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">
              Stay consistent with your schedule — Chronify will refine it based on what you complete.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/80 px-3 py-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Deep work ready
            </div>
          </div>
        </header>

        {/* Bento Stats */}
        <section className="grid gap-4 md:grid-cols-4 md:grid-rows-2">
          {/* Main Focus Bento */}
          <div className="cf-card-hover md:col-span-2 md:row-span-2 relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 p-8 flex flex-col justify-between animate-cf-fade-up shadow-xl">
            <div className="relative z-10">
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 text-2xl shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                🎯
              </div>
              <h2 className="text-3xl font-extrabold tracking-tighter text-slate-50">Completion rate</h2>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-6xl font-black tracking-tighter text-emerald-400 drop-shadow-[0_0_25px_rgba(16,185,129,0.2)]">
                  {completionRate}%
                </p>
              </div>
              <p className="mt-4 max-w-sm text-sm text-slate-400 font-medium leading-relaxed">
                You have completed <span className="text-emerald-400">{tasksCompleted}</span> out of <span className="text-slate-300">{tasksScheduled}</span> tasks scheduled today. Keep pushing stringently.
              </p>
            </div>
            {/* Background glowing orb */}
            <div className="absolute right-[-15%] top-[-15%] opacity-20 blur-3xl w-64 h-64 bg-emerald-500 rounded-full pointer-events-none" />
          </div>

          <div className="cf-card-hover md:col-span-2 rounded-3xl border border-white/5 bg-slate-900/40 p-6 flex items-center justify-between animate-cf-fade-up cf-anim-delay-100">
            <div>
              <p className="text-sm font-medium tracking-wide text-slate-400 uppercase">Weekly Streak</p>
              <p className="mt-1 text-4xl font-extrabold text-sky-400">{weeklyStreak} <span className="text-xl text-slate-500">days</span></p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 text-xl">
              🔥
            </div>
          </div>

          <div className="cf-card-hover md:col-span-2 rounded-3xl border border-white/5 bg-slate-900/40 p-6 flex flex-col justify-between animate-cf-fade-up cf-anim-delay-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium tracking-wide text-slate-400 uppercase">Active Goals</p>
              <p className="text-3xl font-extrabold text-violet-400">{goals.filter((g) => g.status === "active").length}</p>
            </div>
            <div className="mt-4">
              {goals.length === 0 ? (
                <a href="/goals" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-400 hover:text-violet-300 transition group">
                  Deploy First Goal <span className="transform transition group-hover:translate-x-1">→</span>
                </a>
              ) : (
                <a href="/goals" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition group">
                  Manage Goals <span className="transform transition group-hover:translate-x-1">→</span>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Tasks */}
        <section className="space-y-4 animate-cf-fade-up cf-anim-delay-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">{roadmapTitle}</h2>
            <div className="flex items-center gap-3">
              {loading && <p className="text-xs text-slate-500">Loading…</p>}
              <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950 p-1 text-[11px] text-slate-300">
                {[1, 7, 30].map((days) => (
                  <button
                    key={days}
                    onClick={() => setRoadmapDays(days as 1 | 7 | 30)}
                    className={`rounded-full px-2.5 py-1 transition ${
                      roadmapDays === days
                        ? "bg-violet-500 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {days === 1 ? "Today" : `${days}d`}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setModalTask(undefined)}
                className="cf-shimmer inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm shadow-emerald-500/30 transition hover:brightness-110"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add task
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100">
              {error}
            </p>
          )}

          {!error && replanNotice && (
            <p className="rounded-2xl border border-violet-500/30 bg-violet-950/30 px-4 py-3 text-xs text-violet-200">
              {replanNotice}
            </p>
          )}

          {tasks.length === 0 && !loading && !error ? (
            <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/60 p-8 text-center">
              <p className="text-sm text-slate-400">{emptyRoadmapText}</p>
              <button
                onClick={() => setModalTask(undefined)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add your first task
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task._id}
                  className={`flex flex-col gap-3 rounded-3xl border bg-slate-900/40 p-5 text-sm transition backdrop-blur-sm ${
                    task.status === "completed"
                      ? "border-emerald-500/30 opacity-70"
                      : task.status === "missed"
                      ? "border-amber-500/30"
                      : "border-white/5 shadow-lg shadow-black/20"
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium ${
                          task.source === "ai"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-slate-700/40 text-slate-300"
                        }`}
                      >
                        {task.source === "ai" ? "AI" : "Manual"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {roadmapDays === 1
                          ? formatTimeRange(task.startTime, task.endTime)
                          : `${formatTaskDate(task.startTime)} • ${formatTimeRange(task.startTime, task.endTime)}`}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${statusColors[task.status]}`}>
                        {task.status}
                      </span>
                    </div>
                    <p className={`text-lg font-bold tracking-tight ${task.status === "completed" ? "text-slate-500 line-through" : "text-slate-50"}`}>
                      {task.title}
                    </p>
                    {task.aiInstructions?.summary && (
                      <p className="text-xs text-slate-300">{task.aiInstructions.summary}</p>
                    )}
                    {task.description && (
                      <p className="truncate text-xs text-slate-500">{task.description}</p>
                    )}
                    {task.aiInstructions?.steps?.length ? (
                      <div className="mt-3 rounded-2xl border border-white/5 bg-slate-950/60 p-4 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/20" />
                        <div className="mb-3 flex items-center justify-between text-[11px] font-semibold tracking-wide uppercase text-slate-400">
                          <span>Checklist progress</span>
                          <span>
                            {typeof task.instructionProgress === "number"
                              ? task.instructionProgress
                              : Math.round(
                                  (task.aiInstructions.steps.filter((step) => step.completed).length /
                                    task.aiInstructions.steps.length) *
                                    100
                                )}
                            %
                          </span>
                        </div>
                        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-violet-500 transition-all"
                            style={{
                              width: `${
                                typeof task.instructionProgress === "number"
                                  ? task.instructionProgress
                                  : Math.round(
                                      (task.aiInstructions.steps.filter((step) => step.completed).length /
                                        task.aiInstructions.steps.length) *
                                        100
                                    )
                              }%`,
                            }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          {task.aiInstructions.steps.map((step) => {
                            const stepKey = `${task._id}:${step.id}`;
                            const isUpdatingStep = updatingStepKey === stepKey;
                            return (
                              <label
                                key={step.id}
                                className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-900"
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(step.completed)}
                                  disabled={isUpdatingStep}
                                  onChange={(event) =>
                                    toggleChecklistStep({
                                      taskId: task._id,
                                      stepId: step.id,
                                      completed: event.target.checked,
                                    })
                                  }
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-violet-500"
                                />
                                <span
                                  className={`text-xs ${
                                    step.completed ? "text-slate-400 line-through" : "text-slate-200"
                                  }`}
                                >
                                  {step.text}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {task.aiInstructions.tips?.length ? (
                          <p className="mt-3 text-[11px] text-slate-400">
                            Tip: {task.aiInstructions.tips[0]}
                          </p>
                        ) : null}
                        {task.aiInstructions.expectedOutcome ? (
                          <p className="mt-1 text-[11px] text-emerald-300/90">
                            Outcome: {task.aiInstructions.expectedOutcome}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
                    {task.status === "scheduled" && (
                      <>
                        <button
                          onClick={() => updateTaskStatus(task._id, "completed")}
                          disabled={updatingTaskId === task._id}
                          className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm shadow-emerald-500/30 transition hover:brightness-110 disabled:opacity-60"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => updateTaskStatus(task._id, "missed")}
                          disabled={updatingTaskId === task._id}
                          className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-900 disabled:opacity-60"
                        >
                          Missed
                        </button>
                        <button
                          onClick={() => updateTaskStatus(task._id, "skipped")}
                          disabled={updatingTaskId === task._id}
                          className="inline-flex items-center justify-center rounded-full border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-900 disabled:opacity-60"
                        >
                          Skip
                        </button>
                      </>
                    )}

                    {/* Edit button — always visible */}
                    <button
                      onClick={() => setModalTask(task)}
                      className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
                      title="Edit task"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    {/* Ask AI Mentor button */}
                    <button
                      onClick={async () => {
                        setAiSuggestionTask(task);
                        setAiLoading(true);
                        setAiError(null);
                        setAiSuggestion(null);
                        try {
                          const token = getStoredToken();
                          const res = await fetch(`${API_BASE_URL}/ai/tasks/${task._id}/suggest`, {
                            method: "POST",
                            headers: authHeader(token),
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json.message || "Failed to get AI advice");
                          setAiSuggestion(json.suggestion);
                        } catch (err) {
                           setAiError(err instanceof Error ? err.message : "Failed to load advice");
                        } finally {
                           setAiLoading(false);
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-full border border-violet-700/60 bg-violet-950/30 px-3 py-1.5 text-xs font-medium text-violet-400 transition hover:bg-violet-950/60"
                      title="Ask AI Mentor"
                    >
                      <span className="mr-1.5 text-[10px]">✨</span>
                      Ask Mentor
                    </button>

                    {/* Delete button — always visible */}
                    <button
                      onClick={() => setDeleteTarget(task)}
                      className="inline-flex items-center justify-center rounded-full border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-950/60"
                      title="Delete task"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Help & Feedback Section */}
          <section className="mt-12 animate-cf-fade-up sm:mt-16">
            <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 p-8 text-center transition-all hover:bg-slate-900/60">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-xl">
                ✉️
              </div>
              <h3 className="text-sm font-semibold text-slate-100">Help & Feedback</h3>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
                Have questions or ideas to improve Chronify? We'd love to hear from you. 
                Our team is available to help with any issues or feedback.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a 
                  href="mailto:chronify140@gmail.com" 
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-xs font-semibold text-slate-200 shadow-sm transition hover:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  chronify140@gmail.com
                </a>
              </div>
            </div>
          </section>
        </section>
      </main>

      {/* Add / Edit Task Modal */}
      {modalTask !== null && (
        <TaskModal
          initial={modalTask}
          goals={goals}
          onClose={() => setModalTask(null)}
          onSaved={handleTaskSaved}
        />
      )}

      {/* Ask AI Mentor Modal */}
      {aiSuggestionTask !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-lg animate-cf-fade-up rounded-3xl border border-violet-500/30 bg-slate-900 p-6 shadow-2xl shadow-violet-900/40">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs">✨</span>
                AI Mentor Advice
              </h2>
              <button
                onClick={() => setAiSuggestionTask(null)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {aiLoading ? (
              <div className="flex animate-pulse space-x-4">
                <div className="flex-1 space-y-4 py-1">
                  <div className="h-2 rounded bg-slate-700"></div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2 h-2 rounded bg-slate-700"></div>
                      <div className="col-span-1 h-2 rounded bg-slate-700"></div>
                    </div>
                    <div className="h-2 rounded bg-slate-700"></div>
                  </div>
                </div>
              </div>
            ) : aiError ? (
              <p className="text-sm text-red-400">{aiError}</p>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none text-slate-300">
                {/* Very simplistic markdown render for demo purposes */}
                {aiSuggestion?.split('\n').map((line, i) => (
                  <p key={i} className="mb-2">{line.replace(/\*\*/g, '')}</p>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end">
               <button
                  onClick={() => setAiSuggestionTask(null)}
                  className="rounded-full bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
                >
                  Close
                </button>
            </div>
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
