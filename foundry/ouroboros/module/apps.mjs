import {
  getHand, cardInfo, deckSummary, ensureDecksAndHands, ensureHand, shuffleDeck, shuffleDiscardBack, resetDecks, fillHand, discardHand,
  drawToHand, deckTypeFor, peekDeck, reorderDeck, topToBottomDeck, handToDeck, searchDeck, takeCard, logTable, topCard, playFromHand, dealEmptyHands
} from "./cards.mjs";
import { cardHtml, playWithUse, useTopCard } from "./rolls.mjs";
import { loadMarkers, toggleMarker, showMapTo, openMap } from "./map.mjs";
import { visibleMarkers } from "./logic.mjs";
import { importAdventure, loadData, spawnEncounter, createMacros } from "./importer.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;
const L = k => game.i18n.localize(k);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const T = "systems/ouroboros/templates";
const NS = "ouroboros";
const GM_ACTOR = () => ({ name: "GM" });
const hasHandFlag = a => !!(getHand(a) || a.getFlag(NS, "hand"));

/** Descartar mano con la opción de robar de nuevo hasta el tamaño. */
async function discardHandDialog(actor) {
  const refill = await DialogV2.wait({
    window: { title: L("OUROBOROS.Hand.discardAll") }, rejectClose: false,
    content: `<p>${L("OUROBOROS.Hand.discardAskRefill")}</p>`,
    buttons: [
      { action: "refill", label: L("OUROBOROS.Hand.discardRefill"), default: true },
      { action: "only", label: L("OUROBOROS.Hand.discardOnly") },
      { action: "cancel", label: L("OUROBOROS.Cancel") }
    ]
  });
  if (refill === "refill" || refill === "only") await discardHand(actor, refill === "refill");
}

/** Manos que ve el GM: todos los actores con mano (jugadores y PNJ), con sus cartas. */
function handRows() {
  return game.actors.filter(a => getHand(a)).map(a => {
    const cards = getHand(a).cards.contents.map(cardInfo);
    return {
      id: a.id, name: a.name, type: a.type, deckType: deckTypeFor(a), count: cards.length, size: a.system.handSize,
      cards: cards.map(c => ({ id: c.id, html: cardHtml(c, { small: true }) }))
    };
  }).sort((a, b) => a.deckType.localeCompare(b.deckType) || a.name.localeCompare(b.name));
}

async function askNumber(title, value = 3) {
  const n = await DialogV2.prompt({
    window: { title }, rejectClose: false,
    content: `<div class="form-group"><label>${L("OUROBOROS.Table.howMany")}</label><input type="number" name="n" value="${value}" min="1" max="20" step="1" autofocus></div>`,
    ok: { label: L("OUROBOROS.Ok"), callback: (ev, button) => Number(new FormData(button.form).get("n")) }
  });
  return Number.isInteger(n) && n > 0 ? Math.min(n, 20) : null;
}

/** Mira las N cartas de arriba (solo quien mira) y permite reordenarlas. El registro público no revela las cartas. */
async function peekAndReorder(actor, deckType) {
  const n = await askNumber(L("OUROBOROS.Table.peek"));
  if (!n) return;
  const cards = await peekDeck(deckType, n);
  if (!cards?.length) return;
  await logTable(actor.name, L("OUROBOROS.Table.logPeek").replace("{n}", cards.length));
  const rows = cards.map((c, i) => `<div class="ouro-peekrow"><span class="cardwrap">${cardHtml(c, { small: true })}</span>
    <input type="number" name="pos-${c.id}" value="${i + 1}" min="1" max="${cards.length}" step="1"></div>`).join("");
  const res = await DialogV2.wait({
    window: { title: `${L("OUROBOROS.Table.peek")} (${cards.length})` }, rejectClose: false,
    content: `<p class="hint">${L("OUROBOROS.Table.reorderHint")}</p><div class="ouro-peek">${rows}</div>`,
    buttons: [
      {
        action: "reorder", label: L("OUROBOROS.Table.reorder"), icon: "fa-solid fa-arrow-down-1-9",
        callback: (ev, button) => {
          const fd = new FormData(button.form);
          return cards.map((c, i) => ({ id: c.id, pos: Number(fd.get(`pos-${c.id}`)) || i + 1, i }))
            .sort((a, b) => a.pos - b.pos || a.i - b.i).map(x => x.id);
        }
      },
      { action: "close", label: L("OUROBOROS.Close"), default: true }
    ]
  });
  if (Array.isArray(res) && res.some((id, i) => id !== cards[i].id)) {
    await reorderDeck(deckType, res);
    await logTable(actor.name, L("OUROBOROS.Table.logReorder").replace("{n}", res.length));
  }
}

