// Zentrale Spieldaten. Alles, was Balancing ist, steht hier.

export const TW = 64;            // Kachelbreite in Pixeln (isometrisch)
export const TH = 32;            // Kachelhöhe
export const MAP = 160;          // Kartengröße in Kacheln
export const CHUNK = 8;          // Kacheln pro Render-Chunk
export const HMAX = 52;          // größte Geländehöhe in Pixeln
export const DAY_LEN = 240;      // Sekunden Echtzeit pro Spieltag
export const DAYS_PER_SEASON = 6;
export const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
export const SAVE_KEY = 'ritter-ohne-land-v1';
export const SAVE_VERSION = 1;

export const T = { WATER: 0, GRASS: 1, FOREST: 2, HILLS: 3, ROAD: 4, FIELD: 5, BRIDGE: 6, SAND: 7 };
export const TERRAIN_SPEED = [0, 1, 0.62, 0.75, 1.3, 0.95, 1.25, 0.9];
export const TERRAIN_COST = [1e9, 1, 2.4, 1.8, 0.5, 1.1, 0.55, 1.2];
export const TERRAIN_NAME = ['Wasser', 'Wiese', 'Wald', 'Hügel', 'Straße', 'Feld', 'Brücke', 'Ufer'];

// ---------------------------------------------------------------- Fraktionen
export const FACTIONS = {
  sachsen: {
    name: 'Sächsische Thane', short: 'Sachsen', color: '#5b8a3c', rivals: ['normannen'],
    desc: 'Der alte angelsächsische Adel. Stolz, verarmt und voller Groll gegen die normannischen Herren.',
    ally: 'Sächsische Freisassen verstärken deine Burg (+20 Verteidigung), Anwerben kostet 20 % weniger.',
  },
  normannen: {
    name: 'Normannische Barone', short: 'Normannen', color: '#a33b32', rivals: ['sachsen', 'waldleute'],
    desc: 'Prinz Johns Gefolgsleute. Sie halten die Burgen, die Gerichte und die Steuerkassen.',
    ally: 'Der Vogt verlangt keine Abgaben mehr, Patrouillen lassen dich in Ruhe.',
  },
  kirche: {
    name: 'Kirche & Orden', short: 'Kirche', color: '#c9b25e', rivals: [],
    desc: 'Abteien und Ordenshäuser. Reich an Land, Wolle und Wein und an Einfluss.',
    ally: 'Verwundete heilen doppelt so schnell, alle zwei Tage +1 Ruhm.',
  },
  gilde: {
    name: 'Kaufmannsgilde', short: 'Gilde', color: '#3d6fa3', rivals: ['waldleute'],
    desc: 'Die Händler der Städte. Ihnen ist gleich, wer herrscht, solange die Straßen sicher sind.',
    ally: 'Bessere Preise auf allen Märkten, +15 Gold am Tag aus Handelsanteilen.',
  },
  waldleute: {
    name: 'Waldleute', short: 'Waldleute', color: '#8a7a3e', rivals: ['normannen', 'gilde'],
    desc: 'Geächtete, Wilderer und Enteignete. Sie leben in den Wäldern und hoffen auf König Richard.',
    ally: 'Wegelagerer meiden dich, im Rittersaal melden sich Langbogenschützen.',
  },
};
export const FACTION_IDS = Object.keys(FACTIONS);

// ---------------------------------------------------------------- Waren
export const GOODS = {
  getreide: { name: 'Getreide', base: 6 },
  holz: { name: 'Holz', base: 8 },
  stein: { name: 'Stein', base: 12 },
  eisen: { name: 'Eisen', base: 24 },
  wolle: { name: 'Wolle', base: 14 },
  bier: { name: 'Bier', base: 10 },
  salz: { name: 'Salz', base: 18 },
  wein: { name: 'Wein', base: 30 },
};
export const GOOD_IDS = Object.keys(GOODS);

