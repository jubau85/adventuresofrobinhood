const { generateWorld } = await import('../src/world.js');
// Gezeichnete Ausdehnung je Gebäude (in Feldern), nicht nur die eingetragene Grundfläche
const DRAWN = {
  landmark: (b) => {
    if (b.lm === 'kathedrale') return [b.wx, b.wy];
    if (b.lm === 'tower') return [b.wx, b.wy];
    return [b.wx, b.wy];
  },
};
const ext = (b) => (DRAWN[b.kind] ? DRAWN[b.kind](b) : [b.wx || 0, b.wy || 0]);
const stats = {}, examples = {};
for (const seed of [12345, 777, 4242]) {
  const W = generateWorld(seed);
  const solid = W.buildings.filter((b) => b.wx && ['house', 'church', 'longhall', 'landmark', 'tent', 'stall', 'well', 'klause', 'mystic', 'stollen', 'halde', 'stonehenge', 'deko'].includes(b.kind));
  // Friedhöfe und Stadtmauern als Hindernisse
  const extra = [];
  for (const s of W.sites) {
    if (s.cemetery) extra.push({ kind: 'friedhof', site: s.id, x: s.cemetery.x, y: s.cemetery.y, wx: s.cemetery.wx, wy: s.cemetery.wy });
    if (s.cityWall) for (const [x, y] of s.cityWall) extra.push({ kind: 'stadtmauer', site: s.id, x: x + 0.5, y: y + 0.5, wx: 1, wy: 1 });
    if (s.type === 'burg') for (const [dx, dy, wx, wy] of [[0, -4, 9.4, 0.6], [0, 4, 9.4, 0.6], [-4, 0, 0.6, 9.4], [4, 0, 0.6, 9.4], [-1.1, -1.1, 2.8, 2.8]]) extra.push({ kind: 'burgmauer', site: s.id, x: s.x + dx, y: s.y + dy, wx, wy });
    if (s.palisade) for (let a = 0; a < Math.PI * 2; a += 0.2) if (Math.abs(a - Math.PI * 0.5) > 0.28) extra.push({ kind: 'palisade', site: s.id, x: s.x + Math.cos(a) * 4.5, y: s.y + Math.sin(a) * 4.5, wx: 0.25, wy: 0.25 });
  }
  const all = solid.concat(extra);
  // Gitter für schnelle Nachbarsuche
  const grid = new Map(); const key = (x, y) => `${Math.floor(x / 4)},${Math.floor(y / 4)}`;
  for (const b of all) { const k = key(b.x, b.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
  for (const a of all) {
    const [ax, ay] = ext(a);
    for (let gy = Math.floor(a.y / 4) - 2; gy <= Math.floor(a.y / 4) + 2; gy++) for (let gx = Math.floor(a.x / 4) - 2; gx <= Math.floor(a.x / 4) + 2; gx++) {
      for (const b of grid.get(`${gx},${gy}`) || []) {
        if (b === a || all.indexOf(b) < all.indexOf(a)) continue;
        if (a.kind === b.kind && ['stadtmauer', 'burgmauer', 'palisade'].includes(a.kind)) continue;
        const [bx, by] = ext(b);
        const ox = Math.min(a.x + ax / 2, b.x + bx / 2) - Math.max(a.x - ax / 2, b.x - bx / 2);
        const oy = Math.min(a.y + ay / 2, b.y + by / 2) - Math.max(a.y - ay / 2, b.y - by / 2);
        if (ox > 0.05 && oy > 0.05) {
          const k = [a.kind + (a.lm ? ':' + a.lm : ''), b.kind + (b.lm ? ':' + b.lm : '')].sort().join(' / ');
          stats[k] = (stats[k] || 0) + 1;
          if (!examples[k]) examples[k] = `${a.site || '?'} (${a.x.toFixed(1)},${a.y.toFixed(1)}) ↔ ${b.site || '?'} (${b.x.toFixed(1)},${b.y.toFixed(1)}) Überlappung ${ox.toFixed(2)}×${oy.toFixed(2)}`;
        }
      }
    }
  }
}
for (const [k, n] of Object.entries(stats).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), k.padEnd(34), examples[k]);
