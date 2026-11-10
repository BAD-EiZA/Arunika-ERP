import { postDeliveryOrder } from "../sales";
import { postFromRule } from "../accounting";
import { adjustReservation, postStockMovement } from "../inventory";

const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "DO/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
jest.mock("../notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(), adjustReservation: jest.fn() }));

beforeEach(() => jest.resetAllMocks());

it.each([false, true])("releases only actual warehouse reservations before protected stock movement (split=%s)", async (split) => {
  let reserved = 5;
  const reservations = split
    ? [{ id: "r1", warehouseId: "w", productId: "p", quantity: "1" }, { id: "r2", warehouseId: "w", productId: "p", quantity: "4" }]
    : [{ id: "r1", warehouseId: "w", productId: "p", quantity: "5" }];
  reservations.push({ id: "other", warehouseId: "other", productId: "p", quantity: "5" });
  const tx = {
    deliveryOrder: { findUnique: jest.fn(async () => null), create: jest.fn(async () => ({ id: "d", number: "DO/1", items: [{ productId: "p", quantityDelivered: "2" }] })) },
    salesOrder: { findFirst: jest.fn(async () => ({ id: "so", status: "APPROVED", customerId: "cu", company: { allowNegativeStock: false }, items: [{ id: "i", productId: "p", quantity: "5", quantityDelivered: "0" }], reservations })), update: jest.fn() },
    salesOrderItem: { update: jest.fn(), findMany: jest.fn(async () => [{ quantity: "5", quantityDelivered: "2" }]) },
    stockBalance: { findUnique: jest.fn(async () => ({ averageCost: "1" })) },
    stockReservation: { update: jest.fn() },
  };
  db.$transaction.mockImplementationOnce((fn: (client: typeof tx) => unknown) => fn(tx));
  jest.mocked(adjustReservation).mockImplementation(async (client, input) => {
    expect(client).toBe(tx);
    expect(input.warehouseId).toBe("w");
    reserved += Number(input.delta);
  });
  jest.mocked(postStockMovement).mockImplementation(async (client) => {
    expect(client).toBe(tx);
    if (5 - reserved < 2) throw new Error("Insufficient unreserved stock");
    return {} as Awaited<ReturnType<typeof postStockMovement>>;
  });
  await expect(postDeliveryOrder({ companyId: "c", userId: "u", salesOrderId: "so", warehouseId: "w", items: [{ productId: "p", quantityDelivered: 2 }] })).resolves.toMatchObject({ id: "d" });
  expect(reserved).toBe(3);
  expect(tx.stockReservation.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "other" } }));
});

it("full-reservation delivery succeeds when onHand equals reserved (regression: gate runs after release)", async () => {
  // Policy: SO's own reservation for this warehouse is released inside the same tx
  // BEFORE the outbound movement, so nextOnHand < reserved must not trip.
  const soReservations = [{ id: "r1", warehouseId: "w", productId: "p", quantity: "10" }];
  const tx = {
    deliveryOrder: { findUnique: jest.fn(async () => null), create: jest.fn(async () => ({ id: "d", number: "DO/1", items: [{ productId: "p", quantityDelivered: "10" }] })) },
    salesOrder: { findFirst: jest.fn(async () => ({ id: "so", status: "APPROVED", customerId: "cu", company: { allowNegativeStock: false }, items: [{ id: "i", productId: "p", quantity: "10", quantityDelivered: "0" }], reservations: soReservations })), update: jest.fn() },
    salesOrderItem: { update: jest.fn(), findMany: jest.fn(async () => [{ quantity: "10", quantityDelivered: "10" }]) },
    stockBalance: { findUnique: jest.fn(async () => ({ averageCost: "1" })) },
    stockReservation: { update: jest.fn() },
  };
  db.$transaction.mockImplementationOnce((fn: (client: typeof tx) => unknown) => fn(tx));
  let reserved = 10;
  jest.mocked(adjustReservation).mockImplementation(async (_, input) => { reserved += Number(input.delta); });
  jest.mocked(postStockMovement).mockImplementation(async (_, input) => {
    if (10 - Number(input.quantity) < reserved && !input.allowNegative) throw new Error("Insufficient unreserved stock");
    return {} as Awaited<ReturnType<typeof postStockMovement>>;
  });
  await expect(postDeliveryOrder({ companyId: "c", userId: "u", salesOrderId: "so", warehouseId: "w", items: [{ productId: "p", quantityDelivered: 10 }] })).resolves.toMatchObject({ id: "d" });
  const releaseCall = jest.mocked(adjustReservation).mock.calls[0];
  const movementCall = jest.mocked(postStockMovement).mock.calls[0];
  // Same transaction client and reservation released before movement is posted.
  expect(releaseCall?.[0]).toBe(movementCall?.[0]);
  expect(releaseCall?.[1].delta).toBe("-10");
  expect(jest.mocked(adjustReservation).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(postStockMovement).mock.invocationCallOrder[0]);
  expect(movementCall?.[1].allowNegative).toBe(false);
});

it("delivery COGS is rounded to 2dp at source (4dp averageCost)", async () => {
  const tx = {
    deliveryOrder: { findUnique: jest.fn(async () => null), create: jest.fn(async () => ({ id: "d", number: "DO/1", items: [{ productId: "p", quantityDelivered: "3" }] })) },
    salesOrder: { findFirst: jest.fn(async () => ({ id: "so", status: "APPROVED", customerId: "cu", company: { allowNegativeStock: false }, items: [{ id: "i", productId: "p", quantity: "3", quantityDelivered: "0" }], reservations: [] })), update: jest.fn() },
    salesOrderItem: { update: jest.fn(), findMany: jest.fn(async () => [{ quantity: "3", quantityDelivered: "3" }]) },
    stockBalance: { findUnique: jest.fn(async () => ({ averageCost: "0.1234" })) },
    stockReservation: { update: jest.fn() },
  };
  db.$transaction.mockImplementationOnce((fn: (client: typeof tx) => unknown) => fn(tx));
  jest.mocked(postStockMovement).mockImplementation(async () => ({}) as Awaited<ReturnType<typeof postStockMovement>>);
  await expect(postDeliveryOrder({ companyId: "c", userId: "u", salesOrderId: "so", warehouseId: "w", items: [{ productId: "p", quantityDelivered: 3 }] })).resolves.toMatchObject({ id: "d" });
  expect(jest.mocked(postFromRule).mock.calls.at(-1)?.[1].amount).toBe("0.37");
});
