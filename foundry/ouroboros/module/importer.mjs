import { ensureDecksAndHands, dealEmptyHands } from "./cards.mjs";

const NS = "ouroboros";
const BASE = "systems/ouroboros/data";
const ATTRS = ["con", "dis", "str", "wis", "dex", "emp", "ref", "int"];
const cache = new Map();

export async function loadData(name) {
  if (!cache.has(name)) cache.set(name, foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute(`${BASE}/${name}.json`)));
  return cache.get(name);
}
const loadText = async file => (await fetch(foundry.utils.getRoute(`${BASE}/journals/${file}`))).text();

const byFlag = (coll, id) => coll.find(d => d.getFlag(NS, "id") === id);
export const actorByKey = key => byFlag(game.actors, key);

async function folderFor(name, type) {
  const full = `Ouroboros: ${name}`;
  return game.folders.find(f => f.type === type && f.name === full) ?? Folder.create({ name: full, type });
}

function actorData(def, itemDefs, folder) {
  const attributes = Object.fromEntries(ATTRS.map((k, i) => [k, def.attrs[i]]));
  const isPC = def.type === "character";
  const items = (def.items ?? []).map(k => {
    const it = itemDefs.get(k);
    return { name: it.name, type: it.type, system: it.system, flags: { [NS]: { id: `${def.key}:${k}` } } };
  });
  return {
    name: def.name, type: def.type, folder: folder.id, items,
    system: {
      attributes, combat: { skill: def.combat ?? 0 },
      job: { suit: def.job?.[0] ?? "", level: def.job?.[1] ?? 0 },
      hp: { override: def.hpOverride ?? 0 },
      skills: (def.skills ?? []).map(([name, circle, res]) => ({ name, circle, res })),
      details: def.details ?? {}
    },
    prototypeToken: {
      name: def.name, actorLink: isPC || !!def.hand, disposition: isPC ? 1 : -1,
      bar1: { attribute: "hp" }, displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER, displayName: CONST.TOKEN_DISPLAY_MODES.OWNER
    },
    flags: { [NS]: { id: def.key, hand: !!def.hand } }
  };
}

async function importItems(itemDefs) {
  const folders = {
    weapon: await folderFor("Armas", "Item"), armor: await folderFor("Armaduras", "Item"),
    power: await folderFor("Poderes", "Item"), gear: await folderFor("Equipo", "Item")
  };
  const docs = [...itemDefs.values()]
    .filter(d => !byFlag(game.items, d.key))
    .map(d => ({ name: d.name, type: d.type, system: d.system, folder: folders[d.type].id, flags: { [NS]: { id: d.key } } }));
  if (docs.length) await Item.createDocuments(docs);
  return docs.length;
}

async function importActors(itemDefs) {
  const defs = await loadData("actors");
  const folders = {};
  const created = [];
  for (const def of defs) {
    if (actorByKey(def.key)) continue;
    folders[def.folder] ??= await folderFor(def.folder, "Actor");
    const actor = await Actor.create(actorData(def, itemDefs, folders[def.folder]));
    await actor.update({ "system.hp.value": actor.system.hp.max });
    created.push(actor);
  }
  return created.length;
}

async function checksHtml() {
  const checks = await loadData("checks");
  const names = Object.fromEntries((await loadData("actors")).map(a => [a.key, a.name.split(" ")[0]]));
  const scenes = [...new Set(checks.map(c => c.scene))];
  const stat = c => (c.kind === "skill" ? c.skill : c.key);
  let html = "<h2>Chequeos de habilidad</h2><p>Cada botón <em>Pedir</em> publica un mensaje en el chat; cada jugador pulsa su nombre y juega carta de su mano (chequeo consciente); con modo pasivo el GM fuerza el tope del mazo. Habilidad: Carta − Circle − Resonancia ≤ TN (bajo es mejor).</p>";
  for (const scene of scenes) {
    html += `<h3>${scene}</h3><table><tr><th>Quién</th><th>Chequeo</th><th>Tipo / TN</th><th>Consecuencia</th><th>Pista</th><th></th></tr>`;
    for (const c of checks.filter(x => x.scene === scene)) {
      const who = c.who.map(w => (w === "party" ? "Grupo" : names[w] ?? w)).join(", ");
      html += `<tr><td>${who}</td><td>${c.label}</td><td>${c.kind} ${stat(c)} · ${c.tn}</td><td>${c.consequence}</td><td>${c.clue}</td><td>@Chequeo[${c.id}]{Pedir}</td></tr>`;
    }
    html += "</table>";
  }
  return html;
}

async function importJournals() {
  const index = await loadData("journals/index");
  const folder = await folderFor("Aventura", "JournalEntry");
  let n = 0;
  for (const j of index) {
    if (byFlag(game.journal, j.id)) continue;
    const content = j.generated === "checks" ? await checksHtml() : await loadText(j.file);
    await JournalEntry.create({
      name: j.name, folder: folder.id, flags: { [NS]: { id: j.id } },
      pages: [{ name: j.name, type: "text", text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML } }]
    });
    n++;
  }
  return n;
}

