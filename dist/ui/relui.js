// Relationships on screen: the asking buttons on a person's card (ask out, propose, marry, break up, divorce), the
// milestone pop-up ("You and Samantha are now dating"), the end-of-day recap after sleeping (each person's bars
// moving, a new tier filling the bar and changing its color), and the work screen with its choices.
import { esc, game, notify, saveGame, toast, state } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { chat, quiet, sendCanned, setPrompt, thumb } from '../st/bridge.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
import { ASKS, canAsk, coolingDown, readiness, applyAnswer, pushTooSoon, endRelationship, romOf, friendTier, romanceTier, tierPct, FRIEND_TIERS, ROMANCE_TIERS } from '../sim/romance.js';
import { bondOf, social } from '../sim/social.js';
import { presentAt } from '../sim/people.js';
import { WORK_MODES, workShift, jobDef } from '../sim/work.js';
import { tooTired } from '../sim/needs.js';
import { note } from '../sim/facts.js';
import { diaryTtsButton } from './addons.js';
import { INPUT } from './reg.js';
import { createCharacter, personaName } from '../st/bridge.js';
import { kidOf, stageOf, canCelebrate, celebrate, daysToBirthday, pregnancy, daysLeft, birthDue, conceive, welcomeBaby, romanceBlocked, STAGES } from '../sim/family.js';
import { resident, syncScene } from '../sim/game.js';
import { refreshPrompt } from '../sim/prompt.js';
import { diaryShown } from '../sim/diary.js';
/* ---------- the friendship bar, the same everywhere (card, phone, HUD) ---------- */
// Fills up within the current tier and starts again, in the tier's color, at each new tier (like The Sims).
export function relBar(avatar, romance = true) {
    const g = game();
    if (!g)
        return '';
    const b = bondOf(g, avatar);
    const ft = friendTier(b);
    const rt = romanceTier(g, avatar);
    return `<span class="mu-tierbar" title="${esc(ft.name)}"><i style="width:${tierPct(ft, b)}%;background:${ft.color}"></i></span>${romance && rt.id !== 'none' ? `<span class="mu-tierbar is-love" title="${esc(rt.name)}"><i style="width:${tierPct(rt, romOf(g, avatar).value)}%;background:${rt.color}"></i></span>` : ''}`;
}
/* ---------- the buttons on a person's card ---------- */
export function romanceButtons(avatar) {
    const g = game();
    if (!g)
        return '';
    // your child: their stage of life and the weekly birthday instead of any romance
    const k = kidOf(g, avatar);
    if (k) {
        const st = stageOf(k), last = k.stage >= STAGES.length - 1;
        return `<div class="mu-pc-love mu-pc-kid"><small class="mu-muted">👶 Your child · ${esc(st.name)}</small>
            ${canCelebrate(g, k) ? `<button data-act="kid-bday" data-who="${esc(avatar)}">🎂<span>Celebrate their birthday</span></button>`
            : last ? '' : `<small class="mu-muted">Next birthday in ${daysToBirthday(g, k)} day${daysToBirthday(g, k) === 1 ? '' : 's'}.</small>`}</div>`;
    }
    if (romanceBlocked(g, avatar))
        return '';
    const r = romOf(g, avatar);
    const p = pregnancy(g);
    const kinds = Object.keys(ASKS).filter(k => canAsk(g, avatar, k));
    const end = r.status === 'married' ? 'Ask for a divorce' : r.status !== 'none' ? (r.status === 'engaged' ? 'Call off the engagement' : 'Break up') : '';
    const busy = !!ASK.avatar;
    return `<div class="mu-pc-love">
        ${kinds.map(k => `<button data-act="rm-ask" data-who="${esc(avatar)}" data-k="${k}" ${busy ? 'aria-disabled="true"' : ''}>${icon('heart')}<span>${ASKS[k].label}</span></button>`).join('')}
        ${end ? `<button class="mu-ghost mu-danger-text" data-act="rm-end" data-who="${esc(avatar)}">${icon('x')}<span>${end}</span></button>` : ''}
        ${p && p.partner === avatar ? `<small class="mu-pc-baby">👶 Expecting a baby · ${daysLeft(g) ? `${daysLeft(g)} day${daysLeft(g) === 1 ? '' : 's'} left` : 'any moment now'}</small>` : ''}
        ${coolingDown(g, avatar) ? '<small class="mu-muted">They need some time before you ask again.</small>' : ''}
    </div>`;
}
/* ---------- asking: the scene plays it, then the engine reads the answer ---------- */
const ASK = { avatar: '', name: '', kind: 'date', from: 0, waits: 0, round: 0, start: 0 };
const END = { avatar: '' };
const askWhat = (k) => k === 'date' ? 'to be a couple' : k === 'baby' ? 'about trying for a baby together' : k === 'propose' ? 'to marry them' : 'to set the date and get married';
function startAsk(g, avatar, kind, from) {
    const r = g.cast[avatar];
    Object.assign(ASK, { avatar, name: r.name, kind, from, waits: 0, round: 0, start: from });
    // the question itself is a fact (the diary and the Journal know it was asked, whatever the answer)
    note(g, kind === 'date' ? '{u} asked {0} to be a couple.' : kind === 'propose' ? '{u} proposed to {0}.' : kind === 'marry' ? '{u} asked {0} to set the date and get married.' : '{u} asked {0} about trying for a baby.', [r.name], [avatar], g.player.loc, kind === 'baby' ? 'family' : 'love');
    saveGame();
    setPrompt('mundi_ask', readiness(g, avatar, r.name, kind), 0);
}
async function ask(avatar, kind) {
    const g = game();
    if (!g || ASK.avatar)
        return;
    const r = g.cast[avatar];
    if (!r)
        return;
    if (coolingDown(g, avatar)) {
        toast(pushTooSoon(g, avatar, r.name), 'warn');
        saveGame();
        notify();
        return;
    }
    startAsk(g, avatar, kind, chat().length);
    if (!sendCanned(ASKS[kind].line(r.name))) {
        Object.assign(ASK, { avatar: '' });
        setPrompt('mundi_ask', '');
        toast('SillyTavern\'s message box was not found.', 'error');
    }
    notify();
}
// Asked in your own words ("will you be my girlfriend?", "quer namorar comigo?"): the same as the button.
const ASK_WORDS = [
    ['propose', /\b(marry me|will you marry|be my (wife|husband)|casa comigo|quer casar comigo|aceita casar|se casar comigo|c[aá]sate conmigo|casarte conmigo)\b/i],
    ['date', /\b(be my (girl ?friend|boy ?friend|partner|girl|boy)|date me|be (a|in a) couple|be together\?|go steady|namorar comigo|namora comigo|quer namorar|ser minha namorada|ser meu namorado|ser (o )?meu par|sermos um casal|ser mi novi[ao]|ser novios|salir conmigo en serio)\b/i],
];
export function detectAsk(text) {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w || ASK.avatar || !text)
        return;
    const hit = ASK_WORDS.find(([, re]) => re.test(text));
    if (!hit)
        return;
    const people = presentAt(g, w, g.player.loc).filter(r => canAsk(g, r.avatar, hit[0]));
    if (!people.length)
        return;
    const low = text.toLowerCase();
    const solo = String(social(g).solo ?? '');
    const r = people.find(p => low.includes(p.name.toLowerCase().split(/\s+/)[0])) ?? people.find(p => p.avatar === solo) ?? (people.length === 1 ? people[0] : null);
    if (!r || coolingDown(g, r.avatar))
        return;
    startAsk(g, r.avatar, hit[0], chat().length);
    notify();
}
// Called when a reply finishes (index.ts): if someone was just asked, find their answer and let the engine apply it.
export async function checkAsk() {
    const g = game();
    if (!ASK.avatar || !g)
        return;
    const list = chat();
    // their reply: by name (ignoring case and extra words), or the only other person who answered
    const others = list.slice(ASK.from).filter((m) => !m.is_user && !m.is_system && !m.extra?.mundi_narrator);
    const low = ASK.name.toLowerCase().trim(), first = low.split(/\s+/)[0];
    const named = (m) => { const n = String(m.name ?? '').toLowerCase().trim(); return n === low || n.split(/\s+/)[0] === first; };
    const speakers = new Set(others.map((m) => String(m.name ?? '')));
    const reply = [...others].reverse().find(named) ?? (speakers.size === 1 ? others.at(-1) : undefined);
    if (!reply) {
        if (++ASK.waits >= 3) {
            setPrompt('mundi_ask', '');
            ASK.avatar = '';
            notify();
        }
        return;
    }
    const { avatar, name, kind } = ASK;
    // everything since the question (their words, and yours: a story direction like "she says yes" counts too)
    const clean = (t) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const said = list.slice(Math.max(0, ASK.start - 1)).filter((m) => !m.is_system)
        .map((m) => `${m.is_user ? `${personaName()} (the player)` : String(m.name ?? '')}: ${clean(m.mes)}`).join('\n').slice(-2500);
    let answer = 'maybe';
    try {
        const out = (await quiet(`${personaName()} asked ${name} ${askWhat(kind)}. This is the scene since then (lines by the player may be story directions that decide what happens):\n"""\n${said}\n"""\n\nHas ${name} accepted? Reply with one word only: yes (accepted), no (refused), or maybe (no clear answer yet, or asked for time).`, 20, 'You read a scene and say whether the person accepted. One word: yes, no, or maybe.')).toLowerCase();
        answer = /\byes\b/.test(out) ? 'yes' : /\bno\b/.test(out) ? 'no' : 'maybe';
    }
    catch { /* not sure: treat it as "maybe" */ }
    if (answer === 'maybe' && ASK.round < 2) {
        // not clear yet: the question stays open for a couple more replies, and they are nudged to answer
        ASK.round++;
        ASK.from = list.length;
        ASK.waits = 0;
        setPrompt('mundi_ask', `[${name} has not clearly answered {{user}}'s question yet (${askWhat(kind)}). In this reply ${name} gives a clear answer, in their own way: yes, no, or that they need time to think.]`, 0);
        toast(`Waiting for ${name}'s answer…`, 'info');
        notify();
        return;
    }
    ASK.avatar = '';
    setPrompt('mundi_ask', '');
    let msg = applyAnswer(g, avatar, name, kind, answer);
    if (kind === 'baby' && answer === 'yes') {
        msg = conceive(g, avatar, name);
        saveGame();
        refreshPrompt();
        if (pregnancy(g))
            milestone(avatar, msg);
        else
            toast(msg, 'info');
        notify();
        return;
    }
    saveGame();
    if (answer === 'yes')
        milestone(avatar, msg);
    else
        toast(msg, answer === 'no' ? 'warn' : 'info');
    notify();
}
export const asking = () => ASK.avatar ? { avatar: ASK.avatar, kind: ASK.kind } : null;
/* ---------- a milestone ---------- */
const MS = { avatar: '', text: '', until: 0 };
export function milestone(avatar, text) { Object.assign(MS, { avatar, text, until: Date.now() + 4200 }); setTimeout(notify, 4300); notify(); }
function milestoneHtml() {
    if (Date.now() > MS.until)
        return '';
    return `<div class="mu-milestone" data-act="ms-close"><div class="mu-milestone-card"><img src="${esc(thumb(MS.avatar))}" alt=""><b>${esc(MS.text)}</b>${icon('heart')}</div></div>`;
}
/* ---------- the end-of-day recap ---------- */
const DAY = { day: 0, changes: [], open: false };
export function showDayRecap(day, changes) {
    const g = game();
    const entry = g && (g.journalProse ?? {})[day];
    if (!changes.length && !entry)
        return;
    Object.assign(DAY, { day, changes, open: true });
    notify();
}
// While the night's diary is being written: a "writing the diary" screen after the night, with a way to skip it.
const WAIT = { day: 0, on: false, skipped: false, done: -1 };
export function diaryWaiting(day) { if (WAIT.done === day)
    return; Object.assign(WAIT, { day, on: true, skipped: false }); notify(); }
