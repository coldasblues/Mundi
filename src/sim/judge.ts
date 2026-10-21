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

export interface Who { law: boolean; wanted: Crime | ''; attacker: boolean; notPerson: boolean; insider: string[]; willing?: boolean }

/* ---------- the verdict ---------- */

export type VerdictKind = 'crime' | 'arrest' | 'self-defense' | 'nothing' | 'fine';
export interface Verdict {
    kind: VerdictKind;
    crime: Crime;                // what the law sees (none for an arrest, self-defense, nothing)
    label: string;               // for the menu: "arrest", "self-defense", "assault"…
    why: string;                 // for the AI and the toast
    codes: string[];             // codes the act would break if someone outside them sees it
}
const ARREST_ACTS = ['grab', 'restrain', 'shove', 'knockout', 'punch', 'kick', 'threaten'];
const DEFENSE_ACTS = ['punch', 'kick', 'shove', 'knockout', 'grab', 'restrain', 'threaten'];
export function judge(def: HostileDef, base: Crime, roles: string[], t: Who | null, youHeld: boolean): Verdict {
    const r = ROLES.filter(x => roles.includes(x.id));
    const authority = r.some(x => x.authority);
    const codes = CODES.filter(c => c.acts.includes(def.id) && r.some(x => x.codes?.includes(c.id))).map(c => c.id);
    if (t?.notPerson) return { kind: 'nothing', crime: 'none', label: 'not a person', why: 'they are not a person: nobody calls this a crime', codes };
    if (base === 'none') return { kind: 'fine', crime: 'none', label: '', why: '', codes };
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
