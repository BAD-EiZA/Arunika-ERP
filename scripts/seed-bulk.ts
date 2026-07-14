/**
 * Bulk demo data (≥60 per major entity) for one company.
 *
 *   npm run db:seed-bulk
 *   npx tsx scripts/seed-bulk.ts --company=123
 *   npx tsx scripts/seed-bulk.ts --company="PT Lumina Deluna Integrasi"
 *   npx tsx scripts/seed-bulk.ts --count=80
 *
 * Idempotent via codes BULK-xxx / notes SEED-BULK.
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
import {
  approvePurchaseOrder,
  createPurchaseOrder,
  createSupplierBill,
  postGoodsReceipt,
} from "../src/server/services/procurement";
import {
  approveSalesOrder,
  createSalesOrder,
  issueInvoiceFromDelivery,
  postDeliveryOrder,
} from "../src/server/services/sales";
import { createLead, createOpportunity } from "../src/server/services/crm";
import { createEmployee, recordAttendance } from "../src/server/services/hr";
import { notifyUser } from "../src/server/services/notifications";
import { createWarehouseBin } from "../src/server/services/wms";
import { createProject, createProjectTask } from "../src/server/services/projects";
import { nextDocumentNumber } from "../src/lib/document-number";
import { toPrismaDecimal, toPrismaMoney } from "../src/lib/money";

const MARK = "SEED-BULK";

function arg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

function pad(n: number, w = 3) {
  return String(n).padStart(w, "0");
}

async function main() {
  const target =
    arg("company") ||
    process.env.SEED_COMPANY ||
    "PT Lumina Deluna Integrasi";
  const COUNT = Math.max(60, Number(arg("count") || process.env.SEED_COUNT || 60));
  const TX_DOCS = Math.min(COUNT, Number(arg("docs") || 60)); // full chain docs

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { code: { equals: target, mode: "insensitive" } },
        { name: { equals: target, mode: "insensitive" } },
        { name: { contains: target, mode: "insensitive" } },
      ],
    },
    include: { branches: true, warehouses: true, units: true, settings: true },
  });
  if (!company) throw new Error(`Company tidak ditemukan: ${target}`);

  const owner =
    (await prisma.user.findFirst({
      where: { email: "badapplestd@gmail.com" },
    })) ?? (await prisma.user.findFirst());
  if (!owner) throw new Error("User tidak ada");

  console.log(`\n=== BULK SEED ×${COUNT} → ${company.name} (${company.code}) ===\n`);

  await ensureGlobalPermissions();
  await seedCompanyRoles(company.id);
  await seedDefaultCoa(company.id);
  await seedDefaultTaxCodes(company.id);
  await seedPostingRules(company.id);

  let branch = company.branches[0];
  if (!branch) {
    branch = await prisma.branch.create({
      data: { companyId: company.id, code: "HQ", name: "Kantor Pusat" },
    });
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
  }
  if (!company.settings) {
    await prisma.companySetting.create({
      data: {
        companyId: company.id,
        defaultBranchId: branch.id,
        defaultWarehouseId: warehouse.id,
      },
    });
  }

  for (const u of [
    { name: "Pieces", symbol: "Pcs", precision: 0 },
    { name: "Box", symbol: "Box", precision: 0 },
    { name: "Kilogram", symbol: "Kg", precision: 3 },
  ]) {
    const ex = await prisma.unit.findFirst({
      where: { companyId: company.id, symbol: u.symbol },
    });
    if (!ex) await prisma.unit.create({ data: { companyId: company.id, ...u } });
  }
  const unit = await prisma.unit.findFirstOrThrow({
    where: { companyId: company.id, symbol: "Pcs" },
  });

  let category = await prisma.productCategory.findFirst({
    where: { companyId: company.id, code: "BULK" },
  });
  if (!category) {
    category = await prisma.productCategory.create({
      data: { companyId: company.id, code: "BULK", name: "Bulk Catalog" },
    });
  }

  // ─── Products ──────────────────────────────────────────────
  console.log(`1) Products (target ${COUNT})`);
  const productNames = [
    "Kopi", "Teh", "Gula", "Susu", "Beras", "Minyak", "Tepung", "Garam",
    "Snack", "Minuman", "Sabun", "Shampoo", "Tissue", "Botol", "Kemasan",
    "Bumbu", "Kecap", "Saus", "Mie", "Sereal",
  ];
  let createdProducts = 0;
  for (let i = 1; i <= COUNT; i++) {
    const sku = `BULK-P-${pad(i)}`;
    const exists = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: company.id, sku } },
    });
    if (exists) continue;
    const base = productNames[(i - 1) % productNames.length];
    const buy = 10000 + (i % 40) * 1000;
    await prisma.product.create({
      data: {
        companyId: company.id,
        sku,
        name: `${base} Premium ${pad(i)}`,
        unitId: unit.id,
        categoryId: category.id,
        type: "STOCK",
        purchasePrice: String(buy),
        salePrice: String(Math.round(buy * 1.35)),
        minStock: String(5 + (i % 20)),
        description: MARK,
      },
    });
    createdProducts++;
    if (i % 20 === 0) process.stdout.write(`  … ${i}/${COUNT}\n`);
  }
  console.log(`  ✓ products created this run: ${createdProducts}`);

  const products = await prisma.product.findMany({
    where: { companyId: company.id, sku: { startsWith: "BULK-P-" } },
    orderBy: { sku: "asc" },
  });

  // ─── Customers ─────────────────────────────────────────────
  console.log(`2) Customers (target ${COUNT})`);
  let createdCust = 0;
  for (let i = 1; i <= COUNT; i++) {
    const code = `BULK-C-${pad(i)}`;
    const exists = await prisma.customer.findFirst({
      where: { companyId: company.id, code },
    });
    if (exists) continue;
    await prisma.customer.create({
      data: {
        companyId: company.id,
        code,
        name: `Pelanggan Bulk ${pad(i)}`,
        email: `cust${pad(i)}@bulk.local`,
        phone: `0812${String(10000000 + i).slice(-8)}`,
        paymentTermDays: [7, 14, 30, 45][i % 4],
        creditLimit: String(10_000_000 + i * 100_000),
      },
    });
    createdCust++;
  }
  console.log(`  ✓ customers created: ${createdCust}`);
  const customers = await prisma.customer.findMany({
    where: { companyId: company.id, code: { startsWith: "BULK-C-" } },
    orderBy: { code: "asc" },
  });

  // ─── Suppliers ─────────────────────────────────────────────
  console.log(`3) Suppliers (target ${COUNT})`);
  let createdSup = 0;
  for (let i = 1; i <= COUNT; i++) {
    const code = `BULK-S-${pad(i)}`;
    const exists = await prisma.supplier.findFirst({
      where: { companyId: company.id, code },
    });
    if (exists) continue;
    await prisma.supplier.create({
      data: {
        companyId: company.id,
        code,
        name: `Pemasok Bulk ${pad(i)}`,
        email: `sup${pad(i)}@bulk.local`,
        phone: `021${String(5000000 + i).slice(-7)}`,
        paymentTermDays: [14, 21, 30][i % 3],
      },
    });
    createdSup++;
  }
  console.log(`  ✓ suppliers created: ${createdSup}`);
  const suppliers = await prisma.supplier.findMany({
    where: { companyId: company.id, code: { startsWith: "BULK-S-" } },
    orderBy: { code: "asc" },
  });

  // ─── Opening stock (batch) ─────────────────────────────────
  console.log(`4) Opening stock for bulk products`);
  let stocked = 0;
  for (const p of products) {
    const bal = await prisma.stockBalance.findFirst({
      where: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: p.id,
      },
    });
    if (bal && Number(bal.quantityOnHand) > 0) continue;
    try {
      await prisma.$transaction(
        async (tx) => {
          await postStockMovement(tx, {
            companyId: company.id,
            warehouseId: warehouse.id,
            productId: p.id,
            type: "OPENING_BALANCE",
            quantity: String(50 + (stocked % 100)),
            unitCost: p.purchasePrice.toString(),
            referenceType: "Seed",
            referenceId: `bulk-open-${p.sku}`,
            referenceNumber: `BULK-OPN-${p.sku}`,
            createdById: owner.id,
            idempotencyKey: `bulk:open:${company.id}:${p.sku}`,
          });
        },
        { maxWait: 15000, timeout: 30000 },
      );
      stocked++;
    } catch (e) {
      console.log(`  ! stock fail ${p.sku}: ${e instanceof Error ? e.message : e}`);
    }
    if (stocked > 0 && stocked % 15 === 0) {
      process.stdout.write(`  … stocked ${stocked}\n`);
    }
  }
  console.log(`  ✓ opening stock movements: ${stocked}`);

  // ─── Employees ─────────────────────────────────────────────
  console.log(`5) Employees (target ${COUNT})`);
  let createdEmp = 0;
  const positions = [
    "Staff", "Supervisor", "Manager", "Admin", "Warehouse", "Sales", "Finance",
  ];
  for (let i = 1; i <= COUNT; i++) {
    const code = `BULK-E-${pad(i)}`;
    const exists = await prisma.employee.findFirst({
      where: { companyId: company.id, code },
    });
    if (exists) continue;
    await createEmployee({
      companyId: company.id,
      code,
      name: `Karyawan Bulk ${pad(i)}`,
      email: `emp${pad(i)}@bulk.local`,
      position: positions[i % positions.length],
      baseSalary: String(5_000_000 + (i % 20) * 250_000),
      joinDate: new Date(2024, i % 12, 1 + (i % 27)),
    });
    createdEmp++;
  }
  console.log(`  ✓ employees created: ${createdEmp}`);
  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, code: { startsWith: "BULK-E-" } },
    orderBy: { code: "asc" },
  });

  // attendance last 60 days for first 10 employees (or all if fewer)
  console.log(`6) Attendance records`);
  let att = 0;
  const empSample = employees.slice(0, Math.min(10, employees.length));
  for (let d = 0; d < 60; d++) {
    const workDate = new Date();
    workDate.setUTCHours(0, 0, 0, 0);
    workDate.setUTCDate(workDate.getUTCDate() - d);
    const emp = empSample[d % empSample.length];
    if (!emp) break;
    await recordAttendance({
      companyId: company.id,
      employeeId: emp.id,
      workDate,
      checkIn: new Date(workDate.getTime() + 8 * 3600000),
      checkOut: new Date(workDate.getTime() + 17 * 3600000),
      status: d % 11 === 0 ? "LEAVE" : "PRESENT",
    });
    att++;
  }
  console.log(`  ✓ attendance: ${att}`);

  // ─── CRM leads + opportunities ─────────────────────────────
  console.log(`7) CRM leads + opportunities (target ${COUNT})`);
  let leadsCreated = 0;
  let oppsCreated = 0;
  for (let i = 1; i <= COUNT; i++) {
    const marker = `${MARK}-L${pad(i)}`;
    let lead = await prisma.crmLead.findFirst({
      where: { companyId: company.id, notes: marker },
    });
    if (!lead) {
      lead = await createLead({
        companyId: company.id,
        name: `Lead Bulk ${pad(i)}`,
        email: `lead${pad(i)}@bulk.local`,
        phone: `0813${String(20000000 + i).slice(-8)}`,
        companyName: `Prospect Co ${pad(i)}`,
        source: ["WEB", "REFERRAL", "EVENT", "COLD"][i % 4],
        notes: marker,
        ownerName: owner.name || owner.email,
      });
      leadsCreated++;
    }
    const oppMarker = `${MARK}-O${pad(i)}`;
    const oppEx = await prisma.crmOpportunity.findFirst({
      where: { companyId: company.id, notes: oppMarker },
    });
    if (!oppEx) {
      await createOpportunity({
        companyId: company.id,
        title: `Opportunity Bulk ${pad(i)}`,
        leadId: lead.id,
        amount: String(5_000_000 + i * 250_000),
        stage: ["QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON"][i % 4],
        probability: 10 + (i % 9) * 10,
        notes: oppMarker,
      });
      oppsCreated++;
    }
  }
  console.log(`  ✓ leads: ${leadsCreated}, opps: ${oppsCreated}`);

  // ─── Notifications ─────────────────────────────────────────
  console.log(`8) Notifications (target ${COUNT})`);
  let notifCreated = 0;
  for (let i = 1; i <= COUNT; i++) {
    const title = `${MARK} Notif ${pad(i)}`;
    const ex = await prisma.notification.findFirst({
      where: { companyId: company.id, title },
    });
    if (ex) continue;
    await notifyUser({
      companyId: company.id,
      userId: owner.id,
      type: ["SYSTEM", "SALES", "PURCHASE", "STOCK", "HR"][i % 5],
      title,
      message: `Pesan demo bulk #${i} untuk uji inbox notifikasi.`,
    });
    notifCreated++;
  }
  console.log(`  ✓ notifications: ${notifCreated}`);

  // ─── WMS bins ──────────────────────────────────────────────
  console.log(`9) WMS bins (target ${COUNT})`);
  let binsCreated = 0;
  for (let i = 1; i <= COUNT; i++) {
    const aisle = String.fromCharCode(65 + ((i - 1) % 6)); // A-F
    const rack = pad(((i - 1) % 10) + 1, 2);
    const level = pad(((i - 1) % 4) + 1, 2);
    const code = `${aisle}-${rack}-${level}-${pad(i)}`;
    const ex = await prisma.warehouseBin.findFirst({
      where: { companyId: company.id, code },
    });
    if (ex) continue;
    await createWarehouseBin({
      companyId: company.id,
      warehouseId: warehouse.id,
      code,
      name: `Bin ${code}`,
      aisle,
      rack,
      level,
    });
    binsCreated++;
  }
  console.log(`  ✓ bins: ${binsCreated}`);

  // ─── Projects + tasks ──────────────────────────────────────
  console.log(`10) Projects + tasks`);
  let projectsCreated = 0;
  let tasksCreated = 0;
  for (let i = 1; i <= COUNT; i++) {
    const code = `BULK-PRJ-${pad(i)}`;
    let project = await prisma.project.findFirst({
      where: { companyId: company.id, code },
    });
    if (!project) {
      project = await createProject({
        companyId: company.id,
        code,
        name: `Project Bulk ${pad(i)}`,
        customerId: customers[(i - 1) % customers.length]?.id,
        budgetAmount: String(20_000_000 + i * 500_000),
        managerName: `PM ${pad(i)}`,
        notes: MARK,
      });
      projectsCreated++;
    }
    const taskCode = `T-${pad(i)}`;
    const taskEx = await prisma.projectTask.findFirst({
      where: { projectId: project.id, code: taskCode },
    });
    if (!taskEx) {
      await createProjectTask({
        projectId: project.id,
        companyId: company.id,
        code: taskCode,
        name: `Task bulk ${pad(i)}`,
        plannedHours: String(8 + (i % 40)),
      });
      tasksCreated++;
    }
  }
  console.log(`  ✓ projects: ${projectsCreated}, tasks: ${tasksCreated}`);

  // ─── AI insights bulk ──────────────────────────────────────
  console.log(`11) AI insights (target ${COUNT})`);
  let aiCreated = 0;
  for (let i = 1; i <= COUNT; i++) {
    const title = `${MARK} Insight ${pad(i)}`;
    const ex = await prisma.aiInsight.findFirst({
      where: { companyId: company.id, title },
    });
    if (ex) continue;
    await prisma.aiInsight.create({
      data: {
        companyId: company.id,
        insightType: ["FORECAST", "ANOMALY", "STOCK", "SALES"][i % 4],
        title,
        summary: `Ringkasan demo #${i}: pola demand bulk, cek SKU BULK-P-${pad(i)}.`,
        severity: ["info", "warning", "info", "info"][i % 4],
        model: "seed-bulk",
        payload: { index: i, mark: MARK },
      },
    });
    aiCreated++;
  }
  console.log(`  ✓ AI insights: ${aiCreated}`);

  // ─── Purchase orders (approved) + sample GR/bill ───────────
  console.log(`12) Purchase orders ×${TX_DOCS}`);
  let poCreated = 0;
  let grCreated = 0;
  for (let i = 1; i <= TX_DOCS; i++) {
    const notes = `${MARK}-PO-${pad(i)}`;
    let po = await prisma.purchaseOrder.findFirst({
      where: { companyId: company.id, notes },
      include: { items: true },
    });
    if (!po) {
      const sup = suppliers[(i - 1) % suppliers.length];
      const p1 = products[(i - 1) % products.length];
      const p2 = products[i % products.length];
      if (!sup || !p1) continue;
      po = await createPurchaseOrder({
        companyId: company.id,
        userId: owner.id,
        supplierId: sup.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        notes,
        items: [
          {
            productId: p1.id,
            quantity: String(5 + (i % 10)),
            unitPrice: p1.purchasePrice.toString(),
          },
          {
            productId: p2.id,
            quantity: String(3 + (i % 5)),
            unitPrice: p2.purchasePrice.toString(),
          },
        ],
      });
      await approvePurchaseOrder(company.id, owner.id, po.id);
      po = await prisma.purchaseOrder.findFirstOrThrow({
        where: { id: po.id },
        include: { items: true },
      });
      poCreated++;
    }

    // GR + bill for first 20 to keep time reasonable
    if (i <= 20) {
      const grKey = `bulk:gr:${company.id}:${pad(i)}`;
      let gr = await prisma.goodsReceipt.findFirst({
        where: { companyId: company.id, idempotencyKey: grKey },
      });
      if (!gr && po.status === "APPROVED") {
        try {
          gr = await postGoodsReceipt({
            companyId: company.id,
            userId: owner.id,
            purchaseOrderId: po.id,
            warehouseId: warehouse.id,
            notes: MARK,
            items: po.items.map((it) => ({
              productId: it.productId,
              quantityReceived: it.quantity.toString(),
              unitCost: it.unitPrice.toString(),
            })),
            idempotencyKey: grKey,
          });
          grCreated++;
          const billEx = await prisma.supplierBill.findFirst({
            where: { companyId: company.id, purchaseOrderId: po.id },
          });
          if (!billEx) {
            await createSupplierBill({
              companyId: company.id,
              userId: owner.id,
              supplierId: po.supplierId,
              purchaseOrderId: po.id,
              supplierInvoiceNo: `BULK-INV-${pad(i)}`,
              items: po.items.map((it) => ({
                productId: it.productId,
                description: it.productId,
                quantity: it.quantity.toString(),
                unitPrice: it.unitPrice.toString(),
              })),
            });
          }
        } catch (e) {
          console.log(
            `  ! GR/bill #${i}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    }
    if (i % 10 === 0) process.stdout.write(`  … PO ${i}/${TX_DOCS}\n`);
  }
  console.log(`  ✓ PO created: ${poCreated}, GR: ${grCreated}`);

  // ─── Sales orders + sample DO/INV ──────────────────────────
  console.log(`13) Sales orders ×${TX_DOCS}`);
  let soCreated = 0;
  let doCreated = 0;
  for (let i = 1; i <= TX_DOCS; i++) {
    const notes = `${MARK}-SO-${pad(i)}`;
    let so = await prisma.salesOrder.findFirst({
      where: { companyId: company.id, notes },
      include: { items: true },
    });
    if (!so) {
      const cust = customers[(i - 1) % customers.length];
      const p1 = products[(i - 1) % products.length];
      const p2 = products[(i + 3) % products.length];
      if (!cust || !p1) continue;
      so = await createSalesOrder({
        companyId: company.id,
        userId: owner.id,
        customerId: cust.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        notes,
        items: [
          {
            productId: p1.id,
            quantity: String(2 + (i % 6)),
            unitPrice: p1.salePrice.toString(),
          },
          {
            productId: p2.id,
            quantity: String(1 + (i % 4)),
            unitPrice: p2.salePrice.toString(),
          },
        ],
      });
      await approveSalesOrder(company.id, owner.id, so.id);
      so = await prisma.salesOrder.findFirstOrThrow({
        where: { id: so.id },
        include: { items: true },
      });
      soCreated++;
    }

    if (i <= 20 && so.status === "APPROVED") {
      const doKey = `bulk:do:${company.id}:${pad(i)}`;
      let delivery = await prisma.deliveryOrder.findFirst({
        where: { companyId: company.id, idempotencyKey: doKey },
      });
      if (!delivery) {
        try {
          delivery = await postDeliveryOrder({
            companyId: company.id,
            userId: owner.id,
            salesOrderId: so.id,
            warehouseId: warehouse.id,
            notes: MARK,
            items: so.items.map((it) => ({
              productId: it.productId,
              quantityDelivered: it.quantity.toString(),
            })),
            idempotencyKey: doKey,
          });
          doCreated++;
          const invEx = await prisma.salesInvoice.findFirst({
            where: { companyId: company.id, deliveryOrderId: delivery.id },
          });
          if (!invEx) {
            await issueInvoiceFromDelivery({
              companyId: company.id,
              userId: owner.id,
              deliveryOrderId: delivery.id,
              taxRate: "11",
            });
          }
        } catch (e) {
          console.log(
            `  ! DO/INV #${i}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    }
    if (i % 10 === 0) process.stdout.write(`  … SO ${i}/${TX_DOCS}\n`);
  }
  console.log(`  ✓ SO created: ${soCreated}, DO: ${doCreated}`);

  // ─── Manual journals bulk (raw balanced) ───────────────────
  console.log(`14) Manual journals ×${COUNT}`);
  let jeCreated = 0;
  for (let i = 1; i <= COUNT; i++) {
    const key = `bulk:je:${company.id}:${pad(i)}`;
    const ex = await prisma.journal.findFirst({
      where: { companyId: company.id, idempotencyKey: key },
    });
    if (ex) continue;
    const amount = 100_000 + i * 10_000;
    try {
      await prisma.$transaction(
        async (tx) => {
          const cash = await tx.account.findFirst({
            where: { companyId: company.id, code: "1100" },
          });
          const revenue = await tx.account.findFirst({
            where: { companyId: company.id, code: "4100" },
          });
          if (!cash || !revenue) return;
          const number = await nextDocumentNumber(tx, company.id, "JE");
          await tx.journal.create({
            data: {
              companyId: company.id,
              number,
              journalType: "MANUAL",
              postingDate: new Date(),
              documentDate: new Date(),
              sourceModule: "seed",
              sourceDocType: "SeedBulk",
              sourceDocId: key,
              description: `${MARK} JE ${pad(i)}`,
              status: "POSTED",
              idempotencyKey: key,
              postedById: owner.id,
              postedAt: new Date(),
              lines: {
                create: [
                  {
                    accountId: cash.id,
                    debit: toPrismaMoney(String(amount)),
                    credit: toPrismaMoney("0"),
                    description: "Kas",
                  },
                  {
                    accountId: revenue.id,
                    debit: toPrismaMoney("0"),
                    credit: toPrismaMoney(String(amount)),
                    description: "Pendapatan",
                  },
                ],
              },
            },
          });
        },
        { maxWait: 10000, timeout: 20000 },
      );
      jeCreated++;
    } catch (e) {
      console.log(`  ! JE #${i}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ✓ journals: ${jeCreated}`);

  // ─── Summary ───────────────────────────────────────────────
  const cid = company.id;
  const summary = {
    company: { id: cid, code: company.code, name: company.name },
    targetCount: COUNT,
    counts: {
      products: await prisma.product.count({ where: { companyId: cid } }),
      bulkProducts: await prisma.product.count({
        where: { companyId: cid, sku: { startsWith: "BULK-P-" } },
      }),
      customers: await prisma.customer.count({ where: { companyId: cid } }),
      suppliers: await prisma.supplier.count({ where: { companyId: cid } }),
      employees: await prisma.employee.count({ where: { companyId: cid } }),
      stockBalances: await prisma.stockBalance.count({ where: { companyId: cid } }),
      purchaseOrders: await prisma.purchaseOrder.count({ where: { companyId: cid } }),
      goodsReceipts: await prisma.goodsReceipt.count({ where: { companyId: cid } }),
      salesOrders: await prisma.salesOrder.count({ where: { companyId: cid } }),
      deliveries: await prisma.deliveryOrder.count({ where: { companyId: cid } }),
      invoices: await prisma.salesInvoice.count({ where: { companyId: cid } }),
      journals: await prisma.journal.count({ where: { companyId: cid } }),
      crmLeads: await prisma.crmLead.count({ where: { companyId: cid } }),
      crmOpps: await prisma.crmOpportunity.count({ where: { companyId: cid } }),
      notifications: await prisma.notification.count({ where: { companyId: cid } }),
      bins: await prisma.warehouseBin.count({ where: { companyId: cid } }),
      projects: await prisma.project.count({ where: { companyId: cid } }),
      projectTasks: await prisma.projectTask.count({
        where: { project: { companyId: cid } },
      }),
      attendance: await prisma.attendanceRecord.count({ where: { companyId: cid } }),
      aiInsights: await prisma.aiInsight.count({ where: { companyId: cid } }),
    },
  };

  console.log("\n=== DONE ===");
  console.log(JSON.stringify(summary, null, 2));

  const bulkKeys = [
    summary.counts.bulkProducts,
    summary.counts.customers,
    summary.counts.suppliers,
    summary.counts.employees,
    summary.counts.crmLeads,
    summary.counts.purchaseOrders,
    summary.counts.salesOrders,
    summary.counts.notifications,
    summary.counts.bins,
    summary.counts.projects,
    summary.counts.aiInsights,
  ];
  const minBulk = Math.min(...bulkKeys);
  if (minBulk < 60) {
    console.log(
      `\n⚠ Beberapa entitas < 60 (min=${minBulk}). Jalankan ulang script.`,
    );
  } else {
    console.log(`\n✓ Semua entitas utama ≥ 60 (min=${minBulk})`);
  }
}

main()
  .catch((e) => {
    console.error("\nBULK SEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
