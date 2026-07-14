import { v2 as cloudinary } from "cloudinary";

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
}) {
  const cld = ensureConfigured();
  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string | number> = {
    timestamp,
    folder: input.folder,
  };
  if (input.publicId) params.public_id = input.publicId;
  if (input.accessMode === "authenticated") {
    params.type = "authenticated";
  }

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
    type: input.accessMode === "authenticated" ? "authenticated" : "upload",
    signature,
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
  return expected === signature;
}

export function buildAuthenticatedUrl(publicId: string, expiresInSec = 300) {
  const cld = ensureConfigured();
  return cld.url(publicId, {
    type: "authenticated",
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSec,
  });
}
