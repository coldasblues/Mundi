// New game, like The Sims: households (people who share a home, with how they are related), your own household
// (who lives with you), and choosing your home on the map. Everyone left over gets a home of their own at random.
import { state, notify, esc, toast, busy } from '../core/store.js';
import { getWorld, bgOf, num, cssUrl, type WorldDef } from '../core/world.js';
import { characters, thumb, charOf, createCharacter } from '../st/bridge.js';
import { pickFile } from './cropper.js';
import { TIE_TYPES, TIE_TONES, type TieType, type TieTone } from '../sim/living.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

export interface NgTie { a: string; b: string; type: TieType; tone: TieTone }
export interface NgHousehold { members: string[]; ties: NgTie[] }
export interface NgFamily { avatar: string; type: TieType; tone: TieTone }
export interface NgHome { zone: string; x: number; y: number; n: number }

const wz = () => state.wizard as any;
const W = (): WorldDef => getWorld(wz().world)!;
const nm = (a: string) => charOf(a)?.name ?? a;
const hhs = (): NgHousehold[] => (wz().hh ??= []);
export const familyOf = (): NgFamily[] => (wz().family ??= []);
const inHousehold = (a: string) => hhs().some(h => h.members.includes(a)) || familyOf().some(f => f.avatar === a);
const opt = (v: string, l: string, on: boolean) => `<option value="${esc(v)}" ${on ? 'selected' : ''}>${esc(l)}</option>`;
const face = (a: string) => `<img src="${esc(thumb(a))}" alt="" title="${esc(nm(a))}">`;

/* ---------- step: households ---------- */

export function stepHouseholds(): string {
    const z = wz(); const list = hhs(); const sel = Math.min(z.hhSel ?? 0, Math.max(0, list.length - 1));
    const free = (z.cast as string[]).filter(a => !inHousehold(a));
    const h = list[sel];
    return `<h3>Households</h3>
        <p class="mu-muted">A household is people who live in the same home: a family, a couple, roommates. Put together the people who live together and say how they are related. Everyone you leave out gets a home of their own, at random. You can skip this.</p>
        <div class="mu-ngh">
            <aside class="mu-ngh-list">${list.map((x, i) => `<button class="mu-ngh-card ${i === sel ? 'is-on' : ''}" data-act="ngh-sel" data-i="${i}"><b>Household ${i + 1}</b>
                <span class="mu-hh-faces">${x.members.map(face).join('') || '<em>Empty</em>'}</span></button>`).join('')}
                <button class="mu-primary" data-act="ngh-new">${icon('plus')}<span>New household</span></button></aside>
            <section class="mu-ngh-edit">${h ? `
                <header class="mu-row"><h4>Household ${sel + 1}</h4><button class="mu-ghost mu-right" data-act="ngh-del" data-i="${sel}">${icon('trash')}<span>Remove</span></button></header>
                <div class="mu-ngh-members">${h.members.map(a => `<span class="mu-chip is-on">${face(a)}<span data-notr>${esc(nm(a))}</span><button class="mu-ibtn mu-ghost" data-act="ngh-out" data-who="${esc(a)}" title="Take out">${icon('x')}</button></span>`).join('') || '<p class="mu-muted">Click people below to add them.</p>'}</div>
                ${h.members.length >= 2 ? `<h5>How they are related</h5>
                    ${h.ties.map((t, k) => `<div class="mu-ties-add"><span data-notr>${esc(nm(t.a))} is</span><select data-input="ngh-tie" data-k="${k}" data-f="type">${TIE_TYPES.map(([id, l]) => opt(id, l, t.type === id)).join('')}</select>
                        <span data-notr>${esc(nm(t.b))}</span><select data-input="ngh-tie" data-k="${k}" data-f="tone">${TIE_TONES.map(([id, l]) => opt(id, l, t.tone === id)).join('')}</select>
                        <button class="mu-ibtn mu-ghost" data-act="ngh-tie-del" data-k="${k}">${icon('x')}</button></div>`).join('')}
                    <div class="mu-ties-add"><select data-input="ngh-pair" data-f="a">${h.members.map(a => opt(a, nm(a), (h.members.includes(z.hhA) ? z.hhA : h.members[0]) === a)).join('')}</select><span>and</span>
                        <select data-input="ngh-pair" data-f="b">${h.members.map(a => opt(a, nm(a), (h.members.includes(z.hhB) ? z.hhB : h.members[1]) === a)).join('')}</select>
                        <button data-act="ngh-tie-add">${icon('plus')}<span>Add a tie</span></button></div>` : ''}
                <h5>People without a household</h5>
                <div class="mu-chips">${free.map(a => `<button class="mu-chip" data-act="ngh-in" data-who="${esc(a)}">${face(a)}<span data-notr>${esc(nm(a))}</span></button>`).join('') || '<p class="mu-muted">Everyone has a household.</p>'}</div>`
            : '<p class="mu-muted">No households yet: everyone lives alone. Make one with "New household".</p>'}</section></div>`;
}

