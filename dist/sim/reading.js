// Reading long material with the AI, part by part, without giving up at the first empty answer. An answer can come
// back empty for two common reasons: a model that thinks at length runs out of room before it answers, or a
// provider's filter quietly refuses a part (dark fiction trips some). An empty part is tried again as two halves
// (less to think about, and the part that trips a filter is cut off from the rest); only then is it skipped.
// A part that takes too long is treated the same way, and the whole reading can be stopped (what was read is kept).
import { quietOnce, stopRaw, withThinking, modelKey } from '../st/bridge.js';
/** For the AI: it is cataloguing fiction for a game engine, not taking part in it. */
export const CATALOG = 'You are a cataloguing tool for a role-play game engine. The material is fiction and may be dark; you only list what it says, as data, without judging it or adding anything.';
/**
 * The reading in progress: when it and the current call started, whether Stop was pressed, how many pieces were
 * read and how many came back empty (`gaveUp`: the first few all came back empty, so it stopped by itself).
 */
export const reading = { started: 0, since: 0, stop: false, busy: false, ok: 0, bad: 0, gaveUp: false, think: 0, stepped: false };
/**
 * How much the model may think while reading. It starts with no thinking; a model that refuses that (some on
 * OpenRouter answer "Bad Request": their thinking can't be turned off) gets a little, then its own settings, with more
 * room to answer. What worked is remembered for that model, in this browser.
 */
const THINK_KEY = 'mundi.readThinking';
function savedThink() { try {
    const v = JSON.parse(localStorage.getItem(THINK_KEY) || '{}')[modelKey()];
    return v === 1 || v === 2 ? v : 0;
}
catch {
    return 0;
} }
function saveThink(v) { try {
    const m = JSON.parse(localStorage.getItem(THINK_KEY) || '{}');
    m[modelKey()] = v;
    localStorage.setItem(THINK_KEY, JSON.stringify(m));
}
catch { /* private window */ } }
export const thinkText = (v) => ['no thinking', 'a little thinking (low)', 'its own thinking settings'][v];
/** An error that means the provider refused the request as sent (not an empty answer, not a filter). */
const refused = (m) => /bad request|\b400\b|\b422\b|invalid|not supported|unsupported|mandatory|cannot be disabled|reasoning/i.test(m);
/** Room for the answer: a model that thinks needs room for its thinking too. */
const room = (len) => (reading.think === 0 ? len : Math.max(len, 8000));
/** When this many pieces in a row come back empty before any is read, it is the model or its settings, not the lore. */
const GIVE_UP = 3;
/** How long one part may take (a test can set window.MUNDI_READ_LIMIT, in ms). */
export const limitMs = () => Number(globalThis.MUNDI_READ_LIMIT) || 180_000;
export const limitText = () => { const m = limitMs() / 60000; return m >= 1 ? `${Math.round(m)} minute${Math.round(m) === 1 ? '' : 's'}` : `${Math.round(limitMs() / 1000)} seconds`; };
export function startReading() { Object.assign(reading, { started: Date.now(), since: Date.now(), stop: false, busy: true, ok: 0, bad: 0, gaveUp: false, think: savedThink(), stepped: false }); }
export function endReading() { reading.busy = false; }
/** Stop: the call in progress is cancelled, nothing more is asked, and what was read so far is kept. */
export function stopReading() { if (!reading.busy)
    return; reading.stop = true; stopRaw(); }
