import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSessionState } from "@/contexts/SessionStateContext";
import { MODES } from "@/lib/intent";
import { Search as SearchIcon } from "lucide-react";

export const Route = createFileRoute("/search")({
  beforeLoad: () => {
    // We can't read context state here — we'll guard in component
  },
  component: SearchPage,
});

function SearchPage() {
  const { mode, query, setQuery } = useSessionState();
  const navigate = useNavigate();
  const [value, setValue] = useState(query);

  useEffect(() => {
    if (!mode) {
      navigate({ to: "/" });
    }
  }, [mode, navigate]);

  if (!mode) return null;
  const cfg = MODES[mode];

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setQuery(v);
    navigate({ to: "/results" });
  };

  return (
    <div className="zen-container py-12 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="text-sm text-muted-foreground">{cfg.emoji} {cfg.label}</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {mode === "find" ? "What are you looking for?" : "What's the topic?"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {mode === "find" ? "Type the exact thing — we'll surface the best match." : "Be specific. Fewer, better results."}
        </p>

        <form onSubmit={onSubmit} className="mt-8">
          <div className="zen-card flex items-center gap-3 p-3 focus-within:border-primary/60">
            <SearchIcon className="ml-2 h-5 w-5 text-muted-foreground" />
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === "find" ? "e.g. official mv interstellar main theme" : "e.g. how transformers work"}
              className="w-full bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!value.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Search
            </button>
          </div>
        </form>

        <div className="mt-8 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← Change intent</Link>
        </div>
      </div>
    </div>
  );
}
