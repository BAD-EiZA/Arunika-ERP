import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const id = process.argv[2] || "cmrkd5mmv003z04lcejbozhfb";
  const name = process.argv.slice(3).join(" ") || "PT Lumina Deluna Integrasi";
  const updated = await prisma.company.update({
    where: { id },
    data: { name, legalName: name },
    select: { id: true, code: true, name: true, legalName: true },
  });
  console.log(JSON.stringify(updated, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
