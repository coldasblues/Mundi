// Hostile actions in a running game: punching, grabbing, stealing, killing… The engine rolls; the result is written
// at once (it is final, like a roll to get away); the AI is told exactly what happened and tells it.
// What comes after depends on the world, not on fixed rules:
//   - a world with law (police, the city watch): a crime someone sees may be reported; the law comes, or finds you
//     later; an officer who sees it steps in on the spot. You can try to get away, or give yourself up.
//   - a world without law (The Walking Dead): nobody comes; the victim's group holds a grudge and comes for you.
//   - always: the people who saw it remember it (and the town talks), and it changes how they feel about you.
// The same goes for the AI's characters: a crime the story reports ("crimes:" in the state block) is followed up too.
import { game, settings, saveGame, nowAbs, TUT, state } from '../core/store.js';
import { getWorld, styleOf } from '../core/world.js';
import { chat, ctx, narratorLine, personaName, saveChat } from '../st/bridge.js';
import { presentAt, peopleHooks } from './people.js';
import { placeOf, playerHomeId, isHome } from './places.js';
import { traitsOf } from './work.js';
import { note, placeName } from './facts.js';
import { feel } from './life.js';
import { loseBond, bondOf, isPartner } from './social.js';
import { onStep, onHour, onDay } from './hooks.js';
import { keyFor, applyNow, rosterHooks, statusOf, pendingChanges } from './roster.js';
import { currentState, walkOns, psOn, psHooks, visitLines, keepNarration, refreshPState, seenWalkOns } from './pstate-live.js';
import { payOf } from './bills.js';
import { DEFAULT_ACTS, SEVERITY, CRIME_WORD, worst, blockedFor, dcFor, chanceFor, crowdLevel, crowdSees, noticeChance, reportChance, responseMinutes, LAW_ROLES_MODERN, LAW_ROLES_MEDIEVAL, LAW_JOBS, isLawName, decide, fillIn, } from './hostile-rules.js';
export function hs(g) {
    const x = (g.hostile ??= {});
    x.captives ??= {};
    x.down ??= {};
    x.incidents ??= [];
    x.groups ??= {};
    x.grudge ??= {};
    x.law ??= { mode: 'auto' };
    x.lawKeys ??= [];
    x.jail ??= {};
    x.queue ??= [];
    x.captor ??= null;
    x.followers ??= [];
    return x;
}
export function hxPrefs() { const s = settings(); s.hostile ??= {}; s.hostile.on ??= true; return s.hostile; }
export const hxOn = () => !TUT.save && psOn() && hxPrefs().on;
/** World.json can set it ("law": { "exists": false } for a world without any); each game can override it. */
/** `worldOnly`: what the world says, without this game's own choice. */
export function lawOf(g, w, worldOnly = false) {
    const wl = (w.law ?? {});
    const medieval = styleOf(w) === 'medieval';
    const roles = wl.roles ?? (medieval ? LAW_ROLES_MEDIEVAL : LAW_ROLES_MODERN);
    const law = {
        exists: wl.exists ?? true,
        name: wl.name ?? (medieval ? 'the city watch' : 'the police'),
        roles,
        // the world's police or guard jobs, by whole words ("Lifeguard" is not the law)
        occupations: wl.occupations ?? w.occupations.filter(o => isLawName(o.name, LAW_JOBS) || o.id.toLowerCase().split(/[^a-z]+/).some(x => LAW_JOB_WORDS.includes(x))).map(o => o.id),
        slow: wl.slow ?? medieval,
        walkOn: wl.walkOn ?? (medieval ? 'a town guard' : 'a police officer'),
    };
    if (worldOnly)
        return law;
    const own = hs(g).law;
    if (own.mode === 'off')
        law.exists = false;
    else if (own.mode === 'on')
        law.exists = true;
    if (own.name?.trim())
        law.name = own.name.trim();
    return law;
}
const isLawCast = (g, law, r) => hs(g).lawKeys.includes(`cast:${r.avatar}`) || (!!r.occupation && law.occupations.includes(r.occupation));
export const isLawKey = (g, w, key, name) => {
    const law = lawOf(g, w);
    if (hs(g).lawKeys.includes(key))
        return true;
    if (key.startsWith('cast:')) {
        const r = g.cast[key.slice(5)];
        return !!r && isLawCast(g, law, r);
    }
    return isLawName(name, law.roles);
};
const LAW_JOB_WORDS = ['police', 'policeman', 'policewoman', 'cop', 'guard', 'guardsman', 'watch', 'watchman', 'sheriff', 'deputy', 'security', 'constable', 'bailiff', 'marshal', 'detective'];
export function groupOf(g, key) { return Object.values(hs(g).groups).find(x => x.members.includes(key)); }
export function peopleHere(g, w) {
    const st = hs(g);
    const now = nowAbs(g);
    const out = [];
    const add = (p) => {
        if (out.some(x => x.key === p.key))
            return;
        const d = st.down[p.key];
        const c = st.captives[p.key];
        out.push({ ...p, law: isLawKey(g, w, p.key, p.name), down: d && d.until > now && d.loc === g.player.loc ? d.how : undefined, captive: c?.how, group: groupOf(g, p.key)?.name });
    };
    for (const r of presentAt(g, w, g.player.loc))
        add({ key: `cast:${r.avatar}`, name: r.met ? r.name : r.name, kind: 'cast', avatar: r.avatar, met: r.met });
    for (const n of walkOns(g, w)) {
        const k = keyFor(g, n);
        add({ key: k.key, name: n, kind: 'walkon', met: true });
    }
    return out;
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const targetState = (p) => (p ? { down: p.down, captive: p.captive, law: p.law } : null);
const display = (p) => (p.kind === 'cast' && !p.met ? 'someone' : p.name);
/** How busy this place is right now (0–3). */
export function crowdHere(g, w, loc = g.player.loc) {
    const p = placeOf(g, w, loc);
    return crowdLevel(p?.tags ?? [], Math.floor(g.minutes / 60), isHome(loc), p?.crowd);
}
export const CROWD_WORD = ['nobody else around', 'a few people around', 'busy', 'packed'];
/* ---------- the menu: what you can do, and the odds ---------- */
export const actsOf = (w) => {
    const own = w.hostileActions; // a world (or a genre pack) adds or replaces some
    if (!own?.length)
        return DEFAULT_ACTS;
    const list = DEFAULT_ACTS.filter(d => !own.some(o => o.id === d.id));
    return [...list, ...own];
};
export function bonusOf(g, def) {
    const mine = traitsOf(g);
    let b = def.traits.filter(t => mine.includes(t)).length * 2;
    if ((g.player.stats.energy ?? 100) <= 20)
        b -= 2;
    if ((g.player.stats.life ?? g.player.stats.health ?? 100) <= 30)
        b -= 2;
    return b;
}
export function optionsFor(g, w, targetKey) {
    const p = peopleHere(g, w).find(x => x.key === targetKey);
    const you = currentState(g).mobility;
    return actsOf(w).map(def => {
        const t = def.target ? targetState(p) : null;
        const blocked = def.target && !p ? 'Pick someone first.' : blockedFor(def, t);
        const dc = dcFor(def, t, you);
        return { def, dc, blocked, chance: chanceFor(dc, bonusOf(g, def)) };
    });
}
/** Why no hostile action is possible right now ('' when it is). */
export function cannotAct(g) {
    const s = currentState(g);
    if (s.outcome !== 'none')
        return 'The story has ended.';
    if (s.mobility === 'restrained')
        return `You're restrained${s.reason ? ` (${s.reason})` : ''}.`;
    if (s.mobility === 'incapacitated')
        return 'You can\'t move.';
    return '';
}
const rnd = () => Math.random();
const money = (g, w) => {
    const costs = w.actions.map(a => a.cost).filter(c => c > 0).sort((a, b) => a - b);
    const base = costs.length ? costs[Math.floor(costs.length / 2)] : 10;
    return payOf(g, Math.max(1, Math.round(base * (1.5 + rnd() * 4.5))));
};
export function resolveAct(g, w, id, targetKey) {
    const def = actsOf(w).find(d => d.id === id);
    if (!def)
        return 'That action does not exist here.';
    const why = cannotAct(g);
    if (why)
        return why;
    const here = peopleHere(g, w);
    const target = def.target ? here.find(x => x.key === targetKey) : undefined;
    if (def.target && !target)
        return 'They are not here anymore.';
    const t = targetState(target);
    const blocked = blockedFor(def, t);
    if (blocked)
        return blocked;
    const s = currentState(g);
    const tName = target ? display(target) : '';
    const holderIsTarget = !!target && (!s.reason || s.reason.toLowerCase().includes(target.name.toLowerCase().replace(/^(the|a|an)\s+/, '')) || here.filter(x => x.key !== target.key && !x.captive && !x.down).length === 0);
    const dc = dcFor(def, t, s.mobility);
    const bonus = bonusOf(g, def);
    const d20 = 1 + Math.floor(rnd() * 20);
    const decided = decide(def, d20, bonus, dc, tName, t, s.mobility, holderIsTarget);
    const st = hs(g);
    const now = nowAbs(g);
    const law = lawOf(g, w);
    const where = placeName(g, w, g.player.loc);
    let cash = 0;
    // what it does to them (written at once)
    if (target) {
        if (decided.change)
            applyNow(g, w, target.name, decided.change, decided.change === 'dead' ? `killed by ${personaName()}` : '');
        if (decided.change === 'dead') {
            delete st.captives[target.key];
            delete st.down[target.key];
        }
        if (decided.down)
            st.down[target.key] = { key: target.key, name: target.name, avatar: target.avatar, how: decided.down, until: now + (decided.downMins ?? 10), loc: g.player.loc };
        if (decided.captive)
            st.captives[target.key] = { key: target.key, name: target.name, kind: target.kind, avatar: target.avatar, how: decided.captive, since: now };
        if (decided.scare)
            applyNow(g, w, target.name, 'left');
        if (decided.money) {
            cash = money(g, w);
            g.player.money += cash;
        }
        if (target.avatar && def.crime !== 'none') {
            loseBond(g, target.avatar, SEVERITY[def.crime] * (decided.ok ? 6 : 3));
            feel(g, target.avatar, decided.change === 'dead' ? '' : `afraid of and angry at you: you tried to ${fillIn(def.verb, 'them', 'you')}`, 3 + SEVERITY[def.crime]);
        }
    }
    // a theft nobody noticed is no crime anyone knows about; the rest is
    const crime = def.crime === 'theft' && decided.ok ? 'theft' : def.crime;
    // who saw it: the people right here (a quiet action may go unnoticed), and the crowd
    const others = here.filter(x => x.key !== target?.key && !x.captive && x.down !== 'out');
    const seenBy = others.filter(() => rnd() < noticeChance(def.noise));
    const crowd = crowdHere(g, w);
    const crowdSaw = rnd() < crowdSees(crowd, def.noise);
    const victimSaw = !!target && decided.change !== 'dead' && target.down !== 'out' && (def.id !== 'steal' || !decided.ok);
    const lawP = seenBy.find(x => x.law) ?? (target?.law && victimSaw && !decided.down && !decided.captive ? target : undefined);
    const known = seenBy.length > 0 || crowdSaw || victimSaw;
    // the law: steps in at once, or someone calls it
    let reported = false, eta;
    if (law.exists && crime !== 'none' && known && !lawP) {
        const ps = [...seenBy.map(x => reportChance(crime, !!x.avatar && (bondOf(g, x.avatar) >= 55 || isPartner(g, x.avatar)))), crowdSaw ? reportChance(crime) : 0, victimSaw ? reportChance(crime) * 0.8 : 0];
        reported = rnd() < 1 - ps.reduce((a, p) => a * (1 - p), 1);
        if (reported)
            eta = now + responseMinutes(rnd(), law.slow);
    }
    const inc = { id: `i${now}_${st.incidents.length}`, at: now, place: g.player.loc, by: 'you', act: def.id, crime, target: target?.name, targetKey: target?.key, seen: seenBy.map(display), crowd: crowdSaw, lawSaw: !!lawP && law.exists, reported, eta, state: crime === 'none' ? 'closed' : 'open' };
    if (crime !== 'none' && (known || decided.change === 'dead'))
        st.incidents.push(inc);
    st.incidents = st.incidents.slice(-60);
    // the people who saw it remember it (and the town will talk); it changes how they feel about you
    const verbPast = fillIn(def.verb, target?.name ?? '', '{u}');
    if (known) {
        const who = [...seenBy.filter(x => x.avatar).map(x => x.avatar), ...(target?.avatar && victimSaw ? [target.avatar] : [])];
        note(g, decided.ok ? `{u} managed to ${verbPast.replace(/^\{u\} /, '')} at {0}.` : `{u} tried to ${verbPast.replace(/^\{u\} /, '')} at {0}.`, [where], who, g.player.loc, 'life');
        for (const x of seenBy)
            if (x.avatar && def.crime !== 'none') {
                loseBond(g, x.avatar, SEVERITY[def.crime]);
                feel(g, x.avatar, `shaken: saw you ${fillIn(def.verb, x.name === target?.name ? 'them' : (target?.name ?? ''), 'you').replace(/^you /, '')}`, 2);
            }
    }
    // the victim's group: no law needed for this
    const grp = target ? groupOf(g, target.key) : undefined;
    if (grp && crime !== 'none' && (victimSaw || seenBy.some(x => grp.members.includes(x.key)) || decided.change === 'dead'))
        st.grudge[grp.id] = (st.grudge[grp.id] ?? 0) + SEVERITY[crime];
    // what it means for you
    const act = { ...(decided.you ?? {}) };
    if (lawP && law.exists && crime !== 'none') {
        const heavy = SEVERITY[crime] >= SEVERITY.kidnapping;
        act.free = false;
        act.mobility = heavy ? 'restrained' : 'held';
        act.reason = `${display(lawP)} saw it and is arresting ${personaName()}`;
    }
    saveGame();
    // what the AI is told
    const grade = { 'critical-fail': 'CRITICAL FAILURE', fail: 'FAILURE', success: 'SUCCESS', 'critical-success': 'CRITICAL SUCCESS' }[decided.grade];
    const tw = tName || 'them';
    const parts = [
        `[The game rolled for {{user}}'s attempt to ${fillIn(def.verb, tw, '{{user}}')}: ${grade}. What happens: ${decided.text}.`,
        decided.change === 'dead' ? `${tw} is dead.` : decided.change === 'injured' ? `${tw} is hurt.` : '',
        decided.down === 'out' ? `${tw} is unconscious.` : decided.down === 'down' ? `${tw} is on the ground.` : '',
        decided.captive === 'held' ? `${tw} is in {{user}}'s grip and cannot get away.` : decided.captive === 'restrained' ? `${tw} is tied up and cannot move.` : '',
        decided.scare ? `${tw} backs off and leaves.` : '',
        cash ? `{{user}} gets away with some money.` : '',
        seenBy.length ? `${seenBy.map(display).join(', ')} saw it.` : 'Nobody in the scene noticed.',
        crowdSaw ? 'People nearby saw it too.' : '',
        lawP && law.exists && crime !== 'none' ? `${display(lawP)} saw it and moves in to arrest {{user}} right away.` : reported ? `Someone is calling ${law.name}.` : '',
        `Write exactly this outcome and how the people here react; do not change it.`,
        `In the state block: mobility: ${act.free ? 'free' : act.mobility ?? (s.mobility === 'free' ? 'free (or engaged)' : s.mobility)}${decided.change === 'dead' ? `; changes: ${tw} = dead` : ''}.]`,
    ];
    const directive = parts.filter(Boolean).join(' ');
    const line = fillIn(def.line, tw, '');
    const told = cap(decided.text.replace(/\{\{user\}\}('s)?/g, (_, s) => (s ? 'your' : 'you')));
    const summary = `🎲 ${dc ? `${d20}${bonus ? ` ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)}` : ''} vs ${dc} · ` : ''}${def.name}: ${told}.${seenBy.length ? ` Seen by ${seenBy.map(display).join(', ')}.` : crowdSaw ? ' People nearby saw it.' : ' Nobody saw it.'}${lawP && law.exists && crime !== 'none' ? ` ${cap(display(lawP))} is arresting you!` : reported ? ` Someone called ${law.name}.` : ''}`;
    return { def, target, d20, bonus, dc, decided, seen: seenBy.map(display), crowdSaw, lawHere: lawP ? display(lawP) : '', reported, noLaw: !law.exists, cash, act, directive, line, summary };
}
/* ---------- captives ---------- */
export const captives = (g) => Object.values(hs(g).captives);
export function letGo(g, w, key) {
    const st = hs(g);
    const c = st.captives[key];
    if (!c)
        return '';
    delete st.captives[key];
    applyNow(g, w, c.name, 'freed');
    victimReports(g, w, c.name, key, 'kidnapping', 0.6);
    note(g, '{u} let {0} go.', [c.name], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    saveGame();
    return c.name;
}
/** A victim who got away (or was let go) goes to the law, with some chance. */
function victimReports(g, w, name, key, crime, p) {
    const law = lawOf(g, w);
    if (!law.exists || rnd() >= p)
        return;
    const now = nowAbs(g);
    hs(g).incidents.push({ id: `i${now}_v${hs(g).incidents.length}`, at: now, place: g.player.loc, by: 'you', act: 'report', crime, target: name, targetKey: key, seen: [name], crowd: false, lawSaw: false, reported: true, eta: now + 60 + Math.round(rnd() * 120), state: 'open' });
}
export const openCrimes = (g) => hs(g).incidents.filter(i => i.by === 'you' && i.state !== 'closed');
/** The ones the law knows about (reported, seen by an officer, or looking for you): what giving up is about. */
export const knownCrimes = (g) => openCrimes(g).filter(i => i.reported || i.lawSaw || i.state === 'wanted');
/** The law is right here, holding you (someone who is the law is in the scene and you are held). */
export function lawHolding(g, w) {
    if (!hxOn() || !lawOf(g, w).exists)
        return '';
    const s = currentState(g);
    if (s.mobility !== 'held' && s.mobility !== 'restrained')
        return '';
    const cop = peopleHere(g, w).find(x => x.law && !x.down && !x.captive);
    return cop && (knownCrimes(g).length || /arrest|police|officer|guard|cuff/i.test(s.reason)) ? display(cop) : '';
}
export function surrender(g, w) {
    const list = knownCrimes(g);
    const crime = worst(list.map(i => i.crime));
    const law = lawOf(g, w);
    for (const i of list)
        i.state = 'closed';
    const fine = payOf(g, [0, 40, 120, 250, 0, 0, 0, 0, 0][SEVERITY[crime]] ?? 0);
    const ending = SEVERITY[crime] >= SEVERITY.kidnapping;
    const jail = !ending && SEVERITY[crime] >= SEVERITY.theft;
    if (fine)
        g.player.money = Math.max(0, g.player.money - fine);
    note(g, ending ? '{u} was arrested for {0}.' : jail ? '{u} was arrested for {0} and spent the night in a cell.' : '{u} gave up to {1} and got off with a fine.', [CRIME_WORD[crime] || 'it', law.name], [], g.player.loc, 'life');
    saveGame();
    const word = CRIME_WORD[crime] || 'what happened';
    return {
        crime, fine, jail, ending, line: '*gives up and lets them make the arrest*',
        act: ending ? { outcome: 'captured', outcomeReason: `arrested for ${word}`, mobility: 'restrained', reason: `arrested for ${word}` } : jail ? { mobility: 'restrained', reason: `arrested for ${word}` } : { free: true, reason: 'let off with a fine' },
        directive: ending
            ? `[{{user}} gives up to ${law.name} and is arrested for ${word}. This is the end of {{user}}'s story: they are taken away and will not be free again. In the state block: mobility: restrained; outcome: captured.]`
            : jail ? `[{{user}} gives up to ${law.name} and is arrested for ${word}: handcuffed and taken to a cell for the night. In the state block: mobility: restrained.]`
                : `[{{user}} gives up. ${law.name} let {{user}} off with a warning and a fine. In the state block: mobility: free.]`,
    };
}
/* ---------- time: people come to, captives slip away, the law arrives ---------- */
const here = (g) => g.player.loc;
function lawEvent(g, w, i, found) {
    const law = lawOf(g, w);
    const word = CRIME_WORD[i.crime] || 'trouble';
    const knows = i.seen.length > 0 || !!i.target;
    const cop = law.walkOn.replace(/^(a|an) /, '');
    const text = found
        ? `${law.walkOn.charAt(0).toUpperCase()}${law.walkOn.slice(1)} turns up and heads straight for you: it's about the ${word} at ${placeName(g, w, i.place)}.`
        : `${law.name.charAt(0).toUpperCase()}${law.name.slice(1)} ${law.name.startsWith('the') ? 'arrive' : 'arrives'}, answering a call about the ${word}.${knows ? ' Someone points at you.' : ' They look around and ask questions.'}`;
    return {
        text, present: [cop],
        mobility: found || knows ? 'held' : undefined,
        reason: found || knows ? `${cop} questioning {{user}} about the ${word}` : '',
        directive: `[${found ? `${law.name} found {{user}}` : `${law.name} just arrived`}: ${cop} is here about the ${word}${i.target ? ` (${i.target})` : ''} at ${placeName(g, w, i.place)}.${found || knows ? ` ${cop} keeps {{user}} here and questions them; {{user}} may talk their way out, try to get away, or give up.` : ' They have not picked anyone out yet.'} In the state block, list ${cop} under present${found || knows ? ' and mobility: held' : ''}.]`,
    };
}
function step(g, w) {
    if (!hxOn() && !Object.keys(hs(g).captives).length)
        return [];
    const st = hs(g);
    const now = nowAbs(g);
    const out = [];
    for (const d of Object.values(st.down))
        if (d.until <= now) {
            delete st.down[d.key];
            if (d.how === 'out' && d.loc === here(g) && statusOf(g, d.key) !== 'dead')
                st.queue.push({ text: `${d.name} comes to, groggy.`, present: [d.name], directive: `[${d.name} has just come to and can move again.]` });
        }
    const law = lawOf(g, w);
    for (const i of st.incidents) {
        if (i.state !== 'open' || !i.reported || i.eta === undefined || i.eta > now)
            continue;
        if (!law.exists) {
            i.state = 'closed';
            continue;
        }
        if (i.by !== 'you') {
            i.state = 'closed';
            continue;
        }
        if (i.place === here(g)) {
            st.queue.push(lawEvent(g, w, i, false));
            i.state = 'wanted';
            i.lawSaw = true;
        }
        else
            i.state = 'wanted';
    }
    for (const [key, j] of Object.entries(st.jail)) {
        if (j.at !== undefined && j.at <= now) {
            delete j.at;
            applyNow(g, w, j.name, 'captured');
            note(g, '{0} was arrested.', [j.name], [], g.player.loc, 'life');
            out.push(`${j.name} was arrested.`);
        }
        else if (j.at === undefined && j.until <= now) {
            delete st.jail[key];
            applyNow(g, w, j.name, 'freed');
            note(g, '{0} was let out of jail.', [j.name], [], g.player.loc, 'life');
        }
    }
    return out;
}
function hourly(g, w) {
    const st = hs(g);
    const out = [];
    for (const c of Object.values(st.captives)) {
        const p = c.how === 'restrained' ? (g.asleep ? 0.15 : 0.05) : (g.asleep ? 0.9 : 0.3);
        if (Math.random() >= p)
            continue;
        delete st.captives[c.key];
        applyNow(g, w, c.name, 'left');
        note(g, '{0} got away from {u}.', [c.name], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
        victimReports(g, w, c.name, c.key, 'kidnapping', 0.9);
        st.queue.push({ text: `${c.name} slips free and gets away.`, present: [], directive: `[${c.name} just got free and ran off: they are gone from the scene.]` });
        out.push(`${c.name} got away from you.`);
    }
    return out;
}
function daily(g) {
    const keep = { none: 0, minor: 2, theft: 4, assault: 6, kidnapping: 14, murder: 9999 };
    const now = nowAbs(g);
    for (const i of hs(g).incidents)
        if (i.state !== 'closed' && now - i.at > keep[i.crime] * 1440)
            i.state = 'closed';
    for (const k of Object.keys(hs(g).grudge))
        hs(g).grudge[k] = Math.max(0, hs(g).grudge[k] - 0.5);
    return [];
}
/** You arrived somewhere: your captives come along (and people may see them), the law may find you, a group may be waiting. */
export function onArrive(g, w) {
    if (!hxOn())
        return;
    const st = hs(g);
    const law = lawOf(g, w);
    const now = nowAbs(g);
    const crowd = crowdHere(g, w);
    const caps = captives(g);
    if (caps.length && crowd >= 2 && rnd() < crowdSees(crowd, 2)) {
        const c = caps[0];
        const reported = law.exists && rnd() < reportChance('kidnapping');
        st.incidents.push({ id: `i${now}_c`, at: now, place: g.player.loc, by: 'you', act: 'kidnap', crime: 'kidnapping', target: c.name, targetKey: c.key, seen: [], crowd: true, lawSaw: false, reported, eta: reported ? now + responseMinutes(rnd(), law.slow) : undefined, state: 'open' });
    }
    // wanted: the law may find you here (at home, much more likely: they know where you live)
    const wanted = st.incidents.filter(i => i.by === 'you' && i.state === 'wanted');
    if (law.exists && wanted.length && !st.queue.length) {
        const top = wanted.reduce((a, b) => (SEVERITY[b.crime] > SEVERITY[a.crime] ? b : a));
        const knownYou = top.seen.length > 0 || !!top.target;
        const p = (g.player.loc === playerHomeId ? (knownYou ? 0.5 : 0.2) : 0.1) * (SEVERITY[top.crime] >= SEVERITY.kidnapping ? 1.5 : 1);
        if (rnd() < p)
            st.queue.push(lawEvent(g, w, top, true));
    }
    // a group you wronged
    if (!st.queue.length) {
        const hereNow = peopleHere(g, w);
        for (const grp of Object.values(st.groups)) {
            const grudge = st.grudge[grp.id] ?? 0;
            if (grudge < 3)
                continue;
            const members = hereNow.filter(x => grp.members.includes(x.key) && !x.captive && !x.down);
            if (members.length) {
                st.grudge[grp.id] = Math.max(0, grudge - 3);
                st.queue.push({ text: `${members.map(display).join(' and ')} ${members.length > 1 ? 'see' : 'sees'} you, and ${members.length > 1 ? 'they remember' : 'remembers'} what you did.`, present: members.map(x => x.name), mobility: 'held', reason: `${grp.name} want payback`, directive: `[${members.map(x => x.name).join(', ')} (${grp.name}) know what {{user}} did to one of them, and confront {{user}} now: they block the way. In the state block: mobility: held.]` });
                break;
            }
            if (grudge >= 6 && rnd() < 0.15 + grudge * 0.02) {
                st.grudge[grp.id] = Math.max(0, grudge - 4);
                const who = `some of ${grp.name}`;
                st.queue.push({ text: `A few of ${grp.name} turn up. They've been looking for you.`, present: [who], mobility: 'held', reason: `${grp.name} came for {{user}}`, directive: `[${who} have tracked {{user}} down to get even. They surround {{user}}. In the state block: list them under present; mobility: held.]` });
                break;
            }
        }
    }
    saveGame();
}
/** What is waiting to happen is told now: a short line in the scene, and the state the engine decided. */
let flushing = false;
export async function flushEvents() {
    const g = game();
    if (!g || flushing || !hs(g).queue.length || !psOn())
        return;
    // not in the middle of someone's reply: once they are done
    if (state.generating) {
        setTimeout(() => { void flushEvents(); }, 1500);
        return;
    }
    flushing = true;
    try {
        const list = hs(g).queue.splice(0);
        saveGame();
        for (const ev of list) {
            await narratorLine(ev.text);
            const i = chat().length - 1;
            // a line that changes your situation (the police arrive) carries it; a plain one (someone left) is just said
            if (ev.present.length || ev.mobility || ev.captor)
                keepNarration(i, { present: ev.present.length ? [...new Set([...currentState(g).present, ...ev.present])] : undefined, ...(ev.mobility ? { mobility: ev.mobility, reason: ev.reason?.replace(/\{\{user\}\}/g, personaName()) } : {}), ...(ev.captor ? { captor: ev.captor } : {}) });
            pushDirective(ev.directive);
        }
    }
    catch (e) {
        console.warn('[Mundi] hostile events', e);
    }
    flushing = false;
}
/* ---------- one-shot orders for the next reply ---------- */
export const HX_KEY = 'mundi_hx';
let orders = [];
let armedAt = 0;
export function pushDirective(text) {
    if (!text)
        return;
    orders.push(text);
    armedAt = Date.now();
    ctx().setExtensionPrompt(HX_KEY, orders.join('\n'), 1, 0, false, 0);
}
export function clearDirectives() { if (!orders.length)
    return; orders = []; armedAt = 0; ctx().setExtensionPrompt(HX_KEY, '', 1, 0, false, 0); }
setInterval(() => { if (armedAt && Date.now() - armedAt > 180000)
    clearDirectives(); }, 30000);
/** The act waiting for {{user}}'s line (it is marked with what the engine decided, so the player state follows). */
let pendingAct = null;
export const armAct = (a) => { pendingAct = a; };
export function markSent(id) {
    if (!pendingAct)
        return;
    const m = chat()[id];
    if (!m?.is_user)
        return;
    m.extra = { ...(m.extra ?? {}), mundi_act: pendingAct };
    pendingAct = null;
    saveChat();
    refreshPState();
}
/* ---------- the end of a visit: crimes the story reported ---------- */
export function endVisitHostile(g, w) {
    if (!hxOn())
        return;
    const st = hs(g);
    const law = lawOf(g, w);
    const now = nowAbs(g);
    const seen = seenWalkOns(g, w);
    const lawWasHere = seen.some(n => isLawName(n, law.roles)) || presentAt(g, w, g.player.loc).some(r => isLawCast(g, law, r));
    const jailDays = { none: 0, minor: 1, theft: 2, assault: 3, kidnapping: 30, murder: 9999 };
    for (const { line } of visitLines(g)) {
        if (line.kind !== 'ai' || line.dismissed)
            continue;
        for (const c of line.rep?.crimes ?? []) {
            const k = keyFor(g, c.name);
            if (statusOf(g, k.key) === 'dead' || st.jail[k.key])
                continue;
            st.incidents.push({ id: `i${now}_n${st.incidents.length}`, at: now, place: g.player.loc, by: c.name, act: 'story', crime: c.crime, target: c.target, seen: [personaName()], crowd: false, lawSaw: lawWasHere, reported: false, state: 'closed' });
            note(g, '{0} committed {1} at {2}.', [c.name, CRIME_WORD[c.crime], placeName(g, w, g.player.loc)], k.avatar ? [k.avatar] : [], g.player.loc, 'life');
            if (!law.exists)
                continue;
            // a law officer was there: arrested on the spot (the story told it); otherwise maybe later
            const p = lawWasHere ? 1 : reportChance(c.crime) * 0.7;
            if (rnd() < p)
                st.jail[k.key] = { name: c.name, until: now + jailDays[c.crime] * 1440, ...(lawWasHere ? {} : { at: now + 120 + Math.round(rnd() * 600) }) };
            if (lawWasHere) {
                applyNow(g, w, c.name, 'captured');
                note(g, '{0} was arrested.', [c.name], [], g.player.loc, 'life');
            }
        }
    }
    // the story freed or let go of one of your captives
    for (const p of pendingChanges(g))
        if (st.captives[p.key] && (p.change === 'freed' || p.change === 'left' || p.change === 'missing'))
            delete st.captives[p.key];
    // the people down here stay here; the visit's walk-on police leave with the visit
    st.incidents = st.incidents.slice(-60);
}
/* ---------- being taken somewhere: a prisoner moved, or an invitation to come along ---------- */
/** Where someone lives (the same rule as their routine: with you, with someone else, or their own home). */
export function homeOf(r) {
    const hw = r.homeWith;
    return hw === '__you' ? playerHomeId : hw ? `home:${hw}` : `home:${r.avatar}`;
}
const bare = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
/**
 * The place a reply names ("the docks", "her place", "Zack's apartment", "the Waterfront bar") as one of the map's.
 * `leaderKey`: who is taking you ("her place" is theirs). '' when the map has no such place.
 */
export function resolvePlace(g, w, text, leaderKey = '') {
    const t = bare(text);
    if (!t)
        return '';
    const me = bare(personaName()).split(' ')[0];
    const homeWord = /\b(place|home|house|flat|apartment|room|crib|pad|condo|cabin|cottage|loft|basement)\b/;
    const leader = leaderKey.startsWith('cast:') ? g.cast[leaderKey.slice(5)] : undefined;
    if (homeWord.test(t) || /^home$/.test(t)) {
        if (/\b(your|you're|youre|users?)\b/.test(t) || (me && new RegExp(`\\b${me}'?s?\\b`).test(t)))
            return playerHomeId;
        for (const r of Object.values(g.cast)) {
            const first = bare(r.name).split(' ')[0];
            if (first && new RegExp(`\\b${first}'?s?\\b`).test(t))
                return homeOf(r);
        }
        if (leader && (/\b(her|his|their|own)\b/.test(t) || /^home$/.test(t)))
            return homeOf(leader);
    }
    // a place on the map, by its name (either way round: "the docks" / "Port & Fish Market docks")
    let best = '', score = 0;
    for (const p of w.places) {
        if (p.link)
            continue;
        const n = bare(p.name), id = bare(p.id);
        const sc = n === t || id === t ? 100 : n.includes(t) || t.includes(n) ? 50 + Math.min(n.length, t.length) : t.split(' ').filter(x => x.length > 3 && (n.split(' ').includes(x) || id === x)).length * 10;
        if (sc > score) {
            score = sc;
            best = p.id;
        }
    }
    return score >= 10 ? best : '';
}
/**
 * The newest reply says someone is taking {{user}} somewhere ("going:"). Forced when {{user}} is their prisoner (or
 * held or restrained by them); otherwise it is an invitation the player answers. Each reply is asked only once.
 */
export function newLead(g, w) {
    if (!hxOn())
        return null;
    const lines = visitLines(g);
    const last = [...lines].reverse().find(x => x.line.kind === 'ai');
    const go = last && !last.line.dismissed ? last.line.rep?.going : null;
    if (!go)
        return null;
    const m = chat()[last.i];
    const sig = `${last.i}:${String(m?.mes ?? '').length}`;
    const st = hs(g);
    if (st.leadSeen === sig)
        return null;
    st.leadSeen = sig;
    const s = currentState(g);
    if (s.outcome !== 'none')
        return null;
    const k = keyFor(g, go.name);
    const to = resolvePlace(g, w, go.place, k.key);
    const captor = st.captor?.key === k.key || (s.captor && keyFor(g, s.captor).key === k.key);
    const forced = !!captor || ((s.mobility === 'held' || s.mobility === 'restrained' || s.mobility === 'incapacitated') && (!s.reason || s.reason.toLowerCase().includes(bare(go.name).split(' ')[0])));
    const lead = { name: k.kind === 'cast' ? k.name : go.name, key: k.key, avatar: k.avatar, kind: k.kind, to, text: go.place, forced, line: sig };
    saveGame();
    return lead;
}
/**
 * A hard capture, the first move: the story says someone has taken {{user}} prisoner ("captor:", and {{user}}
 * restrained or unable to move) without saying where to. A cast member takes you to their home; a group with a base,
 * to the base. Someone the story brought in, with no home on the map, keeps you where you are (and follows you).
 */
export function hardCapture(g, w) {
    if (!hxOn())
        return null;
    const s = currentState(g);
    if (!s.captor || (s.mobility !== 'restrained' && s.mobility !== 'incapacitated') || s.outcome !== 'none')
        return null;
    const st = hs(g);
    const k = keyFor(g, s.captor);
    if (st.captor?.key === k.key)
        return null; // already their prisoner: they move you with "going:"
    const grp = Object.values(st.groups).find(x => x.name.toLowerCase() === s.captor.toLowerCase() || x.members.includes(k.key));
    let to = grp?.base && placeOf(g, w, grp.base) ? grp.base : '';
    if (!to && k.kind === 'cast' && k.avatar && g.cast[k.avatar])
        to = homeOf(g.cast[k.avatar]);
    return { name: k.kind === 'cast' ? k.name : s.captor, key: k.key, avatar: k.avatar, kind: k.kind, to: to === g.player.loc ? '' : to, text: '', forced: true, line: '' };
}
/** You are their prisoner from now on: they go wherever you go (and you go wherever they take you). */
export function takePrisoner(g, c) {
    const st = hs(g);
    const again = st.captor?.key === c.key;
    st.captor = { key: c.key, avatar: c.avatar, name: c.name, kind: c.kind, since: again ? st.captor.since : nowAbs(g), moving: true, moves: again ? st.captor.moves ?? 0 : 0 };
    if (c.avatar && g.cast[c.avatar])
        g.cast[c.avatar].met = true; // you know who did it
    // taken: the people who came along with you do not come along now (your captor does)
    const soc = g.social;
    if (soc?.with)
        soc.with = soc.with.filter((x) => x.avatar === c.avatar);
    st.followers = [];
    saveGame();
}
/** Called once you are there (or right away, when they keep you where you are): the scene goes on, you still held. */
export function arrivedCaptive(g, w, c, how, moved) {
    const st = hs(g);
    if (st.captor)
        st.captor.moving = false;
    const place = placeName(g, w, g.player.loc);
    const there = g.player.loc === playerHomeId ? 'your own home' : c.avatar && g.player.loc === homeOf(g.cast[c.avatar]) ? 'their place' : place;
    const first = !st.captor?.moves;
    if (st.captor && moved)
        st.captor.moves = (st.captor.moves ?? 0) + 1;
    if (!first && moved)
        note(g, '{0} took {u} to {1}, still a prisoner.', [c.name, place], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    else if (moved)
        note(g, '{0} took {u} prisoner and brought {u} to {1}.', [c.name, place], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    else
        note(g, '{0} took {u} prisoner.', [c.name], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    st.queue.push({
        text: moved ? `${c.name} brings you to ${there}. You're still ${how === 'incapacitated' ? 'out of it' : 'tied up'}.` : `You're ${c.name}'s prisoner now.`,
        present: [c.name], mobility: how, reason: `held prisoner by ${c.name}${moved ? ` at ${place}` : ''}`, captor: c.name,
        directive: `[${c.name} has taken {{user}} prisoner${moved ? ` and brought them to ${place}` : ''}. {{user}} is ${how === 'incapacitated' ? 'barely conscious' : 'restrained'} and cannot leave; ${c.name} stays with {{user}}. Go on with the scene here. In the state block: mobility: ${how}; captor: ${c.name}.]`,
    });
    saveGame();
}
/** Free again: the captor goes back to their life (not while they are moving you). */
export function releaseCaptor(g) {
    const st = hs(g);
    if (!st.captor || st.captor.moving)
        return;
    const s = currentState(g);
    if (s.mobility === 'free' || s.mobility === 'engaged')
        st.captor = null;
}
/** Going along with someone (they asked you to come): they come with you for a while. */
export function followLeader(g, l, hours = 3) {
    const st = hs(g);
    const until = nowAbs(g) + hours * 60;
    if (l.kind === 'cast' && l.avatar) {
        const soc = g.social ??= {};
        soc.with ??= [];
        soc.with = soc.with.filter((c) => c.avatar !== l.avatar);
        soc.with.push({ avatar: l.avatar, until });
        if (g.cast[l.avatar])
            g.cast[l.avatar].met = true;
    }
    else {
        st.followers = st.followers.filter(f => f.key !== l.key);
        st.followers.push({ key: l.key, name: l.name, until });
    }
    saveGame();
}
export const followers = (g) => hs(g).followers.filter(f => f.until > nowAbs(g));
/* ---------- for the prompt ---------- */
export function hostileLines(g, w) {
    if (!hxOn())
        return [];
    const st = hs(g);
    const law = lawOf(g, w);
    const now = nowAbs(g);
    const caps = captives(g);
    const down = Object.values(st.down).filter(d => d.until > now && d.loc === g.player.loc);
    const wanted = openCrimes(g).filter(i => i.state === 'wanted' || i.lawSaw);
    const hereNow = peopleHere(g, w);
    const grudges = Object.values(st.groups).filter(x => (st.grudge[x.id] ?? 0) >= 3 && hereNow.some(p => x.members.includes(p.key)));
    const lawNames = hereNow.filter(x => x.law).map(display);
    return [
        law.exists ? `The law here: ${law.name}. A crime people see can be reported, and ${law.name} come${law.name.startsWith('the') ? '' : 's'} for whoever did it.${lawNames.length ? ` Here right now: ${lawNames.join(', ')}.` : ''}` : 'There is no law here: no police, nobody comes to stop or arrest anyone. People deal with trouble themselves.',
        caps.length ? `With {{user}}, held against their will: ${caps.map(c => `${c.name} (${c.how === 'restrained' ? 'tied up' : 'in {{user}}\'s grip'})`).join(', ')}. They stay with {{user}} until the game says they get away.` : '',
        down.length ? `On the ground here: ${down.map(d => `${d.name} (${d.how === 'out' ? 'unconscious' : 'knocked down'})`).join(', ')}.` : '',
        wanted.length ? `{{user}} is wanted by ${law.name} for ${[...new Set(wanted.map(i => CRIME_WORD[i.crime]))].join(', ')}.` : '',
        grudges.length ? `${grudges.map(x => x.name).join(', ')} want payback from {{user}}.` : '',
        st.captor ? `{{user}} is ${st.captor.name}'s prisoner: ${st.captor.name} stays with {{user}} and takes them wherever they go ("going:" in the block).` : '',
        followers(g).length ? `Came along with {{user}}: ${followers(g).map(f => f.name).join(', ')}.` : '',
    ].filter(Boolean);
}
/* ---------- hooked in at start ---------- */
let wired = false;
export function initHostile() {
    if (wired)
        return;
    wired = true;
    psHooks.crimes = () => hxOn();
    psHooks.directives.push(() => orders.join('\n'));
    // the people the engine knows are with you: walk-ons you hold, a walk-on holding you, the ones who came along
    psHooks.present = () => {
        const g = game();
        if (!g || !hxOn())
            return [];
        const st = hs(g);
        return [...captives(g).filter(c => c.kind === 'walkon').map(c => c.name), ...(st.captor?.kind === 'walkon' ? [st.captor.name] : []), ...followers(g).map(f => f.name)];
    };
    rosterHooks.isCaptive = (key) => { const g = game(); return !!g && !!hs(g).captives[key]; };
    peopleHooks.at = (g, avatar) => {
        const st = g.hostile;
        if (!st)
            return '';
        const key = `cast:${avatar}`;
        if (st.captives?.[key])
            return g.player.loc;
        if (st.captor?.avatar === avatar)
            return g.player.loc; // your captor never leaves your side
        const d = st.down?.[key];
        if (d && d.until > nowAbs(g))
            return d.loc;
        return '';
    };
    onStep.push((g, w) => step(g, w));
    onHour.push((g, w) => hourly(g, w));
    onDay.push((g) => daily(g));
}
export const hostileWorld = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
