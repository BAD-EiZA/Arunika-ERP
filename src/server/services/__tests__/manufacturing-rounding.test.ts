import { completeProductionOrder } from "../manufacturing";
import { postFromRule } from "../accounting";
import { money } from "@/lib/money";
const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn() }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
it("allocates 100 across three partial completions in cents, final batch carries residual", async () => {
  const order = { id: "o", number: "MO/1", status: "IN_PROGRESS", plannedQty: "3", completedQty: "0", laborCost: "0", overheadCost: "0", finishedProductId: "fg", company: { allowNegativeStock: false }, materials: [{ issuedQty: "1", plannedQty: "1", totalCost: "100" }] };
  let received = money(0);
  const amounts: string[] = [];
  const tx = {
    productionOrder: { findFirst: jest.fn(async () => order), update: jest.fn(async ({ data }) => { order.completedQty = data.completedQty; return order; }) },
    productionCostEntry: {
      aggregate: jest.fn(async () => ({ _sum: { amount: received.toString() } })),
      create: jest.fn(async ({ data }) => { received = received.plus(data.amount); }),
    },
  };
  db.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
  jest.mocked(postFromRule).mockImplementation(async (_, input) => {
    expect(money(input.amount).decimalPlaces()).toBeLessThanOrEqual(2);
    amounts.push(String(input.amount));
    return null;
  });
  for (let i = 0; i < 3; i++) await completeProductionOrder({ companyId: "c", userId: "u", productionOrderId: "o", warehouseId: "w", quantity: 1 });
  expect(amounts).toEqual(["33.33", "33.34", "33.33"]);
  expect(received.toString()).toBe("100");
});
