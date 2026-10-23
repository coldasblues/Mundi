import { romOf } from '../sim/romance.js';
// The phone (Modern world): messages, people, jobs, bank and homes. Opens over the map or the scene.
import { approvalOf, approvalWord } from '../sim/living.js';
import { missingCourses, interviewChance, triedToday } from '../sim/skills.js';
import { profileApp } from './courses.js';
import { BILLS, billAmount, owed, isCut, daysLeft, payBill, payOf, priceOf, type BillId } from '../sim/bills.js';
import { shopApp, goalsApp, feelingsHtml } from './lifeui.js';
import { PL } from './plans.js';
import { feel } from '../sim/life.js';
import { journalApp, openJournal } from './journal.js';
import { romanceBlocked } from '../sim/family.js';
import { relBar } from './relui.js';
import { note } from '../sim/facts.js';
import { notify, esc, game, toast, saveGame, settings, saveSettings } from '../core/store.js';
import { galleryPictures, photosOf } from './gallery.js';
import { getWorld, styleOf, bgOf, cssUrl as cssUrlSafe, type WorldDef } from '../core/world.js';
import { upcoming } from '../sim/plans.js';
import { lex } from '../core/lexicon.js';
import { whenText } from './plans.js';
import type { Save } from '../core/store.js';
import { thumb, chat } from '../st/bridge.js';
import { weekday } from '../sim/time.js';
import { fmtClock as hm } from '../core/fmt.js';
import { money, billsOf } from '../sim/needs.js';
import { placeOf, homeAddress } from '../sim/places.js';
import { whereNow, residents } from '../sim/people.js';
import { social, bondOf, bondLabel, isPartner, sendText, PARTNER_BOND } from '../sim/social.js';
import { planForm, calendarApp, plansBadge } from './plans.js';
import { jobDef, shiftsToPromote, fits, likes, traitsOf, hire, quitJob, ledger, freeSpots, moveTo } from '../sim/work.js';
import { icon } from './icons.js';
import { appsOf, featureOn } from '../sim/creator.js';
import { feed, feedPrefs, generatePosts, shouldPost, postAsMe, toggleLike, replyTo, handleOf, dating, theirProfile, candidates, swipe, LOOKING, type Post } from '../sim/feed.js';
import { personaName, personaThumb, translateTo, uploadUserFile } from '../st/bridge.js';
import { pickFile } from './cropper.js';
import { openHelp } from './help.js';
import { ACT, INPUT } from './reg.js';

