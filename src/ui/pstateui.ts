// Player state on screen: the gate on leaving (walk out, try to get away, or stuck), the state chip in the scene,
// the people the story added (walk-ons) and the end of the story (death, failure, capture).
import { game, state, notify, toast, esc, saveGame, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { currentState, walkOns, gateCfg, psOn, psPrefs, setDirective, markEscape, dismissOutcome, outcomeLine, refreshPState, keepNarration } from '../sim/pstate-live.js';
import { gateFor, MOBILITY_WORDS, type Mobility, type PState } from '../sim/pstate.js';
import { presentAt } from '../sim/people.js';
import { bonusFor, chanceOf, gradeName, type Grade } from '../sim/dice.js';
import { feel } from '../sim/life.js';
import { loseBond } from '../sim/social.js';
import { note, placeName } from '../sim/facts.js';
import { chat, personaName, quiet, narratorLine, saveChat } from '../st/bridge.js';
import { sceneText } from '../sim/prompt.js';
import { visitStart } from '../sim/visits.js';
import type { ActionDef } from '../core/world.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

type Modal =
    | { kind: 'walkout'; names: string[]; go: () => void }
    | { kind: 'roll'; loc: string; dc: number; chance: number; mobility: Mobility; reason: string };
export const PSUI = {
    modal: null as Modal | null,
    escape: null as { ok: boolean; crit?: boolean } | null,   // the roll waiting for its user line
    gotAwayTo: '',                                            // where you were heading when you got away
    endClosed: '',                                            // the ending card was put aside (for this ending)
    writing: false,
};
let armed = 0;   // a roll's order waits for the reply that tells it
let pass = false;   // the next check lets you through (you already chose to walk out)
/** The next `allow` says yes: for a choice already made in the walk-out dialog. */
export const passOnce = () => { pass = true; };

const LABEL: Record<Mobility, string> = { free: 'Free', engaged: 'In the middle of something', held: 'Held here', restrained: 'Restrained', incapacitated: 'Can\'t move' };
const ICON: Record<Mobility, string> = { free: 'check', engaged: 'chat', held: 'hand', restrained: 'lock', incapacitated: 'x' };
const ctxW = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };

// The people you would walk out on: the cast here that you know, and the passers-by.
function company(g: Save, w: WorldDef, s: PState) {
    const cast = presentAt(g, w, g.player.loc).filter(r => r.met);
    return { cast, names: [...cast.map(r => r.name), ...walkOns(g, w, s)] };
}
// A roll to get away, as an action: talking or slipping away when held, strength and skill when restrained.
const escapeAction = (dc: number, traits: string[]) => ({ id: 'escape', name: 'Get away', label: 'get away', minutes: 0, cost: 0, roll: { dc, traits, success: { text: '' }, fail: { text: '' } } } as unknown as ActionDef);

export type GateKind = 'travel' | 'sleep' | 'work' | 'skip' | 'do';
/** May you do this now? When not, it explains why, or opens the choice (walk out, try to get away) and returns false. */
export function allow(kind: GateKind, go: () => void, loc = ''): boolean {
    const c = ctxW();
    if (pass) { pass = false; return true; }
    if (!c || !psOn()) return true;
    const { g, w } = c;
    const s = currentState(g);
    const gt = gateFor(s, gateCfg(w));
    if (gt.kind === 'over') { PSUI.endClosed = ''; toast('The story has ended. Keep playing from the ending card, or load a save.', 'info'); notify(); return false; }
    const why = s.reason || MOBILITY_WORDS[s.mobility];
    if (kind === 'do') {
        if (s.mobility === 'restrained' || s.mobility === 'incapacitated') { toast(`Not now: ${why}.`, 'warn'); return false; }
        return true;
    }
    if (gt.kind === 'go') return true;
    if (gt.kind === 'walkout') {
        const { names } = company(g, w, s);
        if (!names.length) return true;
        PSUI.modal = { kind: 'walkout', names, go }; notify();
        return false;
    }
    if (gt.kind === 'blocked') { toast(`You can't leave: ${gt.why}.`, 'warn'); return false; }
    if (kind !== 'travel') { toast(`Not now: ${why}. Open the map to try to get away first.`, 'warn'); return false; }
    PSUI.modal = { kind: 'roll', loc, dc: gt.dc, chance: chanceOf(g, escapeAction(gt.dc, gt.traits)), mobility: s.mobility, reason: why };
    notify();
    return false;
}

