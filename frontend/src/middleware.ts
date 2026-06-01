import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Runtime proxy vers Flask API (lit l'env au runtime, pas au build)
  if (request.nextUrl.pathname.startsWith("/flask-api/")) {
    const flaskUrl = process.env.FLASK_API_URL || "http://localhost:8000";
    const targetPath = request.nextUrl.pathname.replace(/^\/flask-api/, "");
    const search = request.nextUrl.search;
    const targetUrl = `${flaskUrl}${targetPath}${search}`;

    try {
      const headers: Record<string, string> = {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
      };

      const fetchOptions: RequestInit = {
        method: request.method,
        headers,
      };

      if (request.method !== "GET" && request.method !== "HEAD") {
        fetchOptions.body = await request.text();
      }

      const response = await fetch(targetUrl, fetchOptions);

      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: "Flask API unreachable", detail: error.message },
        { status: 502 }
      );
    }
  }

  // Auth check
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "next-auth.session-token",
  });
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
