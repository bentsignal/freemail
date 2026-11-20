import {
  convexCloudUrl as overrideConvexCloudUrl,
  convexSiteUrl as overrideConvexSiteUrl,
  worktreeId as overrideWorktreeId,
} from "./overrides";
import { normalizeWorktreeId } from "./worktrees";

/** Shawn's mail: mail.rodgers.dev and both iPhone apps. */
export const PRODUCTION_CONVEX = {
  cloud: "https://colorful-ostrich-734.convex.cloud",
  site: "https://colorful-ostrich-734.convex.site",
} as const;

/** Local development (`convex dev`); a fake owner, never real mail. */
export const DEVELOPMENT_CONVEX = {
  cloud: "https://tidy-emu-857.convex.cloud",
  site: "https://tidy-emu-857.convex.site",
} as const;

export const PRODUCTION_WEB_URL = "https://mail.rodgers.dev";

interface UrlOptions {
  nodeEnv?: "development" | "production" | "test";
  worktreeId?: string;
}

function webUrl(options: { effectiveWorktreeId?: string }) {
  const prefix = normalizeWorktreeId(options.effectiveWorktreeId);
  const host = [prefix, "www.freemail", "local"].filter(Boolean).join(".");
  return `https://${host}`;
}

function convexUrls(nodeEnv: UrlOptions["nodeEnv"]) {
  const base =
    nodeEnv === "production" ? PRODUCTION_CONVEX : DEVELOPMENT_CONVEX;
  return {
    cloud: overrideConvexCloudUrl ?? base.cloud,
    site: overrideConvexSiteUrl ?? base.site,
  };
}

export function createUrls(options: UrlOptions = {}) {
  if (options.nodeEnv === "production") {
    return { web: PRODUCTION_WEB_URL, convex: convexUrls("production") };
  }
  const effectiveWorktreeId = options.worktreeId ?? overrideWorktreeId;
  return {
    web: webUrl({ effectiveWorktreeId }),
    convex: convexUrls(options.nodeEnv),
  };
}