function walkOut() {
    const c = ctxW(); const m = PSUI.modal;
    if (!c || m?.kind !== 'walkout') return;
    const { g, w } = c;
    const s = currentState(g);
    const { cast } = company(g, w, s);
    // who actually spoke with you in this visit takes it hardest
    const list = chat(); const from = visitStart(g);
    const spoke = new Set(list.slice(from).filter(x => !x.is_user && !x.is_system).map(x => String(x.name ?? '')));
    for (const r of cast) {
        const hurt = spoke.has(r.name);
        feel(g, r.avatar, 'upset: you walked out on them mid-conversation', hurt ? 1 : 0.5);
        loseBond(g, r.avatar, hurt ? 4 : 2);
    }
    if (m.names.length) note(g, '{u} walked out on {0} at {1}.', [m.names.join(', '), placeName(g, w, g.player.loc)], cast.map(r => r.avatar), g.player.loc, 'visit');
    saveGame();
    PSUI.modal = null;
    m.go();
}

async function tryEscape() {
    const c = ctxW(); const m = PSUI.modal;
    if (!c || m?.kind !== 'roll') return;
    const { g, w } = c;
    PSUI.modal = null;
    const s = currentState(g);
    const gt = gateFor(s, gateCfg(w));
    if (gt.kind !== 'roll') { notify(); return; }
    const a = escapeAction(gt.dc, gt.traits);
    const d20 = 1 + Math.floor(Math.random() * 20);
    const bonus = bonusFor(g, a);
    const grade: Grade = d20 === 1 ? 'critical-fail' : d20 === 20 ? 'critical-success' : d20 + bonus >= gt.dc ? 'success' : 'fail';
    const ok = grade === 'success' || grade === 'critical-success';
    const crit = grade === 'critical-fail';
    const why = s.reason || MOBILITY_WORDS[s.mobility];
    note(g, ok ? '{u} got away ({0}).' : '{u} tried to get away ({0}) but was stopped.', [why], [], g.player.loc, 'skill');
    saveGame();
    const verdict = `The game rolled for {{user}}'s attempt to get away (${why}): ${gradeName(grade).toUpperCase()}.`;
    setDirective(ok
        ? `[${verdict} In this reply {{user}} gets away: nobody manages to stop them, and the reply ends as {{user}} leaves. In the state block, mobility: free.]`
        : `[${verdict} {{user}} does not get away: show how they are stopped${crit ? ', and it makes things worse: {{user}} ends up physically restrained' : ''}. {{user}} stays here. In the state block, mobility: ${crit ? 'restrained' : s.mobility} (or worse).]`);
    armed = Date.now();
    PSUI.escape = { ok, crit };
    PSUI.gotAwayTo = ok ? m.loc : '';
    const sum = `🎲 ${d20}${bonus ? ` ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)}` : ''} vs ${gt.dc}`;
    toast(`${sum} · ${gradeName(grade)}: ${ok ? 'you get away.' : crit ? 'they stop you, and it gets worse.' : 'they stop you.'}`, ok ? 'success' : 'warn', { ms: 6000 });
    state.view = 'scene';   // the story tells how it went, in the scene you tried to leave
    notify();
    const { sendSceneLine } = await import('./scene.js');
    await sendSceneLine('*tries to get away*');
}

/* ---------- following SillyTavern ---------- */

/** Your line was sent: the roll it answers goes with it. */
export function onSent(id: number) {
    if (!PSUI.escape) return;
    markEscape(id, PSUI.escape);
    PSUI.escape = null;
}
/** A reply came in: a roll's order was for this reply only. */
export function onAnswered() {
    if (!armed) return;
    armed = 0;
    setDirective('');
}
// an order nobody answered (the reply failed) is dropped after a while
setInterval(() => { if (armed && Date.now() - armed > 180000) { armed = 0; setDirective(''); } }, 30000);

/** The hidden narrator's reply (scenes where you are alone): its block goes with the line it posted. */
export function afterNarration(rep: any) {
    const list = chat();
    for (let i = list.length - 1; i >= 0 && i > list.length - 4; i--) if (list[i]?.extra?.mundi_narrator) { keepNarration(i, rep); break; }
    onAnswered();
}

/* ---------- the end of the story ---------- */

const ENDING: Record<string, [string, string]> = { dead: ['You died', 'skull'], failed: ['You failed', 'x'], captured: ['You were captured', 'lock'] };
const endKey = (g: Save) => `${outcomeLine(g)}:${chat().length > 0 ? visitStart(g) : 0}`;
export const storyOver = (g: Save | null = game()) => !!g && psOn() && currentState(g).outcome !== 'none';

