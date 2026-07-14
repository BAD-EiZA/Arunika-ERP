import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: "database", ok: true, detail: "postgres reachable" });
  } catch (error) {
    checks.push({
      name: "database",
      ok: false,
      detail: error instanceof Error ? error.message : "db error",
    });
  }

  checks.push({
    name: "kinde",
    ok: Boolean(process.env.KINDE_CLIENT_ID && process.env.KINDE_ISSUER_URL),
    detail: process.env.KINDE_ISSUER_URL || "missing issuer",
  });
  checks.push({
    name: "cloudinary",
    ok: Boolean(
      process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY,
    ),
    detail: process.env.CLOUDINARY_CLOUD_NAME || "missing cloud name",
  });
  checks.push({
    name: "mock_auth",
    ok: process.env.MOCK_AUTH !== "true",
    detail:
      process.env.MOCK_AUTH === "true"
        ? "MOCK_AUTH enabled (dev only)"
        : "using real auth",
  });

  const modules = [
    "identity",
    "inventory",
    "procurement",
    "sales",
    "accounting",
    "tax",
    "manufacturing",
    "mrp",
    "hr",
    "payroll",
    "returns",
    "projects",
  ];

  const ok = checks.every((c) => c.ok);
  return NextResponse.json({
    ok,
    time: new Date().toISOString(),
    checks,
    modules,
    version: "0.9.0",
  });
}
