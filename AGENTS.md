# Apollo Delta

A Reddit client inspired by the iOS app Apollo (and the community's Apollo Reborn tweak), for macOS
and Windows; Android next. Bootstrapped from WatchList (~/WatchList): same Expo SDK 58 + Electron 45
stack, updater and release tooling.

## Architecture decisions

- One Expo / React Native codebase. Desktop = `expo export --platform web` wrapped in Electron
  (`desktop/`, plain CommonJS, served over `app://`). Navigation: `@react-navigation/native-stack`
  (`src/nav.ts`); tabs (Posts, Inbox, Account, Search, Settings) are a `useTab` store.
- **No Reddit API key** (Apollo Reborn's "API-Key-Free Mode"): you sign in on reddit.com in a
  window with its own cookie store per account (`desktop/reddit.cjs`, partition `persist:reddit-<id>`);
  requests go from the main process with that session's cookies and a browser User-Agent; writes
  carry the session's modhash (`X-Modhash` + `uh`). Signed-out JSON is blocked by Reddit (403 block
  page), so sign-in is required.
- Sign in with Google (`desktop/browser-signin.cjs`, user's request 2026-11-19): Google refuses
  embedded windows ("This browser or app may not be secure", tested) and also any Chrome with a
  DevTools port open (navigator.webdriver). So: plain Chrome/Edge/Brave with a fresh
  `--user-data-dir` on reddit.com/login (`--app`), poll its Cookies file for the plain-text name
  `reddit_session` (only set when signed in; Chrome flushes ~30s), kill it, relaunch `--headless=new
  --remote-debugging-port=0` on the same profile, `Storage.getCookies`, import into the account's
  partition, verify with /api/me.json. The profile is kept (so Reddit skips its captcha and Google
  remembers you); Reddit's session cookies are deleted from its SQLite DB (node:sqlite, browser
  closed) before and after each sign-in; Preferences are pre-written to silence Chrome's prompts.
  An "official" Google sign-in isn't possible: Reddit only accepts Google sign-ins for its own
  Google client, and using that client would be impersonating Reddit.
- Settings follow the account (`src/lib/profiles.ts`, user's request): `profiles[accountId]` holds
  settings, favorites, saved categories, recently read/visited, searches ("device" when signed out);
  top-level store fields are the active profile. Updater and route settings are device-wide.
- Routes (`src/lib/reddit/routes.ts`): some paths are blocked on www for web sessions but served by
  oauth/old/api with the same cookie (hot/new/rising, r/all, search, /api/info, morechildren). Each
  pattern lists hosts in order; a block page tries the next; 3 in a row cools a host down. `routes.json`
  in this repo overrides the table without a release (fetched every 15 min).
- Shared vote/save state: `src/lib/things.ts` (patches by fullname, optimistic).
- App data: one JSON document (`src/lib/store.ts`): settings, favorites, saved categories, recently
  read, visits (New Comments Highlightifier), filters. Feeds cached via `cache:*` IPC.
- Rendering Reddit's body_html: `src/ui/htmlParse.ts` + `src/ui/Html.tsx` (own renderer, same on all platforms).
- Video: hls.js on desktop (`src/ui/Video.web.tsx`); phones get a native player with the Android app.
- Icon: an original mascot (rounded-delta robot with a ring) in `assets/src/icon.svg`; alternate
  colourways in `src/ui/AppIcon.tsx` (desktop sets the dock icon). Render: `npm run icons`.
- Phones: `src/lib/reddit/mobile.ts` is a stub until the Android app (WebView sign-in; RN fetch
  shares the WebView's CookieManager on Android).

## Before finishing a change

`npm run typecheck`, `npm test`, and for UI changes rebuild (`node scripts/desktop.mjs`) and take
screenshots: in desktop/, `DELTA_SHOTS=<dir> DELTA_SHOT_STEPS="name:click text|@aria-label|!js,…"
./node_modules/.bin/electron . --user-data-dir=<scratch>`.
