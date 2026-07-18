// One-off import script: Day-charter sailboats/catamarans under concierge "Blue Summer Charter Ibiza"
// Source: Google Drive "AURA IBIZA/Barche&Yachts/FLOTA IBIZA 2026.pdf" (seasonal day rates, VAT included)
// Owner_id = admin (no single private owner named); concierge collaboration = bluesummercharteribiza.
// NOTE: no photo folder for this fleet - properties created with pricing/specs only, photos to add later.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
}
loadEnvLocal();

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const uid = () => Math.random().toString(36).slice(2, 10);

// Prices are VAT-included day rates (€) as shown in the brochure. high=null means brochure said "CONSULTAR"
// (price on request) -> falls back to the mid-season rate as a placeholder estimate.
const BOATS = [
  { name: 'Janneau 40 "Sun Fizz"', capacity: 11, low: 786.5, mid: 1089, high: 1210 },
  { name: 'Oceanis 393 "Vodka"', capacity: 12, low: 786.5, mid: 1089, high: 1210 },
  { name: 'Puma 37 "Yupas"', capacity: 10, low: 786.5, mid: 968, high: 1089 },
  { name: 'Dufour 43 "Artimo"', capacity: 12, low: 1040.6, mid: 1185.8, high: 1270.5 },
  { name: 'Jeanneau Sun Odyssey 410 "4 Sail"', capacity: 12, low: 834.9, mid: 1040.6, high: 1252.4 },
  { name: 'Jeanneau Sun Odyssey 440 "Koala II"', capacity: 12, low: 968, mid: 1113.2, high: null },
  { name: 'Catamarano "Jaya"', capacity: 12, low: 1391.5, mid: 1512.5, high: 1633.5 },
  { name: 'Catamarano "Vamolon"', capacity: 12, low: 1391.5, mid: 1512.5, high: 1633.5 },
  { name: 'Lagoon 39 "Allimac"', capacity: 12, low: 1318.9, mid: 1452, high: null },
  { name: 'Lagoon 380 "Felicidad"', capacity: 12, low: 1179.8, mid: 1318.9, high: 1742.4 },
  { name: 'Bali Cat Space "Marsi"', capacity: 12, low: 1530, mid: 1669.8, high: null },
  { name: 'Lagoon 400 "Ocean Blue"', capacity: 12, low: 1252, mid: 1391.5, high: null },
  { name: 'Bali 4.0 "Ocean Grey"', capacity: 12, low: 1318.9, mid: 1452, high: null },
  { name: 'Catamarano "Flying Fish"', capacity: 12, low: 1270.5, mid: 1391.5, high: 1512.5 },
  { name: 'Lagoon 500 "Otto Mezzo"', capacity: 13, low: 1633.5, mid: 1936, high: 2178 },
];

async function getUserIdByNickname(nick) {
  const res = await db.execute({ sql: 'SELECT id FROM users WHERE nickname = ?', args: [nick.toLowerCase()] });
  return res.rows[0]?.id;
}

async function createConcierge(nickname) {
  const nick = nickname.toLowerCase().trim();
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE nickname = ?', args: [nick] });
  if (existing.rows.length > 0) return existing.rows[0].id;
  const id = `u${uid()}`;
  await db.execute({ sql: "INSERT INTO users (id, nickname, role, status, created_at) VALUES (?, ?, 'concierge', 'active', ?)", args: [id, nick, Date.now()] });
  return id;
}

async function addProperty(ownerId, name, description) {
  const id = `p${uid()}`;
  await db.execute({
    sql: "INSERT INTO properties (id, owner_id, name, location, description, asset_type) VALUES (?, ?, ?, 'San Antonio / Ibiza', ?, 'boat')",
    args: [id, ownerId, name, description],
  });
  return id;
}

async function addRoomWithMonthlyPricing(propertyId, name, capacity, monthly) {
  const roomId = `r${uid()}`;
  await db.execute({ sql: "INSERT INTO rooms (id, property_id, name, capacity, description) VALUES (?, ?, ?, ?, '')", args: [roomId, propertyId, name, capacity] });
  for (const { month, basePrice } of monthly) {
    await db.execute({ sql: 'INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, 0)', args: [`pr${uid()}`, roomId, month, Math.round(basePrice)] });
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const batch = [];
    for (let d = 1; d <= lastDay; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      batch.push({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, 'available', ?)", args: [`av${uid()}`, roomId, date, `${Math.round(basePrice)}+0`] });
    }
    if (batch.length > 0) await db.batch(batch, 'write');
  }
  return roomId;
}

async function addCollaboration(propertyId, nickname) {
  await db.execute({ sql: "INSERT INTO collaborations (id, property_id, concierge_nickname, collaborator_role) VALUES (?, ?, ?, 'concierge')", args: [uid(), propertyId, nickname.toLowerCase()] });
}

function buildMonthly(low, mid, high) {
  const now = new Date();
  const monthly = [];
  const highPrice = high ?? mid;
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mm = d.getMonth() + 1;
    const price = (mm === 7 || mm === 8) ? highPrice : (mm === 6 || mm === 9) ? mid : low;
    monthly.push({ month: `${d.getFullYear()}-${String(mm).padStart(2, '0')}`, basePrice: price });
  }
  return monthly;
}

async function main() {
  const ownerId = await getUserIdByNickname('alessandro');
  const conciergeId = await createConcierge('bluesummercharteribiza');
  console.log('Owner (admin) id:', ownerId, '- Concierge id:', conciergeId);

  for (const b of BOATS) {
    const note = b.high === null ? '⚠️ Tariffa alta stagione non specificata nel listino (era "consultar") - qui usata la tariffa media come stima, da confermare. ' : '';
    const desc = `${note}Charter giornaliero a vela/catamarano. Concierge: Blue Summer Charter Ibiza. Foto da caricare.`;
    const propId = await addProperty(ownerId, b.name, desc);
    const monthly = buildMonthly(b.low, b.mid, b.high);
    await addRoomWithMonthlyPricing(propId, b.name, b.capacity, monthly);
    await addCollaboration(propId, 'bluesummercharteribiza');
    console.log(`Created ${b.name} -> property ${propId}`);
  }
  console.log('Batch 5 (Blue Summer Charter Ibiza) import complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
