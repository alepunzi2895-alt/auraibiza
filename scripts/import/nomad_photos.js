// Import foto per Nomad (Mangusta 108) da PDF locale in ~/Downloads/yachts
// (immagini decodificate via PyMuPDF/fitz.Pixmap in uno script Python esterno, salvate nello scratchpad).
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

const DIR = '/private/tmp/claude-503/-Users-zeroday-Documents-auraibiza/bea5ca05-619e-4050-bf74-20aa7d132974/scratchpad/yachts/nomad';
const PROP_ID = 'p34724crx';

async function processImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const meta = await sharp(buf).metadata();
  const aspect = meta.width / meta.height;
  if (aspect > 2.2 || aspect < 0.45) return { buffer: null, looksFlat: true, reason: 'aspect' };
  if (meta.width < 300 || meta.height < 300) return { buffer: null, looksFlat: true, reason: 'small' };
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
  return { buffer, looksFlat, reason: looksFlat ? 'flat' : null };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const results = [];
  for (const img of manifest) {
    try {
      const r = await processImage(path.join(DIR, img.file));
      if (r.looksFlat) { console.log(`  skip (${r.reason}): ${img.file} [${img.width}x${img.height}]`); continue; }
      results.push({ file: img.file, buffer: r.buffer });
    } catch (e) { console.log('  FAIL', img.file, e.message); }
  }
  console.log(`Kept ${results.length} of ${manifest.length} images`);
  const dataUrls = results.map(r => `data:image/jpeg;base64,${r.buffer.toString('base64')}`);
  fs.writeFileSync(path.join(DIR, 'kept.json'), JSON.stringify(results.map(r => r.file), null, 2));

  const coverBuf = await sharp(results[0].buffer).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 65 }).toBuffer();
  const coverUrl = `data:image/jpeg;base64,${coverBuf.toString('base64')}`;

  await db.execute({ sql: 'UPDATE properties SET image = ?, cover_image = ? WHERE id = ?', args: [JSON.stringify(dataUrls), coverUrl, PROP_ID] });
  console.log(`OK Nomad -> ${dataUrls.length} foto salvate`);
}

main().catch(e => { console.error(e); process.exit(1); });
