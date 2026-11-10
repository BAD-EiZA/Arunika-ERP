import { v2 as cloudinary } from "cloudinary";
import { POST as sign } from "../signature/route";
import { POST as complete } from "../complete/route";
import { GET as download } from "../[id]/download/route";

const db = {
  customer: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  fileAsset: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};
const tenant = jest.fn();
const resource = jest.fn();
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
jest.mock("@/lib/auth", () => ({ requireTenant: (...args: unknown[]) => tenant(...args) }));
// Keep the real Cloudinary signer; only replace its network boundary.
jest.spyOn(cloudinary.api, "resource").mockImplementation((...args: unknown[]) => resource(...args));
const ctx = { companyId: "co1", user: { id: "u1" }, permissions: new Set(["customer:update", "customer:view"]), branchIds: [], warehouseIds: [] };
const pending = { id: "f1", companyId: "co1", uploaderId: "u1", entityType: "Customer", entityId: "c1", access: "AUTHENTICATED", status: "PENDING", deletedAt: null, createdAt: new Date() };
const req = (body: unknown) => new Request("http://localhost/api/files", { method: "POST", body: JSON.stringify(body) });
const input = { access: "private", entityType: "Customer", entityId: "c1", filename: "../unsafe\n.pdf" };
const publicId = "arunika/co1/Customer/f1";
const proof = () => ({ fileId: "f1", publicId, version: 1, signature: cloudinary.utils.api_sign_request({ public_id: publicId, version: 1 }, "secret") });
beforeEach(() => {
  jest.clearAllMocks();
  process.env.CLOUDINARY_CLOUD_NAME = "test";
  process.env.CLOUDINARY_API_KEY = "test";
  process.env.CLOUDINARY_API_SECRET = "secret";
  cloudinary.config({ cloud_name: "test", api_key: "test", api_secret: "secret" });
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  tenant.mockResolvedValue(ctx);
  db.customer.findFirst.mockResolvedValue({ id: "c1", companyId: "co1" });
  db.product.findFirst.mockResolvedValue({ id: "p1", companyId: "co1" });
  db.fileAsset.create.mockResolvedValue(pending);
  db.fileAsset.findFirst.mockResolvedValue(pending);
  db.fileAsset.updateMany.mockResolvedValue({ count: 1 });
  resource.mockResolvedValue({ public_id: publicId, asset_id: "a1", version: 1, type: "authenticated", resource_type: "image", format: "pdf", bytes: 100, context: { custom: { companyId: "co1", uploaderId: "u1", entityType: "Customer", entityId: "c1", fileId: "f1" } } });
});
it("defaults documents to authenticated signed direct upload with sanitized filename and audit", async () => {
  const response = await sign(req(input));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ type: "authenticated", allowedFormats: "pdf,jpg,png,webp", maxFileSize: 10485760, overwrite: false, resourceType: "image" });
  const params = { timestamp: body.timestamp, folder: body.folder, public_id: body.publicId, type: body.type, overwrite: false, allowed_formats: body.allowedFormats, max_file_size: body.maxFileSize, context: body.context };
  expect(body.signature).toBe(cloudinary.utils.api_sign_request(params, "secret"));
  expect(db.fileAsset.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ access: "AUTHENTICATED", originalFilename: "unsafe_.pdf" }) }));
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "file.upload_requested", userId: "u1" }) }));
  expect(body.url).toBeUndefined();
});
it("binds completion to the exact asset: forged signature, wrong public id and stale version are rejected", async () => {
  resource.mockResolvedValue({ ...(await resource()), type: "upload" });
  const bodies = [
    { ...proof(), signature: "0".repeat(40) },
    { ...proof(), publicId: "arunika/co1/Customer/f9" },
    { fileId: "f1", publicId, version: 2, signature: cloudinary.utils.api_sign_request({ public_id: publicId, version: 2 }, "secret") },
  ];
  for (const body of bodies) {
    const response = await complete(req(body));
    expect(response.status).toBe(422);
  }
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
});
it("binds completion to the stored context and verifies the asset via the authenticated admin api", async () => {
  resource.mockResolvedValue({ ...(await resource()), context: { custom: { companyId: "coX", uploaderId: "u1", entityType: "Customer", entityId: "c1", fileId: "f1" } } });
  const response = await complete(req(proof()));
  expect(response.status).toBe(422);
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
  expect(resource).toHaveBeenCalledWith(publicId, expect.objectContaining({ resource_type: "image", type: "authenticated" }));
});
it("rejects documents over the 10MB limit, bad formats and non-image resource types", async () => {
  for (const invalid of [{ bytes: 10 * 1024 * 1024 + 1 }, { format: "svg" }, { resource_type: "raw" }, { type: "upload" }, { bytes: 0 }]) {
    resource.mockResolvedValueOnce({ ...(await resource()), ...invalid });
    const response = await complete(req(proof()));
    expect(response.status).toBe(422);
  }
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
});
it("commits a valid document once, audits the lifecycle and never exposes a public url", async () => {
  const response = await complete(req(proof()));
  expect(response.status).toBe(200);
  expect(db.fileAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "READY", access: "AUTHENTICATED", mimeType: "application/pdf" }) }));
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "file.upload_completed" }) }));
  expect((await response.json()).url).toBeUndefined();
  expect(resource).toHaveBeenCalledWith(publicId, expect.objectContaining({ resource_type: "image", type: "authenticated" }));
});
it("rejects completion replay and completion by another uploader", async () => {
  expect((await complete(req(proof()))).status).toBe(200);
  expect(resource).toHaveBeenCalledTimes(1);
  db.fileAsset.updateMany.mockResolvedValue({ count: 0 });
  expect((await complete(req(proof()))).status).toBe(409);
  tenant.mockResolvedValue({ ...ctx, user: { id: "u2" } });
  expect((await complete(req(proof()))).status).toBe(404);
  expect(resource).toHaveBeenCalledTimes(2);
});
it("fails closed on unsupported private entities before creating pending rows", async () => {
  for (const entityType of ["Employee", "Payroll", "GeneralAttachment", "constructor"]) {
    const response = await sign(req({ ...input, entityType }));
    expect(response.status).toBe(422);
  }
  expect(db.fileAsset.create).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
});
it("rejects cross-tenant private entity references", async () => {
  db.customer.findFirst.mockResolvedValue(null);
  const response = await sign(req(input));
  expect(response.status).toBe(404);
  expect(db.fileAsset.create).not.toHaveBeenCalled();
});
it("downloads only ready private tenant files after resource view authorization", async () => {
  tenant.mockResolvedValue({ ...ctx, permissions: new Set(["customer:view"]) });
  db.fileAsset.findFirst.mockResolvedValue({ ...pending, status: "READY", cloudinaryPublicId: publicId, cloudinaryAssetId: "a1", resourceType: "image", format: "pdf" });
  const response = await download(req({}), { params: Promise.resolve({ id: "f1" }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const body = await response.json();
  const url = new URL(body.url);
  expect(url.pathname).toBe("/v1_1/test/image/download");
  expect(url.searchParams.get("type")).toBe("authenticated");
  expect(Number(url.searchParams.get("expires_at"))).toBeGreaterThan(Math.floor(Date.now() / 1000));
  expect(Number(url.searchParams.get("expires_at"))).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 60);
  expect(body.expiresIn).toBe(60);
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "file.download" }) }));
});
it("rejects unauthorized, cross-tenant, deleted, pending or altered download rows", async () => {
  const ready = { ...pending, status: "READY", cloudinaryPublicId: publicId, cloudinaryAssetId: "a1", resourceType: "image", format: "pdf" };
  db.fileAsset.findFirst.mockResolvedValue(ready);
  tenant.mockResolvedValue({ ...ctx, permissions: new Set() });
  expect((await download(req({}), { params: Promise.resolve({ id: "f1" }) })).status).toBe(403);
  tenant.mockResolvedValue(ctx);
  for (const invalid of [{ companyId: "other" }, { status: "PENDING" }, { deletedAt: new Date() }, { access: "PUBLIC" }, { cloudinaryPublicId: "other" }]) {
    db.fileAsset.findFirst.mockResolvedValue({ ...ready, ...invalid });
    expect((await download(req({}), { params: Promise.resolve({ id: "f1" }) })).status).toBe(404);
  }
  expect(db.auditLog.create).not.toHaveBeenCalled();
});
it("rejects expired pending upload sessions and remote outages without linking", async () => {
  db.fileAsset.findFirst.mockResolvedValue({ ...pending, createdAt: new Date(Date.now() - 3600001) });
  expect((await complete(req(proof()))).status).toBe(422);
  expect(resource).not.toHaveBeenCalled();
  db.fileAsset.findFirst.mockResolvedValue(pending);
  resource.mockRejectedValueOnce(new Error("remote secret"));
  const response = await complete(req(proof()));
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain("remote secret");
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
});
it.each([
  { uploaderId: "other" }, { entityId: "other" }, { entityType: "Supplier" }, { fileId: "other" },
])("rejects altered Admin uploader or entity context %j", async (change) => {
  const asset = await resource();
  resource.mockClear();
  resource.mockResolvedValueOnce({ ...asset, context: { custom: { ...asset.context.custom, ...change } } });
  expect((await complete(req(proof()))).status).toBe(422);
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
});
it("rejects unapproved moderation state and public delivery of private entities", async () => {
  const asset = await resource();
  resource.mockResolvedValueOnce({ ...asset, moderation: [{ status: "pending" }] });
  expect((await complete(req(proof()))).status).toBe(422);
  db.fileAsset.findFirst.mockResolvedValue({ ...pending, access: "PUBLIC" });
  resource.mockResolvedValueOnce({ ...asset, type: "upload", format: "png" });
  expect((await complete(req(proof()))).status).toBe(422);
  expect(db.fileAsset.updateMany).not.toHaveBeenCalled();
});
it("checks resource permission and branch scope at every stage", async () => {
  tenant.mockResolvedValue({ ...ctx, permissions: new Set(["customer:view"]) });
  expect((await sign(req(input))).status).toBe(403);
  expect((await complete(req(proof()))).status).toBe(403);
  tenant.mockResolvedValue({ ...ctx, branchIds: ["branch1"] });
  db.customer.findFirst.mockResolvedValue({ id: "c1", companyId: "co1", branchId: "branch2" });
  expect((await sign(req(input))).status).toBe(403);
  expect(db.fileAsset.create).not.toHaveBeenCalled();
});
it("keeps the public product flow public", async () => {
  tenant.mockResolvedValue({ ...ctx, permissions: "*" });
  const response = await sign(req({ access: "public", entityType: "Product", entityId: "p1", filename: "logo.png" }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ type: "upload", allowedFormats: "jpg,png,webp", maxFileSize: 5 * 1024 * 1024 });
  expect(db.fileAsset.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ access: "PUBLIC" }) }));
  expect(body.context).toBeUndefined();
});
