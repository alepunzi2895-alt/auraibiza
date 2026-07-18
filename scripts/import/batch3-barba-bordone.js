// One-off import script: Villa Barba (owner Barba) + 3 ville Francesco Bordone (owner Francesco Bordone)
// Source: Google Drive "AURA IBIZA/Ville/Barba" and ".../Francesco Bordone"
// NOTE: none of these brochures contain a price table (pure lifestyle/spec PDFs) -> prices below are
// PROVISIONAL placeholders (rough €/bedroom heuristic), clearly flagged in the description for review.
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

const PROPS = [
  {
    owner: 'barba', ownerLabel: 'Barba',
    name: 'Chalet Cala de Bou', location: 'Sant Antoni de Portmany, Ibiza',
    desc: '⚠️ PREZZO PROVVISORIO - da confermare col proprietario. Chalet moderno mediterraneo su due livelli, 3 camere, 3 bagni, piscina privata, parcheggio.',
    capacity: 6, nightly: 450, images: ['barba_1.txt', 'barba_2.txt', 'barba_3.txt', 'barba_4.txt'],
  },
  {
    owner: 'francescobordone', ownerLabel: 'Francesco Bordone',
    name: 'Villa Can Daniel', location: 'Sant Jordi de ses Salines, Ibiza',
    desc: '⚠️ PREZZO PROVVISORIO - da confermare col proprietario. Villa mediterranea, 5 camere, 3 bagni, fino a 10+2 ospiti, piscina privata, a 12 min da Ibiza Town.',
    capacity: 12, nightly: 750, images: [],
  },
  {
    owner: 'francescobordone', ownerLabel: 'Francesco Bordone',
    name: 'Villa Julieta', location: 'Ibiza',
    desc: '⚠️ PREZZO PROVVISORIO - da confermare col proprietario. Scheda PDF originale illeggibile/incompleta: dati e foto da integrare.',
    capacity: 6, nightly: 400, images: [],
  },
  {
    owner: 'francescobordone', ownerLabel: 'Francesco Bordone',
    name: 'Can Paz', location: 'Sant Josep de sa Talaia, Ibiza',
    desc: '⚠️ PREZZO PROVVISORIO - da confermare col proprietario. Residence su terreno di 2000mq, 3 camere, 3 bagni, 6 pax, piscina, a 7 min dall\'aeroporto.',
    capacity: 6, nightly: 450, images: [],
  },
];

async function createOwner(nickname, firstName) {
  const nick = nickname.toLowerCase().trim();
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE nickname = ?', args: [nick] });
  if (existing.rows.length > 0) return existing.rows[0].id;
  const id = `u${uid()}`;
  await db.execute({
    sql: "INSERT INTO users (id, nickname, role, status, first_name, created_at) VALUES (?, ?, 'owner', 'active', ?, ?)",
    args: [id, nick, firstName, Date.now()],
  });
  return id;
}

async function addProperty(ownerId, name, location, description) {
  const id = `p${uid()}`;
  await db.execute({
    sql: "INSERT INTO properties (id, owner_id, name, location, description, asset_type) VALUES (?, ?, ?, ?, ?, 'villa')",
    args: [id, ownerId, name, location, description],
  });
  return id;
}

async function addRoomWithMonthlyPricing(propertyId, name, capacity, nightly) {
  const roomId = `r${uid()}`;
  await db.execute({
    sql: "INSERT INTO rooms (id, property_id, name, capacity, description) VALUES (?, ?, ?, ?, '')",
    args: [roomId, propertyId, name, capacity],
  });
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    await db.execute({
      sql: 'INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, 0)',
      args: [`pr${uid()}`, roomId, month, nightly],
    });
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const batch = [];
    for (let day = 1; day <= lastDay; day++) {
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      batch.push({
        sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, 'available', ?)",
        args: [`av${uid()}`, roomId, date, `${nightly}+0`],
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

async function main() {
  for (const p of PROPS) {
    const ownerId = await createOwner(p.owner, p.ownerLabel);
    const propId = await addProperty(ownerId, p.name, p.location, p.desc);
    await addRoomWithMonthlyPricing(propId, p.name, p.capacity, p.nightly);
    for (const img of p.images) await addPropertyImage(propId, readImg(img));
    console.log(`Created ${p.name} (owner ${p.ownerLabel}) -> property ${propId}`);
  }
  console.log('Batch 3 (Barba + Francesco Bordone) import complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
