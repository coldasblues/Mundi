// Relationships, meet-ups and text messages. Bond grows when you talk to someone (in a scene or by phone);
// a meet-up puts her at a place you chose for two hours; at a high bond you can ask her to be your partner.
import { notify, nowAbs, cfg } from '../core/store.js';
import { styleOf } from '../core/world.js';
import { charOf, personaName, sayLine, translateTo } from '../st/bridge.js';
import { whereNow } from './people.js';
import { aiLangName } from '../core/i18n.js';
import { hm, weekday } from './time.js';
import { placeOf } from './places.js';
export function social(g) {
    const s = (g.social ??= {});
    s.bond ??= {};
    s.today ??= {};
    s.partner ??= [];
    s.threads ??= {};
    s.unread ??= {};
    s.appts ??= [];
    s.with ??= [];
    for (const a of s.appts) {
        a.id ??= `a${a.from}${a.avatar}`;
        a.kind ??= 'hangout';
        a.state ??= 'set';
    } // saves from before plans
    return s;
}
export const bondOf = (g, avatar) => social(g).bond[avatar] ?? 0;
export const isPartner = (g, avatar) => social(g).partner.includes(avatar);
export function bondLabel(g, avatar) {
    if (isPartner(g, avatar))
        return 'Partner';
    const b = bondOf(g, avatar);
    return b >= 80 ? 'Best friend' : b >= 55 ? 'Good friend' : b >= 30 ? 'Friend' : b >= 10 ? 'Acquaintance' : 'Stranger'; // the same tiers as romance.ts
}
// Moves bond without the daily cap (keeping or missing a date, a match).
export function bump(g, avatar, delta) {
    const s = social(g);
    s.bond[avatar] = Math.max(0, Math.min(100, (s.bond[avatar] ?? 0) + delta));
}
// Adds bond, at most 15 a day with each person (talking all day does not max it out).
export function addBond(g, avatar, amount) {
    const s = social(g);
    const key = `${avatar}|${g.day}`;
    const room = Math.max(0, (cfg(g).bondCap ?? 15) - (s.today[key] ?? 0));
    const add = Math.min(room, amount);
    if (add <= 0)
        return 0;
    s.today[key] = (s.today[key] ?? 0) + add;
    s.bond[avatar] = Math.min(100, (s.bond[avatar] ?? 0) + add);
    for (const k of Object.keys(s.today))
        if (!k.endsWith(`|${g.day}`))
            delete s.today[k];
    return add;
}
// A bond also goes down (an insult, a fight, a broken promise). No daily limit; it never goes below 0.
export function loseBond(g, avatar, amount) {
    const s = social(g);
    const before = s.bond[avatar] ?? 0;
    s.bond[avatar] = Math.max(0, before - Math.abs(amount));
    return before - s.bond[avatar];
}
/* ---------- meet-ups ---------- */
export const MEET_BOND = 35;
export const PARTNER_BOND = 85;
export const livePlan = (a) => a.state === 'set' || a.state === 'met';
export function appointmentNow(g, avatar) {
    const now = nowAbs(g);
    return social(g).appts.find(a => a.avatar === avatar && livePlan(a) && a.from <= now && now < a.to) ?? null;
}
export const isWith = (g, avatar) => social(g).with.some(c => c.avatar === avatar);
/** Who you are talking with, when not with everyone here: one person ("talk only with them") or a few. [] = everyone. */
export function talkSet(g) {
    const s = social(g);
    const f = (s.focus ?? []);
    if (f.length >= 2)
        return f;
    return s.solo ? [String(s.solo)] : [];
}
export const inTalk = (g, avatar) => { const t = talkSet(g); return !t.length || t.includes(avatar); };
/** Someone on the side who cuts in for one reply (the engine decides: see match.ts). */
export const guestOf = (g) => String(social(g).guest ?? '');
export function setGuest(g, avatar) { social(g).guest = avatar; }
/** Sets who you talk with: [] everyone, [a] only them, [a, b, …] these few. */
export function setTalk(g, list) {
    const s = social(g);
    const uniq = [...new Set(list)];
    s.focus = uniq.length >= 2 ? uniq : [];
    s.solo = uniq.length === 1 ? uniq[0] : '';
}
export const companions = (g) => social(g).with.map(c => c.avatar).filter(a => g.cast[a]);
/* ---------- text messages ---------- */
// A text reply: the chat so far as a transcript that ends with her name, so the model writes her next message.
function textTranscript(g, w, r, note = '') {
    const c = charOf(r.avatar);
    const me = personaName();
    const thread = social(g).threads[r.avatar] ?? [];
    const about = String(c?.description ?? '').replace(/{{char}}/g, r.name).replace(/{{user}}/g, me).replace(/\s+/g, ' ').slice(0, 900);
    return [
        (styleOf(w) === 'medieval'
            ? `[Letters in the kingdom of ${w.name}, ${weekday(g.day)} ${hm(g.minutes)}. ${r.name} and ${me} write each other short letters, carried by a courier; they are`
            : `[Phone chat in the city of ${w.name}, ${weekday(g.day)} ${hm(g.minutes)}. ${r.name} and ${me} text each other; they are`) + ` ${bondLabel(g, r.avatar).toLowerCase()} (${bondOf(g, r.avatar)}/100). ${me} is at ${placeOf(g, w, g.player.loc)?.name ?? ''}; ${r.name} is ${nowDoing(g, w, r)}.]`,
        `[They are texting, not together. ${r.name} talks about their own day (what they are doing, how they feel, what they will do today) and answers what ${me} wrote. ${r.name} does not keep repeating where ${me} is or plans they already agreed on, unless ${me} brings them up.]`,
        `[${r.name}: ${about}${c?.personality ? ` Personality: ${String(c.personality).replace(/\s+/g, ' ').slice(0, 300)}` : ''}]`,
        `[Each message is short (one to three sentences), casual, written in ${aiLangName(g.lang)}, and answers the message right before it.]`,
        ...thread.slice(-14).map(t => `${t.me ? me : r.name}: ${t.text.replace(/\s+/g, ' ')}`),
        ...(note ? [`[${note}]`] : []),
    ].join('\n');
}
// What she is doing right now, for her texts (so she has something of her own to talk about).
function nowDoing(g, w, r) {
    const at = whereNow(g, w, r);
    const p = at === `home:${r.avatar}` || at.startsWith('home:') ? 'at home' : placeOf(g, w, at)?.name ? `at ${placeOf(g, w, at).name}` : 'out';
    return p;
}
export async function sendText(g, w, avatar, text) {
    const s = social(g);
    const r = g.cast[avatar];
    if (!r)
        return '';
    (s.threads[avatar] ??= []).push({ me: true, text, at: nowAbs(g) });
    addBond(g, avatar, 2);
    const reply = await sayLine(textTranscript(g, w, r), r.name, [r.name, personaName()], 320);
    if (reply)
        s.threads[avatar].push({ me: false, text: reply, at: nowAbs(g) });
    return reply;
}
// She texts you (an answer to an invitation, or on her own), following `note` (what she must convey).
// `mine` is your message, when there is one. Without the AI, they send `fallback`.
export async function textFrom(g, w, avatar, note, fallback, mine = '') {
    const s = social(g);
    const r = g.cast[avatar];
    if (!r)
        return '';
    const t = (s.threads[avatar] ??= []);
    if (mine) {
        mine = await translateTo(mine);
        t.push({ me: true, text: mine, at: nowAbs(g) });
        notify();
    } // your message shows right away (in the chat's language)
    let reply = '';
    try {
        reply = await sayLine(textTranscript(g, w, r, note), r.name, [r.name, personaName()], 320);
    }
    catch { /* offline */ }
    t.push({ me: false, text: reply || fallback, at: nowAbs(g) });
    return reply || fallback;
}
// A line for the AI about the people in the scene and how close they are to the player.
export function relationsLine(g, present) {
    const parts = present.map(r => `${r.name} — ${bondLabel(g, r.avatar).toLowerCase()}`);
    return parts.length ? `How they relate to {{user}}: ${parts.join('; ')}.` : '';
}
