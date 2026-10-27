// State in three layers:
//  - settings(): Mundi's own settings, saved by SillyTavern (interface preferences, the list of games);
//  - game(): the current save, stored INSIDE the open group chat's metadata (the save is the chat itself);
//  - state: this session only (open screens, selection, drafts), never saved.
import { ctx } from '../st/bridge.js';
export const EXT = 'mundi';
export const ROOT_ID = 'mundi-root';
// Phones: 'port' (upright: the HUD stacks in rows over the dialogue box), 'land' (sideways: the HUD on the left half, the dialogue box on the right), '' (a computer).
export function deviceMode() {
    const mq = (q) => !!globalThis.matchMedia?.(q).matches;
    if (mq('(max-width: 760px)'))
        return 'port';
    if (mq('(pointer: coarse) and (max-height: 520px)'))
        return 'land';
    return '';
}
// Mundi's screen is zoomed by the Overall scale: what the browser measures (mouse, getBoundingClientRect) is on the
// screen, while positions set inside Mundi are before the zoom. Divide screen pixels by this to place things inside.
export function uiZoom() {
    const m = document.getElementById('mundi-main');
    const z = m && m.offsetWidth ? m.getBoundingClientRect().width / m.offsetWidth : 1;
    return z > 0.2 && z < 5 ? z : 1;
}
export const onPhone = () => !!document.getElementById(ROOT_ID)?.dataset.mobile;
const UI_DEFAULTS = {
    theme: 'dark', scale: 100, sceneText: 100, sound: true, volume: 50, music: true, musicVolume: 35,
    hudAutoHide: false, dialogOpacity: 80, accent: 'blue', layout: 'vn', vn: 'box',
    dialogPos: 'center', spriteSize: 100, spriteW: 100, spriteY: 0, cardMode: true, font: 'default', avatarShape: 'rect', imgLayout: 'left', dialogBlur: 12, dateFormat: 'DD/MM/YYYY', timeFormat: '24',
    scalePhone: 85, scaleLand: 80, hudPhone: 85, hudLand: 80,
};
let ready = null;
export function settings() {
    const all = ctx().extensionSettings;
    const s = (all[EXT] ??= {});
    if (ready === s)
        return s;
    s.lang ??= 'en';
    s.openOnStart ??= false;
    s.ui ??= { ...UI_DEFAULTS };
    for (const [k, v] of Object.entries(UI_DEFAULTS))
        s.ui[k] ??= v;
    s.games ??= [];
    s.lastGame ??= null;
    s.last ??= s.lastGame ? { kind: 'world', group: s.lastGame } : null;
    s.lib ??= { view: 'list', fav: {}, folders: {} };
    s.lib.fav ??= {};
    s.lib.folders ??= {};
    s.lib.view ??= 'list';
    ready = s;
    return s;
}
export const UI = () => settings().ui;
export const saveSettings = () => ctx().saveSettingsDebounced();
export const cfg = (g) => (g.cfg ??= {});
// How time passes: "action" (default) only what you do moves the clock (eating, sleeping, working, travelling);
// "live" the clock also runs by itself in real time (World → Rules).
export const clockMode = (g) => cfg(g).clock ?? 'action';
// The tutorial's practice world: a save kept only in memory (no chat, no group, nothing written to SillyTavern).
export const TUT = { save: null };
// Save safety (core/saves.ts): the first time a save is seen it is checked once (migrated to the current format,
// backed up first, and its links to the world repaired). A save from a newer Mundi is never written: the game plays
// a detached copy of it (`SAVE.shadow`), so nothing, not even SillyTavern saving the chat, can overwrite the original.
export const SAVE = {
    hooks: [],
    seen: new WeakSet(),
    shadow: new WeakMap(),
    readOnly: false,
};
export function game() {
    if (TUT.save)
        return TUT.save;
    const m = ctx().chatMetadata;
    const g = m?.mundi?.v === 1 ? m.mundi : null;
    if (!g)
        return null;
    if (!SAVE.seen.has(g)) {
        SAVE.seen.add(g);
        SAVE.readOnly = false;
        for (const h of SAVE.hooks)
            h(g);
    }
    return SAVE.shadow.get(g) ?? g;
}
export function setGame(s) { ctx().chatMetadata.mundi = s; }
// Things that follow every save of the game (the Load screen's card of this save).
const savedHooks = [];
export const onSaved = (fn) => { savedHooks.push(fn); };
export const saveGame = () => {
    if (TUT.save || SAVE.readOnly)
        return;
    ctx().saveMetadataDebounced();
    for (const f of savedHooks) {
        try {
            f();
        }
        catch (e) {
            console.warn('[Mundi] after save', e);
        }
    }
};
export const nowAbs = (g) => g.day * 1440 + g.minutes;
export const state = {
    open: false,
    view: 'menu',
    menuTab: 'main',
    settingsTab: 'game',
    sel: null, // place selected on the map
    busy: '', // a message while something slow happens ('' = idle)
    generating: false,
    wizard: null, // new game wizard data
    modal: null,
    sprites: {},
    composer: '',
    impersonating: false,
    backTo: 'menu',
    mapView: { z: 1, x: 0, y: 0 },
    saves: null, // load screen cache
    lib: {
        tab: 'characters', scope: '', q: '', sel: null, entry: null,
        edit: false, adv: false, draft: {}, lore: null,
        picked: [], anchor: null, picking: false, folder: null, favOnly: false,
        searching: false, expr: null, sprites: null, bgs: null,
    },
    gal: { albums: null, album: null, photo: null }, // gallery screen
};
/* ---------- drawing ---------- */
let renderFn = null;
let queued = false;
export const onRender = (fn) => { renderFn = fn; };
export function notify() {
    if (queued)
        return;
    queued = true;
    const run = () => { if (!queued)
        return; queued = false; renderFn?.(); };
    requestAnimationFrame(run);
    setTimeout(run, 120); // the tab may be in the background, where animation frames stop
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
export const asset = (f) => new URL(`../../assets/${f}`, import.meta.url).href;
export function toast(msg, kind = 'info', o = {}) {
    const host = document.getElementById('mundi-toasts');
    if (!host) {
        console.log('[Mundi]', msg);
        return;
    }
    const el = document.createElement('div');
    el.className = `mu-toast is-${kind} ${o.source ? 'is-ext' : ''}`;
    if (o.source) {
        // a message from SillyTavern itself (or one of its extensions): shown as it is, never translated by Mundi
        el.innerHTML = `<small class="mu-toast-src">(${esc(o.source)})</small>${o.title ? `<b data-notr>${esc(o.title)}</b>` : ''}<span data-notr>${esc(msg)}</span>`;
    }
    else
        el.textContent = msg;
    // a close button that shows when the mouse is over it; while the mouse is over it, it does not go away
    const x = document.createElement('button');
    x.className = 'mu-toast-x';
    x.type = 'button';
    x.title = 'Close';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '✕';
    x.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); });
    el.appendChild(x);
    host.appendChild(el);
    globalThis.__muSfx?.(kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info');
    const ms = o.ms ?? 3600;
    let t1 = 0, t2 = 0;
    const arm = (wait) => { t1 = window.setTimeout(() => el.classList.add('is-out'), wait); t2 = window.setTimeout(() => el.remove(), wait + 400); };
    el.addEventListener('mouseenter', () => { clearTimeout(t1); clearTimeout(t2); el.classList.remove('is-out'); });
    el.addEventListener('mouseleave', () => arm(1500));
    el.addEventListener('click', () => el.remove());
    arm(ms);
}
export function busy(label, job) {
    state.busy = label;
    notify();
    return job().finally(() => { state.busy = ''; notify(); });
}
