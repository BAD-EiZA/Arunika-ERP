import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, code: true, name: true, createdAt: true },
  });
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, kindeUserId: true },
  });
  const memberships = await prisma.membership.findMany({
    include: {
      user: { select: { email: true } },
      company: { select: { code: true, name: true } },
      role: { select: { code: true } },
    },
  });
  const products = await prisma.product.count();
  const customers = await prisma.customer.count();
  const suppliers = await prisma.supplier.count();
  console.log(
    JSON.stringify(
      { companies, users, memberships, products, customers, suppliers },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