type App = 'home' | 'messages' | 'thread' | 'people' | 'person' | 'jobs' | 'bank' | 'homes' | 'social' | 'post' | 'dating' | 'dprofile' | 'matches' | 'plans' | 'journal' | 'shop' | 'goals' | 'settings' | 'profile';
export const P = { open: false, app: 'home' as App, who: '' as string, draft: '', typing: '' as string, post: '' as string, busy: false, matched: '' as string, q: '' };
const APPS = (w: WorldDef): [App, string, string, string][] => appsOf(w).filter(x => x.on && (x.id !== 'jobs' || featureOn(w, 'jobs')) && (x.id !== 'plans' || featureOn(w, 'plans'))).map(x => [x.id as App, x.name, x.icon, x.color]);
const appName = (id: string) => { const g = game(); const w = g && getWorld(g.world); return esc(w ? appsOf(w).find(a => a.id === id)?.name ?? id : id); };
// Words that change with the world's style: the medieval journal speaks of letters, notices and the matchmaker.
let MED = false, LW: WorldDef | null = null;
const T = (key: string, ...a: string[]) => lex(LW, key, ...a);
const met = (g: Save) => residents(g).filter(r => r.met);
const day = (g: Save, at: number) => { const d = Math.floor(at / 1440); return d === g.day ? hm(at % 1440) : `${weekday(d).slice(0, 3)} ${hm(at % 1440)}`; };
const bar = (v: number) => `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;

// Signal bars (always full), like a real phone's status bar.
const SIGNAL = '<svg class="mu-ic" viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><rect x="3" y="15" width="3" height="5" rx="1"/><rect x="8" y="11" width="3" height="9" rx="1"/><rect x="13" y="7" width="3" height="13" rx="1"/><rect x="18" y="3" width="3" height="17" rx="1"/></svg>';
function head(title: string, back: App | null) {
    return `<div class="mu-ph-head">${back ? `<button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="${back}" aria-label="Back">${icon('back')}</button>` : '<span></span>'}<b>${title}</b><span></span></div>`;
}

function homeApp(g: Save, w: WorldDef) {
    const unread = Object.values(social(g).unread).reduce((a, b) => a + b, 0);
    return `<div class="mu-ph-apps">${APPS(w).map(([id, name, ic, color]) => `<button class="mu-ph-app" data-act="ph-go" data-app="${id}">
        <i style="--c:${color}">${icon(ic)}</i><span>${esc(name)}</span>${id === 'messages' && unread ? `<em>${unread}</em>` : id === 'plans' && plansBadge(g) ? `<em>${plansBadge(g)}</em>` : id === 'homes' && BILLS.some(b => billAmount(g, w, b.id) && owed(g, b.id)) ? `<em>!</em>` : ''}</button>`).join('')}
        <button class="mu-ph-app" data-act="ph-go" data-app="profile"><i style="--c:#0a66c2">${icon('user')}</i><span>Profile</span></button>
        <button class="mu-ph-app" data-act="ph-go" data-app="settings"><i style="--c:#7d8597">${icon('gear')}</i><span>Settings</span></button>
        <button class="mu-ph-app" data-act="ph-help"><i style="--c:#30b0c7">${icon('help')}</i><span>Help</span></button></div>`;
}

/* ---------- Settings: the wallpaper (a picture from the web, or one from Mundi's gallery) ---------- */

const WP = { url: '', more: false, busy: false, pick: '' as '' | 'chat' | 'gallery' };
const NICK = { who: '', text: '' };
Object.assign(ACT, {
    'ph-nick-edit': (el) => { const g = game(); const who = el.dataset.who!; NICK.who = who; NICK.text = g ? nicks(g)[who] ?? g.cast[who]?.name ?? '' : ''; notify(); setTimeout(() => document.querySelector<HTMLInputElement>('#mundi-root [data-focus="ph-nick"]')?.select(), 30); },
    // while editing: a message can be deleted (yours or theirs), gone from the conversation for good
    'ph-msg-del': (el) => {
        const g = game(); if (!g || !NICK.who) return;
        const t = social(g).threads[NICK.who]; const i = Number(el.dataset.i);
        if (!t || !t[i]) return;
        t.splice(i, 1); saveGame(); notify();
    },
    'ph-nick-save': () => {
        const g = game(); if (!g || !NICK.who) return;
        const r = g.cast[NICK.who]; const t = NICK.text.trim();
        if (!t || t === r?.name) delete nicks(g)[NICK.who]; else nicks(g)[NICK.who] = t;
        NICK.who = ''; saveGame(); notify();
    },
});
Object.assign(INPUT, { 'ph-nick': (el) => { NICK.text = el.value; } });
const wallpaper = () => String((settings() as any).phoneBg ?? '');
const cssUrl = (u: string) => cssUrlSafe(u) || 'none';
// The pictures of the chat being played (Image Generation, attachments, links), newest first.
const chatPictures = (): string[] => [...new Set(chat().flatMap((m: any, i: number) => photosOf(m, i).map(p => p.url)))].reverse();
function settingsApp() {
    const cur = wallpaper();
    const pics = WP.pick === 'chat' ? chatPictures() : WP.pick === 'gallery' ? galleryPictures() : [];
    const shown = pics ? pics.slice(0, WP.more ? 240 : 36) : [];
    const empty = WP.pick === 'chat' ? 'No pictures in this chat yet (Image Generation, attachments).' : 'No pictures in the Mundi gallery yet.';
    return `${head('Settings', 'home')}<div class="mu-ph-body">
        <section><h4>Wallpaper</h4>
            <div class="mu-ph-wp-now" style="${cur ? `background-image:${esc(cssUrl(cur))}` : ''}">${cur ? '' : '<small>Default</small>'}</div>
            <button class="mu-primary" data-act="wp-upload" ${WP.busy ? 'disabled' : ''}>${icon('upload')}<span>${WP.busy ? 'Uploading…' : 'Choose a picture from your computer'}</span></button>
            <button data-act="wp-pick-open">${icon('image')}<span>Choose from your pictures</span></button>
            <label class="mu-field"><span>Or a picture from the web (link)</span><input type="text" inputmode="url" data-input="wp-url" data-focus="wpurl" placeholder="https://…/picture.jpg" value="${esc(WP.url)}"></label>
            <div class="mu-row"><button data-act="wp-set-url">${icon('check')}<span>Use this link</span></button>
                ${cur ? `<button class="mu-ghost" data-act="wp-reset">${icon('undo')}<span>Default</span></button>` : ''}</div></section>
        ${WP.pick ? `<section class="mu-ph-wp-pick">
            <div class="mu-ph-tabs"><button class="${WP.pick === 'chat' ? 'is-on' : ''}" data-act="wp-src" data-v="chat">From this chat</button><button class="${WP.pick === 'gallery' ? 'is-on' : ''}" data-act="wp-src" data-v="gallery">From the Mundi gallery</button></div>
            ${pics === null ? '<p class="mu-muted"><span class="mu-spin"></span> Loading your pictures…</p>'
            : pics.length ? `<div class="mu-ph-wp-grid">${shown.map(u => `<button class="${u === cur ? 'is-on' : ''}" data-act="wp-pick" data-url="${esc(u)}" style="background-image:${esc(cssUrl(u))}" aria-label="Use this picture"></button>`).join('')}</div>
                ${pics.length > shown.length ? `<button class="mu-ghost" data-act="wp-more">Show more (${pics.length - shown.length})</button>` : ''}`
            : `<p class="mu-muted">${empty}</p>`}
        </section>` : ''}</div>`;
}
const setWallpaper = (u: string) => { (settings() as any).phoneBg = u; saveSettings(); notify(); };
Object.assign(ACT, {
    'wp-set-url': () => { const u = WP.url.trim(); if (!/^(https?:\/\/|\/|data:image\/)/i.test(u)) { toast('Paste a picture link (https://…).', 'info'); return; } WP.url = ''; setWallpaper(u); toast('Wallpaper changed.', 'success'); },
    'wp-pick': (el) => { setWallpaper(el.dataset.url!); toast('Wallpaper changed.', 'success'); },
    'wp-reset': () => setWallpaper(''),
    'wp-more': () => { WP.more = true; notify(); },
    'wp-pick-open': () => { WP.pick = WP.pick ? '' : 'chat'; WP.more = false; notify(); },
    'wp-src': (el) => { WP.pick = el.dataset.v as 'chat' | 'gallery'; WP.more = false; notify(); },
    // a picture from your computer: saved in SillyTavern's user files, so it stays the same on every device
    'wp-upload': async () => {
        const f = await pickFile('image/*'); if (!f) return;
        WP.busy = true; notify();
        try {
            const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
            const path = await uploadUserFile(`mundi-wallpaper-${Date.now().toString(36)}.${ext}`, f);
            setWallpaper(`/${path}`); toast('Wallpaper changed.', 'success');
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        WP.busy = false; notify();
    },
});
Object.assign(INPUT, { 'wp-url': (el) => { WP.url = el.value; } });

// A search box at the top of a list (39).
const searchBox = (ph: string) => `<div class="mu-ph-search">${icon('search')}<input type="search" placeholder="${ph}" value="${esc(P.q)}" data-input="ph-q" data-focus="ph-q"></div>`;
const matchQ = (g: Save, r: { avatar: string; name: string }, texts = false) => {
    const q = P.q.trim().toLowerCase(); if (!q) return true;
    return r.name.toLowerCase().includes(q) || (texts && (social(g).threads[r.avatar] ?? []).some(m => m.text.toLowerCase().includes(q)));
};
// The name you saved them under (like a phone contact): their name unless you changed it.
const nicks = (g: Save): Record<string, string> => (((social(g) as any).nick ??= {}) as Record<string, string>);
const contactName = (g: Save, r: { avatar: string; name: string }) => nicks(g)[r.avatar] || r.name;
function messagesApp(g: Save) {
    const s = social(g);
    const list = met(g).filter(r => matchQ(g, r, true)).sort((a, b) => (s.threads[b.avatar]?.at(-1)?.at ?? 0) - (s.threads[a.avatar]?.at(-1)?.at ?? 0));
    return `${head(appName('messages'), 'home')}${searchBox('Search names and messages')}<div class="mu-ph-list">${list.length ? list.map(r => {
        const last = s.threads[r.avatar]?.at(-1);
        return `<button class="mu-ph-row" data-act="ph-thread" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt="">
            <span><b data-notr>${esc(contactName(g, r))}</b><small data-notr>${last ? esc(last.text) : ''}</small></span>${s.unread[r.avatar] ? `<em>${s.unread[r.avatar]}</em>` : last ? `<small>${day(g, last.at)}</small>` : ''}</button>`;
    }).join('') : `<p class="mu-muted mu-pad">${T('noContacts')}</p>`}</div>`;
}

function threadApp(g: Save) {
    const r = g.cast[P.who]; if (!r) return messagesApp(g);
    const t = social(g).threads[r.avatar] ?? [];
    social(g).unread[r.avatar] = 0;
    return `<div class="mu-ph-head is-chat"><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="messages" aria-label="Back">${icon('back')}</button>
            ${NICK.who === r.avatar
                ? `<div class="mu-ph-nick"><input type="text" maxlength="40" data-input="ph-nick" data-focus="ph-nick" value="${esc(NICK.text)}" placeholder="${esc(r.name)}"><button class="mu-ibtn mu-primary" data-act="ph-nick-save" aria-label="Save">${icon('check')}</button></div>`
                : `<button class="mu-ph-chathead" data-act="ph-person" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt=""><span><b data-notr title="${esc(contactName(g, r))}">${esc(contactName(g, r))}</b><small>${P.typing === r.avatar ? T('typing') : bondLabel(g, r.avatar)}</small></span></button>
                <button class="mu-ibtn mu-ghost mu-ph-pen" data-act="ph-nick-edit" data-who="${esc(r.avatar)}" title="Edit: contact name, delete messages" aria-label="Edit">${icon('pen')}</button>`}</div>
        ${NICK.who === r.avatar ? `<p class="mu-ph-editnote">${icon('trash')} Tap a message to delete it.</p>` : ''}
        <div class="mu-ph-thread ${NICK.who === r.avatar ? 'is-editing' : ''}" data-keep="ph-thread" data-bottom>${t.map((m, i) => NICK.who === r.avatar
            ? `<button class="mu-ph-msg ${m.me ? 'is-me' : ''}" data-notr data-act="ph-msg-del" data-i="${i}" title="Delete this message">${esc(m.text)}<small>${day(g, m.at)}</small><i class="mu-ph-del">${icon('trash')}</i></button>`
            : `<div class="mu-ph-msg ${m.me ? 'is-me' : ''}" data-notr>${esc(m.text)}<small>${day(g, m.at)}</small></div>`).join('')}
            ${P.typing === r.avatar ? '<div class="mu-ph-msg is-typing"><i></i><i></i><i></i></div>' : ''}
            ${t.length ? '' : `<p class="mu-muted mu-pad">${T('emptyThread')}</p>`}</div>
        <div class="mu-ph-quick">
            <button data-act="pl-come" data-who="${esc(r.avatar)}" ${PL.busy ? 'disabled' : ''}>${icon('home')}<span>Come over</span></button>
            <button data-act="ph-person" data-who="${esc(r.avatar)}">${icon('calendar')}<span>Make plans</span></button>
            <button data-act="ph-quick" data-text="How are you doing?">${icon('chat')}<span>How are you?</span></button>
            <button data-act="ph-quick" data-text="I was thinking about you.">${icon('heart')}<span>Thinking of you</span></button></div>
        <div class="mu-ph-compose"><input type="text" placeholder="${T('messagePlaceholder')}" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.typing ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-send" aria-label="${T('send')}" ${P.typing ? 'disabled' : ''}>${icon('send')}</button></div>`;
}

