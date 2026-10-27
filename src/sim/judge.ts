// Social checks (RPG mode), with the AI as a judge and the engine as the dice: when {{user}} tries to persuade, lie,
// threaten or charm someone, the AI only says what kind of attempt it is, how hard the request is for that person
// and how good the approach is. The engine adjusts the difficulty by the relationship, rolls the d20 and decides.
// The AI is then told the result and must play it.
import type { Save, Resident } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { quiet, personaName } from '../st/bridge.js';
import { bondOf, bump } from './social.js';
import { approvalOf, approve } from './living.js';
import { regionState, regionOf } from './worldstate.js';
import { isRpg, sheetOf, rollCheck, checkWon, gradeWord, addXp, count, skillOf, DCS, type Check } from './rpg.js';
import { note } from './facts.js';

export const SOCIAL_SKILLS = ['persuasion', 'deception', 'intimidation', 'insight', 'performance'];
// Words that sound like an attempt (English and Portuguese, Spanish): only then the judge is asked.
export const SOUNDS_LIKE = /\b(convince|persuade|lie|lying|pretend|bluff|threaten|intimidate|charm|flatter|bargain|haggle|beg|plead|bribe|trick|deceive|negotiate|insist|demand|swear|promise you|trust me|convenc|persuad|minto|mentir|fing|blef|amea[cç]|intimid|lisonje|barganh|pechinch|implor|supl|subor|engan|negoci|insist|exij|confie em mim|juro|enga[ñn]|amenaz|soborn)/i;
export interface Verdict { check: boolean; skill: string; target: string; difficulty: string; quality: number }

export function parseVerdict(out: string): Verdict {
    const get = (k: string) => (out.match(new RegExp(`${k}\\s*:\\s*([^\\n]+)`, 'i'))?.[1] ?? '').trim().toLowerCase();
    const skill = SOCIAL_SKILLS.find(s => get('skill').includes(s)) ?? 'persuasion';
    const diff = ['very hard', 'hard', 'medium', 'easy'].find(d => get('difficulty').includes(d)) ?? 'medium';
    const q = Math.max(-2, Math.min(2, Math.round(Number((get('quality').match(/[+-]?\d+/) ?? ['0'])[0]))));
    return { check: /yes/.test(get('check')), skill, target: get('target').replace(/^none$|^nobody$|^-$/, ''), difficulty: diff, quality: q };
}
export function difficultyFor(g: Save, w: WorldDef, v: Verdict, target: Resident | null): number {
    let dc = DCS[v.difficulty] ?? 13;
    if (target && v.skill !== 'intimidation') {
        const b = bondOf(g, target.avatar), a = approvalOf(g, target.avatar);
        if (b >= 60) dc -= 2; else if (b < 10) dc += 1;
        if (a <= -30) dc += 2; else if (a >= 40) dc -= 1;
    }
    if (v.skill === 'intimidation' && regionState(g, w, regionOf(g, w, g.player.loc)).tension >= 50) dc -= 1;   // a tense town scares easily
    return Math.max(5, Math.min(25, dc));
}
const OUTCOME: Record<string, Record<string, string>> = {
    persuasion: { ok: 'is genuinely persuaded and goes along with it', no: 'is not convinced and says no (kindly or not)' },
    deception: { ok: 'believes it completely', no: 'does not believe it and grows suspicious' },
    intimidation: { ok: 'is truly frightened and gives in', no: 'is not scared, and stands up to {{user}}' },
    insight: { ok: 'gives away what they really feel or hide (describe the tell)', no: 'gives nothing away: {{user}} cannot read them' },
    performance: { ok: 'is captivated', no: 'is unimpressed' },
};
export interface SocialResult { check: Check; target: string; skill: string; prompt: string; toast: string; msgs: string[] }
// Asks the judge, rolls, and returns what to tell the AI (null: not a check). `force`: the player asked for a roll.
export async function socialCheck(g: Save, w: WorldDef, text: string, present: Resident[], force = false): Promise<SocialResult | null> {
    if (!isRpg(w) || !sheetOf(g) || !present.length) return null;
    if (!force && !SOUNDS_LIKE.test(text)) return null;
    const me = personaName();
    const out = await quiet(`[You are the rules judge of a role-play game. You do not write the story.]
Place: ${g.player.loc}. People here: ${present.map(r => `${r.name} (${bondOf(g, r.avatar) >= 60 ? 'close to' : bondOf(g, r.avatar) >= 25 ? 'friendly with' : 'not close to'} ${me})`).join(', ')}.
${me} says or does: "${text.slice(0, 600)}"

${force ? `${me} asked for a roll: this is a check.` : `Is this an attempt by ${me} to make someone believe or do something they would not just do (persuade, deceive, intimidate, read someone, perform)? Ordinary talk is not a check.`}
Reply in exactly this form:
CHECK: yes or no
SKILL: persuasion, deception, intimidation, insight or performance
TARGET: the name of the person (or none)
DIFFICULTY: easy, medium, hard or very hard (how much it asks of that person: a small favor is easy; risking their job, money or safety is very hard)
QUALITY: a number from -2 to 2 (how good the approach is: clumsy -2, ordinary 0, clever and fitting 2)`, 60);
    const v = parseVerdict(out);
    if (!v.check && !force) return null;
    const target = present.find(r => v.target && r.name.toLowerCase().split(/\s+/)[0] === v.target.split(/\s+/)[0]) ?? (present.length === 1 ? present[0] : null);
    const dc = difficultyFor(g, w, v, target);
    const c = rollCheck(g, w, v.skill, dc, v.quality);
    const won = checkWon(c);
    const who = target?.name ?? 'the people here';
    const msgs = [...addXp(g, w, won ? (c.grade === 'critical-success' ? 50 : 25) : 5, 'social check'), ...(won ? count(g, w, 'socialWins') : [])];
    if (target && c.grade === 'critical-fail') { approve(g, target.avatar, -5); bump(g, target.avatar, -3); }
    if (target && c.grade === 'critical-success') bump(g, target.avatar, 2);
    const o = OUTCOME[v.skill] ?? OUTCOME.persuasion;
    const extra = c.grade === 'critical-success' ? ' — even beyond what {{user}} hoped' : c.grade === 'critical-fail' ? ' — and it backfires: they are offended or alarmed' : '';
    const sk = skillOf(w, v.skill)?.name ?? v.skill;
    const roll = `d20 ${c.d20}${c.adv ? ` (advantage; the other die ${c.other})` : ''} ${c.bonus >= 0 ? '+' : '−'} ${Math.abs(c.bonus)} = ${c.total} vs DC ${dc}`;
    note(g, won ? '{u} tried {0} on {1} and it worked.' : '{u} tried {0} on {1} and it failed.', [sk.toLowerCase(), who], target ? [target.avatar] : [], g.player.loc, 'skill');
    return {
        check: c, target: who, skill: v.skill, msgs,
        prompt: `[Rules — a ${sk} check decided by the dice: ${roll}: ${gradeWord(c)}. ${who} ${won ? o.ok : o.no}${extra}. Play this result faithfully; do not change it.]`,
        toast: `🎲 ${sk}: ${roll} — ${gradeWord(c)}`,
    };
}
