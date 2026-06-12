# ZenTube — Local Setup Guide

A calm, intent-driven YouTube companion. This document is written for someone
who has never set up the project before. Follow it top-to-bottom — every step
matters.

---

## 1. What you need before you start

Install these on your computer (one-time setup):

| Tool         | Why                                              | Where to get it                                    |
| ------------ | ------------------------------------------------ | -------------------------------------------------- |
| **Node.js 20+** | Runs the build tools                          | https://nodejs.org (pick the LTS installer)        |
| **Bun**         | Package manager + runtime used by this project | https://bun.sh (run the install command on their homepage) |
| **Git**         | To clone the repo                              | https://git-scm.com                                |
| **VS Code**     | The editor                                     | https://code.visualstudio.com                      |

Recommended VS Code extensions (open Extensions tab and search):
- **ESLint**
- **Prettier**
- **Tailwind CSS IntelliSense**

Verify the installs in a terminal:
```bash
node -v     # should print v20 or higher
bun -v      # should print a version
git --version
```

---

## 2. Get the code

```bash
git clone <YOUR-REPO-URL> zentube
cd zentube
code .          # opens the project in VS Code
```

Inside VS Code, open the integrated terminal: **Terminal → New Terminal**.

Install dependencies:
```bash
bun install
```

---

## 3. Create the accounts you will need

You only need **two** external accounts. Both have generous free tiers.

### 3a. Supabase (database, auth, storage)

1. Go to https://supabase.com → **Start your project** → sign in with GitHub.
2. Click **New project**.
   - **Name**: `zentube` (anything)
   - **Database password**: pick a strong one and save it in a password manager.
   - **Region**: closest to you.
3. Wait ~2 minutes for the project to provision.
4. Once it's ready, open **Project Settings → API**. You'll need:
   - **Project URL** (e.g. `https://xxxxxxxx.supabase.co`)
   - **anon public key** (the long string labeled `anon` / `public`)

### 3b. Google Cloud (YouTube Data API + Google sign-in)

You need this for:
- Letting users sign in with Google
- Fetching YouTube search results & video metadata

Steps:
1. Go to https://console.cloud.google.com → create a new project (top-left dropdown → **New Project**).
2. **Enable the YouTube Data API v3**:
   - Menu → **APIs & Services → Library** → search "YouTube Data API v3" → **Enable**.
3. **Create an API key** (for YouTube searches):
   - **APIs & Services → Credentials → Create Credentials → API key**.
   - Copy the key. (You can restrict it to "YouTube Data API v3" later.)
4. **Create an OAuth Client ID** (for Google sign-in):
   - **APIs & Services → OAuth consent screen** → choose **External** → fill in app name, your email, save.
   - **Credentials → Create Credentials → OAuth client ID**:
     - **Application type**: Web application
     - **Authorized JavaScript origins**:
       - `http://localhost:3000`
       - your Supabase URL (e.g. `https://xxxxxxxx.supabase.co`)
     - **Authorized redirect URIs**:
       - `https://xxxxxxxx.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client secret**.

### 3c. Wire Google sign-in into Supabase

1. In Supabase: **Authentication → Providers → Google** → enable it.
2. Paste the **Client ID** and **Client secret** from step 3b.
3. Save.
4. In **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs**: add `http://localhost:3000/**`

---

## 4. Configure environment variables

