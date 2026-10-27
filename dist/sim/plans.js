// Plans with people: meet-ups and dates at a place and time you choose, "come over" (she comes to where you
// are now) and "come with me" (she goes along with you from place to place). Each one depends on how close you
// are and on her routine: she says no when she works or sleeps then, or already has plans.
// Plans you keep raise the bond; standing her up lowers it (and she texts you about it).
import { lex } from '../core/lexicon.js';
import { approve, approveAll } from './living.js';
import { addStatus } from './needs.js';
import { feel } from './life.js';
import { note as remember } from './facts.js';
import { nowAbs } from '../core/store.js';
import { hm, weekday } from './time.js';
import { placeOf, playerHomeId, travelMinutes } from './places.js';
import { routineStep, routineAt, whereNow } from './people.js';
import { social, bondOf, isPartner, bump, livePlan, textFrom } from './social.js';
import { dating } from './feed.js';
import { personaName } from '../st/bridge.js';
export const HANGOUT_BOND = 15; // acquaintance: you can hang out
export const DATE_BOND = 50; // a date needs a good bond, a Spark match or being together
export const COME_BOND = 25; // "come over now"
export const ALONG_BOND = 15; // "come with me"
export const HOME_BOND = 50; // your home is for close people
const PLAN_LENGTH = 120, ALONG_LENGTH = 240, GRACE = 60; // they wait an hour before giving up
const yes = { ok: true, why: '' };
const matched = (g, avatar) => dating(g).matches.includes(avatar);
const close = (g, avatar, need) => isPartner(g, avatar) || bondOf(g, avatar) >= need;
export const isWorking = (w, r, at) => routineStep(r, at)[1] === 'work' && !!w.occupations.find(o => o.id === r.occupation);
export function isSleeping(r, at) {
    const h = Math.floor((at % 1440) / 60);
    return routineStep(r, at)[1] === 'home' && (h < 7 || h >= 23);
}
const overlaps = (a, from, to) => a.from < to && from < a.to;
// When a plan can start: from half an hour from now up to a week ahead.
export const earliest = (g) => { const n = nowAbs(g) + 30; return n - (n % 30) + 30; };
export function when(g, at) {
    const d = Math.floor(at / 1440);
    const day = d === g.day ? 'today' : d === g.day + 1 ? 'tomorrow' : `on ${weekday(d)}`;
    return `${day} at ${hm(at % 1440)}`;
}
export function check(g, w, avatar, place, from, to, kind, need) {
    const r = g.cast[avatar];
    if (!r)
        return { ok: false, why: 'They are not in this world.' };
    if (kind === 'date' && !(close(g, avatar, DATE_BOND) || (matched(g, avatar) && bondOf(g, avatar) >= 10)))
        return { ok: false, why: 'They are not ready for a date with you yet.' };
    if (!close(g, avatar, need) && !matched(g, avatar))
        return { ok: false, why: 'They do not know you well enough yet.' };
    if (place === playerHomeId && !close(g, avatar, HOME_BOND))
        return { ok: false, why: 'They are not comfortable going to your home yet.' };
    for (let t = from; t < to; t += 30) {
        if (isWorking(w, r, t))
            return { ok: false, why: 'They work at that time.' };
        if (isSleeping(r, t))
            return { ok: false, why: 'It is too late (or too early) for them.' };
    }
    if (social(g).appts.some(a => a.avatar === avatar && livePlan(a) && overlaps(a, from, to)))
        return { ok: false, why: 'They already have plans with you then.' };
    return yes;
}
export function add(g, avatar, place, from, kind, come = false, title = '') {
    const s = social(g);
    const a = { id: `a${nowAbs(g)}${Math.random().toString(36).slice(2, 6)}`, avatar, place, from, to: from + PLAN_LENGTH, kind, state: 'set', come };
    if (title.trim())
        a.title = title.trim().slice(0, 80);
    s.appts.push(a);
    return a;
}
/* ---------- making plans ---------- */
// The fact kept about an invitation; a named event says what it is ("Movie night", "Her birthday dinner").
const inviteFact = (kind, title) => title.trim()
    ? (kind === 'date' ? '{u} asked {0} out on a date ("{3}") at {1} for {2}, and {0} said yes.' : '{u} invited {0} to "{3}" at {1} for {2}, and {0} said yes.')
    : (kind === 'date' ? '{u} asked {0} out on a date at {1} for {2}, and {0} said yes.' : '{u} invited {0} to meet up at {1} for {2}, and {0} said yes.');
