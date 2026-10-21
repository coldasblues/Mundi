// The story's people and your saves, from the game menu: "People in your story" (the roster) and "Save…" (a named
// save, kept as it is), with when the game last saved itself.
import { game, notify, esc } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { everyone, rosterPrefs, STATUS_WORD } from '../sim/roster.js';
import { saveSlot, lastAutosave } from '../sim/saves.js';
import { psOn } from '../sim/pstate-live.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
import { personGroupHtml, groupsHtml } from './hostileui.js';
import { setupButton } from './setupui.js';
export const STORY = { people: false, save: false, name: '', saving: false, filter: 'all' };
const ago = (t) => { if (!t)
    return ''; const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'just now' : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
/** The line under "Save…" in the game menu. */
export const autosaveLine = () => (lastAutosave() ? `Saved automatically · ${ago(lastAutosave())}` : 'Saves automatically as you play');
const CHIP = { around: 'is-ok', injured: 'is-warn', left: 'is-muted', captured: 'is-warn', missing: 'is-warn', dead: 'is-bad' };
const when = (p) => (p.first.day ? `Met on day ${p.first.day}${p.first.place ? ` at ${p.first.place}` : ''}` : '') + (p.last.day && (p.last.day !== p.first.day || p.last.place !== p.first.place) ? ` · last seen day ${p.last.day}${p.last.place ? ` at ${p.last.place}` : ''}` : '');
function personRow(g, p) {
    const pic = p.avatar ? `<img src="${esc(thumb(p.avatar))}" alt="">` : `<span class="mu-story-nopic">${icon('user')}</span>`;
    return `<li class="mu-story-p is-${p.status}">${pic}<div><div class="mu-story-head"><b data-notr>${esc(p.name)}</b><span class="mu-story-chip ${CHIP[p.status]}">${esc(STATUS_WORD[p.status])}</span>${p.kind === 'walkon' ? '<small class="mu-muted">from the story</small>' : ''}</div>
        <p>${p.summary ? esc(p.summary) : '<span class="mu-muted">No notes yet. They are written when you leave a place where you spent time with them.</span>'}</p>
        <small class="mu-muted">${esc(when(p))}</small>${personGroupHtml(g, p)}</div></li>`;
}
function peopleHtml(g, w) {
    const all = everyone(g, w);
    const list = STORY.filter === 'gone' ? all.filter(p => p.status === 'dead' || p.status === 'captured' || p.status === 'missing') : all;
    return `<div class="mu-dlg-veil is-fixed" data-act="story-close"></div><div class="mu-panel mu-confirm mu-story" role="dialog" aria-label="People in your story">
        <header class="mu-story-top"><h3>People in your story</h3><button class="mu-ibtn mu-ghost" data-act="story-close" aria-label="Close">${icon('x')}</button></header>
        <div class="mu-chips"><button class="mu-chip ${STORY.filter === 'all' ? 'is-on' : ''}" data-act="story-filter" data-v="all">Everyone · ${all.length}</button><button class="mu-chip ${STORY.filter === 'gone' ? 'is-on' : ''}" data-act="story-filter" data-v="gone">Dead or gone · ${all.length - all.filter(p => !['dead', 'captured', 'missing'].includes(p.status)).length}</button></div>
        ${list.length ? `<ul class="mu-story-list" data-keep="story">${list.map(p => personRow(g, p)).join('')}</ul>` : '<p class="mu-muted">Nobody yet. Everyone you meet, and everyone the story brings in, shows up here.</p>'}
        ${groupsHtml(g, w)}
        ${psOn() ? setupButton() : ''}
        <label class="mu-check"><input type="checkbox" data-input="story-sum" ${rosterPrefs().summaries ? 'checked' : ''}><span>Write notes about them<small>One short AI call each time you leave a place: everyone who was there gets their notes brought up to date. The story keeps them in mind when they are in a scene.</small></span></label>
    </div>`;
}
function saveHtml(g) {
    const w = getWorld(g.world);
    const def = `Day ${g.day}${w ? ` · ${w.places.find(p => p.id === g.player.loc)?.name ?? (g.player.loc === 'home:player' ? 'Home' : '')}` : ''}`;
    return `<div class="mu-dlg-veil is-fixed" data-act="story-save-close"></div><div class="mu-panel mu-confirm mu-story-save" role="dialog" aria-label="Save">
        <h3>Save the game</h3>
        <p class="mu-muted">A named save of everything as it is now. You keep playing; if things go wrong, load it from the main menu (Load). Loading it plays a copy, so it stays as it is. The game also saves itself as you play: ${esc(autosaveLine().toLowerCase())}.</p>
        <label class="mu-field"><span>Name</span><input type="text" data-input="story-name" data-focus="story-name" maxlength="60" placeholder="${esc(def)}" value="${esc(STORY.name)}"></label>
        <div class="mu-row"><button class="mu-primary" data-act="story-save-go" ${STORY.saving ? 'disabled' : ''}>${icon('save')}<span>${STORY.saving ? 'Saving…' : 'Save'}</span></button><button data-act="story-save-close">Cancel</button></div>
    </div>`;
}
export function storyOverlays(g, w) {
    return `${STORY.people && psOn() ? peopleHtml(g, w) : ''}${STORY.save ? saveHtml(g) : ''}`;
}
Object.assign(ACT, {
    'story-open': () => { STORY.people = true; notify(); },
    'story-close': () => { STORY.people = false; notify(); },
    'story-filter': (el) => { STORY.filter = el.dataset.v; notify(); },
    'story-save': () => { STORY.save = true; STORY.name = ''; notify(); },
    'story-save-close': () => { STORY.save = false; notify(); },
    'story-save-go': async () => {
        const g = game();
        if (!g || STORY.saving)
            return;
        const w = getWorld(g.world);
        const name = STORY.name.trim() || `Day ${g.day}${w ? ` · ${w.places.find(p => p.id === g.player.loc)?.name ?? 'Home'}` : ''}`;
        STORY.saving = true;
        notify();
        try {
            if (await saveSlot(name))
                STORY.save = false;
        }
        catch (e) {
            const { toast } = await import('../core/store.js');
            toast(String(e?.message ?? e), 'error');
        }
        STORY.saving = false;
        notify();
    },
});
Object.assign(INPUT, {
    'story-name': (el) => { STORY.name = el.value; },
    'story-sum': (el) => { rosterPrefs().summaries = el.checked; void import('../core/store.js').then(m => m.saveSettings()); },
});