Create a file named `.env` in the project root (same folder as `package.json`).
Paste this and fill in the values from step 3:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR-SUPABASE-ANON-PUBLIC-KEY
VITE_SUPABASE_PROJECT_ID=YOUR-PROJECT-ID
```

> The **YouTube API key** is not put in `.env`. The app asks the user to paste
> it in **Settings → YouTube API key** once they sign in, and stores it in
> their browser. This is so each person uses their own quota.

⚠️ Never commit `.env` to git. It is already in `.gitignore`.

---

## 5. Apply the database schema

The app expects a set of tables (watch_history, notes, saved_videos, etc.).
The migrations live in `supabase/migrations/`.

Easiest path — use the Supabase web UI:

1. Open your Supabase project → **SQL Editor → New query**.
2. For **each file** in `supabase/migrations/` (in filename order), copy its
   contents into the editor and click **Run**.
3. Go to **Table Editor** and confirm tables like `watch_history`, `notes`,
   `saved_videos`, `playlists`, `playlist_items`, `video_feedback`, `profiles`,
   and `user_roles` exist.

Alternative — use the Supabase CLI:
```bash
bun add -d supabase
bunx supabase login
bunx supabase link --project-ref YOUR-PROJECT-ID
bunx supabase db push
```

---

## 6. Run the app

```bash
bun run dev
```

Open http://localhost:3000 in your browser. You should see the ZenTube home
page.

### First-time inside the app

1. Click **Sign in** (top right or below the search bar) → **Continue with Google**.
2. Open **Settings → YouTube API key** and paste the key from step 3b.
3. Search for any topic — results should now load.

---

## 7. Common mistakes and how to fix them

| Symptom                                                              | Cause                                                              | Fix                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `Failed to resolve import` on `bun run dev`                          | dependencies not installed                                         | run `bun install`                                                                                |
| Blank page, console: `Missing Supabase env`                          | `.env` not created or variable names typed wrong                   | check `.env` exists, names start with `VITE_`, restart `bun run dev`                             |
| Sign-in opens then says "Unsupported provider"                       | Google provider not enabled in Supabase                            | step 3c                                                                                          |
| Sign-in redirects then drops you back on `/login`                    | Wrong **Redirect URLs** in Supabase Auth settings                  | add `http://localhost:3000/**`                                                                   |
| Google popup says `redirect_uri_mismatch`                            | The Supabase callback URL isn't in the Google OAuth client         | step 3b — Authorized redirect URIs                                                                |
| Search returns nothing / `403 quotaExceeded`                         | YouTube API key missing or daily quota hit                         | Settings → paste key; daily quota resets at midnight Pacific time                                |
| `permission denied for table ...`                                    | Migrations weren't run, or RLS policies missing                    | re-run step 5                                                                                    |
| Port 3000 already in use                                             | Another process is using it                                        | `bun run dev -- --port 3001` and update Supabase redirect URLs accordingly                       |
| Changes to `.env` don't take effect                                  | Vite caches env at start                                           | stop the dev server (Ctrl+C) and run `bun run dev` again                                         |

If something crashes inside the app, the error screen has a **Report this
issue** button. Reports are saved under **Settings → Reports** with device
info and reproduction steps — open one, screenshot it, and send it to the
developer.

---

## 8. Useful commands

```bash
bun run dev          # local development at http://localhost:3000
bun run build        # production build
bun run preview      # preview the production build locally
bun run lint         # lint the code
bun run format       # auto-format with Prettier
bun add <pkg>        # install a dependency
bun remove <pkg>     # remove one
```

---

## 9. Project layout (quick reference)

```
src/
  routes/                file-based routes (TanStack Router)
    __root.tsx           top-level layout, header, mobile nav
    index.tsx            home page
    login.tsx            sign-in page
    watch.$videoId.tsx   video player page
    playlist.$playlistId.tsx
    _authenticated.*     pages that require sign-in (dashboard, library, notes, settings, history)
  components/            shared UI components
  contexts/              React contexts (auth, session)
  lib/                   helpers + server functions (*.functions.ts)
  integrations/supabase/ auto-generated Supabase client (DO NOT EDIT)
  styles.css             Tailwind v4 tokens + global styles
supabase/migrations/     SQL migrations applied in step 5
```

---

That's it. If you followed every step you should have a working local copy.
Bookmark this file — when you spin up a fresh machine, repeat sections 1, 2,
4, and 6 only.
