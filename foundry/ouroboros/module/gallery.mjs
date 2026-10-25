import { ARTWORKS, EXTRA_IMAGES, showArt, showImage, hideArt, playArt, transformArt } from "./art.mjs";
import { rollAbility, runPassiveCheck } from "./rolls.mjs";
import { markGalleryPlayed } from "./cards.mjs";
import {
  SKILL_TN, MEDIA_BASE_DEFAULT, GALLERY_MODES, mediaUrls, perceptionTN, galleryMode, paintingState, pendingUsers,
  markPlayedFor, resetPainting, resetAll, whisperTargets
} from "./logic.mjs";

const NS = "ouroboros";
const SOCKET = "system.ouroboros";
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const L = k => game.i18n.localize(k);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const PASSIVE_DELAY = 2500;

/* ---------- Ajustes y estado (Setting de mundo; solo lo escribe el GM) ---------- */
export const getMediaBase = () => String(game.settings.get(NS, "mediaBaseUrl") || MEDIA_BASE_DEFAULT);
const getState = () => game.settings.get(NS, "galleryState") ?? {};
const setState = state => game.settings.set(NS, "galleryState", state);

export function registerGallerySettings() {
  game.settings.register(NS, "mediaBaseUrl", {
    name: "OUROBOROS.Gallery.mediaBase", hint: "OUROBOROS.Gallery.mediaBaseHint", scope: "world", config: true,
    type: String, default: MEDIA_BASE_DEFAULT
  });
  game.settings.register(NS, "galleryState", {
    scope: "world", config: false, type: Object, default: {}, onChange: () => Hooks.callAll("ouroborosGallery")
  });
}

const artName = id => ARTWORKS.find(a => a.id === id)?.name ?? id;
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const characterOf = user => user?.character ?? game.actors.find(a => a.type === "character" && !user?.isGM && a.testUserPermission(user, "OWNER")) ?? null;

/* ---------- Resultado: susurro con enlaces o texto atmosférico ---------- */
const link = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

async function whisperOutcome(user, art, success) {
  const urls = mediaUrls(getMediaBase(), art);
  const body = success
    ? `<p>${L("OUROBOROS.Gallery.perceptionOk")}</p><ul><li>${link(urls.video, L("OUROBOROS.Gallery.linkVideo"))}</li><li>${link(urls.macabre, L("OUROBOROS.Gallery.linkMacabre"))}</li></ul>`
    : `<em>${L("OUROBOROS.Gallery.perceptionFail")}</em>`;
  await ChatMessage.create({
    speaker: { alias: artName(art) }, whisper: whisperTargets(user.id, gmIds()),
    content: `<div class="ouro-chat"><div class="ouro-narr">${body}</div></div>`
  });
}

/* ---------- Mostrar una pintura (GM) ---------- */
/** Muestra la pintura a los usuarios y dispara el chequeo de percepción según el modo configurado. */
export async function showPainting(art, userIds) {
  if (!game.user.isGM) return;
  const st = paintingState(getState(), art);
  const mode = galleryMode(st.mode), tn = perceptionTN(st.tn);
  showArt(art, userIds);
  if (mode === "none") return;
  for (const id of pendingUsers(getState(), art, userIds)) {
    const user = game.users.get(id), actor = characterOf(user);
    if (!user || user.isGM || !actor) continue;
    if (mode === "conscious") game.socket.emit(SOCKET, { type: "gallery", cmd: "check", user: id, art, tn });
    else setTimeout(() => passiveLook(user, actor, art, tn).catch(e => console.error("Ouroboros | galería", e)), PASSIVE_DELAY);
  }
}

/** Pasivo: el GM fuerza el tope del mazo; el jugador solo recibe lo que percibe. */
async function passiveLook(user, actor, art, tn) {
  const r = await runPassiveCheck(actor, { kind: "ability", key: "perception", tn, label: `${L("OUROBOROS.Ability.perception")} · ${artName(art)}`, mode: "passive" }, { notifyPlayer: false });
  if (r.success) {
    await setState(markPlayedFor(getState(), art, [user.id]));
    playArt(art, [user.id]);
  }
  await whisperOutcome(user, art, r.success);
}

