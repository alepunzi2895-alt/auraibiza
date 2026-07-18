// One-off import: set ical_url for the villas the client provided calendars for,
// then run a first sync (fetch .ics, parse VEVENT DTSTART/DTEND, block those dates).
// Mirrors the logic in syncRoomIcal()/parseICSEvents() in src/app/actions.ts.
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

const CALENDARS = {
  'Can Esmeralda': 'https://calendar.google.com/calendar/ical/d6990eedc10fd69f25c20ba3a3a4e2eec0044f8688d5b27db40f10b44dba6b73%40group.calendar.google.com/public/basic.ics',
  'Can Julia': 'https://calendar.google.com/calendar/ical/2a4a21c142e8f795f34a5553ef140f1d95b949f9281409cc9f09c23dc746ffa1%40group.calendar.google.com/public/basic.ics',
  'Can Lima': 'https://calendar.google.com/calendar/ical/e985e5d8ec569763fc95aae38d73188831383bc15a971fac1ae052eeae9e78c7%40group.calendar.google.com/public/basic.ics',
  'Can Riera': 'https://calendar.google.com/calendar/ical/bf918096067e74876a4f2e998d7cb5b2ade02516703f288f7ac93dae33d978d8%40group.calendar.google.com/public/basic.ics',
  'Can Romero': 'https://calendar.google.com/calendar/ical/f37f6545c7505db0bdfbfa54ee94c0dfee80639800d0754c3f17c865c3e9de16%40group.calendar.google.com/public/basic.ics',
  'Villa Lux': 'https://calendar.google.com/calendar/ical/28ec2592cd78c8d15b0cf55fd5234753fabba8b2b63b9e72d82f03708580bbab%40group.calendar.google.com/public/basic.ics',
  'Villa Bonit': 'https://calendar.google.com/calendar/ical/2c8b1dd4987b60dd036ebe082061112ed26147008e06d06512fe40332e46c532%40group.calendar.google.com/public/basic.ics',
  'Villa Cora': 'https://calendar.google.com/calendar/ical/7a48b3fbaf1020d84b261c4637f99b5ca6a16a0d501cd9221f61c796620fd463%40group.calendar.google.com/public/basic.ics',
  'Villa Flora': 'https://calendar.google.com/calendar/ical/55b6f07e32ffb5b70fc598247b83ec6365cec1727175e5b95c75c915d196949b%40group.calendar.google.com/public/basic.ics',
  'Villa Mar': 'https://calendar.google.com/calendar/ical/b72decd152589a2bdc7684a05d2f6429bcaea1656aa87f507aa5c65713266acb%40group.calendar.google.com/public/basic.ics',
  'Villa Wave (già Villa Martinet)': 'https://calendar.google.com/calendar/ical/cb8bfa51548c96470d24532abc268ccc9ea6774a6f96dc14378876106140dbad%40group.calendar.google.com/public/basic.ics',
  'Villa Neutra': 'https://calendar.google.com/calendar/ical/ae26e621777aaa147112115c2b6b3fb78322abbe46a060bba3c476dd55923635%40group.calendar.google.com/public/basic.ics',
  'Villa Ocean': 'https://calendar.google.com/calendar/ical/b1ae06258fdc1af142b7d5fce2e99f423d7a237008932f5afd81d56032ce80c8%40group.calendar.google.com/public/basic.ics',
  'Villa Perla': 'https://calendar.google.com/calendar/ical/8536f0ef65f152fd1028ed7216dae7c345e6b3dd2424388358aaa40c76ad7870%40group.calendar.google.com/public/basic.ics',
  'Villa Roca': 'https://calendar.google.com/calendar/ical/bf769e81f70c54fc3049f6051a9386e63159a07e9f8bc154c65946531e6aa82f%40group.calendar.google.com/public/basic.ics',
  'Villa Taris': 'https://calendar.google.com/calendar/ical/349eafe7e03a997dfda7af8d1e467680ec0f722e9927642f7fe5b3daab2f2aa6%40group.calendar.google.com/public/basic.ics',
  'Villa Torre': 'https://calendar.google.com/calendar/ical/5f959f951ceb59565246f70c5aee4c52980c30c6d0393387f3a56302838baba5%40group.calendar.google.com/public/basic.ics',
  'Villa Moli': 'https://calendar.google.com/calendar/ical/60e21b8131efe98a1638b7ccc9e995a3af131e6f25550744bfeb235419764aed%40group.calendar.google.com/public/basic.ics',
};

function parseICSEvents(icsText) {
  const events = [];
  const toIsoDate = (raw) => {
    const m = raw.match(/(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  };
  const veventBlocks = icsText.split('BEGIN:VEVENT').slice(1);
  for (const block of veventBlocks) {
    const dtStartMatch = block.match(/DTSTART[^:\r\n]*:([^\r\n]+)/);
    const dtEndMatch = block.match(/DTEND[^:\r\n]*:([^\r\n]+)/);
    if (!dtStartMatch || !dtEndMatch) continue;
    const start = toIsoDate(dtStartMatch[1]);
    const end = toIsoDate(dtEndMatch[1]);
    if (start && end) events.push({ start, end });
  }
  return events;
}

function addDaysIso(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function syncRoom(roomId, icalUrl, label) {
  await db.execute({ sql: 'UPDATE rooms SET ical_url = ? WHERE id = ?', args: [icalUrl, roomId] });
  const res = await fetch(icalUrl);
  if (!res.ok) { console.log(`  FAIL ${label}: HTTP ${res.status}`); return; }
  const icsText = await res.text();
  const events = parseICSEvents(icsText);

  await db.execute({ sql: "UPDATE availability SET status = 'available', blocked_source = NULL WHERE room_id = ? AND blocked_source = 'ical'", args: [roomId] });

  let blockedCount = 0;
  for (const ev of events) {
    let d = ev.start;
    while (d < ev.end) {
      const existing = await db.execute({ sql: 'SELECT id FROM availability WHERE room_id = ? AND date = ?', args: [roomId, d] });
      if (existing.rows.length > 0) {
        await db.execute({ sql: "UPDATE availability SET status = 'blocked', blocked_source = 'ical' WHERE room_id = ? AND date = ?", args: [roomId, d] });
      } else {
        await db.execute({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot, blocked_source) VALUES (?, ?, ?, 'blocked', '0+0', 'ical')", args: [uid(), roomId, d] });
      }
      blockedCount++;
      d = addDaysIso(d, 1);
    }
  }
  await db.execute({ sql: 'UPDATE rooms SET ical_last_synced = ? WHERE id = ?', args: [Date.now(), roomId] });
  console.log(`  OK ${label}: ${events.length} eventi, ${blockedCount} date bloccate`);
}

async function main() {
  for (const [name, url] of Object.entries(CALENDARS)) {
    const roomRes = await db.execute({ sql: "SELECT r.id FROM rooms r JOIN properties p ON r.property_id = p.id WHERE p.name = ?", args: [name] });
    if (roomRes.rows.length === 0) { console.log(`SKIP ${name}: proprietà non trovata nel DB`); continue; }
    const roomId = roomRes.rows[0].id;
    try {
      await syncRoom(roomId, url, name);
    } catch (e) {
      console.log(`  ERROR ${name}:`, e.message);
    }
  }
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
