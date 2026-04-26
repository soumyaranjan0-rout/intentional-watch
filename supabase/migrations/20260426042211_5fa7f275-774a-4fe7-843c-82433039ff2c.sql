-- Add intent fields to watch_history
ALTER TABLE public.watch_history
  ADD COLUMN IF NOT EXISTS final_intent TEXT,
  ADD COLUMN IF NOT EXISTS inferred_intent TEXT;

-- Backfill final_intent from existing mode for older rows
UPDATE public.watch_history SET final_intent = mode WHERE final_intent IS NULL;

-- Per-user video feedback (helpful / not useful)
CREATE TABLE IF NOT EXISTS public.video_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  video_id TEXT NOT NULL,
  feedback TEXT NOT NULL CHECK (feedback IN ('helpful', 'not_useful')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

ALTER TABLE public.video_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own feedback select" ON public.video_feedback
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own feedback insert" ON public.video_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own feedback update" ON public.video_feedback
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own feedback delete" ON public.video_feedback
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_video_feedback_updated_at
  BEFORE UPDATE ON public.video_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();