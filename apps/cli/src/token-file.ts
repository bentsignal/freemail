import { open, unlink } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Creates the token file before the token exists, so a path that's taken
 * fails before anything is issued, and writes the token only into it.
 */
export async function writeNewTokenFile(
  path: string,
  issue: () => Promise<{ token: string }>,
) {
  const absolute = resolve(path);
  const handle = await open(absolute, "wx", 0o600);
  let written = false;
  try {
    const issued = await issue();
    await handle.writeFile(`${issued.token}\n`, "utf8");
    written = true;
    const { token: _token, ...rest } = issued;
    return { ...rest, tokenFile: absolute };
  } finally {
    await handle.close();
    if (!written) await unlink(absolute).catch(() => undefined);
  }
}
