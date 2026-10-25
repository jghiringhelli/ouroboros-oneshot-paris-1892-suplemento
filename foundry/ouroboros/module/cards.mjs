import {
  buildDeckSpec, parseCardName, SUITS, cardLabel, isFace, pileOrder, topIds, sortsFor, toBottom, toTop, topToBottom, reorderTop,
  shuffled, discardOrder, needsReshuffle, addedIds, markPlayedFor
} from "./logic.mjs";

const NS = "ouroboros";
const SOCKET = "system.ouroboros";
export const DECK_NAMES = { players: "Mazo de Jugadores", gm: "Mazo del GM" };
const OWNER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
const NONE = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
const quiet = { chatNotification: false };

/* ---------- Búsqueda ---------- */
export const getDeck = type => game.cards.find(c => c.type === "deck" && c.getFlag(NS, "deck") === type);
export const getDiscard = type => game.cards.find(c => c.type === "pile" && c.getFlag(NS, "discardOf") === type);
export const getHand = actor => actor && game.cards.find(c => c.type === "hand" && c.getFlag(NS, "actorId") === actor.id);
export const deckTypeFor = actor => (actor?.type === "character" ? "players" : "gm");

/** Información normalizada de una Card de Foundry. */
export function cardInfo(card) {
  const fl = card.flags?.[NS] ?? {};
  const suit = fl.suit ?? null;
  const info = {
    id: card.id, name: card.name, rank: fl.rank ?? 0, suit, joker: !!fl.joker,
    color: fl.color ?? SUITS[suit]?.color ?? "black"
  };
  info.face = !info.joker && isFace(info.rank);
  info.label = cardLabel(info);
  return info;
}

/* ---------- Creación de mazos ---------- */
function manualCards() {
  return buildDeckSpec().map((c, i) => ({
    name: c.name, type: "base", suit: c.suit ?? c.color, value: c.joker ? 0 : c.rank,
    faces: [{ name: c.name, text: c.label }], face: null, sort: i,
    flags: { [NS]: { rank: c.rank, suit: c.suit, color: c.color, joker: c.joker } }
  }));
}

// Intenta usar el preset póker del núcleo (imágenes); si no se identifican las 54 cartas, crea cartas manuales.
async function presetDeckData() {
  try {
    const preset = CONFIG.Cards.presets?.pokerDark ?? Object.values(CONFIG.Cards.presets ?? {})[0];
    if (!preset?.src) return null;
    const data = await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute(preset.src));
    if (!Array.isArray(data?.cards) || data.cards.length !== 54) return null;
    const seen = new Set();
    let jokers = 0;
    for (const c of data.cards) {
      const p = parseCardName(c.name);
      if (!p) return null;
      if (p.joker) {
        const color = p.color ?? (jokers === 0 ? "black" : "red");
        jokers++;
        c.flags = { [NS]: { rank: 0, suit: null, color, joker: true } };
        seen.add(`joker-${color}`);
      } else {
        c.flags = { [NS]: { rank: p.rank, suit: p.suit, color: SUITS[p.suit].color, joker: false } };
        seen.add(`${p.suit}-${p.rank}`);
      }
    }
    return seen.size === 54 ? data : null;
  } catch (e) {
    console.warn("Ouroboros | preset de póker no utilizable, se usan cartas manuales", e);
    return null;
  }
}

async function createDeck(type) {
  const base = (await presetDeckData()) ?? { cards: manualCards() };
  const data = foundry.utils.mergeObject(base, {
    name: DECK_NAMES[type], type: "deck",
    description: type === "players" ? "Mazo compartido por los jugadores." : "Mazo del GM para PNJ.",
    flags: { [NS]: { deck: type } }
  });
  delete data._id;
  const deck = await CONFIG.Cards.documentClass.create(data);
  await deck.shuffle(quiet);
  return deck;
}

async function createDiscard(type) {
  return CONFIG.Cards.documentClass.create({ name: `Descarte – ${DECK_NAMES[type]}`, type: "pile", flags: { [NS]: { discardOf: type } } });
}

/* ---------- Manos ---------- */
function handOwnership(actor) {
  const own = { default: NONE() };
  for (const u of game.users) if (!u.isGM && actor.testUserPermission(u, "OWNER")) own[u.id] = OWNER();
  return own;
}

export async function ensureHand(actor) {
  if (!actor) return null;
  let hand = getHand(actor);
  const ownership = handOwnership(actor);
  if (!hand) {
    hand = await CONFIG.Cards.documentClass.create({
      name: `Mano de ${actor.name}`, type: "hand", ownership,
      flags: { [NS]: { actorId: actor.id, deck: deckTypeFor(actor) } }
    });
  } else if (!foundry.utils.objectsEqual(hand.ownership, ownership)) {
    await hand.update({ ownership, name: `Mano de ${actor.name}` });
  }
  return hand;
}

