// Schools, academies and universities with a ladder (students, prefects or class presidents, professors, the
// headmaster or dean), in Life-Sim and RPG alike. Enroll (weekly tuition), attend lessons at the place (time and
// energy; in the RPG experience, and after a few lessons the school's skill becomes trained; in Life-Sim its trait),
// pass exams (a d20 check in the RPG, attendance and talent in Life-Sim) to climb the ladder; fail two in a row, or
// stop paying, and you are expelled. Join a club for a weekly meeting with the others. The school's staff (the people
// who work there) form the faculty: the highest-ranked one leads it.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type InstitutionDef } from '../core/world.js';
import { onDay } from './hooks.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { addStatus } from './needs.js';
import { isRpg, sheetOf, rollCheck, checkWon, addXp, skillOf } from './rpg.js';
import { traitsOf } from './work.js';
import { npcRank } from './longlife.js';
import { presentAt } from './people.js';
import { addBond } from './social.js';

export interface Enrollment { rank: number; lessons: number; since: number; exams: number; fails: number; last: number; exam: number; club?: string; met?: number; paid: number; joined: number }
const on = (w: WorldDef) => systemOn(w, 'institutions') && !!w.institutions?.length;
export const schoolOf = (g: Save): Record<string, Enrollment> => ((g as any).school ??= {});
export const instDef = (w: WorldDef, id: string) => w.institutions?.find(i => i.id === id) ?? null;
export const instAt = (w: WorldDef, place: string) => (on(w) ? w.institutions!.filter(i => i.place === place) : []);
const week = (g: Save) => Math.floor((g.day - 1) / 7);
export const LESSON_MINUTES = 120;
// The ladder for students: passed exams needed for each rank (the top ones, professor and head, come later).
const NEED = [0, 2, 5, 9, 14];

