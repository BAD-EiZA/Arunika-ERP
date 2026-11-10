jest.mock("next/headers", () => ({ cookies: jest.fn(async () => ({ set: jest.fn() })) }));
jest.mock("@kinde-oss/kinde-auth-nextjs/server", () => ({ getKindeServerSession: jest.fn() }));
const db = {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  user: { upsert: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  membership: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  invitation: { create: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
  role: { findFirst: jest.fn() }, auditLog: { create: jest.fn() },
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
import { cookies } from "next/headers";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { inviteMember } from "@/server/services/memberships";
import { POST } from "@/app/api/erp/users/redeem/route";
import { getSessionUser, type TenantContext } from "@/lib/auth";
const ctx = { companyId: "co", user: { id: "admin" }, permissions: "*", branchIds: [], warehouseIds: [] } as unknown as TenantContext;
let user: { id: string; email: string; kindeUserId: string | null; isActive: boolean };
let member: { id: string; status: string } | null;
let invite: Record<string, unknown> | null;
let verified: boolean;
beforeEach(() => {
  jest.resetAllMocks(); process.env.MOCK_AUTH = "false";
  (cookies as jest.Mock).mockResolvedValue({ set: jest.fn() });
  user = { id: "new", email: "new@test.id", kindeUserId: null, isActive: true }; member = null; invite = null; verified = true;
  (getKindeServerSession as jest.Mock).mockReturnValue({ isAuthenticated: async () => true, getUser: async () => ({ id: "kinde-new", email: user.email }), getIdToken: async () => ({ sub: "kinde-new", email: user.email, email_verified: verified }) });
  db.$transaction.mockImplementation(fn => fn(db));
  db.role.findFirst.mockResolvedValue({ id: "role", code: "STAFF", permissions: [] });
  db.user.upsert.mockImplementation(async () => user);
  db.user.findUnique.mockImplementation(async ({ where }) => where.email === user.email || where.kindeUserId === user.kindeUserId ? user : null);
  db.user.updateMany.mockImplementation(async () => { user.kindeUserId = "kinde-new"; return { count: 1 }; });
  db.membership.create.mockImplementation(async () => { member = { id: "member", status: "INVITED" }; return member; });
  db.membership.findUnique.mockImplementation(async () => member);
  db.membership.updateMany.mockImplementation(async () => { member!.status = "ACTIVE"; return { count: 1 }; });
  db.invitation.create.mockImplementation(async ({ data }) => { invite = { id: "invite", ...data, company: { isActive: true } }; return invite; });
  db.invitation.findFirst.mockImplementation(async ({ where }) => invite?.token === where.token ? invite : null);
  db.invitation.updateMany.mockImplementation(async ({ where, data }) => { if (where.id && invite?.status === "INVITED") { invite.status = data.status; return { count: 1 }; } return { count: 0 }; });
});
afterEach(() => { delete process.env.MOCK_AUTH; });
async function produce() {
  const result = await inviteMember(ctx, { email: user.email, roleId: "role", branchIds: [], warehouseIds: [] });
  return new URLSearchParams(new URL(result.inviteLink, "https://example.com").hash.slice(1)).get("token");
}
function consume(token: string | null) { return POST(new Request("https://example.com/api/erp/users/redeem", { method: "POST", body: JSON.stringify({ token }) })); }
it("claims a brand-new invited identity through the real producer and POST consumer, rejects replay", async () => {
  const token = await produce();
  expect((await consume(token)).status).toBe(200);
  expect(user.kindeUserId).toBe("kinde-new"); expect(member?.status).toBe("ACTIVE");
  expect(await getSessionUser()).toMatchObject({ id: "new", kindeUserId: "kinde-new" });
  expect((await consume(token)).status).not.toBe(200);
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "membership.accept", userId: "new" }) }));
});
it.each(["bound", "expired", "unverified", "token-mismatch"])("rejects %s without binding or activation", async reason => {
  const token = await produce();
  if (reason === "bound") user.kindeUserId = "another-kinde";
  if (reason === "expired") invite!.expiresAt = new Date(0);
  if (reason === "unverified") verified = false;
  expect((await consume(reason === "token-mismatch" ? "0".repeat(64) : token)).status).not.toBe(200);
  expect(db.user.updateMany).not.toHaveBeenCalled(); expect(db.membership.updateMany).not.toHaveBeenCalled();
});
