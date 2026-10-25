import { rollInitiativeCard } from "./rolls.mjs";

/** Iniciativa por cartas: Carta + Fire + Air (desempate por Fire, guardado como decimal). */
export class OuroborosCombat extends Combat {
  async rollInitiative(ids, { updateTurn = true } = {}) {
    ids = typeof ids === "string" ? [ids] : [...ids];
    const updates = [];
    for (const id of ids) {
      const combatant = this.combatants.get(id);
      if (!combatant?.isOwner || !combatant.actor) continue;
      const r = await rollInitiativeCard(combatant.actor);
      if (r) updates.push({ _id: id, initiative: r.sortKey });
    }
    if (!updates.length) return this;
    const currentId = this.combatant?.id;
    await this.updateEmbeddedDocuments("Combatant", updates);
    if (updateTurn && currentId && game.user.isGM) {
      await this.update({ turn: this.turns.findIndex(t => t.id === currentId) });
    }
    return this;
  }
}