export async function ensureDecksAndHands({ npcs = [] } = {}) {
  if (!game.user.isGM) return;
  for (const type of ["players", "gm"]) {
    if (!getDeck(type)) await createDeck(type);
    if (!getDiscard(type)) await createDiscard(type);
  }
  const wanted = new Set([...game.actors.filter(a => a.type === "character" || a.getFlag(NS, "hand")), ...npcs]);
  for (const a of wanted) await ensureHand(a);
  await publishTable();
}

/** Reparte hasta su tamaño a toda mano vacía (jugadores y PNJ con `flags.ouroboros.hand`). Devuelve cuántas repartió. */
export async function dealEmptyHands() {
  if (!game.user.isGM || !getDeck("players") || !getDeck("gm")) return 0;
  let n = 0;
  for (const a of game.actors) {
    const hand = getHand(a);
    if (hand && !hand.cards.size && (a.type !== "character" || a.getFlag(NS, "id"))) { await fillHand(a); n++; }
  }
  return n;
}

/* ---------- Estado público de la mesa ----------
 * Los mazos son del mundo y los jugadores no los leen: el GM publica en un Setting de mundo el conteo de la
 * pila de robo y la pila de descarte completa (en orden), pero nunca el orden ni el contenido de la pila de robo.
 */
export function registerTableSetting() {
  game.settings.register(NS, "tableState", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => Hooks.callAll("ouroborosTable")
  });
}

const drawPile = deck => deck.cards.filter(c => !c.drawn);
const pileIds = deck => pileOrder(drawPile(deck).map(c => ({ id: c.id, sort: c.sort })));
const discardInfos = discard => {
  const byId = new Map(discard.cards.map(c => [c.id, c]));
  return discardOrder(discard.cards.map(c => ({ id: c.id, seq: c.getFlag(NS, "seq") ?? 0, sort: c.sort }))).map(id => cardInfo(byId.get(id)));
};

export async function publishTable() {
  if (!game.user.isGM) return;
  const state = {};
  for (const type of ["players", "gm"]) {
    const deck = getDeck(type), discard = getDiscard(type);
    if (!deck) continue;
    state[type] = { left: drawPile(deck).length, total: deck.cards.size, discard: discard ? discardInfos(discard) : [] };
  }
  await game.settings.set(NS, "tableState", state);
}

export function deckSummary(type) {
  const s = game.settings.get(NS, "tableState")?.[type];
  const discard = s?.discard ?? [];
  return {
    type, name: DECK_NAMES[type], exists: !!s, left: s?.left ?? 0, total: s?.total ?? 0,
    discard: discard.length, discardList: [...discard].reverse(), discardCards: [...discard].reverse().slice(0, 8)
  };
}

const logChat = (alias, html) => ChatMessage.create({ speaker: { alias }, content: `<div class="ouro-chat table-log"><p>${html}</p></div>` });

/* ---------- Operaciones (se ejecutan en el GM) ---------- */
let seqCounter = 0;
const nextSeq = () => Date.now() * 1000 + (seqCounter++ % 1000);
const discardData = () => ({ ...quiet, updateData: { flags: { [NS]: { seq: nextSeq() } } } });

const stacks = type => {
  const deck = getDeck(type), discard = getDiscard(type);
  if (!deck || !discard) throw new Error(`Falta el ${DECK_NAMES[type]}. Ejecuta ensureDecksAndHands().`);
  return { deck, discard };
};

const writeOrder = (deck, ids) => deck.updateEmbeddedDocuments("Card", sortsFor(ids));

async function toDiscard(from, discard, ids) {
  for (const id of ids) await from.pass(discard, [id], discardData());
}

async function shuffleDraw(deck) {
  await writeOrder(deck, shuffled(pileIds(deck)));
}

async function returnDiscard(type) {
  const { deck, discard } = stacks(type);
  if (discard.cards.size) await discard.pass(deck, discard.cards.map(c => c.id), quiet);
  await shuffleDraw(deck);
}

/** Garantiza `needed` cartas en la pila de robo; si no, devuelve el descarte y baraja. */
async function refill(type, needed) {
  const { deck } = stacks(type);
  if (!needsReshuffle(drawPile(deck).length, needed)) return deck;
  await returnDiscard(type);
  await logChat("Mesa", `El descarte del ${DECK_NAMES[type]} vuelve al mazo y se baraja.`);
  return deck;
}

