import type { Prisma } from "@/generated/prisma/client";
import { yearMonth } from "@/lib/dates";

type Tx = Prisma.TransactionClient;

const DEFAULT_PREFIX: Record<string, string> = {
  PO: "PO",
  GR: "GR",
  SB: "SB",
  SP: "SP",
  SO: "SO",
  DO: "DO",
  INV: "INV",
  CP: "CP",
  TR: "TR",
  ADJ: "ADJ",
  OPN: "OPN",
  PR: "PR",
  RFQ: "RFQ",
  PC: "PC",
  JE: "JE",
  TAX: "TAX",
  MO: "MO",
  MRP: "MRP",
  PAY: "PAY",
  SR: "SR",
  PRN: "PRN",
  CLM: "CLM",
  CN: "CN",
  DN: "DN",
  POS: "POS",
  LEAD: "LEAD",
  OPP: "OPP",
};

export async function nextDocumentNumber(
  tx: Tx,
  companyId: string,
  docType: string,
  branchId?: string | null,
): Promise<string> {
  const branchKey = branchId ?? null;
  let seq = await tx.documentSequence.findFirst({
    where: { companyId, docType, branchId: branchKey },
  });

  if (!seq) {
    seq = await tx.documentSequence.create({
      data: {
        companyId,
        docType,
        branchId: branchKey,
        prefix: DEFAULT_PREFIX[docType] ?? docType,
        pattern: "{PREFIX}/{YYYYMM}/{SEQUENCE}",
        lastValue: 0,
        padLength: 6,
      },
    });
  }

  const updated = await tx.documentSequence.update({
    where: { id: seq.id },
    data: { lastValue: { increment: 1 } },
  });

  const ym = yearMonth();
  const sequence = String(updated.lastValue).padStart(updated.padLength, "0");
  return updated.pattern
    .replaceAll("{PREFIX}", updated.prefix)
    .replaceAll("{YYYYMM}", ym)
    .replaceAll("{YYYY}", ym.slice(0, 4))
    .replaceAll("{YY}", ym.slice(2, 4))
    .replaceAll("{MM}", ym.slice(4, 6))
    .replaceAll("{SEQUENCE}", sequence)
    .replaceAll("{BRANCH}", branchId ? branchId.slice(0, 3).toUpperCase() : "HQ");
}
