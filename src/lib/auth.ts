import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { forbidden, unauthorized } from "@/lib/errors";
import {
  hasPermission,
  type PermissionCode,
  ROLE_PERMISSIONS,
} from "@/lib/permissions";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  kindeUserId: string | null;
};

export type TenantContext = {
  user: SessionUser;
  companyId: string;
  membershipId: string;
  roleCode: string;
  permissions: Set<string> | "*";
  branchIds: string[];
  warehouseIds: string[];
};

const COMPANY_COOKIE = "arunika_company_id";

export async function getSessionUser(): Promise<SessionUser | null> {
  if (process.env.MOCK_AUTH === "true") {
    const email = process.env.MOCK_USER_EMAIL || "owner@arunika.local";
    const name = process.env.MOCK_USER_NAME || "Owner Demo";
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          kindeUserId: `mock_${email}`,
          isActive: true,
          lastLoginAt: new Date(),
        },
      });
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      kindeUserId: user.kindeUserId,
    };
  }

  // Kinde path: resolve when credentials configured
  try {
    const { getKindeServerSession } = await import(
      "@kinde-oss/kinde-auth-nextjs/server"
    );
    const { getUser, isAuthenticated } = getKindeServerSession();
    if (!(await isAuthenticated())) return null;
    const kindeUser = await getUser();
    if (!kindeUser?.id || !kindeUser.email) return null;

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ kindeUserId: kindeUser.id }, { email: kindeUser.email }],
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          kindeUserId: kindeUser.id,
          email: kindeUser.email,
          name:
            [kindeUser.given_name, kindeUser.family_name]
              .filter(Boolean)
              .join(" ") || kindeUser.email,
          avatarUrl: kindeUser.picture ?? null,
          lastLoginAt: new Date(),
        },
      });
    } else if (!user.kindeUserId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          kindeUserId: kindeUser.id,
          lastLoginAt: new Date(),
          avatarUrl: kindeUser.picture ?? user.avatarUrl,
        },
      });
    }

    if (!user.isActive) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      kindeUserId: user.kindeUserId,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

export async function getActiveCompanyId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COMPANY_COOKIE)?.value ?? null;
}

export async function setActiveCompanyId(companyId: string) {
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearActiveCompanyId() {
  const jar = await cookies();
  jar.delete(COMPANY_COOKIE);
}

export async function getTenantContext(
  companyId?: string,
): Promise<TenantContext | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const activeCompanyId = companyId ?? (await getActiveCompanyId());

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      branchAccess: true,
      warehouseAccess: true,
      company: true,
    },
  });

  if (memberships.length === 0) return null;

  const membership =
    memberships.find((m) => m.companyId === activeCompanyId) ?? memberships[0];

  if (!membership.company.isActive) return null;

  let permissions: Set<string> | "*";
  const roleMap = ROLE_PERMISSIONS[membership.role.code];
  if (roleMap === "*" || membership.role.code === "OWNER") {
    permissions = "*";
  } else if (roleMap) {
    permissions = new Set(roleMap);
  } else {
    permissions = new Set(
      membership.role.permissions.map((rp) => rp.permission.code),
    );
  }

  return {
    user,
    companyId: membership.companyId,
    membershipId: membership.id,
    roleCode: membership.role.code,
    permissions,
    branchIds: membership.branchAccess.map((b) => b.branchId),
    warehouseIds: membership.warehouseAccess.map((w) => w.warehouseId),
  };
}

export async function requireTenant(
  companyId?: string,
): Promise<TenantContext> {
  const ctx = await getTenantContext(companyId);
  if (!ctx) throw unauthorized("Sesi atau keanggotaan perusahaan tidak valid");
  return ctx;
}

export async function requirePermission(
  permission: PermissionCode | PermissionCode[],
  companyId?: string,
): Promise<TenantContext> {
  const ctx = await requireTenant(companyId);
  if (!hasPermission(ctx.permissions, permission)) {
    throw forbidden("Permission tidak mencukupi");
  }
  return ctx;
}

export async function listUserCompanies(userId: string) {
  return prisma.membership.findMany({
    where: { userId, status: "ACTIVE", company: { isActive: true } },
    include: {
      company: true,
      role: true,
    },
    orderBy: { joinedAt: "asc" },
  });
}
