/**
 * Records every watched video against the intention that was active at the time.
 * Deterministic scoring only — see src/lib/relevance.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import { evaluateEngagement, scoreRelevance, type VideoMetadata } from "@/lib/relevance";
import type { ActiveSession } from "@/lib/intentSession";

export type InteractionInput = VideoMetadata & {
  videoId: string;
  watchSeconds: number;
  effectiveSeconds: number;
  videoDurationSeconds?: number | null;
  replayed?: boolean;
  ended?: boolean;
};

/** Upsert the interaction row for (segment, video). Safe to call repeatedly. */
export async function recordInteraction(
  session: ActiveSession | null,
  input: InteractionInput,
): Promise<void> {
  if (!session || session.local || !session.userId) return;
  if (!input.videoId) return;

  const relevance = scoreRelevance(
    { category: session.category, keywords: session.keywords },
    input,
  );
  const engagement = evaluateEngagement({
    effectiveSeconds: input.effectiveSeconds,
    videoDurationSeconds: input.videoDurationSeconds ?? 0,
    replayed: input.replayed ?? false,
  });

  await supabase.from("video_interactions").upsert(
    {
      session_id: session.id,
      segment_id: session.segmentId,
      user_id: session.userId,
      video_id: input.videoId,
      title: input.title ?? null,
      description: (input.description ?? "").slice(0, 2000) || null,
      channel: input.channel ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
      search_query: input.searchQuery ?? null,
      ended_at: input.ended ? new Date().toISOString() : null,
      watch_seconds: Math.round(input.watchSeconds),
      effective_seconds: Math.round(input.effectiveSeconds),
      video_duration_seconds: input.videoDurationSeconds ?? null,
      completion_percent: engagement.completionPercent,
      relevance_score: relevance.score,
      relevance_class: relevance.classification,
      relevance_factors: relevance.factors,
      replayed: input.replayed ?? false,
      skipped: engagement.skipped,
    },
    { onConflict: "segment_id,video_id" },
  );
}
