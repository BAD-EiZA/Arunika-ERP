"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runFormAction } from "@/lib/action";
import {
  clearActiveCompanyId,
  listUserCompanies,
  requirePermission,
  requireTenant,
  requireUser,
  setActiveCompanyId,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { onboardCompany } from "@/server/services/onboarding";
import {
  createCategory,
  createCustomer,
  createProduct,
  createSupplier,
} from "@/server/services/master-data";
import {
  approvePurchaseOrder,
  approvePurchaseRequest,
  awardRfq,
  createPurchaseOrder,
  createPurchaseRequest,
  createRfq,
  createSupplierBill,
  postGoodsReceipt,
  postSupplierPayment,
  reviewThreeWayMatch,
  submitPurchaseOrder,
  submitVendorQuotation,
} from "@/server/services/procurement";
import {
  approveSalesOrder,
  createSalesOrder,
  issueInvoiceFromDelivery,
  postCustomerPayment,
  postDeliveryOrder,
} from "@/server/services/sales";
import {
  closeFiscalPeriod,
  createBankAccount,
  createBudget,
  createFixedAsset,
  importBankStatement,
  runStraightLineDepreciation,
} from "@/server/services/treasury";
import {
  correctTaxDocument,
  createTaxDocument,
  exportTaxPeriod,
} from "@/server/services/tax";
import { postStockMovement } from "@/server/services/inventory";
import { postJournal } from "@/server/services/accounting";

function formStr(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function formNum(formData: FormData, key: string) {
  return formStr(formData, key);
}

export async function actionOnboardCompany(formData: FormData): Promise<void> {
  const user = await requireUser();
  await onboardCompany({
    userId: user.id,
    name: formStr(formData, "name"),
    legalName: formStr(formData, "legalName") || undefined,
    code: formStr(formData, "code") || undefined,
    email: formStr(formData, "email") || undefined,
    phone: formStr(formData, "phone") || undefined,
    city: formStr(formData, "city") || undefined,
    province: formStr(formData, "province") || undefined,
    branchName: formStr(formData, "branchName") || undefined,
    warehouseName: formStr(formData, "warehouseName") || undefined,
  });
  redirect("/dashboard");
}

export async function actionSwitchCompany(formData: FormData): Promise<void> {
  const user = await requireUser();
  const companyId = formStr(formData, "companyId");
  const memberships = await listUserCompanies(user.id);
  if (!memberships.some((m) => m.companyId === companyId)) {
    throw new Error("Perusahaan tidak valid");
  }
  await setActiveCompanyId(companyId);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function actionCreateProduct(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("product:create");
    const product = await createProduct({
      companyId: ctx.companyId,
      sku: formStr(formData, "sku"),
      name: formStr(formData, "name"),
      unitId: formStr(formData, "unitId"),
      categoryId: formStr(formData, "categoryId") || undefined,
      purchasePrice: formNum(formData, "purchasePrice") || 0,
      salePrice: formNum(formData, "salePrice") || 0,
      minStock: formNum(formData, "minStock") || 0,
      description: formStr(formData, "description") || undefined,
    });
    revalidatePath("/master-data/products");
    return product;
  });
}

export async function actionCreateCustomer(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("customer:create");
    const customer = await createCustomer({
      companyId: ctx.companyId,
      code: formStr(formData, "code"),
      name: formStr(formData, "name"),
      email: formStr(formData, "email") || undefined,
      phone: formStr(formData, "phone") || undefined,
    });
    revalidatePath("/master-data/customers");
    return customer;
  });
}

export async function actionCreateSupplier(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("supplier:create");
    const supplier = await createSupplier({
      companyId: ctx.companyId,
      code: formStr(formData, "code"),
      name: formStr(formData, "name"),
      email: formStr(formData, "email") || undefined,
      phone: formStr(formData, "phone") || undefined,
    });
    revalidatePath("/master-data/suppliers");
    return supplier;
  });
}

export async function actionCreateCategory(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("product:create");
    const category = await createCategory({
      companyId: ctx.companyId,
      code: formStr(formData, "code"),
      name: formStr(formData, "name"),
    });
    revalidatePath("/master-data/products");
    return category;
  });
}

export async function actionOpeningStock(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("stock:adjust");
    const movement = await prisma.$transaction((tx) =>
      postStockMovement(tx, {
        companyId: ctx.companyId,
        warehouseId: formStr(formData, "warehouseId"),
        productId: formStr(formData, "productId"),
        type: "OPENING_BALANCE",
        quantity: formNum(formData, "quantity"),
        unitCost: formNum(formData, "unitCost") || 0,
        referenceType: "OpeningBalance",
        createdById: ctx.user.id,
        idempotencyKey: `open:${formStr(formData, "productId")}:${Date.now()}`,
      }),
    );
    revalidatePath("/inventory/stock");
    return movement;
  });
}

