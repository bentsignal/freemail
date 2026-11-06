import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@freemail/eslint-config/base";
import { reactConfig } from "@freemail/eslint-config/react";
import { createStrictSyntax } from "@freemail/eslint-config/syntax";

export default defineConfig(
  {
    ignores: [".expo/**", "expo-plugins/**"],
  },
  baseConfig,
  reactConfig,
  strictConfig,
  createStrictSyntax({ ts: true, react: true, mobile: true }),
);
