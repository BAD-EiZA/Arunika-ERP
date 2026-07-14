import { prisma } from "@/lib/db";
import { notFound, validationError } from "@/lib/errors";
import { money, toPrismaMoney } from "@/lib/money";

export async function createLead(input: {
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  notes?: string;
  ownerName?: string;
}) {
  if (!input.name.trim()) throw validationError("Nama lead wajib");
  return prisma.crmLead.create({
    data: {
      companyId: input.companyId,
      name: input.name.trim(),
      email: input.email,
      phone: input.phone,
      companyName: input.companyName,
      source: input.source,
      notes: input.notes,
      ownerName: input.ownerName,
      status: "NEW",
    },
  });
}

export async function updateLeadStatus(
  companyId: string,
  id: string,
  status: string,
) {
  const lead = await prisma.crmLead.findFirst({ where: { id, companyId } });
  if (!lead) throw notFound("Lead tidak ditemukan");
  return prisma.crmLead.update({
    where: { id },
    data: { status },
  });
}

export async function createOpportunity(input: {
  companyId: string;
  title: string;
  leadId?: string;
  customerId?: string;
  amount?: string | number;
  stage?: string;
  probability?: number;
  notes?: string;
}) {
  if (!input.title.trim()) throw validationError("Judul opportunity wajib");
  return prisma.crmOpportunity.create({
    data: {
      companyId: input.companyId,
      title: input.title.trim(),
      leadId: input.leadId,
      customerId: input.customerId,
      amount: toPrismaMoney(money(input.amount ?? 0)),
      stage: input.stage ?? "QUALIFICATION",
      probability: input.probability ?? 10,
      notes: input.notes,
      status: "OPEN",
    },
  });
}

export async function moveOpportunityStage(
  companyId: string,
  id: string,
  stage: string,
  probability?: number,
) {
  const opp = await prisma.crmOpportunity.findFirst({
    where: { id, companyId },
  });
  if (!opp) throw notFound("Opportunity tidak ditemukan");
  return prisma.crmOpportunity.update({
    where: { id },
    data: {
      stage,
      probability: probability ?? opp.probability,
      status: stage === "WON" || stage === "LOST" ? "CLOSED" : "OPEN",
    },
  });
}
