import { createHash } from "node:crypto";
import { createSalesOrder, postCustomerPayment, postDeliveryOrder, issueInvoiceFromDelivery } from "../sales";
import { adjustReservation } from "../inventory";
const db = { $transaction: jest.fn(), customer: { findFirst: jest.fn(async () => ({ id: "cu" })) } };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "DOC/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
jest.mock("../notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(), adjustReservation: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
it("customer payment reuses stable key", async()=>{
 const existing={id:"cp-existing",requestHash:createHash("sha256").update(JSON.stringify({partnerId:"cu",amount:"10.00",method:"BANK_TRANSFER",reference:null,allocations:[["i","10.00"]]})).digest("hex")};
 db.$transaction.mockImplementationOnce((fn: (tx: Record<string, unknown>) => Promise<unknown>)=>fn({$queryRaw:jest.fn(async()=>[]),customerPayment:{findUnique:jest.fn(async()=>existing),create:jest.fn()}}));
 await expect(postCustomerPayment({companyId:"c",userId:"u",customerId:"cu",amount:10,allocations:[{invoiceId:"i",amount:10}],idempotencyKey:"retry-1"})).resolves.toEqual(existing);
});
it("rejects duplicate sales product lines before persistence", async () => {
  await expect(createSalesOrder({ companyId: "c", userId: "u", customerId: "cu", items: [
    { productId: "p", quantity: 1, unitPrice: 1 }, { productId: "p", quantity: 1, unitPrice: 1 },
  ] })).rejects.toThrow("Produk duplikat");
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("rejects invoicing a delivery twice", async () => {
  db.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
    fn({
      $queryRaw: jest.fn(async () => []),
      deliveryOrder: { findFirst: jest.fn(async () => ({ id: "d", status: "POSTED", customerId: "cu", salesOrderId: "so", items: [], salesOrder: { paymentTermDays: 0, items: [], customer: { id: "cu" } } })) },
      salesInvoice: { findFirst: jest.fn(async () => ({ id: "existing" })), create: jest.fn() },
      salesOrderItem: { update: jest.fn() },
    }),
  );
  await expect(issueInvoiceFromDelivery({ companyId: "c", userId: "u", deliveryOrderId: "d" }))
    .rejects.toThrow("Delivery sudah difakturkan");
});

it("delivery keeps reservations when reserve disabled or other warehouse", async () => {
  // reserveOnSoApprove=false: decrementing reserved is wrong — must not call adjustReservation
  db.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
    fn({
      deliveryOrder: { findUnique: jest.fn(async () => null), create: jest.fn(async () => ({ id: "do1", number: "DO/1", items: [{ productId: "p1", quantityDelivered: "2" }] })) },
      salesOrder: { findFirst: jest.fn(async () => ({ id: "so", status: "APPROVED", customerId: "cu", company: { allowNegativeStock: false, settings: { reserveOnSoApprove: false } }, warehouseId: "wA", items: [{ id: "soi1", productId: "p1", quantity: "5", quantityDelivered: "0", unitPrice: "100" }], reservations: [] })), update: jest.fn(async () => ({})) },
      salesOrderItem: { update: jest.fn(), findMany: jest.fn(async () => [{ quantity: "5", quantityDelivered: "2" }]) },
      stockBalance: { findUnique: jest.fn(async () => null) },
      stockReservation: { update: jest.fn() },
    }),
  );
  await postDeliveryOrder({ companyId: "c", userId: "u", salesOrderId: "so", warehouseId: "wB", items: [{ productId: "p1", quantityDelivered: 2 }] });
  expect(adjustReservation).not.toHaveBeenCalled();
});

it("rejects payment with wrong partner, negative allocation, or bad status invoice", async () => {
  // negative/zero individual allocation
  await expect(postCustomerPayment({ companyId: "c", userId: "u", customerId: "cu", amount: 100, allocations: [{ invoiceId: "i", amount: -10 }, { invoiceId: "j", amount: 110 }] }))
    .rejects.toThrow("Alokasi harus > 0");

  db.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
    fn({
      customerPayment: { create: jest.fn(async () => ({ id: "cp1", number: "CP/1" })) },
      salesInvoice: { findFirst: jest.fn(async () => ({ id: "i", customerId: "OTHER", status: "PAID", balance: "100", amountPaid: "0", total: "100" })), update: jest.fn() },
    }),
  );
  await expect(postCustomerPayment({ companyId: "c", userId: "u", customerId: "cu", amount: 100, allocations: [{ invoiceId: "i", amount: 100 }] }))
    .rejects.toThrow(/Pelanggan invoice tidak sesuai|tidak bisa dibayar/);
});
