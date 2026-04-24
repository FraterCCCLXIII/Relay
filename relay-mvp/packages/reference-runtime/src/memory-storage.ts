import type { RelayEventV1, RelaySnapshotV1, RelayStateV1 } from "@relay-mvp/relay";
import type { ReferenceStorage } from "./storage.js";

export class MemoryStorage implements ReferenceStorage {
  private readonly publicKeys = new Map<string, Uint8Array>();
  private readonly events = new Map<string, RelayEventV1>();
  private readonly heads = new Map<string, string | null>();
  private readonly states = new Map<string, RelayStateV1>();
  private readonly snapshots = new Map<string, { meta: RelaySnapshotV1; members: RelayStateV1[] }>();

  registerPublicKey(actorId: string, publicKey: Uint8Array): void {
    this.publicKeys.set(actorId, publicKey);
  }

  getPublicKey(actorId: string): Uint8Array | undefined {
    return this.publicKeys.get(actorId);
  }

  listRegisteredActorIds(): string[] {
    return [...this.publicKeys.keys()].sort();
  }

  putEvent(ev: RelayEventV1): void {
    this.events.set(ev.id, ev);
  }

  getEvent(id: string): RelayEventV1 | undefined {
    return this.events.get(id);
  }

  listAllEvents(): RelayEventV1[] {
    return [...this.events.values()];
  }

  listEventsByActor(actor: string): RelayEventV1[] {
    return [...this.events.values()].filter((e) => e.actor === actor);
  }

  getActorHead(actor: string): string | null {
    return this.heads.get(actor) ?? null;
  }

  setActorHead(actor: string, head: string | null): void {
    this.heads.set(actor, head);
  }

  putState(st: RelayStateV1): void {
    this.states.set(st.id, st);
  }

  getState(id: string): RelayStateV1 | undefined {
    return this.states.get(id);
  }

  allStateIds(): string[] {
    return [...this.states.keys()];
  }

  putSnapshot(meta: RelaySnapshotV1, memberStates: RelayStateV1[]): void {
    this.snapshots.set(meta.id, { meta, members: [...memberStates] });
  }

  getSnapshot(id: string): { meta: RelaySnapshotV1; members: RelayStateV1[] } | undefined {
    return this.snapshots.get(id);
  }
}
