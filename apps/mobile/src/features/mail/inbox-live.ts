import { useSyncExternalStore } from "react";

let isLive = false;
const listeners = new Set<() => void>();

/**
 * Whether the inbox's first live page has arrived this launch. Queries that
 * don't draw the inbox wait for it, so a cold open's first answer from the
 * server carries only what the inbox shows.
 */
export function useInboxIsLive() {
  return useSyncExternalStore(subscribe, () => isLive);
}

export function markInboxLive() {
  if (isLive) return;
  isLive = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
