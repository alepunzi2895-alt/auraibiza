const fs = require('fs');
const sharp = require('sharp');

async function main() {
  const [,, jsonPath, outPath, maxWidth] = process.argv;
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  const b64 = parsed.content;
  const buf = Buffer.from(b64, 'base64');
  const resized = await sharp(buf)
    .resize({ width: Number(maxWidth) || 1600, withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
  const dataUrl = 'data:image/jpeg;base64,' + resized.toString('base64');
  fs.writeFileSync(outPath, dataUrl);
  console.log(`${outPath}: ${buf.length} -> ${resized.length} bytes`);
}
main().catch(e => { console.error(e); process.exit(1); });
