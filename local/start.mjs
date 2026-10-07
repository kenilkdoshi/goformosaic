// One-command local environment for GoForMosaic (no Docker needed).
//
//   cd local && npm install && npm start          → http://localhost:3000
//   npm start -- --lan                            → also reachable from your phone on the same Wi-Fi
//
// Starts PostgreSQL 16 (embedded) and Azurite (Blob/Queue emulator), applies migrations,
// configures storage, runs the image-compression function against the queue, and starts Next.js.
// Data persists in ../.local/ between runs (`npm run reset` wipes it).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const webDir = path.join(root, "web");
const functionsDir = path.join(root, "functions");
const dataDir = path.join(root, ".local");
const lan = process.argv.includes("--lan");

const PG_PORT = 54329;
const WEB_PORT = 3000;
const ACCOUNT = "devstoreaccount1";
// Azurite's well-known development key (public, local-only).
const ACCOUNT_KEY = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

const log = (msg) => console.log(`\x1b[36m[local]\x1b[0m ${msg}`);

function lanAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  throw new Error("No LAN IPv4 address found — are you connected to Wi-Fi?");
}

const host = lan ? lanAddress() : "localhost";
const storageHost = lan ? host : "127.0.0.1";
const siteUrl = `http://${host}:${WEB_PORT}`;
const blobEndpoint = `http://${storageHost}:10000/${ACCOUNT}`;
const queueEndpoint = `http://${storageHost}:10001/${ACCOUNT}`;

const env = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/goformosaic`,
  STORAGE_ACCOUNT_NAME: ACCOUNT,
  STORAGE_CONNECTION_STRING: `DefaultEndpointsProtocol=http;AccountName=${ACCOUNT};AccountKey=${ACCOUNT_KEY};BlobEndpoint=${blobEndpoint};QueueEndpoint=${queueEndpoint};`,
  STORAGE_BLOB_ENDPOINT: blobEndpoint,
  UPLOADS_CONTAINER: "uploads",
  PROCESSING_QUEUE: "image-processing",
  SITE_URL: siteUrl,
  CORS_ORIGINS: [...new Set([`http://localhost:${WEB_PORT}`, siteUrl])].join(","),
  ALLOWED_DEV_ORIGINS: lan ? host : "",
  ADMIN_DEV_BYPASS: process.env.ADMIN_DEV_BYPASS ?? "true",
  ADMIN_NOTIFY_EMAIL: process.env.ADMIN_NOTIFY_EMAIL ?? "admin@example.com",
};
Object.assign(process.env, env); // the in-process worker reads these too

const children = [];
let pg;
let shuttingDown = false;

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}`);
}

function start(name, cmd, args, cwd, quiet = false) {
  const child = spawn(cmd, args, { cwd, env, stdio: quiet ? "ignore" : "inherit" });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log(`${name} exited (code ${code}) — shutting down`);
      void shutdown(1);
    }
  });
  children.push(child);
  return child;
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Stopping…");
  for (const c of children) c.kill("SIGTERM");
  try {
    await pg?.stop();
  } catch {}
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

async function waitForPort(port, label) {
  const { connect } = await import("node:net");
  for (let i = 0; i < 60; i++) {
    const ok = await new Promise((resolve) => {
      const s = connect(port, "127.0.0.1", () => (s.end(), resolve(true)));
      s.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} didn't start on port ${port}`);
}

async function portInUse(port) {
  const { connect } = await import("node:net");
  return new Promise((resolve) => {
    const s = connect(port, "127.0.0.1", () => (s.end(), resolve(true)));
    s.on("error", () => resolve(false));
  });
}

try {
  const busy = [];
  for (const [port, what] of [[PG_PORT, "PostgreSQL"], [10000, "Azurite"], [WEB_PORT, "Next.js"]]) {
    if (await portInUse(port)) busy.push(`${what} (:${port})`);
  }
  if (busy.length) {
    console.error(`
  Already in use: ${busy.join(", ")}.
  Another copy of the local environment is probably running — open ${siteUrl}
  or stop it (Ctrl+C in its terminal) before starting a new one.
`);
    process.exit(1);
  }

  mkdirSync(dataDir, { recursive: true });

  for (const dir of [webDir, functionsDir]) {
    if (!existsSync(path.join(dir, "node_modules"))) {
      log(`Installing dependencies in ${path.basename(dir)}/ …`);
      run("npm", ["install", "--no-audit", "--no-fund"], dir);
    }
  }

  // 1. PostgreSQL 16
  const pgDir = path.join(dataDir, "pgdata");
  const fresh = !existsSync(pgDir);
  pg = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: "postgres",
    password: "postgres",
    port: PG_PORT,
    persistent: true,
    onLog: () => {},
  });
  if (fresh) {
    log("Initialising PostgreSQL (first run)…");
    await pg.initialise();
  }
  await pg.start();
  if (fresh) await pg.createDatabase("goformosaic");
  log(`PostgreSQL ready on 127.0.0.1:${PG_PORT}`);

  // 2. Azurite
  const azuriteBin = path.join(here, "node_modules", ".bin", "azurite");
  const azDir = path.join(dataDir, "azurite");
  mkdirSync(azDir, { recursive: true });
  start(
    "Azurite",
    azuriteBin,
    ["--location", azDir, "--silent", "--loose", "--skipApiVersionCheck",
      "--blobHost", lan ? "0.0.0.0" : "127.0.0.1", "--queueHost", lan ? "0.0.0.0" : "127.0.0.1",
      "--tableHost", "127.0.0.1"],
    here,
    true,
  );
  await waitForPort(10000, "Azurite blob");
  await waitForPort(10001, "Azurite queue");
  log("Azurite ready (blob :10000, queue :10001)");

  // 3. Schema + storage setup
  // Regenerate the Prisma client every start: `migrate deploy` doesn't, and a stale client
  // rejects any field added to schema.prisma since the last install.
  log("Generating Prisma client and applying database migrations…");
  run("npx", ["prisma", "generate"], webDir);
  run("npx", ["prisma", "migrate", "deploy"], webDir);
  run("node", ["scripts/dev-setup.mjs"], webDir);

  // 4. Compression function (same handler code that runs in Azure, fed from the local queue)
  log("Building compression function…");
  run("npm", ["run", "build", "--silent"], functionsDir);
  const { startWorker } = await import("./worker.mjs");
  startWorker(path.join(functionsDir, "dist", "src")).catch((err) => {
    console.error("Compression worker crashed:", err);
    void shutdown(1);
  });

  // 5. Next.js
  log("Starting Next.js…");
  start("Next.js", "npx", ["next", "dev", "-p", String(WEB_PORT), ...(lan ? ["-H", "0.0.0.0"] : [])], webDir);
  await waitForPort(WEB_PORT, "Next.js");

  console.log(`
  \x1b[32mGoForMosaic is running locally\x1b[0m

    Customer site   ${siteUrl}
    Privacy policy  ${siteUrl}/privacy
    Admin           ${siteUrl}/admin   (no sign-in locally)

    Emails are printed in this terminal (set ACS_CONNECTION_STRING in web/.env.local to send real ones).
    Run retention cleanup:  cd local && npm run retention
    Stop: Ctrl+C   ·   Wipe all local data: npm run reset
`);
} catch (err) {
  console.error(err instanceof Error ? err : new Error(`Startup failed: ${JSON.stringify(err)}`));
  await shutdown(1);
}
