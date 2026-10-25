import { CIRCLES, SUITS } from "./logic.mjs";
import * as Rolls from "./rolls.mjs";
import { getHand, cardInfo, ensureHand } from "./cards.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const L = k => game.i18n.localize(k);
const T = "systems/ouroboros/templates";

const CIRCLE_ORDER = ["earth", "water", "air", "fire"];
const CIRCLE_SUIT = { earth: "♠", water: "♥", air: "♦", fire: "♣" };
const ABILITIES = ["athletics", "perception", "influence", "intuition", "composure", "insight"];
const SAVES = ["fortitude", "reflex", "resolve", "nerve"];

export class OuroborosActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  tab = "main";

  static DEFAULT_OPTIONS = {
    classes: ["ouroboros", "sheet", "actor"],
    position: { width: 740, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      setTab: OuroborosActorSheet.#setTab,
      rollSkill: OuroborosActorSheet.#rollSkill,
      rollAbility: OuroborosActorSheet.#rollAbility,
      rollSave: OuroborosActorSheet.#rollSave,
      rollAttack: OuroborosActorSheet.#rollAttack,
      rollInit: OuroborosActorSheet.#rollInit,
      addSkill: OuroborosActorSheet.#addSkill,
      delSkill: OuroborosActorSheet.#delSkill,
      createItem: OuroborosActorSheet.#createItem,
      editItem: OuroborosActorSheet.#editItem,
      deleteItem: OuroborosActorSheet.#deleteItem,
      toggleEquip: OuroborosActorSheet.#toggleEquip,
      usePower: OuroborosActorSheet.#usePower,
      hpMod: OuroborosActorSheet.#hpMod,
      openHand: OuroborosActorSheet.#openHand,
      drawCard: OuroborosActorSheet.#drawCard,
      plantSeed: OuroborosActorSheet.#plantSeed,
      createWork: OuroborosActorSheet.#createWork,
      createHand: OuroborosActorSheet.#createHand
    }
  };

  static PARTS = { body: { template: `${T}/actor-sheet.hbs`, scrollable: [".ouro-scroll"] } };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const doc = this.document, s = doc.system;
    const attrs = s.attributes;
    ctx.actor = doc;
    ctx.system = s;
    ctx.isCharacter = doc.type === "character";
    ctx.tabs = { main: this.tab === "main", skills: this.tab === "skills", gear: this.tab === "gear", bio: this.tab === "bio" };
    ctx.circles = CIRCLE_ORDER.map(c => ({
      key: c, label: L(`OUROBOROS.Circle.${c}`), suit: CIRCLE_SUIT[c], value: s.circles[c],
      attrs: CIRCLES[c].map(a => ({ key: a, label: L(`OUROBOROS.Attr.${a}`), value: attrs[a] }))
    }));
    ctx.abilities = ABILITIES.map(k => ({ key: k, label: L(`OUROBOROS.Ability.${k}`), value: s.abilities[k] }));
    ctx.saves = SAVES.map(k => ({ key: k, label: L(`OUROBOROS.Save.${k}`), value: s.saves[k] }));
    ctx.skills = s.skills.map((k, i) => ({ ...k, index: i, total: s.circles[k.circle] + k.res }));
    ctx.circleChoices = CIRCLE_ORDER.map(c => ({ key: c, label: L(`OUROBOROS.Circle.${c}`) }));
    const items = doc.items.contents.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    ctx.weapons = items.filter(i => i.type === "weapon");
    ctx.armors = items.filter(i => i.type === "armor");
    ctx.powers = items.filter(i => i.type === "power").map(p => ({
      id: p.id, name: p.name, img: p.img, text: p.system.text, level: p.system.level,
      suit: SUITS[p.system.suit].symbol, parity: L(`OUROBOROS.Power.${p.system.parity}`)
    }));
    ctx.gear = items.filter(i => i.type === "gear");
    ctx.hpPct = s.hp.max ? Math.round((100 * s.hp.value) / s.hp.max) : 0;
    ctx.jobSuits = [["", "—"], ...Object.entries(SUITS).map(([k, v]) => [k, `${v.symbol} ${v.label}`])];
    ctx.jobSuitSymbol = SUITS[s.job.suit]?.symbol ?? "";
    const hand = getHand(doc);
    ctx.hasHand = !!hand;
    ctx.handCards = hand ? hand.cards.contents.map(cardInfo) : [];
    ctx.handCount = ctx.handCards.length;
    return ctx;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelectorAll(".skill-edit").forEach(el => el.addEventListener("change", ev => {
      ev.stopPropagation();
      const input = ev.currentTarget;
      const idx = Number(input.closest("[data-index]").dataset.index);
      const skills = foundry.utils.deepClone(this.document.system._source.skills);
      skills[idx][input.dataset.field] = input.dataset.type === "number" ? Number(input.value) || 0 : input.value;
      this.document.update({ "system.skills": skills });
    }));
  }

  static #setTab(event, target) { this.tab = target.dataset.tab; this.render(); }
  static #rollSkill(event, target) { return Rolls.rollSkill(this.document, Number(target.dataset.index)); }
  static #rollAbility(event, target) { return Rolls.rollAbility(this.document, target.dataset.key); }
  static #rollSave(event, target) { return Rolls.rollSave(this.document, target.dataset.key); }
  static #rollAttack(event, target) {
    const w = target.dataset.id ? this.document.items.get(target.dataset.id) : null;
    return Rolls.rollAttack(this.document, w);
  }
  static #rollInit() { return Rolls.rollInitiativeCard(this.document); }

  static #addSkill() {
    const skills = foundry.utils.deepClone(this.document.system._source.skills);
    skills.push({ name: L("OUROBOROS.Skill.new"), circle: "air", res: 1 });
    return this.document.update({ "system.skills": skills });
  }
  static #delSkill(event, target) {
    const skills = foundry.utils.deepClone(this.document.system._source.skills);
    skills.splice(Number(target.dataset.index), 1);
    return this.document.update({ "system.skills": skills });
  }

  static async #createItem(event, target) {
    const type = target.dataset.type;
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name: L(`TYPES.Item.${type}`), type }]);
    item?.sheet.render(true);
  }
  static #editItem(event, target) { this.document.items.get(target.dataset.id)?.sheet.render(true); }
  static #deleteItem(event, target) { return this.document.items.get(target.dataset.id)?.delete(); }
  static #toggleEquip(event, target) {
    const item = this.document.items.get(target.dataset.id);
    return item?.update({ "system.equipped": !item.system.equipped });
  }
  static #usePower(event, target) {
    const item = this.document.items.get(target.dataset.id);
    return item && Rolls.usePower(this.document, item);
  }
  static #hpMod(event, target) {
    const s = this.document.system;
    const v = Math.min(s.hp.max, Math.max(0, s.hp.value + Number(target.dataset.delta)));
    return this.document.update({ "system.hp.value": v });
  }
  static #openHand() { return game.ouroboros.openHand(this.document); }
  static async #drawCard() { await Rolls.drawAndAnnounce(this.document, 1); this.render(); }
  static #plantSeed() { return Rolls.plantSeed(this.document); }
  static #createWork() { return Rolls.createWork(this.document); }
  static async #createHand() { await ensureHand(this.document); this.render(); }
}

export class OuroborosItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["ouroboros", "sheet", "item"],
    position: { width: 480, height: 460 },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = { body: { template: `${T}/item-sheet.hbs` } };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const item = this.document;
    ctx.item = item;
    ctx.system = item.system;
    ctx.type = item.type;
    ctx.attrChoices = ["str", "dex", "con", "ref", "int", "dis", "wis", "emp"].map(a => ({ key: a, label: L(`OUROBOROS.Attr.${a}`) }));
    ctx.suitChoices = Object.entries(SUITS).map(([k, v]) => ({ key: k, label: `${v.symbol} ${v.label}` }));
    return ctx;
  }
}
