// Player state: what the story says about {{user}}'s situation, so the engine knows when you can walk away.
// Every reply ends with a hidden block the model fills in:
//     <state>
//     mobility: free | engaged | held | restrained | incapacitated
//     reason: a few words
//     present: everyone else in the scene
//     outcome: none | dead | failed | captured
//     </state>
// The block is cut from the message (the player never sees it) and kept in the message's `extra`, so the state is
// always worked out again from the chat itself: swipes, edits, deletes and loaded saves need no bookkeeping.
// The AI proposes, the engine decides: it can make things worse at once, but only the engine (a roll) or a
// repeated report can make them better; a reply without a block keeps the last known state (fail closed).
// This file has no runtime imports, so it can be tested on its own.

export type Mobility = 'free' | 'engaged' | 'held' | 'restrained' | 'incapacitated';
export type Outcome = 'none' | 'dead' | 'failed' | 'captured';
export const MOBILITY: Mobility[] = ['free', 'engaged', 'held', 'restrained', 'incapacitated'];
export const OUTCOMES: Outcome[] = ['none', 'dead', 'failed', 'captured'];
export const rank = (m: Mobility) => MOBILITY.indexOf(m);
const worse = (a: Mobility, b: Mobility) => (rank(a) >= rank(b) ? a : b);

/** What happened to someone else in a reply (the roster keeps it). */
export type Change = 'arrived' | 'left' | 'injured' | 'recovered' | 'captured' | 'freed' | 'missing' | 'returned' | 'dead';
export const CHANGES: Change[] = ['arrived', 'left', 'injured', 'recovered', 'captured', 'freed', 'missing', 'returned', 'dead'];
export interface PersonChange { name: string; change: Change }
/** A crime someone else committed in a reply ("crimes:" in the block): the hostile actions engine follows it up. */
export type CrimeKind = 'minor' | 'theft' | 'assault' | 'kidnapping' | 'murder';
export interface ReportedCrime { name: string; crime: CrimeKind; target?: string }
/** What one reply's block said. Fields the model left out (or filled with the template) are undefined. */
export interface Reported { mobility?: Mobility; reason?: string; present?: string[]; outcome?: Outcome; changes?: PersonChange[]; crimes?: ReportedCrime[]; captor?: string | null; going?: { name: string; place: string } | null }