export function enroll(g: Save, w: WorldDef, id: string): string {
    const d = instDef(w, id); if (!d || !on(w)) return '';
    if (schoolOf(g)[id]) return 'You are already enrolled.';
    if (g.player.loc !== d.place) return `You enroll at ${w.places.find(p => p.id === d.place)?.name ?? 'the school'}.`;
    if (g.player.money < (d.tuition ?? 0)) return `The first week's tuition is ${d.tuition}.`;
    if (d.tuition) { g.player.money -= d.tuition; book(g, `${d.name}: tuition`, -d.tuition); }
    schoolOf(g)[id] = { rank: 0, lessons: 0, since: 0, exams: 0, fails: 0, last: 0, exam: g.day, paid: week(g), joined: g.day };
    note(g, '{u} enrolled at {0}.', [d.name], [], g.player.loc, 'study');
    return `You are a ${d.ranks[0] ?? 'student'} at ${d.name} now.`;
}
export function drop(g: Save, id: string) { delete schoolOf(g)[id]; }
export function attend(g: Save, w: WorldDef, id: string): { text: string; minutes: number; msgs: string[] } {
    const d = instDef(w, id); const e = schoolOf(g)[id]; const msgs: string[] = [];
    if (!d || !e) return { text: '', minutes: 0, msgs };
    if (g.player.loc !== d.place) return { text: 'Lessons are at the school.', minutes: 0, msgs };
    if (e.last === g.day) return { text: 'You already attended today.', minutes: 0, msgs };
    e.last = g.day; e.lessons++; e.since++;
    addStatus(g, w, 'energy', -12);
    const s = isRpg(w) ? sheetOf(g) : null;
    if (s) {
        msgs.push(...addXp(g, w, 10, d.name));
        if (d.skill && e.lessons >= 5 && !s.skills.includes(d.skill) && skillOf(w, d.skill)) { s.skills.push(d.skill); msgs.push(`You are now trained in ${skillOf(w, d.skill)!.name}.`); note(g, '{u} learned {0} at {1}.', [skillOf(w, d.skill)!.name, d.name], [], d.place, 'study'); }
    } else if (d.trait && e.lessons >= 6 && !traitsOf(g).includes(d.trait)) {
        (((g.player.traits ??= {}) as any).school ??= []).push(d.trait); msgs.push(`New trait from your studies: ${d.trait}.`);
    }
    // classmates and teachers there
    for (const r of presentAt(g, w, d.place).filter(r => r.met)) addBond(g, r.avatar, 1);
    return { text: `You attend a lesson at ${d.name}.`, minutes: LESSON_MINUTES, msgs };
}
export const examDue = (g: Save, w: WorldDef, id: string) => { const d = instDef(w, id); const e = schoolOf(g)[id]; return !!d && !!e && g.day - e.exam >= (d.examEvery ?? 7) && e.since > 0; };
export function sitExam(g: Save, w: WorldDef, id: string): { text: string; passed: boolean; msgs: string[] } {
    const d = instDef(w, id); const e = schoolOf(g)[id]; const msgs: string[] = [];
    if (!d || !e) return { text: '', passed: false, msgs };
    if (!examDue(g, w, id)) return { text: 'No exam yet.', passed: false, msgs };
    if (g.player.loc !== d.place) return { text: 'Exams are at the school.', passed: false, msgs };
    let passed: boolean; let detail = '';
    const s = isRpg(w) ? sheetOf(g) : null;
    if (s && d.skill && skillOf(w, d.skill)) { const c = rollCheck(g, w, d.skill, 11 + e.rank * 2, Math.min(4, e.since)); passed = checkWon(c); detail = ` (${skillOf(w, d.skill)!.name} ${c.total} vs ${c.dc})`; }
    else { const chance = Math.min(0.92, 0.3 + 0.1 * e.since + (d.trait && traitsOf(g).includes(d.trait) ? 0.15 : 0)); passed = Math.random() < chance; }
    e.exam = g.day; e.since = 0;
    if (!passed) {
        e.fails++;
        if (e.fails >= 2) { drop(g, id); note(g, '{u} was expelled from {0} after failing twice.', [d.name], [], d.place, 'study'); return { text: `You failed again${detail}. ${d.name} has expelled you.`, passed, msgs }; }
        return { text: `You failed the exam${detail}. Fail the next one and you are out.`, passed, msgs };
    }
    e.fails = 0; e.exams++;
    const top = d.ranks.length - 1;
    while (e.rank < top && e.exams >= (NEED[e.rank + 1] ?? Infinity)) {
        e.rank++; msgs.push(`You rose to ${d.ranks[e.rank]} at ${d.name}!`);
        note(g, '{u} became {0} at {1}.', [d.ranks[e.rank], d.name], [], d.place, 'study');
    }
    if (s) msgs.push(...addXp(g, w, 30, 'exam'));
    return { text: `You passed the exam${detail}.`, passed, msgs };
}
export function joinClub(g: Save, w: WorldDef, id: string, club: string): string {
    const d = instDef(w, id); const e = schoolOf(g)[id];
    if (!d || !e || !(d.clubs ?? []).includes(club)) return '';
    e.club = club; return `You joined the ${club}.`;
}
export function clubMeeting(g: Save, w: WorldDef, id: string): { text: string; minutes: number } {
    const d = instDef(w, id); const e = schoolOf(g)[id];
    if (!d || !e?.club) return { text: '', minutes: 0 };
    if (g.player.loc !== d.place) return { text: 'The club meets at the school.', minutes: 0 };
    if (e.met === week(g)) return { text: 'The club already met this week.', minutes: 0 };
    e.met = week(g); addStatus(g, w, 'mood', 10);
    for (const r of presentAt(g, w, d.place).filter(r => r.met)) addBond(g, r.avatar, 3);
    return { text: `A good meeting of the ${e.club}.`, minutes: 60 };
}
// Weekly tuition: unpaid, you are out.
onDay.push((g, w) => {
    if (!on(w)) return [];
    const out: string[] = [];
    for (const [id, e] of Object.entries(schoolOf(g))) {
        const d = instDef(w, id); if (!d) { drop(g, id); continue; }
        if (e.paid >= week(g) || !d.tuition) { e.paid = week(g); continue; }
        if (g.player.money >= d.tuition) { g.player.money -= d.tuition; book(g, `${d.name}: tuition`, -d.tuition); e.paid = week(g); }
        else { drop(g, id); out.push(`${d.name} dropped you: the tuition was not paid.`); }
    }
    return out;
});
// The faculty: the people who work there, the highest-ranked first (the head), then the teachers.
export function faculty(g: Save, w: WorldDef, d: InstitutionDef) {
    const staff = Object.values(g.cast).filter(r => r.occupation && w.occupations.find(o => o.id === r.occupation)?.place === d.place)
        .sort((a, b) => npcRank(g, b.avatar) - npcRank(g, a.avatar) || a.name.localeCompare(b.name));
    return { head: staff[0] ?? null, teachers: staff.slice(1) };
}
export function institutionLines(g: Save, w: WorldDef): string[] {
    if (!on(w)) return [];
    return instAt(w, g.player.loc).map(d => {
        const e = schoolOf(g)[d.id]; const f = faculty(g, w, d);
        const top = d.ranks.length - 1;
        return `${d.name} has its ladder: ${d.ranks.join(' → ')}.${f.head ? ` ${f.head.name} is the ${d.ranks[top]?.toLowerCase()}.` : ''}${f.teachers.length ? ` ${d.ranks[top - 1] ?? 'Teacher'}s: ${f.teachers.map(r => r.name).join(', ')}.` : ''}${e ? ` {{user}} is a ${d.ranks[e.rank]?.toLowerCase()} here${e.club ? `, in the ${e.club}` : ''}.` : ''}`;
    });
}
