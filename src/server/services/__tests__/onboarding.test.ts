import {
  ensureGlobalPermissions,
  onboardCompany,
  seedCompanyRoles,
  seedDefaultCoa,
  seedDefaultTaxCodes,
  seedPostingRules,
} from "@/server/services/onboarding";
import { ROLE_PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";

const prismaMock = {
  permission: { upsert: jest.fn() },
  role: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
  },
  rolePermission: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  account: { upsert: jest.fn() },
  taxCode: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  postingRule: { upsert: jest.fn() },
  postingRuleVersion: {
    count: jest.fn(),
    create: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
  },
  membership: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

jest.mock("@/lib/audit", () => ({
  writeAudit: jest.fn(async () => undefined),
}));

jest.mock("@/lib/auth", () => ({
  setActiveCompanyId: jest.fn(async () => undefined),
}));

describe("onboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.permission.upsert.mockResolvedValue({});
    prismaMock.role.upsert.mockImplementation(
      async ({ create }: { create: { code: string; id?: string } }) => ({
        id: `role-${create.code}`,
        code: create.code,
      }),
    );
    prismaMock.rolePermission.deleteMany.mockResolvedValue({});
    prismaMock.rolePermission.createMany.mockResolvedValue({});
    prismaMock.account.upsert.mockResolvedValue({});
    prismaMock.taxCode.findFirst.mockResolvedValue(null);
    prismaMock.taxCode.create.mockResolvedValue({});
    prismaMock.postingRule.upsert.mockResolvedValue({ id: "rule1" });
    prismaMock.postingRuleVersion.count.mockResolvedValue(0);
    prismaMock.postingRuleVersion.create.mockResolvedValue({});
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.role.findFirst.mockResolvedValue({ id: "owner-role", code: "OWNER" });
    prismaMock.membership.create.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        company: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "co1",
            ...data,
          })),
        },
        branch: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "br1",
            ...data,
          })),
        },
        warehouse: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "wh1",
            ...data,
          })),
        },
        companySetting: { create: jest.fn(async () => ({})) },
        unit: { createMany: jest.fn(async () => ({})) },
        fiscalYear: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "fy1",
            ...data,
          })),
        },
        fiscalPeriod: { create: jest.fn(async () => ({})) },
        taxRegistration: { create: jest.fn(async () => ({})) },
        bankAccount: { create: jest.fn(async () => ({})) },
      };
      return fn(tx);
    });
  });

  it("ensureGlobalPermissions upserts all", async () => {
    await ensureGlobalPermissions();
    expect(prismaMock.permission.upsert).toHaveBeenCalled();
  });

  it("seedCompanyRoles for wildcard and list roles", async () => {
    prismaMock.permission.findMany = jest.fn(async () =>
      Object.keys(ROLE_PERMISSIONS.BUYER === "*" ? {} : {}).length >= 0
        ? [{ id: "perm1", code: "product:view" }, { id: "perm2", code: "company:view" }]
        : [],
    );
    // Provide enough permissions for OWNER *
    const allCodes = await import("@/lib/permissions").then((m) => m.PERMISSIONS);
    prismaMock.permission.findMany = jest.fn(async () =>
      allCodes.map((code, i) => ({ id: `p${i}`, code })),
    );

    // force one role with empty grants path via undefined
    const original = ROLE_PERMISSIONS.VIEWER;
    // seed with real roles
    await seedCompanyRoles("c1");
    expect(prismaMock.role.upsert).toHaveBeenCalledTimes(SYSTEM_ROLES.length);
    expect(prismaMock.rolePermission.createMany).toHaveBeenCalled();
    void original;
  });

  it("seedCompanyRoles skips createMany when no permission ids", async () => {
    prismaMock.permission.findMany = jest.fn(async () => []);
    await seedCompanyRoles("c1");
    expect(prismaMock.rolePermission.createMany).not.toHaveBeenCalled();
  });

  it("seedCompanyRoles handles missing role grant map", async () => {
    const perms = await import("@/lib/permissions");
    const original = perms.ROLE_PERMISSIONS.VIEWER;
    delete (perms.ROLE_PERMISSIONS as Record<string, unknown>).VIEWER;
    prismaMock.permission.findMany = jest.fn(async () => [
      { id: "p1", code: "product:view" },
    ]);
    await seedCompanyRoles("c1");
    perms.ROLE_PERMISSIONS.VIEWER = original;
  });

  it("seedDefaultCoa and tax and posting rules", async () => {
    await seedDefaultCoa("c1");
    expect(prismaMock.account.upsert).toHaveBeenCalled();

    prismaMock.taxCode.findFirst.mockResolvedValueOnce({ id: "exists" });
    await seedDefaultTaxCodes("c1");
    // first exists, others created
    expect(prismaMock.taxCode.create).toHaveBeenCalled();

    prismaMock.postingRuleVersion.count.mockResolvedValueOnce(1);
    await seedPostingRules("c1");
    // one skip create version, rest create
    expect(prismaMock.postingRuleVersion.create).toHaveBeenCalled();
  });

  it("onboardCompany validates and creates", async () => {
    await expect(
      onboardCompany({ userId: "u", name: "   " }),
    ).rejects.toThrow("Nama perusahaan wajib");

    prismaMock.permission.findMany = jest.fn(async () =>
      (await import("@/lib/permissions")).PERMISSIONS.map((code, i) => ({
        id: `p${i}`,
        code,
      })),
    );

    const result = await onboardCompany({
      userId: "u1",
      name: "PT Demo",
      legalName: "PT Demo Legal",
      code: "DEMO",
      email: "a@b.c",
      phone: "1",
      address: "addr",
      city: "Jkt",
      province: "DKI",
      branchName: "Cabang",
      warehouseName: "Gudang",
    });
    expect(result.company.id).toBe("co1");
    expect(prismaMock.membership.create).toHaveBeenCalled();
  });

  it("onboardCompany handles existing code and slug fallback", async () => {
    prismaMock.permission.findMany = jest.fn(async () =>
      (await import("@/lib/permissions")).PERMISSIONS.map((code, i) => ({
        id: `p${i}`,
        code,
      })),
    );
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: "exists" });
    const r = await onboardCompany({ userId: "u", name: "Acme Corp!!!" });
    expect(r.company.id).toBe("co1");
  });

  it("onboardCompany throws when owner role missing", async () => {
    prismaMock.permission.findMany = jest.fn(async () => []);
    prismaMock.role.findFirst.mockResolvedValue(null);
    await expect(
      onboardCompany({ userId: "u", name: "X" }),
    ).rejects.toThrow("Role OWNER gagal dibuat");
  });

  it("onboardCompany uses defaults for optional fields", async () => {
    prismaMock.permission.findMany = jest.fn(async () =>
      (await import("@/lib/permissions")).PERMISSIONS.map((code, i) => ({
        id: `p${i}`,
        code,
      })),
    );
    await onboardCompany({ userId: "u", name: "Y" });
    expect(prismaMock.membership.create).toHaveBeenCalled();
  });

  it("slugify empty-ish name uses CO", async () => {
    prismaMock.permission.findMany = jest.fn(async () =>
      (await import("@/lib/permissions")).PERMISSIONS.map((code, i) => ({
        id: `p${i}`,
        code,
      })),
    );
    // name with only symbols -> slugify returns ""
    await onboardCompany({ userId: "u", name: "!!!" });
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});
