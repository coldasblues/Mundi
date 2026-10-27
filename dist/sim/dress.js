// Home: a dress code per room ("swimsuit" at the pool, "pajamas" in the bedrooms). Whoever has an outfit with that
// name (a subfolder of their Expressions folder) wears it while in the room with you; back in a room without one,
// the outfit the dress code put on comes off again. The AI is told what people wear there.
import { cfg, state } from '../core/store.js';
import { isScenario } from '../core/world.js';
import { presentAt } from './people.js';
import { outfitOf, wearOutfit } from '../st/bridge.js';
export const dressCodes = (g) => (cfg(g).dress ??= {});
// a room's own code; a bedroom (home:…) uses the one set for all the bedrooms
export const dressAt = (g, loc) => String(dressCodes(g)[loc] ?? (loc.startsWith('home:') ? dressCodes(g).__bedrooms : '') ?? '').trim();
const dressed = (g) => (g.dressed ??= {});
// Puts on (or takes off) the dress code's outfit for the people in the scene. `has`: the outfits someone has
// (null while still looking: nothing changes for them yet).
export function applyDress(g, w, has) {
    if (!isScenario(w))
        return false;
    const code = dressAt(g, g.player.loc).toLowerCase();
    const worn = dressed(g);
    let changed = false;
    for (const r of presentAt(g, w, g.player.loc)) {
        const list = has(r.avatar);
        if (!list)
            continue;
        const match = code ? list.find(o => o.toLowerCase() === code) : undefined;
        const cur = outfitOf(r.avatar);
        if (match) {
            if (cur.toLowerCase() !== match.toLowerCase()) {
                wearOutfit(r.avatar, match);
                worn[r.avatar] = match;
                delete state.sprites[r.avatar];
                changed = true;
            }
        }
        else if (worn[r.avatar] && cur.toLowerCase() === worn[r.avatar].toLowerCase()) {
            wearOutfit(r.avatar, '');
            delete worn[r.avatar];
            delete state.sprites[r.avatar];
            changed = true;
        }
    }
    return changed;
}
// For the AI: what people wear in this room.
export function dressLine(g, w) {
    if (!isScenario(w))
        return '';
    const code = dressAt(g, g.player.loc);
    return code ? `Dress code here: people wear their ${code} (outfit) in this room.` : '';
}
