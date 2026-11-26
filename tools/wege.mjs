// Prüft die Wege in den Orten: Ist jede Haustür vom Ortsrand aus erreichbar, obwohl Häuser,
// Kirchen und Mauern ihre Felder sperren? Und wie weit liegen die Häuser auseinander?
//   node tools/wege.mjs [seed ...]
const { generateWorld, nearestWalkable, buildingTiles, doorOf, isWalkable } = await import('../src/world.js');
const { G } = await import('../src/state.js');
const { siteSpots, resetLife } = await import('../src/life.js');
const DOORS = { house: 1, church: 1, longhall: 1, klause: 1, stollen: 1, landmark: 1 };
const args = process.argv.slice(2);
// --ohne-haeuser: zum Vergleich nur Mauern als Hindernis (wie vor der Gebäudekollision)
const noHouses = args.includes('--ohne-haeuser');
const seeds = args.filter((a) => !a.startsWith('--')).map(Number);
let bad = 0;
const quiet = args.includes('--still');
for (const seed of seeds.length ? seeds : [12345, 777, 4242]) {
  const W = generateWorld(seed), N = W.N;
  if (noHouses) W.block = W.wallStatic;
  G.world = W; G.s = { cons: {}, damage: {} }; resetLife();
  const spotBad = {};
  const byType = {};
  for (const s of W.sites) {
    if (s.type === 'lager') continue;
    const R = Math.ceil((s.clear || 4) + 16);
    // Von allen offenen Feldern am Rand des Suchgebiets aus fluten
    const seen = new Uint8Array((2 * R + 1) ** 2), q = [];
    const id = (x, y) => (y - s.ty + R) * (2 * R + 1) + (x - s.tx + R);
    const open = (x, y) => x > 0 && y > 0 && x < N - 1 && y < N - 1 && W.tiles[y * N + x] !== 0 && !W.block[y * N + x];
    for (let k = -R; k <= R; k++) for (const [x, y] of [[s.tx + k, s.ty - R], [s.tx + k, s.ty + R], [s.tx - R, s.ty + k], [s.tx + R, s.ty + k]]) if (open(x, y) && !seen[id(x, y)]) { seen[id(x, y)] = 1; q.push([x, y]); }
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (Math.abs(nx - s.tx) > R || Math.abs(ny - s.ty) > R || seen[id(nx, ny)] || !open(nx, ny)) continue;
        seen[id(nx, ny)] = 1; q.push([nx, ny]);
      }
    }
    const t = byType[s.type] || (byType[s.type] = { orte: 0, haeuser: 0, tueren_zu: 0, mitte_zu: 0, abstand: [] });
    // Plätze, die die Bewohner ansteuern: frei stehen (nicht in einem Gebäude) und erreichbar sein
    if (!noHouses && s.type !== 'spieler') {
      const sp = siteSpots(s);
      const check = (kind, p) => {
        if (!p) return;
        const ok = isWalkable(W, p.x, p.y) && Math.abs(Math.floor(p.x) - s.tx) <= R && Math.abs(Math.floor(p.y) - s.ty) <= R && seen[id(Math.floor(p.x), Math.floor(p.y))];
        if (!ok) { spotBad[kind] = (spotBad[kind] || 0) + 1; bad++; if (!quiet && spotBad[kind] <= 2) console.log(`  ${seed} ${s.name}: Platz „${kind}“ bei ${p.x.toFixed(1)},${p.y.toFixed(1)} ${isWalkable(W, p.x, p.y) ? 'nicht erreichbar' : 'in einem Hindernis'}`); }
      };
      for (const h of sp.houses) check('Tür', h);
      for (const st of sp.stalls) { check('Stand vorn', st.front); check('Stand hinten', st.back); }
      for (const w of sp.wells) check('Brunnen', w);
      for (const a of sp.anvils) check('Amboss', a);
      check('Kirche', sp.church); check('Stollen', sp.adit); check('Gasthaus', sp.tavern);
    }
    t.orte++;
    const c = nearestWalkable(W, s.tx, s.ty, 3);
    if (!c || !seen[id(c.x, c.y)]) { t.mitte_zu++; bad++; if (!quiet) console.log(`  ${seed} ${s.name}: Ortsmitte nicht erreichbar`); }
    const hs = W.buildings.filter((b) => b.site === s.id && DOORS[b.kind] && buildingTiles(W, b).length);
    for (const b of hs) {
      t.haeuser++;
      const d = doorOf(b, W), dx = Math.floor(d.x), dy = Math.floor(d.y);
      const ok = Math.abs(dx - s.tx) <= R && Math.abs(dy - s.ty) <= R && seen[id(dx, dy)];
      if (!ok) { t.tueren_zu++; bad++; if (t.tueren_zu <= 3 && !quiet) console.log(`  ${seed} ${s.name}: Tür von ${b.kind}${b.lm ? '/' + b.lm : ''}${b.tavern ? ' (Gasthaus)' : ''}${b.smithy ? ' (Schmiede)' : ''} bei ${d.x.toFixed(1)},${d.y.toFixed(1)} nicht erreichbar`); }
      // Abstand zum nächsten Nachbarhaus (Mitte zu Mitte)
      let m = Infinity;
      for (const o of hs) if (o !== b && o.kind === 'house' && b.kind === 'house') m = Math.min(m, Math.hypot(o.x - b.x, o.y - b.y));
      if (m < Infinity) t.abstand.push(m);
    }
  }
  console.log(`Seed ${seed}`, Object.keys(spotBad).length ? 'Plätze nicht frei: ' + JSON.stringify(spotBad) : 'alle Plätze der Bewohner frei und erreichbar');
  for (const [k, t] of Object.entries(byType)) {
    const a = t.abstand.sort((x, y) => x - y);
    const mid = a.length ? a[Math.floor(a.length / 2)].toFixed(2) : '-';
    console.log(`  ${k.padEnd(12)} Orte ${String(t.orte).padStart(2)}  Gebäude ${String(t.haeuser).padStart(4)}  Türen versperrt ${t.tueren_zu}  Mitte versperrt ${t.mitte_zu}  Abstand zum Nachbarn (Median) ${mid}`);
  }
}
console.log(bad ? `${bad} Probleme` : 'Alle Türen und Ortsmitten erreichbar.');
process.exit(bad ? 1 : 0);
