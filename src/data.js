// Zentrale Spieldaten. Alles, was Balancing ist, steht hier.

export const TW = 64;            // Kachelbreite in Pixeln (isometrisch)
export const TH = 32;            // Kachelhöhe
export const MAP = 512;          // Kartengröße in Kacheln
export const CHUNK = 8;          // Kacheln pro Render-Chunk
export const HMAX = 52;          // größte Geländehöhe in Pixeln
export const DAY_LEN = 240;      // Sekunden Echtzeit pro Spieltag
export const DAYS_PER_SEASON = 6;
export const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
export const SAVE_KEY = 'a-knights-tale-v4';
export const SAVE_VERSION = 4;

// Die Karte bildet England, Wales und Nordfrankreich ab. Kachel x zeigt nach Osten, y nach Süden.
// Eine Kachel entspricht etwa 1,6 km. Längengrade sind mit cos(51,5°) gestaucht.
const LAT_N = 55.3, LAT_S = 47.9;
export const GEO = { lonW: -6.4, latN: LAT_N, dLat: (LAT_N - LAT_S) / MAP, dLon: (LAT_N - LAT_S) / MAP / 0.6225 };
export const KM_PER_TILE = GEO.dLat * 111.2;
// Maßstab gegenüber der ersten Fassung (320 Kacheln): Reichweiten in geo.js sind darauf bezogen
export const GEO_SCALE = MAP / 320;
export function geoToTile(lon, lat) { return { x: (lon - GEO.lonW) / GEO.dLon, y: (GEO.latN - lat) / GEO.dLat }; }

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
    name: 'Kaufmannsgilde', short: 'Gilde', color: '#9a4fc4', rivals: ['waldleute'],
    desc: 'Die Händler der Städte. Ihnen ist gleich, wer herrscht, solange die Straßen sicher sind.',
    ally: 'Bessere Preise auf allen Märkten, +15 Gold am Tag aus Handelsanteilen.',
  },
  waldleute: {
    name: 'Waldleute', short: 'Waldleute', color: '#8a7a3e', rivals: ['normannen', 'gilde'],
    desc: 'Geächtete, Wilderer und Enteignete. Sie leben in den Wäldern und hoffen auf König Richard.',
    ally: 'Wegelagerer meiden dich, im Rittersaal melden sich Langbogenschützen.',
  },
  franken: {
    name: 'Krone Frankreichs', short: 'Franzosen', color: '#3a56a8', rivals: ['normannen'],
    desc: 'König Philipp und seine Barone. Sie wollen die Normandie, solange Richard fern ist.',
    ally: 'Französische Häfen verlangen keinen Fährlohn, im Rittersaal melden sich Armbrustschützen.',
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
  fleisch: { name: 'Fleisch', base: 12 },
  felle: { name: 'Felle', base: 20 },
  blei: { name: 'Blei', base: 16 },
  zinn: { name: 'Zinn', base: 22 },
  silber: { name: 'Silber', base: 60 },
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
  armbruster: { name: 'Armbrustschütze', hp: 42, atk: 4, def: 2, speed: 1.4, bow: 1.3, cost: 150, wage: 8, start: { waffe: 'armbrust', ruestung: 'gambeson' } },
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
  freisasse: { cls: 'soldat', name: 'Freisasse', eq: { waffe: 'streitaxt', ruestung: 'gambeson', schild: 'rundschild' }, lv: [1, 3], look: 'sachsen' },
  sachs_bogen: { cls: 'soldat', name: 'Sächsischer Bogner', eq: { waffe: 'kurzbogen', ruestung: 'lederwams' }, lv: [1, 2], look: 'sachsen' },
  ritter_n: { cls: 'ritter', name: 'Normannischer Ritter', eq: { waffe: 'langschwert', ruestung: 'kettenhemd', schild: 'drachenschild', pferd: 'klepper' }, lv: [2, 3], look: 'soldat' },
  thane: { cls: 'ritter', name: 'Sächsischer Than', eq: { waffe: 'streitaxt', ruestung: 'kettenhemd', schild: 'rundschild', pferd: 'klepper' }, lv: [2, 3], look: 'sachsen' },
  sergent: { cls: 'soldat', name: 'Sergent', eq: { waffe: 'speer', ruestung: 'kettenhemd', schild: 'drachenschild' }, lv: [1, 3], look: 'franken' },
  arbaletrier: { cls: 'soldat', name: 'Arbalétrier', eq: { waffe: 'armbrust', ruestung: 'gambeson' }, lv: [1, 3], look: 'franken' },
  chevalier: { cls: 'ritter', name: 'Chevalier', eq: { waffe: 'langschwert', ruestung: 'kettenhemd', schild: 'wappenschild', pferd: 'zelter' }, lv: [2, 4], look: 'franken' },
};

