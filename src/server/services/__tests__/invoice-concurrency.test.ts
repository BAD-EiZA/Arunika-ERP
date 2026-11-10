import { issueInvoiceFromDelivery } from "../sales";
const db = { $transaction: jest.fn(), customer: { findFirst: jest.fn(async () => ({ creditLimit: null })) } };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "INV/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
jest.mock("../notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("../inventory", () => ({}));
it("concurrent invoices for different deliveries serialize SO reads and preserve both increments", async () => {
 let invoiced = 0;
 let tail = Promise.resolve();
 const reads: number[] = [];
 const locks: string[] = [];
 db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
  let release: (() => void) | undefined;
  const tx = {
   $queryRaw: async (sql: TemplateStringsArray) => {
    if (!sql.join("").includes("FOR UPDATE")) return [];
    locks.push(sql.join(""));
    const previous = tail;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return [];
   },
   deliveryOrder: { findFirst: async () => {
    reads.push(invoiced);
    const snapshot = invoiced;
    await Promise.resolve();
    return { id: `d${reads.length}`, status: "POSTED", customerId: "p", salesOrderId: "so", items: [{ productId: "p", quantityDelivered: "1" }], salesOrder: { items: [{ id: "si", productId: "p", quantityDelivered: "2", quantityInvoiced: String(snapshot), unitPrice: "10" }], paymentTermDays: 30 } };
   } },
   salesInvoice: { findUnique: async () => null, findFirst: async () => null, create: async ({ data }: { data: { items: { create: unknown[] } } }) => ({ id: "i", ...data, items: data.items.create }) },
   salesOrderItem: { update: async ({ data }: { data: { quantityInvoiced: string } }) => { invoiced = Number(data.quantityInvoiced); } },
  };
  try { return await fn(tx); } finally { release?.(); }
 });
 await Promise.all(["d1", "d2"].map(deliveryOrderId => issueInvoiceFromDelivery({ companyId: "c", userId: "u", deliveryOrderId, idempotencyKey: deliveryOrderId })));
 expect(locks).toHaveLength(2);
 expect(reads).toEqual([0, 1]);
 expect(invoiced).toBe(2);
});
