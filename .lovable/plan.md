# Intent-first UX, settings, resume, and relevance pass

## Goal
Make ZenTube feel calm, purposeful, and reliable across desktop and mobile while preserving the current dark theme and non-addictive product model.

## What will change

### 1. Rebuild Settings around user intent
- Replace the current utility-style tab list with a scalable information architecture: **Profile**, **Intent & discovery**, **Focus & wellbeing**, **Appearance & accessibility**, **Privacy & data**, and **Support**.
- Keep advanced API configuration and issue reports discoverable without giving them equal weight to everyday preferences.
- Use a responsive sidebar on desktop and a compact, horizontally scrollable section selector on mobile.
- Preserve all existing saved preferences and actions; reorganize and relabel them rather than removing working controls.

### 2. Modernize the intent modal
- Use the accessible dialog primitive with focus trapping, Escape handling, labelled title/description, and reliable keyboard selection.
- Present the four intents as clear, touch-friendly choices with concise outcomes and a calm animated selection state.
- Make the action area stack safely on narrow phones and remain compact on desktop.

### 3. Make resume navigation persistent
- Keep the current-video resume action visible on every non-player route, including Insights, Library, Notes, Settings, Results, and Home.
- Strengthen local persistence/event synchronization and show the video title plus saved playback position where space permits.
- Place it in a stable desktop header slot and above the mobile tab bar without obscuring page content.

### 4. Improve search relevance without addictive browsing
- Normalize query tokens and score title phrase match, token coverage, channel match, selected refinements, duration fit, freshness intent, and trustworthy engagement signals.
- Add mode-specific quality signals and penalties for weak/off-topic, Shorts, compilation/clickbait, or mismatched-duration results.
- Preserve the deliberately small result set and explicit “Show new results” interaction—no infinite scroll or autoplay.
- Keep a relevance-safe fallback so valid broad queries do not incorrectly return an empty state.

### 5. Add restrained motion and responsive polish
- Add lightweight entrance, selection, hover, and resume-chip animations using CSS transforms/opacity only.
- Respect `prefers-reduced-motion` and avoid costly always-running blur/animation effects.
- Audit the changed surfaces at mobile and desktop widths for clipping, overlap, touch targets, and stable header/navigation alignment.

## Technical details
- Reuse existing semantic color tokens and shadcn/Radix components.
- Avoid new backend schema changes; settings continue using the existing preference/profile records and local browser preferences.
- Validate with the build signal plus browser checks of the modal, Settings navigation, search results, and resume link at desktop and mobile viewports.
