jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(), assertRequestAccess: jest.fn(), assertResourceAccess: jest.fn() }));
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/server/services/payroll", () => ({ settlePayrollDisbursement: jest.fn(async () => ({ id: "d" })) }));
import { POST } from "../route";
import { requirePermission, assertResourceAccess } from "@/lib/auth";
import { forbidden } from "@/lib/errors";
import { settlePayrollDisbursement } from "@/server/services/payroll";
const ctx = { companyId: "c", user: { id: "u" } };
const db = { account: { findFirst: jest.fn(async () => ({ id: "gl" })) }, payrollDisbursement: { findFirst: jest.fn(async () => ({ bankAccountCode: "1101" })) }, bankAccount: { findFirst: jest.fn(async () => ({ id: "bank" })) } };
const request = () => new Request("http://localhost", { method: "POST", body: JSON.stringify({ action: "settleDisbursement", id: "d" }) });
beforeEach(() => jest.clearAllMocks());
it.each(["payroll:approve", "payroll:post"])("settlement rejects users missing %s", async missing => {
  jest.mocked(requirePermission).mockImplementation(async permissions => {
    if ([permissions].flat().includes(missing as "payroll:post")) throw forbidden();
    return ctx as Awaited<ReturnType<typeof requirePermission>>;
  });
  expect((await POST(request())).status).toBe(403);
  expect(settlePayrollDisbursement).not.toHaveBeenCalled();
});
it("checks access to the persisted bank before settlement", async () => {
  jest.mocked(requirePermission).mockResolvedValue(ctx as Awaited<ReturnType<typeof requirePermission>>);
  jest.mocked(assertResourceAccess).mockRejectedValueOnce(forbidden());
  expect((await POST(request())).status).toBe(403);
  expect(assertResourceAccess).toHaveBeenCalledWith(ctx, "bankAccount", "bank");
  expect(settlePayrollDisbursement).not.toHaveBeenCalled();
});
