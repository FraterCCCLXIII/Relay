import type { IndexerPolicy, IndexerSources } from "@relay-mvp/protocol";

export class IndexerClient {
  constructor(private readonly baseUrl: string) {}

  async getPolicy(): Promise<IndexerPolicy> {
    const r = await fetch(`${this.baseUrl}/indexer/policy`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async getSources(actorId: string): Promise<IndexerSources> {
    const r = await fetch(`${this.baseUrl}/indexer/sources?actor_id=${encodeURIComponent(actorId)}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async explain(): Promise<unknown> {
    const r = await fetch(`${this.baseUrl}/indexer/explain`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
}
