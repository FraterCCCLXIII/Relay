/**
 * Persistence surface for the reference runtime (not part of pure @relay-mvp/relay).
 */
import type { RelayEventV1, RelaySnapshotV1, RelayStateV1 } from "@relay-mvp/relay";

export interface ReferenceStorage {
  putEvent(ev: RelayEventV1): void;
  getEvent(id: string): RelayEventV1 | undefined;
  /** All events for an actor (for fork scan). */
  listEventsByActor(actor: string): RelayEventV1[];

  /** Current head of the actor's append-only chain (single-head API). */
  getActorHead(actor: string): string | null;
  setActorHead(actor: string, head: string | null): void;

  putState(st: RelayStateV1): void;
  getState(id: string): RelayStateV1 | undefined;
  allStateIds(): string[];

  putSnapshot(meta: RelaySnapshotV1, memberStates: RelayStateV1[]): void;
  getSnapshot(id: string): { meta: RelaySnapshotV1; members: RelayStateV1[] } | undefined;
}
