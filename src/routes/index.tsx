import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MODES, type Mode } from "@/lib/intent";
import { useSessionState } from "@/contexts/SessionStateContext";
import { useAuth } from "@/contexts/AuthContext";
import { Leaf } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZenTube — Why are you here today?" },
      { name: "description", content: "Pick your intent. ZenTube helps you watch on purpose, not on autopilot." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { setMode, resetSession } = useSessionState();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    // fresh entry — clear last session intent
    resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (m: Mode) => {
    setMode(m);
    if (m === "find") {
      navigate({ to: "/search" });
    } else {
      navigate({ to: "/refine/$mode", params: { mode: m } });
    }
  };

  return (
    <div className="zen-container py-16 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Leaf className="h-6 w-6" />
        </div>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Why are you here today?
        </h1>
        <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
          Pick your intent. ZenTube will keep things calm and on-purpose.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {(Object.keys(MODES) as Mode[]).map((m) => {
          const cfg = MODES[m];
          return (
            <button
              key={m}
              onClick={() => choose(m)}
              className="zen-card zen-card-hover group flex items-start gap-4 p-5 text-left"
            >
              <div className="text-2xl">{cfg.emoji}</div>
              <div className="flex-1">
                <div className="font-medium text-foreground">{cfg.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">{cfg.tagline}</div>
              </div>
              <div className="opacity-0 transition-opacity group-hover:opacity-100 text-primary">→</div>
            </button>
          );
        })}
      </div>

      {!user && (
        <div className="mx-auto mt-10 max-w-md text-center text-sm text-muted-foreground">
          <Link to="/login" search={{ redirect: "/" }} className="text-primary hover:underline">Sign in</Link> to save notes, history, and insights.
        </div>
      )}
    </div>
  );
}