export async function actionCreatePO(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("purchase_order:create");
    const productId = formStr(formData, "productId");
    const quantity = formNum(formData, "quantity");
    const unitPrice = formNum(formData, "unitPrice");
    const po = await createPurchaseOrder({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      supplierId: formStr(formData, "supplierId"),
      branchId: formStr(formData, "branchId") || undefined,
      warehouseId: formStr(formData, "warehouseId") || undefined,
      notes: formStr(formData, "notes") || undefined,
      items: [{ productId, quantity, unitPrice }],
    });
    revalidatePath("/procurement/purchase-orders");
    return po;
  });
}

export async function actionApprovePO(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("purchase_order:approve");
    const po = await approvePurchaseOrder(
      ctx.companyId,
      ctx.user.id,
      formStr(formData, "id"),
    );
    revalidatePath("/procurement/purchase-orders");
    return po;
  });
}

export async function actionSubmitPO(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("purchase_order:submit");
    const po = await submitPurchaseOrder(
      ctx.companyId,
      ctx.user.id,
      formStr(formData, "id"),
    );
    revalidatePath("/procurement/purchase-orders");
    return po;
  });
}

export async function actionPostGR(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("goods_receipt:post");
    const gr = await postGoodsReceipt({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      purchaseOrderId: formStr(formData, "purchaseOrderId"),
      warehouseId: formStr(formData, "warehouseId"),
      supplierDeliveryNote: formStr(formData, "supplierDeliveryNote") || undefined,
      items: [
        {
          productId: formStr(formData, "productId"),
          quantityReceived: formNum(formData, "quantityReceived"),
          unitCost: formNum(formData, "unitCost") || undefined,
        },
      ],
    });
    revalidatePath("/procurement/goods-receipts");
    revalidatePath("/inventory/stock");
    return gr;
  });
}

export async function actionCreateBill(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("supplier_bill:create");
    const bill = await createSupplierBill({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      supplierId: formStr(formData, "supplierId"),
      purchaseOrderId: formStr(formData, "purchaseOrderId") || undefined,
      supplierInvoiceNo: formStr(formData, "supplierInvoiceNo") || undefined,
      items: [
        {
          productId: formStr(formData, "productId") || undefined,
          description: formStr(formData, "description") || "Item",
          quantity: formNum(formData, "quantity"),
          unitPrice: formNum(formData, "unitPrice"),
          taxAmount: formNum(formData, "taxAmount") || 0,
        },
      ],
    });
    revalidatePath("/procurement/bills");
    return bill;
  });
}

export async function actionPaySupplier(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("supplier_payment:create");
    const payment = await postSupplierPayment({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      supplierId: formStr(formData, "supplierId"),
      amount: formNum(formData, "amount"),
      reference: formStr(formData, "reference") || undefined,
      allocations: [
        {
          billId: formStr(formData, "billId"),
          amount: formNum(formData, "amount"),
        },
      ],
    });
    revalidatePath("/procurement/payments");
    return payment;
  });
}

export async function actionCreateSO(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("sales_order:create");
    const so = await createSalesOrder({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      customerId: formStr(formData, "customerId"),
      branchId: formStr(formData, "branchId") || undefined,
      warehouseId: formStr(formData, "warehouseId") || undefined,
      notes: formStr(formData, "notes") || undefined,
      items: [
        {
          productId: formStr(formData, "productId"),
          quantity: formNum(formData, "quantity"),
          unitPrice: formNum(formData, "unitPrice"),
          taxAmount: formNum(formData, "taxAmount") || 0,
        },
      ],
    });
    revalidatePath("/sales/orders");
    return so;
  });
}

export async function actionApproveSO(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("sales_order:approve");
    const so = await approveSalesOrder(
      ctx.companyId,
      ctx.user.id,
      formStr(formData, "id"),
    );
    revalidatePath("/sales/orders");
    return so;
  });
}

export async function actionPostDO(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("delivery_order:post");
    const delivery = await postDeliveryOrder({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      salesOrderId: formStr(formData, "salesOrderId"),
      warehouseId: formStr(formData, "warehouseId"),
      items: [
        {
          productId: formStr(formData, "productId"),
          quantityDelivered: formNum(formData, "quantityDelivered"),
        },
      ],
    });
    revalidatePath("/sales/deliveries");
    revalidatePath("/inventory/stock");
    return delivery;
  });
}

