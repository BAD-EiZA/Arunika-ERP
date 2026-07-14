import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { conflict, validationError } from "@/lib/errors";
import {
  PERMISSIONS,
  PERMISSION_META,
  ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} from "@/lib/permissions";
import { setActiveCompanyId } from "@/lib/auth";

function slugify(input: string) {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12);
}

export async function ensureGlobalPermissions() {
  for (const code of PERMISSIONS) {
    const meta = PERMISSION_META[code];
    await prisma.permission.upsert({
      where: { code },
      create: {
        code,
        name: meta.name,
        module: meta.module,
      },
      update: {
        name: meta.name,
        module: meta.module,
      },
    });
  }
}

export async function seedCompanyRoles(companyId: string) {
  const allPermissions = await prisma.permission.findMany();
  const byCode = new Map(allPermissions.map((p) => [p.code, p.id]));

  for (const roleDef of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: {
        companyId_code: { companyId, code: roleDef.code },
      },
      create: {
        companyId,
        code: roleDef.code,
        name: roleDef.name,
        isSystem: true,
      },
      update: { name: roleDef.name, isSystem: true },
    });

    const granted = ROLE_PERMISSIONS[roleDef.code];
    const codes = granted === "*" ? [...PERMISSIONS] : [...(granted || [])];

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const data = codes
      .map((code) => byCode.get(code))
      .filter(Boolean)
      .map((permissionId) => ({
        roleId: role.id,
        permissionId: permissionId as string,
      }));
    if (data.length) {
      await prisma.rolePermission.createMany({ data, skipDuplicates: true });
    }
  }
}

export async function seedDefaultCoa(companyId: string) {
  const accounts = [
    { code: "1100", name: "Kas", type: "ASSET" as const, normalBalance: "DEBIT" },
    { code: "1110", name: "Bank", type: "ASSET" as const, normalBalance: "DEBIT" },
    { code: "1120", name: "Piutang Usaha", type: "ASSET" as const, normalBalance: "DEBIT" },
    { code: "1130", name: "Persediaan", type: "ASSET" as const, normalBalance: "DEBIT" },
    { code: "1140", name: "PPN Masukan", type: "ASSET" as const, normalBalance: "DEBIT" },
    { code: "1200", name: "Aset Tetap", type: "ASSET" as const, normalBalance: "DEBIT" },
    { code: "1210", name: "Akumulasi Penyusutan", type: "ASSET" as const, normalBalance: "CREDIT" },
    { code: "2100", name: "Utang Usaha", type: "LIABILITY" as const, normalBalance: "CREDIT" },
    { code: "2110", name: "Utang GRNI", type: "LIABILITY" as const, normalBalance: "CREDIT" },
    { code: "2120", name: "PPN Keluaran", type: "LIABILITY" as const, normalBalance: "CREDIT" },
    { code: "3100", name: "Modal", type: "EQUITY" as const, normalBalance: "CREDIT" },
    { code: "3200", name: "Laba Ditahan", type: "EQUITY" as const, normalBalance: "CREDIT" },
    { code: "4100", name: "Pendapatan Penjualan", type: "REVENUE" as const, normalBalance: "CREDIT" },
    { code: "5100", name: "Harga Pokok Penjualan", type: "COGS" as const, normalBalance: "DEBIT" },
    { code: "6100", name: "Beban Operasional", type: "EXPENSE" as const, normalBalance: "DEBIT" },
    { code: "6200", name: "Beban Penyusutan", type: "EXPENSE" as const, normalBalance: "DEBIT" },
  ];

  for (const a of accounts) {
    await prisma.account.upsert({
      where: { companyId_code: { companyId, code: a.code } },
      create: { companyId, ...a },
      update: { name: a.name, type: a.type },
    });
  }
}

export async function seedDefaultTaxCodes(companyId: string) {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const codes = [
    {
      code: "PPN_OUT_11",
      name: "PPN Keluaran 11%",
      taxType: "PPN" as const,
      direction: "OUTPUT" as const,
      rate: "11",
      glAccountCode: "2120",
    },
    {
      code: "PPN_IN_11",
      name: "PPN Masukan 11%",
      taxType: "PPN" as const,
      direction: "INPUT" as const,
      rate: "11",
      glAccountCode: "1140",
    },
    {
      code: "PPH23_2",
      name: "PPh 23 2%",
      taxType: "PPH23" as const,
      direction: "WITHHOLDING" as const,
      rate: "2",
      glAccountCode: "2100",
    },
  ];

  for (const c of codes) {
    const existing = await prisma.taxCode.findFirst({
      where: { companyId, code: c.code, effectiveFrom: from },
    });
    if (!existing) {
      await prisma.taxCode.create({
        data: {
          companyId,
          ...c,
          effectiveFrom: from,
        },
      });
    }
  }
}

