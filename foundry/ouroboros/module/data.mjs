import { deriveStats, CIRCLES } from "./logic.mjs";

const f = foundry.data.fields;
const num = (initial = 0, extra = {}) => new f.NumberField({ required: true, integer: true, initial, ...extra });
const attr = () => num(1, { min: 1, max: 12 });

export class ActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      attributes: new f.SchemaField({
        con: attr(), dis: attr(), str: attr(), wis: attr(),
        dex: attr(), emp: attr(), ref: attr(), int: attr()
      }),
      hp: new f.SchemaField({
        value: num(21, { min: 0 }),
        max: num(0, { min: 0 }),
        bonus: num(0),
        override: num(0, { min: 0 })
      }),
      job: new f.SchemaField({
        suit: new f.StringField({ required: true, initial: "", choices: ["", "spades", "hearts", "diamonds", "clubs"] }),
        level: num(0, { min: 0, max: 4 })
      }),
      combat: new f.SchemaField({
        skill: num(0, { min: -5, max: 10 }),
        passiveBonus: num(0)
      }),
      skills: new f.ArrayField(new f.SchemaField({
        name: new f.StringField({ required: true, initial: "" }),
        circle: new f.StringField({ required: true, initial: "air", choices: Object.keys(CIRCLES) }),
        res: num(1, { min: 0, max: 10 })
      })),
      marks: num(0, { min: 0 }),
      seed: new f.SchemaField({
        active: new f.BooleanField({ initial: false }),
        hours: num(0, { min: 0 }),
        failures: num(0, { min: 0 })
      }),
      details: new f.SchemaField({
        role: new f.StringField({ initial: "" }),
        hook: new f.StringField({ initial: "" }),
        weakness: new f.StringField({ initial: "" }),
        powers: new f.StringField({ initial: "" }),
        biography: new f.StringField({ initial: "" }),
        notes: new f.StringField({ initial: "" })
      })
    };
  }

  prepareDerivedData() {
    const items = this.parent?.items ?? [];
    const armor = items.filter(i => i.type === "armor" && i.system.equipped).reduce((s, i) => s + i.system.defense, 0);
    const d = deriveStats(this.attributes, {
      armor, passiveBonus: this.combat.passiveBonus, hpBonus: this.hp.bonus,
      hpOverride: this.hp.override, seeded: this.seed.active
    });
    this.circles = d.circles;
    this.willpower = d.willpower;
    this.handSize = d.handSize;
    this.abilities = d.abilities;
    this.saves = d.saves;
    this.armorTotal = armor;
    this.passiveDefense = d.passive;
    this.hp.max = d.hpMax;
    this.hp.value = Math.min(this.hp.value, this.hp.max);
  }
}

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new f.StringField({ required: true, initial: "light", choices: ["light", "medium", "heavy"] }),
      bonus: num(1, { min: 0 }),
      damageBonus: num(0),
      attribute: new f.StringField({ required: true, initial: "str", choices: ["str", "dex", "con", "ref", "int", "dis", "wis", "emp"] }),
      ranged: new f.BooleanField({ initial: false }),
      equipped: new f.BooleanField({ initial: true }),
      notes: new f.StringField({ initial: "" })
    };
  }
}

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      defense: num(1, { min: 0 }),
      equipped: new f.BooleanField({ initial: true }),
      notes: new f.StringField({ initial: "" })
    };
  }
}

export class PowerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      suit: new f.StringField({ required: true, initial: "spades", choices: ["spades", "hearts", "diamonds", "clubs"] }),
      parity: new f.StringField({ required: true, initial: "even", choices: ["even", "odd"] }),
      level: num(1, { min: 1, max: 4 }),
      text: new f.StringField({ initial: "" })
    };
  }
}

export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      quantity: num(1, { min: 0 }),
      text: new f.StringField({ initial: "" })
    };
  }
}
