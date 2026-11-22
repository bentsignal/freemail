import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useIsFocused } from "expo-router";

/**
 * Native tabs render every tab's screen at launch. A tab other than the
 * first renders its screen when it's first selected, or `afterMs` after
 * launch, whichever comes first, so a cold open draws only the inbox. On iOS
 * React Native's websocket runs on the main thread, so mounting the other
 * tabs at launch also held back the inbox's first answer from the server.
 */
export function DeferredTab({
  afterMs,
  children,
}: {
  afterMs: number;
  children: ReactNode;
}) {
  const isFocused = useIsFocused();
  const [isMounted, setIsMounted] = useState(isFocused);
  if (isFocused && !isMounted) setIsMounted(true);

  // eslint-disable-next-line no-restricted-syntax -- A timer mounts the tab once launch has settled; nothing else marks that moment.
  useEffect(() => {
    if (isMounted) return;
    const timer = setTimeout(() => setIsMounted(true), afterMs);
    return () => clearTimeout(timer);
  }, [afterMs, isMounted]);

  return isMounted ? children : null;
}
