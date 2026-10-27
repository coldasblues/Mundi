// Home settings (Settings › This save, in a Home game): the clock per message, whether the housemates go out, and
// for each one a job in your own words with its shift.
import { esc, notify, saveGame, cfg, game } from '../core/store.js';
import { getWorld, isScenario } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { REPLY_MINUTES, perMessage, npcOut, SHIFTS, DAYS, homeJobOf } from '../sim/hometime.js';
import { refreshPrompt } from '../sim/prompt.js';
import { INPUT } from './reg.js';
export function homeSettingsHtml(g) {
    const w = getWorld(g.world);
    if (!w || !isScenario(w))
        return '';
    const people = Object.values(g.cast);
    return `<h4>Home</h4>
        <label class="mu-check"><input type="checkbox" data-input="home-permsg" ${perMessage(g) ? 'checked' : ''}><span>Time passes with each message<small>Each message you send is ${REPLY_MINUTES} minutes. Off: time only moves with "Let time pass", sleeping and what you do.</small></span></label>
        <label class="mu-check"><input type="checkbox" data-input="home-out" ${npcOut(g) ? 'checked' : ''}><span>The housemates leave the house<small>For work, errands and nights out (off-screen), then they come back. Off: everyone stays in.</small></span></label>
        <div class="mu-homejobs">${people.map(r => {
        const j = homeJobOf(r);
        const timed = !!SHIFTS.find(s => s.id === j.shift && s.from !== undefined);
        return `<div class="mu-homejob"><img src="${esc(thumb(r.avatar))}" alt=""><b data-notr>${esc(r.name)}</b>
                <input type="text" maxlength="60" placeholder="Job (optional): nurse, barista…" value="${esc(j.name ?? '')}" data-input="home-job" data-who="${esc(r.avatar)}" data-focus="hj-${esc(r.avatar)}">
                <select data-input="home-shift" data-who="${esc(r.avatar)}">${SHIFTS.map(s => `<option value="${s.id}" ${s.id === (j.shift ?? '') ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
                ${timed ? `<select data-input="home-days" data-who="${esc(r.avatar)}">${DAYS.map(([v, l]) => `<option value="${v}" ${(j.days ?? 'weekdays') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : '<span></span>'}</div>`;
    }).join('')}</div>
        <small class="mu-muted">The job is what the AI is told they do. With a shift they are out of the house during it (when the housemates leave the house).</small>`;
}
const job = (g, who) => { const r = g.cast[who]; return r ? (r.homeJob ??= {}) : null; };
const done = (g) => { saveGame(); refreshPrompt(); notify(); };
Object.assign(INPUT, {
    'home-permsg': (el) => { const g = game(); if (!g)
        return; cfg(g).perMessage = el.checked; done(g); },
    'home-out': (el) => { const g = game(); if (!g)
        return; cfg(g).npcOut = el.checked; done(g); },
    'home-job': (el) => { const g = game(); const j = g && job(g, el.dataset.who); if (!g || !j)
        return; j.name = el.value.trim(); saveGame(); refreshPrompt(); },
    'home-shift': (el) => { const g = game(); const j = g && job(g, el.dataset.who); if (!g || !j)
        return; j.shift = el.value; done(g); },
    'home-days': (el) => { const g = game(); const j = g && job(g, el.dataset.who); if (!g || !j)
        return; j.days = el.value; done(g); },
});
