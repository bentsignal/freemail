import { router } from "expo-router";

import {
  holdComposeHref,
  isMailtoUrl,
  mailtoComposeHref,
} from "~/features/mail/lib/mailto";

export function redirectSystemPath({
  initial,
  path,
}: {
  initial: boolean;
  path: string;
}) {
  if (!isMailtoUrl(path)) return path;
  const href = mailtoComposeHref(path);
  // Compose is behind auth, which hasn't resolved at launch, and nothing
  // would be under the sheet. The inbox opens it once it's on screen.
  if (initial) {
    holdComposeHref(href);
    return "/";
  }
  // Pushing keeps a draft already open underneath the new one.
  router.push(href);
  return null;
}
