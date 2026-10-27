// Home: "Go out". Where you go (in your words), who comes with you (whoever is in the house), and a background from
// SillyTavern's; the scene out there is a free one, like a chat. "Back home" asks first, then brings you back.
import { state, notify, esc, game, saveGame, toast, nowAbs } from '../core/store.js';
import { advance, hm } from '../sim/time.js';
import { runPlans } from './plans.js';
const OUTING_MIN = 240;   // the shortest time out, in game minutes
import { getWorld, isScenario, styleOf, cssUrl } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { bgHead, bgGrid, bgHref } from './bgpick.js';
import { whereNow } from '../sim/people.js';
import { OUT } from '../sim/people.js';
import { isOuting, outingName } from '../sim/places.js';
import { startOuting, endOuting, outingOf } from '../sim/outing.js';
import { syncScene } from '../sim/game.js';
import { refreshPrompt } from '../sim/prompt.js';
import { showTransition } from './lifeui.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

export const OD = { open: false, bgOnly: false, place: '', with: [] as string[], bg: '', q: '', back: false, miss: false };
export const bgStyle = (file: string) => { const u = file ? cssUrl(bgHref(file)) : ''; return u ? `background-image:${u};background-size:cover;background-position:center` : ''; };

// Who can come: the people you know who are in the house now.
function canCome(): { avatar: string; name: string }[] {
    const g = game(); const w = g && getWorld(g.world); if (!g || !w) return [];
    return Object.values(g.cast).filter(r => r.met).filter(r => { const at = whereNow(g, w, r); return at !== OUT && !isOuting(at); }).map(r => ({ avatar: r.avatar, name: r.name }));
}

export function outingHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || !isScenario(w)) return '';
    if (OD.back) return `<div class="mu-dlg-veil" data-act="out-back-no"></div><div class="mu-panel mu-dlg mu-glassdlg mu-outback" role="dialog"><h3>Go back home?</h3>
        <p class="mu-muted">${(outingOf(g)?.with ?? []).length ? `${esc((outingOf(g)!.with).map(a => g.cast[a]?.name).filter(Boolean).join(', '))} ${outingOf(g)!.with.length === 1 ? 'comes' : 'come'} back with you.` : 'You head back to the house.'} <span>Some hours go by while you are out (4 at least).</span></p>
        <div class="mu-row mu-dlg-btns"><button data-act="out-back-no">Stay out</button><button class="mu-primary" data-act="out-back-yes">${icon('home')}<span>Back home</span></button></div></div>`;
    if (!OD.open) return '';
    const people = canCome();
    const grid = `${bgHead('out-bgq', 'outbgq', OD.q)}${bgGrid({ act: 'out-bg', q: OD.q, keep: 'outbg', sel: OD.bg, none: `<span class="mu-out-nobg">${icon('x')}</span>`, extra: 'mu-out-bgs' })}`;
    if (OD.bgOnly) return `<div class="mu-dlg-veil" data-act="out-close"></div><div class="mu-panel mu-scpick mu-glassdlg mu-outdlg" role="dialog"><header><h3>Background</h3><button class="mu-ibtn mu-ghost" data-act="out-close" aria-label="Close">${icon('x')}</button></header>${grid}
        <div class="mu-row mu-dlg-btns"><button data-act="out-close">Cancel</button><button class="mu-primary" data-act="out-bg-save">Use it</button></div></div>`;
    return `<div class="mu-dlg-veil" data-act="out-close"></div><div class="mu-panel mu-scpick mu-glassdlg mu-outdlg" role="dialog"><header><h3>${icon('map')} Go out</h3><button class="mu-ibtn mu-ghost" data-act="out-close" aria-label="Close">${icon('x')}</button></header>
        <label class="mu-field mu-out-place ${OD.miss ? 'is-missing' : ''}"><span>Where are you going?</span><input type="text" maxlength="80" data-input="out-place" data-focus="outplace" placeholder="${styleOf(w) === 'medieval' ? 'the market square, the village tavern, the riverbank…' : 'the beach, a café downtown, the cinema…'}" value="${esc(OD.place)}">${OD.miss ? '<small class="mu-miss-note">Write where you are going first.</small>' : ''}</label>
        <div class="mu-field"><span>Who comes with you</span>${people.length ? `<div class="mu-out-people">${people.map(p => `<button class="mu-chip ${OD.with.includes(p.avatar) ? 'is-on' : ''}" data-act="out-with" data-who="${esc(p.avatar)}"><img src="${esc(thumb(p.avatar))}" alt=""><span data-notr>${esc(p.name)}</span></button>`).join('')}</div>` : '<small class="mu-muted">Nobody you know is in the house right now: you go alone.</small>'}</div>
        <div class="mu-field"><span>Background</span>${grid}</div>
        <div class="mu-row mu-dlg-btns"><button data-act="out-close">Cancel</button><button class="mu-primary ${OD.place.trim() ? '' : 'is-dim'}" data-act="out-go">${icon('map')}<span>Go</span></button></div></div>`;
}

