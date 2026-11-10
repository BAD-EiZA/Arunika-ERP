import { createHash } from "node:crypto";
import { inviteMember, redeemInvitation, changeMembership, resendInvitation } from "@/server/services/memberships";
import type { TenantContext } from "@/lib/auth";

const db = {
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
  role: { findFirst: jest.fn() },
  user: { upsert: jest.fn(), findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  membership: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
  invitation: { updateMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
  membershipBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
  membershipWarehouse: { deleteMany: jest.fn(), createMany: jest.fn() },
  branch: { count: jest.fn() }, warehouse: { count: jest.fn() },
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
export const ctx: TenantContext = { companyId: "co", membershipId: "actor", user: { id: "admin", email: "admin@test.id", name: null, kindeUserId: "k" }, roleCode: "OWNER", permissions: "*", branchIds: [], warehouseIds: [] };
beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.role.findFirst.mockResolvedValue({ id: "role", code: "STAFF", permissions: [] });
  db.user.upsert.mockResolvedValue({ id: "new-user" });
  db.user.findUnique.mockResolvedValue({ id: "admin", isActive: true, kindeUserId: "k" });
  db.membership.create.mockResolvedValue({ id: "member" });
  db.invitation.create.mockImplementation(({ data }) => ({ id: "invite", ...data }));
});
it("issues an expiring random invite, stores only its digest", async () => {
  const before = Date.now();
  const result = await inviteMember(ctx, { email: " NEW@Test.id ", roleId: "role", branchIds: [], warehouseIds: [] });
  const token = result.inviteLink.split("token=")[1];
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(db.invitation.create.mock.calls[0][0].data).toMatchObject({ email: "new@test.id", token: createHash("sha256").update(token).digest("hex"), status: "INVITED" });
  expect(result.expiresAt.getTime()).toBeGreaterThan(before);
  expect(result.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 72 * 3600000);
  expect(result.delivery).toBe("MANUAL");
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "membership.invite", userId: ctx.user.id }) }));
});
it.each(["expired", "wrong-email", "used", "missing", "disabled-member"])("rejects %s redemption", async (reason) => {
  db.invitation.findFirst.mockResolvedValue(reason === "missing" ? null : { id: "i", companyId: "co", email: reason === "wrong-email" ? "other@test.id" : ctx.user.email, roleId: "role", status: reason === "used" ? "ACTIVE" : "INVITED", expiresAt: new Date(Date.now() + (reason === "expired" ? -1 : 100000)), company: { isActive: true } });
  db.membership.findUnique.mockResolvedValue({ id: "member", status: reason === "disabled-member" ? "DISABLED" : "INVITED" });
  await expect(redeemInvitation({ email: ctx.user.email, kindeUserId: "k" }, "a".repeat(64))).rejects.toThrow();
});
it("redeems only once for matching authenticated email", async () => {
  db.invitation.findFirst.mockResolvedValue({ id: "i", companyId: "co", email: ctx.user.email.toUpperCase(), roleId: "role", status: "INVITED", expiresAt: new Date(Date.now() + 100000), company: { isActive: true } });
  db.membership.findUnique.mockResolvedValue({ id: "member", status: "INVITED" });
  db.invitation.updateMany.mockResolvedValue({ count: 1 });
  db.membership.updateMany.mockResolvedValue({ count: 1 });
  expect(await redeemInvitation({ email: ctx.user.email, kindeUserId: "k" }, "a".repeat(64))).toEqual({ companyId: "co" });
  expect(db.invitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { token: createHash("sha256").update("a".repeat(64)).digest("hex") } }));
  db.invitation.updateMany.mockResolvedValue({ count: 0 });
  await expect(redeemInvitation({ email: ctx.user.email, kindeUserId: "k" }, "a".repeat(64))).rejects.toThrow();
});

