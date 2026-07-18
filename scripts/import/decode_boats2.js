const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAP = {
  '1XoCfdJhll0wLzQq6wKqAcSLACIi7iGRi': 'bliss_4',   // DJI_0858
  '1LAjOs8kGKeKgSfKeAqV5MqjiH3LATZJf': 'bliss_5',   // DJI_0860
  '1e6L3cjbWhx6E9SYH-HT2SZ0US4RX2Lee': 'bliss_6',   // DJI_0861
  '1kHXsyAbNYAbdjdXMvOrn8Ey08SuTVAQH': 'bliss_7',   // Screenshot 08.19.54
  '1k2jb4zMukYpzvAjvK8V6_nVZvtJmCOa-': 'hx1_7',     // Hanstaiger-X1-01143
  '1R4LOflukvscAjsdenSRLDB8r0y5-Iw8x': 'hx1_8',     // Hanstaiger-X1-01133
  '14Xlfdt5MuDqHcnbDjAJLARALC7IR5PlM': 'hx1_9',     // Hanstaiger-X1-01106
  '1jxSZzvgL0bqYe1rlNztZ23vrN2R-0yTl': 'hx1_10',    // Hanstaiger-X1-01080
  '1-DimpCX-9VoxVd2Gf1aXIq-BZiD2EZhV': 'hx1_11',    // Hanstaiger-X1-01059
  '1S3ne1Op6jcA_mS57n4AZlYaVNrk077eg': 'hx1_12',    // Hanstaiger-X1-01021
  '1s2-924bWcS6St7Sd8UIRrlUdR87axUSU': 'hx1_13',    // Hanstaiger-X1-01017
  '1akbZeYGf8hYkAkVuK6p8eRYMNBkkjUkY': 'hx1_14',    // Hanstaiger-X1-01002
  '10zkzfRGt50E4hy64R-JWrgtOYws7SNu1': 'hx1_15',    // Hanstaiger-X1-00994
};

const RESDIR = '/Users/zeroday/.claude/projects/-Users-zeroday-Documents-auraibiza/bea5ca05-619e-4050-bf74-20aa7d132974/tool-results';
const OUT = '/private/tmp/claude-503/-Users-zeroday-Documents-auraibiza/bea5ca05-619e-4050-bf74-20aa7d132974/scratchpad/import';

async function main() {
  const files = fs.readdirSync(RESDIR).filter(f => f.startsWith('mcp-claude_ai_Google_Drive-download_file_content'));
  const found = {};
  for (const f of files) {
    const full = path.join(RESDIR, f);
    let raw;
    try { raw = fs.readFileSync(full, 'utf8'); } catch (e) { continue; }
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { continue; }
    const id = parsed.id;
    if (MAP[id] && !found[id]) {
      found[id] = true;
      const label = MAP[id];
      const buf = Buffer.from(parsed.content, 'base64');
      const resized = await sharp(buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
      const dataUrl = 'data:image/jpeg;base64,' + resized.toString('base64');
      fs.writeFileSync(path.join(OUT, `${label}.txt`), dataUrl);
      console.log(`${label}.txt <- ${id} (${buf.length} -> ${resized.length} bytes)`);
    }
  }
  const missing = Object.keys(MAP).filter(id => !found[id]);
  if (missing.length) console.log('MISSING:', missing);
  else console.log('All', Object.keys(MAP).length, 'photos decoded.');
}
main().catch(e => { console.error(e); process.exit(1); });
