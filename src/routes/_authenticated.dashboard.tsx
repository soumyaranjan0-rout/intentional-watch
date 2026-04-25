import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { MODES, type Mode } from "@/lib/intent";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Insights — ZenTube" }] }),
  component: Dashboard,
});

type Row = { mode: string; watch_seconds: number; watched_at: string; title: string | null; channel: string | null };

function Dashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("watch_history")
      .select("mode, watch_seconds, watched_at, title, channel")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setRows((data || []) as Row[]);
        setLoading(false);
      });
  }, [user]);

  const totalSec = rows.reduce((s, r) => s + (r.watch_seconds || 0), 0);
  const byMode: Record<string, number> = {};
  for (const r of rows) byMode[r.mode] = (byMode[r.mode] || 0) + (r.watch_seconds || 0);
  const learnSec = byMode["learn"] || 0;
  const entSec = byMode["relax"] || 0;
  const learnPct = totalSec ? Math.round((learnSec / totalSec) * 100) : 0;
  const entPct = totalSec ? Math.round((entSec / totalSec) * 100) : 0;

  // Last 7 days
  const days: { day: string; min: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const min = rows
      .filter((r) => {
        const t = new Date(r.watched_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      })
      .reduce((s, r) => s + r.watch_seconds, 0) / 60;
    days.push({ day: d.toLocaleDateString(undefined, { weekday: "short" }), min: Math.round(min) });
  }

  const modeData = (Object.keys(MODES) as Mode[]).map((m) => ({
    name: MODES[m].label,
    value: Math.round(((byMode[m] || 0) / 60) * 10) / 10,
  })).filter((d) => d.value > 0);

  const COLORS = ["oklch(0.74 0.11 155)", "oklch(0.65 0.09 200)", "oklch(0.78 0.10 100)", "oklch(0.70 0.10 50)"];

  const channelCount: Record<string, number> = {};
  for (const r of rows) {
    const k = r.channel || "Unknown";
    channelCount[k] = (channelCount[k] || 0) + 1;
  }
  const topChannels = Object.entries(channelCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const suggestion =
    totalSec === 0
      ? "Watch your first video to start seeing insights here."
      : entPct > 70
      ? "You spent the majority of your time on entertainment. Maybe try a learning session next?"
      : learnPct > 70
      ? "Strong focus on learning. Consider a calm break too."
      : "Healthy balance between learning and downtime.";

  return (
    <div className="zen-container-wide py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
      <p className="mt-1 text-sm text-muted-foreground">A quiet look at how you've been spending your time.</p>

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Stat label="Total watch time" value={`${Math.round(totalSec / 60)} min`} />
            <Stat label="Learning" value={`${Math.round(learnSec / 60)} min`} sub={`${learnPct}%`} />
            <Stat label="Entertainment" value={`${Math.round(entSec / 60)} min`} sub={`${entPct}%`} />
          </div>

          <div className="mt-6 zen-card p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Suggestion</div>
            <p className="mt-2 text-foreground">{suggestion}</p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="zen-card p-5">
              <div className="mb-3 text-sm font-medium">Last 7 days (minutes)</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days}>
                    <CartesianGrid stroke="oklch(0.27 0.012 160)" vertical={false} />
                    <XAxis dataKey="day" stroke="oklch(0.65 0.015 155)" fontSize={12} />
                    <YAxis stroke="oklch(0.65 0.015 155)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "oklch(0.19 0.014 160)", border: "1px solid oklch(0.27 0.012 160)", borderRadius: 8, color: "oklch(0.93 0.01 150)" }} />
                    <Bar dataKey="min" fill="oklch(0.74 0.11 155)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="zen-card p-5">
              <div className="mb-3 text-sm font-medium">By intent (minutes)</div>
              <div className="h-64">
                {modeData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={modeData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} stroke="oklch(0.16 0.012 160)">
                        {modeData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "oklch(0.19 0.014 160)", border: "1px solid oklch(0.27 0.012 160)", borderRadius: 8, color: "oklch(0.93 0.01 150)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 zen-card p-5">
            <div className="mb-3 text-sm font-medium">Most watched channels</div>
            {topChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {topChannels.map(([name, n]) => (
                  <li key={name} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-foreground">{name}</span>
                    <span className="text-muted-foreground">{n} {n === 1 ? "video" : "videos"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="zen-card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {sub && <div className="text-sm text-primary">{sub}</div>}
      </div>
    </div>
  );
}
