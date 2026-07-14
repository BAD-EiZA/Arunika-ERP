import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createBankAccount,
  importBankStatement,
  reconcileStatementLine,
  syncBankFeed,
  unreconcileStatementLine,
  updateBankAccount,
} from "@/server/services/treasury";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [accounts, glAccounts] = await Promise.all([
      prisma.bankAccount.findMany({
        where: { companyId: ctx.companyId },
        include: {
          statements: {
            include: { lines: true },
            orderBy: { statementDate: "desc" },
            take: 10,
          },
        },
      }),
      prisma.account.findMany({
        where: { companyId: ctx.companyId, isActive: true, type: "ASSET" },
        orderBy: { code: "asc" },
      }),
    ]);
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        bankName: a.bankName,
        accountNumber: a.accountNumber,
        glAccountId: a.glAccountId,
        isActive: a.isActive,
        statements: a.statements.map((s) => ({
          id: s.id,
          statementDate: s.statementDate.toISOString(),
          openingBalance: s.openingBalance.toString(),
          closingBalance: s.closingBalance.toString(),
          lines: s.lines.map((l) => ({
            id: l.id,
            lineDate: l.lineDate.toISOString(),
            description: l.description,
            amount: l.amount.toString(),
            isReconciled: l.isReconciled,
            matchedRef: l.matchedRef,
          })),
        })),
      })),
      glAccounts: glAccounts.map((a) => ({
        code: a.code,
        name: a.name,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = (await req.json()) as {
      action?:
        | "create"
        | "update"
        | "import"
        | "reconcile"
        | "unreconcile"
        | "feed_sync";
      id?: string;
      code?: string;
      name?: string;
      bankName?: string;
      accountNumber?: string;
      glAccountCode?: string | null;
      isActive?: boolean;
      bankAccountId?: string;
      statementDate?: string;
      openingBalance?: string | number;
      closingBalance?: string | number;
      lines?: Array<{
        lineDate?: string;
        description?: string;
        amount?: string | number;
      }>;
      lineDate?: string;
      lineDescription?: string;
      lineAmount?: string | number;
      lineId?: string;
      matchedRef?: string;
    };

    if (body.action === "reconcile") {
      const ctx = await requirePermission("bank_reconciliation:perform");
      const line = await reconcileStatementLine(
        ctx.companyId,
        String(body.lineId ?? ""),
        String(body.matchedRef ?? "MATCHED"),
      );
      return { line: { id: line.id, isReconciled: line.isReconciled } };
    }
    if (body.action === "unreconcile") {
      const ctx = await requirePermission("bank_reconciliation:perform");
      const line = await unreconcileStatementLine(
        ctx.companyId,
        String(body.lineId ?? ""),
      );
      return { line: { id: line.id, isReconciled: line.isReconciled } };
    }
    if (body.action === "feed_sync") {
      const ctx = await requirePermission("bank_reconciliation:perform");
      const lines =
        body.lines && body.lines.length
          ? body.lines.map((l) => ({
              lineDate: l.lineDate || new Date().toISOString(),
              description: l.description || undefined,
              amount: l.amount ?? 0,
              externalRef: (l as { externalRef?: string }).externalRef,
            }))
          : [
              {
                lineDate: body.lineDate || new Date().toISOString(),
                description: body.lineDescription || undefined,
                amount: body.lineAmount ?? 0,
              },
            ];
      const result = await syncBankFeed({
        companyId: ctx.companyId,
        bankAccountId: String(body.bankAccountId ?? ""),
        provider: "CSV",
        lines,
      });
      return {
        feed: { id: result.feed.id, lastSyncAt: result.feed.lastSyncAt },
        statement: {
          id: result.statement.id,
          lineCount: result.statement.lines.length,
        },
      };
    }
    if (body.action === "import") {
      const ctx = await requirePermission("bank_reconciliation:perform");
      const lines =
        body.lines && body.lines.length
          ? body.lines.map((l) => ({
              lineDate: new Date(l.lineDate || Date.now()),
              description: l.description || undefined,
              amount: l.amount ?? 0,
            }))
          : [
              {
                lineDate: new Date(body.lineDate || Date.now()),
                description: body.lineDescription || undefined,
                amount: body.lineAmount ?? 0,
              },
            ];
      const statement = await importBankStatement({
        companyId: ctx.companyId,
        bankAccountId: String(body.bankAccountId ?? ""),
        statementDate: new Date(body.statementDate || Date.now()),
        openingBalance: body.openingBalance ?? 0,
        closingBalance: body.closingBalance ?? 0,
        lines,
      });
      return { statement: { id: statement.id, lineCount: statement.lines.length } };
    }
    if (body.action === "update") {
      const ctx = await requirePermission("bank_account:manage");
      const bank = await updateBankAccount({
        companyId: ctx.companyId,
        id: String(body.id ?? ""),
        name: body.name,
        bankName: body.bankName,
        accountNumber: body.accountNumber,
        glAccountCode: body.glAccountCode,
        isActive: body.isActive,
      });
      return { bankAccount: { id: bank.id, code: bank.code } };
    }

    const ctx = await requirePermission("bank_account:manage");
    const bank = await createBankAccount({
      companyId: ctx.companyId,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      bankName: body.bankName || undefined,
      accountNumber: body.accountNumber || undefined,
      glAccountCode: body.glAccountCode || undefined,
    });
    return { bankAccount: { id: bank.id, code: bank.code } };
  });
}
