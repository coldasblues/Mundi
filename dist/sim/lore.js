// Lorebooks a world uses besides its own (Globe → Lorebooks). They are switched on in SillyTavern's World Info
// while that game is open, and switched back off when you leave it (only the ones Mundi turned on).
import { game, cfg } from '../core/store.js';
import { globalLore, setGlobalLore, chatLoreExtra } from '../st/bridge.js';
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
