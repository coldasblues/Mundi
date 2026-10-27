// After an update: a window with what the new version brought, and the tour of only that. And on the main menu, a
// small note at the top right when a newer Mundi is out (from the manifest on GitHub; quiet when offline).
import { state, notify, settings, saveSettings, toast, esc } from '../core/store.js';
import { VERSION, CHANGELOG, newer } from '../core/version.js';
import { tutorialOn, startTutorial } from './tutorial.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
const S = () => settings();
const REMOTE = 'https://raw.githubusercontent.com/coldasblues/Mundi/main/manifest.json'; // this fork's: its Update button pulls the fork
const REPO = 'https://github.com/tjalis/Mundi';
/* ---------- the changelog, once after an update ---------- */
// Someone who played before has seen the tour; someone new gets the welcome instead (and never this window).
function seenVersion() {
    const s = S();
    if (!s.lastVersion) {
        s.lastVersion = s.tourSeen ? '0.1.0' : VERSION;
        saveSettings();
    }
    return s.lastVersion;
}
export function whatsNewHtml() {
    if (state.view !== 'menu' || tutorialOn() || !S().tourSeen)
        return '';
    if (!newer(VERSION, seenVersion()))
        return '';
    const r = CHANGELOG[0];
    return `<div class="mu-recap-veil mu-wn-veil"><section class="mu-recap mh-glass mu-wn" role="dialog" aria-label="What's new">
        <header><small>Mundi ${r.v.replace(/\.0$/, '')}</small><h3>${r.title}</h3></header>
        <ul class="mu-wn-list">${r.items.map(([ic, t]) => `<li>${icon(ic)}<span>${t}</span></li>`).join('')}</ul>
        <footer><p>Want a quick look at what's new? Stella shows only the new things.</p>
            <div class="mu-row"><button class="mu-ghost" data-act="wn-close">Not now</button><button class="mu-primary" data-act="wn-tour">${icon('forward')}<span>Show me</span></button></div></footer></section></div>`;
}
function seen() { S().lastVersion = VERSION; saveSettings(); }
/* ---------- a newer version on GitHub ---------- */
const U = { checked: false, remote: '', busy: false, help: false };
async function check() {
    U.checked = true;
    try {
        const r = await fetch(`${REMOTE}?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok)
            return;
        const v = String((await r.json())?.version ?? '');
        if (v && newer(v, VERSION)) {
            U.remote = v;
            notify();
        }
    }
    catch { /* offline: say nothing */ }
}
export function updateHtml() {
    if (state.view !== 'menu')
        return '';
    if (!U.checked)
        void check();
    if (!U.remote || S().updateDismissed === U.remote || tutorialOn() || whatsNewHtml())
        return ''; // not over the changelog
    return `<aside class="mu-upd mh-glass" role="status">
        <span class="mu-upd-ic">${icon('download')}</span>
        <div><b>Mundi ${esc(U.remote)} is out</b><small>You have ${VERSION}.${U.help ? ' Update it in SillyTavern: Extensions → Manage extensions → Mundi → Update, then reload the page.' : ''}</small>
            <div class="mu-row"><button class="mu-primary" data-act="upd-go" ${U.busy ? 'aria-disabled="true"' : ''}>${U.busy ? 'Updating…' : 'Update'}</button><a class="mu-upd-link" href="${REPO}" target="_blank" rel="noopener">What's new</a></div></div>
        <button class="mu-ibtn mu-ghost" data-act="upd-x" aria-label="Dismiss" title="Not now">${icon('x')}</button></aside>`;
}
// SillyTavern's own extension update (a git pull); Mundi can be installed for one user or for all of them.
async function update() {
    if (U.busy)
        return;
    U.busy = true;
    notify();
    const headers = globalThis.SillyTavern?.getContext?.().getRequestHeaders?.() ?? { 'Content-Type': 'application/json' };
    let ok = false;
    for (const global of [false, true]) {
        try {
            const r = await fetch('/api/extensions/update', { method: 'POST', headers, body: JSON.stringify({ extensionName: 'Mundi', global }) });
            if (r.ok) {
                ok = true;
                break;
            }
        }
        catch { /* try the other */ }
    }
    U.busy = false;
    if (ok) {
        S().updateDismissed = U.remote;
        saveSettings();
        toast('Mundi updated. Reloading…', 'success');
        setTimeout(() => location.reload(), 1200);
    }
    else {
        U.help = true;
        toast('Could not update from here.', 'info');
    }
    notify();
}
Object.assign(ACT, {
    'wn-close': () => { seen(); notify(); },
    'wn-tour': () => { seen(); startTutorial('new'); },
    'upd-go': () => { void update(); },
    'upd-x': () => { S().updateDismissed = U.remote; saveSettings(); notify(); },
});
