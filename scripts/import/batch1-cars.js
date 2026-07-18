// Rebuild batch 1: replace the wrong (generic city-car) fleet with the real Luxury Rent Car V23
// fleet, as given directly by the client (brand + model + day rate in EUR).
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

const VEHICLES = [
  { name: 'Mercedes-Benz G63 Brabus', capacity: 5, price: 900 },
  { name: 'BMW M4', capacity: 4, price: 600 },
  { name: 'Mercedes-AMG E43', capacity: 5, price: 600 },
  { name: 'Audi RS3', capacity: 5, price: 600 },
  { name: 'Lamborghini Urus', capacity: 5, price: 1100 },
  { name: 'Lamborghini Urus Performante', capacity: 5, price: 1300 },
  { name: 'Ford Mustang', capacity: 4, price: 550 },
  { name: 'Audi RS Q8', capacity: 5, price: 900 },
  { name: 'Audi Q8', capacity: 5, price: 580 },
  { name: 'Audi Q7', capacity: 7, price: 550 },
  { name: 'Ferrari 488', capacity: 2, price: 1300 },
];

async function deleteOldFleet(ownerId) {
  const props = await db.execute({ sql: 'SELECT id FROM properties WHERE owner_id = ?', args: [ownerId] });
  for (const p of props.rows) {
    const rooms = await db.execute({ sql: 'SELECT id FROM rooms WHERE property_id = ?', args: [p.id] });
    for (const r of rooms.rows) {
      await db.execute({ sql: 'DELETE FROM availability WHERE room_id = ?', args: [r.id] });
      await db.execute({ sql: 'DELETE FROM pricing WHERE room_id = ?', args: [r.id] });
      await db.execute({ sql: 'DELETE FROM rooms WHERE id = ?', args: [r.id] });
    }
    await db.execute({ sql: 'DELETE FROM collaborations WHERE property_id = ?', args: [p.id] });
    await db.execute({ sql: 'DELETE FROM properties WHERE id = ?', args: [p.id] });
    console.log('Deleted old property', p.id);
  }
}

async function addProperty(ownerId, name) {
  const id = `p${uid()}`;
  await db.execute({
    sql: "INSERT INTO properties (id, owner_id, name, location, description, asset_type) VALUES (?, ?, ?, 'Ibiza', '', 'car')",
    args: [id, ownerId, name],
  });
  return id;
}

async function addRoomWithFlatPricing(propertyId, name, capacity, price) {
  const roomId = `r${uid()}`;
  await db.execute({ sql: "INSERT INTO rooms (id, property_id, name, capacity, description) VALUES (?, ?, ?, ?, '')", args: [roomId, propertyId, name, capacity] });
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    await db.execute({ sql: 'INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, 0)', args: [`pr${uid()}`, roomId, month, price] });
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const batch = [];
    for (let day = 1; day <= lastDay; day++) {
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      batch.push({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, 'available', ?)", args: [`av${uid()}`, roomId, date, `${price}+0`] });
    }
    if (batch.length > 0) await db.batch(batch, 'write');
  }
}

async function main() {
  const ownerRes = await db.execute({ sql: "SELECT id FROM users WHERE nickname = 'luxuryrentcarv23'" });
  const ownerId = ownerRes.rows[0].id;
  await deleteOldFleet(ownerId);
  for (const v of VEHICLES) {
    const propId = await addProperty(ownerId, v.name);
    await addRoomWithFlatPricing(propId, v.name, v.capacity, v.price);
    console.log(`Created ${v.name} (€${v.price}/giorno) -> property ${propId}`);
  }
  console.log('Car fleet rebuild complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
