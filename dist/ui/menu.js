import { fmtDateTime } from '../core/fmt.js';
// Main menu: continue, new game, load, settings and back to SillyTavern. "Load" lists every save
// (each save is a chat of a game's group).
import { VERSION } from '../core/version.js';
import { state, notify, settings, saveSettings, esc, busy, game, toast } from '../core/store.js';
import { tutorialTarget } from './tutorial.js';
import { worlds, worldFile, cssUrl, loadAllWorlds, getWorld, isScenario } from '../core/world.js';
import { groupOf, charOf, thumb, openChat, openChatRef, personaThumb } from '../st/bridge.js';
import { enterGame, listSaves, deleteSave, gameEntry } from '../sim/game.js';
import { cardFor, playFromSlot } from '../sim/saves.js';
import { startWizard } from './newgame.js';
import { openLibrary } from './library.js';
import { openGallery } from './gallery.js';
import { ACT, INPUT } from './reg.js';
import { icon } from './icons.js';
// "Continue": the last thing played in Mundi, a world save or a scenario chat.
function lastPlayed() {
    const l = settings().last;
    if (!l)
        return null;
    if (l.kind === 'world') {
        const e = l.group ? gameEntry(l.group) : null;
        return e && groupOf(e.groupId) ? { ...l, title: e.title } : null;
    }
    if (l.avatar) {
        const c = charOf(l.avatar);
        return c ? { ...l, title: String(c.name) } : null;
    }
    const g = l.group ? groupOf(l.group) : null;
    return g ? { ...l, title: String(g.name) } : null;
}
const canContinue = () => !!lastPlayed();
const isOpenNow = () => { const l = lastPlayed(); const r = openChatRef(); return !!l && !!r && (!l.chatId || l.chatId === r.chatId) && (l.kind === 'world' ? !!game() && r.group === l.group : !game() && (r.avatar ?? r.group) === (l.avatar ?? l.group)); };
const when = (t) => fmtDateTime(t);
// The menu's background: the modern world's maps, one after the other (10 s each, with a slow fade and zoom).
const SLIDE = 10;
function slideshow() {
    const w = getWorld('modern') ?? worlds()[0];
    const pics = w ? [...new Set((w.maps ?? []).map(m => m.image).filter(Boolean))].map(f => worldFile(w, f)) : [];
    const n = pics.length;
    if (n < 2)
        return '';
    const T = n * SLIDE, fade = (2.5 / T) * 100, show = 100 / n;
    const kf = `@keyframes mu-slide-${n}{0%{opacity:0;transform:scale(1.04)}${fade.toFixed(2)}%{opacity:1}${show.toFixed(2)}%{opacity:1}${(show + fade).toFixed(2)}%{opacity:0;transform:scale(1.12)}100%{opacity:0;transform:scale(1.12)}}`;
    return `<style>${kf}</style>${pics.map((src, i) => `<div class="mu-menu-bg mu-menu-slide" style="background-image:url('${src}');animation:mu-slide-${n} ${T}s linear ${i * SLIDE - fade / 100 * T}s infinite"></div>`).join('')}`;
}
function cover() {
    const w = getWorld('modern') ?? worlds()[0];
    // under the slides: the first map (never the world's cover, which has its name written on it)
    const map = w?.maps?.[0]?.image;
    return w && map ? worldFile(w, map) : '';
}
function mainView() {
    const resume = isOpenNow();
    return `
        <nav class="mu-menu-main">
            ${canContinue() ? `<button class="mu-menu-btn is-primary" data-act="menu-continue" data-sfx="open"><b>${resume ? (lastPlayed().kind === 'world' ? 'Back to the game' : 'Back to the chat') : 'Continue'}</b><small data-notr>${esc(lastPlayed()?.title ?? '')}</small></button>`
        : tutorialTarget().includes('menu-continue') ? '<button class="mu-menu-btn is-primary" data-act="menu-continue" aria-disabled="true"><b>Continue</b><small>Your last game</small></button>' : ''}
            <button class="mu-menu-btn ${canContinue() ? '' : 'is-primary'}" data-act="menu-new" data-sfx="open"><b>New game</b><small>A chat, a Home (one house) or a whole world</small></button>
            <button class="mu-menu-btn" data-act="menu-view" data-v="load"><b>Load</b><small>Your saves</small></button>
            <button class="mu-menu-btn" data-act="menu-library"><b>Library</b><small>Characters, personas, lorebooks and notes</small></button>
            <button class="mu-menu-btn" data-act="menu-gallery"><b>Gallery</b><small>The pictures of each save, as photo albums</small></button>
            <button class="mu-menu-btn" data-act="menu-settings"><b>Settings</b><small>Interface, sound, game, add-ons and SillyTavern's settings</small></button>
            <button class="mu-menu-btn is-quiet" data-act="exit" data-sfx="back"><b>Back to SillyTavern</b></button>
        </nav>`;
}
// Favorite chats (a star), kept in Mundi's settings.
const favs = () => (settings().favChats ??= []);
const kindOf = (r) => r.kind === 'chat' ? 'chat' : isScenario(getWorld(r.world)) ? 'scenario' : 'world';
const KIND_NAME = { world: 'World', scenario: 'Home', chat: 'Chat' };
const keyOf = (r) => `${r.avatar || r.groupId}|${r.chatId}`;
const isFav = (r) => favs().includes(keyOf(r));
function saveRow(r, i) {
    const confirm = state.modal?.type === 'delete-save' && state.modal.i === i;
    // world saves show the persona you play; scenarios the character (or the group)
    const persona = r.kind === 'world' ? gameEntry(r.groupId)?.persona : '';
    const img = r.kind === 'chat' ? (r.avatar ? thumb(r.avatar) : groupOf(r.groupId)?.avatar_url || '') : persona ? personaThumb(persona) : '';
    const sel = LOAD.sel.has(i);
    const card = r.kind === 'world' ? cardFor(r.chatId) : undefined; // day, place, who is dead… (saves.ts)
    return `<li class="mu-save ${r.current ? 'is-current' : ''} ${sel ? 'is-sel' : ''}" data-act="save-pick" data-i="${i}">
        <label class="mu-save-check" title="Select (or Ctrl + click the row)"><input type="checkbox" data-input="save-sel" data-i="${i}" ${sel ? 'checked' : ''}></label>
        ${img ? `<span class="mu-save-imgw"><img class="mu-save-img" src="${esc(img)}" alt="">${r.kind === 'world' ? `<i class="mu-save-badge">${icon('globe')}</i>` : ''}</span>` : r.kind === 'chat' ? `<i class="mu-save-img">${icon('users')}</i>` : `<i class="mu-save-img is-world">${icon('globe')}</i>`}
        <div class="mu-save-txt"><b><span class="mu-save-kind is-${kindOf(r)} ${card?.slot ? 'is-slot' : ''}">${card?.slot ? 'Save' : KIND_NAME[kindOf(r)]}</span> <span data-notr>${esc(card?.slot && card.name ? card.name : r.title)}</span>${card?.slot ? `<small class="mu-muted" data-notr> · ${esc(r.title)}</small>` : ''}</b>
            ${card?.line ? `<small class="mu-save-snap" data-notr>${esc(card.line)}</small>` : ''}
            <small><span data-notr>${esc(r.chatId)}</span> · ${r.count} messages · ${esc(when(r.last))}</small>
            ${r.preview ? `<small class="mu-save-prev" data-notr>${esc(r.preview.slice(0, 140))}</small>` : ''}</div>
        ${confirm
        ? `<div class="mu-row"><span class="mu-warn">${r.kind === 'world' ? 'Delete this save?' : 'Delete this chat?'}</span><button class="mu-danger" data-act="save-del-yes" data-i="${i}">Delete</button><button data-act="save-del-no">Cancel</button></div>`
        : `<div class="mu-row"><button class="mu-ghost mu-star ${isFav(r) ? 'is-on' : ''}" data-act="save-fav" data-i="${i}" title="${isFav(r) ? 'Remove from favorites' : 'Favorite'}">${icon(isFav(r) ? 'starFill' : 'star')}</button><button class="mu-primary" data-act="save-load" data-i="${i}">Load</button><button class="mu-ghost" data-act="save-del" data-i="${i}" title="${r.kind === 'world' ? 'Delete this save' : 'Delete this chat'}">✕</button></div>`}
    </li>`;
}
const LOAD = { kind: 'all', q: '', fav: false, sel: new Set(), confirmBulk: false };
function loadView() {
    if (state.saves === null) {
        listSaves().then(r => { state.saves = r; notify(); }).catch(() => { state.saves = []; notify(); });
        return `${subHead('Load')}<p class="mu-muted mu-pad">Loading your saves…</p>`;
    }
    const all = state.saves;
    const q = LOAD.q.toLowerCase();
    const shown = all.map((r, i) => [r, i]).filter(([r]) => (LOAD.kind === 'all' || kindOf(r) === LOAD.kind) && (!LOAD.fav || isFav(r)) && (!q || `${r.title} ${r.chatId}`.toLowerCase().includes(q)));
    const n = (k) => all.filter(r => k === 'all' || kindOf(r) === k).length;
    return `${subHead('Load')}<div class="mu-panel mu-saves">
        <div class="mu-saves-bar"><div class="mu-chips">${[['all', 'All'], ['world', 'Worlds'], ['scenario', 'Homes'], ['chat', 'Chats']].map(([k, l]) => `<button class="mu-chip ${LOAD.kind === k ? 'is-on' : ''}" data-act="load-kind" data-v="${k}">${l} · ${n(k)}</button>`).join('')}</div>
            <button class="mu-chip ${LOAD.fav ? 'is-on' : ''}" data-act="load-fav" title="Only favorites">${icon(LOAD.fav ? 'starFill' : 'star')}<span>Favorites · ${all.filter(isFav).length}</span></button>
            <input class="mu-search" type="search" data-input="load-q" data-focus="loadq" placeholder="Search" value="${esc(LOAD.q)}"></div>
        ${LOAD.sel.size ? `<div class="mu-saves-bulk"><b>${LOAD.sel.size} selected</b>
            <button data-act="bulk-all">Select all shown</button><button data-act="bulk-fav">${icon('star')}<span>Favorite</span></button><button data-act="bulk-unfav">Unfavorite</button>
            ${LOAD.confirmBulk ? `<span class="mu-warn">Delete ${LOAD.sel.size}?</span><button class="mu-danger" data-act="bulk-del-yes">Delete</button><button data-act="bulk-del-no">Cancel</button>` : `<button class="mu-danger" data-act="bulk-del">${icon('trash')}<span>Delete</span></button>`}
            <button class="mu-ghost" data-act="bulk-clear">Clear</button></div>` : ''}
        <div class="mu-saves-list" data-keep="saves">${shown.length ? `<ul>${shown.map(([r, i]) => saveRow(r, i)).join('')}</ul>` : '<p class="mu-muted">Nothing here yet. Start a new game.</p>'}</div>
        <p class="mu-muted">Worlds and Homes are Mundi games (a Home is one house and its people). Chats are your other SillyTavern chats, with one character or a group: they open in Mundi's scene.</p>
    </div>`;
}
const subHead = (title) => `<div class="mu-subhead"><button data-act="menu-view" data-v="main" data-sfx="back">← Back</button><h2>${title}</h2></div>`;
export function menuHtml() {
    const tab = state.menuTab;
    return `<div class="mu-menu">
        <div class="mu-menu-bg" style="${esc(cover() ? `background-image:${cssUrl(cover())}` : '')}"></div>${slideshow()}
        <div class="mu-menu-shade"></div>
        <header class="mu-brand"><h1>Mundi</h1><p>Open worlds inside SillyTavern</p></header>
        <div class="mu-menu-body">${tab === 'load' ? loadView() : mainView()}</div>
        <div class="mu-menu-corner">
        </div>
        <footer class="mu-menu-foot">Mundi ${VERSION.replace(/\.0$/, '')} · player state fork · Sounds by Kenney (CC0)</footer>
    </div>`;
}
Object.assign(ACT, {
    'menu-view': (el) => { state.menuTab = el.dataset.v; state.modal = null; if (el.dataset.v === 'load') {
        state.saves = null;
        LOAD.sel.clear();
    } notify(); },
    'load-fav': () => { LOAD.fav = !LOAD.fav; notify(); },
    'save-fav': (el) => { const r = state.saves[Number(el.dataset.i)]; if (!r)
        return; const k = keyOf(r), f = favs(); const at = f.indexOf(k); if (at >= 0)
        f.splice(at, 1);
    else
        f.push(k); saveSettings(); notify(); },
    // Ctrl (or ⌘) + click on a row selects it
    'save-pick': (el, e) => { const me = e; if (!(me.ctrlKey || me.metaKey) || e.target.closest('button, input, label'))
        return; const i = Number(el.dataset.i); if (LOAD.sel.has(i))
        LOAD.sel.delete(i);
    else
        LOAD.sel.add(i); notify(); },
    'bulk-all': () => { document.querySelectorAll('.mu-save[data-i]').forEach(x => LOAD.sel.add(Number(x.dataset.i))); notify(); },
    'bulk-clear': () => { LOAD.sel.clear(); LOAD.confirmBulk = false; notify(); },
    'bulk-fav': () => { const f = favs(); for (const i of LOAD.sel) {
        const r = state.saves[i];
        if (r && !f.includes(keyOf(r)))
            f.push(keyOf(r));
    } saveSettings(); notify(); },
    'bulk-unfav': () => { const keys = new Set([...LOAD.sel].map(i => state.saves[i]).filter(Boolean).map(keyOf)); settings().favChats = favs().filter(k => !keys.has(k)); saveSettings(); notify(); },
    'bulk-del': () => { LOAD.confirmBulk = true; notify(); },
    'bulk-del-no': () => { LOAD.confirmBulk = false; notify(); },
    'bulk-del-yes': async () => {
        const rows = [...LOAD.sel].map(i => state.saves[i]).filter(Boolean);
        LOAD.confirmBulk = false;
        LOAD.sel.clear();
        await busy(`Deleting ${rows.length}`, async () => { for (const r of rows) {
            try {
                await deleteSave(r);
            }
            catch (e) {
                toast(String(e?.message ?? e), 'warn');
            }
        } });
        state.saves = null;
        notify();
    },
    'menu-library': () => openLibrary(),
    'menu-gallery': () => openGallery(),
    'menu-chat': () => { state.view = 'chat'; notify(); },
    'menu-settings': () => { state.backTo = 'menu'; state.view = 'settings'; notify(); },
    'menu-new': async () => { await loadAllWorlds(); startWizard(); },
    'menu-continue': async () => {
        const l = lastPlayed();
        if (!l)
            return;
        if (isOpenNow()) {
            if (l.kind === 'world') {
                state.view = 'map';
                notify();
                const { syncScene } = await import('../sim/game.js');
                await syncScene();
            }
            else
                state.view = 'chat';
            notify();
            return;
        }
        if (l.kind === 'world')
            await busy('Opening your game', () => enterGame(l.group, l.chatId));
        else
            await busy('Opening the chat', async () => { await openChat({ avatar: l.avatar, group: l.group, chatId: l.chatId ?? '' }); state.view = 'chat'; });
    },
    'load-kind': (el) => { LOAD.kind = el.dataset.v; notify(); },
    'save-load': async (el) => {
        const r = state.saves[Number(el.dataset.i)];
        if (!r)
            return;
        // a named save (a slot) is played as a copy, so it stays as it was
        if (r.kind === 'world' && cardFor(r.chatId)?.slot)
            await busy('Opening the save', () => playFromSlot(r.groupId, r.chatId));
        else if (r.kind === 'world')
            await busy('Opening the save', () => enterGame(r.groupId, r.chatId));
        else
            await busy('Opening the chat', async () => { await openChat({ avatar: r.avatar, group: r.groupId || undefined, chatId: r.chatId }); state.view = 'chat'; });
    },
    'save-del': (el) => { state.modal = { type: 'delete-save', i: Number(el.dataset.i) }; notify(); },
    'save-del-no': () => { state.modal = null; notify(); },
    'save-del-yes': async (el) => {
        const r = state.saves[Number(el.dataset.i)];
        state.modal = null;
        if (r) {
            try {
                await busy('Deleting', () => deleteSave(r));
            }
            catch (e) {
                toast(String(e?.message ?? e), 'warn');
            }
        }
        state.saves = null;
        notify();
    },
});
Object.assign(INPUT, {
    'load-q': (el) => { LOAD.q = el.value; notify(); },
    'save-sel': (el) => { const i = Number(el.dataset.i); if (el.checked)
        LOAD.sel.add(i);
    else
        LOAD.sel.delete(i); notify(); },
});
