import { runMrp } from "../mrp";
const db = {
  stockBalance:{findMany:jest.fn(async()=>[])}, salesOrderItem:{findMany:jest.fn(async()=>[{productId:"fg",quantity:"2",quantityDelivered:"0"}])},
  purchaseOrderItem:{findMany:jest.fn(async()=>[])}, productionOrder:{findMany:jest.fn(async()=>[])},
  billOfMaterials:{findMany:jest.fn()}, mrpRun:{create:jest.fn(async (args)=>args.data)},
  $transaction:jest.fn(async(fn:(tx:typeof db)=>Promise<unknown>)=>fn(db)),
};
jest.mock("@/lib/db",()=>({get prisma(){return db;}}));
jest.mock("@/lib/document-number",()=>({nextDocumentNumber:jest.fn(async()=>"MRP/1")}));
it("explodes unordered multilevel BOM once using latest version",async()=>{
  db.billOfMaterials.findMany.mockResolvedValue([
    {finishedProductId:"sub",version:1,quantity:"1",items:[{productId:"raw",quantity:"3",scrapPct:"0"}]},
    {finishedProductId:"fg",version:1,quantity:"1",items:[{productId:"sub",quantity:"99",scrapPct:"0"}]},
    {finishedProductId:"fg",version:2,quantity:"1",items:[{productId:"sub",quantity:"2",scrapPct:"0"}]},
  ]);
  const result=await runMrp({companyId:"c",userId:"u"});
  expect(result.lines.create.find((l:{productId:string})=>l.productId==="raw")?.quantity).toBe("12.0000");
  expect(result.lines.create.find((l:{productId:string})=>l.productId==="sub")?.quantity).toBe("4.0000");
});
