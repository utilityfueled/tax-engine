import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  PREFLIGHT_MAX_AGE,
  evaluateCors
} from "./lib/cors";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const decision = evaluateCors(pathname, request.method, origin);

  switch (decision.action) {
    case "pass-through":
      return NextResponse.next();

    case "preflight-allow":
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": decision.origin,
          "Access-Control-Allow-Methods": ALLOWED_METHODS,
          "Access-Control-Allow-Headers": ALLOWED_HEADERS,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
          "Vary": "Origin",
        },
      });

    case "preflight-deny":
      return new NextResponse(null, {
        status: 204,
        headers: { "Vary": "Origin" }
      });

    case "reject":
      return NextResponse.json(
        { error: "Origin not allowed." },
        {
          status: 403,
          headers: { "Vary": "Origin" }
        }
      );

    case "allow": {
      const response = NextResponse.next();
      response.headers.set("Access-Control-Allow-Origin", decision.origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set("Vary", "Origin");
      return response;
    }

    case "allow-no-origin":
      return NextResponse.next();
  }
}

export const config = {
  matcher: "/api/:path*",
};
