import { v2 as cloudinary } from "cloudinary";
import { timingSafeEqual } from "node:crypto";

function ensureConfigured() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error("Cloudinary env tidak lengkap");
  }
  cloudinary.config({
    cloud_name,
    api_key,
    api_secret,
    secure: true,
  });
  return cloudinary;
}

export function getCloudinary() {
  return ensureConfigured();
}

export function createUploadSignature(input: {
  folder: string;
  publicId?: string;
  accessMode?: "public" | "authenticated";
  context?: Record<string, string>;
}) {
  const cld = ensureConfigured();
  const timestamp = Math.round(Date.now() / 1000);
  const privateUpload = input.accessMode !== "public";
  const context = input.context && Object.entries(input.context).map(([key, value]) => `${key}=${value}`).join("|");
  const params = {
    timestamp,
    folder: input.folder,
    public_id: input.publicId,
    type: privateUpload ? "authenticated" : "upload",
    overwrite: false,
    allowed_formats: privateUpload ? "pdf,jpg,png,webp" : "jpg,png,webp",
    max_file_size: (privateUpload ? 10 : 5) * 1024 * 1024,
    ...(context ? { context } : {}),
  };
  if (!input.publicId) delete params.public_id;

  const signature = cld.utils.api_sign_request(
    params,
    process.env.CLOUDINARY_API_SECRET as string,
  );

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME as string,
    apiKey: process.env.CLOUDINARY_API_KEY as string,
    timestamp,
    folder: input.folder,
    publicId: input.publicId,
    type: privateUpload ? "authenticated" : "upload",
    signature,
    overwrite: false,
    allowedFormats: params.allowed_formats,
    maxFileSize: params.max_file_size,
    resourceType: "image",
    ...(context ? { context } : {}),
  };
}

export function verifyCloudinarySignature(params: Record<string, string | number>) {
  const cld = ensureConfigured();
  const { signature, ...rest } = params as Record<string, string | number> & {
    signature: string;
  };
  const expected = cld.utils.api_sign_request(
    rest,
    process.env.CLOUDINARY_API_SECRET as string,
  );
  if (typeof signature !== "string" || !/^[a-f0-9]{40}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export const DOWNLOAD_TTL_SECONDS = 60;

export function buildAuthenticatedUrl(publicId: string, format: string) {
  const cld = ensureConfigured();
  // A CDN sign_url signature does NOT expire. The download API signs expires_at.
  return cld.utils.private_download_url(publicId, format, {
    resource_type: "image",
    type: "authenticated",
    attachment: true,
    expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS,
  });
}
