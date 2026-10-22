export const ROLES = [
    { id: 'civilian', name: 'An ordinary person', desc: 'No special rights: the law applies to you like anyone.' },
    { id: 'law', name: 'The law (police, a guard)', desc: 'You may arrest people who are wanted or who attack you. Using force on an innocent person is still a crime.', authority: true },
    { id: 'kindred', name: 'Kindred (a vampire)', desc: 'You can feed on people. You live under the Masquerade: no mortal may see what you are.', acts: ['feed'], codes: ['masquerade'] },
];
export const CODES = [
    { id: 'masquerade', name: 'the Masquerade', acts: ['feed'], insiders: ['kindred', 'vampire', 'camarilla', 'anarch', 'sabbat', 'ghoul', 'cainite', 'licks', 'prince', 'sheriff', 'primogen'], enforcers: ['camarilla', 'prince', 'sheriff', 'primogen', 'court'], severity: 4 },
];
/* ---------- who they are ---------- */
/** Not a person in the eyes of anyone: a walker, a zombie (a world can add more: world.json → "notPeople"). */
export const NOT_PEOPLE = ['zombie', 'zombies', 'walker', 'walkers', 'biter', 'biters', 'undead', 'infected', 'rotter', 'shambler', 'ghoul horde', 'the dead'];
export const isNotPerson = (name, extra = []) => {
    const n = ` ${String(name ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
    return [...NOT_PEOPLE, ...extra].some(w => w && n.includes(` ${w.toLowerCase()} `));
};
/** Words in your situation's reason that mean the person named in it is attacking you or holding you. */
export const ATTACK_WORDS = /\b(fight|fighting|attack|attacking|grab|grabbed|grabbing|pin|pinned|hold|holding|held|hit|hitting|punch|stab|stabbing|shoot|shooting|choke|choking|strangl|kidnap|bound|tied|tying|cuff|beat|beating|corner|cornered|threaten|mug|rob|drag|dragging|captive|prisoner)/i;
const SEV = { none: 0, minor: 1, theft: 2, assault: 3, kidnapping: 5, murder: 8 };
const ARREST_ACTS = ['grab', 'restrain', 'shove', 'knockout', 'punch', 'kick', 'threaten'];
const DEFENSE_ACTS = ['punch', 'kick', 'shove', 'knockout', 'grab', 'restrain', 'threaten'];
export function judge(def, base, roles, t, youHeld, laws = [], selfText = '') {
    const r = ROLES.filter(x => roles.includes(x.id));
    const authority = r.some(x => x.authority);
    const codes = CODES.filter(c => c.acts.includes(def.id) && r.some(x => x.codes?.includes(c.id))).map(c => c.id);
    if (t?.notPerson)
        return { kind: 'nothing', crime: 'none', label: 'not a person', why: 'they are not a person: nobody calls this a crime', codes };
    if (base === 'none')
        return { kind: 'fine', crime: 'none', label: '', why: '', codes };
    // the story's own law: this act, on someone like them, by someone like you
    const sl = t ? lawFor(laws, def.id, t.kinds ?? [], roles, selfText) : undefined;
    if (sl && sl.counts === 'minor' && SEV[base] > 1)
        return { kind: 'crime', crime: 'minor', label: `minor: ${sl.name}`, why: `${sl.name} makes it a minor offense`, codes, law: sl };
    if (sl)
        return { kind: 'legal', crime: 'none', label: `legal: ${sl.name}`, why: `${sl.name}${sl.note ? `: ${sl.note}` : ' allows it'}`, codes, law: sl };
    // someone who trusts you lets you drink: no crime (the Masquerade still says who may see)
    if (def.id === 'feed' && t?.willing)
        return { kind: 'fine', crime: 'none', label: 'willing vessel', why: 'they trust {{user}} and let it happen', codes };
    // the law, doing its job: someone wanted, or someone attacking you
    if (authority && t && (t.wanted || t.attacker) && ARREST_ACTS.includes(def.id)) {
        return { kind: 'arrest', crime: 'none', label: 'arrest', why: t.wanted ? `{{user}} is the law, and they are wanted for ${t.wanted === 'minor' ? 'causing a disturbance' : t.wanted}: a lawful arrest` : '{{user}} is the law, and they are attacking {{user}}: a lawful use of force', codes };
    }
    if (authority && t?.attacker && def.id === 'kill' && youHeld)
        return { kind: 'self-defense', crime: 'none', label: 'use of force', why: 'they were attacking {{user}}: deadly force in self-defense', codes };
    // anyone: hitting back
    if (t?.attacker && DEFENSE_ACTS.includes(def.id))
        return { kind: 'self-defense', crime: 'none', label: 'self-defense', why: 'they were attacking {{user}}: self-defense', codes };
    if (t?.attacker && def.id === 'kill' && youHeld)
        return { kind: 'self-defense', crime: 'none', label: 'self-defense', why: 'they had {{user}} and would not let go: killing in self-defense (people may still see it differently)', codes };
    const word = { none: '', minor: 'disturbance', theft: 'theft', assault: 'assault', kidnapping: 'kidnapping', murder: 'murder' }[base];
    return { kind: 'crime', crime: base, label: word, why: '', codes };
}
/** Who saw it, for a code: the ones outside it (a Kindred witness does not break the Masquerade). */
export function outsiders(codeId, witnesses) {
    const c = CODES.find(x => x.id === codeId);
    if (!c)
        return [];
    return witnesses.filter(w => !w.insider.some(i => c.insiders.some(k => i.toLowerCase().includes(k)))).map(w => w.name);
}
export const enforcerOf = (codeId, groups) => {
    const c = CODES.find(x => x.id === codeId);
    return c ? groups.find(gr => c.enforcers.some(k => gr.name.toLowerCase().includes(k))) : undefined;
};
const words = (t) => ` ${String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
/** A word's plain form, to compare "mice" with "mouse" and "rodents" with "rodent". */
export const stemWord = (w) => (w === 'mice' ? 'mouse' : w === 'wolves' ? 'wolf' : w.length > 3 ? w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1') : w);
/** Words that say nothing about which people: a law about "mouse kemonomimi" is about mice, in a world where all are kemonomimi. */
const GENERIC = new Set(['kemonomimi', 'people', 'person', 'persons', 'folk', 'folks', 'species', 'series', 'type', 'types', 'kind', 'kinds', 'citizen', 'citizens', 'being', 'beings', 'individual', 'individuals', 'girl', 'girls', 'boy', 'boys', 'man', 'men', 'woman', 'women', 'the', 'a', 'an', 'of', 'and', 'or', 'all', 'any', 'anyone', 'those', 'who', 'are', 'non']);
/**
 * Does any of what they are match any of the words? Whole words ("mouse" matches "mouse kemonomimi", not "mousetrap"),
 * and a longer phrase matches by any word in it that tells kinds apart: a law about "K4 mouse kemonomimi" covers "a mouse
 * girl"; one about "kemonomimi" alone covers anyone called a kemonomimi.
 */
export function kindMatches(kinds, about) {
    const k = kinds.map(words);
    const stems = new Set(kinds.flatMap(x => words(x).trim().split(' ').filter(Boolean).map(stemWord)));
    return about.map(a => words(a).trim()).filter(Boolean).some(a => k.some(x => x.includes(` ${a} `) || x.includes(` ${a}s `))
        || a.split(' ').filter(w => w.length >= 3 && !GENERIC.has(w)).some(w => stems.has(stemWord(w))));
}
/** The law that covers this act on someone like them, if you may use it. */
export function lawFor(laws, actId, kinds, roles, selfText) {
    return laws.find(l => l.allows.includes(actId) && kindMatches(kinds, l.about) && (!l.who.length || l.who.some(w => roles.includes(w) || words(selfText).includes(` ${w.toLowerCase()} `))));
}
/** A law that is about them, whatever the act (for the menu: "she is covered by the K4 control order"). */
export const lawsAbout = (laws, kinds) => laws.filter(l => kindMatches(kinds, l.about));
