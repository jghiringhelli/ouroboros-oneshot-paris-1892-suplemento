// Lógica pura de Ouroboros (sin dependencias de Foundry): testeable con node.

export const SUITS = {
  spades: { symbol: "♠", color: "black", label: "Picas", element: "earth" },
  hearts: { symbol: "♥", color: "red", label: "Corazones", element: "water" },
  diamonds: { symbol: "♦", color: "red", label: "Diamantes", element: "air" },
  clubs: { symbol: "♣", color: "black", label: "Tréboles", element: "fire" }
};

export const RANK_LABELS = { 1: "A", 11: "J", 12: "Q", 13: "K" };
const RANK_NAMES = { 1: "As", 11: "Jota", 12: "Reina", 13: "Rey" };

export const CIRCLES = {
  earth: ["con", "dis"],
  water: ["str", "wis"],
  air: ["dex", "emp"],
  fire: ["ref", "int"]
};

export const SKILL_TN = {
  easy: 5, moderate: 2, hard: -1, extreme: -4,
  legendary: -7, mythic: -10, divine: -13, cosmic: -16
};
export const SAVE_TN = { minor: 5, moderate: 2, serious: -1, severe: -4 };

export const ABILITY_PAIRS = {
  athletics: ["earth", "water"],
  perception: ["earth", "fire"],
  influence: ["water", "air"],
  intuition: ["water", "fire"],
  composure: ["earth", "air"],
  insight: ["air", "fire"]
};

export const SAVE_TRIPLES = {
  fortitude: ["earth", "water", "fire"],
  reflex: ["water", "air", "fire"],
  resolve: ["earth", "air", "fire"],
  nerve: ["earth", "water", "air"]
};

const n = v => Number(v) || 0;

export const circleOf = (a, b) => Math.floor((n(a) + n(b)) / 2);

export function deriveStats(attr, { armor = 0, passiveBonus = 0, hpBonus = 0, hpOverride = 0, seeded = false } = {}) {
  const circles = {};
  for (const [c, [a, b]] of Object.entries(CIRCLES)) circles[c] = circleOf(attr[a], attr[b]);
  const sum = circles.earth + circles.water + circles.air + circles.fire;
  const willpower = Math.max(2, Math.floor(sum / 4));
  const abilities = {};
  for (const [k, [a, b]] of Object.entries(ABILITY_PAIRS)) abilities[k] = Math.floor((circles[a] + circles[b]) / 2);
  const saves = {};
  for (const [k, list] of Object.entries(SAVE_TRIPLES)) saves[k] = Math.floor(list.reduce((s, c) => s + circles[c], 0) / 3);
  const hpFormula = circles.earth * 4 + circles.water * 3 + circles.air * 2 + circles.fire + 10;
  return {
    circles, willpower, abilities, saves,
    handSize: handSizeOf(willpower, seeded),
    hpFormula,
    hpMax: (n(hpOverride) > 0 ? n(hpOverride) : hpFormula) + n(hpBonus),
    passive: n(attr.ref) + n(armor) + n(passiveBonus)
  };
}

// ---- Cartas ----
export function buildDeckSpec() {
  const cards = [];
  for (const [suit, s] of Object.entries(SUITS)) {
    for (let rank = 1; rank <= 13; rank++) {
      cards.push({
        rank, suit, color: s.color, joker: false,
        name: `${RANK_NAMES[rank] ?? rank} de ${s.label}`,
        label: `${RANK_LABELS[rank] ?? rank}${s.symbol}`
      });
    }
  }
  cards.push({ rank: 0, suit: null, color: "black", joker: true, name: "Comodín negro", label: "★" });
  cards.push({ rank: 0, suit: null, color: "red", joker: true, name: "Comodín rojo", label: "★" });
  return cards;
}