// ---------------------------------------------------------------- Ausrüstung
export const ITEMS = {
  knueppel: { name: 'Knüppel', slot: 'waffe', kind: 'keule', atk: 2, range: 1.15, cd: 1.0, price: 8, tier: 0 },
  kurzschwert: { name: 'Kurzschwert', slot: 'waffe', kind: 'schwert', atk: 4, range: 1.2, cd: 0.95, price: 45, tier: 1 },
  speer: { name: 'Speer', slot: 'waffe', kind: 'speer', atk: 4, range: 1.7, cd: 1.15, price: 35, tier: 1 },
  kurzbogen: { name: 'Kurzbogen', slot: 'waffe', kind: 'bogen', atk: 4, range: 6, cd: 1.6, ranged: true, twoHanded: true, price: 50, tier: 1 },
  langschwert: { name: 'Langschwert', slot: 'waffe', kind: 'schwert', atk: 7, range: 1.3, cd: 1.05, price: 150, tier: 2 },
  streitaxt: { name: 'Streitaxt', slot: 'waffe', kind: 'axt', atk: 9, range: 1.2, cd: 1.35, price: 170, tier: 2 },
  langbogen: { name: 'Langbogen', slot: 'waffe', kind: 'bogen', atk: 7, range: 8, cd: 1.8, ranged: true, twoHanded: true, price: 190, tier: 2 },
  armbrust: { name: 'Armbrust', slot: 'waffe', kind: 'armbrust', atk: 10, range: 7, cd: 2.6, ranged: true, twoHanded: true, price: 210, tier: 2 },
  ritterschwert: { name: 'Ritterschwert', slot: 'waffe', kind: 'schwert', atk: 11, range: 1.35, cd: 1.0, price: 440, tier: 3 },
  kriegshammer: { name: 'Kriegshammer', slot: 'waffe', kind: 'hammer', atk: 14, range: 1.25, cd: 1.5, price: 480, tier: 3 },
  eibenbogen: { name: 'Eibenbogen', slot: 'waffe', kind: 'bogen', atk: 10, range: 9, cd: 1.7, ranged: true, twoHanded: true, price: 460, tier: 3 },

  gambeson: { name: 'Gambeson', slot: 'ruestung', def: 2, price: 30, tier: 1 },
  lederwams: { name: 'Lederwams', slot: 'ruestung', def: 3, price: 60, tier: 1 },
  kettenhemd: { name: 'Kettenhemd', slot: 'ruestung', def: 6, slow: 0.04, price: 230, tier: 2 },
  schuppenpanzer: { name: 'Schuppenpanzer', slot: 'ruestung', def: 8, slow: 0.08, price: 340, tier: 2 },
  kettenruestung: { name: 'Kettenrüstung mit Topfhelm', slot: 'ruestung', def: 12, slow: 0.1, price: 720, tier: 3 },

  holzschild: { name: 'Holzschild', slot: 'schild', def: 1, price: 15, tier: 1 },
  rundschild: { name: 'Rundschild', slot: 'schild', def: 2, price: 45, tier: 1 },
  drachenschild: { name: 'Normannischer Langschild', slot: 'schild', def: 4, price: 160, tier: 2 },
  wappenschild: { name: 'Wappenschild', slot: 'schild', def: 6, price: 390, tier: 3 },

  klepper: { name: 'Klepper', slot: 'pferd', speed: 0.45, atk: 1, def: 0, price: 120, tier: 1 },
  zelter: { name: 'Zelter', slot: 'pferd', speed: 0.7, atk: 1, def: 1, price: 320, tier: 2 },
  schlachtross: { name: 'Schlachtross', slot: 'pferd', speed: 0.55, atk: 4, def: 3, price: 950, tier: 3 },
};
export const SLOTS = ['waffe', 'ruestung', 'schild', 'pferd'];
export const SLOT_NAME = { waffe: 'Waffe', ruestung: 'Rüstung', schild: 'Schild', pferd: 'Pferd' };

// Was die Händler je Siedlungstyp anbieten
export const SHOPS = {
  stadt: ['kurzschwert', 'speer', 'kurzbogen', 'langschwert', 'streitaxt', 'armbrust', 'gambeson', 'lederwams', 'kettenhemd', 'holzschild', 'rundschild', 'drachenschild', 'klepper', 'zelter'],
  burg: ['langschwert', 'ritterschwert', 'kriegshammer', 'armbrust', 'kettenhemd', 'schuppenpanzer', 'kettenruestung', 'drachenschild', 'wappenschild', 'schlachtross'],
  halle: ['speer', 'streitaxt', 'kurzbogen', 'langbogen', 'gambeson', 'lederwams', 'rundschild', 'klepper'],
  dorf: ['knueppel', 'speer', 'kurzbogen', 'gambeson', 'holzschild', 'klepper'],
  abtei: ['gambeson', 'lederwams', 'holzschild', 'zelter'],
  markt: ['kurzschwert', 'langschwert', 'gambeson', 'kettenhemd', 'rundschild', 'drachenschild', 'wappenschild', 'klepper', 'zelter', 'schlachtross'],
  lager: ['kurzbogen', 'langbogen', 'eibenbogen', 'lederwams', 'speer'],
};

