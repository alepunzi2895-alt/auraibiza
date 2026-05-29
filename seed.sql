-- Seed dati iniziali per LuXy Experience

-- Utenti
INSERT OR IGNORE INTO users (id, nickname, role, created_at) VALUES 
('u1', 'alessandro', 'owner', strftime('%s', 'now') * 1000),
('u2', 'silvia', 'concierge', strftime('%s', 'now') * 1000);

-- Proprietà
INSERT OR IGNORE INTO properties (id, owner_id, name, location) VALUES 
('p1', 'u1', 'Casa Marina', 'Ibiza, Playa d''en Bossa');

-- Stanze
INSERT OR IGNORE INTO rooms (id, property_id, name, capacity) VALUES 
('r1', 'p1', 'Dandelion Marina Suite', 2),
('r2', 'p1', 'Velero Room', 2),
('r3', 'p1', 'Frangipani Room', 3);

-- Pricing (Esempio Giugno, Luglio, Agosto 2026)
INSERT OR IGNORE INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES 
('pr1', 'r1', '2026-06', 120, 40),
('pr2', 'r1', '2026-07', 180, 40),
('pr3', 'r1', '2026-08', 200, 40),
('pr4', 'r2', '2026-06', 90, 30),
('pr5', 'r2', '2026-07', 140, 30),
('pr6', 'r2', '2026-08', 160, 30),
('pr7', 'r3', '2026-06', 100, 35),
('pr8', 'r3', '2026-07', 150, 35),
('pr9', 'r3', '2026-08', 170, 35);
