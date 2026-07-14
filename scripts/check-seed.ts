import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const permissionCount = await prisma.permission.count();
  const sample = await prisma.permission.findMany({
    where: {
      OR: [
        { code: { startsWith: "bom:" } },
        { code: { startsWith: "production_" } },
        { code: { startsWith: "mrp:" } },
        { code: { startsWith: "employee:" } },
        { code: { startsWith: "payroll:" } },
        { code: { startsWith: "project:" } },
        { code: { startsWith: "return:" } },
      ],
    },
    orderBy: { code: "asc" },
    select: { code: true, module: true },
  });
  const companies = await prisma.company.findMany({
    select: { id: true, code: true, name: true },
  });
  console.log(
    JSON.stringify(
      {
        permissionCount,
        newishPermissions: sample,
        companies,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
