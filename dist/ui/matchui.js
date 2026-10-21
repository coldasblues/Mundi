// Matchmaking and small conversations on screen, in a person's card: what you know of their love life, asking about
// it, introducing them to someone here, and who you are talking with (only them, or a few of the people here).
import { game, state, notify, toast, esc, saveGame } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { presentAt } from '../sim/people.js';
import { talkSet, setTalk, bondOf, guestOf, setGuest } from '../sim/social.js';
import { askLove, introduce, introChance, cannotMatch, knownLove, crushOf, leaveTogether, cutIn, CONFIDE_BOND } from '../sim/match.js';
import { talkNotice } from '../sim/presence.js';
import { hs } from '../sim/hostile.js';
import { personaName, narratorLine } from '../st/bridge.js';
import { isMinor } from '../sim/family.js';
import { pushDirective } from '../sim/hostile.js';
import { psHooks } from '../sim/pstate-live.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
export const MU = { introFor: '' };
const ctxW = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
/* ---------- who you talk with ---------- */
/** "Talk only with them", "Bring them into the conversation", "Leave them out". */
export function talkButtons(g, avatar) {
    const t = talkSet(g);
    if (!t.length)
        return `<button data-act="solo-on" data-who="${esc(avatar)}">${icon('chat')}<span>Talk only with them</span></button>`;
    if (!t.includes(avatar))
        return `<button data-act="talk-add" data-who="${esc(avatar)}">${icon('users')}<span>Bring them into the conversation</span></button>`;
    return `${t.length > 1 ? `<button data-act="talk-drop" data-who="${esc(avatar)}">${icon('x')}<span>Leave them out of it</span></button>` : ''}<button data-act="solo-off">${icon('users')}<span>Talk with everyone again</span></button>`;
}
/** Changes who you talk with, and the narrator says so ("Zack turns to talk with Mona alone"). */
export async function talkWith(list) {
    const g = game();
    if (!g)
        return;
    const before = talkSet(g);
    setTalk(g, list);
    const said = talkNotice(g, before, talkSet(g), personaName());
    if (said)
        hs(g).queue.push({ text: said, present: [], directive: '' });
    saveGame();
    const { syncScene } = await import('../sim/game.js');
    await syncScene();
    notify();
}
/**
 * Before your line goes out, while you talk with only some of the people here: may one of the others cut in? The
 * engine decides (see cutIn). If so, the narrator says they are listening in, they may speak this once, and then
 * they are on the side again.
 */
