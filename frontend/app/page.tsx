import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <main className="mx-auto flex max-w-6xl flex-col gap-24 px-6 pb-24 pt-16 md:gap-32 md:px-10 lg:px-16 lg:pt-20">
        <header className="flex items-center justify-between animate-cf-fade-in">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold tracking-tight">Chronify</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm shadow-emerald-500/30 transition hover:brightness-110"
            >
              Sign up
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="grid items-center gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-8">
            <div className="inline-flex animate-cf-fade-up items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300 shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Chronify · AI productivity mentor
            </div>
            <div className="space-y-4 animate-cf-fade-up cf-anim-delay-100">
              <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Turn your calendar into a{" "}
                <span className="animate-cf-gradient bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400 bg-clip-text text-transparent">
                  focus engine
                </span>
                .
              </h1>
              <p className="max-w-xl text-pretty text-base text-slate-300 sm:text-lg">
                Chronify understands your habits, meetings, and energy levels to design
                a schedule that protects deep work, tames meetings, and keeps your week
                ruthlessly prioritized.
              </p>
            </div>
            <div className="flex flex-col gap-4 animate-cf-fade-up cf-anim-delay-200 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="cf-shimmer inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Start free trial
              </Link>
              <button className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/60 px-6 py-3 text-sm font-medium text-slate-200 shadow-sm transition hover:border-slate-500 hover:bg-slate-900">
                Watch 2‑minute demo
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span>No credit card required</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>Works with Google Calendar &amp; Outlook</span>
            </div>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute -inset-12 animate-cf-gradient rounded-3xl bg-gradient-to-tr from-emerald-500/15 via-sky-400/10 to-violet-500/15 blur-3xl" />
            <div className="relative animate-cf-fade-up cf-anim-delay-300 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-emerald-500/20 backdrop-blur">
              <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-200">Today · Focus plan</span>
                <span>4h 20m deep work</span>
              </div>
              <div className="space-y-3">
                <div className="cf-card-hover rounded-2xl bg-slate-800/80 p-4">
                  <p className="text-xs font-medium text-emerald-300">
                    🧠 Deep Work · 09:00–11:00
                  </p>
                  <p className="mt-1 text-sm text-slate-100">
                    Ship Chronify onboarding flow
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Slack &amp; email auto-muted. Calendar blocked.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="cf-card-hover rounded-2xl border border-slate-800/80 bg-slate-900/80 p-3">
                    <p className="text-xs text-slate-400">Context switching</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-400">
                      ↓ 37%
                    </p>
                  </div>
                  <div className="cf-card-hover rounded-2xl border border-slate-800/80 bg-slate-900/80 p-3">
                    <p className="text-xs text-slate-400">Weekly focus score</p>
                    <p className="mt-1 text-lg font-semibold text-sky-400">8.6 / 10</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Designed for high‑performing teams
            </h2>
            <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
              Chronify plugs into your calendar and communication tools to give every
              teammate a personal chief of staff that guards their time.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="cf-card-hover rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                ⚡
              </div>
              <h3 className="text-sm font-semibold text-slate-50">
                AI‑driven schedule optimization
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Automatically reshuffle meetings and deep work blocks based on priority,
                energy levels, and collaboration windows.
              </p>
            </div>
            <div className="cf-card-hover rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
                🔒
              </div>
              <h3 className="text-sm font-semibold text-slate-50">
                Focus protection guardrails
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Auto-decline low‑value invites, suggest async updates, and defend
                protected focus slots across time zones.
              </p>
            </div>
            <div className="cf-card-hover rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                📈
              </div>
              <h3 className="text-sm font-semibold text-slate-50">
                Real‑time productivity insights
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Track deep work hours, meeting load, and focus score trends without
                invasive monitoring or manual time tracking.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              How Chronify fits into your week
            </h2>
            <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
              Get value in under 5 minutes. No process overhaul, no new tools to teach
              your team.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="relative rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                Step 1
              </p>
              <h3 className="text-sm font-semibold text-slate-50">
                Connect your calendars
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Securely connect Google or Outlook and choose how much of your schedule
                Chronify can see.
              </p>
            </div>
            <div className="relative rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                Step 2
              </p>
              <h3 className="text-sm font-semibold text-slate-50">
                Teach it your priorities
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Tell Chronify what matters this week and your preferred focus windows;
                it builds the optimal plan.
              </p>
            </div>
            <div className="relative rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                Step 3
              </p>
              <h3 className="text-sm font-semibold text-slate-50">
                Let it defend your time
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Chronify continuously adjusts your calendar, nudging meetings, blocking
                deep work, and keeping you in flow.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Simple pricing, built to scale
            </h2>
            <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
              Start solo, then roll Chronify out to your team when you are ready.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="relative rounded-3xl border border-emerald-500/60 bg-gradient-to-br from-emerald-500/15 via-slate-950 to-slate-950 p-[1px]">
              <div className="h-full rounded-[22px] bg-slate-950/90 p-6">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  Most popular
                </div>
                <h3 className="text-sm font-semibold text-slate-50">Pro</h3>
                <p className="mt-2 text-sm text-slate-300">
                  For founders, leads, and ICs who want a ruthless calendar.
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-slate-50">
                    $19
                  </span>
                  <span className="text-xs text-slate-400">/seat /month</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm text-slate-300">
                  <li>✓ Unlimited calendars</li>
                  <li>✓ AI schedule optimization</li>
                  <li>✓ Focus score analytics</li>
                  <li>✓ Priority support</li>
                </ul>
                <button className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110">
                  Start 14‑day trial
                </button>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
              <h3 className="text-sm font-semibold text-slate-50">Teams</h3>
              <p className="mt-2 text-sm text-slate-300">
                Roll Chronify out to your entire org with SSO, advanced controls, and
                admin analytics.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                <li>✓ SSO &amp; SCIM provisioning</li>
                <li>✓ Admin insights &amp; reporting</li>
                <li>✓ Dedicated onboarding</li>
                <li>✓ Security review &amp; DPA</li>
              </ul>
              <button className="mt-6 inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800">
                Talk to sales
              </button>
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-8 text-center sm:p-10">
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Make every hour on your calendar count.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
            Join early teams using Chronify to protect deep work, reduce meeting load,
            and ship what actually matters every week.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/signup"
              className="inline-flex w-full items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:brightness-110 sm:w-auto"
            >
              Get started in 2 minutes
            </Link>
            <button className="inline-flex w-full items-center justify-center rounded-full border border-slate-700 bg-slate-950 px-6 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-900 sm:w-auto">
              Book a 15‑minute walkthrough
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
