// Lote 5 on screen, one app each: Tower, Contracts, Workshop (crafting and gems), Trophies, Weapon (the sentient one),
// Soul bond, Health (injuries, afflictions, arcane fatigue); HUD buttons (the tower, a contract here, pickpocketing)
// and the arrest dialog.
import { lex } from '../core/lexicon.js';
import { esc, game, notify, saveGame, toast } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { ACT } from './reg.js';
import { setPrompt } from '../st/bridge.js';
import { advance } from '../sim/time.js';
import { placeOf } from '../sim/places.js';
import { towerAt, climbOf, enterFloor, leaveTower } from '../sim/towers.js';
import { contractsOf, isBoard, takeContract, askAround, track, CLUES } from '../sim/contracts.js';
import { craftable, haveFor, craft, socketsOf, setGem, unsetGems, trophiesOf, bladeOf, bladeDef, bondOf, bindSoul, AWAKEN } from '../sim/artifacts.js';
import { bagOf, goodDef } from '../sim/economy.js';
import { petsOf, petDef } from '../sim/pets.js';
import { ailOf, DEBUFF_WORD, treat, ritual, atHealer, HEALER_COST, usable, useGood } from '../sim/afflictions.js';
import { pickpocket, arrestOf, surrender, payUp, resist, prisonDays } from '../sim/prison.js';
import { isRpg, sheetOf } from '../sim/rpg.js';
const UIA = { name: '' };
const bar = (v, cls = '') => `<span class="mu-lp-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;
const body = (head, inner) => `${head}<div class="mu-ph-body mu-lp">${inner}</div>`;
const S = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
export function towerApp(g, w, head) {
    const list = w.towers ?? [];
    return body(head, list.length ? list.map(t => {
        const c = climbOf(g, t.id);
        const here = g.player.loc === t.place;
        return `<article class="mu-fac"><header><b>${esc(t.name)}</b><small>${esc(placeOf(g, w, t.place)?.name ?? '')} · ${t.floors} floors</small></header>${t.desc ? `<p>${esc(t.desc)}</p>` : ''}
        <small>Best: floor ${c.best} · checkpoint: floor ${c.checkpoint}</small>${bar((c.best / t.floors) * 100, 'is-power')}
        ${here ? `<div class="mu-row"><button class="mu-primary" data-act="av-floor" data-id="${esc(t.id)}">${c.floor ? `Climb to floor ${c.floor + 1}` : 'Enter'}</button>${c.checkpoint && !c.floor ? `<button class="mu-ghost" data-act="av-checkpoint" data-id="${esc(t.id)}">From floor ${c.checkpoint + 1}</button>` : ''}${c.floor ? `<button class="mu-ghost" data-act="av-leave" data-id="${esc(t.id)}">Leave</button>` : ''}</div>` : '<small class="mu-muted">Go there to climb.</small>'}</article>`;
    }).join('') : '<p class="mu-muted">No towers in this world.</p>');
}
export function contractsApp(g, w, head) {
    const list = contractsOf(g).filter(c => c.state !== 'failed');
    const board = isBoard(g, w);
    return body(head, `${board ? '' : '<p class="mu-muted">New contracts are taken at the contracts board (see the map: a place marked as one).</p>'}${list.map(c => `<article class="mu-fac ${c.state === 'active' ? 'is-member' : ''}"><header><b>${c.legendary ? '⭐ ' : ''}${esc(c.name)}</b><small>${c.reward} · ${c.state}</small></header>
        ${c.state === 'active' ? `<small>Clues ${c.clues}/${CLUES}</small>${bar((c.clues / CLUES) * 100)}<div class="mu-row"><button class="mu-ghost" data-act="av-ask" data-id="${esc(c.id)}">${esc(lex(w, 'askTavern'))}</button><button class="mu-primary" data-act="av-track" data-id="${esc(c.id)}" ${c.clues < CLUES ? 'aria-disabled="true"' : ''}>Track it down</button></div>` : c.state === 'offered' ? `<button class="mu-primary" data-act="av-take" data-id="${esc(c.id)}" ${board ? '' : 'aria-disabled="true"'}>Take the contract</button>` : '<em class="mu-good">✓ Done</em>'}</article>`).join('') || '<p class="mu-muted">No contracts on the board yet.</p>'}`);
}
export function workshopApp(g, w, head) {
    const recipes = craftable(g, w);
    const all = w.recipes ?? [];
    const sock = socketsOf(g);
    const gems = Object.keys(bagOf(g).items).map(id => goodDef(w, id)).filter(x => x?.socket);
    const need = (r) => Object.entries(r.needs).map(([id, n]) => `${n} ${goodDef(w, id)?.name.toLowerCase() ?? id} (${bagOf(g).items[id] ?? 0})`).join(', ');
    return body(head, `<section><h4>Make here</h4>${recipes.length ? recipes.map(r => `<div class="mu-lp-row"><b>${esc(goodDef(w, r.makes)?.icon ?? '')} ${esc(r.name)}${r.legendary ? ' ⭐' : ''}</b><small>${esc(need(r))}${r.skill && isRpg(w) ? ` · ${esc(r.skill)} DC ${r.dc ?? 12}` : ''}${r.risky ? ' · risky' : ''}</small>
            ${r.legendary ? `<input type="text" maxlength="40" placeholder="Name your artifact" data-input="av-name" value="${esc(UIA.name)}">` : ''}<button class="mu-primary" data-act="av-craft" data-id="${esc(r.id)}" ${haveFor(g, r) ? '' : 'aria-disabled="true"'}>Make</button></div>`).join('') : '<p class="mu-muted">Nothing can be made here. Forges, alchemists\' benches and workshops each have their recipes.</p>'}
        ${all.length > recipes.length ? `<small class="mu-muted">Elsewhere: ${all.filter(r => !recipes.includes(r)).map(r => esc(r.name)).join(', ')}</small>` : ''}</section>
        <section><h4>Gems and runes</h4>${['weapon', 'armor'].map(slot => `<div class="mu-lp-row"><b>${slot === 'weapon' ? 'Weapon' : 'Armor'}</b><small>${sock[slot].map(id => esc(goodDef(w, id)?.name ?? id)).join(', ') || 'empty'} (${sock[slot].length}/2)</small>${sock[slot].length ? `<button class="mu-ghost" data-act="av-unset" data-v="${slot}">Pry them out</button>` : ''}</div>`).join('')}
        ${gems.map(x => `<button class="mu-ghost" data-act="av-set" data-id="${esc(x.id)}">Set ${esc(x.icon)} ${esc(x.name)} (+${x.socket.amount} ${x.socket.kind})</button>`).join('')}</section>`);
}
export function trophiesApp(g, w, head) {
    const t = trophiesOf(g);
    return body(head, t.length ? `<p class="mu-muted">Each trophy lifts your morale every morning (up to +5) and makes you more intimidating (up to +3).</p><div class="mu-trophies">${t.map(x => `<div><i>${esc(x.icon)}</i><b>${esc(x.name)}</b><small>day ${x.day}</small></div>`).join('')}</div>` : '<p class="mu-muted">No trophies yet. Defeat a great foe (a boss) and its head or banner hangs on your wall.</p>');
}
export function bladeApp(g, w, head) {
    const b = bladeOf(g);
    const d = b && bladeDef(w, b.id);
    if (!b || !d)
        return body(head, '<p class="mu-muted">No weapon has spoken to you yet. They sleep deep in towers, or turn up at black market auctions.</p>');
    return body(head, `<section class="mu-ph-card"><h4>${esc(d.name)}</h4><small>${esc(d.personality)} · it likes ${esc(d.likes)}</small>${d.desc ? `<p>${esc(d.desc)}</p>` : ''}
        <small>Approval ${b.approval}</small>${bar(b.approval, b.approval >= 60 ? 'is-love' : 'is-sus')}
        <small>${b.approval >= 60 ? `Pleased: +${d.bonus} to hit.` : b.approval < 25 ? 'Sulking: −1 to hit.' : 'Watchful.'}${b.bound ? ` Soul-bound, level ${b.level}.` : ''}</small></section>`);
}
export function soulApp(g, w, head) {
    const t = bondOf(g);
    const pets = petsOf(g);
    const b = bladeOf(g);
    if (t) {
        const e = t.kind === 'pet' ? pets.find(x => x.id === t.id) : b;
        const lvl = e?.level ?? 1;
        const next = lvl * 60;
        return body(head, `<section class="mu-ph-card"><h4>Bound to ${esc(e?.name ?? '?')}</h4><small>Level ${lvl} · ${e?.xp ?? 0}/${next}</small>${bar(((e?.xp ?? 0) / next) * 100, 'is-faith')}
            <small class="mu-muted">It grows with fights and nights at camp. It awakens at levels ${AWAKEN.join(', ')}: ${t.kind === 'blade' ? 'it hits harder and whispers advice' : petDef(w, e?.kind)?.mount ? 'it runs faster' : 'it fights at your side'}.</small></section>`);
    }
    const options = [...pets.map(p => ({ kind: 'pet', id: p.id, name: p.name, icon: petDef(w, p.kind)?.icon ?? '🐾', need: `affection ${p.love}/75` })), ...(b ? [{ kind: 'blade', id: b.id, name: b.name, icon: '🗡️', need: `approval ${b.approval}/75` }] : [])];
    return body(head, `<p class="mu-muted">Bind your soul to one companion creature, mount or sentient weapon. Only one, and for good.</p>${options.map(o => `<div class="mu-lp-row"><b>${esc(o.icon)} ${esc(o.name)}</b><small>${esc(o.need)}</small><button class="mu-primary" data-act="av-bind" data-k="${o.kind}" data-id="${esc(o.id)}">Bind</button></div>`).join('') || '<p class="mu-muted">You have nobody to bind to yet.</p>'}`);
}
export function healthApp(g, w, head) {
    const a = ailOf(g);
    const inj = a.injuries.filter(i => i.until > g.day);
    return body(head, `<section><h4>Injuries</h4>${inj.map(i => `<div class="mu-lp-row"><b>${i.kind === 'fracture' ? `Broken ${esc(i.where)}` : 'Deep wound'}</b><small>${i.until - g.day} days left · ${i.kind === 'fracture' ? '−2 on bodily checks, −1 to hit' : '−1 to hit'}</small></div>`).join('') || '<p class="mu-muted">None.</p>'}</section>
        <section><h4>Afflictions</h4>${a.debuffs.map(d => `<div class="mu-lp-row"><b>${esc(DEBUFF_WORD[d.kind] ?? d.kind)}</b><small>${d.until - g.day} days left</small></div>`).join('') || '<p class="mu-muted">None.</p>'}</section>
        ${isRpg(w) && sheetOf(g) && systemOn(w, 'fatigue') ? `<section><h4>Arcane fatigue</h4><small>${a.stress}/100</small>${bar(a.stress, 'is-sus')}</section>` : ''}
        ${usable(g, w).length ? `<section><h4>In your bag</h4>${usable(g, w).map(u => `<div class="mu-lp-row"><b>${esc(u.def.icon)} ${esc(u.def.name)} ×${u.n}</b><small>${u.def.kind === 'potion' ? 'heals' : ''}${u.def.kind === 'potion' && u.def.cures ? ' · ' : ''}${u.def.cures ? 'cures afflictions' : ''}</small><button class="mu-ghost" data-act="av-use" data-id="${esc(u.def.id)}">Use</button></div>`).join('')}</section>` : ''}
        <div class="mu-row"><button class="mu-primary" data-act="av-treat" ${atHealer(g, w) ? '' : `aria-disabled="true" title="${esc(lex(w, 'atHealer'))}"`}>${esc(lex(w, 'seeHealer'))} (${HEALER_COST})</button><button class="mu-ghost" data-act="av-ritual">Cleansing ritual (at a shrine)</button></div>`);
}
// HUD: the tower here, contracts to work on here, pickpocketing in a crowd.
export function adventureActs(g, w) {
    const out = [];
    const t = towerAt(w, g.player.loc);
    if (t && sheetOf(g))
        out.push(`<button class="mh-act mh-glass is-quest" data-act="av-floor" data-id="${esc(t.id)}"><i>🗼</i><b>${climbOf(g, t.id).floor ? `Floor ${climbOf(g, t.id).floor + 1}` : `Enter ${esc(t.name)}`}</b><small>${t.floors} floors</small></button>`);
    if (systemOn(w, 'prison') && !placeOf(g, w, g.player.loc)?.home)
        out.push(`<button class="mh-act mh-glass" data-act="av-steal"><i>👛</i><b>Pick a pocket</b><small>Risky</small></button>`);
    return out.join('');
}
export function arrestHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    const a = g && arrestOf(g);
    if (!g || !w || !a)
        return '';
    return `<div class="mu-recap-veil"><section class="mu-recap mh-glass mu-audience" role="dialog" aria-label="Arrest">
        <header><small>${esc(lex(w, 'guardsTitle'))}</small><h3>You are under arrest</h3></header><p>A bounty of ${a.amount} on your head in ${esc(w.maps.find(m => m.id === a.region)?.name ?? '')}.</p>
        <div class="mu-work-modes"><button class="mu-work-mode" data-act="av-pay" ${g.player.money < a.amount ? 'aria-disabled="true"' : ''}><b>Pay the fine (${a.amount})</b></button>
            <button class="mu-work-mode" data-act="av-surrender"><b>Go quietly</b><small>${prisonDays(a.amount)} days in prison; your goods are held, contraband lost</small></button>
            ${isRpg(w) && sheetOf(g) ? `<button class="mu-work-mode" data-act="av-resist"><b>Resist</b><small>${esc(lex(w, 'resistArrest'))}</small></button>` : ''}</div></section></div>`;
}
const done = (m, kind = 'success') => { if (m)
    toast(m, kind); saveGame(); notify(); };
const many = (lines) => { lines.forEach((m, i) => toast(m, i ? 'info' : 'success')); saveGame(); notify(); };
Object.assign(ACT, {
    'av-floor': (el) => { const c = S(); if (c)
        done(enterFloor(c.g, c.w, el.dataset.id), 'info'); },
    'av-checkpoint': (el) => { const c = S(); if (c)
        done(enterFloor(c.g, c.w, el.dataset.id, true), 'info'); },
    'av-leave': (el) => { const c = S(); if (c) {
        leaveTower(c.g, el.dataset.id);
        done('You leave the tower.', 'info');
    } },
    'av-take': (el) => { const c = S(); if (c)
        done(takeContract(c.g, c.w, el.dataset.id)); },
    'av-ask': (el) => { const c = S(); if (!c)
        return; const m = askAround(c.g, c.w, el.dataset.id); if (/clue|talk/.test(m))
        advance(c.g, c.w, 30); done(m, /A clue/.test(m) ? 'success' : 'info'); },
    'av-track': (el) => { const c = S(); if (!c)
        return; const m = track(c.g, c.w, el.dataset.id); if (/trail/.test(m))
        advance(c.g, c.w, 60); done(m, /found/.test(m) ? 'success' : 'info'); },
    'av-craft': (el) => { const c = S(); if (!c)
        return; const r = craft(c.g, c.w, el.dataset.id, UIA.name); if (r.ok) {
        UIA.name = '';
        advance(c.g, c.w, 60);
        setPrompt('mundi_roll', `[Rules — {{user}} crafted something: ${r.text}]`, 0);
    } done(r.text, r.ok ? 'success' : 'warn'); },
    'av-set': (el) => { const c = S(); if (c)
        done(setGem(c.g, c.w, el.dataset.id)); },
    'av-unset': (el) => { const c = S(); if (c)
        done(unsetGems(c.g, c.w, el.dataset.v), 'info'); },
    'av-bind': (el) => { const c = S(); if (!c)
        return; const m = bindSoul(c.g, c.w, el.dataset.k, el.dataset.id); if (/bound/.test(m))
        setPrompt('mundi_roll', `[Rules — {{user}} bound their soul to a companion. ${m} Narrate the moment.]`, 0); done(m, /bound/.test(m) ? 'success' : 'warn'); },
    'av-use': (el) => { const c = S(); if (c)
        done(useGood(c.g, c.w, el.dataset.id)); },
    'av-treat': () => { const c = S(); if (c)
        done(treat(c.g, c.w), 'info'); },
    'av-ritual': () => { const c = S(); if (!c)
        return; const m = ritual(c.g, c.w); if (/washes/.test(m))
        advance(c.g, c.w, 60); done(m, /washes/.test(m) ? 'success' : 'warn'); },
    'av-steal': () => { const c = S(); if (!c)
        return; const out = pickpocket(c.g, c.w); if (out.length)
        setPrompt('mundi_roll', `[Rules — {{user}} tried to pick a pocket: ${out.join(' ')}]`, 0); many(out); },
    'av-pay': () => { const c = S(); if (c)
        done(payUp(c.g, c.w)); },
    'av-surrender': () => { const c = S(); if (!c)
        return; const out = surrender(c.g, c.w); setPrompt('mundi_roll', `[Rules — {{user}} served time in prison. ${out[0] ?? ''}]`, 0); many(out); },
    'av-resist': () => { const c = S(); if (c)
        done(resist(c.g, c.w), 'warn'); },
});
document.addEventListener('input', (e) => { const t = e.target; if (t?.dataset?.input === 'av-name')
    UIA.name = t.value; });
