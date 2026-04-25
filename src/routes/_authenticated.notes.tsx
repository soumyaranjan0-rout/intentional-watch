import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration } from "@/lib/intent";
import { Skeleton } from "@/components/ui/skeleton";
import { StickyNote, Search, Tag, Play, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({ meta: [{ title: "Notes — ZenTube" }] }),
  component: NotesPage,
});

type NoteRow = {
  id: string;
  content: string;
  topic: string | null;
  timestamp_seconds: number;
  video_id: string;
  video_title: string | null;
  created_at: string;
};

type Group = {
  videoId: string;
  videoTitle: string;
  notes: NoteRow[];
  topics: Set<string>;
  latest: string;
};

function NotesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [q, setQ] = useState("");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [openVideo, setOpenVideo] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notes")
      .select("id, content, topic, timestamp_seconds, video_id, video_title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data || []) as NoteRow[]));
  }, [user]);

  const allTopics = useMemo(() => {
    const s = new Set<string>();
    (rows || []).forEach((n) => n.topic && s.add(n.topic));
    return Array.from(s).sort();
  }, [rows]);

  const groups: Group[] = useMemo(() => {
    if (!rows) return [];
    const ql = q.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const n of rows) {
      if (topicFilter && n.topic !== topicFilter) continue;
      if (ql) {
        const hay = `${n.content} ${n.topic || ""} ${n.video_title || ""}`.toLowerCase();
        if (!hay.includes(ql)) continue;
      }
      const g = map.get(n.video_id) ?? {
        videoId: n.video_id,
        videoTitle: n.video_title || "Untitled video",
        notes: [],
        topics: new Set<string>(),
        latest: n.created_at,
      };
      g.notes.push(n);
      if (n.topic) g.topics.add(n.topic);
      if (n.created_at > g.latest) g.latest = n.created_at;
      map.set(n.video_id, g);
    }
    const arr = Array.from(map.values());
    arr.forEach((g) => g.notes.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
    arr.sort((a, b) => (a.latest < b.latest ? 1 : -1));
    return arr;
  }, [rows, q, topicFilter]);

  return (
    <div className="zen-container py-10">
      <div className="flex items-center gap-3">
        <StickyNote className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        All notes you've taken, grouped by video. Click a timestamp to jump back to the moment.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes, topics, or videos…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {allTopics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTopicFilter(null)}
              className={
                "rounded-full border px-2.5 py-1 text-xs " +
                (topicFilter === null
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border bg-surface/60 text-muted-foreground hover:text-foreground")
              }
            >
              All topics
            </button>
            {allTopics.map((t) => (
              <button
                key={t}
                onClick={() => setTopicFilter(t)}
                className={
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs " +
                  (topicFilter === t
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border bg-surface/60 text-muted-foreground hover:text-foreground")
                }
              >
                <Tag className="h-3 w-3" /> {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {rows === null ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : groups.length === 0 ? (
          <div className="zen-card p-6 text-sm text-muted-foreground">
            {rows.length === 0
              ? "No notes yet. While watching a video, capture insights at the exact moment they happen."
              : "No notes match your filters."}
          </div>
        ) : (
          groups.map((g) => {
            const open = openVideo === g.videoId;
            return (
              <div key={g.videoId} className="zen-card overflow-hidden">
                <button
                  onClick={() => setOpenVideo(open ? null : g.videoId)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/40"
                >
                  {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-sm font-medium text-foreground sm:text-base">
                      {g.videoTitle}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{g.notes.length} {g.notes.length === 1 ? "note" : "notes"}</span>
                      {Array.from(g.topics).slice(0, 4).map((t) => (
                        <span key={t} className="rounded bg-surface px-1.5 py-0.5 uppercase tracking-wider text-[10px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
                {open && (
                  <div className="space-y-2 border-t border-border bg-surface-2/40 p-4">
                    {g.notes.map((n) => (
                      <Link
                        key={n.id}
                        to="/watch/$videoId"
                        params={{ videoId: n.video_id }}
                        search={{ title: g.videoTitle, channel: "", duration: 0, thumbnail: "", t: n.timestamp_seconds }}
                        className="group flex items-start gap-3 rounded-md border border-border/60 bg-background p-3 hover:border-primary/40"
                      >
                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                          <Play className="h-3 w-3 fill-primary" />
                          {formatDuration(n.timestamp_seconds)}
                        </span>
                        <div className="min-w-0 flex-1">
                          {n.topic && (
                            <span className="mb-1 inline-block rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                              {n.topic}
                            </span>
                          )}
                          <p className="whitespace-pre-wrap text-sm text-foreground">{n.content}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
