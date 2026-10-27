// Factions on screen: the Factions app (standing, power, membership and duties, leading, your own faction), the
// realm and its gods (patron, prayer, offerings, miracles), the leader's audience dialog and the HUD duty button.
import { esc, game, notify, saveGame, toast } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { godsActive } from '../core/rpgdef.js';
import { ACT } from './reg.js';
import { thumb, setPrompt } from '../st/bridge.js';
import { money } from '../sim/needs.js';
import { advance } from '../sim/time.js';
import { factionsOf, standingOf, standingWord, powerOf, memberOf, rankName, isLeader, canJoin, join, leave, doDuty, found, recruit, hireAssistant, setHq, deposit, startAudience, decideAudience, skipShift, fstate, LEVEL_NEEDS, OWN, OWN_COST, } from '../sim/factions.js';
import { GOVERNMENTS, POWERS, realmPower, faithOf, patronOf, choosePatron, pray, offer, miracle, MIRACLE, isShrine } from '../sim/realm.js';
import { placeOf } from '../sim/places.js';
const UIF = { name: '', kind: 'guild', amount: 50 };
const bar = (v, cls = '') => `<span class="mu-lp-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;
const repBar = (v) => `<span class="mu-lp-rep"><i style="${v >= 0 ? `left:50%;width:${v / 2}%` : `right:50%;width:${-v / 2}%`}" class="${v >= 0 ? 'is-good' : 'is-bad'}"></i></span>`;
const placeName = (w, id) => (id ? w.places.find(p => p.id === id)?.name ?? '' : '');
export function factionsApp(g, w, head) {
    const list = factionsOf(g, w).filter(f => f.id !== OWN && (!f.secret || standingOf(g, f.id) !== 0 || memberOf(g, f.id) || g.player.loc === f.hq));
    const row = (f) => {
        const m = memberOf(g, f.id);
        const v = standingOf(g, f.id);
        const why = canJoin(g, w, f.id);
        const lead = m && isLeader(g, w, f.id);
        return `<article class="mu-fac ${m ? 'is-member' : ''}"><header><b>${esc(f.name)}</b><small>${esc(f.kind)}${f.hq ? ` · ${esc(placeName(w, f.hq))}` : ''}</small></header>
            ${f.desc ? `<p>${esc(f.desc)}</p>` : ''}
            <div class="mu-lp-row"><small>Standing: ${esc(standingWord(v))} (${v > 0 ? '+' : ''}${v})</small>${repBar(v)}</div>
            <div class="mu-lp-row"><small>Power ${powerOf(g, f.id)}</small>${bar(powerOf(g, f.id), 'is-power')}</div>
            ${m ? `<p class="mu-good">${esc(rankName(g, w, f.id))}${lead ? ' · you lead it' : ''} · duties this week ${m.duty}/${f.quota ?? 0}${f.dues ? ` · dues ${esc(money(w, f.dues))}/week` : ''}</p>
                <div class="mu-row">${lead ? `<button class="mu-primary" data-act="fc-audience" data-id="${esc(f.id)}">Hold audience</button><button class="mu-ghost" data-act="fc-skip" data-id="${esc(f.id)}">Skip the shift</button>`
            : `<button class="mu-primary" data-act="fc-duty" data-id="${esc(f.id)}" ${f.hq && g.player.loc !== f.hq ? 'aria-disabled="true" title="At its headquarters"' : ''}>Do your duty (2h)</button>`}
                <button class="mu-ghost mu-danger-text" data-act="fc-leave" data-id="${esc(f.id)}">Leave</button></div>`
            : `<button class="mu-ghost" data-act="fc-join" data-id="${esc(f.id)}" ${why ? `aria-disabled="true" title="${esc(why)}"` : ''}>Join${why ? ` · ${esc(why)}` : ''}</button>`}</article>`;
    };
    const st = fstate(g);
    const own = st.own;
    const ownHtml = own ? `<section class="mu-ph-card"><h4>${esc(own.name)} · level ${own.level}</h4>
            <small>${esc(own.kind)}${own.hq ? ` · headquarters: ${esc(placeName(w, own.hq))}` : ''} · treasury ${esc(money(w, own.treasury))} · ${own.members.length} member${own.members.length === 1 ? '' : 's'}${own.assistant ? ' + an assistant' : ''}</small>
            ${own.level < 5 ? `<small class="mu-muted">Next level: ${esc(LEVEL_NEEDS[own.level])}</small>` : ''}
            <div class="mu-row"><button class="mu-primary" data-act="fc-audience" data-id="${OWN}">Hold audience</button><button class="mu-ghost" data-act="fc-skip" data-id="${OWN}">Skip the shift</button></div>
            <div class="mu-row">${own.assistant ? '' : `<button class="mu-ghost" data-act="fc-assistant">Hire an assistant (60)</button>`}${own.hq ? '' : `<button class="mu-ghost" data-act="fc-hq" ${placeOf(g, w, g.player.loc)?.home ? 'aria-disabled="true"' : ''}>Make ${esc(placeName(w, g.player.loc) || 'this place')} the headquarters (300)</button>`}</div>
            <div class="mu-row"><input type="number" min="1" data-input="fc-amount" value="${UIF.amount}"><button class="mu-ghost" data-act="fc-deposit">Put into the treasury</button></div>
            ${recruitable(g).length ? `<h4>Recruit</h4>${recruitable(g).map(r => `<div class="mu-ph-job"><img src="${esc(thumb(r.avatar))}" alt=""><span><b data-notr>${esc(r.name)}</b></span><button class="mu-ghost" data-act="fc-recruit" data-who="${esc(r.avatar)}">Invite</button></div>`).join('')}` : ''}</section>`
        : `<section class="mu-ph-card"><h4>Found your own faction</h4><small class="mu-muted">A guild, an order, a company, a gang… It costs ${OWN_COST}. It grows in levels: a roster, a headquarters, members and a treasury.</small>
            <div class="mu-row"><input type="text" maxlength="40" placeholder="Name" data-input="fc-name" data-focus="fc-name" value="${esc(UIF.name)}"><input type="text" maxlength="20" placeholder="Kind (guild, order…)" data-input="fc-kind" value="${esc(UIF.kind)}"></div>
            <button class="mu-primary" data-act="fc-found">Found it</button></section>`;
    const news = st.news.slice(-4).reverse();
    return `${head}<div class="mu-ph-body mu-lp">
        ${realmHtml(g, w)}
        ${news.length ? `<section><h4>News</h4>${news.map(n => `<p class="mu-muted">• ${esc(n)}</p>`).join('')}</section>` : ''}
        <section><h4>Factions</h4>${list.map(row).join('') || '<p class="mu-muted">None in this world.</p>'}</section>
        ${ownHtml}</div>`;
}
const recruitable = (g) => Object.values(g.cast).filter(r => r.met && (g.social?.bond?.[r.avatar] ?? 0) >= 50 && !fstate(g).own?.members.includes(r.avatar)).slice(0, 6);
function realmHtml(g, w) {
    const r = w.realm;
    if (!r)
        return '';
    const gov = GOVERNMENTS.find(x => x[0] === r.government);
    const pw = POWERS.find(x => x[0] === realmPower(w));
    const head = `<section class="mu-ph-card"><h4>The realm</h4><small>${esc(gov?.[1] ?? '')}${r.leadership ? ` · ${esc(r.leadership)}` : ''}</small>${pw && pw[0] !== 'balanced' ? `<small>Power: ${esc(pw[1])} (${esc(pw[2])})</small>` : ''}`;
    if (!godsActive(w))
        return `${head}<small class="mu-muted">No gods answer prayers here: altars honor heroes and ideals.</small></section>`;
    const f = faithOf(g);
    const god = patronOf(g, w);
    const need = MIRACLE(w);
    const shrine = isShrine(w, placeOf(g, w, g.player.loc));
    return `${head}<h4>The gods</h4>${r.pantheon.map(x => `<div class="mu-lp-row ${god?.id === x.id ? 'is-has' : ''}"><b>${esc(x.symbol ?? '')} ${esc(x.name)}</b><small>${esc(x.domain)}</small>
            ${systemOn(w, 'faith') && god?.id !== x.id ? `<button class="mu-ghost" data-act="fc-patron" data-id="${esc(x.id)}">Choose as patron</button>` : ''}</div>`).join('')}
        ${god && systemOn(w, 'faith') ? `<small>Devotion to ${esc(god.name)}: ${f.devotion}/${need}</small>${bar((f.devotion / need) * 100, 'is-faith')}
            <div class="mu-row"><button class="mu-primary" data-act="fc-pray" ${shrine ? '' : 'aria-disabled="true" title="At a temple or shrine"'}>Pray</button><button class="mu-ghost" data-act="fc-offer" ${shrine ? '' : 'aria-disabled="true"'}>Offer 10</button></div>
            ${f.devotion >= need ? `<div class="mu-row">${['heal', 'ward', 'fortune'].map(k => `<button class="mu-primary" data-act="fc-miracle" data-v="${k}">${k === 'heal' ? '✨ Healing' : k === 'ward' ? '🛡️ A ward' : '💰 Fortune'}</button>`).join('')}</div>` : ''}${f.ward ? '<small class="mu-good">A divine ward protects you.</small>' : ''}` : ''}</section>`;
}
// The leader's audience: a petition, and your choice.
export function audienceHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    const a = g && fstate(g).pending;
    if (!g || !w || !a)
        return '';
    return `<div class="mu-recap-veil"><section class="mu-recap mh-glass mu-audience" role="dialog" aria-label="Audience">
        <header><small>Audience</small><h3>${esc(factionsOf(g, w).find(f => f.id === a.faction)?.name ?? '')}</h3></header>
        <p>${esc(a.text)}</p>
        <div class="mu-work-modes">${a.choices.map(c => `<button class="mu-work-mode" data-act="fc-decide" data-v="${esc(c.id)}"><b>${esc(c.label)}</b>${c.cost ? `<small>${esc(c.cost)}</small>` : ''}</button>`).join('')}</div></section></div>`;
}
// The HUD: your duty, when you are at your faction's headquarters.
export function factionActs(g, w) {
    return factionsOf(g, w).filter(f => f.hq === g.player.loc && memberOf(g, f.id) && !isLeader(g, w, f.id))
        .map(f => `<button class="mh-act mh-glass" data-act="fc-duty" data-id="${esc(f.id)}"><i>⚜️</i><b>Duty</b><small>${esc(f.name)} · 2h</small></button>`).join('');
}
const S = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const done = (m, kind = 'success') => { if (m)
    toast(m, kind); saveGame(); notify(); };
Object.assign(ACT, {
    'fc-join': (el) => { const c = S(); if (c) {
        const m = join(c.g, c.w, el.dataset.id);
        done(m, /now/.test(m) ? 'success' : 'warn');
    } },
    'fc-leave': (el) => { const c = S(); if (c)
        done(leave(c.g, c.w, el.dataset.id), 'info'); },
    'fc-duty': (el) => { const c = S(); if (!c)
        return; const r = doDuty(c.g, c.w, el.dataset.id); if (r.minutes)
        advance(c.g, c.w, r.minutes).forEach(m => toast(m, 'info')); done(r.text, r.minutes ? 'success' : 'warn'); },
    'fc-audience': (el) => { const c = S(); if (!c)
        return; const a = startAudience(c.g, c.w, el.dataset.id); if (typeof a === 'string')
        return done(a, 'warn'); done(''); },
    'fc-decide': (el) => {
        const c = S();
        if (!c)
            return;
        const a = fstate(c.g).pending;
        const m = decideAudience(c.g, c.w, el.dataset.v);
        if (a)
            setPrompt('mundi_roll', `[Rules — {{user}} held an audience as a leader. ${a.text} {{user}} decided: ${a.choices.find(x => x.id === el.dataset.v)?.label}. Outcome: ${m} Narrate it briefly.]`, 0);
        advance(c.g, c.w, 60);
        done(m);
    },
    'fc-skip': (el) => { const c = S(); if (c)
        done(skipShift(c.g, c.w, el.dataset.id), 'info'); },
    'fc-found': () => { const c = S(); if (!c)
        return; const m = found(c.g, c.w, UIF.name, UIF.kind); if (/founded/.test(m))
        UIF.name = ''; done(m, /founded/.test(m) ? 'success' : 'warn'); },
    'fc-recruit': (el) => { const c = S(); if (c) {
        const m = recruit(c.g, c.w, el.dataset.who);
        done(m, /joins/.test(m) ? 'success' : 'warn');
    } },
    'fc-assistant': () => { const c = S(); if (c)
        done(hireAssistant(c.g, c.w)); },
    'fc-hq': () => { const c = S(); if (c) {
        const m = setHq(c.g, c.w, c.g.player.loc);
        done(m, /has a/.test(m) ? 'success' : 'warn');
    } },
    'fc-deposit': () => { const c = S(); if (c)
        done(deposit(c.g, UIF.amount), 'info'); },
    'fc-patron': (el) => { const c = S(); if (c)
        done(choosePatron(c.g, c.w, el.dataset.id)); },
    'fc-pray': () => { const c = S(); if (!c)
        return; const m = pray(c.g, c.w); if (/You pray/.test(m))
        advance(c.g, c.w, 30); done(m, 'info'); },
    'fc-offer': () => { const c = S(); if (c)
        done(offer(c.g, c.w), 'info'); },
    'fc-miracle': (el) => { const c = S(); if (!c)
        return; const m = miracle(c.g, c.w, el.dataset.v); if (!/not enough/.test(m))
        setPrompt('mundi_roll', `[Rules — a miracle: ${m} Narrate it.]`, 0); done(m); },
});
document.addEventListener('input', (e) => {
    const t = e.target;
    const k = t?.dataset?.input;
    if (!k)
        return;
    if (k === 'fc-name')
        UIF.name = t.value;
    else if (k === 'fc-kind')
        UIF.kind = t.value;
    else if (k === 'fc-amount')
        UIF.amount = Number(t.value) || 0;
});