function peopleApp(g: Save) {
    const list = met(g).filter(r => matchQ(g, r)).sort((a, b) => bondOf(g, b.avatar) - bondOf(g, a.avatar));
    return `${head(appName('people'), 'home')}${searchBox('Search people')}<div class="mu-ph-list">${list.length ? list.map(r => `<button class="mu-ph-row" data-act="ph-person" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt="">
        <span><b data-notr>${esc(contactName(g, r))}</b><small>${bondLabel(g, r.avatar)}</small>${relBar(r.avatar)}</span>${isPartner(g, r.avatar) ? `<i class="mu-ph-heart">${icon('heart')}</i>` : ''}</button>`).join('')
        : '<p class="mu-muted mu-pad">You have not met anyone yet.</p>'}</div>`;
}

function personApp(g: Save, w: WorldDef) {
    const r = g.cast[P.who]; if (!r) return peopleApp(g);
    const b = bondOf(g, r.avatar); const partner = isPartner(g, r.avatar);
    return `${head(esc(contactName(g, r)), 'people')}<div class="mu-ph-body">
        <div class="mu-ph-profile"><img src="${esc(thumb(r.avatar))}" alt=""><b data-notr>${esc(r.name)}</b>${nicks(g)[r.avatar] ? `<small data-notr>“${esc(nicks(g)[r.avatar])}” in your phone</small>` : ''}<small>${bondLabel(g, r.avatar)}</small>${relBar(r.avatar)}<small>${approvalWord(approvalOf(g, r.avatar))}</small>${feelingsHtml(g, r.avatar)}</div>
        <button data-act="ph-thread" data-who="${esc(r.avatar)}">${icon(MED ? 'send' : 'chat')}<span>${T('writeMessage')}</span></button>
        ${featureOn(w, 'plans') ? planForm(g, w, r.avatar) : ''}
        ${partner ? '<p class="mu-ph-love">You are together.</p>' : b >= PARTNER_BOND && !romanceBlocked(g, P.who) ? '<button data-act="ph-partner">Ask to be together</button>' : ''}
        <p class="mu-muted">Now: ${esc(placeOf(g, w, whereNow(g, w, r))?.name ?? '')}</p>
    </div>`;
}

