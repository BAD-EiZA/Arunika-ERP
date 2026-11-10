jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(async () => ctx), assertRequestAccess: jest.fn(), requireIdempotencyKey: jest.fn() }));
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/server/services/sales", () => ({ issueInvoiceFromDelivery: jest.fn() }));
import { POST } from "../route";
import { requireIdempotencyKey, requirePermission } from "@/lib/auth";
import { validationError } from "@/lib/errors";
import { issueInvoiceFromDelivery } from "@/server/services/sales";

const ctx = { companyId: "c", user: { id: "u" }, branchIds: [], warehouseIds: [] };
const db = {};
const body = JSON.stringify({ deliveryOrderId: "d" });
it("requires Idempotency-Key and forwards it to the service", async () => {
  (requireIdempotencyKey as jest.Mock).mockReturnValueOnce("attempt-123");
  (issueInvoiceFromDelivery as jest.Mock).mockResolvedValueOnce({ id: "i", number: "INV/1", total: "0", status: "ISSUED", installmentNo: null, installmentOf: null });
  const response = await POST(new Request("http://localhost", { method: "POST", body, headers: { "Idempotency-Key": "attempt-123" } }));
  expect(requirePermission).toHaveBeenCalledWith("invoice:issue");
  expect(requireIdempotencyKey).toHaveBeenCalled();
  expect(issueInvoiceFromDelivery).toHaveBeenCalledWith(expect.objectContaining({ companyId: "c", idempotencyKey: "attempt-123" }));
  expect(response.status).toBe(200);
});
it("rejects missing key with 4xx before touching the service", async () => {
  (requireIdempotencyKey as jest.Mock).mockImplementationOnce(() => { throw validationError("Idempotency-Key wajib"); });
  const response = await POST(new Request("http://localhost", { method: "POST", body }));
  expect(response.status).toBe(422);
  expect(issueInvoiceFromDelivery).not.toHaveBeenCalled();
});
