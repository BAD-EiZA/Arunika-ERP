import { convertMrpSuggestion } from "../mrp-convert";
const db = {
  mrpSuggestion: { findFirst: jest.fn(), updateMany: jest.fn() },
  warehouse: { findFirst: jest.fn() }, branch: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() }, supplier: { findFirst: jest.fn() },
  billOfMaterials: { findFirst: jest.fn() },
  purchaseOrder: { create: jest.fn() }, productionOrder: { create: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/document-number", () => ({nextDocumentNumber: jest.fn(async () => "PO/1")}));
it("conversion rejects foreign warehouse before creating a document", async () => {
  db.mrpSuggestion.findFirst.mockResolvedValue({id:"s",productId:"p",isConverted:false,suggestionType:"PURCHASE",quantity:"2",mrpRun:{number:"MRP/1"}});
  db.product.findFirst.mockResolvedValue({id:"p",purchasePrice:"10"});
  db.warehouse.findFirst.mockResolvedValue(null);
  db.mrpSuggestion.updateMany.mockResolvedValue({count:1});
  await expect(convertMrpSuggestion({companyId:"c",userId:"u",suggestionId:"s",warehouseId:"foreign"})).rejects.toThrow(/Warehouse/);
  expect(db.purchaseOrder.create).not.toHaveBeenCalled();
});
it("conversion rolls back document when conditional claim fails", async () => {
  db.mrpSuggestion.findFirst.mockResolvedValue({id:"s",productId:"p",isConverted:false,suggestionType:"PURCHASE",quantity:"2",mrpRun:{number:"MRP/1"}});
  db.product.findFirst.mockResolvedValue({id:"p",purchasePrice:"10"});
  db.supplier.findFirst.mockResolvedValue({id:"s1"});
  db.mrpSuggestion.updateMany.mockResolvedValue({count:0});
  await expect(convertMrpSuggestion({companyId:"c",userId:"u",suggestionId:"s"})).rejects.toThrow(/konversi|converted/i);
  expect(db.purchaseOrder.create).not.toHaveBeenCalled();
});
