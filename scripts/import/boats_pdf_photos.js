// Import foto e descrizioni per le barche/velieri da PDF locali in
// ~/Downloads/CATAMARANES e ~/Downloads/VELEROS (immagini incorporate estratte
// via PyMuPDF in scripts esterni, salvate nello scratchpad con un manifest.json).
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

const SCRATCH = '/private/tmp/claude-503/-Users-zeroday-Documents-auraibiza/bea5ca05-619e-4050-bf74-20aa7d132974/scratchpad/boats';

// PDF label -> DB property name (only the 14 that already exist; 4 new boats
// found in the PDFs -- Garufa, Avalon, Bardalin, Isla -- are intentionally
// left out here, reported to the user separately).
const LABEL_TO_DBNAME = {
  'Catamarán ALLIMAC': 'Lagoon 39 "Allimac"',
  'Catamarán FELICIDAD': 'Lagoon 380 "Felicidad"',
  'Catamarán FLYING FISH': 'Catamarano "Flying Fish"',
  'Catamarán JAYA': 'Catamarano "Jaya"',
  'Catamarán MARSI': 'Bali Cat Space "Marsi"',
  'Catamarán OCEAN BLUE': 'Lagoon 400 "Ocean Blue"',
  'Catamarán OCEAN GREY': 'Bali 4.0 "Ocean Grey"',
  'Catamarán VAMOLON': 'Catamarano "Vamolon"',
  'Velero 4SAIL': 'Jeanneau Sun Odyssey 410 "4 Sail"',
  'Velero ARTIMO': 'Dufour 43 "Artimo"',
  'Velero KOALA II': 'Jeanneau Sun Odyssey 440 "Koala II"',
  'Velero SUN FIZZ': 'Janneau 40 "Sun Fizz"',
  'Velero VODKA': 'Oceanis 393 "Vodka"',
  'Velero YUPAS': 'Puma 37 "Yupas"',
};

function safeName(label) {
  // Python (macOS os.listdir) enumerates filenames in NFD form, so its
  // char-by-char sanitizer splits "á" into "a" + combining-accent(_).
  // Match that exactly so the folder name lines up with what extract_boats.py wrote.
  return label.normalize('NFD').replace(/[^a-z0-9]/gi, '_');
}

async function processImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const meta = await sharp(buf).metadata();
  // Il template PDF di questa flotta include un banner grafico decorativo
  // (sfondo blu a tutta larghezza, bassa altezza) in testa a quasi ogni scheda:
  // non è una foto della barca. Lo riconosciamo dal rapporto larghezza/altezza
  // estremo (le foto reali della flotta sono sempre tra 0.6 e ~1.8).
  const aspect = meta.width / meta.height;
  if (aspect > 2.2 || aspect < 0.45) {
    return { buffer: null, looksFlat: true };
  }
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
  // macOS restituisce i nomi file in forma Unicode NFD (accenti come combining
  // characters separati): normalizziamo entrambe le chiavi prima del lookup.
  const rawManifest = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'manifest.json'), 'utf8'));
  const manifest = {};
  for (const [k, v] of Object.entries(rawManifest)) manifest[k.normalize('NFC')] = v;
  const only = process.argv[2];
  for (const [label, dbName] of Object.entries(LABEL_TO_DBNAME)) {
    if (only && label !== only) continue;
    const data = manifest[label.normalize('NFC')];
    if (!data || data.images.length === 0) { console.log(`SKIP ${label}: no images`); continue; }
    const dir = path.join(SCRATCH, safeName(label));
    const results = [];
    for (const img of data.images) {
      try {
        const r = await processImage(path.join(dir, img.file));
        if (r.looksFlat) { console.log(`  skip flat: ${label}/${img.file}`); continue; }
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
