import { Outlet, Link, createRootRouteWithContext, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SessionStateProvider } from "@/contexts/SessionStateContext";
import { AccountMenu } from "@/components/AccountMenu";
import { ZenLogo } from "@/components/ZenLogo";
import { NavSearch } from "@/components/NavSearch";
import { getLastWatched, type LastWatched } from "@/lib/lastWatched";
import { ArrowLeft, LayoutDashboard, BookmarkIcon, StickyNote } from "lucide-react";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-semibold text-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">This page doesn't exist.</p>
        <div className="mt-6">
          <Link to="/" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ZenTube — Watch with intent" },
      { name: "description", content: "A calm, intent-driven way to discover YouTube videos. No infinite scroll. No autoplay. Just what you came for." },
      { name: "author", content: "ZenTube" },
      { property: "og:title", content: "ZenTube — Watch with intent" },
      { property: "og:description", content: "A calm, intent-driven way to discover YouTube videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionStateProvider>
          <AppShell>
            <Outlet />
          </AppShell>
          <Toaster />
        </SessionStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { location } = useRouterState();
  const onAuthPage = location.pathname.startsWith("/login");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!onAuthPage && (
        <header className="sticky top-0 z-30 border-b border-border/40 bg-background/75 backdrop-blur-xl">
          <div className="zen-container-wide flex h-14 items-center gap-3">
            <Link to="/" className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80">
              <ZenLogo size={26} />
              <span className="font-semibold tracking-tight">ZenTube</span>
            </Link>

            <BackToVideoButton />

            <NavSearch />

            <PrimaryNav />

            <div className="ml-1 flex items-center gap-1">
              <AccountMenu />
            </div>
          </div>
        </header>
      )}
      <main className="zen-fade-in">{children}</main>
    </div>
  );
}

/** Shows a "Back to video" pill in the nav when the user navigated away
 *  from a watch page into Insights/Library/Notes/History/Settings. */
function BackToVideoButton() {
  const { location } = useRouterState();
  const [last, setLast] = useState<LastWatched | null>(null);

  useEffect(() => {
    const sync = () => setLast(getLastWatched());
    sync();
    window.addEventListener("zentube:lastWatched", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("zentube:lastWatched", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const SECONDARY = ["/history", "/library", "/notes", "/dashboard", "/settings"];
  const onSecondary = SECONDARY.some((p) => location.pathname.startsWith(p));
  if (!onSecondary || !last) return null;

  return (
    <Link
      to="/watch/$videoId"
      params={{ videoId: last.videoId }}
      search={{
        title: last.title,
        channel: last.channel,
        duration: last.duration,
        thumbnail: last.thumbnail,
        t: last.t,
        intent: "",
      }}
      className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-surface md:inline-flex"
      title={`Back to: ${last.title}`}
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to video
    </Link>
  );
}

function PrimaryNav() {
  const { user } = useAuth();
  if (!user) return <div className="ml-auto" />;
  const linkBase =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const activeCls = "bg-accent text-foreground";
  return (
    <nav className="ml-auto hidden items-center gap-0.5 lg:flex">
      <Link to="/dashboard" className={linkBase} activeProps={{ className: linkBase + " " + activeCls }}>
        <LayoutDashboard className="h-4 w-4" /> Insights
      </Link>
      <Link to="/library" className={linkBase} activeProps={{ className: linkBase + " " + activeCls }}>
        <BookmarkIcon className="h-4 w-4" /> Library
      </Link>
      <Link to="/notes" className={linkBase} activeProps={{ className: linkBase + " " + activeCls }}>
        <StickyNote className="h-4 w-4" /> Notes
      </Link>
    </nav>
  );
}
