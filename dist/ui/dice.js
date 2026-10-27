// The 3D die: every d20 check rolls a die in the corner of the screen (BG3-style), landing on the number the engine
// rolled, green on a success and red on a failure. Off in a world that turns the "3D dice" system off.
import { game, notify, esc } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { onRoll } from '../sim/hooks.js';
let last = null;
onRoll.push((c) => {
    const g = game();
    const w = g && getWorld(g.world);
    if (!w || !systemOn(w, 'dice'))
        return;
    last = { ...c, at: Date.now() };
    setTimeout(() => notify(), 0);
    setTimeout(() => notify(), 2600);
});
export function diceHtml() {
    if (!last || Date.now() - last.at > 2500)
        return '';
    const ok = last.grade.includes('success');
    const faces = [last.d20, 7, 13, 2, 19, 11].map((n, i) => `<i class="f${i}">${n}</i>`).join('');
    return `<div class="mu-dice ${ok ? 'is-ok' : 'is-bad'} ${last.grade.startsWith('critical') ? 'is-crit' : ''}" aria-live="polite">
        <div class="mu-dice-cube" style="--k:${last.at % 1000}">${faces}</div>
        <small>${esc(last.skill)} · ${last.d20}${last.other !== undefined ? ` (and ${last.other})` : ''} → ${last.total} vs ${last.dc}</small></div>`;
}
