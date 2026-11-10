import { postDeliveryOrder } from "../sales";
import { postGoodsReceipt } from "../procurement";
const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "DOC/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
jest.mock("../notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(), adjustReservation: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
describe.each(["DO", "GR"])("%s payload-bound replay", kind => {
 it("persists hash; identical replay returns original; changed fields reject 409", async () => {
  let stored: Record<string, unknown> | null = null;
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => { stored = { id: "doc", ...data, items: [] }; return stored; });
  const delegate = { findUnique: jest.fn(async () => stored), create };
  const tx = {
   deliveryOrder: delegate, goodsReceipt: delegate,
   salesOrder: { findFirst: async () => ({ id: "so", customerId: "cu", status: "APPROVED", items: [{ productId: "p", quantity: "2", quantityDelivered: "0" }], reservations: [] }), update: jest.fn() },
   purchaseOrder: { findFirst: async () => ({ id: "po", supplierId: "su", status: "APPROVED", items: [{ productId: "p", quantity: "2", quantityReceived: "0", unitPrice: "10" }] }), update: jest.fn() },
   salesOrderItem: { findMany: async () => [], update: jest.fn() }, purchaseOrderItem: { findMany: async () => [], update: jest.fn() },
  };
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
  const input = { companyId: "c", userId: "u", salesOrderId: "so", purchaseOrderId: "po", warehouseId: "w", idempotencyKey: "key", notes: "original", supplierDeliveryNote: "supplier-note", items: [{ productId: "p", quantityDelivered: "1", quantityReceived: "1", unitCost: "10" }] };
  const post = (value: typeof input) => kind === "DO" ? postDeliveryOrder(value) : postGoodsReceipt(value);
  const first = await post(input);
  expect(first).toMatchObject({ requestHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(await post(input)).toBe(first);
  const changes = [{ warehouseId: "other" }, { notes: "changed" }, { salesOrderId: "other", purchaseOrderId: "other" }, { items: [{ productId: "p", quantityDelivered: "2", quantityReceived: "2", unitCost: "10" }] }, { items: [{ productId: "other", quantityDelivered: "1", quantityReceived: "1", unitCost: "10" }] }];
  if (kind === "GR") changes.push({ supplierDeliveryNote: "different" } as typeof changes[number], { items: [{ productId: "p", quantityDelivered: "1", quantityReceived: "1", unitCost: "20" }] });
  for (const change of changes) await expect(post({ ...input, ...change })).rejects.toMatchObject({ status: 409 });
  expect(create).toHaveBeenCalledTimes(1);
 });
 it("rejects legacy records without a verifiable hash", async () => {
  const delegate = { findUnique: async () => ({ id: "legacy" }) };
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ deliveryOrder: delegate, goodsReceipt: delegate }));
  const input = { companyId: "c", userId: "u", salesOrderId: "so", purchaseOrderId: "po", warehouseId: "w", idempotencyKey: "key", items: [] };
  await expect(kind === "DO" ? postDeliveryOrder(input) : postGoodsReceipt(input)).rejects.toMatchObject({ status: 409 });
 });
});
