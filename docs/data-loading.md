# Data loading: opening the app to the inbox

How Freemail gets from a cold open to mail on screen, what each step
costs, and how to measure it. From the data pass of 2026-11 (modelled on
Vera's, `/Users/shawn/dev/vera/.plans/data-pass.md`).

## What a cold open does

1. **The JavaScript bundle runs.** Every module the app imports is
   evaluated before the first render, which on a release build is Hermes
   bytecode and in a profile bundle is minified JavaScript.
2. **The app decides it's signed in, from the device.** If better-auth's
   expo plugin has an unexpired session saved, or a saved Convex token is
   still valid, the app draws the signed-in app at once
   (`launchedSignedIn`, `features/auth/client.ts`). The server's answer
   corrects it: a session it turns down signs the app out as before.
3. **The inbox draws from the copy saved on the device**
   (`features/mail/saved-inbox.ts`): the unified inbox's first page and the
   accounts, as the app last showed them. It's written as the app leaves
   the screen and deleted on signing out.
4. **The websocket authenticates with the saved token**
   (`features/auth/saved-token.ts`), with no token request first, and the
   first queries go out with it in one message: only `listInbox` and
   `accounts:list`. Convex answers a batch of new queries together, so
   everything else waits for the inbox's live page (`inbox-live.ts`): the
   unread count behind Mark All as Read and the notification preferences.
5. **The live page replaces the saved one** in one update.

The other tabs (New, Settings, Search) render when first selected, or a
few seconds after launch (`components/deferred-tab.tsx`). Native tabs
otherwise render every tab at launch.

### Two things to know on iOS

- **React Native's websocket runs on the main thread**
  (`RCTWebSocketModule.mm`: `methodQueue` is the main queue). While the
  main thread mounts the first screen's views, the socket's open, sends,
  and incoming messages wait. Anything that mounts at launch delays the
  first live answer, which is why the other tabs wait.
- **Convex answers a `ModifyQuerySet` in one `Transition`**: the slowest
  query in the first batch, including loading its module on a cold
  backend, sets when the inbox gets its answer.

## Measuring

All on an isolated backend (`scripts/backend.sh isolate`, then
`scripts/backend.sh seed 200`): four accounts and 252 messages; the inbox's
first page of 30 threads shows 26 rows (the rest are spam).

**Opening, in the simulator, in a production bundle:**

```sh
FREEMAIL_METRO_PROFILE=1 scripts/sim.sh up   # minified, no React dev checks
scripts/sim.sh signin
scripts/sim.sh timings                       # this launch, in ms from the bundle starting
```

`timings` (`features/dev/startup-timing.ts`, dev and profile bundles only)
reports:

- `marks`: `rootRender` (modules evaluated), `appReady`, `authKnown`,
  `inboxShown` (the inbox's rows laid out in JavaScript), `socketOpen`,
  `serverAuthed`, `inboxLive` (the live page arrived).
- `requests`: the app's HTTP calls (auth), when they started and how long
  they took.
- `socket`: the websocket's first messages each way, by type and size.
- `stalls` and `uiStalls`: when the JavaScript thread and the UI (main)
  thread were busy for 50 ms or more. The rows are on screen when the UI
  stall after `inboxShown` ends.

A cold launch for the saved inbox has to send the app to the background
first, as leaving the screen is when it saves:

```sh
xcrun simctl launch <udid> com.apple.Preferences; sleep 2; scripts/sim.sh relaunch
```

**Server cost per query:** `node scripts/query-cost.mjs` runs each query a
cold open runs, once, as the test owner, and reads documents and bytes
from the function logs. Run it right after `scripts/backend.sh push`, when
nothing is cached.

## Results

iOS simulator (iPhone, Freemail Dev with a production bundle), ms from the
JavaScript bundle starting. "On screen" is when the UI thread finishes
mounting the inbox's rows; "live" is the live page arriving.

**Warm backend** (launches seconds apart), five launches each:

|                            | Before (main)         | After                 |
| -------------------------- | --------------------- | --------------------- |
| First render               | 532–550               | 348–352               |
| Inbox on screen            | 1,481–1,530           | 948–970 (saved)       |
| Live inbox                 | 1,037–1,090           | 1,015–1,058           |
| Token requests             | 2                     | 0 (saved token)       |
| Authenticate messages      | 2 (every query reran) | 1                     |
| Queries in the first batch | 5, answered in 48 KB  | 2, answered in 26 KB  |

Without a saved inbox (the first open after signing in), the after build
gets the live inbox at 612–839 and has it on screen at 958–1,176. With a
warm backend and fast Wi-Fi the saved inbox gains little on screen and
delays the live page (mounting its rows holds the main thread the socket
needs); it pays off when the server is slow to answer, as below.

**Cold backend** (nothing for 15 minutes, so the saved token has expired
and the auth routes start cold):

|                 | Before (main) | After |
| --------------- | ------------- | ----- |
| Inbox on screen | 2,248         | 869 (saved) |
| Live inbox      | 1,842         | 1,368 |

After 15 minutes the token request is most of the wait for live data (723
ms, 623 of it the auth HTTP action starting cold). See "Left as they are".

**Server, one run of each query** (`scripts/query-cost.mjs`, nothing
cached, the same mailbox):

| Query                     | Before                         | After                           |
| ------------------------- | ------------------------------ | ------------------------------- |
| `listInbox` (26 rows)     | 120 docs, 71.6 KB read, 46.6 KB sent | 94 docs, 63.9 KB read, 23.3 KB sent |
| `getUnreadCounts`         | 220 docs, 129.8 KB read        | 112 docs, 62.7 KB read          |
| `accounts:list`           | 4 docs                         | 4 docs                          |

`listInbox` reruns whenever a thread on its page changes, and the unread
count whenever any unread thread does, so the savings repeat with every
new message.

## Left as they are

- **Each inbox row mounts a SwiftUI `Host` with its own `List`** (for
  native swipe actions and edit mode). Mounting the first screen's rows
  holds the main thread for 250–300 ms in the simulator, the largest cost
  left on opening, and it also holds back the websocket (above).
- **Module evaluation takes about 340 ms in a profile bundle** before the
  first render (less with a release build's bytecode). The largest share
  left is better-auth's client and zod (about 220 modules).
- **Convex tokens last 15 minutes.** An open within 15 minutes of the last
  one uses the saved token; later, the app asks for a token first (about
  200 ms against a warm backend). Its time is mostly hidden behind drawing
  the saved inbox, but on a cold backend it loads the auth bundle. Vera
  went to day-long tokens renewed ahead of time; that's a security
  trade-off (a token can't be revoked before it expires) for Shawn to
  decide.
- **List rows still read whole message documents** (headers and search
  text included), though they no longer send them. A row summary kept on
  the thread would make a row one read instead of three.
- **The unread count reads every unread thread.** A count kept per
  account would make it one read.
