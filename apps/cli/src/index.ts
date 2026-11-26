#!/usr/bin/env -S node --experimental-strip-types
import { ConvexError } from "convex/values";

import { main } from "./main.ts";

try {
  await main(process.argv.slice(2));
} catch (error) {
  const message =
    error instanceof ConvexError
      ? String(error.data)
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`freemail: ${message}\n`);
  process.exitCode = 1;
}
