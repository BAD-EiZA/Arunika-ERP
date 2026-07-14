import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import {
  deleteApprovalMatrix,
  listApprovalMatrix,
  upsertApprovalMatrix,
} from "@/server/services/approvals";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const rows = await listApprovalMatrix(ctx.companyId);
    return {
      matrix: rows.map((r) => ({
        id: r.id,
        docType: r.docType,
        minAmount: r.minAmount.toString(),
        maxAmount: r.maxAmount?.toString() ?? null,
        roleCode: r.roleCode,
        stepOrder: r.stepOrder,
        isActive: r.isActive,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("account:manage");
    const body = (await req.json()) as {
      action?: "upsert" | "delete";
      id?: string;
      docType?: string;
      minAmount?: string | number;
      maxAmount?: string | number | null;
      roleCode?: string;
      stepOrder?: number;
      isActive?: boolean;
    };

    if (body.action === "delete") {
      const row = await deleteApprovalMatrix(
        ctx.companyId,
        String(body.id ?? ""),
      );
      return { id: row.id, isActive: row.isActive };
    }

    const row = await upsertApprovalMatrix({
      companyId: ctx.companyId,
      id: body.id,
      docType: String(body.docType ?? ""),
      minAmount: body.minAmount,
      maxAmount: body.maxAmount,
      roleCode: String(body.roleCode ?? ""),
      stepOrder: body.stepOrder,
      isActive: body.isActive,
    });
    return {
      matrix: {
        id: row.id,
        docType: row.docType,
        roleCode: row.roleCode,
      },
    };
  });
}
