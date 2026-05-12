import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MODES, type Mode } from "@/lib/intent";
import { toast } from "sonner";
import { User, Clock, Palette, Shield, LogOut, Trash2, Mail, Key, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredYouTubeApiKey, setStoredYouTubeApiKey } from "@/lib/youtubeApiKey";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — ZenTube" }] }),
  component: SettingsPage,
});

type Prefs = {
  daily_watch_limit_min: number;
  default_mode: string | null;
  theme: string;
  data_tracking: boolean;
};

function SettingsPage() {
  const { user, signOut } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("preferences")
      .select("daily_watch_limit_min, default_mode, theme, data_tracking")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs(data as Prefs);
          applyTheme(data.theme);
        } else {
          setPrefs({
            daily_watch_limit_min: 60,
            default_mode: null,
            theme: "dark",
            data_tracking: true,
          });
        }
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

  return (
    <div className="zen-container py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Adjust ZenTube to your pace.</p>

      <div className="mt-8 space-y-6">
        {/* Account */}
        <SectionGroup icon={User} title="Account" description="Your basic profile">
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
              <Mail className="h-4 w-4" />
              {user?.email}
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

        {/* Usage Control */}
        <SectionGroup icon={Clock} title="Usage control" description="Gentle reminders, never blocks.">
          <Field label={`Daily watch limit · ${prefs.daily_watch_limit_min} min`}>
            <input
              type="range"
              min={10}
              max={240}
              step={5}
              value={prefs.daily_watch_limit_min}
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
            label="Session reminders"
            description="Ask if you're still watching with intent after 2 videos."
            checked={sessionReminders}
            onChange={setSessionReminders}
          />
        </SectionGroup>

        {/* Preferences */}
        <SectionGroup icon={Palette} title="Preferences" description="How ZenTube behaves and looks">
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
          </Field>
          <Field label="Theme">
            <div className="flex gap-2">
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
          </Field>
        </SectionGroup>

        {/* YouTube API Key */}
        <SectionGroup icon={Key} title="YouTube API key" description="Use your own key for unlimited searches. Stored locally in your browser only.">
          <Field label="API key">
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza…"
                spellCheck={false}
                autoComplete="off"
                className="flex-1 rounded-md border border-border bg-input px-3 py-2 font-mono text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="rounded-md border border-border bg-surface px-3 text-xs hover:bg-accent"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Don't have one?{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Create a free YouTube Data API v3 key <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </Field>
        </SectionGroup>

        {/* Privacy */}
        <SectionGroup icon={Shield} title="Privacy" description="You control your data.">
          <Toggle
            label="Track my watch history"
            description="Powers your insights. Disable to stop saving any history."
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

        <div className="sticky bottom-4 z-10 flex justify-end pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
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
    <section className="zen-card p-5 sm:p-6">
      <header className="flex items-start gap-3 border-b border-border/60 pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
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
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
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
