import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ location }) => {
    // Auth state is client-only; soft-guard via component below.
    return { redirectIfAnon: location.href };
  },
  component: AuthGate,
});

import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

function AuthGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const ctx = Route.useRouteContext();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: ctx.redirectIfAnon || "/" } });
    }
  }, [user, loading, navigate, ctx.redirectIfAnon]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  return <Outlet />;
}
