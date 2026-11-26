import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { writeNewTokenFile } from "./token-file.ts";

const token = `rodge_agent_${"b".repeat(43)}`;

async function tempPath() {
  return join(await mkdtemp(join(tmpdir(), "freemail-token-")), "token");
}

describe("token file", () => {
  it("writes the token only to a new private file", async () => {
    const path = await tempPath();
    const created = await writeNewTokenFile(path, () =>
      Promise.resolve({ credentialId: "c1", token }),
    );

    expect(created).toEqual({ credentialId: "c1", tokenFile: path });
    expect(JSON.stringify(created)).not.toContain(token);
    expect(await readFile(path, "utf8")).toBe(`${token}\n`);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("refuses an existing file before issuing a token", async () => {
    const path = await tempPath();
    await writeFile(path, "keep me");
    let issued = false;

    await expect(
      writeNewTokenFile(path, () => {
        issued = true;
        return Promise.resolve({ token });
      }),
    ).rejects.toThrow();
    expect(issued).toBe(false);
    expect(await readFile(path, "utf8")).toBe("keep me");
  });

  it("removes the file when issuing fails", async () => {
    const path = await tempPath();

    await expect(
      writeNewTokenFile(path, () => Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");
    await expect(stat(path)).rejects.toThrow();
  });
});
