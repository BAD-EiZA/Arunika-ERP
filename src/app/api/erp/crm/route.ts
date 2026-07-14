import { requirePermission, requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  createLead,
  createOpportunity,
  moveOpportunityStage,
  updateLeadStatus,
} from "@/server/services/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const ctx = await requireTenant();
    const [leads, opportunities] = await Promise.all([
      prisma.crmLead.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.crmOpportunity.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return {
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        companyName: l.companyName,
        source: l.source,
        status: l.status,
      })),
      opportunities: opportunities.map((o) => ({
        id: o.id,
        title: o.title,
        stage: o.stage,
        amount: o.amount.toString(),
        probability: o.probability,
        status: o.status,
        leadId: o.leadId,
      })),
    };
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const ctx = await requirePermission("customer:create");
    const body = (await req.json()) as {
      action?: "lead" | "lead_status" | "opportunity" | "opportunity_stage";
      id?: string;
      name?: string;
      email?: string;
      phone?: string;
      companyName?: string;
      source?: string;
      status?: string;
      title?: string;
      leadId?: string;
      amount?: string | number;
      stage?: string;
      probability?: number;
    };

    if (body.action === "lead_status") {
      const lead = await updateLeadStatus(
        ctx.companyId,
        String(body.id ?? ""),
        String(body.status ?? "NEW"),
      );
      return { lead: { id: lead.id, status: lead.status } };
    }
    if (body.action === "opportunity") {
      const opp = await createOpportunity({
        companyId: ctx.companyId,
        title: String(body.title ?? ""),
        leadId: body.leadId,
        amount: body.amount,
        stage: body.stage,
        probability: body.probability,
      });
      return { opportunity: { id: opp.id, title: opp.title } };
    }
    if (body.action === "opportunity_stage") {
      const opp = await moveOpportunityStage(
        ctx.companyId,
        String(body.id ?? ""),
        String(body.stage ?? "QUALIFICATION"),
        body.probability,
      );
      return { opportunity: { id: opp.id, stage: opp.stage } };
    }

    const lead = await createLead({
      companyId: ctx.companyId,
      name: String(body.name ?? ""),
      email: body.email,
      phone: body.phone,
      companyName: body.companyName,
      source: body.source,
    });
    return { lead: { id: lead.id, name: lead.name } };
  });
}
