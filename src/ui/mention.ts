// "@" in the message box: a list of the people in the scene to pick from. A line that names someone with "@" is
// answered by that person (SillyTavern is told who speaks next), so the AI never makes someone else reply.
import { state, game, esc } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { presentAt } from '../sim/people.js';

interface Who { avatar: string; name: string }
const M = { open: false, items: [] as Who[], sel: 0, start: 0, end: 0 };
let box: HTMLDivElement | null = null;

// The people you can name: those in the scene (people you have met show their name).
export function mentionable(): Who[] {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w) return [];
    return presentAt(g, w, g.player.loc).filter(r => r.met).map(r => ({ avatar: r.avatar, name: r.name }));
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Who a line names with "@" (the longest name first, so "@Diana Zambrozuski" wins over "@Diana"), and the line
// without the "@".
export function mentionIn(text: string): { who: Who | null; text: string } {
    const people = mentionable().sort((a, b) => b.name.length - a.name.length);
    for (const p of people) {
        const full = new RegExp(`@${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const first = new RegExp(`@${p.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const re = full.test(text) ? full : first.test(text) ? first : null;
        if (re) return { who: p, text: text.replace(new RegExp(re.source, 'gi'), (m) => m.slice(1)) };
    }
    return { who: null, text };
}

function close() { M.open = false; if (box) box.style.display = 'none'; }
function draw(ta: HTMLTextAreaElement) {
    if (!box) {
        box = document.createElement('div');
        box.id = 'mundi-mention';
        document.body.appendChild(box);
        box.addEventListener('mousedown', (e) => {
            const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]'); if (!b) return;
            e.preventDefault(); M.sel = Number(b.dataset.k); pick(ta);
        });
    }
    if (!M.open || !M.items.length) { close(); return; }
    box.innerHTML = `<small>Who should answer?</small>${M.items.map((p, k) => `<button type="button" data-k="${k}" class="${k === M.sel ? 'is-on' : ''}"><img src="${thumb(p.avatar)}" alt=""><span>${esc(p.name)}</span></button>`).join('')}`;
    const r = ta.getBoundingClientRect();
    box.style.display = 'grid';
    box.style.left = `${Math.round(r.left)}px`;
    box.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`;
    box.style.minWidth = `${Math.min(280, Math.round(r.width))}px`;
}
function pick(ta: HTMLTextAreaElement) {
    const p = M.items[M.sel]; if (!p) return close();
    const v = ta.value;
    const next = `${v.slice(0, M.start)}@${p.name} ${v.slice(M.end)}`;
    ta.value = next; state.composer = next;
    const at = M.start + p.name.length + 2;
    ta.focus(); ta.setSelectionRange(at, at);
    close();
}

// Called on every input in the message box.
export function onComposerInput(ta: HTMLTextAreaElement) {
    const upto = ta.value.slice(0, ta.selectionStart ?? ta.value.length);
    const m = upto.match(/(^|\s)@([^\s@]{0,30})$/u);
    if (!m) { close(); return; }
    const q = norm(m[2]);
    M.items = mentionable().filter(p => !q || norm(p.name).split(/\s+/).some(w => w.startsWith(q)) || norm(p.name).startsWith(q)).slice(0, 8);
    M.start = upto.length - m[2].length - 1; M.end = ta.selectionStart ?? upto.length;
    M.sel = Math.min(M.sel, Math.max(0, M.items.length - 1));
    M.open = M.items.length > 0;
    draw(ta);
}
// Keys while the list is open: ↑ ↓ to move, Enter or Tab to choose, Esc to close. True = the key was used.
export function onComposerKey(ta: HTMLTextAreaElement, e: KeyboardEvent): boolean {
    if (!M.open) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { M.sel = (M.sel + (e.key === 'ArrowDown' ? 1 : M.items.length - 1)) % M.items.length; draw(ta); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { pick(ta); return true; }
    if (e.key === 'Escape') { close(); return true; }
    return false;
}
export const closeMention = close;
