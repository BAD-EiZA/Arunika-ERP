jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/db", () => ({ prisma: { user: { findUnique: jest.fn() }, membership: { findMany: jest.fn() } } }));
jest.mock("@kinde-oss/kinde-auth-nextjs/server", () => ({ getKindeServerSession: jest.fn() }));

import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { prisma } from "@/lib/db";
import { getTenantContext } from "../auth";

const env = { ...process.env };
beforeEach(() => {
  jest.resetAllMocks();
  process.env.MOCK_AUTH = "false";
  (getKindeServerSession as jest.Mock).mockReturnValue({
    isAuthenticated: async () => true,
    getUser: async () => ({ id: "identity", email: "member@example.test" }),
  });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "u", kindeUserId: "identity", isActive: true });
});
afterEach(() => { process.env = { ...env }; });

function role(code: string, isSystem = false, isActive = true) {
  (prisma.membership.findMany as jest.Mock).mockResolvedValue([{
    id: "m", companyId: "c", company: { isActive: true }, branchAccess: [], warehouseAccess: [],
    role: { code, isSystem, isActive, permissions: [{ permission: { code: "sales.view" } }] },
  }]);
}

test.each(["OWNER", "ADMIN", "SALES"])("custom %s uses only linked permissions", async code => {
  role(code);
  expect((await getTenantContext("c"))?.permissions).toEqual(new Set(["sales.view"]));
});

test.each([true, false])("inactive role denies tenant context (system=%s)", async isSystem => {
  role("OWNER", isSystem, false);
  expect(await getTenantContext("c")).toBeNull();
});

test("active system owner retains built-in permissions", async () => {
  role("OWNER", true);
  expect((await getTenantContext("c"))?.permissions).toBe("*");
});
