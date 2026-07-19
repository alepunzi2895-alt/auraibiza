// Import foto per gli yacht Classy Ibiza da PDF locali in ~/Downloads/yachts
// (immagini decodificate via PyMuPDF/fitz.Pixmap in uno script Python esterno,
// necessario perché molte di queste schede usano JPEG2000 che sharp/libvips
// non sa decodificare direttamente — salvate come PNG nello scratchpad).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createClient } = require('@libsql/client');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
}
loadEnvLocal();
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const SCRATCH = '/private/tmp/claude-503/-Users-zeroday-Documents-auraibiza/bea5ca05-619e-4050-bf74-20aa7d132974/scratchpad/yachts';

const LABEL_TO_DBNAME = {
  'ALFAMARINE_78_EN': 'Alfamarine 78 (My Nina)',
  'D32 DANDY II': 'De Antonio D32 - Dandy II',
  'D36 DANDY III': 'De Antonio D36 - Dandy III',
  'D36 LUPO DI MARE': 'De Antonio D36 - Lupo di Mare',
  'DR. NO pershing 6x eng': 'Dr. No (Pershing 6X)',
  'INSPIRATION pershing 90 eng': 'Pershing 90 (My Danzas)',
  'SENSATION pershing 72 eng': 'Sensation (Pershing 72)',
  'Chill Out ENG 2026': 'Chill Out (Mangusta 92)',
};

function safeName(label) {
  return label.replace(/[^a-z0-9]/gi, '_');
}

async function processImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const meta = await sharp(buf).metadata();
  const aspect = meta.width / meta.height;
  if (aspect > 2.2 || aspect < 0.45) return { buffer: null, looksFlat: true };
  const trimmed = sharp(buf).trim({ threshold: 15 });
  const stats = await trimmed.clone().stats();
  const r = stats.channels[0];
  const g = stats.channels[1] || r;
  const b = stats.channels[2] || r;
  const meanAll = (r.mean + g.mean + b.mean) / 3;
  const spread = Math.max(r.mean, g.mean, b.mean) - Math.min(r.mean, g.mean, b.mean);
  const maxStdev = Math.max(r.stdev, g.stdev, b.stdev);
  const looksFlat = (meanAll > 235 && spread < 12) || maxStdev < 14;
  const buffer = await trimmed.resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 74 }).toBuffer();
  return { buffer, looksFlat };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'manifest2.json'), 'utf8'));
  const only = process.argv[2];
  for (const [label, dbName] of Object.entries(LABEL_TO_DBNAME)) {
    if (only && label !== only) continue;
    const data = manifest[label];
    if (!data || data.images.length === 0) { console.log(`SKIP ${label}: no images`); continue; }
    const dir = path.join(SCRATCH, safeName(label));
    const results = [];
    for (const img of data.images) {
      try {
        const r = await processImage(path.join(dir, img.file));
        if (r.looksFlat) { console.log(`  skip flat/logo: ${label}/${img.file}`); continue; }
        results.push(r.buffer);
      } catch (e) { console.log('  FAIL', label, img.file, e.message); }
    }
    if (results.length === 0) { console.log(`SKIP ${label}: nothing usable after filter`); continue; }
    const dataUrls = results.map(b => `data:image/jpeg;base64,${b.toString('base64')}`);
    const coverBuf = await sharp(results[0]).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 65 }).toBuffer();
    const coverUrl = `data:image/jpeg;base64,${coverBuf.toString('base64')}`;
    const propRes = await db.execute({ sql: 'SELECT id FROM properties WHERE name = ?', args: [dbName] });
    if (propRes.rows.length === 0) { console.log(`SKIP ${label}: property "${dbName}" not found in DB`); continue; }
    const propId = propRes.rows[0].id;
    await db.execute({ sql: 'UPDATE properties SET image = ?, cover_image = ? WHERE id = ?', args: [JSON.stringify(dataUrls), coverUrl, propId] });
    console.log(`OK ${label} -> "${dbName}": ${dataUrls.length} foto`);
  }
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