const handIds = hand => hand.cards.map(c => c.id);
const handInfos = (hand, ids) => ids.map(id => cardInfo(hand.cards.get(id)));

const OPS = {
  async draw({ actorId, n = 1 }) {
    const actor = game.actors.get(actorId);
    const hand = await ensureHand(actor);
    const type = deckTypeFor(actor);
    const deck = await refill(type, n);
    const before = handIds(hand);
    await deck.pass(hand, topIds(pileIds(deck), n), quiet);
    return handInfos(hand, addedIds(before, handIds(hand)));
  },
  async fill({ actorId, size }) {
    const hand = await ensureHand(game.actors.get(actorId));
    const need = Math.max(0, size - hand.cards.size);
    return need ? OPS.draw({ actorId, n: need }) : [];
  },
  async play({ actorId, cardIds }) {
    const actor = game.actors.get(actorId);
    const hand = getHand(actor);
    const infos = cardIds.map(id => cardInfo(hand.cards.get(id)));
    await toDiscard(hand, stacks(deckTypeFor(actor)).discard, cardIds);
    return infos;
  },
  /** Carta del tope del mazo (robo ciego): va directa al descarte. */
  async top({ deckType }) {
    const deck = await refill(deckType, 1);
    const { discard } = stacks(deckType);
    const before = discard.cards.map(c => c.id);
    await deck.pass(discard, topIds(pileIds(deck), 1), discardData());
    return cardInfo(discard.cards.get(addedIds(before, discard.cards.map(c => c.id))[0]));
  },
  async discardHand({ actorId, refill: again = false, size = 0 }) {
    const actor = game.actors.get(actorId);
    const hand = await ensureHand(actor);
    const n = hand.cards.size;
    await toDiscard(hand, stacks(deckTypeFor(actor)).discard, handIds(hand));
    if (again) await OPS.fill({ actorId, size });
    return n;
  },
  async peek({ deckType, n = 1 }) {
    const { deck } = stacks(deckType);
    const byId = new Map(drawPile(deck).map(c => [c.id, c]));
    return topIds(pileIds(deck), n).map(id => cardInfo(byId.get(id)));
  },
  async reorder({ deckType, ids }) {
    const { deck } = stacks(deckType);
    const next = reorderTop(pileIds(deck), ids);
    if (!next) throw new Error("Orden no válido");
    await writeOrder(deck, next);
    return true;
  },
  async topToBottom({ deckType }) {
    const { deck } = stacks(deckType);
    await writeOrder(deck, topToBottom(pileIds(deck)));
    return true;
  },
  async handToDeck({ actorId, cardId, where }) {
    const actor = game.actors.get(actorId);
    const { deck } = stacks(deckTypeFor(actor));
    const hand = getHand(actor);
    const before = pileIds(deck);
    await hand.pass(deck, [cardId], quiet);
    const found = addedIds(before, pileIds(deck))[0];
    if (!found) throw new Error("La carta no volvió al mazo");
    await writeOrder(deck, (where === "top" ? toTop : toBottom)(pileIds(deck), found));
    return true;
  },
  async shuffleDraw({ deckType }) { await shuffleDraw(stacks(deckType).deck); return true; },
  async shuffleDiscard({ deckType }) { await returnDiscard(deckType); return true; },
  async returnToDeck({ deckType, cardId }) {
    const { deck, discard } = stacks(deckType);
    await discard.pass(deck, [cardId], quiet);
    await shuffleDraw(deck);
  },
  async reset({ deckType }) {
    const { deck } = stacks(deckType);
    await deck.recall(quiet);
    await shuffleDraw(deck);
    return true;
  },
  /** Solo GM: lista de la pila de robo en orden (de arriba abajo). */
  async search({ deckType }) {
    const { deck } = stacks(deckType);
    const byId = new Map(drawPile(deck).map(c => [c.id, c]));
    return pileIds(deck).map(id => cardInfo(byId.get(id)));
  },
  /** Solo GM: saca una carta concreta de la pila de robo al tope o a la mano de un actor. */
  async takeCard({ deckType, cardId, to = "top" }) {
    const { deck } = stacks(deckType);
    if (to === "top") { await writeOrder(deck, toTop(pileIds(deck), cardId)); return true; }
    const hand = await ensureHand(game.actors.get(to));
    await deck.pass(hand, [cardId], quiet);
    return true;
  },
  async applyHp({ actorUuid, delta }) {
    const a = await fromUuid(actorUuid);
    if (!a?.system?.hp) throw new Error("Actor no encontrado");
    const v = Math.min(a.system.hp.max, Math.max(0, a.system.hp.value + delta));
    await a.update({ "system.hp.value": v });
    return v;
  },
  /** Estado de la galería (Setting de mundo): solo lo escribe el GM. */
  async galleryPlayed({ art, userIds }) {
    await game.settings.set(NS, "galleryState", markPlayedFor(game.settings.get(NS, "galleryState"), art, userIds));
    return true;
  }
};

