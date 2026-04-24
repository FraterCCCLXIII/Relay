import { describe, expect, it } from "vitest";
import { isUserLikingTarget, likeCountForTarget, SOCIAL_LIKE, SOCIAL_UNLIKE, targetStateIdFromLikeEvent } from "./social.js";
import type { RelayEventV1 } from "./types.js";

function ev(
  type: string,
  data: Record<string, unknown>,
  id: string,
  actor: string
): RelayEventV1 {
  return {
    actor,
    content_class: "durable_public",
    data,
    id,
    prev: null,
    sig: "00",
    storage_class: "log",
    ts: "2026-01-01T00:00:00.000Z",
    type
  };
}

describe("social like semantics", () => {
  it("toggles on like/unlike order", () => {
    const target = "relay:state:post1";
    const log: RelayEventV1[] = [
      ev(SOCIAL_LIKE, { target_state_id: target }, "a", "alice"),
      ev(SOCIAL_UNLIKE, { target_state_id: target }, "b", "alice"),
      ev(SOCIAL_LIKE, { target_state_id: target }, "c", "alice")
    ];
    expect(isUserLikingTarget(log, target)).toBe(true);
  });

  it("unlike at end is false", () => {
    const target = "relay:state:post1";
    const log: RelayEventV1[] = [
      ev(SOCIAL_LIKE, { target_state_id: target }, "a", "alice"),
      ev(SOCIAL_UNLIKE, { target_state_id: target }, "b", "alice")
    ];
    expect(isUserLikingTarget(log, target)).toBe(false);
  });

  it("likeCountForTarget aggregates", () => {
    const t = "relay:state:x";
    const logs = new Map<string, RelayEventV1[]>([
      ["a", [ev(SOCIAL_LIKE, { target_state_id: t }, "1", "a")]],
      ["b", [ev(SOCIAL_LIKE, { target_state_id: t }, "2", "b")]],
      ["c", [ev(SOCIAL_UNLIKE, { target_state_id: t }, "3", "c")]]
    ]);
    expect(likeCountForTarget(["a", "b", "c"], t, (x) => logs.get(x) ?? [])).toBe(2);
  });

  it("targetStateIdFromLikeEvent", () => {
    const e = ev(SOCIAL_LIKE, { target_state_id: "relay:state:z" }, "1", "a");
    expect(targetStateIdFromLikeEvent(e)).toBe("relay:state:z");
  });
});