it.each(["disable", "remove", "update"])("protects last owner from %s", async (action) => {
  db.membership.findFirst.mockResolvedValue({ id: "owner", userId: "other", roleId: "owner-role", status: "ACTIVE", role: { code: "OWNER" }, user: { email: "other@test.id" } });
  db.membership.count.mockResolvedValue(1);
  await expect(changeMembership(ctx, "owner", { action, roleId: "role", branchIds: [], warehouseIds: [] })).rejects.toThrow("owner");
  expect(db.membership.delete).not.toHaveBeenCalled();
  expect(db.membership.update).not.toHaveBeenCalled();
});
it("rejects self role or scope modification", async () => {
  db.membership.findFirst.mockResolvedValue({ id: ctx.membershipId, userId: ctx.user.id, roleId: "role", status: "ACTIVE", role: { code: "STAFF" }, user: { email: ctx.user.email } });
  await expect(changeMembership(ctx, ctx.membershipId, { action: "update", roleId: "role", branchIds: [], warehouseIds: [] })).rejects.toThrow();
});
it("updates tenant-scoped role and access atomically", async () => {
  db.membership.findFirst.mockResolvedValue({ id: "member", userId: "other", roleId: "role", status: "ACTIVE", role: { code: "STAFF" }, user: { email: "other@test.id" } });
  db.branch.count.mockResolvedValue(1); db.warehouse.count.mockResolvedValue(1);
  await changeMembership(ctx, "member", { action: "update", roleId: "role", branchIds: ["b"], warehouseIds: ["w"] });
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "membership.update", beforeData: { roleId: "role", status: "ACTIVE" }, afterData: { roleId: "role", branchIds: ["b"], warehouseIds: ["w"] } }) }));
  expect(db.membership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "member", companyId: "co" } }));
  expect(db.membership.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roleId: "role", branchAccess: { deleteMany: {}, create: [{ branchId: "b" }] } }) }));
});
it("resend rotates token and invalidates previous invitations", async () => {
  db.membership.findFirst.mockResolvedValue({ id: "member", roleId: "role", status: "INVITED", user: { email: "other@test.id" }, branchAccess: [], warehouseAccess: [] });
  const first = await resendInvitation(ctx, "member"); const second = await resendInvitation(ctx, "member");
  expect(first.inviteLink).not.toBe(second.inviteLink);
  expect(db.invitation.updateMany).toHaveBeenCalledWith({ where: { companyId: "co", email: "other@test.id", status: "INVITED" }, data: { status: "DISABLED" } });
});
it("removes an already disabled membership", async () => {
  db.membership.findFirst.mockResolvedValue({ id: "member", userId: "other", status: "DISABLED", role: { code: "STAFF" }, user: { email: "other@test.id" } });
  await changeMembership(ctx, "member", { action: "remove" });
  expect(db.membership.delete).toHaveBeenCalledWith({ where: { id: "member" } });
});
it("rejects foreign branch references", async () => {
  db.branch.count.mockResolvedValue(0);
  await expect(inviteMember(ctx, { email: "a@test.id", roleId: "role", branchIds: ["foreign"], warehouseIds: [] })).rejects.toThrow("Cabang");
  expect(db.membership.create).not.toHaveBeenCalled();
});
it("rejects restricted administrators granting all-branch access", async () => {
  await expect(inviteMember({ ...ctx, branchIds: ["b"] }, { email: "a@test.id", roleId: "role", branchIds: [], warehouseIds: [] })).rejects.toThrow("cakupan");
});
it("checks permission before accessing storage", async () => {
  await expect(inviteMember({ ...ctx, permissions: new Set() }, { email: "a@test.id", roleId: "role", branchIds: [], warehouseIds: [] })).rejects.toThrow();
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("rejects privilege escalation when inviting", async () => {
  db.role.findFirst.mockResolvedValue({ id: "role", code: "OWNER", permissions: [] });
  await expect(inviteMember({ ...ctx, permissions: new Set(["user:invite"]) }, { email: "a@test.id", roleId: "role", branchIds: [], warehouseIds: [] })).rejects.toThrow();
  expect(db.membership.create).not.toHaveBeenCalled();
});
