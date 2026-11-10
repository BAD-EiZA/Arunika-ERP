import { requireTenant } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { authorizeInventoryFile } from "./policy";
export async function GET(req: Request) {
 return withApiHandler(async () => {
  const ctx=await requireTenant(), query=new URL(req.url).searchParams;
  const entity=await authorizeInventoryFile(ctx,query.get("entityType"),query.get("entityId"),"view");
  const files=await prisma.fileAsset.findMany({where:{companyId:ctx.companyId,...entity,status:"READY",access:"AUTHENTICATED",deletedAt:null},select:{id:true,originalFilename:true},orderBy:{createdAt:"asc"}});
  return {files};
 });
}
