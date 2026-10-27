// Crime and prison: pick a pocket in a busy place (a Sleight of Hand check in the RPG, a gamble in Life-Sim): coins,
// or caught and a bounty. With a bounty on your head, the guards of that region may stop you in a guarded place: pay
// the fine, go quietly to prison (days pass, your goods are held, illegal ones gone; the bounty is cleared), or (RPG)
// resist and fight your way out (more bounty if you lose).
import { lex } from '../core/lexicon.js';
import type { Save } from '../core/store.js';
import { systemOn, placeIs, type WorldDef } from '../core/world.js';
import { onHour, afterFight } from './hooks.js';
import { addBounty, bountyIn, bountiesOf, payBounty } from './crime.js';
import { regionOf, crowdLevel } from './worldstate.js';
import { placeOf } from './places.js';
import { isRpg, sheetOf, rollCheck, checkWon } from './rpg.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { advance } from './time.js';
import { bagOf, goodDef } from './economy.js';
import { addRep } from './standing.js';
import { startCombat, inCombat } from './combat.js';

const on = (w: WorldDef) => systemOn(w, 'prison');
export function pickpocket(g: Save, w: WorldDef): string[] {
    if (!on(w)) return [];
    const p = placeOf(g, w, g.player.loc); if (!p || p.home) return ['Nobody to rob here.'];
    if ((g as any).stoleAt === `${g.player.loc}|${g.day}`) return ['Too risky to try again here today.'];
    (g as any).stoleAt = `${g.player.loc}|${g.day}`;
    if (crowdLevel(g, w, g.player.loc) < 2) return ['Too few people around: you would be noticed.'];
    let won: boolean;
    if (isRpg(w) && sheetOf(g)) won = checkWon(rollCheck(g, w, 'sleight', 12));
    else won = Math.random() < 0.55;
    if (won) { const n = 5 + Math.floor(Math.random() * 20); g.player.money += n; book(g, 'A lifted purse', n); return [`You lift a purse: ${n} coins.`]; }
    return ['Caught! "Thief!" someone shouts.', ...addBounty(g, w, 40, 'theft')];
}
export interface Arrest { region: string; amount: number; day: number }
export const arrestOf = (g: Save): Arrest | null => (g as any).arrest ?? null;
// The guards notice a wanted face in a guarded place (once per place and day).
onHour.push((g, w) => {
    if (!on(w) || arrestOf(g) || inCombat(g)) return [];
    const region = regionOf(g, w, g.player.loc); const b = bountyIn(g, region);
    const p = placeOf(g, w, g.player.loc);
    if (!b || !p || p.home || !placeIs(p, 'guarded')) return [];
    const key = `${g.player.loc}|${g.day}`; if ((g as any).guardsAt === key) return [];
    (g as any).guardsAt = key;
    if (Math.random() > Math.min(0.85, 0.3 + b / 300)) return [];
    (g as any).arrest = { region, amount: b, day: g.day };
    return [lex(w, 'guardsStop', String(b))];
});
export const prisonDays = (amount: number) => Math.max(1, Math.min(10, Math.round(amount / 25)));
export function surrender(g: Save, w: WorldDef): string[] {
    const a = arrestOf(g); if (!a) return [];
    const days = prisonDays(a.amount);
    // goods are held; illegal ones are gone
    const bag = bagOf(g);
    for (const id of Object.keys(bag.items)) if (goodDef(w, id)?.illegal) delete bag.items[id];
    const held = { ...bag.items }; bag.items = {};
    note(g, '{u} spent {0} days in prison in {1}.', [String(days), w.maps.find(m => m.id === a.region)?.name ?? a.region], [], g.player.loc, 'event');
    const jail = w.places.find(p => p.map === a.region && placeIs(p, 'jail'))?.id ?? g.player.loc;
    g.player.loc = jail;
    const out = advance(g, w, days * 1440);
    bag.items = held; delete bountiesOf(g)[a.region]; (g as any).arrest = null;
    for (const s of w.statuses) if (s.id !== 'life' && s.id !== 'health') g.player.stats[s.id] = Math.min(g.player.stats[s.id] ?? s.start, Math.round(s.max * 0.4));
    const r = addRep(g, w, -5, 'prison');
    return [`${days} days in a cell. You walk out with your things (what was legal), the slate wiped clean.`, ...(r ? [r] : []), ...out.slice(-3)];
}
export function payUp(g: Save, w: WorldDef): string { const a = arrestOf(g); if (!a) return ''; const m = payBounty(g, w, a.region); if (/free/.test(m)) (g as any).arrest = null; return m; }
export function resist(g: Save, w: WorldDef): string {
    const a = arrestOf(g); if (!a || !isRpg(w) || !sheetOf(g)) return '';
    (g as any).arrest = null;
    const c = startCombat(g, w, { why: 'You resist arrest! The guards draw steel:', tags: ['town'] });
    if (c) (c as any).resisted = a.region;
    return c ? 'You fight!' : '';
}
export function prisonLine(g: Save, w: WorldDef): string {
    const a = arrestOf(g); void w;
    return a ? `Guards are arresting {{user}} for a bounty of ${a.amount}: {{user}} must pay, surrender or resist.` : '';
}
// Resisting arrest: win and the bounty grows (you attacked the guards); lose and you are taken anyway.
afterFight.push((g, w, c) => {
    const region = c.resisted as string | undefined; if (!region) return [];
    if (c.over === 'won' || c.over === 'fled') return addBounty(g, w, 60, 'assaulting the guards');
    (g as any).arrest = { region, amount: bountyIn(g, region) + 40, day: g.day };
    return ['The guards drag you off in chains.', ...surrender(g, w)];
});