const RANK_WORDS = [
  [/\b(ace|as|a)\b/, 1], [/\b(two|dos|2)\b/, 2], [/\b(three|tres|3)\b/, 3], [/\b(four|cuatro|4)\b/, 4],
  [/\b(five|cinco|5)\b/, 5], [/\b(six|seis|6)\b/, 6], [/\b(seven|siete|7)\b/, 7], [/\b(eight|ocho|8)\b/, 8],
  [/\b(nine|nueve|9)\b/, 9], [/\b(ten|diez|10)\b/, 10], [/\b(jack|jota|j)\b/, 11],
  [/\b(queen|reina|q)\b/, 12], [/\b(king|rey|k)\b/, 13]
];
const SUIT_WORDS = [
  [/spade|pica|♠/, "spades"], [/heart|coraz|♥/, "hearts"], [/diamond|diamante|♦/, "diamonds"], [/club|trebol|trébol|♣/, "clubs"]
];

// Identifica una carta de un preset de Foundry por su nombre ("Ace of Spades", "Joker", ...).
export function parseCardName(name = "") {
  const s = String(name).toLowerCase();
  if (/joker|comod/.test(s)) return { joker: true, color: /red|roj|color/.test(s) ? "red" : /black|negr|b&w/.test(s) ? "black" : null };
  const suit = SUIT_WORDS.find(([re]) => re.test(s))?.[1];
  const rank = RANK_WORDS.find(([re]) => re.test(s))?.[1];
  return suit && rank ? { joker: false, suit, rank } : null;
}

export const isFace = rank => rank >= 11 && rank <= 13;
export const cardLabel = c => c.joker ? "★" : `${RANK_LABELS[c.rank] ?? c.rank}${SUITS[c.suit]?.symbol ?? ""}`;

export function jokerSuits(color) {
  return Object.entries(SUITS).filter(([, s]) => s.color === color).map(([k]) => k);
}

/**
 * Valor jugado de una carta.
 * - Joker: valor declarado (1-10).
 * - Figura robada a ciegas: 5, sin efecto.
 * - Figura jugada de la mano: valor de la carta base (o 5) + efecto de superposición.
 */
export function playValue({ rank, joker = false }, { blind = false, declared = null, base = null } = {}) {
  if (joker) return { value: clamp(declared?.value ?? 5, 1, 10), overlay: null, suit: declared?.suit ?? null };
  if (isFace(rank)) {
    if (blind) return { value: 5, overlay: null };
    return { value: n(base ?? 5), overlay: { 11: "jack", 12: "queen", 13: "king" }[rank] };
  }
  return { value: rank, overlay: null };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, n(v)));

// ---- Chequeos (menor es mejor) ----
export function lowCheck({ value, overlay = null, base = 0, resonance = 0, bonus = 0, tn }) {
  const jack = overlay === "jack" ? 5 : 0;
  const result = n(value) - n(base) - n(resonance) - n(bonus) - jack;
  return { result, tn, success: result <= tn, margin: tn - result };
}

// ---- Combate (mayor es mejor) ----
export function highTotal({ value, overlay = null, attribute = 0, skill = 0, gear = 0, bonus = 0 }) {
  return n(value) + n(attribute) + n(skill) + n(gear) + n(bonus) + (overlay === "jack" ? 5 : 0);
}

/**
 * attack: {total, overlay, value, damageBonus}; defense: {total, overlay}|null (activa); passive: número.
 * King atacante cancela la defensa activa; King defensor cancela el ataque; ambos Kings se anulan.
 */
export function resolveAttack({ attack, defense = null, passive = 0 }) {
  const out = { attackTotal: attack.total, defenseTotal: null, mode: "passive", damage: 0, hit: false, note: "" };
  const kA = attack.overlay === "king", kD = defense?.overlay === "king";
  if (kA && kD) return { ...out, mode: "kings", note: "Rey contra Rey: se anulan, nadie hace daño." };
  if (kD) return { ...out, mode: "cancelled", note: "Rey en defensa: el ataque queda cancelado." };
  let defTotal = n(passive);
  if (defense && !kA) { defTotal = defense.total; out.mode = "active"; }
  else if (defense && kA) out.note = "Rey en ataque: la defensa activa queda cancelada (defensa pasiva).";
  out.defenseTotal = defTotal;
  const diff = n(attack.total) - defTotal;
  out.hit = diff > 0;
  out.damage = out.hit ? Math.max(1, diff) + n(attack.damageBonus) : 0;
  if (attack.overlay === "queen") out.note += " Reina: segundo golpe contra otro objetivo con solo el valor de la carta (" + attack.value + ").";
  return out;
}

