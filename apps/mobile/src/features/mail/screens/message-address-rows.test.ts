import { describe, expect, it } from "vitest";

import { getMessageAddressRows } from "./message-address-rows";

const from = { address: "orders@harbor.example", name: "Harbor Outfitters" };
const alex = { address: "alex@example.com", name: "Alex Rivera" };
const sam = { address: "sam@example.com", name: "Sam Park" };

describe("getMessageAddressRows", () => {
  it("lists the sender and recipients, leaving out empty rows", () => {
    expect(getMessageAddressRows({ cc: [], from, to: [alex] })).toEqual([
      { addresses: [from], label: "From" },
      { addresses: [alex], label: "To" },
    ]);
  });

  it("keeps Cc after To", () => {
    expect(
      getMessageAddressRows({ cc: [sam], from, to: [alex] }).map(
        (row) => row.label,
      ),
    ).toEqual(["From", "To", "Cc"]);
  });

  it("still shows the sender when there are no visible recipients", () => {
    expect(getMessageAddressRows({ cc: [], from, to: [] })).toEqual([
      { addresses: [from], label: "From" },
    ]);
  });

  it("shows a Reply-To that goes somewhere other than the sender", () => {
    const replyTo = [{ address: "support@other.example", name: "Support" }];
    expect(
      getMessageAddressRows({ cc: [], from, replyTo, to: [alex] }),
    ).toContainEqual({ addresses: replyTo, label: "Reply-To" });
  });

  it("hides a Reply-To that only repeats the sender, ignoring case", () => {
    const replyTo = [{ address: "ORDERS@harbor.example", name: "Orders" }];
    expect(
      getMessageAddressRows({ cc: [], from, replyTo, to: [alex] }).map(
        (row) => row.label,
      ),
    ).toEqual(["From", "To"]);
  });

  it("keeps the whole Reply-To when any address differs from the sender", () => {
    const replyTo = [from, sam];
    expect(
      getMessageAddressRows({ cc: [], from, replyTo, to: [alex] }),
    ).toContainEqual({ addresses: replyTo, label: "Reply-To" });
  });
});
