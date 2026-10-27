// The social network (short posts, like Twitter/X) and the dating app. Posts are written by the AI in one batch
// call; who posts and whether posts get a picture are options in the game settings.
import { romanceBlocked } from './family.js';
import { nowAbs, settings, saveSettings } from '../core/store.js';
import { appsOf, socialKind, aiVoice, systemOn } from '../core/world.js';
import { ctx, charOf, personaName, sayLine, scriptText } from '../st/bridge.js';
import { aiLangName } from '../core/i18n.js';
import { hm, weekday } from './time.js';
import { placeOf } from './places.js';
import { whereNow, residents } from './people.js';
import { social, addBond, bondLabel } from './social.js';
export function feed(g) {
    const s = social(g);
    const f = (s.feed ??= {});
    f.posts ??= [];
    f.last ??= 0;
    return f;
}
// Default: new posts only when you tap "New posts". (Saves from before had "open" as the default: moved once.)
export const feedPrefs = () => {
    const s = settings();
    s.social ??= {};
    if (!s.social.v2) {
        if (!s.social.mode || s.social.mode === 'open')
            s.social.mode = 'button';
        s.social.v2 = true;
        saveSettings();
    }
    s.social.mode ??= 'button';
    s.social.images ??= false;
    return s.social;
};
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return h >>> 0; };
const handle = (name) => `@${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')}`;
export const handleOf = (g, by) => (by === 'me' ? handle(personaName()) : handle(g.cast[by]?.name ?? '?'));
const about = (r) => String(charOf(r.avatar)?.description ?? '').replace(/{{char}}/g, r.name).replace(/{{user}}/g, personaName()).slice(0, 500);
/* ---------- characters post ---------- */
async function picture(prompt) {
    if (!feedPrefs().images)
        return undefined;
    try {
        const r = await ctx().executeSlashCommandsWithOptions(`/sd quiet=true ${scriptText(prompt.replace(/\|/g, ' '))}`);
        const url = String(r?.pipe ?? '').trim();
        return url && !url.startsWith('Error') ? url : undefined;
    }
    catch {
        return undefined;
    }
}
// The feed as the AI sees it: a social network or a notice board (the world's socialKind), in the world's voice.
const appTitle = (w) => appsOf(w).find(a => a.id === 'social')?.name ?? 'Chirp';
const header = (g, w) => socialKind(w) === 'board'
    ? `[The ${appTitle(w)} of ${w.name}: people pin short notices, rumors, offers and requests, and others scribble answers below. ${weekday(g.day)}, ${hm(g.minutes)}. Notices and answers are short (one or two sentences), written in ${aiLangName(g.lang)}, ${aiVoice(w)}. An answer replies to the notice above it.]`
    : `[${appTitle(w)}, the Twitter-like social network of ${w.name}. ${weekday(g.day)}, ${hm(g.minutes)}. Posts and replies are short (one or two sentences), written in ${aiLangName(g.lang)}; ${aiVoice(w)}. A reply answers the message right above it.]`;
