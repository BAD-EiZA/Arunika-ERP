import { issueInvoiceFromDelivery } from "../sales";
const db = { $transaction: jest.fn(), customer: { findFirst: jest.fn(async () => ({ creditLimit: null })) } };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "INV/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
jest.mock("../notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(), adjustReservation: jest.fn() }));
const input = { companyId: "c", userId: "u", deliveryOrderId: "d", idempotencyKey: "retry-1" };
let stored: Record<string, unknown> | null;
const events: string[] = [];
const tx = {
  $queryRaw: jest.fn(async () => { events.push("lock"); return []; }),
  salesInvoice: {
    findUnique: jest.fn(async () => { events.push("lookup"); return stored; }),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => [stored, { id: "second", installmentNo: 2 }]),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const invoice = { id: "invoice", ...data, items: [] };
      if (data.idempotencyKey) stored = invoice;
      return invoice;
    }),
  },
  deliveryOrder: { findFirst: jest.fn(async () => ({ id: "d", status: "POSTED", customerId: "p", salesOrderId: "s", items: [], salesOrder: { items: [], paymentTermDays: 30 } })) },
};
beforeEach(() => {
  jest.clearAllMocks(); stored = null; events.length = 0;
  db.$transaction.mockImplementation(async (fn: (value: typeof tx) => unknown) => fn(tx));
});
it("persists invoice key and canonical hash; replay never issues twice", async () => {
  const first = await issueInvoiceFromDelivery(input);
  expect(first).toMatchObject({ idempotencyKey: "retry-1", requestHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  const replay = await issueInvoiceFromDelivery({ ...input, taxRate: "0.00", exchangeRate: "1.00", currency: "IDR", installments: 1 });
  expect(replay).toBe(first);
  expect(events.slice(0, 2)).toEqual(["lock", "lookup"]);
  expect(tx.salesInvoice.create).toHaveBeenCalledTimes(1);
});
it("returns 409 when same invoice key changes any effective payload field", async () => {
  await issueInvoiceFromDelivery(input);
  for (const changed of [{ deliveryOrderId: "other" }, { taxRate: 11 }, { currency: "USD" }, { exchangeRate: 2 }, { installments: 2 }]) {
    await expect(issueInvoiceFromDelivery({ ...input, ...changed })).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  }
  expect(tx.salesInvoice.create).toHaveBeenCalledTimes(1);
});
it("replays all installments with one request key on the first invoice", async () => {
  await issueInvoiceFromDelivery({ ...input, installments: 2 });
  const replay = await issueInvoiceFromDelivery({ ...input, installments: 2 });
  expect(replay).toHaveLength(2);
  expect(tx.salesInvoice.create).toHaveBeenCalledTimes(2);
  expect(tx.salesInvoice.create.mock.calls[1][0].data.idempotencyKey).toBeUndefined();
});