export async function seedPostingRules(companyId: string) {
  const rules = [
    {
      code: "GR_POST",
      name: "Goods Receipt",
      sourceEvent: "goods_receipt.post",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "1130" },
          { side: "CREDIT", accountCode: "2110" },
        ],
      },
    },
    {
      code: "DO_POST",
      name: "Delivery COGS",
      sourceEvent: "delivery_order.post",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "5100" },
          { side: "CREDIT", accountCode: "1130" },
        ],
      },
    },
    {
      code: "INV_ISSUE",
      name: "Sales Invoice",
      sourceEvent: "sales_invoice.issue",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "1120" },
          { side: "CREDIT", accountCode: "4100" },
          { side: "CREDIT", accountCode: "2120", tax: true },
        ],
      },
    },
    {
      code: "CP_POST",
      name: "Customer Payment",
      sourceEvent: "customer_payment.post",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "1110" },
          { side: "CREDIT", accountCode: "1120" },
        ],
      },
    },
    {
      code: "SB_OPEN",
      name: "Supplier Bill",
      sourceEvent: "supplier_bill.open",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "2110" },
          { side: "DEBIT", accountCode: "1140", tax: true },
          { side: "CREDIT", accountCode: "2100" },
        ],
      },
    },
    {
      code: "SP_POST",
      name: "Supplier Payment",
      sourceEvent: "supplier_payment.post",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "2100" },
          { side: "CREDIT", accountCode: "1110" },
        ],
      },
    },
    {
      code: "MO_COMPLETE",
      name: "Production Completion",
      sourceEvent: "production.complete",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "1130" },
          { side: "CREDIT", accountCode: "5100" },
        ],
      },
    },
    {
      code: "PAYROLL_POST",
      name: "Payroll Posting",
      sourceEvent: "payroll.post",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "6100" },
          { side: "CREDIT", accountCode: "2100" },
        ],
      },
    },
    {
      code: "CN_ISSUE",
      name: "Credit Note",
      sourceEvent: "credit_note.issue",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "4100" },
          { side: "CREDIT", accountCode: "1120" },
        ],
      },
    },
    {
      code: "DN_ISSUE",
      name: "Debit Note",
      sourceEvent: "debit_note.issue",
      config: {
        lines: [
          { side: "DEBIT", accountCode: "2100" },
          { side: "CREDIT", accountCode: "1130" },
        ],
      },
    },
  ];

  for (const r of rules) {
    const rule = await prisma.postingRule.upsert({
      where: { companyId_code: { companyId, code: r.code } },
      create: {
        companyId,
        code: r.code,
        name: r.name,
        sourceEvent: r.sourceEvent,
      },
      update: { name: r.name, sourceEvent: r.sourceEvent },
    });
    const versionCount = await prisma.postingRuleVersion.count({
      where: { postingRuleId: rule.id },
    });
    if (versionCount === 0) {
      await prisma.postingRuleVersion.create({
        data: {
          postingRuleId: rule.id,
          version: 1,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          config: r.config,
        },
      });
    }
  }
}

type OnboardInput = {
  userId: string;
  name: string;
  legalName?: string;
  code?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  branchName?: string;
  warehouseName?: string;
};

export async function onboardCompany(input: OnboardInput) {
  const name = input.name.trim();
  if (!name) throw validationError("Nama perusahaan wajib");

  let code = (input.code || slugify(name) || "CO").slice(0, 12);
  const exists = await prisma.company.findUnique({ where: { code } });
  if (exists) {
    code = `${code}${Date.now().toString().slice(-4)}`.slice(0, 12);
  }

  await ensureGlobalPermissions();

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        code,
        name,
        legalName: input.legalName || name,
        email: input.email,
        phone: input.phone,
        address: input.address,
        city: input.city,
        province: input.province,
      },
    });

    const branch = await tx.branch.create({
      data: {
        companyId: company.id,
        code: "HQ",
        name: input.branchName || "Kantor Pusat",
        city: input.city,
        province: input.province,
      },
    });

    const warehouse = await tx.warehouse.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        code: "MAIN",
        name: input.warehouseName || "Gudang Utama",
        type: "MAIN",
      },
    });

    await tx.companySetting.create({
      data: {
        companyId: company.id,
        defaultBranchId: branch.id,
        defaultWarehouseId: warehouse.id,
      },
    });

    await tx.unit.createMany({
      data: [
        { companyId: company.id, name: "Pieces", symbol: "Pcs", precision: 0 },
        { companyId: company.id, name: "Box", symbol: "Box", precision: 0 },
        { companyId: company.id, name: "Kilogram", symbol: "Kg", precision: 3 },
      ],
    });

    const year = new Date().getUTCFullYear();
    const fiscalYear = await tx.fiscalYear.create({
      data: {
        companyId: company.id,
        name: String(year),
        startDate: new Date(`${year}-01-01T00:00:00.000Z`),
        endDate: new Date(`${year}-12-31T23:59:59.999Z`),
      },
    });

    for (let m = 1; m <= 12; m++) {
      const start = new Date(Date.UTC(year, m - 1, 1));
      const end = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      await tx.fiscalPeriod.create({
        data: {
          fiscalYearId: fiscalYear.id,
          name: `${year}-${String(m).padStart(2, "0")}`,
          startDate: start,
          endDate: end,
        },
      });
    }

    await tx.taxRegistration.create({
      data: { companyId: company.id, isPkp: true },
    });

    await tx.bankAccount.create({
      data: {
        companyId: company.id,
        code: "BCA-01",
        name: "Rekening Operasional",
        bankName: "BCA",
        currency: "IDR",
      },
    });

    return { company, branch, warehouse };
  });

  await seedCompanyRoles(result.company.id);
  await seedDefaultCoa(result.company.id);
  await seedDefaultTaxCodes(result.company.id);
  await seedPostingRules(result.company.id);

  const ownerRole = await prisma.role.findFirst({
    where: { companyId: result.company.id, code: "OWNER" },
  });
  if (!ownerRole) throw conflict("Role OWNER gagal dibuat");

  await prisma.membership.create({
    data: {
      companyId: result.company.id,
      userId: input.userId,
      roleId: ownerRole.id,
      status: "ACTIVE",
      branchAccess: { create: [{ branchId: result.branch.id }] },
      warehouseAccess: { create: [{ warehouseId: result.warehouse.id }] },
    },
  });

  await writeAudit({
    companyId: result.company.id,
    userId: input.userId,
    action: "company.create",
    entityType: "Company",
    entityId: result.company.id,
    entityNumber: result.company.code,
    afterData: { name: result.company.name, code: result.company.code },
  });

  await setActiveCompanyId(result.company.id);
  return result;
}