/* ---------- your household (on the "Your character" step, once you have one) ---------- */

export function yourHouseholdHtml(): string {
    const z = wz(); const fam = familyOf();
    const q = String(z.famQ ?? '').toLowerCase();
    const pool = characters().filter(c => !fam.some(f => f.avatar === c.avatar) && !hhs().some(h => h.members.includes(c.avatar)) && (!q || String(c.name).toLowerCase().includes(q))).slice(0, 40);
    return `<section class="mu-panel mu-ngfam"><h3>Your household</h3>
        <p class="mu-muted">The people who live with you: family, a partner, roommates. They share your home and your wallet, and you can play as any of them later ("Play as").</p>
        ${fam.map((f, k) => `<div class="mu-ties-add">${face(f.avatar)}<b data-notr>${esc(nm(f.avatar))}</b><span>is your</span>
            <select data-input="ngf-set" data-k="${k}" data-f="type">${TIE_TYPES.map(([id, l]) => opt(id, l.replace(/ of$| to$/, ''), f.type === id)).join('')}</select>
            <select data-input="ngf-set" data-k="${k}" data-f="tone">${TIE_TONES.map(([id, l]) => opt(id, l, f.tone === id)).join('')}</select>
            <button class="mu-ibtn mu-ghost" data-act="ngf-del" data-k="${k}">${icon('x')}</button></div>`).join('') || '<p class="mu-muted">You live alone for now.</p>'}
        ${z.famNew ? newCharForm(z.famNew) : z.famOpen ? `<input class="mu-search" type="search" data-input="ngf-q" data-focus="ngfq" placeholder="Search your characters" value="${esc(z.famQ ?? '')}">
            <div class="mu-chips mu-ngfam-pool"><button class="mu-chip mu-ngfam-newchip" data-act="ngf-new">${icon('plus')}<span>Create a new character</span></button>${pool.map(c => `<button class="mu-chip" data-act="ngf-add" data-who="${esc(c.avatar)}">${face(c.avatar)}<span data-notr>${esc(c.name)}</span></button>`).join('') || '<p class="mu-muted">No characters found.</p>'}</div>`
            : `<div class="mu-row mu-ngfam-btns"><button data-act="ngf-open">${icon('plus')}<span>Add someone to your household</span></button><button data-act="ngf-new">${icon('user')}<span>Create a new character</span></button></div>`}
    </section>`;
}

