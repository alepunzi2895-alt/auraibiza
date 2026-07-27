import { getPublicListings, getPropertyThumbnails } from "./actions";
import LandingPageClient from "./LandingPageClient";

// Server Component: recupera la prima pagina di risultati (e le relative
// thumbnail) PRIMA di inviare l'HTML al browser, cosi' chi apre il sito vede
// gia' i risultati al primo paint invece di una pagina vuota che li richiede
// dopo l'hydration. Il referral code (se presente) viene comunque gestito
// lato client come prima, aggiornando i dati subito dopo se necessario.
export default async function Page() {
  const listings = await getPublicListings();
  const firstPageIds = (listings.properties || []).slice(0, 6).map((p: any) => p.id);
  const initialThumbnails = firstPageIds.length > 0 ? await getPropertyThumbnails(firstPageIds) : {};

  return <LandingPageClient initialListings={listings} initialThumbnails={initialThumbnails} />;
}
