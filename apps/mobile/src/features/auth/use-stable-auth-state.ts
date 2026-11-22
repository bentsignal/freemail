import { useState } from "react";
import { useConvexAuth } from "convex/react";

interface AuthSnapshot {
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * `launchedSignedIn`: the app opened with a session on the device, so it
 * shows the signed-in app before the server confirms it, and the first
 * queries go out with the token instead of after the server's answer. A
 * session the server turns down signs the app out as before.
 *
 * `hasDeviceSession`: better-auth's expo plugin drops the device's session
 * the moment signing out starts, so the signed-in app (and every query in
 * it) goes away before Convex clears its auth. Otherwise those queries ran
 * unauthenticated for a moment and threw.
 */
export function useStableAuthState({
  hasDeviceSession,
  launchedSignedIn,
}: {
  hasDeviceSession: boolean;
  launchedSignedIn: boolean;
}) {
  const auth = useConvexAuth();
  const [lastResolved, setLastResolved] = useState<boolean | undefined>(() =>
    auth.isLoading ? initialAuthState(launchedSignedIn) : auth.isAuthenticated,
  );

  if (!auth.isLoading && lastResolved !== auth.isAuthenticated) {
    setLastResolved(auth.isAuthenticated);
  }

  return {
    isAuthenticated: isSignedIn(lastResolved, hasDeviceSession),
    isInitialLoading: lastResolved === undefined,
  };
}

export function isSignedIn(
  lastResolved: boolean | undefined,
  hasDeviceSession: boolean,
) {
  return (lastResolved ?? false) && hasDeviceSession;
}

export function initialAuthState(launchedSignedIn: boolean) {
  return launchedSignedIn ? true : undefined;
}

export function resolveStableAuthState(
  auth: AuthSnapshot,
  lastResolved: boolean | undefined,
) {
  const resolved = auth.isLoading ? lastResolved : auth.isAuthenticated;
  return {
    isAuthenticated: resolved ?? false,
    isInitialLoading: resolved === undefined,
    lastResolved: resolved,
  };
}
