import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { createUploadSignature } from "@/lib/cloudinary";
import { prisma } from "@/lib/db";
import { AppError, toErrorMessage, validationError } from "@/lib/errors";
import { authorizeUpload } from "../policy";

function sanitizeFilename(filename: unknown) {
  if (filename === undefined) return undefined;
  if (typeof filename !== "string" || filename.length > 255) throw validationError("Nama file tidak valid");
  // Keep the basename only; strip path separators and control characters (PRD 14.28).
  return filename.split(/[\\/]+/).pop()!.replace(/[^\w.\- ()]+/g, "_").slice(0, 255) || "file";
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenant();
    const body = await req.json();
    const isPublic = body?.access === "public";
    if (!body || typeof body !== "object" || (body.access !== undefined && !["public", "private", "authenticated"].includes(body.access))) throw validationError("Akses unggahan tidak valid");
    if (isPublic !== (body.entityType === "Product" || body.entityType === "Company")) throw validationError("Akses entitas tidak didukung");
    const { entityType, entityId } = await authorizeUpload(ctx, body.entityType, body.entityId);
    const filename = sanitizeFilename(body.filename);
    const access = isPublic ? "PUBLIC" : "AUTHENTICATED";
    const file = await prisma.fileAsset.create({
      data: { companyId: ctx.companyId, uploaderId: ctx.user.id, status: "PENDING", access, originalFilename: filename, entityType, entityId },
    });
    const signature = createUploadSignature({
      folder: `arunika/${ctx.companyId}/${entityType}`,
      publicId: file.id,
      accessMode: isPublic ? "public" : "authenticated",
      ...(!isPublic ? { context: { companyId: ctx.companyId, uploaderId: ctx.user.id, entityType, entityId, fileId: file.id } } : {}),
    });
    if (!isPublic) await prisma.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "file.upload_requested", entityType, entityId, metadata: { fileId: file.id, access } } });
    return NextResponse.json({ fileId: file.id, ...signature, url: undefined });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: error instanceof AppError ? error.status : 400 });
  }
}
