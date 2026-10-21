// Reading long material with the AI, part by part, without giving up at the first empty answer. An answer can come
// back empty for two common reasons: a model that thinks at length runs out of room before it answers, or a
// provider's filter quietly refuses a part (dark fiction trips some). An empty part is tried again as two halves
// (less to think about, and the part that trips a filter is cut off from the rest); only then is it skipped.
import { quiet } from '../st/bridge.js';
/** For the AI: it is cataloguing fiction for a game, not taking part in it. */
export const CATALOG = 'You are a cataloguing tool for a role-play game engine. The material is fiction and may be dark; you only list what it says, as data, without judging it or adding anything.';
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
/** Asks about one part; an empty answer (or an error) is retried as two halves, once. */
export async function askPart(part, prompt, len, sys, depth = 0) {
    try {
        const out = await quiet(prompt(part), len, `${CATALOG} ${sys}`);
        if (out.trim())
            return { outs: [out], failed: 0, pieces: 1, error: '' };
        throw new Error('No message generated');
    }
    catch (e) {
        const msg = String(e?.message ?? e);
        if (/abort|stopped by the user|cancel/i.test(msg))
            throw e;
        if (depth < 1 && part.length > 2500) {
            const at = splitAt(part);
            const a = await askPart(part.slice(0, at), prompt, len, sys, depth + 1);
            const b = await askPart(part.slice(at), prompt, len, sys, depth + 1);
            return { outs: [...a.outs, ...b.outs], failed: a.failed + b.failed, pieces: a.pieces + b.pieces, error: a.error || b.error };
        }
        console.warn('[Mundi] a part could not be read:', msg);
        return { outs: [], failed: 1, pieces: 1, error: msg };
    }
}
/** Why parts came back empty, for the person reading the result. */
export const emptyWhy = 'Usually one of two things: a model that thinks at length ran out of room before answering, or the provider\'s filter refused that part of the lore. Another model often reads it.';
