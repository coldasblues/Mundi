// Home: the clock moves with the story. Every message you send is a few minutes; "Let time pass" and sleeping are
// the big jumps. Settings › This save can turn the per-message minutes off.
import { game, saveGame, cfg, toast, state } from '../core/store.js';
import { getWorld, isScenario } from '../core/world.js';
import { advance } from './time.js';

export const REPLY_MINUTES = 5;
export const perMessage = (g: Parameters<typeof cfg>[0]) => cfg(g).perMessage !== false;

export async function homeTick(): Promise<boolean> {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || !isScenario(w) || !perMessage(g) || state.view !== 'scene') return false;
    advance(g, w, REPLY_MINUTES).forEach(m => toast(m, 'warn'));
    const { runPlans } = await import('../ui/plans.js'); runPlans();
    const { syncScene } = await import('./game.js'); await syncScene();
    saveGame();
    return true;
}

/* ---------- the housemates: going out, and a job of your own words with its shift ---------- */

// Home: the people may leave the house (work, errands, nights out: off-screen) or stay in all the time.
export const npcOut = (g: Parameters<typeof cfg>[0]) => cfg(g).npcOut !== false;
export interface HomeJob { name?: string; shift?: string; days?: 'weekdays' | 'all' | 'weekends' }
export const SHIFTS: { id: string; name: string; from?: number; to?: number }[] = [
    { id: '', name: 'Their own routine' },
    { id: 'off', name: 'Stays home (no job)' },
    { id: 'day', name: 'Day · 9:00–17:00', from: 9, to: 17 },
    { id: 'morning', name: 'Morning · 6:00–14:00', from: 6, to: 14 },
    { id: 'afternoon', name: 'Afternoon · 14:00–22:00', from: 14, to: 22 },
    { id: 'night', name: 'Night · 22:00–6:00', from: 22, to: 6 },
];
export const DAYS: [NonNullable<HomeJob['days']>, string][] = [['weekdays', 'Monday to Friday'], ['all', 'Every day'], ['weekends', 'Weekends']];
export const homeJobOf = (r: any): HomeJob => (r?.homeJob ?? {}) as HomeJob;
// At work now (absolute minutes)? A night shift that starts on a work day goes on past midnight.
export function onShift(j: HomeJob, at: number): boolean {
    const s = SHIFTS.find(x => x.id === j.shift); if (!s || s.from === undefined || s.to === undefined) return false;
    const day = Math.floor(at / 1440), h = (at % 1440) / 60;
    const works = (d: number) => { const wd = ((d - 1) % 7 + 7) % 7; const weekend = wd >= 5; return j.days === 'all' ? true : j.days === 'weekends' ? weekend : !weekend; };
    if (s.from < s.to) return works(day) && h >= s.from && h < s.to;
    return (works(day) && h >= s.from) || (works(day - 1) && h < s.to);
}
// For the AI: what each one does, and who is at work right now.
export function homeJobsLine(g: any): string {
    const list = Object.values(g.cast ?? {}).filter((r: any) => r.met && (homeJobOf(r).name || (homeJobOf(r).shift && homeJobOf(r).shift !== 'off')));
    if (!list.length) return '';
    const shift = (j: HomeJob) => SHIFTS.find(s => s.id === j.shift && s.from !== undefined)?.name.split(' · ')[0].toLowerCase();
    return `What the housemates do: ${list.map((r: any) => { const j = homeJobOf(r); const sh = shift(j); return `${r.name}${j.name ? ` works as ${j.name}` : ' works'}${sh ? ` (${sh} shift${j.days === 'all' ? ', every day' : j.days === 'weekends' ? ', weekends' : ''})` : ''}`; }).join('; ')}.`;
}
