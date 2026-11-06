import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@freemail/eslint-config/base";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  strictConfig,
);
