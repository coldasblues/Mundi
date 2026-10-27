// The styles of world: every style has the same parts (needs, a device, jobs, homes, people), dressed for its time.
export const STYLES: { id: string; name: string; ready: boolean; tagline: string; changes: string[]; soon?: string }[] = [
    { id: 'modern', name: 'Modern', ready: true, tagline: 'A city of today.', changes: [
        'Phone: messages, people, jobs, bank and homes apps',
        'Jobs with ranks and promotions (attendant → barista → manager…)',
        'Rent, apartments and houses you can move to',
        'Needs: energy, hunger, thirst, mood and hygiene',
        'Friendships, meet-ups and dating, in person or by text'] },
    { id: 'medieval', name: 'Medieval', ready: !MEDIEVAL_LOCKED, soon: 'Coming in the next update.', tagline: 'Lords, villages and trades. No magic.', changes: [
        'A journal instead of a phone: letters by courier, acquaintances, trade, purse, lodging',
        'Trades with ranks: apprentice → journeyman → master',
        'Gold coins',
        'A cottage, a house or a manor; a kingdom map with towns',
        'Courtship through a matchmaker or in person; a notice board in the square'] },
    { id: 'fantasy', name: 'Fantasy', ready: false, tagline: 'Powers, missions and adventure.', changes: [
        'A power of your world (mana, chakra, ki…) with its own bar and techniques you learn',
        'Ranks in an order, a village or a crew; a mission board ranked D to S',
        'Fights told by the AI: they cost energy and health',
        'Large maps to explore, with places you discover',
        'For worlds of magic, anime and adventure'] },
    { id: 'western', name: 'Western', ready: false, tagline: 'Frontier towns and dusty roads.', changes: [
        'Telegraph and a journal instead of a phone',
        'Jobs: ranch hand, deputy, bounty hunter, saloon',
        'Bounties and a reputation in each town',
        'Travel on horseback between towns',
        'Dollars, saloons and frontier law'] },
    { id: 'cyberpunk', name: 'Cyberpunk', ready: false, tagline: 'Neon, corporations and implants.', changes: [
        'A neural implant instead of a phone: messages, bank, contacts and hacking apps',
        'Corporate ranks, gigs from fixers and street jobs',
        'Implants and augmentations on the character sheet',
        'Credits, debt and capsule apartments',
        'Districts with different levels of danger'] },
];
export const styleName = (id: string) => STYLES.find(s => s.id === id)?.name ?? id;
// A world's own text in the interface language (cards show several worlds at once; only one world's words are active).
import { uiLang } from '../core/i18n.js';
import { MEDIEVAL_LOCKED, type WorldDef } from '../core/world.js';
export const inWorld = (w: WorldDef, s: string) => w.i18n?.[uiLang()]?.[s] ?? s;

// Locked for now: the RPG mode arrives in the next update.
export const LOCKED_NOTE = 'Coming soon.';
