import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toErrorMessage } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenant();
    const body = (await req.json()) as {
      fileId: string;
      publicId: string;
      assetId?: string;
      resourceType?: string;
      format?: string;
      bytes?: number;
      width?: number;
      height?: number;
      secureUrl?: string;
    };

    if (!body.fileId || !body.publicId) {
      return NextResponse.json({ error: "fileId dan publicId wajib" }, { status: 422 });
    }

    const existing = await prisma.fileAsset.findFirst({
      where: { id: body.fileId, companyId: ctx.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 });
    }

    const updated = await prisma.fileAsset.update({
      where: { id: existing.id },
      data: {
        status: "READY",
        cloudinaryPublicId: body.publicId,
        cloudinaryAssetId: body.assetId,
        resourceType: body.resourceType,
        format: body.format,
        size: body.bytes,
        width: body.width,
        height: body.height,
      },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      publicId: updated.cloudinaryPublicId,
      url: body.secureUrl ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 400 });
  }
}