function jobsApp(g: Save, w: WorldDef) {
    const j = g.player.job; const mine = jobDef(w, j?.id);
    const need = mine && j ? shiftsToPromote(g, mine, j.rank) : null;
    return `${head(appName('jobs'), 'home')}<div class="mu-ph-body">
        ${mine && j ? `<section class="mu-ph-card"><h4>${T('yourJob')}</h4><b>${esc(mine.ranks[j.rank].name)}</b><small>${esc(mine.name)} · ${esc(placeOf(g, w, mine.place)?.name ?? '')}</small>
            <small>${money(w, mine.ranks[j.rank].pay)}/h · ${mine.shift} h shifts · ${String(mine.hours?.[0] ?? 0).padStart(2, '0')}:00–${String(mine.hours?.[1] ?? 24).padStart(2, '0')}:00</small>
            ${need !== null ? `<small>Next rank: ${esc(mine.ranks[j.rank + 1].name)}</small>${bar(Math.min(100, j.shifts / need * 100))}` : '<small>Top rank.</small>'}
            ${likes(g, mine).length ? `<small>Your traits help: ${esc(likes(g, mine).join(', '))}</small>` : ''}
            <button class="mu-danger" data-act="ph-quit">Quit</button></section>` : `<p class="mu-muted">${T('noJob')}</p>`}
        <h4>${T('openings')}</h4>
        ${w.occupations.filter(o => o.id !== j?.id).map(o => `<div class="mu-ph-job"><span><b>${esc(o.name)}</b><small>${esc(placeOf(g, w, o.place)?.name ?? '')} · ${money(w, payOf(g, o.ranks[0].pay))}–${money(w, payOf(g, o.ranks.at(-1)!.pay))}/h</small>
            ${missingCourses(g, w, o).length ? `<small class="mu-bad">Needs the course: ${esc(missingCourses(g, w, o).join(', '))}</small>` : ((o as any).courses ?? []).length ? `<small class="mu-good">Course done ✓</small>` : ''}
            ${o.needs?.length ? `<small class="${fits(g, o) ? 'mu-good' : ''}">Looks for: ${esc(o.needs.join(' / '))}${fits(g, o) ? ' ✓' : ''}</small>` : ''}
            ${missingCourses(g, w, o).length ? '' : `<small>Interview: ${interviewChance(g, o, traitsOf(g))}% chance${triedToday(g, o.id) ? ' · try again tomorrow' : ''}</small>`}</span>
            <button data-act="ph-apply" data-id="${esc(o.id)}" ${missingCourses(g, w, o).length || triedToday(g, o.id) ? 'aria-disabled="true"' : ''}>${T('jobApply')}</button></div>`).join('')}
    </div>`;
}

function bankApp(g: Save, w: WorldDef) {
    const zone = w.homes.zones.find(z => z.id === g.player.home.zone);
    return `${head(appName('bank'), 'home')}<div class="mu-ph-body">
        <section class="mu-ph-card mu-ph-balance"><small>${T('balance')}</small><b>${money(w, g.player.money)}</b></section>
        ${zone?.rent ? `<p>Bills: ${BILLS.filter(b => billAmount(g, w, b.id)).map(b => `${b.name} ${money(w, billAmount(g, w, b.id))}`).join(' · ')} a week · pay them in Homes${BILLS.some(b => owed(g, b.id)) ? ' <b class="mu-bad">(due now)</b>' : ''}</p>` : ''}
        <h4>${T('statement')}</h4>
        <div class="mu-ph-ledger">${ledger(g).map(e => `<div><span>${esc(e.text)}<small>${day(g, e.at)}</small></span><b class="${e.amount < 0 ? 'mu-bad' : 'mu-good'}">${e.amount < 0 ? '−' : '+'}${money(w, Math.abs(e.amount))}</b></div>`).join('') || `<p class="mu-muted">${T('noMovements')}</p>`}</div>
    </div>`;
}

function homesApp(g: Save, w: WorldDef) {
    const pic = (kind: string) => { const im = w.homes.kinds[kind]?.image; return im ? `style="${esc(bgOf(w, im))}"` : ''; };
    const mine = w.homes.zones.find(z => z.id === g.player.home.zone);
    const billBtn = (b: typeof BILLS[number]) => {
        const amount = billAmount(g, w, b.id); if (!amount) return '';
        const n = owed(g, b.id), cut = isCut(g, b.id), left = daysLeft(g, b.id);
        const state = cut ? (b.id === 'rent' ? 'Locked out' : 'Cut off') : n ? 'Due now' : left <= 1 ? 'Due tomorrow' : `Paid · due in ${left} days`;
        return `<button class="mu-bill ${n ? 'is-due' : 'is-paid'} ${cut ? 'is-cut' : ''}" data-act="ph-bill" data-id="${b.id}" ${n ? '' : 'aria-disabled="true"'} title="${n ? `Pay ${money(w, amount * n)}` : 'Paid'}">
            <i>${icon(b.icon)}</i><b>${b.name}</b><span>${money(w, amount * Math.max(1, n))}${n > 1 ? ` (${n} wk)` : ''}</span><small>${state}</small></button>`;
    };
    const anyDue = BILLS.some(b => billAmount(g, w, b.id) && owed(g, b.id));
    return `${head(appName('homes'), 'home')}<div class="mu-ph-body mu-homes">
        <section><h4>My home</h4>
        <article class="mu-home-card is-mine"><span class="mu-home-pic" ${pic(g.player.home.kind ?? mine?.kind ?? '')}></span>
            <div class="mu-home-info"><span><b>${esc(homeAddress(w, g.player.home))}</b><small>${esc(w.homes.kinds[g.player.home.kind ?? mine?.kind ?? '']?.name ?? '')} · your home</small></span></div></article>
        <div class="mu-bills">${BILLS.map(billBtn).join('')}</div>
        <small class="mu-muted">Bills are weekly. One left unpaid for a week is cut off${anyDue ? '' : ''}: no water (shower, tap, cooking), no power (stove, TV, computer), or no home for the rent.</small>
        ${BILLS.filter(b => billAmount(g, w, b.id) && owed(g, b.id)).length > 1 ? `<button class="mu-primary" data-act="ph-bill-all">${icon('wallet')}<span>Pay everything</span></button>` : ''}
        </section>
        <section><h4>Homes for rent</h4>
        ${w.homes.zones.filter(z => z.id !== g.player.home.zone).map(z => {
            const free = freeSpots(g, w, z.id).length;
            const rent = priceOf(g, z.rent), bills = priceOf(g, billsOf(w, z.kind));
            return `<article class="mu-home-card"><span class="mu-home-pic" ${pic(z.kind)}></span>
                <div class="mu-home-info"><span><b>${esc(z.name)}</b><small>${esc(w.homes.kinds[z.kind]?.name ?? z.kind)} · ${money(w, rent)}/wk${bills ? ` + ${money(w, bills)} bills` : ''} · ${free} free</small></span>
                <button class="mu-home-move" data-act="ph-move" data-id="${esc(z.id)}" ${free && g.player.money >= rent ? '' : 'aria-disabled="true"'}>Move</button></div></article>`;
        }).join('')}
        <p class="mu-muted">Moving costs one week of rent in advance; your bills start over in the new home.</p></section>
    </div>`;
}
Object.assign(ACT, {
    'ph-bill': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; const before = owed(g, el.dataset.id as BillId); const msg = payBill(g, w, el.dataset.id as BillId); if (owed(g, el.dataset.id as BillId) < before) { toast(msg || 'Paid.', 'success'); saveGame(); } else toast(msg, 'warn'); notify(); },
    'ph-bill-all': () => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; for (const b of BILLS) if (owed(g, b.id)) { const m = payBill(g, w, b.id); if (m && owed(g, b.id)) { toast(m, 'warn'); break; } } saveGame(); notify(); },
    'ph-open-homes': () => { P.open = true; P.app = 'homes'; notify(); },
});

