// Sistema di traduzioni per la vetrina pubblica (src/app/page.tsx).
// Il pannello owner/admin (src/app/platform) resta in italiano: è uso interno.
export type Lang = "en" | "it" | "es" | "de" | "fr";

export const LANGUAGES: { code: Lang; flag: string; label: string }[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
];

export const DEFAULT_LANG: Lang = "en";

type Dict = Record<string, string>;

const en: Dict = {
  nav_services: "Services", nav_how: "How it works", nav_collaborate: "Collaborate",
  referral_banner: "You're viewing the exclusive portfolio of {name} — including private assets not shown publicly",

  hero_kicker: "Ibiza · Luxury Experience",
  hero_title: "The island like\nyou've never lived it",
  hero_subtitle: "Exclusive villas, private yachts, luxury cars and tailor-made experiences. Your personal concierge for an unforgettable stay in Ibiza.",
  hero_cta1: "Discover Services",
  hero_cta2: "Collaborate with Us",

  services_kicker: "Our Portfolio",
  services_title: "Luxury Experiences",
  services_subtitle: "Every property is hand-picked to guarantee maximum comfort and the exclusivity you deserve.",

  cat_all: "All", cat_residenze: "Residences", cat_marine: "Marine", cat_mobilita: "Mobility",
  view_grid: "Grid", view_map: "Map",
  no_results: "No service available in this category right now.",
  search_placeholder: "🔍 Search by name or area...",
  filter_any: "Any", filter_guests_min: "Guests", filter_bedrooms_min: "Bedrooms", filter_bathrooms_min: "Bathrooms",

  unit_one: "unit", unit_other: "units available",
  availability_verified: "Verified availability", whatsapp_on_request: "On request via WhatsApp",
  view_availability: "📅 View Availability", request_whatsapp: "💬 Request via WhatsApp",
  from_price: "from", map_view_details: "View details →",
  badge_exclusive: "Exclusive", badge_live_availability: "Live availability",

  asset_apartment: "apartment", asset_villa: "villa", asset_boat: "boat", asset_car: "car", asset_scooter: "scooter",

  how_kicker: "The Process", how_title: "How it Works",
  how_1_title: "Choose", how_1_desc: "Browse our selection of exclusive villas, yachts, cars and experiences in Ibiza.",
  how_2_title: "Request", how_2_desc: "Send an availability request with your dates and stay details.",
  how_3_title: "Confirm", how_3_desc: "Your dedicated concierge will contact you within hours to finalize every detail.",
  how_4_title: "Enjoy", how_4_desc: "Arrive, relax. We take care of everything else, from check-in to on-demand experiences.",

  collab_kicker: "For Professionals",
  collab_title: "Collaborate\nwith Aura Ibiza",
  collab_desc: "Are you a real estate agent, a professional concierge, or an owner looking to promote luxury villas, boats or cars? Join our network and reach premium clients.",
  collab_b1: "Owners of villas, apartments or boats",
  collab_b2: "Concierges and specialized travel agents",
  collab_b3: "Luxury car, transfer and rental providers",
  collab_b4: "Experience and event organizers",
  collab_cta: "Register now →",
  collab_s1_title: "Premium Visibility", collab_s1_desc: "Your properties and services are shown to selected clients with high purchasing power.",
  collab_s2_title: "Simple Management", collab_s2_desc: "A complete dashboard to manage bookings, payments and collaborators in one place.",
  collab_s3_title: "Professional Network", collab_s3_desc: "Join an ecosystem of luxury professionals working together to offer the best.",

  footer_tagline: "Luxury Concierge · Ibiza\nTailor-made experiences for your\nmost special moments",
  footer_services: "Services", footer_s1: "Luxury Residences", footer_s2: "Yachts & Marine", footer_s3: "Cars & Transfer", footer_s4: "Experiences",
  footer_platform: "Platform", footer_login: "Log in", footer_register: "Register", footer_collaborate: "Collaborate",
  footer_contacts: "Contacts",
  footer_rights: "All rights reserved",

  pdf_open: "📄 Property Sheet", pdf_loading: "Loading…",
  available_units: "Available units", availability_heading: "Availability",
  guests: "guests", bedrooms: "bedrooms", bathrooms: "bathrooms",
  book_button: "Book {n} {unit} →",
  click_checkin: "Click the check-in day to select your dates",
  book_whatsapp_title: "Book via WhatsApp",
  book_whatsapp_desc: "Write to us directly to check availability and finalize your booking. Reply within a few hours.",
  whatsapp_write: "Write on WhatsApp",
  email_alt: "✉ Or write via email",

  cal_loading: "Loading...",
  cal_available: "Available", cal_booked: "Booked", cal_selected: "Selected",
  cal_nights_selected: "{n} {unit} selected",

  req_kicker: "Availability Request",
  req_unit: "Unit",
  req_referral: "You are booking through concierge {name}",
  req_name: "Name *", req_name_ph: "John Smith",
  req_guests: "Guests", req_person: "person", req_people: "people",
  req_email: "Email",
  req_phone: "Phone / WhatsApp",
  req_checkin: "Check-in", req_checkout: "Check-out",
  req_message: "Message", req_message_ph: "Special requests, questions, additional details...",
  req_send: "Send Request", req_sending: "Sending...",
  req_cancel: "Cancel",
  req_success_title: "Request Sent!",
  req_success_desc: "Thank you {name}! Our team will contact you within a few hours to confirm availability and provide all the details.",
  req_close: "Close",
  req_err_name: "Please enter your name.",
  req_err_contact: "Please enter an email or phone number.",
  req_err_send: "Error sending request. Please try again.",

  unit_night: "night", unit_nights: "nights", unit_day: "day", unit_days: "days",

  wa_message: "Hello! I'm interested in *{name}*{room}.\n\nCould you let me know availability? I'm looking at these dates: ",
  email_subject: "Availability request: {name}",
  email_body: "Hello,\n\nI'm interested in {name}{room}.\n\nI'd like to check availability for the following dates:\n\nThank you",

  month_1: "January", month_2: "February", month_3: "March", month_4: "April", month_5: "May", month_6: "June",
  month_7: "July", month_8: "August", month_9: "September", month_10: "October", month_11: "November", month_12: "December",
  day_mon: "Mo", day_tue: "Tu", day_wed: "We", day_thu: "Th", day_fri: "Fr", day_sat: "Sa", day_sun: "Su",
};

