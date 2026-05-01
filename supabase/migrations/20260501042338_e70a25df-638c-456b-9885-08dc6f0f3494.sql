-- Dedupe duplicate system playlists (keep the oldest, move items into it, delete the rest)
WITH ranked AS (
  SELECT id, user_id, kind,
    ROW_NUMBER() OVER (PARTITION BY user_id, kind ORDER BY created_at ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY user_id, kind ORDER BY created_at ASC) AS keeper_id
  FROM public.playlists
  WHERE kind IN ('watch_later', 'liked')
)
UPDATE public.playlist_items pi
SET playlist_id = r.keeper_id
FROM ranked r
WHERE pi.playlist_id = r.id AND r.rn > 1;

DELETE FROM public.playlists p
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, kind ORDER BY created_at ASC) AS rn
  FROM public.playlists
  WHERE kind IN ('watch_later', 'liked')
) d
WHERE p.id = d.id AND d.rn > 1;

-- Prevent future duplicates of system playlists per user
CREATE UNIQUE INDEX IF NOT EXISTS playlists_user_system_kind_uidx
  ON public.playlists (user_id, kind)
  WHERE kind IN ('watch_later', 'liked');