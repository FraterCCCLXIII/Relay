import "dotenv/config";
import { createIndexerApp } from "./app.js";

const app = createIndexerApp();
const PORT = Number(process.env.INDEXER_PORT ?? 3003);

app.listen(PORT, () => {
  console.log(`Indexer listening on http://127.0.0.1:${PORT}`);
});
