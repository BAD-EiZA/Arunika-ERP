import { cleanupFiles } from "../file-cleanup";
const db = { fileAsset: { updateMany: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() } };
const destroy = jest.fn();
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/cloudinary", () => ({ getCloudinary: () => ({ uploader: { destroy } }) }));
const now = new Date("2026-11-10T00:00:00Z");
beforeEach(() => { jest.clearAllMocks(); db.fileAsset.updateMany.mockResolvedValue({ count: 2 }); db.fileAsset.findMany.mockResolvedValue([]); db.fileAsset.deleteMany.mockResolvedValue({ count: 1 }); });
it("soft-deletes only pending files older than one hour; selects tombstones older than 30 days", async () => {
  await cleanupFiles(now);
  expect(db.fileAsset.updateMany).toHaveBeenCalledWith({ where: { status: "PENDING", deletedAt: null, createdAt: { lt: new Date("2026-11-09T23:00:00Z") } }, data: { status: "DELETED", deletedAt: now } });
  expect(db.fileAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: { lt: new Date("2026-10-11T00:00:00Z") } } }));
  expect(destroy).not.toHaveBeenCalled();
});
it("purges Cloudinary with correct access type; reconstructs unfinished upload IDs", async () => {
  db.fileAsset.findMany.mockResolvedValue([
    { id: "f", companyId: "c", entityType: "Customer", access: "AUTHENTICATED", cloudinaryPublicId: null, resourceType: null },
    { id: "g", companyId: "c", entityType: "Product", access: "PUBLIC", cloudinaryPublicId: "arunika/c/Product/g", resourceType: "image" },
  ]);
  destroy.mockResolvedValueOnce({ result: "ok" }).mockResolvedValueOnce({ result: "not found" });
  const result = await cleanupFiles(now);
  expect(destroy).toHaveBeenNthCalledWith(1, "arunika/c/Customer/f", { resource_type: "image", type: "authenticated", invalidate: true });
  expect(destroy).toHaveBeenNthCalledWith(2, "arunika/c/Product/g", { resource_type: "image", type: "upload", invalidate: true });
  expect(db.fileAsset.deleteMany).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ expired: 2, purged: 2, failed: 0 });
});
it("logs failures, preserves retryable tombstones, continues remaining assets", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  db.fileAsset.findMany.mockResolvedValue(["a", "b", "c"].map(id => ({ id, companyId: "c", entityType: "Product", access: "PUBLIC", cloudinaryPublicId: `arunika/c/Product/${id}` })));
  destroy.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ result: "error" }).mockResolvedValueOnce({ result: "ok" });
  expect(await cleanupFiles(now)).toEqual({ expired: 2, purged: 1, failed: 2 });
  expect(db.fileAsset.deleteMany).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});
