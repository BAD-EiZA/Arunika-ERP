import { withAuth } from "@kinde-oss/kinde-auth-nextjs/middleware";
import type { NextRequest } from "next/server";

export default withAuth(
  async function proxy(_req: NextRequest) {
    // auth handled by withAuth
  },
  {
    publicPaths: [
      "/",
      "/portal",
      "/api/auth",
      "/api/health",
      "/api/health/ready",
      "/api/erp/portal",
      "/api/files/signature",
      "/api/files/complete",
    ],
    isReturnToCurrentPage: true,
  },
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