const it: Dict = {
  nav_services: "Servizi", nav_how: "Come funziona", nav_collaborate: "Collabora",
  referral_banner: "Stai esplorando il portfolio esclusivo di {name} — inclusi gli asset riservati non visibili al pubblico",

  hero_kicker: "Ibiza · Luxury Experience",
  hero_title: "L'isola come\nnon l'hai mai vissuta",
  hero_subtitle: "Ville esclusive, yacht privati, auto di lusso e esperienze su misura. Il tuo concierge personale per un soggiorno indimenticabile a Ibiza.",
  hero_cta1: "Scopri i Servizi",
  hero_cta2: "Collabora con Noi",

  services_kicker: "Il Nostro Portfolio",
  services_title: "Esperienze di Lusso",
  services_subtitle: "Ogni proprietà è selezionata per garantire il massimo comfort e l'esclusività che meriti.",

  cat_all: "Tutto", cat_residenze: "Residenze", cat_marine: "Marine", cat_mobilita: "Mobilità",
  view_grid: "Griglia", view_map: "Mappa",
  no_results: "Nessun servizio disponibile in questa categoria al momento.",
  search_placeholder: "🔍 Cerca per nome o zona...",
  filter_any: "Tutti", filter_guests_min: "Ospiti", filter_bedrooms_min: "Camere", filter_bathrooms_min: "Bagni",

  unit_one: "unità", unit_other: "unità disponibili",
  availability_verified: "Disponibilità verificata", whatsapp_on_request: "Su richiesta WhatsApp",
  view_availability: "📅 Vedi Disponibilità", request_whatsapp: "💬 Richiedi via WhatsApp",
  from_price: "da", map_view_details: "Vedi dettagli →",
  badge_exclusive: "Esclusivo", badge_live_availability: "Disponibilità live",

  asset_apartment: "appartamento", asset_villa: "villa", asset_boat: "barca", asset_car: "auto", asset_scooter: "scooter",

  how_kicker: "Il Processo", how_title: "Come Funziona",
  how_1_title: "Scegli", how_1_desc: "Sfoglia la nostra selezione di ville, yacht, auto e esperienze esclusive a Ibiza.",
  how_2_title: "Richiedi", how_2_desc: "Invia una richiesta di disponibilità con le date e i dettagli del tuo soggiorno.",
  how_3_title: "Conferma", how_3_desc: "Il tuo concierge dedicato ti contatterà entro poche ore per finalizzare ogni dettaglio.",
  how_4_title: "Goditi", how_4_desc: "Arriva, rilassati. Pensiamo noi a tutto il resto, dal check-in alle esperienze on demand.",

  collab_kicker: "Per Professionisti",
  collab_title: "Collabora\ncon Aura Ibiza",
  collab_desc: "Sei un agente immobiliare, un concierge professionista o un proprietario che vuole promuovere ville, barche o auto di lusso? Unisciti alla nostra rete e raggiungi clienti premium.",
  collab_b1: "Proprietari di ville, appartamenti o barche",
  collab_b2: "Concierge e agenti di viaggio specializzati",
  collab_b3: "Provider di auto di lusso, transfer e noleggi",
  collab_b4: "Organizzatori di esperienze ed eventi",
  collab_cta: "Registrati ora →",
  collab_s1_title: "Visibilità Premium", collab_s1_desc: "Le tue proprietà e servizi vengono mostrati a clienti selezionati con alto potere d'acquisto.",
  collab_s2_title: "Gestione Semplice", collab_s2_desc: "Dashboard completa per gestire prenotazioni, pagamenti e collaboratori in un unico posto.",
  collab_s3_title: "Rete Professionale", collab_s3_desc: "Entra in un ecosistema di professionisti del lusso che collaborano per offrire il meglio.",

  footer_tagline: "Luxury Concierge · Ibiza\nEsperienze su misura per i tuoi\nmomenti più speciali",
  footer_services: "Servizi", footer_s1: "Residenze di lusso", footer_s2: "Yacht & Marine", footer_s3: "Auto & Transfer", footer_s4: "Esperienze",
  footer_platform: "Piattaforma", footer_login: "Accedi", footer_register: "Registrati", footer_collaborate: "Collabora",
  footer_contacts: "Contatti",
  footer_rights: "Tutti i diritti riservati",

  pdf_open: "📄 Scheda PDF", pdf_loading: "Caricamento…",
  available_units: "Unità disponibili", availability_heading: "Disponibilità",
  guests: "ospiti", bedrooms: "camere", bathrooms: "bagni",
  book_button: "Prenota {n} {unit} →",
  click_checkin: "Clicca sul giorno di check-in per selezionare le date",
  book_whatsapp_title: "Prenota via WhatsApp",
  book_whatsapp_desc: "Scrivici direttamente per verificare disponibilità e finalizzare la prenotazione. Risposta entro poche ore.",
  whatsapp_write: "Scrivi su WhatsApp",
  email_alt: "✉ Oppure scrivi via email",

  cal_loading: "Caricamento...",
  cal_available: "Disponibile", cal_booked: "Occupato", cal_selected: "Selezionato",
  cal_nights_selected: "{n} {unit} selezionate",

  req_kicker: "Richiesta Disponibilità",
  req_unit: "Unità",
  req_referral: "Stai prenotando tramite il concierge {name}",
  req_name: "Nome *", req_name_ph: "Mario Rossi",
  req_guests: "Ospiti", req_person: "persona", req_people: "persone",
  req_email: "Email",
  req_phone: "Telefono / WhatsApp",
  req_checkin: "Check-in", req_checkout: "Check-out",
  req_message: "Messaggio", req_message_ph: "Richieste speciali, domande, dettagli aggiuntivi...",
  req_send: "Invia Richiesta", req_sending: "Invio in corso...",
  req_cancel: "Annulla",
  req_success_title: "Richiesta Inviata!",
  req_success_desc: "Grazie {name}! Il nostro team ti contatterà entro poche ore per confermare la disponibilità e fornirti tutti i dettagli.",
  req_close: "Chiudi",
  req_err_name: "Inserisci il tuo nome.",
  req_err_contact: "Inserisci email o telefono.",
  req_err_send: "Errore nell'invio. Riprova.",

  unit_night: "notte", unit_nights: "notti", unit_day: "giorno", unit_days: "giorni",

  wa_message: "Ciao! Sono interessato/a a *{name}*{room}.\n\nPotreste indicarmi la disponibilità? Sto cercando queste date: ",
  email_subject: "Richiesta disponibilità: {name}",
  email_body: "Ciao,\n\nSono interessato/a a {name}{room}.\n\nVorrei verificare la disponibilità per le seguenti date:\n\nGrazie",

  month_1: "Gennaio", month_2: "Febbraio", month_3: "Marzo", month_4: "Aprile", month_5: "Maggio", month_6: "Giugno",
  month_7: "Luglio", month_8: "Agosto", month_9: "Settembre", month_10: "Ottobre", month_11: "Novembre", month_12: "Dicembre",
  day_mon: "Lu", day_tue: "Ma", day_wed: "Me", day_thu: "Gi", day_fri: "Ve", day_sat: "Sa", day_sun: "Do",
};

