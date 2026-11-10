import { POST as sign } from "../signature/route";
import { POST as complete } from "../complete/route";
import { requireTenant } from "@/lib/auth";
import { createUploadSignature, verifyCloudinarySignature, getCloudinary } from "@/lib/cloudinary";

const db = {
  product: { findFirst: jest.fn() },
  company: { findFirst: jest.fn() },
  fileAsset: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/auth", () => ({ requireTenant: jest.fn() }));
jest.mock("@/lib/cloudinary", () => ({ createUploadSignature: jest.fn(), verifyCloudinarySignature: jest.fn(), getCloudinary: jest.fn() }));
const request = (body: unknown) => new Request("http://localhost/api/files", { method: "POST", body: JSON.stringify(body) });
const resource = jest.fn();
const ctx = { companyId: "co1", user: { id: "u1" }, permissions: "*" };
const pending = { id: "f1", companyId: "co1", uploaderId: "u1", entityType: "Product", entityId: "p1", status: "PENDING", access: "PUBLIC", deletedAt: null };

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requireTenant).mockResolvedValue(ctx as never);
  db.product.findFirst.mockResolvedValue({ id: "p1" });
  db.company.findFirst.mockResolvedValue({ id: "co1" });
  db.fileAsset.create.mockResolvedValue(pending);
  db.fileAsset.findFirst.mockResolvedValue(pending);
  db.fileAsset.updateMany.mockResolvedValue({ count: 1 });
  jest.mocked(createUploadSignature).mockReturnValue({ signature: "a".repeat(40) } as never);
  jest.mocked(verifyCloudinarySignature).mockReturnValue(true);
  jest.mocked(getCloudinary).mockReturnValue({ api: { resource } } as never);
  resource.mockResolvedValue({ public_id: "arunika/co1/Product/f1", asset_id: "a1", version: 1, type: "upload", resource_type: "image", format: "png", bytes: 123, width: 10, height: 10, secure_url: "https://res.cloudinary.com/test/image/upload/f1.png" });
});

it("rejects unsupported public uploads before creating an asset", async () => {
  const res = await sign(request({ entityType: "Payroll", entityId: "secret", access: "public" }));
  expect(res.status).toBe(422);
  expect(db.fileAsset.create).not.toHaveBeenCalled();
});

it("rejects forged completion before any DB update", async () => {
  jest.mocked(verifyCloudinarySignature).mockReturnValue(false);
  const res = await complete(request({ fileId: "f1", publicId: "arunika/co1/Product/f1", version: 1, signature: "b".repeat(40) }));
  expect(res.status).toBe(422);
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
});

it("checks Cloudinary metadata and commits a pending upload once", async () => {
  const body = { fileId: "f1", publicId: "arunika/co1/Product/f1", version: 1, signature: "a".repeat(40) };
  const res = await complete(request(body));
  expect(res.status).toBe(200);
  expect(db.fileAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "PENDING", uploaderId: "u1" }), data: expect.objectContaining({ cloudinaryAssetId: "a1", size: 123 }) }));
  expect((await res.json()).url).toContain("res.cloudinary.com");
});

it("rejects a Cloudinary asset outside the tenant folder", async () => {
  resource.mockResolvedValueOnce({ public_id: "arunika/other/Product/f1", version: 1, type: "upload", resource_type: "image", format: "png", bytes: 123, asset_id: "a1" });
  const res = await complete(request({ fileId: "f1", publicId: "arunika/co1/Product/f1", version: 1, signature: "a".repeat(40) }));
  expect(res.status).toBe(422);
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
});

it.each([
  { bytes: 5242881 }, { bytes: 0 }, { format: "svg" }, { resource_type: "raw" }, { type: "authenticated" }, { version: 2 },
])("rejects invalid remote metadata %j", async (invalid) => {
  resource.mockResolvedValueOnce({ ...(await resource()), ...invalid });
  const res = await complete(request({ fileId: "f1", publicId: "arunika/co1/Product/f1", version: 1, signature: "a".repeat(40) }));
  expect(res.status).toBe(422);
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
});

it("checks entity permissions before signing", async () => {
  jest.mocked(requireTenant).mockResolvedValue({ ...ctx, permissions: new Set() } as never);
  expect((await sign(request({ entityType: "Product", entityId: "p1", access: "public" }))).status).toBe(403);
  expect(db.fileAsset.create).not.toHaveBeenCalled();
});

it("rejects cross-tenant product references", async () => {
  db.product.findFirst.mockResolvedValueOnce(null);
  expect((await sign(request({ entityType: "Product", entityId: "other", access: "public" }))).status).toBe(404);
  expect(db.fileAsset.create).not.toHaveBeenCalled();
});

it("blocks a second completion or another uploader", async () => {
  db.fileAsset.findFirst.mockResolvedValueOnce({ ...pending, uploaderId: "other" });
  const res = await complete(request({ fileId: "f1", publicId: "arunika/co1/Product/f1", version: 1, signature: "a".repeat(40) }));
  expect(res.status).toBe(404);
  expect(resource).not.toHaveBeenCalled();
});
