// What each query a cold open runs costs on this worktree's isolated
// backend: documents and bytes read, bytes returned, and execution time,
// from the function logs. Runs each query once as the test owner. Convex
// caches results until something they read changes, so measure right after
// `scripts/backend.sh push` (or `seed`), when nothing is cached; a cached
// run reads nothing and says so. Times right after a push include loading
// each module.
//
//   node scripts/query-cost.mjs            (scripts/backend.sh isolate first)
//
// Never point it at production: it refuses anything but an isolated backend.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const convexDir = `${root}/services/convex`;
let state = "";
try {
  state = readFileSync(`${root}/.cache/backend/isolated`, "utf8");
} catch {
  // No isolated backend.
}
const deployment = /^DEPLOYMENT=(.+)$/mu.exec(state)?.[1];
if (
  !deployment ||
  /colorful-ostrich-734|dazzling-dog-633|tidy-emu-857/u.test(deployment)
) {
  console.error("no isolated backend; run scripts/backend.sh isolate");
  process.exit(1);
}

function convex(...args) {
  return execFileSync("npx", ["convex", ...args], {
    cwd: convexDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

const owner = convex("env", "get", "AUTH_ALLOWED_USER_ID");
const identity = JSON.stringify({ subject: owner });
const page = { paginationOpts: { cursor: null, numItems: 30 } };
const queries = [
  ["mail/queries:listInbox", page],
  ["accounts/queries:list", {}],
  ["mail/queries:getUnreadCounts", {}],
  ["notifications/queries:getPreferences", {}],
  ["notifications/queries:listAccountPreferences", {}],
  ["outbox/queries:listUnsent", {}],
];

const events = [];
const logs = spawn("npx", ["convex", "logs", "--jsonl", "--success"], {
  cwd: convexDir,
  stdio: ["ignore", "pipe", "ignore"],
});
createInterface({ input: logs.stdout }).on("line", (line) => {
  if (line.startsWith("{")) events.push(JSON.parse(line));
});
await new Promise((resolve) => setTimeout(resolve, 5000));

const rows = [];
for (const [name, args] of queries) {
  const before = events.length;
  const result = JSON.parse(
    convex("run", name, JSON.stringify(args), "--identity", identity),
  );
  let event;
  for (let wait = 0; wait < 40 && !event; wait++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    event = events
      .slice(before)
      .find((e) => e.kind === "Completion" && e.identifier === name);
  }
  const usage = event?.usageStats ?? {};
  rows.push({
    query: name,
    rows: Array.isArray(result?.page) ? result.page.length : undefined,
    documents: usage.databaseReadDocuments,
    readKB: Math.round((usage.databaseReadBytes ?? 0) / 102.4) / 10,
    returnedKB: Math.round((event?.returnBytes ?? 0) / 102.4) / 10,
    ms: event ? Math.round(event.executionTime * 1000) : undefined,
    cached: event?.cachedResult,
  });
}
logs.kill();
console.table(rows);
