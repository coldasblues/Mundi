// World cards: a world with several maps shows them one after another (the cover first), and its tone next to
// its style. Used by the new game and the world creator.
import { bgOf, madeFor, isScenario, type WorldDef } from '../core/world.js';
import { esc } from '../core/store.js';

// A world with several maps shows them one after another on its card (the cover first); its tone next to its style.
// (a scenario shows its rooms by day instead of its maps)
const slidePics = (w: WorldDef) => [...new Set([w.cover, ...(isScenario(w) ? w.places.filter(p => !p.scenarioOff).map(p => p.bg) : w.maps.map(m => m.image))].filter(Boolean) as string[])];
// The cards show only the world's cover now (no slideshow); kept so the screens can still call it.
export const slidesHtml = (w: WorldDef) => (SLIDES ? slidesOn(w) : '');
const SLIDES = false;
const slidesOn = (w: WorldDef) => { const pics = slidePics(w); if (pics.length > 1) setTimeout(startSlides, 0); return pics.length > 1 ? `<span class="mu-slides" data-slides>${pics.map((p, i) => `<i class="${i ? '' : 'is-on'}" style="${esc(bgOf(w, p))}"></i>`).join('')}</span>` : ''; };
// The ways a world can be played (Life-Sim, RPG), as tags on its card.
export const toneTag = (w: WorldDef) => { const t = madeFor(w); return `<em class="mu-style-tag is-tone is-${t}">${t === 'rpg' ? 'RPG' : 'Life-Sim'}</em>`; };
let slideTimer = 0;
// one timer while any card shows slides; it stops itself when none is on screen
function startSlides() {
    if (slideTimer || typeof window === 'undefined') return;
    slideTimer = window.setInterval(() => {
        const cards = typeof document === 'undefined' ? [] : [...document.querySelectorAll('#mundi-root [data-slides]')];
        if (!cards.length) { clearInterval(slideTimer); slideTimer = 0; return; }
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        cards.forEach(el => { const pics = [...el.children]; const i = pics.findIndex(x => x.classList.contains('is-on')); pics[i]?.classList.remove('is-on'); pics[(i + 1) % pics.length]?.classList.add('is-on'); });
    }, 3500);
}

