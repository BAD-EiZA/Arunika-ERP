import { changeMembership, inviteMember, resendInvitation } from "@/server/services/memberships";
import { manageRole } from "@/server/services/memberships";
import type { TenantContext } from "@/lib/auth";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useQuery } from "@tanstack/react-query";
import UsersClient from "@/app/(erp)/settings/users/users-client";
jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }));
jest.mock("@/lib/auth", () => ({ requireTenant: jest.fn(), requirePermission: jest.fn() }));
import { requireTenant, requirePermission } from "@/lib/auth";
import { POST, GET } from "@/app/api/erp/users/route";
const db = {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  role: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  permission: { findMany: jest.fn() },
  membership: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn(), create: jest.fn() },
  invitation: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  user: { upsert: jest.fn() }, emailOutbox: { create: jest.fn() },
  branch: { count: jest.fn(), findMany: jest.fn() }, warehouse: { count: jest.fn(), findMany: jest.fn() }, auditLog: { create: jest.fn() },
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
const ctx: TenantContext = { companyId: "co", membershipId: "admin-member", user: { id: "admin", email: "admin@test.id", name: null, kindeUserId: "k" }, roleCode: "OWNER", permissions: "*", branchIds: [], warehouseIds: [] };
beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(fn => fn(db));
  db.role.findFirst.mockResolvedValue({ id: "custom", code: "CUSTOM", companyId: "co", isSystem: false, isActive: true, permissions: [] });
  db.membership.findFirst.mockResolvedValue({ id: "member", userId: "other", roleId: "custom", status: "DISABLED", joinedAt: new Date(), user: { email: "other@test.id", kindeUserId: "other-k", isActive: true }, role: { code: "CUSTOM" }, branchAccess: [], warehouseAccess: [] });
  db.role.create.mockImplementation(({ data }) => ({ id: "created", ...data }));
  db.role.update.mockImplementation(({ data }) => ({ id: "custom", ...data }));
  db.role.delete.mockResolvedValue({ id: "custom", name: "Custom", isActive: true });
  db.membership.count.mockResolvedValue(0); db.invitation.count.mockResolvedValue(0);
  db.permission.findMany.mockResolvedValue([{ id: "view", code: "user:view" }]);
  db.membership.create.mockResolvedValue({ id: "member" }); db.user.upsert.mockResolvedValue({ id: "other" });
  delete process.env.KINDE_SITE_URL; delete process.env.NEXT_PUBLIC_APP_URL;
});
it("renders custom role controls and disabled-member reactivation", () => {
  (useQuery as jest.Mock).mockReturnValue({ data: { members: [{ id: "member", roleId: "custom", status: "DISABLED", user: { name: null, email: "other@test.id" }, branchAccess: [], warehouseAccess: [] }], roles: [{ id: "custom", name: "Custom", code: "CUSTOM", isActive: true, isSystem: false, companyId: "co", permissionCodes: ["user:view"], memberCount: 1 }], branches: [], warehouses: [], invitations: [], selfId: "admin-member", permissions: "*", availablePermissions: ["user:view"] }, refetch: jest.fn() });
  const html = renderToStaticMarkup(createElement(UsersClient));
  expect(html).toContain("Aktifkan kembali");
  expect(html).toContain("Buat role");
  expect(html).toContain("Salin role");
  expect(html).toContain("user:view");
});
it("exposes inactive roles, DB grants, and member counts to role managers", async () => {
  (requirePermission as jest.Mock).mockResolvedValue(ctx);
  db.membership.findMany.mockResolvedValue([]); db.invitation.findMany.mockResolvedValue([]);
  db.role.findMany.mockResolvedValue([{ id: "custom", companyId: "co", name: "Custom", code: "CUSTOM", isActive: false, isSystem: false, permissions: [{ permission: { code: "user:view" } }], _count: { memberships: 2 } }]);
  const response = await GET();
  const data = await response.json();
  expect(data.roles[0]).toMatchObject({ isActive: false, permissionCodes: ["user:view"], memberCount: 2 });
  expect(data.availablePermissions).toContain("user:view");
  expect(db.role.findMany.mock.calls[0][0].where.isActive).toBeUndefined();
});
it("routes role creation without a member ID", async () => {
  (requireTenant as jest.Mock).mockResolvedValue(ctx);
  const response = await POST(new Request("https://erp.test/api/erp/users", { method: "POST", body: JSON.stringify({ action: "role.create", name: "Support", permissionCodes: ["user:view"] }) }));
  expect(response.status).toBe(200);
  expect(db.role.create).toHaveBeenCalled();
});
it("creates a tenant custom role with validated DB permission links", async () => {
  await manageRole(ctx, { action: "role.create", name: "Support", permissionCodes: ["user:view"] });
  expect(db.role.create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: "co", name: "Support", isSystem: false, permissions: { create: [{ permissionId: "view" }] } }) });
});
it("rejects foreign and system role mutation", async () => {
  db.role.findFirst.mockResolvedValueOnce(null);
  await expect(manageRole(ctx, { action: "role.disable", id: "foreign" })).rejects.toThrow();
  db.role.findFirst.mockResolvedValueOnce({ id: "system", companyId: "co", isSystem: true });
  await expect(manageRole(ctx, { action: "role.disable", id: "system" })).rejects.toThrow();
  expect(db.role.update).not.toHaveBeenCalled();
});
it("copies DB role permissions, not a built-in code fallback", async () => {
  db.role.findFirst.mockResolvedValueOnce({ id: "original", companyId: "co", isSystem: false, code: "VIEWER", name: "Origin", permissions: [{ permission: { code: "user:view" } }] });
  await manageRole(ctx, { action: "role.copy", id: "original", name: "Clone" });
  expect(db.role.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Clone", permissions: { create: [{ permissionId: "view" }] } }) });
});
it.each(["role.update", "role.disable", "role.activate", "role.delete"])("supports safe custom %s", async action => {
  db.membership.findFirst.mockResolvedValue(null);
  await manageRole(ctx, { action, id: "custom", name: "Renamed", permissionCodes: ["user:view"] });
  if (action === "role.delete") expect(db.role.delete).toHaveBeenCalledWith({ where: { id: "custom" } });
  else expect(db.role.update).toHaveBeenCalledWith({ where: { id: "custom" }, data: expect.objectContaining(action === "role.update" ? { name: "Renamed", permissions: { deleteMany: {}, create: [{ permissionId: "view" }] } } : { isActive: action === "role.activate" }) });
});
it("enqueues an absolute invite link inside the invitation transaction without claiming delivery", async () => {
  process.env.KINDE_SITE_URL = "https://erp.test";
  const result = await inviteMember(ctx, { email: "other@test.id", roleId: "custom", branchIds: [], warehouseIds: [] });
  expect(result.delivery).toBe("QUEUED");
  expect(db.emailOutbox.create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: "co", toEmail: "other@test.id", status: "PENDING", body: expect.stringContaining("https://erp.test/api/erp/users/redeem#token=") }) });
});
it("enqueues resent invite after token rotation", async () => {
  process.env.KINDE_SITE_URL = "https://erp.test";
  db.membership.findFirst.mockResolvedValue({ id: "member", roleId: "custom", status: "INVITED", user: { email: "other@test.id" }, branchAccess: [], warehouseAccess: [] });
  await resendInvitation(ctx, "member");
  expect(db.emailOutbox.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "PENDING", toEmail: "other@test.id" }) });
});
it("rejects activation granting permissions beyond the administrator", async () => {
  db.membership.findFirst.mockResolvedValue(null);
  db.role.findFirst.mockResolvedValue({ id: "custom", companyId: "co", code: "CUSTOM", isSystem: false, permissions: [{ permission: { code: "user:disable" } }] });
  await expect(manageRole({ ...ctx, permissions: new Set(["role:manage"]) }, { action: "role.activate", id: "custom" })).rejects.toThrow();
  expect(db.role.update).not.toHaveBeenCalled();
});
it.each(["role.delete", "role.disable"])("rejects %s while active members reference role", async action => {
  db.membership.findFirst.mockResolvedValue(null); db.membership.count.mockResolvedValue(1);
  await expect(manageRole(ctx, { action, id: "custom" })).rejects.toThrow("digunakan");
});
it("rejects unauthorized role changes before storage", async () => {
  await expect(manageRole({ ...ctx, permissions: new Set() }, { action: "role.create", name: "Denied", permissionCodes: [] })).rejects.toThrow();
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("rejects invalid permission codes", async () => {
  await expect(manageRole(ctx, { action: "role.create", name: "Invalid", permissionCodes: ["invented:grant"] })).rejects.toThrow("Permission");
  expect(db.role.create).not.toHaveBeenCalled();
});
it("rolls invitation failure back when queue cannot persist", async () => {
  process.env.KINDE_SITE_URL = "https://erp.test"; db.emailOutbox.create.mockRejectedValue(new Error("outbox unavailable"));
  await expect(inviteMember(ctx, { email: "other@test.id", roleId: "custom", branchIds: [], warehouseIds: [] })).rejects.toThrow("outbox unavailable");
  // Persistence rollback itself is PostgreSQL's transaction contract, not simulated by this mock.
  expect(db.auditLog.create).not.toHaveBeenCalled();
});
it("rejects own-role permission mutation", async () => {
  db.membership.findFirst.mockResolvedValue({ roleId: "custom" });
  await expect(manageRole(ctx, { action: "role.update", id: "custom", name: "Self", permissionCodes: ["user:view"] })).rejects.toThrow();
  expect(db.role.update).not.toHaveBeenCalled();
});
it("rejects deletion referenced by disabled members", async () => {
  db.membership.count.mockImplementation(({ where }) => Promise.resolve(where.status ? 0 : 1));
  await expect(manageRole(ctx, { action: "role.delete", id: "custom" })).rejects.toThrow();
  expect(db.role.delete).not.toHaveBeenCalled();
});
it("reactivation uses DB grants even when custom code matches OWNER", async () => {
  db.role.findFirst.mockResolvedValue({ id: "custom", code: "OWNER", companyId: "co", isSystem: false, isActive: true, permissions: [] });
  await changeMembership({ ...ctx, permissions: new Set(["user:update", "role:manage"]) }, "member", { action: "reactivate" });
  expect(db.membership.update).toHaveBeenCalled();
});
it.each(["unjoined", "global-disabled", "escalation", "scope", "self", "active"])("rejects unsafe %s reactivation", async reason => {
  const member = { id: "member", userId: reason === "self" ? "admin" : "other", roleId: "custom", status: reason === "active" ? "ACTIVE" : "DISABLED", joinedAt: reason === "unjoined" ? null : new Date(), user: { isActive: reason !== "global-disabled", kindeUserId: "k" }, branchAccess: [], warehouseAccess: [] };
  db.membership.findFirst.mockResolvedValue(member);
  if (reason === "escalation") db.role.findFirst.mockResolvedValue({ code: "CUSTOM", isSystem: false, permissions: [{ permission: { code: "user:disable" } }] });
  const actor = { ...ctx, permissions: new Set(["user:update", "role:manage"]), branchIds: reason === "scope" ? ["b"] : [] };
  await expect(changeMembership(actor, "member", { action: "reactivate" })).rejects.toThrow();
  expect(db.membership.update).not.toHaveBeenCalled();
});
it("never activates a revoked unaccepted invitation even though joinedAt has a DB default", async () => {
  db.membership.findFirst.mockResolvedValue({ id: "member", userId: "other", roleId: "custom", status: "DISABLED", invitedAt: new Date(), joinedAt: new Date(), user: { isActive: true, kindeUserId: "k", email: "other@test.id" }, branchAccess: [], warehouseAccess: [] });
  db.invitation.count.mockResolvedValue(0);
  await expect(changeMembership(ctx, "member", { action: "reactivate" })).rejects.toThrow();
  expect(db.membership.update).not.toHaveBeenCalled();
});
it("accepts a previously redeemed invitation on reactivation", async () => {
  db.membership.findFirst.mockResolvedValue({ id: "member", userId: "other", roleId: "custom", status: "DISABLED", invitedAt: new Date(0), joinedAt: new Date(), user: { isActive: true, kindeUserId: "k", email: "other@test.id" }, branchAccess: [], warehouseAccess: [] });
  db.invitation.count.mockResolvedValue(1);
  await changeMembership(ctx, "member", { action: "reactivate" });
  expect(db.membership.update).toHaveBeenCalled();
});
it("preserves last active owner protection", async () => {
  db.membership.findFirst.mockResolvedValue({ id: "member", userId: "other", roleId: "owner", status: "ACTIVE", role: { code: "OWNER" }, user: { email: "other@test.id" } });
  db.membership.count.mockResolvedValue(1);
  await expect(changeMembership(ctx, "member", { action: "disable" })).rejects.toThrow("owner terakhir");
  expect(db.membership.update).not.toHaveBeenCalled();
});
it("limits globally assignable roles to system roles", async () => {
  await changeMembership(ctx, "member", { action: "reactivate" });
  expect(db.role.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ companyId: "co" }, { companyId: null, isSystem: true }] }) }));
});
it("reactivates a previously joined member after checking stored grants and scope", async () => {
  await changeMembership(ctx, "member", { action: "reactivate" });
  expect(db.membership.update).toHaveBeenCalledWith({ where: { id: "member" }, data: { status: "ACTIVE" } });
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "membership.reactivate" }) }));
});
