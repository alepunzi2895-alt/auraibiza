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

async function main() {
  const ownerRes = await db.execute({ sql: "SELECT id FROM users WHERE nickname = 'alessandro'" });
  const ownerId = ownerRes.rows[0].id;
  const propId = `p${uid()}`;
  await db.execute({
    sql: "INSERT INTO properties (id, owner_id, name, location, description, asset_type) VALUES (?, ?, ?, ?, ?, 'apartment')",
    args: [propId, ownerId, 'Appartamento Santa Eulària', "Santa Eulària des Riu, Ibiza", "⚠️ PREZZO PROVVISORIO e proprietario da assegnare - nessun documento prezzi trovato nella cartella Drive. Da rivedere."],
  });
  const roomId = `r${uid()}`;
  await db.execute({ sql: "INSERT INTO rooms (id, property_id, name, capacity, description) VALUES (?, ?, 'Appartamento Santa Eulària', 4, '')", args: [roomId, propId] });
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    await db.execute({ sql: 'INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, 180, 0)', args: [`pr${uid()}`, roomId, month] });
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const batch = [];
    for (let day = 1; day <= lastDay; day++) {
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      batch.push({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, 'available', '180+0')", args: [`av${uid()}`, roomId, date] });
    }
    if (batch.length > 0) await db.batch(batch, 'write');
  }
  for (const f of ['eularia_1.txt', 'eularia_2.txt', 'eularia_3.txt', 'eularia_4.txt']) {
    const existing = await db.execute({ sql: 'SELECT image FROM properties WHERE id = ?', args: [propId] });
    let images = [];
    const current = existing.rows[0]?.image;
    if (current) { try { images = current.startsWith('[') ? JSON.parse(current) : [current]; } catch (_e) { images = [current]; } }
    images.push(readImg(f));
    await db.execute({ sql: 'UPDATE properties SET image = ? WHERE id = ?', args: [JSON.stringify(images), propId] });
  }
  console.log('Created Appartamento Santa Eulària -> property', propId);
}
main().catch(e => { console.error(e); process.exit(1); });
