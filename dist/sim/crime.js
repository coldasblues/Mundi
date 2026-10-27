import { onDay } from './hooks.js';
import { note } from './facts.js';
import { regionOf } from './worldstate.js';
import { addRep, disguised, raiseSuspicion } from './standing.js';
import { book } from './ledger.js';
export const bountiesOf = (g) => (g.bounty ??= {});
export const bountyIn = (g, region) => bountiesOf(g)[region]?.amount ?? 0;
// A crime: a bounty in the region (on your alter ego's head instead, in disguise), and a little infamy.
export function addBounty(g, w, amount, why, place = g.player.loc) {
    const out = [];
    if (disguised(g, w)) {
        out.push(...raiseSuspicion(g, w, 5));
        const m = addRep(g, w, -Math.ceil(amount / 20), why, place);
        if (m)
            out.push(m);
        return out;
    }
    const region = regionOf(g, w, place);
    const b = (bountiesOf(g)[region] ??= { amount: 0, why: [], at: g.day });
    b.amount += Math.max(1, Math.round(amount));
    b.why = [...b.why, why].slice(-5);
    b.at = g.day;
    note(g, '{u} is wanted in {0} for {1}.', [w.maps.find(m => m.id === region)?.name ?? region, why], [], place, 'event');
    const m = addRep(g, w, -Math.ceil(amount / 20), why, place);
    if (m)
        out.push(m);
    out.push(`Wanted: a bounty of ${b.amount} on your head here (${why}).`);
    return out;
}
export function payBounty(g, w, region = regionOf(g, w, g.player.loc)) {
    const b = bountiesOf(g)[region];
    if (!b)
        return '';
    if (g.player.money < b.amount)
        return `You need ${b.amount} to pay the fine.`;
    g.player.money -= b.amount;
    book(g, 'Fine paid to the guards', -b.amount);
    delete bountiesOf(g)[region];
    return 'You pay your fine. You are free to go.';
}
// Bounties fade: 10% a week after two weeks of good behavior.
onDay.push((g) => {
    for (const [k, b] of Object.entries(bountiesOf(g)))
        if (g.day - b.at > 14 && (g.day - b.at) % 7 === 0) {
            b.amount = Math.floor(b.amount * 0.9);
            if (b.amount < 5)
                delete bountiesOf(g)[k];
        }
    return [];
});
export function bountyLine(g, w) {
    const b = bountyIn(g, regionOf(g, w, g.player.loc));
    return b ? `{{user}} is wanted here (a bounty of ${b}): guards and honest folk may recognize {{user}}.` : '';
}
