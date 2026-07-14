import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  ensureGlobalPermissions,
  seedCompanyRoles,
} from "../src/server/services/onboarding";
import { PERMISSIONS, SYSTEM_ROLES } from "../src/lib/permissions";

async function main() {
  console.log("1/3 Upsert global permissions...");
  await ensureGlobalPermissions();
  console.log(`   ${PERMISSIONS.length} permissions ready`);

  console.log("2/3 Load companies...");
  const companies = await prisma.company.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`   ${companies.length} company found`);

  console.log("3/3 Re-seed system roles + role permissions...");
  for (const company of companies) {
    await seedCompanyRoles(company.id);
    console.log(
      `   ✓ ${company.code} (${company.name}) — ${SYSTEM_ROLES.length} roles`,
    );
  }

  const permissionCount = await prisma.permission.count();
  const roleCount = await prisma.role.count({ where: { isSystem: true } });
  const rolePermCount = await prisma.rolePermission.count();

  console.log("\nDone.");
  console.log(
    JSON.stringify(
      {
        permissions: permissionCount,
        systemRoles: roleCount,
        rolePermissions: rolePermCount,
        companies: companies.length,
      },
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
