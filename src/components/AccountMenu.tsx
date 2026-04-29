import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import {
  User as UserIcon, LogOut, History, Settings, RefreshCcw, LogIn,
} from "lucide-react";

/**
 * YouTube-style account button (top right).
 * - Signed out → small avatar that opens menu with "Sign in with Google".
 * - Signed in  → user avatar with menu (Insights, Library, Notes, History,
 *   Settings, Switch account, Sign out).
 */
export function AccountMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!open) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Close menu when route changes
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const signInGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      // Remember where to land after the OAuth round-trip.
      try {
        sessionStorage.setItem("zen:postLoginPath", location.pathname + location.search);
      } catch { /* storage may be unavailable */ }

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        // Always show the account chooser — users expect to pick the Gmail.
        extraParams: { prompt: "select_account" },
      });

      if (result?.error) {
        toast.error(result.error.message || "Sign in failed. Please try again.");
        setBusy(false);
        return;
      }
      // If result.redirected, the browser is navigating away — keep spinner.
      if (!result?.redirected) {
        setBusy(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  };

  const switchAccount = async () => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      await signOut();
    } catch { /* ignore — we still want to re-auth */ }
    await signInGoogle();
  };

  const handleSignOut = async () => {
    setOpen(false);
    try {
      await signOut();
      toast.success("Signed out");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign out failed");
    }
    navigate({ to: "/" }).catch(() => window.location.assign("/"));
  };

  const initial =
    (user?.user_metadata?.full_name as string | undefined)?.[0] ||
    user?.email?.[0]?.toUpperCase() ||
    "?";
  const avatar = user?.user_metadata?.avatar_url as string | undefined;
  const name = (user?.user_metadata?.full_name as string | undefined) || user?.email;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={user ? "Account menu" : "Sign in"}
        className="zen-avatar-btn flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-surface/80 text-sm text-foreground transition-all hover:border-primary/50 hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_15%,transparent)]"
      >
        {user && avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : user ? (
          <span className="font-medium">{initial}</span>
        ) : (
          <UserIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl backdrop-blur-xl zen-fade-in">
          {user ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
                {avatar ? (
                  <img src={avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-medium text-primary">
                    {initial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{name}</div>
                  {user.email && name !== user.email && (
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  )}
                </div>
              </div>

              <div className="py-1">
                <MenuLink to="/history"   icon={<History className="h-4 w-4" />}>History</MenuLink>
                <MenuLink to="/settings"  icon={<Settings className="h-4 w-4" />}>Settings</MenuLink>
              </div>

              <div className="border-t border-border/60 py-1">
                <button
                  onClick={switchAccount}
                  disabled={busy}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-foreground hover:bg-accent disabled:opacity-50"
                >
                  <RefreshCcw className="h-4 w-4 text-muted-foreground" /> Switch account
                </button>
                <button
                  onClick={async () => { await signOut(); navigate({ to: "/" }); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-foreground hover:bg-accent"
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" /> Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="px-4 pt-4 pb-2">
                <div className="text-sm font-medium text-foreground">You're browsing as a guest</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in to save videos, take notes and see your insights — your history syncs across devices.
                </p>
              </div>
              <div className="px-3 pb-3">
                <button
                  onClick={() => signInGoogle()}
                  disabled={busy}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <GoogleIcon /> Continue with Google
                </button>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  No password. No spam. Just Google.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to, icon, children,
}: { to: "/history" | "/settings"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-accent"
      activeProps={{ className: "bg-accent text-foreground" }}
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </Link>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.5-1.7 4.4-5.5 4.4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12s4.2 9.3 9.3 9.3c5.4 0 8.9-3.8 8.9-9.1 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}

// Small floating "Sign in to unlock" pill for guests on the homepage.
export function GuestSignInHint() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (user) return null;

  const signIn = async () => {
    setBusy(true);
    try {
      await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border/60 bg-surface/40 p-4 text-center backdrop-blur-sm">
      <p className="text-sm text-muted-foreground">
        Sign in to unlock notes, history, library and personal insights.
      </p>
      <button
        onClick={signIn}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium text-foreground hover:border-primary/50 hover:bg-surface disabled:opacity-60"
      >
        <GoogleIcon /> Continue with Google
        <LogIn className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
