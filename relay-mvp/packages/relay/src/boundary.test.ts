import { describe, expect, it } from "vitest";
import { boundaryCanonicalString, canonicalBoundary, boundaryHasFinitePin } from "./boundary.js";

describe("canonicalBoundary (§0.6.1)", () => {
  it("sorts event_ranges and filter arrays", () => {
    const b = canonicalBoundary({
      event_ranges: [
        { actor: "relay:actor:b", from: "relay:event:2", to: "relay:event:3" },
        { actor: "relay:actor:a", from: "relay:event:0", to: "relay:event:1" }
      ],
      state_scope: { types: ["post", "blog"], actors: ["relay:actor:z", "relay:actor:a"] }
    });
    expect(b.event_ranges![0]!.actor).toBe("relay:actor:a");
    expect(b.state_scope!.actors![0]).toBe("relay:actor:a");
    expect(b.state_scope!.types![0]).toBe("blog");
  });

  it("boundaryCanonicalString is stable", () => {
    const a = boundaryCanonicalString({
      event_ranges: [{ actor: "relay:actor:x", from: "relay:event:a", to: "relay:event:b" }]
    });
    const b = boundaryCanonicalString({
      event_ranges: [{ actor: "relay:actor:x", from: "relay:event:a", to: "relay:event:b" }]
    });
    expect(a).toBe(b);
  });

  it("finite pin detection", () => {
    expect(boundaryHasFinitePin({ event_ranges: [{ actor: "a", from: "f", to: "t" }] })).toBe(true);
    expect(boundaryHasFinitePin({ state_scope: { types: ["post"] } })).toBe(false);
  });
});
