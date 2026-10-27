// Long journeys (RPG mode): going from one region to another takes hours on the road. A trip longer than the world's
// "camp every" hours means a night at camp: half of your hit points and focus back, and a check to see how the night
// goes (a Survival roll: thieves or a cold, sleepless night if it fails). Or you can push on without resting.
import type { Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { rpgOf } from '../core/rpgdef.js';
import { advance } from './time.js';
import { regionOf } from './worldstate.js';
import { talentSum, isRpg, sheetOf, longRest, rollCheck, checkWon, gradeWord, changeHp, hpMax, addXp, count } from './rpg.js';
import { addStatus } from './needs.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { startCombat } from './combat.js';
import { bondXp } from './artifacts.js';
import { campBlocked, hazardHere, ambushOdds } from './skies.js';

export const LONG_TRIP = 4 * 60;   // minutes: shorter trips are not journeys
export function journeyOf(g: Save, w: WorldDef, from: string, to: string, minutes: number) {
    if (!isRpg(w) || !sheetOf(g) || minutes < LONG_TRIP || regionOf(g, w, from) === regionOf(g, w, to)) return null;
    const every = (rpgOf(w)?.campEvery ?? 8) * 60;
    return { minutes, camps: Math.floor((minutes - 1) / every) };
}
// Travels the road; `camp`: make camp when it is time (else push on). Returns what happened.
export function travelRoad(g: Save, w: WorldDef, minutes: number, camp: boolean): string[] {
    const out: string[] = [];
    const every = (rpgOf(w)?.campEvery ?? 8) * 60;
    let left = minutes, ambush = false;
    while (left > 0) {
        const leg = Math.min(left, every);
        out.push(...advance(g, w, leg)); left -= leg;
        if (left <= 0) break;
        if (!camp) { addStatus(g, w, 'energy', -20); out.push('You push on through the night without rest.'); continue; }
        // a night at camp
        out.push(...advance(g, w, 8 * 60));
        if (campBlocked(g, w)) { addStatus(g, w, 'energy', 15); out.push(`🏕️ ${hazardHere(g, w)?.name ?? 'The weather'} rages all night: without camping gear, you barely rest.`); }
        else { longRest(g, w, 0.5); addStatus(g, w, 'energy', 60); }
        const c = rollCheck(g, w, 'survival', 12, talentSum(w, sheetOf(g)!, 'camp'));
        if (checkWon(c)) out.push(`🏕️ You make camp. ${gradeWord(c)} on Survival (${c.total}): a quiet night under the stars.`);
        else if (c.d20 <= Math.round(5 * ambushOdds(g, w, regionOf(g, w, g.player.loc))) && (rpgOf(w)?.bestiary ?? []).length) { ambush = true; out.push(`🏕️ ${gradeWord(c)} on Survival (${c.total}): something has been following you since the camp…`); }
        else {
            const lose = Math.round(g.player.money * 0.1);
            if (c.d20 % 2 && lose > 0) { g.player.money -= lose; book(g, 'Robbed at camp', -lose); out.push(`🏕️ ${gradeWord(c)} on Survival (${c.total}): thieves crept into camp in the night and took some coins.`); }
            else { changeHp(g, w, -Math.ceil(hpMax(w, sheetOf(g)!) * 0.15)); out.push(`🏕️ ${gradeWord(c)} on Survival (${c.total}): a cold, wet night; you wake up sore.`); }
        }
        note(g, '{u} made camp on the road.', [], [], g.player.loc, 'skill');
        out.push(...addXp(g, w, 15, 'camp'), ...count(g, w, 'camps'), ...bondXp(g, w, 'pet', 10), ...bondXp(g, w, 'blade', 5));
    }
    if (ambush && startCombat(g, w, { why: 'Ambush on the road!', tags: ['road', 'wild'] })) out.push('⚔️ Ambush on the road!');
    return out;
}