/* ---------- Chirp: short posts, like Twitter/X ---------- */

const who = (g: Save, by: string) => by === 'me' ? { name: personaName(), img: personaThumb() } : { name: g.cast[by]?.name ?? '?', img: thumb(by) };
function postHtml(g: Save, p: Post, full = false) {
    const a = who(g, p.by);
    return `<article class="mu-ch-post" ${full ? '' : `data-act="ph-post" data-id="${esc(p.id)}"`}>
        <img src="${esc(a.img)}" alt="">
        <div><header><b data-notr>${esc(a.name)}</b><small data-notr>${esc(handleOf(g, p.by))} · ${day(g, p.at)}</small></header>
            <p data-notr>${esc(p.text)}</p>${p.image ? `<img class="mu-ch-img" src="${esc(p.image)}" alt="">` : ''}
            <footer><span>${icon('chat')}${p.replies.length}</span><span>${icon('repost')}${p.reposts}</span>
                <button class="mu-ch-like ${p.liked ? 'is-on' : ''}" data-act="ph-like" data-id="${esc(p.id)}" aria-label="Like">${icon(p.liked ? 'heart' : 'heartLine')}${p.likes}</button></footer>
        </div></article>`;
}
// The medieval notice board: notices pinned by people; answering one means writing its author a letter.
function noteHtml(g: Save, p: Post) {
    const a = who(g, p.by);
    return `<article class="mu-bd-note"><header><img src="${esc(a.img)}" alt=""><b data-notr>${esc(a.name)}</b><small>${day(g, p.at)}</small></header>
        <p data-notr>${esc(p.text)}</p>${p.image ? `<img class="mu-ch-img" src="${esc(p.image)}" alt="">` : ''}
        ${p.by !== 'me' && g.cast[p.by] ? `<button class="mu-bd-write" data-act="ph-thread" data-who="${esc(p.by)}">${icon('send')}<span>Write to them</span></button>` : p.by === 'me' ? '<small class="mu-bd-mine">Your notice</small>' : ''}</article>`;
}
function boardApp(g: Save) {
    const f = feed(g);
    return `${head(appName('social'), 'home')}
        <div class="mu-ph-compose is-top"><input type="text" placeholder="Pin a notice on the board…" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.busy ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-chirp" aria-label="Pin it" title="Pin it" ${P.busy ? 'disabled' : ''}>${icon('pin')}</button></div>
        ${feedPrefs().mode !== 'react' ? `<button class="mu-ghost mu-ch-refresh" data-act="ph-refresh" ${P.busy ? 'disabled' : ''}>${icon('redo')}<span>${P.busy ? 'Reading the board…' : 'Look for new notices'}</span></button>` : ''}
        <div class="mu-bd-board">${f.posts.length ? f.posts.map(p => noteHtml(g, p)).join('') : `<p class="mu-muted mu-pad">${P.busy ? 'Reading the board…' : 'The board is empty.'}</p>`}</div>`;
}
function socialApp(g: Save) {
    if (MED) return boardApp(g);
    const f = feed(g);
    return `${head(appName('social'), 'home')}
        <div class="mu-ph-compose is-top"><input type="text" placeholder="What's happening?" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.busy ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-chirp" aria-label="Post" ${P.busy ? 'disabled' : ''}>${icon('send')}</button></div>
        ${feedPrefs().mode !== 'react' ? `<button class="mu-ghost mu-ch-refresh" data-act="ph-refresh" ${P.busy ? 'disabled' : ''}>${icon('redo')}<span>${P.busy ? 'Loading…' : 'New posts'}</span></button>` : ''}
        <div class="mu-ch-feed">${f.posts.length ? f.posts.map(p => postHtml(g, p)).join('') : `<p class="mu-muted mu-pad">${P.busy ? 'Loading…' : 'Nothing here yet.'}</p>`}</div>`;
}
function postApp(g: Save) {
    const p = feed(g).posts.find(x => x.id === P.post);
    if (!p) return socialApp(g);
    return `${head('Post', 'social')}<div class="mu-ch-feed">${postHtml(g, p, true)}
        ${p.replies.map(r => { const a = who(g, r.by); return `<div class="mu-ch-reply"><img src="${esc(a.img)}" alt=""><div><b data-notr>${esc(a.name)}</b> <small data-notr>${esc(handleOf(g, r.by))}</small><p data-notr>${esc(r.text)}</p></div></div>`; }).join('')}
        ${P.busy ? '<p class="mu-muted mu-pad">…</p>' : ''}</div>
        <div class="mu-ph-compose"><input type="text" placeholder="Reply" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.busy ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-reply" aria-label="Reply" ${P.busy ? 'disabled' : ''}>${icon('send')}</button></div>`;
}