// ---------------------------------------------------------------- Einheiten
export const CLASSES = {
  ritter: { name: 'Ritter', hp: 70, atk: 6, def: 3, speed: 1.5 },
  reisiger: { name: 'Reisiger', hp: 55, atk: 5, def: 3, speed: 1.45, cost: 140, wage: 7, start: { waffe: 'kurzschwert', ruestung: 'lederwams', schild: 'rundschild' } },
  knecht: { name: 'Waffenknecht', hp: 48, atk: 4, def: 2, speed: 1.45, cost: 70, wage: 4, start: { waffe: 'speer', ruestung: 'gambeson', schild: 'holzschild' } },
  schuetze: { name: 'Bogenschütze', hp: 36, atk: 3, def: 1, speed: 1.5, bow: 1.4, cost: 80, wage: 5, start: { waffe: 'kurzbogen', ruestung: 'gambeson' } },
  waldlaeufer: { name: 'Langbogenschütze', hp: 40, atk: 4, def: 1, speed: 1.55, bow: 1.6, cost: 160, wage: 8, start: { waffe: 'langbogen', ruestung: 'lederwams' } },
  bauer: { name: 'Bauernbursche', hp: 32, atk: 3, def: 1, speed: 1.45, cost: 25, wage: 2, start: { waffe: 'knueppel' } },
  bandit: { name: 'Wegelagerer', hp: 30, atk: 3, def: 1, speed: 1.41 },
  soldat: { name: 'Soldat', hp: 46, atk: 4, def: 2, speed: 1.38 },
  zivil: { name: 'Zivilist', hp: 22, atk: 1, def: 0, speed: 1.2 },
};

// Vorlagen für Einheiten der KI-Gruppen
export const NPC_TYPES = {
  bandit: { cls: 'bandit', name: 'Wegelagerer', eq: { waffe: 'knueppel' }, lv: [1, 2], look: 'bandit' },
  bandit_bogen: { cls: 'bandit', name: 'Wilddieb', eq: { waffe: 'kurzbogen' }, lv: [1, 2], look: 'bandit' },
  bandit_boss: { cls: 'bandit', name: 'Bandenführer', eq: { waffe: 'kurzschwert', ruestung: 'lederwams', schild: 'holzschild' }, lv: [2, 4], look: 'bandit' },
  raubritter: { cls: 'ritter', name: 'Raubritter', eq: { waffe: 'langschwert', ruestung: 'kettenhemd', schild: 'drachenschild', pferd: 'klepper' }, lv: [2, 4], look: 'raubritter' },
  soeldner: { cls: 'soldat', name: 'Söldner', eq: { waffe: 'streitaxt', ruestung: 'lederwams' }, lv: [2, 3], look: 'raubritter' },
  soldat: { cls: 'soldat', name: 'Soldat', eq: { waffe: 'speer', ruestung: 'kettenhemd', schild: 'drachenschild' }, lv: [1, 3], look: 'soldat' },
  armbrust: { cls: 'soldat', name: 'Armbrustschütze', eq: { waffe: 'armbrust', ruestung: 'gambeson' }, lv: [1, 3], look: 'soldat' },
  vogt: { cls: 'zivil', name: 'Steuereintreiber', eq: { waffe: 'knueppel', pferd: 'klepper' }, lv: [1, 1], look: 'vogt' },
  haendler: { cls: 'zivil', name: 'Händler', eq: { pferd: 'klepper' }, lv: [1, 1], look: 'haendler' },
  wache: { cls: 'soldat', name: 'Söldnerwache', eq: { waffe: 'speer', ruestung: 'gambeson', schild: 'rundschild' }, lv: [1, 2], look: 'wache' },
  waldmann: { cls: 'waldlaeufer', name: 'Waldmann', eq: { waffe: 'langbogen', ruestung: 'lederwams' }, lv: [1, 3], look: 'wald' },
};

