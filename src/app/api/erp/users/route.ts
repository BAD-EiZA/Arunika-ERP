import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { validationError } from "@/lib/errors";
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { inviteMember, changeMembership, resendInvitation, manageRole } from "@/server/services/memberships";

export const dynamic = "force-dynamic";
export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requirePermission("user:view");
    const [members, roles, branches, warehouses, invitations] = await Promise.all([
      prisma.membership.findMany({ where: { companyId: ctx.companyId }, select: { id: true, userId: true, roleId: true, status: true, user: { select: { name: true, email: true } }, branchAccess: true, warehouseAccess: true }, orderBy: { joinedAt: "asc" } }),
      prisma.role.findMany({ where: { ...(hasPermission(ctx.permissions, "role:manage") ? {} : { isActive: true }), OR: [{ companyId: ctx.companyId }, { companyId: null, isSystem: true }] }, include: { permissions: { include: { permission: true } }, _count: { select: { memberships: { where: { companyId: ctx.companyId } } } } }, orderBy: { name: "asc" } }),
      prisma.branch.findMany({ where: { companyId: ctx.companyId, isActive: true, ...(ctx.branchIds.length ? { id: { in: ctx.branchIds } } : {}) }, select: { id: true, name: true } }),
      prisma.warehouse.findMany({ where: { companyId: ctx.companyId, isActive: true, ...(ctx.warehouseIds.length ? { id: { in: ctx.warehouseIds } } : {}) }, select: { id: true, name: true } }),
      prisma.invitation.findMany({ where: { companyId: ctx.companyId, status: "INVITED" }, select: { id: true, email: true, expiresAt: true } }),
    ]);
    return { members, roles: roles.map((r) => ({ id: r.id, name: r.name, code: r.code, description: r.description, companyId: r.companyId, isSystem: r.isSystem, isActive: r.isActive, permissionCodes: r.isSystem ? ROLE_PERMISSIONS[r.code] ?? r.permissions.map((p) => p.permission.code) : r.permissions.map((p) => p.permission.code), memberCount: r._count.memberships })), availablePermissions: hasPermission(ctx.permissions, "role:manage") ? ctx.permissions === "*" ? PERMISSIONS : PERMISSIONS.filter((p) => ctx.permissions !== "*" && ctx.permissions.has(p)) : [], branches, warehouses, invitations, selfId: ctx.membershipId, permissions: ctx.permissions === "*" ? "*" : [...ctx.permissions] };
  });
}
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw validationError("Input tidak valid");
    if (typeof body.action === "string" && body.action.startsWith("role.")) return manageRole(ctx, body);
    if (body.action === "invite") return inviteMember(ctx, body);
    if (typeof body.id !== "string") throw validationError("ID wajib diisi");
    if (body.action === "resend") return resendInvitation(ctx, body.id);
    await changeMembership(ctx, body.id, body);
    return { ok: true };
  });
}
