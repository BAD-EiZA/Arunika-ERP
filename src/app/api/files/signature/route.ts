import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { createUploadSignature } from "@/lib/cloudinary";
import { prisma } from "@/lib/db";
import { toErrorMessage } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenant();
    const body = (await req.json()) as {
      entityType?: string;
      entityId?: string;
      access?: "public" | "authenticated";
      filename?: string;
    };

    const access = body.access ?? "authenticated";
    const folder = `arunika/${ctx.companyId}/${body.entityType ?? "general"}`;

    const file = await prisma.fileAsset.create({
      data: {
        companyId: ctx.companyId,
        uploaderId: ctx.user.id,
        status: "PENDING",
        access: access === "public" ? "PUBLIC" : "AUTHENTICATED",
        originalFilename: body.filename,
        entityType: body.entityType,
        entityId: body.entityId,
      },
    });

    const signature = createUploadSignature({
      folder,
      publicId: file.id,
      accessMode: access,
    });

    return NextResponse.json({
      fileId: file.id,
      ...signature,
    });
  } catch (error) {
    return NextResponse.json(
      { error: toErrorMessage(error) },
      { status: 400 },
    );
  }
}