// Gruppen, die auf der Karte unterwegs sind
export const GROUP_TYPES = {
  banditen: {
    name: 'Wegelagerer', nom: 'Wegelagerer', acc: 'die Wegelagerer', pl: true, faction: null, hostile: true, members: [['bandit', 1, 3], ['bandit_bogen', 0, 1], ['bandit_boss', 0, 1]],
    gold: [15, 45], itemChance: 0.25, renown: 1, count: 7, spawn: 'wild', speed: 1.18,
  },
  raubritter: {
    name: 'Raubritter', nom: 'Raubritter', acc: 'die Raubritter', pl: true, faction: null, hostile: true, members: [['raubritter', 1, 1], ['soeldner', 1, 2], ['armbrust', 0, 1]],
    gold: [70, 150], itemChance: 0.6, renown: 4, count: 2, spawn: 'wild', speed: 1.24, minDay: 3,
  },
  patrouille: {
    name: 'Normannische Patrouille', nom: 'Eine normannische Patrouille', acc: 'die normannische Patrouille', pl: false, faction: 'normannen', members: [['soldat', 2, 3], ['armbrust', 1, 1]],
    gold: [25, 50], itemChance: 0.3, renown: 2, count: 3, spawn: 'patrol', speed: 1.24,
    kill: { normannen: -12, sachsen: 4, waldleute: 4 },
  },
  steuer: {
    name: 'Steuereintreiber', nom: 'Der Steuereintreiber und seine Wache', acc: 'den Steuereintreiber', pl: true, faction: 'normannen', members: [['vogt', 1, 1], ['soldat', 2, 3]],
    gold: [140, 240], itemChance: 0.2, renown: 3, count: 2, spawn: 'route', speed: 1.12,
    kill: { normannen: -18, sachsen: 8, waldleute: 10 },
  },
  haendler: {
    name: 'Händlerzug', nom: 'Der Händlerzug', acc: 'den Händlerzug', pl: false, faction: 'gilde', members: [['haendler', 1, 1], ['wache', 1, 2]],
    gold: [50, 110], goods: true, renown: 0, count: 3, spawn: 'route', speed: 1.12,
    kill: { gilde: -20, waldleute: 5 },
  },
  waldleute: {
    name: 'Waldleute', nom: 'Waldleute', acc: 'die Waldleute', pl: true, faction: 'waldleute', members: [['waldmann', 2, 3]],
    gold: [5, 25], renown: 2, count: 2, spawn: 'forest', speed: 1.3,
    kill: { waldleute: -15, normannen: 6 },
  },
};