export const planWhat = (a) => a.title ? `"${a.title}"` : '';
// Asks her (by phone) to meet at `place` at `from`. She answers by text, written by the AI to match the decision.
export async function invite(g, w, avatar, place, from, kind, mine, title = '') {
    const r = g.cast[avatar];
    const ans = check(g, w, avatar, place, from, from + PLAN_LENGTH, kind, HANGOUT_BOND);
    const where = place === playerHomeId ? `${personaName()}'s place` : placeOf(g, w, place)?.name ?? '';
    const at = `day ${Math.floor(from / 1440)} at ${hm(from % 1440)}`;
    if (ans.ok) {
        add(g, avatar, place, from, kind, false, title);
        remember(g, inviteFact(kind, title), [r.name, where, at, title.trim()], [avatar], g.player.loc, 'plan');
    }
    const what = (kind === 'date' ? 'a date' : 'hanging out') + (title.trim() ? ` ("${title.trim()}")` : '');
    const note = ans.ok
        ? `${r.name} happily accepts ${what} at ${where}, ${when(g, from)}, in one short ${lex(w, 'msgNoun')}.`
        : `${r.name} declines in one short, kind ${lex(w, 'msgNoun')}. Reason: ${ans.why.replace(/^They (are|do|work|already have) /, (_m, v) => `${r.name} ${{ are: 'is', do: 'does', work: 'works', already: 'already has' }[v.split(' ')[0]] ?? v} `).replace(/^__never__/, `${r.name} `)}`;
    await textFrom(g, w, avatar, note, ans.ok ? 'Sure! See you there.' : 'Sorry, I can\'t then.', mine);
    return ans;
}
// Asked in person (she is right here): the engine decides, the scene plays it (no phone messages).
export function inviteFace(g, w, avatar, place, from, kind, title = '') {
    const r = g.cast[avatar];
    const ans = check(g, w, avatar, place, from, from + PLAN_LENGTH, kind, HANGOUT_BOND);
    const where = place === playerHomeId ? `${personaName()}'s place` : placeOf(g, w, place)?.name ?? '';
    const at = `day ${Math.floor(from / 1440)} at ${hm(from % 1440)}`;
    if (ans.ok) {
        add(g, avatar, place, from, kind, false, title);
        remember(g, inviteFact(kind, title), [r.name, where, at, title.trim()], [avatar], g.player.loc, 'plan');
    }
    return { ...ans, where: place === playerHomeId ? 'my place' : where, when: when(g, from) };
}
// "Come over": she comes to where you are now, as soon as she gets here.
export async function callOver(g, w, avatar, mine) {
    const r = g.cast[avatar];
    const now = nowAbs(g);
    const here = g.player.loc;
    if (whereNow(g, w, r) === here)
        return { ok: false, why: 'They are already here.' };
    const trip = Math.max(15, travelMinutes(g, w, whereNow(g, w, r), here));
    const from = now + trip;
    const kind = isPartner(g, avatar) ? 'date' : 'hangout';
    let ans = check(g, w, avatar, here, now, from + PLAN_LENGTH, kind, COME_BOND);
    if (ans.ok && isWorking(w, r, now))
        ans = { ok: false, why: 'They are at work right now.' };
    const where = here === playerHomeId ? `${personaName()}'s place (not ${r.name}'s home: ${r.name} has to come over)` : placeOf(g, w, here)?.name ?? '';
    if (ans.ok) {
        social(g).appts = social(g).appts.filter(a => !(a.avatar === avatar && a.come && livePlan(a)));
        add(g, avatar, here, from, kind, true);
    }
    const note = ans.ok
        ? `${r.name} agrees to come to ${where} now and says they will be there in about ${trip} minutes, in one short ${lex(w, 'msgNoun')}.`
        : `${r.name} says they can't come over to ${where} right now, in one short, kind ${lex(w, 'msgNoun')}. Reason: ${ans.why.replace(/^They (are|do|work|already have) /, (_m, v) => `${r.name} ${{ are: 'is', do: 'does', work: 'works', already: 'already has' }[v.split(' ')[0]] ?? v} `).replace(/^__never__/, `${r.name} `)}`;
    await textFrom(g, w, avatar, note, ans.ok ? 'On my way!' : 'I can\'t right now, sorry.', mine);
    return { ...ans, at: from };
}
// Someone who lives with you (your household, your family): going home is going to their home too.
export const housemate = (g, avatar) => g.cast[avatar]?.homeWith === '__you' || (g.living?.ties ?? []).some((t) => (t.a === avatar && t.b === '__you' || t.b === avatar && t.a === '__you') && ['parent', 'child', 'sibling', 'spouse', 'partner', 'roommate'].includes(t.type));
// "Come with me": she is here with you and goes along wherever you go, for a few hours.
export function askAlong(g, w, avatar) {
    const r = g.cast[avatar];
    const now = nowAbs(g);
    if (!r)
        return { ok: false, why: '' };
    if (!close(g, avatar, ALONG_BOND) && !matched(g, avatar) && !housemate(g, avatar))
        return { ok: false, why: 'They do not know you well enough yet.' };
    if (isWorking(w, r, now) && routineAt(g, w, r, now) === g.player.loc)
        return { ok: false, why: 'They are working.' };
    const s = social(g);
    if (!s.with.some(c => c.avatar === avatar)) {
        s.with.push({ avatar, until: now + ALONG_LENGTH });
        remember(g, '{0} went along with {u} for a while.', [r.name], [avatar]);
    }
    // a plan here is over: she is with you now
    for (const a of s.appts)
        if (a.avatar === avatar && livePlan(a) && a.from <= now)
            a.state = 'met', a.to = Math.min(a.to, now);
    return yes;
}
export function letGo(g, avatar) {
    const s = social(g);
    s.with = s.with.filter(c => c.avatar !== avatar);
    if (g.party?.members)
        g.party.members = g.party.members.filter((m) => m.avatar !== avatar); // letting a companion go: they leave the party too
    if (s.solo === avatar)
        s.solo = ''; // talking alone with them ends when they go
}
export function cancelPlan(g, id) {
    const a = social(g).appts.find(x => x.id === id);
    if (!a || a.state !== 'set')
        return null;
    a.state = 'cancelled';
    approve(g, a.avatar, -4);
    remember(g, '{u} called off the plans with {0}.', [g.cast[a.avatar]?.name ?? ''], [a.avatar], g.player.loc, 'plan');
    if (a.from - nowAbs(g) < 120)
        bump(g, a.avatar, -2); // last-minute cancels sting a little
    return a;
}
export const upcoming = (g, avatar) => social(g).appts
    .filter(a => a.state === 'set' && a.to > nowAbs(g) && (!avatar || a.avatar === avatar))
    .sort((a, b) => a.from - b.from);
