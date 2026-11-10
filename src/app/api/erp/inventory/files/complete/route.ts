import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { getCloudinary, verifyCloudinarySignature } from "@/lib/cloudinary";
import { prisma } from "@/lib/db";
import { AppError, conflict, notFound, toErrorMessage, validationError } from "@/lib/errors";
import { authorizeUpload, DOCUMENT_FORMATS, IMAGE_FORMATS, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from "../policy";

const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function POST(req: Request) {
  try {
    const ctx = await requireTenant();
    const body = await req.json();
    if (!body || typeof body !== "object" || typeof body.fileId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.fileId) || typeof body.publicId !== "string" || !Number.isSafeInteger(body.version) || body.version <= 0 || typeof body.signature !== "string" || !/^[a-f0-9]{40}$/i.test(body.signature)) throw validationError("Bukti unggahan tidak valid");
    const existing = await prisma.fileAsset.findFirst({ where: { id: body.fileId, companyId: ctx.companyId, uploaderId: ctx.user.id, status: "PENDING", deletedAt: null } });
    if (!existing || existing.companyId !== ctx.companyId || existing.uploaderId !== ctx.user.id || existing.status !== "PENDING" || existing.deletedAt !== null || !["PUBLIC", "AUTHENTICATED"].includes(existing.access)) throw notFound("File tidak ditemukan");
    const isPublic = existing.access === "PUBLIC";
    if (isPublic) throw validationError("Akses entitas tidak didukung");
    if (!isPublic && (!(existing.createdAt instanceof Date) || Date.now() - existing.createdAt.getTime() > 3600000 || existing.createdAt.getTime() > Date.now())) throw validationError("Sesi unggahan kedaluwarsa");
    await authorizeUpload(ctx, existing.entityType, existing.entityId);
    const expected = `arunika/${ctx.companyId}/${existing.entityType}/${existing.id}`;
    if (body.publicId !== expected || !verifyCloudinarySignature({ public_id: expected, version: body.version, signature: body.signature })) throw validationError("Bukti unggahan tidak valid");
    const deliveryType = isPublic ? "upload" : "authenticated";
    // Never trust client metadata: re-read the exact asset via the authenticated Admin API.
    const asset = await getCloudinary().api.resource(expected, { resource_type: "image", type: deliveryType }).catch(() => { throw new AppError("STORAGE_UNAVAILABLE", "Penyimpanan file tidak tersedia", 502); });
    const formats = isPublic ? IMAGE_FORMATS : DOCUMENT_FORMATS;
    const maxBytes = isPublic ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
    const valid =
      asset.public_id === expected && asset.version === body.version && asset.type === deliveryType &&
      asset.resource_type === "image" && formats.includes(asset.format) &&
      Number.isSafeInteger(asset.bytes) && asset.bytes > 0 && asset.bytes <= maxBytes &&
      typeof asset.asset_id === "string" && !!asset.asset_id;
    if (!valid || (asset.moderation !== undefined && (!Array.isArray(asset.moderation) || asset.moderation.some((result: { status?: string }) => result.status !== "approved")))) throw validationError("Metadata unggahan tidak valid");
    if (isPublic && (typeof asset.secure_url !== "string" || !asset.secure_url.startsWith("https://res.cloudinary.com/"))) throw validationError("Metadata unggahan tidak valid");
    if (!isPublic) {
      // Bind the asset to this exact row: Cloudinary context written at upload signature time.
      const stored = asset.context?.custom ?? {};
      const expectedContext = { companyId: ctx.companyId, uploaderId: ctx.user.id, entityType: existing.entityType, entityId: existing.entityId, fileId: existing.id };
      for (const [key, value] of Object.entries(expectedContext)) if (stored[key] !== String(value)) throw validationError("Metadata unggahan tidak valid");
    }
    const finish = async (tx: Pick<typeof prisma, "fileAsset" | "auditLog">) => {
      const result = await tx.fileAsset.updateMany({
        where: { id: existing.id, companyId: ctx.companyId, uploaderId: ctx.user.id, status: "PENDING", deletedAt: null },
        data: { status: "READY", access: existing.access, cloudinaryPublicId: expected, cloudinaryAssetId: asset.asset_id, resourceType: asset.resource_type, format: asset.format, mimeType: MIME[asset.format], size: asset.bytes, width: asset.width, height: asset.height },
      });
      if (result.count !== 1) throw conflict("Unggahan sudah diproses");
      if (!isPublic) {
        await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "file.upload_completed", entityType: existing.entityType!, entityId: existing.entityId, metadata: { fileId: existing.id, assetId: asset.asset_id, bytes: asset.bytes, format: asset.format } } });
      }
      return result;
    };
    const updated = isPublic ? await finish(prisma) : await prisma.$transaction(finish);
    if (updated.count !== 1) throw conflict("Unggahan sudah diproses");
    return NextResponse.json({ id: existing.id, status: "READY", publicId: expected, ...(isPublic ? { url: asset.secure_url } : {}) });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: error instanceof AppError ? error.status : 400 });
  }
}
