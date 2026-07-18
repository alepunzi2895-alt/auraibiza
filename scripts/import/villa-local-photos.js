// Load villa photos from local folders the user placed in ~/Downloads/files/
// (bypasses Google Drive's 10MB download limit). Folders contain PDF-page
// renders as .ppm (raw Netpbm P6, no external tool available to decode them —
// sharp/libvips in this environment was built without PPM support) and some
// plain .jpg files. We parse PPM headers ourselves and feed the raw pixel
// buffer into sharp via {raw:{width,height,channels:3}}.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@libsql/client');
const sharp = require('sharp');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
}
loadEnvLocal();
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const BASE = path.join(os.homedir(), 'Downloads', 'files');

const FOLDER_TO_DBNAME = {
  'CAN JULIA': 'Can Julia',
  'CAN LIMA': 'Can Lima',
  'CAN RIERA': 'Can Riera',
  'VILLA BONIT': 'Villa Bonit',
  'VILLA LUX': 'Villa Lux',
  'VILLA PERLA': 'Villa Perla',
  'VILLA ROCA': 'Villa Roca',
  'VILLA ROCK': 'Villa Rock',
  'VILLA TORRE': 'Villa Torre',
};

function parsePPM(buf) {
  let pos = 0;
  function readToken() {
    while (true) {
      while (buf[pos] === 0x20 || buf[pos] === 0x0a || buf[pos] === 0x09 || buf[pos] === 0x0d) pos++;
      if (buf[pos] === 0x23) { while (buf[pos] !== 0x0a) pos++; continue; }
      break;
    }
    const start = pos;
    while (buf[pos] !== 0x20 && buf[pos] !== 0x0a && buf[pos] !== 0x09 && buf[pos] !== 0x0d) pos++;
    return buf.slice(start, pos).toString('ascii');
  }
  const magic = readToken();
  if (magic !== 'P6') throw new Error('not P6: ' + magic);
  const width = parseInt(readToken(), 10);
  const height = parseInt(readToken(), 10);
  readToken(); // maxval
  pos++;
  const data = buf.slice(pos, pos + width * height * 3);
  return { width, height, data };
}

function naturalSort(a, b) {
  const na = parseInt(a.match(/_(\d+)\./)?.[1] || '0', 10);
  const nb = parseInt(b.match(/_(\d+)\./)?.[1] || '0', 10);
  return na - nb;
}

async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let pipeline;
  if (ext === '.ppm') {
    const buf = fs.readFileSync(filePath);
    const { width, height, data } = parsePPM(buf);
    pipeline = sharp(data, { raw: { width, height, channels: 3 } });
  } else {
    pipeline = sharp(filePath);
  }
  // trim solid-color borders left over from PDF-page rendering (black/white bars)
  const trimmed = pipeline.trim({ threshold: 15 });
  const stats = await trimmed.clone().stats();
  const [r, g, b] = stats.channels;
  const meanAll = (r.mean + g.mean + b.mean) / 3;
  const spread = Math.max(r.mean, g.mean, b.mean) - Math.min(r.mean, g.mean, b.mean);
  // likely a text page / floor plan / blank cover: near-white or near-flat-gray, low color spread
  const looksBlank = meanAll > 235 && spread < 12;
  const buffer = await trimmed.resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  const heroScore = (b.mean - r.mean) + spread * 0.5; // favor blue (sea/pool) + vividness
  return { buffer, looksBlank, heroScore };
}

async function main() {
  const only = process.argv[2]; // optional: run a single folder for testing
  for (const [folder, dbName] of Object.entries(FOLDER_TO_DBNAME)) {
    if (only && folder !== only) continue;
    const dir = path.join(BASE, folder);
    const files = fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|ppm)$/i.test(f)).sort(naturalSort);
    console.log(`\n=== ${folder} -> "${dbName}" (${files.length} files) ===`);
    const results = [];
    for (const f of files) {
      try {
        const r = await processFile(path.join(dir, f));
        if (r.looksBlank) { console.log('  skip (blank/text page):', f); continue; }
        results.push({ file: f, ...r });
      } catch (e) {
        console.log('  FAIL', f, e.message);
      }
    }
    if (results.length === 0) { console.log('  no usable images, skipping DB update'); continue; }
    results.sort((a, b) => b.heroScore - a.heroScore);
    const hero = results[0];
    const rest = results.slice(1).sort((a, b) => naturalSort(a.file, b.file));
    const ordered = [hero, ...rest];
    const dataUrls = ordered.map((r) => `data:image/jpeg;base64,${r.buffer.toString('base64')}`);
    console.log(`  usable: ${ordered.length}, hero: ${hero.file}`);
    await db.execute({ sql: 'UPDATE properties SET image = ? WHERE name = ?', args: [JSON.stringify(dataUrls), dbName] });
    console.log(`  DB updated for "${dbName}"`);
  }
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
