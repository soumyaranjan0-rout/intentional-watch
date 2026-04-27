import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable";
import { Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  validateSearch: (search) => ({ redirect: (search.redirect as string) || "/" }),
  head: () => ({ meta: [{ title: "Sign in — ZenTube" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      throw redirect({ to: search.redirect as "/" });
    }
  }, [user, loading, search.redirect]);

  const onGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + (search.redirect || "/"),
      });
      if (result.error) {
        toast.error(result.error.message || "Google sign-in failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2 text-foreground">
          <Leaf className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold tracking-tight">ZenTube</span>
        </div>
        <div className="zen-card p-8">
          <h1 className="text-xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One click. No password. Your notes, library and insights stay synced across devices.
          </p>

          <button
            onClick={onGoogle}
            disabled={busy || loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By continuing you agree to use ZenTube mindfully.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#fff" d="M12 10.2v3.9h5.5c-.2 1.5-1.7 4.4-5.5 4.4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12s4.2 9.3 9.3 9.3c5.4 0 8.9-3.8 8.9-9.1 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}
