import { describe, expect, it } from "vitest";

import { gatewayModelId, gatewayRequestBody } from "./gateway";

describe("AI Gateway requests", () => {
  it("addresses bare model names as OpenAI models", () => {
    expect(gatewayModelId("gpt-5-nano")).toBe("openai/gpt-5-nano");
    expect(gatewayModelId("text-embedding-3-small")).toBe(
      "openai/text-embedding-3-small",
    );
  });

  it("keeps model ids that already name a provider", () => {
    expect(gatewayModelId("openai/gpt-5-mini")).toBe("openai/gpt-5-mini");
  });

  it("requires zero-data-retention endpoints", () => {
    expect(gatewayRequestBody({ model: "openai/gpt-5-nano" })).toEqual({
      model: "openai/gpt-5-nano",
      provider: { zdr: true },
    });
  });
});
