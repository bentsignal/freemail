// Development and profile bundles only: how long a cold open takes to reach
// the inbox, for measuring it (`scripts/sim.sh timings`, docs/data-loading.md).
// Imported first by the entry, so times count from the JavaScript bundle
// starting. Requests are the app's HTTP calls (auth) with when they started
// and how long they took.

import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

const measuring =
  __DEV__ || process.env.EXPO_PUBLIC_FREEMAIL_PROFILE_BUNDLE === "1";
const bundleStart = performance.now();
const bundleStartedAt = Date.now();
const marks = new Map<string, number>();
const requests = new Array<{ ms: number; path: string; start: number }>();
const socket = new Array<{ at: number; message: string }>();
const stalls = new Array<{ at: number; ms: number }>();
const uiStalls = new Array<{ at: number; ms: number }>();

function sinceStart() {
  return Math.round(performance.now() - bundleStart);
}

/** The first time something happened on this launch. */
export function markStartup(name: string, ...conditions: boolean[]) {
  if (!measuring || marks.has(name) || !conditions.every(Boolean)) return;
  marks.set(name, sinceStart());
}

export function startupTimings() {
  return {
    bundleStartedAt,
    marks: Object.fromEntries([...marks].sort((a, b) => a[1] - b[1])),
    requests,
    socket,
    stalls,
    uiStalls,
  };
}

function timeRequests() {
  const fetchRequest = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const start = sinceStart();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    function record() {
      requests.push({
        ms: sinceStart() - start,
        path: url.replace(/^https?:\/\/[^/]+/u, "").split("?")[0] ?? url,
        start,
      });
    }
    return await fetchRequest(input, init).then(
      (response) => {
        record();
        return response;
      },
      (error: unknown) => {
        record();
        throw error;
      },
    );
  };
}

/** The Convex websocket's first messages each way, by type. */
function timeSocket() {
  const Socket = globalThis.WebSocket;
  function describe(direction: string, data: unknown) {
    if (socket.length >= 40) return;
    let type = String(typeof data);
    if (typeof data === "string") {
      const match = /"type":"([A-Za-z]+)"/u.exec(data);
      type = `${match?.[1] ?? "?"} ${data.length}B`;
    }
    socket.push({ at: sinceStart(), message: `${direction} ${type}` });
  }
  class TimedSocket extends Socket {
    constructor(...args: ConstructorParameters<typeof WebSocket>) {
      super(...args);
      socket.push({ at: sinceStart(), message: "connect" });
      this.addEventListener("open", () =>
        socket.push({ at: sinceStart(), message: "open" }),
      );
      this.addEventListener("message", (event) => describe("in", event.data));
    }
    send(data: Parameters<WebSocket["send"]>[0]) {
      describe("out", data);
      super.send(data);
    }
  }
  globalThis.WebSocket = TimedSocket;
}

/** When the JavaScript thread was busy for 50 ms or more, in the first 4 s. */
function timeStalls() {
  let last = sinceStart();
  const timer = setInterval(() => {
    const now = sinceStart();
    if (now - last >= 50) stalls.push({ at: last, ms: now - last });
    last = now;
    if (now > 4000) clearInterval(timer);
  }, 10);
}

function addUiStall(at: number, ms: number) {
  uiStalls.push({ at: at - bundleStartedAt, ms });
}

/**
 * When the UI thread (the main thread on iOS, where React Native mounts
 * views and runs its websocket) skipped frames for 50 ms or more.
 */
function timeUiStalls() {
  scheduleOnUI(() => {
    "worklet";
    let last = Date.now();
    const end = last + 4000;
    function tick() {
      "worklet";
      const now = Date.now();
      if (now - last >= 50) scheduleOnRN(addUiStall, last, now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

if (measuring) {
  timeRequests();
  timeSocket();
  timeStalls();
  timeUiStalls();
}