const GM_ONLY = new Set(["search", "takeCard", "reset"]);
const READONLY = new Set(["peek", "search", "applyHp", "galleryPlayed"]);

async function runOp(op, args) {
  if (!OPS[op]) throw new Error(`Operación desconocida: ${op}`);
  const res = await OPS[op](args);
  if (!READONLY.has(op)) await publishTable();
  return res;
}

/** Ejecuta una operación en el GM (directamente o por socket). */
const pending = new Map();
export function callOp(op, args = {}) {
  if (game.user.isGM) return runOp(op, args);
  if (GM_ONLY.has(op)) return Promise.reject(new Error("Solo para el GM"));
  const gm = game.users.activeGM;
  if (!gm) {
    ui.notifications.error("Ouroboros: no hay ningún GM conectado para gestionar los mazos.");
    return Promise.reject(new Error("Sin GM"));
  }
  return new Promise((resolve, reject) => {
    const id = foundry.utils.randomID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Tiempo de espera agotado (GM)")); }, 15000);
    pending.set(id, { resolve, reject, timer });
    game.socket.emit(SOCKET, { type: "op", id, op, args, from: game.user.id });
  });
}

const OWN_ACTOR_OPS = new Set(["draw", "fill", "play", "discardHand", "handToDeck"]);

/** Procesa mensajes de socket relativos a operaciones. Devuelve true si lo gestionó. */
export async function handleOpSocket(msg) {
  if (msg.type === "op") {
    if (game.users.activeGM?.id !== game.user.id) return true;
    let reply;
    try {
      const from = game.users.get(msg.from);
      if (GM_ONLY.has(msg.op) && !from?.isGM) throw new Error("Solo para el GM");
      if (OWN_ACTOR_OPS.has(msg.op) && !from?.isGM && !game.actors.get(msg.args?.actorId)?.testUserPermission(from, "OWNER")) throw new Error("Sin permiso sobre ese personaje");
      reply = { ok: true, result: await runOp(msg.op, msg.args) };
    } catch (e) { console.error(e); reply = { ok: false, error: e.message }; }
    game.socket.emit(SOCKET, { type: "opResult", id: msg.id, to: msg.from, ...reply });
    return true;
  }
  if (msg.type === "opResult") {
    if (msg.to !== game.user.id) return true;
    const p = pending.get(msg.id);
    if (!p) return true;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
    return true;
  }
  return false;
}

/* ---------- API pública ---------- */
export const drawToHand = async (actor, n = 1) => callOp("draw", { actorId: actor.id, n });
export const fillHand = async actor => callOp("fill", { actorId: actor.id, size: actor.system.handSize });
export const discardHand = async (actor, refill = false) => callOp("discardHand", { actorId: actor.id, refill, size: actor.system.handSize });
export const restHand = actor => discardHand(actor, true);
export const topCard = async (deckType = "players") => callOp("top", { deckType });
export const blindDraw = topCard;
export const peekDeck = (deckType, n) => callOp("peek", { deckType, n });
export const reorderDeck = (deckType, ids) => callOp("reorder", { deckType, ids });
export const topToBottomDeck = deckType => callOp("topToBottom", { deckType });
export const handToDeck = (actor, cardId, where) => callOp("handToDeck", { actorId: actor.id, cardId, where });
export const shuffleDeck = async (deckType = "players") => callOp("shuffleDraw", { deckType });
export const shuffleDiscardBack = async (deckType = "players") => callOp("shuffleDiscard", { deckType });
export const searchDeck = deckType => callOp("search", { deckType });
export const takeCard = (deckType, cardId, to) => callOp("takeCard", { deckType, cardId, to });
export const resetDecks = async (deckType = null) => {
  for (const t of deckType ? [deckType] : ["players", "gm"]) await callOp("reset", { deckType: t });
  ui.notifications.info("Mazos reiniciados y barajados.");
};
export const applyHp = (actorUuid, delta) => callOp("applyHp", { actorUuid, delta });
export const playFromHand = (actor, cardIds) => callOp("play", { actorId: actor.id, cardIds });
export const returnJoker = (deckType, cardId) => callOp("returnToDeck", { deckType, cardId });
export const markGalleryPlayed = (art, userIds) => callOp("galleryPlayed", { art, userIds });
export { logChat as logTable };
