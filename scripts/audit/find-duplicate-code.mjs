// Detector simples de código duplicado: janelas de 14 linhas normalizadas, entre arquivos diferentes.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const roots = ['src/components', 'src/services', 'src/context', 'src/hooks', 'src/utils', 'server', 'server.ts', 'scripts'];
const files = [];
const walk = (p) => { const st = fs.statSync(p); if (st.isDirectory()) { for (const e of fs.readdirSync(p)) if (!['node_modules', 'legacy', 'data'].includes(e)) walk(path.join(p, e)); } else if (/\.(tsx?|mjs)$/.test(p) && !p.includes('__tests__')) files.push(p); };
roots.forEach((r) => fs.existsSync(r) && walk(r));
const W = 14; const index = new Map(); const lineCount = {};
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('import ') && !/^[{}()\[\];,]*$/.test(l));
  lineCount[f] = lines.length;
  for (let i = 0; i + W <= lines.length; i++) {
    const h = crypto.createHash('md5').update(lines.slice(i, i + W).join('\n')).digest('hex');
    if (!index.has(h)) index.set(h, []); index.get(h).push([f, i]);
  }
}
const pair = new Map(); const dupLines = {};
for (const occ of index.values()) {
  const fs_ = [...new Set(occ.map((o) => o[0]))]; if (fs_.length < 2) continue;
  for (const [f] of occ) dupLines[f] = (dupLines[f] || 0) + 1;
  for (let i = 0; i < fs_.length; i++) for (let j = i + 1; j < fs_.length; j++) { const k = [fs_[i], fs_[j]].sort().join('  <->  '); pair.set(k, (pair.get(k) || 0) + 1); }
}
const total = Object.values(lineCount).reduce((a, b) => a + b, 0);
console.log(`arquivos: ${files.length} | linhas úteis: ${total}`);
console.log('pares de arquivos com mais blocos repetidos (janelas de 14 linhas):');
[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([k, n]) => console.log(String(n).padStart(5), ' ', k));
