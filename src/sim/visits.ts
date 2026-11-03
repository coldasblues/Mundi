// Visits: each stay at a place is its own scene. When you leave (or sleep), the lines of that visit are hidden
// from the AI with SillyTavern's own "hide" (they stay in the chat, readable in SillyTavern), so the next scene starts
// clean. What carries over: the engine's facts, and the scene's notes, a few sentences the AI writes on how things
// stand at the end (what has to stay true: someone's size, clothes, injuries, who is carrying or holding whom). When
// the scene goes on somewhere else (someone takes you, or comes with you), its last lines stay in view too.
import { settings, saveGame, game, TUT, type Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { chat, hideMessages, setPrompt, personaName } from '../st/bridge.js';
import { note, placeName } from './facts.js';
import { stripBlock } from './pstate.js';

/** A scene's notes: how things stood when it ended. `at`: where the scene after it starts in the chat. */
export interface Recap { day: number; minutes: number; place: string; who: string[]; text: string; at?: number }
/** How many of a scene's last lines stay in view when it goes on somewhere else. */
const BRIDGE = 4;
/** Writing the notes of the scene you just left (the next reply waits for it, a little). */
let pending: Promise<void> | null = null;
export const sceneMemoryOn = () => (settings() as any).sceneMemory !== false;
// Where this visit starts in the chat. A mark past the end (lines deleted, or an old copied save) falls back to just
// after the last hidden line, so the scene still shows what was said in it.
export const visitStart = (g: Save) => {
    const list = chat(); const v = (g as any).visitStart ?? 0;
    if (v <= list.length) return v;
    let i = list.length; while (i > 0 && !list[i - 1]?.is_system) i--;
    return i;
};
export const recaps = (g: Save): Recap[] => ((g as any).recaps ??= []);

export async function endVisit(g: Save, w: WorldDef, opts: { carry?: boolean } = {}) {
    // the people the story brought in (player state) are remembered too, before the visit closes
    let extras: string[] = [];
    try {
        const ps = await import('./pstate-live.js');
        if (ps.psOn()) {
            extras = ps.seenWalkOns(g, w);
            // the roster: who was part of this visit, and what happened to them (before the lines are hidden)
            const spoke = new Set(chat().slice(visitStart(g)).filter(m => !m.is_user && !m.is_system).map(m => String(m.name ?? '')));
            const who = Object.values(g.cast).filter(r => spoke.has(r.name)).map(r => ({ name: r.name }));
            (await import('./roster.js')).endVisitRoster(g, w, who, extras);
            (await import('./hostile.js')).endVisitHostile(g, w);   // crimes the story reported, captives it freed
        }
    } catch (e) { console.warn('[Mundi] roster', e); }
    const list = chat();
    const start = visitStart(g), end = list.length - 1;
    (g as any).visitStart = list.length;
    setPrompt('mundi_roll', '');
    // the last lines of the scene before this one were kept in view for this one: now they go too
    const br = (g as any).bridge; delete (g as any).bridge;
    if (Array.isArray(br) && br[0] <= br[1] && br[1] < start) await hideMessages(br[0], br[1]);
    const lines = list.slice(start).filter(m => !m.is_system && String(m.mes ?? '').trim());
    if (!lines.length) return;
    // a scene that goes on somewhere else: its last few lines stay in view in the next one
    let cut = end + 1;
    if (opts.carry) { cut = start; let k = 0; for (let i = end; i >= start; i--) if (!list[i]?.is_system && ++k === BRIDGE) { cut = i; break; } }
    if (cut > start) await hideMessages(start, cut - 1);
    if (cut <= end) (g as any).bridge = [cut, end];
    // what is kept is a fact, written by the engine (no AI summary): who you spent time with, and where
    const talked = new Set(lines.filter(m => !m.is_user && !m.extra?.mundi_narrator).map(m => String(m.name ?? '')));
    const who = Object.values(g.cast).filter(r => talked.has(r.name));
    if (who.length) note(g, '{u} spent time with {0} at {1}.', [who.map(r => r.name).join(', '), placeName(g, w, g.player.loc)], who.map(r => r.avatar), g.player.loc, 'visit');
    if (extras.length) note(g, '{u} ran into {0} at {1}.', [extras.join(', '), placeName(g, w, g.player.loc)], [], g.player.loc, 'visit');
    if (sceneMemoryOn() && !TUT.save) pending = rememberScene(g, w, lines, placeName(g, w, g.player.loc), [...who.map(r => r.name), ...extras], list.length, start).finally(() => { pending = null; });
}

/** The AI writes the scene's notes: how things stand at its end. One short call; nothing happens if it fails. */
async function rememberScene(g: Save, w: WorldDef, lines: any[], place: string, who: string[], at: number, start: number) {
    void w;
    const me = personaName() || 'the player';
    const text = lines.slice(-30).map(m => `${m.is_user ? me : m.extra?.mundi_narrator ? 'Narrator' : m.name}: ${stripBlock(String(m.mes ?? '')).replace(/\s+/g, ' ').trim()}`)
        .filter(l => !/:\s*$/.test(l)).join('\n').slice(-6000);
    if (!text) return;
    try {
        const { askShort } = await import('./reading.js');
        const before = recaps(g).filter(r => r.text).at(-1);
        const prev = before && before.at === start ? before.text : '';   // the notes this scene began with
        const out = (await askShort(`${prev ? `How things stood when this scene began:\n${prev}\n\n` : ''}The scene that just ended, at ${place}${who.length ? `, with ${who.join(', ')}` : ''}:
"""
${text}
"""

In 2 to 4 short sentences, write how things stand at the END of this scene, for whoever writes the next one. Say what has to stay true about ${me} and the others: their body (size or shape, clothes, injuries), their mind (under someone's influence or control: charmed, entranced, compelled, possessed, confused, seeing things; what they were made to believe, feel, forget or do), who is holding, carrying, keeping or leading whom, and where they are going and why. ${prev ? 'Keep what is still true from before this scene; leave out only what this scene ended. ' : ''}Then anything left unresolved. Plain statements in the present tense, about ${me} by name. No heading, no list, nothing else.`, 400,
            'You keep the continuity notes of a role-play story. The story is fiction and may be dark; you only note what is true at the end of the scene, as plain facts, without judging it or adding anything.'))
            .replace(/<\s*state\s*>[\s\S]*$/i, '').replace(/^\s*(notes?|summary|continuity)\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
        if (!out || game() !== g) return;
        const list = recaps(g);
        list.push({ day: g.day, minutes: g.minutes, place, who, text: out.slice(0, 900), at });
        if (list.length > 8) list.splice(0, list.length - 8);
        saveGame();
        (await import('./prompt.js')).refreshPrompt();
    } catch (e) { console.warn('[Mundi] scene notes', e); }
}
/** Before the next reply: the notes of the scene you just left, if they are still being written (at most 20 s). */
export async function sceneNotesReady() {
    if (pending) await Promise.race([pending, new Promise(r => setTimeout(r, 20000))]);
}

// For the world prompt: the notes of the scene just before this one (only while this scene is the one after it).
export function recapLines(g: Save): string[] {
    if (!sceneMemoryOn()) return [];
    const last = recaps(g).filter(r => r.text).at(-1);
    if (!last || last.at !== (g as any).visitStart) return [];
    return [`Just before this scene (at ${last.place}): ${last.text} Unless this scene says otherwise, that is all still true.`];
}
