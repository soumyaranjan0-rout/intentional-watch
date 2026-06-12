import { useState } from "react";
import { ChevronDown, Info, Check, Minus } from "lucide-react";
import type { Mode, ResultVideo } from "@/lib/intent";
import { formatCount } from "@/lib/intent";

type Signal = {
  label: string;
  detail: string;
  /** 0 = neutral, positive = match, negative = mismatch */
  weight: number;
};

const STOP = new Set([
  "the", "and", "for", "with", "video", "videos", "new", "latest", "best", "top",
  "you", "your", "this", "that", "from", "into", "what", "how", "why",
  "2024", "2025", "2026", "2027",
]);

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export function computeSignals(
  v: ResultVideo,
  mode: Mode,
  query: string,
  chips: string[],
): Signal[] {
  const out: Signal[] = [];
  const tokens = tokenize(query);
  const titleN = v.title.toLowerCase();
  const descN = (v.description || "").toLowerCase();
  const chN = v.channel.toLowerCase();

  // 1. Keyword coverage
  if (tokens.length > 0) {
    const titleHits = tokens.filter((t) => titleN.includes(t));
    const descHits = tokens.filter((t) => !titleN.includes(t) && descN.includes(t));
    const total = titleHits.length + descHits.length;
    const coverage = total / tokens.length;
    if (titleHits.length > 0) {
      out.push({
        label: "Keywords in title",
        detail: `${titleHits.length}/${tokens.length} (${titleHits.join(", ")})`,
        weight: titleHits.length * 2,
      });
    }
    if (descHits.length > 0) {
      out.push({
        label: "Keywords in description",
        detail: descHits.join(", "),
        weight: descHits.length,
      });
    }
    if (coverage === 0) {
      out.push({ label: "Keyword match", detail: "No query terms found in title or description", weight: -3 });
    }
  }

  // 2. Channel name appears in query
  const qLow = query.toLowerCase();
  if (chN && qLow.includes(chN) && chN.length >= 3) {
    out.push({ label: "Channel match", detail: `You searched for "${v.channel}"`, weight: 4 });
  }

  // 3. Refinement chips matched
  if (chips.length > 0) {
    const hay = titleN + " " + descN;
    const matched = chips.filter((c) => hay.includes(c.toLowerCase()));
    if (matched.length > 0) {
      out.push({
        label: "Refinements matched",
        detail: matched.join(" · "),
        weight: matched.length * 2,
      });
    }
  }

  // 4. Duration fit per mode
  const mins = Math.round(v.durationSeconds / 60);
  if (mode === "learn") {
    if (v.durationSeconds >= 10 * 60 && v.durationSeconds <= 90 * 60) {
      out.push({ label: "Length fits a study session", detail: `${mins} min — long enough to explain, short enough to finish`, weight: 2 });
    } else if (v.durationSeconds < 5 * 60) {
      out.push({ label: "Short for learning mode", detail: `Only ${mins} min — may skim the topic`, weight: -1 });
    }
  } else if (mode === "relax") {
    if (v.durationSeconds <= 20 * 60) {
      out.push({ label: "Easy to dip into", detail: `${mins} min — light watch`, weight: 1 });
    }
  } else if (mode === "find") {
    if (v.durationSeconds <= 25 * 60) {
      out.push({ label: "Concise answer length", detail: `${mins} min`, weight: 1 });
    }
  } else if (mode === "explore") {
    if (v.durationSeconds >= 8 * 60) {
      out.push({ label: "Substantial enough to explore", detail: `${mins} min`, weight: 1 });
    }
  }

  // 5. Popularity tier
  if (v.viewCount >= 1_000_000) {
    out.push({ label: "Widely watched", detail: `${formatCount(v.viewCount)} views — many viewers found this useful`, weight: 3 });
  } else if (v.viewCount >= 100_000) {
    out.push({ label: "Popular pick", detail: `${formatCount(v.viewCount)} views`, weight: 2 });
  } else if (v.viewCount >= 10_000) {
    out.push({ label: "Some traction", detail: `${formatCount(v.viewCount)} views`, weight: 1 });
  } else if (v.viewCount > 0) {
    out.push({ label: "Niche reach", detail: `${formatCount(v.viewCount)} views`, weight: 0 });
  }

  // 6. Freshness
  if (v.publishedAt) {
    const ageDays = (Date.now() - +new Date(v.publishedAt)) / 86_400_000;
    if (ageDays <= 30) {
      out.push({ label: "Recently published", detail: `${Math.max(1, Math.round(ageDays))} day${ageDays < 1.5 ? "" : "s"} ago`, weight: 2 });
    } else if (ageDays <= 180) {
      out.push({ label: "Recent", detail: `${Math.round(ageDays / 30)} months ago`, weight: 1 });
    } else if (ageDays > 365 * 3) {
      out.push({ label: "Older content", detail: `${Math.round(ageDays / 365)} years ago`, weight: -1 });
    }
  }

  // 7. Title format signals per mode
  if (mode === "learn" && /course|tutorial|lesson|crash|guide|explained|how to/i.test(v.title)) {
    out.push({ label: "Tutorial format", detail: "Title indicates a structured lesson", weight: 2 });
  }
  if (mode === "find" && /official/i.test(v.title)) {
    out.push({ label: "Official label", detail: "Title says “official”", weight: 3 });
  }
  if (mode === "relax" && /relax|chill|ambient|lo[- ]?fi|asmr|cozy/i.test(v.title)) {
    out.push({ label: "Calm vibe", detail: "Low-stimulation keywords in title", weight: 2 });
  }

  return out.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

export function MatchExplanation({
  v, mode, query, chips,
}: { v: ResultVideo; mode: Mode; query: string; chips: string[] }) {
  const [open, setOpen] = useState(false);
  const signals = open ? computeSignals(v, mode, query, chips) : [];

  return (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        aria-expanded={open}
      >
        <Info className="h-3 w-3" />
        {open ? "Hide reasons" : "Why this match?"}
        <ChevronDown className={"h-3 w-3 transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border/60 bg-surface/40 p-3">
          {signals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No strong signals — surfaced as a fallback result.</p>
          ) : (
            <ul className="space-y-1.5">
              {signals.map((s, i) => {
                const positive = s.weight > 0;
                const negative = s.weight < 0;
                return (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span
                      className={
                        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full " +
                        (positive
                          ? "bg-primary/15 text-primary"
                          : negative
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground")
                      }
                      aria-hidden
                    >
                      {positive ? <Check className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">{s.label}</span>
                      <span className="text-muted-foreground"> — {s.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Signals are computed from the title, description, length, views, date and your refinements. Higher and more positive signals rank higher.
          </p>
        </div>
      )}
    </div>
  );
}
