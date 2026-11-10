import { prisma } from "@/lib/db";
import { getCloudinary } from "@/lib/cloudinary";

/** Run periodically; each invocation processes at most 100 tombstones. */
export async function cleanupFiles(now = new Date()) {
  const expired = await prisma.fileAsset.updateMany({
    where: { status: "PENDING", deletedAt: null, createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
    data: { status: "DELETED", deletedAt: now },
  });
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const files = await prisma.fileAsset.findMany({ where: { deletedAt: { lt: cutoff } }, take: 100, orderBy: { deletedAt: "asc" } });
  let purged = 0;
  let failed = 0;
  for (const file of files) {
    try {
      // PENDING uploads never recorded a Cloudinary ID; the signature uses this exact path.
      const publicId = file.cloudinaryPublicId ?? `arunika/${file.companyId}/${file.entityType}/${file.id}`;
      const result = await getCloudinary().uploader.destroy(publicId, {
        resource_type: file.resourceType ?? "image",
        type: file.access === "PUBLIC" ? "upload" : "authenticated",
        invalidate: true,
      });
      if (result.result !== "ok" && result.result !== "not found") throw new Error(`Cloudinary: ${result.result}`);
      await prisma.fileAsset.deleteMany({ where: { id: file.id, deletedAt: { lt: cutoff } } });
      purged++;
    } catch (error) {
      failed++;
      console.warn(`File cleanup failed for ${file.id}:`, error);
    }
  }
  return { expired: expired.count, purged, failed };
}
