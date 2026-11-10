import { createSalesReturn, createPurchaseReturn, postSalesReturn, postPurchaseReturn } from "../returns";
const db = {$transaction:jest.fn()};
jest.mock("@/lib/db",()=>({get prisma(){return db;}}));
jest.mock("@/lib/document-number",()=>({nextDocumentNumber:jest.fn(async()=>"R1")}));
jest.mock("../inventory",()=>({postStockMovement:jest.fn(),assertWarehouseOwnership:jest.fn()}));
jest.mock("../accounting",()=>({postJournal:jest.fn()}));
it.each([createSalesReturn, createPurchaseReturn])("rejects duplicate return products", async(create)=>{
 await expect(create({companyId:"c",userId:"u",customerId:"cu",supplierId:"s",items:[{productId:"p",quantity:1,unitPrice:1,unitCost:1},{productId:"p",quantity:1,unitPrice:1,unitCost:1}]})).rejects.toThrow("Produk duplikat");
});
it.each([createSalesReturn, createPurchaseReturn])("rejects nonpositive return quantity", async(create)=>{
 await expect(create({companyId:"c",userId:"u",customerId:"cu",supplierId:"s",items:[{productId:"p",quantity:0,unitPrice:1,unitCost:1}]})).rejects.toThrow("Kuantitas harus > 0");
});
it.each([createSalesReturn, createPurchaseReturn])("requires explicit source item, warehouse and stable request key",async create=>{
 await expect(create({companyId:"c",userId:"u",customerId:"cu",supplierId:"s",items:[{productId:"p",quantity:1,unitPrice:1,unitCost:1}]})).rejects.toThrow("Sumber item, gudang dan idempotencyKey wajib");
});
it("purchase outbound requires inspection approval",async()=>{
 db.$transaction.mockImplementationOnce((fn: (tx: Record<string, unknown>) => Promise<unknown>)=>fn({$executeRaw:jest.fn(),purchaseReturn:{findFirst:jest.fn(async()=>({id:"r",status:"DRAFT",warehouseId:"w",items:[]}))}}));
 await expect(postPurchaseReturn({companyId:"c",userId:"u",id:"r",warehouseId:"w"})).rejects.toThrow("Inspeksi dan approval wajib");
});
it("quarantine cannot be posted to a different warehouse",async()=>{
 db.$transaction.mockImplementationOnce((fn: (tx: Record<string, unknown>) => Promise<unknown>)=>fn({$executeRaw:jest.fn(),salesReturn:{findFirst:jest.fn(async()=>({id:"r",status:"DRAFT",warehouseId:"original",items:[]}))}}));
 await expect(postSalesReturn({companyId:"c",userId:"u",id:"r",warehouseId:"w"})).rejects.toThrow("Gudang harus sesuai return");
});
