// One-off import script: Yacht fleet under concierge "Classy Ibiza"
// Source: Google Drive "AURA IBIZA/Barche&Yachts" brochure PDFs (day-charter rates per season where found).
// Owner_id = admin (no single private owner named for the fleet); concierge collaboration = classyibiza.
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
const IMG_DIR = '/private/tmp/claude-503/-Users-zeroday-Documents-auraibiza/bea5ca05-619e-4050-bf74-20aa7d132974/scratchpad/import';
const readImg = (f) => fs.readFileSync(path.join(IMG_DIR, f), 'utf8');

// low = May & Oct, mid = Jun & Sep, high = Jul & Aug (from brochure "Prices" sections). Boats without a
// found rate table use a PROVISIONAL placeholder, clearly flagged in the description.
const BOATS = [
  { name: 'Nomad (Mangusta 108)', capacity: 12, low: 12250, mid: 13750, high: 15450, provisional: false, images: [] },
  { name: 'Triniti (Mangusta 108)', capacity: 12, low: 12950, mid: 13950, high: 14950, provisional: false, images: ['triniti_1.txt'] },
  { name: 'Chill Out (Mangusta 92)', capacity: 12, low: 6950, mid: 8950, high: 9950, provisional: false, images: ['chillout_1.txt'] },
  { name: 'Bliss (Princess V72)', capacity: 12, low: 4500, mid: 5950, high: 6950, provisional: false, images: ['bliss_1.txt'] },
  { name: 'Hanstaiger X1', capacity: 12, low: 6250, mid: 7850, high: 8950, provisional: false, images: ['hanstaigerx1_1.txt'] },
  { name: 'Alfamarine 78 (My Nina)', capacity: 12, low: 4900, mid: 5900, high: 6900, provisional: false, images: [] },
  { name: 'Pershing 90 (My Danzas)', capacity: 12, low: 8000, mid: 9500, high: 11900, provisional: false, images: [] },
  { name: 'Pershing 80 Wahoo', capacity: 12, low: 6800, mid: 8000, high: 10000, provisional: true, images: ['wahoo_1.txt'] },
  { name: 'Dr. No (Pershing 6X)', capacity: 10, low: 2500, mid: 3000, high: 3500, provisional: true, images: [] },
  { name: 'Sensation (Pershing 72)', capacity: 12, low: 5000, mid: 6000, high: 7000, provisional: true, images: [] },
  // De Antonio open ribs (day-boats), explicit monthly rates from their own brochures
  { name: 'De Antonio D32 - Dandy II', capacity: 10, monthly: { '05': 950, '06': 1050, '07': 1300, '08': 1300, '09': 950, '10': 950 }, provisional: false, images: [] },
  { name: 'De Antonio D36 - Dandy III', capacity: 12, monthly: { '05': 1150, '06': 1300, '07': 1500, '08': 1500, '09': 1150, '10': 1150 }, provisional: false, images: [] },
  { name: 'De Antonio D36 - Lupo di Mare', capacity: 12, monthly: { '05': 1150, '06': 1300, '07': 1500, '08': 1500, '09': 1150, '10': 1150 }, provisional: false, images: [] },
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
    sql: "INSERT INTO properties (id, owner_id, name, location, description, asset_type) VALUES (?, ?, ?, 'Marina Botafoch / Ibiza', ?, 'boat')",
    args: [id, ownerId, name, description],
  });
  return id;
}

async function addRoomWithMonthlyPricing(propertyId, name, capacity, monthly) {
  const roomId = `r${uid()}`;
  await db.execute({ sql: "INSERT INTO rooms (id, property_id, name, capacity, description) VALUES (?, ?, ?, ?, '')", args: [roomId, propertyId, name, capacity] });
  for (const { month, basePrice } of monthly) {
    await db.execute({ sql: 'INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, 0)', args: [`pr${uid()}`, roomId, month, basePrice] });
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const batch = [];
    for (let d = 1; d <= lastDay; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      batch.push({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, 'available', ?)", args: [`av${uid()}`, roomId, date, `${basePrice}+0`] });
    }
    if (batch.length > 0) await db.batch(batch, 'write');
  }
  return roomId;
}

async function addCollaboration(propertyId, nickname) {
  await db.execute({ sql: "INSERT INTO collaborations (id, property_id, concierge_nickname, collaborator_role) VALUES (?, ?, ?, 'concierge')", args: [uid(), propertyId, nickname.toLowerCase()] });
}

async function addPropertyImage(propertyId, base64) {
  const existing = await db.execute({ sql: 'SELECT image FROM properties WHERE id = ?', args: [propertyId] });
  let images = [];
  const current = existing.rows[0]?.image;
  if (current) { try { images = current.startsWith('[') ? JSON.parse(current) : [current]; } catch (_e) { images = [current]; } }
  images.push(base64);
  await db.execute({ sql: 'UPDATE properties SET image = ? WHERE id = ?', args: [JSON.stringify(images), propertyId] });
}

function buildMonthlyFromSeason(low, mid, high) {
  const now = new Date();
  const monthly = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mm = d.getMonth() + 1;
    const price = (mm === 7 || mm === 8) ? high : (mm === 6 || mm === 9) ? mid : low;
    monthly.push({ month: `${d.getFullYear()}-${String(mm).padStart(2, '0')}`, basePrice: price });
  }
  return monthly;
}

function buildMonthlyFromTable(table) {
  const now = new Date();
  const monthly = [];
  const fallback = table['10'] ?? Object.values(table)[0];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const price = table[mm] !== undefined ? table[mm] : fallback;
    monthly.push({ month: `${d.getFullYear()}-${mm}`, basePrice: price });
  }
  return monthly;
}

async function main() {
  const ownerId = await getUserIdByNickname('alessandro');
  const conciergeId = await createConcierge('classyibiza');
  console.log('Owner (admin) id:', ownerId, '- Concierge id:', conciergeId);

  for (const b of BOATS) {
    const provisionalNote = b.provisional ? '⚠️ PREZZO PROVVISORIO - nessuna tariffa trovata nella brochure, da confermare col concierge. ' : '';
    const photoNote = b.images.length === 0 ? 'Foto da caricare. ' : '';
    const desc = `${provisionalNote}${photoNote}Charter giornaliero. Concierge: Classy Ibiza.`;
    const propId = await addProperty(ownerId, b.name, desc);
    const monthly = b.monthly ? buildMonthlyFromTable(b.monthly) : buildMonthlyFromSeason(b.low, b.mid, b.high);
    await addRoomWithMonthlyPricing(propId, b.name, b.capacity, monthly);
    await addCollaboration(propId, 'classyibiza');
    for (const img of b.images) await addPropertyImage(propId, readImg(img));
    console.log(`Created ${b.name} -> property ${propId}`);
  }
  console.log('Batch 4 (Yacht Classy Ibiza) import complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
