import { createApp } from "./createApp.js";

const port = Number(process.env.ORIGIN_PORT ?? 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`Origin listening on http://127.0.0.1:${port}`);
});