export async function actionIssueInvoice(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("invoice:issue");
    const invoice = await issueInvoiceFromDelivery({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      deliveryOrderId: formStr(formData, "deliveryOrderId"),
      taxRate: formNum(formData, "taxRate") || 11,
    });
    revalidatePath("/sales/invoices");
    return invoice;
  });
}

export async function actionPayCustomer(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("payment:create");
    const payment = await postCustomerPayment({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      customerId: formStr(formData, "customerId"),
      amount: formNum(formData, "amount"),
      reference: formStr(formData, "reference") || undefined,
      allocations: [
        {
          invoiceId: formStr(formData, "invoiceId"),
          amount: formNum(formData, "amount"),
        },
      ],
    });
    revalidatePath("/sales/payments");
    return payment;
  });
}

export async function actionCreatePR(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("purchase_request:create");
    const pr = await createPurchaseRequest({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      branchId: formStr(formData, "branchId") || undefined,
      notes: formStr(formData, "notes") || undefined,
      items: [
        {
          productId: formStr(formData, "productId"),
          quantity: formNum(formData, "quantity"),
        },
      ],
    });
    revalidatePath("/procurement/requests");
    return pr;
  });
}

export async function actionApprovePR(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("purchase_request:approve");
    const pr = await approvePurchaseRequest(
      ctx.companyId,
      ctx.user.id,
      formStr(formData, "id"),
    );
    revalidatePath("/procurement/requests");
    return pr;
  });
}

export async function actionCreateRfq(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("rfq:create");
    const supplierIds = formData.getAll("supplierIds").map(String);
    const rfq = await createRfq({
      companyId: ctx.companyId,
      purchaseRequestId: formStr(formData, "purchaseRequestId") || undefined,
      supplierIds,
      notes: formStr(formData, "notes") || undefined,
    });
    revalidatePath("/procurement/rfq");
    return rfq;
  });
}

export async function actionSubmitQuotation(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("rfq:create");
    const q = await submitVendorQuotation({
      companyId: ctx.companyId,
      rfqId: formStr(formData, "rfqId"),
      supplierId: formStr(formData, "supplierId"),
      items: [
        {
          productId: formStr(formData, "productId") || undefined,
          description: formStr(formData, "description") || "Item",
          quantity: formNum(formData, "quantity"),
          unitPrice: formNum(formData, "unitPrice"),
        },
      ],
    });
    revalidatePath("/procurement/rfq");
    return q;
  });
}

export async function actionAwardRfq(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("rfq:award");
    const result = await awardRfq({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      rfqId: formStr(formData, "rfqId"),
      quotationId: formStr(formData, "quotationId"),
      warehouseId: formStr(formData, "warehouseId") || undefined,
      branchId: formStr(formData, "branchId") || undefined,
    });
    revalidatePath("/procurement/rfq");
    revalidatePath("/procurement/purchase-orders");
    return result;
  });
}

export async function actionThreeWayMatch(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("three_way_match:review");
    const match = await reviewThreeWayMatch({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      goodsReceiptId: formStr(formData, "goodsReceiptId"),
      supplierBillId: formStr(formData, "supplierBillId"),
    });
    revalidatePath("/procurement/matching");
    return match;
  });
}

export async function actionManualJournal(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("journal:post");
    const journal = await prisma.$transaction((tx) =>
      postJournal(tx, {
        companyId: ctx.companyId,
        sourceModule: "manual",
        sourceDocType: "ManualJournal",
        sourceDocId: `manual-${Date.now()}`,
        description: formStr(formData, "description") || "Jurnal manual",
        idempotencyKey: `manual:${Date.now()}`,
        postedById: ctx.user.id,
        lines: [
          {
            accountCode: formStr(formData, "debitAccount"),
            debit: formNum(formData, "amount"),
          },
          {
            accountCode: formStr(formData, "creditAccount"),
            credit: formNum(formData, "amount"),
          },
        ],
      }),
    );
    revalidatePath("/finance/journals");
    return journal;
  });
}

export async function actionCreateBank(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("bank_account:manage");
    const bank = await createBankAccount({
      companyId: ctx.companyId,
      code: formStr(formData, "code"),
      name: formStr(formData, "name"),
      bankName: formStr(formData, "bankName") || undefined,
      accountNumber: formStr(formData, "accountNumber") || undefined,
    });
    revalidatePath("/finance/bank");
    return bank;
  });
}

export async function actionImportStatement(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("bank_reconciliation:perform");
    const statement = await importBankStatement({
      companyId: ctx.companyId,
      bankAccountId: formStr(formData, "bankAccountId"),
      statementDate: new Date(formStr(formData, "statementDate") || Date.now()),
      openingBalance: formNum(formData, "openingBalance") || 0,
      closingBalance: formNum(formData, "closingBalance") || 0,
      lines: [
        {
          lineDate: new Date(formStr(formData, "lineDate") || Date.now()),
          description: formStr(formData, "lineDescription") || undefined,
          amount: formNum(formData, "lineAmount"),
        },
      ],
    });
    revalidatePath("/finance/bank");
    return statement;
  });
}

