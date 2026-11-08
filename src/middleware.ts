import { withAuth } from "next-auth/middleware";

// First line of defence: anyone without a valid session is sent to /login.
// Pages and server actions also check the session themselves (see src/server/session.ts).
export default withAuth({ pages: { signIn: "/login" } });

export const config = {
  matcher: ["/((?!login|signup|api/signup|unsubscribe|api/auth|api/e/|api/mcp|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
