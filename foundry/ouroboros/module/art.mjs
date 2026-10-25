const SOCKET = "system.ouroboros";
const BASE = "systems/ouroboros/assets/art";
const EXTRA = "systems/ouroboros/assets/extra";

export const ARTWORKS = [
  { id: "01_bathsheba", name: "Bathsheba (dama de baile)", scene: "Escena 2" },
  { id: "02_hombre_y_toro", name: "«El Hombre y el Toro» (lienzo de Pinot)", scene: "Escena 4" },
  { id: "03_minotauro", name: "Minotauro", scene: "Acto 3" },
  { id: "04_cinco_mil", name: "«5 000» (Cristo y la mujer)", scene: "Acto 2" },
  { id: "05_fenix", name: "Fénix", scene: "Acto 2" },
  { id: "06_cabana_thoiry", name: "La cabaña de Thoiry", scene: "Acto 3" },
  { id: "07_kraken", name: "El kraken del lago", scene: "Acto 3" },
  { id: "08_musas", name: "Las Musas", scene: "Escena 4" },
  { id: "09_cartel_rosacruz", name: "Cartel del Salón Rosa+Cruz", scene: "Escena 1" },
  { id: "10_estatua_bathsheba", name: "Estatua de Bathsheba", scene: "Acto 3" },
  // pure = estatua inicial, vídeo estatua→mujer y macabre = mujer (fotograma final, donde queda congelado)
  { id: "11_transformacion_bathsheba", name: "La transformación de Bathsheba", scene: "Acto 3", endOn: "macabre" }
];

/** Retratos y carteles sueltos (assets/extra): se muestran sin chequeo. */
export const EXTRA_IMAGES = [
  ...["edwina_alexander:Edwina Alexander", "jane_harnsworth_wright:Jane Harnsworth Wright", "clovis_hebert:Clovis Hébert", "donatien_benoit:Donatien Benoit",
    "rene_rochefort:René Rochefort", "bathsheba:Bathsheba", "antonin_pinot:Antonin Pinot", "josephin_peladan:Joséphin Péladan",
    "maximillien_lavagne:Maximillien Lavagne", "pierre_la_rush:Pierre La Rush", "aimee_prideaux:Aimée Prideaux"]
    .map(s => { const [k, name] = s.split(":"); return { id: `retrato_${k}`, name, kind: "retrato" }; }),
  ...["casa_de_absenta:Casa de absenta", "fiesta_peladan:Fiesta de Péladan", "la_morgue:La Morgue", "thoiry:Thoiry"]
    .map(s => { const [k, name] = s.split(":"); return { id: `cartel_${k}`, name, kind: "cartel" }; })
];

/* ---------- Cliente: overlay ---------- */
let overlay = null;
let overlayId = null;
let timers = [];
let busy = false;

const wait = ms => new Promise(res => timers.push(setTimeout(res, ms)));
const safe = async anim => { try { await anim.finished; return true; } catch { return false; } };

function onKey(ev) { if (ev.key === "Escape" && overlay) hideLocal(); }

/** `extra`: id de una imagen suelta (assets/extra); sin versión macabra ni vídeo. */
export function showLocal(id, extra = false) {
  hideLocal(true);
  const wrap = document.createElement("div");
  wrap.className = "ouro-art-overlay";
  wrap.innerHTML = `<div class="ouro-art-frame"><img class="pure" alt=""><img class="macabre" alt=""><video class="vid" muted playsinline preload="auto" hidden></video></div><button type="button" class="ouro-art-close" title="Esc">×</button><div class="ouro-art-missing" hidden></div>`;
  wrap.querySelector(".ouro-art-close").onclick = () => hideLocal();
  const pure = wrap.querySelector(".pure"), mac = wrap.querySelector(".macabre"), miss = wrap.querySelector(".ouro-art-missing");
  const src = extra ? `${EXTRA}/${id}.png` : `${BASE}/${id}_pure.png`;
  pure.onerror = () => { miss.hidden = false; miss.textContent = `Falta la imagen: ${src}`; };
  pure.src = src;
  if (extra) mac.remove(); else mac.src = `${BASE}/${id}_macabre.png`;
  document.body.append(wrap);
  overlay = wrap;
  overlayId = id;
  document.addEventListener("keydown", onKey);
  wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease-out" });
}

