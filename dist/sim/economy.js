import { systemOn, placeIs } from '../core/world.js';
import { rpgOf } from '../core/rpgdef.js';
import { onDay, onHour } from './hooks.js';
import { regionState, regionOf } from './worldstate.js';
import { placeOf, isHome } from './places.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { addBounty } from './crime.js';
import { isRpg, sheetOf, rollCheck, checkWon } from './rpg.js';
import { ecoPrice } from './skies.js';
import { mountCarry } from './pets.js';
const on = (w) => systemOn(w, 'trade') && !!w.goods?.length;
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
export const bagOf = (g) => (g.bag ??= { items: {}, hidden: 0 });
export const CAPACITY = 30, COMPARTMENT = 80, COMPARTMENT_SLOTS = 6;
export const carried = (g) => Object.values(bagOf(g).items).reduce((a, n) => a + n, 0);
export const capacity = (g, w) => CAPACITY + (w ? mountCarry(g, w) : 0);
export const goodDef = (w, id) => w.goods?.find(x => x.id === id) ?? null;
export const isMarket = (g, w, place = g.player.loc) => { const p = placeOf(g, w, place); return !!p && !isHome(p.id) && (p.tags ?? []).includes('shop'); };
const matches = (g, w, list, place) => {
    if (!list?.length)
        return false;
    const p = placeOf(g, w, place);
    const region = regionOf(g, w, place);
    const parent = w.maps.find(m => m.id === region)?.parent;
    return list.some(x => x === region || x === parent || x === p?.id || (p?.tags ?? []).includes(x));
};
// The price of a good at a place (to buy; selling gets 80% of it).
export function priceOf(g, w, good, place = g.player.loc) {
    const region = regionOf(g, w, place);
    const st = regionState(g, w, region);
    let p = good.price * (st.price ?? 1);
    if (matches(g, w, good.cheap, place))
        p *= 0.6;
    if (matches(g, w, good.dear, place))
        p *= 1.6;
    if (good.kind === 'potion' || good.kind === 'arms')
        p *= 1 + Math.max(0, st.tension) / 200;
    p *= 0.85 + H(`${g.world}|${region}|${good.id}|${Math.floor(g.day / 7)}`) * 0.3; // the week's drift
    p *= ecoPrice(g, w, good, region);
    if (good.illegal)
        p *= 1.2;
    return Math.max(1, Math.round(p));
}
export const sellPrice = (g, w, good) => Math.max(1, Math.floor(priceOf(g, w, good) * 0.8));
export function buy(g, w, id, n = 1) {
    const d = goodDef(w, id);
    if (!d || !on(w))
        return '';
    if (!isMarket(g, w))
        return 'There is no market here.';
    if (carried(g) + n > capacity(g, w))
        return 'You cannot carry more.';
    const cost = priceOf(g, w, d) * n;
    if (g.player.money < cost)
        return 'Not enough money.';
    g.player.money -= cost;
    book(g, `${n} × ${d.name}`, -cost);
    const b = bagOf(g);
    b.items[id] = (b.items[id] ?? 0) + n;
    return `You buy ${n} ${d.name.toLowerCase()} for ${cost}.`;
}
export function sell(g, w, id, n = 1) {
    const d = goodDef(w, id);
    const b = bagOf(g);
    if (!d || (b.items[id] ?? 0) < n)
        return '';
    if (!isMarket(g, w))
        return 'There is no market here.';
    const got = sellPrice(g, w, d) * n;
    b.items[id] -= n;
    if (!b.items[id])
        delete b.items[id];
    g.player.money += got;
    book(g, `Sold ${n} × ${d.name}`, got);
    if (got >= 100)
        note(g, '{u} sold {0} for a good price.', [d.name.toLowerCase()], [], g.player.loc, 'work');
    return `You sell ${n} ${d.name.toLowerCase()} for ${got}.`;
}
export function addGood(g, id, n) { const b = bagOf(g); b.items[id] = Math.max(0, (b.items[id] ?? 0) + n); if (!b.items[id])
    delete b.items[id]; }