export function diaryReady(day, changes, ok) {
    const skipped = WAIT.skipped;
    WAIT.on = false;
    WAIT.done = day;
    if (ok)
        showDayRecap(day, changes);
    else
        notify();
    void skipped;
}
function waitHtml() {
    if (!WAIT.on || WAIT.skipped)
        return '';
    return `<div class="mu-recap-veil mu-diary-wait"><section class="mu-recap mh-glass"><span class="mu-spin"></span><h3>Writing your diary…</h3>
        <p class="mu-muted">The day ${WAIT.day} is becoming a diary entry. Then you will see how the day went with everyone.</p>
        <button class="mu-ghost" data-act="diary-skip">Skip and keep playing</button></section></div>`;
}
// One bar: from its old value to the new one; a new tier fills the bar up, empties it and changes its color.
function animBar(label, t0, t1, v0, v1) {
    const up = t1.lo > t0.lo, down = t1.lo < t0.lo;
    const a = tierPct(t0, v0), b = tierPct(t1, v1);
    const cls = up ? 'is-up' : down ? 'is-down' : v1 > v0 ? 'is-more' : v1 < v0 ? 'is-less' : '';
    return `<div class="mu-rb ${cls}"><span class="mu-rb-head"><small>${label}</small><b style="color:${t1.color}">${esc(t1.name)}</b>${up ? '<em>New level!</em>' : down ? '<em class="is-bad">Went down</em>' : ''}</span>
        <span class="mu-rb-bar" style="--a:${a}%;--b:${b}%;--c0:${t0.color};--c1:${t1.color}"><i></i></span></div>`;
}
// The diary as written by the model: paragraphs, **bold** and *italics* (it used to show the asterisks).
function proseHtml(t) {
    return String(t ?? '').trim().split(/\n\s*\n/).map(p => `<p>${esc(p.trim())
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>')
        .replace(/\n/g, '<br>')}</p>`).join('');
}
function recapHtml() {
    const g = game();
    if (!DAY.open || !g)
        return '';
    return `<div class="mu-recap-veil"><section class="mu-recap mh-glass" role="dialog" aria-label="How the day went">
        <header><small>Day ${DAY.day}</small><h3>How the day went</h3></header>
        ${(g.journalProse ?? {})[DAY.day] ? `<div class="mu-recap-diary"><blockquote data-notr>${proseHtml(diaryShown(g, DAY.day))}</blockquote>${diaryTtsButton(DAY.day)}</div>` : ''}
        <div class="mu-recap-list">${DAY.changes.map((c, i) => {
        const fT0 = friendTier(c.f0), fT1 = friendTier(c.f1);
        const rT0 = romanceTier(g, c.avatar, c.r0), rT1 = romanceTier(g, c.avatar, c.r1);
        return `<article class="mu-recap-p" style="--d:${i * 0.35}s"><img src="${esc(thumb(c.avatar))}" alt="">
                <div><b data-notr>${esc(c.name)}</b><p data-notr>${esc(c.why)}</p>
                ${animBar('Friendship', fT0, fT1, c.f0, c.f1)}
                ${c.r0 || c.r1 || romOf(g, c.avatar).status !== 'none' ? animBar('Romance', rT0, rT1, c.r0, c.r1) : ''}</div></article>`;
    }).join('')}</div>
        <button class="mu-primary" data-act="recap-close">Continue</button></section></div>`;
}
/* ---------- the work screen ---------- */
const WORK = { open: false };
export const openWork = () => { WORK.open = true; notify(); };
function workHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!WORK.open || !g || !w)
        return '';
    const job = jobDef(w, g.player.job?.id);
    if (!job)
        return '';
    const rank = job.ranks[g.player.job.rank];
    return `<div class="mu-recap-veil" data-act="work-cancel-bg"><section class="mu-recap mu-workpick mh-glass" role="dialog" aria-label="Work">
        <header><small>${esc(job.name)} · ${esc(rank.name)} · ${job.shift} h</small><h3>How will you work today?</h3></header>
        <div class="mu-work-modes">${WORK_MODES.map(m => `<button class="mu-work-mode" data-act="work-go" data-mode="${m.id}"><i>${m.icon}</i><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></button>`).join('')}</div>
        <button class="mu-ghost" data-act="work-cancel">Not now</button></section></div>`;
}
/* ---------- the birth ---------- */
const BIRTH = { name: '', busy: false };
function birthHtml() {
    const g = game();
    if (!g || !birthDue(g) || DAY.open)
        return '';
    const p = pregnancy(g);
    return `<div class="mu-recap-veil"><section class="mu-recap mu-birth mh-glass" role="dialog" aria-label="The baby is here">
        <header><small>Day ${g.day}</small><h3>👶 The baby is here!</h3></header>
        <p>You and <b data-notr>${esc(p.name)}</b> are parents now. What will you call them?</p>
        <input type="text" class="text_pole" placeholder="The baby's name" value="${esc(BIRTH.name)}" data-input="birth-name" data-focus="birth-name" maxlength="40">
        <small class="mu-muted">They become a person of this world and live with you. You can give them a picture in the Library.</small>
        <button class="mu-primary" data-act="birth-go" ${BIRTH.name.trim() && !BIRTH.busy ? '' : 'aria-disabled="true"'}>${BIRTH.busy ? 'One moment…' : 'Welcome them'}</button></section></div>`;
}
export function relOverlays() { return `${workHtml()}${waitHtml()}${recapHtml()}${birthHtml()}${milestoneHtml()}`; }
Object.assign(INPUT, { 'birth-name': (el) => { BIRTH.name = el.value; notify(); } });
Object.assign(ACT, {
    'rm-ask': (el) => ask(el.dataset.who, el.dataset.k),
    'rm-end': (el) => { END.avatar = el.dataset.who; notify(); },
    'rm-end-no': () => { END.avatar = ''; notify(); },
    'rm-end-yes': () => {
        const g = game();
        const r = g && g.cast[END.avatar];
        END.avatar = '';
        if (!g || !r)
            return;
        const was = romOf(g, r.avatar).status;
        const msg = endRelationship(g, r.avatar, r.name);
        saveGame();
        if (msg) {
            toast(msg, 'warn');
            // the scene plays the moment (the engine already decided it)
            if (state.view === 'scene') {
                setPrompt('mundi_ask', `[{{user}} is ending the relationship with ${r.name}${was === 'married' ? ' (asking for a divorce)' : ''}. It is decided. Write ${r.name}'s reaction.]`, 0);
                sendCanned(`*${was === 'married' ? `tells ${r.name} they want a divorce` : `breaks up with ${r.name}`}*`);
                setTimeout(() => setPrompt('mundi_ask', ''), 60000);
            }
        }
        notify();
    },
    'ms-close': () => { MS.until = 0; notify(); },
    'diary-skip': () => { WAIT.skipped = true; toast('The diary is still being written. "How the day went" will show up when it is ready.', 'info'); notify(); },
    'birth-go': async () => {
        const g = game();
        const w = g && getWorld(g.world);
        const p = g && pregnancy(g);
        const name = BIRTH.name.trim();
        if (!g || !w || !p || !name || BIRTH.busy)
            return;
        BIRTH.busy = true;
        notify();
        try {
            const me = personaName();
            const avatar = await createCharacter({ name, description: `${name} is the child of ${me} and ${p.name}, born in ${w.name}.`,
                tags: ['Mundi'], extensions: { mundi: { world: w.id, child: true } } });
            const taken = new Set();
            welcomeBaby(g, w, avatar, name, resident(w, avatar, taken));
            BIRTH.name = '';
            saveGame();
            await syncScene();
            refreshPrompt();
            milestone(avatar, `Welcome, ${name}!`);
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        BIRTH.busy = false;
        notify();
    },
    'kid-bday': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        const k = g && kidOf(g, el.dataset.who);
        if (!g || !w || !k)
            return;
        const msg = celebrate(g, w, k);
        if (!msg)
            return;
        saveGame();
        refreshPrompt();
        milestone(k.avatar, `🎂 ${msg}`);
        if (state.view === 'scene') {
            setPrompt('mundi_ask', `[{{user}} is celebrating ${k.name}'s birthday. ${k.name} is now ${stageOf(k).desc}. Write the moment.]`, 0);
            sendCanned(`*celebrates ${k.name}'s birthday*`);
            setTimeout(() => setPrompt('mundi_ask', ''), 60000);
        }
        notify();
    },
    'recap-close': () => { DAY.open = false; notify(); },
    'work-cancel': () => { WORK.open = false; notify(); },
    'work-cancel-bg': (el, e) => { if (e.target === el) {
        WORK.open = false;
        notify();
    } },
    'work-go': async (el) => {
        WORK.open = false;
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const job = jobDef(w, g.player.job?.id);
        if (!job)
            return;
        const tired = tooTired(g, w, job.cost ?? {}, 'work a shift');
        if (tired) {
            toast(tired, 'warn');
            notify();
            return;
        }
        const { finishWork } = await import('./map.js');
        await finishWork(workShift(g, w, el.dataset.mode), job.name);
    },
});
// the confirmation for ending a relationship
export function endConfirmHtml() {
    const g = game();
    const r = g && END.avatar ? g.cast[END.avatar] : null;
    if (!g || !r)
        return '';
    const st = romOf(g, r.avatar).status;
    return `<div class="mu-dlg-veil is-fixed" data-act="rm-end-no"></div><div class="mu-panel mu-confirm" role="dialog"><h3>${st === 'married' ? `Divorce ${esc(r.name)}?` : `End it with ${esc(r.name)}?`}</h3>
        <p class="mu-muted">Your romance ends and your friendship takes a hit. ${esc(r.name)} will remember it.</p>
        <div class="mu-row"><button class="mu-danger" data-act="rm-end-yes">${st === 'married' ? 'Ask for a divorce' : 'End it'}</button><button data-act="rm-end-no">Cancel</button></div></div>`;
}
void bondOf;
void FRIEND_TIERS;
void ROMANCE_TIERS;
