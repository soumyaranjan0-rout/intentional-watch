import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MODES, type Mode } from "@/lib/intent";
import { toast } from "sonner";

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
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("preferences").select("daily_watch_limit_min, default_mode, theme, data_tracking").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs(data as Prefs);
          applyTheme(data.theme);
        } else {
          setPrefs({ daily_watch_limit_min: 60, default_mode: null, theme: "dark", data_tracking: true });
        }
      });
  }, [user]);

  const applyTheme = (t: string) => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
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
    const { error } = await supabase.from("preferences").upsert(
      { user_id: user.id, ...prefs },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      toast.error("Could not save preferences");
    } else {
      toast.success("Saved");
      applyTheme(prefs.theme);
    }
  };

  if (!prefs) return <div className="zen-container py-10 text-muted-foreground">Loading…</div>;

  return (
    <div className="zen-container py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Adjust ZenTube to your pace.</p>

      <div className="mt-8 space-y-4">
        <Section title="Daily watch limit" description="A gentle target. ZenTube will remind you, never block you.">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={5}
              max={600}
              value={prefs.daily_watch_limit_min}
              onChange={(e) => setPrefs({ ...prefs, daily_watch_limit_min: parseInt(e.target.value || "0", 10) })}
              className="w-28 rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <span className="text-sm text-muted-foreground">minutes / day</span>
          </div>
        </Section>

        <Section title="Default intent" description="Skip the picker when you already know your usual pattern.">
          <div className="flex flex-wrap gap-2">
            <Chip active={prefs.default_mode === null} onClick={() => setPrefs({ ...prefs, default_mode: null })}>Always ask</Chip>
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <Chip key={m} active={prefs.default_mode === m} onClick={() => setPrefs({ ...prefs, default_mode: m })}>
                {MODES[m].emoji} {MODES[m].label}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Theme">
          <div className="flex gap-2">
            <Chip active={prefs.theme === "dark"} onClick={() => setPrefs({ ...prefs, theme: "dark" })}>Dark</Chip>
            <Chip active={prefs.theme === "light"} onClick={() => setPrefs({ ...prefs, theme: "light" })}>Light</Chip>
          </div>
        </Section>

        <Section title="Data tracking" description="Power your insights dashboard. Disable to stop saving watch history.">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={prefs.data_tracking}
              onChange={(e) => setPrefs({ ...prefs, data_tracking: e.target.checked })}
              className="h-4 w-4 accent-[oklch(0.74_0.11_155)]"
            />
            Track my watch history for insights
          </label>
        </Section>

        <div className="flex justify-end pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="zen-card p-5">
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors " +
        (active ? "border-primary bg-primary/15 text-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground hover:border-primary/40")
      }
    >
      {children}
    </button>
  );
}
