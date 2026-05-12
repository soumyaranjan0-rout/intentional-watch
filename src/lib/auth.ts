import { lovable } from "@/integrations/lovable";

type AuthResult = Awaited<ReturnType<typeof lovable.auth.signInWithOAuth>>;

function rememberRedirect(path?: string) {
  if (typeof window === "undefined") return;
  const target = path || `${window.location.pathname}${window.location.search}` || "/";
  if (!target.startsWith("/") || target.startsWith("/~oauth")) return;
  try {
    sessionStorage.setItem("zen:postLoginPath", target);
  } catch {
    /* storage can be unavailable in private/webview modes */
  }
}

function startFullPageGoogleRedirect() {
  const params = new URLSearchParams({
    provider: "google",
    redirect_uri: window.location.origin,
    state: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    prompt: "select_account",
  });
  const url = `/~oauth/initiate?${params.toString()}`;
  try {
    window.open(url, "_top");
  } catch {
    window.location.assign(url);
  }
}

export async function signInWithGoogle(redirectPath?: string): Promise<AuthResult> {
  rememberRedirect(redirectPath);

  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
    extraParams: { prompt: "select_account" },
  });

  const message = result?.error?.message || "";
  if (result?.error && /sign in was cancelled|popup.*closed|cancelled|canceled/i.test(message)) {
    startFullPageGoogleRedirect();
    return { error: null, redirected: true } as AuthResult;
  }

  return result;
}

export function consumePostLoginPath() {
  if (typeof window === "undefined") return null;
  try {
    const path = sessionStorage.getItem("zen:postLoginPath");
    sessionStorage.removeItem("zen:postLoginPath");
    if (!path || !path.startsWith("/") || path.startsWith("/~oauth") || path.startsWith("/login")) return null;
    return path;
  } catch {
    return null;
  }
}