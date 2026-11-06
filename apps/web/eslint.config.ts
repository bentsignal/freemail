import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@freemail/eslint-config/base";
import { reactConfig } from "@freemail/eslint-config/react";
import { createStrictSyntax } from "@freemail/eslint-config/syntax";

export default defineConfig(
  {
    ignores: [".tanstack/**", ".output/**", "dist/**", "src/routeTree.gen.ts"],
  },
  baseConfig,
  reactConfig,
  strictConfig,
  createStrictSyntax({ ts: true, react: true, web: true, env: true }),
);
