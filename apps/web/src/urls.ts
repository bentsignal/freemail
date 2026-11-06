import { createUrls } from "@freemail/config/urls";

import { env } from "~/env";

export const urls = createUrls({
  nodeEnv: env.VITE_NODE_ENV,
});
