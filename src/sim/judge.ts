// The decision engine for rough stuff: before an act counts as a crime, who you are, who they are and the setting's
// own codes are weighed. A police officer grabbing a wanted man is an arrest; hitting back at someone attacking you is
// self-defense; killing a walker is nobody's business; a vampire feeding where a mortal can see breaks the Masquerade.
// No runtime imports: it can be tested on its own.
import type { Crime, HostileDef } from './hostile-rules.js';

/* ---------- who you are ---------- */

export interface RoleDef {
    id: string; name: string; desc: string;
    /** May arrest: grabbing, restraining, knocking down someone wanted or attacking you is lawful. */
    authority?: boolean;
    /** Actions this role adds to the menu (Feed, for a vampire). */
    acts?: string[];
    /** Codes the role lives under, besides the law (the Masquerade). */
    codes?: string[];
}
export const ROLES: RoleDef[] = [
    { id: 'civilian', name: 'An ordinary person', desc: 'No special rights: the law applies to you like anyone.' },
    { id: 'law', name: 'The law (police, a guard)', desc: 'You may arrest people who are wanted or who attack you. Using force on an innocent person is still a crime.', authority: true },
    { id: 'kindred', name: 'Kindred (a vampire)', desc: 'You can feed on people. You live under the Masquerade: no mortal may see what you are.', acts: ['feed'], codes: ['masquerade'] },
];

/* ---------- codes: the setting's own rules, besides the law ---------- */

export interface CodeDef {
    id: string; name: string;
    /** Acts that break the code when someone outside it sees them. */
    acts: string[];
    /** Who is inside it (their group's name, or their own name, has one of these words): they don't count as witnesses. */
    insiders: string[];
    /** The group that enforces it: the first group whose name has one of these words. */
    enforcers: string[];
    severity: number;
}
export const CODES: CodeDef[] = [
    { id: 'masquerade', name: 'the Masquerade', acts: ['feed'], insiders: ['kindred', 'vampire', 'camarilla', 'anarch', 'sabbat', 'ghoul', 'cainite', 'licks', 'prince', 'sheriff', 'primogen'], enforcers: ['camarilla', 'prince', 'sheriff', 'primogen', 'court'], severity: 4 },
];

/* ---------- who they are ---------- */

