import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCanonicalPageRedirect } from "@/lib/canonical-site";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const canonicalRedirect = getCanonicalPageRedirect(req.url, req.method);
  if (canonicalRedirect) {
    return NextResponse.redirect(canonicalRedirect, 308);
  }

  if (isAdminRoute(req)) {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) {
      return redirectToSignIn();
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api/(.*)"]
};
