import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MODES, type Mode } from "@/lib/intent";
import { toast } from "sonner";
import {
  User, Clock, Palette, Shield, LogOut, Trash2, Mail, Key, ExternalLink,
  LifeBuoy, Sparkles, CheckCircle2, Bug, Compass, ChevronDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredYouTubeApiKey, setStoredYouTubeApiKey } from "@/lib/youtubeApiKey";
import { ReportsSection } from "@/components/IssueReports";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ZenTube" },
      { name: "description", content: "Manage your ZenTube profile, intent defaults, focus limits, appearance, privacy and support options." },
      { property: "og:title", content: "Settings — ZenTube" },
      { property: "og:description", content: "Tune intent defaults, daily focus limits, appearance and privacy in ZenTube." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Prefs = {
  daily_watch_limit_min: number;
  default_mode: string | null;
  theme: string;
  data_tracking: boolean;
};

type SectionKey = "profile" | "intent" | "focus" | "appearance" | "privacy" | "support";

const SECTIONS: {
  key: SectionKey;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "profile", label: "Profile", hint: "Who you are", icon: User },
  { key: "intent", label: "Intent & discovery", hint: "How results are chosen", icon: Compass },
  { key: "focus", label: "Focus & wellbeing", hint: "Limits and reminders", icon: Clock },
  { key: "appearance", label: "Appearance & accessibility", hint: "Theme and comfort", icon: Palette },
  { key: "privacy", label: "Privacy & data", hint: "Tracking and history", icon: Shield },
  { key: "support", label: "Support", hint: "Help, API key, reports", icon: LifeBuoy },
];

const SAVEABLE: SectionKey[] = ["profile", "intent", "focus", "appearance", "privacy"];

