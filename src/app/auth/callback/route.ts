import { NextResponse, type NextRequest } from "next/server";

import { isCloudMode } from "@/config/deployment-mode";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isCloudMode()) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const { handleAuthCallback } = await import("@/app/auth/callback/handle-callback");
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");

  const destination = await handleAuthCallback({
    code: request.nextUrl.searchParams.get("code"),
    origin: request.nextUrl.origin,
    next: request.nextUrl.searchParams.get("next") ?? undefined,
    supabase: await createSupabaseServerClient()
  });

  return NextResponse.redirect(destination);
}
