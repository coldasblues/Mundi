// Holdings on screen: the market here (buy, sell, a hidden compartment, where your goods sell best), what you carry,
// tonight's auction, your houses, businesses, garden, loans and bounties; HUD buttons for the till and the harvest.
import { esc, game, notify, saveGame, toast } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { ACT } from './reg.js';
import { thumb, setPrompt } from '../st/bridge.js';
import { money } from '../sim/needs.js';
import { regionOf } from '../sim/worldstate.js';
import { placeOf } from '../sim/places.js';
import { bagOf, carried, capacity, goodDef, isMarket, priceOf, sellPrice, buy, sell, buyCompartment, bestRoutes, auctionToday, auctionOpen, bid, COMPARTMENT } from '../sim/economy.js';
import { holdingsOf, freeHomes, buyHome, sellHome, bizKinds, openBusiness, hireStaff, hireFriend, collect, closeBusiness, plant, ripe, harvest, bankLimit, borrow, repay, GARDEN_PLOTS, WAGE } from '../sim/holdings.js';
import { bountiesOf, payBounty } from '../sim/crime.js';
import { celestialOn, hazardHere } from '../sim/skies.js';
const UIH = { qty: 1, bid: 0, biz: '', loan: 100, pay: 50 };
const S = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
export function holdingsApp(g, w, head) {
    const parts = [];
    const b = bagOf(g);
    const h = holdingsOf(g);
    const sky = [celestialOn(g, w), hazardHere(g, w)].filter(Boolean);
    if (sky.length)
        parts.push(`<section class="mu-ph-card">${sky.map(x => `<small>⚠️ <b>${esc(x.name)}</b>${x.desc ? ` · ${esc(x.desc)}` : ''}</small>`).join('')}</section>`);
    // bounties
    const bounties = Object.entries(bountiesOf(g));
    if (bounties.length)
        parts.push(`<section><h4>Wanted</h4>${bounties.map(([r, x]) => `<div class="mu-lp-row"><b>${esc(w.maps.find(m => m.id === r)?.name ?? r)}</b><small>bounty ${x.amount} · ${esc(x.why.join(', '))}</small>${r === regionOf(g, w, g.player.loc) ? `<button class="mu-ghost" data-act="hd-fine">Pay the fine</button>` : ''}</div>`).join('')}</section>`);
    // market
    if (systemOn(w, 'trade') && w.goods?.length) {
        const here = isMarket(g, w);
        const goods = w.goods.filter(x => !x.illegal || here && /dock|bazaar|black|warehouse/i.test(g.player.loc) || b.items[x.id]);
        parts.push(`<section><h4>${here ? 'Market here' : 'Your goods'} <small>${carried(g)}/${capacity(g, w)} carried${b.hidden ? ` · ${b.hidden} hidden` : ''}</small></h4>
            ${here ? `<div class="mu-row"><small>Quantity</small><input type="number" min="1" max="20" data-input="hd-qty" value="${UIH.qty}"></div>` : ''}
            ${goods.filter(x => here || b.items[x.id]).map(x => `<div class="mu-ph-job mu-good-row"><i class="mu-lp-icon">${esc(x.icon)}</i><span><b>${esc(x.name)}${x.illegal ? ' <em class="mu-bad">(illegal)</em>' : ''}</b><small>${here ? `buy ${priceOf(g, w, x)} · sell ${sellPrice(g, w, x)}` : `${b.items[x.id]} carried`}${here && b.items[x.id] ? ` · you have ${b.items[x.id]}` : ''}</small></span>
                ${here ? `<button class="mu-primary" data-act="hd-buy" data-id="${esc(x.id)}">Buy</button>${b.items[x.id] ? `<button class="mu-ghost" data-act="hd-sell" data-id="${esc(x.id)}">Sell</button>` : ''}` : ''}</div>`).join('') || '<p class="mu-muted">You carry nothing to trade. Markets buy and sell goods: cheap where they are made, dear where they are scarce.</p>'}
            ${here ? `<button class="mu-ghost" data-act="hd-hide">Buy a hidden compartment (${COMPARTMENT})</button>` : ''}
            ${bestRoutes(g, w).length ? `<small class="mu-muted">Good trades from here: ${bestRoutes(g, w).map(r => `${esc(r.good.name)} (${r.buy} → ${r.sell} at ${esc(placeOf(g, w, r.sellAt)?.name ?? '')})`).join(' · ')}</small>` : ''}</section>`);
    }
    // auction
    const a = auctionToday(g, w);
    if (a)
        parts.push(`<section class="mu-ph-card"><h4>Black market auction</h4><small>${esc(placeOf(g, w, a.place)?.name ?? '')}, tonight from 20:00 · lot: ${esc(a.spell ? `a forgotten spell (${a.spell.name})` : a.lot.name)} · from ${a.min}</small>
        ${auctionOpen(g, w) ? `<div class="mu-row"><input type="number" min="${a.min}" data-input="hd-bid" value="${UIH.bid || a.min}"><button class="mu-primary" data-act="hd-bid">Bid</button></div>${b.auction?.day === g.day ? `<small>Your bid: ${b.auction.bid}. The winner is known at midnight.</small>` : ''}` : '<small class="mu-muted">Be there after 20:00 to bid.</small>'}</section>`);
    // property
    if (systemOn(w, 'property')) {
        const region = regionOf(g, w, g.player.loc);
        const forSale = freeHomes(g, w).filter(x => w.homes.zones.find(z => z.id === x.zone)?.map === region).slice(0, 4);
        parts.push(`<section><h4>Property</h4>${h.estates.map((e, i) => `<div class="mu-lp-row"><b>${esc(w.homes.zones.find(z => z.id === e.zone)?.name ?? '')}, ${e.n}</b><small>${e.tenant ? 'rented out' : 'empty this week'} · worth ${e.price}</small><button class="mu-ghost" data-act="hd-sellhome" data-i="${i}">Sell (${Math.round(e.price * 0.85)})</button></div>`).join('')}
            ${forSale.length ? `<small class="mu-muted">For sale in this town:</small>${forSale.map(x => `<div class="mu-lp-row"><b>${esc(x.name)}</b><small>${money(w, x.price)} · rent ${money(w, x.rent)}/day</small><button class="mu-primary" data-act="hd-buyhome" data-z="${esc(x.zone)}" data-x="${x.x}" data-y="${x.y}" ${g.player.money < x.price ? 'aria-disabled="true"' : ''}>Buy</button></div>`).join('')}` : ''}</section>`);
        // businesses
        const kinds = bizKinds(g, w);
        parts.push(`<section><h4>Businesses</h4>${h.biz.map(x => {
            const d = (w.businesses ?? []).find(k => k.id === x.kind);
            return `<article class="mu-fac"><header><b>${esc(d?.icon ?? '')} ${esc(x.name)}</b><small>${esc(placeOf(g, w, x.place)?.name ?? '')} · till ${Math.floor(x.till)} · staff ${x.staff + x.friends.length}/${d?.staff ?? 0} (${WAGE}/day each)</small></header>
                <div class="mu-row"><button class="mu-primary" data-act="hd-collect" data-id="${esc(x.id)}" ${g.player.loc === x.place ? '' : 'aria-disabled="true" title="At the place"'}>Collect</button><button class="mu-ghost" data-act="hd-hire" data-id="${esc(x.id)}">Hire a hand</button><button class="mu-ghost mu-danger-text" data-act="hd-close" data-id="${esc(x.id)}">Close</button></div>
                ${x.friends.length ? `<small>With: ${x.friends.map(a => esc(g.cast[a]?.name ?? '')).join(', ')}</small>` : ''}
                ${friendsFor(g).length && x.staff + x.friends.length < (d?.staff ?? 0) ? `<div class="mu-row">${friendsFor(g).map(r => `<button class="mu-ghost" data-act="hd-friend" data-id="${esc(x.id)}" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt="" class="mu-mini"> ${esc(r.name)}</button>`).join('')}</div>` : ''}</article>`;
        }).join('')}
            ${kinds.length && !h.biz.some(x => x.place === g.player.loc) ? `<small class="mu-muted">Open one here:</small><div class="mu-row"><input type="text" maxlength="40" placeholder="Its name" data-input="hd-biz" value="${esc(UIH.biz)}"></div>${kinds.map(k => `<div class="mu-lp-row"><b>${esc(k.icon)} ${esc(k.name)}</b><small>${money(w, k.cost)} · about ${money(w, k.profit)}/day · up to ${k.staff} staff</small><button class="mu-primary" data-act="hd-open" data-id="${esc(k.id)}" ${g.player.money < k.cost ? 'aria-disabled="true"' : ''}>Open</button></div>`).join('')}` : ''}</section>`);
    }
    // garden
    if (systemOn(w, 'farming') && w.crops?.length) {
        parts.push(`<section><h4>Garden <small>${h.garden.length}/${GARDEN_PLOTS}</small></h4>${h.garden.map(p => { const c = w.crops.find(x => x.id === p.crop); return `<div class="mu-lp-row"><b>${esc(c?.icon ?? '')} ${esc(c?.name ?? '')}</b><small>${ripe(w, g, p) ? 'ripe!' : `ready in ${Math.max(0, (c?.days ?? 0) - (g.day - p.planted))} days`}</small></div>`; }).join('')}
            ${g.player.loc === 'home:player' ? `${h.garden.some(p => ripe(w, g, p)) ? '<button class="mu-primary" data-act="hd-harvest">Harvest</button>' : ''}${h.garden.length < GARDEN_PLOTS ? `<div class="mu-row">${w.crops.map(c => `<button class="mu-ghost" data-act="hd-plant" data-id="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)} (${c.seed})</button>`).join('')}</div>` : ''}` : '<small class="mu-muted">You plant and harvest at home.</small>'}</section>`);
    }
    // loans
    if (systemOn(w, 'banks')) {
        parts.push(`<section><h4>Loans</h4>${h.loans.map(l => `<div class="mu-lp-row"><b>${l.lender === 'bank' ? 'The bank' : 'A moneylender'}</b><small>owed ${l.owed} · ${Math.round(l.rate * 100)}% a week · due day ${l.due}${g.day > l.due ? ' · <span class="mu-bad">late!</span>' : ''}</small><button class="mu-ghost" data-act="hd-repay" data-id="${esc(l.id)}">Repay ${UIH.pay}</button></div>`).join('')}
            <div class="mu-row"><input type="number" min="1" data-input="hd-loan" value="${UIH.loan}"><button class="mu-ghost" data-act="hd-borrow" data-v="bank">Borrow from the bank (5%/week, up to ${Math.max(0, bankLimit(g, w))})</button></div>
            <div class="mu-row"><button class="mu-ghost mu-danger-text" data-act="hd-borrow" data-v="shark">Borrow from a moneylender (20%/week, no questions)</button></div>
            ${h.loans.length ? `<div class="mu-row"><small>Repay amount</small><input type="number" min="1" data-input="hd-pay" value="${UIH.pay}"></div>` : ''}</section>`);
    }
    return `${head}<div class="mu-ph-body mu-lp">${parts.join('') || '<p class="mu-muted">Nothing here in this world.</p>'}</div>`;
}
const friendsFor = (g) => Object.values(g.cast).filter(r => r.met && (g.social?.bond?.[r.avatar] ?? 0) >= 40 && !holdingsOf(g).biz.some(b => b.friends.includes(r.avatar))).slice(0, 4);
export function holdingsActs(g, w) {
    const h = holdingsOf(g);
    const out = [];
    for (const b of h.biz)
        if (b.place === g.player.loc && b.till >= 1)
            out.push(`<button class="mh-act mh-glass" data-act="hd-collect" data-id="${esc(b.id)}"><i>💰</i><b>Collect the till</b><small>${esc(b.name)} · ${Math.floor(b.till)}</small></button>`);
    if (g.player.loc === 'home:player' && h.garden.some(p => ripe(w, g, p)))
        out.push(`<button class="mh-act mh-glass" data-act="hd-harvest"><i>🌾</i><b>Harvest</b><small>Your garden</small></button>`);
    if (auctionOpen(g, w))
        out.push(`<button class="mh-act mh-glass is-quest" data-act="hd-open-app"><i>🔨</i><b>Auction</b><small>Bid tonight</small></button>`);
    return out.join('');
}
const done = (m, kind = 'success') => { if (m)
    toast(m, kind); saveGame(); notify(); };
const ok = (m, re) => done(m, re.test(m) ? 'success' : 'warn');
Object.assign(ACT, {
    'hd-buy': (el) => { const c = S(); if (c)
        ok(buy(c.g, c.w, el.dataset.id, UIH.qty), /You buy/); },
    'hd-sell': (el) => { const c = S(); if (c)
        ok(sell(c.g, c.w, el.dataset.id, Math.min(UIH.qty, bagOf(c.g).items[el.dataset.id] ?? 0)), /You sell/); },
    'hd-hide': () => { const c = S(); if (c)
        ok(buyCompartment(c.g, c.w), /hidden compartment:/); },
    'hd-bid': () => { const c = S(); if (c)
        ok(bid(c.g, c.w, UIH.bid), /You bid/); },
    'hd-fine': () => { const c = S(); if (c)
        ok(payBounty(c.g, c.w), /free/); },
    'hd-buyhome': (el) => { const c = S(); if (c)
        ok(buyHome(c.g, c.w, el.dataset.z, Number(el.dataset.x), Number(el.dataset.y)), /yours/); },
    'hd-sellhome': (el) => { const c = S(); if (c)
        ok(sellHome(c.g, c.w, Number(el.dataset.i)), /Sold/); },
    'hd-open': (el) => { const c = S(); if (!c)
        return; const m = openBusiness(c.g, c.w, el.dataset.id, UIH.biz); if (/open for/.test(m))
        UIH.biz = ''; ok(m, /open for/); },
    'hd-hire': (el) => { const c = S(); if (c)
        ok(hireStaff(c.g, c.w, el.dataset.id), /hired/); },
    'hd-friend': (el) => { const c = S(); if (c)
        ok(hireFriend(c.g, c.w, el.dataset.id, el.dataset.who), /helps out/); },
    'hd-collect': (el) => { const c = S(); if (c)
        ok(collect(c.g, c.w, el.dataset.id), /collect/); },
    'hd-close': (el) => { const c = S(); if (c) {
        closeBusiness(c.g, el.dataset.id);
        done('Closed.', 'info');
    } },
    'hd-plant': (el) => { const c = S(); if (c)
        ok(plant(c.g, c.w, el.dataset.id), /You plant/); },
    'hd-harvest': () => { const c = S(); if (c)
        ok(harvest(c.g, c.w), /harvest/); },
    'hd-borrow': (el) => { const c = S(); if (!c)
        return; const m = borrow(c.g, c.w, el.dataset.v, UIH.loan); if (/borrow/.test(m))
        setPrompt('mundi_roll', `[Rules — {{user}} borrowed money from ${el.dataset.v === 'bank' ? 'the bank' : 'a shady moneylender'}: ${m}]`, 0); ok(m, /borrow/); },
    'hd-repay': (el) => { const c = S(); if (c)
        ok(repay(c.g, el.dataset.id, UIH.pay), /repay|paid off/); },
    'hd-open-app': async () => { const p = await import('./phone.js'); p.P.open = true; p.P.app = 'assets'; notify(); },
});
document.addEventListener('input', (e) => {
    const t = e.target;
    const k = t?.dataset?.input;
    if (!k)
        return;
    if (k === 'hd-qty')
        UIH.qty = Math.max(1, Number(t.value) || 1);
    else if (k === 'hd-bid')
        UIH.bid = Number(t.value) || 0;
    else if (k === 'hd-biz')
        UIH.biz = t.value;
    else if (k === 'hd-loan')
        UIH.loan = Number(t.value) || 0;
    else if (k === 'hd-pay')
        UIH.pay = Number(t.value) || 0;
});
void goodDef;
