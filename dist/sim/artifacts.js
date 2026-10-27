import { systemOn } from '../core/world.js';
import { onDay, onHour, checkMods, afterFight } from './hooks.js';
import { note } from './facts.js';
import { addStatus } from './needs.js';
import { bagOf, addGood, goodDef } from './economy.js';
import { isRpg, sheetOf, rollCheck, checkWon, changeHp } from './rpg.js';
import { placeOf } from './places.js';
import { petsOf, petDef } from './pets.js';
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
/* ---------- crafting ---------- */
export const craftable = (g, w) => {
    if (!systemOn(w, 'crafting'))
        return [];
    const p = placeOf(g, w, g.player.loc);
    return (w.recipes ?? []).filter(r => !r.at?.length || (p && r.at.some(a => p.id === a || (p.tags ?? []).includes(a) || p.name.toLowerCase().includes(a.toLowerCase()) || (a === 'home' && p.id === 'home:player'))));
};
export const haveFor = (g, r) => Object.entries(r.needs).every(([id, n]) => (bagOf(g).items[id] ?? 0) >= n);
export function craft(g, w, id, name = '') {
    const r = craftable(g, w).find(x => x.id === id);
    if (!r)
        return { text: 'You cannot make that here.', ok: false };
    if (!haveFor(g, r))
        return { text: 'You are missing ingredients.', ok: false };
    let won, crit = false, fumble = false;
    if (isRpg(w) && sheetOf(g) && r.skill) {
        const c = rollCheck(g, w, r.skill, r.dc ?? 12);
        won = checkWon(c);
        crit = c.grade === 'critical-success';
        fumble = c.grade === 'critical-fail';
    }
    else {
        const x = Math.random();
        won = x < 0.7;
        fumble = x > 0.97;
    }
    if (!won) {
        for (const [k, n] of Object.entries(r.needs))
            addGood(g, k, -Math.ceil(n / 2));
        if (r.risky && fumble) {
            changeHp(g, w, -8);
            addStatus(g, w, 'life', -10);
            return { text: `It blows up in your face! Half the ingredients are lost, and so is some skin.`, ok: false };
        }
        return { text: 'It did not work. Half the ingredients are wasted.', ok: false };
    }
    for (const [k, n] of Object.entries(r.needs))
        addGood(g, k, -n);
    const n = (r.count ?? 1) * (crit ? 2 : 1);
    if (r.legendary) {
        const title = name.trim().slice(0, 40) || `${goodDef(w, r.makes)?.name ?? 'An artifact'} of ${g.player.home.zone}`;
        (g.artifacts ??= []).push({ id: `art${g.day}`, name: title, base: r.makes, day: g.day });
        addGood(g, r.makes, 1);
        note(g, '{u} forged a legendary artifact: {0}.', [title], [], g.player.loc, 'goal');
        return { text: `You forged ${title}! Its name will be spoken in halls and guilds.`, ok: true };
    }
    addGood(g, r.makes, n);
    return { text: `You made ${n} ${goodDef(w, r.makes)?.name.toLowerCase() ?? r.makes}${crit ? ' (an exceptional batch!)' : ''}.`, ok: true };
}
export const socketsOf = (g) => (g.sockets ??= { weapon: [], armor: [] });
export function setGem(g, w, id) {
    const d = goodDef(w, id);
    if (!d?.socket || !systemOn(w, 'crafting'))
        return '';
    if ((bagOf(g).items[id] ?? 0) < 1)
        return 'You do not have it.';
    const s = socketsOf(g);
    const slot = s[d.socket.slot];
    if (slot.length >= 2)
        return `Your ${d.socket.slot} has no free socket.`;
    slot.push(id);
    addGood(g, id, -1);
    return `You set the ${d.name.toLowerCase()} into your ${d.socket.slot}.`;
}
export function unsetGems(g, w, slot) { const s = socketsOf(g); for (const id of s[slot])
    addGood(g, id, 1); s[slot] = []; void w; return `You pry the gems out of your ${slot}.`; }
export function gemBonus(g, w, kind) {
    if (!systemOn(w, 'crafting'))
        return 0;
    const s = socketsOf(g);
    return [...s.weapon, ...s.armor].reduce((a, id) => { const d = goodDef(w, id); return a + (d?.socket?.kind === kind ? d.socket.amount : 0); }, 0);
}
export const trophiesOf = (g) => (g.trophies ??= []);
afterFight.push((g, w, c) => {
    if (!systemOn(w, 'trophies') || c.over !== 'won')
        return [];
    const bosses = c.list.filter((f) => f.side === 'them' && (f.tags ?? []).includes('boss'));
    const out = [];
    for (const b of bosses) {
        const foe = w.rpg?.bestiary?.find(x => x.id === b.ref);
        trophiesOf(g).push({ name: `${b.name.replace(/ \d+$/, '')}'s ${foe?.tags?.includes('wild') ? 'head' : 'banner'}`, icon: foe?.icon ?? '🏆', day: g.day });
        out.push(`A trophy for your home: ${b.name}.`);
    }
    return out;
});
onDay.push((g, w) => { if (systemOn(w, 'trophies') && trophiesOf(g).length)
    addStatus(g, w, 'mood', Math.min(5, trophiesOf(g).length)); return []; });
