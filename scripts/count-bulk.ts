import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const company = await prisma.company.findFirst({
    where: { code: "123" },
  });
  if (!company) throw new Error("company 123 not found");
  const cid = company.id;
  const s = {
    company: company.name,
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
    attendance: await prisma.attendanceRecord.count({ where: { companyId: cid } }),
    aiInsights: await prisma.aiInsight.count({ where: { companyId: cid } }),
  };
  console.log(JSON.stringify(s, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
