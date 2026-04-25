import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Leaf } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  validateSearch: (search) => ({ redirect: (search.redirect as string) || "/" }),
  beforeLoad: () => {
    // Auth is client-side; we can't gate here.
  },
  head: () => ({ meta: [{ title: "Sign in — ZenTube" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  if (user) {
    throw redirect({ to: search.redirect as "/" });
  }

  const [tab, setTab] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created. You're in.");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/",
      });
      if (result.error) {
        toast.error(result.error.message || "Google sign-in failed");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
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
        <div className="zen-card p-6 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{tab === "in" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "in" ? "Sign in to save notes, history, and insights." : "Free. No tracking beyond your own dashboard."}
          </p>

          <button
            onClick={onGoogle}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
          >
            <GoogleIcon /> Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {tab === "in" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {tab === "in" ? (
              <>New here?{" "}
                <button onClick={() => setTab("up")} className="text-primary hover:underline">Create an account</button>
              </>
            ) : (
              <>Already have one?{" "}
                <button onClick={() => setTab("in")} className="text-primary hover:underline">Sign in</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.5-1.7 4.4-5.5 4.4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12s4.2 9.3 9.3 9.3c5.4 0 8.9-3.8 8.9-9.1 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}