/* ---------- Macros ---------- */
const MACROS = [
  { id: "panel", name: "Panel del GM", img: "icons/svg/dice-target.svg", gm: true, command: "game.ouroboros.openGMPanel();" },
  { id: "transformar", name: "Transformar obra (todos)", img: "icons/svg/terror.svg", gm: true, command: "game.ouroboros.art.transformArt([], 0);" },
  { id: "ocultar", name: "Ocultar obra", img: "icons/svg/blind.svg", gm: true, command: "game.ouroboros.art.hideArt([]);" },
  { id: "galeria", name: "Galería", img: "icons/svg/statue.svg", gm: true, command: "game.ouroboros.openGallery();" },
  { id: "mapa", name: "Mapa de París", img: "icons/svg/direction.svg", gm: true, command: "game.ouroboros.openMap();" },
  { id: "mesa", name: "Mesa (mazos)", img: "icons/svg/card-hand.svg", gm: false, command: "game.ouroboros.openTable();" },
  { id: "pedir", name: "Pedir chequeo", img: "icons/svg/d20-grey.svg", gm: true, command: "game.ouroboros.requestCheckDialog();" },
  { id: "mano", name: "Mano", img: "icons/svg/card-hand.svg", gm: false, command: "game.ouroboros.openHand();" },
  { id: "robar", name: "Robar carta", img: "icons/svg/card-joker.svg", gm: false, command: "const a = game.user.character; if (a) game.ouroboros.drawToHand(a, 1);" }
];

export async function createMacros({ assign = false } = {}) {
  const spawns = (await loadData("encounters")).map(e => ({
    id: `spawn_${e.id}`, name: `Combate: ${e.name}`, img: "icons/svg/combat.svg", gm: true, command: `game.ouroboros.spawnEncounter("${e.id}");`
  }));
  const made = [];
  for (const m of [...MACROS, ...spawns]) {
    let macro = byFlag(game.macros, m.id);
    const data = { name: m.name, img: m.img, type: "script", command: m.command };
    if (macro) await macro.update(data);
    else macro = await Macro.create({
      ...data, flags: { [NS]: { id: m.id } },
      ownership: { default: m.gm ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
    });
    made.push(macro);
  }
  if (assign && game.user.isGM) try {
    const hotbar = game.user.hotbar ?? {};
    const inBar = new Set(Object.values(hotbar));
    let slot = 1;
    for (const macro of made.slice(0, MACROS.length)) {
      if (inBar.has(macro.id)) continue;
      while (hotbar[slot] && slot < 10) slot++;
      if (slot > 10) break;
      await game.user.assignHotbarMacro(macro, slot);
      hotbar[slot] = macro.id;
    }
  } catch (e) { console.warn("Ouroboros | no se pudo asignar la barra de macros (API v14)", e); }
  return made.length;
}

/* ---------- Encuentros (teatro de la mente: sin tokens, ficha de criaturas para el GM) ---------- */
export async function spawnEncounter(id) {
  const enc = (await loadData("encounters")).find(e => e.id === id);
  if (!enc) return ui.notifications.error(`Encuentro desconocido: ${id}`);
  const rows = [];
  for (const t of enc.tokens) {
    const actor = actorByKey(t.actor);
    if (!actor) { ui.notifications.warn(`Falta el actor «${t.actor}»: ejecuta la importación.`); continue; }
    rows.push(`<li>${t.count ?? 1} × @UUID[${actor.uuid}]{${foundry.utils.escapeHTML(actor.name)}} (PV ${actor.system.hp.max})</li>`);
  }
  const gms = game.users.filter(u => u.isGM).map(u => u.id);
  await ChatMessage.create({
    whisper: gms, speaker: { alias: "Ouroboros" },
    content: `<div class="ouro-chat"><h3>${foundry.utils.escapeHTML(enc.name)}</h3><ul>${rows.join("")}</ul></div>`
  });
}
/* ---------- Importación completa ---------- */
export async function importAdventure() {
  if (!game.user.isGM) return ui.notifications.warn("Solo el GM puede importar.");
  ui.notifications.info("Ouroboros: importando…");
  try {
    const itemDefs = new Map((await loadData("items")).map(d => [d.key, d]));
    const items = await importItems(itemDefs);
    const actors = await importActors(itemDefs);
    const journals = await importJournals();
    const macros = await createMacros({ assign: true });
    await ensureDecksAndHands();
    const hands = await dealEmptyHands();
    ui.notifications.info(`Ouroboros: importado (${items} objetos, ${actors} actores, ${journals} diarios, ${macros} macros). Mazos listos y ${hands} manos repartidas (jugadores y PNJ).`);
  } catch (e) {
    console.error(e);
    ui.notifications.error(`Ouroboros: error al importar: ${e.message}`);
  }
}
