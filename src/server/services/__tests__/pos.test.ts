import { createPosOrder } from "../pos";
import { postStockMovement } from "../inventory";
const db = { posSession: { findFirst: jest.fn(async () => ({ id: "s" })) }, $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "POS/1") }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
it.each([false, true])("POS respects unrelated reservations unless company permits negative stock (%s)", async (allowNegativeStock) => {
  const tx = {
    company: { findUnique: jest.fn(async () => ({ allowNegativeStock })) },
    posOrder: { create: jest.fn(async () => ({ id: "o", number: "POS/1", items: [{ productId: "p", quantity: "10", unitPrice: "1" }] })) },
  };
  db.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
  jest.mocked(postStockMovement).mockImplementation(async (_, input) => {
    // onHand=10, reserved=10: POS owns no reservation to release.
    if (!input.allowNegative) throw new Error("Insufficient unreserved stock");
    return {} as Awaited<ReturnType<typeof postStockMovement>>;
  });
  const result = createPosOrder({ companyId: "c", userId: "u", sessionId: "s", warehouseId: "w", items: [{ productId: "p", quantity: 10, unitPrice: 1 }] });
  if (allowNegativeStock) await expect(result).resolves.toMatchObject({ id: "o" });
  else await expect(result).rejects.toThrow("Insufficient unreserved stock");
  expect(postStockMovement).toHaveBeenCalledWith(tx, expect.objectContaining({ allowNegative: allowNegativeStock }));
});
