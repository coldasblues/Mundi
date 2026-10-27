// This Home › Dress code: for each room, the outfit people wear there (the name of an outfit folder in their
// Expressions, like "swimsuit" or "pajamas"). Someone without that outfit keeps what they wear.
import { notify, esc, saveGame, game } from '../core/store.js';
import { pins } from '../sim/places.js';
import { dressCodes } from '../sim/dress.js';
import { refreshPrompt } from '../sim/prompt.js';
import { syncScene } from '../sim/game.js';
import { outfitsOf, savedOutfits, outfitLabel } from './outfits.js';
import { INPUT } from './reg.js';
export function dressHtml(g, w) {
    const codes = dressCodes(g);
    const rooms = pins(g, w).filter(p => !p.link && !p.home);
    // the outfit names the people of this house have (for suggestions)
    const names = [...new Set(Object.keys(g.cast).flatMap(a => [...(outfitsOf(a) ?? []), ...savedOutfits(a)]).map(n => n.toLowerCase()))].sort();
    const row = (id, name) => `<label class="mu-dress-row"><b data-notr>${esc(name)}</b><input type="text" list="mu-dress-names" maxlength="40" placeholder="their usual clothes" value="${esc(codes[id] ?? '')}" data-input="dress" data-id="${esc(id)}" data-focus="dress-${esc(id)}"></label>`;
    return `<section class="mu-wc-sec"><h4>Dress code</h4>
        <p class="mu-muted">What people wear in each room: the name of an outfit folder in their Expressions (a "swimsuit" folder for the pool, "pajamas" for the bedrooms…). Anyone who has it puts it on while in that room with you, and the AI is told; anyone who doesn't keeps their clothes. Empty: their usual clothes.</p>
        <datalist id="mu-dress-names">${names.map(n => `<option value="${esc(n)}">${esc(outfitLabel(n))}</option>`).join('')}</datalist>
        <div class="mu-dress">${rooms.map(p => row(p.id, p.name)).join('')}${row('__bedrooms', 'Bedrooms')}</div></section>`;
}
Object.assign(INPUT, {
    dress: (el) => {
        const g = game();
        if (!g)
            return;
        const codes = dressCodes(g);
        const id = el.dataset.id;
        const v = el.value.trim();
        if (v)
            codes[id] = v;
        else
            delete codes[id];
        saveGame();
        refreshPrompt();
        clearTimeout(INPUT.__dressT);
        INPUT.__dressT = setTimeout(() => { void syncScene().then(notify); }, 600);
    },
});