/* ---------- Spark: the dating app ---------- */

function chips(list: string[], on: string[], act: string) {
    return `<div class="mu-chips">${list.map(x => `<button class="mu-chip ${on.includes(x) ? 'is-on' : ''}" data-act="${act}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
}
function datingProfileApp(g: Save, w: WorldDef) {
    const d = dating(g);
    const interests = w.sheet.traits?.find(t => t.id === 'interests')?.options ?? [];
    return `${head(T('yourProfile'), d.profile.ready ? 'dating' : 'home')}<div class="mu-ph-body">
        <div class="mu-ph-profile"><img src="${esc(personaThumb())}" alt=""><b data-notr>${esc(personaName())}</b><small>${g.player.traits ? '' : ''}</small></div>
        <label class="mu-field"><span>${T('profileAbout')}</span><textarea rows="3" data-input="sp-bio" data-focus="sp-bio" placeholder="A line or two about you">${esc(d.profile.bio)}</textarea></label>
        <section><h4>Looking for</h4>${chips(LOOKING, d.profile.looking, 'sp-look')}</section>
        <section><h4>Interests</h4>${chips(interests, d.profile.interests, 'sp-int')}</section>
        <button class="mu-primary" data-act="sp-save" ${d.profile.looking.length ? '' : 'aria-disabled="true"'}>${d.profile.ready ? 'Save' : T('profileStart')}</button>
    </div>`;
}
function datingApp(g: Save, w: WorldDef) {
    const d = dating(g);
    if (!d.profile.ready) return datingProfileApp(g, w);
    if (P.matched) {
        const r = g.cast[P.matched];
        return `${head(appName('dating'), 'home')}<div class="mu-sp-match"><h2>${T('matchTitle')}</h2>
            <div class="mu-sp-pair"><img src="${esc(personaThumb())}" alt=""><img src="${esc(thumb(P.matched))}" alt=""></div>
            ${MED ? `<p>${esc(r?.name ?? '')} would gladly meet you.</p>` : `<p>You and <b data-notr>${esc(r?.name ?? '')}</b> liked each other.</p>`}
            <button class="mu-primary" data-act="ph-thread" data-who="${esc(P.matched)}">${icon(MED ? 'send' : 'chat')}<span>${T('sendMessage')}</span></button>
            <button data-act="sp-next">${T('nextSuitor')}</button></div>`;
    }
    const list = candidates(g, w);
    const r = list[0];
    const top = `<div class="mu-ph-head"><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="home" aria-label="Back">${icon('back')}</button><b>${appName('dating')}</b>
        <span class="mu-row"><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="matches" aria-label="${T('matches')}" title="${T('matches')}">${icon('chat')}</button><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="dprofile" aria-label="${T('yourProfile')}" title="${T('yourProfile')}">${icon('user')}</button></span></div>`;
    if (!r) return `${top}<p class="mu-muted mu-pad">${T('noCandidates')}</p>`;
    const p = theirProfile(w, r);
    const shared = p.interests.filter(i => d.profile.interests.includes(i));
    return `${top}<div class="mu-sp-card"><img src="${esc(thumb(r.avatar))}" alt="">
            <div class="mu-sp-info"><h3 data-notr>${esc(r.name)}</h3><small>${esc(p.looking)}</small>
                <p data-notr>${esc(p.bio)}</p>
                <div class="mu-chips">${p.interests.map(i => `<span class="mu-chip ${shared.includes(i) ? 'is-on' : ''}">${esc(i)}</span>`).join('')}</div></div></div>
        <div class="mu-sp-btns"><button class="mu-sp-no" data-act="sp-swipe" data-who="${esc(r.avatar)}" data-like="0" aria-label="${T('pass')}" title="${T('pass')}">${icon('x')}</button>
            <button class="mu-sp-yes" data-act="sp-swipe" data-who="${esc(r.avatar)}" data-like="1" aria-label="${T('like')}" title="${T('like')}">${icon('heart')}</button></div>`;
}
function matchesApp(g: Save) {
    const d = dating(g);
    return `${head(T('matches'), 'dating')}<div class="mu-ph-list">${d.matches.length ? d.matches.map(a => `<button class="mu-ph-row" data-act="ph-thread" data-who="${esc(a)}"><img src="${esc(thumb(a))}" alt=""><span><b data-notr>${esc(g.cast[a]?.name ?? '')}</b><small>${bondLabel(g, a)}</small></span></button>`).join('') : `<p class="mu-muted mu-pad">${T('noMatches')}</p>`}</div>`;
}

async function refreshFeed(g: Save, w: WorldDef, force = false) {
    if (P.busy || (!force && !shouldPost(g, 'open'))) return;
    P.busy = true; notify();
    try { await generatePosts(g, w); } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    P.busy = false; saveGame(); notify();
}
// The clock calls this: in "characters post on their own" mode, new posts every few game hours.
let autoBusy = false;
export function feedTick() {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || autoBusy || !w.features?.phone || !shouldPost(g, 'auto')) return;
    autoBusy = true;
    generatePosts(g, w, 2).then(n => { if (n) { saveGame(); notify(); } }).catch(() => { /* the AI may be offline */ }).finally(() => { autoBusy = false; });
}

