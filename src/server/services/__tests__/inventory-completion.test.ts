import { createOpname, advanceTransfer, importOpnameCsv, advanceAdjustment, configureInventoryAccounts } from "../inventory-workflows";
import { postStockMovement } from "../inventory";
import { postJournal } from "../accounting";
import { authorizeInventoryFile } from "@/app/api/erp/inventory/files/policy";
import { renderCountSheet } from "@/app/api/erp/inventory/count-sheet/render";
it("inventory API authenticates before JSON or persistence", async () => {
 const { POST } = await import("@/app/api/erp/inventory/route");
 const req={json:jest.fn()} as unknown as Request;
 const r=await POST(req); expect(r.status).toBe(401); expect(req.json).not.toHaveBeenCalled();
});
jest.mock("@/lib/auth",()=>({requireTenant:jest.fn(async()=>{const {AppError}=await import("@/lib/errors");throw new AppError("UNAUTHORIZED","Login wajib",401);}),requirePermission:jest.fn(),requireIdempotencyKey:jest.fn()}));
it("private inventory attachments reject public access", async () => {
 await expect(authorizeInventoryFile({ companyId: "c", user: { id: "u" }, permissions: ["stock:adjust"], branchIds: [], warehouseIds: [] } as never, "StockAdjustment", "d", "upload", "PUBLIC")).rejects.toThrow();
});
it("print sheet escapes document/product text and includes zero snapshot", () => {
 const html = renderCountSheet({ number: "<script>", items: [{ id: "i", systemQty: "0", product: { sku: "&", name: "<img>" } }] });
 expect(html).toContain("&lt;script&gt;"); expect(html).toContain("&lt;img&gt;"); expect(html).toContain("0"); expect(html).not.toContain("<script>");
});
const db = { $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("../inventory", () => ({ postStockMovement: jest.fn(async () => ({ unitCost: "7" })), assertWarehouseOwnership: jest.fn(async (_tx, input) => ({ id: input.warehouseId, branchId: "b", isActive: true })) }));
jest.mock("../accounting", () => ({ postJournal: jest.fn() }));
const base = { companyId: "c", userId: "u", access: { branchIds: [], warehouseIds: [] } };
function setup(extra: Record<string, unknown> = {}) {
 const t = { $executeRaw: jest.fn(), branch: { findFirst: jest.fn(async () => ({ isActive: true })) }, product: { findMany: jest.fn(async () => [{ id: "p" }, { id: "zero" }]) }, stockBalance: { findMany: jest.fn(async () => [{ productId: "p", quantityOnHand: "10" }]), findUnique: jest.fn(async () => ({ quantityOnHand: "10", quantityReserved: "0", averageCost: "7" })) }, stockOpname: { findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: {data: unknown}) => data) }, stockTransfer: { findFirst: jest.fn(), update: jest.fn() }, stockTransferItem: { update: jest.fn() }, stockMovement: { findUnique: jest.fn(async () => ({ unitCost: "7" })) }, stockAdjustment: { findFirst: jest.fn(), update: jest.fn() }, stockOpnameItem: { update: jest.fn() }, auditLog: { findFirst: jest.fn(async () => ({ metadata: { valuation: "7" } })), create: jest.fn() }, companySetting: { findUnique: jest.fn(async () => ({ inventoryAccountCode: "INV", stockGainAccountCode: "GAIN", stockLossAccountCode: "LOSS" })), upsert: jest.fn() }, account: { findMany: jest.fn(async () => [{ code: "INV", type: "ASSET", isActive: true }, { code: "GAIN", type: "OTHER_INCOME", isActive: true }, { code: "LOSS", type: "EXPENSE", isActive: true }]) }, ...extra };
 db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(t)); return t;
}
beforeEach(() => jest.clearAllMocks());
it("receipt target replay never adds stock twice", async () => {
 const t = setup({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", number: "T", status: "IN_TRANSIT", fromWarehouseId: "a", toWarehouseId: "z", items: [{ id: "i", productId: "p", quantity: "5", receivedQty: "2" }] })), update: jest.fn() } });
 await advanceTransfer({ ...base, id: "t", action: "receive", items: [{ itemId: "i", quantity: "2" }] }); expect(postStockMovement).not.toHaveBeenCalled(); expect(t.stockTransferItem.update).not.toHaveBeenCalled();
});
it("final difference requires reason even for omitted snapshot rows", async () => {
 setup({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", number: "T", status: "IN_TRANSIT", fromWarehouseId: "a", toWarehouseId: "z", items: [{ id: "i", productId: "p", quantity: "5", receivedQty: "0" }, { id: "j", productId: "q", quantity: "3", receivedQty: "0" }] })), update: jest.fn() } });
 await expect(advanceTransfer({ ...base, id: "t", action: "receive", items: [{ itemId: "i", quantity: "5" }], final: true })).rejects.toThrow("Alasan"); expect(postStockMovement).not.toHaveBeenCalled();
});
it("reverse received transfer rejects reserved destination inventory", async () => {
 const t = setup({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", number: "T", status: "RECEIVED", fromWarehouseId: "a", toWarehouseId: "z", items: [{ id: "i", productId: "p", quantity: "5", receivedQty: "5" }] })), update: jest.fn() } });
 t.stockBalance.findUnique.mockResolvedValue({ quantityOnHand: "5", quantityReserved: "1", averageCost: "7" });
 await expect(advanceTransfer({ ...base, id: "t", action: "reverse", reason: "Wrong destination" })).rejects.toThrow("Stok"); expect(postStockMovement).not.toHaveBeenCalled();
});
it("reversal replay performs no movement after cancellation", async () => {
 setup({ stockTransfer: { findFirst: jest.fn(async () => ({ id:"t", status:"CANCELLED", fromWarehouseId:"a", toWarehouseId:"z", items:[] })), update:jest.fn() }, auditLog:{ findFirst:jest.fn(async()=>({metadata:{reason:"wrong"}})),create:jest.fn() } });
 await advanceTransfer({...base,id:"t",action:"reverse",reason:"wrong"}); expect(postStockMovement).not.toHaveBeenCalled();
});
it("CSV imports decimal counts only for frozen snapshot", async () => {
 const t=setup({stockOpname:{findFirst:jest.fn(async()=>({id:"o",warehouseId:"a",status:"COUNTING",items:[{id:"i",systemQty:"1"}]}))}});
 await importOpnameCsv({...base,id:"o",csv:"itemId,count\ni,0.5"}); expect(t.stockOpnameItem.update).toHaveBeenCalledWith({where:{id:"i"},data:{countedQty:"0.5000",differenceQty:"-0.5000"}});
});
it("final difference returns unreceived stock at original cost", async () => {
 setup({stockTransfer:{findFirst:jest.fn(async()=>({id:"t",number:"T",status:"IN_TRANSIT",fromWarehouseId:"a",toWarehouseId:"z",items:[{id:"i",productId:"p",quantity:"5",receivedQty:"1"}]})),update:jest.fn()}});
 await advanceTransfer({...base,id:"t",action:"receive",items:[{itemId:"i",quantity:"2"}],final:true,reason:"Return unopened"});
 expect(jest.mocked(postStockMovement).mock.calls.map(c=>[c[1].warehouseId,c[1].quantity,c[1].unitCost])).toEqual([["z","1","7"],["a","3","7"]]);
});
it("reversal restores only received stock after final difference already returned", async () => {
 setup({stockTransfer:{findFirst:jest.fn(async()=>({id:"t",number:"T",status:"RECEIVED",fromWarehouseId:"a",toWarehouseId:"z",items:[{id:"i",productId:"p",quantity:"5",receivedQty:"2"}]})),update:jest.fn()}});
 await advanceTransfer({...base,id:"t",action:"reverse",reason:"Wrong"});
 expect(jest.mocked(postStockMovement).mock.calls.map(c=>[c[1].warehouseId,c[1].type,c[1].quantity])).toEqual([["z","TRANSFER_OUT","2"],["a","TRANSFER_IN","2"]]);
});
it("missing account configuration blocks stock and journal", async () => {
 setup({companySetting:{findUnique:jest.fn(async()=>null)},stockAdjustment:{findFirst:jest.fn(async()=>({id:"d",number:"D",warehouseId:"a",status:"APPROVED",items:[{id:"i",productId:"p",quantityBefore:"10",quantityDelta:"-1"}]})),update:jest.fn()}});
 await expect(advanceAdjustment({...base,id:"d",action:"post"})).rejects.toThrow("Konfigurasi");expect(postStockMovement).not.toHaveBeenCalled();expect(postJournal).not.toHaveBeenCalled();
});
it("receipt replay after a later partial receipt remains idempotent", async () => {
 const rows=[{id:"i",productId:"p",quantity:"5",receivedQty:"0"}]; let hash="";
 setup({stockTransfer:{findFirst:jest.fn(async()=>({id:"t",number:"T",status:"IN_TRANSIT",fromWarehouseId:"a",toWarehouseId:"z",items:rows})),update:jest.fn()},stockTransferItem:{update:jest.fn(async()=>{rows[0].receivedQty="3";})},auditLog:{findFirst:jest.fn(async()=>hash?{metadata:{receiptHash:hash}}:null),create:jest.fn(async({data}:{data:{metadata:{receiptHash:string}}})=>{hash=data.metadata.receiptHash;})}});
 await advanceTransfer({...base,id:"t",action:"receive",items:[{itemId:"i",quantity:"2"}]}); jest.mocked(postStockMovement).mockClear();
 await advanceTransfer({...base,id:"t",action:"receive",items:[{itemId:"i",quantity:"2"}]}); expect(postStockMovement).not.toHaveBeenCalled();
});
it("reversal rejects changed destination valuation instead of silently moving value", async () => {
 const t=setup({stockTransfer:{findFirst:jest.fn(async()=>({id:"t",number:"T",status:"RECEIVED",fromWarehouseId:"a",toWarehouseId:"z",items:[{id:"i",productId:"p",quantity:"5",receivedQty:"2"}]})),update:jest.fn()}});
 t.stockBalance.findUnique.mockResolvedValue({quantityOnHand:"10",quantityReserved:"0",averageCost:"8"});
 await expect(advanceTransfer({...base,id:"t",action:"reverse",reason:"Wrong"})).rejects.toThrow("Valuasi"); expect(postStockMovement).not.toHaveBeenCalled();
});
it("GL sums rounded movement values rather than rounding the sum", async () => {
 const t=setup({stockAdjustment:{findFirst:jest.fn(async()=>({id:"d",number:"D",warehouseId:"a",status:"APPROVED",items:[{id:"i",productId:"p",quantityBefore:"10",quantityDelta:"-0.001"},{id:"j",productId:"q",quantityBefore:"10",quantityDelta:"-0.001"}]})),update:jest.fn()},auditLog:{findFirst:jest.fn(async()=>({metadata:{valuation:"0.014"}})),create:jest.fn()}});
 await advanceAdjustment({...base,id:"d",action:"post"});expect(postJournal).toHaveBeenCalledWith(t,expect.objectContaining({lines:[{accountCode:"LOSS",debit:"0.02"},{accountCode:"INV",credit:"0.02"}]}));
});
it("snapshot includes stock product without any balance", async () => {
 const t = setup(); await createOpname({ ...base, warehouseId: "a" });
 expect(t.stockOpname.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ items: { create: [{ productId: "p", systemQty: "10.0000" }, { productId: "zero", systemQty: "0.0000" }] } }) }));
});
it("partial receipt records only incremental quantity and stays in transit", async () => {
 const t = setup({ stockTransfer: { findFirst: jest.fn(async () => ({ id: "t", number: "T", status: "IN_TRANSIT", fromWarehouseId: "a", toWarehouseId: "z", items: [{ id: "i", productId: "p", quantity: "5", receivedQty: "0" }] })), update: jest.fn() } });
 await advanceTransfer({ ...base, id: "t", action: "receive", items: [{ itemId: "i", quantity: "2" }] });
 expect(postStockMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "TRANSFER_IN", quantity: "2" }));
 expect(t.stockTransferItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { receivedQty: "2.0000" } })); expect(t.stockTransfer.update).not.toHaveBeenCalled();
});
it("CSV duplicate rows reject atomically before updates", async () => {
 const t = setup({ stockOpname: { findFirst: jest.fn(async () => ({ id: "o", warehouseId: "a", status: "COUNTING", items: [{ id: "i", systemQty: "1" }] })) } });
 await expect(importOpnameCsv({ ...base, id: "o", csv: "itemId,count\ni,1\ni,2" })).rejects.toThrow(); expect(t.stockOpnameItem.update).not.toHaveBeenCalled();
});
it("posting adjustment requires configured tenant accounts and journal in same transaction", async () => {
 setup({ stockAdjustment: { findFirst: jest.fn(async () => ({ id: "d", number: "D", warehouseId: "a", status: "APPROVED", items: [{ id: "i", productId: "p", quantityDelta: "-1", quantityBefore: "10" }] })), update: jest.fn() } });
 await advanceAdjustment({ ...base, id: "d", action: "post" }); expect(postJournal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourceDocType: "StockAdjustment", lines: [{ accountCode: "LOSS", debit: "7.00" }, { accountCode: "INV", credit: "7.00" }] }));
});
it("account configuration rejects inactive or wrong-type accounts", async () => {
 const t = setup(); t.account.findMany.mockResolvedValue([{ code: "INV", type: "EXPENSE", isActive: true }]);
 await expect(configureInventoryAccounts({ ...base, inventoryAccountCode: "INV", stockGainAccountCode: "GAIN", stockLossAccountCode: "LOSS" })).rejects.toThrow(); expect(t.companySetting.upsert).not.toHaveBeenCalled();
});
