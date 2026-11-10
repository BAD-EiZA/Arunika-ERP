import { postCustomerPayment } from "../sales";
import { postSupplierPayment } from "../procurement";

const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/document-number", () => ({ nextDocumentNumber: jest.fn(async () => "PAY/1") }));
jest.mock("../accounting", () => ({ postFromRule: jest.fn() }));
jest.mock("../notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(), adjustReservation: jest.fn() }));

for (const kind of ["customer", "supplier"] as const) {
  const customer = kind === "customer";
  const paymentModel = customer ? "customerPayment" : "supplierPayment";
  const documentModel = customer ? "salesInvoice" : "supplierBill";
  const partner = customer ? "customerId" : "supplierId";
  const doc = customer ? "invoiceId" : "billId";
  // Both services share the payment contract, with different partner/document names.
  const post = (input: Record<string, unknown>) => customer
    ? postCustomerPayment(input as Parameters<typeof postCustomerPayment>[0])
    : postSupplierPayment(input as Parameters<typeof postSupplierPayment>[0]);
  const input = { companyId: "c", userId: "u", [partner]: "p", amount: 10,
    reference: "customer supplied reference", idempotencyKey: "retry-1",
    allocations: [{ [doc]: "b", amount: 4 }, { [doc]: "a", amount: 6 }] };

  describe(`${kind} payment idempotency`, () => {
    let stored: Record<string, unknown> | null;
    const events: string[] = [];
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      stored = { id: "payment", ...data }; return stored;
    });
    const findUnique = jest.fn(async () => { events.push("lookup"); return stored; });
    const tx = {
      $queryRaw: jest.fn(async () => { events.push("lock"); return []; }),
      [paymentModel]: { create, findUnique, findFirst: jest.fn(async () => stored) },
      [documentModel]: {
        findFirst: jest.fn(async () => ({ id: "d", [partner]: "p", status: "OPEN", balance: "100", amountPaid: "0" })),
        update: jest.fn(),
      },
    };
    beforeEach(() => {
      jest.clearAllMocks(); stored = null; events.length = 0;
      db.$transaction.mockImplementation(async (fn: (value: typeof tx) => unknown) => fn(tx));
    });

    it("preserves reference and persists a dedicated key and SHA-256 payload hash", async () => {
      const result = await post(input);
      expect(result).toMatchObject({ reference: input.reference, idempotencyKey: "retry-1", requestHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(events.slice(0, 2)).toEqual(["lock", "lookup"]);
      expect(findUnique).toHaveBeenCalledWith({ where: { companyId_idempotencyKey: { companyId: "c", idempotencyKey: "retry-1" } } });
    });

    it("reuses key despite reordered allocations and normalized money", async () => {
      const first = await post(input);
      const second = await post({ ...input, amount: "10.00", allocations: [{ [doc]: "a", amount: "6.00" }, { [doc]: "b", amount: "4.00" }] });
      expect(second).toBe(first);
      expect(create).toHaveBeenCalledTimes(1);
      expect(tx[documentModel].update).toHaveBeenCalledTimes(2);
    });

    it("rejects same company key with changed partner, amount, method, reference or allocation", async () => {
      await post(input);
      for (const changed of [
        { [partner]: "other" },
        { amount: 11, allocations: [{ [doc]: "a", amount: 7 }, { [doc]: "b", amount: 4 }] },
        { method: "CASH" },
        { reference: "other" },
        { allocations: [{ [doc]: "b", amount: 5 }, { [doc]: "a", amount: 5 }] },
      ]) {
        await expect(post({ ...input, ...changed })).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
      }
      expect(create).toHaveBeenCalledTimes(1);
    });

    it("does not persist key or hash when no key supplied", async () => {
      await post({ ...input, idempotencyKey: undefined });
      expect(stored).toMatchObject({ reference: input.reference });
      expect(stored?.idempotencyKey).toBeUndefined();
      expect(stored?.requestHash).toBeUndefined();
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });
}
