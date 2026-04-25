-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PREFERENCES
CREATE TABLE public.preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_watch_limit_min INT NOT NULL DEFAULT 60,
  default_mode TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',
  data_tracking BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs select" ON public.preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_prefs_updated BEFORE UPDATE ON public.preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- WATCH HISTORY
CREATE TABLE public.watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  thumbnail TEXT,
  mode TEXT NOT NULL,
  category TEXT,
  watch_seconds INT NOT NULL DEFAULT 0,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own history select" ON public.watch_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own history insert" ON public.watch_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own history update" ON public.watch_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own history delete" ON public.watch_history FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_watch_history_user_time ON public.watch_history(user_id, watched_at DESC);

-- NOTES
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  video_title TEXT,
  timestamp_seconds INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes select" ON public.notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own notes insert" ON public.notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notes update" ON public.notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own notes delete" ON public.notes FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_notes_user_video ON public.notes(user_id, video_id, timestamp_seconds);
CREATE TRIGGER trg_notes_updated BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SAVED VIDEOS
CREATE TABLE public.saved_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  thumbnail TEXT,
  duration_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, video_id)
);
ALTER TABLE public.saved_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saved select" ON public.saved_videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own saved insert" ON public.saved_videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own saved delete" ON public.saved_videos FOR DELETE USING (auth.uid() = user_id);

-- PLAYLISTS
CREATE TABLE public.playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own playlists select" ON public.playlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own playlists insert" ON public.playlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own playlists update" ON public.playlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own playlists delete" ON public.playlists FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_playlists_updated BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  thumbnail TEXT,
  duration_seconds INT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pl items select" ON public.playlist_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own pl items insert" ON public.playlist_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own pl items update" ON public.playlist_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own pl items delete" ON public.playlist_items FOR DELETE USING (auth.uid() = user_id);

-- Auto-create profile + preferences on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();