import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { consumePostLoginPath } from "@/lib/auth";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let lastToken: string | null | undefined;
    let lastUserId: string | null | undefined;

    const apply = (s: Session | null, event?: string) => {
      if (cancelled) return;
      const token = s?.access_token ?? null;
      const uid = s?.user?.id ?? null;
      // Only update React state when something meaningful actually changed.
      // Without this guard, token-refresh / tab-focus events flip the user
      // object reference and re-fire every effect that depends on `user`,
      // which manifested as random "page reloads" mid-session.
      if (token === lastToken && uid === lastUserId) {
        setLoading(false);
        return;
      }
      lastToken = token;
      lastUserId = uid;
      setSession(s);
      setLoading(false);

      if (event === "SIGNED_IN" && s) {
        const target = consumePostLoginPath();
        if (target && `${window.location.pathname}${window.location.search}` !== target) {
          window.history.replaceState(null, "", target);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => apply(s, event));
    supabase.auth.getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
