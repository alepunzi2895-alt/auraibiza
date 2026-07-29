import { getPublicListings, getPropertyThumbnails } from "./actions";
import LandingPageClient from "./LandingPageClient";

// Server Component: recupera tutti i risultati (e le relative thumbnail)
// PRIMA di inviare l'HTML al browser, cosi' chi apre il sito vede gia' i
// risultati al primo paint invece di una pagina vuota che li richiede dopo
// l'hydration. Il referral code (se presente) viene comunque gestito lato
// client come prima, aggiornando i dati subito dopo se necessario.
export default async function Page() {
  const listings = await getPublicListings();
  const allIds = (listings.properties || []).map((p: any) => p.id);
  const initialThumbnails = allIds.length > 0 ? await getPropertyThumbnails(allIds) : {};

  return <LandingPageClient initialListings={listings} initialThumbnails={initialThumbnails} />;
}
