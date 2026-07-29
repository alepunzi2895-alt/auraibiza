import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Unica eccezione al pattern "niente API route separate, tutto passa da
// actions.ts" (vedi CLAUDE.md): NextAuth richiede strutturalmente questo
// path per il callback OAuth, il CSRF token e gli endpoint di sessione.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
