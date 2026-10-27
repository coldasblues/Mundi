// Things that come to you (Life-Sim social, phase 4): neighbors knocking at your door, friends asking your advice,
// and the big moments in the lives of the people you know (a promotion, an engagement, a birthday…).
// Every one of them is one of the world's people (a card): no extras are made up. One at a time, as a card on screen
// with a choice; what you choose is the engine's to apply (bonds, approval, their lives).
import { nowAbs } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { breakOf } from './daylife.js';
import { onHour, onDay } from './hooks.js';
import { social, bondOf, bump, textFrom } from './social.js';
import { quiet, personaName } from '../st/bridge.js';
import { note } from './facts.js';
import { playerHomeId } from './places.js';
import { homeSpot, takenHomes, homeKey, normalizeHomes } from './homes.js';
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const rnd = (g, salt) => H(`${g.world}|${g.day}|${g.minutes}|${salt}`);
const dayRnd = (g, salt) => H(`${g.world}|${g.day}|${salt}`);
/* ---------- how many cards a world needs ---------- */
// How many people (cards) make each mode work: `min` it works, `good` it feels pleasant, `lively` it feels alive.
export const CAST_LEVELS = { lifesim: { min: 4, good: 8, lively: 15 }, rpg: { min: 6, good: 12, lively: 20 } };
export const NEIGHBORS_MIN = 2; // people (cards) living in your area for neighbors to come by
export const FRIEND_BOND = 40; // close enough to ask you for advice
export const KNOWN_BOND = 25; // close enough that their big moments reach you
export function castLevel(n, mode = 'lifesim') {
    const l = CAST_LEVELS[mode === 'rpg' ? 'rpg' : 'lifesim'];
    const level = n >= l.lively ? 'lively' : n >= l.good ? 'pleasant' : n >= l.min ? 'works' : 'too few';
    return { n, level, ...l, tip: level === 'lively' ? 'The world feels alive.' : level === 'pleasant' ? `Pleasant. ${l.lively}+ people make it feel alive.` : level === 'works' ? `It works, but quiet. ${l.good}+ people make it pleasant, ${l.lively}+ alive.` : `Too few people: ${l.min} at least (${l.good}+ for a pleasant world).` };
}
const queue = (g) => (social(g).happen ??= []);
export const currentHappening = (g) => queue(g)[0] ?? null;
function push(g, h) {
    const q = queue(g);
    if (q.length >= 3 || q.some(x => x.avatar === h.avatar && x.kind === h.kind))
        return;
    q.push({ ...h, id: `h${nowAbs(g)}_${q.length}_${h.avatar.slice(0, 6)}`, at: nowAbs(g) });
}
const say = (g, avatar, text, me) => {
    const s = social(g);
    (s.threads[avatar] ??= []).push({ me, text, at: nowAbs(g) });
    if (!me)
        s.unread[avatar] = (s.unread[avatar] ?? 0) + 1;
};
const L = (g) => { const l = (g.living ??= {}); l.consults ??= []; l.hap ??= {}; return l; };
const isKid = (g, a) => (g.family?.kids ?? []).some((k) => k.avatar === a);
const livesWithYou = (r) => r.homeWith === '__you';
/* ---------- neighbors ---------- */
// Your neighbors: the world's people who live in your area (not with you, not your children).
export const neighbors = (g) => Object.values(g.cast).filter(r => r.home.zone === g.player.home.zone && !livesWithYou(r) && !isKid(g, r.avatar));
export const neighborsActive = (g, w) => systemOn(w, 'neighbors') && neighbors(g).length >= NEIGHBORS_MIN;
const homeKeyOf = (g) => `${g.player.home.zone}:${g.player.home.x},${g.player.home.y}`;
function neighborHour(g, w) {
    const l = L(g);
    const key = homeKeyOf(g);
    const moved = l.homeKey !== undefined && l.homeKey !== key;
    if (l.homeKey === undefined)
        l.homeKey = key; // an older save: where you live now is not a move
    if (!neighborsActive(g, w) || g.player.loc !== playerHomeId || g.asleep) {
        if (moved)
            l.homeKey = key;
        return;
    }
    const h = Math.floor(g.minutes / 60);
    if (h < 8 || h > 21)
        return;
    const list = neighbors(g);
    const pick = (salt) => list[Math.floor(rnd(g, salt) * list.length)];
    if (moved) { // just moved in: someone comes to say welcome
        l.homeKey = key;
        const r = pick('welcome');
        r.met = true;
        push(g, { kind: 'welcome', avatar: r.avatar, text: `${r.name}, who lives nearby, knocks with a little welcome gift.`, choices: [['in', 'Invite them in'], ['door', 'Thank them at the door']] });
        return;
    }
    if (l.hap.neighbor === g.day || rnd(g, 'knock') > 0.06)
        return; // now and then, at most once a day
    l.hap.neighbor = g.day;
    const r = pick('who');
    const partied = (g.facts ?? []).some((f) => f.kind === 'party' && f.place === playerHomeId && nowAbs(g) - f.at < 1440);
    const roll = rnd(g, 'what');
    if (partied && roll < 0.6)
        push(g, { kind: 'noise', avatar: r.avatar, text: `${r.met ? r.name : 'A neighbor'} knocks: last night's party kept them up.`, choices: [['sorry', 'Apologize'], ['shrug', 'Brush it off']] });
    else if (roll < 0.4)
        push(g, { kind: 'borrow', avatar: r.avatar, text: `${r.met ? r.name : 'A neighbor'} knocks: could they borrow ${pickThing(w, rnd(g, 'thing'))}?`, choices: [['lend', 'Lend it'], ['no', 'Sorry, not this time']] });
    else
        push(g, { kind: 'chat', avatar: r.avatar, text: `${r.met ? r.name : 'A neighbor'} stops by your door to chat.`, choices: [['in', 'Let them in'], ['no', 'Not now']] });
}
const pickThing = (w, v) => { const list = w.style === 'medieval' || (w.kind ?? '').toLowerCase().includes('medieval') ? ['a cup of flour', 'a hammer', 'some candles', 'a ladder', 'a pot'] : ['some sugar', 'a drill', 'a ladder', 'a phone charger', 'a pan']; return list[Math.floor(v * list.length)]; };
const others = (g, r) => Object.values(g.cast).filter(x => x.avatar !== r.avatar && !isKid(g, x.avatar));
const DILEMMAS = [
    { id: 'job', yes: 'Take it', no: 'Stay where you are',
        setup: (g, w, r) => { const list = w.occupations.filter(o => o.id !== r.occupation); return systemOn(w, 'jobs') && list.length ? list[Math.floor(dayRnd(g, `job|${r.avatar}`) * list.length)].id : null; },
        ask: (_g, w, _r, x) => `I got an offer to work as ${w.occupations.find(o => o.id === x)?.name.toLowerCase() ?? 'something new'}. Should I take it?`,
        apply: (g, w, r, x) => { const o = w.occupations.find(j => j.id === x); if (o) {
            r.occupation = o.id;
            delete (g.living?.ranks ?? {})[r.avatar];
            note(g, '{0} started a new job: {1}.', [r.name, o.name], [r.avatar], o.place, 'life');
        } } },
    { id: 'crush', yes: 'Go for it', no: 'Wait a little',
        setup: (g, w, r) => { if (!systemOn(w, 'romance'))
            return null; const taken = new Set((g.living?.pairs ?? []).flat()); if (taken.has(r.avatar))
            return null; const list = others(g, r).filter(x => !taken.has(x.avatar) && !(social(g).partner ?? []).includes(x.avatar)); return list.length ? list[Math.floor(dayRnd(g, `crush|${r.avatar}`) * list.length)].avatar : null; },
        ask: (g, _w, _r, x) => `I really like ${g.cast[x]?.name ?? 'someone'}. Should I ask them out?`,
        apply: (g, _w, r, x) => { if (!g.cast[x])
            return; if (dayRnd(g, `crushyes|${r.avatar}`) < 0.6) {
            const l = L(g);
            (l.pairs ??= []).push([r.avatar, x]);
            note(g, '{0} and {1} started dating.', [r.name, g.cast[x].name], [r.avatar, x], g.player.loc, 'life');
        } } },
    { id: 'move', yes: 'Move', no: 'Stay',
        setup: (g, w, r) => { const z = w.homes.zones.filter(z => z.id !== r.home.zone && z.spots.length); return z.length && !livesWithYou(r) ? z[Math.floor(dayRnd(g, `move|${r.avatar}`) * z.length)].id : null; },
        ask: (_g, w, _r, x) => `I'm thinking of moving to ${w.homes.zones.find(z => z.id === x)?.name ?? 'another part of town'}. What do you think?`,
        apply: (g, w, r, x) => { const z = w.homes.zones.find(z => z.id === x); if (!z)
            return; const spot = homeSpot(w, z.id, takenHomes(g), g.player.home); const key = homeKey(r.home); for (const m of Object.values(g.cast))
            if (homeKey(m.home) === key)
                m.home = { ...spot }; normalizeHomes(g); note(g, '{0} moved to {1}.', [r.name, z.name], [r.avatar], `home:${r.avatar}`, 'life'); } },
    { id: 'feud', yes: 'Apologize', no: 'Stand your ground',
        setup: (g, _w, r) => { const list = others(g, r).filter(x => x.met || x.leisure.some(p => r.leisure.includes(p))); return list.length ? list[Math.floor(dayRnd(g, `feud|${r.avatar}`) * list.length)].avatar : null; },
        ask: (g, _w, _r, x) => `I had a fight with ${g.cast[x]?.name ?? 'someone'}. Should I apologize?` },
    { id: 'quit', yes: 'Follow your dream', no: 'Keep your job',
        setup: (_g, w, r) => (systemOn(w, 'jobs') && r.occupation ? 'dream' : null),
        ask: () => 'I\'m thinking of quitting my job to do something I really love. Is that crazy?',
        apply: (g, w, r) => { const o = w.occupations.find(j => j.id === r.occupation); r.occupation = null; note(g, '{0} quit the job to follow a dream.', [r.name], [r.avatar], o?.place ?? `home:${r.avatar}`, 'life'); } },
    { id: 'study', yes: 'Do it', no: 'Not now', setup: () => 'study', ask: () => 'Should I go back to studying? I\'d have less time, but…' },
];
// The advice you gave decides it. Following it (yes) changes their life; either way, you hear how it went.
function adviceDay(g, w) {
    const out = [];
    const l = L(g);
    // how earlier advice turned out
    for (const c of l.consults.filter(c => c.due <= g.day)) {
        const r = g.cast[c.avatar];
        if (!r)
            continue;
        if (c.alone) {
            note(g, c.good ? '{0}\'s decision turned out well.' : '{0}\'s decision did not turn out well.', [r.name], [r.avatar], `home:${r.avatar}`, 'life');
            if (r.met)
                out.push(c.good ? `${r.name}'s decision turned out well.` : `Things did not go well for ${r.name}.`);
            continue;
        }
        if (c.good) {
            bump(g, r.avatar, 4);
            approveBy(g, r.avatar, 6);
            note(g, '{0} is glad they listened to {u}\'s advice.', [r.name], [r.avatar], `home:${r.avatar}`, 'life');
            say(g, r.avatar, 'You were right, thank you. Things turned out well.', false);
            out.push(`${r.name} is glad they listened to you.`);
        }
        else {
            bump(g, r.avatar, -2);
            approveBy(g, r.avatar, -4);
            note(g, '{0} regrets following {u}\'s advice.', [r.name], [r.avatar], `home:${r.avatar}`, 'life');
            say(g, r.avatar, 'Honestly… it did not go the way we hoped.', false);
            out.push(`${r.name} regrets following your advice.`);
        }
    }
    l.consults = l.consults.filter(c => c.due > g.day);
    // a question left unanswered for two days: they decide on their own
    const a = l.asking;
    if (a && g.day - a.day >= 2) {
        const r = g.cast[a.avatar];
        l.asking = undefined;
        if (r)
            out.push(...decide(g, w, r, a, 'maybe'));
    }
    if (!systemOn(w, 'consults') || l.asking)
        return out;
    // a friend comes to you, about every few days (their message is written by the AI when it goes out)
    const friends = Object.values(g.cast).filter(r => r.met && bondOf(g, r.avatar) >= FRIEND_BOND && !isKid(g, r.avatar) && !l.consults.some(c => c.avatar === r.avatar));
    if (!friends.length || dayRnd(g, 'consult') > 0.25)
        return out;
    const r = friends[Math.floor(dayRnd(g, 'consultwho') * friends.length)];
    const order = [...DILEMMAS].sort((a, b) => dayRnd(g, `d|${a.id}`) - dayRnd(g, `d|${b.id}`));
    for (const d of order) {
        const x = d.setup ? d.setup(g, w, r) : true;
        if (x === null || x === undefined)
            continue;
        l.asking = { avatar: r.avatar, d: d.id, x, ask: d.ask(g, w, r, x), day: g.day, sent: false };
        break;
    }
    return out;
}
export const askingFrom = (g, avatar) => { const a = L(g).asking; return a && a.sent && a.avatar === avatar ? a : null; };
// Sends the waiting question as a message written by the AI in their voice. Never while they are in the scene with
// you (they would just say it): it waits until you are apart.
export async function deliverAsk(g, w, inScene) {
    const a = L(g).asking;
    const r = a && g.cast[a.avatar];
    if (!a || !r || a.sent || inScene(a.avatar))
        return '';
    a.sent = true;
    const me = personaName();
    await textFrom(g, w, a.avatar, `${r.name} wants ${me}'s advice about something in their own life: ${a.ask} ${r.name} writes to ask, in their own words and voice, with a little context, and ends with the question.`, a.ask);
    const s = social(g);
    s.unread[a.avatar] = (s.unread[a.avatar] ?? 0) + 1;
    return r.name;
}
// Your written answer: the AI only judges what it means (yes, no or maybe); the engine decides what happens, and
// their reply says what they decided.
export async function answerAdvice(g, w, avatar, text) {
    const a = askingFrom(g, avatar);
    const r = g.cast[avatar];
    const d = a && DILEMMAS.find(x => x.id === a.d);
    if (!a || !r || !d)
        return '';
    const me = personaName();
    let verdict = 'maybe';
    try {
        const out = (await quiet(`${r.name} asked ${me} for advice: "${a.ask}"\n${me} answered: "${text}"\n\nWhat does ${me}'s answer mean? YES = do it (${d.yes.toLowerCase()}). NO = do not (${d.no.toLowerCase()}). MAYBE = unclear, avoids the question, or leaves it to ${r.name}.\nAnswer with one word: YES, NO or MAYBE.`, 8)).toLowerCase();
        verdict = /\byes\b/.test(out) ? 'yes' : /\bno\b/.test(out) ? 'no' : 'maybe';
    }
    catch { /* the AI is offline: they decide on their own */ }
    L(g).asking = undefined;
    const before = social(g).threads[avatar]?.length ?? 0;
    const news = decide(g, w, r, a, verdict, true);
    const took = verdict === 'maybe' ? (L(g).consults.at(-1)?.choice === 'yes') : verdict === 'yes';
    const plan = took ? d.yes.toLowerCase() : d.no.toLowerCase();
    const why = verdict === 'maybe' ? `${me}'s answer did not settle it, so ${r.name} decides on their own: ${plan}.` : `${r.name} follows ${me}'s advice: ${plan}.`;
    social(g).threads[avatar] = (social(g).threads[avatar] ?? []).slice(0, before);
    await textFrom(g, w, avatar, `${why} ${r.name} answers ${me}'s message, says what they decided and how they feel about it.`, verdict === 'maybe' ? `I think I'll ${plan}. Thanks for listening.` : `You're right. I'll ${plan}. Thank you!`, text);
    return news.join(' ');
}
// The decision: following the advice changes their life; in a few days, you hear how it went (with no credit or
// blame when they decided on their own).
function decide(g, w, r, a, verdict, answered = false) {
    const d = DILEMMAS.find(x => x.id === a.d);
    if (!d)
        return [];
    const alone = verdict === 'maybe';
    const yes = alone ? dayRnd(g, `alone|${r.avatar}|${d.id}`) < 0.5 : verdict === 'yes';
    if (yes && d.apply)
        d.apply(g, w, r, a.x);
    if (d.id === 'feud' && g.cast[a.x]) {
        const t = ((g.living ??= {}).ties ??= []);
        const k = t.findIndex(x => (x.a === r.avatar && x.b === a.x) || (x.b === r.avatar && x.a === a.x));
        if (k >= 0)
            t[k].tone = yes ? 'good' : 'tense';
    }
    if (!alone)
        bump(g, r.avatar, 3);
    L(g).consults.push({ avatar: r.avatar, kind: d.id, choice: yes ? 'yes' : 'no', due: g.day + 3, good: dayRnd(g, `out|${r.avatar}|${d.id}`) < 0.6, text: a.ask, ...(alone ? { alone: true } : {}) });
    note(g, alone ? '{0} decided on their own: {1}.' : '{0} asked {u} for advice and followed it: {1}.', [r.name, (yes ? d.yes : d.no).toLowerCase()], [r.avatar], g.player.loc, 'meet');
    return answered ? [] : [`${r.name} decided on their own: ${(yes ? d.yes : d.no).toLowerCase()}.`];
}
const approveBy = (g, avatar, v) => { const l = (g.living ??= {}); l.approval ??= {}; l.approval[avatar] = Math.max(-100, Math.min(100, (l.approval[avatar] ?? 0) + v)); };
/* ---------- the big moments of their lives ---------- */
// A moment in someone's life (from the long-life engine): the people close to you tell you, and you can answer.
export function lifeMoment(g, w, avatar, text, tone) {
    const r = g.cast[avatar];
    if (!r || !r.met || !systemOn(w, 'consults') || bondOf(g, avatar) < KNOWN_BOND)
        return;
    push(g, { kind: 'life', avatar, text, choices: tone === 'good' ? [['msg', 'Congratulate them'], ['later', 'Later']] : [['msg', 'Comfort them'], ['later', 'Later']], data: { tone } });
}
// Everyone has a birthday (the same day each year of the world: a season-long year of 4 seasons).
export const birthdayOf = (g, avatar) => Math.floor(H(`${g.world}|bday|${avatar}`) * yearDays(g));
const yearDays = (g) => 4 * Math.max(1, Math.round(g.cfg?.seasonDays ?? 14));
export const isBirthday = (g, avatar, day = g.day) => ((day - 1) % yearDays(g)) === birthdayOf(g, avatar);
function momentsDay(g, w) {
    const out = [];
    if (!systemOn(w, 'consults'))
        return out;
    for (const r of Object.values(g.cast)) {
        if (!r.met || bondOf(g, r.avatar) < KNOWN_BOND)
            continue;
        if (breakOf(g, w, r, g.day)?.kind === 'sick')
            sickMoment(g, w, r);
        if (isBirthday(g, r.avatar)) {
            push(g, { kind: 'birthday', avatar: r.avatar, text: `Today is ${r.name}'s birthday.`, choices: [['msg', 'Send your wishes'], ['later', 'Not now']] });
            out.push(`It's ${r.name}'s birthday today.`);
        }
    }
    return out;
}
// Someone close who is home sick (an interruption of their routine).
export function sickMoment(g, w, r) {
    if (!r.met || !systemOn(w, 'consults') || bondOf(g, r.avatar) < FRIEND_BOND || L(g).hap[`sick|${r.avatar}`] === g.day)
        return;
    L(g).hap[`sick|${r.avatar}`] = g.day;
    push(g, { kind: 'sick', avatar: r.avatar, text: `${r.name} is home sick today.`, choices: [['msg', 'Send get-well wishes'], ['later', 'Not now']] });
}
/* ---------- your answer ---------- */
export function answer(g, w, id, choice) {
    const q = queue(g);
    const i = q.findIndex(x => x.id === id);
    if (i < 0)
        return '';
    const h = q[i];
    q.splice(i, 1);
    const r = g.cast[h.avatar];
    if (!r)
        return '';
    const withYou = (mins) => { social(g).with.push({ avatar: r.avatar, until: nowAbs(g) + mins }); r.met = true; };
    switch (h.kind) {
        case 'welcome':
            bump(g, r.avatar, choice === 'in' ? 6 : 3);
            note(g, '{0} welcomed {u} to the neighborhood with a gift.', [r.name], [r.avatar], playerHomeId, 'meet');
            if (choice === 'in')
                withYou(60);
            return choice === 'in' ? `${r.name} comes in for a while.` : `You thank ${r.name} for the gift.`;
        case 'borrow':
            if (choice === 'lend') {
                bump(g, r.avatar, 4);
                approveBy(g, r.avatar, 3);
                r.met = true;
                note(g, '{u} lent something to {0}, a neighbor.', [r.name], [r.avatar], playerHomeId, 'meet');
                return `${r.name} thanks you and promises to bring it back.`;
            }
            bump(g, r.avatar, -2);
            return `${r.name} understands, a little disappointed.`;
        case 'noise':
            if (choice === 'sorry') {
                approveBy(g, r.avatar, 2);
                r.met = true;
                return `${r.name} accepts your apology.`;
            }
            approveBy(g, r.avatar, -6);
            bump(g, r.avatar, -3);
            note(g, '{0} complained about the noise from {u}\'s party; {u} brushed it off.', [r.name], [r.avatar], playerHomeId, 'fight');
            return `${r.name} leaves, annoyed.`;
        case 'chat':
            if (choice === 'in') {
                withYou(60);
                bump(g, r.avatar, 2);
                return `${r.name} comes in to chat.`;
            }
            return '';
        case 'consult': {
            const d = DILEMMAS.find(x => x.id === h.data?.d);
            if (!d)
                return '';
            const yes = choice === 'yes';
            say(g, r.avatar, yes ? `${d.yes}. I think it's right for you.` : `${d.no}. I don't think it's the moment.`, true);
            if (yes && d.apply)
                d.apply(g, w, r, h.data.x);
            if (d.id === 'feud' && g.cast[h.data.x]) {
                const t = ((g.living ??= {}).ties ??= []);
                const other = h.data.x;
                const k = t.findIndex(x => (x.a === r.avatar && x.b === other) || (x.b === r.avatar && x.a === other));
                if (k >= 0)
                    t[k].tone = yes ? 'good' : 'tense';
            }
            bump(g, r.avatar, 3);
            L(g).consults.push({ avatar: r.avatar, kind: d.id, choice, due: g.day + 3, good: dayRnd(g, `out|${r.avatar}|${d.id}`) < 0.6, text: h.text });
            note(g, '{0} asked {u} for advice and {u} said: {1}.', [r.name, (yes ? d.yes : d.no).toLowerCase()], [r.avatar], g.player.loc, 'meet');
            return `You told ${r.name}: ${yes ? d.yes : d.no}.`;
        }
        case 'life':
        case 'birthday':
        case 'sick':
            if (choice !== 'msg') {
                if (h.kind === 'birthday' && bondOf(g, r.avatar) >= 60)
                    bump(g, r.avatar, -2);
                return '';
            }
            say(g, r.avatar, h.kind === 'birthday' ? 'Happy birthday! 🎉' : h.kind === 'sick' ? 'Get well soon!' : h.data?.tone === 'good' ? 'Congratulations! So happy for you!' : 'I\'m so sorry. I\'m here if you need me.', true);
            bump(g, r.avatar, 3);
            return `You wrote to ${r.name}.`;
    }
    return '';
}
export const dismissAll = (g) => { social(g).happen = []; };
onHour.push((g, w) => { neighborHour(g, w); return []; });
onDay.push((g, w) => [...adviceDay(g, w), ...momentsDay(g, w)]);