/** GM: busca una carta concreta en la pila de robo y la deja arriba o en la mano de un personaje. */
async function searchDialog(deckType) {
  const cards = await searchDeck(deckType);
  if (!cards?.length) return ui.notifications.info(L("OUROBOROS.Table.emptyDraw"));
  const options = cards.map((c, i) => `<option value="${c.id}">${i + 1}. ${esc(c.label)}</option>`).join("");
  const dest = [`<option value="top">${L("OUROBOROS.Table.toTopOfDeck")}</option>`,
    ...game.actors.filter(a => getHand(a)).map(a => `<option value="${a.id}">${esc(a.name)}</option>`)].join("");
  const res = await DialogV2.prompt({
    window: { title: L("OUROBOROS.Table.search") }, rejectClose: false,
    content: `<div class="form-group"><label>${L("OUROBOROS.Table.card")}</label><select name="card">${options}</select></div>
      <div class="form-group"><label>${L("OUROBOROS.Table.destination")}</label><select name="to">${dest}</select></div>`,
    ok: { label: L("OUROBOROS.Ok"), callback: (ev, button) => Object.fromEntries(new FormData(button.form)) }
  });
  if (!res?.card) return;
  await takeCard(deckType, res.card, res.to);
  await logTable("GM", L("OUROBOROS.Table.logSearch"));
}

/* ---------- Mesa: pilas compartidas, visible para todos ---------- */
export class TableApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ouroboros-table",
    classes: ["ouroboros", "ouro-app"],
    position: { width: 640, height: 720 },
    window: { title: "OUROBOROS.Table.title", icon: "fa-solid fa-table-cells", resizable: true },
    actions: {
      deckPeek: TableApp.#deckPeek, deckTopToBottom: TableApp.#deckTopToBottom, deckShuffle: TableApp.#deckShuffle,
      deckShuffleDiscard: TableApp.#deckShuffleDiscard, deckSearch: TableApp.#deckSearch, deckReveal: TableApp.#deckReveal,
      deckCreate: TableApp.#deckCreate, handOpen: TableApp.#handOpen, handDraw: TableApp.#handDraw, handFill: TableApp.#handFill,
      handDiscardAll: TableApp.#handDiscardAll, handUseTop: TableApp.#handUseTop, cardPlay: TableApp.#cardPlay,
      cardDiscard: TableApp.#cardDiscard, cardToTop: TableApp.#cardToTop, cardToBottom: TableApp.#cardToBottom
    }
  };

  static PARTS = { body: { template: `${T}/table-app.hbs`, scrollable: [".ouro-scroll"] } };

  async _prepareContext() {
    const isGM = game.user.isGM;
    const hands = isGM ? handRows() : [];
    const decks = ["players", "gm"].map(type => {
      const s = deckSummary(type);
      return {
        ...s, label: L(`OUROBOROS.Deck.${type}`), cards: s.discardList.map(c => ({ html: cardHtml(c, { small: true }) })),
        hands: hands.filter(h => h.deckType === type)
      };
    });
    return { decks, isGM };
  }

  static #actor(t) { return game.actors.get(t.dataset.actor); }
  static #deck(t) { return t.dataset.deck; }
  static #deckPeek(ev, t) { return peekAndReorder(GM_ACTOR(), TableApp.#deck(t)); }
  static async #deckTopToBottom(ev, t) {
    await topToBottomDeck(TableApp.#deck(t));
    await logTable("GM", L("OUROBOROS.Table.logTopBottom"));
  }
  static async #deckShuffle(ev, t) {
    await shuffleDeck(TableApp.#deck(t));
    await logTable("GM", L("OUROBOROS.Table.logShuffle"));
  }
  static #deckShuffleDiscard(ev, t) { return shuffleDiscardBack(TableApp.#deck(t)); }
  static #deckSearch(ev, t) { return searchDialog(TableApp.#deck(t)); }
  static async #deckReveal(ev, t) {
    const info = await topCard(TableApp.#deck(t));
    await logTable("GM", `${L("OUROBOROS.Table.logReveal")} ${cardHtml(info, { small: true })}`);
  }
  static async #deckCreate() { await ensureDecksAndHands(); await dealEmptyHands(); this.render(); }
  static #handOpen(ev, t) { return game.ouroboros.openHand(TableApp.#actor(t)); }
  static #handDraw(ev, t) { return drawToHand(TableApp.#actor(t), 1); }
  static #handFill(ev, t) { return fillHand(TableApp.#actor(t)); }
  static #handDiscardAll(ev, t) { return discardHandDialog(TableApp.#actor(t)); }
  static #handUseTop(ev, t) { return useTopCard(TableApp.#actor(t)); }
  static #cardPlay(ev, t) { return playWithUse(TableApp.#actor(t), t.dataset.id); }
  static async #cardDiscard(ev, t) {
    const actor = TableApp.#actor(t);
    const [info] = await playFromHand(actor, [t.dataset.id]);
    await logTable(actor.name, `${L("OUROBOROS.Table.logDiscardCard")} ${cardHtml(info, { small: true })}`);
  }
  static async #cardToTop(ev, t) {
    const actor = TableApp.#actor(t);
    await handToDeck(actor, t.dataset.id, "top");
    await logTable(actor.name, L("OUROBOROS.Table.logHandTop"));
  }
  static async #cardToBottom(ev, t) {
    const actor = TableApp.#actor(t);
    await handToDeck(actor, t.dataset.id, "bottom");
    await logTable(actor.name, L("OUROBOROS.Table.logHandBottom"));
  }
}

