import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSessionState } from "@/contexts/SessionStateContext";
import { MODES, type Mode } from "@/lib/intent";

const VALID: Mode[] = ["learn", "relax", "explore"];

export const Route = createFileRoute("/refine/$mode")({
  head: () => ({ meta: [{ title: "Loading results — ZenTube" }] }),
  beforeLoad: ({ params }) => {
    if (!VALID.includes(params.mode as Mode)) {
      throw redirect({ to: "/" });
    }
  },
  component: RefineRedirect,
});

/**
 * The intent-enhance/refine step has been removed by request. We keep the
 * route so existing links don't 404, but immediately commit the chosen mode
 * and forward to results.
 */
function RefineRedirect() {
  const { mode: paramMode } = Route.useParams();
  const navigate = useNavigate();
  const { query, setMode, setRefinement, hydrated } = useSessionState();

  useEffect(() => {
    if (!hydrated) return;
    if (!query) {
      navigate({ to: "/", replace: true });
      return;
    }
    const m = paramMode as Mode;
    setMode(m);
    setRefinement({ mode: m, freeform: "", chips: [] });
    navigate({ to: "/results", replace: true });
  }, [hydrated, query, paramMode, setMode, setRefinement, navigate]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Preparing your {MODES[paramMode as Mode]?.label.toLowerCase() ?? ""} results…
    </div>
  );
}