// A few residents post about their day (one short AI call each, written as the next line of a feed).
export async function generatePosts(g, w, count = 2) {
    if (!systemOn(w, 'social'))
        return 0;
    const now = nowAbs(g);
    const pool = residents(g).sort((a, b) => hash(`${a.avatar}|${now}`) - hash(`${b.avatar}|${now}`)).slice(0, count);
    const f = feed(g);
    const recent = f.posts.slice(0, 3).reverse().map(p => `${p.by === 'me' ? personaName() : g.cast[p.by]?.name ?? '?'} (${handleOf(g, p.by)}) posted: ${p.text}`);
    let n = 0;
    for (const r of pool) {
        const transcript = [header(g, w), `[${r.name}: ${about(r)} Right now at ${placeOf(g, w, whereNow(g, w, r))?.name ?? 'home'}.]`, ...recent].join('\n');
        const text = await sayLine(transcript, `${r.name} (${handle(r.name)}) posted`, [r.name], 240, 90);
        if (!text)
            continue;
        const image = hash(text) % 3 === 0 ? await picture(`${r.name}: ${text}`) : undefined;
        f.posts.unshift({ id: `p${now}${n}`, by: r.avatar, text, at: now - (pool.length - n) * 7, likes: 3 + hash(text) % 60, liked: false, reposts: hash(text) % 6, replies: [], image });
        recent.push(`${r.name} (${handle(r.name)}) posted: ${text}`);
        n++;
    }
    f.last = now;
    if (f.posts.length > 80)
        f.posts.length = 80;
    return n;
}
// The thread of one post as a transcript (post, then replies in order).
function threadOf(g, w, post, aboutWho) {
    const nameOf = (by) => (by === 'me' ? personaName() : g.cast[by]?.name ?? '?');
    return [
        header(g, w),
        ...aboutWho.map(r => `[${r.name}: ${about(r).slice(0, 350)} ${r.met ? `${r.name} and ${personaName()} are ${bondLabel(g, r.avatar).toLowerCase()}.` : `${r.name} does not know ${personaName()} yet.`}]`),
        `${nameOf(post.by)} (${handleOf(g, post.by)}) posted: ${post.text}`,
        ...post.replies.map(x => `${nameOf(x.by)} (${handleOf(g, x.by)}) replied: ${x.text}`),
    ].join('\n');
}
// When to post on their own: "auto" every few game hours (called by the clock), "open" when the app opens.
// "button" (the default) and "react" never post on their own: only the "New posts" button (forced) makes new posts.
export const shouldPost = (g, mode) => feedPrefs().mode === mode && nowAbs(g) - feed(g).last >= (mode === 'auto' ? 180 : 120);
/* ---------- the player posts, likes and replies ---------- */
export async function postAsMe(g, w, text) {
    const now = nowAbs(g);
    const post = { id: `m${now}`, by: 'me', text, at: now, likes: 0, liked: false, reposts: 0, replies: [] };
    feed(g).posts.unshift(post);
    // people who know you react, one after the other (each sees the replies before hers)
    const known = residents(g).filter(r => r.met).sort((a, b) => hash(`${a.avatar}${now}`) - hash(`${b.avatar}${now}`)).slice(0, 2);
    post.likes = known.length + hash(text) % 8;
    for (const r of known) {
        const line = await sayLine(threadOf(g, w, post, [r]), `${r.name} (${handle(r.name)}) replied`, [r.name, personaName()], 200, 80);
        if (line)
            post.replies.push({ by: r.avatar, text: line, at: now + 5 });
    }
    return post;
}
export function toggleLike(g, post) {
    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
    if (post.liked && post.by !== 'me' && g.cast[post.by]?.met)
        addBond(g, post.by, 1);
}
export async function replyTo(g, w, post, text) {
    const now = nowAbs(g);
    post.replies.push({ by: 'me', text, at: now });
    const r = g.cast[post.by];
    if (!r)
        return;
    if (r.met)
        addBond(g, r.avatar, 2);
    const line = await sayLine(threadOf(g, w, post, [r]), `${r.name} (${handle(r.name)}) replied`, [r.name, personaName()], 200, 80);
    if (line)
        post.replies.push({ by: r.avatar, text: line, at: now + 3 });
}
/* ---------- dating ---------- */
export const LOOKING = ['A relationship', 'Something casual', 'Friendship', 'Not sure yet'];
export function dating(g) {
    const s = social(g);
    const d = (s.dating ??= {});
    d.profile ??= { bio: '', looking: [], interests: [...(g.player.traits?.interests ?? [])], ready: false };
    d.seen ??= {};
    d.matches ??= [];
    return d;
}
// Her profile on the app: who she is, what she looks for (fixed per person) and a few interests.
export function theirProfile(w, r) {
    const h = hash(r.avatar);
    const interests = (w.sheet.traits?.find(t => t.id === 'interests')?.options ?? []);
    return {
        looking: LOOKING[h % LOOKING.length],
        interests: [interests[h % interests.length], interests[(h >> 3) % interests.length]].filter((x, i, a) => x && a.indexOf(x) === i),
        bio: about(r).split(/(?<=[.!?])\s/).slice(0, 2).join(' '),
        onApp: h % 10 < 8,
    };
}
export function candidates(g, w) {
    const d = dating(g);
    // a random order, the same until the app is opened again (so the card on screen does not jump)
    const seed = String(d.seed ??= Math.random().toString(36).slice(2));
    return residents(g).sort((a, b) => hash(`${seed}|${a.avatar}`) - hash(`${seed}|${b.avatar}`)).filter(r => !d.seen[r.avatar] && !social(g).partner.includes(r.avatar) && !romanceBlocked(g, r.avatar) && theirProfile(w, r).onApp);
}
// A like matches when you have enough in common (what you both look for, shared interests) and a bit of luck.
export function swipe(g, w, avatar, like) {
    const d = dating(g);
    d.seen[avatar] = like ? 'like' : 'pass';
    if (!like)
        return false;
    const r = g.cast[avatar];
    const p = theirProfile(w, r);
    let chance = 35;
    if (d.profile.looking.includes(p.looking))
        chance += 30;
    chance += 15 * p.interests.filter(i => d.profile.interests.includes(i)).length;
    const match = hash(`${avatar}|${g.day}|${d.profile.bio.length}`) % 100 < chance;
    if (match) {
        d.matches.push(avatar);
        r.met = true; // a match is a contact: she shows up in Messages and People
        social(g).bond[avatar] = Math.max(social(g).bond[avatar] ?? 0, 10);
    }
    return match;
}
