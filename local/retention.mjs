// Runs the daily retention job once against the local environment (start it first with `npm start`).
//   npm run retention                      → uses RETENTION_DAYS=90
//   RETENTION_DAYS=0 npm run retention     → deletes every submitted request (handy for testing)
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54329/goformosaic";
process.env.STORAGE_CONNECTION_STRING ??=
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

const dist = path.join(root, "functions", "dist", "src");
const { retentionCleanup } = await import(path.join(dist, "functions", "retentionCleanup.js"));
const { db } = await import(path.join(dist, "lib", "db.js"));
await retentionCleanup({}, { log: console.log, error: console.error });
await db().end();
