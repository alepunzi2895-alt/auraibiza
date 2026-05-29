-- Schema per Turso DB (SQLite/LibSQL)
-- Basato su SOP.md

-- Tabella Utenti (Owner / Concierge)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT UNIQUE NOT NULL,
    role TEXT CHECK(role IN ('owner', 'concierge')) NOT NULL,
    created_at INTEGER NOT NULL
);

-- Tabella Proprietà
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- Tabella Stanze
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Tabella Prezzi Mensili
CREATE TABLE IF NOT EXISTS pricing (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    month TEXT NOT NULL, -- Formato YYYY-MM
    base_price INTEGER NOT NULL,
    cleaning_fee INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Tabella Disponibilità (Calendario)
CREATE TABLE IF NOT EXISTS availability (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    date TEXT NOT NULL, -- Formato YYYY-MM-DD
    status TEXT CHECK(status IN ('available', 'blocked')) NOT NULL DEFAULT 'available',
    price_snapshot TEXT, -- Es. "100+30"
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Tabella Prenotazioni
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    concierge_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_surname TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    notes TEXT,
    owner_price_total REAL NOT NULL,
    concierge_fee REAL NOT NULL,
    total_price REAL NOT NULL,
    status TEXT CHECK(status IN ('draft', 'sent', 'confirmed_client', 'confirmed_owner')) NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (concierge_id) REFERENCES users(id)
);

-- Tabella Pagamenti
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    payer TEXT CHECK(payer IN ('client', 'owner')) NOT NULL,
    amount REAL NOT NULL,
    method TEXT,
    status TEXT NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_avail_room_date ON availability(room_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_room ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_pricing_room_month ON pricing(room_id, month);
