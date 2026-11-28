// Fahrende in der Welt: Gaukler und Postkutsche (Gruppen in data.js, Wagen als Platzhalter gezeichnet in render.js).
// - Gaukler ziehen mit ihrem Planwagen von Ort zu Ort. Kommen sie an, spielen sie dort auf (Meldung, wenn du in der Nähe
//   bist). Ein Klick auf sie: Für ein paar Münzen spielen sie dir auf (dein Gefolge ist bis zum Abend guter Dinge,
//   +15 % Erfahrung), oder du lädst sie auf deine Burg ein: Sie fahren hin und geben dort ein Fest (Ruhm, Ansehen).
// - Die Postkutsche fährt zwischen Städten, Märkten, Abteien und Burgen. Kommt sie in deiner Nähe an, erzählt man, was
//   sie an Nachrichten bringt. Ein Klick: Für zwei Münzen erzählt der Kutscher, was er gehört hat, oder du überfällst sie
//   (Beute, aber Ärger mit der Gilde und den Normannen).
// - Die Steuereintreiber fahren in einer Kutsche mit Geldtruhe (data.js, NPC vogt).
import { G, log, homeName } from './state.js';
import { GROUP_TYPES } from './data.js';
import { siteById } from './economy.js';
import { addRenown, changeRep } from './politics.js';
import { castleSite } from './castle.js';
import { ringR } from './plots.js';
import { confirmDialog, rumor } from './ui.js';
import { provokeGroup } from './units.js';

const GAUKLER_PLAY = 15, GAUKLER_FEST = 120, POST_NEWS = 2;
const reiseGast = () => !!(G.mp && G.mp.role === 'guest');

// Ankunft einer Gruppe an ihrem Ziel (units.js, beim Gastgeber oder allein)
G.onGroupArrive = (g) => {
  const gt = GROUP_TYPES[g.type];
  if (!gt) return;
  if (g.forced) { g.forced = null; if (gt.entertain) feast(); return; }
  const s = g.destSite && siteById(g.destSite), p = G.s.player;
  if (!s) return;
  const near = Math.hypot(s.x - p.x, s.y - p.y) < 70;
  if (gt.entertain) {
    s.gauklerDay = G.s.day;
    if (near) log(`Fahrende Gaukler sind in ${s.name} angekommen: Jongleure, ein Feuerschlucker und ein Bänkelsänger spielen auf dem Platz.`);
  }
  if (gt.post && near && Math.random() < 0.6) log(`Die Postkutsche ist in ${s.name} eingetroffen. Man erzählt: „${rumor(s)}“`);
};

// Ein Fest auf deiner Burg
function feast() {
  addRenown(4);
  changeRep('sachsen', 2); changeRep('gilde', 2);
  G.s.buff = { day: G.s.day + 1 };
  G.s.feasts = (G.s.feasts || 0) + 1;
  log(`Die Gaukler sind auf ${homeName()} angekommen und geben ein Fest: Musik, Feuerschlucker und ein Tanzbär. Ruhm +4, die Sachsen und die Gilde reden gut von dir. Dein Gefolge feiert bis morgen Abend (+15 % Erfahrung).`, 'gold');
}

function play() {
  if (G.s.gold < GAUKLER_PLAY) { log(`Für ${GAUKLER_PLAY} Gold spielen sie auf. So viel hast du nicht.`, 'bad'); return; }
  G.s.gold -= GAUKLER_PLAY;
  G.s.buff = { day: G.s.day };
  log('Die Gaukler spielen für dich und dein Gefolge: ein Lied von König Richard, ein paar Späße über Prinz John. Alle sind guter Dinge bis zum Abend (+15 % Erfahrung).', 'good');
}
function invite(g) {
  const home = castleSite();
  if (!home) return;
  if (G.s.gold < GAUKLER_FEST) { log(`Für ein Fest wollen die Gaukler ${GAUKLER_FEST} Gold. So viel hast du nicht.`, 'bad'); return; }
  G.s.gold -= GAUKLER_FEST;
  // Beim Gast rechnet der Gastgeber die Gaukler: das Fest gibt es dann gleich
  if (reiseGast() || g.mirror) { feast(); return; }
  const R = ringR() || 4;
  g.forced = { x: home.x + 0.5, y: home.y + R + 2.5 };
  g.path = null; g.wait = 0;
  log(`Die Gaukler nehmen das Gold und machen sich auf den Weg nach ${homeName()}. Wenn sie ankommen, gibt es ein Fest.`, 'good');
}
function news(g) {
  if (G.s.gold < POST_NEWS) { log('Ohne eine Münze erzählt der Kutscher nichts.', 'bad'); return; }
  G.s.gold -= POST_NEWS;
  const lead = g.members[0] || g;
  const near = G.world.sites.filter((s) => s.type !== 'einsiedelei').sort((a, b) => Math.hypot(a.x - lead.x, a.y - lead.y) - Math.hypot(b.x - lead.x, b.y - lead.y))[0];
  log(`Der Postkutscher erzählt: „${near ? rumor(near) : 'Nichts Neues auf den Straßen.'}“`);
}

// Klick auf eine Figur der Fahrenden (main.js, clickUnit): true, wenn hier entschieden wurde
G.onTravelerClick = (g, u) => {
  const gt = GROUP_TYPES[g.type];
  if (!gt || g.engaged || (!gt.entertain && !gt.post)) return false;
  if (gt.entertain) {
    const home = castleSite();
    confirmDialog(`Fahrende Gaukler mit ihrem Planwagen: Jongleure, ein Feuerschlucker und ein Bänkelsänger. Für ${GAUKLER_PLAY} Gold spielen sie dir und deinem Gefolge auf (bis zum Abend +15 % Erfahrung). Für ${GAUKLER_FEST} Gold ziehen sie nach ${homeName()} und geben dort ein Fest (Ruhm +4, Ansehen bei Sachsen und Gilde).`,
      `Aufspielen (${GAUKLER_PLAY} Gold)`, () => play(), null, home ? { label: `Fest auf der Burg (${GAUKLER_FEST} Gold)`, fn: () => invite(g) } : null);
    return true;
  }
  const dest = g.destSite && siteById(g.destSite);
  const conseq = gt.kill ? Object.entries(gt.kill).map(([f, v]) => `${f[0].toUpperCase()}${f.slice(1)} ${v}`).join(', ') : '';
  confirmDialog(`Die Postkutsche${dest ? ` nach ${dest.name}` : ''}: Briefe mit Siegeln, ein Postreiter und ein müder Kutscher. Für ${POST_NEWS} Gold erzählt er, was er unterwegs gehört hat.${conseq ? ` Ein Überfall bringt Beute, aber Ärger (${conseq}).` : ''}`,
    `Nachrichten (${POST_NEWS} Gold)`, () => news(g), null, { label: 'Überfallen', fn: () => { provokeGroup(g); const p = G.s.player; p.attackTarget = u; p.path = null; } });
  return true;
};

// Für Tests
if (typeof window !== 'undefined') window.__ritterReise = { feast, play };
