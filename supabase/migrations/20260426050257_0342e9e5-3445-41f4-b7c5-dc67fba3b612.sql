-- Deduplicate existing watch_history: keep only the most recent row per (user_id, video_id)
DELETE FROM public.watch_history a
USING public.watch_history b
WHERE a.user_id = b.user_id
  AND a.video_id = b.video_id
  AND a.watched_at < b.watched_at;

-- Add a playlist context column (nullable)
ALTER TABLE public.watch_history
  ADD COLUMN IF NOT EXISTS playlist_id TEXT;

-- Add unique constraint so upsert on (user_id, video_id) works
ALTER TABLE public.watch_history
  DROP CONSTRAINT IF EXISTS watch_history_user_video_unique;
ALTER TABLE public.watch_history
  ADD CONSTRAINT watch_history_user_video_unique UNIQUE (user_id, video_id);