export async function actionCreateBudget(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("budget:manage");
    const budget = await createBudget({
      companyId: ctx.companyId,
      name: formStr(formData, "name"),
      year: Number(formStr(formData, "year") || new Date().getFullYear()),
      lines: [
        {
          accountCode: formStr(formData, "accountCode"),
          period: Number(formStr(formData, "period") || 1),
          amount: formNum(formData, "amount"),
        },
      ],
    });
    revalidatePath("/finance/budget");
    return budget;
  });
}

export async function actionCreateAsset(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("fixed_asset:manage");
    const asset = await createFixedAsset({
      companyId: ctx.companyId,
      code: formStr(formData, "code"),
      name: formStr(formData, "name"),
      category: formStr(formData, "category") || undefined,
      acquisitionDate: new Date(formStr(formData, "acquisitionDate") || Date.now()),
      acquisitionCost: formNum(formData, "acquisitionCost"),
      residualValue: formNum(formData, "residualValue") || 0,
      usefulLifeMonths: Number(formStr(formData, "usefulLifeMonths") || 36),
    });
    revalidatePath("/finance/assets");
    return asset;
  });
}

export async function actionDepreciateAsset(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("fixed_asset:manage");
    const asset = await runStraightLineDepreciation(
      ctx.companyId,
      formStr(formData, "id"),
    );
    revalidatePath("/finance/assets");
    return asset;
  });
}

export async function actionClosePeriod(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("period:close");
    const period = await closeFiscalPeriod(ctx.companyId, formStr(formData, "id"));
    revalidatePath("/finance/periods");
    return period;
  });
}

export async function actionCreateTaxDoc(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("tax_document:create");
    const doc = await createTaxDocument({
      companyId: ctx.companyId,
      docType: formStr(formData, "docType") || "FAKTUR_KELUARAN",
      taxType: (formStr(formData, "taxType") || "PPN") as "PPN",
      partnerName: formStr(formData, "partnerName") || undefined,
      partnerNpwp: formStr(formData, "partnerNpwp") || undefined,
      dpp: formNum(formData, "dpp"),
      taxAmount: formNum(formData, "taxAmount"),
      taxPeriod: formStr(formData, "taxPeriod") || undefined,
      notes: formStr(formData, "notes") || undefined,
    });
    revalidatePath("/tax/documents");
    return doc;
  });
}

export async function actionCorrectTaxDoc(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("tax_document:correct");
    const doc = await correctTaxDocument({
      companyId: ctx.companyId,
      taxDocumentId: formStr(formData, "id"),
      dpp: formNum(formData, "dpp"),
      taxAmount: formNum(formData, "taxAmount"),
      notes: formStr(formData, "notes") || undefined,
    });
    revalidatePath("/tax/documents");
    return doc;
  });
}

export async function actionExportTax(formData: FormData) {
  return runFormAction(async () => {
    const ctx = await requirePermission("tax_export:generate");
    return exportTaxPeriod(ctx.companyId, formStr(formData, "taxPeriod"));
  });
}

export async function actionClearCompany() {
  await clearActiveCompanyId();
}

export async function getDashboardData() {
  const ctx = await requireTenant();
  const companyId = ctx.companyId;
  const [
    productCount,
    customerCount,
    supplierCount,
    openPo,
    openSo,
    stockRows,
    salesInvoices,
    supplierBills,
  ] = await Promise.all([
    prisma.product.count({ where: { companyId, isArchived: false } }),
    prisma.customer.count({ where: { companyId, isArchived: false } }),
    prisma.supplier.count({ where: { companyId, isArchived: false } }),
    prisma.purchaseOrder.count({
      where: {
        companyId,
        status: { in: ["APPROVED", "SENT", "PARTIALLY_RECEIVED"] },
      },
    }),
    prisma.salesOrder.count({
      where: {
        companyId,
        status: { in: ["APPROVED", "CONFIRMED", "PARTIALLY_DELIVERED"] },
      },
    }),
    prisma.stockBalance.findMany({
      where: { companyId },
      include: { product: true, warehouse: true },
      take: 10,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.salesInvoice.findMany({
      where: { companyId, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.supplierBill.findMany({
      where: { companyId, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    ctx,
    productCount,
    customerCount,
    supplierCount,
    openPo,
    openSo,
    stockRows,
    salesInvoices,
    supplierBills,
  };
}