/* ---------- Mano ---------- */
export class HandApp extends HandlebarsApplicationMixin(ApplicationV2) {
  actorId = null;

  static DEFAULT_OPTIONS = {
    id: "ouroboros-hand",
    classes: ["ouroboros", "ouro-app"],
    position: { width: 470, height: "auto" },
    window: { title: "OUROBOROS.Hand.title", icon: "fa-solid fa-diamond", resizable: false },
    actions: {
      play: HandApp.#play, toBottom: HandApp.#toBottom, toTop: HandApp.#toTop, draw: HandApp.#draw, fill: HandApp.#fill,
      discardHand: HandApp.#discardHand, top: HandApp.#top, peek: HandApp.#peek, topToBottom: HandApp.#topToBottom,
      shuffle: HandApp.#shuffle, shuffleDiscard: HandApp.#shuffleDiscard, search: HandApp.#search,
      ensure: HandApp.#ensure, makeHand: HandApp.#makeHand, askCheck: HandApp.#askCheck, openTable: HandApp.#openTable
    }
  };

  static PARTS = { body: { template: `${T}/hand-app.hbs` } };

  static candidates() {
    return game.actors.filter(a => a.isOwner && (a.type === "character" || (game.user.isGM && hasHandFlag(a))));
  }

  get actor() {
    const pool = HandApp.candidates();
    let a = this.actorId ? game.actors.get(this.actorId) : null;
    if (!a) a = game.user.character ?? pool[0] ?? null;
    return a?.isOwner ? a : (pool[0] ?? null);
  }

  async _prepareContext() {
    const actor = this.actor;
    const hand = getHand(actor);
    const cards = hand ? hand.cards.contents.map(cardInfo) : [];
    const type = actor ? deckTypeFor(actor) : "players";
    const s = deckSummary(type);
    return {
      isGM: game.user.isGM, actor, actors: HandApp.candidates().map(a => ({ id: a.id, name: a.name, selected: a.id === actor?.id })),
      hasHand: !!hand, size: actor?.system.handSize ?? 0, count: cards.length,
      cards: cards.map(c => ({ id: c.id, html: cardHtml(c), name: c.name })),
      deck: { ...s, label: L(`OUROBOROS.Deck.${type}`) }
    };
  }

