import { ActorData, WeaponData, ArmorData, PowerData, GearData } from "./data.mjs";
import { OuroborosActorSheet, OuroborosItemSheet } from "./sheets.mjs";
import { OuroborosCombat } from "./documents.mjs";
import { HandApp, TableApp, GMPanel } from "./apps.mjs";
import { requestCheckDialog } from "./checks.mjs";
import * as Cards from "./cards.mjs";
import * as Rolls from "./rolls.mjs";
import * as Art from "./art.mjs";
import * as Importer from "./importer.mjs";
import * as Gallery from "./gallery.mjs";
import * as MapView from "./map.mjs";

const NS = "ouroboros";
const L = k => game.i18n.localize(k);
const { ApplicationV2 } = foundry.applications.api;

const STATUS_ICONS = {
  stunned: "daze", poisoned: "poison", prone: "falling", restrained: "net", burning: "fire", slowed: "downgrade",
  charmed: "heart", frightened: "terror", blinded: "blind", deafened: "deaf", confused: "question", dazed: "stoned",
  exhausted: "sleep", enraged: "lightning", paralyzed: "paralysis", unconscious: "unconscious", invisible: "invisible",
  bleeding: "blood", offbalance: "falling", silenced: "silenced", hasted: "wing", guarded: "shield", focused: "target",
  blessed: "angel", inspired: "aura", seeded: "tree", dead: "skull"
};

/* Menú de ajustes que lanza la importación al abrirse */
class ImportMenu extends ApplicationV2 {
  async render() { Importer.importAdventure(); return this; }
}

async function requestCheckById(id) {
  const chk = (await Importer.loadData("checks")).find(c => c.id === id);
  if (!chk) return ui.notifications.error(`Chequeo desconocido: ${id}`);
  const ids = chk.who.flatMap(w => (w === "party"
    ? game.actors.filter(a => a.type === "character" && a.hasPlayerOwner).map(a => a.id)
    : [Importer.actorByKey(w)?.id])).filter(Boolean);
  if (!ids.length) return ui.notifications.warn("No hay actores para este chequeo (¿importaste la aventura?).");
  return Rolls.requestCheck(chk, ids);
}

let handApp = null;
function openHand(actor = null) {
  handApp ??= new HandApp();
  if (actor) handApp.actorId = actor.id;
  return handApp.render({ force: true });
}

let tableApp = null;
const openTable = () => {
  tableApp ??= new TableApp();
  return tableApp.render({ force: true });
};

let gmPanel = null;
const openGMPanel = () => {
  if (!game.user.isGM) return ui.notifications.warn("Solo para el GM.");
  gmPanel ??= new GMPanel();
  return gmPanel.render({ force: true });
};

async function playCard(actor, cardId = null) {
  if (!cardId) {
    const cards = (Cards.getHand(actor)?.cards.contents ?? []).map(Cards.cardInfo);
    if (!cards.length) return ui.notifications.warn(L("OUROBOROS.Hand.empty"));
    cardId = await foundry.applications.api.DialogV2.wait({
      window: { title: `${actor.name}: ${L("OUROBOROS.Hand.play")}` }, rejectClose: false,
      content: `<p>${L("OUROBOROS.Hand.title")}</p>`,
      buttons: [...cards.map(c => ({ action: c.id, label: c.label })), { action: "cancel", label: L("OUROBOROS.Cancel") }]
    });
    if (!cardId || cardId === "cancel") return null;
  }
  return Rolls.playLoose(actor, cardId);
}

