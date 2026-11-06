import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@freemail/eslint-config/base";
import { createStrictSyntax } from "@freemail/eslint-config/syntax";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  strictConfig,
  createStrictSyntax({ ts: true }),
);
