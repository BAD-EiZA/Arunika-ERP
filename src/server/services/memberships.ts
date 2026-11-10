import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { conflict, forbidden, validationError } from "@/lib/errors";
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS, type PermissionCode } from "@/lib/permissions";

type Db = Prisma.TransactionClient;
function permit(ctx: TenantContext, code: PermissionCode) {
  if (!hasPermission(ctx.permissions, code)) throw forbidden();
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 254) throw validationError("Nilai tidak valid");
  return value.trim();
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 500 || value.some((v) => typeof v !== "string" || !v || v.length > 254)) throw validationError("Daftar akses tidak valid");
  return [...new Set(value)] as string[];
}
async function lock(db: Db, companyId: string) {
  // Serialize membership mutations, including concurrent last-owner changes.
  await db.$queryRaw`SELECT id FROM "Company" WHERE id = ${companyId} FOR UPDATE`;
}
async function roleFor(db: Db, ctx: TenantContext, roleId: string) {
  const role = await db.role.findFirst({ where: { id: roleId, isActive: true, OR: [{ companyId: ctx.companyId }, { companyId: null, isSystem: true }] }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw validationError("Role tidak valid");
  const grants = (role.isSystem !== false ? ROLE_PERMISSIONS[role.code] : undefined) ?? role.permissions.map((p) => p.permission.code);
  const permissions = ctx.permissions;
  if (permissions !== "*" && (grants === "*" || grants.some((p) => !permissions.has(p)))) throw forbidden("Tidak boleh memberikan hak melebihi hak sendiri");
  return role;
}
async function scopeFor(db: Db, ctx: TenantContext, branchIds: string[], warehouseIds: string[]) {
  if ((ctx.branchIds.length && (!branchIds.length || branchIds.some((id) => !ctx.branchIds.includes(id)))) || (ctx.warehouseIds.length && (!warehouseIds.length || warehouseIds.some((id) => !ctx.warehouseIds.includes(id))))) throw forbidden("Akses melebihi cakupan sendiri");
  if (branchIds.length && await db.branch.count({ where: { id: { in: branchIds }, companyId: ctx.companyId, isActive: true } }) !== branchIds.length) throw validationError("Cabang tidak valid");
  if (warehouseIds.length && await db.warehouse.count({ where: { id: { in: warehouseIds }, companyId: ctx.companyId, isActive: true, ...(branchIds.length ? { branchId: { in: branchIds } } : {}) } }) !== warehouseIds.length) throw validationError("Gudang tidak valid atau di luar cabang");
}
function access(branchIds: string[], warehouseIds: string[]) {
  return { branchAccess: { create: branchIds.map((branchId) => ({ branchId })) }, warehouseAccess: { create: warehouseIds.map((warehouseId) => ({ warehouseId })) } };
}
export async function manageRole(ctx: TenantContext, input: { action?: unknown; id?: unknown; name?: unknown; description?: unknown; permissionCodes?: unknown }) {
  permit(ctx, "role:manage");
  if (!["role.create", "role.copy", "role.update", "role.disable", "role.activate", "role.delete"].includes(String(input.action))) throw validationError("Aksi role tidak valid");
  const name = input.action === "role.create" || input.action === "role.copy" || input.action === "role.update" ? text(input.name) : "";
  return prisma.$transaction(async (db) => {
    await lock(db, ctx.companyId);
    if (input.action !== "role.create" && input.action !== "role.copy") {
      const role = await db.role.findFirst({ where: { id: text(input.id), companyId: ctx.companyId, isSystem: false }, include: { permissions: { include: { permission: true } } } });
      if (!role || role.isSystem || role.companyId !== ctx.companyId || ROLE_PERMISSIONS[role.code]) throw forbidden("Role bawaan atau role perusahaan lain tidak dapat diubah");
      const self = await db.membership.findFirst({ where: { id: ctx.membershipId, companyId: ctx.companyId }, select: { roleId: true } });
      if (self?.roleId === role.id) throw forbidden("Tidak dapat mengubah role sendiri");
      const used = await db.membership.count({ where: { companyId: ctx.companyId, roleId: role.id, ...(input.action === "role.delete" ? {} : { status: { in: ["ACTIVE", "INVITED"] } }) } });
      const pending = await db.invitation.count({ where: { companyId: ctx.companyId, roleId: role.id, status: "INVITED", expiresAt: { gt: new Date() } } });
      if (pending && (input.action === "role.disable" || input.action === "role.delete")) throw conflict("Role masih digunakan undangan");
      if (used && (input.action === "role.disable" || input.action === "role.delete")) throw conflict("Role masih digunakan");
      let data: Prisma.RoleUpdateInput = {};
      if (input.action === "role.update") {
        const codes = ids(input.permissionCodes);
        if (codes.some((code) => !(PERMISSIONS as readonly string[]).includes(code))) throw validationError("Permission tidak valid");
        const actorPermissions = ctx.permissions;
        if (actorPermissions !== "*" && codes.some((code) => !actorPermissions.has(code))) throw forbidden("Tidak boleh memberikan hak melebihi hak sendiri");
        const old = new Set(role.permissions.map((p) => p.permission.code));
        if (used && codes.some((code) => !old.has(code)) && (ctx.branchIds.length || ctx.warehouseIds.length)) throw forbidden("Perlu akses tanpa batas untuk menaikkan hak role yang digunakan");
        const permissions = await db.permission.findMany({ where: { code: { in: codes } } });
        if (permissions.length !== codes.length) throw validationError("Permission belum tersedia");
        data = { name, description: input.description == null || input.description === "" ? null : text(input.description), permissions: { deleteMany: {}, create: permissions.map((p) => ({ permissionId: p.id })) } };
      } else if (input.action !== "role.delete") {
        if (input.action === "role.activate") {
          const actorPermissions = ctx.permissions;
          if (actorPermissions !== "*" && role.permissions.some((p) => !actorPermissions.has(p.permission.code))) throw forbidden("Tidak boleh mengaktifkan hak melebihi hak sendiri");
        }
        data = { isActive: input.action === "role.activate" };
      }
      const result = input.action === "role.delete" ? await db.role.delete({ where: { id: role.id } }) : await db.role.update({ where: { id: role.id }, data });
      await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: String(input.action), entityType: "Role", entityId: role.id, beforeData: { name: role.name, isActive: role.isActive }, afterData: { name: result.name, isActive: result.isActive } } });
      return result;
    }
    const source = input.action === "role.copy" ? await db.role.findFirst({ where: { id: text(input.id), OR: [{ companyId: ctx.companyId }, { companyId: null, isSystem: true }] }, include: { permissions: { include: { permission: true } } } }) : null;
    if (input.action === "role.copy" && !source) throw validationError("Role tidak ditemukan");
    const grants = source ? (source.isSystem ? ROLE_PERMISSIONS[source.code] : undefined) ?? source.permissions.map((p) => p.permission.code) : ids(input.permissionCodes);
    const codes = grants === "*" ? [...PERMISSIONS] : grants;
    if (codes.some((code) => !(PERMISSIONS as readonly string[]).includes(code))) throw validationError("Permission tidak valid");
    const actorPermissions = ctx.permissions;
    if (actorPermissions !== "*" && codes.some((code) => !actorPermissions.has(code))) throw forbidden("Tidak boleh memberikan hak melebihi hak sendiri");
    const permissions = await db.permission.findMany({ where: { code: { in: codes } } });
    if (permissions.length !== codes.length) throw validationError("Permission belum tersedia");
    const role = await db.role.create({ data: { companyId: ctx.companyId, code: `CUSTOM_${randomBytes(12).toString("hex")}`, name, description: input.description == null || input.description === "" ? null : text(input.description), isSystem: false, permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } } });
    await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "role.create", entityType: "Role", entityId: role.id, afterData: { name, permissionCodes: codes } } });
    return role;
  });
}
function issue() {
  const token = randomBytes(32).toString("hex");
  const origin = process.env.KINDE_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  let base: URL | undefined;
  if (origin) {
    try { base = new URL(origin); } catch { throw validationError("URL aplikasi tidak valid"); }
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || (base.protocol === "http:" && !["localhost", "127.0.0.1"].includes(base.hostname))) throw validationError("URL aplikasi harus HTTPS");
  }
  const path = `/api/erp/users/redeem#token=${token}`;
  return { token: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 72 * 3600000), inviteLink: base ? new URL(path, base.origin).href : path, delivery: base ? "QUEUED" as const : "MANUAL" as const };
}
async function queueInvitation(db: Db, ctx: TenantContext, email: string, memberId: string, issued: ReturnType<typeof issue>) {
  if (issued.delivery === "QUEUED") await db.emailOutbox.create({ data: { companyId: ctx.companyId, toEmail: email, subject: "Undangan Arunika ERP", body: `Anda diundang bergabung ke Arunika ERP. Masuk dengan email ini, lalu terima undangan: ${issued.inviteLink}\nBerlaku sampai ${issued.expiresAt.toISOString()}. Abaikan jika tidak mengenali undangan ini.`, status: "PENDING", entityType: "Membership", entityId: memberId } });
}
export async function redeemInvitation(identity: { kindeUserId: string; email: string }, rawToken: unknown) {
  if (!identity.kindeUserId || !identity.email) throw forbidden();
  if (typeof rawToken !== "string" || !/^[a-f0-9]{64}$/.test(rawToken)) throw validationError("Undangan tidak valid");
  const token = createHash("sha256").update(rawToken).digest("hex");
  return prisma.$transaction(async (db) => {
    const invite = await db.invitation.findFirst({ where: { token }, include: { company: true } });
    if (!invite) throw validationError("Undangan tidak valid");
    await lock(db, invite.companyId);
    if (invite.status !== "INVITED" || invite.expiresAt <= new Date() || !invite.company.isActive || invite.email.toLowerCase() !== identity.email.toLowerCase()) throw forbidden("Undangan kedaluwarsa, sudah dipakai, atau email tidak cocok");
    const user = await db.user.findUnique({ where: { email: invite.email } });
    if (!user?.isActive || (user.kindeUserId !== null && user.kindeUserId !== identity.kindeUserId)) throw forbidden("Identitas undangan tidak cocok");
    const bound = await db.user.findUnique({ where: { kindeUserId: identity.kindeUserId } });
    if (bound && bound.id !== user.id) throw forbidden("Identitas sudah terhubung ke akun lain");
    const member = await db.membership.findUnique({ where: { companyId_userId: { companyId: invite.companyId, userId: user.id } } });
    if (!member || member.status !== "INVITED") throw conflict("Keanggotaan tidak menunggu undangan");
    const role = await db.role.findFirst({ where: { id: invite.roleId, isActive: true, OR: [{ companyId: invite.companyId }, { companyId: null, isSystem: true }] } });
    if (!role) throw conflict("Role undangan tidak aktif");
    const claimed = await db.invitation.updateMany({ where: { id: invite.id, token, status: "INVITED", expiresAt: { gt: new Date() } }, data: { status: "ACTIVE" } });
    if (claimed.count !== 1) throw conflict("Undangan sudah dipakai");
    if (user.kindeUserId === null) {
      const binding = await db.user.updateMany({ where: { id: user.id, kindeUserId: null, isActive: true }, data: { kindeUserId: identity.kindeUserId } });
      if (binding.count !== 1) throw conflict("Identitas akun berubah");
    }
    const activated = await db.membership.updateMany({ where: { id: member.id, status: "INVITED" }, data: { status: "ACTIVE", roleId: invite.roleId, joinedAt: new Date() } });
    if (activated.count !== 1) throw conflict("Keanggotaan berubah");
    await db.auditLog.create({ data: { companyId: invite.companyId, userId: user.id, action: "membership.accept", entityType: "Membership", entityId: member.id } });
    return { companyId: invite.companyId };
  });
}
export async function resendInvitation(ctx: TenantContext, id: string) {
  permit(ctx, "user:invite");
  const issued = issue();
  await prisma.$transaction(async (db) => {
    await lock(db, ctx.companyId);
    const member = await db.membership.findFirst({ where: { id: text(id), companyId: ctx.companyId }, include: { user: true, branchAccess: true, warehouseAccess: true } });
    if (!member || member.status !== "INVITED") throw conflict("Undangan tidak menunggu penerimaan");
    await roleFor(db, ctx, member.roleId);
    await scopeFor(db, ctx, member.branchAccess.map((b) => b.branchId), member.warehouseAccess.map((w) => w.warehouseId));
    await db.invitation.updateMany({ where: { companyId: ctx.companyId, email: member.user.email, status: "INVITED" }, data: { status: "DISABLED" } });
    await db.invitation.create({ data: { companyId: ctx.companyId, email: member.user.email, roleId: member.roleId, invitedById: ctx.user.id, token: issued.token, expiresAt: issued.expiresAt, status: "INVITED" } });
    await queueInvitation(db, ctx, member.user.email, member.id, issued);
    await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "membership.resend", entityType: "Membership", entityId: member.id } });
  });
  return { inviteLink: issued.inviteLink, expiresAt: issued.expiresAt, delivery: issued.delivery };
}
export async function changeMembership(ctx: TenantContext, id: string, input: { action?: unknown; roleId?: unknown; branchIds?: unknown; warehouseIds?: unknown }) {
  const action = input.action;
  if (action !== "update" && action !== "disable" && action !== "remove" && action !== "reactivate") throw validationError("Aksi tidak valid");
  permit(ctx, action === "update" || action === "reactivate" ? "user:update" : "user:disable");
  if (action === "update" || action === "reactivate") permit(ctx, "role:manage");
  return prisma.$transaction(async (db) => {
    await lock(db, ctx.companyId);
    const member = await db.membership.findFirst({ where: { id: text(id), companyId: ctx.companyId }, include: { role: true, user: true } });
    if (!member) throw validationError("Anggota tidak ditemukan");
    if (member.userId === ctx.user.id) throw forbidden("Tidak dapat mengubah keanggotaan sendiri");
    if (action === "reactivate") {
      if (member.status !== "DISABLED" || !member.joinedAt || !member.user.isActive || !member.user.kindeUserId) throw conflict("Hanya anggota yang pernah aktif dapat diaktifkan kembali");
      if (member.invitedAt && !await db.invitation.count({ where: { companyId: ctx.companyId, email: member.user.email, status: "ACTIVE", createdAt: { gte: member.invitedAt } } })) throw conflict("Undangan belum pernah diterima");
      await roleFor(db, ctx, member.roleId);
      const scoped = await db.membership.findFirst({ where: { id: member.id, companyId: ctx.companyId }, include: { branchAccess: true, warehouseAccess: true } });
      await scopeFor(db, ctx, scoped!.branchAccess.map((b) => b.branchId), scoped!.warehouseAccess.map((w) => w.warehouseId));
      await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "membership.reactivate", entityType: "Membership", entityId: member.id, beforeData: { status: "DISABLED" }, afterData: { status: "ACTIVE" } } });
      return db.membership.update({ where: { id: member.id }, data: { status: "ACTIVE" } });
    }
    if (member.status === "DISABLED" && action !== "remove") throw conflict("Keanggotaan sudah nonaktif");
    let roleId: string | undefined;
    if (action === "update") {
      roleId = text(input.roleId);
      if (member.status === "INVITED") throw conflict("Undangan harus diterima sebelum diubah");
    }
    if (member.role.code === "OWNER" && member.status === "ACTIVE" && (action !== "update" || roleId !== member.roleId) && await db.membership.count({ where: { companyId: ctx.companyId, status: "ACTIVE", role: { code: "OWNER" } } }) <= 1) throw conflict("Tidak dapat menghapus owner terakhir");
    if (action === "update") {
      const branchIds = ids(input.branchIds), warehouseIds = ids(input.warehouseIds);
      await roleFor(db, ctx, roleId!);
      await scopeFor(db, ctx, branchIds, warehouseIds);
      await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "membership.update", entityType: "Membership", entityId: member.id, beforeData: { roleId: member.roleId, status: member.status }, afterData: { roleId, branchIds, warehouseIds } } });
      return db.membership.update({ where: { id: member.id }, data: { roleId, branchAccess: { deleteMany: {}, create: branchIds.map((branchId) => ({ branchId })) }, warehouseAccess: { deleteMany: {}, create: warehouseIds.map((warehouseId) => ({ warehouseId })) } } });
    }
    await roleFor(db, ctx, member.roleId);
    await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: `membership.${action}`, entityType: "Membership", entityId: member.id, beforeData: { roleId: member.roleId, status: member.status } } });
    await db.invitation.updateMany({ where: { companyId: ctx.companyId, email: member.user.email, status: "INVITED" }, data: { status: "DISABLED" } });
    if (action === "remove") return db.membership.delete({ where: { id: member.id } });
    return db.membership.update({ where: { id: member.id }, data: { status: "DISABLED" } });
  });
}
export async function inviteMember(ctx: TenantContext, input: { email?: unknown; roleId?: unknown; branchIds?: unknown; warehouseIds?: unknown }) {
  permit(ctx, "user:invite");
  const email = text(input.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError("Email tidak valid");
  const roleId = text(input.roleId), branchIds = ids(input.branchIds), warehouseIds = ids(input.warehouseIds);
  const issued = issue();
  await prisma.$transaction(async (db) => {
    await lock(db, ctx.companyId);
    await roleFor(db, ctx, roleId);
    await scopeFor(db, ctx, branchIds, warehouseIds);
    const user = await db.user.upsert({ where: { email }, create: { email }, update: {} });
    const existing = await db.membership.findUnique({ where: { companyId_userId: { companyId: ctx.companyId, userId: user.id } } });
    if (existing) throw conflict("Keanggotaan sudah ada; gunakan kirim ulang atau ubah anggota");
    const member = await db.membership.create({ data: { companyId: ctx.companyId, userId: user.id, roleId, status: "INVITED", invitedAt: new Date(), ...access(branchIds, warehouseIds) } });
    await db.invitation.updateMany({ where: { companyId: ctx.companyId, email, status: "INVITED" }, data: { status: "DISABLED" } });
    await db.invitation.create({ data: { companyId: ctx.companyId, email, roleId, invitedById: ctx.user.id, status: "INVITED", token: issued.token, expiresAt: issued.expiresAt } });
    await queueInvitation(db, ctx, email, member.id, issued);
    await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "membership.invite", entityType: "Membership", entityId: member.id, afterData: { roleId, branchIds, warehouseIds } } });
  });
  return { inviteLink: issued.inviteLink, expiresAt: issued.expiresAt, delivery: issued.delivery };
}
