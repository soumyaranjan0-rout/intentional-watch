import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable";
import { Loader2, Lock } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!user) {
    const signIn = async () => {
      setBusy(true);
      try {
        await lovable.auth.signInWithOAuth("google", {
          redirect_uri: window.location.origin + window.location.pathname,
        });
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6">
        <div className="zen-card w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Sign in to continue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This space is personal — your notes, library, history and insights all live here. Sign in with Google to unlock it.
          </p>
          <button
            onClick={signIn}
            disabled={busy}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            <GoogleIcon /> Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#fff" d="M12 10.2v3.9h5.5c-.2 1.5-1.7 4.4-5.5 4.4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12s4.2 9.3 9.3 9.3c5.4 0 8.9-3.8 8.9-9.1 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}
