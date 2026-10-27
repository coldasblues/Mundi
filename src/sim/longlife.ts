// People's lives over the weeks (also while you sleep or skip time): couples get engaged, marry and move in
// together, or break up; people get promoted at work. What happens to someone you know reaches you as news.
// Everything is the engine's, day by day, the same for the same days.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { onDay } from './hooks.js';
import { note } from './facts.js';
import { npcCareer } from './work.js';
import { lifeMoment } from './happenings.js';
import { couples, setTie, removeTie, liveTogether, homeKey } from './living.js';

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rnd = (g: Save, salt: string) => H(`${g.world}|${g.day}|${salt}`);
type Stage = 'dating' | 'engaged' | 'married';
interface PairInfo { since: number; stage: Stage }
const store = (g: Save) => { const l = ((g as any).living ??= {}); l.pairInfo ??= {}; l.ranks ??= {}; l.pairs ??= []; return l as { pairInfo: Record<string, PairInfo>; ranks: Record<string, number>; pairs: [string, string][] }; };
const key = (a: string, b: string) => [a, b].sort().join('|');
export const pairStage = (g: Save, a: string, b: string): Stage | null => (couples(g).some(p => key(p[0], p[1]) === key(a, b)) ? store(g).pairInfo[key(a, b)]?.stage ?? 'dating' : null);
export const npcRank = (g: Save, avatar: string) => store(g).ranks[avatar] ?? 0;

function couplesMoveOn(g: Save, w: WorldDef): string[] {
    const out: string[] = [];
    const st = store(g);
    for (const [a, b] of couples(g)) {
        const k = key(a, b), A = g.cast[a], B = g.cast[b];
        const info = (st.pairInfo[k] ??= { since: g.day, stage: 'dating' });
        const days = g.day - info.since, known = A.met || B.met;
        const tell = (t: string, kind: string, tone: 'good' | 'bad' = 'good') => {
            note(g, t, [A.name, B.name], [a, b], `home:${a}`, kind);
            const text = t.replace('{0}', A.name).replace('{1}', B.name);
            if (known) out.push(text);
            for (const x of [a, b]) lifeMoment(g, w, x, text, tone);   // the people close to you tell you
        };
        if (info.stage === 'dating') {
            if (days >= 14 && rnd(g, `engage|${k}`) < 0.05) { info.stage = 'engaged'; info.since = g.day; tell('{0} and {1} got engaged!', 'life'); }
            else if (rnd(g, `split|${k}`) < 0.012) {
                st.pairs = st.pairs.filter(p => key(p[0], p[1]) !== k); delete st.pairInfo[k];
                removeTie(g, a, b); setTie(g, { a, b, type: 'ex', tone: 'tense' });
                tell('{0} and {1} broke up.', 'life', 'bad');
            }
        } else if (info.stage === 'engaged' && days >= 14 && rnd(g, `marry|${k}`) < 0.07) {
            info.stage = 'married'; info.since = g.day;
            removeTie(g, a, b); setTie(g, { a, b, type: 'spouse', tone: 'close' });
            // they move in together (unless one of them lives with you: then nobody moves)
            const withYou = (x: any) => x.homeWith === '__you';
            if (!withYou(A) && !withYou(B) && homeKey(A.home) !== homeKey(B.home)) liveTogether(g, a, b);
            tell('{0} and {1} got married!', 'life');
        }
    }
    return out;
}

function careersMoveOn(g: Save, w: WorldDef): string[] {
    const out: string[] = [];
    const st = store(g);
    for (const r of Object.values(g.cast)) {
        const o = w.occupations.find(x => x.id === r.occupation);
        const ranks = o ? npcCareer(o, r.avatar).ranks : [];
        if (!o || ranks.length < 2) continue;
        const rank = st.ranks[r.avatar] ?? 0;
        if (rank >= ranks.length - 1 || rnd(g, `promo|${r.avatar}`) >= 0.012) continue;
        st.ranks[r.avatar] = rank + 1;
        const t = '{0} was promoted to {1}.';
        note(g, t, [r.name, ranks[rank + 1].name], [r.avatar], o.place, 'work');
        if (r.met) out.push(t.replace('{0}', r.name).replace('{1}', ranks[rank + 1].name));
        lifeMoment(g, w, r.avatar, t.replace('{0}', r.name).replace('{1}', ranks[rank + 1].name), 'good');
    }
    return out;
}

onDay.push((g, w) => [
    ...(systemOn(w, 'living') && systemOn(w, 'romance') ? couplesMoveOn(g, w) : []),
    ...(systemOn(w, 'living') && systemOn(w, 'jobs') ? careersMoveOn(g, w) : []),
]);
