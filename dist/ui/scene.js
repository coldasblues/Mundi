// The scene: the place, the people in it (Expressions sprites), the conversation and the composer.
// The conversation IS the group chat: generation, streaming, swipes, regenerate, continue, impersonate,
// editing and deleting all use SillyTavern's own functions.
import { nativeHost } from './native.js';
import { lockScene } from '../sim/life.js';
import { soloOf } from './lifeui.js';
import { judgeLine, judgeReaction } from '../sim/mood.js';
import { state, notify, esc, game, toast, ROOT_ID, saveGame } from '../core/store.js';
import { getWorld, worldFile } from '../core/world.js';
import { chat, speakerOf, thumb, sendText, replyAs, regenerate, continueLast, impersonate, stop, swipeLeft, swipeRight, editMessage, deleteMessageAt, expressionOf, fetchSprites, saveChat, me, currentCharacter, charOf, characters, bgList, bgThumb, ctx, addUserLine, narratorLine, personaName, quiet, lorebooks, chatLore, bindChatLore, scenarioOpen, scenarioCast, scenarioTitle, addToScenario, removeFromScenario, setChatBackground, newScenarioChat, persona, personas, personaThumb, usePersona, } from '../st/bridge.js';
import { placeOf } from '../sim/places.js';
import { presentAt } from '../sim/people.js';
import { toolsHtml } from './tools.js';
import { addBond } from '../sim/social.js';
import { mentionIn, closeMention } from './mention.js';
import { visitStart } from '../sim/visits.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
import { sceneCard } from './plans.js';
import { micButton, sdButton, ttsButton } from './addons.js';
import { isWith } from '../sim/social.js';
import { sceneText } from '../sim/prompt.js';
import { aiLangNote } from '../core/i18n.js';
import { tr } from '../core/tr.js';
import { stFormat, avatarHtml, cardPicHtml, portraitHtml, lightboxHtml, lookPanelHtml, lookConfirmHtml } from './chatlook.js';
import { avatarUrl } from '../st/bridge.js';
import { charPicker } from './charpick.js';
import { stripBlock } from '../sim/pstate.js';
import { narratorExtra, splitNarration, onEdited } from '../sim/pstate-live.js';
import { afterNarration, storyOver, endedComposerHtml } from './pstateui.js';
const LOG_SIZE = 40;
/* ---------- text ---------- */
export function cleanText(t) {
    // the hidden state block (player state) is cut too, even while it streams in
    return stripBlock(String(t ?? '')
        .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '')
        .replace(/<(think|thinking|reasoning)>[\s\S]*$/i, ''))
        .trim();
}
// Pictures in a line: Markdown ![…](url) and <img src="…"> written by the character (anything else stays text).
const safeUrl = (u) => (/^(?:https?:\/\/|data:image\/|\/|[\w%.~-]+\/)/i.test(u) && !/^\s*javascript:/i.test(u) ? u : '');
function pictures(html) {
    return html
        .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (all, alt, url) => (safeUrl(url) ? `<img class="mu-line-img" src="${url}" alt="${alt}" loading="lazy">` : all))
        .replace(/&lt;img\b[\s\S]*?\bsrc=(?:&quot;|&#39;)([^&]+?)(?:&quot;|&#39;)[\s\S]*?\/?&gt;/gi, (all, url) => (safeUrl(url) ? `<img class="mu-line-img" src="${url}" alt="" loading="lazy">` : all));
}
// Pictures and videos attached to a line (SillyTavern keeps them in the message's "extra").
function attachments(m) {
    const x = m?.extra ?? {};
    const list = [];
    // SillyTavern now keeps them in "media"; the old "image"/"video" fields are read only when they really exist
    // (reading its compatibility getter logs a warning every time)
    const own = (k) => Object.prototype.propertyIsEnumerable.call(x, k) && typeof x[k] === 'string' && x[k];
    if (own('image'))
        list.push({ url: x.image });
    for (const md of Array.isArray(x.media) ? x.media : [])
        if (md?.url)
            list.push({ url: String(md.url), video: md.type === 'video' });
    if (own('video'))
        list.push({ url: x.video, video: true });
    const seen = new Set();
    return list.filter(a => safeUrl(a.url) && !seen.has(a.url) && seen.add(a.url)).map(a => (a.video
        ? `<video class="mu-line-img" src="${esc(a.url)}" controls preload="metadata"></video>`
        : `<img class="mu-line-img" data-act="lightbox" src="${esc(a.url)}" alt="" loading="lazy">`)).join('');
}
// The text shown for a line: SillyTavern's translation of it when there is one (Chat Translation extension).
export const shownText = (m) => {
    const t = String(m?.extra?.display_text || m?.mes || '');
    if (!m?.is_user)
        return t;
    // the instructions that go with Story and See are for the AI, not for the screen
    return t.replace(/\s*\[Describe what [^\]]{0,80}? sees\.?\]/gi, '').replace(/^\s*\[Story direction:\s*([\s\S]*?)\]\s*$/i, (_m, x) => `*✦ ${String(x).trim()}*`);
};
export function formatText(t) {
    return pictures(esc(cleanText(t)))
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\*([^*]*)$/, '<em>$1</em>')
        .replace(/&quot;([^&]+?)&quot;|“([^”]+)”/g, (_m, a, b) => `<q>${a ?? b}</q>`)
        .replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
}
/* ---------- sprites ---------- */
function spriteFor(avatar, label) {
    const list = state.sprites[avatar];
    if (list === undefined) {
        state.sprites[avatar] = null;
        fetchSprites(avatar).then(l => { state.sprites[avatar] = l; notify(); });
        return '';
    }
    if (!list?.length)
        return '';
    const want = (label ?? 'neutral').toLowerCase();
    const hit = list.find(s => String(s.label).toLowerCase() === want) ?? list.find(s => String(s.label).toLowerCase() === 'neutral') ?? list[0];
    return String(hit?.path ?? '');
}
// The latest expression of each person in the scene (from her last line).
function expressions() {
    const out = {};
    const list = chat();
    for (let i = list.length - 1; i >= 0 && i > list.length - 60; i--) {
        const a = speakerOf(list[i]);
        if (a && !(a in out))
            out[a] = list[i].extra?.mundi_expr ?? null;
    }
    return out;
}
/* ---------- drawing ---------- */
function background(g, w) {
    const p = placeOf(g, w, g.player.loc);
    if (!p)
        return '';
    if (p.home) {
        const kind = w.homes.kinds[p.id === 'home:player' ? g.player.home.kind : (w.homes.zones.find(z => z.id === g.cast[p.id.slice(5)]?.home.zone)?.kind ?? 'apartment')];
        if (kind?.image)
            return `background-image:url('${worldFile(w, kind.image)}');background-size:cover;background-position:center`;
    }
    if (p.bg)
        return `background-image:url('${worldFile(w, p.bg)}');background-size:cover;background-position:center`;
    const map = w.maps.find(m => m.id === p.map) ?? w.maps[0];
    return `background-image:url('${worldFile(w, map.image)}');background-size:420% auto;background-position:${p.x}% ${p.y}%`;
}
import { fullPicOf as fullPic } from './chatlook.js';
// SillyTavern's own formatting (Markdown, code blocks, regex scripts of your presets), with Mundi's as a fallback.
const lineText = (m, i) => stFormat(cleanText(shownText(m)), m, i, (t) => `<p>${formatText(t)}</p>`);
function lineHtml(m, i, last, lastChar) {
    const narr = !!m.extra?.mundi_narrator;
    if (m.is_system && !narr)
        return '';
    const who = narr ? tr('Narrator') : m.is_user ? (m.name || me()) : m.name;
    const editing = state.modal?.type === 'edit' && state.modal.i === i;
    const swipes = !m.is_user && i === lastChar && Array.isArray(m.swipes) && m.swipes.length > 0
        ? `<span class="mu-swipes"><button data-act="swipe" data-d="-1" title="Previous answer" ${(m.swipe_id ?? 0) <= 0 ? 'disabled' : ''}>‹</button><small>${(m.swipe_id ?? 0) + 1}/${m.swipes.length}</small><button data-act="swipe" data-d="1" title="Next answer (generates a new one at the end)">›</button></span>` : '';
    return `<div class="mu-line ${m.is_user ? 'is-user' : ''} ${narr ? 'is-narrator' : ''} ${last && state.generating && !m.is_user ? 'is-live' : ''}" data-i="${i}">${narr ? '' : cardPicHtml(m)}<div class="mu-line-body">
        <div class="mu-line-head">${narr ? '' : avatarHtml(m)}<b ${narr ? '' : `data-act="portrait" data-src="${esc(fullPic(m))}" data-name="${esc(who)}"`}>${esc(who)}</b>${swipes}
            ${state.modal?.type === 'delete' && state.modal.i === i
        ? `<span class="mu-line-ask">Delete this line? <button class="mu-danger" data-act="delete-yes" data-i="${i}">Delete</button><button data-act="edit-cancel">Cancel</button></span>`
        : `<span class="mu-line-tools">${m.is_user ? '' : ttsButton(i)}${game() ? `<button data-act="remember-line" data-i="${i}" title="Remember this (Journal)">${icon('book')}</button>` : ''}<button data-act="edit" data-i="${i}" title="Edit">${icon('edit')}</button><button data-act="delete" data-i="${i}" title="Delete">${icon('trash')}</button></span>`}</div>
        ${editing
        ? `<textarea class="mu-msgedit" data-focus="edit" rows="4">${esc(m.mes)}</textarea><div class="mu-row"><button class="mu-primary" data-act="edit-save" data-i="${i}">Save</button><button data-act="edit-cancel">Cancel</button></div>`
        : `<div class="mu-line-text mes_text">${lineText(m, i)}${attachments(m)}</div>`}
    </div></div>`;
}
function logHtml() {
    const list = chat();
    const g = game();
    const from = Math.max(g && state.view === 'scene' ? visitStart(g) : 0, list.length - LOG_SIZE); // only this visit's lines
    let lastChar = -1;
    for (let i = list.length - 1; i >= 0; i--)
        if (!list[i].is_user && !list[i].is_system) {
            lastChar = i;
            break;
        }
    let out = '';
    for (let i = from; i < list.length; i++)
        out += lineHtml(list[i], i, i === list.length - 1, lastChar);
    return out || '<p class="mu-muted mu-pad">Say something, or just do something: write it in the box below.</p>';
}
export function sceneHtml() {
    const g = game();
    const w = getWorld(g.world);
    // talking alone with someone: only their picture stays in the scene
    const solo = soloOf(g);
    const here = presentAt(g, w, g.player.loc).filter(r => !solo || r.avatar === solo);
    const ex = expressions();
    const nobody = !here.length;
    const sprites = here.map((r, k) => {
        const src = spriteFor(r.avatar, ex[r.avatar] ?? null);
        return `<figure class="mu-sprite ${isWith(g, r.avatar) ? 'is-with' : ''}" style="--i:${k};--n:${here.length}" title="${esc(r.name)}">${src ? `<img src="${esc(src)}" alt="">` : `<span class="is-avatar mu-zoomable"><img src="${esc(avatarUrl(r.avatar))}" alt="" draggable="false"></span>`}<figcaption>${esc(r.met ? r.name : 'Someone')}</figcaption></figure>`;
    }).join('');
    return `<div class="mu-scene">
        <div class="mu-scene-bg" style="${background(g, w)}"></div>
        <div class="mu-sprites">${sprites}</div>
        
        <section class="mu-dialog">
            <div class="mu-log" data-keep="log" data-bottom>${logHtml()}</div>
            ${storyOver(g) ? endedComposerHtml() : `<div class="mu-composer">
                ${modesHtml()}
                <textarea data-focus="composer" rows="2" placeholder="${nobody ? 'You are alone here. Write what you do or think; the narrator describes the moment.' : 'Write what you say or do…'}">${esc(state.composer)}</textarea>
                <div class="mu-composer-tools">
                    ${state.generating
        ? '<button class="mu-danger" data-act="stop">■ Stop</button>'
        : `<button class="mu-primary" data-act="send">Send</button>
                       <button data-act="continue" title="The character continues their last line" ${nobody ? 'disabled' : ''}>${icon('forward')}</button>
                       <button data-act="regenerate" title="Regenerate the last answer" ${nobody ? 'disabled' : ''}>${icon('redo')}</button>
                       <button data-act="impersonate" title="The AI writes your line" ${nobody ? 'disabled' : ''}>${icon('pen')}</button>${sdButton()}${micButton()}<button data-act="ext-menu" class="${EXT.open ? 'is-on' : ''}" title="SillyTavern extensions">${icon('grid')}</button>`}
                </div>
            </div>`}
        </section>
        ${sceneCard(g, w)}
        ${portraitHtml()}${lightboxHtml()}${lookConfirmHtml()}
        ${extMenuHtml()}
        ${toolsHtml()}
    </div>`;
}
// Scenario: a plain chat (one character, or a group made from it), in the scene's look: their sprites, the
// conversation, SillyTavern's own background. No map, no clock. It is saved as a normal SillyTavern chat.
const SC = { pick: '', q: '', bgs: null, to: '' };
function scenarioPicker() {
    if (!SC.pick)
        return '';
    const q = SC.q.toLowerCase();
    if (SC.pick === 'bg') {
        if (!SC.bgs) {
            SC.bgs = [];
            bgList().then(b => { SC.bgs = b.images; notify(); }).catch(() => { SC.bgs = []; });
        }
        const list = SC.bgs.filter(f => !q || f.toLowerCase().includes(q));
        return `<div class="mu-dlg-veil" data-act="sc-pick-close"></div><div class="mu-panel mu-scpick" role="dialog"><header><h3>Background</h3><button class="mu-ibtn mu-ghost" data-act="sc-pick-close" aria-label="Close">${icon('x')}</button></header>
            <input class="mu-search" type="search" data-input="sc-q" data-focus="scq" placeholder="Search" value="${esc(SC.q)}">
            <div class="mu-scpick-grid is-bg" data-keep="scpick">${list.map(f => `<button data-act="sc-bg" data-file="${esc(f)}" title="${esc(f)}"><img src="${esc(bgThumb(f))}" alt="" loading="lazy"><span data-notr>${esc(f.replace(/\.[a-z0-9]+$/i, ''))}</span></button>`).join('') || '<p class="mu-muted">Loading…</p>'}</div></div>`;
    }
    // your persona: switch in the middle of the chat (like SillyTavern), and choose whether your earlier lines follow
    if (SC.pick === 'persona') {
        const cur = persona();
        const list = personas().filter(p => !q || p.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
        return `<div class="mu-dlg-veil" data-act="sc-pick-close"></div><div class="mu-panel mu-scpick" role="dialog"><header><h3>Your persona</h3><button class="mu-ibtn mu-ghost" data-act="sc-pick-close" aria-label="Close">${icon('x')}</button></header>
            <p class="mu-muted">Who you are in this chat. It stays with this chat (SillyTavern's chat lock).</p>
            <input class="mu-search" type="search" data-input="sc-q" data-focus="scq" placeholder="Search your personas" value="${esc(SC.q)}">
            <div class="mu-scpick-grid" data-keep="scpick">${list.map(p => `<button class="${p.file === cur ? 'is-on' : ''}" data-act="sc-persona" data-file="${esc(p.file)}" title="${esc(p.name)}"><img src="${esc(personaThumb(p.file))}" alt="" loading="lazy"><span data-notr>${esc(p.name)}</span></button>`).join('') || '<p class="mu-muted">No personas found.</p>'}</div></div>`;
    }
    if (SC.pick === 'persona-rename') {
        const to = personas().find(p => p.file === SC.to);
        const old = [...new Set(chat().filter(m => m.is_user && !m.is_system).map(m => String(m.name ?? '')))].filter(n => n && n !== to?.name);
        return `<div class="mu-dlg-veil" data-act="sc-pick-close"></div><div class="mu-panel mu-scpick mu-screname" role="dialog"><header><h3>Your earlier lines</h3><button class="mu-ibtn mu-ghost" data-act="sc-pick-close" aria-label="Close">${icon('x')}</button></header>
            <p>Your earlier lines in this chat are written as <b data-notr>${esc(old.join(', ') || personaName())}</b>. Change them to <b data-notr>${esc(to?.name ?? '')}</b>, with the new picture?</p>
            <div class="mu-row mu-dlg-btns"><button data-act="sc-persona-yes" data-v="0">No, only from now on</button><button class="mu-primary" data-act="sc-persona-yes" data-v="1">Yes, change them</button></div></div>`;
    }
    if (SC.pick === 'lore') {
        const cur = chatLore();
        const list = lorebooks().filter(n => !q || n.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
        return `<div class="mu-dlg-veil" data-act="sc-pick-close"></div><div class="mu-panel mu-scpick is-lore" role="dialog"><header><h3>Chat lorebook</h3><button class="mu-ibtn mu-ghost" data-act="sc-pick-close" aria-label="Close">${icon('x')}</button></header>
            <p class="mu-muted">A lorebook only for this chat (SillyTavern's "chat lore"). The character's own lorebooks keep working as usual.</p>
            <input class="mu-search" type="search" data-input="sc-q" data-focus="scq" placeholder="Search your lorebooks" value="${esc(SC.q)}">
            <div class="mu-lorepick" data-keep="scpick"><button class="${!cur ? 'is-on' : ''}" data-act="sc-lore" data-name="">${icon('x')}<span>None</span></button>
                ${list.map(n => `<button class="${cur === n ? 'is-on' : ''}" data-act="sc-lore" data-name="${esc(n)}">${icon('book')}<span data-notr>${esc(n)}</span>${cur === n ? icon('check') : ''}</button>`).join('') || '<p class="mu-muted">No lorebooks found.</p>'}</div></div>`;
    }
    const cast = scenarioCast();
    return `<div class="mu-dlg-veil" data-act="sc-pick-close"></div><div class="mu-panel mu-scpick is-chars" role="dialog"><header><h3>Add a character</h3><button class="mu-ibtn mu-ghost" data-act="sc-pick-close" aria-label="Close">${icon('x')}</button></header>
        <p class="mu-muted">${currentCharacter() ? 'The chat becomes a group chat in SillyTavern (it asks you to confirm). The one-on-one chat stays as it is.' : 'They join this group.'}</p>
        ${charPicker({ key: 'scadd', list: characters().filter(c => !cast.includes(c.avatar)), selected: [], act: 'sc-add', placeholder: 'Search your characters' })}</div>`;
}
export function chatHtml() {
    if (!scenarioOpen())
        return '';
    const cast = scenarioCast();
    const ex = expressions();
    const sprites = cast.map((a, k) => {
        const src = spriteFor(a, ex[a] ?? null);
        return `<figure class="mu-sprite" style="--i:${k};--n:${cast.length}">${src ? `<img src="${esc(src)}" alt="">` : `<span class="is-avatar mu-zoomable" data-act="portrait" data-src="${esc(avatarUrl(a))}" data-name="${esc(charOf(a)?.name ?? '')}"><img src="${esc(avatarUrl(a))}" alt="" draggable="false"></span>`}</figure>`;
    }).join('');
    // the chat's own background (just chosen, or locked to this chat), else what SillyTavern shows now
    const bgEl = document.getElementById('bg1');
    const locked = String(ctx().chatMetadata?.custom_background ?? '');
    const bg = locked || (bgEl ? (bgEl.style.backgroundImage || getComputedStyle(bgEl).backgroundImage) : 'none');
    const group = !currentCharacter();
    return `<div class="mu-scene is-chat">
        <div class="mu-scene-bg" style="${bg && bg !== 'none' ? `background-image:${esc(bg)};background-size:cover;background-position:center` : ''}"></div>
        <div class="mu-sprites">${sprites}</div>
        ${group ? `<nav class="mu-people" aria-label="People here">${cast.map(a => `<span class="mu-person"><img src="${esc(thumb(a))}" alt=""><b data-notr>${esc(charOf(a)?.name ?? '')}</b>${cast.length > 1 ? `<button class="mu-ghost" data-act="sc-remove" data-avatar="${esc(a)}" title="Remove from the scene">${icon('x')}</button>` : ''}</span>`).join('')}</nav>` : ''}
        <section class="mu-dialog">
            <div class="mu-log" data-keep="log" data-bottom>${logHtml()}</div>
            <div class="mu-composer">
                ${modesHtml()}
                <textarea data-focus="composer" rows="2" placeholder="Write what you say or do…">${esc(state.composer)}</textarea>
                <div class="mu-composer-tools">
                    ${state.generating
        ? '<button class="mu-danger" data-act="stop">■ Stop</button>'
        : `<button class="mu-primary" data-act="send">Send</button>
                       <button data-act="continue" title="The character continues their last line">${icon('forward')}</button>
                       <button data-act="regenerate" title="Regenerate the last answer">${icon('redo')}</button>
                       <button data-act="impersonate" title="The AI writes your line">${icon('pen')}</button>${sdButton()}${micButton()}<button data-act="ext-menu" class="${EXT.open ? 'is-on' : ''}" title="SillyTavern extensions">${icon('grid')}</button>`}
                </div>
            </div>
        </section>
        <div class="mh-drawer ${DRAWER.open ? 'is-open' : ''}">
            <button class="mh-drawer-tab mh-glass" data-act="drawer" title="${DRAWER.open ? 'Close' : 'Scenario tools'}">${icon(DRAWER.open ? 'x' : 'menu')}</button>
            <nav class="mh-drawer-panel mh-glass"><header><b data-notr>${esc(scenarioTitle())}</b><small>Scenario</small></header>
                <button data-act="sc-open" data-v="bg">${icon('image')}<span>Background</span></button>
                <button data-act="sc-open" data-v="add">${icon('users')}<span>Add a character</span></button>
                <button data-act="sc-open" data-v="persona"><span class="mh-drawer-mew"><img class="mh-drawer-me" src="${esc(personaThumb())}" alt=""></span><span>Your persona<small data-notr>${esc(personaName())}</small></span></button>
                <button data-act="sc-open" data-v="lore">${icon('book')}<span>Chat lorebook${chatLore() ? `<small data-notr>${esc(chatLore())}</small>` : ''}</span></button>
                <button data-act="chat-new">${icon('plus')}<span>New chat</span></button>
                <button data-act="drawer-look" class="${DRAWER.look ? 'is-on' : ''}">${icon('palette')}<span>Look</span></button>
                <button data-act="open-settings">${icon('gear')}<span>Settings</span></button>
                <button data-act="to-menu" data-sfx="back">${icon('back')}<span>Main menu</span></button>
                ${DRAWER.look ? `<div class="mh-drawer-look" data-keep="look">${lookPanelHtml()}</div>` : ''}</nav></div>
        ${portraitHtml()}${lightboxHtml()}${lookConfirmHtml()}
        ${scenarioPicker()}
        ${extMenuHtml()}
    </div>`;
}
// Live update while a reply streams in: only the last line is redrawn.
export function patchLastLine() {
    const log = document.getElementById(ROOT_ID)?.querySelector('.mu-log');
    if (!log)
        return;
    const list = chat();
    const i = list.length - 1;
    const el = log.querySelector(`.mu-line[data-i="${i}"] .mu-line-text`);
    if (!el) {
        notify();
        return;
    }
    el.innerHTML = lineText(list[i], i);
    if (STICK.get(log) !== false)
        log.scrollTop = log.scrollHeight; // you scrolled up to read: the reply streams in without pulling you down
}
// After drawing: the newest character line gets its expression (once, using the Expressions extension).
let classifying = -1;
export function afterScene(_main) {
    if (state.generating)
        return;
    const list = chat();
    for (let i = list.length - 1; i >= 0 && i > list.length - 6; i--) {
        const m = list[i];
        if (m.is_user || m.is_system)
            continue;
        if (m.extra?.mundi_expr !== undefined || classifying === i)
            break;
        classifying = i;
        expressionOf(cleanText(m.mes)).then(label => {
            m.extra = { ...(m.extra ?? {}), mundi_expr: label };
            // in a world, how they react moves the bond
            const g = game();
            const who = speakerOf(m);
            if (g && who && g.cast[who]?.met) {
                judgeReaction(g, who, label);
                saveGame();
            }
            saveChat();
            if (label)
                notify();
        }).finally(() => { classifying = -1; });
        break;
    }
}
Object.assign(ACT, {
    'sc-open': (el) => { SC.pick = el.dataset.v; SC.q = ''; if (SC.pick === 'bg')
        SC.bgs = null; notify(); },
    'sc-pick-close': () => { SC.pick = ''; notify(); },
    'sc-persona': (el) => {
        const file = el.dataset.file;
        const to = personas().find(p => p.file === file);
        if (!to || file === persona()) {
            SC.pick = '';
            notify();
            return;
        }
        const earlier = chat().some(m => m.is_user && !m.is_system && String(m.name ?? '') !== to.name);
        SC.to = file;
        if (earlier) {
            SC.pick = 'persona-rename';
            notify();
            return;
        }
        void switchPersona(file, false);
    },
    'sc-persona-yes': (el) => { void switchPersona(SC.to, el.dataset.v === '1'); },
    'sc-bg': (el) => { setChatBackground(el.dataset.file); SC.pick = ''; notify(); },
    'sc-add': async (el) => {
        SC.pick = '';
        notify();
        try {
            if (await addToScenario(el.dataset.avatar))
                toast(`${charOf(el.dataset.avatar)?.name ?? ''} joined the scene.`, 'success');
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        notify();
    },
    'sc-lore': async (el) => {
        const n = el.dataset.name ?? '';
        await bindChatLore(n);
        // SillyTavern's own chat lorebook button shows it too
        document.querySelectorAll('.chat_lorebook_button').forEach(b => b.classList.toggle('world_set', !!n));
        SC.pick = '';
        toast(n ? `"${n}" is now this chat's lorebook.` : 'This chat has no lorebook now.', 'success');
        notify();
    },
    'sc-remove': async (el) => { await removeFromScenario(el.dataset.avatar); notify(); },
    'chat-new': async () => {
        if (!scenarioOpen())
            return;
        // SillyTavern's own "Start new chat?" question (with "Delete the current chat" to tick), exactly as in SillyTavern
        const opt = document.getElementById('option_start_new_chat');
        if (opt) {
            DRAWER.open = false;
            notify();
            opt.click();
            return;
        }
        await newScenarioChat();
        toast('New chat started. The previous one stays saved in SillyTavern.', 'success');
        notify();
    },
    send: async () => {
        const raw = state.composer.trim();
        if (!raw)
            return;
        const text = shapeLine(raw);
        const g0 = game();
        const w0 = g0 && getWorld(g0.world);
        // alone: nobody is called into the scene; the hidden narrator describes the place, the time and the feelings
        if (g0 && w0 && !presentAt(g0, w0, g0.player.loc).length && !scenarioOpen()) {
            state.composer = '';
            await soloNarrate(g0, w0, text);
            return;
        }
        // "@Name" in the line: that person answers
        const men = scenarioOpen() ? { who: null, text } : mentionIn(text);
        if (men.who) {
            closeMention();
            state.composer = '';
            notify();
            await addUserLine(men.text);
            void replyAs(men.who.avatar);
        }
        else if (!sendText(text)) {
            toast('SillyTavern\'s message box was not found.', 'error');
            return;
        }
        // talking to people brings you closer (a little each line, capped per day)
        const g = game();
        const w = g && getWorld(g.world);
        if (g && w) {
            const hearers = presentAt(g, w, g.player.loc).filter(r => !soloOf(g) || r.avatar === soloOf(g));
            const hurt = judgeLine(g, w, raw, hearers);
            hurt.forEach(m => toast(m, 'warn'));
            if (!hurt.length)
                for (const r of hearers)
                    if (r.met)
                        addBond(g, r.avatar, 3);
            lockScene(g, w);
            saveGame();
        }
        state.composer = '';
        notify();
    },
    'input-mode': (el) => { INPUT_MODE.v = el.dataset.v; notify(); },
    'ext-menu': () => { EXT.open = !EXT.open; notify(); },
    drawer: () => { DRAWER.open = !DRAWER.open; notify(); },
    'drawer-look': () => { DRAWER.look = !DRAWER.look; notify(); },
    stop: () => stop(),
    continue: () => continueLast(),
    regenerate: () => regenerate(),
    impersonate: () => { state.impersonating = true; impersonate(); },
    swipe: (el) => (Number(el.dataset.d) < 0 ? swipeLeft() : swipeRight()),
    edit: (el) => { state.modal = { type: 'edit', i: Number(el.dataset.i) }; notify(); },
    'edit-cancel': () => { state.modal = null; notify(); },
    'edit-save': (el) => {
        const ta = document.getElementById(ROOT_ID)?.querySelector('.mu-msgedit');
        if (ta) {
            editMessage(Number(el.dataset.i), ta.value);
            onEdited(Number(el.dataset.i));
        } // player state follows the new text
        state.modal = null;
        notify();
    },
    delete: (el) => { state.modal = { type: 'delete', i: Number(el.dataset.i) }; notify(); },
    'delete-yes': async (el) => { state.modal = null; await deleteMessageAt(Number(el.dataset.i)); notify(); },
});
Object.assign(INPUT, { 'sc-q': (el) => { SC.q = el.value; notify(); } });
/** A line from a button (trying to get away…): to the people here, or to the narrator when nobody of the cast is here. */
export async function sendSceneLine(text) {
    const g = game();
    const w = g && getWorld(g.world);
    if (g && w && !presentAt(g, w, g.player.loc).length && !scenarioOpen()) {
        await soloNarrate(g, w, text);
        return;
    }
    const { sendCanned } = await import('../st/bridge.js');
    if (!sendCanned(text))
        toast('SillyTavern\'s message box was not found.', 'error');
}
// The invisible narrator for scenes with nobody else: your line goes into the chat, and the narrator answers with the
// surroundings, the passing moment and how you feel. No character is made to appear.
async function soloNarrate(g, w, text) {
    state.generating = true;
    notify();
    try {
        await addUserLine(text);
        const me = personaName();
        const recent = chat().slice(-8).filter((m) => !m.is_system).map((m) => `${m.is_user ? me : m.name}: ${String(m.mes ?? '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
        // player state: who is here (the story may have brought someone in), and how a roll to get away went
        const extra = narratorExtra().replace(/\{\{user\}\}/g, me);
        const alone = !extra.includes('Also in the scene:');
        const out = await quiet(`${sceneText().replace(/\{\{user\}\}/g, me)}\n\n${recent}\n\nNarrate what happens next in 2 to 4 sentences, in the second person ("you"), following ${me}'s last line. ${alone ? `${me} is alone: describe only the place, small details, the passing moment and ${me}'s feelings and thoughts. No other character appears, speaks or arrives.` : `Describe the place, the moment and the people already in the scene; voice them briefly when they speak. Nobody new arrives.`} Do not write ${me}'s words or decisions.${aiLangNote() ? ` ${aiLangNote()}` : ''}${extra ? `\n\n${extra}` : ''}`, extra ? 420 : 260, alone ? 'You are the quiet narrator of a life simulation. You never bring other characters into the scene.' : 'You are the narrator of a life simulation.');
        const told = splitNarration(out.trim());
        if (told.text.trim()) {
            await narratorLine(told.text.trim());
            if (extra)
                afterNarration(told.rep);
        }
        else
            toast('No answer (is the AI connected?).', 'warn');
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
    }
    state.generating = false;
    notify();
}
const MODES = [['say', 'Say', 'chat'], ['do', 'Do', 'forward'], ['story', 'Story', 'book'], ['see', 'See', 'search']];
export const INPUT_MODE = { v: 'say' };
function modesHtml() {
    return `<div class="mh-modes">${MODES.map(([id, label, ic]) => `<button class="${INPUT_MODE.v === id ? 'is-on' : ''}" data-act="input-mode" data-v="${id}" title="${{ say: 'What you say out loud', do: 'What you do', story: 'Steer the story (a direction for the narrator)', see: 'Look at something: the AI describes what you see' }[id]}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>`;
}
// How a line is sent in each mode.
export function shapeLine(text) {
    const t = text.trim();
    switch (INPUT_MODE.v) {
        case 'do': return /^\*.*\*$/s.test(t) ? t : `*${t.replace(/^\*|\*$/g, '')}*`;
        case 'story': return `[Story direction: ${t}]`;
        case 'see': return `*looks at ${t.replace(/^(at|the)\s+/i, (m) => m.toLowerCase() === 'at ' ? '' : m)}* [Describe what {{user}} sees.]`;
        default: return /^["“*]/.test(t) ? t : `"${t}"`;
    }
}
/* ---------- other SillyTavern extensions' buttons (23) ---------- */
// SillyTavern's own extensions menu (the magic wand), with every button other extensions add to it.
// Switches your persona in this chat; `rename`: your earlier lines take the new name and picture too.
async function switchPersona(file, rename) {
    SC.pick = '';
    notify();
    const to = personas().find(p => p.file === file);
    if (!to)
        return;
    try {
        await usePersona(file);
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
        return;
    }
    if (rename) {
        const pic = `/thumbnail?type=persona&file=${encodeURIComponent(file)}`;
        let n = 0;
        for (const m of chat())
            if (m.is_user && !m.is_system) {
                m.name = to.name;
                m.force_avatar = pic;
                n++;
            }
        saveChat();
        try {
            await ctx().reloadCurrentChat?.();
        }
        catch { /* SillyTavern redraws it later */ }
        toast(`You are ${to.name} now. ${n === 1 ? '1 earlier line was' : `${n} earlier lines were`} changed.`, 'success');
    }
    else
        toast(`You are ${to.name} now.`, 'success');
    notify();
}
export const EXT = { open: false };
export function extMenuHtml() {
    return EXT.open ? `<div class="mh-extmenu mh-glass"><header><b>SillyTavern extensions</b><button class="mu-ibtn mu-ghost" data-act="ext-menu">${icon('x')}</button></header>${nativeHost('st-extmenu')}</div>` : '';
}
/* ---------- the scenario drawer (13) ---------- */
export const DRAWER = { open: false, look: false };
// The conversation jumps to its newest line (after choosing Say / Do / Story / See, for example).
export function toLastLine() {
    requestAnimationFrame(() => {
        const log = document.getElementById(ROOT_ID)?.querySelector('.mu-log');
        if (log)
            log.scrollTop = log.scrollHeight;
        document.getElementById(ROOT_ID)?.querySelector('[data-focus="composer"]')?.focus();
    });
}
// The conversation stays at its newest line while pictures in it finish loading (they make it taller),
// unless you scrolled up to read.
const STICK = new WeakMap();
document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (el?.classList?.contains('mu-log'))
        STICK.set(el, el.scrollHeight - el.scrollTop - el.clientHeight < 40);
}, true);
document.addEventListener('load', (e) => {
    const log = e.target?.closest?.('#mundi-root .mu-log');
    if (log && STICK.get(log) !== false)
        log.scrollTop = log.scrollHeight;
}, true);
