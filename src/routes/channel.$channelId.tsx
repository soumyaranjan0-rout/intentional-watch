import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getChannelDetail, getChannelPlaylists } from "@/server/youtube.functions";
import { getStoredYouTubeApiKey } from "@/lib/youtubeApiKey";
import { formatCount, formatDuration, type ResultVideo } from "@/lib/intent";
import { ArrowLeft, Loader2, Users, Video as VideoIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/channel/$channelId")({
  head: () => ({ meta: [{ title: "Channel — ZenTube" }] }),
  component: ChannelPage,
});

function ChannelPage() {
  const { channelId } = Route.useParams();
  const router = useRouter();
  const [tab, setTab] = useState<"home" | "videos" | "playlists">("home");

  const { data, isLoading } = useQuery({
    queryKey: ["channel", channelId],
    queryFn: () => getChannelDetail({ data: { channelId, apiKey: getStoredYouTubeApiKey() } }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: playlistData } = useQuery({
    queryKey: ["channel-playlists", channelId],
    queryFn: () => getChannelPlaylists({ data: { channelId, apiKey: getStoredYouTubeApiKey() } }),
    enabled: tab === "playlists",
    staleTime: 5 * 60 * 1000,
  });

  const popular = useMemo(() => {
    if (!data?.videos) return [];
    return [...data.videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 6);
  }, [data?.videos]);

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
      {ch.banner && (
        <div className="aspect-[6/1] w-full overflow-hidden rounded-2xl bg-muted">
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-8">
        <TabsList>
          <TabsTrigger value="home">Home</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="playlists">Playlists</TabsTrigger>
        </TabsList>

        <TabsContent value="home" className="mt-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Popular uploads
          </h2>
          <VideoGrid videos={popular} />
        </TabsContent>

        <TabsContent value="videos" className="mt-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Latest videos
          </h2>
          <VideoGrid videos={videos} />
        </TabsContent>

        <TabsContent value="playlists" className="mt-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Playlists
          </h2>
          {!playlistData ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : playlistData.playlists.length === 0 ? (
            <div className="zen-card p-6 text-sm text-muted-foreground">No public playlists.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {playlistData.playlists.map((p) => (
                <Link
                  key={p.playlistId}
                  to="/playlist/$playlistId"
                  params={{ playlistId: p.playlistId }}
                  search={{ index: 0 }}
                  className="zen-card zen-card-hover overflow-hidden"
                >
                  <div className="aspect-video w-full bg-muted">
                    {p.thumbnail && <img src={p.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-2 text-sm font-medium text-foreground">{p.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{p.itemCount} videos</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VideoGrid({ videos }: { videos: ResultVideo[] }) {
  if (videos.length === 0) {
    return <div className="zen-card p-6 text-sm text-muted-foreground">No videos available.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  );
}
