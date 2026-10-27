// The Journal: the facts the game noted, in order, stamped with day, time and place. Nothing here is written by
// the AI; asked, the AI only rewrites one day's list as a first-person diary entry (kept for that day).
import { esc, game, toast, notify, saveGame, type Save } from '../core/store.js';
import { getWorld, systemOn, deviceLook, type WorldDef } from '../core/world.js';
import { tr } from '../core/tr.js';
import { lex } from '../core/lexicon.js';
import { weekday, WEEKDAYS, SEASONS, seasonDays } from '../sim/time.js';
import { writeDiary, diaryShown } from '../sim/diary.js';
import { icon } from './icons.js';
import { diaryTtsButton } from './addons.js';
import { fmtClock as hm } from '../core/fmt.js';
import { facts, fill, factText, placeName, note, type Fact } from '../sim/facts.js';
import { quiet, personaName, chat } from '../st/bridge.js';
import { presentAt } from '../sim/people.js';
import { heardRumors, rumorSource } from '../sim/living.js';
import { ACT } from './reg.js';

// A fact as the player reads it, in the interface language.
export const factUi = (f: Fact) => fill(tr(f.t), (f.a ?? []).map(x => tr(x)), tr('You'));
export function stamp(g: Save, w: WorldDef, f: Fact) {
    const d = Math.floor(f.at / 1440);
    return `${tr(weekday(d))} · ${tr('Day')} ${d} · ${hm(f.at % 1440)} · ${tr(placeName(g, w, f.place))}`;
}
const prose = (g: Save): Record<string, string> => (((g as any).journalProse ??= {}) as Record<string, string>);
let busy = -1;

// The Journal is a calendar: one page per season, a day with something written is marked, and the chosen day shows
// its diary entry first, with the notes of that day (the facts) under it.
const J = { day: 0, page: -1, notes: false, rumors: false };
// What you have heard around town (the rumor pool), newest first.
function rumorsHtml(g: Save, w: WorldDef) {
    const list = systemOn(w, 'rumors') ? heardRumors(g) : [];
    if (!list.length) return '';
    const shown = J.rumors ? list : list.slice(0, 3);
    return `<section class="mu-jr-rumors"><h4>${esc(lex(w, 'heardAround'))} <small class="mu-muted">${list.length}</small></h4>
        <ul>${shown.map(r => `<li><span data-notr>${esc(r.text)}</span><small>Day ${Math.floor((r.heard ?? r.at) / 1440)}${rumorSource(r) ? ` · ${esc(rumorSource(r))}` : ''}</small></li>`).join('')}</ul>
        ${list.length > 3 ? `<button class="mu-ghost" data-act="jr-rumors">${icon(J.rumors ? 'up' : 'down')}<span>${J.rumors ? 'Fewer' : `All ${list.length}`}</span></button>` : ''}</section>`;
}
const dayOf = (f: Fact) => Math.floor(f.at / 1440);

// the day shown when the app opens: today if it has an entry, else the last day with one, else today
function defaultDay(g: Save) {
    const p = prose(g);
    if (p[g.day]) return g.day;
    const written = Object.keys(p).map(Number).filter(d => d <= g.day && p[d]);
    return written.length ? Math.max(...written) : g.day;
}
export function openJournal() { J.day = 0; J.page = -1; J.notes = false; }

