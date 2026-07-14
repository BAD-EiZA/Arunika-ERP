/**
 * Full-feature demo seed for one company (all major modules).
 *
 *   npm run db:seed-full
 *   npx tsx scripts/seed-full.ts --company=Void
 *   SEED_COMPANY=Void npm run db:seed-full
 *
 * Idempotent via marker notes / codes / idempotency keys.
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
import { postJournal } from "../src/server/services/accounting";
import {
  approvePurchaseOrder,
  approvePurchaseRequest,
  createPurchaseOrder,
  createPurchaseRequest,
  createRfq,
  createSupplierBill,
  postGoodsReceipt,
  postSupplierPayment,
} from "../src/server/services/procurement";
import {
  approveSalesOrder,
  createSalesOrder,
  issueInvoiceFromDelivery,
  postCustomerPayment,
  postDeliveryOrder,
} from "../src/server/services/sales";
import {
  completeProductionOrder,
  createBom,
  createProductionOrder,
  createRouting,
  createWorkCenter,
  issueProductionMaterials,
  releaseProductionOrder,
} from "../src/server/services/manufacturing";
import { runMrp } from "../src/server/services/mrp";
import {
  approveLeaveRequest,
  createEmployee,
  createLeaveRequest,
  recordAttendance,
} from "../src/server/services/hr";
import {
  approvePayrollRun,
  postPayrollRun,
  preparePayrollRun,
} from "../src/server/services/payroll";
import {
  createProject,
  createProjectTask,
  submitTimesheet,
  approveTimesheet,
  addProjectExpense,
} from "../src/server/services/projects";
import {
  createSalesReturn,
  postSalesReturn,
  createPurchaseReturn,
  postPurchaseReturn,
  createClaim,
} from "../src/server/services/returns";
import {
  createCreditNoteFromReturn,
  createDebitNoteFromPurchaseReturn,
} from "../src/server/services/credit-notes";
import {
  createBankAccount,
  createBudget,
  createFixedAsset,
  importBankStatement,
} from "../src/server/services/treasury";
import { createTaxDocument } from "../src/server/services/tax";
import { createLead, createOpportunity } from "../src/server/services/crm";
import {
  closePosSession,
  createPosOrder,
  openPosSession,
} from "../src/server/services/pos";
import { createWarehouseBin, putawayToBin } from "../src/server/services/wms";
import { notifyUser } from "../src/server/services/notifications";
import { createPortalToken } from "../src/server/services/portal";

const MARK = "SEED-FULL";

function arg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

function log(step: string, detail?: string) {
  console.log(detail ? `  ✓ ${step}: ${detail}` : `  ✓ ${step}`);
}

function skip(step: string, reason: string) {
  console.log(`  · ${step} (skip: ${reason})`);
}

async function main() {
  const target = arg("company") || process.env.SEED_COMPANY || "Void";
  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { code: { equals: target, mode: "insensitive" } },
        { name: { equals: target, mode: "insensitive" } },
        { name: { contains: target, mode: "insensitive" } },
      ],
    },
    include: { settings: true, branches: true, warehouses: true, units: true },
  });
  if (!company) throw new Error(`Company tidak ditemukan: ${target}`);

  const owner =
    (await prisma.user.findFirst({
      where: { email: "badapplestd@gmail.com" },
    })) ?? (await prisma.user.findFirst());
  if (!owner) throw new Error("User tidak ada");

  console.log(`\n=== FULL SEED → ${company.name} (${company.code}) ===`);
  console.log(`Owner: ${owner.email}\n`);

  // ─── 1. Foundation ───────────────────────────────────────────
  console.log("1) Foundation");
  await ensureGlobalPermissions();
  await seedCompanyRoles(company.id);
  await seedDefaultCoa(company.id);
  await seedDefaultTaxCodes(company.id);
  await seedPostingRules(company.id);
  log("permissions, roles, COA, tax, posting rules");

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

  const year = new Date().getUTCFullYear();
  let fy = await prisma.fiscalYear.findFirst({
    where: { companyId: company.id, name: String(year) },
  });
  if (!fy) {
    fy = await prisma.fiscalYear.create({
      data: {
        companyId: company.id,
        name: String(year),
        startDate: new Date(`${year}-01-01T00:00:00.000Z`),
        endDate: new Date(`${year}-12-31T23:59:59.999Z`),
      },
    });
    for (let m = 1; m <= 12; m++) {
      await prisma.fiscalPeriod.create({
        data: {
          fiscalYearId: fy.id,
          name: `${year}-${String(m).padStart(2, "0")}`,
          startDate: new Date(Date.UTC(year, m - 1, 1)),
          endDate: new Date(Date.UTC(year, m, 0, 23, 59, 59, 999)),
        },
      });
    }
    log("fiscal year + periods", String(year));
  } else {
    skip("fiscal", "exists");
  }

  // units + category
  for (const u of [
    { name: "Pieces", symbol: "Pcs", precision: 0 },
    { name: "Box", symbol: "Box", precision: 0 },
    { name: "Kilogram", symbol: "Kg", precision: 3 },
  ]) {
    const exists = await prisma.unit.findFirst({
      where: { companyId: company.id, symbol: u.symbol },
    });
    if (!exists) await prisma.unit.create({ data: { companyId: company.id, ...u } });
  }
  const unit = await prisma.unit.findFirstOrThrow({
    where: { companyId: company.id, symbol: "Pcs" },
  });
  let category = await prisma.productCategory.findFirst({
    where: { companyId: company.id, code: "GEN" },
  });
  if (!category) {
    category = await prisma.productCategory.create({
      data: { companyId: company.id, code: "GEN", name: "Umum" },
    });
  }

  // ─── 2. Master data ──────────────────────────────────────────
  console.log("2) Master data");
  const productDefs = [
    { sku: "SKU-001", name: "Kopi Arabika 250g", purchasePrice: "45000", salePrice: "65000", minStock: "10" },
    { sku: "SKU-002", name: "Teh Hijau 100g", purchasePrice: "22000", salePrice: "35000", minStock: "20" },
    { sku: "SKU-003", name: "Gula Aren 500g", purchasePrice: "18000", salePrice: "28000", minStock: "15" },
    { sku: "SKU-004", name: "Susu UHT 1L", purchasePrice: "15000", salePrice: "22000", minStock: "30" },
    { sku: "SKU-005", name: "Kemasan Box 12", purchasePrice: "5000", salePrice: "9000", minStock: "50" },
    { sku: "FG-BLEND", name: "Blend Kopi Premium (FG)", purchasePrice: "0", salePrice: "120000", minStock: "5" },
  ];
  const products: Record<string, { id: string; sku: string; purchasePrice: string; salePrice: string }> = {};
  for (const p of productDefs) {
    let row = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: company.id, sku: p.sku } },
    });
    if (!row) {
      row = await prisma.product.create({
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
      log("product", p.sku);
    }
    products[p.sku] = {
      id: row.id,
      sku: row.sku,
      purchasePrice: row.purchasePrice.toString(),
      salePrice: row.salePrice.toString(),
    };
  }

  async function ensureCustomer(code: string, name: string) {
    let c = await prisma.customer.findFirst({ where: { companyId: company.id, code } });
    if (!c) {
      c = await prisma.customer.create({
        data: {
          companyId: company.id,
          code,
          name,
          email: `${code.toLowerCase()}@example.com`,
          phone: "081200000000",
          paymentTermDays: 30,
          creditLimit: "50000000",
        },
      });
      log("customer", code);
    }
    return c;
  }
  async function ensureSupplier(code: string, name: string) {
    let s = await prisma.supplier.findFirst({ where: { companyId: company.id, code } });
    if (!s) {
      s = await prisma.supplier.create({
        data: {
          companyId: company.id,
          code,
          name,
          email: `${code.toLowerCase()}@example.com`,
          phone: "0215550000",
          paymentTermDays: 30,
        },
      });
      log("supplier", code);
    }
    return s;
  }

  const customer = await ensureCustomer("CUST-01", "Toko Makmur");
  await ensureCustomer("CUST-02", "Warung Sejahtera");
  const supplier = await ensureSupplier("SUP-01", "CV Sumber Bahan");
  await ensureSupplier("SUP-02", "UD Mitra Jaya");

  // opening stock
  for (const row of [
    { sku: "SKU-001", qty: "200", cost: "45000" },
    { sku: "SKU-002", qty: "150", cost: "22000" },
    { sku: "SKU-003", qty: "100", cost: "18000" },
    { sku: "SKU-004", qty: "180", cost: "15000" },
    { sku: "SKU-005", qty: "300", cost: "5000" },
  ]) {
    const product = products[row.sku];
    const bal = await prisma.stockBalance.findFirst({
      where: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: product.id,
      },
    });
    if (bal && Number(bal.quantityOnHand) > 0) {
      skip(`stock ${row.sku}`, "on hand > 0");
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
    log("opening stock", `${row.sku} x${row.qty}`);
  }

  // ─── 3. Treasury / tax / journal ─────────────────────────────
  console.log("3) Treasury · tax · journal");
  let bank = await prisma.bankAccount.findFirst({
    where: { companyId: company.id, code: "BCA-01" },
  });
  if (!bank) {
    bank = await createBankAccount({
      companyId: company.id,
      code: "BCA-01",
      name: "Rekening Operasional",
      bankName: "BCA",
      accountNumber: "1234567890",
    });
    log("bank", bank.code);
  }
  const stmtExists = await prisma.bankStatement.findFirst({
    where: { bankAccountId: bank.id },
  });
  if (!stmtExists) {
    await importBankStatement({
      companyId: company.id,
      bankAccountId: bank.id,
      statementDate: new Date(),
      openingBalance: "10000000",
      closingBalance: "12500000",
      lines: [
        { lineDate: new Date(), description: "Transfer masuk", amount: "3000000" },
        { lineDate: new Date(), description: "Biaya admin", amount: "-500000" },
      ],
    });
    log("bank statement");
  }

  const budgetExists = await prisma.budget.findFirst({
    where: { companyId: company.id, name: { contains: MARK } },
  });
  if (!budgetExists) {
    await createBudget({
      companyId: company.id,
      name: `Budget ${year} ${MARK}`,
      year,
      lines: [
        { accountCode: "6100", period: 1, amount: "5000000" },
        { accountCode: "6100", period: 2, amount: "5000000" },
        { accountCode: "5100", period: 1, amount: "20000000" },
      ],
    });
    log("budget");
  }

  const assetExists = await prisma.fixedAsset.findFirst({
    where: { companyId: company.id, code: "FA-001" },
  });
  if (!assetExists) {
    await createFixedAsset({
      companyId: company.id,
      code: "FA-001",
      name: "Laptop Operasional",
      category: "IT",
      acquisitionDate: new Date(`${year}-01-15`),
      acquisitionCost: "15000000",
      residualValue: "1000000",
      usefulLifeMonths: 36,
    });
    log("fixed asset FA-001");
  }

  const taxExists = await prisma.taxDocument.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
  });
  if (!taxExists) {
    await createTaxDocument({
      companyId: company.id,
      docType: "FAKTUR_KELUARAN",
      taxType: "PPN",
      partnerName: customer.name,
      dpp: "1000000",
      taxAmount: "110000",
      taxPeriod: `${year}-01`,
      notes: MARK,
    });
    log("tax document");
  }

  const jeExists = await prisma.journal.findFirst({
    where: {
      companyId: company.id,
      idempotencyKey: `seed:je:${company.id}`,
    },
  });
  if (!jeExists) {
    await prisma.$transaction(async (tx) => {
      await postJournal(tx, {
        companyId: company.id,
        journalType: "MANUAL",
        sourceModule: "seed",
        sourceDocType: "Seed",
        sourceDocId: company.id,
        description: `Modal setoran awal ${MARK}`,
        lines: [
          { accountCode: "1100", debit: "10000000", description: "Kas" },
          { accountCode: "3100", credit: "10000000", description: "Modal" },
        ],
        idempotencyKey: `seed:je:${company.id}`,
        postedById: owner.id,
      });
    });
    log("manual journal");
  }

  // ─── 4. Procurement chain ────────────────────────────────────
  console.log("4) Procurement (PR → RFQ → PO → GR → Bill → Pay)");
  let pr = await prisma.purchaseRequest.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
  });
  if (!pr) {
    pr = await createPurchaseRequest({
      companyId: company.id,
      userId: owner.id,
      branchId: branch.id,
      notes: MARK,
      items: [
        { productId: products["SKU-002"].id, quantity: "20" },
        { productId: products["SKU-003"].id, quantity: "15" },
      ],
    });
    await approvePurchaseRequest(company.id, owner.id, pr.id);
    log("PR approved", pr.number);
  } else skip("PR", pr.number);

  let rfq = await prisma.requestForQuotation.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
  });
  if (!rfq) {
    rfq = await createRfq({
      companyId: company.id,
      purchaseRequestId: pr.id,
      supplierIds: [supplier.id],
      notes: MARK,
      dueDate: new Date(Date.now() + 7 * 86400000),
    });
    log("RFQ", rfq.number);
  } else skip("RFQ", rfq.number);

  let po = await prisma.purchaseOrder.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
    include: { items: true },
  });
  if (!po) {
    po = await createPurchaseOrder({
      companyId: company.id,
      userId: owner.id,
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      notes: MARK,
      items: [
        {
          productId: products["SKU-002"].id,
          quantity: "20",
          unitPrice: products["SKU-002"].purchasePrice,
        },
        {
          productId: products["SKU-003"].id,
          quantity: "15",
          unitPrice: products["SKU-003"].purchasePrice,
        },
      ],
    });
    await approvePurchaseOrder(company.id, owner.id, po.id);
    po = await prisma.purchaseOrder.findFirstOrThrow({
      where: { id: po.id },
      include: { items: true },
    });
    log("PO approved", po.number);
  } else skip("PO", po.number);

  let gr = await prisma.goodsReceipt.findFirst({
    where: {
      companyId: company.id,
      purchaseOrderId: po.id,
      idempotencyKey: `seed:gr:${company.id}`,
    },
  });
  if (!gr) {
    gr = await postGoodsReceipt({
      companyId: company.id,
      userId: owner.id,
      purchaseOrderId: po.id,
      warehouseId: warehouse.id,
      notes: MARK,
      items: po.items.map((i) => ({
        productId: i.productId,
        quantityReceived: i.quantity.toString(),
        unitCost: i.unitPrice.toString(),
      })),
      idempotencyKey: `seed:gr:${company.id}`,
    });
    log("GR posted", gr.number);
  } else skip("GR", gr.number);

  let bill = await prisma.supplierBill.findFirst({
    where: {
      companyId: company.id,
      purchaseOrderId: po.id,
    },
  });
  if (!bill) {
    bill = await createSupplierBill({
      companyId: company.id,
      userId: owner.id,
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      supplierInvoiceNo: "SUP-INV-SEED-001",
      dueDate: new Date(Date.now() + 30 * 86400000),
      items: po.items.map((i) => ({
        productId: i.productId,
        description: i.productId,
        quantity: i.quantity.toString(),
        unitPrice: i.unitPrice.toString(),
        taxAmount: "0",
      })),
    });
    log("supplier bill", bill.number);
  } else skip("bill", bill.number);

  const spExists = await prisma.supplierPayment.findFirst({
    where: {
      companyId: company.id,
      reference: MARK,
    },
  });
  if (!spExists) {
    const payAmt = bill.balance.toString();
    const sp = await postSupplierPayment({
      companyId: company.id,
      userId: owner.id,
      supplierId: supplier.id,
      amount: payAmt,
      reference: MARK,
      allocations: [{ billId: bill.id, amount: payAmt }],
    });
    log("supplier payment", sp.number);
  } else skip("supplier payment", "exists");

  // ─── 5. Sales chain ──────────────────────────────────────────
  console.log("5) Sales (SO → DO → INV → Payment)");
  let so = await prisma.salesOrder.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
    include: { items: true },
  });
  if (!so) {
    so = await createSalesOrder({
      companyId: company.id,
      userId: owner.id,
      customerId: customer.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      notes: MARK,
      items: [
        {
          productId: products["SKU-001"].id,
          quantity: "10",
          unitPrice: products["SKU-001"].salePrice,
        },
        {
          productId: products["SKU-004"].id,
          quantity: "8",
          unitPrice: products["SKU-004"].salePrice,
        },
      ],
    });
    await approveSalesOrder(company.id, owner.id, so.id);
    so = await prisma.salesOrder.findFirstOrThrow({
      where: { id: so.id },
      include: { items: true },
    });
    log("SO approved", so.number);
  } else skip("SO", so.number);

  let delivery = await prisma.deliveryOrder.findFirst({
    where: {
      companyId: company.id,
      salesOrderId: so.id,
      idempotencyKey: `seed:do:${company.id}`,
    },
  });
  if (!delivery) {
    delivery = await postDeliveryOrder({
      companyId: company.id,
      userId: owner.id,
      salesOrderId: so.id,
      warehouseId: warehouse.id,
      notes: MARK,
      items: so.items.map((i) => ({
        productId: i.productId,
        quantityDelivered: i.quantity.toString(),
      })),
      idempotencyKey: `seed:do:${company.id}`,
    });
    log("DO posted", delivery.number);
  } else skip("DO", delivery.number);

  let invoice = await prisma.salesInvoice.findFirst({
    where: { companyId: company.id, deliveryOrderId: delivery.id },
  });
  if (!invoice) {
    invoice = await issueInvoiceFromDelivery({
      companyId: company.id,
      userId: owner.id,
      deliveryOrderId: delivery.id,
      taxRate: "11",
    });
    log("invoice issued", invoice.number);
  } else skip("invoice", invoice.number);

  const cpExists = await prisma.customerPayment.findFirst({
    where: { companyId: company.id, reference: MARK },
  });
  if (!cpExists) {
    // re-fetch balance
    invoice = await prisma.salesInvoice.findFirstOrThrow({
      where: { id: invoice.id },
    });
    const payAmt = invoice.balance.toString();
    if (Number(payAmt) > 0) {
      const cp = await postCustomerPayment({
        companyId: company.id,
        userId: owner.id,
        customerId: customer.id,
        amount: payAmt,
        reference: MARK,
        allocations: [{ invoiceId: invoice.id, amount: payAmt }],
      });
      log("customer payment", cp.number);
    }
  } else skip("customer payment", "exists");

  // ─── 6. Returns + CN/DN ──────────────────────────────────────
  console.log("6) Returns · credit/debit note · claim");
  let sr = await prisma.salesReturn.findFirst({
    where: { companyId: company.id, reason: { contains: MARK } },
  });
  if (!sr) {
    sr = await createSalesReturn({
      companyId: company.id,
      userId: owner.id,
      customerId: customer.id,
      warehouseId: warehouse.id,
      salesInvoiceId: invoice.id,
      reason: `Retur sample ${MARK}`,
      items: [
        {
          productId: products["SKU-001"].id,
          quantity: "1",
          unitPrice: products["SKU-001"].salePrice,
        },
      ],
    });
    await postSalesReturn({
      companyId: company.id,
      userId: owner.id,
      id: sr.id,
      warehouseId: warehouse.id,
    });
    log("sales return posted", sr.number);
  } else skip("sales return", sr.number);

  const cnExists = await prisma.creditNote.findFirst({
    where: { companyId: company.id, salesReturnId: sr.id },
  });
  if (!cnExists) {
    const cn = await createCreditNoteFromReturn({
      companyId: company.id,
      userId: owner.id,
      salesReturnId: sr.id,
      reason: MARK,
    });
    log("credit note", cn.number);
  } else skip("credit note", "exists");

  let prn = await prisma.purchaseReturn.findFirst({
    where: { companyId: company.id, reason: { contains: MARK } },
  });
  if (!prn) {
    prn = await createPurchaseReturn({
      companyId: company.id,
      userId: owner.id,
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      reason: `Retur beli ${MARK}`,
      items: [
        {
          productId: products["SKU-003"].id,
          quantity: "1",
          unitCost: products["SKU-003"].purchasePrice,
        },
      ],
    });
    await postPurchaseReturn({
      companyId: company.id,
      userId: owner.id,
      id: prn.id,
      warehouseId: warehouse.id,
    });
    log("purchase return posted", prn.number);
  } else skip("purchase return", prn.number);

  const dnExists = await prisma.debitNote.findFirst({
    where: { companyId: company.id, purchaseReturnId: prn.id },
  });
  if (!dnExists) {
    const dn = await createDebitNoteFromPurchaseReturn({
      companyId: company.id,
      userId: owner.id,
      purchaseReturnId: prn.id,
      reason: MARK,
    });
    log("debit note", dn.number);
  } else skip("debit note", "exists");

  const claimExists = await prisma.claim.findFirst({
    where: { companyId: company.id, reason: { contains: MARK } },
  });
  if (!claimExists) {
    const claim = await createClaim({
      companyId: company.id,
      claimType: "QUALITY",
      partnerName: supplier.name,
      amount: "250000",
      reason: `Claim rusak ${MARK}`,
    });
    log("claim", claim.number);
  } else skip("claim", "exists");

  // ─── 7. Manufacturing + MRP ──────────────────────────────────
  console.log("7) Manufacturing · MRP");
  let wc = await prisma.workCenter.findFirst({
    where: { companyId: company.id, code: "WC-01" },
  });
  if (!wc) {
    wc = await createWorkCenter({
      companyId: company.id,
      code: "WC-01",
      name: "Line Packing",
      description: MARK,
    });
    log("work center", wc.code);
  }

  let bom = await prisma.billOfMaterials.findFirst({
    where: { companyId: company.id, code: "BOM-BLEND" },
  });
  if (!bom) {
    bom = await createBom({
      companyId: company.id,
      code: "BOM-BLEND",
      name: "BOM Blend Kopi",
      finishedProductId: products["FG-BLEND"].id,
      quantity: "1",
      notes: MARK,
      items: [
        { productId: products["SKU-001"].id, quantity: "2" },
        { productId: products["SKU-005"].id, quantity: "1" },
      ],
    });
    log("BOM", bom.code);
  }

  let routing = await prisma.routing.findFirst({
    where: { companyId: company.id, code: "RT-01" },
  });
  if (!routing) {
    routing = await createRouting({
      companyId: company.id,
      code: "RT-01",
      name: "Routing Packing",
      notes: MARK,
      steps: [
        {
          workCenterId: wc.id,
          sequence: 1,
          name: "Pack",
          setupMinutes: "10",
          runMinutes: "5",
        },
      ],
    });
    log("routing", routing.code);
  }

  let mo = await prisma.productionOrder.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
  });
  if (!mo) {
    mo = await createProductionOrder({
      companyId: company.id,
      userId: owner.id,
      finishedProductId: products["FG-BLEND"].id,
      bomId: bom.id,
      routingId: routing.id,
      warehouseId: warehouse.id,
      plannedQty: "5",
      notes: MARK,
    });
    await releaseProductionOrder(company.id, owner.id, mo.id);
    await issueProductionMaterials({
      companyId: company.id,
      userId: owner.id,
      productionOrderId: mo.id,
      warehouseId: warehouse.id,
    });
    await completeProductionOrder({
      companyId: company.id,
      userId: owner.id,
      productionOrderId: mo.id,
      warehouseId: warehouse.id,
      quantity: "5",
    });
    log("MO completed", mo.number);
  } else skip("MO", mo.number);

  const mrpExists = await prisma.mrpRun.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
  });
  if (!mrpExists) {
    // open demand for MRP: extra SO draft→approved not fully delivered
    let so2 = await prisma.salesOrder.findFirst({
      where: { companyId: company.id, notes: { contains: `${MARK}-MRP` } },
    });
    if (!so2) {
      so2 = await createSalesOrder({
        companyId: company.id,
        userId: owner.id,
        customerId: customer.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        notes: `${MARK}-MRP demand`,
        items: [
          {
            productId: products["SKU-001"].id,
            quantity: "50",
            unitPrice: products["SKU-001"].salePrice,
          },
        ],
      });
      await approveSalesOrder(company.id, owner.id, so2.id);
    }
    const mrp = await runMrp({
      companyId: company.id,
      userId: owner.id,
      horizonDays: 30,
      notes: MARK,
    });
    log("MRP run", mrp.number);
  } else skip("MRP", "exists");

  // ─── 8. HR + Payroll ─────────────────────────────────────────
  console.log("8) HR · Payroll");
  async function ensureEmployee(code: string, name: string, salary: string, position: string) {
    let e = await prisma.employee.findFirst({
      where: { companyId: company.id, code },
    });
    if (!e) {
      e = await createEmployee({
        companyId: company.id,
        code,
        name,
        email: `${code.toLowerCase()}@void.local`,
        position,
        baseSalary: salary,
        joinDate: new Date(`${year}-01-01`),
      });
      log("employee", code);
    }
    return e;
  }
  const emp1 = await ensureEmployee("EMP-01", "Budi Santoso", "8000000", "Staff Gudang");
  const emp2 = await ensureEmployee("EMP-02", "Siti Aminah", "12000000", "Finance");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await recordAttendance({
    companyId: company.id,
    employeeId: emp1.id,
    workDate: today,
    checkIn: new Date(today.getTime() + 8 * 3600000),
    checkOut: new Date(today.getTime() + 17 * 3600000),
    status: "PRESENT",
  });
  log("attendance", emp1.code);

  let leave = await prisma.leaveRequest.findFirst({
    where: { companyId: company.id, reason: { contains: MARK } },
  });
  if (!leave) {
    leave = await createLeaveRequest({
      companyId: company.id,
      employeeId: emp2.id,
      leaveType: "ANNUAL",
      startDate: new Date(Date.now() + 14 * 86400000),
      endDate: new Date(Date.now() + 15 * 86400000),
      days: "2",
      reason: `Cuti tahunan ${MARK}`,
    });
    await approveLeaveRequest(company.id, leave.id);
    log("leave approved");
  } else skip("leave", "exists");

  const payExists = await prisma.payrollRun.findFirst({
    where: {
      companyId: company.id,
      // period marker via month
      periodStart: new Date(Date.UTC(year, new Date().getUTCMonth(), 1)),
    },
  });
  if (!payExists) {
    const start = new Date(Date.UTC(year, new Date().getUTCMonth(), 1));
    const end = new Date(Date.UTC(year, new Date().getUTCMonth() + 1, 0));
    const run = await preparePayrollRun({
      companyId: company.id,
      userId: owner.id,
      periodStart: start,
      periodEnd: end,
    });
    await approvePayrollRun(company.id, run.id);
    await postPayrollRun({
      companyId: company.id,
      userId: owner.id,
      id: run.id,
    });
    log("payroll posted", run.number);
  } else skip("payroll", "exists");

  // ─── 9. Projects ─────────────────────────────────────────────
  console.log("9) Projects");
  let project = await prisma.project.findFirst({
    where: { companyId: company.id, code: "PRJ-01" },
  });
  if (!project) {
    project = await createProject({
      companyId: company.id,
      code: "PRJ-01",
      name: "Implementasi ERP Client",
      customerId: customer.id,
      budgetAmount: "50000000",
      managerName: "Erzhanto",
      startDate: new Date(),
      notes: MARK,
    });
    const task = await createProjectTask({
      projectId: project.id,
      companyId: company.id,
      code: "T-01",
      name: "Setup master data",
      plannedHours: "40",
    });
    const ts = await submitTimesheet({
      projectId: project.id,
      taskId: task.id,
      employeeId: emp1.id,
      workDate: today,
      hours: "8",
      notes: MARK,
    });
    await approveTimesheet(ts.id, company.id);
    await addProjectExpense({
      companyId: company.id,
      projectId: project.id,
      description: `Transport survey ${MARK}`,
      amount: "350000",
    });
    log("project", project.code);
  } else skip("project", project.code);

  // ─── 10. CRM ─────────────────────────────────────────────────
  console.log("10) CRM");
  let lead = await prisma.crmLead.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
  });
  if (!lead) {
    lead = await createLead({
      companyId: company.id,
      name: "Andi Wijaya",
      email: "andi@prospect.local",
      phone: "08139990001",
      companyName: "PT Prospek Jaya",
      source: "WEB",
      notes: MARK,
      ownerName: owner.name || owner.email,
    });
    log("lead", lead.name);
  }
  const oppExists = await prisma.crmOpportunity.findFirst({
    where: { companyId: company.id, notes: { contains: MARK } },
  });
  if (!oppExists) {
    const opp = await createOpportunity({
      companyId: company.id,
      title: "Deal distribusi Q3",
      leadId: lead.id,
      amount: "75000000",
      stage: "PROPOSAL",
      probability: 40,
      notes: MARK,
    });
    log("opportunity", opp.title);
  } else skip("opportunity", "exists");

  // ─── 11. POS ─────────────────────────────────────────────────
  console.log("11) POS");
  let session = await prisma.posSession.findFirst({
    where: {
      companyId: company.id,
      cashierName: { contains: MARK },
    },
    orderBy: { openedAt: "desc" },
  });
  if (!session) {
    session = await openPosSession({
      companyId: company.id,
      warehouseId: warehouse.id,
      branchId: branch.id,
      cashierName: `Kasir ${MARK}`,
      openingCash: "500000",
    });
    const order = await createPosOrder({
      companyId: company.id,
      userId: owner.id,
      sessionId: session.id,
      warehouseId: warehouse.id,
      paymentMethod: "CASH",
      paidAmount: products["SKU-002"].salePrice,
      items: [
        {
          productId: products["SKU-002"].id,
          quantity: "1",
          unitPrice: products["SKU-002"].salePrice,
        },
      ],
    });
    await closePosSession(company.id, session.id, "535000");
    log("POS order", order.number);
  } else skip("POS", "exists");

  // ─── 12. WMS ─────────────────────────────────────────────────
  console.log("12) WMS");
  let bin = await prisma.warehouseBin.findFirst({
    where: { companyId: company.id, code: "A-01-01" },
  });
  if (!bin) {
    bin = await createWarehouseBin({
      companyId: company.id,
      warehouseId: warehouse.id,
      code: "A-01-01",
      name: "Rak A1 Level 1",
      aisle: "A",
      rack: "01",
      level: "01",
    });
    log("bin", bin.code);
  }
  const binBal = await prisma.stockBinBalance.findFirst({
    where: { companyId: company.id, binId: bin.id, productId: products["SKU-001"].id },
  });
  if (!binBal) {
    await putawayToBin({
      companyId: company.id,
      warehouseId: warehouse.id,
      binId: bin.id,
      productId: products["SKU-001"].id,
      quantity: "20",
    });
    log("putaway SKU-001 x20");
  } else skip("putaway", "exists");

  // ─── 13. Notifications · portal · AI ─────────────────────────
  console.log("13) Notifications · portal · AI");
  const notifExists = await prisma.notification.findFirst({
    where: { companyId: company.id, title: { contains: MARK } },
  });
  if (!notifExists) {
    await notifyUser({
      companyId: company.id,
      userId: owner.id,
      type: "SYSTEM",
      title: `Seed selesai ${MARK}`,
      message: "Data demo seluruh modul sudah diisi. Mulai eksplorasi dari Dashboard.",
      email: owner.email,
    });
    log("notification");
  }

  const portalExists = await prisma.portalToken.findFirst({
    where: {
      companyId: company.id,
      partnerEmail: { contains: MARK.toLowerCase() },
    },
  });
  if (!portalExists) {
    const token = await createPortalToken({
      companyId: company.id,
      portalType: "CUSTOMER",
      partnerId: customer.id,
      partnerEmail: customer.email || "partner@example.com",
      daysValid: 30,
    });
    // tag for idempotency re-runs
    await prisma.portalToken.update({
      where: { id: token.id },
      data: { partnerEmail: `${MARK.toLowerCase()}+${customer.email || "p@example.com"}` },
    }).catch(() => undefined);
    log("portal token", token.token?.slice(0, 12) ?? token.id.slice(0, 8));
  } else skip("portal", "exists");

  const aiExists = await prisma.aiInsight.findFirst({
    where: { companyId: company.id, title: { contains: MARK } },
  });
  if (!aiExists) {
    await prisma.aiInsight.create({
      data: {
        companyId: company.id,
        insightType: "FORECAST",
        title: `Ringkasan seed ${MARK}`,
        summary:
          "Demand demo: SKU-001 tinggi (SO + MRP). Stok opening + GR tersedia. Cek anomali invoice setelah transaksi live.",
        severity: "info",
        model: "seed-local",
        payload: { source: MARK },
      },
    });
    log("AI insight (local)");
  } else skip("AI", "exists");

  // ensure membership
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
    }
  }

  // ─── Summary ─────────────────────────────────────────────────
  const summary = {
    company: { id: company.id, code: company.code, name: company.name },
    owner: owner.email,
    counts: {
      products: await prisma.product.count({ where: { companyId: company.id } }),
      customers: await prisma.customer.count({ where: { companyId: company.id } }),
      suppliers: await prisma.supplier.count({ where: { companyId: company.id } }),
      stockBalances: await prisma.stockBalance.count({ where: { companyId: company.id } }),
      purchaseOrders: await prisma.purchaseOrder.count({ where: { companyId: company.id } }),
      goodsReceipts: await prisma.goodsReceipt.count({ where: { companyId: company.id } }),
      supplierBills: await prisma.supplierBill.count({ where: { companyId: company.id } }),
      salesOrders: await prisma.salesOrder.count({ where: { companyId: company.id } }),
      deliveries: await prisma.deliveryOrder.count({ where: { companyId: company.id } }),
      invoices: await prisma.salesInvoice.count({ where: { companyId: company.id } }),
      journals: await prisma.journal.count({ where: { companyId: company.id } }),
      productionOrders: await prisma.productionOrder.count({ where: { companyId: company.id } }),
      mrpRuns: await prisma.mrpRun.count({ where: { companyId: company.id } }),
      employees: await prisma.employee.count({ where: { companyId: company.id } }),
      payrollRuns: await prisma.payrollRun.count({ where: { companyId: company.id } }),
      projects: await prisma.project.count({ where: { companyId: company.id } }),
      crmLeads: await prisma.crmLead.count({ where: { companyId: company.id } }),
      posOrders: await prisma.posOrder.count({ where: { companyId: company.id } }),
      bins: await prisma.warehouseBin.count({ where: { companyId: company.id } }),
      creditNotes: await prisma.creditNote.count({ where: { companyId: company.id } }),
      notifications: await prisma.notification.count({ where: { companyId: company.id } }),
      aiInsights: await prisma.aiInsight.count({ where: { companyId: company.id } }),
    },
  };
  console.log("\n=== DONE ===");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error("\nSEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
