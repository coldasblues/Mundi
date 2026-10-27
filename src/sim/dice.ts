// One-click skill actions: no minigames. The engine rolls an invisible d20, adds the player's bonuses and compares
// it with the action's difficulty; the result (critical fail, fail, success, critical success) changes what you get.
// The AI only narrates the outcome it is told about.
import type { Save } from '../core/store.js';
import { payOf, priceOf } from './bills.js';
import type { WorldDef, ActionDef } from '../core/world.js';
import { addStatus, money } from './needs.js';
import { book } from './ledger.js';
import { traitsOf } from './work.js';
import { note } from './facts.js';
import { addXp } from './rpg.js';
import { hobbyBonus, hobbyPay } from './hobbies.js';
import { getWorld, isScenario } from '../core/world.js';

export type Grade = 'critical-fail' | 'fail' | 'success' | 'critical-success';
export interface RollResult { d20: number; bonus: number; total: number; dc: number; grade: Grade; text: string }

// Each trait the action likes gives +2; very low energy or mood gives −2 each.
export function bonusFor(g: Save, a: ActionDef): number {
    const mine = traitsOf(g);
    let bonus = (a.roll?.traits ?? []).filter(t => mine.includes(t)).length * 2;
    bonus += hobbyBonus(g, getWorld(g.world), a);   // a hobby you are good at
    if ((g.player.stats.energy ?? 100) <= 20) bonus -= 2;
    if ((g.player.stats.mood ?? 100) <= 20) bonus -= 2;
    return bonus;
}
// The chance of success shown before trying (a natural 1 always fails, a natural 20 always works).
export function chanceOf(g: Save, a: ActionDef): number {
    if (!a.roll) return 100;
    const b = bonusFor(g, a);
    let ok = 0;
    for (let d = 1; d <= 20; d++) if (d === 20 || (d > 1 && d + b >= a.roll.dc)) ok++;
    return ok * 5;
}
export function rollAction(g: Save, w: WorldDef, a: ActionDef, rnd = Math.random): RollResult | null {
    const r = a.roll;
    if (!r || isScenario(w)) return null;   // Home: no checks, what you do just happens (the AI tells how)
    const d20 = 1 + Math.floor(rnd() * 20);
    const bonus = bonusFor(g, a);
    const total = d20 + bonus;
    const grade: Grade = d20 === 1 ? 'critical-fail' : d20 === 20 ? 'critical-success' : total >= r.dc ? 'success' : 'fail';
    const ok = grade === 'success' || grade === 'critical-success';
    const out = ok ? r.success : r.fail;
    const mult = grade === 'critical-success' || grade === 'critical-fail' ? 2 : 1;
    const raw = Math.round((out.money ?? 0) * (grade === 'critical-success' ? 2 : 1) * ((out.money ?? 0) > 0 ? hobbyPay(g, w, a) : 1));
    const cash = raw > 0 ? payOf(g, raw) : -priceOf(g, -raw);   // the difficulty
    if (cash) { g.player.money = Math.max(0, g.player.money + cash); book(g, a.name, cash); }
    for (const [id, v] of Object.entries(out.effects ?? {})) addStatus(g, w, id, v * ((v < 0 && grade === 'critical-fail') || (v > 0 && grade === 'critical-success') ? mult : 1));
    const text = `${out.text}${cash ? ` (${cash > 0 ? '+' : '−'}${money(w, Math.abs(cash))})` : ''}`;
    if (ok) addXp(g, w, grade === 'critical-success' ? 20 : 10, a.name);   // RPG: experience for what you do well
    note(g, ok ? '{u} tried to {0} — it worked. {1}' : '{u} tried to {0} — it did not work. {1}', [a.label.toLowerCase(), out.text], [], g.player.loc, 'skill');
    return { d20, bonus, total, dc: r.dc, grade, text };
}
export const gradeName = (gr: Grade) => ({ 'critical-fail': 'Critical failure', fail: 'Failure', success: 'Success', 'critical-success': 'Critical success' })[gr];
