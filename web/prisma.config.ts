import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `generate` doesn't need a live database, so allow an empty URL in CI builds.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