export function phoneHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (!P.open || !g || !w) { turn.opened = 0; return ''; }
    MED = styleOf(w) === 'medieval'; LW = w;
    const body = P.app === 'messages' ? messagesApp(g) : P.app === 'thread' ? threadApp(g) : P.app === 'people' ? peopleApp(g) : P.app === 'person' ? personApp(g, w)
        : P.app === 'jobs' ? jobsApp(g, w) : P.app === 'bank' ? bankApp(g, w) : P.app === 'homes' ? homesApp(g, w)
        : P.app === 'social' ? socialApp(g) : P.app === 'post' ? postApp(g) : P.app === 'dating' ? datingApp(g, w) : P.app === 'dprofile' ? datingProfileApp(g, w) : P.app === 'matches' ? matchesApp(g) : P.app === 'plans' ? calendarApp(g, w, head(appName('plans'), 'home')) : P.app === 'journal' ? journalApp(g, w, head(appName('journal'), 'home')) : P.app === 'shop' ? shopApp(g, w, head(appName('shop'), 'home')) : P.app === 'goals' ? goalsApp(g, w, head(appName('goals'), 'home')) : P.app === 'settings' ? settingsApp() : P.app === 'profile' ? profileApp(g, w, head('Profile', 'home')) : styleOf(w) === 'medieval' ? bookFront(g, w) : homeApp(g, w);
    if (styleOf(w) === 'medieval') return bookHtml(g, w, body);
    const unread = phoneUnread();
    return `<div class="mu-phone" role="dialog" aria-label="Phone"><div class="mu-ph-status">
            <span class="mu-ph-left"><b>${hm(g.minutes)}</b>${unread ? `<i class="mu-ph-notif" title="${unread}">${icon('chat')}</i>` : ''}</span>
            <span class="mu-ph-right">${SIGNAL}${icon('wifi')}<span class="mu-ph-batt"><small>100%</small><i><b></b></i></span></span></div>
        <div class="mu-ph-screen ${wallpaper() ? 'has-bg' : ''}" data-keep="ph-screen" style="${wallpaper() ? `--ph-bg:${esc(cssUrl(wallpaper()))}` : ''}">${body}</div>
        <button class="mu-ph-close" data-act="ph-close" aria-label="Close the phone"></button></div>`;
}
/* ---------- the medieval journal: an open book, contents on the left, the chosen section on the right ---------- */

// The ribbons painted on the book image (top of each, in % of the book's height).
const RIBBONS = [18.6, 27, 35.3, 43.6, 52, 60, 68.5, 76.8];
const TURN_MS = 650;
const turn = { app: '' as string, at: 0, back: false, opened: 0 };
const OPEN_MS = 350;
// Which section a view belongs to, so moving inside one (a thread inside Letters) does not turn the page.
const sectionOf = (a: App): string => (a === 'thread' ? 'messages' : a === 'person' ? 'people' : a === 'post' ? 'social' : a === 'dprofile' || a === 'matches' ? 'dating' : a);

function bookHtml(g: Save, w: WorldDef, body: string): string {
    const apps = APPS(w);
    const sec = sectionOf(P.app);
    const order = (id: string) => (id === 'home' ? -1 : apps.findIndex(a => a[0] === id));
    if (turn.app && turn.app !== sec) { turn.back = order(sec) < order(turn.app); turn.at = Date.now(); }
    turn.app = sec;
    if (!turn.opened) { turn.opened = Date.now(); turn.at = 0; }
    const o = Date.now() - turn.opened;
    const opening = o < OPEN_MS ? ` is-opening" style="--open-delay:-${o}ms` : '';
    // A turn keeps going across re-renders (the clock re-draws the screen every few seconds).
    const t = Date.now() - turn.at;
    const leaf = t < TURN_MS ? `<i class="mu-bk-leaf ${turn.back ? 'is-back' : ''}" style="animation-delay:-${t}ms"></i>` : '';
    const unread = Object.values(social(g).unread).reduce((a, b) => a + b, 0);
    const badge = (id: string) => (id === 'messages' && unread ? `<em>${unread}</em>` : id === 'plans' && plansBadge(g) ? `<em>${plansBadge(g)}</em>` : '');
    const left = `<header class="mu-bk-title"><small>${esc(w.features?.device ?? 'Journal')}</small><b data-notr>${esc(personaName())}</b>
            <span>${esc(weekday(g.day))} · Day ${g.day + 1} · ${hm(g.minutes % 1440)}</span><span class="mu-bk-purse">${icon('wallet')}${money(w, g.player.money)}</span></header>
        <h4 class="mu-bk-h">Contents</h4>
        <ol class="mu-bk-toc">${apps.map(([id, name, ic]) => `<li><button class="${sec === id ? 'is-here' : ''}" data-act="ph-go" data-app="${id}">${icon(ic)}<span>${esc(name)}</span><i></i>${badge(id)}</button></li>`).join('')}</ol>`;
    return `<div class="mu-bk-wrap${opening}" data-act="bk-bg"><div class="mu-book ${P.app === 'home' ? 'is-home' : ''}" role="dialog" aria-label="${esc(w.features?.device ?? 'Journal')}">
        <div class="mu-bk-page is-left" data-keep="bk-left">${left}</div>
        <div class="mu-bk-page is-right mu-ph-screen ${t < TURN_MS ? 'is-turning' : ''}" data-keep="ph-screen" style="--turn-delay:-${Math.min(t, TURN_MS)}ms">${body}</div>
        ${leaf}
        <nav class="mu-bk-ribbons">${apps.slice(0, RIBBONS.length).map(([id, name, ic], i) => `<button class="mu-bk-ribbon ${sec === id ? 'is-here' : ''}" style="top:${RIBBONS[i]}%" data-act="ph-go" data-app="${id}" title="${esc(name)}">${icon(ic)}<span>${esc(name)}</span>${badge(id)}</button>`).join('')}</nav>
        <button class="mu-bk-close" data-act="ph-close" aria-label="Close the journal" title="Close">${icon('x')}</button>
    </div></div>`;
}
// The journal's first page: who you are meeting soon.
function bookFront(g: Save, w: WorldDef) {
    const next = upcoming(g).slice(0, 5);
    return `<div class="mu-bk-front"><h3>Days to come</h3>
        ${next.length ? `<ul class="mu-bk-list">${next.map(a => `<li><b data-notr>${esc(g.cast[a.avatar]?.name ?? '')}</b><span>${esc(whenText(g, a.from))}${a.place ? ` · ${esc(placeOf(g, w, a.place)?.name ?? '')}` : ''}</span></li>`).join('')}</ul>`
            : '<p class="mu-muted">Nothing written for the days to come. Send a letter to arrange a meeting.</p>'}
        <p class="mu-bk-flourish">❦</p></div>`;
}

