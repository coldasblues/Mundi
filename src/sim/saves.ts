// Save slots. A Mundi save is its chat, written as you play (autosave). A slot is a named copy of it, kept as it was:
// loading a slot opens a fresh copy to play in, so the slot is still there the next time things go wrong.
// Each save also gets a small card (day, place, who is dead…) for the Load screen, kept in Mundi's settings
// (the Load screen lists chats without opening them).
import { game, settings, saveSettings, saveGame, toast, TUT, onSaved, type Save } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { ctx, chat, saveMeta, saveName, fileSafe, currentChatId, selectedGroup, copyGroupChat, groupChatId } from '../st/bridge.js';
import { placeName } from './facts.js';
import { snapshotLine } from './roster.js';

export interface SaveCard { name?: string; slot?: boolean; day: number; minutes: number; place: string; line: string; at: number; world: string }
export const cards = (): Record<string, SaveCard> => (((settings() as any).saveCards ??= {}) as Record<string, SaveCard>);
export const cardFor = (chatId: string): SaveCard | undefined => cards()[fileSafe(chatId)];

function cardOf(g: Save): SaveCard {
    const w = getWorld(g.world);
    return { day: g.day, minutes: g.minutes, place: w ? placeName(g, w, g.player.loc) : '', line: snapshotLine(g), at: Date.now(), world: g.world };
}
let lastAuto = 0;
export const lastAutosave = () => lastAuto;
// every time the game is written, its card follows (a little later, once things settle)
let t: any = 0;
onSaved(() => {
    lastAuto = Date.now();
    clearTimeout(t);
    t = setTimeout(() => {
        const g = game(); const id = currentChatId();
        if (!g || TUT.save || !id) return;
        const old = cardFor(id);
        cards()[fileSafe(id)] = { ...cardOf(g), ...(old?.slot ? { slot: true, name: old.name } : {}) };
        saveSettings();
    }, 2500);
});

/** A named save of the game as it is now. You keep playing here. */
export async function saveSlot(name: string): Promise<boolean> {
    const g = game(); const gid = selectedGroup();
    if (!g || !gid || TUT.save) return false;
    const label = fileSafe(name).slice(0, 60) || `Day ${g.day}`;
    saveGame(); await saveMeta();
    const id = `${saveName()} ${label}`;
    const meta = structuredClone(ctx().chatMetadata ?? {});
    meta.mundi_slot = { name: label, at: Date.now() };
    await copyGroupChat(gid, id, meta, structuredClone(chat()));
    cards()[fileSafe(id)] = { ...cardOf(g), slot: true, name: label };
    saveSettings();
    toast(`Saved: “${label}”. Load it from the main menu (Load); the save stays as it is.`, 'success');
    return true;
}

/** Loading a slot: it opens, a copy of it is made to play in, and the copy opens. */
export async function playFromSlot(groupId: string, chatId: string) {
    const { enterGame } = await import('./game.js');
    await enterGame(groupId, chatId, true);
    const g = game(); const name = cardFor(chatId)?.name ?? 'the save';
    if (!g) return;
    const meta = structuredClone(ctx().chatMetadata ?? {});
    delete meta.mundi_slot;
    const id = saveName(` (from ${fileSafe(name).slice(0, 40)})`);
    await copyGroupChat(groupId, id, meta, structuredClone(chat()));
    cards()[fileSafe(id)] = { ...cardOf(g) };
    saveSettings();
    await enterGame(groupId, groupChatId(groupId, id));
    toast(`Loaded “${name}”. You are playing a copy of it, so the save stays as it was.`, 'success', { ms: 6000 });
}
