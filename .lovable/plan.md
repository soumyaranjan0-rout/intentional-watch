# Reliability, intent UX, and responsive product pass

## Goal
Make watch analytics trustworthy, preserve a reliable path back to the active video, redesign Settings around intentional viewing, modernize intent selection, strengthen result relevance, and keep every changed surface polished on phone and laptop.

## Implementation

### 1. Accurate watch-time accounting
- Replace position-based watch totals with a playback ledger that accepts only short, forward-moving intervals emitted while the YouTube player is in the `PLAYING` state.
- Reject seek jumps, backward movement, buffering, paused time, duplicate intervals, and implausibly large deltas.
- Merge overlapping intervals per viewing session and persist only the resulting unique played seconds as `effective_seconds`; keep playback position separate for resume behavior.
- Ensure Insights totals, completion, focus, charts, and per-video metrics use only `effective_seconds`, never `watch_seconds` as a fallback.
- Flush the final valid interval on pause, end, navigation, and page visibility changes without double counting.

### 2. Persistent resume-to-video control
- Save current video metadata and playback position as soon as the watch page opens, then refresh position while actual playback progresses and immediately before unmount/navigation.
- Make the resume control global and route-independent, with reactive cross-component updates and a durable recent-session window.
- Keep it visible on Insights, Library, Notes, Settings, Results, and other non-watch routes; hide it only on the current watch route and authentication screen.
- Give mobile a compact, safe-area-aware resume control above the bottom navigation, while desktop retains a concise header control.

### 3. Intent-first Settings redesign
- Reorganize Settings into a scalable information architecture: **Profile**, **Watching Intent**, **Focus & Wellbeing**, **Appearance**, **Privacy & Data**, **Search Source**, **Reports**, and **Help**.
- Replace the existing tab-like panels with a modern responsive settings shell: clear hero summary, desktop sidebar, mobile section selector, concise descriptions, and consistent controls.
- Keep existing persisted capabilities functional: profile, default intent, theme, watch limit, reminders, data tracking, history deletion, search API key, reports, and sign-out.
- Improve hierarchy, accessibility, loading states, destructive-action clarity, and touch target sizing without introducing unsupported settings.

### 4. Calm intent picker and animation
- Rebuild the intent modal as a responsive bottom sheet on mobile and centered dialog on desktop, with strong focus management, keyboard selection, Escape/Enter behavior, accessible labels, and clear active states.
- Present Learning, Relax, Find, and Explore as concise intent choices with outcome-focused descriptions and a stable confirmation action.
- Add restrained entrance, selection, hover, and result-list transitions using transform/opacity only; respect `prefers-reduced-motion` and avoid costly blur/repaint effects.

### 5. Better search relevance without addictive patterns
- Refactor the search server-function module so server declarations remain thin and ranking/query helpers live in a separate runtime-safe module.
- Improve token normalization, phrase/title coverage, channel confidence, refinement matching, freshness, duration fit, popularity quality, and intent-specific scoring.
- Penalize Shorts, clickbait, weak topic matches, duplicates, and irrelevant freshness noise while avoiding over-filtering valid broad queries.
- Keep result counts finite, autoplay absent, and “show new results” user-initiated; provide clearer match reasons tied to the actual ranking signals.

### 6. Responsive and performance validation
- Audit changed header, resume chip, settings shell, intent picker, results cards, and watch controls at mobile and desktop widths for overflow, overlap, safe-area, and text truncation issues.
- Reduce unnecessary renders and expensive visual effects in changed areas; stabilize callback dependencies and cached search/results behavior.
- Validate with focused tests plus Playwright flows for seek/skip tracking signals, intent keyboard navigation, resume navigation, settings interaction, and representative mobile/desktop screenshots.
- Confirm current preview build/runtime logs are clean and add complete route metadata where touched.

## Technical notes
- No schema change is expected; current `watch_history.effective_seconds` remains the analytics source of truth.
- Playback position (`watch_seconds`/resume `t`) and actual watched duration (`effective_seconds`) will remain intentionally separate.
- Existing dark/light theme choices are preserved; visual work uses semantic design tokens and the current Palenight direction.
