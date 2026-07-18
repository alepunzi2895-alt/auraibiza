const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Map of Drive fileId -> output label
const MAP = {
  '12xFG6VEZcSlCX2NLOOpRL2JfNgtmmg3L': '488_1',
  '1UFrAsPRHbPO-cIzoJtiugltzRHs4aJJe': '488_2',
  '1uGLZk25C36CE0O9HqeofWwWGWCeXSm8E': '488_3',
  '18D4r-F62ZGax6E4hLY2PuHtFzVSA2Ioj': 'q7_1',
  '1sJjpI7XAnKQKDxcT9gIa-GjI8JW1P0J_': 'q7_2',
  '1o3wN6oTd3ZkpQX72Ne6Ko2YaALWdtEeg': 'q7_3',
  '17X0vQpbZKd_c1Y6eedU25K_88CafKRBk': 'mustang_1',
  '1hrSVi8DzEVHmsfwwV8IOD7vDo2G2u7Wt': 'mustang_2',
  '1ix5kiTRJKeEolruAgn9jYjw2vLlYuwK8': 'q8_1',
  '1esbZpFXaUSbrjGpFC3BLF8rHbl6_g7Oo': 'q8_2',
  '1S50x7FWTfU9G1-smh14fXzsJp4dkSi98': 'rsq8_1',
  '1YhIHtDZuczpwrVEIaMYU96TC2JKnUP-i': 'rsq8_2',
  '1wZ3QTCKCXDcUjQ8nbVCen2eruQIhPDiP': 'rsq8_3',
  '19vk_P4cWfA0w18zJlZL19MZaliQ7Fszf': 'rsq8_4',
  '1uh4VjrkP7nRmN2EzaA8MK4jUlWcYrnK4': 'urusperf_1',
  '13lwJNeFGQdbZERJVTO1zlt7qUKL-ushh': 'urusperf_2',
  '1zMng85zu6sWyW4EfYo_SOtRVPiHW-07w': 'urusperf_3',
  '1nLasQXphKACy5pgKD2rzrr4k6pG0NAn3': 'urus_1',
  '1bAFB7YdfhmmdOj0jqYg63_9IcGOaBszF': 'urus_2',
  '1btITI8VV_tYhWZWAIsfxVOxu2YcAaxK8': 'urus_3',
  '1q0i7Tb7v4voiSRDBX-H_we5FW76dmbZn': 'urus_4',
  '16PrlK1degRN2SU4zPNm8Gib5NMVFVUbW': 'urus_5',
  '1xiYGcv7iMlEGWxx3eMdKERf7NaR-uyL4': 'urus_6',
  '14KQA7QNDru7FDnXP6GdCc50uAM69A7GT': 'urus_7',
  '1k8VtZ97hqRb1b9142MCaIUgkDcSmu6TN': 'rs3_1',
  '16qYHqrOJutGiMux-pFixLLHon6pbQFFw': 'rs3_2',
  '1rn1fgpwzfQ1QOItZBk8O9Y8yTEgkIPd2': 'rs3_3',
  '1LkevgBYQQPDR55RB6pwnLN4LSZ5mnm3l': 'e43_1',
  '1x9b6Xvly21zR7uYmiDGD7RVAaLPbEGAL': 'e43_2',
  '19q1sSHX3Ax_XTeG5uqOjDiBgjUKB3pEA': 'm4_1',
  '1-Z1GIZeme0gvgiaeNIY_arFm85TVdY69': 'm4_2',
  '1NoZ8fcsuymnEFfzveRpaFMPMTv-fV2wi': 'm4_3',
  '1HgYx0F4TPPn7tqfdcA6rryDvNeaLRdaD': 'm4_4',
  '1xxxSYBJ8yrZXNecOl5aieZWEfOpPsDn1': 'm4_5',
  '1a0Z4Z3sMxuwSTdYiiWXSmQRGpxFZsVnG': 'm4_6',
  '15FPQ9hPnj_OljnqZb40VieqKmVL3sY09': 'm4_7',
  '120y8nh8xJZ51KLCP-AHv0zDcREbwqXbs': 'g63_1',
  '1VT1IMhcs6-fV-86JeXED3m72103mO4xM': 'g63_2',
  '1l6SMEr4OsZbuMb-8BCGmG1nJIDQXhIsN': 'g63_3',
  '1u1JNlu5q7J3Q_mRuw2W02RH3dEY_FB2w': 'g63_4',
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
      fs.writeFileSync(path.join(OUT, `car_${label}.txt`), dataUrl);
      console.log(`car_${label}.txt <- ${id} (${buf.length} -> ${resized.length} bytes)`);
    }
  }
  const missing = Object.keys(MAP).filter(id => !found[id]);
  if (missing.length) console.log('MISSING:', missing);
  else console.log('All', Object.keys(MAP).length, 'car photos decoded.');
}
main().catch(e => { console.error(e); process.exit(1); });
