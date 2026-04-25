import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useSessionState } from "@/contexts/SessionStateContext";
import type { LearnRefine, RelaxRefine, ExploreRefine, Mode } from "@/lib/intent";
import { MODES } from "@/lib/intent";

const VALID: Mode[] = ["learn", "relax", "explore"];

export const Route = createFileRoute("/refine/$mode")({
  beforeLoad: ({ params }) => {
    if (!VALID.includes(params.mode as Mode)) {
      throw redirect({ to: "/" });
    }
  },
  component: RefinePage,
});

function RefinePage() {
  const { mode } = Route.useParams();
  const m = mode as Mode;
  const cfg = MODES[m];
  const navigate = useNavigate();
  const { setRefinement, setMode } = useSessionState();

  const submit = (data: LearnRefine | RelaxRefine | ExploreRefine | Record<string, never>) => {
    setMode(m);
    if (m === "learn") setRefinement({ mode: "learn", data: data as LearnRefine });
    else if (m === "relax") setRefinement({ mode: "relax", data: data as RelaxRefine });
    else if (m === "explore") setRefinement({ mode: "explore", data: data as ExploreRefine });
    navigate({ to: "/search" });
  };

  return (
    <div className="zen-container py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="text-sm text-muted-foreground">{cfg.emoji} {cfg.label}</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {m === "learn" && "Shape your learning session"}
          {m === "relax" && "Set the mood"}
          {m === "explore" && "How do you want to explore?"}
        </h1>
        <p className="mt-2 text-muted-foreground">A couple of choices, then we'll keep search short and clean.</p>

        <div className="mt-8 zen-card p-6 sm:p-8">
          {m === "learn" && <LearnForm onSubmit={submit} />}
          {m === "relax" && <RelaxForm onSubmit={submit} />}
          {m === "explore" && <ExploreForm onSubmit={submit} />}
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
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
        (active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground hover:border-primary/40")
      }
    >
      {children}
    </button>
  );
}

function LearnForm({ onSubmit }: { onSubmit: (d: LearnRefine) => void }) {
  const [level, setLevel] = useState<LearnRefine["level"]>("beginner");
  const [depth, setDepth] = useState<LearnRefine["depth"]>("stepbystep");
  const [duration, setDuration] = useState<LearnRefine["duration"]>("medium");
  return (
    <div className="space-y-6">
      <FieldGroup label="Skill level">
        {(["beginner", "intermediate", "advanced"] as const).map((v) => (
          <Chip key={v} active={level === v} onClick={() => setLevel(v)}>{v}</Chip>
        ))}
      </FieldGroup>
      <FieldGroup label="Depth">
        <Chip active={depth === "overview"} onClick={() => setDepth("overview")}>Overview</Chip>
        <Chip active={depth === "stepbystep"} onClick={() => setDepth("stepbystep")}>Step-by-step</Chip>
        <Chip active={depth === "deep"} onClick={() => setDepth("deep")}>Deep dive</Chip>
      </FieldGroup>
      <FieldGroup label="Duration">
        <Chip active={duration === "short"} onClick={() => setDuration("short")}>&lt; 15 min</Chip>
        <Chip active={duration === "medium"} onClick={() => setDuration("medium")}>~ 1 hour</Chip>
        <Chip active={duration === "long"} onClick={() => setDuration("long")}>Full course</Chip>
      </FieldGroup>
      <button onClick={() => onSubmit({ level, depth, duration })} className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
        Continue to search
      </button>
    </div>
  );
}

function RelaxForm({ onSubmit }: { onSubmit: (d: RelaxRefine) => void }) {
  const [mood, setMood] = useState<RelaxRefine["mood"]>("chill");
  const [length, setLength] = useState<RelaxRefine["length"]>("medium");
  const [type, setType] = useState<RelaxRefine["type"]>("official");
  return (
    <div className="space-y-6">
      <FieldGroup label="Mood">
        {(["chill", "emotional", "energetic"] as const).map((v) => (
          <Chip key={v} active={mood === v} onClick={() => setMood(v)}>{v}</Chip>
        ))}
      </FieldGroup>
      <FieldGroup label="Length">
        <Chip active={length === "short"} onClick={() => setLength("short")}>Short</Chip>
        <Chip active={length === "medium"} onClick={() => setLength("medium")}>Medium</Chip>
        <Chip active={length === "long"} onClick={() => setLength("long")}>Long</Chip>
      </FieldGroup>
      <FieldGroup label="Type">
        {(["official", "remix", "clips"] as const).map((v) => (
          <Chip key={v} active={type === v} onClick={() => setType(v)}>{v}</Chip>
        ))}
      </FieldGroup>
      <button onClick={() => onSubmit({ mood, length, type })} className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
        Continue to search
      </button>
    </div>
  );
}

function ExploreForm({ onSubmit }: { onSubmit: (d: ExploreRefine) => void }) {
  const [shape, setShape] = useState<ExploreRefine["shape"]>("picks");
  return (
    <div className="space-y-6">
      <FieldGroup label="Format">
        <Chip active={shape === "picks"} onClick={() => setShape("picks")}>Give me 3 high-quality picks</Chip>
        <Chip active={shape === "playlist"} onClick={() => setShape("playlist")}>Give me a structured playlist</Chip>
      </FieldGroup>
      <button onClick={() => onSubmit({ shape })} className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
        Continue to search
      </button>
    </div>
  );
}