export const TAG = 'state';
const OPEN = /<\s*state\s*>/gi;
const BLOCK = /(?:```[a-z]*\s*)?<\s*state\s*>([\s\S]*?)<\s*\/\s*state\s*>(?:\s*```)?/gi;
const TAIL = /(?:```[a-z]*\s*)?<\s*state\s*>[\s\S]*$/i;          // a block the reply was cut in the middle of
const PARTIAL_TAG = /<\s*\/?\s*s?t?a?t?e?\s*$/i;                  // "<sta" at the very end, while it streams in

/** The message text without its state block(s). Also safe on a reply that is still streaming in. */
export function stripBlock(text: string): string {
    const t = String(text ?? '');
    if (!/<\s*\/?\s*s/i.test(t)) return t;
    return t.replace(BLOCK, '').replace(TAIL, '').replace(PARTIAL_TAG, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}
export const hasBlock = (text: string) => { OPEN.lastIndex = 0; return OPEN.test(String(text ?? '')); };

const SYN: Record<Mobility, RegExp> = {
    free: /^(free|mobile|unrestricted|able to (leave|move)|can (leave|move)|unhindered|alone|none)\b/,
    engaged: /^(engaged|busy|talking|occupied|in (a )?conversation|chatting|working|social)\b/,
    held: /^(held|detained|blocked|stopped|cornered|guarded|questioned|watched|surrounded|confronted|kept|delayed|not free)\b/,
    restrained: /^(restrained|tied|bound|cuffed|handcuffed|shackled|chained|grabbed|pinned|locked|trapped|caged|grappled|imprisoned|jailed|captive|seized)\b/,
    incapacitated: /^(incapacitated|unconscious|knocked out|ko|paralyzed|paralysed|asleep|sedated|stunned|helpless|immobile|immobilized|collapsed|passed out|down)\b/,
};
export function mobilityOf(v: string): Mobility | undefined {
    const s = String(v ?? '').toLowerCase().replace(/[*_`"'[\]]/g, '').trim();
    if (!s || s.includes('|')) return undefined;   // the model copied the template instead of choosing
    for (const m of MOBILITY) if (SYN[m].test(s)) return m;
    return undefined;
}
export function outcomeOf(v: string): Outcome | undefined {
    const s = String(v ?? '').toLowerCase().replace(/[*_`"'[\]]/g, '').trim();
    if (!s || s.includes('|')) return undefined;
    if (/^(none|no|n\/a|nothing|ongoing|continuing|alive|-|—)\b/.test(s) || s === '-') return 'none';
    if (/^(dead|died|death|killed|deceased|slain)\b/.test(s)) return 'dead';
    if (/^(captured|imprisoned|arrested|taken|enslaved|abducted|kidnapped)\b/.test(s)) return 'captured';
    if (/^(failed|fail|failure|lost|game over|defeat|defeated|over)\b/.test(s)) return 'failed';
    return undefined;
}
const NOBODY = /^(none|nobody|no one|noone|no-one|n\/a|-|—|nothing|alone|empty)$/i;
// not a person: "everyone here", "the others", "the crowd"
const VAGUE = /^(the\s+)?(everyone|everybody|all|others|other people|people|crowd|group|rest|same|same as before|unchanged|customers|patrons|passers-by|passersby)(\s+(here|present|around|else|of them))?$/i;
export function namesOf(v: string, user = ''): string[] {
    const self = new Set(['{{user}}', 'you', 'user', 'player', user.toLowerCase()].filter(Boolean));
    const out: string[] = [];
    for (let part of String(v ?? '').split(/[,;\n]|\s+and\s+|\s*&\s*/i)) {
        part = part.replace(/\([^)]*\)/g, '').replace(/[*_`"[\]]/g, '').replace(/^[-•\s]+/, '').trim();
        if (!part || NOBODY.test(part) || VAGUE.test(part) || part.includes('|') || self.has(part.toLowerCase())) continue;
        if (part.length > 60) part = part.slice(0, 60).trim();
        if (!out.some(x => x.toLowerCase() === part.toLowerCase())) out.push(part);
    }
    return out.slice(0, 12);
}

const CHANGE_SYN: [Change, RegExp][] = [
    ['dead', /^(dead|died|dies|killed|deceased|slain|murdered|is dead|was killed|passed away)\b/],
    ['captured', /^(captured|arrested|kidnapped|abducted|taken|imprisoned|jailed|detained)\b/],
    ['freed', /^(freed|released|rescued|escaped|let go)\b/],
    ['missing', /^(missing|vanished|disappeared|lost|gone missing)\b/],
    ['returned', /^(returned|back|came back|found|reappeared)\b/],
    ['injured', /^(injured|hurt|wounded|bleeding|beaten|shot)\b/],
    ['recovered', /^(recovered|healed|better|fine again)\b/],
    ['left', /^(left|leaves|leaving|departed|gone|walked out|went away|ran off)\b/],
    ['arrived', /^(arrived|arrives|came in|entered|enters|joined|joins|showed up|appeared|new)\b/],
];
export function changeOf(v: string): Change | undefined {
    const s = String(v ?? '').toLowerCase().replace(/[*_`"'[\]().!]/g, '').trim();
    if (!s || s.includes('|')) return undefined;
    for (const [c, re] of CHANGE_SYN) if (re.test(s)) return c;
    return undefined;
}
/** "Officer Diaz = dead; Mara = left" (also "Diaz: died", "Diaz died"). */
export function changesOf(v: string, user = ''): PersonChange[] {
    const out: PersonChange[] = [];
    const self = new Set(['{{user}}', 'you', 'user', 'player', user.toLowerCase()].filter(Boolean));
    const raw = String(v ?? '');
    if (NOBODY.test(raw.trim()) || raw.includes('|')) return out;
    const parts = raw.split(/;|\n|,(?=[^,]*(?:=|:|→|->))/);
    for (let p of parts) {
        p = p.replace(/[*_`"[\]]/g, '').trim();
        if (!p || NOBODY.test(p)) continue;
        let m = p.match(/^(.+?)\s*(?:=|:|→|->|—|–)\s*(.+)$/);
        if (!m) { const w = p.match(/^(.+?)\s+((?:is |was |has )?[a-z]+(?: [a-z]+)?)$/i); if (w) m = [p, w[1], w[2].replace(/^(is|was|has) /i, '')] as any; }
        if (!m) continue;
        const name = m[1].replace(/\([^)]*\)/g, '').trim(), change = changeOf(m[2]);
        if (!name || !change || name.length > 60 || self.has(name.toLowerCase())) continue;
        if (!out.some(x => x.name.toLowerCase() === name.toLowerCase() && x.change === change)) out.push({ name, change });
    }
    return out.slice(0, 12);
}

const CRIME_SYN: [CrimeKind, RegExp][] = [
    ['murder', /^(murder|murdered|killing|killed|homicide|manslaughter)\b/],
    ['kidnapping', /^(kidnapping|kidnapped|abduction|abducted|took|taking|hostage|unlawful restraint)\b/],
    ['assault', /^(assault|assaulted|attack|attacked|battery|hit|punched|stabbed|shot|beat|beating|fight|fighting|violence)\b/],
    ['theft', /^(theft|stole|stealing|robbery|robbed|mugging|mugged|burglary|shoplifting|pickpocket)/],
    ['minor', /^(disturbance|vandalism|trespass|trespassing|threat|threatened|threatening|harassment|disorderly|minor)\b/],
];
export function crimeOf(v: string): CrimeKind | undefined {
    const s = String(v ?? '').toLowerCase().replace(/[*_`"'[\]().!]/g, '').trim();
    if (!s || s.includes('|')) return undefined;
    for (const [c, re] of CRIME_SYN) if (re.test(s)) return c;
    return undefined;
}
/** "Marco = assault on the clerk; Ana = theft" (also "Marco: murder of Diaz"). {{user}}'s own crimes are the engine's. */
export function crimesOf(v: string, user = ''): ReportedCrime[] {
    const out: ReportedCrime[] = [];
    const self = new Set(['{{user}}', 'you', 'user', 'player', user.toLowerCase()].filter(Boolean));
    const raw = String(v ?? '');
    if (NOBODY.test(raw.trim()) || raw.includes('|')) return out;
    for (let p of raw.split(/;|\n/)) {
        p = p.replace(/[*_`"[\]]/g, '').trim();
        const m = p.match(/^(.+?)\s*(?:=|:|→|->|—|–)\s*(.+)$/);
        if (!m) continue;
        const name = m[1].replace(/\([^)]*\)/g, '').trim();
        const what = m[2].trim();
        const crime = crimeOf(what);
        if (!name || !crime || name.length > 60 || self.has(name.toLowerCase())) continue;
        const t = what.match(/\b(?:on|of|against|from|to)\s+(.+)$/i)?.[1]?.replace(/[.!]$/, '').trim();
        const target = t && !self.has(t.toLowerCase()) ? t.slice(0, 60) : t ? '{{user}}' : undefined;
        if (!out.some(x => x.name.toLowerCase() === name.toLowerCase() && x.crime === crime)) out.push({ name, crime, ...(target ? { target } : {}) });
    }
    return out.slice(0, 6);
}

/** "Bianca → the docks" (also "Bianca -> her place", "Bianca to the bar", "Bianca: the bar"): someone taking or leading
 *  {{user}} to another place. null for none. */
export function goingOf(v: string, user = ''): { name: string; place: string } | null {
    const raw = String(v ?? '').replace(/[*_`"[\]]/g, '').trim();
    if (!raw || NOBODY.test(raw) || raw.includes('|') || /^(no|nobody|no one|n\/a)\b/i.test(raw)) return null;
    const m = raw.match(/^(.+?)\s*(?:→|->|=>|—>|:|=|\s(?:is )?(?:taking (?:\{\{user\}\}|you|them|\w+) )?(?:to|toward|towards|into)\s)\s*(.+)$/i);
    if (!m) return null;
    const name = m[1].replace(/\([^)]*\)/g, '').replace(/\s+(?:is\s+)?(?:taking|leading|bringing)(?:\s+\S+)?$/i, '').trim();
    const place = m[2].replace(/^(to|toward|towards|into)\s+/i, '').replace(/[.!]$/, '').trim();
    const self = new Set(['{{user}}', 'you', 'user', 'player', user.toLowerCase()].filter(Boolean));
    if (!name || !place || name.length > 60 || place.length > 80 || self.has(name.toLowerCase()) || NOBODY.test(place)) return null;
    if (/^name$/i.test(name) && /^place$/i.test(place)) return null;   // the template, copied
    return { name, place };
}

/** Reads the last state block in a reply. null when there is none. */
export function parseBlock(text: string, user = ''): Reported | null {
    const t = String(text ?? '');
    let body: string | null = null;
    BLOCK.lastIndex = 0;
    for (let m = BLOCK.exec(t); m; m = BLOCK.exec(t)) body = m[1];
    if (body === null) {
        const tail = t.match(TAIL);
        if (!tail) return null;
        body = tail[0].replace(/^(?:```[a-z]*\s*)?<\s*state\s*>/i, '');
    }
    const out: Reported = {};
    for (const raw of body.split('\n')) {
        const line = raw.replace(/^[\s*_`>-]+/, '').replace(/\*\*/g, '');
        const kv = line.match(/^([a-z][a-z ]{1,20}?)\s*[:=]\s*(.*)$/i);
        if (!kv) continue;
        const key = kv[1].toLowerCase().trim(), val = kv[2].trim();
        if (/^(mobility|mobile|movement|status|can leave|state)$/.test(key)) { const m = mobilityOf(val); if (m) out.mobility = m; }
        else if (/^(reason|why|because|note|cause)$/.test(key)) { if (val && !val.includes('|') && !/^<.*>$/.test(val)) out.reason = val.slice(0, 140); }
        else if (/^(present|here|people|characters|others|who|in scene|npcs)$/.test(key)) out.present = namesOf(val, user);
        else if (/^(outcome|ending|end|result|fate)$/.test(key)) { const o = outcomeOf(val); if (o) out.outcome = o; }
        else if (/^(changes|change|events|others|people changes|what happened)$/.test(key)) out.changes = changesOf(val, user);
        else if (/^(crimes|crime|offenses|offences|wrongdoing)$/.test(key)) out.crimes = crimesOf(val, user);
        else if (/^(going|leading|taking|lead|led by|destination|moving)$/.test(key)) out.going = goingOf(val, user);
        else if (/^(captor|held by|captured by|prisoner of|kidnapper|taken by)$/.test(key)) { if (!val.includes('|')) { const n = namesOf(val, user)[0]; out.captor = n ?? null; } }
    }
    return out;
}

/* ---------- working the state out from the visit's lines ---------- */

/** One line of the current visit, as the fold sees it. */
export interface PLine {
    kind: 'ai' | 'user' | 'other';
    /** ai: what its block said; null = it had no block (and the fallback check found none either). */
    rep?: Reported | null;
    /** user: the engine rolled for an attempt to get away. */
    escape?: { ok: boolean; crit?: boolean };
    /** user: a hostile action the engine rolled for, and what it decided for {{user}} (a fight starts, the police
     *  step in, {{user}} shoved their way out, gave themselves up…). */
    act?: { mobility?: Mobility; reason?: string; free?: boolean; outcome?: Outcome; outcomeReason?: string };
    /** ai: the player said its outcome is not what happened. */
    dismissed?: boolean;
}
export interface PState {
    mobility: Mobility; reason: string; present: string[];
    outcome: Outcome; outcomeReason: string; outcomeAt: number;
    misses: number;                                    // replies in a row without a block
    pending: { to: Mobility; n: number } | null;       // a better state the model reported once (needs a second report)
    captor: string;                                    // who has taken {{user}} prisoner ('' = nobody)
    grace: number;                                     // replies for which the model cannot make it worse again (after a good roll)
    cooldown: number;                                  // replies before another try to get away
    lastAi: number;                                    // index (in the lines) of the last reply
}
export const freshState = (): PState => ({ mobility: 'free', reason: '', present: [], outcome: 'none', outcomeReason: '', outcomeAt: -1, misses: 0, pending: null, captor: '', grace: 0, cooldown: 0, lastAi: -1 });

export function fold(lines: PLine[], start: PState = freshState()): PState {
    const s: PState = { ...start, present: [...start.present], pending: start.pending ? { ...start.pending } : null };
    lines.forEach((l, i) => {
        if (l.kind === 'user' && l.escape) {
            if (l.escape.ok) { s.mobility = 'free'; s.reason = 'got away'; s.pending = null; s.grace = 1; s.cooldown = 0; s.captor = ''; }
            else {
                s.cooldown = 2;
                if (l.escape.crit && rank(s.mobility) < rank('restrained')) { s.mobility = 'restrained'; s.reason = `${s.reason ? `${s.reason}; ` : ''}caught trying to get away`; }
            }
            return;
        }
        if (l.kind === 'user' && l.act) {
            const a = l.act;
            if (a.outcome && a.outcome !== 'none' && s.outcome === 'none') { s.outcome = a.outcome; s.outcomeReason = a.outcomeReason ?? ''; s.outcomeAt = i; }
            if (a.free) { s.mobility = 'free'; s.reason = a.reason ?? ''; s.pending = null; s.grace = 1; s.cooldown = 0; s.captor = ''; }
            else if (a.mobility && rank(a.mobility) >= rank(s.mobility)) { s.mobility = a.mobility; if (a.reason) s.reason = a.reason; s.pending = null; }
            return;
        }
        if (l.kind !== 'ai') return;
        s.lastAi = i;
        if (s.cooldown > 0) s.cooldown--;
        const r = l.dismissed ? null : l.rep;   // "that's not what happened": the whole block of that reply is ignored
        if (!r) { s.misses++; s.pending = null; if (s.grace > 0) s.grace--; return; }
        s.misses = 0;
        if (r.present) s.present = [...r.present];
        if (r.captor !== undefined) s.captor = r.captor ?? '';
        if (r.outcome && r.outcome !== 'none' && s.outcome === 'none') {
            s.outcome = r.outcome; s.outcomeReason = r.reason ?? ''; s.outcomeAt = i;
        }
        if (!r.mobility) { s.pending = null; if (s.grace > 0) s.grace--; return; }
        const now = rank(s.mobility), said = rank(r.mobility);
        if (s.grace > 0) {
            s.grace--;
            if (said > now) return;                      // right after getting away, the story cannot take it back
            s.mobility = r.mobility; s.reason = r.reason ?? s.reason; s.pending = null;
            return;
        }
        if (said >= now) { s.mobility = r.mobility; if (r.reason) s.reason = r.reason; s.pending = null; return; }
        // better than before: from a conversation, at once; from held, after two reports in a row; from restrained
        // or worse, one step at a time (first back to held), so a model that forgets the handcuffs cannot free you
        if (now <= rank('engaged')) { s.mobility = r.mobility; s.reason = r.reason ?? ''; s.pending = null; return; }
        // a cause the engine can see in the same reply: someone died, left, was taken or went missing (the one
        // holding you, most likely), so a better state counts at once (from restrained, still one step at a time)
        if (r.changes?.some(c => c.change === 'dead' || c.change === 'left' || c.change === 'captured' || c.change === 'missing')) {
            const step = now >= rank('restrained') && rank(r.mobility) < rank('held');
            s.mobility = step ? 'held' : r.mobility; s.reason = step ? s.reason : (r.reason ?? ''); s.pending = null;
            return;
        }
        if (s.pending) {
            const to = worse(s.pending.to, r.mobility);
            const step = now >= rank('restrained') && rank(to) < rank('held');
            s.mobility = step ? 'held' : to;
            if (!step) s.reason = r.reason ?? s.reason;   // still held: the old reason says why
            s.pending = null;
            return;
        }
        s.pending = { to: r.mobility, n: 1 };
    });
    if (s.mobility === 'free' || s.mobility === 'engaged') s.captor = '';
    return s;
}

/* ---------- what the engine lets you do ---------- */

export type Gate =
    | { kind: 'go' }
    | { kind: 'walkout' }
    | { kind: 'roll'; dc: number; traits: string[] }
    | { kind: 'blocked'; why: string }
    | { kind: 'over' };
export interface GateCfg { heldDc: number; restrainedDc: number; heldTraits: string[]; restrainedTraits: string[] }
export const GATE_DEFAULTS: GateCfg = {
    heldDc: 12, restrainedDc: 16,
    heldTraits: ['Charming', 'Smart', 'Outgoing', 'Calm', 'Athletic'],
    restrainedTraits: ['Strong', 'Athletic', 'Handy', 'Smart'],
};
export function gateFor(s: PState, cfg: GateCfg = GATE_DEFAULTS): Gate {
    if (s.outcome !== 'none') return { kind: 'over' };
    switch (s.mobility) {
        case 'free': return { kind: 'go' };
        case 'engaged': return { kind: 'walkout' };
        case 'incapacitated': return { kind: 'blocked', why: s.reason || 'you cannot move' };
        default:
            if (s.cooldown > 0) return { kind: 'blocked', why: 'they are watching you too closely to try again right now' };
            return s.mobility === 'held' ? { kind: 'roll', dc: cfg.heldDc, traits: cfg.heldTraits } : { kind: 'roll', dc: cfg.restrainedDc, traits: cfg.restrainedTraits };
    }
}

/* ---------- what the model is told ---------- */

export const MOBILITY_WORDS: Record<Mobility, string> = {
    free: 'free to leave', engaged: 'in the middle of something (a conversation or a task)', held: 'being held here',
    restrained: 'physically restrained', incapacitated: 'unable to move',
};
export function instructionText(s: PState, walkOns: string[], opts: { crimes?: boolean } = {}): string {
    const now = s.mobility === 'free' ? '' : `Right now {{user}} is ${MOBILITY_WORDS[s.mobility]}${s.reason ? ` (${s.reason})` : ''}.`;
    const also = walkOns.length ? ` Also in the scene: ${walkOns.join(', ')}.` : '';
    return [
        '[Game state: the game engine tracks {{user}}\'s situation.' + (now ? ` ${now}` : '') + also + ']',
        'End your reply with this block, filled in for the situation at the END of your reply. The player never sees it; the game reads it.',
        '<state>',
        'mobility: free | engaged | held | restrained | incapacitated',
        'reason: a few words',
        'present: everyone else in the scene, comma separated, or none',
        'outcome: none | dead | failed | captured',
        'changes: what happened to OTHER people in this reply, as Name = arrived | left | injured | recovered | captured | freed | missing | returned | dead (several separated by ;), or none',
        ...(opts.crimes ? ['crimes: a crime someone OTHER than {{user}} committed in this reply, as Name = assault | theft | kidnapping | murder | disturbance on Victim (separated by ;), or none'] : []),
        ...(opts.crimes ? ['captor: the one who has taken {{user}} prisoner (tied up, locked in, carried off; not a scuffle), or none',
            'going: someone taking or leading {{user}} to ANOTHER place right now (a prisoner being moved, or an invitation to come along), as Name → Place, or none'] : []),
        '</state>',
        'Pick ONE value per line. free = {{user}} can walk away; engaged = in a conversation or task they could leave, but it would be rude; held = someone is keeping {{user}} here (blocking the way, questioning, guarding); restrained = tied, cuffed, grabbed, locked in; incapacitated = unconscious or too hurt to move. outcome stays none unless {{user}} has died, has failed for good, or is captured for good.',
        'Only the game decides whether {{user}} gets away: never write {{user}} leaving the place on their own.',
    ].join('\n');
}
/** For the fallback check, when a reply came without a block. */
export function checkPrompt(reply: string, before: PState, user: string): string {
    return [
        `Before this reply, ${user} was ${MOBILITY_WORDS[before.mobility]}${before.reason ? ` (${before.reason})` : ''}.${before.present.length ? ` Present: ${before.present.join(', ')}.` : ''}`,
        'The reply:', '"""', String(reply ?? '').slice(-3000), '"""',
        `Fill in this block for ${user}'s situation at the END of the reply. Pick one value per line. Answer with the block only.`,
        '<state>',
        'mobility: free | engaged | held | restrained | incapacitated',
        'reason: a few words',
        `present: everyone in the scene besides ${user}, comma separated, or none`,
        'outcome: none | dead | failed | captured',
        `changes: what happened to people other than ${user} in the reply, as Name = arrived | left | injured | recovered | captured | freed | missing | returned | dead (separated by ;), or none`,
        '</state>',
        `free = ${user} can walk away; engaged = in a conversation they could leave; held = someone keeps ${user} there; restrained = tied, cuffed, grabbed, locked in; incapacitated = unconscious or cannot move. outcome is none unless ${user} died, failed for good, or was captured for good.`,
    ].join('\n');
}
