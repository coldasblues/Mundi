// Courses (a window in the middle of the screen, like Help) and the phone's Profile app: what you know, the courses
// you took, your life goals and your career, like a professional profile page.
import { hobbiesHtml } from './cityui.js';
import { lex, appRef } from '../core/lexicon.js';
import { esc, game, notify, saveGame, toast, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { personaName, personaThumb } from '../st/bridge.js';
import { money } from '../sim/needs.js';
import { priceOf } from '../sim/bills.js';
import { coursesOf, courseOf, learning, enroll, dropCourse, canStudyHere, studiedToday, countOf } from '../sim/skills.js';
import { jobDef, traitsOf, rankOf } from '../sim/work.js';
import { ASPIRATIONS, lifeOf } from '../sim/life.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';

const CS = { open: false, area: '' };
export const openCourses = () => { CS.open = true; notify(); };

// "Things to do": take a course (where you can study), or how the current one is going.
export function courseRow(g: Save, w: WorldDef): string {
    if (!coursesOf(w).length || !canStudyHere(g, w)) return '';
    const l = learning(g); const c = courseOf(w, l.current);
    if (c && studiedToday(g, c.id)) return `<button class="mh-act mh-glass" data-act="course-open"><i>${c.icon || '📚'}</i><b>${esc(c.name)}</b><small>Studied today · day ${l.progress[c.id] ?? 0} of ${c.days}</small></button>`;
    if (c) return '';   // the study action is in the list
    return `<button class="mh-act mh-glass" data-act="course-open"><i>🎓</i><b>${lex(w, 'takeCourse')}</b><small>Learn a skill in a few days</small></button>`;
}

export function coursesHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (!CS.open || !g || !w) return '';
    const l = learning(g); const all = coursesOf(w);
    const areas = [...new Set(all.map(c => c.area))];
    const list = all.filter(c => !CS.area || c.area === CS.area);
    const forJobs = (id: string) => w.occupations.filter(o => ((o as any).courses ?? []).includes(id)).map(o => o.name);
    const cur = courseOf(w, l.current);
    return `<div class="mu-recap-veil mu-help-veil" data-act="course-bg"><section class="mu-recap mh-glass mu-help mu-courses" role="dialog" aria-label="${esc(lex(w, 'courses'))}">
        <header class="mu-row"><div><small>${lex(w, 'courses')}</small><h3>What do you want to learn?</h3></div><button class="mu-ibtn mu-ghost mu-right" data-act="course-close" aria-label="Close">${icon('x')}</button></header>
        ${cur ? `<p class="mu-course-now">${cur.icon} Taking <b>${esc(cur.name)}</b>: day ${l.progress[cur.id] ?? 0} of ${cur.days}. Study once a day, ${lex(w, 'studyWhere')}. <button class="mu-ghost" data-act="course-drop">Drop it</button></p>` : `<p class="mu-muted">Pay once, then study a little each day (2 h, ${lex(w, 'studyWhere')}). Each day counts once. When you finish, you learn its traits for good: they help in every roll, and some jobs ask for a course.</p>`}
        <div class="mu-chips">${['', ...areas].map(a => `<button class="mu-chip ${CS.area === a ? 'is-on' : ''}" data-act="course-area" data-v="${esc(a)}">${a || 'All'}</button>`).join('')}</div>
        <div class="mu-course-grid">${list.map(c => {
            const done = l.done.includes(c.id), on = l.current === c.id, jobs = forJobs(c.id);
            const price = priceOf(g, c.cost);
            return `<article class="mu-course ${done ? 'is-done' : ''} ${on ? 'is-on' : ''}">
                <header><i>${c.icon}</i><span><b>${esc(c.name)}</b><small>${esc(c.area)} · ${c.days} day${c.days === 1 ? '' : 's'} · ${money(w, price)}</small></span></header>
                <p>${esc(c.desc)}</p>
                ${jobs.length ? `<small class="mu-muted">${lex(w, 'neededFor')}: ${esc(jobs.join(', '))}</small>` : ''}
                <div class="mu-chips">${c.grants.map(t => `<span class="mu-chip is-on">+ ${esc(t)}</span>`).join('')}</div>
                ${done ? '<em>✓ Finished</em>' : on ? `<em>In progress · ${l.progress[c.id] ?? 0}/${c.days}</em>`
                    : `<button class="mu-primary" data-act="course-enroll" data-id="${esc(c.id)}" ${l.current || g.player.money < price ? 'aria-disabled="true"' : ''} title="${l.current ? lex(w, 'finishCourse') : g.player.money < price ? 'Not enough money' : ''}">Enroll · ${money(w, price)}</button>`}
            </article>`;
        }).join('')}</div>
    </section></div>`;
}

/* ---------- the Profile app ---------- */

