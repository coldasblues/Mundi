import { systemOn } from '../core/world.js';
import { onDay } from './hooks.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { bondOf, bump, addBond } from './social.js';
import { approve, setTie } from './living.js';
import { addStatus } from './needs.js';
import { isRpg, sheetOf, skillBonus, skillOf } from './rpg.js';
import { traitsOf } from './work.js';
export const MAX_MENTEES = 2, MENTOR_BOND = 50, LESSON_MINUTES = 60, LESSON_COST = 3;
export const menteesOf = (g) => (g.mentees ??= []);
const on = (w) => systemOn(w, 'mentors');
const isKid = (g, a) => (g.family?.kids ?? []).some((k) => k.avatar === a);
// What you can teach: your trained skills (RPG) or your interests and talents (Life-Sim).
export function teachable(g, w) {
    const s = isRpg(w) ? sheetOf(g) : null;
    if (s)
        return s.skills.map(id => [id, skillOf(w, id)?.name ?? id]);
    return [...new Set(traitsOf(g))].map(t => [t, t]);
}
export function canMentor(g, w, avatar) {
    const r = g.cast[avatar];
    if (!on(w))
        return 'Off in this world.';
    if (!r || !r.met || isKid(g, avatar))
        return 'They cannot be your apprentice.';
    if (menteesOf(g).some(m => m.avatar === avatar))
        return 'Already your apprentice.';
    if (menteesOf(g).filter(m => !m.done).length >= MAX_MENTEES)
        return `You can teach ${MAX_MENTEES} apprentices at a time.`;
    if (bondOf(g, avatar) < MENTOR_BOND)
        return 'They do not trust you enough yet.';
    if (!teachable(g, w).length)
        return 'You have nothing to teach yet.';
    return '';
}
export function takeApprentice(g, w, avatar, area) {
    const why = canMentor(g, w, avatar);
    if (why)
        return why;
    if (!teachable(g, w).some(([id]) => id === area))
        return 'You cannot teach that.';
    menteesOf(g).push({ avatar, area, progress: 0, since: g.day, last: g.day });
    note(g, '{u} took {0} as an apprentice, to teach them {1}.', [g.cast[avatar].name, areaName(w, area)], [avatar], g.player.loc, 'meet');
    return `${g.cast[avatar].name} is your apprentice now.`;
}
export const areaName = (w, area) => skillOf(w, area)?.name ?? area;
// A lesson, with them here: progress by how good you are at it.
export function lesson(g, w, avatar, here) {
    const m = menteesOf(g).find(x => x.avatar === avatar && !x.done);
    const r = g.cast[avatar];
    if (!m || !r)
        return { text: '', minutes: 0 };
    if (!here)
        return { text: `${r.name} has to be with you for a lesson.`, minutes: 0 };
    if (m.last === g.day && m.progress > 0)
        return { text: `You already taught ${r.name} today.`, minutes: 0 };
    if (g.player.money < LESSON_COST)
        return { text: 'Not enough money for the lesson\'s materials.', minutes: 0 };
    g.player.money -= LESSON_COST;
    book(g, `Lesson for ${r.name}`, -LESSON_COST);
    addStatus(g, w, 'energy', -10);
    const s = isRpg(w) ? sheetOf(g) : null;
    const skill = s ? Math.max(0, skillBonus(w, s, m.area)) * 2 : traitsOf(g).includes(m.area) ? 5 : 0;
    m.progress = Math.min(100, m.progress + 10 + skill);
    m.last = g.day;
    addBond(g, avatar, 2);
    if (m.progress < 100)
        return { text: `You teach ${r.name} ${areaName(w, m.area).toLowerCase()} (${m.progress}%).`, minutes: LESSON_MINUTES };
    m.done = true;
    setTie(g, { a: '__you', b: avatar, type: 'mentor', tone: 'close' });
    social0(g, avatar);
    approve(g, avatar, 20);
    (r.learned ??= []).push(areaName(w, m.area));
    note(g, '{0} finished learning {1} from {u}: a bond for life.', [r.name, areaName(w, m.area).toLowerCase()], [avatar], g.player.loc, 'goal');
    return { text: `${r.name} has learned all you could teach about ${areaName(w, m.area).toLowerCase()}! Mentor and apprentice, for life.`, minutes: LESSON_MINUTES };
}
const social0 = (g, a) => { const s = g.social; if (s?.bond)
    s.bond[a] = Math.min(100, (s.bond[a] ?? 0) + 15); };
export function dropApprentice(g, avatar) { g.mentees = menteesOf(g).filter(m => m.avatar !== avatar || m.done); }
// Lessons skipped for 5 days: they cool off a little each day.
onDay.push((g, w) => {
    if (!on(w))
        return [];
    for (const m of menteesOf(g))
        if (!m.done && g.day - m.last > 5)
            bump(g, m.avatar, -1);
    return [];
});
export const graduated = (g, avatar) => menteesOf(g).some(m => m.avatar === avatar && m.done);
export function mentorLine(g, w, present) {
    if (!on(w))
        return '';
    return menteesOf(g).filter(m => present.includes(m.avatar) && g.cast[m.avatar]).map(m => `${g.cast[m.avatar].name} is ${m.done ? 'a former apprentice of' : 'learning ' + areaName(w, m.area).toLowerCase() + ' from'} {{user}}${m.done ? '' : ` (${m.progress}% of the way)`}.`).join(' ');
}
