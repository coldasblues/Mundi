// Background music: one looping track per context (menu, out in the world, at home), with a smooth crossfade.
// Placeholder tracks by Eric Matyas — www.soundimage.org (credits in assets/music/CREDITS.txt).
// Two <audio> elements stream the files; only one plays at a time, except during the ~1.5 s crossfade.
import { UI, state, asset, game } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { isHome } from '../sim/places.js';
export const MUSIC_CREDIT = 'Music by Eric Matyas · www.soundimage.org';
const FADE_MS = 1500;
const decks = [];
let cur = 0;
let playing = null;
let fadeTimer = null;
let wantPlay = false;
const on = () => { try {
    return UI().music !== false;
}
catch {
    return true;
} };
const vol = () => { try {
    return Math.max(0, Math.min(100, UI().musicVolume ?? 35)) / 100;
}
catch {
    return 0.35;
} };
function deck(i) {
    if (!decks[i]) {
        const a = document.createElement('audio');
        a.loop = true;
        a.preload = 'auto';
        a.volume = 0;
        decks[i] = a;
    }
    return decks[i];
}
// Which track fits the moment (a file name in assets/music), or null for silence.
function contextTrack() {
    if (!state.open)
        return null;
    const g = game();
    const w = g && getWorld(g.world);
    const inGame = !!w && (state.view === 'map' || state.view === 'scene');
    if (!inGame)
        return state.view === 'settings' && playing ? playing : 'menu';
    return (isHome(g.player.loc) ? w.music?.home : w.music?.city) ?? 'menu';
}
const tryPlay = (a) => { const p = a.play(); p?.catch?.(() => { wantPlay = true; }); };
function fadeTo(targets, done) {
    clearInterval(fadeTimer);
    const start = performance.now();
    const from = decks.map(a => a?.volume ?? 0);
    fadeTimer = setInterval(() => {
        const k = Math.min(1, (performance.now() - start) / FADE_MS);
        decks.forEach((a, i) => { if (a)
            a.volume = Math.max(0, Math.min(1, from[i] + ((targets[i] ?? 0) - from[i]) * k)); });
        if (k >= 1) {
            clearInterval(fadeTimer);
            fadeTimer = null;
            done?.();
        }
    }, 50);
}
function stopAll() {
    playing = null;
    fadeTo(decks.map(() => 0), () => decks.forEach(a => a?.pause()));
}
// Called after every draw (cheap when nothing changed) and when a music setting changes.
export function syncMusic() {
    try {
        const want = on() && vol() > 0 && !document.hidden ? contextTrack() : null;
        if (!want) {
            if (playing || decks.some(a => a && !a.paused))
                stopAll();
            return;
        }
        const level = vol() * 0.8;
        if (want === playing) {
            const a = deck(cur);
            if (a.paused)
                tryPlay(a);
            if (!fadeTimer && Math.abs(a.volume - level) > 0.01)
                a.volume = level;
            return;
        }
        const next = 1 - cur;
        const b = deck(next);
        b.src = asset(`music/${want}.mp3`);
        b.currentTime = 0;
        b.volume = 0;
        tryPlay(b);
        cur = next;
        playing = want;
        const targets = [0, 0];
        targets[next] = level;
        fadeTo(targets, () => { const old = decks[1 - next]; if (old) {
            old.pause();
            old.removeAttribute('src');
            old.load();
        } });
    }
    catch { /* music is only an extra: it must never break the game */ }
}
export function installMusic() {
    const retry = () => { if (!wantPlay)
        return; wantPlay = false; const a = decks[cur]; if (a?.src && playing)
        tryPlay(a); };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
    document.addEventListener('visibilitychange', () => syncMusic());
}
