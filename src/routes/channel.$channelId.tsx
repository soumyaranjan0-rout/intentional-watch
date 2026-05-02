import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getChannelDetail } from "@/server/youtube.functions";
import { formatCount, formatDuration } from "@/lib/intent";
import { ArrowLeft, Loader2, Users, Video as VideoIcon } from "lucide-react";

export const Route = createFileRoute("/channel/$channelId")({
  head: () => ({ meta: [{ title: "Channel — ZenTube" }] }),
  component: ChannelPage,
});

function ChannelPage() {
  const { channelId } = Route.useParams();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["channel", channelId],
    queryFn: () => getChannelDetail({ data: { channelId } }),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading channel…
      </div>
    );
  }

  if (!data?.channel) {
    return (
      <div className="zen-container py-16 text-center">
        <p className="text-sm text-muted-foreground">{data?.error || "Channel not found."}</p>
        <button onClick={() => router.history.back()} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <ArrowLeft className="h-4 w-4" /> Go back
        </button>
      </div>
    );
  }

  const ch = data.channel;
  const videos = data.videos;

  return (
    <div className="zen-container py-6 sm:py-8">
      <button
        onClick={() => router.history.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {ch.banner && (
        <div className="mt-4 aspect-[6/1] w-full overflow-hidden rounded-2xl bg-muted">
          <img src={ch.banner} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <img
          src={ch.thumbnail}
          alt=""
          className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-border sm:h-24 sm:w-24"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{ch.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {formatCount(ch.subscriberCount)} subscribers
            </span>
            <span className="inline-flex items-center gap-1">
              <VideoIcon className="h-3.5 w-3.5" /> {formatCount(ch.videoCount)} videos
            </span>
          </div>
          {ch.description && (
            <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-muted-foreground">{ch.description}</p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Latest videos
          </h2>
          <span className="text-xs text-muted-foreground">Sorted by newest</span>
        </div>

        {videos.length === 0 ? (
          <div className="zen-card mt-4 p-6 text-sm text-muted-foreground">
            No public videos available.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <Link
                key={v.videoId}
                to="/watch/$videoId"
                params={{ videoId: v.videoId }}
                search={{ title: v.title, channel: v.channel, duration: v.durationSeconds, thumbnail: v.thumbnail, t: 0, intent: "" }}
                className="zen-card zen-card-hover overflow-hidden"
              >
                <div className="relative aspect-video w-full bg-muted">
                  {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  <div className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-xs">
                    {formatDuration(v.durationSeconds)}
                  </div>
                </div>
                <div className="p-3">
                  <div className="line-clamp-2 text-sm font-medium text-foreground">{v.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatCount(v.viewCount)} views · {new Date(v.publishedAt).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
