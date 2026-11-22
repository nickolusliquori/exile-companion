"use strict";
// Minimal QR code encoder (byte mode, error correction level M, versions 1-10) for the phone-link QR code.
// Returns a square matrix of booleans (true = dark) and can render it as SVG. No dependencies.

// [total codewords, ec codewords per block, [[block count, data codewords per block], ...]] for level M
const VERSIONS = [null,
  [26, 10, [[1, 16]]], [44, 16, [[1, 28]]], [70, 26, [[1, 44]]], [100, 18, [[2, 32]]], [134, 24, [[2, 43]]],
  [172, 16, [[4, 27]]], [196, 18, [[4, 31]]], [242, 22, [[2, 38], [2, 39]]], [292, 22, [[3, 36], [2, 37]]], [346, 26, [[4, 43], [1, 44]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const REMAINDER = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

// GF(256) arithmetic with the QR polynomial 0x11D
const EXP = new Array(512), LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGenerator(n) { let g = [1]; for (let i = 0; i < n; i++) { const next = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); } g = next; } return g; }
function rsRemainder(data, n) {
  const gen = rsGenerator(n), res = new Array(n).fill(0);
  for (const d of data) { const f = d ^ res.shift(); res.push(0); for (let i = 0; i < n; i++) res[i] ^= gmul(gen[i + 1], f); }
  return res;
}

function encodeData(bytes, v) {
  const [total, ecPer, groups] = VERSIONS[v];
  const dataCap = total - ecPer * groups.reduce((a, [c]) => a + c, 0);
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  if (bits.length > dataCap * 8) return null;
  put(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let p = 0; data.length < dataCap; p++) data.push(p % 2 ? 0x11 : 0xec);
  // split into blocks, add error correction, interleave
  const blocks = []; let k = 0;
  for (const [count, size] of groups) for (let c = 0; c < count; c++) { const d = data.slice(k, k + size); k += size; blocks.push({ d, e: rsRemainder(d, ecPer) }); }
  const out = [], maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecPer; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

function bch(value, poly, bitsLen) { let v = value << bitsLen; const deg = Math.floor(Math.log2(poly)); while (v && Math.floor(Math.log2(v)) >= deg) v ^= poly << (Math.floor(Math.log2(v)) - deg); return (value << bitsLen) | v; }

function buildMatrix(v, codewords, mask) {
  const n = 17 + 4 * v, m = [...Array(n)].map(() => new Array(n).fill(false)), fn = [...Array(n)].map(() => new Array(n).fill(false));
  const set = (r, c, dark) => { m[r][c] = dark; fn[r][c] = true; };
  const finder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) { const rr = r0 + r, cc = c0 + c; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
    const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6), core = r >= 2 && r <= 4 && c >= 2 && c <= 4; set(rr, cc, inRing || core); } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[v];
  const last = al.length - 1;
  al.forEach((r, i) => al.forEach((c, j) => { if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1); }));
  // reserve format and version areas
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, false); if (!fn[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, n - 1 - i, false); set(n - 1 - i, 8, false); }
  set(n - 8, 8, true); // dark module
  if (v >= 7) { const vi = bch(v, 0x1f25, 12); for (let i = 0; i < 18; i++) { const bit = ((vi >>> i) & 1) === 1, a = Math.floor(i / 3), b = n - 11 + (i % 3); set(a, b, bit); set(b, a, bit); } }
  // data, zigzag from the bottom right
  const bits = []; for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
  for (let i = 0; i < REMAINDER[v]; i++) bits.push(0);
  const maskFn = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0][mask];
  let bi = 0, up = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let i = 0; i < n; i++) { const r = up ? n - 1 - i : i;
      for (const cc of [c, c - 1]) { if (fn[r][cc]) continue; let dark = bi < bits.length ? bits[bi] === 1 : false; bi++; if (maskFn(r, cc)) dark = !dark; m[r][cc] = dark; } }
    up = !up;
  }
  // format info: level M (00) + mask, BCH, xor 0x5412
  const fmt = bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412;
  const fb = (i) => ((fmt >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i][8] = fb(i);
  m[7][8] = fb(6); m[8][8] = fb(7); m[8][7] = fb(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = fb(i);
  for (let i = 0; i < 8; i++) m[8][n - 1 - i] = fb(i);
  for (let i = 8; i < 15; i++) m[n - 15 + i][8] = fb(i);
  return m;
}

function penalty(m) {
  const n = m.length; let p = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { let run = 1;
    for (let j = 1; j < n; j++) { const a = pass ? m[j][i] : m[i][j], b = pass ? m[j - 1][i] : m[i][j - 1]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const a = m[i][j]; if (a === m[i + 1][j] && a === m[i][j + 1] && a === m[i + 1][j + 1]) p += 3; }
  const pat = [true, false, true, true, true, false, true, false, false, false, false], rev = pat.slice().reverse();
  for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) for (const pt of [pat, rev]) { if (pt.every((x, k) => m[i][j + k] === x)) p += 40; if (pt.every((x, k) => m[j + k][i] === x)) p += 40; }
  let dark = 0; for (const row of m) for (const x of row) if (x) dark++;
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

function qrMatrix(text) {
  const bytes = [...Buffer.from(String(text), "utf8")];
  for (let v = 1; v <= 10; v++) {
    const cw = encodeData(bytes, v); if (!cw) continue;
    let best = null, bestP = Infinity;
    for (let mask = 0; mask < 8; mask++) { const m = buildMatrix(v, cw, mask), p = penalty(m); if (p < bestP) { best = m; bestP = p; } }
    return best;
  }
  throw new Error("Text too long for the QR code");
}

function qrSvg(text, { scale = 6, margin = 4, dark = "#000", light = "#fff" } = {}) {
  const m = qrMatrix(text), n = m.length, size = (n + margin * 2) * scale;
  let path = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) path += `M${(c + margin) * scale},${(r + margin) * scale}h${scale}v${scale}h-${scale}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

module.exports = { qrMatrix, qrSvg };