// ---------------------------------------------------------------- Burg
// Stufe L eines Gebäudes braucht mindestens Burgstufe L-1.
export const BUILDINGS = {
  burg: {
    name: 'Burg', levels: [
      { name: 'Ruine', eff: 'Ein paar Mauerstümpfe und dein Zelt.' },
      { name: 'Holzburg', cost: { gold: 250, holz: 40 }, days: 2, eff: 'Palisade und Holzturm. Erlaubt Gebäude der Stufe 2.' },
      { name: 'Steinburg', cost: { gold: 900, holz: 30, stein: 80 }, days: 3, need: { renown: 25 }, eff: 'Steinmauern, Türme und ein Bergfried. Erlaubt Gebäude der Stufe 3.' },
      { name: 'Festung', cost: { gold: 2400, stein: 160, eisen: 40 }, days: 4, need: { renown: 70, allies: 1 }, eff: 'Eine Festung, die man im ganzen Norden kennt. +2 Gefolge.' },
    ],
  },
  halle: {
    name: 'Rittersaal', desc: 'Hier melden sich Leute, die dir dienen wollen.', levels: [
      null,
      { cost: { gold: 120, holz: 15 }, days: 1, eff: '3 Anwärter, Stufe 1 bis 2' },
      { cost: { gold: 350, holz: 30, stein: 20 }, days: 2, eff: '4 Anwärter, auch Reisige' },
      { cost: { gold: 800, stein: 50, eisen: 10 }, days: 3, eff: '5 erfahrene Anwärter' },
    ],
  },
  kaserne: {
    name: 'Unterkunft', desc: 'Schlafplätze und Übungsplatz. Mehr Leute können dich begleiten.', levels: [
      null,
      { cost: { gold: 100, holz: 25 }, days: 1, eff: 'Gefolge bis 4, Garnison übt (+6 EP am Tag)' },
      { cost: { gold: 300, holz: 30, stein: 25 }, days: 2, eff: 'Gefolge bis 6, +12 EP am Tag' },
      { cost: { gold: 700, stein: 60, eisen: 15 }, days: 3, eff: 'Gefolge bis 8, +18 EP am Tag' },
    ],
  },
  schmiede: {
    name: 'Schmiede', desc: 'Ein eigener Schmied fertigt Waffen und Rüstungen günstiger.', levels: [
      null,
      { cost: { gold: 140, holz: 10, eisen: 5 }, days: 1, eff: 'Ausrüstung der Güte 1, 15 % günstiger' },
      { cost: { gold: 380, stein: 25, eisen: 15 }, days: 2, eff: 'Ausrüstung der Güte 2' },
      { cost: { gold: 900, stein: 40, eisen: 40 }, days: 3, eff: 'Ausrüstung der Güte 3' },
    ],
  },
  stall: {
    name: 'Stallungen', desc: 'Pferde für dein Gefolge und Packtiere für den Handel.', levels: [
      null,
      { cost: { gold: 110, holz: 25 }, days: 1, eff: 'Klepper kaufen, +20 Ladung' },
      { cost: { gold: 320, holz: 40, stein: 10 }, days: 2, eff: 'Zelter kaufen, +40 Ladung' },
      { cost: { gold: 750, holz: 40, stein: 40 }, days: 3, eff: 'Schlachtrösser kaufen, +60 Ladung' },
    ],
  },
  holzfaeller: {
    name: 'Holzfällerlager', desc: 'Liefert jeden Tag Holz ins Burglager.', levels: [
      null,
      { cost: { gold: 80 }, days: 1, eff: '+6 Holz am Tag' },
      { cost: { gold: 220, holz: 20 }, days: 1, eff: '+12 Holz am Tag' },
      { cost: { gold: 500, holz: 30, stein: 20 }, days: 2, eff: '+18 Holz am Tag' },
    ],
  },
  steinbruch: {
    name: 'Steinbruch', desc: 'Steinmetze brechen Quader für Mauern und Türme.', levels: [
      null,
      { cost: { gold: 150, holz: 20 }, days: 1, eff: '+4 Stein am Tag' },
      { cost: { gold: 380, holz: 30 }, days: 2, eff: '+8 Stein am Tag' },
      { cost: { gold: 800, holz: 40, eisen: 10 }, days: 2, eff: '+12 Stein am Tag' },
    ],
  },
  markt: {
    name: 'Markt', desc: 'Händler kommen zu dir. Bringt Marktgeld und erlaubt Handel in der Burg.', levels: [
      null,
      { cost: { gold: 200, holz: 30 }, days: 1, eff: '+15 Gold am Tag, Handel in der Burg' },
      { cost: { gold: 500, holz: 30, stein: 30 }, days: 2, eff: '+35 Gold am Tag' },
      { cost: { gold: 1100, stein: 60 }, days: 3, eff: '+60 Gold am Tag' },
    ],
  },
  kapelle: {
    name: 'Kapelle', desc: 'Ein Ort für Gebet und Heilung.', levels: [
      null,
      { cost: { gold: 160, holz: 20, stein: 10 }, days: 1, eff: 'Verwundete heilen schneller, +1 Ruhm alle 3 Tage' },
      { cost: { gold: 420, stein: 40 }, days: 2, eff: '+1 Kirche-Ansehen alle 2 Tage' },
      { cost: { gold: 900, stein: 70, wein: 10 }, days: 3, eff: '+1 Ruhm am Tag' },
    ],
  },
  wehr: {
    name: 'Wachtürme', desc: 'Türme und Wachen schützen Ashcombe vor Überfällen.', levels: [
      null,
      { cost: { gold: 120, holz: 30 }, days: 1, eff: '+15 Verteidigung' },
      { cost: { gold: 350, stein: 40 }, days: 2, eff: '+35 Verteidigung' },
      { cost: { gold: 800, stein: 80, eisen: 20 }, days: 3, eff: '+60 Verteidigung' },
    ],
  },
};
export const BUILDING_IDS = Object.keys(BUILDINGS);