export function initiativeOf({ value, fire, air }) {
  const total = n(value) + n(fire) + n(air);
  return { total, sortKey: total + n(fire) / 10 };
}

export const applyHp = (hp, delta, max) => Math.min(max, Math.max(0, n(hp) + n(delta)));


/* ---------- Mano ---------- */
/** Tamaño de mano = Willpower (mín. 2); Sembrado resta 1 (mín. 1). */
export const handSizeOf = (willpower, seeded = false) => Math.max(1, Math.max(2, n(willpower)) - (seeded ? 1 : 0));

/* ---------- Pilas (mazo compartido y descarte) ----------
 * La pila de robo se representa con ids ordenados de arriba (índice 0) a abajo; el orden real
 * en Foundry se guarda en `sort` (menor = más arriba) con sortsFor().
 */
export const pileOrder = cards => [...cards].sort((a, b) => n(a.sort) - n(b.sort) || String(a.id).localeCompare(String(b.id))).map(c => c.id);
export const topIds = (ids, count = 1) => ids.slice(0, Math.max(0, count));
export const sortsFor = ids => ids.map((id, i) => ({ _id: id, sort: (i + 1) * 10 }));

export const toBottom = (ids, id) => (ids.includes(id) ? [...ids.filter(x => x !== id), id] : [...ids, id]);
export const toTop = (ids, id) => [id, ...ids.filter(x => x !== id)];
export const topToBottom = ids => (ids.length > 1 ? [...ids.slice(1), ids[0]] : [...ids]);

/** Reordena las `newTop.length` cartas de arriba. Devuelve null si no es una permutación de ellas. */
export function reorderTop(ids, newTop) {
  const k = newTop.length;
  if (!k || k > ids.length) return null;
  const current = ids.slice(0, k);
  if (new Set(newTop).size !== k || !newTop.every(id => current.includes(id))) return null;
  return [...newTop, ...ids.slice(k)];
}

/** Baraja (Fisher-Yates) con generador inyectable. */
export function shuffled(ids, rng = Math.random) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Descarte de abajo (antigua) a arriba (última): por `seq` y luego `sort`. */
export const discardOrder = cards => [...cards].sort((a, b) => n(a.seq) - n(b.seq) || n(a.sort) - n(b.sort)).map(c => c.id);

/** ¿Hace falta rebarajar el descarte para robar `needed` cartas? */
export const needsReshuffle = (available, needed) => n(available) < n(needed);

/** Ids que aparecen en `after` y no estaban en `before` (carta devuelta al mazo). */
export const addedIds = (before, after) => after.filter(id => !before.includes(id));

/* ---------- Chequeos: consciente vs pasivo ---------- */
export const CHECK_MODES = ["conscious", "passive"];
export const normMode = m => (m === "passive" ? "passive" : "conscious");

/**
 * Consciente: el jugador ELIGE una carta de su mano. Pasivo: se fuerza el tope del mazo, ignorando cualquier elección.
 */
export function cardSource(mode, { handIds = [], chosenId = null } = {}) {
  if (normMode(mode) === "passive") return { from: "top" };
  if (chosenId && handIds.includes(chosenId)) return { from: "hand", id: chosenId };
  return handIds.length ? null : { from: "top" };
}

export const tnValue = (kind, key) => (kind === "save" ? SAVE_TN : SKILL_TN)[key];

