import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDuration } from "@/lib/intent";
import { Trash2, StickyNote, Tag, Play } from "lucide-react";
import { toast } from "sonner";

type Note = {
  id: string;
  content: string;
  timestamp_seconds: number;
  topic: string | null;
  created_at: string;
};

type Props = {
  videoId: string;
  videoTitle: string;
  getCurrentSeconds: () => number;
  onJumpTo: (seconds: number) => void;
};

export function NotesPanel({ videoId, videoTitle, getCurrentSeconds, onJumpTo }: Props) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notes")
      .select("id, content, timestamp_seconds, topic, created_at")
      .eq("user_id", user.id)
      .eq("video_id", videoId)
      .order("timestamp_seconds", { ascending: true })
      .then(({ data }) => setNotes((data || []) as Note[]));
  }, [user, videoId]);

  const add = async () => {
    if (!user) {
      toast.message("Sign in to save notes");
      return;
    }
    const c = content.trim();
    if (!c) return;
    setLoading(true);
    const ts = Math.round(getCurrentSeconds());
    const { data, error } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        video_id: videoId,
        video_title: videoTitle,
        timestamp_seconds: ts,
        content: c,
        topic: topic.trim() || null,
      })
      .select("id, content, timestamp_seconds, topic, created_at")
      .single();
    setLoading(false);
    if (error) {
      toast.error("Could not save note");
      return;
    }
    setNotes((n) => [...n, data as Note].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
    setContent("");
    toast.success(`Note saved at ${formatDuration(ts)}`);
  };

  const remove = async (id: string) => {
    setNotes((n) => n.filter((x) => x.id !== id));
    await supabase.from("notes").delete().eq("id", id);
  };

  return (
    <aside className="zen-card flex h-fit flex-col p-4 lg:sticky lg:top-20">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <StickyNote className="h-4 w-4 text-primary" /> Timestamped notes
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-input px-2.5 py-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (optional, e.g. 'Hooks')"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Capture an insight at the current timestamp…"
          rows={3}
          className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={add}
          disabled={loading || !content.trim()}
          className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          Save note at {formatDuration(getCurrentSeconds())}
        </button>
      </div>

      <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {!user ? (
          <p className="text-sm text-muted-foreground">Sign in to use notes.</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet. Notes you take here can be browsed later from the Notes page.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="group rounded-md border border-border bg-surface-2 p-3 transition-colors hover:border-primary/40">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => onJumpTo(n.timestamp_seconds)}
                  className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/25"
                  title="Jump to this moment"
                >
                  <Play className="h-3 w-3 fill-primary" />
                  {formatDuration(n.timestamp_seconds)}
                </button>
                <div className="flex items-center gap-2">
                  {n.topic && (
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {n.topic}
                    </span>
                  )}
                  <button
                    onClick={() => remove(n.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{n.content}</p>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
