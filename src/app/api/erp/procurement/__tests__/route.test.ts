jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(), assertRequestAccess: jest.fn() }));
jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/server/services/procurement", () => ({ createPurchaseOrder: jest.fn(async () => ({})) }));
import { POST } from "../route";
import { requirePermission } from "@/lib/auth";
import { createPurchaseOrder } from "@/server/services/procurement";
beforeEach(() => { jest.clearAllMocks(); jest.mocked(requirePermission).mockResolvedValue({ companyId: "c", user: { id: "u" } } as Awaited<ReturnType<typeof requirePermission>>); });
it.each([undefined, "", "   "])("call-off rejects missing/blank contractId %p before service", async contractId => {
 const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ action: "call_off", contractId, items: [] }) }));
 expect(response.status).toBe(422);
 expect(createPurchaseOrder).not.toHaveBeenCalled();
});
