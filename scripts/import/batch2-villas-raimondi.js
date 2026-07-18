// One-off import script: Ville "Raimondi Brothers" (concierge collab, no single private owner)
// Source: Google Drive "AURA IBIZA/Ville/Kevin/RATES COLLAB IBIZA 2026.xlsx" (weekly rates, Jul-Oct 2026)
// Owner_id = admin (no private owner named); concierge collaboration = raimondibrothers.
// NOTE: no photo folders found for these 19 villas (only PDF brochures, too large to embed as base64) -
// properties are created with pricing/description only; photos to be added later via the admin panel.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const uid = () => Math.random().toString(36).slice(2, 10);

// [rooms, priceJul, priceAug, priceSep, priceOct (weekly EUR), depositEUR]
const VILLAS = [
  { name: 'Can Romero', rooms: 2, weekly: { '07': 5600, '08': 5600, '09': 4200, '10': 2800 }, deposit: 1500 },
  { name: 'Villa Perla', rooms: 5, weekly: { '07': 25000, '08': 25000, '09': 20000, '10': 15000 }, deposit: 3000 },
  { name: 'Villa Mar', rooms: 4, weekly: { '07': 14000, '08': 14000, '09': 12500, '10': 11500 }, deposit: 1500 },
  { name: 'Villa Flora', rooms: 5, weekly: { '07': 14000, '08': 14000, '09': 13000, '10': 12500 }, deposit: 2500 },
  { name: 'Villa Taris', rooms: 5, weekly: { '07': 14000, '08': 14000, '09': 12500, '10': 11500 }, deposit: 3000 },
  { name: 'Can Julia', rooms: 4, weekly: { '07': 12000, '08': 12000, '09': 10000, '10': 9000 }, deposit: 2500 },
  { name: 'Villa Neutra', rooms: 6, weekly: { '07': 15000, '08': 15000, '09': 14000, '10': 13000 }, deposit: 4000 },
  { name: 'Villa Ocean', rooms: 7, weekly: { '07': 17000, '08': 17000, '09': 15000, '10': 12000 }, deposit: 3000 },
  { name: 'Villa Roca', rooms: 4, weekly: { '07': 15000, '08': 16000, '09': 12000, '10': 11000 }, deposit: 3000 },
  { name: 'Can Esmeralda', rooms: 5, weekly: { '07': 16000, '08': 16000, '09': 14000, '10': 12000 }, deposit: 3000 },
  { name: 'Villa Cora', rooms: 4, weekly: { '07': 17000, '08': 17000, '09': 11000, '10': 11000 }, deposit: 3000 },
  { name: 'Villa Wave (già Villa Martinet)', rooms: 5, weekly: { '07': 40000, '08': 40000, '09': 29000, '10': 26000 }, deposit: 3000 },
  { name: 'Villa Bonit', rooms: 6, weekly: { '07': 14000, '08': 14000, '09': 12000, '10': 10500 }, deposit: 3000 },
  { name: 'Villa Torre', rooms: 5, weekly: { '07': 16000, '08': 17000, '09': 14500, '10': 14500 }, deposit: 3000 },
  { name: 'Can Lima', rooms: 10, weekly: { '07': 50000, '08': 50000, '09': 50000, '10': 50000 }, deposit: 5000 },
  { name: 'Villa Rock', rooms: 6, weekly: { '07': 26000, '08': 26000, '09': 23000, '10': 20000 }, deposit: 3000 },
  { name: 'Can Riera', rooms: 10, weekly: { '07': 30000, '08': 30000, '09': 25000, '10': 25000 }, deposit: 5000 },
  { name: 'Villa Lux', rooms: 5, weekly: { '07': 40000, '08': 40000, '09': 35000, '10': 35000 }, deposit: 5000 },
  { name: 'Villa Moli', rooms: 5, weekly: { '07': 10000, '08': 11000, '09': 10000, '10': 8500 }, deposit: 2000 },
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
  await db.execute({
    sql: "INSERT INTO users (id, nickname, role, status, created_at) VALUES (?, ?, 'concierge', 'active', ?)",
    args: [id, nick, Date.now()],
  });
  return id;
}

async function addProperty(ownerId, name, location, description, assetType) {
  const id = `p${uid()}`;
  await db.execute({
    sql: 'INSERT INTO properties (id, owner_id, name, location, description, asset_type) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, ownerId, name, location, description, assetType],
  });
  return id;
}

async function addRoomWithMonthlyPricing(propertyId, name, capacity, description, monthly) {
  const roomId = `r${uid()}`;
  await db.execute({
    sql: 'INSERT INTO rooms (id, property_id, name, capacity, description) VALUES (?, ?, ?, ?, ?)',
    args: [roomId, propertyId, name, capacity, description],
  });
  for (const { month, basePrice, cleaningFee } of monthly) {
    await db.execute({
      sql: 'INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, ?)',
      args: [`pr${uid()}`, roomId, month, basePrice, cleaningFee],
    });
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const batch = [];
    for (let d = 1; d <= lastDay; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      batch.push({
        sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, 'available', ?)",
        args: [`av${uid()}`, roomId, date, `${basePrice}+${cleaningFee}`],
      });
    }
    if (batch.length > 0) await db.batch(batch, 'write');
  }
  return roomId;
}

async function addCollaboration(propertyId, nickname) {
  await db.execute({
    sql: "INSERT INTO collaborations (id, property_id, concierge_nickname, collaborator_role) VALUES (?, ?, ?, 'concierge')",
    args: [uid(), propertyId, nickname.toLowerCase()],
  });
}

function buildMonthly(weekly) {
  const now = new Date();
  const monthly = [];
  // nightly rate = weekly / 7, rounded; fallback to October's (last known / lowest) nightly rate
  const nightlyByMonth = {};
  for (const [mm, wk] of Object.entries(weekly)) nightlyByMonth[mm] = Math.round(wk / 7);
  const fallback = nightlyByMonth['10'];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const price = nightlyByMonth[mm] !== undefined ? nightlyByMonth[mm] : fallback;
    monthly.push({ month: `${d.getFullYear()}-${mm}`, basePrice: price, cleaningFee: 0 });
  }
  return monthly;
}

async function main() {
  const ownerId = await getUserIdByNickname('alessandro'); // admin - no single private owner for this group
  if (!ownerId) throw new Error('admin user "alessandro" not found');
  const conciergeId = await createConcierge('raimondibrothers');
  console.log('Owner (admin) id:', ownerId, '- Concierge id:', conciergeId);

  for (const v of VILLAS) {
    const desc = `Cauzione/deposito: ${v.deposit.toLocaleString('it-IT')} €. Prezzi settimanali reali lug-ott 2026 convertiti a tariffa/notte; nov-giu stimati sulla tariffa di ottobre (da rivedere). Foto da caricare.`;
    const propId = await addProperty(ownerId, v.name, 'Ibiza', desc, 'villa');
    const monthly = buildMonthly(v.weekly);
    await addRoomWithMonthlyPricing(propId, v.name, v.rooms * 2, `${v.rooms} camere`, monthly);
    await addCollaboration(propId, 'raimondibrothers');
    console.log(`Created ${v.name} -> property ${propId}`);
  }

  console.log('Batch 2 (Ville Raimondi Brothers) import complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