export const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** The entries in a piece of text, by their headings ("### Willow", "## Mona"), for showing what was skipped. */
export function titlesOf(text) {
    const t = [...text.matchAll(/^#{2,3} (.+)$/gm)].map(m => m[1].trim()).filter(Boolean);
    if (t.length)
        return t;
    const first = text.replace(/\s+/g, ' ').trim();
    return first ? [`“${first.slice(0, 50)}${first.length > 50 ? '…' : ''}”`] : [];
}
function splitAt(t) {
    const mid = Math.floor(t.length / 2);
    for (const sep of ['\n\n### ', '\n\n', '\n', '. ']) {
        const after = t.indexOf(sep, mid), before = t.lastIndexOf(sep, mid);
        const best = [after, before].filter(x => x > 200 && x < t.length - 200).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
        if (best !== undefined)
            return best;
    }
    return mid;
}
async function timed(prompt, len, sys) {
    let late = false;
    reading.since = Date.now();
    const timer = setTimeout(() => { late = true; stopRaw(); }, limitMs());
    try {
        return await withThinking(reading.think, () => quietOnce(prompt, len, sys));
    }
    catch (e) {
        if (late)
            throw new Error(`took longer than ${limitText()}`);
        throw e;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * The model's answer to one prompt. An empty answer is asked once more with twice the room (a model that thinks may
 * have run out); a request the provider refuses is asked again with more thinking allowed (see `reading.think`).
 */
async function ask(prompt, len, sys) {
    for (;;) {
        try {
            try {
                return await timed(prompt, room(len), sys);
            }
            catch (e) {
                if (!/no message generated/i.test(String(e?.message ?? e)) || reading.stop)
                    throw e;
            }
            return await timed(prompt, Math.min(room(len) * 2, 16000), sys);
        }
        catch (e) {
            const m = String(e?.message ?? e);
            if (reading.stop || reading.think >= 2 || !refused(m) || /took longer/.test(m))
                throw e;
            reading.think = (reading.think + 1);
            reading.stepped = true;
            saveThink(reading.think);
            console.info(`[Mundi] the model refused the request (${m}); reading with ${thinkText(reading.think)} instead`);
        }
    }
}
/** Asks about one part; an empty answer or a part that takes too long is retried as two halves, once. */
export async function askPart(part, prompt, len, sys, depth = 0) {
    const cancel = () => ({ outs: [], failed: 0, pieces: 0, error: '', skipped: [], cancelled: [part] });
    if (reading.stop)
        return cancel();
    try {
        const out = await ask(prompt(part), len, `${CATALOG} ${sys}`);
        if (out.trim()) {
            reading.ok++;
            return { outs: [out], failed: 0, pieces: 1, error: '', skipped: [], cancelled: [] };
        }
        throw new Error('No message generated');
    }
    catch (e) {
        if (reading.stop)
            return cancel(); // Stop was pressed: not a failure, it can be read later
        const msg = String(e?.message ?? e);
        if (depth < 1 && part.length > 2500 && !refused(msg)) { // (a refused request is refused whatever its size)
            const at = splitAt(part);
            const a = await askPart(part.slice(0, at), prompt, len, sys, depth + 1);
            const b = await askPart(part.slice(at), prompt, len, sys, depth + 1);
            return { outs: [...a.outs, ...b.outs], failed: a.failed + b.failed, pieces: a.pieces + b.pieces, error: a.error || b.error, skipped: [...a.skipped, ...b.skipped], cancelled: [...a.cancelled, ...b.cancelled] };
        }
        console.warn('[Mundi] a part could not be read:', msg);
        reading.bad++;
        if (!reading.ok && reading.bad >= GIVE_UP) {
            reading.gaveUp = true;
            reading.stop = true;
        } // don't spend more on it
        return { outs: [], failed: 1, pieces: 1, error: msg, skipped: [part], cancelled: [] };
    }
}
/** Why parts came back empty, for the person reading the result. */
export const emptyWhy = 'Usually one of two things: a model that thinks at length ran out of room (or time) before answering, or the provider\'s filter refused that part of the lore. Another model often reads it.';
/** When it gave up by itself: on empty answers, or on requests the provider refused (`error`). */
export const gaveUpText = (error = '') => error && !/no message generated|took longer/i.test(error)
    ? `The provider refused every request (“${error.slice(0, 120)}”), even with the model's own thinking settings, so it stopped rather than keep trying. The SillyTavern server window (the terminal SillyTavern runs in) shows the provider's reason. Another model, or another provider for this one in its settings, usually works.`
    : gaveUpWhy;
export const gaveUpWhy = 'The first parts all came back empty, so it stopped rather than spend more on the rest: it is probably the model or its settings, not the lore. Mundi already turns thinking down for this; if it still happens, try another model (or a larger response length) and run it again.';