function SettingsPage() {
  const { user, signOut } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [section, setSection] = useState<SectionKey>("profile");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("preferences")
      .select("daily_watch_limit_min, default_mode, theme, data_tracking")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setPrefs(
          (data as Prefs) ?? {
            daily_watch_limit_min: 60,
            default_mode: null,
            theme: "dark",
            data_tracking: true,
          },
        );
        // NOTE: never applyTheme here — visiting Settings must not change the
        // active theme. Theme is applied only on save.
      });

    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name || ""));

    try {
      setSessionReminders(localStorage.getItem("zen.sessionReminders") !== "off");
      setApiKey(getStoredYouTubeApiKey());
    } catch {}
  }, [user]);

  const applyTheme = (t: string) => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    if (t === "system") {
      const m = window.matchMedia("(prefers-color-scheme: light)").matches;
      html.classList.toggle("light", m);
      html.classList.toggle("dark", !m);
      return;
    }
    if (t === "light") {
      html.classList.add("light");
      html.classList.remove("dark");
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
    }
  };

  const save = async () => {
    if (!user || !prefs) return;
    setSaving(true);
    const [{ error: pErr }, { error: pfErr }] = await Promise.all([
      supabase.from("preferences").upsert(
        { user_id: user.id, ...prefs },
        { onConflict: "user_id" },
      ),
      supabase
        .from("profiles")
        .update({ display_name: displayName || null })
        .eq("user_id", user.id),
    ]);
    try {
      localStorage.setItem("zen.sessionReminders", sessionReminders ? "on" : "off");
      setStoredYouTubeApiKey(apiKey);
    } catch {}
    setSaving(false);
    if (pErr || pfErr) {
      toast.error("Could not save settings");
    } else {
      toast.success("Saved");
      applyTheme(prefs.theme);
    }
  };

  const clearHistory = async () => {
    if (!user) return;
    if (!confirm("Clear your entire watch history? This cannot be undone.")) return;
    const { error } = await supabase.from("watch_history").delete().eq("user_id", user.id);
    if (error) toast.error("Could not clear history");
    else toast.success("History cleared");
  };

  if (!prefs) {
    return (
      <div className="zen-container py-10">
        <Skeleton className="h-8 w-40" />
        <div className="mt-8 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const active = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className="zen-container py-6 sm:py-8">
      {/* Hero header */}
      <header className="ins-hero zen-fade-in relative overflow-hidden p-5 sm:p-7">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              ZenTube control room
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Everything that shapes an intentional watch session — your profile, how intent
              drives discovery, focus limits, comfort, and what data ZenTube keeps.
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {(displayName || user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {displayName || "Your profile"}
              </div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="mt-6 gap-6 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        {/* Section navigation: sidebar on desktop, scroller on mobile */}
        <nav
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
          className="ins-panel zen-fade-in flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-16 lg:flex-col lg:overflow-visible"
        >
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = section === s.key;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSection(s.key)}
                className={
                  "zen-tab zen-press inline-flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-medium lg:w-full " +
                  (isActive
                    ? "bg-primary/12 text-foreground shadow-sm ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground")
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{s.label}</span>
                  <span className="hidden text-[11px] font-normal text-muted-foreground lg:block">
                    {s.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div key={section} className="zen-stagger mt-5 space-y-6 lg:mt-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:hidden">
            {active.label}
          </div>

          {section === "profile" && (
            <SectionGroup icon={User} title="Profile" description="How you appear inside ZenTube.">
              <Field label="Display name">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Email">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{user?.email}</span>
                </div>
              </Field>
              <div className="pt-2">
                <button
                  onClick={() => signOut()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </SectionGroup>
          )}

          {section === "intent" && (
            <SectionGroup
              icon={Compass}
              title="Intent & discovery"
              description="Intent decides what ZenTube surfaces before a single result loads."
            >
              <Field label="Default intent">
                <div className="flex flex-wrap gap-2">
                  <Chip
                    active={prefs.default_mode === null}
                    onClick={() => setPrefs({ ...prefs, default_mode: null })}
                  >
                    Always ask
                  </Chip>
                  {(Object.keys(MODES) as Mode[]).map((m) => (
                    <Chip
                      key={m}
                      active={prefs.default_mode === m}
                      onClick={() => setPrefs({ ...prefs, default_mode: m })}
                    >
                      {MODES[m].emoji} {MODES[m].label}
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  "Always ask" keeps the intent prompt on every search — the calmest option.
                  Picking a default skips the prompt and applies that lens instantly.
                </p>
              </Field>
            </SectionGroup>
          )}

          {section === "focus" && (
            <SectionGroup
              icon={Clock}
              title="Focus & wellbeing"
              description="Gentle nudges, never hard blocks."
            >
              <Field label={`Daily watch limit · ${prefs.daily_watch_limit_min} min`}>
                <input
                  type="range"
                  min={10}
                  max={240}
                  step={5}
                  value={prefs.daily_watch_limit_min}
                  aria-label="Daily watch limit in minutes"
                  onChange={(e) =>
                    setPrefs({ ...prefs, daily_watch_limit_min: parseInt(e.target.value, 10) })
                  }
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>10 min</span>
                  <span>4 hours</span>
                </div>
              </Field>
              <Toggle
                label="Session check-ins"
                description="After 2 videos, ZenTube quietly asks whether you're still watching with intent."
                checked={sessionReminders}
                onChange={setSessionReminders}
              />
            </SectionGroup>
          )}

          {section === "appearance" && (
            <SectionGroup
              icon={Palette}
              title="Appearance & accessibility"
              description="Comfort settings for long, calm sessions."
            >
              <Field label="Theme">
                <div className="flex flex-wrap gap-2">
                  {(["dark", "light", "system"] as const).map((t) => (
                    <Chip
                      key={t}
                      active={prefs.theme === t}
                      onClick={() => setPrefs({ ...prefs, theme: t })}
                    >
                      {t[0].toUpperCase() + t.slice(1)}
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Theme only changes when you press <span className="text-foreground">Save</span>.
                </p>
              </Field>
              <div className="rounded-lg border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
                ZenTube respects your system "reduce motion" setting automatically — animations
                are minimised when it's on.
              </div>
            </SectionGroup>
          )}

          {section === "privacy" && (
            <SectionGroup
              icon={Shield}
              title="Privacy & data"
              description="You decide what ZenTube remembers."
            >
              <Toggle
                label="Track my watch history"
                description="Powers Insights. Turn off to stop saving any watch history."
                checked={prefs.data_tracking}
                onChange={(v) => setPrefs({ ...prefs, data_tracking: v })}
              />
              <div className="pt-2">
                <button
                  onClick={clearHistory}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/15"
                >
                  <Trash2 className="h-4 w-4" /> Clear watch history
                </button>
              </div>
            </SectionGroup>
          )}

          {section === "support" && (
            <div className="space-y-6">
              <SectionGroup icon={Sparkles} title="About ZenTube" description="A calmer way to watch.">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  ZenTube wraps YouTube in an intent-first experience. Pick a reason to watch —{" "}
                  <span className="text-foreground">Learn</span>,{" "}
                  <span className="text-foreground">Find</span>,{" "}
                  <span className="text-foreground">Relax</span>, or{" "}
                  <span className="text-foreground">Explore</span> — and the app tunes results,
                  hides the infinite scroll, removes "More videos" suggestions, and tracks only
                  the time you <span className="text-foreground">actually watched</span>.
                </p>
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  <Feature title="Intent-driven search" body="Refine by length, level and angle before any results are shown." />
                  <Feature title="Distraction-free player" body="No autoplay, no end-screen recommendations, no redirects." />
                  <Feature title="Library & notes" body="Save videos, take timestamped notes, build your own playlists." />
                  <Feature title="Honest insights" body="Skipped sections never count toward your watch time." />
                </ul>
              </SectionGroup>

              {/* Advanced — discoverable but secondary */}
              <Advanced icon={Key} title="YouTube API key" summary="Optional · use your own free quota">
                <Field label="API key (stored only in your browser)">
                  <div className="flex gap-2">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="AIza…"
                      spellCheck={false}
                      autoComplete="off"
                      className="min-w-0 flex-1 rounded-md border border-border bg-input px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((s) => !s)}
                      className="shrink-0 rounded-md border border-border bg-surface px-3 text-xs hover:bg-accent"
                    >
                      {showKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </Field>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <Step n={1}>
                    Open <ExtLink href="https://console.cloud.google.com/">console.cloud.google.com</ExtLink> and sign in.
                  </Step>
                  <Step n={2}>
                    Project dropdown → <span className="text-foreground">New Project</span> (name it anything).
                  </Step>
                  <Step n={3}>
                    Enable{" "}
                    <ExtLink href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">
                      YouTube Data API v3
                    </ExtLink>.
                  </Step>
                  <Step n={4}>
                    <ExtLink href="https://console.cloud.google.com/apis/credentials">Credentials</ExtLink> →{" "}
                    <span className="text-foreground">+ Create Credentials</span> →{" "}
                    <span className="text-foreground">API key</span>.
                  </Step>
                  <Step n={5}>
                    Paste the key above (starts with{" "}
                    <code className="rounded bg-surface px-1 py-0.5 text-xs">AIza…</code>) and press Save.
                  </Step>
                </ol>
                <p className="rounded-lg border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
                  Your key stays in your browser's local storage and is sent directly to YouTube.
                  ZenTube never stores it on our servers.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save key"}
                  </button>
                </div>
              </Advanced>

              <Advanced icon={Bug} title="Issue reports" summary="Crashes and problems you've reported">
                <ReportsSection />
              </Advanced>
            </div>
          )}

          {SAVEABLE.includes(section) && (
            <div className="sticky bottom-4 z-10 flex justify-end pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="zen-press min-h-11 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Advanced({
  icon: Icon,
  title,
  summary,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="ins-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="zen-press grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 text-left hover:bg-accent/40 sm:p-5"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground ring-1 ring-border">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{summary}</div>
        </div>
        <ChevronDown
          className={"h-4 w-4 shrink-0 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>
      {open && <div className="zen-collapse space-y-5 border-t border-border/50 p-4 sm:p-5">{children}</div>}
    </section>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-2 rounded-lg border border-border bg-surface/60 p-3">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
    </li>
  );
}

function SectionGroup({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ins-panel p-5 sm:p-6">
      <header className="flex items-start gap-3 border-b border-border/50 pb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={
          "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
          (checked ? "bg-primary" : "bg-muted")
        }
      >
        <span
          className={
            "absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform " +
            (checked ? "translate-x-5" : "translate-x-0.5")
          }
        />
      </button>
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors " +
        (active
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground hover:border-primary/30")
      }
    >
      {children}
    </button>
  );
}
