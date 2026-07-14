/**
 * Seed sample master data for an existing company.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-data.ts
 *   npx tsx scripts/seed-demo-data.ts --company=Void
 *   npx tsx scripts/seed-demo-data.ts --company=123
 *   SEED_COMPANY=Void npx tsx scripts/seed-demo-data.ts
 *
 * Idempotent: skips existing SKU/code.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  ensureGlobalPermissions,
  seedCompanyRoles,
  seedDefaultCoa,
  seedDefaultTaxCodes,
  seedPostingRules,
} from "../src/server/services/onboarding";
import { postStockMovement } from "../src/server/services/inventory";

function arg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  const target =
    arg("company") || process.env.SEED_COMPANY || "Void";

  const company =
    (await prisma.company.findFirst({
      where: {
        OR: [
          { code: { equals: target, mode: "insensitive" } },
          { name: { equals: target, mode: "insensitive" } },
          { name: { contains: target, mode: "insensitive" } },
        ],
      },
      include: {
        settings: true,
        branches: true,
        warehouses: true,
        units: true,
      },
    })) ?? null;

  if (!company) {
    throw new Error(
      `Company tidak ditemukan: "${target}". Cek code/name di DB.`,
    );
  }

  console.log(`Company: ${company.name} (${company.code}) ${company.id}`);

  // foundation re-seed (safe)
  await ensureGlobalPermissions();
  await seedCompanyRoles(company.id);
  await seedDefaultCoa(company.id);
  await seedDefaultTaxCodes(company.id);
  await seedPostingRules(company.id);

  let branch = company.branches[0];
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        code: "HQ",
        name: "Kantor Pusat",
      },
    });
    console.log("  + branch HQ");
  }

  let warehouse = company.warehouses[0];
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        code: "MAIN",
        name: "Gudang Utama",
        type: "MAIN",
      },
    });
    console.log("  + warehouse MAIN");
  }

  if (!company.settings) {
    await prisma.companySetting.create({
      data: {
        companyId: company.id,
        defaultBranchId: branch.id,
        defaultWarehouseId: warehouse.id,
      },
    });
    console.log("  + company settings");
  } else if (
    !company.settings.defaultBranchId ||
    !company.settings.defaultWarehouseId
  ) {
    await prisma.companySetting.update({
      where: { companyId: company.id },
      data: {
        defaultBranchId: company.settings.defaultBranchId ?? branch.id,
        defaultWarehouseId:
          company.settings.defaultWarehouseId ?? warehouse.id,
      },
    });
  }

  // units
  const unitDefs = [
    { name: "Pieces", symbol: "Pcs", precision: 0 },
    { name: "Box", symbol: "Box", precision: 0 },
    { name: "Kilogram", symbol: "Kg", precision: 3 },
  ];
  for (const u of unitDefs) {
    const exists = company.units.find(
      (x) => x.symbol.toLowerCase() === u.symbol.toLowerCase(),
    );
    if (!exists) {
      await prisma.unit.create({ data: { companyId: company.id, ...u } });
    }
  }
  const unit =
    (await prisma.unit.findFirst({
      where: { companyId: company.id, symbol: "Pcs" },
    })) ??
    (await prisma.unit.findFirst({ where: { companyId: company.id } }));
  if (!unit) throw new Error("Unit tidak ada");

  // category
  let category = await prisma.productCategory.findFirst({
    where: { companyId: company.id, code: "GEN" },
  });
  if (!category) {
    category = await prisma.productCategory.create({
      data: {
        companyId: company.id,
        code: "GEN",
        name: "Umum",
      },
    });
    console.log("  + category GEN");
  }

  // products
  const products = [
    {
      sku: "SKU-001",
      name: "Kopi Arabika 250g",
      purchasePrice: "45000",
      salePrice: "65000",
      minStock: "10",
    },
    {
      sku: "SKU-002",
      name: "Teh Hijau 100g",
      purchasePrice: "22000",
      salePrice: "35000",
      minStock: "20",
    },
    {
      sku: "SKU-003",
      name: "Gula Aren 500g",
      purchasePrice: "18000",
      salePrice: "28000",
      minStock: "15",
    },
    {
      sku: "SKU-004",
      name: "Susu UHT 1L",
      purchasePrice: "15000",
      salePrice: "22000",
      minStock: "30",
    },
    {
      sku: "SKU-005",
      name: "Kemasan Box 12",
      purchasePrice: "5000",
      salePrice: "9000",
      minStock: "50",
    },
  ];

  const productIds: string[] = [];
  for (const p of products) {
    const existing = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: company.id, sku: p.sku } },
    });
    if (existing) {
      productIds.push(existing.id);
      continue;
    }
    const created = await prisma.product.create({
      data: {
        companyId: company.id,
        sku: p.sku,
        name: p.name,
        unitId: unit.id,
        categoryId: category.id,
        type: "STOCK",
        purchasePrice: p.purchasePrice,
        salePrice: p.salePrice,
        minStock: p.minStock,
      },
    });
    productIds.push(created.id);
    console.log(`  + product ${p.sku}`);
  }

  // customers
  const customers = [
    {
      code: "CUST-01",
      name: "Toko Makmur",
      email: "makmur@example.com",
      phone: "081200000001",
      paymentTermDays: 30,
      creditLimit: "50000000",
    },
    {
      code: "CUST-02",
      name: "Warung Sejahtera",
      email: "sejahtera@example.com",
      phone: "081200000002",
      paymentTermDays: 14,
      creditLimit: "15000000",
    },
  ];
  for (const c of customers) {
    const exists = await prisma.customer.findFirst({
      where: { companyId: company.id, code: c.code },
    });
    if (exists) continue;
    await prisma.customer.create({
      data: { companyId: company.id, ...c },
    });
    console.log(`  + customer ${c.code}`);
  }

  // suppliers
  const suppliers = [
    {
      code: "SUP-01",
      name: "CV Sumber Bahan",
      email: "sumber@example.com",
      phone: "0215550001",
      paymentTermDays: 30,
    },
    {
      code: "SUP-02",
      name: "UD Mitra Jaya",
      email: "mitra@example.com",
      phone: "0215550002",
      paymentTermDays: 21,
    },
  ];
  for (const s of suppliers) {
    const exists = await prisma.supplier.findFirst({
      where: { companyId: company.id, code: s.code },
    });
    if (exists) continue;
    await prisma.supplier.create({
      data: { companyId: company.id, ...s },
    });
    console.log(`  + supplier ${s.code}`);
  }

  // opening stock (idempotent via unique-ish key)
  const owner =
    (await prisma.user.findFirst({
      where: { email: "badapplestd@gmail.com" },
    })) ?? (await prisma.user.findFirst());
  if (!owner) throw new Error("User owner tidak ditemukan");

  const opening = [
    { sku: "SKU-001", qty: "100", cost: "45000" },
    { sku: "SKU-002", qty: "80", cost: "22000" },
    { sku: "SKU-003", qty: "60", cost: "18000" },
    { sku: "SKU-004", qty: "120", cost: "15000" },
    { sku: "SKU-005", qty: "200", cost: "5000" },
  ];

  for (const row of opening) {
    const product = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: company.id, sku: row.sku } },
    });
    if (!product) continue;
    const bal = await prisma.stockBalance.findFirst({
      where: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: product.id,
      },
    });
    if (bal && Number(bal.quantityOnHand) > 0) {
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await postStockMovement(tx, {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: product.id,
        type: "OPENING_BALANCE",
        quantity: row.qty,
        unitCost: row.cost,
        referenceType: "Seed",
        referenceId: `seed-open-${row.sku}`,
        referenceNumber: `SEED-${row.sku}`,
        createdById: owner.id,
        idempotencyKey: `seed:open:${company.id}:${row.sku}`,
      });
    });
    console.log(`  + stock ${row.sku} qty ${row.qty}`);
  }

  // ensure membership owner
  const ownerRole = await prisma.role.findFirst({
    where: { companyId: company.id, code: "OWNER" },
  });
  if (ownerRole) {
    const mem = await prisma.membership.findFirst({
      where: { companyId: company.id, userId: owner.id },
    });
    if (!mem) {
      await prisma.membership.create({
        data: {
          companyId: company.id,
          userId: owner.id,
          roleId: ownerRole.id,
          status: "ACTIVE",
          branchAccess: { create: [{ branchId: branch.id }] },
          warehouseAccess: { create: [{ warehouseId: warehouse.id }] },
        },
      });
      console.log(`  + membership OWNER for ${owner.email}`);
    }
  }

  const summary = {
    company: { id: company.id, code: company.code, name: company.name },
    products: await prisma.product.count({ where: { companyId: company.id } }),
    customers: await prisma.customer.count({
      where: { companyId: company.id },
    }),
    suppliers: await prisma.supplier.count({
      where: { companyId: company.id },
    }),
    stockBalances: await prisma.stockBalance.count({
      where: { companyId: company.id },
    }),
    roles: await prisma.role.count({ where: { companyId: company.id } }),
    owner: owner.email,
  };
  console.log("\nDone.");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
