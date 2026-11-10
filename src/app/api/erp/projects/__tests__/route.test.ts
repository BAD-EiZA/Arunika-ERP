jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(), assertRequestAccess: jest.fn() }));
jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/server/services/projects", () => ({ billProjectSource: jest.fn(async () => ({})) }));
import { POST } from "../route";
import { requirePermission } from "@/lib/auth";
import { forbidden } from "@/lib/errors";
import { billProjectSource } from "@/server/services/projects";
beforeEach(() => jest.clearAllMocks());
it.each(["project_billing:create", "invoice:issue"])("billing rejects missing %s", async missing => {
 jest.mocked(requirePermission).mockImplementation(async permissions => {
  if ([permissions].flat().includes(missing as "invoice:issue")) throw forbidden();
  return { companyId: "c", user: { id: "u" } } as Awaited<ReturnType<typeof requirePermission>>;
 });
 const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ action: "bill" }) }));
 expect(response.status).toBe(403);
 expect(billProjectSource).not.toHaveBeenCalled();
});
