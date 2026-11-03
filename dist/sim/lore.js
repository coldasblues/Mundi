// Lorebooks a world uses besides its own (Globe → Lorebooks). They are switched on in SillyTavern's World Info
// while that game is open, and switched back off when you leave it (only the ones Mundi turned on).
import { game, cfg } from '../core/store.js';
import { globalLore, setGlobalLore, chatLoreExtra, chatLores, charLorebooks } from '../st/bridge.js';
let ours = []; // turned on by Mundi, so Mundi turns them off again
export async function applyGameLore() {
    const g = game();
    const want = [...(g ? cfg(g).lore ?? [] : []), ...chatLoreExtra()]; // the world's lorebooks, and the chat's extra ones
    for (const n of ours.filter(x => !want.includes(x)))
        await setGlobalLore(n, false);
    ours = ours.filter(x => want.includes(x));
    const on = globalLore();
    for (const n of want)
        if (!on.includes(n)) {
            await setGlobalLore(n, true);
            ours.push(n);
        }
}
/**
 * Lorebooks turned off in this game: a character's lorebook unticked in the new game ("Characters' lorebooks") or in
 * World settings → Lorebooks. Saves from before this was kept: every character's lorebook that is not on counts as off.
 */
export function loreOffOf(g) {
    const c = cfg(g);
    if (!Array.isArray(c.loreOff)) {
        const on = new Set([...(c.lore ?? []), ...chatLores()]);
        c.loreOff = [...new Set(Object.values(g.cast).flatMap(r => charLorebooks(r.avatar)))].filter(b => !on.has(b));
    }
    return c.loreOff;
}
/** Turns one lorebook on or off for this game (only the off list; what is switched on is World settings' job). */
export function setLoreOff(g, name, off) {
    const l = loreOffOf(g);
    const i = l.indexOf(name);
    if (off && i < 0)
        l.push(name);
    else if (!off && i >= 0)
        l.splice(i, 1);
}
/**
 * The lorebooks of this game, for Set up from the lore: the ones on in this world (the chat's and the others ticked in
 * World settings → Lorebooks) and the characters' own ones, except those turned off.
 */
export function gameLorebooks(g, w) {
    const c = cfg(g);
    const off = new Set(loreOffOf(g));
    const read = new Set([...(c.lore ?? w.lorebooks ?? []), ...chatLores()].filter(Boolean)); // ticked: always read
    const skipped = new Set();
    for (const r of Object.values(g.cast))
        for (const b of charLorebooks(r.avatar))
            if (!read.has(b))
                (off.has(b) ? skipped : read).add(b);
    return { read: [...read], off: [...skipped] };
}