// Gruppen, die auf der Karte unterwegs sind
export const GROUP_TYPES = {
  banditen: {
    name: 'Wegelagerer', nom: 'Wegelagerer', acc: 'die Wegelagerer', pl: true, faction: null, hostile: true, members: [['bandit', 1, 3], ['bandit_bogen', 0, 1], ['bandit_boss', 0, 1]],
    gold: [15, 45], itemChance: 0.25, renown: 1, count: 24, spawn: 'wild', speed: 1.18,
  },
  raubritter: {
    name: 'Raubritter', nom: 'Raubritter', acc: 'die Raubritter', pl: true, faction: null, hostile: true, members: [['raubritter', 1, 1], ['soeldner', 1, 2], ['armbrust', 0, 1]],
    gold: [70, 150], itemChance: 0.6, renown: 4, count: 7, spawn: 'wild', speed: 1.24, minDay: 3,
  },
  patrouille: {
    name: 'Normannische Patrouille', nom: 'Eine normannische Patrouille', acc: 'die normannische Patrouille', pl: false, faction: 'normannen', members: [['soldat', 2, 3], ['armbrust', 1, 1]],
    gold: [25, 50], itemChance: 0.3, renown: 2, count: 9, spawn: 'patrol', realms: ['en', 'nd', 'wa'], speed: 1.24,
    kill: { normannen: -12, sachsen: 4, waldleute: 4 },
  },
  steuer: {
    name: 'Steuereintreiber', nom: 'Der Steuereintreiber und seine Wache', acc: 'den Steuereintreiber', pl: true, faction: 'normannen', members: [['vogt', 1, 1], ['soldat', 2, 3]],
    gold: [140, 240], itemChance: 0.2, renown: 3, count: 6, spawn: 'route', speed: 1.12,
    kill: { normannen: -18, sachsen: 8, waldleute: 10 },
  },
  haendler: {
    name: 'Händlerzug', nom: 'Der Händlerzug', acc: 'den Händlerzug', pl: false, faction: 'gilde', members: [['haendler', 1, 1], ['wache', 1, 2]],
    gold: [50, 110], goods: true, renown: 0, count: 12, spawn: 'route', speed: 1.12,
    kill: { gilde: -20, waldleute: 5 },
  },
  waldleute: {
    name: 'Waldleute', nom: 'Waldleute', acc: 'die Waldleute', pl: true, faction: 'waldleute', members: [['waldmann', 2, 3]],
    gold: [5, 25], renown: 2, count: 5, spawn: 'forest', speed: 1.3,
    kill: { waldleute: -15, normannen: 6 },
  },
  sachsen: {
    name: 'Sächsische Freisassen', nom: 'Sächsische Freisassen', acc: 'die sächsischen Freisassen', pl: true, faction: 'sachsen', members: [['freisasse', 2, 3], ['sachs_bogen', 0, 1]],
    gold: [20, 50], itemChance: 0.3, renown: 2, count: 6, spawn: 'patrol', speed: 1.24, realms: ['en', 'wa'], siteFaction: 'sachsen',
    kill: { sachsen: -14, normannen: 5 },
  },
  // Heere für Schlacht-Ereignisse (je 50 Mann, bei wenig Leistung kleiner)
  heer_john: {
    name: 'Prinz Johns Heer', nom: 'Prinz Johns Heer', acc: 'Prinz Johns Heer', pl: false, faction: 'normannen', army: true,
    members: [['ritter_n', 6, 6], ['soldat', 20, 20], ['armbrust', 12, 12], ['soeldner', 12, 12]],
    gold: [320, 560], itemChance: 1, renown: 12, count: 0, spawn: 'army', speed: 1.05, realms: ['en', 'wa'],
    kill: { normannen: -14, sachsen: 12 },
  },
  heer_richard: {
    name: 'Das Heer der Getreuen König Richards', nom: 'Das Heer der Getreuen', acc: 'das Heer der Getreuen', pl: false, faction: 'sachsen', army: true,
    members: [['thane', 6, 6], ['freisasse', 22, 22], ['sachs_bogen', 14, 14], ['bandit', 8, 8]],
    gold: [260, 480], itemChance: 1, renown: 12, count: 0, spawn: 'army', speed: 1.05, realms: ['en', 'wa'],
    kill: { sachsen: -14, normannen: 12 },
  },
  heer_philipp: {
    name: 'König Philipps Heer', nom: 'König Philipps Heer', acc: 'König Philipps Heer', pl: false, faction: 'franken', army: true,
    members: [['chevalier', 6, 6], ['sergent', 22, 22], ['arbaletrier', 14, 14], ['soeldner', 8, 8]],
    gold: [320, 560], itemChance: 1, renown: 12, count: 0, spawn: 'army', speed: 1.05, realms: ['fr', 'fl', 'nd'],
    kill: { franken: -14, normannen: 12 },
  },
  heer_normandie: {
    name: 'Das normannische Aufgebot', nom: 'Das normannische Aufgebot', acc: 'das normannische Aufgebot', pl: false, faction: 'normannen', army: true,
    members: [['ritter_n', 6, 6], ['soldat', 20, 20], ['armbrust', 12, 12], ['soeldner', 12, 12]],
    gold: [300, 520], itemChance: 1, renown: 12, count: 0, spawn: 'army', speed: 1.05, realms: ['fr', 'fl', 'nd'],
    kill: { normannen: -14, franken: 12 },
  },
  // Besatzung einer belagerten Burg oder Stadt (Fraktion wird beim Aufstellen gesetzt)
  verteidiger: {
    name: 'Besatzung', nom: 'Die Besatzung', acc: 'die Besatzung', pl: false, faction: null, defender: true,
    members: [['wache', 6, 6]], gold: [40, 90], itemChance: 0.5, renown: 3, count: 0, spawn: 'none', speed: 1.1,
  },
  franzosen: {
    name: 'Französische Streife', nom: 'Eine französische Streife', acc: 'die französische Streife', pl: false, faction: 'franken', members: [['sergent', 2, 3], ['arbaletrier', 1, 1], ['chevalier', 0, 1]],
    gold: [30, 70], itemChance: 0.35, renown: 3, count: 7, spawn: 'patrol', speed: 1.22, realms: ['fr', 'fl', 'nd'],
    kill: { franken: -14, normannen: 6 },
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
      { name: 'Festung', cost: { gold: 2400, stein: 160, eisen: 40 }, days: 4, need: { renown: 70, allies: 1 }, eff: 'Eine Festung, die man in ganz England kennt. +2 Gefolge.' },
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
  felder: {
    name: 'Felder', desc: 'Äcker rund um die Burg. Sie ernähren dich, dein Gefolge und die Garnison.', levels: [
      null,
      { cost: { gold: 90, holz: 10 }, days: 1, eff: '+6 Getreide am Tag (im Frühling weniger, im Herbst mehr, im Winter nichts)' },
      { cost: { gold: 260, holz: 25 }, days: 1, eff: '+12 Getreide am Tag, eine Zehntscheune' },
      { cost: { gold: 600, holz: 30, stein: 30 }, days: 2, eff: '+18 Getreide am Tag, Windmühle: +10 Gold Mahlgeld' },
    ],
  },
  schafzucht: {
    name: 'Schafzucht', desc: 'Schafe auf eigener Weide. Wolle verkauft sich gut, dazu gibt es Fleisch.', levels: [
      null,
      { cost: { gold: 100, holz: 20 }, days: 1, eff: '6 Schafe, +4 Wolle am Tag' },
      { cost: { gold: 280, holz: 30 }, days: 1, eff: '10 Schafe, +8 Wolle und +2 Fleisch am Tag' },
      { cost: { gold: 620, holz: 30, stein: 20 }, days: 2, eff: '14 Schafe, +12 Wolle, +4 Fleisch und +1 Fell am Tag' },
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
      { cost: { gold: 160, holz: 20, stein: 10 }, days: 1, eff: '+1 Ruhm alle 3 Tage' },
      { cost: { gold: 420, stein: 40 }, days: 2, eff: '+1 Kirche-Ansehen alle 2 Tage' },
      { cost: { gold: 900, stein: 70, wein: 10 }, days: 3, eff: '+1 Ruhm am Tag' },
    ],
  },
  hospiz: {
    name: 'Hospiz', desc: 'Kräuter, Betten und Pflege. Verwundete kommen schneller wieder auf die Beine.', levels: [
      null,
      { cost: { gold: 120, holz: 20 }, days: 1, eff: 'Verwundete heilen doppelt so schnell. In der Burg kommst du rasch wieder zu Kräften.' },
      { cost: { gold: 340, holz: 20, stein: 25, wolle: 10 }, days: 2, eff: 'Verwundete heilen dreimal so schnell. Ein Feldscher reist mit: unterwegs heilt ihr um die Hälfte schneller.' },
      { cost: { gold: 780, stein: 50, wein: 10 }, days: 3, eff: 'Spital: Verwundete heilen viermal so schnell, unterwegs heilt ihr doppelt so schnell.' },
    ],
  },
  wehr: {
    name: 'Wachtürme', desc: 'Türme und Wachen schützen deine Burg vor Überfällen.', levels: [
      null,
      { cost: { gold: 120, holz: 30 }, days: 1, eff: '+15 Verteidigung, ein Turm mit Bogenschützen' },
      { cost: { gold: 350, stein: 40 }, days: 2, eff: '+35 Verteidigung, zwei Türme schießen schärfer' },
      { cost: { gold: 800, stein: 80, eisen: 20 }, days: 3, eff: '+60 Verteidigung, drei Türme mit Armbrüsten' },
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
  hospiz: { dx: -7.6, dy: -3.4 },
  schafzucht: { dx: -6.8, dy: 6.0 },
  felder: { dx: -3.4, dy: 8.9 },
};
// Wachtürme der eigenen Burg (relativ zur Burgmitte), in der Reihenfolge des Ausbaus
export const CASTLE_TOWERS = [[6.4, 6.4], [-6.4, -6.4], [6.4, -6.4]];
// Kampfbonus innerhalb der eigenen Mauern je Burgstufe (Anteil an Angriff und Abwehr)
export const CASTLE_BONUS = [{ atk: 0, def: 0.1 }, { atk: 0.1, def: 0.25 }, { atk: 0.2, def: 0.5 }, { atk: 0.3, def: 0.8 }];
// Verpflegung: Waren, die als Nahrung zählen, und Preis für Zukauf je Ration
export const FOOD_GOODS = ['getreide', 'fleisch'];
export const FOOD_PRICE = 3;

// ---------------------------------------------------------------- Siedlungen
export const SETTLEMENTS = [
  // ---------------- England (in Yorkshire etwas auseinandergezogen, damit jeder Ort Platz hat)
  { id: 'ashcombe', name: 'Ashcombe', type: 'spieler', faction: null, clear: 11, realm: 'en', lon: -1.81, lat: 53.62, produces: [], demands: [],
    desc: 'Dein Erbe: ein verfallener Burgstall am Rand der Pennines. Der Vogt hat dir nur die Steine gelassen.' },
  { id: 'york', name: 'York', type: 'stadt', cityR: 15, faction: 'gilde', clear: 8, realm: 'en', lon: -0.95, lat: 54.05, landmarks: [{ kind: 'kathedrale', name: 'York Minster', len: 4.2, westTowers: 2, central: 'turm' }, { kind: 'motte', name: 'Burghügel von York', wooden: true }], produces: ['wolle', 'bier', 'salz'], demands: ['eisen', 'holz', 'wein', 'fleisch', 'felle', 'blei'],
    desc: 'Die größte Stadt des Nordens. Flämische Wollhändler, Zünfte und ein Erzbischof, der überall mitredet.' },
  { id: 'london', name: 'London', type: 'stadt', cityR: 22, faction: 'gilde', clear: 9, realm: 'en', lon: -0.10, lat: 51.51, port: true, landmarks: [{ kind: 'tower', name: 'Tower von London', near: 'dock' }, { kind: 'kathedrale', name: 'St Paul\'s', len: 4.6, spire: true }], produces: ['wein', 'salz', 'eisen'], demands: ['wolle', 'getreide', 'fleisch', 'felle', 'holz', 'zinn'],
    desc: 'Die reichste Stadt des Reiches, mit dem Tower und dem Hafen an der Themse. Von hier segeln die Wollschiffe nach Brügge.' },
  { id: 'nottingham', name: 'Nottingham', type: 'burg', faction: 'normannen', clear: 8, realm: 'en', lon: -1.18, lat: 52.91, produces: ['eisen', 'stein'], demands: ['getreide', 'bier', 'wein', 'fleisch'],
    desc: 'Die Burg des Sheriffs auf dem Sandsteinfelsen. Prinz Johns Leute halten sie noch immer.' },
  { id: 'torquilstone', name: 'Torquilstone', type: 'burg', faction: 'normannen', clear: 8, realm: 'en', lon: -0.38, lat: 53.86, produces: ['eisen', 'stein'], demands: ['getreide', 'bier', 'wein', 'fleisch'],
    desc: 'Die Feste eines gefürchteten normannischen Barons. Ihre Kerker sind berüchtigt.' },
  { id: 'rotherwood', name: 'Rotherwood', type: 'halle', faction: 'sachsen', clear: 7, realm: 'en', lon: -1.95, lat: 53.05, produces: ['getreide', 'bier'], demands: ['wein', 'eisen', 'salz', 'fleisch'],
    desc: 'Die Halle eines alten sächsischen Thans. Gastfreundlich gegenüber jedem, der keine normannischen Sporen trägt.' },
  { id: 'newforest', name: 'Lager im New Forest', type: 'lager', faction: 'waldleute', clear: 3, realm: 'en', lon: -1.62, lat: 50.86, produces: ['holz', 'fleisch', 'felle'], demands: ['getreide', 'salz', 'bier'],
    desc: 'Tief im königlichen Forst, wo einst ein König vom Pfeil getroffen starb. Die Förster kommen nur zu zehnt hierher.' },
  { id: 'jorvaulx', name: 'Abtei Jorvaulx', type: 'abtei', faction: 'kirche', clear: 7, realm: 'en', lon: -1.85, lat: 54.42, produces: ['wolle', 'bier', 'wein'], demands: ['salz', 'getreide', 'stein'],
    desc: 'Eine reiche Zisterzienserabtei. Der Prior liebt guten Wein und die Jagd.' },
  { id: 'ashby', name: 'Ashby', type: 'markt', faction: 'gilde', clear: 8, realm: 'en', lon: -1.47, lat: 52.75, produces: ['wein', 'wolle'], demands: ['getreide', 'bier', 'holz', 'fleisch'],
    desc: 'Marktflecken mit Turnierwiese. Wer Rang und Namen hat, zeigt sich hier.' },
  // Mittel- und Ostengland
  { id: 'warwick', name: 'Warwick', type: 'burg', faction: 'normannen', clear: 7, realm: 'en', lon: -1.58, lat: 52.28, produces: ['eisen', 'wolle'], demands: ['wein', 'getreide', 'salz'],
    desc: 'Die Burg der Grafen von Warwick hoch über dem Avon. Ringsum liegt der Forst von Arden.' },
  { id: 'northampton', name: 'Northampton', type: 'markt', faction: 'gilde', clear: 7, realm: 'en', lon: -0.90, lat: 52.24, produces: ['felle', 'wolle'], demands: ['eisen', 'salz', 'wein'],
    desc: 'Gerber und Schuhmacher, eine Burg des Königs und eine runde Kirche nach dem Vorbild des Heiligen Grabes.' },
  { id: 'bedford', name: 'Bedford', type: 'dorf', faction: 'sachsen', clear: 6, realm: 'en', lon: -0.47, lat: 52.14, produces: ['getreide', 'fleisch'], demands: ['salz', 'eisen', 'bier'],
    desc: 'Ein Dorf an der Great Ouse zwischen Weiden und Kornfeldern. Die Bauern hier haben die Normannen nie gemocht.' },
  { id: 'stamford', name: 'Stamford', type: 'markt', faction: 'gilde', clear: 7, realm: 'en', lon: -0.48, lat: 52.65, produces: ['wolle', 'getreide'], demands: ['wein', 'eisen', 'holz'],
    desc: 'Berühmt für sein feines Wolltuch und die große Fastenmesse. Kaufleute aus Flandern kommen jedes Jahr.' },
  { id: 'lynn', name: 'Lynn', type: 'markt', faction: 'gilde', clear: 7, realm: 'en', lon: 0.40, lat: 52.75, port: true, produces: ['salz', 'fleisch'], demands: ['wolle', 'getreide', 'holz'],
    desc: 'Hafen des Bischofs an der Wash. Schiffe aus Norwegen und Flandern bringen Pelze und Wachs und laden Korn und Wolle.' },
  { id: 'bury', name: 'Bury St Edmunds', type: 'markt', faction: 'kirche', clear: 7, realm: 'en', lon: 0.71, lat: 52.25, landmarks: [{ kind: 'kathedrale', name: 'Abtei des heiligen Edmund', len: 4.0, westTowers: 1, central: 'turm' }], produces: ['wolle', 'bier'], demands: ['wein', 'salz', 'eisen'],
    desc: 'Um die mächtige Abtei des heiligen Edmund wächst eine reiche Marktstadt. Pilger kommen von überall her.' },
  { id: 'worcester', name: 'Worcester', type: 'stadt', faction: 'kirche', clear: 8, realm: 'en', lon: -2.22, lat: 52.19, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Worcester', len: 3.8, central: 'turm' }], produces: ['getreide', 'salz'], demands: ['wein', 'eisen', 'felle'],
    desc: 'Bischofsstadt am Severn. Salz aus den Siedepfannen von Droitwich geht von hier ins ganze Land.' },
  { id: 'gloucester', name: 'Gloucester', type: 'burg', faction: 'normannen', clear: 7, realm: 'en', lon: -2.24, lat: 51.86, produces: ['eisen', 'holz'], demands: ['wein', 'getreide', 'salz'],
    desc: 'Königliche Burg am Severn. Aus dem Forest of Dean kommen Eisen und Holz, und manchmal Wilderer.' },
  { id: 'dorchester', name: 'Dorchester', type: 'dorf', faction: 'sachsen', clear: 6, realm: 'en', lon: -2.44, lat: 50.72, produces: ['wolle', 'fleisch'], demands: ['salz', 'eisen', 'wein'],
    desc: 'Ein Dorf in den Hügeln von Dorset, unter den grasbewachsenen Wällen einer uralten Burg. Hier zählt man noch nach Schafen.' },
  // Erzgruben: Erz direkt kaufen oder einen Anteil pachten
  { id: 'dean', name: 'Eisengruben im Forest of Dean', type: 'mine', ore: 'eisen', faction: 'normannen', clear: 4, realm: 'en', lon: -2.55, lat: 51.80, produces: ['eisen', 'holz'], demands: ['getreide', 'bier', 'fleisch'],
    desc: 'Im Königsforst graben freie Bergleute nach Eisenerz, wie ihre Väter seit Römerzeiten. Ihre Rechte verteidigen sie zäh.' },
  { id: 'weald', name: 'Eisengruben im Weald', type: 'mine', ore: 'eisen', faction: 'sachsen', clear: 4, realm: 'en', lon: 0.20, lat: 51.03, produces: ['eisen', 'holz'], demands: ['getreide', 'bier', 'salz'],
    desc: 'Rauch steigt aus den Rennöfen im Wald. Die Köhler und Erzgräber hier sprechen noch die alte Sprache.' },
  { id: 'peak', name: 'Bleigruben im Peak', type: 'mine', ore: 'blei', faction: 'normannen', clear: 4, realm: 'en', lon: -1.78, lat: 53.33, produces: ['blei', 'stein'], demands: ['getreide', 'bier', 'holz'],
    desc: 'Unter der Burg im Peak bricht man Bleiglanz. Das Blei deckt die Dächer der Kathedralen von Lincoln bis Canterbury.' },
  { id: 'alston', name: 'Silbergruben von Alston', type: 'mine', ore: 'silber', faction: 'normannen', clear: 4, realm: 'en', lon: -2.44, lat: 54.81, produces: ['silber', 'blei'], demands: ['getreide', 'fleisch', 'bier', 'holz'],
    desc: 'Die Silbergruben des Königs im kahlen Hochmoor. Aus ihrem Erz wird in Carlisle Münzgeld geschlagen.' },
  { id: 'dartmoor', name: 'Zinngruben im Dartmoor', type: 'mine', ore: 'zinn', faction: 'normannen', clear: 4, realm: 'en', lon: -3.95, lat: 50.55, produces: ['zinn'], demands: ['getreide', 'bier', 'salz'],
    desc: 'Zinnwäscher im Moor. Sie stehen unter eigenem Recht und zahlen ihren Zoll direkt an den König.' },
  { id: 'ferriere', name: 'Eisengruben von Ferrière', type: 'mine', ore: 'eisen', faction: 'normannen', clear: 4, realm: 'nd', lon: 0.80, lat: 48.95, produces: ['eisen'], demands: ['getreide', 'wein', 'holz'],
    desc: 'Das Eisen der Normandie: Schmiede aus der ganzen Gegend kaufen hier ihr Luppeneisen.' },
  // Mystische Orte: Einsiedler an heiligen Quellen, alten Steinen und Höhlen
  { id: 'knaresborough', name: 'Höhle des heiligen Robert', type: 'einsiedelei', feature: 'hoehle', faction: 'kirche', clear: 3, realm: 'en', lon: -1.46, lat: 54.00, produces: [], demands: [],
    desc: 'Ein frommer Einsiedler lebt in einer Felshöhle am Fluss. Die Armen kommen zu ihm, die Reichen fürchten seine Worte.' },
  { id: 'cratcliffe', name: 'Einsiedlerhöhle am Cratcliffe', type: 'einsiedelei', feature: 'hoehle', faction: 'kirche', clear: 3, realm: 'en', lon: -1.66, lat: 53.16, produces: [], demands: [],
    desc: 'Unter einer Felswand hat ein Eremit ein Kreuz in den Stein gehauen. Wanderer bringen ihm Brot und erbitten seinen Segen.' },
  { id: 'wayland', name: 'Wielands Schmiede', type: 'einsiedelei', feature: 'grab', faction: 'kirche', clear: 3, realm: 'en', lon: -1.60, lat: 51.57, produces: [], demands: [],
    desc: 'Ein uraltes Hügelgrab am Ridgeway. Wer sein Pferd hier über Nacht lässt und eine Münze dazulegt, findet es am Morgen beschlagen, sagt man.' },
  { id: 'avebury', name: 'Steinkreis von Avebury', type: 'einsiedelei', feature: 'steine', faction: 'kirche', clear: 3, realm: 'en', lon: -1.85, lat: 51.41, produces: [], demands: [],
    desc: 'Ein riesiger Kreis aus grauen Steinen, älter als jede Kirche. Ein alter Mann wacht über ihn und weiß Dinge, die er nicht wissen dürfte.' },
  { id: 'longmeg', name: 'Long Meg und ihre Töchter', type: 'einsiedelei', feature: 'steine', faction: 'kirche', clear: 3, realm: 'en', lon: -2.67, lat: 54.73, produces: [], demands: [],
    desc: 'Eine Hexe und ihr Hexenzirkel, zu Stein verwandelt, so erzählt man im Tal. Zählt man die Steine zweimal, kommt nie dieselbe Zahl heraus.' },
  { id: 'holywell', name: 'Quelle der heiligen Winefride', type: 'einsiedelei', feature: 'quelle', faction: 'kirche', clear: 3, realm: 'wa', lon: -3.22, lat: 53.27, produces: [], demands: [],
    desc: 'Wo das Haupt der Heiligen fiel, sprang eine Quelle auf. Pilger baden darin und hoffen auf Heilung.' },
  { id: 'grimes', name: 'Teufelslöcher von Grimes', type: 'einsiedelei', feature: 'grab', faction: 'kirche', clear: 3, realm: 'en', lon: 0.67, lat: 52.48, produces: [], demands: [],
    desc: 'Hunderte alte Gruben in der Heide, von Riesen gegraben, sagen die Leute. Ein Einsiedler hält dort Wache gegen den Teufel.' },
  { id: 'broceliande', name: 'Quelle von Barenton', type: 'einsiedelei', feature: 'quelle', faction: 'kirche', clear: 3, realm: 'fr', lon: -2.2, lat: 48.02, produces: [], demands: [],
    desc: 'Tief im Wald von Brocéliande. Gießt man Wasser auf den Stein am Brunnen, so zieht ein Sturm auf. Hier soll Merlin geschlafen haben.' },
  { id: 'fontainebleau', name: 'Klause im Wald von Bière', type: 'einsiedelei', feature: 'eibe', faction: 'kirche', clear: 3, realm: 'fr', lon: 2.70, lat: 48.40, produces: [], demands: [],
    desc: 'Unter einer uralten Eibe zwischen Sandsteinfelsen lebt ein Einsiedler, der einst Ritter war. Er spricht nicht über seine Vergangenheit.' },
  { id: 'lincoln', name: 'Lincoln', type: 'stadt', faction: 'kirche', clear: 8, realm: 'en', lon: -0.48, lat: 53.21, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Lincoln', len: 4.4, westTowers: 2, central: 'turm', scaffold: true }], produces: ['wolle', 'getreide', 'bier'], demands: ['wein', 'eisen', 'stein', 'felle', 'blei'],
    desc: 'Die Kathedrale über der Stadt ist das höchste Bauwerk der Christenheit. Der Bischof ist ein Freund des Königs.' },
  { id: 'durham', name: 'Durham', type: 'abtei', faction: 'kirche', clear: 7, realm: 'en', lon: -1.57, lat: 54.78, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Durham', len: 4.0, westTowers: 2, central: 'turm' }], produces: ['stein', 'wolle'], demands: ['wein', 'getreide', 'salz'],
    desc: 'Dom und Burg des Fürstbischofs hoch über der Flussschleife. Wer hier Zuflucht sucht, ist sicher.' },
  { id: 'carlisle', name: 'Carlisle', type: 'burg', faction: 'normannen', clear: 8, realm: 'en', lon: -2.93, lat: 54.89, produces: ['wolle', 'felle'], demands: ['getreide', 'wein', 'eisen', 'bier'],
    desc: 'Grenzfeste gegen die Schotten. Die Besatzung ist rau und schlecht bezahlt.' },
  { id: 'chester', name: 'Chester', type: 'burg', faction: 'normannen', clear: 8, realm: 'en', lon: -2.89, lat: 53.19, produces: ['salz', 'stein'], demands: ['getreide', 'wein', 'fleisch'],
    desc: 'Der Graf von Chester hält die Grenze zu Wales. Sein Salz kommt aus Cheshire.' },
  { id: 'norwich', name: 'Norwich', type: 'stadt', faction: 'gilde', clear: 8, realm: 'en', lon: 1.30, lat: 52.63, produces: ['wolle', 'getreide', 'salz'], demands: ['holz', 'eisen', 'wein', 'fleisch'],
    desc: 'Wollstadt im flachen Osten. Die Weber hier sind die besten des Landes.' },
  { id: 'ely', name: 'Ely', type: 'abtei', faction: 'kirche', clear: 7, realm: 'en', lon: 0.26, lat: 52.40, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Ely', len: 4.4, westTowers: 1, central: 'turm' }], produces: ['getreide', 'bier', 'fleisch'], demands: ['stein', 'holz', 'salz'],
    desc: 'Die Insel in den Fens. Mönche, Aale und Schilf, so weit das Auge reicht.' },
  { id: 'oxford', name: 'Oxford', type: 'markt', faction: 'gilde', clear: 8, realm: 'en', lon: -1.26, lat: 51.75, produces: ['bier', 'wolle'], demands: ['wein', 'salz', 'fleisch', 'holz'],
    desc: 'Marktstadt an der Themse, wo neuerdings Magister Latein und Logik lehren.' },
  { id: 'bristol', name: 'Bristol', type: 'stadt', faction: 'gilde', clear: 8, realm: 'en', lon: -2.59, lat: 51.45, produces: ['wein', 'felle', 'eisen'], demands: ['getreide', 'wolle', 'bier'],
    desc: 'Hafenstadt am Avon. Wein aus der Gascogne, Felle aus Irland.' },
  { id: 'winchester', name: 'Winchester', type: 'stadt', faction: 'normannen', clear: 8, realm: 'en', lon: -1.31, lat: 51.06, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Winchester', len: 4.8, central: 'stumpf' }], produces: ['wein', 'eisen'], demands: ['getreide', 'fleisch', 'wolle', 'holz'],
    desc: 'Die alte Königsstadt mit dem Schatz der Krone. Hier wird Richard ein zweites Mal gekrönt.' },
  { id: 'portsmouth', name: 'Portsmouth', type: 'dorf', faction: 'normannen', clear: 6, realm: 'en', lon: -1.02, lat: 50.82, port: true, produces: ['salz', 'holz'], demands: ['getreide', 'bier', 'fleisch'],
    desc: 'Hafen am Solent. Von hier setzen die Heere nach Barfleur über.' },
  { id: 'canterbury', name: 'Canterbury', type: 'abtei', faction: 'kirche', clear: 7, realm: 'en', lon: 0.72, lat: 51.27, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Canterbury', len: 4.4, westTowers: 2, central: 'turm' }], produces: ['wein', 'bier'], demands: ['wolle', 'getreide', 'stein', 'blei'],
    desc: 'Pilger aus aller Welt kommen zum Grab des heiligen Thomas.' },
  { id: 'dover', name: 'Dover', type: 'burg', faction: 'normannen', clear: 7, realm: 'en', lon: 1.30, lat: 51.13, port: true, castleLevel: 3, produces: ['stein', 'salz'], demands: ['getreide', 'wein', 'fleisch'],
    desc: 'Die Burg über den Kreidefelsen wacht über die kürzeste Überfahrt nach Frankreich.' },
  { id: 'exeter', name: 'Exeter', type: 'markt', faction: 'sachsen', clear: 7, realm: 'en', lon: -3.53, lat: 50.72, produces: ['wolle', 'felle', 'eisen'], demands: ['wein', 'salz', 'getreide'],
    desc: 'Marktstadt im Westen. Zinn aus Cornwall und Wolle aus Devon wechseln hier den Besitzer.' },
  { id: 'scarborough', name: 'Scarborough', type: 'burg', faction: 'normannen', clear: 7, realm: 'en', lon: -0.42, lat: 54.27, castleLevel: 3, produces: ['salz', 'fleisch'], demands: ['getreide', 'bier', 'holz'],
    desc: 'Die Königsburg auf der Landzunge über der Nordsee. Unten im Hafen trocknen Heringe.' },
  { id: 'lancaster', name: 'Lancaster', type: 'burg', faction: 'normannen', clear: 7, realm: 'en', lon: -2.80, lat: 54.05, produces: ['wolle', 'felle'], demands: ['wein', 'salz', 'eisen'],
    desc: 'Burg und Gericht im Nordwesten. Die Grafschaft gehört Prinz John, und seine Leute führen sich auch so auf.' },
  { id: 'keswick', name: 'Keswick', type: 'dorf', faction: 'sachsen', clear: 6, realm: 'en', lon: -3.13, lat: 54.60, produces: ['wolle', 'fleisch', 'felle'], demands: ['getreide', 'salz', 'bier'],
    desc: 'Ein Schäferdorf zwischen den Seen und Bergen des Nordwestens. Hier zählt man die Schafe noch auf die alte Weise.' },
  { id: 'shrewsbury', name: 'Shrewsbury', type: 'markt', faction: 'gilde', clear: 7, realm: 'en', lon: -2.75, lat: 52.71, produces: ['wolle', 'felle'], demands: ['wein', 'salz', 'eisen'],
    desc: 'Marktstadt in der Severnschleife. Walisische Viehtreiber und englische Wollhändler feilschen hier um jeden Penny.' },
  { id: 'hereford', name: 'Hereford', type: 'abtei', faction: 'kirche', clear: 7, realm: 'en', lon: -2.72, lat: 52.06, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Hereford', len: 3.8, central: 'turm', color: '#b8826a' }], produces: ['getreide', 'bier', 'wolle'], demands: ['wein', 'salz', 'stein'],
    desc: 'Bischofssitz an der walisischen Grenze. Die Kathedrale aus rotem Sandstein ist weithin zu sehen.' },
  { id: 'glastonbury', name: 'Glastonbury', type: 'abtei', faction: 'kirche', clear: 7, realm: 'en', lon: -2.72, lat: 51.15, landmarks: [{ kind: 'kathedrale', name: 'Abtei Glastonbury (im Wiederaufbau)', len: 4.0, westTowers: 1, burned: true, scaffold: true }, { kind: 'tor', name: 'Glastonbury Tor' }], produces: ['wein', 'wolle'], demands: ['stein', 'holz', 'eisen'],
    desc: 'Die älteste Abtei Englands brannte vor zehn Jahren nieder. Seit die Mönche hier das Grab von König Artus gefunden haben, strömen Pilger und Spenden herbei.' },
  { id: 'sarum', name: 'Old Sarum', type: 'abtei', faction: 'kirche', clear: 7, realm: 'en', lon: -1.80, lat: 51.09, landmarks: [{ kind: 'kathedrale', name: 'Dom von Old Sarum', len: 3.6, central: 'turm' }, { kind: 'motte', name: 'Burghügel von Sarum' }], produces: ['wolle', 'getreide'], demands: ['wein', 'holz', 'salz'],
    desc: 'Burg und Dom teilen sich einen windigen Hügel. Die Domherren klagen über die Soldaten und über das fehlende Wasser.' },
  { id: 'windsor', name: 'Windsor', type: 'burg', faction: 'normannen', clear: 8, realm: 'en', lon: -0.60, lat: 51.48, castleLevel: 3, produces: ['holz', 'fleisch'], demands: ['getreide', 'wein', 'eisen'],
    desc: 'Die königliche Burg über der Themse. Prinz Johns Männer halten sie noch, Richards Getreue liegen davor.' },
  { id: 'colchester', name: 'Colchester', type: 'burg', faction: 'normannen', clear: 8, realm: 'en', lon: 0.90, lat: 51.89, castleLevel: 3, produces: ['salz', 'wolle'], demands: ['holz', 'wein', 'eisen'],
    desc: 'Der größte Bergfried des Reiches, gebaut auf den Grundmauern eines römischen Tempels.' },
  { id: 'battle', name: 'Battle', type: 'abtei', faction: 'kirche', clear: 6, realm: 'en', lon: 0.49, lat: 50.92, landmarks: [{ kind: 'kathedrale', name: 'Battle Abbey', len: 3.4, central: 'turm' }], produces: ['wein', 'getreide'], demands: ['stein', 'salz', 'eisen'],
    desc: 'Die Abtei steht dort, wo König Harold 1066 fiel. Der Hochaltar markiert die Stelle.' },
  { id: 'bodmin', name: 'Bodmin', type: 'dorf', faction: 'sachsen', clear: 6, realm: 'en', lon: -4.72, lat: 50.47, produces: ['eisen', 'salz'], demands: ['getreide', 'wein', 'bier'],
    desc: 'Ein Ort der Zinnbergleute im Moor von Cornwall. Man spricht hier Kornisch und misstraut jedem Fremden.' },
  // ---------------- Wales
  { id: 'stdavids', name: 'St Davids', type: 'abtei', faction: 'kirche', clear: 6, realm: 'wa', lon: -5.20, lat: 51.89, produces: ['wolle', 'fleisch'], demands: ['wein', 'eisen', 'getreide'],
    desc: 'Die Kathedrale am Ende der Welt. Zwei Pilgerfahrten hierher wiegen eine nach Rom auf.' },
  { id: 'brecon', name: 'Brecon', type: 'halle', faction: 'sachsen', clear: 6, realm: 'wa', lon: -3.39, lat: 51.95, produces: ['wolle', 'fleisch', 'felle'], demands: ['salz', 'eisen', 'wein'],
    desc: 'Halle eines walisischen Fürsten in den Bergen. Man spricht hier nicht gern Französisch.' },
  { id: 'pembroke', name: 'Pembroke', type: 'burg', faction: 'normannen', clear: 7, realm: 'wa', lon: -4.92, lat: 51.67, produces: ['wolle', 'fleisch'], demands: ['wein', 'getreide', 'eisen'],
    desc: 'Die Burg des Marschalls am Ende von Wales. Von hier segeln die Normannen nach Irland.' },
  { id: 'cardiff', name: 'Cardiff', type: 'burg', faction: 'normannen', clear: 7, realm: 'wa', lon: -3.18, lat: 51.48, produces: ['eisen', 'stein'], demands: ['getreide', 'wein', 'bier'],
    desc: 'Eine normannische Burg über dem Taff. Die walisischen Fürsten in den Bergen warten auf ihre Gelegenheit.' },
  { id: 'dolwyddelan', name: 'Dolwyddelan', type: 'halle', faction: 'sachsen', clear: 6, realm: 'wa', lon: -3.88, lat: 53.05, produces: ['fleisch', 'felle', 'wolle'], demands: ['salz', 'wein', 'eisen'],
    desc: 'Der Hof eines walisischen Fürsten am Fuß des Snowdon. Harfner singen hier von alten Siegen über die Engländer.' },
  // ---------------- Normandie
  { id: 'barfleur', name: 'Barfleur', type: 'dorf', faction: 'normannen', clear: 6, realm: 'nd', lon: -1.32, lat: 49.62, port: true, produces: ['salz', 'fleisch'], demands: ['wolle', 'eisen', 'bier'],
    desc: 'Fischerhafen an der Spitze des Cotentin. Hier landen die Könige von England.' },
  { id: 'caen', name: 'Caen', type: 'burg', faction: 'normannen', clear: 8, realm: 'nd', lon: -0.36, lat: 49.18, produces: ['stein', 'getreide'], demands: ['wein', 'wolle', 'eisen'],
    desc: 'Die Burg des Eroberers. Der Kalkstein von Caen steckt in halb England.' },
  { id: 'rouen', name: 'Rouen', type: 'stadt', cityR: 14, faction: 'normannen', clear: 8, realm: 'nd', lon: 1.10, lat: 49.44, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Rouen', len: 4.2, westTowers: 2, central: 'spitze' }], produces: ['wein', 'salz', 'eisen'], demands: ['wolle', 'getreide', 'holz', 'fleisch', 'zinn'],
    desc: 'Hauptstadt der Normandie an der Seine. Richards Seneschall hält sie gegen König Philipp.' },
  { id: 'montstmichel', name: 'Mont-Saint-Michel', type: 'abtei', faction: 'kirche', clear: 6, realm: 'nd', lon: -1.48, lat: 48.60, landmarks: [{ kind: 'kathedrale', name: 'Abtei auf dem Felsen', len: 3.2, central: 'spitze', rock: true }], produces: ['salz', 'wolle'], demands: ['wein', 'getreide', 'holz'],
    desc: 'Die Abtei auf dem Felsen im Watt. Bei Flut ist sie eine Insel.' },
  { id: 'falaise', name: 'Falaise', type: 'burg', faction: 'normannen', clear: 7, realm: 'nd', lon: -0.20, lat: 48.89, castleLevel: 3, produces: ['stein', 'eisen'], demands: ['wein', 'getreide', 'fleisch'],
    desc: 'Die Burg auf dem Felsen, in der Wilhelm der Eroberer geboren wurde.' },
  { id: 'fecamp', name: 'Fécamp', type: 'abtei', faction: 'kirche', clear: 6, realm: 'nd', lon: 0.37, lat: 49.76, landmarks: [{ kind: 'kathedrale', name: 'Abtei der Dreifaltigkeit', len: 3.8, central: 'turm' }], produces: ['wein', 'salz'], demands: ['wolle', 'getreide', 'holz'],
    desc: 'Die reiche Abtei an der Alabasterküste. Die Mönche hüten hier eine Reliquie vom Blut Christi.' },
  { id: 'evreux', name: 'Évreux', type: 'burg', faction: 'normannen', clear: 7, realm: 'nd', lon: 1.15, lat: 49.02, produces: ['getreide', 'eisen'], demands: ['wein', 'wolle', 'fleisch'],
    desc: 'Die Grenzstadt hat schon zweimal den Herrn gewechselt. Wem sie gerade gehört, hängt davon ab, wen man fragt.' },
  // ---------------- Frankreich und Flandern
  { id: 'calais', name: 'Calais', type: 'dorf', faction: 'gilde', clear: 6, realm: 'fl', lon: 1.86, lat: 50.93, port: true, produces: ['salz', 'fleisch'], demands: ['wolle', 'bier', 'holz'],
    desc: 'Ein Fischerort an der engsten Stelle des Kanals. Bei klarem Wetter sieht man die Felsen von Dover.' },
  { id: 'brugge', name: 'Brügge', type: 'stadt', cityR: 14, faction: 'gilde', clear: 8, realm: 'fl', lon: 3.22, lat: 51.20, port: true, landmarks: [{ kind: 'tuchhalle', name: 'Tuchhalle mit Belfried', belfry: true }], produces: ['wein', 'eisen', 'salz'], demands: ['wolle', 'getreide', 'felle', 'zinn'],
    desc: 'Die flämische Handelsstadt lebt von englischer Wolle. Die Tuchhallen sind voller Kaufleute aus aller Welt.' },
  { id: 'gent', name: 'Gent', type: 'markt', faction: 'gilde', clear: 7, realm: 'fl', lon: 3.72, lat: 51.05, landmarks: [{ kind: 'tower', name: 'Gravensteen', grey: true }], produces: ['wolle', 'bier'], demands: ['getreide', 'fleisch', 'holz'],
    desc: 'Die Weberstadt an der Schelde. Ihre Tuche gehen bis nach Konstantinopel.' },
  { id: 'amiens', name: 'Amiens', type: 'markt', faction: 'franken', clear: 7, realm: 'fr', lon: 2.30, lat: 49.89, produces: ['getreide', 'wolle', 'bier'], demands: ['salz', 'eisen', 'wein'],
    desc: 'Marktstadt an der Somme. König Philipp hat sie erst vor wenigen Jahren an sich gezogen.' },
  { id: 'gisors', name: 'Gisors', type: 'burg', faction: 'franken', clear: 7, realm: 'fr', lon: 1.78, lat: 49.28, castleLevel: 3, produces: ['stein', 'eisen'], demands: ['getreide', 'wein', 'fleisch'],
    desc: 'Die umkämpfte Grenzburg im Vexin. Seit dem letzten Jahr wehen hier die Lilien.' },
  { id: 'paris', name: 'Paris', type: 'stadt', cityR: 20, faction: 'franken', clear: 9, realm: 'fr', lon: 2.35, lat: 48.86, landmarks: [{ kind: 'kathedrale', name: 'Notre-Dame (im Bau)', len: 4.4, westTowers: 2, central: 'reiter', scaffold: true, unfinished: true }, { kind: 'rundturm', name: 'Der neue Louvre (im Bau)', scaffold: true }], produces: ['wein', 'getreide', 'eisen'], demands: ['wolle', 'holz', 'salz', 'fleisch', 'felle', 'silber'],
    desc: 'König Philipps Hauptstadt. An der Seine baut man eine neue Kathedrale und eine Mauer um die ganze Stadt.' },
  { id: 'chartres', name: 'Chartres', type: 'abtei', faction: 'kirche', clear: 7, realm: 'fr', lon: 1.49, lat: 48.45, landmarks: [{ kind: 'kathedrale', name: 'Dom von Chartres (abgebrannt)', len: 4.2, westTowers: 2, burned: true, scaffold: true }], produces: ['getreide', 'wein'], demands: ['stein', 'holz', 'eisen'],
    desc: 'Der Dom ist in diesem Jahr abgebrannt. Jetzt sucht der Bischof Steine, Holz und Spender.' },
  { id: 'reims', name: 'Reims', type: 'abtei', faction: 'kirche', clear: 7, realm: 'fr', lon: 4.03, lat: 49.26, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Reims', len: 4.2, westTowers: 2, central: 'turm' }], produces: ['wein', 'wolle'], demands: ['salz', 'fleisch', 'getreide'],
    desc: 'Hier werden die Könige Frankreichs gesalbt. Die Weinberge der Champagne reichen bis an die Stadt.' },
  { id: 'troyes', name: 'Troyes', type: 'markt', faction: 'gilde', clear: 8, realm: 'fr', lon: 4.07, lat: 48.30, landmarks: [{ kind: 'tuchhalle', name: 'Messehallen der Champagne' }], produces: ['wein', 'salz', 'wolle'], demands: ['felle', 'eisen', 'fleisch', 'holz', 'silber'],
    desc: 'Die Messestadt der Champagne. Zweimal im Jahr trifft sich hier halb Europa zum Handel.' },
  { id: 'rennes', name: 'Rennes', type: 'stadt', faction: 'gilde', clear: 8, realm: 'fr', lon: -1.68, lat: 48.13, produces: ['salz', 'wolle', 'getreide'], demands: ['wein', 'eisen', 'holz'],
    desc: 'Hauptstadt der Bretagne. Herzogin Konstanze sorgt sich um ihren kleinen Sohn Arthur, den manche schon als Erben Englands sehen.' },
  { id: 'ypern', name: 'Ypern', type: 'markt', faction: 'gilde', clear: 7, realm: 'fl', lon: 2.88, lat: 50.85, landmarks: [{ kind: 'tuchhalle', name: 'Tuchhalle von Ypern' }], produces: ['bier', 'eisen'], demands: ['wolle', 'getreide', 'felle'],
    desc: 'Die Tuchstadt Flanderns. Ihre Weber brauchen Wolle, viel Wolle, am liebsten englische.' },
  { id: 'arras', name: 'Arras', type: 'markt', faction: 'gilde', clear: 7, realm: 'fl', lon: 2.78, lat: 50.29, produces: ['wein', 'getreide'], demands: ['wolle', 'holz', 'fleisch'],
    desc: 'Die Geldwechsler und Tuchhändler von Arras leihen Fürsten Geld und lassen es sich fürstlich vergüten.' },
  { id: 'laon', name: 'Laon', type: 'abtei', faction: 'kirche', clear: 7, realm: 'fr', lon: 3.62, lat: 49.56, landmarks: [{ kind: 'kathedrale', name: 'Kathedrale von Laon', len: 4.0, westTowers: 2, central: 'turm' }], produces: ['wein', 'getreide'], demands: ['salz', 'holz', 'eisen'],
    desc: 'Die Kathedrale auf dem Berg bekommt Ochsen aus Stein auf die Türme, zum Dank für die Tiere, die die Steine hinaufzogen.' },
  { id: 'compiegne', name: 'Compiègne', type: 'burg', faction: 'franken', clear: 7, realm: 'fr', lon: 2.82, lat: 49.42, produces: ['holz', 'fleisch', 'felle'], demands: ['wein', 'getreide', 'salz'],
    desc: 'Königspfalz am großen Forst. König Philipp jagt hier, wenn er nicht gerade Krieg führt.' },
  { id: 'provins', name: 'Provins', type: 'markt', faction: 'gilde', clear: 7, realm: 'fr', lon: 3.30, lat: 48.56, landmarks: [{ kind: 'tuchhalle', name: 'Messehalle von Provins' }], produces: ['wolle', 'wein', 'salz'], demands: ['felle', 'fleisch', 'eisen'],
    desc: 'Eine der Messestädte der Champagne. Kaufleute aus Italien und Flandern treffen sich hier unter dem Schutz des Grafen.' },
];

// Fähren zwischen den Häfen: Kosten in Gold je Person, Dauer in Stunden
export const FERRIES = [
  { a: 'dover', b: 'calais', cost: 4, hours: 5, ship: 'Fährschiff' },
  { a: 'portsmouth', b: 'barfleur', cost: 7, hours: 12, ship: 'Kogge' },
  { a: 'london', b: 'brugge', cost: 9, hours: 20, ship: 'Wollschiff' },
];

// Sehenswürdigkeiten: Wer sie zum ersten Mal besucht, gewinnt Ruhm
export const POIS = [
  { id: 'stonehenge', name: 'Stonehenge', kind: 'stonehenge', lon: -1.826, lat: 51.179,
    desc: 'Die riesigen Steine stehen hier seit Menschengedenken. Die Leute erzählen, Merlin habe sie aus Irland herbeigezaubert.' },
  { id: 'hadrian', name: 'Hadrianswall', kind: 'wall', lon: -2.3, lat: 55.0, pts: [[-3.2, 54.95], [-2.95, 54.93], [-2.7, 54.97], [-2.4, 55.0], [-2.1, 55.02], [-1.85, 55.0], [-1.6, 54.99]],
    desc: 'Die alte Mauer der Römer zieht sich quer durchs Land. Die Bauern holen sich die Steine für ihre Ställe.' },
];

// Beschriftungen der großen Karte
export const REGIONS = [
  { name: 'ENGLAND', lon: -1.2, lat: 52.3, size: 1.3 }, { name: 'WALES', lon: -3.7, lat: 52.35, size: 1 },
  { name: 'NORMANDIE', lon: 0.2, lat: 49.0, size: 1 }, { name: 'FRANKREICH', lon: 2.9, lat: 48.6, size: 1.3 },
  { name: 'FLANDERN', lon: 3.2, lat: 50.75, size: 0.9 }, { name: 'BRETAGNE', lon: -3.1, lat: 48.25, size: 0.9 },
  { name: 'IRLAND', lon: -6.36, lat: 53.15, size: 0.8, align: 'left' }, { name: 'SCHOTTLAND', lon: -3.9, lat: 55.18, size: 0.8 },
  { name: 'Ärmelkanal', lon: -2.3, lat: 50.05, size: 0.9, sea: true }, { name: 'Nordsee', lon: 2.6, lat: 53.6, size: 1.1, sea: true },
  { name: 'Irische See', lon: -4.6, lat: 53.7, size: 0.8, sea: true }, { name: 'Atlantik', lon: -5.6, lat: 49.2, size: 0.9, sea: true },
];

export const TYPE_NAME = {
  spieler: 'Dein Burgstall', stadt: 'Stadt', markt: 'Marktflecken', halle: 'Sächsische Halle', burg: 'Burg',
  abtei: 'Abtei', lager: 'Lager', dorf: 'Dorf', mine: 'Erzgrube', einsiedelei: 'Mystischer Ort',
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
  franken: { tunic: '#3a56a8', trim: '#e8cf5a' },
  sachsen: { tunic: '#5b8a3c', trim: '#d8c070' },
  bauer: { tunic: '#9a8461', trim: '#6e5c40' },
  moench: { tunic: '#6a5240', trim: '#3a2c22', hood: '#5c4636' },
};
// Wappenfarben zur Wahl im Startmenü
export const HERALDRY = [
  { id: 'blau', name: 'Königsblau', color: '#2c4f86' },
  { id: 'rot', name: 'Blutrot', color: '#9a2f2a' },
  { id: 'gruen', name: 'Waldgrün', color: '#3f6b2f' },
  { id: 'purpur', name: 'Purpur', color: '#5e2f6e' },
  { id: 'ocker', name: 'Ocker', color: '#a8791f' },
  { id: 'schwarz', name: 'Rabenschwarz', color: '#2b2a2e' },
];

export const PEASANT_TUNICS = ['#9a8461', '#8a6e4b', '#a8946a', '#7d6a55', '#94704a', '#b0a07a', '#8c5f45', '#6f7a55'];
export const HAIR = ['#3b2a1e', '#5a3d26', '#8a6a3a', '#c9a35a', '#2a2420', '#7a3a1e', '#9a9088'];

// ---------------------------------------------------------------- Namen
export const NAMES_M = ['Aelfric', 'Eadric', 'Wulfstan', 'Oswin', 'Godwin', 'Leofric', 'Edgar', 'Cuthbert', 'Osric', 'Aldhelm',
  'Beorn', 'Cenric', 'Dunstan', 'Hereward', 'Wat', 'Hob', 'Dickon', 'Tom', 'Jack', 'Will', 'Ranulf', 'Hugo', 'Raoul',
  'Gilbert', 'Renaud', 'Thibaut', 'Alain', 'Ivo', 'Walter', 'Simon', 'Roger', 'Odo', 'Ulf', 'Brand'];
export const NAMES_F = ['Aelfgifu', 'Edith', 'Godgifu', 'Hilda', 'Mildred', 'Wynflaed', 'Alys', 'Maud', 'Joan', 'Agnes', 'Emma', 'Matilda', 'Gytha', 'Eadgyth'];
export const EPITHETS = ['Langbein', 'Eisenhand', 'vom Moor', 'aus Wetherby', 'von der Küste', 'Schnellpfeil', 'Rabenhaar', 'Bärentatze', 'Krummnase',
  'von der Furt', 'Zweifinger', 'Steinbrecher', 'Flinkfinger', 'vom Weiher', 'Eichenherz', 'Graumantel', 'Rotbart', 'Hammerfaust', 'Kiesel'];