const es: Dict = {
  nav_services: "Servicios", nav_how: "Cómo funciona", nav_collaborate: "Colabora",
  referral_banner: "Estás explorando el portfolio exclusivo de {name} — incluidos los activos privados no visibles al público",

  hero_kicker: "Ibiza · Experiencia de Lujo",
  hero_title: "La isla como\nnunca la has vivido",
  hero_subtitle: "Villas exclusivas, yates privados, coches de lujo y experiencias a medida. Tu concierge personal para una estancia inolvidable en Ibiza.",
  hero_cta1: "Descubre los Servicios",
  hero_cta2: "Colabora con Nosotros",

  services_kicker: "Nuestro Portfolio",
  services_title: "Experiencias de Lujo",
  services_subtitle: "Cada propiedad está seleccionada para garantizar el máximo confort y la exclusividad que mereces.",

  cat_all: "Todo", cat_residenze: "Residencias", cat_marine: "Marina", cat_mobilita: "Movilidad",
  view_grid: "Cuadrícula", view_map: "Mapa",
  no_results: "No hay ningún servicio disponible en esta categoría por ahora.",
  search_placeholder: "🔍 Buscar por nombre o zona...",
  filter_any: "Todos", filter_guests_min: "Huéspedes", filter_bedrooms_min: "Habitaciones", filter_bathrooms_min: "Baños",

  unit_one: "unidad", unit_other: "unidades disponibles",
  availability_verified: "Disponibilidad verificada", whatsapp_on_request: "Bajo petición por WhatsApp",
  view_availability: "📅 Ver Disponibilidad", request_whatsapp: "💬 Solicitar por WhatsApp",
  from_price: "desde", map_view_details: "Ver detalles →",
  badge_exclusive: "Exclusivo", badge_live_availability: "Disponibilidad en vivo",

  asset_apartment: "apartamento", asset_villa: "villa", asset_boat: "barco", asset_car: "coche", asset_scooter: "scooter",

  how_kicker: "El Proceso", how_title: "Cómo Funciona",
  how_1_title: "Elige", how_1_desc: "Explora nuestra selección de villas, yates, coches y experiencias exclusivas en Ibiza.",
  how_2_title: "Solicita", how_2_desc: "Envía una solicitud de disponibilidad con tus fechas y los detalles de tu estancia.",
  how_3_title: "Confirma", how_3_desc: "Tu concierge dedicado te contactará en pocas horas para finalizar cada detalle.",
  how_4_title: "Disfruta", how_4_desc: "Llega y relájate. Nosotros nos encargamos de todo lo demás, desde el check-in hasta las experiencias a demanda.",

  collab_kicker: "Para Profesionales",
  collab_title: "Colabora\ncon Aura Ibiza",
  collab_desc: "¿Eres agente inmobiliario, concierge profesional o propietario que quiere promocionar villas, barcos o coches de lujo? Únete a nuestra red y llega a clientes premium.",
  collab_b1: "Propietarios de villas, apartamentos o barcos",
  collab_b2: "Concierges y agentes de viajes especializados",
  collab_b3: "Proveedores de coches de lujo, traslados y alquileres",
  collab_b4: "Organizadores de experiencias y eventos",
  collab_cta: "Regístrate ahora →",
  collab_s1_title: "Visibilidad Premium", collab_s1_desc: "Tus propiedades y servicios se muestran a clientes seleccionados con alto poder adquisitivo.",
  collab_s2_title: "Gestión Sencilla", collab_s2_desc: "Panel completo para gestionar reservas, pagos y colaboradores en un solo lugar.",
  collab_s3_title: "Red Profesional", collab_s3_desc: "Entra en un ecosistema de profesionales del lujo que colaboran para ofrecer lo mejor.",

  footer_tagline: "Luxury Concierge · Ibiza\nExperiencias a medida para tus\nmomentos más especiales",
  footer_services: "Servicios", footer_s1: "Residencias de lujo", footer_s2: "Yates & Marina", footer_s3: "Coches & Traslados", footer_s4: "Experiencias",
  footer_platform: "Plataforma", footer_login: "Acceder", footer_register: "Registrarse", footer_collaborate: "Colabora",
  footer_contacts: "Contacto",
  footer_rights: "Todos los derechos reservados",

  pdf_open: "📄 Ficha PDF", pdf_loading: "Cargando…",
  available_units: "Unidades disponibles", availability_heading: "Disponibilidad",
  guests: "huéspedes", bedrooms: "habitaciones", bathrooms: "baños",
  book_button: "Reservar {n} {unit} →",
  click_checkin: "Haz clic en el día de entrada para seleccionar tus fechas",
  book_whatsapp_title: "Reserva por WhatsApp",
  book_whatsapp_desc: "Escríbenos directamente para comprobar disponibilidad y finalizar la reserva. Respuesta en pocas horas.",
  whatsapp_write: "Escribir por WhatsApp",
  email_alt: "✉ O escribe por email",

  cal_loading: "Cargando...",
  cal_available: "Disponible", cal_booked: "Ocupado", cal_selected: "Seleccionado",
  cal_nights_selected: "{n} {unit} seleccionadas",

  req_kicker: "Solicitud de Disponibilidad",
  req_unit: "Unidad",
  req_referral: "Estás reservando a través del concierge {name}",
  req_name: "Nombre *", req_name_ph: "Juan Pérez",
  req_guests: "Huéspedes", req_person: "persona", req_people: "personas",
  req_email: "Email",
  req_phone: "Teléfono / WhatsApp",
  req_checkin: "Entrada", req_checkout: "Salida",
  req_message: "Mensaje", req_message_ph: "Solicitudes especiales, preguntas, detalles adicionales...",
  req_send: "Enviar Solicitud", req_sending: "Enviando...",
  req_cancel: "Cancelar",
  req_success_title: "¡Solicitud Enviada!",
  req_success_desc: "¡Gracias {name}! Nuestro equipo te contactará en pocas horas para confirmar la disponibilidad y darte todos los detalles.",
  req_close: "Cerrar",
  req_err_name: "Introduce tu nombre.",
  req_err_contact: "Introduce un email o teléfono.",
  req_err_send: "Error al enviar. Inténtalo de nuevo.",

  unit_night: "noche", unit_nights: "noches", unit_day: "día", unit_days: "días",

  wa_message: "¡Hola! Estoy interesado/a en *{name}*{room}.\n\n¿Podríais indicarme la disponibilidad? Estoy buscando estas fechas: ",
  email_subject: "Solicitud de disponibilidad: {name}",
  email_body: "Hola,\n\nEstoy interesado/a en {name}{room}.\n\nMe gustaría comprobar la disponibilidad para las siguientes fechas:\n\nGracias",

  month_1: "Enero", month_2: "Febrero", month_3: "Marzo", month_4: "Abril", month_5: "Mayo", month_6: "Junio",
  month_7: "Julio", month_8: "Agosto", month_9: "Septiembre", month_10: "Octubre", month_11: "Noviembre", month_12: "Diciembre",
  day_mon: "Lu", day_tue: "Ma", day_wed: "Mi", day_thu: "Ju", day_fri: "Vi", day_sat: "Sa", day_sun: "Do",
};

