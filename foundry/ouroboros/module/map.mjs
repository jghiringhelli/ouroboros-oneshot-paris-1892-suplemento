import { ARTWORKS } from "./art.mjs";
import { mapStateOf, revealMarker, hideMarker, setParty, setLink, visibleMarkers, toPct, clickToNorm } from "./logic.mjs";

const NS = "ouroboros";
const SOCKET = "system.ouroboros";
const MAP_DIR = `systems/${NS}/assets/map`;
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const L = k => game.i18n.localize(k);

let markersCache = null;
export async function loadMarkers() {
  markersCache ??= foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute(`${MAP_DIR}/marcadores.json`));
  return markersCache;
}

/* ---------- Estado (Setting de mundo; solo lo escribe el GM) ---------- */
const getState = () => mapStateOf(game.settings.get(NS, "mapState"));
const setState = s => game.settings.set(NS, "mapState", s);

export function registerMapSettings() {
  game.settings.register(NS, "mapState", {
    scope: "world", config: false, type: Object, default: {}, onChange: () => Hooks.callAll("ouroborosMap")
  });
}

export const toggleMarker = async id => {
  const s = getState();
  return setState(s.revealed.includes(String(id)) ? hideMarker(s, id) : revealMarker(s, id));
};
export const moveParty = (x, y) => setState(setParty(getState(), x, y));
export const linkMarker = (id, art) => setState(setLink(getState(), id, art));

/** Abre la ventana del mapa a los jugadores indicados (todos los activos no GM por defecto). */
export function showMapTo(users) {
  const ids = users?.length ? users : game.users.filter(u => u.active && !u.isGM).map(u => u.id);
  game.socket.emit(SOCKET, { type: "map", cmd: "open", users: ids });
  if (ids.includes(game.user.id)) openMap();
}

/** Receptor de sockets del mapa. Devuelve true si gestionó el mensaje. */
export function handleMapSocket(msg) {
  if (msg.type !== "map") return false;
  if (msg.cmd === "open" && msg.users?.includes(game.user.id)) openMap();
  return true;
}

/* ---------- Ventana «Mapa» ---------- */
export class MapApp extends HandlebarsApplicationMixin(ApplicationV2) {
  selected = null;
  moveMode = false;

  static DEFAULT_OPTIONS = {
    id: "ouroboros-map",
    classes: ["ouroboros", "ouro-app"],
    position: { width: 900, height: 700 },
    window: { title: "OUROBOROS.Map.title", icon: "fa-solid fa-map", resizable: true },
    actions: { pick: MapApp.#pick, moveToggle: MapApp.#moveToggle, reveal: MapApp.#reveal, showAll: MapApp.#showAll }
  };

  static PARTS = { body: { template: `systems/${NS}/templates/map-app.hbs`, scrollable: [".ouro-mapscroll"] } };

  async _prepareContext() {
    const isGM = game.user.isGM, state = getState();
    const markers = visibleMarkers(await loadMarkers(), state, isGM).map(m => ({
      ...m, left: toPct(m.x), top: toPct(m.y), selected: m.n === this.selected,
      linkName: m.link ? ARTWORKS.find(a => a.id === m.link)?.name ?? m.link : "",
      arts: isGM ? [{ id: "", name: L("OUROBOROS.Map.noLink"), selected: !m.link }, ...ARTWORKS.map(a => ({ id: a.id, name: a.name, selected: a.id === m.link }))] : []
    }));
    const info = markers.find(m => m.n === this.selected) ?? null;
    return {
      isGM, markers, info, moveMode: this.moveMode, image: `${MAP_DIR}/paris_1892_limpio.jpg`,
      party: state.party ? { left: toPct(state.party.x), top: toPct(state.party.y) } : null
    };
  }

  _onRender() {
    const el = this.element;
    el.querySelector(".ouro-mapinner")?.addEventListener("click", ev => {
      if (!this.moveMode || !game.user.isGM || ev.target.closest(".ouro-marker")) return;
      const p = clickToNorm(el.querySelector(".ouro-mapinner").getBoundingClientRect(), ev.clientX, ev.clientY);
      if (p) moveParty(p.x, p.y);
    });
    for (const sel of el.querySelectorAll("select[data-link]")) {
      sel.addEventListener("change", () => linkMarker(sel.dataset.link, sel.value));
    }
  }

  static async #pick(ev, t) {
    const n = t.dataset.n;
    if (this.moveMode && game.user.isGM) {
      const m = (await loadMarkers()).find(k => k.n === n);
      if (m) await moveParty(m.x, m.y);
      return;
    }
    this.selected = this.selected === n ? null : n;
    this.render();
  }
  static #moveToggle() { this.moveMode = !this.moveMode; this.render(); }
  static #reveal(ev, t) { return toggleMarker(t.dataset.n); }
  static #showAll() { return showMapTo([]); }
}

let app = null;
export function openMap() {
  app ??= new MapApp();
  return app.render({ force: true });
}
export function refreshMap() {
  if (app?.rendered) app.render();
}
