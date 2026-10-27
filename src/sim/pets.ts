// Pets and familiars: animals you buy (at the places the world says: a market, an exotic dealer…), name and keep.
// Each one has hunger and affection that drop every day; feed it and play with it, or it runs away. A happy pet
// lifts your mood each morning; a familiar (RPG) also helps one skill (+bonus on its checks). Up to two at a time.
// Dogs and the like follow you (the AI knows they are there); cats and the like wait at home.
import { nowAbs, type Save } from '../core/store.js';
import { systemOn, type WorldDef, type PetDef } from '../core/world.js';
import { onDay } from './hooks.js';
import { addStatus } from './needs.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { isRpg } from './rpg.js';
import { checkMods } from './hooks.js';
import { placeOf, isHome } from './places.js';

export interface Pet { id: string; kind: string; name: string; hunger: number; love: number; since: number; xp?: number; level?: number; bound?: boolean; fed?: number; played?: number }
export const MAX_PETS = 3;
export const petsOf = (g: Save): Pet[] => ((g as any).pets ??= []);
const on = (w: WorldDef) => systemOn(w, 'pets') && !!w.pets?.length;
export const petDef = (w: WorldDef, kind: string): PetDef | undefined => w.pets?.find(p => p.id === kind);
export const petsAvailable = (w: WorldDef) => (on(w) ? w.pets!.filter(p => (!p.familiar || isRpg(w)) && (!p.mount || systemOn(w, 'mounts'))) : []);
// A mount carries more (more room for goods).
export const mountCarry = (g: Save, w: WorldDef) => petsOf(g).reduce((a, p) => { const d = petDef(w, p.kind); return a + (d?.mount && systemOn(w, 'mounts') ? (d.carry ?? 20) : 0); }, 0);
// Where an animal is sold: places whose id, name or tags match one of its `where` words (default: any shop).
export function soldHere(g: Save, w: WorldDef, p: PetDef): boolean {
    const pl = placeOf(g, w, g.player.loc); if (!pl || isHome(pl.id)) return false;
    const words = p.where?.length ? p.where : ['shop'];
    return words.some(x => pl.id === x || (pl.tags ?? []).includes(x) || pl.name.toLowerCase().includes(x.toLowerCase()));
}
export function buyPet(g: Save, w: WorldDef, kind: string, name: string): string {
    const d = petDef(w, kind); if (!d || !on(w)) return '';
    if (petsOf(g).length >= MAX_PETS) return `You can keep ${MAX_PETS} animals at a time.`;
    if (!soldHere(g, w, d)) return 'Nobody sells that here.';
    if (g.player.money < d.price) return 'Not enough money.';
    const n = name.trim().slice(0, 24) || d.name;
    g.player.money -= d.price; book(g, `${d.name} (${n})`, -d.price);
    petsOf(g).push({ id: `pet${nowAbs(g)}`, kind, name: n, hunger: 80, love: 50, since: g.day, xp: 0, level: 1 });
    note(g, '{u} got a {0} and named it {1}.', [d.name.toLowerCase(), n], [], g.player.loc, 'life');
    return `${n} the ${d.name.toLowerCase()} is yours.`;
}
const FEED_COST = 2;
export function feedPet(g: Save, w: WorldDef, id: string): string {
    const p = petsOf(g).find(x => x.id === id); if (!p) return '';
    if (p.fed === g.day && p.hunger >= 90) return `${p.name} is full.`;
    if (g.player.money < FEED_COST) return 'Not enough money for food.';
    g.player.money -= FEED_COST; book(g, `Food for ${p.name}`, -FEED_COST);
    p.hunger = Math.min(100, p.hunger + 45); p.fed = g.day;
    return `${p.name} eats happily.`;
}
export function playWithPet(g: Save, w: WorldDef, id: string): string {
    const p = petsOf(g).find(x => x.id === id); if (!p) return '';
    if (p.played === g.day) return `You already played with ${p.name} today.`;
    p.love = Math.min(100, p.love + 20); p.played = g.day; p.xp = (p.xp ?? 0) + 5;
    addStatus(g, w, 'mood', 6);
    return `You play with ${p.name}.`;
}
export function releasePet(g: Save, id: string) { (g as any).pets = petsOf(g).filter(p => p.id !== id); }
export const happy = (p: Pet) => p.hunger > 30 && p.love > 30;
export const petWord = (p: Pet) => (p.hunger <= 15 ? 'starving' : p.love <= 15 ? 'sulking' : happy(p) ? (p.love >= 75 ? 'devoted' : 'happy') : 'restless');

// Each day: hungrier, a little lonelier; neglected too long, it runs away. Happy ones cheer you up.
onDay.push((g, w) => {
    if (!on(w)) return [];
    const out: string[] = [];
    for (const p of [...petsOf(g)]) {
        const d = petDef(w, p.kind);
        p.hunger = Math.max(0, p.hunger - 25); p.love = Math.max(0, p.love - 8);
        if (p.hunger === 0 && p.love < 30 && !p.bound) {
            releasePet(g, p.id); note(g, '{0} ran away from {u}.', [p.name], [], g.player.loc, 'life');
            out.push(`${p.name} ran away: it was hungry and lonely.`); continue;
        }
        if (happy(p) && d?.mood) addStatus(g, w, 'mood', d.mood);
    }
    return out;
});
// A familiar's help on checks (RPG): +bonus on its skill while it is happy.
export function petBonus(g: Save, w: WorldDef, skill: string): number {
    if (!on(w)) return 0;
    return petsOf(g).reduce((a, p) => { const d = petDef(w, p.kind); return a + (d?.skill === skill && happy(p) ? (d.bonus ?? 1) + (p.bound ? Math.floor((p.level ?? 1) / 2) : 0) : 0); }, 0);
}
export function petLine(g: Save, w: WorldDef): string {
    if (!on(w)) return '';
    const here = petsOf(g).filter(p => petDef(w, p.kind)?.follows || g.player.loc === 'home:player');
    if (!here.length) return '';
    return here.map(p => `{{user}}'s ${(petDef(w, p.kind)?.name ?? 'pet').toLowerCase()} ${p.name} is here (${petWord(p)})${p.bound ? `, soul-bound to {{user}}` : ''}.`).join(' ');
}
checkMods.push(petBonus);