/** Not a person in the eyes of anyone: a walker, a zombie (a world can add more: world.json → "notPeople"). */
export const NOT_PEOPLE = ['zombie', 'zombies', 'walker', 'walkers', 'biter', 'biters', 'undead', 'infected', 'rotter', 'shambler', 'ghoul horde', 'the dead'];
export const isNotPerson = (name: string, extra: string[] = []) => {
    const n = ` ${String(name ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
    return [...NOT_PEOPLE, ...extra].some(w => w && n.includes(` ${w.toLowerCase()} `));
};
/** Words in your situation's reason that mean the person named in it is attacking you or holding you. */
export const ATTACK_WORDS = /\b(fight|fighting|attack|attacking|grab|grabbed|grabbing|pin|pinned|hold|holding|held|hit|hitting|punch|stab|stabbing|shoot|shooting|choke|choking|strangl|kidnap|bound|tied|tying|cuff|beat|beating|corner|cornered|threaten|mug|rob|drag|dragging|captive|prisoner)/i;

export interface Who { law: boolean; wanted: Crime | ''; attacker: boolean; notPerson: boolean; insider: string[]; willing?: boolean; kinds?: string[] }

/* ---------- the verdict ---------- */

export type VerdictKind = 'crime' | 'arrest' | 'self-defense' | 'nothing' | 'fine' | 'legal';
export interface Verdict {
    kind: VerdictKind;
    crime: Crime;                // what the law sees (none for an arrest, self-defense, nothing)
    label: string;               // for the menu: "arrest", "self-defense", "assault"…
    why: string;                 // for the AI and the toast
    codes: string[];             // codes the act would break if someone outside them sees it
    law?: StoryLaw;              // the story's law that made it legal
}
const SEV: Record<Crime, number> = { none: 0, minor: 1, theft: 2, assault: 3, kidnapping: 5, murder: 8 };
const ARREST_ACTS = ['grab', 'restrain', 'shove', 'knockout', 'punch', 'kick', 'threaten'];
const DEFENSE_ACTS = ['punch', 'kick', 'shove', 'knockout', 'grab', 'restrain', 'threaten'];
export function judge(def: HostileDef, base: Crime, roles: string[], t: Who | null, youHeld: boolean, laws: StoryLaw[] = [], selfText = ''): Verdict {
    const r = ROLES.filter(x => roles.includes(x.id));
    const authority = r.some(x => x.authority);
    const codes = CODES.filter(c => c.acts.includes(def.id) && r.some(x => x.codes?.includes(c.id))).map(c => c.id);
    if (t?.notPerson) return { kind: 'nothing', crime: 'none', label: 'not a person', why: 'they are not a person: nobody calls this a crime', codes };
    if (base === 'none') return { kind: 'fine', crime: 'none', label: '', why: '', codes };
    // the story's own law: this act, on someone like them, by someone like you
    const sl = t ? lawFor(laws, def.id, t.kinds ?? [], roles, selfText) : undefined;
    if (sl && sl.counts === 'minor' && SEV[base] > 1) return { kind: 'crime', crime: 'minor', label: `minor: ${sl.name}`, why: `${sl.name} makes it a minor offense`, codes, law: sl };
    if (sl) return { kind: 'legal', crime: 'none', label: `legal: ${sl.name}`, why: `${sl.name}${sl.note ? `: ${sl.note}` : ' allows it'}`, codes, law: sl };
    // someone who trusts you lets you drink: no crime (the Masquerade still says who may see)
    if (def.id === 'feed' && t?.willing) return { kind: 'fine', crime: 'none', label: 'willing vessel', why: 'they trust {{user}} and let it happen', codes };
    // the law, doing its job: someone wanted, or someone attacking you
    if (authority && t && (t.wanted || t.attacker) && ARREST_ACTS.includes(def.id)) {
        return { kind: 'arrest', crime: 'none', label: 'arrest', why: t.wanted ? `{{user}} is the law, and they are wanted for ${t.wanted === 'minor' ? 'causing a disturbance' : t.wanted}: a lawful arrest` : '{{user}} is the law, and they are attacking {{user}}: a lawful use of force', codes };
    }
    if (authority && t?.attacker && def.id === 'kill' && youHeld) return { kind: 'self-defense', crime: 'none', label: 'use of force', why: 'they were attacking {{user}}: deadly force in self-defense', codes };
    // anyone: hitting back
    if (t?.attacker && DEFENSE_ACTS.includes(def.id)) return { kind: 'self-defense', crime: 'none', label: 'self-defense', why: 'they were attacking {{user}}: self-defense', codes };
    if (t?.attacker && def.id === 'kill' && youHeld) return { kind: 'self-defense', crime: 'none', label: 'self-defense', why: 'they had {{user}} and would not let go: killing in self-defense (people may still see it differently)', codes };
    const word = { none: '', minor: 'disturbance', theft: 'theft', assault: 'assault', kidnapping: 'kidnapping', murder: 'murder' }[base];
    return { kind: 'crime', crime: base, label: word, why: '', codes };
}

/** Who saw it, for a code: the ones outside it (a Kindred witness does not break the Masquerade). */
export function outsiders(codeId: string, witnesses: { name: string; insider: string[] }[]): string[] {
    const c = CODES.find(x => x.id === codeId); if (!c) return [];
    return witnesses.filter(w => !w.insider.some(i => c.insiders.some(k => i.toLowerCase().includes(k)))).map(w => w.name);
}
export const enforcerOf = (codeId: string, groups: { id: string; name: string }[]) => {
    const c = CODES.find(x => x.id === codeId);
    return c ? groups.find(gr => c.enforcers.some(k => gr.name.toLowerCase().includes(k))) : undefined;
};

/* ---------- laws of a story: who may do what to whom ---------- */

/**
 * A law of this world (world.json → "laws") or of this game (the Rough stuff menu): it makes some acts against some
 * people lawful (a bounty on outlaws, a control order on a kind of people, curfew breakers), for anyone or only for
 * some roles.
 */
export interface StoryLaw {
    id: string; name: string;
    /** Who it is about: words matched against what someone is ("mouse", "outlaw"). */
    about: string[];
    /** The acts it allows (action ids: grab, restrain, knockout, kill…). */
    allows: string[];
    /** Who may: [] anyone; otherwise role ids ('law') or words in your own description ("animal control"). */
    who: string[];
    /** 'legal', or 'minor' (a lesser offense: a disturbance at most). */
    counts: 'legal' | 'minor';
    /** Who they are handed over to ("Animal Control"), and the reward (in the world's money). */
    handTo?: string; reward?: number;
    /** Who disapproves (words): such witnesses don't report it, but remember it and like you less. */
    objectors?: string[];
    note?: string;
}
const words = (t: string) => ` ${String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
/** Does any of what they are match any of the words? (whole words: "mouse" matches "mouse kemonomimi", not "mousetrap") */
export function kindMatches(kinds: string[], about: string[]): boolean {
    const k = kinds.map(words);
    return about.map(a => a.trim().toLowerCase()).filter(Boolean).some(a => k.some(x => x.includes(` ${a} `) || x.includes(` ${a}s `)));
}
/** The law that covers this act on someone like them, if you may use it. */
export function lawFor(laws: StoryLaw[], actId: string, kinds: string[], roles: string[], selfText: string): StoryLaw | undefined {
    return laws.find(l => l.allows.includes(actId) && kindMatches(kinds, l.about) && (!l.who.length || l.who.some(w => roles.includes(w) || words(selfText).includes(` ${w.toLowerCase()} `))));
}
/** A law that is about them, whatever the act (for the menu: "she is covered by the K4 control order"). */
export const lawsAbout = (laws: StoryLaw[], kinds: string[]) => laws.filter(l => kindMatches(kinds, l.about));
