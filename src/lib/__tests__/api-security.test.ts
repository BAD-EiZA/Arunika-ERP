jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(), requireTenant: jest.fn(), assertResourceAccess: jest.fn(), requireIdempotencyKey: jest.fn() }));
jest.mock("@/lib/db", () => ({ prisma: { portalToken: { findMany: jest.fn() }, employee: { findMany: jest.fn() }, attendanceRecord: { findMany: jest.fn() }, leaveRequest: { findMany: jest.fn() } } }));
jest.mock("@/server/services/portal", () => ({}));
jest.mock("@/server/services/hr", () => ({}));
import { requirePermission, requireTenant, assertResourceAccess, requireIdempotencyKey } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET as portalGet } from "@/app/api/erp/portal/route";
import { GET as hrGet } from "@/app/api/erp/hr/route";

const ctx = { companyId: "company", permissions: new Set(["employee:view"]) };
beforeEach(() => jest.resetAllMocks());
const silent = jest.spyOn(console, "error").mockImplementation(() => {});
afterAll(() => silent.mockRestore());

test("portal token listing requires settings:manage", async () => {
  (requirePermission as jest.Mock).mockRejectedValueOnce(new Error("denied"));
  const res = await portalGet(new Request("http://localhost/api/erp/portal"));
  expect(res.ok).toBe(false);
  expect(prisma.portalToken.findMany).not.toHaveBeenCalled();
  expect(requireTenant).not.toHaveBeenCalled();
});

test("HR list does not reveal base salary without sensitive permission", async () => {
  (requirePermission as jest.Mock).mockResolvedValue(ctx);
  (prisma.employee.findMany as jest.Mock).mockResolvedValue([{ id: "e", code: "E", name: "N", email: null, position: null, baseSalary: { toString: () => "SECRET" }, isActive: true }]);
  (prisma.attendanceRecord.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue([]);
  const res = await hrGet();
  expect(JSON.stringify(await res.json())).not.toContain("SECRET");
});