// On the notice board nobody scribbles below your notice: whoever answers sends you a letter.
function lettersFromNotice(g: Save, post: Post) {
    const s = social(g);
    for (const r of post.replies) {
        (s.threads[r.by] ??= []).push({ me: false, text: r.text, at: r.at });
        if (!(P.open && P.app === 'thread' && P.who === r.by)) s.unread[r.by] = (s.unread[r.by] ?? 0) + 1;
        toast(lex(getWorld(g.world), 'newMessage', g.cast[r.by]?.name ?? ''), 'info');
    }
    post.replies = [];
}

export const phoneUnread = () => { const g = game(); return g ? Object.values(social(g).unread).reduce((a, b) => a + b, 0) : 0; };

Object.assign(ACT, {
    phone: () => { P.open = !P.open; if (P.open && P.app === 'thread' && !P.who) P.app = 'home'; notify(); },
    'ph-close': () => { P.open = false; notify(); },
    'ph-help': () => openHelp(),
    'bk-bg': (el, e) => { if (e.target === el) { P.open = false; notify(); } },
    'ph-go': (el) => {
        P.app = el.dataset.app as App; P.draft = ''; P.matched = ''; P.q = '';
        if (P.app === 'journal') openJournal();
        if (P.app === 'dating') { const g = game(); if (g) (dating(g) as any).seed = Math.random().toString(36).slice(2); }   // a new shuffle of Spark
        notify();
        const g = game(); const w = g && getWorld(g.world);
        if (P.app === 'social' && g && w) refreshFeed(g, w);
    },
    // Chirp
    'ph-refresh': () => { const g = game(); const w = g && getWorld(g.world); if (g && w) refreshFeed(g, w, true); },
    'ph-post': (el, e) => { if ((e.target as HTMLElement).closest('[data-act="ph-like"]')) return; P.post = el.dataset.id!; P.app = 'post'; P.draft = ''; notify(); },
    'ph-like': (el, e) => { e.stopPropagation(); const g = game(); if (!g) return; const p = feed(g).posts.find(x => x.id === el.dataset.id); if (p) { toggleLike(g, p); saveGame(); notify(); } },
    'ph-chirp': async () => {
        const g = game(); const w = g && getWorld(g.world); const text = P.draft.trim();
        if (!g || !w || !text || P.busy) return;
        P.draft = ''; P.busy = true; notify();
        try {
            const post = await postAsMe(g, w, text);
            if (styleOf(w) === 'medieval') lettersFromNotice(g, post);
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        P.busy = false; saveGame(); notify();
    },
    'ph-reply': async () => {
        const g = game(); const text = P.draft.trim(); const p = g && feed(g).posts.find(x => x.id === P.post);
        if (!g || !p || !text || P.busy) return;
        P.draft = ''; P.busy = true; notify();
        try { const w = getWorld(g.world); if (w) await replyTo(g, w, p, text); } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        P.busy = false; saveGame(); notify();
    },
    // Spark
    'sp-look': (el) => { const g = game(); if (!g) return; const l = dating(g).profile.looking; const v = el.dataset.v!; const i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.push(v); notify(); },
    'sp-int': (el) => { const g = game(); if (!g) return; const l = dating(g).profile.interests; const v = el.dataset.v!; const i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.length < 5 && l.push(v); notify(); },
    'sp-save': () => { const g = game(); if (!g) return; const d = dating(g); if (!d.profile.looking.length) { toast('Choose what you are looking for.', 'info'); return; } d.profile.ready = true; P.app = 'dating'; saveGame(); notify(); },
    'sp-swipe': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const matched = swipe(g, w, el.dataset.who!, el.dataset.like === '1');
        if (matched) P.matched = el.dataset.who!;
        saveGame(); notify();
    },
    'sp-next': () => { P.matched = ''; notify(); },
    'ph-quick': async (el) => { P.draft = await translateTo(el.dataset.text ?? ''); ACT['ph-send']?.(el, new Event('click')); },
    'ph-thread': (el) => { P.who = el.dataset.who!; P.app = 'thread'; P.draft = ''; notify(); },
    'ph-person': (el) => { P.who = el.dataset.who!; P.app = 'person'; notify(); },
    'ph-send': async () => {
        const g = game(); const w = g && getWorld(g.world);
        const text = P.draft.trim(); const who = P.who;
        if (!g || !w || !text || !who || P.typing) return;
        P.draft = ''; P.typing = who; notify();
        try {
            const reply = await sendText(g, w, who, text);
            if (!reply) toast('No answer (is the AI connected?).', 'warn');
            else if (!(P.open && P.app === 'thread' && P.who === who)) { social(g).unread[who] = (social(g).unread[who] ?? 0) + 1; toast(lex(getWorld(g.world), 'newMessage', g.cast[who]?.name ?? ''), 'info'); }
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        P.typing = ''; saveGame(); notify();
    },
    'ph-partner': () => {
        const g = game(); if (!g) return;
        if (bondOf(g, P.who) < PARTNER_BOND || romanceBlocked(g, P.who)) return;
        social(g).partner.push(P.who);
        romOf(g, P.who).status = 'dating';
        note(g, '{u} and {0} became a couple.', [g.cast[P.who]?.name ?? ''], [P.who], g.player.loc, 'love');
        feel(g, P.who, 'In love', 7);
        toast(`${g.cast[P.who]?.name} said yes!`, 'success'); saveGame(); notify();
    },
    'ph-apply': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        if (g.player.job) { toast('Quit your current job first.', 'info'); return; }
        const r = hire(g, w, el.dataset.id!);
        toast(r.text, r.ok ? 'success' : 'warn'); saveGame(); notify();
    },
    'ph-quit': () => { const g = game(); if (!g) return; quitJob(g, getWorld(g.world) ?? undefined); toast('You quit your job.', 'info'); saveGame(); notify(); },
    'ph-move': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const err = moveTo(g, w, el.dataset.id!);
        if (err) { toast(err, 'warn'); return; }
        toast(`You moved to ${homeAddress(w, g.player.home)}.`, 'success'); saveGame(); notify();
    },
});
Object.assign(INPUT, {
    'ph-draft': (el) => { P.draft = el.value; },
    'ph-q': (el) => { P.q = el.value; notify(); },
    'sp-bio': (el) => { const g = game(); if (g) dating(g).profile.bio = el.value; },
});
