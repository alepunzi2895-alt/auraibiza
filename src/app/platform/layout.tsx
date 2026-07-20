import type { Metadata } from "next";

// Pannello gestionale: mai indicizzato dai motori di ricerca né dato in pasto
// a crawler/agenti AI (si affianca al Disallow in robots.txt).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