// Lage der Burggebäude relativ zur Burgmitte (in Kacheln)
export const CASTLE_LAYOUT = {
  halle: { dx: 2.0, dy: -1.6 },
  kaserne: { dx: -1.7, dy: 2.1 },
  schmiede: { dx: 7.0, dy: -2.4 },
  stall: { dx: 7.2, dy: 2.4 },
  kapelle: { dx: -3.0, dy: -7.2 },
  markt: { dx: 3.4, dy: 7.4 },
  holzfaeller: { dx: -7.6, dy: 1.0 },
  steinbruch: { dx: 3.4, dy: -7.6 },
  wehr: { dx: 6.4, dy: 6.4 },
};

// ---------------------------------------------------------------- Siedlungen
export const SETTLEMENTS = [
  { id: 'ashcombe', name: 'Ashcombe', type: 'spieler', faction: null, clear: 11, produces: [], demands: [],
    desc: 'Dein Erbe: ein verfallener Burgstall über dem Fluss. Der Vogt hat dir nur die Steine gelassen.' },
  { id: 'york', name: 'York', type: 'stadt', faction: 'gilde', clear: 8, produces: ['wolle', 'bier', 'salz'], demands: ['eisen', 'holz', 'wein'],
    desc: 'Die größte Stadt des Nordens. Flämische Wollhändler, Zünfte und ein Erzbischof, der überall mitredet.' },
  { id: 'doncaster', name: 'Doncaster', type: 'stadt', faction: 'normannen', clear: 8, produces: ['eisen', 'salz'], demands: ['getreide', 'wolle', 'bier'],
    desc: 'Sitz des Vogts. Hier wird Recht gesprochen, meist zugunsten der Barone.' },
  { id: 'ashby', name: 'Ashby', type: 'markt', faction: 'gilde', clear: 8, produces: ['wein', 'wolle'], demands: ['getreide', 'bier', 'holz'],
    desc: 'Marktflecken mit Turnierwiese. Wer Rang und Namen hat, zeigt sich hier.' },
  { id: 'rotherwood', name: 'Rotherwood', type: 'halle', faction: 'sachsen', clear: 7, produces: ['getreide', 'bier'], demands: ['wein', 'eisen', 'salz'],
    desc: 'Die Halle eines alten sächsischen Thans. Gastfreundlich gegenüber jedem, der keine normannischen Sporen trägt.' },
  { id: 'coningsburgh', name: 'Coningsburgh', type: 'burg', faction: 'sachsen', clear: 8, produces: ['stein', 'holz'], demands: ['wein', 'getreide', 'eisen'],
    desc: 'Mächtige Burg eines sächsischen Geschlechts, das noch immer von der alten Krone träumt.' },
  { id: 'torquilstone', name: 'Torquilstone', type: 'burg', faction: 'normannen', clear: 8, produces: ['eisen', 'stein'], demands: ['getreide', 'bier', 'wein'],
    desc: 'Die Feste eines gefürchteten normannischen Barons. Ihre Kerker sind berüchtigt.' },
  { id: 'tickhill', name: 'Tickhill', type: 'burg', faction: 'normannen', clear: 8, produces: ['stein', 'salz'], demands: ['getreide', 'wolle'],
    desc: 'Eine königliche Burg, von Prinz Johns Leuten besetzt.' },
  { id: 'jorvaulx', name: 'Abtei Jorvaulx', type: 'abtei', faction: 'kirche', clear: 7, produces: ['wolle', 'bier', 'wein'], demands: ['salz', 'getreide', 'stein'],
    desc: 'Eine reiche Zisterzienserabtei. Der Prior liebt guten Wein und die Jagd.' },
  { id: 'templestowe', name: 'Templestowe', type: 'abtei', faction: 'kirche', clear: 7, produces: ['wein', 'eisen'], demands: ['wolle', 'getreide', 'holz'],
    desc: 'Komturei eines Ritterordens. Streng, wohlhabend und politisch.' },
  { id: 'barnsdale', name: 'Lager im Barnsdale', type: 'lager', faction: 'waldleute', clear: 3, produces: ['wein', 'holz'], demands: ['getreide', 'salz', 'eisen'],
    desc: 'Ein verstecktes Lager tief im Wald. Wer hier sitzt, hat dem Gesetz der Barone abgeschworen.' },
  { id: 'wetherby', name: 'Wetherby', type: 'dorf', faction: 'sachsen', clear: 6, produces: ['getreide', 'holz'], demands: ['salz', 'eisen', 'bier'],
    desc: 'Ein sächsisches Bauerndorf am Waldrand.' },
  { id: 'hatfield', name: 'Hatfield', type: 'dorf', faction: 'normannen', clear: 6, produces: ['getreide', 'wolle'], demands: ['bier', 'salz', 'holz'],
    desc: 'Ein Dorf unter normannischer Grundherrschaft. Die Leute reden hier leise.' },
  { id: 'sheffield', name: 'Sheffield', type: 'dorf', faction: 'sachsen', clear: 6, produces: ['eisen', 'holz'], demands: ['getreide', 'wein'],
    desc: 'Köhler und Schmiede. Das Eisen von hier ist gut.' },
  { id: 'copmanhurst', name: 'Copmanhurst', type: 'dorf', faction: 'kirche', clear: 5, produces: ['bier', 'holz'], demands: ['wein', 'salz'],
    desc: 'Eine Einsiedelei mit ein paar Hütten. Der Klausner braut ein erstaunlich gutes Bier.' },
];

