import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { buildAuthenticatedUrl, DOWNLOAD_TTL_SECONDS } from "@/lib/cloudinary";
import { prisma } from "@/lib/db";
import { AppError, notFound, toErrorMessage, validationError } from "@/lib/errors";
import { authorizeDownload, authorizeUpload, DOCUMENT_FORMATS } from "../../policy";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await requireTenant();
    const { id } = await ctx.params;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw validationError("ID file tidak valid");
    const file = await prisma.fileAsset.findFirst({ where: { id, companyId: tenant.companyId, access: "AUTHENTICATED", status: "READY", deletedAt: null } });
    if (!file || file.companyId !== tenant.companyId || file.access !== "AUTHENTICATED" || file.status !== "READY" || file.deletedAt !== null || !file.cloudinaryAssetId || !file.cloudinaryPublicId || file.resourceType !== "image" || !file.format || !DOCUMENT_FORMATS.includes(file.format) || file.cloudinaryPublicId !== `arunika/${tenant.companyId}/${file.entityType}/${file.id}`) throw notFound("File tidak ditemukan");
    authorizeDownload(tenant, file.entityType);
    await authorizeUpload(tenant, file.entityType, file.entityId, "view");
    const url = buildAuthenticatedUrl(file.cloudinaryPublicId, file.format);
    await prisma.auditLog.create({ data: { companyId: tenant.companyId, userId: tenant.user.id, action: "file.download", entityType: file.entityType!, entityId: file.entityId, metadata: { fileId: file.id } } });
    return NextResponse.json({ id: file.id, url, expiresIn: DOWNLOAD_TTL_SECONDS }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: error instanceof AppError ? error.status : 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
