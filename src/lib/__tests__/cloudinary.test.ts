import { createUploadSignature, verifyCloudinarySignature } from "../cloudinary";
const sign = jest.fn(() => "a".repeat(40));
jest.mock("cloudinary", () => ({ v2: { config: jest.fn(), utils: { api_sign_request: (...args: unknown[]) => sign(...args) } } }));
beforeEach(() => {
  process.env.CLOUDINARY_CLOUD_NAME = "test";
  process.env.CLOUDINARY_API_KEY = "test";
  process.env.CLOUDINARY_API_SECRET = "test";
  sign.mockClear();
});
it("signs immutable bounded public images", () => {
  const result = createUploadSignature({ folder: "arunika/co1/Product", publicId: "f1", accessMode: "public" });
  expect(sign).toHaveBeenCalledWith(expect.objectContaining({ type: "upload", overwrite: false, allowed_formats: "jpg,png,webp", max_file_size: 5242880 }), "test");
  expect(result).toMatchObject({ type: "upload", overwrite: false, allowedFormats: "jpg,png,webp", maxFileSize: 5242880 });
});
it("rejects malformed signatures", () => {
  expect(verifyCloudinarySignature({ public_id: "x", version: 1, signature: "short" })).toBe(false);
});
