import { systemOn, placeIs } from '../core/world.js';
import { godsActive } from '../core/rpgdef.js';
import { onAction, onDay } from './hooks.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { addStatus } from './needs.js';
import { isRpg, sheetOf, hpMax, syncLife } from './rpg.js';
export const GOVERNMENTS = [
    ['monarchy', 'Unified monarchy', 'one crown rules the whole land'], ['fractured', 'Fractured kingdoms', 'several crowns share the land and eye each other warily'],
    ['empire', 'Empire', 'an emperor rules over kings and provinces'], ['republic', 'Republic', 'elected leaders govern'],
    ['theocracy', 'Theocracy', 'the temple rules in the name of the gods'], ['council', 'Council', 'a council of the powerful decides'],
];
export const POWERS = [
    ['balanced', 'Balanced', 'no single power dominates'], ['military', 'Military might', 'steel and soldiers rule: fights teach more (+20% experience)'],
    ['arcane', 'Arcane supremacy', 'magic is everywhere: spells cost 1 less focus'], ['trade', 'Trade and coin', 'merchants rule: prices are 5% lower'],
    ['faith', 'Faith', 'the temples are strong: devotion grows twice as fast and miracles come sooner'],
];
export const TAX_BY_GOV = { monarchy: 0.1, fractured: 0.08, empire: 0.15, republic: 0.12, theocracy: 0.1, council: 0.1 };
export const realmPower = (w) => w.realm?.power ?? 'balanced';
export const xpMul = (w) => (realmPower(w) === 'military' ? 1.2 : 1);
export const spellCost = (w, cost) => (realmPower(w) === 'arcane' ? Math.max(1, cost - 1) : cost);
export const tradeMul = (w) => (w && realmPower(w) === 'trade' ? 0.95 : 1);
export const baseTax = (w) => w.realm?.tax ?? TAX_BY_GOV[w.realm?.government ?? 'monarchy'];
export const faithOf = (g) => (g.faith ??= { devotion: 0 });
const faithOn = (w) => systemOn(w, 'faith') && godsActive(w);
export const patronOf = (g, w) => (faithOn(w) ? w.realm.pantheon.find(x => x.id === faithOf(g).patron) ?? null : null);
export const MIRACLE = (w) => (realmPower(w) === 'faith' ? 75 : 100);
const gain = (w, n) => (realmPower(w) === 'faith' ? n * 2 : n);
export function choosePatron(g, w, id) {
    const god = faithOn(w) ? w.realm.pantheon.find(x => x.id === id) : null;
    if (!god)
        return '';
    const f = faithOf(g);
    if (f.patron && f.patron !== id)
        f.devotion = Math.floor(f.devotion / 2); // changing gods costs half your favor
    f.patron = id;
    note(g, '{u} chose {0}, {1}, as patron.', [god.name, god.domain], [], g.player.loc, 'life');
    return `${god.name} is your patron now.`;
}
export const isShrine = (w, place) => placeIs(place, 'shrine');
export function pray(g, w) {
    const f = faithOf(g);
    const god = patronOf(g, w);
    if (!god)
        return faithOn(w) ? 'Choose a patron first.' : '';
    if (f.prayed === g.day)
        return 'You already prayed today.';
    f.prayed = g.day;
    f.devotion = Math.min(100, f.devotion + gain(w, 8));
    return `You pray to ${god.name} (${f.devotion}/${MIRACLE(w)}).`;
}
export function offer(g, w, coins = 10) {
    const f = faithOf(g);
    const god = patronOf(g, w);
    if (!god)
        return '';
    if (f.offered === g.day)
        return 'You already left an offering today.';
    if (g.player.money < coins)
        return 'Not enough money.';
    g.player.money -= coins;
    book(g, `Offering to ${god.name}`, -coins);
    f.offered = g.day;
    f.devotion = Math.min(100, f.devotion + gain(w, 5));
    return `You leave an offering to ${god.name} (${f.devotion}/${MIRACLE(w)}).`;
}
export function miracle(g, w, kind) {
    const f = faithOf(g);
    const god = patronOf(g, w);
    if (!god || f.devotion < MIRACLE(w))
        return 'Your devotion is not enough yet.';
    f.devotion -= MIRACLE(w);
    if (kind === 'heal') {
        const s = isRpg(w) ? sheetOf(g) : null;
        if (s) {
            s.hp = hpMax(w, s);
            syncLife(g, w);
        }
        for (const st of w.statuses)
            addStatus(g, w, st.id, st.max);
    }
    else if (kind === 'ward')
        f.ward = true;
    else {
        g.player.money += 100;
        book(g, `A gift of ${god.name}`, 100);
    }
    note(g, '{0} answered {u}\'s prayers with a miracle.', [god.name], [], g.player.loc, 'goal');
    return kind === 'heal' ? `${god.name} heals you completely.` : kind === 'ward' ? `${god.name}'s ward surrounds you: one defeat will be turned aside.` : `${god.name} sends you fortune.`;
}
// Praying (the world's pray action) counts too.
onAction.push((g, w, a) => { if (faithOn(w) && /pray/i.test(`${a.id} ${a.name}`))
    pray(g, w); });
// Neglected faith fades: a point a day after three days without prayer or offering.
onDay.push((g, w) => {
    if (!faithOn(w))
        return [];
    const f = faithOf(g);
    const last = Math.max(f.prayed ?? 0, f.offered ?? 0);
    if (f.devotion > 0 && g.day - last > 3)
        f.devotion--;
    return [];
});
/* ---------- for the AI ---------- */
export function realmLine(g, w) {
    const r = w.realm;
    if (!r)
        return '';
    const gov = GOVERNMENTS.find(x => x[0] === r.government);
    const pw = POWERS.find(x => x[0] === realmPower(w));
    const parts = [];
    if (gov)
        parts.push(`The realm is a ${gov[1].toLowerCase()} (${gov[2]})${r.leadership ? `, led by ${r.leadership.toLowerCase()}` : ''}.`);
    if (pw && pw[0] !== 'balanced')
        parts.push(`Its power rests on ${pw[1].toLowerCase()}.`);
    if (godsActive(w))
        parts.push(`The gods are real and answer prayers: ${r.pantheon.map(x => `${x.name} (${x.domain})`).join(', ')}.`);
    else
        parts.push('No gods answer prayers here: altars and shrines honor heroes, ancestors and old ideals.');
    const god = patronOf(g, w);
    if (god)
        parts.push(`{{user}} worships ${god.name}.`);
    return parts.join(' ');
}
