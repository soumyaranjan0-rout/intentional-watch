# ZenTube

A focused, intent-driven video player built on top of the YouTube Data API.
ZenTube lets you search, watch, take timestamped notes, build playlists,
and review your watch insights — without the infinite-scroll rabbit hole.

> **Stack:** TanStack Start (React 19, Vite 7), Tailwind v4, Supabase
> (Postgres + Auth), YouTube Data API v3.

---

## 1. Project Setup

Clone the repository and install dependencies:

```bash
git clone <your-repo-url> zentube
cd zentube
npm install
```

> Bun also works (`bun install`) if you prefer it.

---

## 2. Environment Setup

Create a `.env` file in the project root with the following values:

```env
# Supabase (publishable / anon key — safe in the client)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key
VITE_SUPABASE_PROJECT_ID=your-project-ref

# Same values for SSR / server functions
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key

# Server-only secrets (never expose to the browser)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
```

Where to find these:

- **Supabase URL / keys** — Supabase Dashboard → *Project Settings → API*.
- **YouTube API key** — Google Cloud Console → enable *YouTube Data API v3*
  → *Credentials → Create API key*.

---

## 3. Running the App

```bash
npm run dev
```

The app boots on **http://localhost:8080** by default (configured in
`vite.config.ts`). Open it in your browser.

---

## 4. Supabase Setup

In the Supabase Dashboard:

1. **Auth → URL Configuration**
   - **Site URL:** `http://localhost:8080`
   - **Additional redirect URLs:** add your production URL too
     (e.g. `https://your-app.com`).
2. **Auth → Providers → Google** — turn it on (see step 5).
3. **Database** — the schema (tables: `profiles`, `preferences`,
   `playlists`, `playlist_items`, `saved_videos`, `notes`,
   `watch_history`, `video_feedback`) is defined under
   `supabase/migrations/`. Run them with the Supabase CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   All tables ship with row-level-security policies that scope reads
   and writes to the authenticated user.

---

## 5. Google OAuth Setup

In the Google Cloud Console:

1. **APIs & Services → Credentials → Create OAuth client ID**
   (type: *Web application*).
2. **Authorized redirect URI** — add the Supabase callback:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
3. Copy the **Client ID** and **Client secret**.
4. Back in Supabase → **Auth → Providers → Google**, paste both values
   and save.

That's it — no `VITE_GOOGLE_CLIENT_ID` is needed in `.env`; Supabase
handles the OAuth handshake.

---

## 6. Common Errors & Fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `redirect_uri_mismatch` on Google sign-in | Callback URL in Google Cloud doesn't match Supabase | Add `https://<ref>.supabase.co/auth/v1/callback` exactly |
| `Missing Supabase environment variables` on boot | `.env` not loaded | Restart `npm run dev` after editing `.env` |
| Search returns "YouTube could not search at this moment" | `YOUTUBE_API_KEY` missing or quota exhausted | Check Google Cloud quota; rotate key |
| Sign-in window opens and closes with "Something went wrong" | Site URL not whitelisted in Supabase | Add the current origin to *Auth → URL Configuration* |
| Player shows "This video can't be played here" | Owner disabled embedding | Click *Watch on YouTube* — there's no workaround |

---

## 7. Folder Structure

```
src/
├── components/        Reusable UI (Player, NavSearch, modals, shadcn primitives)
├── contexts/          AuthContext, SessionStateContext
├── integrations/
│   ├── supabase/      Browser + server Supabase clients (auto-generated)
│   └── lovable/       OAuth helper
├── lib/               Shared helpers (intent ranking, system playlists, utils)
├── routes/            File-based routes (TanStack Router)
│   ├── _authenticated.*  Routes gated behind sign-in (library, history, notes…)
│   ├── watch.$videoId.tsx
│   ├── results.tsx
│   └── …
├── server/            createServerFn handlers (YouTube API, etc.)
├── styles.css         Tailwind v4 design tokens
└── router.tsx         Router bootstrap
supabase/
├── config.toml        Project config
└── migrations/        SQL schema migrations
```

---

## 8. Production Build

```bash
npm run build      # builds the SSR bundle
npm run preview    # serves the production build locally
```

Deploy the output to any platform that supports Cloudflare Workers /
edge functions (the project ships with a `wrangler.jsonc`).

---

Made with ❤️ — happy watching.