const de: Dict = {
  nav_services: "Leistungen", nav_how: "So funktioniert's", nav_collaborate: "Partner werden",
  referral_banner: "Sie sehen das exklusive Portfolio von {name} — inklusive privater Angebote, die nicht öffentlich sichtbar sind",

  hero_kicker: "Ibiza · Luxuserlebnis",
  hero_title: "Die Insel, wie Sie\nsie noch nie erlebt haben",
  hero_subtitle: "Exklusive Villen, private Yachten, Luxusautos und maßgeschneiderte Erlebnisse. Ihr persönlicher Concierge für einen unvergesslichen Aufenthalt auf Ibiza.",
  hero_cta1: "Leistungen entdecken",
  hero_cta2: "Mit uns zusammenarbeiten",

  services_kicker: "Unser Portfolio",
  services_title: "Luxuserlebnisse",
  services_subtitle: "Jede Immobilie wird sorgfältig ausgewählt, um maximalen Komfort und die Exklusivität zu garantieren, die Sie verdienen.",

  cat_all: "Alle", cat_residenze: "Residenzen", cat_marine: "Marine", cat_mobilita: "Mobilität",
  view_grid: "Raster", view_map: "Karte",
  no_results: "In dieser Kategorie ist derzeit kein Angebot verfügbar.",
  search_placeholder: "🔍 Suche nach Name oder Gegend...",
  filter_any: "Alle", filter_guests_min: "Gäste", filter_bedrooms_min: "Schlafzimmer", filter_bathrooms_min: "Badezimmer",

  unit_one: "Einheit", unit_other: "Einheiten verfügbar",
  availability_verified: "Verfügbarkeit bestätigt", whatsapp_on_request: "Auf Anfrage über WhatsApp",
  view_availability: "📅 Verfügbarkeit ansehen", request_whatsapp: "💬 Über WhatsApp anfragen",
  from_price: "ab", map_view_details: "Details ansehen →",
  badge_exclusive: "Exklusiv", badge_live_availability: "Live-Verfügbarkeit",

  asset_apartment: "Apartment", asset_villa: "Villa", asset_boat: "Boot", asset_car: "Auto", asset_scooter: "Roller",

  how_kicker: "Der Ablauf", how_title: "So funktioniert's",
  how_1_title: "Auswählen", how_1_desc: "Durchstöbern Sie unsere Auswahl exklusiver Villen, Yachten, Autos und Erlebnisse auf Ibiza.",
  how_2_title: "Anfragen", how_2_desc: "Senden Sie eine Verfügbarkeitsanfrage mit Ihren Daten und Details zu Ihrem Aufenthalt.",
  how_3_title: "Bestätigen", how_3_desc: "Ihr persönlicher Concierge meldet sich innerhalb weniger Stunden, um jedes Detail zu klären.",
  how_4_title: "Genießen", how_4_desc: "Ankommen, entspannen. Wir kümmern uns um den Rest, vom Check-in bis zu Erlebnissen auf Abruf.",

  collab_kicker: "Für Profis",
  collab_title: "Partner werden\nbei Aura Ibiza",
  collab_desc: "Sind Sie Immobilienmakler, professioneller Concierge oder Eigentümer, der Luxusvillen, Boote oder Autos bewerben möchte? Werden Sie Teil unseres Netzwerks und erreichen Sie Premium-Kunden.",
  collab_b1: "Eigentümer von Villen, Apartments oder Booten",
  collab_b2: "Concierges und spezialisierte Reisebüros",
  collab_b3: "Anbieter von Luxusautos, Transfers und Vermietungen",
  collab_b4: "Veranstalter von Erlebnissen und Events",
  collab_cta: "Jetzt registrieren →",
  collab_s1_title: "Premium-Sichtbarkeit", collab_s1_desc: "Ihre Immobilien und Leistungen werden ausgewählten Kunden mit hoher Kaufkraft gezeigt.",
  collab_s2_title: "Einfache Verwaltung", collab_s2_desc: "Ein komplettes Dashboard zur Verwaltung von Buchungen, Zahlungen und Partnern an einem Ort.",
  collab_s3_title: "Berufliches Netzwerk", collab_s3_desc: "Werden Sie Teil eines Netzwerks von Luxusprofis, die zusammenarbeiten, um das Beste zu bieten.",

  footer_tagline: "Luxury Concierge · Ibiza\nMaßgeschneiderte Erlebnisse für Ihre\nbesonderen Momente",
  footer_services: "Leistungen", footer_s1: "Luxusresidenzen", footer_s2: "Yachten & Marine", footer_s3: "Autos & Transfer", footer_s4: "Erlebnisse",
  footer_platform: "Plattform", footer_login: "Anmelden", footer_register: "Registrieren", footer_collaborate: "Partner werden",
  footer_contacts: "Kontakt",
  footer_rights: "Alle Rechte vorbehalten",

  pdf_open: "📄 Objektbeschreibung", pdf_loading: "Wird geladen…",
  available_units: "Verfügbare Einheiten", availability_heading: "Verfügbarkeit",
  guests: "Gäste", bedrooms: "Schlafzimmer", bathrooms: "Badezimmer",
  book_button: "{n} {unit} buchen →",
  click_checkin: "Klicken Sie auf den Anreisetag, um Ihre Daten auszuwählen",
  book_whatsapp_title: "Buchung über WhatsApp",
  book_whatsapp_desc: "Schreiben Sie uns direkt, um die Verfügbarkeit zu prüfen und die Buchung abzuschließen. Antwort innerhalb weniger Stunden.",
  whatsapp_write: "Auf WhatsApp schreiben",
  email_alt: "✉ Oder per E-Mail schreiben",

  cal_loading: "Wird geladen...",
  cal_available: "Verfügbar", cal_booked: "Belegt", cal_selected: "Ausgewählt",
  cal_nights_selected: "{n} {unit} ausgewählt",

  req_kicker: "Verfügbarkeitsanfrage",
  req_unit: "Einheit",
  req_referral: "Sie buchen über den Concierge {name}",
  req_name: "Name *", req_name_ph: "Max Mustermann",
  req_guests: "Gäste", req_person: "Person", req_people: "Personen",
  req_email: "E-Mail",
  req_phone: "Telefon / WhatsApp",
  req_checkin: "Anreise", req_checkout: "Abreise",
  req_message: "Nachricht", req_message_ph: "Besondere Wünsche, Fragen, weitere Details...",
  req_send: "Anfrage senden", req_sending: "Wird gesendet...",
  req_cancel: "Abbrechen",
  req_success_title: "Anfrage gesendet!",
  req_success_desc: "Danke {name}! Unser Team meldet sich innerhalb weniger Stunden, um die Verfügbarkeit zu bestätigen und Ihnen alle Details zu geben.",
  req_close: "Schließen",
  req_err_name: "Bitte geben Sie Ihren Namen ein.",
  req_err_contact: "Bitte geben Sie E-Mail oder Telefon ein.",
  req_err_send: "Fehler beim Senden. Bitte versuchen Sie es erneut.",

  unit_night: "Nacht", unit_nights: "Nächte", unit_day: "Tag", unit_days: "Tage",

  wa_message: "Hallo! Ich interessiere mich für *{name}*{room}.\n\nKönnten Sie mir die Verfügbarkeit mitteilen? Ich suche für folgende Daten: ",
  email_subject: "Verfügbarkeitsanfrage: {name}",
  email_body: "Hallo,\n\nich interessiere mich für {name}{room}.\n\nIch möchte die Verfügbarkeit für folgende Daten prüfen:\n\nDanke",

  month_1: "Januar", month_2: "Februar", month_3: "März", month_4: "April", month_5: "Mai", month_6: "Juni",
  month_7: "Juli", month_8: "August", month_9: "September", month_10: "Oktober", month_11: "November", month_12: "Dezember",
  day_mon: "Mo", day_tue: "Di", day_wed: "Mi", day_thu: "Do", day_fri: "Fr", day_sat: "Sa", day_sun: "So",
};

