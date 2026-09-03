import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

type AuthResult = Awaited<ReturnType<typeof lovable.auth.signInWithOAuth>>;

const KEY = "zen:postLoginPath";

export function isSafePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/~oauth") &&
    !path.startsWith("/login")
  );
}

function rememberRedirect(path?: string) {
  if (typeof window === "undefined") return;
  const target = isSafePath(path)
    ? path
    : `${window.location.pathname}${window.location.search}`;
  if (!isSafePath(target)) return;
  // Store in both: sessionStorage survives popup flows, localStorage survives
  // full-page redirects on mobile browsers that recycle the tab.
  try { sessionStorage.setItem(KEY, target); } catch { /* private mode */ }
  try { localStorage.setItem(KEY, target); } catch { /* private mode */ }
}

/** Resolves once a Supabase session exists (or times out). */
export async function waitForSession(timeoutMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) return true;
    } catch { /* transient */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export async function signInWithGoogle(
  redirectPath?: string,
): Promise<{ ok: boolean; redirected: boolean; error?: string }> {
  rememberRedirect(redirectPath);

  if (typeof window === "undefined") {
    return { ok: false, redirected: false, error: "Sign-in is unavailable here." };
  }

  let result: AuthResult;
  try {
    result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { prompt: "select_account" },
    });
  } catch (err) {
    return {
      ok: false,
      redirected: false,
      error: err instanceof Error ? err.message : "Google sign-in failed. Please try again.",
    };
  }

  if (result?.redirected) return { ok: false, redirected: true };

  if (result?.error) {
    const msg = result.error.message || "";
    return {
      ok: false,
      redirected: false,
      error: /popup|blocked|closed/i.test(msg)
        ? "The Google window was blocked or closed. Allow pop-ups and try again."
        : msg || "Google sign-in failed. Please try again.",
    };
  }

  // Tokens were set on the client — make sure the session is actually readable
  // before the caller navigates, otherwise guarded routes bounce back.
  const ready = await waitForSession(6000);
  return ready
    ? { ok: true, redirected: false }
    : { ok: false, redirected: false, error: "Signed in, but the session did not load. Please try again." };
}

export function consumePostLoginPath() {
  if (typeof window === "undefined") return null;
  let path: string | null = null;
  try { path = sessionStorage.getItem(KEY); } catch { /* ignore */ }
  if (!path) { try { path = localStorage.getItem(KEY); } catch { /* ignore */ } }
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return isSafePath(path) ? path : null;
}