export function hideLocal(immediate = false) {
  timers.forEach(clearTimeout);
  timers = [];
  busy = false;
  document.removeEventListener("keydown", onKey);
  const el = overlay;
  overlay = null;
  overlayId = null;
  if (!el) return;
  if (immediate) return el.remove();
  const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" });
  a.finished.then(() => el.remove(), () => el.remove());
}

export async function transformLocal(delaySeconds = 0) {
  if (!overlay || busy) return;
  busy = true;
  const el = overlay;
  if (delaySeconds > 0) await wait(delaySeconds * 1000);
  if (overlay !== el) return;
  const frame = el.querySelector(".ouro-art-frame"), mac = el.querySelector(".macabre");
  if (!mac) { busy = false; return; }
  // Fundido pura → macabra
  if (!await safe(mac.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2500, easing: "ease-in-out", fill: "forwards" }))) return;
  // Movimiento sutil sobre la macabra
  const motion = frame.animate([
    { transform: "scale(1)", filter: "brightness(1) hue-rotate(0deg)" },
    { transform: "scale(1.012)", filter: "brightness(1.12) hue-rotate(3deg)", offset: 0.3 },
    { transform: "scale(1.018)", filter: "brightness(0.92) hue-rotate(-3deg)", offset: 0.6 },
    { transform: "scale(1.025)", filter: "brightness(1.08) hue-rotate(2deg)" }
  ], { duration: 3000, easing: "ease-in-out", fill: "forwards" });
  if (!await safe(motion)) return;
  // Regreso instantáneo a la imagen pura
  mac.getAnimations().forEach(a => a.cancel());
  frame.getAnimations().forEach(a => a.cancel());
  busy = false;
}

/** Reproduce el MP4 local una vez (silenciado, sin loop) sobre la imagen; al terminar se oculta y queda la imagen original. */
export function playVideoLocal(id) {
  if (!overlay || overlayId !== id) return;
  const vid = overlay.querySelector("video.vid");
  if (!vid || vid.dataset.played) return;
  vid.dataset.played = "1";
  const mac = overlay.querySelector(".macabre");
  const endOnMacabre = ARTWORKS.find(a => a.id === id)?.endOn === "macabre" && mac;
  const done = () => {
    if (endOnMacabre) { mac.getAnimations().forEach(a => a.cancel()); mac.style.opacity = "1"; }
    vid.hidden = true; vid.removeAttribute("src"); vid.load();
  };
  vid.muted = true;
  vid.loop = false;
  vid.addEventListener("ended", done, { once: true });
  vid.addEventListener("error", done, { once: true });
  vid.src = `${BASE}/${id}.mp4`;
  vid.hidden = false;
  vid.play().catch(done);
}

/* ---------- Emisión (GM) ---------- */
const targets = users => (users?.length ? users : game.users.filter(u => u.active && !u.isGM).map(u => u.id));

function send(cmd, users, extra = {}) {
  const ids = targets(users);
  game.socket.emit(SOCKET, { type: "art", cmd, users: ids, ...extra });
  if (ids.includes(game.user.id)) runCommand(cmd, extra);
}

function runCommand(cmd, p) {
  if (cmd === "show") showLocal(p.art);
  else if (cmd === "image") showLocal(p.art, true);
  else if (cmd === "play") playVideoLocal(p.art);
  else if (cmd === "transform") transformLocal(p.delay ?? 0);
  else if (cmd === "hide") hideLocal();
}

export const showArt = (art, users) => send("show", users, { art });
export const showImage = (id, users) => send("image", users, { art: id });
export const playArt = (art, users) => send("play", users, { art });
export const transformArt = (users, delay = 0) => send("transform", users, { delay: Number(delay) || 0 });
export const hideArt = users => send("hide", users);

/** Receptor de sockets (todos los clientes). Devuelve true si gestionó el mensaje. */
export function handleArtSocket(msg) {
  if (msg.type !== "art") return false;
  if (msg.users?.includes(game.user.id)) runCommand(msg.cmd, msg);
  return true;
}