const fr: Dict = {
  nav_services: "Services", nav_how: "Comment ça marche", nav_collaborate: "Collaborer",
  referral_banner: "Vous explorez le portfolio exclusif de {name} — y compris les biens privés non visibles au public",

  hero_kicker: "Ibiza · Expérience de Luxe",
  hero_title: "L'île comme vous\nne l'avez jamais vécue",
  hero_subtitle: "Villas exclusives, yachts privés, voitures de luxe et expériences sur mesure. Votre concierge personnel pour un séjour inoubliable à Ibiza.",
  hero_cta1: "Découvrir les Services",
  hero_cta2: "Collaborer avec Nous",

  services_kicker: "Notre Portfolio",
  services_title: "Expériences de Luxe",
  services_subtitle: "Chaque propriété est sélectionnée pour garantir un confort maximal et l'exclusivité que vous méritez.",

  cat_all: "Tout", cat_residenze: "Résidences", cat_marine: "Marine", cat_mobilita: "Mobilité",
  view_grid: "Grille", view_map: "Carte",
  no_results: "Aucun service disponible dans cette catégorie pour le moment.",
  search_placeholder: "🔍 Rechercher par nom ou zone...",
  filter_any: "Tous", filter_guests_min: "Voyageurs", filter_bedrooms_min: "Chambres", filter_bathrooms_min: "Salles de bain",

  unit_one: "unité", unit_other: "unités disponibles",
  availability_verified: "Disponibilité vérifiée", whatsapp_on_request: "Sur demande via WhatsApp",
  view_availability: "📅 Voir la Disponibilité", request_whatsapp: "💬 Demander via WhatsApp",
  from_price: "à partir de", map_view_details: "Voir les détails →",
  badge_exclusive: "Exclusif", badge_live_availability: "Disponibilité en direct",

  asset_apartment: "appartement", asset_villa: "villa", asset_boat: "bateau", asset_car: "voiture", asset_scooter: "scooter",

  how_kicker: "Le Processus", how_title: "Comment ça marche",
  how_1_title: "Choisissez", how_1_desc: "Parcourez notre sélection de villas, yachts, voitures et expériences exclusives à Ibiza.",
  how_2_title: "Demandez", how_2_desc: "Envoyez une demande de disponibilité avec vos dates et les détails de votre séjour.",
  how_3_title: "Confirmez", how_3_desc: "Votre concierge dédié vous contactera sous quelques heures pour finaliser chaque détail.",
  how_4_title: "Profitez", how_4_desc: "Arrivez, détendez-vous. Nous nous occupons du reste, du check-in aux expériences à la demande.",

  collab_kicker: "Pour les Professionnels",
  collab_title: "Collaborez\navec Aura Ibiza",
  collab_desc: "Vous êtes agent immobilier, concierge professionnel ou propriétaire souhaitant promouvoir des villas, bateaux ou voitures de luxe ? Rejoignez notre réseau et atteignez une clientèle haut de gamme.",
  collab_b1: "Propriétaires de villas, appartements ou bateaux",
  collab_b2: "Concierges et agents de voyage spécialisés",
  collab_b3: "Prestataires de voitures de luxe, transferts et locations",
  collab_b4: "Organisateurs d'expériences et d'événements",
  collab_cta: "Inscrivez-vous maintenant →",
  collab_s1_title: "Visibilité Premium", collab_s1_desc: "Vos propriétés et services sont présentés à une clientèle sélectionnée à fort pouvoir d'achat.",
  collab_s2_title: "Gestion Simplifiée", collab_s2_desc: "Un tableau de bord complet pour gérer réservations, paiements et collaborateurs en un seul endroit.",
  collab_s3_title: "Réseau Professionnel", collab_s3_desc: "Rejoignez un écosystème de professionnels du luxe qui collaborent pour offrir le meilleur.",

  footer_tagline: "Luxury Concierge · Ibiza\nExpériences sur mesure pour vos\nmoments les plus spéciaux",
  footer_services: "Services", footer_s1: "Résidences de luxe", footer_s2: "Yachts & Marine", footer_s3: "Voitures & Transferts", footer_s4: "Expériences",
  footer_platform: "Plateforme", footer_login: "Connexion", footer_register: "S'inscrire", footer_collaborate: "Collaborer",
  footer_contacts: "Contact",
  footer_rights: "Tous droits réservés",

  pdf_open: "📄 Fiche PDF", pdf_loading: "Chargement…",
  available_units: "Unités disponibles", availability_heading: "Disponibilité",
  guests: "voyageurs", bedrooms: "chambres", bathrooms: "salles de bain",
  book_button: "Réserver {n} {unit} →",
  click_checkin: "Cliquez sur le jour d'arrivée pour sélectionner vos dates",
  book_whatsapp_title: "Réserver via WhatsApp",
  book_whatsapp_desc: "Écrivez-nous directement pour vérifier la disponibilité et finaliser la réservation. Réponse sous quelques heures.",
  whatsapp_write: "Écrire sur WhatsApp",
  email_alt: "✉ Ou écrivez par email",

  cal_loading: "Chargement...",
  cal_available: "Disponible", cal_booked: "Occupé", cal_selected: "Sélectionné",
  cal_nights_selected: "{n} {unit} sélectionnées",

  req_kicker: "Demande de Disponibilité",
  req_unit: "Unité",
  req_referral: "Vous réservez via le concierge {name}",
  req_name: "Nom *", req_name_ph: "Jean Dupont",
  req_guests: "Voyageurs", req_person: "personne", req_people: "personnes",
  req_email: "Email",
  req_phone: "Téléphone / WhatsApp",
  req_checkin: "Arrivée", req_checkout: "Départ",
  req_message: "Message", req_message_ph: "Demandes spéciales, questions, détails supplémentaires...",
  req_send: "Envoyer la Demande", req_sending: "Envoi en cours...",
  req_cancel: "Annuler",
  req_success_title: "Demande Envoyée !",
  req_success_desc: "Merci {name} ! Notre équipe vous contactera sous quelques heures pour confirmer la disponibilité et vous fournir tous les détails.",
  req_close: "Fermer",
  req_err_name: "Veuillez saisir votre nom.",
  req_err_contact: "Veuillez saisir un email ou un téléphone.",
  req_err_send: "Erreur lors de l'envoi. Veuillez réessayer.",

  unit_night: "nuit", unit_nights: "nuits", unit_day: "jour", unit_days: "jours",

  wa_message: "Bonjour ! Je suis intéressé(e) par *{name}*{room}.\n\nPourriez-vous m'indiquer la disponibilité ? Je recherche ces dates : ",
  email_subject: "Demande de disponibilité : {name}",
  email_body: "Bonjour,\n\nJe suis intéressé(e) par {name}{room}.\n\nJe voudrais vérifier la disponibilité pour les dates suivantes :\n\nMerci",

  month_1: "Janvier", month_2: "Février", month_3: "Mars", month_4: "Avril", month_5: "Mai", month_6: "Juin",
  month_7: "Juillet", month_8: "Août", month_9: "Septembre", month_10: "Octobre", month_11: "Novembre", month_12: "Décembre",
  day_mon: "Lu", day_tue: "Ma", day_wed: "Me", day_thu: "Je", day_fri: "Ve", day_sat: "Sa", day_sun: "Di",
};

