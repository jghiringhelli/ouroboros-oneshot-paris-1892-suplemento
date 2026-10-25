import {
  SKILL_TN, SAVE_TN, SUITS, playValue, lowCheck, highTotal, resolveAttack, initiativeOf, jokerSuits, cardLabel,
  normMode, resolveCheckStat, tnValue, checkView
} from "./logic.mjs";
import {
  getHand, deckTypeFor, cardInfo, blindDraw, topCard, playFromHand, returnJoker, applyHp, drawToHand
} from "./cards.mjs";

const NS = "ouroboros";
const { DialogV2 } = foundry.applications.api;
const L = key => game.i18n.localize(key);
const esc = s => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sign = n => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);

/* ---------- HTML de cartas ---------- */
export function cardHtml(c, { small = false, declared = null } = {}) {
  const suit = declared?.suit ?? c.suit;
  const sym = SUITS[suit]?.symbol ?? "";
  const rank = c.joker ? (declared ? declared.value : "★") : (c.label ?? "").replace(/[♠♥♦♣]/g, "");
  const color = c.color === "red" ? "red" : "black";
  const title = c.joker && declared ? `${c.name} → ${declared.value}${sym}` : c.name;
  return `<span class="ouro-card ${color}${small ? " small" : ""}${c.joker ? " joker" : ""}" title="${esc(title)}"><b>${esc(rank)}</b><i>${sym}</i></span>`;
}

const diffOptions = table => Object.entries(table).map(([k, v]) => [k, `${L("OUROBOROS.TN." + k)} (${v})`]);

