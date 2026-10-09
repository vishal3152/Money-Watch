import { NextResponse, type NextRequest } from "next/server";

import { getAuthProvider } from "@/config/auth-provider";
import { isCloudMode } from "@/config/deployment-mode";
import { shouldRedirectToLogin } from "@/lib/cloud-auth/session-gate";

export async function middleware(request: NextRequest) {
  if (!isCloudMode()) {
    return NextResponse.next();
  }

  if (getAuthProvider() === "simple") {
    // Load the simple-auth module only on this path — the Supabase path below never does.
    const { SIMPLE_SESSION_COOKIE, resolveOwnerIdFromToken } = await import("@/lib/simple-auth/session");
    const ownerId = await resolveOwnerIdFromToken(request.cookies.get(SIMPLE_SESSION_COOKIE)?.value);

    if (
      shouldRedirectToLogin({ isCloudMode: true, hasSession: ownerId !== null, pathname: request.nextUrl.pathname })
    ) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  }

  // Load Supabase only on the cloud path — local/desktop never evaluates the SDK.
  const { createServerClient } = await import("@supabase/ssr");
  const { getOwnerIdFromSession } = await import("@/lib/cloud-auth/current-owner");

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );
  const ownerId = await getOwnerIdFromSession(supabase);

  if (
    shouldRedirectToLogin({
      isCloudMode: true,
      hasSession: ownerId !== null,
      pathname: request.nextUrl.pathname
    })
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
