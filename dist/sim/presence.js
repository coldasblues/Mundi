import { whereNow } from './people.js';
import { placeOf, isHome, playerHomeId } from './places.js';
import { visitStart } from './visits.js';
import { statusOf, pendingChanges } from './roster.js';
const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
function whereTo(g, w, r) {
    const dest = whereNow(g, w, r);
    if (dest === playerHomeId)
        return 'heading to your place';
    if (isHome(dest))
        return 'heading home';
    const job = w.features?.jobs !== false ? w.occupations.find(o => o.id === r.occupation) : undefined;
    if (job && job.place === dest)
        return 'off to work';
    const p = placeOf(g, w, dest);
    return p ? `off to ${p.name}` : '';
}
/**
 * Compares who is here with the last time (same visit, same place). Returns the narrator's line, or '' when nothing
 * changed that the story does not already know (a death, someone the story itself had leave, a pair who left together).
 */
export function presenceLine(g, w, here) {
    const prev = g.presence;
    const now = here.map(r => r.avatar);
    const vs = visitStart(g);
    g.presence = { visit: vs, loc: g.player.loc, here: now };
    if (!prev || prev.visit !== vs || prev.loc !== g.player.loc)
        return '';
    const told = new Set(pendingChanges(g).filter(p => p.change === 'left' || p.change === 'dead' || p.change === 'captured' || p.change === 'missing').map(p => p.key));
    const away = g.match?.away ?? {};
    const name = (r) => (r.met ? r.name : 'Someone');
    const gone = prev.here.filter(a => !now.includes(a) && g.cast[a])
        .filter(a => !told.has(`cast:${a}`) && !away[a] && !['dead', 'captured', 'missing'].includes(statusOf(g, `cast:${a}`)))
        .map(a => g.cast[a]);
    const came = now.filter(a => !prev.here.includes(a) && g.cast[a]).map(a => g.cast[a]);
    if (!gone.length && !came.length)
        return '';
    const parts = [];
    if (gone.length === 1) {
        const t = whereTo(g, w, gone[0]);
        parts.push(`${name(gone[0])} has to go${t ? `: ${t}` : ''}.`);
    }
    else if (gone.length)
        parts.push(`${list(gone.map(name))} have to go.`);
    if (came.length)
        parts.push(`${list(came.map(name))} ${came.length > 1 ? 'walk' : 'walks'} in.`);
    return parts.join(' ');
}
/* ---------- who you talk with: the narrator says when it changes ---------- */
/** "Zack turns to talk with Mona alone", "…brings Dev into the conversation", "…turns back to everyone". */
export function talkNotice(g, before, after, me) {
    const n = (a) => g.cast[a]?.met ? g.cast[a].name : 'someone';
    if (!after.length)
        return before.length ? `${me} turns back to everyone.` : '';
    const added = after.filter(a => !before.includes(a)), dropped = before.filter(a => !after.includes(a));
    if (!before.length)
        return `${me} turns to talk with ${list(after.map(n))}${after.length === 1 ? ' alone' : ''}; the others give them some space.`;
    const parts = [];
    if (added.length)
        parts.push(`${me} brings ${list(added.map(n))} into the conversation.`);
    if (dropped.length)
        parts.push(`${me} turns away from ${list(dropped.map(n))}${after.length === 1 ? `, to talk with ${n(after[0])} alone` : ''}.`);
    return parts.join(' ');
}
