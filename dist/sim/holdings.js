import { systemOn } from '../core/world.js';
import { onDay } from './hooks.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { placeOf, homeAddress } from './places.js';
import { regionState, regionOf } from './worldstate.js';
import { addRep } from './standing.js';
import { addBounty } from './crime.js';
import { addGood, goodDef } from './economy.js';
import { baseTax } from './realm.js';
import { isRpg, sheetOf } from './rpg.js';
import { startCombat, inCombat } from './combat.js';
import { addBond } from './social.js';
import { pleaseBlade } from './artifacts.js';
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
export const holdingsOf = (g) => (g.holdings ??= { estates: [], biz: [], loans: [], garden: [], earned: 0 });
const week = (g) => Math.floor((g.day - 1) / 7);
/* ---------- property ---------- */
export function freeHomes(g, w) {
    if (!systemOn(w, 'property'))
        return [];
    const taken = new Set([g.player.home, ...Object.values(g.cast).map(r => r.home), ...holdingsOf(g).estates].map(h => `${h.zone}:${h.x},${h.y}`));
    return w.homes.zones.flatMap(z => z.spots.map((s, i) => ({ zone: z.id, x: s[0], y: s[1], n: i + 1, price: (z.rent ?? 40) * 30, rent: z.rent ?? 40, name: homeAddress(w, { zone: z.id, x: s[0], y: s[1], n: i + 1 }) })))
        .filter(h => !taken.has(`${h.zone}:${h.x},${h.y}`));
}
export function buyHome(g, w, zone, x, y) {
    const h = freeHomes(g, w).find(f => f.zone === zone && f.x === x && f.y === y);
    if (!h)
        return 'That home is not for sale.';
    if (g.player.money < h.price)
        return `It costs ${h.price}.`;
    g.player.money -= h.price;
    book(g, `Bought ${h.name}`, -h.price);
    holdingsOf(g).estates.push({ zone, x, y, n: h.n, price: h.price, listed: true });
    note(g, '{u} bought a property: {0}.', [h.name], [], g.player.loc, 'life');
    return `${h.name} is yours. It is listed for rent.`;
}
export function sellHome(g, w, i) {
    const e = holdingsOf(g).estates[i];
    if (!e)
        return '';
    const got = Math.round(e.price * 0.85);
    g.player.money += got;
    book(g, 'Sold a property', got);
    holdingsOf(g).estates.splice(i, 1);
    void w;
    return `Sold for ${got}.`;
}
const rentOf = (w, e) => w.homes.zones.find(z => z.id === e.zone)?.rent ?? 40;
/* ---------- businesses ---------- */
export const bizKinds = (g, w, place = g.player.loc) => {
    const p = placeOf(g, w, place);
    if (!systemOn(w, 'property') || !p || p.home || p.link)
        return [];
    return (w.businesses ?? []).filter(b => b.tags.some(t => (p.tags ?? []).includes(t)));
};
export function openBusiness(g, w, kind, name) {
    const d = bizKinds(g, w).find(b => b.id === kind);
    if (!d)
        return 'That business does not suit this place.';
    const h = holdingsOf(g);
    if (h.biz.some(b => b.place === g.player.loc))
        return 'You already have a business here.';
    if (g.player.money < d.cost)
        return `Opening it costs ${d.cost}.`;
    g.player.money -= d.cost;
    book(g, `Opened ${name || d.name}`, -d.cost);
    const n = name.trim().slice(0, 40) || `${d.name} at ${placeOf(g, w, g.player.loc)?.name}`;
    h.biz.push({ id: `biz${g.day}_${h.biz.length}`, kind, place: g.player.loc, name: n, staff: 0, friends: [], till: 0, opened: g.day, week: 0 });
    note(g, '{u} opened a business: {0}.', [n], [], g.player.loc, 'work');
    return `${n} is open for business.`;
}
export const WAGE = 4;
export function hireStaff(g, w, id) {
    const b = holdingsOf(g).biz.find(x => x.id === id);
    const d = b && (w.businesses ?? []).find(x => x.id === b.kind);
    if (!b || !d)
        return '';
    if (b.staff + b.friends.length >= d.staff)
        return 'No room for more staff.';
    b.staff++;
    return `You hired a hand for ${WAGE} a day.`;
}
export function hireFriend(g, w, id, avatar) {
    const b = holdingsOf(g).biz.find(x => x.id === id);
    const d = b && (w.businesses ?? []).find(x => x.id === b.kind);
    const r = g.cast[avatar];
    if (!b || !d || !r)
        return '';
    if (b.staff + b.friends.length >= d.staff)
        return 'No room for more staff.';
    if ((g.social?.bond?.[avatar] ?? 0) < 40)
        return `${r.name} would rather not work for you.`;
    b.friends.push(avatar);
    addBond(g, avatar, 3);
    return `${r.name} helps out at ${b.name}.`;
}
export function collect(g, w, id) {
    const b = holdingsOf(g).biz.find(x => x.id === id);
    if (!b)
        return '';
    if (g.player.loc !== b.place)
        return 'Collect the till at the place.';
    const n = Math.floor(b.till);
    if (n <= 0)
        return 'The till is empty.';
    b.till -= n;
    g.player.money += n;
    book(g, `${b.name}: takings`, n);
    pleaseBlade(g, w, 'gold', Math.min(8, Math.floor(n / 20)));
    void w;
    return `You collect ${n} from ${b.name}.`;
}
export function closeBusiness(g, id) { const h = holdingsOf(g); h.biz = h.biz.filter(b => b.id !== id); }
/* ---------- garden ---------- */
export const GARDEN_PLOTS = 4;
export function plant(g, w, crop) {
    const c = (w.crops ?? []).find(x => x.id === crop);
    const h = holdingsOf(g);
    if (!c || !systemOn(w, 'farming'))
        return '';
    if (g.player.loc !== 'home:player')
        return 'You plant at home.';
    if (h.garden.length >= GARDEN_PLOTS)
        return 'Your garden is full.';
    if (g.player.money < c.seed)
        return 'Not enough money for the seeds.';
    g.player.money -= c.seed;
    book(g, `Seeds: ${c.name}`, -c.seed);
    h.garden.push({ crop, planted: g.day });
    return `You plant ${c.name.toLowerCase()}: ready in ${c.days} days.`;
}
export const ripe = (w, g, p) => { const c = (w.crops ?? []).find(x => x.id === p.crop); return !!c && g.day - p.planted >= c.days; };
export function harvest(g, w) {
    const h = holdingsOf(g);
    if (g.player.loc !== 'home:player')
        return '';
    const ready = h.garden.filter(p => ripe(w, g, p));
    if (!ready.length)
        return 'Nothing is ripe yet.';
    const got = [];
    for (const p of ready) {
        const c = (w.crops ?? []).find(x => x.id === p.crop);
        addGood(g, c.good, c.yield);
        got.push(`${c.yield} ${goodDef(w, c.good)?.name.toLowerCase() ?? c.good}`);
    }
    h.garden = h.garden.filter(p => !ready.includes(p));
    return `You harvest ${got.join(', ')}.`;
}
/* ---------- loans ---------- */
export function bankLimit(g, w) { const h = holdingsOf(g); return Math.round(100 + 0.5 * (h.estates.reduce((a, e) => a + e.price, 0) + h.biz.reduce((a, b) => a + ((w.businesses ?? []).find(x => x.id === b.kind)?.cost ?? 0), 0)) - h.loans.filter(l => l.lender === 'bank').reduce((a, l) => a + l.owed, 0)); }
export function borrow(g, w, lender, amount) {
    if (!systemOn(w, 'banks'))
        return '';
    const n = Math.round(amount);
    if (n <= 0)
        return '';
    const h = holdingsOf(g);
    if (lender === 'bank' && n > bankLimit(g, w))
        return `The bank will lend you at most ${Math.max(0, bankLimit(g, w))}.`;
    if (lender === 'shark' && n + h.loans.filter(l => l.lender === 'shark').reduce((a, l) => a + l.owed, 0) > 300)
        return 'The moneylender will not go above 300.';
    h.loans.push({ id: `loan${g.day}_${h.loans.length}`, lender, owed: n, rate: lender === 'bank' ? 0.05 : 0.2, due: g.day + (lender === 'bank' ? 28 : 14), taken: g.day });
    g.player.money += n;
    book(g, lender === 'bank' ? 'Loan from the bank' : 'Loan from a moneylender', n);
    return `You borrow ${n}. Due on day ${g.day + (lender === 'bank' ? 28 : 14)}.`;
}
export function repay(g, id, amount) {
    const h = holdingsOf(g);
    const l = h.loans.find(x => x.id === id);
    if (!l)
        return '';
    const n = Math.min(Math.round(amount), l.owed, g.player.money);
    if (n <= 0)
        return 'Not enough money.';
    l.owed -= n;
    g.player.money -= n;
    book(g, 'Loan repaid', -n);
    if (l.owed <= 0) {
        h.loans = h.loans.filter(x => x.id !== id);
        return 'Debt paid off.';
    }
    return `You repay ${n}; ${l.owed} left.`;
}
/* ---------- each day / each week ---------- */
onDay.push((g, w) => {
    const h = holdingsOf(g);
    const out = [];
    // businesses earn
    for (const b of h.biz) {
        const d = (w.businesses ?? []).find(x => x.id === b.kind);
        if (!d)
            continue;
        const st = regionState(g, w, regionOf(g, w, b.place));
        const gross = d.profit * (1 + st.mood / 200) * (1 + 0.25 * (b.staff + b.friends.length)) * (0.8 + H(`${b.id}|${g.day}`) * 0.4);
        const net = gross - b.staff * WAGE;
        b.till += net;
        h.earned += Math.max(0, net);
        if (b.till < -50) {
            out.push(`${b.name} is losing money: its staff left.`);
            b.staff = 0;
            b.till = 0;
        }
    }
    // loans grow weekly and come due
    for (const l of h.loans) {
        if ((g.day - l.taken) % 7 === 0)
            l.owed = Math.round(l.owed * (1 + l.rate));
        if (g.day > l.due) {
            if (l.lender === 'shark') {
                if (H(`${l.id}|${g.day}`) < 0.3) {
                    if (isRpg(w) && sheetOf(g) && !inCombat(g)) {
                        if (startCombat(g, w, { why: 'The moneylender\'s thugs found you:', tags: ['town'] }))
                            out.push('⚔️ The moneylender sent thugs to collect!');
                    }
                    else {
                        const take = Math.min(g.player.money, l.owed);
                        g.player.money -= take;
                        l.owed -= take;
                        book(g, 'Taken by the moneylender\'s thugs', -take);
                        out.push('The moneylender\'s thugs roughed you up and took what you had.');
                    }
                }
            }
            else if ((g.day - l.due) % 7 === 0) {
                const m = addRep(g, w, -3, 'debt');
                out.push(`The bank is pressing you for its money.${m ? ` ${m}` : ''}`);
            }
        }
    }
    h.loans = h.loans.filter(l => l.owed > 0);
    if (g.day % 7 !== 0)
        return out;
    // rents (most weeks a tenant pays), upkeep
    for (const e of h.estates) {
        const rent = rentOf(w, e);
        e.tenant = e.listed && H(`${e.zone}${e.x}${e.y}|${week(g)}`) < 0.75;
        const net = (e.tenant ? rent * 7 * 0.8 : 0) - rent * 0.7;
        g.player.money += Math.round(net);
        book(g, `Rent from ${homeAddress(w, e)}`, Math.round(net));
        h.earned += Math.max(0, net);
    }
    // taxes
    if (systemOn(w, 'taxes') && (h.estates.length || h.biz.length || h.earned > 0)) {
        const tension = w.maps.reduce((a, m) => a + regionState(g, w, m.id).tension, 0) / Math.max(1, w.maps.length);
        const rate = baseTax(w) * (1 + tension / 200) * (w.realm?.government === 'theocracy' ? 1.1 : 1);
        const tax = Math.round(rate * (h.earned + h.estates.reduce((a, e) => a + e.price, 0) * 0.01));
        h.earned = 0;
        if (tax > 0) {
            if (g.player.money >= tax) {
                g.player.money -= tax;
                book(g, `Taxes (${Math.round(rate * 100)}%)`, -tax);
                out.push(`You paid ${tax} in taxes.`);
            }
            else
                out.push(`You could not pay your taxes (${tax}).`, ...addBounty(g, w, tax, 'unpaid taxes'));
        }
    }
    return out;
});
export function holdingsLine(g, w) {
    const h = holdingsOf(g);
    const parts = [];
    const here = h.biz.find(b => b.place === g.player.loc);
    if (here)
        parts.push(`{{user}} owns ${here.name}, here.`);
    if (h.loans.some(l => l.lender === 'shark' && g.day > l.due))
        parts.push('{{user}} owes a dangerous moneylender, and is late.');
    void w;
    return parts.join(' ');
}
