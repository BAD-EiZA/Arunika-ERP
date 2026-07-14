import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createBankAccount,
  importBankStatement,
} from "@/server/services/treasury";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const accounts = await prisma.bankAccount.findMany({
      where: { companyId: ctx.companyId },
      include: {
        statements: {
          include: { lines: true },
          orderBy: { statementDate: "desc" },
          take: 5,
        },
      },
    });
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        bankName: a.bankName,
        accountNumber: a.accountNumber,
        statements: a.statements.map((s) => ({
          id: s.id,
          statementDate: s.statementDate.toISOString(),
          lines: s.lines.map((l) => ({
            id: l.id,
            lineDate: l.lineDate.toISOString(),
            description: l.description,
            amount: l.amount.toString(),
            isReconciled: l.isReconciled,
          })),
        })),
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?: "create" | "import";
      code?: string;
      name?: string;
      bankName?: string;
      accountNumber?: string;
      bankAccountId?: string;
      statementDate?: string;
      openingBalance?: string | number;
      closingBalance?: string | number;
      lineDate?: string;
      lineDescription?: string;
      lineAmount?: string | number;
    };

    if (body.action === "import") {
      const ctx = await requirePermission("bank_reconciliation:perform");
      const statement = await importBankStatement({
        companyId: ctx.companyId,
        bankAccountId: String(body.bankAccountId ?? ""),
        statementDate: new Date(body.statementDate || Date.now()),
        openingBalance: body.openingBalance ?? 0,
        closingBalance: body.closingBalance ?? 0,
        lines: [
          {
            lineDate: new Date(body.lineDate || Date.now()),
            description: body.lineDescription || undefined,
            amount: body.lineAmount ?? 0,
          },
        ],
      });
      return { statement: { id: statement.id } };
    }

    const ctx = await requirePermission("bank_account:manage");
    const bank = await createBankAccount({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      bankName: body.bankName || undefined,
      accountNumber: body.accountNumber || undefined,
    });
    return { bankAccount: { id: bank.id, code: bank.code } };
  });
}
