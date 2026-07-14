import { withAuth } from "@kinde-oss/kinde-auth-nextjs/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default withAuth(
  async function proxy(req: NextRequest) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", req.nextUrl.pathname);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
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