/** Base y resonancia de un chequeo {kind: skill|ability|save, key, skill, circle} sobre system derivado. */
export function resolveCheckStat(system, chk) {
  if (chk.kind === "save") return { base: n(system.saves?.[chk.key]), resonance: 0 };
  if (chk.kind === "ability") return { base: n(system.abilities?.[chk.key]), resonance: 0 };
  const s = (system.skills ?? []).find(k => String(k.name).toLowerCase() === String(chk.skill).toLowerCase());
  if (s) return { base: n(system.circles?.[s.circle]), resonance: n(s.res) };
  return { base: n(system.circles?.[chk.circle ?? "air"]), resonance: 0 };
}

/** Lo que ve cada parte. Pasivo: el jugador no sabe qué se comprobó ni el TN; solo lo percibido. */
export function checkView(mode, { success, tn, clue = "" }) {
  if (normMode(mode) === "conscious") return { player: { shows: "all", tn }, gm: { tn, success } };
  return { player: { shows: success ? "perceived" : "nothing", tn: null, text: success ? clue : "" }, gm: { tn, success } };
}

/* ---------- Galería sin mapa ---------- */
export const MEDIA_BASE_DEFAULT = "https://raw.githubusercontent.com/jghiringhelli/ouroboros-oneshot-paris-1892-suplemento/main";
export const PERCEPTION_TN_DEFAULT = "moderate";
export const GALLERY_MODES = ["passive", "conscious", "none"];

export function mediaUrls(base, id) {
  const root = String(base || MEDIA_BASE_DEFAULT).trim().replace(/\/+$/, "");
  const key = encodeURIComponent(id);
  return { video: `${root}/video/${key}.mp4`, original: `${root}/original/${key}.png`, macabre: `${root}/macabra/${key}.png` };
}

export const perceptionTN = flagTn => (flagTn && Object.hasOwn(SKILL_TN, flagTn) ? flagTn : PERCEPTION_TN_DEFAULT);
export const galleryMode = m => (GALLERY_MODES.includes(m) ? m : "passive");

/** Destinatarios de un susurro: el jugador y todos los GM, sin duplicados. */
export const whisperTargets = (userId, gmIds = []) => [...new Set([userId, ...gmIds].filter(Boolean))];

/** Estado por pintura: {tn, mode, played:[userId]}; las funciones no mutan. */
export const paintingState = (state, id) => ({ tn: PERCEPTION_TN_DEFAULT, mode: "passive", played: [], ...(state?.[id] ?? {}) });
export const hasPlayed = (state, id, userId) => paintingState(state, id).played.includes(userId);
export function markPlayedFor(state, id, userIds) {
  const cur = paintingState(state, id);
  return { ...state, [id]: { ...cur, played: [...new Set([...cur.played, ...userIds])] } };
}
export const resetPainting = (state, id) => ({ ...state, [id]: { ...paintingState(state, id), played: [] } });
export const resetAll = state => Object.fromEntries(Object.keys(state ?? {}).map(id => [id, { ...paintingState(state, id), played: [] }]));
/** Usuarios a los que aún conviene hacer el chequeo/vídeo (no lo han visto ya). */
export const pendingUsers = (state, id, userIds) => userIds.filter(u => !hasPlayed(state, id, u));

/* ---------- Mapa de París ----------
 * Estado: {revealed:[n], party:{x,y}|null, links:{n: artId}} con coordenadas normalizadas 0–1. Funciones puras.
 */
export const MAP_REVEALED_DEFAULT = ["1", "2"];
export const MAP_LINKS_DEFAULT = { 2: "09_cartel_rosacruz" };
const unit = v => Math.min(1, Math.max(0, n(v)));