// Runs after time passes: reminders, arrivals, missed plans, and company that has to go.
export function planTick(g, w) {
    const s = social(g);
    const now = nowAbs(g);
    const out = [];
    const nameOf = (a) => g.cast[a]?.name ?? '?';
    const placeName = (id) => (id === playerHomeId ? 'your home' : placeOf(g, w, id)?.name ?? '');
    for (const a of s.appts) {
        if (a.state !== 'set' || !g.cast[a.avatar])
            continue;
        if (!a.warned && !a.come && a.from - now <= 60 && a.from > now) {
            a.warned = true;
            out.push({ text: `Soon: ${nameOf(a.avatar)} at ${placeName(a.place)}, ${hm(a.from % 1440)}.`, kind: 'info' });
        }
        if (now >= a.from && g.player.loc === a.place) {
            a.state = 'met';
            // the event starts: they join you (and follow you) until it is over, and the HUD shows it
            const cw = s.with.find(x => x.avatar === a.avatar);
            if (cw)
                cw.until = Math.max(cw.until, a.to);
            else
                s.with.push({ avatar: a.avatar, until: a.to });
            if (!s.event && !a.come) {
                s.event = { id: a.id, avatar: a.avatar, kind: a.kind, title: a.title, moodAt: now };
                addStatus(g, w, 'mood', a.kind === 'date' || a.kind === 'party' ? 15 : 10);
            }
            bump(g, a.avatar, a.kind === 'date' ? 8 : 5);
            approve(g, a.avatar, 5);
            feel(g, a.avatar, a.kind === 'party' ? 'Had a great time at your party' : a.kind === 'date' ? 'Happy about the date' : 'Glad you kept your word', 1);
            remember(g, a.kind === 'date' ? '{u} and {0} had a date at {1}, as planned.' : '{u} and {0} met up at {1}, as planned.', [nameOf(a.avatar), placeName(a.place)], [a.avatar], a.place, 'plan');
            out.push({ text: a.come ? `${nameOf(a.avatar)} arrived.` : `${nameOf(a.avatar)} is here to meet you.`, kind: 'success' });
        }
        else if (now >= a.from + GRACE && g.player.loc !== a.place) {
            a.state = 'missed';
            a.to = Math.min(a.to, now); // she gives up and goes back to her day
            bump(g, a.avatar, a.kind === 'date' ? -10 : -6);
            feel(g, a.avatar, 'Resentful: you stood them up', 3);
            approve(g, a.avatar, -12);
            approveAll(g, -2, [a.avatar]);
            remember(g, '{u} stood {0} up: {0} waited at {1}, and {u} never came.', [nameOf(a.avatar), placeName(a.place)], [a.avatar], a.place, 'plan');
            out.push({ text: `${nameOf(a.avatar)} waited for you at ${placeName(a.place)}, but you never came.`, kind: 'warn', texted: a.avatar });
            const r = g.cast[a.avatar];
            textFrom(g, w, a.avatar, `${r.name} waited a whole hour for ${personaName()} at ${placeName(a.place)} for ${a.kind === 'date' ? 'their date' : 'their meet-up'}, but ${personaName()} never showed up and never warned them. They ${lex(w, 'msgWrite')} one short ${lex(w, 'msgNoun')}: upset and angry, in their own way.`, lex(w, 'stoodUpFallback'))
                .then((t) => { s.unread[a.avatar] = (s.unread[a.avatar] ?? 0) + 1; remember(g, lex(w, 'stoodUpFact'), [r.name, t.length > 160 ? `${t.slice(0, 157)}…` : t], [a.avatar], a.place, 'plan'); })
                .catch(() => { });
        }
    }
    // being out with someone keeps you in a good mood (more than the hourly drop)
    const ev = s.event;
    if (ev && s.with.some(c => c.avatar === ev.avatar)) {
        const hrs = Math.floor((now - (ev.moodAt ?? now)) / 60);
        if (ev.moodAt === undefined)
            ev.moodAt = now;
        else if (hrs > 0) {
            addStatus(g, w, 'mood', hrs * (ev.kind === 'hangout' ? 5 : 6));
            ev.moodAt += hrs * 60;
        }
    }
    // old plans are forgotten after a few days
    s.appts = s.appts.filter(a => a.to > now - 3 * 1440).slice(-40);
    for (const c of [...s.with]) {
        if (now < c.until)
            continue;
        letGo(g, c.avatar);
        out.push({ text: `${nameOf(c.avatar)} had to go.`, kind: 'info' });
    }
    return out;
}
// Before you travel: who comes along (and who stays, like when you head home and she is not that close).
export function beforeTravel(g, w, to) {
    const out = [];
    for (const c of [...social(g).with]) {
        const r = g.cast[c.avatar];
        if (!r) {
            letGo(g, c.avatar);
            continue;
        }
        if (to === playerHomeId && !close(g, c.avatar, HOME_BOND) && !housemate(g, c.avatar)) {
            letGo(g, c.avatar);
            out.push(`${r.name} said goodbye: they are not ready to go to your home.`);
        }
    }
    return out;
}
// Sleeping: everyone goes home (your partner stays when you sleep at home).
export function beforeSleep(g) {
    const out = [];
    const stay = social(g).stay;
    for (const c of [...social(g).with]) {
        if (stay && stay.avatar === c.avatar && stay.where === g.player.loc) {
            c.until = Math.max(c.until, nowAbs(g) + 14 * 60);
            continue;
        } // staying the night together
        if (isPartner(g, c.avatar) && g.player.loc === playerHomeId) {
            c.until = nowAbs(g) + 12 * 60;
            continue;
        }
        letGo(g, c.avatar);
        out.push(`${g.cast[c.avatar]?.name ?? ''} went home.`);
    }
    return out;
}
// For the world prompt: who came with the player, who came to meet them.
export function planLines(g, present, w) {
    const s = social(g);
    const now = nowAbs(g);
    return present.map(r => {
        if (s.with.some(c => c.avatar === r.avatar))
            return `${r.name} came along with {{user}} and is spending time with {{user}}.`;
        const a = s.appts.find(x => x.avatar === r.avatar && livePlan(x) && x.from <= now && now < x.to);
        if (!a) {
            // plans still ahead (today or the next days): they both know about them
            const next = s.appts.filter(x => x.avatar === r.avatar && x.state === 'set' && x.from > now && x.from - now <= 3 * 1440).sort((x, y) => x.from - y.from)[0];
            if (!next)
                return '';
            const d = Math.floor(next.from / 1440), when = `${d === g.day ? 'today' : d === g.day + 1 ? 'tomorrow' : weekday(d)} at ${hm(next.from % 1440)}`;
            const where = next.place === playerHomeId ? "{{user}}'s place" : (w && placeOf(g, w, next.place)?.name) || '';
            return `${r.name} and {{user}} have plans for later: ${next.kind === 'date' ? 'a date' : next.kind === 'party' ? "{{user}}'s party" : 'to hang out'}${next.title ? `, "${next.title}"` : ''} ${when}${where ? ` (${where})` : ''}. It has not happened yet.`;
        }
        if (a.come)
            return `${r.name} came here because {{user}} asked them to come over.`;
        if (a.title)
            return `${r.name} is here with {{user}} for ${a.kind === 'date' ? 'a date' : a.kind === 'party' ? "{{user}}'s party" : 'their plan'}: "${a.title}" (this is what the event is about).`;
        if (a.kind === 'party')
            return `${r.name} is at {{user}}'s party.`;
        return a.kind === 'date' ? `${r.name} is here on a date with {{user}}, as they planned.` : `${r.name} came here to hang out with {{user}}, as they planned.`;
    }).filter(Boolean);
}