export const TYPE_NAME = {
  spieler: 'Dein Burgstall', stadt: 'Stadt', markt: 'Marktflecken', halle: 'Sächsische Halle', burg: 'Burg',
  abtei: 'Abtei', lager: 'Lager', dorf: 'Dorf',
};

// ---------------------------------------------------------------- Aussehen
export const LOOKS = {
  spieler: { tunic: '#2c4f86', trim: '#d8b54a' },
  gefolge: { tunic: '#4d74ad', trim: '#d8b54a' },
  bandit: { tunic: '#6b5a45', trim: '#3d3328', hood: '#4e4234' },
  raubritter: { tunic: '#2d2a28', trim: '#8c2f2a' },
  soldat: { tunic: '#a33b32', trim: '#e0d6c0' },
  vogt: { tunic: '#7d2a52', trim: '#d8b54a' },
  haendler: { tunic: '#3d6fa3', trim: '#e0c070' },
  wache: { tunic: '#556b7d', trim: '#c9c2b0' },
  wald: { tunic: '#3f6b2f', trim: '#2c4a20', hood: '#355a28' },
  bauer: { tunic: '#9a8461', trim: '#6e5c40' },
  moench: { tunic: '#6a5240', trim: '#3a2c22', hood: '#5c4636' },
};
export const PEASANT_TUNICS = ['#9a8461', '#8a6e4b', '#a8946a', '#7d6a55', '#94704a', '#b0a07a', '#8c5f45', '#6f7a55'];
export const HAIR = ['#3b2a1e', '#5a3d26', '#8a6a3a', '#c9a35a', '#2a2420', '#7a3a1e', '#9a9088'];

// ---------------------------------------------------------------- Namen
export const NAMES_M = ['Aelfric', 'Eadric', 'Wulfstan', 'Oswin', 'Godwin', 'Leofric', 'Edgar', 'Cuthbert', 'Osric', 'Aldhelm',
  'Beorn', 'Cenric', 'Dunstan', 'Hereward', 'Wat', 'Hob', 'Dickon', 'Tom', 'Jack', 'Will', 'Ranulf', 'Hugo', 'Raoul',
  'Gilbert', 'Renaud', 'Thibaut', 'Alain', 'Ivo', 'Walter', 'Simon', 'Roger', 'Odo', 'Ulf', 'Brand'];
export const NAMES_F = ['Aelfgifu', 'Edith', 'Godgifu', 'Hilda', 'Mildred', 'Wynflaed', 'Alys', 'Maud', 'Joan', 'Agnes', 'Emma', 'Matilda', 'Gytha', 'Eadgyth'];
export const EPITHETS = ['Langbein', 'Eisenhand', 'vom Moor', 'aus Wetherby', 'Schnellpfeil', 'Rabenhaar', 'Bärentatze', 'Krummnase',
  'von der Furt', 'Zweifinger', 'Steinbrecher', 'Flinkfinger', 'vom Weiher', 'Eichenherz', 'Graumantel', 'Rotbart', 'Hammerfaust', 'Kiesel'];
