import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL missing");
  const adapter = new PrismaPg({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter });
  const users = await prisma.user.count();
  const companies = await prisma.company.count();
  console.log(JSON.stringify({ ok: true, users, companies }));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("DB_FAIL", e);
  process.exit(1);
});
