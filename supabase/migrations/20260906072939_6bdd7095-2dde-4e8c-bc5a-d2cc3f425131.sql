CREATE TABLE public.intent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  active_seconds integer NOT NULL DEFAULT 0,
  primary_category text NOT NULL,
  primary_intent text NOT NULL,
  alignment_score integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intent_sessions TO authenticated;
GRANT ALL ON public.intent_sessions TO service_role;
ALTER TABLE public.intent_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own intent sessions" ON public.intent_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_intent_sessions_user_started ON public.intent_sessions (user_id, started_at DESC);
CREATE TRIGGER trg_intent_sessions_updated BEFORE UPDATE ON public.intent_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.intent_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.intent_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  raw_intent text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intent_segments TO authenticated;
GRANT ALL ON public.intent_segments TO service_role;
ALTER TABLE public.intent_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own intent segments" ON public.intent_segments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_intent_segments_session ON public.intent_segments (session_id, started_at);

CREATE TABLE public.video_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.intent_sessions(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES public.intent_segments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text,
  description text,
  channel text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  search_query text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  watch_seconds integer NOT NULL DEFAULT 0,
  effective_seconds integer NOT NULL DEFAULT 0,
  video_duration_seconds integer,
  completion_percent integer NOT NULL DEFAULT 0,
  relevance_score integer NOT NULL DEFAULT 0,
  relevance_class text NOT NULL DEFAULT 'unrelated',
  relevance_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  replayed boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (segment_id, video_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_interactions TO authenticated;
GRANT ALL ON public.video_interactions TO service_role;
ALTER TABLE public.video_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own video interactions" ON public.video_interactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_video_interactions_user_started ON public.video_interactions (user_id, started_at DESC);
CREATE TRIGGER trg_video_interactions_updated BEFORE UPDATE ON public.video_interactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  total_sessions integer NOT NULL DEFAULT 0,
  total_watch_seconds integer NOT NULL DEFAULT 0,
  relevant_watch_seconds integer NOT NULL DEFAULT 0,
  unrelated_watch_seconds integer NOT NULL DEFAULT 0,
  alignment_score integer NOT NULL DEFAULT 0,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  seen boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reports TO authenticated;
GRANT ALL ON public.weekly_reports TO service_role;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own weekly reports" ON public.weekly_reports FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);