// Opens the dialog; `place` fills in where (a plan made somewhere out).
export function openGoOut(place = '') { Object.assign(OD, { open: true, bgOnly: false, place, with: [], q: '', back: false, miss: false }); OD.bg = ''; notify(); setTimeout(() => document.querySelector<HTMLInputElement>('[data-input="out-place"]')?.focus(), 40); }

Object.assign(ACT, {
    'out-open': () => openGoOut(),
    'out-close': () => { OD.open = false; notify(); },
    'out-with': (el) => { const a = el.dataset.who!; OD.with = OD.with.includes(a) ? OD.with.filter(x => x !== a) : [...OD.with, a]; notify(); },
    'out-bg': (el) => { OD.bg = el.dataset.file ?? ''; notify(); },
    'out-bg-open': () => { const g = game(); Object.assign(OD, { open: true, bgOnly: true, q: '', bg: outingOf(g)?.bg ?? '' }); notify(); },
    'out-bg-save': () => { const g = game(); const o = outingOf(g); if (o) { o.bg = OD.bg; saveGame(); } OD.open = false; notify(); },
    'out-go': async () => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const place = OD.place.trim();
        if (!place) { OD.miss = true; toast('Write where you are going first.', 'warn'); notify(); setTimeout(() => document.querySelector<HTMLInputElement>('[data-input="out-place"]')?.focus(), 30); return; }
        if (state.generating) { toast('Wait until they finish speaking.', 'info'); return; }
        // the conversation goes on out there (and back home): nothing is hidden from the AI
        startOuting(g, w, place, OD.with, OD.bg);
        OD.open = false; saveGame(); await syncScene(); refreshPrompt();
        state.view = 'scene';
        showTransition(place, OD.with.length ? `With ${OD.with.map(a => g.cast[a]?.name).filter(Boolean).join(', ')}` : 'Out of the house', 'time');
        notify();
    },
    'out-back': () => { if (state.generating) { toast('Wait until they finish speaking.', 'info'); return; } OD.back = true; notify(); },
    'out-back-no': (el, e) => { if (e && el.classList.contains('mu-dlg-veil') && e.target !== el) return; OD.back = false; notify(); },
    'out-back-yes': async () => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        OD.back = false;
        // the conversation goes on out there (and back home): nothing is hidden from the AI
        const where = outingName(g.player.loc);
        // a trip out takes a while: at least 4 hours pass from leaving to coming back
        const o = outingOf(g); const away = o ? nowAbs(g) - o.at : OUTING_MIN;
        if (away < OUTING_MIN) advance(g, w, OUTING_MIN - away).forEach(m => toast(m, 'warn'));
        endOuting(g); runPlans(); saveGame(); await syncScene(); refreshPrompt();
        state.view = 'scene';
        showTransition('Back home', `${where ? `From ${where} · ` : ''}${hm(g.minutes)}`, 'time');
        notify();
    },
});
Object.assign(INPUT, {
    'out-place': (el) => { OD.place = el.value; document.querySelector('[data-act="out-go"]')?.classList.toggle('is-dim', !el.value.trim()); if (OD.miss && el.value.trim()) { OD.miss = false; el.closest('.mu-field')?.classList.remove('is-missing'); el.parentElement?.querySelector('.mu-miss-note')?.remove(); } },
    'out-bgq': (el) => { OD.q = el.value; notify(); },
});