export function buyCompartment(g, w) {
    const b = bagOf(g);
    if (b.hidden >= COMPARTMENT_SLOTS * 2)
        return 'Your gear has no room for more hidden pockets.';
    if (g.player.money < COMPARTMENT)
        return `A hidden compartment costs ${COMPARTMENT}.`;
    g.player.money -= COMPARTMENT;
    book(g, 'Smuggler\'s compartment', -COMPARTMENT);
    b.hidden += COMPARTMENT_SLOTS;
    void w;
    return `A hidden compartment: ${b.hidden} pieces of contraband now go unseen.`;
}
// The best trade from here: where your goods sell for most (for the AI and the screen).
export function bestRoutes(g, w) {
    if (!on(w))
        return [];
    const markets = w.places.filter(p => (p.tags ?? []).includes('shop') && !p.link);
    const here = regionOf(g, w, g.player.loc);
    return w.goods.filter(x => !x.illegal || bagOf(g).items[x.id]).map(good => {
        let best = { place: '', price: 0 };
        for (const m of markets) {
            if (regionOf(g, w, m.id) === here)
                continue;
            const p = Math.floor(priceOf(g, w, good, m.id) * 0.8);
            if (p > best.price)
                best = { place: m.id, price: p };
        }
        return { good, buy: priceOf(g, w, good), sellAt: best.place, sell: best.price };
    }).filter(r => r.sellAt && r.sell > r.buy).sort((a, b) => b.sell / b.buy - a.sell / a.buy).slice(0, 3);
}
/* ---------- smuggling: the guards ---------- */
const GUARDED = /guard|barrack|police|customs|fort|station|gate|castle|palace|civic|jarl|watch/i;
export function guardCheck(g, w) {
    if (!on(w))
        return [];
    const b = bagOf(g);
    const illegal = Object.entries(b.items).filter(([id]) => goodDef(w, id)?.illegal);
    const n = illegal.reduce((a, [, k]) => a + k, 0);
    if (n <= b.hidden)
        return [];
    const exposed = n - b.hidden;
    let caught;
    if (isRpg(w) && sheetOf(g))
        caught = !checkWon(rollCheck(g, w, 'sleight', 11 + Math.min(6, exposed)));
    else
        caught = H(`${g.day}|${g.minutes}|guards`) < Math.min(0.7, 0.2 + exposed * 0.05);
    if (!caught)
        return ['The guards look you over… and let you pass.'];
    const value = illegal.reduce((a, [id, k]) => a + priceOf(g, w, goodDef(w, id)) * k, 0);
    for (const [id] of illegal)
        delete b.items[id];
    return [`The guards found your contraband and took it all.`, ...addBounty(g, w, Math.round(value / 2), 'smuggling')];
}
// Crossing into another town, or walking into a guarded place, with contraband in plain sight.
onHour.push((g, w) => {
    if (!on(w))
        return [];
    const b = bagOf(g);
    const region = regionOf(g, w, g.player.loc);
    const p = placeOf(g, w, g.player.loc);
    const crossed = b.lastRegion && b.lastRegion !== region;
    const key = `${g.player.loc}|${g.day}`;
    b.lastRegion = region;
    if (!crossed && !(p && (p.roles ? p.roles.includes('guarded') : GUARDED.test(`${p.id} ${p.name}`)) && g.guardSeen !== key))
        return [];
    g.guardSeen = key;
    return guardCheck(g, w);
});
/* ---------- black market auctions ---------- */
export const auctionPlace = (w) => w.places.find(p => !p.link && placeIs(p, 'blackmarket'))?.id ?? '';
export function auctionToday(g, w) {
    if (!systemOn(w, 'auctions') || !w.goods?.length || !auctionPlace(w))
        return null;
    if ((g.day + Math.floor(H(`${g.world}|auction`) * 9)) % 9 !== 0)
        return null;
    const rare = w.goods.filter(x => x.kind === 'relic' || x.kind === 'rare');
    const pool = rare.length ? rare : w.goods;
    const lot = pool[Math.floor(H(`${g.world}|${g.day}|lot`) * pool.length)];
    // in the RPG, now and then a forgotten spell no school teaches
    const r = isRpg(w) ? rpgOf(w) : null;
    const s = sheetOf(g);
    const forbidden = r && s ? r.spells.filter(sp => !s.known.includes(sp.id)) : [];
    const spell = forbidden.length && H(`${g.day}|spell`) < 0.4 ? forbidden[Math.floor(H(`${g.day}|which`) * forbidden.length)] : null;
    const min = spell ? 60 + spell.level * 40 : Math.round(lot.price * 2);
    return { lot, spell, min, place: auctionPlace(w) };
}
export const auctionOpen = (g, w) => { const a = auctionToday(g, w); return !!a && g.player.loc === a.place && g.minutes >= 20 * 60; };
export function bid(g, w, amount) {
    const a = auctionToday(g, w);
    if (!a || !auctionOpen(g, w))
        return 'No auction here now.';
    const b = bagOf(g);
    const cur = b.auction?.day === g.day ? b.auction : null;
    const n = Math.round(amount);
    if (n < a.min || (cur && n <= cur.bid))
        return `Bid more than ${cur ? cur.bid : a.min - 1}.`;
    if (g.player.money < n)
        return 'You do not have that much.';
    b.auction = { day: g.day, lot: a.spell ? `spell:${a.spell.id}` : a.lot.id, bid: n, rival: cur?.rival ?? Math.round(a.min * (0.9 + H(`${g.day}|rival`) * 0.9)), spell: a.spell?.id };
    return `You bid ${n}. The room goes quiet…`;
}
// The auction ends at midnight: the highest bid wins.
onDay.push((g, w) => {
    const b = bagOf(g);
    const a = b.auction;
    if (!a || a.day !== g.day - 1)
        return [];
    b.auction = undefined;
    if (a.bid <= a.rival)
        return [`At the auction, someone outbid you (${a.rival + 5}).`];
    if (g.player.money < a.bid)
        return ['You could not pay your winning bid; the lot went to another.'];
    g.player.money -= a.bid;
    book(g, 'Won at auction', -a.bid);
    if (a.spell) {
        const s = sheetOf(g);
        if (s && !s.known.includes(a.spell))
            s.known.push(a.spell);
        return [`You won the auction: a forgotten spell is yours (${rpgOf(w)?.spells.find(x => x.id === a.spell)?.name}).`];
    }
    addGood(g, a.lot, 1);
    note(g, '{u} won a rare lot at a black market auction: {0}.', [goodDef(w, a.lot)?.name ?? a.lot], [], g.player.loc, 'event');
    return [`You won the auction: ${goodDef(w, a.lot)?.name}.`];
});
export function tradeLine(g, w) {
    if (!on(w))
        return '';
    const b = bagOf(g);
    const list = Object.entries(b.items).map(([id, n]) => `${n} ${goodDef(w, id)?.name.toLowerCase() ?? id}`);
    const a = auctionToday(g, w);
    return [list.length ? `{{user}} carries: ${list.join(', ')}.` : '', a && g.player.loc === a.place && g.minutes >= 20 * 60 ? `Tonight there is a secret auction here: ${a.spell ? 'a forgotten spell no school teaches' : a.lot.name}.` : ''].filter(Boolean).join(' ');
}