// The journal of a medieval world (a book): days in Roman numerals, old names for the days of the week.
const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number) => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; };
const OLD_DAYS = ['Moon', 'Tiw', 'Woden', 'Thor', 'Frey', 'Saturn', 'Sun'];
export function journalApp(g: Save, w: WorldDef, head: string): string {
    const book = deviceLook(w) === 'book';
    const num = (n: number) => (book ? roman(n) : String(n));
    const list = facts(g);
    const sd = seasonDays(g);
    const day = J.day > 0 && J.day <= g.day ? J.day : defaultDay(g);
    const page = J.page >= 0 ? J.page : Math.floor((day - 1) / sd);
    const lastPage = Math.floor((g.day - 1) / sd);
    const first = page * sd + 1, last = first + sd - 1;
    const season = SEASONS[page % 4], year = Math.floor(page / 4) + 1;
    const noted = new Set(list.map(dayOf));
    const p = prose(g);
    // the grid starts on a Monday: blank cells before the season's first day
    const lead = (first - 1) % 7;
    const cells: string[] = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="mu-jc-cell is-blank"></span>');
    for (let d = first; d <= last; d++) {
        const cls = [d === day ? 'is-sel' : '', d === g.day ? 'is-today' : '', d > g.day ? 'is-future' : '', p[d] ? 'has-entry' : noted.has(d) ? 'has-notes' : ''].filter(Boolean).join(' ');
        cells.push(d > g.day ? `<span class="mu-jc-cell ${cls}"><b>${num(d)}</b></span>`
            : `<button class="mu-jc-cell ${cls}" data-act="jr-day" data-day="${d}" title="${esc(weekday(d))} · Day ${d}"><b>${num(d)}</b><i></i></button>`);
    }
    const items = list.filter(f => dayOf(f) === day);
    const dOn = systemOn(w, 'diary');   // diary off: only the notes of what happened
    const text = dOn && p[day] ? diaryShown(g, day) : '';
    const canWrite = dOn && (items.length > 0 || day === g.day);
    const open = J.notes || !dOn;
    const writeLabel = day === g.day ? (text ? 'Write today again' : 'Write today so far') : text ? 'Write it again from the notes' : lex(w, 'readAsProse');
    return `${head}<div class="mu-ph-body mu-journal">
        <section class="mu-jcal ${book ? 'is-book' : ''}">
            <header class="mu-jc-head">
                <button class="mu-ghost mu-icon-btn" data-act="jr-page" data-p="${page - 1}" ${page <= 0 ? 'disabled' : ''} title="Previous season">${icon('back')}</button>
                <b>${book ? '' : `${season.icon} `}${esc(season.name)} <small>${book ? `in the year ${roman(year)}` : `Year ${year}`}</small></b>
                <button class="mu-ghost mu-icon-btn mu-jc-next" data-act="jr-page" data-p="${page + 1}" ${page >= lastPage ? 'disabled' : ''} title="Next season">${icon('back')}</button>
            </header>
            <div class="mu-jc-week">${(book ? OLD_DAYS : WEEKDAYS.map(d => d.slice(0, 3))).map(d => `<small>${d}</small>`).join('')}</div>
            <div class="mu-jc-grid">${cells.join('')}</div>
        </section>
        <section class="mu-jr-day">
            <h4>${esc(weekday(day))} · <span>${book ? `Day ${roman(day)}` : `Day ${day}`}</span>${day === g.day ? ' <small class="mu-muted">today</small>' : ''}</h4>
            ${text ? `<blockquote class="mu-jr-prose" data-notr>${esc(text)}</blockquote>${diaryTtsButton(day)}` : !dOn ? (items.length ? '' : '<p class="mu-muted">Nothing happened this day.</p>') : `<p class="mu-muted">${day === g.day ? 'Today\'s entry is written when you go to sleep.' : items.length ? 'No diary entry for this day.' : 'Nothing happened this day.'}</p>`}
            ${canWrite ? `<button class="mu-ghost mu-jr-btn" data-act="jr-prose" data-day="${day}" ${busy >= 0 ? 'disabled' : ''}>${icon('pen')}<span>${busy === day ? 'Writing…' : esc(writeLabel)}</span></button>` : ''}
            ${items.length ? `${dOn ? `<button class="mu-ghost mu-jr-notes-btn" data-act="jr-notes">${icon(J.notes ? 'up' : 'down')}<span>What happened (${items.length})</span></button>` : ''}
            ${open ? `<ol class="mu-jr-list">${items.map(f => `<li><small>${hm(f.at % 1440)} · ${esc(tr(placeName(g, w, f.place)))}</small><span data-notr>${esc(factUi(f))}</span></li>`).join('')}</ol>` : ''}` : ''}
        </section>
        ${rumorsHtml(g, w)}
    </div>`;
}

Object.assign(ACT, {
    'jr-day': (el) => { J.day = Number(el.dataset.day); notify(); },
    'jr-page': (el) => {
        const g = game(); if (!g) return;
        const sd = seasonDays(g); J.page = Math.max(0, Number(el.dataset.p));
        // choose a day on that page: the last one with something, else its first day
        const first = J.page * sd + 1, last = Math.min(first + sd - 1, g.day);
        const p = prose(g); let pick = first;
        for (let d = last; d >= first; d--) if (p[d] || facts(g).some(f => dayOf(f) === d)) { pick = d; break; }
        J.day = pick; notify();
    },
    'jr-notes': () => { J.notes = !J.notes; notify(); },
    'jr-rumors': () => { J.rumors = !J.rumors; notify(); },
    // the diary entry of a day: today from the facts and today's conversation; a past day from its facts only
    'jr-prose': async (el) => {
        const g = game(); const w = g && getWorld(g.world);
        if (!g || !w || busy >= 0) return;
        const d = Number(el.dataset.day);
        busy = d; notify();
        try {
            if (d === g.day) {
                const res = await writeDiary(g, w, d, false);
                if (!res.ok) toast('Nothing to write about yet.', 'info');
            } else {
                const items = facts(g).filter(f => dayOf(f) === d);
                if (items.length) {
                    const me = personaName();
                    const lines = items.map(f => `- ${hm(f.at % 1440)}, ${placeName(g, w, f.place)}: ${factText(f, me)}`).join('\n');
                    const out = await quiet(`These are the facts of one day in ${me}'s life in ${w.name}:\n${lines}\n\nRewrite them as ${me}'s short diary entry for that day, in the first person, in one paragraph. Every fact must be in it, especially relationship moments (asking someone out, proposals, breakups). Add nothing that is not in the list. Reply with the entry only.`, 400,
                        'You rewrite lists of facts as short diary entries. You never invent events and never leave one out.');
                    if (out.trim()) prose(g)[d] = out.trim();
                }
            }
            saveGame();
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        busy = -1; notify();
    },
    // "Remember this": a line of the scene becomes a fact for the people here
    'remember-line': (el) => {
        const g = game(); const w = g && getWorld(g.world);
        const m = chat()[Number(el.dataset.i)];
        if (!g || !w || !m) return;
        const text = String(m.mes ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        const here = presentAt(g, w, g.player.loc);
        const who = here.map(r => r.avatar);
        const speaker = m.is_user ? '{u}' : String(m.name ?? '');
        note(g, `${speaker === '{u}' ? '{u}' : '{0}'} said: "{1}"`, [speaker === '{u}' ? '' : speaker, text.length > 180 ? `${text.slice(0, 177)}…` : text], who, g.player.loc, 'said');
        saveGame(); toast(tr('Kept in the journal.'), 'success');
    },
});
