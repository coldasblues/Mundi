// Player state in a running game: reads the state block from each reply, keeps it in the message, works out the
// current state from this visit's lines and tells the model about it (see pstate.ts for the rules).
import { game, settings, saveGame, TUT, notify, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { chat, ctx, quiet, saveChat, personaName } from '../st/bridge.js';
import { visitStart } from './visits.js';
import { presentAt } from './people.js';
import { placeOf } from './places.js';
import { hm, weekday } from './time.js';
import { nameGone } from './roster.js';
import { parseBlock, stripBlock, hasBlock, fold, freshState, instructionText, checkPrompt, gateFor, GATE_DEFAULTS, type PLine, type PState, type Reported, type GateCfg } from './pstate.js';

export const PS_KEY = 'mundi_pstate';
export const ESCAPE_KEY = 'mundi_escape';

export interface PsPrefs { on: boolean; check: boolean }
export function psPrefs(): PsPrefs {
    const s = settings() as any;
    s.pstate ??= {};
    s.pstate.on ??= true;
    s.pstate.check ??= true;
    return s.pstate;
}
export const psOn = () => !TUT.save && psPrefs().on && !!game();
/** Other systems plug in here without importing this file back (the hostile actions engine). */
export const psHooks = {
    crimes: (() => false) as () => boolean,          // ask the model for a "crimes:" line
    directives: [] as (() => string)[],              // one-shot orders for the next reply (the hidden narrator reads them too)
    present: (() => []) as () => string[],           // people the engine knows are here whatever the story said (your captives)
    replied: [] as (() => void)[],                   // a reply's block was read (a hard capture moves you)
};
const replied = () => { for (const f of psHooks.replied) { try { f(); } catch (e) { console.warn('[Mundi] state hook', e); } } };

// A world can tune the rolls (world.json → "playerState": { "heldDc": 12, "restrainedDc": 16, ... }).
export const gateCfg = (w: WorldDef | null | undefined): GateCfg => ({ ...GATE_DEFAULTS, ...((w as any)?.playerState ?? {}) });

/* ---------- the lines of this visit ---------- */

const isNarrator = (m: any) => !!m?.extra?.mundi_narrator;
// What a message's block said, kept with a fingerprint of its text: SillyTavern carries a message's extras over to a
// new swipe, so a state kept for another text (another swipe, an edit) is not this text's state.
const hash = (t: string) => { let h = 5381; const s = String(t ?? ''); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
interface Kept { rep: Reported | null; h: string; src?: 'block' | 'check' }
function keptOf(m: any): Kept | undefined {
    const k = m?.extra?.mundi_ps;
    return k && typeof k === 'object' && 'h' in k && k.h === hash(m.mes) ? k as Kept : undefined;
}
function keep(m: any, rep: Reported | null, src: Kept['src']) {
    m.extra = { ...(m.extra ?? {}), mundi_ps: { rep, h: hash(m.mes), src } satisfies Kept };
    // a new reply: an ending that was waved away belonged to the old text
    if (m.extra.mundi_outcome_dismissed && m.extra.mundi_outcome_dismissed !== m.extra.mundi_ps.h) delete m.extra.mundi_outcome_dismissed;
}
const dismissedOf = (m: any) => !!m?.extra?.mundi_outcome_dismissed && m.extra.mundi_outcome_dismissed === hash(m.mes);
function lineOf(m: any): PLine {
    if (m.is_user) return { kind: 'user', ...(m.extra?.mundi_escape ? { escape: m.extra.mundi_escape } : {}), ...(m.extra?.mundi_act ? { act: m.extra.mundi_act } : {}) };
    // the hidden narrator (scenes where you are alone) fills in the block too; its other lines (an epilogue) do not count
    if (isNarrator(m)) { const k = keptOf(m); return k ? { kind: 'ai', rep: k.rep, dismissed: dismissedOf(m) } : { kind: 'other' }; }
    if (m.is_system || m.extra?.mundi) return { kind: 'other' };   // Mundi's own lines (a greeting when you meet someone)
    const k = keptOf(m);
    const rep: Reported | null = k ? k.rep : hasBlock(m.mes) ? parseBlock(m.mes, personaName()) : null;
    return { kind: 'ai', rep, dismissed: dismissedOf(m) };
}
/** The lines of this visit, with their index in the chat. `skipLast`: leave out the last reply (it is being regenerated). */
export function visitLines(g: Save, skipLast = false): { i: number; line: PLine }[] {
    const list = chat();
    const out: { i: number; line: PLine }[] = [];
    for (let i = visitStart(g); i < list.length; i++) if (list[i]) out.push({ i, line: lineOf(list[i]) });
    if (skipLast) {
        const k = out.map(x => x.line.kind).lastIndexOf('ai');
        if (k >= 0 && k === out.length - 1) out.pop();
    }
    return out;
}
export function currentState(g: Save | null = game(), skipLast = false): PState {
    if (!g || TUT.save) return freshState();
    return fold(visitLines(g, skipLast).map(x => x.line));
}
/** The chat index of the line that ended the story (or -1). */
export function outcomeLine(g: Save): number {
    const s = currentState(g); if (s.outcome === 'none') return -1;
    return visitLines(g)[s.outcomeAt]?.i ?? -1;
}

/** People the story put in the scene who are not in the world's cast (a police officer, a waiter…). */
export function walkOns(g: Save, w: WorldDef, s: PState = currentState(g), withGone = false): string[] {
    const known = Object.values(g.cast).flatMap(r => { const n = r.name.toLowerCase(); return [n, n.split(/\s+/)[0]]; });
    const me = personaName().toLowerCase();
    void w;
    const all = [...s.present];
    for (const x of psHooks.present()) if (!all.some(p => p.toLowerCase() === x.toLowerCase())) all.push(x);
    return all.filter(p => {
        const n = p.toLowerCase().replace(/^(the|a|an)\s+/, '');
        if (n === me || n === me.split(/\s+/)[0]) return false;
        return !known.some(k => k && (n === k || n.split(/\s+/)[0] === k)) && (withGone || !nameGone(g, p));
    });
}

/** Everyone the story brought in during this visit (for the recap), even the ones who left again. */
export function seenWalkOns(g: Save, w: WorldDef): string[] {
    const seen: string[] = [];
    for (const { line } of visitLines(g)) for (const n of (line.kind === 'ai' && line.rep?.present) || []) if (!seen.some(x => x.toLowerCase() === n.toLowerCase())) seen.push(n);
    return walkOns(g, w, { ...freshState(), present: seen }, true);   // the ones who died or left too
}

/* ---------- what the model is told ---------- */

let directive = '';   // a one-shot order for the next reply (how a roll to get away went)
export function setDirective(text: string) {
    directive = text;
    ctx().setExtensionPrompt(ESCAPE_KEY, text, 1, 0, false, 0);
}
export const pendingDirective = () => directive;
export function stateInstruction(g: Save, w: WorldDef, skipLast = false): string {
    const s = currentState(g, skipLast);
    return instructionText(s, walkOns(g, w, s), { crimes: psHooks.crimes() });
}
// In the chat, after the last line (depth 0), where models follow a format best.
export function refreshPState(skipLast = false) {
    const g = game(); const w = g && getWorld(g.world);
    const on = psOn() && !!w;
    ctx().setExtensionPrompt(PS_KEY, on ? stateInstruction(g!, w!, skipLast) : '', 1, 0, false, 0);
    if (!on && directive) setDirective('');
}
export const clearPState = () => { ctx().setExtensionPrompt(PS_KEY, '', 1, 0, false, 0); if (directive) setDirective(''); };

/* ---------- reading the replies ---------- */

// The message keeps what its block said; the block itself is cut out of the text (and out of its swipe).
function syncSwipe(m: any) {
    if (!Array.isArray(m.swipes) || typeof m.swipe_id !== 'number') return;
    m.swipes[m.swipe_id] = m.mes;
    if (Array.isArray(m.swipe_info) && m.swipe_info[m.swipe_id] && typeof m.swipe_info[m.swipe_id] === 'object') m.swipe_info[m.swipe_id].extra = structuredClone(m.extra ?? {});
}
/** Takes the block out of one message. Returns true when the message changed. */
export function absorb(m: any): boolean {
    if (!m || m.is_user || !hasBlock(m.mes)) return false;
    const rep = parseBlock(m.mes, personaName());
    m.mes = stripBlock(m.mes);
    keep(m, rep, 'block');
    if (m.extra.display_text) m.extra.display_text = stripBlock(m.extra.display_text);
    syncSwipe(m);
    return true;
}
const checks = new Set<number>();
export function onReply(id: number) {
    if (!psOn()) return;
    const m = chat()[id];
    if (!m || m.is_user || (m.is_system && !isNarrator(m)) || m.extra?.mundi) return;
    if (absorb(m)) {
        try { ctx().updateMessageBlock(id, m); } catch { /* not on screen */ }
        checks.delete(id);
        saveChat();
        if (keptOf(m)?.rep?.changes?.length) afterChanges();
    } else if (!keptOf(m) && !isNarrator(m)) {
        keep(m, null, 'block');
        syncSwipe(m);
        if (psPrefs().check) checks.add(id);
    }
    refreshPState();
    replied();
}
// A reply came without a block: one short AI call fills it in (only for the newest reply, after everyone spoke).
let checking = false;
export async function runChecks() {
    if (!psOn() || checking || !checks.size) return;
    const list = chat(); const last = list.length - 1;
    const ids = [...checks]; checks.clear();
    if (!ids.includes(last)) return;
    const m = list[last];
    if (!m || m.is_user || keptOf(m)?.rep !== null) return;
    const g = game(); if (!g) return;
    checking = true;
    try {
        const before = currentState(g, true);
        const me = personaName();
        const text = String(m.mes ?? '');
        const out = await quiet(checkPrompt(text, before, me), 200, 'You read one reply of a roleplay and fill in a small game-state block. Answer with the block only, nothing else.');
        const rep = parseBlock(out.includes('<state') ? out : `<state>\n${out}\n</state>`, me);
        // the reply is still the same one (not swiped or edited meanwhile)
        if (rep && chat()[last] === m && String(m.mes ?? '') === text) {
            keep(m, rep, 'check');
            syncSwipe(m); saveChat(); refreshPState(); notify(); replied();
        }
    } catch (e) { console.warn('[Mundi] state check', e); }
    checking = false;
}
// An older save (or lines written while this was off): blocks still in this visit's text are read now.
export function absorbVisit() {
    const g = game(); if (!g || !psOn()) return;
    const list = chat(); let n = 0;
    for (let i = visitStart(g); i < list.length; i++) if (absorb(list[i])) { n++; try { ctx().updateMessageBlock(i, list[i]); } catch { /* */ } }
    if (n) saveChat();
}
/** A message was edited: a block written into it is read; otherwise what it said before stays with the new text. */
export function onEdited(id: number) {
    if (!psOn()) return;
    const m = chat()[id]; if (!m || m.is_user) return;
    if (absorb(m)) { try { ctx().updateMessageBlock(id, m); } catch { /* */ } saveChat(); }
    else {
        const k = m.extra?.mundi_ps;
        if (k && typeof k === 'object' && 'h' in k && !keptOf(m)) {
            const was = m.extra.mundi_outcome_dismissed;
            keep(m, k.rep, k.src);
            if (was) m.extra.mundi_outcome_dismissed = m.extra.mundi_ps.h;
            syncSwipe(m); saveChat();
        }
    }
    refreshPState();
}
/** The narrator's line was just posted: what its block said goes with it. */
export function keepNarration(id: number, rep: Reported | null) {
    const m = chat()[id]; if (!m || !isNarrator(m)) return;
    keep(m, rep, 'block'); saveChat(); refreshPState();
    if (rep?.changes?.length) afterChanges();
    replied();
}
// Someone died, left, was taken…: who is in the scene changes now (muted in the group, gone from the picture,
// and the scene's prompt says so).
function afterChanges() { void import('./game.js').then(x => x.syncScene()).catch(() => {}); }
/** The user line that follows a roll: the engine's result goes with it. */
export function markEscape(id: number, esc: { ok: boolean; crit?: boolean }) {
    const m = chat()[id]; if (!m?.is_user) return;
    m.extra = { ...(m.extra ?? {}), mundi_escape: esc };
    saveChat(); refreshPState();
}
/** "That is not what happened": the ending in that line is ignored from now on. */
export function dismissOutcome(id: number) {
    const m = chat()[id]; if (!m) return;
    m.extra = { ...(m.extra ?? {}), mundi_outcome_dismissed: hash(m.mes) };
    syncSwipe(m); saveChat(); refreshPState(); saveGame();
}

/* ---------- the narrator (scenes where you are alone) ---------- */

/** Extra lines for the hidden narrator's prompt: the state block, and the roll's order when there is one. */
export function narratorExtra(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (!psOn() || !g || !w) return '';
    return [directive, ...psHooks.directives.map(f => f()), stateInstruction(g, w)].filter(Boolean).join('\n');
}
/** The narrator's answer, without its block, and what the block said. */
export function splitNarration(text: string): { text: string; rep: Reported | null } {
    if (!hasBlock(text)) return { text, rep: null };
    return { text: stripBlock(text), rep: parseBlock(text, personaName()) };
}

/* ---------- macros, for cards and lorebooks ---------- */

export function registerMacros() {
    const c = ctx();
    const g = () => game(); const w = () => { const s = g(); return s ? getWorld(s.world) : null; };
    const defs: [string, string, () => string][] = [
        ['mundi_place', 'Where you are now (Mundi).', () => { const s = g(), x = w(); return s && x ? (placeOf(s, x, s.player.loc)?.name ?? '') : ''; }],
        ['mundi_time', 'The game clock (Mundi).', () => { const s = g(); return s ? hm(s.minutes) : ''; }],
        ['mundi_day', 'The game day and weekday (Mundi).', () => { const s = g(); return s ? `${weekday(s.day)}, day ${s.day}` : ''; }],
        ['mundi_here', 'Everyone in the scene with you: the cast and the passers-by (Mundi).', () => { const s = g(), x = w(); if (!s || !x) return ''; return [...presentAt(s, x, s.player.loc).map(r => r.name), ...walkOns(s, x)].join(', '); }],
        ['mundi_walkons', 'People the story added to the scene who are not in the cast (Mundi).', () => { const s = g(), x = w(); return s && x ? walkOns(s, x).join(', ') : ''; }],
        ['mundi_mobility', 'free, engaged, held, restrained or incapacitated (Mundi).', () => currentState(g()).mobility],
        ['mundi_mobility_reason', 'Why you are held, restrained… (Mundi).', () => currentState(g()).reason],
        ['mundi_outcome', 'none, dead, failed or captured (Mundi).', () => currentState(g()).outcome],
        ['mundi_can_leave', '"yes" when you can walk away right now (Mundi).', () => (gateFor(currentState(g()), gateCfg(w())).kind === 'go' ? 'yes' : 'no')],
    ];
    const engine = !!c.powerUserSettings?.experimental_macro_engine && c.macros?.register;
    for (const [name, description, fn] of defs) {
        try {
            if (engine) c.macros.register(name, { handler: () => { try { return fn(); } catch { return ''; } }, category: c.macros.category?.MISC ?? 'misc', description, returns: 'text', exampleUsage: `{{${name}}}` });
            else c.registerMacro?.(name, () => { try { return fn(); } catch { return ''; } });
        } catch (e) { console.warn('[Mundi] macro', name, e); }
    }
}
