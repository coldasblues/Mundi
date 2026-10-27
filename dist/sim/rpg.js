// The RPG character sheet (RPG mode): level and experience, hit points, focus, attributes, a class and its subclass
// (chosen at level 3 or 5), trained skills, titles and renown. The engine rolls every d20; the AI only narrates.
// The sheet lives in the save (save.rpg). Hit points and the world's "life" need are the same thing: the need shows
// the share of hit points left, so everything that hurt or healed "life" before still does.
import { nowAbs } from '../core/store.js';
import { gameMode } from '../core/world.js';
import { rpgOf } from '../core/rpgdef.js';
import { note } from './facts.js';
import { checkMods, onRoll } from './hooks.js';
export { checkMods };
import { SAVE } from '../core/store.js';
import { getWorld } from '../core/world.js';
export const isRpg = (w) => !!w && gameMode(w) === 'rpg' && !!rpgOf(w);
export const sheetOf = (g) => (g?.rpg ?? null);
export const classOf = (w, s) => rpgOf(w)?.classes.find(c => c.id === s.cls) ?? null;
/* ---------- numbers ---------- */
export const mod = (score) => Math.floor((score - 10) / 2);
export const prof = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
export const attr = (s, id) => s.attrs[id] ?? 10;
// Talents: what the chosen ones add (hit points, focus, a skill, attack, armor, damage, initiative, camp).
export function talentSum(w, s, kind, skill) {
    if (w.features?.talents === false)
        return 0;
    const list = rpgOf(w)?.talents ?? [];
    return (s.talents ?? []).reduce((t, id) => { const d = list.find(x => x.id === id); return t + (d && d.effect.kind === kind && (!skill || d.effect.skill === skill) ? d.effect.amount : 0); }, 0);
}
export function hpMax(w, s) {
    const r = rpgOf(w);
    const c = classOf(w, s);
    const hit = c?.hit ?? 8, con = mod(attr(s, r?.hpAttr ?? 'con'));
    return Math.max(1, hit + con + (s.level - 1) * Math.max(1, Math.floor(hit / 2) + 1 + con) + talentSum(w, s, 'hp'));
}
export const isCaster = (w, s) => !!classOf(w, s)?.schools?.length;
export function focusMax(w, s) {
    const c = classOf(w, s);
    const k = Math.max(0, mod(attr(s, c?.key ?? 'str')));
    return (isCaster(w, s) ? 2 + s.level + k : 1 + Math.floor(s.level / 2)) + talentSum(w, s, 'focus');
}
export const maxPrepared = (w, s) => Math.max(1, s.level + mod(attr(s, classOf(w, s)?.key ?? 'int')));
export const skillOf = (w, id) => rpgOf(w)?.skills.find(x => x.id === id) ?? null;
export function skillBonus(w, s, id) {
    const sk = skillOf(w, id);
    return mod(attr(s, sk?.attr ?? 'cha')) + (trained(w, s).includes(id) ? prof(s.level) : 0) + talentSum(w, s, 'skill', id);
}
// Trained skills: the ones picked, the background's, and the subclass's.
export function trained(w, s) {
    const sub = classOf(w, s)?.subclasses.find(x => x.id === s.sub);
    return [...new Set([...s.skills, ...(sub?.skill ? [sub.skill] : [])])];
}
export const xpFor = (w, level) => (rpgOf(w)?.xp ?? [])[level - 1] ?? Infinity; // to reach level+1
export const maxLevel = (w) => (rpgOf(w)?.xp.length ?? 0) + 1;
/* ---------- making a character ---------- */
// Point buy (27 points, every attribute 8..15, like D&D): what a score costs.
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINTS = 27;
export const pointsUsed = (attrs) => Object.values(attrs).reduce((a, v) => a + (POINT_COST[v] ?? 0), 0);
export function defaultAttrs(r, cls) {
    const order = [cls?.key, r.hpAttr, ...r.attributes.map(a => a.id)].filter((x, i, l) => !!x && l.indexOf(x) === i);
    const array = [15, 14, 13, 12, 10, 8];
    return Object.fromEntries(r.attributes.map(a => [a.id, array[order.indexOf(a.id)] ?? 10]));
}
export function makeSheet(w, o) {
    const r = rpgOf(w);
    const c = r.classes.find(x => x.id === o.cls) ?? r.classes[0];
    const attrs = { ...(o.attrs ?? defaultAttrs(r, c)) };
    for (const [k, v] of Object.entries(o.origin?.attributes ?? {}))
        attrs[k] = Math.min(20, (attrs[k] ?? 10) + v);
    const picked = (o.skills ?? c.skills.slice(0, 2)).filter(x => c.skills.includes(x)).slice(0, 2);
    const s = { cls: c.id, level: 1, xp: 0, attrs, skills: [...new Set([...picked, ...(o.origin?.skills ?? [])])], hp: 0, focus: 0, points: 0, learn: 0,
        known: [], prepared: [], prepOpen: true, titles: [], renown: 0, counts: {} };
    s.hp = hpMax(w, s);
    s.focus = focusMax(w, s);
    if (isCaster(w, s)) { // a caster starts with two first-level spells of the class's schools, prepared
        const first = spellsFor(w, s).filter(x => x.level <= 1).slice(0, 2);
        s.known = first.map(x => x.id);
        s.prepared = [...s.known];
    }
    return s;
}
// A save that had no sheet (the world became RPG later): one is made with the first class and the usual scores.
export function ensureSheet(g, w) {
    if (!isRpg(w))
        return null;
    const origin = w.catalogs.origins?.find(o => o.id === g.player.origin);
    return (g.rpg ??= makeSheet(w, { cls: rpgOf(w).classes[0].id, origin }));
}
/* ---------- growing ---------- */
// Spells you could learn now: of your class's schools (and your subclass's), up to half your level (rounded up).
export function spellsFor(w, s) {
    const c = classOf(w, s);
    const sub = c?.subclasses.find(x => x.id === s.sub);
    const schools = new Set([...(c?.schools ?? []), ...(sub?.school ? [sub.school] : [])]);
    const top = Math.ceil(s.level / 2);
    return (rpgOf(w)?.spells ?? []).filter(x => schools.has(x.school) && x.level <= top);
}
export const pendingSubclass = (w, s) => { const c = classOf(w, s); return !!c && !s.sub && s.level >= c.subAt && c.subclasses.length > 0; };
export function addXp(g, w, n, why) {
    const s = sheetOf(g);
    if (!s || !isRpg(w) || n <= 0)
        return [];
    s.xp += Math.round(n);
    const out = [];
    while (s.level < maxLevel(w) && s.xp >= xpFor(w, s.level)) {
        const before = hpMax(w, s);
        s.level++;
        s.hp += hpMax(w, s) - before;
        s.focus = focusMax(w, s);
        if (s.level % 4 === 0)
            s.points += 2;
        if (isCaster(w, s))
            s.learn += 1;
        note(g, '{u} reached level {0}.', [String(s.level)], [], g.player.loc, 'goal');
        out.push(`Level ${s.level}!${pendingSubclass(w, s) ? ' Choose your subclass on your character sheet.' : ''}${s.level % 4 === 0 ? ' You have 2 attribute points to spend.' : ''}${isCaster(w, s) ? ' You can learn a new spell.' : ''}`);
    }
    out.push(...checkTitles(g, w));
    void why;
    return out;
}
export function chooseSubclass(g, w, id) {
    const s = sheetOf(g);
    const c = s && classOf(w, s);
    const sub = c?.subclasses.find(x => x.id === id);
    if (!s || !sub || !pendingSubclass(w, s))
        return '';
    s.sub = sub.id;
    note(g, '{u} became a {0}.', [sub.name], [], g.player.loc, 'goal');
    return `You are now a ${sub.name}.`;
}
export function spendPoint(g, w, a) {
    const s = sheetOf(g);
    if (!s || s.points <= 0 || attr(s, a) >= 20 || !rpgOf(w)?.attributes.some(x => x.id === a))
        return false;
    const before = hpMax(w, s);
    s.attrs[a] = attr(s, a) + 1;
    s.points--;
    s.hp += Math.max(0, hpMax(w, s) - before);
    return true;
}
export function learnSpell(g, w, id) {
    const s = sheetOf(g);
    if (!s || s.learn <= 0 || s.known.includes(id) || !spellsFor(w, s).some(x => x.id === id))
        return false;
    s.known.push(id);
    s.learn--;
    if (s.prepared.length < maxPrepared(w, s))
        s.prepared.push(id);
    return true;
}
/* ---------- hit points and rest ---------- */
// Hit points move the "life" need too (as a share of the maximum), and the other way round.
export function changeHp(g, w, delta) {
    const s = sheetOf(g);
    if (!s)
        return;
    s.hp = Math.max(0, Math.min(hpMax(w, s), Math.round(s.hp + delta)));
    syncLife(g, w);
}
export function syncLife(g, w) {
    const s = sheetOf(g);
    if (!s)
        return;
    const life = w.statuses.find(x => x.id === 'life' || x.id === 'health');
    if (life)
        g.player.stats[life.id] = Math.round((s.hp / hpMax(w, s)) * life.max);
}
// A long rest (a night's sleep, at home or at camp): hit points and focus back, spells can be prepared again.
export function longRest(g, w, share = 1) {
    const s = sheetOf(g);
    if (!s)
        return;
    s.hp = Math.min(hpMax(w, s), s.hp + Math.ceil(hpMax(w, s) * share));
    s.focus = Math.min(focusMax(w, s), s.focus + Math.ceil(focusMax(w, s) * share));
    s.prepOpen = true;
    syncLife(g, w);
}
// A d20 + the skill's bonus (+ a spell's boost, used up) against a DC. A natural 20 always works, a 1 always fails.
export function rollCheck(g, w, skill, dc, extra = 0, rnd = Math.random) {
    const s = sheetOf(g);
    const nx = s.next ?? {};
    const adv = !!nx.advantage?.includes(skill);
    const boost = nx.bonus && (!nx.bonus.skills?.length || nx.bonus.skills.includes(skill)) ? nx.bonus.amount : 0;
    if (adv)
        delete nx.advantage;
    if (boost)
        delete nx.bonus;
    if (!nx.advantage && !nx.bonus)
        delete s.next;
    const a = 1 + Math.floor(rnd() * 20), b = adv ? 1 + Math.floor(rnd() * 20) : undefined;
    const d20 = b !== undefined ? Math.max(a, b) : a;
    const bonus = skillBonus(w, s, skill) + extra + boost + checkMods.reduce((t, f) => t + f(g, w, skill), 0);
    const total = d20 + bonus;
    const grade = d20 === 20 ? 'critical-success' : d20 === 1 ? 'critical-fail' : total >= dc ? 'success' : 'fail';
    for (const f of onRoll)
        f({ skill, d20, other: b !== undefined ? Math.min(a, b) : undefined, total, dc, grade });
    return { skill, d20, ...(b !== undefined ? { other: Math.min(a, b) } : {}), bonus, total, dc, grade, adv };
}
export const checkWon = (c) => c.grade === 'success' || c.grade === 'critical-success';
export const gradeWord = (c) => ({ 'critical-fail': 'CRITICAL FAILURE', fail: 'FAILURE', success: 'SUCCESS', 'critical-success': 'CRITICAL SUCCESS' })[c.grade];
export const DCS = { easy: 10, medium: 13, hard: 16, 'very hard': 19 };
/* ---------- titles and renown ---------- */
export function count(g, w, key, n = 1) {
    const s = sheetOf(g);
    if (!s)
        return [];
    s.counts[key] = (s.counts[key] ?? 0) + n;
    return checkTitles(g, w);
}
export function addRenown(g, w, n) {
    const s = sheetOf(g);
    if (!s)
        return [];
    s.renown = Math.max(0, s.renown + n);
    return checkTitles(g, w);
}
export function checkTitles(g, w) {
    const s = sheetOf(g);
    const r = rpgOf(w);
    if (!s || !r)
        return [];
    const out = [];
    for (const t of r.titles) {
        if (s.titles.includes(t.id))
            continue;
        const c = t.when;
        const ok = (c.level === undefined || s.level >= c.level) && (c.renown === undefined || s.renown >= c.renown) && (!c.count || (s.counts[c.count] ?? 0) >= (c.n ?? 1));
        if (!ok)
            continue;
        s.titles.push(t.id);
        note(g, '{u} earned a title: {0}.', [t.name], [], g.player.loc, 'goal');
        out.push(`New title: ${t.name}!`);
    }
    return out;
}
export const titleNames = (w, s) => s.titles.map(id => rpgOf(w)?.titles.find(t => t.id === id)?.name).filter(Boolean);
// For the AI: who {{user}} is in the RPG.
export function sheetLine(g, w) {
    const s = sheetOf(g);
    if (!s || !isRpg(w))
        return '';
    const c = classOf(w, s);
    const sub = c?.subclasses.find(x => x.id === s.sub);
    const t = titleNames(w, s);
    const renown = s.renown >= 60 ? 'famous across the land' : s.renown >= 25 ? 'known in these parts' : s.renown >= 8 ? 'getting a name' : '';
    return `{{user}} is a level ${s.level} ${sub ? `${sub.name} ` : ''}${c?.name.toLowerCase() ?? 'adventurer'}${t.length ? `, known as ${t.join(', ')}` : ''}${renown ? `; ${renown}` : ''}. Hit points ${s.hp}/${hpMax(w, s)}${s.hp <= hpMax(w, s) / 4 ? ' (badly hurt)' : ''}.`;
}
void nowAbs;
// a save of a world played as RPG that has no sheet yet gets one (with the first class), the first time it opens
SAVE.hooks.push(g => { const w = getWorld(g.world); if (w && !g.rpg && isRpg(w))
    ensureSheet(g, w); });
