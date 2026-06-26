import { createFileRoute } from "@tanstack/react-router";

/**
 * Public proxy for YouTube's autocomplete endpoint.
 * Returns the same suggestions a youtube.com search bar would show.
 * The upstream endpoint blocks browser CORS, so we proxy it server-side.
 */
export const Route = createFileRoute("/api/public/yt-suggest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) {
          return Response.json(
            { suggestions: [] },
            { headers: { "cache-control": "public, max-age=60" } },
          );
        }
        try {
          const upstream = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(q)}`;
          const res = await fetch(upstream, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; ZenTube/1.0)" },
          });
          if (!res.ok) {
            return Response.json({ suggestions: [] });
          }
          const data: unknown = await res.json();
          const arr = Array.isArray(data) ? (data as unknown[])[1] : null;
          const list = Array.isArray(arr)
            ? (arr as unknown[]).filter((x): x is string => typeof x === "string")
            : [];
          return Response.json(
            { suggestions: list.slice(0, 8) },
            { headers: { "cache-control": "public, max-age=300" } },
          );
        } catch {
          return Response.json({ suggestions: [] });
        }
      },
    },
  },
});
