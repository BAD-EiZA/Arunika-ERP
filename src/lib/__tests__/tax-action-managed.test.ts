const tax = { createManagedTaxDocument: jest.fn(), correctManagedTaxDocument: jest.fn(), createOfflineTaxExport: jest.fn(), createTaxDocument: jest.fn(), correctTaxDocument: jest.fn(), exportTaxPeriod: jest.fn() };
jest.mock("@/server/services/tax", () => tax);
const db = { taxPeriod: { findUnique: jest.fn() }, taxDocument: { findFirst: jest.fn(), create: jest.fn() }, $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/auth", () => ({ requirePermission: jest.fn(async () => ({ companyId: "company", user: { id: "actor" } })), assertResourceAccess: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
import { actionCreateTaxDoc, actionCorrectTaxDoc, actionExportTax } from "@/app/actions";

beforeEach(() => jest.clearAllMocks());

it.each(["create", "correct", "export"])("%s action enforces real managed period guard before writes", async kind => {
  const real = jest.requireActual<typeof import("@/server/services/tax")>("@/server/services/tax");
  tax.createManagedTaxDocument.mockImplementationOnce(real.createManagedTaxDocument);
  tax.correctManagedTaxDocument.mockImplementationOnce(real.correctManagedTaxDocument);
  tax.createOfflineTaxExport.mockImplementationOnce(real.createOfflineTaxExport);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
  db.taxDocument.findFirst.mockResolvedValue({ id: "document", taxPeriod: "202607" });
  db.taxPeriod.findUnique.mockResolvedValue({ status: kind === "export" ? "OPEN" : "CLOSED" });
  const data = new FormData();
  for (const [k, v] of Object.entries({ id: "document", taxPeriod: "202607", dpp: "100", taxAmount: "11", notes: "Correction", documentDate: "2026-07-02", sourceDocType: "INVOICE", sourceDocId: "invoice" })) data.set(k, v);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect((kind === "create" ? actionCreateTaxDoc : kind === "correct" ? actionCorrectTaxDoc : actionExportTax)(data)).rejects.toThrow(kind === "export" ? "Close tax period before export" : "Tax period closed");
    expect(db.taxDocument.create).not.toHaveBeenCalled();
  } finally { log.mockRestore(); tax.createManagedTaxDocument.mockReset(); tax.correctManagedTaxDocument.mockReset(); tax.createOfflineTaxExport.mockReset(); }
});

it("creates with effective rule and actor, never accepts caller tax amount", async () => {
  const data = new FormData();
  for (const [k, v] of Object.entries({ docType: "FAKTUR_KELUARAN", taxType: "PPN", dpp: "100", taxAmount: "0", taxPeriod: "202607", taxCode: "VAT", documentDate: "2026-07-02", sourceDocType: "INVOICE", sourceDocId: "invoice", partnerName: "Partner" })) data.set(k, v);
  await actionCreateTaxDoc(data);
  expect(tax.createManagedTaxDocument).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company", actorId: "actor", dpp: "100", taxPeriod: "202607", taxCode: "VAT", sourceDocId: "invoice", documentDate: new Date("2026-07-02") }));
  expect(tax.createManagedTaxDocument.mock.calls[0][0]).not.toHaveProperty("taxAmount");
  expect(tax.createTaxDocument).not.toHaveBeenCalled();
});

it("corrects with reason through closed-period guarded service", async () => {
  const data = new FormData();
  for (const [k, v] of Object.entries({ id: "document", dpp: "100", taxAmount: "11", notes: "Correction" })) data.set(k, v);
  await actionCorrectTaxDoc(data);
  expect(tax.correctManagedTaxDocument).toHaveBeenCalledWith({ companyId: "company", actorId: "actor", taxDocumentId: "document", dpp: "100", taxAmount: "11", reason: "Correction" });
  expect(tax.correctTaxDocument).not.toHaveBeenCalled();
});

it("exports only closed period through managed export", async () => {
  const data = new FormData(); data.set("taxPeriod", "202607");
  await actionExportTax(data);
  expect(tax.createOfflineTaxExport).toHaveBeenCalledWith("company", "202607", "actor");
  expect(tax.exportTaxPeriod).not.toHaveBeenCalled();
});
