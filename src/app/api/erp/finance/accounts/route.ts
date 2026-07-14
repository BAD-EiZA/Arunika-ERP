import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createAccount,
  deleteAccount,
  listCostCenters,
  updateAccount,
  upsertCostCenter,
} from "@/server/services/finance-coa";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [accounts, costCenters] = await Promise.all([
      prisma.account.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { code: "asc" },
      }),
      listCostCenters(ctx.companyId),
    ]);
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
        parentId: a.parentId,
        isActive: a.isActive,
        allowManual: a.allowManual,
      })),
      costCenters: costCenters.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        isActive: c.isActive,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("account:manage");
    const body = (await req.json()) as {
      action?:
        | "create"
        | "update"
        | "delete"
        | "cost_center";
      id?: string;
      code?: string;
      name?: string;
      type?: string;
      normalBalance?: string;
      parentId?: string | null;
      isActive?: boolean;
      allowManual?: boolean;
    };

    if (body.action === "delete") {
      const account = await deleteAccount(ctx.companyId, String(body.id ?? ""));
      return {
        account: {
          id: account.id,
          code: account.code,
          isActive: "isActive" in account ? account.isActive : false,
          deleted: !("isActive" in account) || account.isActive === false,
        },
      };
    }

    if (body.action === "cost_center") {
      const cc = await upsertCostCenter({
        companyId: ctx.companyId,
        id: body.id,
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
        isActive: body.isActive,
      });
      return { costCenter: { id: cc.id, code: cc.code, name: cc.name } };
    }

    if (body.action === "update") {
      const account = await updateAccount({
        companyId: ctx.companyId,
        id: String(body.id ?? ""),
        name: body.name,
        type: body.type,
        normalBalance: body.normalBalance,
        parentId: body.parentId,
        isActive: body.isActive,
        allowManual: body.allowManual,
      });
      return { account: { id: account.id, code: account.code, name: account.name } };
    }

    const account = await createAccount({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      type: String(body.type ?? "EXPENSE"),
      normalBalance: body.normalBalance,
      parentId: body.parentId || undefined,
      allowManual: body.allowManual,
    });
    return { account: { id: account.id, code: account.code, name: account.name } };
  });
}
