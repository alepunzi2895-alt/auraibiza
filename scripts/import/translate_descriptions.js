const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

function loadEnvLocal() {
  const envPath = path.join('/Users/zeroday/Documents/auraibiza', '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
}
loadEnvLocal();
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const T = {
  p2d63dp88: { // Appartamento Santa Eulària
    en: "1st floor apartment, 1 bedroom, 1 bathroom, sea view, large balcony, washer, dryer, dishwasher, wifi.",
    es: "Apartamento en 1ª planta, 1 habitación, 1 baño, vista al mar, amplio balcón, lavadora, secadora, lavavajillas, wifi.",
    de: "Apartment im 1. Stock, 1 Schlafzimmer, 1 Badezimmer, Meerblick, großer Balkon, Waschmaschine, Trockner, Geschirrspüler, WLAN.",
    fr: "Appartement au 1er étage, 1 chambre, 1 salle de bain, vue mer, grand balcon, lave-linge, sèche-linge, lave-vaisselle, wifi.",
  },
  pcmtx0lug: { // Alfamarine 78
    en: "Alfamarine 78: elegant yacht for day charter and overnight stays. Master, VIP and Twin cabins (convertible to double), up to 12 guests by day and 6 overnight, dedicated crew. Equipment: tender, jet ski, wakeboard, towable ring, stand up paddle, snorkeling and seabob.",
    es: "Alfamarine 78: elegante yate para charter de día y pernocta. Camarotes Master, VIP y Twin (convertible en doble), hasta 12 huéspedes de día y 6 por la noche, tripulación dedicada. Equipamiento: tender, moto de agua, wakeboard, rosco, paddle surf, snorkel y seabob.",
    de: "Alfamarine 78: elegante Yacht für Tagescharter und Übernachtung. Master-, VIP- und Zwillingskabine (zu Doppelkabine umbaubar), bis zu 12 Gäste tagsüber und 6 über Nacht, feste Crew. Ausstattung: Beiboot, Jetski, Wakeboard, Reifen, Stand-up-Paddle, Schnorcheln und Seabob.",
    fr: "Alfamarine 78 : yacht élégant pour charter à la journée et avec nuitée. Cabines Master, VIP et Twin (convertible en double), jusqu'à 12 invités le jour et 6 la nuit, équipage dédié. Équipements : annexe, jet ski, wakeboard, bouée tractée, paddle, snorkeling et seabob.",
  },
  piig1tse6: { // Bali 4.0 Ocean Grey
    en: "11.5m catamaran, up to 11+1 guests, 4 bathrooms, skipper included. Large outdoor and indoor spaces for big groups. Base: Ibiza.",
    es: "Catamarán de 11,5 m, hasta 11+1 huéspedes, 4 baños, patrón incluido. Amplios espacios exteriores e interiores para grupos numerosos. Base: Ibiza.",
    de: "11,5 m Katamaran, bis zu 11+1 Gäste, 4 Badezimmer, Skipper inklusive. Großzügige Innen- und Außenbereiche für größere Gruppen. Standort: Ibiza.",
    fr: "Catamaran de 11,5 m, jusqu'à 11+1 invités, 4 salles de bain, skipper inclus. Grands espaces extérieurs et intérieurs pour groupes nombreux. Base : Ibiza.",
  },
  p1yb7ci6o: { // Bali Cat Space Marsi
    en: "12m catamaran, up to 11+1 guests, 4 bathrooms. Skipper available on request (extra €200). Open-space design for maximum relaxation at sea. Base: Ibiza.",
    es: "Catamarán de 12 m, hasta 11+1 huéspedes, 4 baños. Patrón disponible bajo petición (200€ extra). Diseño de espacio abierto para el máximo relax en el mar. Base: Ibiza.",
    de: "12 m Katamaran, bis zu 11+1 Gäste, 4 Badezimmer. Skipper auf Anfrage (Aufpreis 200€). Offenes Raumkonzept für maximale Entspannung auf See. Standort: Ibiza.",
    fr: "Catamaran de 12 m, jusqu'à 11+1 invités, 4 salles de bain. Skipper disponible sur demande (200€ en plus). Design open space pour une détente maximale en mer. Base : Ibiza.",
  },
  pnupmsmcv: { // Bliss Princess V72
    en: "Princess V72, British engineering, performance and luxury. By day BLISS welcomes up to 12 guests, by night it offers 3 cabins for 6 guests: full-beam master suite, VIP cabin in the bow and convertible twin cabin. Bright saloon connected to the cockpit through wide sliding glass doors. Sunbathing and dining areas fore and aft.",
    es: "Princess V72, ingeniería británica, rendimiento y lujo. De día BLISS acoge hasta 12 huéspedes, de noche ofrece 3 camarotes para 6 huéspedes: suite principal a toda manga, camarote VIP a proa y camarote doble convertible. Salón luminoso conectado a la bañera mediante amplias puertas correderas de cristal. Zonas de solárium y comedor a proa y popa.",
    de: "Princess V72, britische Ingenieurskunst, Leistung und Luxus. Tagsüber empfängt BLISS bis zu 12 Gäste, nachts bietet sie 3 Kabinen für 6 Gäste: Master-Suite über die volle Schiffsbreite, VIP-Kabine im Bug und umbaubare Zwillingskabine. Heller Salon, durch breite Glasschiebetüren mit dem Cockpit verbunden. Sonnen- und Essbereiche vorne und hinten.",
    fr: "Princess V72, ingénierie britannique, performance et luxe. Le jour, BLISS accueille jusqu'à 12 invités, la nuit elle offre 3 cabines pour 6 invités : suite armateur pleine largeur, cabine VIP à la proue et cabine double convertible. Salon lumineux relié au cockpit par de larges baies vitrées coulissantes. Espaces bain de soleil et repas à l'avant et à l'arrière.",
  },
  p23tss6rg: { // Flying Fish
    en: "15.5m catamaran, up to 12+1 guests, 4 bathrooms. Skipper available on request (extra €200). The largest sailing boat in the fleet, for big groups. Base: Ibiza.",
    es: "Catamarán de 15,5 m, hasta 12+1 huéspedes, 4 baños. Patrón disponible bajo petición (200€ extra). El más grande de la flota a vela, para grupos numerosos. Base: Ibiza.",
    de: "15,5 m Katamaran, bis zu 12+1 Gäste, 4 Badezimmer. Skipper auf Anfrage (Aufpreis 200€). Das größte Segelboot der Flotte, für größere Gruppen. Standort: Ibiza.",
    fr: "Catamaran de 15,5 m, jusqu'à 12+1 invités, 4 salles de bain. Skipper disponible sur demande (200€ en plus). Le plus grand voilier de la flotte, pour grands groupes. Base : Ibiza.",
  },
  pl8bkooo6: { // Jaya
    en: "11m catamaran, up to 11+1 guests, 2 bathrooms, skipper included. Large, stable living spaces, ideal for family or friends' days out. Base: Ibiza.",
    es: "Catamarán de 11 m, hasta 11+1 huéspedes, 2 baños, patrón incluido. Espacios amplios y estables, ideal para días en familia o con amigos. Base: Ibiza.",
    de: "11 m Katamaran, bis zu 11+1 Gäste, 2 Badezimmer, Skipper inklusive. Große, stabile Wohnbereiche, ideal für Familien- oder Freundestage. Standort: Ibiza.",
    fr: "Catamaran de 11 m, jusqu'à 11+1 invités, 2 salles de bain, skipper inclus. Espaces de vie amples et stables, idéal pour une journée en famille ou entre amis. Base : Ibiza.",
  },
  p4wn1eomb: { // Vamolon
    en: "13.75m catamaran, up to 11+1 guests, 2 bathrooms, skipper included. Maximum stability and comfort for relaxed sailing days. Base: Ibiza.",
    es: "Catamarán de 13,75 m, hasta 11+1 huéspedes, 2 baños, patrón incluido. Máxima estabilidad y confort para días de navegación relajados. Base: Ibiza.",
    de: "13,75 m Katamaran, bis zu 11+1 Gäste, 2 Badezimmer, Skipper inklusive. Maximale Stabilität und Komfort für entspannte Segeltage. Standort: Ibiza.",
    fr: "Catamaran de 13,75 m, jusqu'à 11+1 invités, 2 salles de bain, skipper inclus. Stabilité et confort maximaux pour des journées de navigation détendues. Base : Ibiza.",
  },
  p0wvfegxg: { // Chill Out Mangusta 92
    en: "Mangusta 92, sportiness and elegance in their purest form. Chill Out hosts 9 guests: master cabin with walk-in closet and sauna, VIP cabin in the bow, double cabin and a cabin with two single beds plus a berth. Saloon with distinct living areas, bar and game table. Aft, a table for 8 guests and multi-level sunbathing areas, including a reserved zone on the roof.",
    es: "Mangusta 92, deportividad y elegancia en su máxima expresión. Chill Out acoge a 9 huéspedes: camarote principal con vestidor y sauna, camarote VIP a proa, camarote doble y camarote con dos camas individuales más litera. Salón con zonas de estar diferenciadas, bar y mesa de juego. A popa, mesa para 8 huéspedes y zonas de solárium en varios niveles, incluida un área reservada en el techo.",
    de: "Mangusta 92, Sportlichkeit und Eleganz pur. Chill Out beherbergt 9 Gäste: Master-Kabine mit begehbarem Kleiderschrank und Sauna, VIP-Kabine im Bug, Doppelkabine und eine Kabine mit zwei Einzelbetten plus Koje. Salon mit getrennten Wohnbereichen, Bar und Spieltisch. Achtern Tisch für 8 Gäste und Sonnenliegeflächen auf mehreren Ebenen, inklusive reserviertem Bereich auf dem Dach.",
    fr: "Mangusta 92, sportivité et élégance à l'état pur. Chill Out accueille 9 invités : cabine armateur avec dressing et sauna, cabine VIP à la proue, cabine double et cabine avec deux lits simples plus couchette. Salon avec espaces de vie distincts, bar et table de jeu. À l'arrière, table pour 8 invités et zones de bain de soleil sur plusieurs niveaux, dont un espace réservé sur le toit.",
  },
  pgffgp1rx: { // De Antonio D32 Dandy II
    en: "De Antonio D32 Open: modern speedboat for day trips, up to 9+1 people on board. Standard equipment: bow and stern sundeck, snorkeling gear, sound system, paddle surf, XL swim platform and extendable awning.",
    es: "De Antonio D32 Open: moderna lancha para salidas de día, hasta 9+1 personas a bordo. Equipamiento de serie: solárium de proa y popa, equipo de snorkel, equipo de sonido, paddle surf, plataforma de baño XL y toldo extensible.",
    de: "De Antonio D32 Open: modernes Sportboot für Tagesausflüge, bis zu 9+1 Personen an Bord. Serienausstattung: Sonnendeck vorne und hinten, Schnorchelausrüstung, Soundsystem, Paddle-Surf, XL-Badeplattform und ausziehbares Sonnendach.",
    fr: "De Antonio D32 Open : bateau moderne pour sorties à la journée, jusqu'à 9+1 personnes à bord. Équipement de série : bain de soleil avant et arrière, matériel de snorkeling, système audio, paddle, plateforme de bain XL et taud extensible.",
  },
  pa37vekw0: { // De Antonio D36 Dandy III
    en: "De Antonio D36 Open (2026): awarded Best Boat of the Year 2023 in the up-to-14-metre category at the European Powerboat of the Year. Up to 11+1 people on board, bow and stern sundeck, snorkeling gear, paddle surf and XL swim platform.",
    es: "De Antonio D36 Open (2026): premiada como Mejor Barco del Año 2023 en la categoría de hasta 14 metros en los European Powerboat of the Year. Hasta 11+1 personas a bordo, solárium de proa y popa, equipo de snorkel, paddle surf y plataforma de baño XL.",
    de: "De Antonio D36 Open (2026): ausgezeichnet als bestes Boot des Jahres 2023 in der Kategorie bis 14 Meter bei den European Powerboat of the Year Awards. Bis zu 11+1 Personen an Bord, Sonnendeck vorne und hinten, Schnorchelausrüstung, Paddle-Surf und XL-Badeplattform.",
    fr: "De Antonio D36 Open (2026) : élu meilleur bateau de l'année 2023 dans la catégorie jusqu'à 14 mètres aux European Powerboat of the Year. Jusqu'à 11+1 personnes à bord, bain de soleil avant et arrière, matériel de snorkeling, paddle et plateforme de bain XL.",
  },
  py2xl2pqi: { // De Antonio D36 Lupo di Mare
    en: "De Antonio D36 Open (2024), the same award-winning model from the Spanish shipyard. Up to 11+1 people on board, bow and stern sundeck, snorkeling gear, paddle surf and XL swim platform.",
    es: "De Antonio D36 Open (2024), el mismo modelo premiado del astillero español. Hasta 11+1 personas a bordo, solárium de proa y popa, equipo de snorkel, paddle surf y plataforma de baño XL.",
    de: "De Antonio D36 Open (2024), dasselbe preisgekrönte Modell der spanischen Werft. Bis zu 11+1 Personen an Bord, Sonnendeck vorne und hinten, Schnorchelausrüstung, Paddle-Surf und XL-Badeplattform.",
    fr: "De Antonio D36 Open (2024), le même modèle primé du chantier naval espagnol. Jusqu'à 11+1 personnes à bord, bain de soleil avant et arrière, matériel de snorkeling, paddle et plateforme de bain XL.",
  },
  pvsx71ids: { // Dr No Pershing 6X
    en: "Pershing 6X Dr. No: sharp Italian design and pure adrenaline, inspired by an iconic 007 adventure. Perfect for those seeking speed and elegance on day trips in Ibiza.",
    es: "Pershing 6X Dr. No: diseño italiano incisivo y adrenalina pura, inspirado en una icónica aventura de 007. Perfecto para quienes buscan velocidad y elegancia en salidas de día en Ibiza.",
    de: "Pershing 6X Dr. No: scharfes italienisches Design und pures Adrenalin, inspiriert von einem legendären 007-Abenteuer. Perfekt für alle, die auf Tagesausflügen in Ibiza Geschwindigkeit und Eleganz suchen.",
    fr: "Pershing 6X Dr. No : design italien incisif et adrénaline pure, inspiré d'une aventure emblématique de 007. Parfait pour ceux qui recherchent vitesse et élégance lors de sorties à la journée à Ibiza.",
  },
  ptw917yrq: { // Artimo
    en: "13.15m sailing boat, up to 11+1 guests, 2 bathrooms, skipper included. Ample space on board for groups and families. Base: Ibiza.",
    es: "Velero de 13,15 m, hasta 11+1 huéspedes, 2 baños, patrón incluido. Amplios espacios a bordo para grupos y familias. Base: Ibiza.",
    de: "13,15 m Segelboot, bis zu 11+1 Gäste, 2 Badezimmer, Skipper inklusive. Viel Platz an Bord für Gruppen und Familien. Standort: Ibiza.",
    fr: "Voilier de 13,15 m, jusqu'à 11+1 invités, 2 salles de bain, skipper inclus. Espaces amples à bord pour groupes et familles. Base : Ibiza.",
  },
  pb1ic1fl9: { // Hanstaiger X1
    en: "Revolutionary trimaran with bright interiors thanks to a smart-glass roof and panoramic windows. A 70sqm openable lounge that transforms into a beach club with a retractable platform. Master cabin of over 30sqm across three levels with bathroom, sauna and walk-in closet. Flybridge with jacuzzi, bar area and table for 10 guests. Sails silently thanks to its 50kW lithium battery.",
    es: "Trimarán revolucionario con interiores luminosos gracias a un techo de smart-glass y ventanales panorámicos. Un lounge de 70 m² abatible que se transforma en beach club con plataforma extraíble. Camarote principal de más de 30 m² en tres niveles con baño, sauna y vestidor. Flybridge con jacuzzi, zona de bar y mesa para 10 huéspedes. Navega en silencio gracias a su batería de litio de 50kW.",
    de: "Revolutionärer Trimaran mit hellen Innenräumen dank Smart-Glass-Dach und Panoramafenstern. Eine 70 m² große, öffenbare Lounge, die sich in einen Beach Club mit ausfahrbarer Plattform verwandelt. Master-Kabine von über 30 m² auf drei Ebenen mit Bad, Sauna und begehbarem Kleiderschrank. Flybridge mit Jacuzzi, Barbereich und Tisch für 10 Gäste. Dank 50-kW-Lithiumbatterie geräuschlos unterwegs.",
    fr: "Trimaran révolutionnaire aux intérieurs lumineux grâce à un toit en smart-glass et de grandes baies panoramiques. Un lounge de 70 m² modulable se transformant en beach club avec plateforme rétractable. Cabine armateur de plus de 30 m² sur trois niveaux avec salle de bain, sauna et dressing. Flybridge avec jacuzzi, espace bar et table pour 10 invités. Navigation silencieuse grâce à sa batterie lithium de 50kW.",
  },
  p9615sql9: { // Sun Fizz
    en: "12m sailing boat, up to 10+1 guests, 1 bathroom, skipper included. Ideal for routes to Formentera or Es Vedrà, hidden cove excursions and parties at sea. Base: San Antonio.",
    es: "Velero de 12 m, hasta 10+1 huéspedes, 1 baño, patrón incluido. Ideal para rutas a Formentera o Es Vedrà, excursiones a calas escondidas y fiestas en el mar. Base: San Antonio.",
    de: "12 m Segelboot, bis zu 10+1 Gäste, 1 Badezimmer, Skipper inklusive. Ideal für Routen nach Formentera oder Es Vedrà, Ausflüge zu versteckten Buchten und Partys auf See. Standort: San Antonio.",
    fr: "Voilier de 12 m, jusqu'à 10+1 invités, 1 salle de bain, skipper inclus. Idéal pour des itinéraires vers Formentera ou Es Vedrà, excursions dans des criques cachées et fêtes en mer. Base : San Antonio.",
  },
  pdvitfde7: { // 4 Sail
    en: "13m sailing boat, up to 11+1 guests, 2 bathrooms. Skipper available on request (extra €200). Base: Ibiza.",
    es: "Velero de 13 m, hasta 11+1 huéspedes, 2 baños. Patrón disponible bajo petición (200€ extra). Base: Ibiza.",
    de: "13 m Segelboot, bis zu 11+1 Gäste, 2 Badezimmer. Skipper auf Anfrage (Aufpreis 200€). Standort: Ibiza.",
    fr: "Voilier de 13 m, jusqu'à 11+1 invités, 2 salles de bain. Skipper disponible sur demande (200€ en plus). Base : Ibiza.",
  },
  pjrlamq72: { // Koala II
    en: "13m sailing boat, up to 11+1 guests, 2 bathrooms. Skipper available on request (extra €200). Base: Ibiza.",
    es: "Velero de 13 m, hasta 11+1 huéspedes, 2 baños. Patrón disponible bajo petición (200€ extra). Base: Ibiza.",
    de: "13 m Segelboot, bis zu 11+1 Gäste, 2 Badezimmer. Skipper auf Anfrage (Aufpreis 200€). Standort: Ibiza.",
    fr: "Voilier de 13 m, jusqu'à 11+1 invités, 2 salles de bain. Skipper disponible sur demande (200€ en plus). Base : Ibiza.",
  },
  prgnrpbw0: { // Felicidad
    en: "12m catamaran, up to 11+1 guests, 2 bathrooms. Skipper available on request (extra €200). Great balance of space and agility. Base: Ibiza.",
    es: "Catamarán de 12 m, hasta 11+1 huéspedes, 2 baños. Patrón disponible bajo petición (200€ extra). Excelente equilibrio entre espacio y agilidad. Base: Ibiza.",
    de: "12 m Katamaran, bis zu 11+1 Gäste, 2 Badezimmer. Skipper auf Anfrage (Aufpreis 200€). Gutes Gleichgewicht zwischen Platz und Wendigkeit. Standort: Ibiza.",
    fr: "Catamaran de 12 m, jusqu'à 11+1 invités, 2 salles de bain. Skipper disponible sur demande (200€ en plus). Excellent équilibre entre espace et agilité. Base : Ibiza.",
  },
  pimzz1okp: { // Allimac
    en: "12m catamaran, up to 11+1 guests, 4 bathrooms. Skipper available on request (extra €200). Ample space and privacy for large groups. Base: Ibiza.",
    es: "Catamarán de 12 m, hasta 11+1 huéspedes, 4 baños. Patrón disponible bajo petición (200€ extra). Amplios espacios y privacidad para grupos numerosos. Base: Ibiza.",
    de: "12 m Katamaran, bis zu 11+1 Gäste, 4 Badezimmer. Skipper auf Anfrage (Aufpreis 200€). Viel Platz und Privatsphäre für größere Gruppen. Standort: Ibiza.",
    fr: "Catamaran de 12 m, jusqu'à 11+1 invités, 4 salles de bain. Skipper disponible sur demande (200€ en plus). Grands espaces et intimité pour groupes nombreux. Base : Ibiza.",
  },
  pp5sno5pv: { // Ocean Blue
    en: "Spacious catamaran, up to 11+1 guests, 4 bathrooms. Skipper available on request (extra €200). Ideal for a comfortable charter day. Base: Ibiza.",
    es: "Catamarán espacioso, hasta 11+1 huéspedes, 4 baños. Patrón disponible bajo petición (200€ extra). Ideal para un día de charter con comodidad. Base: Ibiza.",
    de: "Geräumiger Katamaran, bis zu 11+1 Gäste, 4 Badezimmer. Skipper auf Anfrage (Aufpreis 200€). Ideal für einen komfortablen Chartertag. Standort: Ibiza.",
    fr: "Catamaran spacieux, jusqu'à 11+1 invités, 4 salles de bain. Skipper disponible sur demande (200€ en plus). Idéal pour une journée de charter confortable. Base : Ibiza.",
  },
  payosw76k: { // Otto Mezzo
    en: "Traditional 17m Ibizan boat, capacity up to 140 people depending on time, season and number of guests. Skipper included. Perfect for private events, with catering, open bar, DJ and live music available. Base: Ibiza.",
    es: "Embarcación tradicional ibicenca de 17 m, capacidad de hasta 140 personas según horario, temporada y número de huéspedes. Patrón incluido. Perfecta para eventos privados, con posibilidad de catering, barra libre, DJ y música en vivo. Base: Ibiza.",
    de: "Traditionelles 17 m Ibiza-Boot, Kapazität bis zu 140 Personen je nach Uhrzeit, Saison und Gästezahl. Skipper inklusive. Perfekt für private Veranstaltungen, mit Catering, Open Bar, DJ und Live-Musik möglich. Standort: Ibiza.",
    fr: "Bateau traditionnel ibicenco de 17 m, capacité jusqu'à 140 personnes selon l'horaire, la saison et le nombre d'invités. Skipper inclus. Parfait pour des événements privés, avec traiteur, bar à volonté, DJ et musique live possibles. Base : Ibiza.",
  },
  p34724crx: { // Nomad
    en: "Mangusta 108: the ultimate expression of sportiness and elegance. Nomad hosts up to 10 guests in a large master cabin with spacious bathroom, two twin VIP cabins and a double cabin to port, all with en-suite bathrooms. Renewed saloon with living area, bar and dining table; openable roof for natural light. Aft, a table for 8 guests, large sundeck and jacuzzi.",
    es: "Mangusta 108: la máxima expresión de deportividad y elegancia. Nomad acoge hasta 10 huéspedes en un gran camarote principal con baño amplio, dos camarotes VIP gemelos y un camarote doble a babor, todos con baño en suite. Salón renovado con zona de estar, bar y mesa de comedor; techo abatible para luz natural. A popa, mesa para 8 huéspedes, amplio solárium y jacuzzi.",
    de: "Mangusta 108: der ultimative Ausdruck von Sportlichkeit und Eleganz. Nomad beherbergt bis zu 10 Gäste in einer großen Master-Kabine mit geräumigem Bad, zwei baugleichen VIP-Kabinen und einer Doppelkabine backbord, alle mit eigenem Bad. Erneuerter Salon mit Wohnbereich, Bar und Esstisch; öffenbares Dach für natürliches Licht. Achtern Tisch für 8 Gäste, großes Sonnendeck und Jacuzzi.",
    fr: "Mangusta 108 : l'expression ultime de la sportivité et de l'élégance. Nomad accueille jusqu'à 10 invités dans une grande cabine armateur avec salle de bain spacieuse, deux cabines VIP jumelles et une cabine double à bâbord, toutes avec salle de bain privative. Salon rénové avec espace de vie, bar et table à manger ; toit ouvrant pour la lumière naturelle. À l'arrière, table pour 8 invités, grand bain de soleil et jacuzzi.",
  },
  p0kqt8erm: { // Vodka
    en: "11.6m sailing boat, up to 11+1 guests, 2 bathrooms, skipper included. Perfect for sailing days, snorkeling and sunsets at sea. Base: Ibiza.",
    es: "Velero de 11,6 m, hasta 11+1 huéspedes, 2 baños, patrón incluido. Perfecto para días de navegación, snorkel y atardeceres en barco. Base: Ibiza.",
    de: "11,6 m Segelboot, bis zu 11+1 Gäste, 2 Badezimmer, Skipper inklusive. Perfekt für Segeltage, Schnorcheln und Sonnenuntergänge auf See. Standort: Ibiza.",
    fr: "Voilier de 11,6 m, jusqu'à 11+1 invités, 2 salles de bain, skipper inclus. Parfait pour des journées de navigation, snorkeling et couchers de soleil en mer. Base : Ibiza.",
  },
  pjr17vohz: { // Wahoo
    en: "Pershing 80: sporty yacht with bold lines and high performance, ideal for charter days and excursions in Ibiza and Formentera. Large outdoor spaces fore and aft, panoramic helm station and dedicated crew.",
    es: "Pershing 80: yate deportivo de líneas decididas y altas prestaciones, ideal para días y excursiones de charter en Ibiza y Formentera. Amplios espacios exteriores a proa y popa, puesto de mando panorámico y tripulación dedicada.",
    de: "Pershing 80: sportliche Yacht mit markanten Linien und hoher Leistung, ideal für Chartertage und Ausflüge auf Ibiza und Formentera. Große Außenbereiche vorne und hinten, Panorama-Steuerstand und feste Crew.",
    fr: "Pershing 80 : yacht sportif aux lignes affirmées et hautes performances, idéal pour des journées et excursions en charter à Ibiza et Formentera. Grands espaces extérieurs à l'avant et à l'arrière, poste de pilotage panoramique et équipage dédié.",
  },
  prov75zhu: { // Pershing 90 My Danzas
    en: "Pershing 90: Italian sporty lines and maximum performance. Master, VIP and two Twin cabins, up to 12 guests by day and 8 overnight, with a crew of 4 (captain, sailor, hostess and chef). Equipment: tender, jet ski, wakeboard, towable ring, stand up paddle, snorkeling, anti-jellyfish pool and seabob.",
    es: "Pershing 90: líneas deportivas italianas y máximo rendimiento. Camarotes Master, VIP y dos Twin, hasta 12 huéspedes de día y 8 por la noche, con tripulación de 4 personas (capitán, marinero, hostess y cocinero). Equipamiento: tender, moto de agua, wakeboard, rosco, paddle surf, snorkel, piscina antimedusas y seabob.",
    de: "Pershing 90: italienische Sportlinien und maximale Leistung. Master-, VIP- und zwei Zwillingskabinen, bis zu 12 Gäste tagsüber und 8 über Nacht, mit einer 4-köpfigen Crew (Kapitän, Matrose, Hostess und Koch). Ausstattung: Beiboot, Jetski, Wakeboard, Reifen, Stand-up-Paddle, Schnorcheln, Anti-Quallen-Pool und Seabob.",
    fr: "Pershing 90 : lignes sportives italiennes et performances maximales. Cabines Master, VIP et deux Twin, jusqu'à 12 invités le jour et 8 la nuit, avec un équipage de 4 personnes (capitaine, marin, hôtesse et cuisinier). Équipements : annexe, jet ski, wakeboard, bouée tractée, paddle, snorkeling, piscine anti-méduses et seabob.",
  },
  pfrfi4dlp: { // Yupas
    en: "12m sailing boat, up to 9+1 guests, 2 bathrooms, skipper included. Comfort and agility to explore the coasts of Ibiza in a day. Base: Ibiza.",
    es: "Velero de 12 m, hasta 9+1 huéspedes, 2 baños, patrón incluido. Confort y agilidad para explorar las costas de Ibiza en un día. Base: Ibiza.",
    de: "12 m Segelboot, bis zu 9+1 Gäste, 2 Badezimmer, Skipper inklusive. Komfort und Wendigkeit, um die Küsten Ibizas an einem Tag zu erkunden. Standort: Ibiza.",
    fr: "Voilier de 12 m, jusqu'à 9+1 invités, 2 salles de bain, skipper inclus. Confort et agilité pour explorer les côtes d'Ibiza en une journée. Base : Ibiza.",
  },
  p4f2mx6g7: { // Sensation Pershing 72
    en: "Pershing 72 Sensation: an intense experience made of speed, Italian design and fine wood finishes. Interiors crafted in every detail for a charter full of comfort and adrenaline.",
    es: "Pershing 72 Sensation: una experiencia intensa hecha de velocidad, diseño italiano y acabados en madera de calidad. Interiores cuidados al detalle para un charter lleno de confort y adrenalina.",
    de: "Pershing 72 Sensation: ein intensives Erlebnis aus Geschwindigkeit, italienischem Design und edlen Holzverkleidungen. Bis ins Detail gestaltete Innenräume für einen Charter voller Komfort und Adrenalin.",
    fr: "Pershing 72 Sensation : une expérience intense faite de vitesse, de design italien et de finitions en bois précieux. Intérieurs soignés dans les moindres détails pour un charter alliant confort et adrénaline.",
  },
  p4rp331wi: { // Triniti
    en: "Mangusta 108 with refined Italian design and high performance. Triniti hosts up to 12 guests in five en-suite cabins: master suite, two double VIP cabins, a twin cabin and a single. Main saloon with dining and living area, second saloon on the lower deck. Bow with sundeck and lounge, stern with a large sundeck.",
    es: "Mangusta 108 de diseño italiano refinado y altas prestaciones. Triniti acoge hasta 12 huéspedes en cinco camarotes con baño en suite: suite principal, dos camarotes VIP dobles, un camarote gemelo y uno individual. Salón principal con zona de comedor y estar, segundo salón en la cubierta inferior. Proa con solárium y lounge, popa con amplio solárium.",
    de: "Mangusta 108 mit raffiniertem italienischem Design und hoher Leistung. Triniti beherbergt bis zu 12 Gäste in fünf Kabinen mit eigenem Bad: Master-Suite, zwei doppelte VIP-Kabinen, eine Zwillingskabine und eine Einzelkabine. Hauptsalon mit Ess- und Wohnbereich, zweiter Salon auf dem Unterdeck. Bug mit Sonnendeck und Lounge, Heck mit großem Sonnendeck.",
    fr: "Mangusta 108 au design italien raffiné et aux hautes performances. Triniti accueille jusqu'à 12 invités dans cinq cabines avec salle de bain privative : suite armateur, deux cabines VIP doubles, une cabine twin et une simple. Salon principal avec espace repas et vie, second salon sur le pont inférieur. Proue avec bain de soleil et lounge, poupe avec grand bain de soleil.",
  },
  pmfhjdxlh: { // Audi Q7
    en: "7-seat SUV, ideal for families or large groups. Comfort, space and safety to explore the island without a worry.",
    es: "SUV de 7 plazas, ideal para familias o grupos numerosos. Confort, espacio y seguridad para explorar la isla sin preocupaciones.",
    de: "7-Sitzer-SUV, ideal für Familien oder größere Gruppen. Komfort, Platz und Sicherheit, um die Insel sorgenfrei zu erkunden.",
    fr: "SUV 7 places, idéal pour les familles ou les grands groupes. Confort, espace et sécurité pour explorer l'île en toute tranquillité.",
  },
  p0y64uriq: { // Audi Q8
    en: "Premium coupé SUV, elegance and comfort for every trip. Spacious and equipped with the best on-board technology.",
    es: "SUV coupé premium, elegancia y confort para cada trayecto. Espacioso y equipado con la mejor tecnología de a bordo.",
    de: "Premium-Coupé-SUV, Eleganz und Komfort für jede Fahrt. Geräumig und mit bester Bordtechnologie ausgestattet.",
    fr: "SUV coupé premium, élégance et confort pour chaque trajet. Spacieux et doté des meilleures technologies embarquées.",
  },
  phbeywab2: { // Audi RS Q8
    en: "High-performance coupé SUV, Audi's top of the range. Space, technology and power to travel with the family without giving up the adrenaline.",
    es: "SUV coupé de altas prestaciones, lo mejor de la gama Audi. Espacio, tecnología y potencia para viajar en familia sin renunciar a la adrenalina.",
    de: "Hochleistungs-Coupé-SUV, das Topmodell von Audi. Platz, Technologie und Kraft, um mit der Familie zu reisen, ohne auf Adrenalin zu verzichten.",
    fr: "SUV coupé haute performance, le haut de gamme Audi. Espace, technologie et puissance pour voyager en famille sans renoncer à l'adrénaline.",
  },
  pd73o61nw: { // Audi RS3
    en: "All-wheel-drive sporty compact, 5-cylinder engine with an unmistakable sound. Agile, fast and full of character.",
    es: "Compacto deportivo de tracción integral, motor de 5 cilindros con un sonido inconfundible. Ágil, rápido y de carácter decidido.",
    de: "Sportlicher Kompaktwagen mit Allradantrieb, 5-Zylinder-Motor mit unverwechselbarem Sound. Agil, schnell und mit ausgeprägtem Charakter.",
    fr: "Compacte sportive à quatre roues motrices, moteur 5 cylindres au son inimitable. Agile, rapide et au caractère affirmé.",
  },
  pusnbbktt: { // BMW M4
    en: "High-performance sports coupé, gritty driving and aggressive design. Perfect for those who want to experience Ibiza with adrenaline and elegance.",
    es: "Coupé deportivo de altas prestaciones, conducción agresiva y diseño contundente. Perfecto para quienes quieren vivir Ibiza con adrenalina y elegancia.",
    de: "Hochleistungs-Sportcoupé, packendes Fahrverhalten und aggressives Design. Perfekt für alle, die Ibiza mit Adrenalin und Eleganz erleben wollen.",
    fr: "Coupé sportif haute performance, conduite mordante et design agressif. Parfait pour vivre Ibiza avec adrénaline et élégance.",
  },
  pnmoykxhb: { // Ferrari 488
    en: "The Italian supercar par excellence: breathtaking lines and track-level performance. The most exclusive driving experience in Ibiza.",
    es: "El superdeportivo italiano por excelencia: líneas de infarto y prestaciones de circuito. La experiencia de conducción más exclusiva de Ibiza.",
    de: "Der italienische Supersportwagen schlechthin: atemberaubende Linien und Rennstrecken-Performance. Das exklusivste Fahrerlebnis auf Ibiza.",
    fr: "La supercar italienne par excellence : des lignes à couper le souffle et des performances dignes de la piste. L'expérience de conduite la plus exclusive à Ibiza.",
  },
  puaub1isr: { // Ford Mustang
    en: "American muscle car icon, unmistakable V8 sound. A unique and thrilling driving experience on the roads of Ibiza.",
    es: "Icono muscle car americano, sonido V8 inconfundible. Una experiencia de conducción única y emocionante por las carreteras de Ibiza.",
    de: "Amerikanische Muscle-Car-Ikone, unverwechselbarer V8-Sound. Ein einzigartiges und mitreißendes Fahrerlebnis auf den Straßen Ibizas.",
    fr: "Icône muscle car américaine, son V8 inimitable. Une expérience de conduite unique et enivrante sur les routes d'Ibiza.",
  },
  puyv3eq6b: { // Lamborghini Urus
    en: "Lamborghini super SUV: supercar performance with SUV space and comfort. The ultimate car to get anywhere in Ibiza in style.",
    es: "Super SUV de Lamborghini: prestaciones de superdeportivo con el espacio y confort de un SUV. El coche definitivo para llegar a cualquier parte de Ibiza con estilo.",
    de: "Lamborghini Super-SUV: Supersportwagen-Leistung mit dem Platz und Komfort eines SUV. Das ultimative Auto, um in Ibiza mit Stil überall hinzukommen.",
    fr: "Super SUV Lamborghini : performances de supercar avec l'espace et le confort d'un SUV. La voiture ultime pour aller partout à Ibiza avec style.",
  },
  pr1mvp0rf: { // Urus Performante
    en: "Performante version of the Urus: even more power, sport-tuned suspension and exposed carbon. The ultimate thrill on four wheels.",
    es: "Versión Performante del Urus: aún más potencia, suspensión deportiva y fibra de carbono a la vista. La máxima emoción sobre cuatro ruedas.",
    de: "Performante-Version des Urus: noch mehr Leistung, sportliches Fahrwerk und sichtbarer Carbon. Das Maximum an Fahrspaß auf vier Rädern.",
    fr: "Version Performante de l'Urus : encore plus de puissance, châssis sportif et carbone apparent. Le summum des sensations sur quatre roues.",
  },
  pswt9bgh2: { // Mercedes AMG E43
    en: "AMG sports saloon, comfort and power in perfect balance. Ideal for elegant travel between the island's locations.",
    es: "Berlina deportiva AMG, confort y potencia en perfecto equilibrio. Ideal para desplazamientos elegantes entre las localidades de la isla.",
    de: "AMG Sportlimousine, Komfort und Leistung in perfekter Balance. Ideal für elegante Fahrten zwischen den Orten der Insel.",
    fr: "Berline sportive AMG, confort et puissance en parfait équilibre. Idéale pour des déplacements élégants entre les lieux de l'île.",
  },
  pv1aipwes: { // G63 Brabus
    en: "High-performance luxury SUV with Brabus tuning. Leather interiors, upsized wheels, absolute road presence. Ideal for those seeking maximum status in Ibiza.",
    es: "SUV de lujo de altas prestaciones, preparación Brabus. Interior de piel, llantas de mayor tamaño, presencia escénica absoluta. Ideal para quienes buscan el máximo estatus en Ibiza.",
    de: "Hochleistungs-Luxus-SUV mit Brabus-Tuning. Lederinterieur, größere Felgen, absolute Straßenpräsenz. Ideal für alle, die auf Ibiza maximalen Status suchen.",
    fr: "SUV de luxe haute performance, préparation Brabus. Intérieur en cuir, jantes surdimensionnées, présence absolue sur la route. Idéal pour ceux qui recherchent le summum du statut à Ibiza.",
  },
  pf9nk91ye: { // Can Paz
    en: "Residence on a fully fenced 2,000 sqm plot with automated entrance. 3 bedrooms (one double with en-suite bathroom and garden access, two with single beds), 3 bathrooms, up to 6 guests, approx. 180 sqm indoors. Pool with relax area, covered terrace with equipped outdoor kitchen, garden with a century-old olive tree and Balinese daybed. In Can Jordi, Sant Josep de sa Talaia: 7km from Ibiza Town, 5.5km from the airport, 4.5km from the sea, less than 2km from Blue Marlin.",
    es: "Residencia en una parcela de 2000 m² completamente vallada con entrada automatizada. 3 habitaciones (una doble con baño en suite y acceso al jardín, dos con camas individuales), 3 baños, hasta 6 huéspedes, unos 180 m² interiores. Piscina con zona de relax, terraza cubierta con cocina exterior equipada, jardín con olivo centenario y cama balinesa. En Can Jordi, Sant Josep de sa Talaia: a 7 km de Ibiza Town, 5,5 km del aeropuerto, 4,5 km del mar, a menos de 2 km del Blue Marlin.",
    de: "Anwesen auf einem vollständig eingezäunten 2000 m² großen Grundstück mit automatisiertem Eingang. 3 Schlafzimmer (ein Doppelzimmer mit eigenem Bad und Gartenzugang, zwei mit Einzelbetten), 3 Badezimmer, bis zu 6 Gäste, ca. 180 m² Innenfläche. Pool mit Ruhebereich, überdachte Terrasse mit ausgestatteter Außenküche, Garten mit jahrhundertealtem Olivenbaum und balinesischem Loungebett. In Can Jordi, Sant Josep de sa Talaia: 7 km von Ibiza-Stadt, 5,5 km vom Flughafen, 4,5 km vom Meer, weniger als 2 km vom Blue Marlin entfernt.",
    fr: "Résidence sur un terrain entièrement clos de 2000 m² avec entrée automatisée. 3 chambres (une double avec salle de bain privative et accès au jardin, deux avec lits simples), 3 salles de bain, jusqu'à 6 invités, environ 180 m² intérieurs. Piscine avec espace détente, terrasse couverte avec cuisine extérieure équipée, jardin avec olivier centenaire et lit balinais. À Can Jordi, Sant Josep de sa Talaia : à 7 km d'Ibiza Ville, 5,5 km de l'aéroport, 4,5 km de la mer, à moins de 2 km du Blue Marlin.",
  },
  pnyjy4900: { // Chalet Cala de Bou
    en: "Modern Mediterranean chalet on two levels, 3 bedrooms, 3 bathrooms, private pool, parking.",
    es: "Chalet moderno mediterráneo de dos niveles, 3 habitaciones, 3 baños, piscina privada, aparcamiento.",
    de: "Modernes mediterranes Chalet auf zwei Ebenen, 3 Schlafzimmer, 3 Badezimmer, Privatpool, Parkplatz.",
    fr: "Chalet moderne méditerranéen sur deux niveaux, 3 chambres, 3 salles de bain, piscine privée, parking.",
  },
  p07r9vh5f: { // Villa Can Daniel
    en: "Ibiza's most Mediterranean villa: Mediterranean design with rustic elegance. 5 bedrooms, up to 10+2 guests, 3 bathrooms. Main house with 4 bedrooms for 8 guests plus an independent apartment with an extra bedroom and sofa bed for 4 more. Two fully equipped kitchens, large indoor and outdoor dining areas with BBQ, crystal-clear pool in a fenced garden, sea view. 12 minutes from Ibiza Town, near the Sant Jordi de ses Salines Paddle Club.",
    es: "La villa más mediterránea de Ibiza: diseño mediterráneo con elegancia rústica. 5 habitaciones, hasta 10+2 huéspedes, 3 baños. Casa principal con 4 habitaciones para 8 huéspedes más un apartamento independiente con habitación extra y sofá cama para 4 personas más. Dos cocinas totalmente equipadas, amplias zonas de comedor interiores y exteriores con barbacoa, piscina cristalina en jardín vallado, vistas al mar. A 12 minutos de Ibiza Town, cerca del Paddle Club de Sant Jordi de ses Salines.",
    de: "Die mediterranste Villa Ibizas: mediterranes Design mit rustikaler Eleganz. 5 Schlafzimmer, bis zu 10+2 Gäste, 3 Badezimmer. Haupthaus mit 4 Schlafzimmern für 8 Gäste plus unabhängiges Apartment mit zusätzlichem Schlafzimmer und Schlafsofa für 4 weitere Personen. Zwei voll ausgestattete Küchen, große Innen- und Außenessbereiche mit Grill, kristallklarer Pool im eingezäunten Garten, Meerblick. 12 Minuten von Ibiza-Stadt, in der Nähe des Paddle Clubs von Sant Jordi de ses Salines.",
    fr: "La villa la plus méditerranéenne d'Ibiza : design méditerranéen à l'élégance rustique. 5 chambres, jusqu'à 10+2 invités, 3 salles de bain. Maison principale avec 4 chambres pour 8 invités plus un appartement indépendant avec chambre supplémentaire et canapé-lit pour 4 personnes de plus. Deux cuisines entièrement équipées, grands espaces repas intérieurs et extérieurs avec barbecue, piscine cristalline dans un jardin clos, vue mer. À 12 minutes d'Ibiza Ville, près du Paddle Club de Sant Jordi de ses Salines.",
  },
  pqamakt2s: { // Villa Julieta
    en: "Villa Julieta is a luxurious new-build (2016) in authentic, spacious and bright Ibizan style, located in Cap Martinet, one of the most exclusive areas of Ibiza, between Talamanca beach and the village of Jesús, next to Can Pep Simó. 340 sqm spread over: ground floor (4 bedrooms with en-suite bathroom and direct pool access), middle floor (kitchen, living room, dining room, guest toilet, bedroom with en-suite bathroom and large outdoor living/dining terrace), top floor (large solarium with a magnificent view over Ibiza town, the sea and the mountains). Private pool with Balinese beds, sunbeds and umbrellas, BBQ, private garage, air conditioning, alarm, Wifi. 750m from Talamanca Beach, 1.5km from Pacha, 2km from Lio Restaurant and Marina Botafoch, 2.5km from Ibiza Town.",
    es: "Villa Julieta es un lujoso edificio de nueva construcción (2016) de auténtico estilo ibicenco, amplio y luminoso, ubicado en Cap Martinet, una de las zonas más exclusivas de Ibiza, entre la playa de Talamanca y el pueblo de Jesús, junto a Can Pep Simó. 340 m² distribuidos en: planta baja (4 habitaciones con baño en suite y acceso directo a la piscina), planta intermedia (cocina, salón, comedor, aseo de cortesía, habitación con baño en suite y amplia terraza de estar/comedor exterior), planta superior (amplio solárium con magníficas vistas a la ciudad de Ibiza, el mar y las montañas). Piscina privada con camas balinesas, tumbonas y sombrillas, barbacoa, garaje privado, aire acondicionado, alarma, wifi. A 750 m de Talamanca Beach, 1,5 km de Pacha, 2 km del Lio Restaurant y de Marina Botafoch, 2,5 km de Ibiza Town.",
    de: "Villa Julieta ist ein luxuriöser Neubau (2016) im authentischen, großzügigen und hellen ibizenkischen Stil, gelegen in Cap Martinet, einer der exklusivsten Gegenden Ibizas, zwischen dem Strand von Talamanca und dem Dorf Jesús, direkt neben Can Pep Simó. 340 m² verteilt auf: Erdgeschoss (4 Schlafzimmer mit eigenem Bad und direktem Poolzugang), mittlere Etage (Küche, Wohnzimmer, Esszimmer, Gäste-WC, Schlafzimmer mit eigenem Bad und große Wohn-/Essterrasse im Freien), oberste Etage (großes Solarium mit herrlichem Blick auf die Stadt Ibiza, das Meer und die Berge). Privatpool mit balinesischen Betten, Liegen und Sonnenschirmen, Grill, Privatgarage, Klimaanlage, Alarmanlage, WLAN. 750 m vom Strand von Talamanca, 1,5 km von Pacha, 2 km vom Lio Restaurant und der Marina Botafoch, 2,5 km von Ibiza-Stadt entfernt.",
    fr: "Villa Julieta est une luxueuse construction neuve (2016) au style ibicenco authentique, spacieux et lumineux, située à Cap Martinet, l'une des zones les plus exclusives d'Ibiza, entre la plage de Talamanca et le village de Jesús, à côté de Can Pep Simó. 340 m² répartis sur : rez-de-chaussée (4 chambres avec salle de bain privative et accès direct à la piscine), étage intermédiaire (cuisine, salon, salle à manger, toilettes invités, chambre avec salle de bain privative et grande terrasse extérieure salon/repas), dernier étage (grand solarium avec une vue magnifique sur la ville d'Ibiza, la mer et les montagnes). Piscine privée avec lits balinais, transats et parasols, barbecue, garage privé, climatisation, alarme, wifi. À 750 m de la plage de Talamanca, 1,5 km du Pacha, 2 km du restaurant Lio et de la Marina Botafoch, 2,5 km d'Ibiza Ville.",
  },
};

async function main() {
  const ids = Object.keys(T);
  console.log('translating', ids.length, 'properties');
  for (const id of ids) {
    await db.execute({ sql: 'UPDATE properties SET description_i18n = ? WHERE id = ?', args: [JSON.stringify(T[id]), id] });
  }
  console.log('done');
}
main().catch(e => { console.error(e); process.exit(1); });
