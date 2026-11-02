import { describe, expect, it } from "vitest";

import { getMessageJumpOffset } from "./message-jump-offset";

const layout = {
  contentHeight: 3_000,
  messageY: 1_000,
  topInset: 100,
  viewportHeight: 800,
};

describe("getMessageJumpOffset", () => {
  it("puts the message just below the header", () => {
    expect(getMessageJumpOffset(layout)).toBe(884);
  });

  it("stops at the end of the content", () => {
    expect(getMessageJumpOffset({ ...layout, contentHeight: 1_500 })).toBe(700);
  });

  it("stays at rest when everything fits on screen", () => {
    expect(
      getMessageJumpOffset({ ...layout, contentHeight: 600, messageY: 300 }),
    ).toBe(-100);
  });
});
