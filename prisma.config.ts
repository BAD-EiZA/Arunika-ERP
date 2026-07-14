import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prefer DIRECT_URL for migrations (Supabase session pooler / direct)
const datasourceUrl =
  process.env.DIRECT_URL || process.env.DATABASE_URL || "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: datasourceUrl || env("DATABASE_URL"),
  },
});
