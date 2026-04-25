ALTER TABLE public.watch_history
  ADD COLUMN IF NOT EXISTS effective_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seek_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS topic text;

CREATE INDEX IF NOT EXISTS idx_watch_history_user_watched_at
  ON public.watch_history (user_id, watched_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_user_video
  ON public.notes (user_id, video_id);