const TRAIT_GROUPS = (w: WorldDef): [string, string][] => [['proficiency', 'Skills'], ['personality', 'Personality'], ['interests', 'Interests'], ['learned', lex(w, 'learnedIn')], ['earned', 'Earned with life goals'], ['education', 'Education']];
export function profileApp(g: Save, w: WorldDef, head: string): string {
    const l = learning(g); const life = lifeOf(g);
    const t = (g.player.traits ?? {}) as Record<string, string[]>;
    const j = g.player.job; const o = j && jobDef(w, j.id);
    const groups = TRAIT_GROUPS(w).filter(([k]) => (t[k] ?? []).length);
    const other = Object.keys(t).filter(k => !TRAIT_GROUPS(w).some(([x]) => x === k) && (t[k] ?? []).length);
    const goals = ASPIRATIONS.filter(a => (life.aspDone ?? []).includes(a.id));
    const cur = courseOf(w, l.current);
    return `${head}<div class="mu-ph-body mu-profile">
        <section class="mu-pf-top"><div class="mu-pf-cover"></div><img src="${esc(personaThumb())}" alt=""><b data-notr>${esc(personaName())}</b>
            <small>${o ? `${esc(rankOf(g, o).name)} · ${esc(o.name)}` : lex(w, 'openToWork')}</small>
            <span class="mu-pf-stats"><span><b>${traitsOf(g).length}</b><small>traits</small></span><span><b>${l.done.length}</b><small>${lex(w, 'coursesShort')}</small></span><span><b>${goals.length}</b><small>goals</small></span><span><b>${Math.round(countOf(g, 'shifts'))}</b><small>shifts</small></span></span></section>
        <section><h4>${icon('briefcase')} Experience</h4>${o ? `<div class="mu-pf-row"><b>${esc(o.name)}</b><small>${esc(rankOf(g, o).name)} · rank ${j!.rank + 1} of ${o.ranks.length}</small></div>` : `<p class="mu-muted">${lex(w, 'noJobYet', appRef(w, 'jobs'))}</p>`}</section>
        <section><h4>${icon('star')} Skills and traits</h4><p class="mu-muted">Each trait that fits what you do is +2 on its roll (interviews, cooking, workouts…).</p>
            ${[...groups, ...other.map(k => [k, k[0].toUpperCase() + k.slice(1)] as [string, string])].map(([k, name]) => `<div class="mu-pf-group"><small>${esc(name)}</small><div class="mu-chips">${(t[k] ?? []).map(x => `<span class="mu-chip ${k === 'learned' || k === 'earned' ? 'is-on' : ''}">${esc(x)}</span>`).join('')}</div></div>`).join('') || '<p class="mu-muted">No traits yet.</p>'}
        </section>
        <section><h4>${icon('book')} ${lex(w, 'courses')}</h4>
            ${cur ? `<div class="mu-pf-row"><b>${cur.icon} ${esc(cur.name)}</b><small>In progress · day ${l.progress[cur.id] ?? 0} of ${cur.days}${studiedToday(g, cur.id) ? ' · studied today' : ''}</small><span class="mu-bond"><i style="width:${Math.round(((l.progress[cur.id] ?? 0) / cur.days) * 100)}%"></i></span></div>` : ''}
            ${l.done.map(id => courseOf(w, id)).filter(Boolean).map(c => `<div class="mu-pf-row"><b>${c!.icon} ${esc(c!.name)}</b><small>✓ Finished · ${esc(c!.grants.join(', '))}</small></div>`).join('')}
            ${!cur && !l.done.length ? `<p class="mu-muted">${lex(w, 'noCourses')}</p>` : ''}
            <button class="mu-primary" data-act="course-open">${icon('plus')}<span>${lex(w, 'browseCourses')}</span></button></section>
        <section><h4>${icon('heart')} Life goals reached</h4>${goals.map(a => `<div class="mu-pf-row"><b>${esc(a.name)}</b><small>${a.reward ? `Earned: ${esc(a.reward)}` : esc(a.desc)}</small></div>`).join('') || `<p class="mu-muted">${lex(w, 'noGoalYet', appRef(w, 'goals'))}</p>`}</section>
        ${hobbiesHtml(g, w)}
        <section><h4>${icon('bolt')} Activity</h4><small class="mu-muted">Fitness ${life.fitness}/100 · ${countOf(g, 'meals')} meals cooked · ${countOf(g, 'workouts')} good workouts · ${countOf(g, 'parties')} parties</small></section>
    </div>`;
}

Object.assign(ACT, {
    'course-open': () => openCourses(),
    'course-close': () => { CS.open = false; notify(); },
    'course-bg': (el, e) => { if (e.target === el) { CS.open = false; notify(); } },
    'course-area': (el) => { CS.area = el.dataset.v ?? ''; notify(); },
    'course-enroll': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const err = enroll(g, w, el.dataset.id!);
        if (err) { toast(err, 'warn'); return; }
        toast(`Enrolled: ${courseOf(w, el.dataset.id!)?.name}. Study once a day, ${lex(w, 'studyWhere')}.`, 'success');
        CS.open = false; saveGame(); notify();
    },
    'course-drop': () => { const g = game(); if (!g) return; dropCourse(g); toast('You dropped the course. What you studied is kept if you take it again.', 'info'); saveGame(); notify(); },
});
