/**
 * Intent session lifecycle.
 *
 * A "session" is one visit to ZenTube with a declared purpose. Each time the
 * user changes their mind mid-visit we close the current *segment* and open a
 * new one, so the record of what they said they wanted stays honest.
 *
 * Signed-in users are persisted to the database. Guests get a local-only
 * session so the launch screen still works; nothing is uploaded.
 */

import { supabase } from "@/integrations/supabase/client";
import { extractKeywords, type IntentCategory } from "@/lib/relevance";

export const IDLE_LIMIT_MS = 15 * 60 * 1000;
export const STORAGE_KEY = "zentube.intentSession.v1";

export type ActiveSession = {
  id: string;
  segmentId: string;
  userId: string | null;
  category: IntentCategory;
  intent: string;
  keywords: string[];
  startedAt: number;
  segmentStartedAt: number;
  lastActivityAt: number;
  activeSeconds: number;
  /** True when this session only lives in the browser (guest mode). */
  local: boolean;
};

function newLocalId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function readStoredSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActiveSession;
    if (!s || !s.id || !s.segmentId || !s.intent) return null;
    return s;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: ActiveSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

export function isIdle(session: ActiveSession, now = Date.now()): boolean {
  return now - session.lastActivityAt > IDLE_LIMIT_MS;
}

/** Create a brand-new session (and its first intent segment). */
export async function createSession(
  userId: string | null,
  category: IntentCategory,
  intent: string,
): Promise<ActiveSession> {
  const now = Date.now();
  const keywords = extractKeywords(intent);
  const base: ActiveSession = {
    id: newLocalId(),
    segmentId: newLocalId(),
    userId,
    category,
    intent: intent.trim(),
    keywords,
    startedAt: now,
    segmentStartedAt: now,
    lastActivityAt: now,
    activeSeconds: 0,
    local: true,
  };

  if (!userId) {
    writeStoredSession(base);
    return base;
  }

  const { data: sessionRow, error } = await supabase
    .from("intent_sessions")
    .insert({
      user_id: userId,
      primary_category: category,
      primary_intent: base.intent,
      status: "active",
    })
    .select("id, started_at")
    .single();

  if (error || !sessionRow) {
    writeStoredSession(base);
    return base;
  }

  const { data: segmentRow } = await supabase
    .from("intent_segments")
    .insert({
      session_id: sessionRow.id,
      user_id: userId,
      category,
      raw_intent: base.intent,
      keywords,
    })
    .select("id")
    .single();

  const session: ActiveSession = {
    ...base,
    id: sessionRow.id,
    segmentId: segmentRow?.id ?? base.segmentId,
    local: !segmentRow,
  };
  writeStoredSession(session);
  return session;
}

/** Close the current segment and open a new one with a different intention. */
export async function switchIntent(
  session: ActiveSession,
  category: IntentCategory,
  intent: string,
): Promise<ActiveSession> {
  const now = Date.now();
  const keywords = extractKeywords(intent);
  let segmentId = newLocalId();

  if (!session.local && session.userId) {
    await supabase
      .from("intent_segments")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", session.segmentId);

    const { data } = await supabase
      .from("intent_segments")
      .insert({
        session_id: session.id,
        user_id: session.userId,
        category,
        raw_intent: intent.trim(),
        keywords,
      })
      .select("id")
      .single();
    if (data) segmentId = data.id;
  }

  const next: ActiveSession = {
    ...session,
    segmentId,
    category,
    intent: intent.trim(),
    keywords,
    segmentStartedAt: now,
    lastActivityAt: now,
  };
  writeStoredSession(next);
  return next;
}

/** Push activity counters up to the database. */
export async function touchSession(session: ActiveSession) {
  if (session.local || !session.userId) return;
  await supabase
    .from("intent_sessions")
    .update({
      last_activity_at: new Date(session.lastActivityAt).toISOString(),
      active_seconds: Math.round(session.activeSeconds),
    })
    .eq("id", session.id);
}

/** Finish a session, recording why it ended. */
export async function endSession(
  session: ActiveSession,
  reason: "manual" | "idle" | "new_intent" = "manual",
) {
  writeStoredSession(null);
  if (session.local || !session.userId) return;
  const endedAt = new Date().toISOString();
  await supabase.from("intent_segments").update({ ended_at: endedAt }).eq("id", session.segmentId);

  const { data: rows } = await supabase
    .from("video_interactions")
    .select("relevance_score, effective_seconds, completion_percent")
    .eq("session_id", session.id);

  const { scoreSession } = await import("@/lib/relevance");
  const alignment = scoreSession(
    (rows ?? []).map((r) => ({
      relevanceScore: r.relevance_score,
      effectiveSeconds: r.effective_seconds,
      completionPercent: r.completion_percent,
    })),
  );

  await supabase
    .from("intent_sessions")
    .update({
      ended_at: endedAt,
      status: reason === "idle" ? "expired" : "ended",
      active_seconds: Math.round(session.activeSeconds),
      alignment_score: alignment.alignment,
    })
    .eq("id", session.id);
}

/** Resume a database session after a reload, if it is still fresh. */
export async function resumeSession(userId: string): Promise<ActiveSession | null> {
  const stored = readStoredSession();
  if (!stored) return null;
  if (isIdle(stored)) {
    await endSession({ ...stored, userId }, "idle").catch(() => {});
    return null;
  }
  if (stored.local) return { ...stored, userId: stored.userId ?? null };

  const { data } = await supabase
    .from("intent_sessions")
    .select("id, status, started_at, active_seconds")
    .eq("id", stored.id)
    .maybeSingle();
  if (!data || data.status !== "active") {
    writeStoredSession(null);
    return null;
  }
  return { ...stored, userId, activeSeconds: data.active_seconds ?? stored.activeSeconds };
}
