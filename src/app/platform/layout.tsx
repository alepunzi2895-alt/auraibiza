import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import SessionProviderWrapper from "./SessionProviderWrapper";

// Pannello gestionale: mai indicizzato dai motori di ricerca né dato in pasto
// a crawler/agenti AI (si affianca al Disallow in robots.txt).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return <SessionProviderWrapper session={session}>{children}</SessionProviderWrapper>;
}
