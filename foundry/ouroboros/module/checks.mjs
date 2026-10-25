import { SKILL_TN, SAVE_TN, normMode } from "./logic.mjs";
import { requestCheck } from "./rolls.mjs";

const { DialogV2 } = foundry.applications.api;
const L = k => game.i18n.localize(k);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

const ABILITIES = ["athletics", "perception", "influence", "intuition", "composure", "insight"];
const SAVES = ["fortitude", "reflex", "resolve", "nerve"];
const opt = (v, l, sel = false) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(l)}</option>`;
const tnOptions = () =>
  `<optgroup label="${L("OUROBOROS.Check.tnSkill")}">${Object.entries(SKILL_TN).map(([k, v]) => opt(v, `${L("OUROBOROS.TN." + k)} (${v})`, k === "moderate")).join("")}</optgroup>` +
  `<optgroup label="${L("OUROBOROS.Check.tnSave")}">${Object.entries(SAVE_TN).map(([k, v]) => opt(v, `${L("OUROBOROS.TN." + k)} (${v})`)).join("")}</optgroup>`;

/** Convierte el valor del selector de prueba en {kind, key, label}. */
function parseStat(value, skillName, circle) {
  if (skillName?.trim()) return { kind: "skill", skill: skillName.trim(), circle, label: skillName.trim() };
  const [kind, key] = String(value).split(":");
  return { kind, key, label: kind === "save" ? L("OUROBOROS.Save." + key) : L("OUROBOROS.Ability." + key) };
}

/** Diálogo del GM «Pedir chequeo»: prueba, TN, modo consciente/pasivo y destino. */
export async function requestCheckDialog() {
  const chars = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
  const stats = `<optgroup label="${L("OUROBOROS.Check.abilities")}">${ABILITIES.map(k => opt(`ability:${k}`, L("OUROBOROS.Ability." + k), k === "perception")).join("")}</optgroup>` +
    `<optgroup label="${L("OUROBOROS.Check.saves")}">${SAVES.map(k => opt(`save:${k}`, L("OUROBOROS.Save." + k))).join("")}</optgroup>`;
  const content = `<div class="ouroboros-dialog ouro-checkdlg">
    <fieldset class="ouro-mode"><legend>${L("OUROBOROS.Check.mode")}</legend>
      <label><input type="radio" name="mode" value="conscious" checked> <b>${L("OUROBOROS.Check.conscious")}</b> <small>${L("OUROBOROS.Check.consciousHint")}</small></label>
      <label><input type="radio" name="mode" value="passive"> <b>${L("OUROBOROS.Check.passive")}</b> <small>${L("OUROBOROS.Check.passiveHint")}</small></label>
    </fieldset>
    <div class="form-group"><label>${L("OUROBOROS.Check.stat")}</label><div class="form-fields"><select name="stat">${stats}</select></div></div>
    <div class="form-group"><label>${L("OUROBOROS.Check.skillName")}</label><div class="form-fields"><input type="text" name="skill" placeholder="Arte, Ocultismo…">
      <select name="circle">${["earth", "water", "air", "fire"].map(c => opt(c, L("OUROBOROS.Circle." + c), c === "air")).join("")}</select></div></div>
    <div class="form-group"><label>${L("OUROBOROS.Roll.tn")}</label><div class="form-fields"><select name="tn">${tnOptions()}</select></div></div>
    <div class="form-group"><label>${L("OUROBOROS.Check.clue")}</label><div class="form-fields"><input type="text" name="clue"></div></div>
    <div class="form-group"><label>${L("OUROBOROS.Check.target")}</label><div class="form-fields"><select name="who">${opt("all", L("OUROBOROS.Check.all"))}${chars.map(a => opt(a.id, a.name)).join("")}</select></div></div>
  </div>`;
  const res = await DialogV2.wait({
    window: { title: L("OUROBOROS.Request.title"), icon: "fa-solid fa-paper-plane" }, rejectClose: false, content,
    buttons: [
      { action: "ok", label: L("OUROBOROS.Request.title"), default: true, callback: (e, b) => Object.fromEntries(new FormData(b.form)) },
      { action: "cancel", label: L("OUROBOROS.Cancel") }
    ]
  });
  if (!res || typeof res !== "object") return null;
  const stat = parseStat(res.stat, res.skill, res.circle);
  const chk = { id: "adhoc", ...stat, tnManual: Number(res.tn), mode: normMode(res.mode), clue: res.clue ?? "" };
  const ids = res.who === "all" ? chars.map(a => a.id) : [res.who];
  if (!ids.length) { ui.notifications.warn(L("OUROBOROS.Check.noTargets")); return null; }
  await requestCheck(chk, ids);
  return chk;
}
