import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { consumePostLoginPath, isSafePath, openTopLevelSignIn, signInWithGoogle } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { ZenLogo } from "@/components/ZenLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect: string; direct?: "1" } => {
    const out: { redirect: string; direct?: "1" } = {
      redirect: (search.redirect as string) || "/",
    };
    if (search.direct === "1" || search.direct === 1 || search.direct === true) out.direct = "1";
    return out;
  },
  head: () => ({ meta: [{ title: "Sign in — ZenTube" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const safeRedirect = isSafePath(search.redirect) ? search.redirect : "/";

  // If already signed in, bounce to the requested page.
  // Use window.location to avoid TanStack router coercing complex paths
  // (paths with query strings can throw "Cannot convert object to primitive value").
  useEffect(() => {
    if (loading || !user) return;
    // A full-page OAuth redirect (mobile) lands back here already signed in —
    // prefer the path stored before the redirect, else the ?redirect param.
    const stored = consumePostLoginPath();
    window.location.replace(stored ?? safeRedirect);
  }, [user, loading, safeRedirect]);

  useEffect(() => {
    if (!busy) return;
    const reset = () => setBusy(false);
    const timer = window.setTimeout(reset, 12000);
    window.addEventListener("focus", reset);
    window.addEventListener("pageshow", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", reset);
      window.removeEventListener("pageshow", reset);
    };
  }, [busy]);

  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setErrorText(null);
    try {
      const result = await signInWithGoogle(safeRedirect);

      // The browser is being redirected to Google — keep the spinner until
      // navigation happens; the focus/pageshow watchdog above unlocks the UI
      // if the popup is cancelled or the mobile browser returns here.
      if (result.redirected) return;

      if (!result.ok) {
        const message = result.error || "Google sign-in failed. Please try again.";
        setErrorText(message);
        toast.error(message);
        setBusy(false);
        return;
      }

      // Session confirmed readable — hard navigate so guarded routes see it.
      window.location.replace(consumePostLoginPath() ?? safeRedirect);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setErrorText(message);
      toast.error(message);
      setBusy(false);
    }
  };

  // Opened from the "new tab" fallback: this window is top level, so the
  // OAuth helper does a plain full-page redirect that no pop-up blocker sees.
  useEffect(() => {
    if (loading || user || autoStarted.current) return;
    if (search.direct !== "1") return;
    autoStarted.current = true;
    void onGoogle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, search.direct]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => {
            window.location.replace(safeRedirect === "/login" ? "/" : safeRedirect);
          }}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
          Back
        </button>
        <div className="mb-8 flex items-center justify-center gap-2 text-foreground">
          <ZenLogo size={28} />
          <span className="text-lg font-semibold tracking-tight">ZenTube</span>
        </div>
        <div className="zen-card p-8">
          <h1 className="text-xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One click. No password. Your notes, library and insights stay synced across devices.
          </p>

          <button
            onClick={onGoogle}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>

          {errorText && (
            <div className="mt-4 rounded-xl border border-border/70 bg-surface/60 p-3 text-center">
              <p className="text-xs text-muted-foreground">{errorText}</p>
              <button
                type="button"
                onClick={() => {
                  const opened = openTopLevelSignIn(safeRedirect);
                  if (!opened) toast.error("Allow pop-ups for this site, then try again.");
                }}
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 text-xs font-medium text-foreground hover:border-primary/50"
              >
                Continue with Google in a new tab
              </button>
            </div>
          )}

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
