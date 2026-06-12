import { createRouter, useRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { routeTree } from "./routeTree.gen";
import { friendlyErrorMessage, saveIssueReport } from "./lib/issueReports";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [reported, setReported] = useState(false);
  const friendly = friendlyErrorMessage(error);

  const report = () => {
    if (reported) return;
    saveIssueReport(
      error,
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
    );
    setReported(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{friendly}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          This is a glitch in the app — nothing you did wrong, and your data is safe.
        </p>
        {import.meta.env.DEV && error.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Go home
          </a>
          <button
            onClick={report}
            disabled={reported}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-70"
          >
            {reported ? "Reported ✓" : "Report this issue"}
          </button>
        </div>
        {reported && (
          <p className="mt-3 text-xs text-muted-foreground">
            Saved to <span className="text-foreground">Settings → Reports</span>. Open it there and
            take a photo or screenshot to send it to the developer.
          </p>
        )}
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
