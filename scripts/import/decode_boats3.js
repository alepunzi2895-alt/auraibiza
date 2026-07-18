const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAP = {
  '19zA1b2hOyDA30S9fuGSX_1YthtzPu53e': 'chillout_6b',
  '13SKJYlosUtiL73lJiFjtTiTGAEc7_JoU': 'triniti_6',
  '18UODlaMPRRAgkybcvB7c4IkJlJmZkLFE': 'triniti_7',
  '1P29W2yyW2kwrKXhmIE42ZvSj8OK0E5Rl': 'triniti_8',
  '1A89y4egNC6FBTr02SRmEfMddALsP9fpy': 'triniti_9',
  '19R1vAJl7xxuukC6vFrdDacsWbmSjW6o2': 'triniti_10',
  '1PXy52IAnmy9oTHRlzXiGQTj-m9_ORXWG': 'triniti_11',
  '14nlw-66PSftn7rHnQ98IxmwPlDQrjG98': 'wahoo_6',
  '1xdPMcFaqrFP2jjXNVXfLYcQwmgDstjZZ': 'wahoo_7',
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