async function writeEpilogue() {
    const c = ctxW(); if (!c || PSUI.writing) return;
    const { g } = c;
    const s = currentState(g); if (s.outcome === 'none') return;
    PSUI.writing = true; notify();
    try {
        const me = personaName();
        const verb = { dead: 'died', failed: 'failed for good', captured: 'was captured for good', none: '' }[s.outcome];
        const recent = chat().slice(-10).filter((m: any) => !m.is_system || m.extra?.mundi_narrator)
            .map((m: any) => `${m.is_user ? me : m.extra?.mundi_narrator ? 'Narrator' : m.name}: ${String(m.mes ?? '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
        const out = await quiet(`${sceneText().replace(/\{\{user\}\}/g, me)}\n\n${recent}\n\nThe story is over: ${me} ${verb}${s.outcomeReason ? ` (${s.outcomeReason})` : ''}. Write a short epilogue in 2 to 4 short paragraphs, in the second person ("you"): the aftermath, and how the world and the people ${me} knew go on. Do not undo the ending and do not continue the scene. No state block.`, 700,
            'You are the narrator, writing the closing epilogue of a story.');
        const text = out.replace(/<\s*state\s*>[\s\S]*$/i, '').trim();
        if (text) {
            await narratorLine(text);
            const list = chat(); const last = list[list.length - 1];
            if (last?.extra?.mundi_narrator) { last.extra.mundi_epilogue = true; saveChat(); }
            (g as any).pstateEnd = { key: endKey(g), epilogue: true };
            note(g, `{u} ${verb}.`, [], [], g.player.loc, 'goal');
            saveGame();
        } else toast('No epilogue came back (is the AI connected?).', 'warn');
    } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    PSUI.writing = false; notify();
}

export function endCardHtml(g: Save, w: WorldDef): string {
    if (!psOn() || state.view !== 'scene') return '';
    const s = currentState(g);
    if (s.outcome === 'none') return '';
    void w;
    const key = endKey(g);
    const [title, ic] = ENDING[s.outcome] ?? ['The end', 'x'];
    if (PSUI.endClosed === key) return '';
    const done = (g as any).pstateEnd?.key === key && (g as any).pstateEnd?.epilogue;
    return `<div class="mu-dlg-veil is-fixed mu-ps-veil"></div><div class="mu-panel mu-confirm mu-ps-end is-${s.outcome}" role="dialog" aria-label="${esc(title)}">
        <div class="mu-ps-end-ic">${icon(ic)}</div><h3>${esc(title)}</h3>
        ${s.outcomeReason ? `<p>${esc(s.outcomeReason)}</p>` : ''}
        <p class="mu-muted">The story says it ends here. ${done ? 'The epilogue is in the scene.' : 'You can have the narrator write the epilogue, or, if the story got it wrong, take it back and keep playing.'}</p>
        <div class="mu-row mu-ps-end-btns">
            ${done ? '' : `<button class="mu-primary" data-act="ps-epilogue" ${PSUI.writing ? 'disabled' : ''}>${PSUI.writing ? 'Writing…' : 'Write the epilogue'}</button>`}
            <button data-act="ps-not-so">That's not what happened</button>
            <button data-act="ps-end-load">Load a save</button>
            <button class="mu-ghost" data-act="ps-end-close">Look at the scene</button>
        </div></div>`;
}
/** Where the message box was: the story has ended. */
export function endedComposerHtml(): string {
    return `<div class="mu-ps-over">${icon('skull')}<span>The story has ended.</span><button class="mu-primary" data-act="ps-end-open">Options</button></div>`;
}

/* ---------- on screen ---------- */

export function gateModalHtml(): string {
    const m = PSUI.modal; const c = ctxW();
    if (!m || !c) return '';
    if (m.kind === 'walkout') {
        return `<div class="mu-dlg-veil is-fixed" data-act="ps-cancel"></div><div class="mu-panel mu-confirm" role="dialog"><h3>Walk out on ${esc(m.names.join(', '))}?</h3>
            <p class="mu-muted">You're in the middle of something. Leaving now is rude: they'll be upset for a while, and it costs you some of their friendship.</p>
            <div class="mu-row"><button class="mu-danger" data-act="ps-walkout">Walk out</button><button data-act="ps-cancel">Stay</button></div></div>`;
    }
    const verb = m.mobility === 'held' ? 'You\'re being held here' : 'You\'re restrained';
    return `<div class="mu-dlg-veil is-fixed" data-act="ps-cancel"></div><div class="mu-panel mu-confirm" role="dialog"><h3>${verb}</h3>
        <p>${esc(m.reason)}</p>
        <p class="mu-muted">You can try to get away. The game rolls a d20 (difficulty ${m.dc}${m.mobility === 'held' ? ', helped by charm, wits and nerve' : ', helped by strength and skill'}); the story then tells how it went. If it fails, you'll have to wait before trying again${m.mobility === 'held' ? ', and a very bad roll makes things worse' : ''}.</p>
        <div class="mu-row"><button class="mu-primary" data-act="ps-try">🎲 Try to get away · ${m.chance}%</button><button data-act="ps-cancel">Stay</button></div></div>`;
}

/** The small card under the clock: your situation, when it is not "free", and the way out after a good roll. */
export function stateChipHtml(g: Save, w: WorldDef): string {
    if (!psOn() || state.view !== 'scene') return '';
    const s = currentState(g);
    if (s.outcome !== 'none') return `<div class="mh-pstate mh-glass is-over"><button class="mh-ps-go" data-act="ps-end-open">${icon('skull')}<span>The story has ended</span></button></div>`;
    if (PSUI.gotAwayTo && s.mobility === 'free' && PSUI.gotAwayTo !== g.player.loc) {
        return `<div class="mh-pstate mh-glass is-free"><button class="mh-ps-go" data-act="ps-continue">${icon('door')}<span>You got away · go to ${esc(placeName(g, w, PSUI.gotAwayTo))}</span></button></div>`;
    }
    if (s.mobility === 'free') return '';
    const gt = gateFor(s, gateCfg(w));
    const hint = gt.kind === 'walkout' ? 'You can leave, but it would be rude.' : gt.kind === 'roll' ? 'Leaving takes a roll: open the map and pick where to go.' : gt.kind === 'blocked' ? `You can't leave: ${gt.why}.` : '';
    return `<div class="mh-pstate mh-glass is-${s.mobility}" title="${esc(hint)}">${icon(ICON[s.mobility])}<b>${esc(LABEL[s.mobility])}</b>${s.reason ? `<small>${esc(s.reason)}</small>` : ''}</div>`;
}

/** Walk-ons in the "Here" row: a face for each person the story brought in. */
export function walkOnChips(g: Save, w: WorldDef): string {
    if (!psOn()) return '';
    return walkOns(g, w).map(n => `<span class="mh-here-p is-walkon" title="${esc(n)}: not a regular, the story brought them in"><span class="mh-walkon-pic">${icon('user')}</span><b data-notr>${esc(n)}</b></span>`).join('');
}
/** For the map: the passers-by where you are. */
export const walkOnsHere = (g: Save, w: WorldDef, loc: string) => (psOn() && loc === g.player.loc ? walkOns(g, w) : []);

/** Everything this file draws over the HUD. */
export function pstateOverlays(g: Save, w: WorldDef) { return `${stateChipHtml(g, w)}${gateModalHtml()}${endCardHtml(g, w)}`; }

Object.assign(ACT, {
    'ps-cancel': () => { PSUI.modal = null; notify(); },
    'ps-walkout': () => walkOut(),
    'ps-try': () => { void tryEscape(); },
    'ps-continue': async () => {
        const to = PSUI.gotAwayTo; PSUI.gotAwayTo = '';
        if (!to) return;
        const { travelTo } = await import('./map.js');
        await travelTo(to);
        state.view = 'scene'; notify();
    },
    'ps-epilogue': () => { void writeEpilogue(); },
    'ps-not-so': () => {
        const g = game(); if (!g) return;
        const at = outcomeLine(g);
        if (at >= 0) dismissOutcome(at);
        PSUI.endClosed = '';
        toast('Taken back: the story goes on.', 'success');
        notify();
    },
    'ps-end-load': () => { state.view = 'load'; notify(); },
    'ps-end-close': () => { const g = game(); if (g) PSUI.endClosed = endKey(g); notify(); },
    'ps-end-open': () => { PSUI.endClosed = ''; notify(); },
});
Object.assign(INPUT, {
    'set-ps-on': (el) => { psPrefs().on = (el as HTMLInputElement).checked; void import('../core/store.js').then(m => m.saveSettings()); refreshPState(); notify(); },
    'set-ps-check': (el) => { psPrefs().check = (el as HTMLInputElement).checked; void import('../core/store.js').then(m => m.saveSettings()); },
});
/** The settings block (Settings → Game). */
export function pstateSettingsHtml() {
    const p = psPrefs();
    return `<section><h3>Player state</h3>
        <label class="mu-check"><input type="checkbox" data-input="set-ps-on" ${p.on ? 'checked' : ''}><span>Track your situation<small>Each reply ends with a small hidden block (free, in a conversation, held, restrained, can't move; who is here; whether the story ended). The game uses it to decide when you can walk away, to show the people the story brought in, and to end the story when you die or fail.</small></span></label>
        <label class="mu-check"><input type="checkbox" data-input="set-ps-check" ${p.check ? 'checked' : ''} ${p.on ? '' : 'disabled'}><span>Fill in a missing block<small>When a reply comes without the block, one short extra AI call reads the reply and fills it in.</small></span></label></section>`;
}