export function mapStateOf(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const party = s.party && Number.isFinite(Number(s.party.x)) && Number.isFinite(Number(s.party.y)) ? { x: unit(s.party.x), y: unit(s.party.y) } : null;
  return {
    revealed: Array.isArray(s.revealed) ? [...new Set(s.revealed.map(String))] : [...MAP_REVEALED_DEFAULT],
    party, links: s.links && typeof s.links === "object" ? { ...s.links } : { ...MAP_LINKS_DEFAULT }
  };
}
export const revealMarker = (raw, id) => { const s = mapStateOf(raw); return { ...s, revealed: [...new Set([...s.revealed, String(id)])] }; };
export const hideMarker = (raw, id) => { const s = mapStateOf(raw); return { ...s, revealed: s.revealed.filter(x => x !== String(id)) }; };
export const setParty = (raw, x, y) => ({ ...mapStateOf(raw), party: { x: unit(x), y: unit(y) } });
export function setLink(raw, id, artId) {
  const s = mapStateOf(raw), links = { ...s.links };
  if (artId) links[String(id)] = artId; else delete links[String(id)];
  return { ...s, links };
}
/** Marcadores a mostrar: el GM ve todos (con `revealed`), los jugadores solo los revelados. */
export function visibleMarkers(markers, raw, isGM) {
  const s = mapStateOf(raw);
  return markers.map(m => ({ ...m, revealed: s.revealed.includes(String(m.n)), link: s.links[String(m.n)] ?? null }))
    .filter(m => isGM || m.revealed);
}
export const toPct = v => Math.round(unit(v) * 10000) / 100;
/** Clic en un rectángulo {left, top, width, height} → coordenadas normalizadas. */
export const clickToNorm = (rect, clientX, clientY) =>
  rect.width > 0 && rect.height > 0 ? { x: unit((clientX - rect.left) / rect.width), y: unit((clientY - rect.top) / rect.height) } : null;

/* ---------- Escena de la Mesa: actores activos y tamaño de mano ---------- */
export const DEMO_KEYS = ["viktor", "elena", "dmitri", "magnus"];
export const NPC_HAND_DEFAULT = 2;
export const NPC_HAND_SIZES = { bathsheba: 3, manifestacion: 2 };
export const HAND_MAX = 20;
export const isDemoActor = ({ key = "", demo = false } = {}) => !!demo || DEMO_KEYS.includes(key);
export function sceneStateOf(raw) {
  const active = {}, sizes = {};
  for (const [id, v] of Object.entries(raw?.active ?? {})) active[id] = !!v;
  for (const [id, v] of Object.entries(raw?.sizes ?? {})) { const k = Math.trunc(Number(v)); if (k >= 1) sizes[id] = Math.min(HAND_MAX, k); }
  return { active, sizes };
}
/** Por defecto: jugadores activos salvo los de la demo; PNJ/criaturas activos solo si el pregenerado trae mano. */
export const defaultActive = ({ type, hand = false, demo = false } = {}) => !demo && (type === "character" || !!hand);
export const isActiveIn = (raw, id, dflt) => { const s = sceneStateOf(raw); return Object.hasOwn(s.active, id) ? s.active[id] : !!dflt; };
export const setActiveIn = (raw, id, on) => { const s = sceneStateOf(raw); return { ...s, active: { ...s.active, [id]: !!on } }; };
/** `size` vacío/0/NaN quita el override. */
export function setSizeIn(raw, id, size) {
  const s = sceneStateOf(raw), sizes = { ...s.sizes };
  const k = Math.trunc(Number(size));
  if (k >= 1) sizes[id] = Math.min(HAND_MAX, k); else delete sizes[id];
  return { ...s, sizes };
}
/** Tamaño de mano: override del GM > PNJ (Bathsheba 3, resto 2) > Voluntad (jugadores). */
export function handSizeFor(raw, { id, type, key = "", willpowerSize = 2 }) {
  const s = sceneStateOf(raw);
  if (s.sizes[id]) return s.sizes[id];
  return type === "character" ? Math.max(1, willpowerSize) : (NPC_HAND_SIZES[key] ?? NPC_HAND_DEFAULT);
}
/** Ids de las cartas que sobran para ajustar la mano a `size` (las últimas). */
export const excessIds = (ids, size) => ids.slice(Math.max(0, size));