Hooks.once("init", () => {
  CONFIG.Actor.dataModels = { character: ActorData, npc: ActorData, creature: ActorData };
  CONFIG.Item.dataModels = { weapon: WeaponData, armor: ArmorData, power: PowerData, gear: GearData };
  CONFIG.Combat.documentClass = OuroborosCombat;
  CONFIG.Combat.initiative = { formula: "1", decimals: 1 };

  CONFIG.statusEffects = Object.entries(STATUS_ICONS).map(([id, icon]) => ({
    id, name: `OUROBOROS.Status.${id}`, img: `icons/svg/${icon}.svg`
  }));
  CONFIG.specialStatusEffects.DEFEATED = "dead";
  CONFIG.specialStatusEffects.INVISIBLE = "invisible";
  CONFIG.specialStatusEffects.BLIND = "blinded";

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, NS, OuroborosActorSheet, { types: ["character", "npc", "creature"], makeDefault: true, label: "OUROBOROS.SheetActor" });
  DocumentSheetConfig.registerSheet(Item, NS, OuroborosItemSheet, { types: ["weapon", "armor", "power", "gear"], makeDefault: true, label: "OUROBOROS.SheetItem" });

  if (!Handlebars.helpers.eq) Handlebars.registerHelper("eq", (a, b) => a === b);

  foundry.applications.handlebars.loadTemplates([
    `systems/${NS}/templates/actor-sheet.hbs`, `systems/${NS}/templates/item-sheet.hbs`,
    `systems/${NS}/templates/hand-app.hbs`, `systems/${NS}/templates/gm-panel.hbs`, `systems/${NS}/templates/gallery-panel.hbs`,
    `systems/${NS}/templates/table-app.hbs`, `systems/${NS}/templates/map-app.hbs`
  ]);

  Cards.registerTableSetting();
  Gallery.registerGallerySettings();
  MapView.registerMapSettings();
  game.settings.registerMenu(NS, "gmPanel", {
    name: "OUROBOROS.Settings.panel", label: "OUROBOROS.GMPanel", hint: "OUROBOROS.Settings.panelHint",
    icon: "fa-solid fa-dragon", type: GMPanel, restricted: true
  });
  game.settings.registerMenu(NS, "import", {
    name: "OUROBOROS.Settings.import", label: "OUROBOROS.Panel.import", hint: "OUROBOROS.Settings.importHint",
    icon: "fa-solid fa-file-import", type: ImportMenu, restricted: true
  });

  // Enriquecedores: @Chequeo[id]{texto}, @Obra[id]{texto}, @Spawn[id]{texto}
  const icons = { Chequeo: "fa-paper-plane", Obra: "fa-eye", Spawn: "fa-users" };
  for (const [name, icon] of Object.entries(icons)) {
    CONFIG.TextEditor.enrichers.push({
      pattern: new RegExp(`@${name}\\[([^\\]]+)\\](?:\\{([^}]+)\\})?`, "gi"),
      enricher: async match => {
        const a = document.createElement("a");
        a.className = "ouro-enricher";
        a.dataset.ouroAct = name;
        a.dataset.arg = match[1];
        a.innerHTML = `<i class="fa-solid ${icon}"></i> ${foundry.utils.escapeHTML(match[2] ?? match[1])}`;
        return a;
      }
    });
  }

  game.ouroboros = {
    ...Cards, ...Rolls,
    art: Art, importer: Importer, gallery: Gallery,
    openGallery: Gallery.openGallery, openTable, openMap: MapView.openMap, showMapTo: MapView.showMapTo, map: MapView,
    playCard, openHand, openGMPanel, requestCheckById, requestCheckDialog,
    importAdventure: Importer.importAdventure, spawnEncounter: Importer.spawnEncounter, createMacros: Importer.createMacros,
    showArt: Art.showArt, transformArt: Art.transformArt, hideArt: Art.hideArt,
    get handApp() { return handApp; }
  };
});

Hooks.once("ready", async () => {
  game.socket.on(`system.${NS}`, async msg => {
    if (await Cards.handleOpSocket(msg)) return;
    if (Gallery.handleGallerySocket(msg)) return;
    if (MapView.handleMapSocket(msg)) return;
    Art.handleArtSocket(msg);
  });

  document.addEventListener("click", ev => {
    const a = ev.target.closest?.("a.ouro-enricher");
    if (!a) return;
    ev.preventDefault();
    if (!game.user.isGM) return ui.notifications.warn("Solo para el GM.");
    const { ouroAct: act, arg } = a.dataset;
    if (act === "Chequeo") requestCheckById(arg);
    else if (act === "Spawn") Importer.spawnEncounter(arg);
    else if (act === "Obra") Gallery.openGallery();
  });

  if (game.user.isActiveGM) {
    try { await Cards.ensureDecksAndHands(); }
    catch (e) { console.error("Ouroboros | no se pudieron crear mazos/manos", e); }
  }
});

Hooks.on("ouroborosGallery", () => Gallery.refreshGallery());
Hooks.on("ouroborosMap", () => {
  MapView.refreshMap();
  if (gmPanel?.rendered) gmPanel.render();
});
Hooks.on("ouroborosTable", () => {
  if (tableApp?.rendered) tableApp.render();
  if (handApp?.rendered) handApp.render();
});

Hooks.on("renderChatMessageHTML", (message, html) => Rolls.bindChat(message, html));

Hooks.on("createActor", actor => {
  if (game.user.isActiveGM && actor.type === "character" && Cards.getDeck("players")) Cards.ensureHand(actor);
});
Hooks.on("updateActor", (actor, changes) => {
  if (game.user.isActiveGM && ("ownership" in changes || "name" in changes) && Cards.getHand(actor)) Cards.ensureHand(actor);
});

const refreshHand = foundry.utils.debounce(() => {
  if (handApp?.rendered) handApp.render();
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof OuroborosActorSheet && app.rendered) app.render();
  }
}, 150);
for (const h of ["createCard", "updateCard", "deleteCard", "updateCards", "createCards", "deleteCards"]) Hooks.on(h, refreshHand);

Hooks.on("getSceneControlButtons", controls => {
  try {
    const tools = controls.tokens?.tools;
    if (!tools) return;
    tools.ouroTable = { name: "ouroTable", title: "OUROBOROS.Table.title", icon: "fa-solid fa-table-cells", order: 89, button: true, onChange: () => openTable() };
    tools.ouroHand = { name: "ouroHand", title: "OUROBOROS.Hand.open", icon: "fa-solid fa-diamond", order: 90, button: true, onChange: () => openHand() };
    if (game.user.isGM) {
      tools.ouroGallery = { name: "ouroGallery", title: "OUROBOROS.Gallery.title", icon: "fa-solid fa-panorama", order: 92, button: true, onChange: () => Gallery.openGallery() };
      tools.ouroMap = { name: "ouroMap", title: "OUROBOROS.Map.title", icon: "fa-solid fa-map", order: 88, button: true, onChange: () => MapView.openMap() };
      tools.ouroPanel = { name: "ouroPanel", title: "OUROBOROS.GMPanel", icon: "fa-solid fa-dragon", order: 91, button: true, onChange: () => openGMPanel() };
    }
  } catch (e) { console.warn("Ouroboros | controles de escena", e); }
});
