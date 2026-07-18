// One-off import script: Auto&Scooter fleet "Luxury Rent Car V23"
// Source: Google Drive "AURA IBIZA/Auto&Scooter/Luxury Rent Car V23/aura ibiza listino 2026.pdf"
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
const IMG_DIR = '/private/tmp/claude-503/-Users-zeroday-Documents-auraibiza/bea5ca05-619e-4050-bf74-20aa7d132974/scratchpad/import';
const readImg = (f) => fs.readFileSync(path.join(IMG_DIR, f), 'utf8');

// Monthly day-rates from "aura ibiza listino 2026.pdf" (Mag-Ott). Nov-Apr use the lowest listed
// rate for that vehicle as a placeholder (no data available for those months) - flagged for review.
const VEHICLES = [
  { name: 'Fiat Panda (manuale)', type: 'car', capacity: 4, images: ['panda_1.txt', 'panda_2.txt'],
    rates: { '05': 50, '06': 60, '07': 70, '08': 80, '09': 55, '10': 50 }, fallback: 50 },
  { name: 'Fiat 500X (manuale)', type: 'car', capacity: 5, images: ['500xm_1.txt', '500xm_2.txt'],
    rates: { '05': 60, '06': 70, '07': 80, '08': 90, '09': 75, '10': 65 }, fallback: 60 },
  { name: 'Fiat 500X (automatico)', type: 'car', capacity: 5, images: ['500xa_1.txt', '500xa_2.txt'],
    rates: { '05': 70, '06': 80, '07': 90, '08': 100, '09': 85, '10': 70 }, fallback: 70 },
  { name: 'Smart (automatico)', type: 'car', capacity: 2, images: ['smart_1.txt', 'smart_2.txt'],
    rates: { '05': 60, '06': 70, '07': 80, '08': 90, '09': 75, '10': 60 }, fallback: 60 },
  { name: 'Citroën C3 (manuale)', type: 'car', capacity: 5, images: ['c3_1.txt', 'c3_2.txt'],
    rates: { '05': 60, '06': 70, '07': 80, '08': 90, '09': 65, '10': 55 }, fallback: 55 },
  { name: 'Scooter 125 (automatico)', type: 'scooter', capacity: 2, images: ['scooter_1.txt', 'scooter_2.txt'],
    rates: { '06': 32.5, '07': 37.5, '08': 45, '09': 32.5, '10': 30 }, fallback: 30 },
];

async function createOwner(nickname, role) {
  const nick = nickname.toLowerCase().trim();
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE nickname = ?', args: [nick] });
  if (existing.rows.length > 0) return existing.rows[0].id;
  const id = `u${uid()}`;
  await db.execute({
    sql: "INSERT INTO users (id, nickname, role, status, created_at) VALUES (?, ?, ?, 'active', ?)",
    args: [id, nick, role, Date.now()],
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

async function addPropertyImage(propertyId, base64) {
  const existing = await db.execute({ sql: 'SELECT image FROM properties WHERE id = ?', args: [propertyId] });
  let images = [];
  const current = existing.rows[0]?.image;
  if (current) { try { images = current.startsWith('[') ? JSON.parse(current) : [current]; } catch (_e) { images = [current]; } }
  images.push(base64);
  await db.execute({ sql: 'UPDATE properties SET image = ? WHERE id = ?', args: [JSON.stringify(images), propertyId] });
}

function buildMonthly(rates, fallback, cleaningFee = 0) {
  const now = new Date();
  const monthly = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const price = rates[mm] !== undefined ? rates[mm] : fallback;
    monthly.push({ month: `${d.getFullYear()}-${mm}`, basePrice: price, cleaningFee });
  }
  return monthly;
}

async function main() {
  const ownerId = await createOwner('luxuryrentcarv23', 'owner');
  console.log('Owner id:', ownerId);

  for (const v of VEHICLES) {
    const propId = await addProperty(ownerId, v.name, 'Ibiza - Luxury Rent Car V23', 'Noleggio giornaliero, ritiro/consegna a Ibiza.', v.type);
    const monthly = buildMonthly(v.rates, v.fallback);
    await addRoomWithMonthlyPricing(propId, v.name, v.capacity, '', monthly);
    for (const imgFile of v.images) {
      await addPropertyImage(propId, readImg(imgFile));
    }
    console.log(`Created ${v.name} -> property ${propId}`);
  }

  console.log('Batch 1 (Auto&Scooter) import complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
