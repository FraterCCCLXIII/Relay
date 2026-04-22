/**
 * Indexer — §17.9 transparency + read-only aggregation for demo.
 * Same Postgres as origin (MVP); production would consume origin mirrors.
 */
import cors from "cors";
import express from "express";
import type { IndexerPolicy, IndexerSources } from "@relay-mvp/protocol";
import { pool } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.INDEXER_PORT ?? 3003);

app.get("/health", (_req, res) => res.json({ ok: true, role: "indexer" }));

app.get("/indexer/policy", (_req, res) => {
  const body: IndexerPolicy = {
    version: "mvp-0.1",
    description:
      "Demo indexer: home feed merges posts from your actor_id plus actors you follow, ordered by updated_at DESC. No ML ranking.",
    rules: [
      { id: "include-self", description: "Always include requesting actor's own posts.", weight: 1 },
      { id: "include-follows", description: "Include posts from followed actors (follows table).", weight: 1 },
      { id: "order-recency", description: "Sort by state_objects.updated_at descending.", weight: 1 },
      {
        id: "labels-overlay",
        description: "Moderation labels are fetched separately and merged in the client (additive overlay).",
        weight: 0,
      },
    ],
  };
  res.json(body);
});

app.get("/indexer/sources", async (req, res) => {
  const actorId = req.query.actor_id as string | undefined;
  const as_of = new Date().toISOString();
  if (!actorId) {
    const body: IndexerSources = {
      as_of,
      feeds: [{ actor_id: "*", role: "global_seed", note: "Pass ?actor_id= for personalized source list." }],
    };
    return res.json(body);
  }

  const f = await pool.query("SELECT followee_id FROM follows WHERE follower_id = $1", [actorId]);
  const feeds: IndexerSources["feeds"] = [
    { actor_id: actorId, role: "followed", note: "origin: own posts" },
    ...f.rows.map((r) => ({
      actor_id: r.followee_id as string,
      role: "followed" as const,
      note: "origin: follow edge",
    })),
  ];
  res.json({ as_of, feeds } satisfies IndexerSources);
});

/** Machine-readable explanation for transparency demos */
app.get("/indexer/explain", (_req, res) => {
  res.type("application/json").json({
    ranking: "none",
    inputs: ["postgres:state_objects", "postgres:follows", "postgres:channel_refs", "postgres:labels"],
    output: "ordered list of post object_ids + metadata pointers",
    limitations: "This MVP does not crawl remote origins; single deployment only.",
  });
});

app.listen(PORT, () => {
  console.log(`Indexer listening on http://127.0.0.1:${PORT}`);
});