export async function maybeCutIn(line) {
    const c = ctxW();
    if (!c)
        return;
    const { g, w } = c;
    const t = talkSet(g);
    if (!t.length)
        return;
    const side = presentAt(g, w, g.player.loc).filter(r => !t.includes(r.avatar) && r.met);
    const who = cutIn(g, t, side, line);
    if (!who)
        return;
    const r = g.cast[who];
    setGuest(g, who);
    saveGame();
    const talkers = t.map(a => g.cast[a]?.name ?? '').filter(Boolean).join(' and ');
    await narratorLine(`${r.name}, nearby, is listening in.`);
    pushDirective(`[${r.name} has been listening from nearby and cuts in on {{user}}'s conversation with ${talkers}: ${r.name} speaks up this once. Then the conversation is between {{user}} and ${talkers} again.]`);
    toast(`${r.name} cuts in.`, 'info');
    const { syncScene } = await import('../sim/game.js');
    await syncScene();
}
/** In the Here row: is this person in your conversation (when it is not everyone)? */
export const inSmallTalk = (g, avatar) => { const t = talkSet(g); return t.length > 0 && t.includes(avatar); };
/* ---------- love ---------- */
const feelWord = (p) => (p >= 0.55 ? 'a good feeling' : p >= 0.3 ? 'could go either way' : 'a long shot');
export function loveButtons(g, w, avatar) {
    const r = g.cast[avatar];
    if (!r || !r.met || isMinor(g, avatar))
        return '';
    const known = knownLove(g, avatar);
    const b = bondOf(g, avatar);
    const others = presentAt(g, w, g.player.loc).filter(o => o.avatar !== avatar && o.met && !cannotMatch(g, avatar, o.avatar));
    const crush = crushOf(g, avatar);
    const picker = MU.introFor === avatar ? `<div class="mu-mm-pick">${others.length ? others.map(o => {
        const p = introChance(g, w, avatar, o.avatar);
        const guess = bondOf(g, o.avatar) >= CONFIDE_BOND ? feelWord(p) : 'you don\'t know them well';
        const heart = crush?.known && crush.avatar === o.avatar ? '<em title="Their crush">❤</em>' : '';
        return `<button class="mu-mm-who" data-act="mm-intro" data-a="${esc(avatar)}" data-b="${esc(o.avatar)}"><img src="${esc(thumb(o.avatar))}" alt=""><b data-notr>${esc(o.name)}</b>${heart}<small>${esc(guess)}</small></button>`;
    }).join('') : '<small class="mu-muted">Nobody else here to introduce them to.</small>'}</div>` : '';
    return `<div class="mu-mm">
        ${known ? `<p class="mu-mm-known">${icon('heart')}<span>${esc(known)}</span></p>` : ''}
        <button data-act="mm-ask" data-who="${esc(avatar)}" ${b >= CONFIDE_BOND ? '' : `aria-disabled="true" title="${esc(`Be friends first (${b}/${CONFIDE_BOND}).`)}"`}>${icon('heart')}<span>Ask about their love life</span></button>
        <button data-act="mm-intro-open" data-who="${esc(avatar)}" ${others.length ? '' : 'aria-disabled="true" title="Nobody else here to introduce them to."'}>${icon('users')}<span>Introduce to…</span></button>
        ${picker}</div>`;
}
let together = null;
async function sendLine(line) {
    const { sendSceneLine } = await import('./scene.js');
    await sendSceneLine(line);
}
async function ask(avatar) {
    const c = ctxW();
    if (!c || state.generating)
        return;
    const r = askLove(c.g, avatar);
    if (!r.directive) {
        if (r.text)
            toast(r.text, 'info');
        return;
    }
    if (r.text)
        toast(r.text, r.ok ? 'success' : 'info', { ms: 6000 });
    pushDirective(r.directive);
    notify();
    // a private question: only they answer (the others here keep to themselves)
    const { addUserLine, replyAs } = await import('../st/bridge.js');
    await addUserLine(r.line);
    void replyAs(avatar);
}
async function intro(a, b) {
    const c = ctxW();
    if (!c || state.generating)
        return;
    const r = introduce(c.g, c.w, a, b);
    if (typeof r === 'string') {
        toast(r, 'info');
        return;
    }
    MU.introFor = '';
    // the two of them (and you) talk; the others here stay in the background
    setTalk(c.g, [a, b]);
    saveGame();
    if (r.together)
        together = { a, b };
    pushDirective(r.directive);
    toast(`💞 ${r.text}`, r.result === 'spark' ? 'success' : r.result === 'polite' ? 'info' : 'warn', { ms: 7000 });
    const { syncScene } = await import('../sim/game.js');
    await syncScene();
    notify();
    await sendLine(r.line);
}
// the one who cut in goes back to the side once everyone has spoken
psHooks.replied.push(() => {
    const g = game();
    if (!g || !guestOf(g))
        return;
    void (async () => {
        for (let i = 0; i < 120 && state.generating; i++)
            await new Promise(r => setTimeout(r, 500));
        if (!guestOf(g))
            return;
        setGuest(g, '');
        saveGame();
        const { syncScene } = await import('../sim/game.js');
        await syncScene();
        notify();
    })();
});
// after the reply that tells it, the pair who leave together are gone from the scene
psHooks.replied.push(() => {
    const c = ctxW();
    const t = together;
    if (!c || !t)
        return;
    together = null;
    void (async () => {
        for (let i = 0; i < 120 && state.generating; i++)
            await new Promise(r => setTimeout(r, 500));
        leaveTogether(c.g, t.a, t.b);
        setTalk(c.g, []);
        const { syncScene } = await import('../sim/game.js');
        await syncScene();
        notify();
    })();
});
Object.assign(ACT, {
    'talk-add': async (el) => { const g = game(); if (!g)
        return; await talkWith([...talkSet(g), el.dataset.who]); },
    'talk-drop': async (el) => { const g = game(); if (!g)
        return; await talkWith(talkSet(g).filter(a => a !== el.dataset.who)); },
    'mm-ask': (el) => { void ask(el.dataset.who); },
    'mm-intro-open': (el) => { MU.introFor = MU.introFor === el.dataset.who ? '' : el.dataset.who; notify(); },
    'mm-intro': (el) => { void intro(el.dataset.a, el.dataset.b); },
});