// A new SillyTavern character, made right here, who moves in with you.
interface NewChar { name: string; desc: string; url?: string; blob?: Blob }
function newCharForm(n: NewChar): string {
    return `<div class="mu-ngfam-new">
        <button class="mu-ngfam-pic" data-act="ngf-new-pic" title="Choose a picture" style="${n.url ? esc(`background-image:${cssUrl(n.url)}`) : ''}">${n.url ? '' : `${icon('image')}<small>Picture</small>`}</button>
        <div class="mu-ngfam-newf">
            <input type="text" data-input="ngf-new-f" data-f="name" data-focus="ngfnew-name" maxlength="40" placeholder="Name" value="${esc(n.name)}">
            <textarea rows="3" data-input="ngf-new-f" data-f="desc" data-focus="ngfnew-desc" placeholder="Who they are: looks, personality, what they do (optional)">${esc(n.desc)}</textarea>
            <div class="mu-row"><small class="mu-muted">Saved as a character in your SillyTavern.</small><span class="mu-right mu-row"><button class="mu-ghost" data-act="ngf-new-cancel">Cancel</button><button class="mu-primary" data-act="ngf-new-yes">${icon('plus')}<span>Create and add</span></button></span></div>
        </div></div>`;
}

/* ---------- step: choosing your home ---------- */