/* ---------- talents ---------- */
// A point per level after the first; spent in the tree (a tier opens every 3 levels; some need the one before).
export const talentsOf = (s) => (s.talents ??= []);
export const talentPoints = (s) => Math.max(0, s.level - 1 - talentsOf(s).length);
export const tierOpen = (s, tier) => s.level >= (tier - 1) * 3 + 1;
export function talentTree(w, s) { return (rpgOf(w)?.talents ?? []).filter(t => !t.cls || t.cls === s.cls); }
export function canTake(w, s, id) {
    const t = talentTree(w, s).find(x => x.id === id);
    if (!t)
        return 'Not for your class.';
    if (talentsOf(s).includes(id))
        return 'Already yours.';
    if (talentPoints(s) <= 0)
        return 'No talent points left.';
    if (!tierOpen(s, t.tier))
        return `Opens at level ${(t.tier - 1) * 3 + 1}.`;
    if ((t.requires ?? []).some(r => !talentsOf(s).includes(r)))
        return 'Needs the talent before it.';
    return '';
}
export function takeTalent(g, w, id) {
    const s = sheetOf(g);
    if (!s)
        return '';
    const why = canTake(w, s, id);
    if (why)
        return why;
    const before = hpMax(w, s);
    talentsOf(s).push(id);
    s.hp += Math.max(0, hpMax(w, s) - before);
    s.focus = Math.min(focusMax(w, s), s.focus);
    syncLife(g, w);
    return '';
}
// Respec: every point back, any time.
export function respec(g, w) {
    const s = sheetOf(g);
    if (!s || !talentsOf(s).length)
        return '';
    s.talents = [];
    s.hp = Math.min(s.hp, hpMax(w, s));
    s.focus = Math.min(s.focus, focusMax(w, s));
    syncLife(g, w);
    return 'Your talents are reset: spend the points again as you like.';
}