/** Consciente: lo ejecuta el cliente del jugador, que elige carta de su mano. */
async function consciousLook({ art, tn }) {
  const actor = characterOf(game.user);
  if (!actor) return;
  const r = await rollAbility(actor, "perception", { tnKey: perceptionTN(tn) });
  if (!r) return;
  if (r.success) {
    await markGalleryPlayed(art, [game.user.id]);
    playArt(art, [game.user.id]);
  }
  await whisperOutcome(game.user, art, r.success);
}

/** Receptor de sockets de la galería. Devuelve true si gestionó el mensaje. */
export function handleGallerySocket(msg) {
  if (msg.type !== "gallery") return false;
  if (msg.cmd === "check" && msg.user === game.user.id) consciousLook(msg).catch(e => console.error("Ouroboros | galería", e));
  return true;
}

/* ---------- Controles del GM ---------- */
export async function fireNow(art, userIds) {
  if (!game.user.isGM) return;
  await setState(markPlayedFor(getState(), art, userIds));
  showArt(art, userIds);
  setTimeout(() => playArt(art, userIds), 700);
}
export const resetOne = art => setState(resetPainting(getState(), art));
export const resetAllPaintings = () => setState(resetAll(getState()));
const patch = (art, data) => setState({ ...getState(), [art]: { ...paintingState(getState(), art), ...data } });

/* ---------- Ventana «Galería» (GM) ---------- */
export class GalleryApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ouroboros-gallery",
    classes: ["ouroboros", "ouro-app"],
    position: { width: 560, height: 720 },
    window: { title: "OUROBOROS.Gallery.title", icon: "fa-solid fa-panorama", resizable: true },
    actions: {
      show: GalleryApp.#show, fire: GalleryApp.#fire, reset: GalleryApp.#reset, resetAll: GalleryApp.#resetAll,
      transform: GalleryApp.#transform, hide: GalleryApp.#hide, image: GalleryApp.#image
    }
  };

  static PARTS = { body: { template: `systems/${NS}/templates/gallery-panel.hbs`, scrollable: [".ouro-scroll"] } };

  async _prepareContext() {
    const state = getState();
    const tns = Object.keys(SKILL_TN).map(k => ({ key: k, label: L(`OUROBOROS.TN.${k}`) }));
    const names = id => game.users.get(id)?.name ?? "?";
    const kinds = k => EXTRA_IMAGES.filter(i => i.kind === k).map(i => ({ ...i, thumb: `systems/${NS}/assets/extra/${i.id}.png` }));
    return {
      portraits: kinds("retrato"), posters: kinds("cartel"),
      users: game.users.filter(u => !u.isGM).map(u => ({ id: u.id, name: u.name, active: u.active, checked: u.active })),
      paintings: ARTWORKS.map(a => {
        const s = paintingState(state, a.id);
        return {
          id: a.id, name: a.name, thumb: `systems/${NS}/assets/art/${a.id}_pure.png`, played: s.played.map(names).join(", "),
          tns: tns.map(t => ({ ...t, selected: t.key === perceptionTN(s.tn) })),
          modes: GALLERY_MODES.map(m => ({ key: m, label: L(`OUROBOROS.Gallery.mode.${m}`), selected: m === galleryMode(s.mode) }))
        };
      })
    };
  }

  _onRender() {
    for (const sel of this.element.querySelectorAll("select[data-field]")) {
      sel.addEventListener("change", () => patch(sel.dataset.id, { [sel.dataset.field]: sel.value }));
    }
  }

  #users() {
    const ids = [...this.element.querySelectorAll("input[name=users]:checked")].map(i => i.value);
    if (!ids.length) ui.notifications.warn(L("OUROBOROS.Gallery.noUsers"));
    return ids;
  }

  static #show(ev, t) { const u = this.#users(); if (u.length) return showPainting(t.dataset.id, u); }
  static #fire(ev, t) { const u = this.#users(); if (u.length) return fireNow(t.dataset.id, u); }
  static #reset(ev, t) { return resetOne(t.dataset.id); }
  static #resetAll() { return resetAllPaintings(); }
  static #transform() { return transformArt([], 0); }
  static #hide() { return hideArt([]); }
  static #image(ev, t) { const u = this.#users(); if (u.length) return showImage(t.dataset.id, u); }
}

let app = null;
export function openGallery() {
  if (!game.user.isGM) return ui.notifications.warn("Solo para el GM.");
  app ??= new GalleryApp();
  return app.render({ force: true });
}
export function refreshGallery() {
  if (app?.rendered) app.render();
}