/* ---------- Diálogo de tirada ---------- */
function fieldHtml(f) {
  if (f.type === "select") {
    const opts = f.options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(f.value) ? " selected" : ""}>${esc(l)}</option>`).join("");
    return `<div class="form-group"><label>${esc(f.label)}</label><div class="form-fields"><select name="${f.name}">${opts}</select></div></div>`;
  }
  return `<div class="form-group"><label>${esc(f.label)}</label><div class="form-fields"><input type="number" name="${f.name}" value="${f.value ?? 0}" step="1"></div></div>`;
}

/** Devuelve {source: "blind"|"passive"|cardId, ...campos} o null si se cancela. */
export async function askRoll(actor, { title, fields = [], allowBlind = true, allowPassive = false, intro = "" }) {
  const hand = getHand(actor);
  const cards = hand ? hand.cards.contents.map(cardInfo) : [];
  const deckType = deckTypeFor(actor);
  const first = cards[0]?.id ?? (allowBlind ? "blind" : "passive");
  const pick = (value, inner) =>
    `<label class="ouro-pick"><input type="radio" name="source" value="${value}"${value === first ? " checked" : ""}>${inner}</label>`;
  const handHtml = [
    ...cards.map(c => pick(c.id, cardHtml(c, { small: true }))),
    allowBlind ? pick("blind", `<span class="ouro-pick-text">${L("OUROBOROS.Roll.blind")} (${deckType === "players" ? L("OUROBOROS.Deck.players") : L("OUROBOROS.Deck.gm")})</span>`) : "",
    allowPassive ? pick("passive", `<span class="ouro-pick-text">${L("OUROBOROS.Roll.passive")}</span>`) : ""
  ].join("");
  const content = `<div class="ouroboros-dialog">${intro ? `<p class="hint">${intro}</p>` : ""}
    ${fields.map(fieldHtml).join("")}
    <fieldset><legend>${L("OUROBOROS.Roll.source")}</legend><div class="ouro-hand-pick">${handHtml}</div></fieldset></div>`;
  const res = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-diamond" }, content, rejectClose: false,
    buttons: [
      { action: "ok", label: L("OUROBOROS.Roll.play"), icon: "fa-solid fa-play", default: true,
        callback: (event, button) => Object.fromEntries(new FormData(button.form)) },
      { action: "cancel", label: L("OUROBOROS.Cancel") }
    ]
  });
  return res && typeof res === "object" ? res : null;
}

export async function askJoker(info, title) {
  const suits = jokerSuits(info.color);
  const content = `<div class="ouroboros-dialog"><p>${L("OUROBOROS.Joker.hint")} (${info.color === "red" ? "♥ ♦" : "♠ ♣"})</p>
    <div class="form-group"><label>${L("OUROBOROS.Joker.value")}</label><div class="form-fields"><input type="number" name="value" min="1" max="10" value="10"></div></div>
    <div class="form-group"><label>${L("OUROBOROS.Joker.suit")}</label><div class="form-fields"><select name="suit">${suits.map(s => `<option value="${s}">${SUITS[s].symbol} ${SUITS[s].label}</option>`).join("")}</select></div></div></div>`;
  const res = await DialogV2.wait({
    window: { title }, content, rejectClose: false,
    buttons: [{ action: "ok", label: "OK", default: true, callback: (e, b) => Object.fromEntries(new FormData(b.form)) }]
  });
  const v = res && typeof res === "object" ? res : { value: 10, suit: suits[0] };
  return { value: Math.min(10, Math.max(1, Number(v.value) || 1)), suit: v.suit };
}

async function askBase(actor, face) {
  const hand = getHand(actor);
  const options = hand ? hand.cards.contents.map(cardInfo).filter(c => !c.joker && !c.face && c.color === face.color) : [];
  if (!options.length) return null;
  const content = `<div class="ouroboros-dialog"><p>${L("OUROBOROS.Face.hint")}</p><div class="ouro-hand-pick">
    ${options.map((c, i) => `<label class="ouro-pick"><input type="radio" name="base" value="${c.id}"${i === 0 ? " checked" : ""}>${cardHtml(c, { small: true })}</label>`).join("")}
    <label class="ouro-pick"><input type="radio" name="base" value=""><span class="ouro-pick-text">${L("OUROBOROS.Face.none")}</span></label></div></div>`;
  const res = await DialogV2.wait({
    window: { title: `${L("OUROBOROS.Face.title")}: ${face.label}` }, content, rejectClose: false,
    buttons: [{ action: "ok", label: "OK", default: true, callback: (e, b) => Object.fromEntries(new FormData(b.form)) }]
  });
  const id = res?.base;
  if (!id) return null;
  const [info] = await playFromHand(actor, [id]);
  return info;
}

/**
 * Obtiene la carta jugada: de la mano (source = id), a ciegas ("blind") o ninguna ("passive").
 * Devuelve {info, blind, value, overlay, declared, base, cards:[...]}.
 */
export async function acquireCard(actor, source) {
  if (source === "passive") return null;
  const deckType = deckTypeFor(actor);
  let info, blind = false;
  if (!source || source === "blind") { info = await blindDraw(deckType); blind = true; }
  else [info] = await playFromHand(actor, [source]);

  let declared = null, base = null;
  if (info.joker) {
    declared = await askJoker(info, `${actor.name}: ${info.name}`);
    if (blind && deckType === "gm") await returnJoker("gm", info.id);
  } else if (info.face && !blind) {
    base = await askBase(actor, info);
  }
  const pv = playValue(info, { blind, declared, base: base?.rank ?? null });
  return { info, blind, declared, base, value: pv.value, overlay: pv.overlay, cards: [info, ...(base ? [base] : [])] };
}

function playHtml(play) {
  const main = cardHtml(play.info, { declared: play.declared });
  const base = play.base ? `<span class="plus">+</span>${cardHtml(play.base, { small: true })}` : "";
  const tag = play.blind ? `<em class="tag">${L("OUROBOROS.Roll.blindTag")}</em>` : "";
  const overlay = play.overlay ? `<em class="tag">${L("OUROBOROS.Face." + play.overlay)}</em>` : "";
  return `<div class="ouro-play">${main}${base}<div class="ouro-playinfo"><strong>${play.value}</strong>${tag}${overlay}</div></div>`;
}

async function post(actor, content, flags = {}, extra = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), content, flags: { [NS]: flags }, ...extra
  });
}

const msgShell = (title, sub, body, cls = "") => `<div class="ouro-chat ${cls}"><header><h3>${esc(title)}</h3>${sub ? `<span>${esc(sub)}</span>` : ""}</header>${body}</div>`;

/* ---------- Chequeos (menor es mejor) ---------- */
/**
 * kind: "skill" | "save". tnKey: clave de dificultad; tn: valor manual.
 */
export async function rollCheck(actor, { kind = "skill", label, base, baseLabel, resonance = 0, resLabel = "", tnKey, tn = null, bonus = 0 }) {
  const table = kind === "save" ? SAVE_TN : SKILL_TN;
  const key = tnKey ?? "moderate";
  const ans = await askRoll(actor, {
    title: `${actor.name}: ${label}`,
    allowBlind: !getHand(actor)?.cards.size, // consciente: se elige una carta de la mano
    fields: [
      { type: "select", name: "tnKey", label: L("OUROBOROS.Roll.tn"), options: diffOptions(table), value: key },
      { type: "number", name: "tnManual", label: L("OUROBOROS.Roll.tnManual"), value: tn ?? "" },
      { type: "number", name: "bonus", label: L("OUROBOROS.Roll.bonusLow"), value: bonus }
    ]
  });
  if (!ans) return null;
  const play = await acquireCard(actor, ans.source);
  const tnValue = ans.tnManual !== "" && ans.tnManual != null ? Number(ans.tnManual) : table[ans.tnKey];
  const extra = Number(ans.bonus) || 0;
  const r = lowCheck({ value: play.value, overlay: play.overlay, base, resonance, bonus: extra, tn: tnValue });
  const parts = [`${play.value}`, `− ${base} ${baseLabel}`];
  if (resonance) parts.push(`− ${resonance} ${resLabel}`);
  if (extra) parts.push(`${extra > 0 ? "−" : "+"} ${Math.abs(extra)} ${L("OUROBOROS.Roll.bonusShort")}`);
  if (play.overlay === "jack") parts.push("− 5 (J)");
  const verdict = r.success ? L("OUROBOROS.Roll.success") : L("OUROBOROS.Roll.failure");
  const body = `${playHtml(play)}
    <div class="ouro-calc">${parts.join(" ")} = <strong>${r.result}</strong> ≤ TN ${tnValue}</div>
    <div class="ouro-verdict ${r.success ? "ok" : "ko"}">${verdict} <small>(${L("OUROBOROS.Roll.margin")} ${r.margin >= 0 ? "+" : ""}${r.margin})</small></div>`;
  await post(actor, msgShell(label, `${L("OUROBOROS.Roll.check")} · TN ${tnValue}`, body, "check"), { kind: "check", success: r.success });
  return { ...r, play, tn: tnValue };
}

export async function rollSkill(actor, index, opts = {}) {
  const s = actor.system.skills[index];
  if (!s) return null;
  return rollCheck(actor, {
    kind: "skill", label: s.name, base: actor.system.circles[s.circle], baseLabel: L("OUROBOROS.Circle." + s.circle),
    resonance: s.res, resLabel: s.name, ...opts
  });
}

export const rollAbility = (actor, key, opts = {}) => rollCheck(actor, {
  kind: "skill", label: L("OUROBOROS.Ability." + key), base: actor.system.abilities[key], baseLabel: L("OUROBOROS.Ability." + key), ...opts
});

export const rollSave = (actor, key, opts = {}) => rollCheck(actor, {
  kind: "save", label: `${L("OUROBOROS.Save." + key)}`, base: actor.system.saves[key], baseLabel: L("OUROBOROS.Save." + key), ...opts
});

/** Chequeo definido en data/checks.json: {kind: skill|ability|save, skill, circle, key, tn}. */
export async function rollFromCheck(actor, chk) {
  const tnKey = chk.tn, tn = chk.tnManual ?? null;
  if (chk.kind === "save") return rollSave(actor, chk.key, { tnKey, tn });
  if (chk.kind === "ability") return rollAbility(actor, chk.key, { tnKey, tn });
  const idx = actor.system.skills.findIndex(s => s.name.toLowerCase() === String(chk.skill).toLowerCase());
  if (idx >= 0) return rollSkill(actor, idx, { tnKey, tn });
  return rollCheck(actor, {
    kind: "skill", label: chk.skill, base: actor.system.circles[chk.circle ?? "air"], baseLabel: L("OUROBOROS.Circle." + (chk.circle ?? "air")), tnKey, tn
  });
}

/* ---------- Combate (mayor es mejor) ---------- */
const ATTR_KEYS = ["str", "dex", "con", "ref", "int", "dis", "wis", "emp"];
const attrOptions = () => ATTR_KEYS.map(k => [k, L("OUROBOROS.Attr." + k)]);

export async function rollAttack(actor, weapon = null) {
  const weapons = actor.items.filter(i => i.type === "weapon");
  weapon ??= weapons.find(w => w.system.equipped) ?? null;
  const target = game.user.targets.first()?.actor ?? null;
  const ans = await askRoll(actor, {
    title: `${actor.name}: ${L("OUROBOROS.Roll.attack")}`,
    intro: target ? `${L("OUROBOROS.Roll.target")}: <b>${esc(target.name)}</b>` : L("OUROBOROS.Roll.noTarget"),
    fields: [
      { type: "select", name: "weapon", label: L("OUROBOROS.Roll.weapon"), value: weapon?.id ?? "", options: [["", L("OUROBOROS.Roll.unarmed")], ...weapons.map(w => [w.id, `${w.name} (+${w.system.bonus})`])] },
      { type: "select", name: "attr", label: L("OUROBOROS.Roll.attribute"), value: weapon?.system.attribute ?? "str", options: attrOptions() },
      { type: "number", name: "bonus", label: L("OUROBOROS.Roll.bonusHigh"), value: 0 }
    ]
  });
  if (!ans) return null;
  const w = ans.weapon ? actor.items.get(ans.weapon) : null;
  const play = await acquireCard(actor, ans.source);
  const attribute = actor.system.attributes[ans.attr];
  const total = highTotal({
    value: play.value, overlay: play.overlay, attribute, skill: actor.system.combat.skill,
    gear: w?.system.bonus ?? 0, bonus: Number(ans.bonus) || 0
  });
  const parts = [`${play.value}`, `+ ${attribute} ${L("OUROBOROS.Attr." + ans.attr)}`];
  if (actor.system.combat.skill) parts.push(`${sign(actor.system.combat.skill)} ${L("OUROBOROS.Combat.skill")}`);
  if (w?.system.bonus) parts.push(`+ ${w.system.bonus} ${w.name}`);
  if (Number(ans.bonus)) parts.push(`${sign(Number(ans.bonus))} ${L("OUROBOROS.Roll.bonusShort")}`);
  if (play.overlay === "jack") parts.push("+ 5 (J)");
  const data = {
    kind: "attack", attackerUuid: actor.uuid, attackerName: actor.name, targetUuid: target?.uuid ?? null,
    total, overlay: play.overlay, value: play.value, damageBonus: w?.system.damageBonus ?? 0
  };
  const buttons = target ? `<div class="ouro-buttons">
      <button type="button" data-ouro="defend">${L("OUROBOROS.Roll.defendCard")}</button>
      <button type="button" data-ouro="passive">${L("OUROBOROS.Roll.defendPassive")}</button></div>` : "";
  const body = `${playHtml(play)}<div class="ouro-calc">${parts.join(" ")} = <strong>${total}</strong></div>
    ${play.overlay === "queen" ? `<p class="hint">${L("OUROBOROS.Face.queenAtk")} (${play.value})</p>` : ""}
    ${play.overlay === "king" ? `<p class="hint">${L("OUROBOROS.Face.kingAtk")}</p>` : ""}${buttons}`;
  await post(actor, msgShell(`${L("OUROBOROS.Roll.attack")}${w ? ": " + w.name : ""}`, target ? `→ ${target.name}` : "", body, "attack"), data);
  return data;
}

export async function rollDefense(target, atk, { passiveOnly = false } = {}) {
  let play = null, attr = "ref", extra = 0;
  if (!passiveOnly) {
    const ans = await askRoll(target, {
      title: `${target.name}: ${L("OUROBOROS.Roll.defense")}`,
      intro: `${L("OUROBOROS.Roll.attackTotal")}: <b>${atk.total}</b> (${esc(atk.attackerName)})`,
      allowPassive: true,
      fields: [
        { type: "select", name: "attr", label: L("OUROBOROS.Roll.attribute"), value: "ref", options: attrOptions() },
        { type: "number", name: "bonus", label: L("OUROBOROS.Roll.bonusHigh"), value: 0 }
      ]
    });
    if (!ans) return null;
    attr = ans.attr; extra = Number(ans.bonus) || 0;
    play = await acquireCard(target, ans.source);
  }
  const s = target.system;
  let defense = null, parts = [];
  if (play) {
    const total = highTotal({ value: play.value, overlay: play.overlay, attribute: s.attributes[attr], skill: s.combat.skill, gear: s.armorTotal, bonus: extra });
    defense = { total, overlay: play.overlay };
    parts = [`${play.value}`, `+ ${s.attributes[attr]} ${L("OUROBOROS.Attr." + attr)}`];
    if (s.combat.skill) parts.push(`${sign(s.combat.skill)} ${L("OUROBOROS.Combat.skill")}`);
    if (s.armorTotal) parts.push(`+ ${s.armorTotal} ${L("OUROBOROS.Combat.armor")}`);
    if (extra) parts.push(`${sign(extra)} ${L("OUROBOROS.Roll.bonusShort")}`);
    if (play.overlay === "jack") parts.push("+ 5 (J)");
  }
  const res = resolveAttack({
    attack: { total: atk.total, overlay: atk.overlay, value: atk.value, damageBonus: atk.damageBonus },
    defense, passive: s.passiveDefense
  });
  const defLine = res.mode === "active"
    ? `${parts.join(" ")} = <strong>${res.defenseTotal}</strong>`
    : res.defenseTotal != null ? `${L("OUROBOROS.Combat.passive")}: <strong>${res.defenseTotal}</strong>` : "";
  const verdict = res.hit
    ? `<div class="ouro-verdict ko">${L("OUROBOROS.Roll.damage")}: ${res.damage}</div>
       <div class="ouro-buttons"><button type="button" data-ouro="applyDamage">${L("OUROBOROS.Roll.applyDamage")} (${res.damage})</button></div>`
    : `<div class="ouro-verdict ok">${L("OUROBOROS.Roll.noDamage")}</div>`;
  const body = `${play ? playHtml(play) : ""}<div class="ouro-calc">${L("OUROBOROS.Roll.attackTotal")} <strong>${atk.total}</strong> ${defLine ? "vs " + defLine : ""}</div>
    ${res.note ? `<p class="hint">${esc(res.note)}</p>` : ""}${verdict}`;
  await post(target, msgShell(`${L("OUROBOROS.Roll.defense")}`, `${atk.attackerName} → ${target.name}`, body, "defense"),
    { kind: "damage", targetUuid: target.uuid, amount: res.damage });
  return res;
}

export async function damageActor(uuid, amount) {
  const actor = await fromUuid(uuid);
  if (!actor) return ui.notifications.warn("Objetivo no encontrado.");
  const before = actor.system.hp.value;
  const after = await applyHp(uuid, -amount);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: msgShell(actor.name, "", `<div class="ouro-calc">${L("OUROBOROS.Roll.hp")}: ${before} → <strong>${after}</strong> / ${actor.system.hp.max}${after === 0 ? ` — <b>${L("OUROBOROS.Roll.down")}</b>` : ""}</div>`, "hp")
  });
}

/* ---------- Iniciativa ---------- */
export async function rollInitiativeCard(actor) {
  const ans = await askRoll(actor, { title: `${actor.name}: ${L("OUROBOROS.Initiative")}`, fields: [] });
  if (!ans) return null;
  const play = await acquireCard(actor, ans.source);
  const { fire, air } = actor.system.circles;
  const r = initiativeOf({ value: play.value, fire, air });
  const body = `${playHtml(play)}<div class="ouro-calc">${play.value} + ${fire} ${L("OUROBOROS.Circle.fire")} + ${air} ${L("OUROBOROS.Circle.air")} = <strong>${r.total}</strong></div>`;
  await post(actor, msgShell(L("OUROBOROS.Initiative"), "", body, "initiative"), { kind: "initiative", total: r.total });
  return r;
}

/* ---------- Poderes y reloj de Semilla ---------- */
export async function usePower(actor, item) {
  const s = item.system;
  const par = s.parity === "even" ? L("OUROBOROS.Power.even") : L("OUROBOROS.Power.odd");
  const body = `<p class="hint">${SUITS[s.suit].symbol} ${par} · ${L("OUROBOROS.Power.level")} ${s.level}</p><p>${esc(s.text)}</p>`;
  await post(actor, msgShell(item.name, L("OUROBOROS.Power.title"), body, "power"));
}

export async function plantSeed(actor) {
  const hours = actor.system.willpower * 8;
  await actor.update({ "system.seed.active": true, "system.seed.hours": hours, "system.seed.failures": 0 });
  await post(actor, msgShell(L("OUROBOROS.Seed.title"), "",
    `<p>${L("OUROBOROS.Seed.planted")} <b>${hours} h</b> (Willpower ${actor.system.willpower} × 8).</p><p class="hint">${L("OUROBOROS.Seed.handNote")}</p>`, "seed"));
}

export async function createWork(actor) {
  const s = actor.system;
  const idx = s.skills.findIndex(k => k.name.toLowerCase() === "arte");
  const tn = SKILL_TN.hard + s.seed.failures;
  const art = idx >= 0 ? s.skills[idx] : { circle: "air", res: 0, name: "Arte" };
  const r = await rollCheck(actor, {
    kind: "skill", label: L("OUROBOROS.Seed.create"), base: s.circles[art.circle], baseLabel: L("OUROBOROS.Circle." + art.circle),
    resonance: art.res, resLabel: art.name, tnKey: "hard", tn
  });
  if (!r) return null;
  if (r.success) {
    await actor.update({ "system.seed.active": false });
    await post(actor, msgShell(L("OUROBOROS.Seed.manifestation"), "", `<p>${L("OUROBOROS.Seed.created")}</p>`, "seed"));
  } else {
    const hours = Math.max(0, s.seed.hours - 1);
    await actor.update({ "system.seed.failures": s.seed.failures + 1, "system.seed.hours": hours });
    if (hours === 0) await post(actor, msgShell(L("OUROBOROS.Seed.title"), "", `<p><b>${L("OUROBOROS.Seed.burst")}</b> ${s.willpower} ${L("OUROBOROS.Seed.muses")}</p>`, "seed"));
  }
  return r;
}

/* ---------- Jugar una carta con un uso etiquetado / tope del mazo ---------- */
export const USES = ["attack", "defense", "skill", "save", "initiative", "other"];
const useLabel = ({ use, text }) => (use === "other" ? (text || L("OUROBOROS.Use.other")) : `${L("OUROBOROS.Use." + use)}${text ? ` — ${text}` : ""}`);

export async function askUse(title) {
  const opts = USES.map(u => `<option value="${u}">${esc(L("OUROBOROS.Use." + u))}</option>`).join("");
  const res = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-diamond" }, rejectClose: false,
    content: `<div class="ouroboros-dialog"><div class="form-group"><label>${L("OUROBOROS.Use.title")}</label><div class="form-fields"><select name="use">${opts}</select></div></div>
      <div class="form-group"><label>${L("OUROBOROS.Use.text")}</label><div class="form-fields"><input type="text" name="text"></div></div></div>`,
    buttons: [
      { action: "ok", label: "OK", default: true, callback: (e, b) => Object.fromEntries(new FormData(b.form)) },
      { action: "cancel", label: L("OUROBOROS.Cancel") }
    ]
  });
  return res && typeof res === "object" ? res : null;
}

async function announceUse(actor, info, declared, use, { top = false } = {}) {
  const pv = playValue(info, { blind: top, declared });
  const tag = top ? `<em class="tag">${L("OUROBOROS.Use.topTag")}</em>` : "";
  const body = `<div class="ouro-play">${cardHtml(info, { declared })}<div class="ouro-playinfo"><strong>${pv.value}</strong>${tag}</div></div>
    <div class="ouro-calc">${L("OUROBOROS.Use.title")}: <strong>${esc(useLabel(use))}</strong></div>`;
  await post(actor, msgShell(top ? L("OUROBOROS.Use.topTitle") : L("OUROBOROS.Roll.playsCard"), "", body, "play"), { kind: "use", use: use.use });
}

/** Juega una carta de la mano con un uso etiquetado: mensaje en el chat y va al descarte. */
export async function playWithUse(actor, cardId, use = null) {
  use ??= await askUse(`${actor.name}: ${L("OUROBOROS.Hand.play")}`);
  if (!use) return null;
  const [info] = await playFromHand(actor, [cardId]);
  const declared = info.joker ? await askJoker(info, `${actor.name}: ${info.name}`) : null;
  await announceUse(actor, info, declared, use);
  return info;
}
export const playLoose = (actor, cardId) => playWithUse(actor, cardId);

/** «Usar tope del mazo»: robo ciego (figura = 5, Joker = comodín 1–10) con un uso etiquetado. */
export async function useTopCard(actor, use = null) {
  use ??= await askUse(`${actor.name}: ${L("OUROBOROS.Use.topTitle")}`);
  if (!use) return null;
  const deckType = deckTypeFor(actor);
  const info = await topCard(deckType);
  let declared = null;
  if (info.joker) {
    declared = await askJoker(info, `${actor.name}: ${info.name}`);
    if (deckType === "gm") await returnJoker("gm", info.id);
  }
  await announceUse(actor, info, declared, use, { top: true });
  return info;
}

/* ---------- Chequeo PASIVO (lo ejecuta el GM; el jugador no sabe qué se comprueba) ---------- */
const statLabel = chk => (chk.label ?? (chk.kind === "save" ? L("OUROBOROS.Save." + chk.key) : chk.kind === "ability" ? L("OUROBOROS.Ability." + chk.key) : chk.skill));
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const ownerIds = actor => game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id);

export const narrate = (userIds, html) => ChatMessage.create({
  speaker: { alias: L("OUROBOROS.GM") }, whisper: userIds, content: `<div class="ouro-chat"><div class="ouro-narr">${html}</div></div>`
});

/**
 * Fuerza el robo ciego del tope del mazo (sin elegir). Resultado completo solo al GM; al jugador, solo lo que percibe
 * (y únicamente si lo supera): nunca el TN ni qué se comprobó.
 */
export async function runPassiveCheck(actor, chk, { notifyPlayer = true } = {}) {
  if (!game.user.isGM) throw new Error("El chequeo pasivo lo ejecuta el GM");
  const deckType = deckTypeFor(actor);
  const info = await topCard(deckType);
  let declared = null;
  if (info.joker) {
    declared = await askJoker(info, `${actor.name}: ${info.name} (${L("OUROBOROS.Check.passive")})`);
    if (deckType === "gm") await returnJoker("gm", info.id);
  }
  const play = { info, blind: true, declared, ...playValue(info, { blind: true, declared }) };
  const stat = resolveCheckStat(actor.system, chk);
  const tn = chk.tnManual ?? tnValue(chk.kind, chk.tn);
  const r = lowCheck({ value: play.value, base: stat.base, resonance: stat.resonance, tn });
  const view = checkView("passive", { success: r.success, tn, clue: chk.clue });
  const calc = `${play.value} − ${stat.base}${stat.resonance ? ` − ${stat.resonance}` : ""} = <strong>${r.result}</strong> ≤ TN ${tn}`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: gmIds(),
    content: msgShell(`${L("OUROBOROS.Check.passive")}: ${statLabel(chk)}`, actor.name,
      `${playHtml(play)}<div class="ouro-calc">${calc}</div><div class="ouro-verdict ${r.success ? "ok" : "ko"}">${r.success ? L("OUROBOROS.Roll.success") : L("OUROBOROS.Roll.failure")}</div>${chk.clue ? `<p class="hint">${esc(chk.clue)}</p>` : ""}`, "check")
  });
  if (notifyPlayer && view.player.shows === "perceived") {
    const to = ownerIds(actor);
    if (to.length) await narrate([...to, ...gmIds()], esc(view.player.text || L("OUROBOROS.Check.perceived")));
  }
  return { ...r, tn, play, view };
}
export async function drawAndAnnounce(actor, n = 1) {
  const cards = await drawToHand(actor, n);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: [game.user.id],
    content: msgShell(actor.name, "", `<p>${L("OUROBOROS.Hand.drew")} ${n}: ${cards.map(c => cardHtml(c, { small: true })).join(" ")}</p>`, "draw")
  });
  return cards;
}

/* ---------- Pedir chequeo ---------- */
export async function requestCheck(chk, actorIds) {
  const actors = actorIds.map(id => game.actors.get(id)).filter(Boolean);
  if (normMode(chk.mode) === "passive") {
    for (const a of actors) await runPassiveCheck(a, chk);
    return;
  }
  const label = chk.label;
  const tnTxt = chk.tnManual != null ? `TN ${chk.tnManual}` : `${L("OUROBOROS.TN." + chk.tn)} (${(chk.kind === "save" ? SAVE_TN : SKILL_TN)[chk.tn]})`;
  const stat = chk.kind === "save" ? L("OUROBOROS.Save." + chk.key) : chk.kind === "ability" ? L("OUROBOROS.Ability." + chk.key) : chk.skill;
  const buttons = actors.map(a => `<button type="button" data-ouro="requestRoll" data-actor="${a.id}">${esc(a.name)}</button>`).join("");
  const body = `<p><b>${L("OUROBOROS.Check.conscious")}</b> · ${esc(stat)} · ${tnTxt}</p><div class="ouro-buttons">${buttons}</div>`;
  await ChatMessage.create({
    speaker: { alias: L("OUROBOROS.GM") },
    content: msgShell(label, L("OUROBOROS.Request.title"), body, "request"),
    flags: { [NS]: { kind: "request", check: chk } }
  });
}

/* ---------- Enlaces en el chat ---------- */
export function bindChat(message, html) {
  const fl = message.flags?.[NS];
  if (!fl) return;
  html.querySelectorAll("[data-ouro]").forEach(btn => btn.addEventListener("click", async ev => {
    ev.preventDefault();
    const act = btn.dataset.ouro;
    if (act === "defend" || act === "passive") {
      const target = await fromUuid(fl.targetUuid);
      if (!target?.isOwner) return ui.notifications.warn(L("OUROBOROS.Roll.notOwner"));
      return rollDefense(target, fl, { passiveOnly: act === "passive" });
    }
    if (act === "applyDamage") {
      const target = await fromUuid(fl.targetUuid);
      if (!target?.isOwner && !game.user.isGM) return ui.notifications.warn(L("OUROBOROS.Roll.notOwner"));
      btn.disabled = true;
      return damageActor(fl.targetUuid, fl.amount);
    }
    if (act === "requestRoll") {
      const actor = game.actors.get(btn.dataset.actor);
      if (!actor?.isOwner) return ui.notifications.warn(L("OUROBOROS.Roll.notOwner"));
      return rollFromCheck(actor, fl.check);
    }
  }));
}