const DICTS: Record<Lang, Dict> = { en, it, es, de, fr };

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let str = DICTS[lang]?.[key] ?? DICTS[DEFAULT_LANG][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.split(`{${k}}`).join(String(v));
  }
  return str;
}

export function monthNames(lang: Lang): string[] {
  return Array.from({ length: 12 }, (_, i) => t(lang, `month_${i + 1}`));
}

export function dayAbbrevs(lang: Lang): string[] {
  return ["day_mon", "day_tue", "day_wed", "day_thu", "day_fri", "day_sat", "day_sun"].map(k => t(lang, k));
}

const DAY_BASED_ASSETS = ["car", "scooter", "boat"];
export function isDayBasedAsset(assetType?: string): boolean {
  return !!assetType && DAY_BASED_ASSETS.includes(assetType);
}

export function unitLabel(lang: Lang, assetType: string | undefined, count: number): string {
  const day = isDayBasedAsset(assetType);
  if (day) return count === 1 ? t(lang, "unit_day") : t(lang, "unit_days");
  return count === 1 ? t(lang, "unit_night") : t(lang, "unit_nights");
}

export function unitSuffix(lang: Lang, assetType?: string): string {
  return isDayBasedAsset(assetType) ? `/${t(lang, "unit_day")}` : `/${t(lang, "unit_night")}`;
}

export function assetTypeLabel(lang: Lang, assetType?: string): string {
  const key = `asset_${assetType || "apartment"}`;
  return t(lang, key);
}

// Restituisce la descrizione della property nella lingua richiesta, con fallback
// alla descrizione originale (italiano, inserita da admin/owner) se non tradotta.
export function localizedDescription(prop: { description?: string; description_i18n?: string }, lang: Lang): string {
  if (lang === "it" || !prop.description_i18n) return prop.description || "";
  try {
    const parsed = JSON.parse(prop.description_i18n);
    return parsed?.[lang] || prop.description || "";
  } catch {
    return prop.description || "";
  }
}
