import type { Metadata } from "next";
import PrivacyPageClient from "./PrivacyPageClient";

export const metadata: Metadata = {
  title: "Privacy Policy — Aura Ibiza",
  description: "Informativa sulla privacy di Aura Ibiza",
};

export default function PrivacyPage() {
  return <PrivacyPageClient />;
}