export function stepHome(): string {
    const z = wz(); const w = W();
    const maps = w.maps.filter(m => w.homes.zones.some(zn => zn.map === m.id));
    const mapId = maps.some(m => m.id === z.homeMap) ? z.homeMap : maps[0]?.id;
    const m = w.maps.find(x => x.id === mapId);
    const home: NgHome | null = z.home ?? null;
    const zone = home && w.homes.zones.find(zn => zn.id === home.zone);
    return `<h3>Choose your home</h3>
        <p class="mu-muted">Click a home on the map. The others are given to the people of the world after you choose.${familyOf().length ? ' Your household moves in with you.' : ''}</p>
        ${maps.length > 1 ? `<div class="mu-chips">${maps.map(x => `<button class="mu-chip ${x.id === mapId ? 'is-on' : ''}" data-act="ngm-map" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
        ${m ? `<div class="mu-nghome-map" style="${esc(`aspect-ratio:${num(m.ratio, 1.7914)};${bgOf(w, m.image)}`)}">
            ${w.homes.zones.filter(zn => zn.map === m.id).map(zn => zn.spots.map(([x, y], k) => {
                const on = home && home.zone === zn.id && home.x === x && home.y === y;
                return `<button class="mu-nghome-spot ${on ? 'is-on' : ''}" style="left:${num(x)}%;top:${num(y)}%" data-act="ngm-pick" data-zone="${esc(zn.id)}" data-k="${k}" title="${esc(zn.name)} · ${zn.kind === 'house' ? 'House' : 'Apartment'} ${k + 1} · rent ${zn.rent}">${icon('home')}</button>`;
            }).join('')).join('')}</div>` : ''}
        <p class="mu-nghome-pick">${zone && home ? `${icon('home')} <b>${esc(zone.name)}, ${zone.kind === 'house' ? 'House' : 'Apartment'} ${home.n}</b> · ${esc(w.homes.kinds[zone.kind]?.name ?? zone.kind)} · rent ${zone.rent}` : '<span class="mu-muted">No home chosen yet: one is given by your origin.</span>'}</p>`;
}

/* ---------- actions ---------- */

Object.assign(ACT, {
    'ngh-new': () => { hhs().push({ members: [], ties: [] }); wz().hhSel = hhs().length - 1; notify(); },
    'ngh-sel': (el) => { wz().hhSel = Number(el.dataset.i); notify(); },
    'ngh-del': (el) => { hhs().splice(Number(el.dataset.i), 1); wz().hhSel = 0; notify(); },
    'ngh-in': (el) => { const h = hhs()[wz().hhSel ?? 0]; if (h) h.members.push(el.dataset.who!); notify(); },
    'ngh-out': (el) => { const h = hhs()[wz().hhSel ?? 0]; if (!h) return; const a = el.dataset.who!; h.members = h.members.filter(x => x !== a); h.ties = h.ties.filter(t => t.a !== a && t.b !== a); notify(); },
    'ngh-tie-add': () => {
        const z = wz(); const h = hhs()[z.hhSel ?? 0]; if (!h) return;
        const a = z.hhA && h.members.includes(z.hhA) ? z.hhA : h.members[0], b = z.hhB && h.members.includes(z.hhB) ? z.hhB : h.members[1];
        if (!a || !b || a === b) { toast('Choose two different people.', 'info'); return; }
        h.ties = h.ties.filter(t => !((t.a === a && t.b === b) || (t.a === b && t.b === a)));
        h.ties.push({ a, b, type: 'sibling', tone: 'good' }); notify();
    },
    'ngh-tie-del': (el) => { const h = hhs()[wz().hhSel ?? 0]; if (h) h.ties.splice(Number(el.dataset.k), 1); notify(); },
    'ngf-open': () => { wz().famOpen = true; notify(); },
    'ngf-add': (el) => {
        const a = el.dataset.who!; const z = wz();
        familyOf().push({ avatar: a, type: 'sibling', tone: 'good' });
        if (!z.cast.includes(a)) z.cast.push(a);   // they live in this world, of course
        z.famOpen = false; z.famQ = ''; notify();
    },
    'ngf-new': () => { wz().famNew = { name: '', desc: '' }; notify(); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#mundi-root [data-focus="ngfnew-name"]')?.focus()); },
    'ngf-new-cancel': () => { const n = wz().famNew as NewChar | null; if (n?.url) URL.revokeObjectURL(n.url); wz().famNew = null; notify(); },
    'ngf-new-pic': async () => {
        const f = await pickFile(); const n = wz().famNew as NewChar | null; if (!f || !n) return;
        if (n.url) URL.revokeObjectURL(n.url);
        n.blob = f; n.url = URL.createObjectURL(f); notify();
    },
    'ngf-new-yes': async () => {
        const z = wz(); const n = z.famNew as NewChar | null; if (!n) return;
        const name = n.name.trim(); if (!name) { toast('Write a name.', 'warn'); return; }
        let a = '';
        try { a = await busy('Creating', () => createCharacter({ name, description: n.desc.trim() || `${name}.` }, n.blob)); }
        catch (e) { toast(String((e as Error).message ?? e), 'error'); return; }
        if (n.url) URL.revokeObjectURL(n.url);
        familyOf().push({ avatar: a, type: 'sibling', tone: 'good' });
        if (!z.cast.includes(a)) z.cast.push(a);
        z.famNew = null; z.famOpen = false; z.famQ = '';
        toast(`${name} was created and lives with you. Say how you are related.`, 'success'); notify();
    },
    'ngf-del': (el) => { familyOf().splice(Number(el.dataset.k), 1); notify(); },
    'ngm-map': (el) => { wz().homeMap = el.dataset.id; notify(); },
    'ngm-pick': (el) => {
        const zn = W().homes.zones.find(x => x.id === el.dataset.zone); const k = Number(el.dataset.k);
        if (!zn || !zn.spots[k]) return;
        wz().home = { zone: zn.id, x: zn.spots[k][0], y: zn.spots[k][1], n: k + 1 }; notify();
    },
});
Object.assign(INPUT, {
    'ngh-tie': (el) => { const h = hhs()[wz().hhSel ?? 0]; const t = h?.ties[Number(el.dataset.k)]; if (t) (t as any)[el.dataset.f!] = el.value; },
    'ngh-pair': (el) => { wz()[el.dataset.f === 'a' ? 'hhA' : 'hhB'] = el.value; },
    'ngf-set': (el) => { const f = familyOf()[Number(el.dataset.k)]; if (f) (f as any)[el.dataset.f!] = el.value; },
    'ngf-new-f': (el) => { const n = wz().famNew as NewChar | null; if (n) (n as any)[el.dataset.f!] = el.value; },
    'ngf-q': (el) => { wz().famQ = el.value; notify(); },
});
