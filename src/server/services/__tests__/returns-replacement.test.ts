import { replaceSalesReturn } from "../returns";
import { postStockMovement } from "../inventory";
import { postJournal } from "../accounting";

const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(), assertWarehouseOwnership: jest.fn() }));
jest.mock("../accounting", () => ({ postJournal: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it("menolak replacement karena DO wajib SO; tidak mengubah fulfillment, stok, atau COGS", async () => {
  const tx = {
    $executeRaw: jest.fn(),
    salesReturn: { findFirst: jest.fn(async () => ({
      id: "r", companyId: "c", status: "POSTED", approvedById: "manager", inspectedAt: new Date(),
      items: [{ id: "i", productId: "p", quantity: "1", historicalUnitCost: "10" }],
    })), update: jest.fn() },
    deliveryOrder: { create: jest.fn() },
    salesOrder: { update: jest.fn() },
    salesOrderItem: { update: jest.fn() },
  };
  db.$transaction.mockImplementationOnce((fn: (tx: unknown) => unknown) => fn(tx));
  await expect(replaceSalesReturn({ companyId: "c", userId: "u", id: "r", targetWarehouseId: "main" }))
    .rejects.toThrow("DeliveryOrder.salesOrderId wajib; replacement tidak boleh memakai fulfillment SO sumber");
  expect(tx.deliveryOrder.create).not.toHaveBeenCalled();
  expect(tx.salesOrder.update).not.toHaveBeenCalled();
  expect(tx.salesOrderItem.update).not.toHaveBeenCalled();
  expect(tx.salesReturn.update).not.toHaveBeenCalled();
  expect(postStockMovement).not.toHaveBeenCalled();
  expect(postJournal).not.toHaveBeenCalled();
});
