// Life and society on screen: the Reputation app (how each town sees you, your alter ego, habits on the way to
// becoming traits, your apprentices), the Animals app, an apprentice button on a person's page, help for a friend's
// letter, and the HUD's festival and lesson buttons.
import { esc, game, notify, saveGame, toast } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { lex } from '../core/lexicon.js';
import { ACT } from './reg.js';
import { thumb } from '../st/bridge.js';
import { money } from '../sim/needs.js';
import { presentAt } from '../sim/people.js';
import { isWith } from '../sim/social.js';
import { advance } from '../sim/time.js';
import { reputationList, repWord, identityOf, disguised, setAlias, toggleDisguise, addRep } from '../sim/standing.js';
import { habitProgress } from '../sim/habits.js';
import { menteesOf, canMentor, teachable, takeApprentice, lesson, areaName, dropApprentice } from '../sim/mentors.js';
import { petsOf, petDef, petsAvailable, soldHere, buyPet, feedPet, playWithPet, releasePet, petWord, MAX_PETS } from '../sim/pets.js';
import { helpAsked, sendHelp } from '../sim/letters.js';
import { canCelebrate, celebrate, festivalOn, upcoming } from '../sim/festivals.js';
import { eventChip } from './cityui.js';
import { schoolOf, instDef, instAt, enroll, drop, attend, examDue, sitExam, joinClub, clubMeeting, faculty } from '../sim/institutions.js';
import { setPrompt } from '../st/bridge.js';
const UIS = { alias: '', petName: '', area: '' };
const bar = (v, cls = '') => `<span class="mu-lp-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;
const repBar = (v) => `<span class="mu-lp-rep"><i style="${v >= 0 ? `left:50%;width:${v / 2}%` : `right:50%;width:${-v / 2}%`}" class="${v >= 0 ? 'is-good' : 'is-bad'}"></i></span>`;
const here = (g, w, a) => isWith(g, a) || presentAt(g, w, g.player.loc).some(r => r.avatar === a);
/* ---------- Reputation ---------- */
export function standingApp(g, w, head) {
    const parts = [];
    if (systemOn(w, 'reputation')) {
        const list = reputationList(g, w);
        parts.push(`<section><h4>Reputation</h4>${list.length ? list.map(r => `<div class="mu-lp-row"><b>${esc(r.name)}</b><small>${esc(repWord(r.v))} (${r.v > 0 ? '+' : ''}${r.v})</small>${repBar(r.v)}</div>`).join('')
            : '<p class="mu-muted">Nobody talks about you yet. Deeds (quests, promotions, festivals, fights…) build a name in each town; without news, it fades.</p>'}</section>`);
    }
    if (systemOn(w, 'identity')) {
        const id = identityOf(g);
        const on = disguised(g, w);
        parts.push(`<section class="mu-ph-card"><h4>${esc(lex(w, 'alias'))}</h4>
            ${id.alias ? `<p><b data-notr>${esc(id.alias)}</b> ${on ? '<em class="mu-good">· you are in disguise</em>' : ''}</p><small>Suspicion ${id.suspicion}%</small>${bar(id.suspicion, 'is-sus')}
                ${reputationList(g, w, true).map(r => `<div class="mu-lp-row"><b>${esc(r.name)}</b><small>${esc(id.alias)}: ${esc(repWord(r.v))}</small>${repBar(r.v)}</div>`).join('')}
                <button class="${on ? 'mu-ghost' : 'mu-primary'}" data-act="lp-disguise">${on ? 'Take off the disguise' : 'Put on the disguise'}</button>`
            : '<p class="mu-muted">A second name to live a second life: what you do in disguise is told about that name. People who know you well may see through it.</p>'}
            ${on ? '' : `<div class="mu-row"><input type="text" maxlength="40" placeholder="Name of your alter ego" data-input="lp-alias" data-focus="lp-alias" value="${esc(UIS.alias)}"><button class="mu-ghost" data-act="lp-alias">${id.alias ? 'Rename' : 'Create'}</button></div>`}</section>`);
    }
    const habits = habitProgress(g, w);
    if (habits.length)
        parts.push(`<section><h4>Habits</h4>${habits.map(({ h, n, has }) => `<div class="mu-lp-row ${has ? 'is-has' : ''}"><b>${esc(h.trait)}</b><small>${has ? '✓ part of you' : `${Math.min(n, h.count)}/${h.count} in ${h.days} days`} · ${esc(h.desc ?? '')}</small>${has ? '' : bar((n / h.count) * 100)}</div>`).join('')}</section>`);
    if (systemOn(w, 'mentors')) {
        const ms = menteesOf(g).filter(m => g.cast[m.avatar]);
        parts.push(`<section><h4>${esc(lex(w, 'apprentice'))}s</h4>${ms.length ? ms.map(m => `<div class="mu-ph-job"><img src="${esc(thumb(m.avatar))}" alt=""><span><b data-notr>${esc(g.cast[m.avatar].name)}</b><small>${esc(areaName(w, m.area))} · ${m.done ? 'finished: a bond for life' : `${m.progress}%`}</small>${m.done ? '' : bar(m.progress)}</span>
            ${m.done ? '' : `<button class="mu-primary" data-act="lp-lesson" data-who="${esc(m.avatar)}" ${here(g, w, m.avatar) ? '' : 'aria-disabled="true" title="They have to be with you"'}>Teach (1h)</button><button class="mu-ghost" data-act="lp-drop" data-who="${esc(m.avatar)}">Stop</button>`}</div>`).join('')
            : '<p class="mu-muted">Someone who trusts you (bond 50+) can become your apprentice: open their page in People.</p>'}</section>`);
    }
    const studies = Object.entries(schoolOf(g)).map(([id, e]) => ({ d: instDef(w, id), e })).filter(x => x.d);
    if (studies.length)
        parts.push(`<section><h4>Studies</h4>${studies.map(({ d, e }) => {
            const f = faculty(g, w, d);
            return `<div class="mu-lp-row"><b>${esc(d.name)}</b><small>${esc(d.ranks[e.rank] ?? '')} · ${e.lessons} lessons · ${e.exams} exams passed${e.fails ? ' · one more failure and you are out' : ''}${f.head ? ` · ${esc(d.ranks.at(-1) ?? '')}: ${esc(f.head.name)}` : ''}</small>
        ${(d.clubs ?? []).length && !e.club ? `<div class="mu-row">${d.clubs.map(cl => `<button class="mu-ghost" data-act="lp-club" data-id="${esc(d.id)}" data-v="${esc(cl)}">Join the ${esc(cl)}</button>`).join('')}</div>` : e.club ? `<small>Club: ${esc(e.club)}</small>` : ''}
        <button class="mu-ghost mu-danger-text" data-act="lp-drop-school" data-id="${esc(d.id)}">Leave the school</button></div>`;
        }).join('')}</section>`);
    return `${head}<div class="mu-ph-body mu-lp">${parts.join('') || '<p class="mu-muted">Nothing here in this world.</p>'}</div>`;
}
/* ---------- Animals ---------- */
export function petsApp(g, w, head) {
    const mine = petsOf(g);
    const sold = petsAvailable(w).filter(p => soldHere(g, w, p));
    return `${head}<div class="mu-ph-body mu-lp">
        <section><h4>Your animals</h4>${mine.length ? mine.map(p => {
        const d = petDef(w, p.kind);
        return `<article class="mu-lp-pet"><i>${esc(d?.icon ?? '🐾')}</i><div><b data-notr>${esc(p.name)}</b><small>${esc(d?.name ?? '')} · ${esc(petWord(p))}${p.bound ? ' · soul-bound' : ''}${d?.skill ? ` · +${d.bonus ?? 1} ${esc(d.skill)}` : ''}</small>
            <small>Fed</small>${bar(p.hunger, 'is-food')}<small>Affection</small>${bar(p.love, 'is-love')}
            <div class="mu-row"><button class="mu-primary" data-act="lp-feed" data-id="${esc(p.id)}">Feed (${esc(money(w, 2))})</button><button class="mu-ghost" data-act="lp-play" data-id="${esc(p.id)}">Play</button><button class="mu-ghost mu-danger-text" data-act="lp-release" data-id="${esc(p.id)}">Let go</button></div></div></article>`;
    }).join('')
        : '<p class="mu-muted">No animals yet. Markets and exotic dealers sell them.</p>'}</section>
        ${sold.length ? `<section><h4>For sale here</h4><input type="text" maxlength="24" placeholder="A name for it" data-input="lp-petname" data-focus="lp-petname" value="${esc(UIS.petName)}">
            ${sold.map(p => `<div class="mu-ph-job"><i class="mu-lp-icon">${esc(p.icon)}</i><span><b>${esc(p.name)}</b><small>${esc(money(w, p.price))} · ${esc(p.desc ?? '')}</small></span><button class="mu-primary" data-act="lp-buy" data-id="${esc(p.id)}" ${mine.length >= MAX_PETS || g.player.money < p.price ? 'aria-disabled="true"' : ''}>Buy</button></div>`).join('')}</section>` : ''}
    </div>`;
}
/* ---------- on a person's page, in a letter, on the HUD ---------- */
export function apprenticeBtn(g, w, avatar) {
    if (!systemOn(w, 'mentors') || menteesOf(g).some(m => m.avatar === avatar))
        return '';
    const why = canMentor(g, w, avatar);
    if (why && /trust|cannot/.test(why))
        return '';
    const opts = teachable(g, w);
    return `<div class="mu-lp-mentor"><select data-input="lp-area">${opts.map(([id, n]) => `<option value="${esc(id)}" ${UIS.area === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <button data-act="lp-mentor" data-who="${esc(avatar)}" ${why ? `aria-disabled="true" title="${esc(why)}"` : ''}>Take as ${esc(lex(w, 'apprentice').toLowerCase())}</button></div>`;
}
export function helpBtn(g, w, avatar) {
    const l = helpAsked(g, avatar);
    return l ? `<button data-act="lp-help" data-who="${esc(avatar)}">${esc(`Send ${money(w, l.ask ?? 0)}`)}</button>` : '';
}
export function lifeActs(g, w) {
    const out = [];
    const f = canCelebrate(g, w);
    if (f)
        out.push(`<button class="mh-act mh-glass is-quest" data-act="lp-celebrate"><i>🎉</i><b>Celebrate</b><small>${esc(f.name)}</small></button>`);
    for (const m of menteesOf(g))
        if (!m.done && m.last !== g.day && g.cast[m.avatar] && here(g, w, m.avatar))
            out.push(`<button class="mh-act mh-glass" data-act="lp-lesson" data-who="${esc(m.avatar)}"><i>📖</i><b>Teach ${esc(g.cast[m.avatar].name)}</b><small>${esc(areaName(w, m.area))} · 1h</small></button>`);
    return out.join('');
}
export function schoolActs(g, w) {
    return instAt(w, g.player.loc).map(d => {
        const e = schoolOf(g)[d.id];
        if (!e)
            return `<button class="mh-act mh-glass" data-act="lp-enroll" data-id="${esc(d.id)}"><i>🎓</i><b>Enroll</b><small>${esc(d.name)}${d.tuition ? ` · ${esc(money(w, d.tuition))}/week` : ''}</small></button>`;
        return [e.last !== g.day ? `<button class="mh-act mh-glass" data-act="lp-attend" data-id="${esc(d.id)}"><i>📚</i><b>Attend class</b><small>${esc(d.name)} · 2h</small></button>` : '',
            examDue(g, w, d.id) ? `<button class="mh-act mh-glass is-quest" data-act="lp-exam" data-id="${esc(d.id)}"><i>📝</i><b>Sit the exam</b><small>${esc(d.ranks[e.rank] ?? '')}</small></button>` : '',
            e.club ? `<button class="mh-act mh-glass" data-act="lp-meet" data-id="${esc(d.id)}"><i>🎭</i><b>Club meeting</b><small>${esc(e.club)} · 1h</small></button>` : ''].join('');
    }).join('');
}
export const festivalChip = (g, w) => { const f = festivalOn(g, w); return (f ? `<small class="mh-crowd mh-fest" title="${esc(f.desc ?? '')}">🎉<span>${esc(f.name)}</span></small>` : '') + eventChip(g, w); };
export function festivalsHtml(g, w) {
    const list = upcoming(g, w);
    return list.length ? `<section><h4>${esc(lex(w, 'festival'))}s</h4>${list.map(x => `<div class="mu-lp-row"><b>${esc(x.f.name)}</b><small>${x.day === g.day ? 'today' : `in ${x.day - g.day} day${x.day - g.day === 1 ? '' : 's'}`}${x.f.place ? ` · ${esc(w.places.find(p => p.id === x.f.place)?.name ?? '')}` : ''}</small></div>`).join('')}</section>` : '';
}
const S = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const done = (m, kind = 'success') => { if (m)
    toast(m, kind); saveGame(); notify(); };
Object.assign(ACT, {
    'lp-alias': () => { const c = S(); if (!c)
        return; const why = setAlias(c.g, UIS.alias); if (!why)
        UIS.alias = ''; done(why || 'Your alter ego is ready.', why ? 'warn' : 'success'); },
    'lp-disguise': () => { const c = S(); if (c) {
        const m = toggleDisguise(c.g, c.w);
        done(m, /Not in|first/.test(m) ? 'warn' : 'info');
    } },
    'lp-lesson': (el) => {
        const c = S();
        if (!c)
            return;
        const a = el.dataset.who;
        const r = lesson(c.g, c.w, a, here(c.g, c.w, a));
        if (r.minutes)
            advance(c.g, c.w, r.minutes).forEach(m => toast(m, 'info'));
        done(r.text, r.minutes ? 'success' : 'warn');
    },
    'lp-drop': (el) => { const c = S(); if (c) {
        dropApprentice(c.g, el.dataset.who);
        done('', 'info');
    } },
    'lp-mentor': (el) => { const c = S(); if (!c)
        return; const area = UIS.area || teachable(c.g, c.w)[0]?.[0] || ''; const m = takeApprentice(c.g, c.w, el.dataset.who, area); done(m, /now/.test(m) ? 'success' : 'warn'); },
    'lp-buy': (el) => { const c = S(); if (!c)
        return; const m = buyPet(c.g, c.w, el.dataset.id, UIS.petName); if (/yours/.test(m))
        UIS.petName = ''; done(m, /yours/.test(m) ? 'success' : 'warn'); },
    'lp-feed': (el) => { const c = S(); if (c)
        done(feedPet(c.g, c.w, el.dataset.id), 'info'); },
    'lp-play': (el) => { const c = S(); if (!c)
        return; const m = playWithPet(c.g, c.w, el.dataset.id); if (/You play/.test(m))
        advance(c.g, c.w, 15); done(m, 'info'); },
    'lp-release': (el) => { const c = S(); if (c) {
        releasePet(c.g, el.dataset.id);
        done('You let it go.', 'info');
    } },
    'lp-help': (el) => { const c = S(); if (c) {
        const m = sendHelp(c.g, c.w, el.dataset.who);
        done(m, /sent/.test(m) ? 'success' : 'warn');
    } },
    'lp-enroll': (el) => { const c = S(); if (c) {
        const m = enroll(c.g, c.w, el.dataset.id);
        done(m, /now/.test(m) ? 'success' : 'warn');
    } },
    'lp-attend': (el) => { const c = S(); if (!c)
        return; const r = attend(c.g, c.w, el.dataset.id); if (r.minutes)
        advance(c.g, c.w, r.minutes).forEach(m => toast(m, 'info')); r.msgs.forEach(m => toast(m, 'success')); done(r.text, r.minutes ? 'success' : 'warn'); },
    'lp-exam': (el) => { const c = S(); if (!c)
        return; const r = sitExam(c.g, c.w, el.dataset.id); if (r.text)
        setPrompt('mundi_roll', `[Rules — {{user}} sat an exam at ${instDef(c.w, el.dataset.id)?.name}: ${r.text} Narrate it.]`, 0); advance(c.g, c.w, 60); r.msgs.forEach(m => toast(m, 'success')); done(r.text, r.passed ? 'success' : 'warn'); },
    'lp-meet': (el) => { const c = S(); if (!c)
        return; const r = clubMeeting(c.g, c.w, el.dataset.id); if (r.minutes)
        advance(c.g, c.w, r.minutes); done(r.text, r.minutes ? 'success' : 'info'); },
    'lp-club': (el) => { const c = S(); if (c)
        done(joinClub(c.g, c.w, el.dataset.id, el.dataset.v)); },
    'lp-drop-school': (el) => { const c = S(); if (c) {
        drop(c.g, el.dataset.id);
        done('You left the school.', 'info');
    } },
    'lp-celebrate': () => { const c = S(); if (!c)
        return; const m = celebrate(c.g, c.w, d => { const x = addRep(c.g, c.w, d, 'festival'); if (x)
        toast(x, 'success'); }); if (m)
        advance(c.g, c.w, 60); done(m); },
});
// text fields
document.addEventListener('input', (e) => {
    const t = e.target;
    const k = t?.dataset?.input;
    if (!k)
        return;
    if (k === 'lp-alias')
        UIS.alias = t.value;
    else if (k === 'lp-petname')
        UIS.petName = t.value;
    else if (k === 'lp-area')
        UIS.area = t.value;
});
document.addEventListener('change', (e) => { const t = e.target; if (t?.dataset?.input === 'lp-area')
    UIS.area = t.value; });