checkMods.push((g, w, skill) => (systemOn(w, 'trophies') && skill === 'intimidation' ? Math.min(3, trophiesOf(g).length) : 0));
export const bladeOf = (g) => g.blade ?? null;
export const bladeDef = (w, id) => w.blades?.find(b => b.id === id) ?? null;
export function gainBlade(g, w, id) {
    if (!systemOn(w, 'sentient') || !w.blades?.length)
        return '';
    const d = (id && bladeDef(w, id)) || w.blades[Math.floor(H(`${g.world}|${g.day}|blade`) * w.blades.length)];
    g.blade = { id: d.id, name: d.name, approval: 50, xp: 0, level: 1 };
    note(g, '{u} found a weapon with a will of its own: {0}.', [d.name], [], g.player.loc, 'goal');
    return `${d.name} is yours — and it has opinions.`;
}
export function pleaseBlade(g, w, what, n) {
    const b = bladeOf(g);
    const d = b && bladeDef(w, b.id);
    if (!b || !d || !systemOn(w, 'sentient'))
        return;
    b.approval = Math.max(0, Math.min(100, b.approval + (d.likes === what ? n : -Math.ceil(n / 3))));
}
export function bladeBonus(g, w) {
    const b = bladeOf(g);
    const d = b && bladeDef(w, b.id);
    if (!b || !d || !systemOn(w, 'sentient'))
        return 0;
    return (b.approval >= 60 ? d.bonus : b.approval < 25 ? -1 : 0) + (b.bound ? Math.floor(b.level / 3) : 0);
}
afterFight.push((g, w, c) => { if (c.over === 'won') {
    pleaseBlade(g, w, 'fights', 6);
    const b = bladeOf(g);
    if (b?.bound)
        bondXp(g, w, 'blade', 20);
}
else if (c.over === 'fled')
    pleaseBlade(g, w, 'mercy', 3); return []; });
export const bondOf = (g) => g.soulbond ?? null;
export function bindSoul(g, w, kind, id) {
    if (!systemOn(w, 'soulbound'))
        return '';
    if (bondOf(g))
        return 'Your soul is already bound.';
    if (kind === 'pet') {
        const p = petsOf(g).find(x => x.id === id);
        if (!p)
            return '';
        if (p.love < 75)
            return `${p.name} must trust you completely first (affection 75+).`;
        p.bound = true;
        p.level ??= 1;
        p.xp ??= 0;
    }
    else {
        const b = bladeOf(g);
        if (!b)
            return '';
        if (b.approval < 75)
            return `${b.name} does not yet accept you (approval 75+).`;
        b.bound = true;
    }
    g.soulbond = { kind, id };
    note(g, '{u} bound their soul to {0}.', [kind === 'pet' ? petsOf(g).find(x => x.id === id).name : bladeOf(g).name], [], g.player.loc, 'goal');
    return 'Your souls are bound. You will grow together.';
}
export const AWAKEN = [3, 6, 10];
export function bondXp(g, w, kind, n) {
    const t = bondOf(g);
    if (!t || t.kind !== kind || !systemOn(w, 'soulbound'))
        return [];
    const e = kind === 'pet' ? petsOf(g).find(x => x.id === t.id) : bladeOf(g);
    if (!e)
        return [];
    e.xp = (e.xp ?? 0) + n;
    const out = [];
    while (e.xp >= (e.level ?? 1) * 60) {
        e.xp -= (e.level ?? 1) * 60;
        e.level = (e.level ?? 1) + 1;
        out.push(`${e.name} grew stronger (level ${e.level})${AWAKEN.includes(e.level) ? ': it awakens to a new form!' : ''}.`);
        if (AWAKEN.includes(e.level))
            note(g, '{0} awakened to a new form.', [e.name], [], g.player.loc, 'goal');
    }
    return out;
}
afterFight.push((g, w, c) => (c.over === 'won' ? bondXp(g, w, 'pet', 15) : []));
// A soul-bound familiar of level 3+ fights at your side (as a creature of its kind).
export function familiarFighter(g, w) {
    const t = bondOf(g);
    if (!t || t.kind !== 'pet' || !systemOn(w, 'soulbound'))
        return null;
    const p = petsOf(g).find(x => x.id === t.id);
    const d = p && petDef(w, p.kind);
    if (!p || !d || (p.level ?? 1) < 3 || d.mount)
        return null;
    const lvl = p.level ?? 3;
    return { name: p.name, icon: d.icon, hp: 8 + lvl * 4, atk: 2 + Math.floor(lvl / 2), dmg: Math.floor(lvl / 3), level: lvl, ref: p.id };
}
export function artifactLines(g, w) {
    const out = [];
    const b = bladeOf(g);
    const d = b && bladeDef(w, b.id);
    if (b && d && systemOn(w, 'sentient'))
        out.push(`{{user}} carries ${d.name}, a sentient weapon (${d.personality}); it is ${b.approval >= 60 ? 'pleased with {{user}}' : b.approval < 25 ? 'sulking and resentful' : 'watchful'}${b.bound && b.level >= 6 ? ' and whispers tactical advice in battle' : ''}. It may speak up in the scene, in its own voice.`);
    if (trophiesOf(g).length && systemOn(w, 'trophies') && g.player.loc === 'home:player')
        out.push(`Trophies on {{user}}'s walls: ${trophiesOf(g).slice(-5).map(t => t.name).join(', ')}.`);
    const arts = g.artifacts;
    if (arts?.length)
        out.push(`{{user}} forged ${arts.map(a => a.name).join(', ')}: their names are known in halls and guilds.`);
    return out;
}
// A relic with a will (a good of the kind 'sentient', won at an auction or found): once in your hands it wakes.
onHour.push((g, w) => {
    if (!systemOn(w, 'sentient') || bladeOf(g))
        return [];
    const id = Object.keys(bagOf(g).items).find(k => (bagOf(g).items[k] ?? 0) > 0 && goodDef(w, k)?.kind === 'sentient');
    if (!id)
        return [];
    addGood(g, id, -1);
    const m = gainBlade(g, w);
    return m ? [m] : [];
});
