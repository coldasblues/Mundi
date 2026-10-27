// Events (a date, a meet-up, a party): when it starts, the people join you; a panel on the HUD shows it, with a
// way to end it (they say goodbye and tell you what they thought) and, at a home, to spend the night together.
import { esc, game, notify, saveGame, toast, nowAbs, state, type Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { setPrompt, sendCanned, chat, setAsk } from '../st/bridge.js';
import { social, bondOf, isPartner, isWith } from '../sim/social.js';
import { letGo } from '../sim/plans.js';
import { romOf } from '../sim/romance.js';
import { romanceBlocked, isMinor } from '../sim/family.js';
import { playerHomeId } from '../sim/places.js';
import { note } from '../sim/facts.js';
import { syncScene } from '../sim/game.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';

export interface GameEvent { id: string; avatar: string; kind: string; ending?: boolean; from?: number; title?: string; moodAt?: number }
export interface Stay { avatar: string; where: string; day: number }
export const eventOf = (g: Save): GameEvent | null => ((social(g) as any).event ?? null);
export const stayOf = (g: Save): Stay | null => ((social(g) as any).stay ?? null);
const clearEvent = (g: Save) => { (social(g) as any).event = null; };

// The home of someone (people who live with another person share that person's home).
const homeOf = (g: Save, avatar: string) => { const r: any = g.cast[avatar]; const w = r?.homeWith; return w === '__you' ? playerHomeId : `home:${w && g.cast[w] ? w : avatar}`; };

// Can you two spend the night under the same roof?
export function stayAnswer(g: Save, avatar: string): { ok: boolean; why: string } {
    if (isMinor(g, avatar)) return { ok: false, why: '' };
    if (isPartner(g, avatar) || romOf(g, avatar).status !== 'none') return { ok: true, why: '' };
    if (!romanceBlocked(g, avatar) && romOf(g, avatar).value >= 40) return { ok: true, why: '' };
    if (bondOf(g, avatar) >= 70) return { ok: true, why: '' };
    return { ok: false, why: 'They do not feel close enough to stay the night.' };
}
// Where you could ask: your home (them staying over) or their home (you staying over).
function stayWhere(g: Save, avatar: string): 'mine' | 'theirs' | '' {
    if (g.player.loc === playerHomeId) return 'mine';
    if (g.player.loc === homeOf(g, avatar)) return 'theirs';
    return '';
}
// A button for a person's card: "Ask them to stay the night" / "Ask to sleep at their place".
export function stayButton(avatar: string): string {
    const g = game(); if (!g || isMinor(g, avatar)) return '';
    const where = stayWhere(g, avatar); if (!where) return '';
    const s = stayOf(g);
    if (s && s.avatar === avatar && s.where === g.player.loc) return `<small class="mu-muted">${where === 'mine' ? 'Staying the night with you.' : 'You are staying the night here.'}</small>`;
    return `<button data-act="ev-stay" data-who="${esc(avatar)}">${icon('moon')}<span>${where === 'mine' ? 'Ask them to stay the night' : 'Ask to sleep here tonight'}</span></button>`;
}

export function eventPanelHtml(g: Save, w: WorldDef): string {
    const e = eventOf(g);
    if (!e || state.view !== 'scene') return '';
    const r = g.cast[e.avatar];
    if (!r || !isWith(g, e.avatar)) return '';
    const title = e.kind === 'date' ? `${icon('heart')} Date with` : e.kind === 'party' ? '🎉 Party with' : `${icon('users')} Hanging out with`;
    void w;
    return `<aside class="mh-event mh-glass"><b>${title} <span data-notr>${esc(r.name)}</span></b>${e.title ? `<small class="mh-event-name">${esc(e.title)}</small>` : ''}
        ${e.ending ? '<small class="mu-muted">Saying goodbye…</small>' : `<div class="mh-event-btns">
            <button data-act="ev-end">${icon('x')}<span>End the ${e.kind === 'date' ? 'date' : e.kind === 'party' ? 'party' : 'meet-up'}</span></button>
            ${stayButton(e.avatar)}</div>`}</aside>`;
}

Object.assign(ACT, {
    // they say goodbye in the scene (what they thought of it), then leave
    'ev-end': () => {
        const g = game(); const e = g && eventOf(g); const r = g && e && g.cast[e.avatar];
        if (!g || !e || !r || state.generating) return;
        e.ending = true; e.from = chat().length; saveGame();
        setPrompt('mundi_ask', `[The ${e.kind === 'date' ? 'date' : 'meet-up'}${e.title ? ` ("${e.title}")` : ''} is over. ${r.name} says goodbye to {{user}} and says, in their own way, what they thought of it. Then ${r.name} leaves.]`, 0);
        if (!sendCanned('*it is time to say goodbye*')) { finishEvent(g); }
        notify();
    },
    'ev-stay': (el) => {
        const g = game(); const who = el.dataset.who!; const r = g && g.cast[who];
        if (!g || !r || state.generating) return;
        const where = stayWhere(g, who); if (!where) return;
        const ans = stayAnswer(g, who);
        if (ans.ok) {
            (social(g) as any).stay = { avatar: who, where: g.player.loc, day: g.day } as Stay;
            // they stay with you until the morning
            const s = social(g); const c = s.with.find(x => x.avatar === who);
            const morning = (g.day + 1) * 1440 + 10 * 60;
            if (c) c.until = Math.max(c.until, morning); else s.with.push({ avatar: who, until: morning });
            note(g, where === 'mine' ? '{0} stayed the night at {u}\'s place.' : '{u} stayed the night at {0}\'s place.', [r.name], [who]);
        }
        saveGame();
        setAsk(`[{{user}} asks ${r.name} ${where === 'mine' ? 'to stay the night' : 'to sleep at their place tonight'}. ${ans.ok ? `${r.name} says yes (it is decided), in their own way.` : `${r.name} says no, kindly: ${ans.why}`} Write ${r.name}'s reply.]`);
        sendCanned(where === 'mine' ? `"Do you want to stay the night?"` : `"Can I stay here tonight?"`);
        toast(ans.ok ? `${r.name} is staying the night.` : ans.why, ans.ok ? 'success' : 'info');
        notify();
    },
});

// The goodbye was said (a reply came): they leave.
async function finishEvent(g: Save) {
    const e = eventOf(g); if (!e) return;
    const r = g.cast[e.avatar];
    setPrompt('mundi_ask', '');
    letGo(g, e.avatar);
    if (r) note(g, e.kind === 'date' ? '{u} and {0} ended their date and said goodbye.' : '{u} and {0} said goodbye after spending time together.', [r.name], [e.avatar]);
    const s = stayOf(g); if (s && s.avatar === e.avatar) (social(g) as any).stay = null;
    // the plan is over: they go back to their day
    const a = social(g).appts.find(x => x.id === e.id); if (a) a.to = Math.min(a.to, nowAbs(g));
    clearEvent(g); saveGame(); await syncScene(); notify();
}
// Called when a reply finishes (index.ts).
export function checkEventEnd() {
    const g = game(); const e = g && eventOf(g);
    if (!g || !e?.ending) return;
    const r = g.cast[e.avatar];
    const replied = chat().slice(e.from ?? 0).some((m: any) => !m.is_user && !m.is_system && (!r || String(m.name ?? '').trim() === r.name.trim()));
    if (replied) void finishEvent(g);
}
// An event whose person left (time ran out, you went home without them…) is over.
export function tidyEvent(g: Save) {
    const e = eventOf(g);
    if (e && !e.ending && !isWith(g, e.avatar)) clearEvent(g);
    const s = stayOf(g);
    if (s && s.day < g.day - 1) (social(g) as any).stay = null;
}
