/**
 * k6 load smoke: public reads (no auth). Install k6: https://k6.io/docs/getting-started/installation/
 * Run: k6 run --vus 2 --duration 10s load/k6-smoke.js
 *   ORIGIN_URL=http://127.0.0.1:3001 k6 run load/k6-smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const base = __ENV.ORIGIN_URL || "http://127.0.0.1:3001";

export const options = {
  vus: Number(__ENV.K6_VUS || 2),
  duration: __ENV.K6_DURATION || "15s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  const r1 = http.get(`${base}/health`);
  check(r1, { "health 200": (r) => r.status === 200 });
  const r2 = http.get(`${base}/actors`);
  check(r2, { "actors 200": (r) => r.status === 200 });
  sleep(0.3);
}
