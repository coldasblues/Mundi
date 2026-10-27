import { systemOn } from '../core/world.js';
import { onDay, onHour } from './hooks.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { addStatus } from './needs.js';
import { bondOf } from './social.js';
import { regionState, regionOf } from './worldstate.js';
import { addRep } from './standing.js';
import { isRpg, sheetOf } from './rpg.js';
import { startCombat } from './combat.js';
const on = (w) => systemOn(w, 'factions');
export const fstate = (g) => (g.factionState ??= { standing: {}, member: {}, power: {}, news: [] });
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const clamp = (v, a = -100, b = 100) => Math.max(a, Math.min(b, v));
export const OWN = '__own';
/* ---------- the factions of the world (and yours) ---------- */
export function factionsOf(g, w) {
    if (!on(w))
        return [];
    const list = [...(w.factions ?? [])];
    const own = fstate(g).own;
    if (own)
        list.push({ id: OWN, name: own.name, kind: own.kind, hq: own.hq, ranks: ['Member', 'Officer', 'Founder'], desc: 'The faction you founded.' });
    return list;
}
export const factionDef = (g, w, id) => factionsOf(g, w).find(f => f.id === id) ?? null;
export const standingOf = (g, id) => (id === OWN ? 100 : fstate(g).standing[id] ?? 0);
export const powerOf = (g, id) => fstate(g).power[id] ?? 50;
export const STANDING = [[60, 'ally'], [25, 'friendly'], [-25, 'neutral'], [-60, 'unfriendly'], [-101, 'hostile']];
export const standingWord = (v) => STANDING.find(([m]) => v >= m)?.[1] ?? 'neutral';
export function addStanding(g, w, id, delta) {
    if (!on(w) || id === OWN)
        return '';
    const st = fstate(g);
    const before = standingWord(st.standing[id] ?? 0);
    st.standing[id] = clamp((st.standing[id] ?? 0) + delta);
    // helping one side hurts with its rivals, a little
    const f = factionDef(g, w, id);
    if (delta > 0)
        for (const r of f?.rivals ?? [])
            st.standing[r] = clamp((st.standing[r] ?? 0) - Math.ceil(delta / 3));
    const after = standingWord(st.standing[id]);
    return after !== before ? `${f?.name ?? id} now sees you as ${after === 'ally' ? 'an ally' : after}.` : '';
}
export const memberOf = (g, id) => fstate(g).member[id] ?? null;
export const isLeader = (g, w, id) => { const m = memberOf(g, id); const f = factionDef(g, w, id); return !!m && !!f && m.rank >= f.ranks.length - 1; };
export const rankName = (g, w, id) => { const m = memberOf(g, id); const f = factionDef(g, w, id); return m && f ? f.ranks[Math.min(m.rank, f.ranks.length - 1)] : ''; };
// Members among the world's people: those whose job belongs to a faction.
export const membersAmong = (g, w, avatar) => factionsOf(g, w).filter(f => (f.jobs ?? []).includes(g.cast[avatar]?.occupation ?? '') || (f.id === OWN && fstate(g).own?.members.includes(avatar)));
/* ---------- joining, duty, dues, ranks ---------- */
export function canJoin(g, w, id) {
    const f = factionDef(g, w, id);
    if (!f || id === OWN)
        return '';
    if (memberOf(g, id))
        return 'You are already a member.';
    if (f.hq && g.player.loc !== f.hq)
        return `You join at ${w.places.find(p => p.id === f.hq)?.name ?? 'its headquarters'}.`;
    if (standingOf(g, id) < (f.joinRep ?? 0))
        return 'They do not trust you enough yet.';
    if ((f.rivals ?? []).some(r => memberOf(g, r)))
        return 'You belong to their rivals.';
    return '';
}
export function join(g, w, id) {
    const why = canJoin(g, w, id);
    if (why)
        return why;
    const f = factionDef(g, w, id);
    fstate(g).member[id] = { rank: 0, joined: g.day, duty: 0, week: weekOf(g), total: 0 };
    addStanding(g, w, id, 10);
    note(g, '{u} joined {0} as {1}.', [f.name, f.ranks[0] ?? 'a member'], [], g.player.loc, 'work');
    return `You are now ${f.ranks[0] ?? 'a member'} of ${f.name}.`;
}
export function leave(g, w, id) {
    const f = factionDef(g, w, id);
    if (!f || !memberOf(g, id))
        return '';
    delete fstate(g).member[id];
    addStanding(g, w, id, -15);
    note(g, '{u} left {0}.', [f.name], [], g.player.loc, 'work');
    return `You left ${f.name}.`;
}
const weekOf = (g) => Math.floor((g.day - 1) / 7);
export const DUTY_MINUTES = 120;
// A duty for your faction at its headquarters: pay, standing, power, a step toward the next rank.
export function doDuty(g, w, id) {
    const f = factionDef(g, w, id);
    const m = memberOf(g, id);
    if (!f || !m)
        return { text: '', minutes: 0 };
    if (f.hq && g.player.loc !== f.hq)
        return { text: `Your duties are at ${w.places.find(p => p.id === f.hq)?.name}.`, minutes: 0 };
    if (m.week !== weekOf(g)) {
        m.week = weekOf(g);
        m.duty = 0;
    }
    if (m.duty >= Math.max(1, f.quota ?? 2) + 2)
        return { text: 'You have done more than enough this week.', minutes: 0 };
    m.duty++;
    m.total++;
    const pay = 4 + m.rank * 3;
    g.player.money += pay;
    book(g, `${f.name}: duty`, pay);
    addStatus(g, w, 'energy', -15);
    addStanding(g, w, id, 3);
    fstate(g).power[id] = clamp(powerOf(g, id) + 1, 0, 100);
    const out = [`You do your duty for ${f.name} (+${pay}).`];
    // promotion: enough duties and standing for the next rank
    const need = (m.rank + 1) * 4;
    if (m.rank < f.ranks.length - 1 && m.total >= need && standingOf(g, id) >= 20 + m.rank * 15) {
        m.rank++;
        note(g, '{u} rose to {0} in {1}.', [f.ranks[m.rank], f.name], [], g.player.loc, 'work');
        out.push(`You rose to ${f.ranks[m.rank]}!${m.rank === f.ranks.length - 1 ? ` You lead ${f.name} now.` : ''}`);
        const r = addRep(g, w, 2, f.name);
        if (r)
            out.push(r);
    }
    return { text: out.join(' '), minutes: DUTY_MINUTES };
}
/* ---------- your own faction ---------- */
export const OWN_COST = 200;
export function found(g, w, name, kind) {
    const st = fstate(g);
    if (!on(w))
        return '';
    if (st.own)
        return 'You already lead a faction of your own.';
    const n = name.trim().slice(0, 40);
    if (!n)
        return 'Give it a name.';
    if (g.player.money < OWN_COST)
        return `Founding it costs ${OWN_COST}.`;
    g.player.money -= OWN_COST;
    book(g, `Founding ${n}`, -OWN_COST);
    st.own = { id: OWN, name: n, kind: kind || 'guild', level: 1, treasury: 0, members: [], founded: g.day };
    st.member[OWN] = { rank: 2, joined: g.day, duty: 0, week: weekOf(g), total: 0, led: true };
    note(g, '{u} founded {0}.', [n], [], g.player.loc, 'goal');
    return `${n} is founded. You are its leader.`;
}
export function recruit(g, w, avatar) {
    const own = fstate(g).own;
    const r = g.cast[avatar];
    if (!own || !r)
        return '';
    if (own.members.includes(avatar))
        return 'Already a member.';
    if (bondOf(g, avatar) < 50)
        return `${r.name} does not trust you enough to join.`;
    own.members.push(avatar);
    note(g, '{0} joined {1}, {u}\'s faction.', [r.name, own.name], [avatar], g.player.loc, 'meet');
    return `${r.name} joins ${own.name}.` + levelUp(g, w);
}
export function hireAssistant(g, w) {
    const own = fstate(g).own;
    if (!own || own.assistant)
        return '';
    if (g.player.money < 60)
        return 'An assistant costs 60.';
    g.player.money -= 60;
    book(g, `${own.name}: assistant`, -60);
    own.assistant = true;
    return 'You hired an assistant to keep the roster.' + levelUp(g, w);
}
export function setHq(g, w, place) {
    const own = fstate(g).own;
    if (!own)
        return '';
    const cost = 300;
    if (own.hq)
        return 'You already have a headquarters.';
    if (g.player.money + own.treasury < cost)
        return `A headquarters costs ${cost}.`;
    const fromT = Math.min(own.treasury, cost);
    own.treasury -= fromT;
    g.player.money -= cost - fromT;
    book(g, `${own.name}: headquarters`, -(cost - fromT));
    own.hq = place;
    note(g, '{u} set up {0}\'s headquarters at {1}.', [own.name, w.places.find(p => p.id === place)?.name ?? place], [], place, 'goal');
    return `${own.name} has a headquarters now.` + levelUp(g, w);
}
export function deposit(g, amount) {
    const own = fstate(g).own;
    if (!own)
        return '';
    const n = Math.max(0, Math.min(g.player.money, Math.round(amount)));
    g.player.money -= n;
    own.treasury += n;
    book(g, `To ${own.name}'s treasury`, -n);
    return n ? `${n} into the treasury.` : '';
}
// Levels: 2 needs a roster (an assistant or a member), 3 a headquarters, 4 three members and 500 in the treasury,
// 5 six members and 1500.
export const LEVEL_NEEDS = ['', 'A roster: hire an assistant or recruit a member.', 'A headquarters.', '3 members and 500 in the treasury.', '6 members and 1500 in the treasury.'];
function levelUp(g, w) {
    const own = fstate(g).own;
    if (!own)
        return '';
    const ok = [true, true, own.assistant || own.members.length > 0, !!own.hq, own.members.length >= 3 && own.treasury >= 500, own.members.length >= 6 && own.treasury >= 1500];
    let up = '';
    while (own.level < 5 && ok[own.level + 1]) {
        own.level++;
        up = ` ${own.name} reached level ${own.level}!`;
        note(g, '{0} reached level {1}.', [own.name, String(own.level)], [], g.player.loc, 'goal');
    }
    void w;
    return up;
}
export const checkLevel = (g, w) => levelUp(g, w);
const treasury = (g, f, n) => { const own = fstate(g).own; if (f === OWN && own) {
    own.treasury = Math.max(0, own.treasury + n);
    return true;
} return false; };
const spend = (g, w, f, n, why) => { if (!treasury(g, f, -n)) {
    const m = Math.min(g.player.money, n);
    g.player.money -= m;
    book(g, why, -m);
} };
const DILEMMAS = [
    { id: 'crops', text: (who, f) => `${who} comes before ${f}: their harvest failed and the family will go hungry. They ask for help.`, choices: [
            { id: 'give', label: 'Give 20 from the treasury', cost: '−20', apply: (g, w, f) => { spend(g, w, f, 20, 'Alms'); return addRep(g, w, 3, 'alms') || 'Word of your kindness spreads.'; } },
            { id: 'refuse', label: 'Refuse', apply: (g, w) => addRep(g, w, -2, 'refused') || 'They leave in silence.' }
        ] },
    { id: 'quarrel', text: (who, f) => `Two members of ${f} quarrel over a contract; ${who} speaks for one side.`, choices: [
            { id: 'side', label: `Side with them`, apply: (g, w, f) => { fstate(g).power[f] = clamp(powerOf(g, f) + 1, 0, 100); return 'One side is pleased; the other grumbles.'; } },
            { id: 'split', label: 'Split it fairly', apply: (g, w, f) => { fstate(g).power[f] = clamp(powerOf(g, f) + 2, 0, 100); return 'Both sides accept. The faction holds together.'; } }
        ] },
    { id: 'truce', text: (who, f) => `${who} brings an offer from a rival of ${f}: a truce, for a price of 30.`, choices: [
            { id: 'pay', label: 'Pay for peace', cost: '−30', apply: (g, w, f) => { spend(g, w, f, 30, 'Truce'); const reg = regionOf(g, w, g.player.loc); regionState(g, w, reg).tension = Math.max(0, regionState(g, w, reg).tension - 15); return 'The streets calm down.'; } },
            { id: 'refuse', label: 'Refuse: we fear no one', apply: (g, w, f) => { const reg = regionOf(g, w, g.player.loc); regionState(g, w, reg).tension = Math.min(100, regionState(g, w, reg).tension + 10); fstate(g).power[f] = clamp(powerOf(g, f) + (H(`${g.day}|t`) < 0.5 ? 3 : -3), 0, 100); return 'Tension rises in town.'; } }
        ] },
    { id: 'pay', text: (who, f) => `${who} speaks for the members of ${f}: they want a bigger share.`, choices: [
            { id: 'raise', label: 'Pay them 25', cost: '−25', apply: (g, w, f) => { spend(g, w, f, 25, 'Members\' share'); fstate(g).power[f] = clamp(powerOf(g, f) + 3, 0, 100); return 'Loyalty is bought, and it holds.'; } },
            { id: 'no', label: 'Refuse', apply: (g, w, f) => { fstate(g).power[f] = clamp(powerOf(g, f) - 3, 0, 100); return 'Some members drift away.'; } }
        ] },
    { id: 'thief', text: (who, f) => `${who} was caught stealing from ${f}'s hall and is brought before you.`, choices: [
            { id: 'pardon', label: 'Pardon them', apply: (g, w) => addRep(g, w, 1, 'mercy') || 'They swear to repay you one day.' },
            { id: 'punish', label: 'Punish them', apply: (g, w, f) => { fstate(g).power[f] = clamp(powerOf(g, f) + 2, 0, 100); return 'Nobody will try that again soon.'; } },
            { id: 'hire', label: 'Put them to work', apply: (g, w, f) => { treasury(g, f, 10); return 'A thief\'s skills, at your service.'; } }
        ] },
    { id: 'sponsor', text: (who, f) => `${who} offers ${f} 40 in exchange for a favor later.`, choices: [
            { id: 'take', label: 'Accept the money', cost: '+40', apply: (g, w, f) => { if (!treasury(g, f, 40)) {
                    g.player.money += 40;
                    book(g, 'Sponsor', 40);
                } return 'The money is welcome. The favor will be asked.'; } },
            { id: 'decline', label: 'Decline', apply: (g, w) => addRep(g, w, 1, 'honest') || 'You owe nobody.' }
        ] },
];
// Your shift as a leader: an audience (a dilemma) or skip it for a passive income. Once a day per faction.
export function startAudience(g, w, id) {
    const f = factionDef(g, w, id);
    const m = memberOf(g, id);
    if (!f || !m || !isLeader(g, w, id))
        return 'Only the leader holds audiences.';
    if (m.audience === g.day || m.skipped === g.day)
        return 'Your shift is done for today.';
    const people = Object.values(g.cast).filter(r => r.met);
    const who = people.length ? people[Math.floor(H(`${g.day}|${id}|who`) * people.length)].name : 'A petitioner';
    const d = DILEMMAS[Math.floor(H(`${g.day}|${id}|d`) * DILEMMAS.length)];
    const a = { faction: id, who, text: d.text(who, f.name), choices: d.choices.map(c => ({ id: c.id, label: c.label, cost: c.cost })), dilemma: d.id, day: g.day };
    fstate(g).pending = a;
    m.audience = g.day;
    return a;
}
export function decideAudience(g, w, choice) {
    const a = fstate(g).pending;
    if (!a)
        return '';
    const d = DILEMMAS.find(x => x.id === a.dilemma);
    const c = d?.choices.find(x => x.id === choice);
    fstate(g).pending = undefined;
    if (!c)
        return '';
    const out = c.apply(g, w, a.faction);
    note(g, 'As leader of {0}, {u} heard {1} and chose: {2}.', [factionDef(g, w, a.faction)?.name ?? '', a.who, c.label.toLowerCase()], [], g.player.loc, 'work');
    return out;
}
export function skipShift(g, w, id) {
    const m = memberOf(g, id);
    const f = factionDef(g, w, id);
    if (!m || !f || !isLeader(g, w, id))
        return '';
    if (m.audience === g.day || m.skipped === g.day)
        return 'Your shift is done for today.';
    m.skipped = g.day;
    const pay = id === OWN ? 5 * (fstate(g).own?.level ?? 1) : 10 + Math.round(powerOf(g, id) / 5);
    g.player.money += pay;
    book(g, `${f.name}: leader's share`, pay);
    return `You let your officers handle it today (+${pay}).`;
}
/* ---------- the week: dues, duties, power, rivalries; enemies on sight ---------- */
onDay.push((g, w) => {
    if (!on(w))
        return [];
    const st = fstate(g);
    const out = [];
    for (const f of factionsOf(g, w))
        st.power[f.id] ??= 40 + Math.round(H(`${g.world}|${f.id}`) * 30);
    // a new week for each membership: dues, and the duties of the week that ended
    for (const [id, m] of Object.entries(st.member)) {
        const f = factionDef(g, w, id);
        if (!f || id === OWN || m.week >= weekOf(g))
            continue;
        if (f.dues) {
            if (g.player.money >= f.dues) {
                g.player.money -= f.dues;
                book(g, `${f.name}: dues`, -f.dues);
            }
            else {
                addStanding(g, w, id, -8);
                out.push(`You could not pay your dues to ${f.name}.`);
            }
        }
        if (m.duty < (f.quota ?? 0) && !isLeader(g, w, id) && m.joined < g.day - 3) {
            addStanding(g, w, id, -10);
            if (m.rank > 0 && (st.standing[id] ?? 0) < 0) {
                m.rank--;
                out.push(`${f.name} demoted you for neglecting your duties.`);
            }
            else
                out.push(`${f.name} noticed you missed your duties this week.`);
        }
        m.week = weekOf(g);
        m.duty = 0;
    }
    if (g.day % 7 !== 0)
        return out;
    // your own faction: income
    if (st.own) {
        st.own.treasury += st.own.members.length * 5 + st.own.level * 5;
        levelUp(g, w);
    }
    // rivalries: each faction presses the one it beats
    for (const f of w.factions ?? []) {
        if (!f.beats)
            continue;
        const t = (w.factions ?? []).find(x => x.id === f.beats);
        if (!t)
            continue;
        const swing = Math.round((powerOf(g, f.id) - powerOf(g, t.id) + 20) / 10);
        if (swing > 0) {
            st.power[f.id] = clamp(powerOf(g, f.id) + swing, 0, 100);
            st.power[t.id] = clamp(powerOf(g, t.id) - swing, 0, 100);
            const news = `${f.name} gained ground on ${t.name} this week.`;
            st.news = [...st.news, news].slice(-8);
            if (f.region) {
                const r = regionState(g, w, f.region);
                r.tension = Math.min(100, r.tension + 4);
            }
        }
    }
    return out;
});
// A faction that hates you sends its people after you at its headquarters (RPG, once a day).
onHour.push((g, w) => {
    if (!on(w) || !isRpg(w) || !sheetOf(g) || g.combat)
        return [];
    const st = fstate(g);
    if (st.hostileFight === g.day)
        return [];
    const f = (w.factions ?? []).find(x => x.hq === g.player.loc && standingOf(g, x.id) <= -60);
    if (!f)
        return [];
    st.hostileFight = g.day;
    const c = startCombat(g, w, { why: `${f.name}'s enforcers recognize you:`, tags: ['town', 'road'] });
    return c ? [`⚔️ ${f.name} attacks you on sight!`] : [];
});
/* ---------- for the AI ---------- */
export function factionLines(g, w, present) {
    if (!on(w))
        return [];
    const out = [];
    const mine = Object.keys(fstate(g).member).map(id => factionDef(g, w, id) ? `${rankName(g, w, id)} of ${factionDef(g, w, id).name}${isLeader(g, w, id) ? ' (its leader)' : ''}` : '').filter(Boolean);
    if (mine.length)
        out.push(`{{user}} belongs to: ${mine.join('; ')}.`);
    for (const r of present)
        for (const f of membersAmong(g, w, r.avatar)) {
            const v = standingOf(g, f.id);
            out.push(`${r.name} belongs to ${f.name}, which sees {{user}} as ${standingWord(v)}${v <= -60 ? ' (they would rather see {{user}} dead)' : ''}.`);
        }
    const here = (w.factions ?? []).find(f => f.hq === g.player.loc);
    if (here)
        out.push(`This is the headquarters of ${here.name}${here.desc ? ` (${here.desc})` : ''}; it sees {{user}} as ${standingWord(standingOf(g, here.id))}.`);
    return out;
}