  _onRender() {
    this.element.querySelector("select[name=actor]")?.addEventListener("change", ev => { this.actorId = ev.target.value; this.render(); });
  }

  #type() { return deckTypeFor(this.actor); }

  static async #play(ev, t) { await playWithUse(this.actor, t.dataset.id); }
  static async #toBottom(ev, t) {
    await handToDeck(this.actor, t.dataset.id, "bottom");
    await logTable(this.actor.name, L("OUROBOROS.Table.logHandBottom"));
  }
  static async #toTop(ev, t) {
    await handToDeck(this.actor, t.dataset.id, "top");
    await logTable(this.actor.name, L("OUROBOROS.Table.logHandTop"));
  }
  static async #draw() { await drawToHand(this.actor, 1); }
  static async #fill() { await fillHand(this.actor); }
  static #discardHand() { return discardHandDialog(this.actor); }
  static async #top() { await useTopCard(this.actor); }
  static #peek() { return peekAndReorder(this.actor, this.#type()); }
  static async #topToBottom() {
    await topToBottomDeck(this.#type());
    await logTable(this.actor.name, L("OUROBOROS.Table.logTopBottom"));
  }
  static async #shuffle() {
    await shuffleDeck(this.#type());
    await logTable(this.actor.name, L("OUROBOROS.Table.logShuffle"));
  }
  static #shuffleDiscard() { return shuffleDiscardBack(this.#type()); }
  static #search() { return searchDialog(this.#type()); }
  static async #ensure() { await ensureDecksAndHands(); this.render(); }
  static async #makeHand() { await ensureHand(this.actor); this.render(); }
  static #askCheck() { return game.ouroboros.requestCheckDialog(); }
  static #openTable() { return game.ouroboros.openTable(); }
}

/* ---------- Panel del GM ---------- */
export class GMPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ouroboros-gm",
    classes: ["ouroboros", "ouro-app"],
    position: { width: 540, height: 640 },
    window: { title: "OUROBOROS.GMPanel", icon: "fa-solid fa-dragon", resizable: true },
    actions: {
      importAll: GMPanel.#import, macros: GMPanel.#macros, ensure: GMPanel.#ensure, resetDecks: GMPanel.#resetDecks,
      openHand: GMPanel.#openHand, openActorHand: GMPanel.#openActorHand, openTable: GMPanel.#openTable, openGallery: GMPanel.#openGallery, openMap: GMPanel.#openMap, showMap: GMPanel.#showMap, toggleMarker: GMPanel.#toggleMarker, askCheck: GMPanel.#askCheck,
      request: GMPanel.#request, spawn: GMPanel.#spawn
    }
  };

  static PARTS = { body: { template: `${T}/gm-panel.hbs`, scrollable: [".ouro-scroll"] } };

  async _prepareContext() {
    const checks = await loadData("checks");
    const scenes = [...new Set(checks.map(c => c.scene))].map(scene => ({ scene, checks: checks.filter(c => c.scene === scene) }));
    const markers = visibleMarkers(await loadMarkers(), game.settings.get("ouroboros", "mapState"), true);
    return { scenes, markers, encounters: await loadData("encounters"), hands: handRows() };
  }

  static #import() { return importAdventure(); }
  static #macros() { return createMacros({ assign: true }); }
  static async #ensure() { await ensureDecksAndHands(); await dealEmptyHands(); this.render(); }
  static #resetDecks() { return resetDecks(); }
  static #openHand() { return game.ouroboros.openHand(); }
  static #openActorHand(ev, t) { return game.ouroboros.openHand(game.actors.get(t.dataset.actor)); }
  static #openTable() { return game.ouroboros.openTable(); }
  static #openGallery() { return game.ouroboros.openGallery(); }
  static #openMap() { return openMap(); }
  static #showMap() { return showMapTo([]); }
  static #toggleMarker(ev, t) { return toggleMarker(t.dataset.n); }
  static #askCheck() { return game.ouroboros.requestCheckDialog(); }
  static #request(ev, t) { return game.ouroboros.requestCheckById(t.dataset.id); }
  static #spawn(ev, t) { return spawnEncounter(t.dataset.id); }
}
