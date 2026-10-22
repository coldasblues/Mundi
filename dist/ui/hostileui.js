// Hostile actions on screen: the red "Rough stuff" button and menu in a scene (pick someone, pick what to do, see the
// odds and who might see it), giving yourself up to the law, your captives, and the law and groups of this story.
// A hard capture moves you to your captor's home from here too.
import { game, state, notify, toast, esc, saveGame, saveSettings, nowAbs } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { thumb, personaName, charOf } from '../st/bridge.js';
import { hxOn, hxPrefs, hs, lawOf, peopleHere, optionsFor, cannotAct, resolveAct, captives, letGo, surrender, lawHolding, openCrimes, knownCrimes, crowdHere, CROWD_WORD, pushDirective, armAct, hardCapture, arrivedCaptive, flushEvents, groupOf, newLead, takePrisoner, followLeader, rolesOf, canTakeIn, takeIn, turnInOf, turnIn, actsOf, } from '../sim/hostile.js';
import { CRIME_WORD, SEVERITY, worst } from '../sim/hostile-rules.js';
import { ROLES, CODES } from '../sim/judge.js';
import { money as moneyText } from '../sim/needs.js';
import { setupButton } from './setupui.js';
import { currentState, psHooks } from '../sim/pstate-live.js';
import { placeOf, playerHomeId, travelMinutes } from '../sim/places.js';
import { keyFor } from '../sim/roster.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
const freshLaw = () => ({ name: '', about: '', allows: ['grab', 'restrain'], who: '', counts: 'legal', consent: false, handTo: '', reward: '', objectors: '', note: '' });
export const HX = { open: false, target: '', surrender: false, lawOpen: false, newGroup: '', lead: null, item: '', law: freshLaw(), lawsOpen: false };
const ctxW = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
// the engine's reasons, said to you ("{{user}} is the law" → "You are the law")
const youSay = (t) => { const x = t.replace(/\{\{user\}\} is/g, 'you are').replace(/\{\{user\}\}/g, 'you'); return x.charAt(0).toUpperCase() + x.slice(1); };
const who = (p) => (p.kind === 'cast' && !p.met ? 'Someone' : p.name);
/* ---------- the button (in "Things to do") ---------- */
export function hostileButton(g, w) {
    if (!hxOn() || state.view !== 'scene')
        return '';
    void g;
    void w;
    return `<button class="mh-acts-head mh-glass mh-hx-btn ${HX.open ? 'is-on' : ''}" data-act="hx-open" title="Hurt, threaten, steal, grab…">${icon('flame')}<span>Rough stuff</span></button>`;
}
/** A small badge on someone's face in the Here row: tied up, in your grip, knocked out. */
export function hxBadge(g, key) {
    if (!hxOn())
        return '';
    const st = hs(g);
    const c = st.captives[key];
    const d = st.down[key];
    if (c)
        return `<i class="mh-hx-badge" title="${c.how === 'restrained' ? 'Tied up' : 'In your grip'}">${c.how === 'restrained' ? '⛓️' : '✊'}</i>`;
    if (d && d.until > nowAbs(g) && d.loc === g.player.loc)
        return `<i class="mh-hx-badge" title="${d.how === 'out' ? 'Knocked out' : 'On the ground'}">${d.how === 'out' ? '💤' : '⤵'}</i>`;
    return '';
}
/* ---------- the menu ---------- */
function situation(g, w, here) {
    const law = lawOf(g, w);
    const cops = here.filter(x => x.law && !x.down && !x.captive);
    const p = placeOf(g, w, g.player.loc);
    const crowd = crowdHere(g, w);
    const wanted = openCrimes(g).filter(i => i.state === 'wanted' || i.lawSaw);
    const chips = [
        `<span class="mu-hx-sit">${icon('users')}${esc(p?.home ? (g.player.loc === playerHomeId ? 'Your home' : 'A home') : p?.name ?? '')}: ${esc(CROWD_WORD[crowd])}</span>`,
        !law.exists ? `<span class="mu-hx-sit">${icon('globe')}No law in this story</span>`
            : cops.length ? `<span class="mu-hx-sit is-bad">${icon('hand')}${esc(cops.map(who).join(', '))} ${cops.length > 1 ? 'are' : 'is'} right here</span>`
                : `<span class="mu-hx-sit">${icon('pin')}${esc(law.name.charAt(0).toUpperCase() + law.name.slice(1))} can be called</span>`,
        wanted.length ? `<span class="mu-hx-sit is-bad">${icon('lock')}Wanted for ${esc([...new Set(wanted.map(i => CRIME_WORD[i.crime]))].join(', '))}</span>` : '',
    ];
    return `<div class="mu-hx-sits">${chips.filter(Boolean).join('')}</div>`;
}
function personChip(p) {
    const pic = p.avatar ? `<img src="${esc(thumb(p.avatar))}" alt="">` : `<span class="mh-walkon-pic">${icon('user')}</span>`;
    const tags = [p.law ? 'law' : '', p.captive === 'restrained' ? 'tied up' : p.captive ? 'in your grip' : '', p.down === 'out' ? 'knocked out' : p.down ? 'on the ground' : '', p.group ?? ''].filter(Boolean);
    return `<button class="mu-hx-who ${HX.target === p.key ? 'is-on' : ''}" data-act="hx-target" data-v="${esc(p.key)}">${pic}<b data-notr>${esc(who(p))}</b>${tags.length ? `<small>${esc(tags.join(' · '))}</small>` : ''}</button>`;
}
function menuHtml(g, w) {
    const here = peopleHere(g, w);
    if (HX.target && !here.some(x => x.key === HX.target))
        HX.target = '';
    if (!HX.target && here.length === 1)
        HX.target = here[0].key;
    const no = cannotAct(g);
    const opts = optionsFor(g, w, HX.target);
    const law = lawOf(g, w);
    // the verdict, before you choose: an arrest, self-defense, a crime (and how bad), a code at risk
    const verdictTag = (o) => {
        const v = o.verdict;
        const main = v.kind === 'crime' ? `<em class="mu-hx-crime ${SEVERITY[v.crime] >= SEVERITY.kidnapping ? 'is-felony' : ''}">${esc(v.label)}</em>` : v.label ? `<em class="mu-hx-crime is-ok">${esc(v.label)}</em>` : '';
        const codes = v.codes.map(id => `<em class="mu-hx-crime is-code" title="Breaks ${esc(CODES.find(c => c.id === id)?.name ?? id)} if someone outside it sees">${esc((CODES.find(c => c.id === id)?.name ?? id).replace(/^the /, ''))}</em>`).join('');
        return main + codes;
    };
    const caps = captives(g);
    return `<div class="mu-dlg-veil is-fixed" data-act="hx-close"></div><div class="mu-panel mu-confirm mu-hx" role="dialog" aria-label="Rough stuff">
        <header class="mu-hx-top"><h3>${icon('flame')}<span>Rough stuff</span></h3><button class="mu-ibtn mu-ghost" data-act="hx-close" aria-label="Close">${icon('x')}</button></header>
        ${situation(g, w, here)}
        ${no ? `<p class="mu-hx-no">${esc(no)}</p>` : ''}
        <h4>Who</h4>
        ${here.length ? `<div class="mu-hx-whos">${here.map(personChip).join('')}</div>` : '<p class="mu-muted">Nobody here. You can still make a scene.</p>'}
        <h4>What</h4>
        <div class="mu-hx-acts">${opts.map(o => {
        const off = !!no || !!o.blocked || state.generating;
        return `<button class="mu-hx-act" data-act="hx-do" data-v="${esc(o.def.id)}" ${off ? 'aria-disabled="true"' : ''} title="${esc(o.blocked || o.def.desc)}">
                <i>${o.def.icon}</i><b>${esc(o.def.name)}</b><small>${o.def.dc ? `🎲 ${o.chance}%` : 'no roll'}${verdictTag(o)}</small></button>`;
    }).join('')}</div>
        ${opts.some(o => o.def.id === 'take') ? `<label class="mu-hx-item"><span>Take what?</span><input type="text" data-input="hx-item" maxlength="60" placeholder="something (a blood bag, a bottle, the cash box…)" value="${esc(HX.item)}"></label>` : ''}
        ${opts.find(o => o.verdict.why && o.verdict.kind !== 'crime') ? `<p class="mu-muted mu-hx-desc">${esc(youSay(opts.find(o => o.verdict.why && o.verdict.kind !== 'crime').verdict.why))}.</p>` : HX.target ? '<p class="mu-muted mu-hx-desc">Hover an action to see what it does.</p>' : ''}
        ${caps.length ? `<h4>With you</h4><ul class="mu-hx-caps">${caps.map(c => `<li><b data-notr>${esc(c.name)}</b><small>${c.custody ? 'under arrest' : c.how === 'restrained' ? 'tied up' : 'in your grip: they may slip away'}</small><span class="mu-row">${turnInOf(g, w, c.key) ? `<button class="mu-primary" data-act="hx-turnin" data-v="${esc(c.key)}">Turn in to ${esc(turnInOf(g, w, c.key).handTo)}${turnInOf(g, w, c.key).reward ? ` · +${esc(moneyText(w, turnInOf(g, w, c.key).reward))}` : ''}</button>` : ''}${canTakeIn(g, w, c.key) ? `<button class="mu-primary" data-act="hx-takein" data-v="${esc(c.key)}">Take them in</button>` : ''}<button data-act="hx-letgo" data-v="${esc(c.key)}">Let go</button></span></li>`).join('')}</ul>` : ''}
        <details class="mu-hx-law" ${HX.lawOpen ? 'open' : ''}><summary data-act="hx-law-toggle">You: <b>${esc(rolesOf(g, w).map(r => ROLES.find(x => x.id === r)?.name ?? r).join(', '))}</b> · Law in this story: <b>${law.exists ? esc(law.name) : 'none'}</b></summary>
            <div class="mu-hx-roles"><span>Who you are</span>${ROLES.map(r => `<label class="mu-check"><input type="checkbox" data-input="hx-role" data-v="${r.id}" ${rolesOf(g, w).includes(r.id) ? 'checked' : ''}><span>${esc(r.name)}<small>${esc(r.desc)}</small></span></label>`).join('')}</div>
            <label class="mu-field"><span>In your own words (for the story)</span><input type="text" data-input="hx-roletext" maxlength="120" placeholder="a detective of the 9th precinct, a Toreador of the Camarilla…" value="${esc(hs(g).roleText)}"></label>
            <label class="mu-field"><span>Is there law?</span><select data-input="hx-law-mode">${[['auto', `As the world says (${lawOf(g, w, true).exists ? 'yes' : 'no'})`], ['on', 'Yes: crimes get reported, and they come'], ['off', 'No law (a zombie apocalypse, the wilderness…)']].map(([v, l]) => `<option value="${v}" ${hs(g).law.mode === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="mu-field"><span>Called</span><input type="text" data-input="hx-law-name" maxlength="40" placeholder="${esc(lawOf(g, w, true).name)}" value="${esc(hs(g).law.name ?? '')}"></label>
            ${lawsHtml(g, w)}
            ${setupButton('Set up laws, groups and people from the lore…')}
            <small class="mu-muted">Who belongs to which group (a gang, a faction, the law), and what each person is, are set in ☰ → People in your story. A group you wrong holds a grudge and comes for you, law or no law.</small>
        </details>
    </div>`;
}
/* ---------- the story's laws ---------- */
const csvList = (t) => String(t ?? '').split(',').map(x => x.trim()).filter(Boolean);
function lawLine(w, l) {
    const acts = l.allows.map(a => actsOf(w).find(d => d.id === a)?.name.toLowerCase() ?? a).join(', ');
    return `${l.who.length ? l.who.join(' or ') : 'Anyone'} may ${acts} ${l.about.join(' or ')}${l.handTo ? `, and hand them to ${l.handTo}${l.reward ? ` (+${moneyText(w, l.reward)})` : ''}` : ''}${l.consent ? ', if they agree' : ''}${l.counts === 'minor' ? ' (a minor offense)' : ''}.`;
}
function lawsHtml(g, w) {
    const own = hs(g).laws, world = (w.laws ?? []);
    const d = HX.law;
    const acts = actsOf(w, g).filter(a => a.target);
    return `<div class="mu-hx-laws"><span>Laws of this story</span>
        ${[...world.map(l => ({ l, mine: false })), ...own.map(l => ({ l, mine: true }))].map(({ l, mine }) => `<div class="mu-hx-lawrow"><b>${esc(l.name)}</b><small>${esc(lawLine(w, l))}${l.objectors?.length ? ` ${esc(l.objectors.join(', '))} disapprove.` : ''}</small>${mine ? `<button class="mu-ghost mu-ibtn" data-act="hx-law-del" data-id="${esc(l.id)}" title="Remove this law">${icon('trash')}</button>` : '<em>the world\'s</em>'}</div>`).join('') || '<small class="mu-muted">None: the ordinary law applies to everyone.</small>'}
        <details ${HX.lawsOpen ? 'open' : ''}><summary data-act="hx-laws-toggle">Add a law</summary><div class="mu-hx-lawform">
            <label class="mu-field"><span>Name</span><input type="text" data-input="hx-ld" data-k="name" maxlength="60" placeholder="the K4 control order, the bounty on outlaws…" value="${esc(d.name)}"></label>
            <label class="mu-field"><span>About (what they are, separated by commas)</span><input type="text" data-input="hx-ld" data-k="about" maxlength="120" placeholder="mouse, mice" value="${esc(d.about)}"></label>
            <div class="mu-hx-lawacts"><span>Allows</span>${acts.map(a => `<label><input type="checkbox" data-input="hx-ld-act" data-v="${a.id}" ${d.allows.includes(a.id) ? 'checked' : ''}>${esc(a.name)}</label>`).join('')}</div>
            <label class="mu-field"><span>Who may (empty: anyone; or "law", or words from who you are)</span><input type="text" data-input="hx-ld" data-k="who" maxlength="80" placeholder="anyone" value="${esc(d.who)}"></label>
            <div class="mu-row2"><label class="mu-field"><span>It counts as</span><select data-input="hx-ld" data-k="counts"><option value="legal" ${d.counts === 'legal' ? 'selected' : ''}>Legal</option><option value="minor" ${d.counts === 'minor' ? 'selected' : ''}>A minor offense</option></select></label>
                <label class="mu-field"><span>Hand them over to</span><input type="text" data-input="hx-ld" data-k="handTo" maxlength="60" placeholder="Animal Control" value="${esc(d.handTo)}"></label>
                <label class="mu-field"><span>Reward</span><input type="number" min="0" data-input="hx-ld" data-k="reward" value="${esc(d.reward)}"></label></div>
            <label class="mu-check"><input type="checkbox" data-input="hx-ld-consent" ${d.consent ? 'checked' : ''}><span>Only if they agree<small>Someone who trusts you, or your partner. Otherwise the law doesn't cover it.</small></span></label>
            <label class="mu-field"><span>Who disapproves (they won't report it, but they remember)</span><input type="text" data-input="hx-ld" data-k="objectors" maxlength="120" placeholder="kemonomimi, cat, fox" value="${esc(d.objectors)}"></label>
            <label class="mu-field"><span>Note for the story</span><input type="text" data-input="hx-ld" data-k="note" maxlength="160" placeholder="Mouse kemonomimi breed fast; the state pays per head." value="${esc(d.note)}"></label>
            <button class="mu-primary" data-act="hx-law-add">Add the law</button></div></details></div>`;
}
/* ---------- giving yourself up ---------- */
function surrenderChip(g, w) {
    if (state.view !== 'scene')
        return '';
    const cop = lawHolding(g, w);
    if (!cop)
        return '';
    return `<div class="mh-hx-arrest mh-glass">${icon('lock')}<span><b>${esc(cop)}</b> is arresting you</span><button data-act="hx-surrender">Give yourself up</button></div>`;
}
function surrenderHtml(g, w) {
    const crime = worst(knownCrimes(g).map(i => i.crime));
    const law = lawOf(g, w);
    const what = SEVERITY[crime] >= SEVERITY.kidnapping ? `It's ${CRIME_WORD[crime]}: you'll be taken away, and <b>your story ends here</b>.`
        : SEVERITY[crime] >= SEVERITY.theft ? `For ${CRIME_WORD[crime]}, you'll spend the night in a cell and pay a fine. You're out in the morning.`
            : crime === 'none' ? 'They have nothing on you: they let you go with a warning.' : 'For causing a disturbance, you pay a fine and go.';
    return `<div class="mu-dlg-veil is-fixed" data-act="hx-surrender-no"></div><div class="mu-panel mu-confirm" role="dialog"><h3>Give yourself up to ${esc(law.name)}?</h3>
        <p>${what}</p><p class="mu-muted">Or stay and talk, or open the map to try to get away (a roll).</p>
        <div class="mu-row"><button class="mu-danger" data-act="hx-surrender-go">Give yourself up</button><button data-act="hx-surrender-no">Not yet</button></div></div>`;
}
export function hostileOverlays(g, w) {
    if (!hxOn())
        return '';
    return `${surrenderChip(g, w)}${leadCardHtml(g, w)}${HX.open && state.view === 'scene' ? menuHtml(g, w) : ''}${HX.surrender ? surrenderHtml(g, w) : ''}`;
}
/* ---------- doing it ---------- */
async function runAct(id) {
    const c = ctxW();
    if (!c)
        return;
    const { g, w } = c;
    if (state.generating) {
        toast('Wait until they finish.', 'info');
        return;
    }
    const r = resolveAct(g, w, id, HX.target, HX.item);
    if (typeof r === 'string') {
        toast(r, 'warn');
        return;
    }
    HX.open = false;
    pushDirective(r.directive);
    armAct({ hx: id, ...r.act });
    toast(r.summary, r.decided.ok ? 'success' : 'warn', { ms: 8000 });
    const { syncScene } = await import('../sim/game.js');
    await syncScene(); // someone died, ran off, is in your grip: the scene changes now
    notify();
    const { sendSceneLine } = await import('./scene.js');
    await sendSceneLine(r.line);
}
// after giving yourself up for a theft or an assault: the reply tells the arrest, then the night in a cell passes
let jailPending = null;
async function giveUp() {
    const c = ctxW();
    if (!c)
        return;
    const { g, w } = c;
    HX.surrender = false;
    const r = surrender(g, w);
    pushDirective(r.directive);
    armAct(r.act);
    if (r.jail)
        jailPending = { fine: r.fine, crime: CRIME_WORD[r.crime] };
    else if (r.fine)
        toast(`You pay a fine of ${(await import('../sim/needs.js')).money(w, r.fine)}.`, 'info');
    notify();
    const { sendSceneLine } = await import('./scene.js');
    await sendSceneLine(r.line);
}
async function nightInJail() {
    const c = ctxW();
    const j = jailPending;
    jailPending = null;
    if (!c || !j)
        return;
    const { g, w } = c;
    await idle();
    // the scene of the arrest closes; the night passes in a cell; in the morning you walk out and go home
    const { endVisit } = await import('../sim/visits.js');
    await endVisit(g, w);
    const { advance } = await import('../sim/time.js');
    const until = 8 * 60;
    const mins = g.minutes < until ? until - g.minutes : 1440 - g.minutes + until;
    g.asleep = true;
    advance(g, w, mins).forEach(m => toast(m, 'warn'));
    g.asleep = false;
    g.player.loc = playerHomeId;
    const { syncScene } = await import('../sim/game.js');
    await syncScene();
    state.view = 'scene';
    const { money } = await import('../sim/needs.js');
    const { showTransition } = await import('./lifeui.js');
    showTransition('A night in a cell', `Released in the morning${j.fine ? ` · fine ${money(w, j.fine)}` : ''}`, 'night');
    saveGame();
    notify();
}
/* ---------- being taken somewhere: as a prisoner (no choice), or asked to come along ---------- */
let moving = false;
const idle = async () => { for (let i = 0; i < 120 && state.generating; i++)
    await new Promise(r => setTimeout(r, 500)); };
const whereWord = (g, w, l) => {
    const p = placeOf(g, w, l.to);
    if (!p)
        return l.text;
    return l.to === playerHomeId ? 'your home' : p.home ? (l.avatar && l.to === `home:${l.avatar}` ? `${l.name.split(' ')[0]}'s place` : p.name) : p.name;
};
/** Moves you along with whoever has you (or whoever you chose to follow). */
async function goAlong(l, forced) {
    const c = ctxW();
    if (!c)
        return;
    const { g, w } = c;
    const how = currentState(g).mobility;
    if (forced)
        takePrisoner(g, l);
    else
        followLeader(g, l);
    if (l.to && l.to !== g.player.loc) {
        toast(forced ? `${l.name} takes you to ${whereWord(g, w, l)}.` : `You go with ${l.name} to ${whereWord(g, w, l)}.`, forced ? 'warn' : 'info', { ms: 6000 });
        const { travelTo } = await import('./map.js');
        await travelTo(l.to, { force: true });
        ACT['elev-skip']?.(document.body, new Event('click')); // nobody picks the floor on the way
        if (forced)
            arrivedCaptive(g, w, l, how === 'free' || how === 'engaged' ? 'restrained' : how, true);
        else
            pushDirective(`[{{user}} went with ${l.name} to ${placeOf(g, w, l.to)?.name ?? l.text}. ${l.name} is here with {{user}}; go on with the scene.]`);
    }
    else if (forced)
        arrivedCaptive(g, w, l, how === 'free' || how === 'engaged' ? 'restrained' : how, false);
    await flushEvents();
    const { syncScene } = await import('../sim/game.js');
    await syncScene();
    state.view = 'scene';
    notify();
}
async function checkMoves() {
    const c = ctxW();
    if (!c || moving)
        return;
    const { g, w } = c;
    if (jailPending && currentState(g).mobility === 'restrained') {
        void nightInJail();
        return;
    }
    moving = true;
    try {
        await idle(); // once everyone has spoken
        const lead = newLead(g, w);
        if (lead) {
            if (lead.forced) {
                if (!lead.to)
                    toast(`${lead.name} is taking you somewhere the map doesn't have (${lead.text}): you stay here for now.`, 'info', { ms: 7000 });
                await goAlong(lead, true);
            }
            else if (!lead.to)
                toast(`${lead.name} wants you to come along to ${lead.text}, but that isn't a place on the map.`, 'info', { ms: 7000 });
            else if (lead.to !== g.player.loc) {
                HX.lead = lead;
                notify();
            }
            return;
        }
        const cap = hardCapture(g, w); // taken prisoner, nowhere said: to their home (or kept here)
        if (cap)
            await goAlong(cap, true);
    }
    finally {
        moving = false;
    }
}
psHooks.replied.push(() => { void checkMoves(); });
/** "Bianca wants you to come with her to the Waterfront." */
function leadCardHtml(g, w) {
    const l = HX.lead;
    if (!l || state.view !== 'scene')
        return '';
    const p = l.avatar ? `<img src="${esc(thumb(l.avatar))}" alt="">` : `<span class="mh-walkon-pic">${icon('user')}</span>`;
    const mins = l.to ? ` · ${travelMinutes(g, w, g.player.loc, l.to)} min away` : '';
    return `<div class="mh-hx-lead mh-glass" role="dialog">${p}<div><b data-notr>${esc(l.name)}</b><span>wants you to come along to <b>${esc(whereWord(g, w, l))}</b>${esc(mins)}</span></div>
        <div class="mu-row"><button class="mu-primary" data-act="hx-lead-go">Go with ${esc(l.name.split(' ')[0])}</button><button data-act="hx-lead-no">Stay</button></div></div>`;
}
/* ---------- settings, and the People screen's groups ---------- */
export function hostileSettingsHtml() {
    return `<section><h3>Rough stuff</h3>
        <label class="mu-check"><input type="checkbox" data-input="set-hx-on" ${hxPrefs().on ? 'checked' : ''}><span>Hostile actions<small>A red "Rough stuff" button in scenes: punch, kick, shove, threaten, make a scene, steal, grab, tie up, knock out, kill. The game rolls; people who see it remember it; where there is law, crimes get reported. The story's own characters are followed up too ("crimes:" in the hidden block). Needs "Track your situation".</small></span></label></section>`;
}
/** On the People screen: the group someone belongs to, and whether they are the law. */
export function personGroupHtml(g, p) {
    if (!hxOn() || p.status === 'dead')
        return '';
    const st = hs(g);
    const grp = groupOf(g, p.key);
    const w = getWorld(g.world);
    const isLaw = st.lawKeys.includes(p.key) || (w ? (p.kind === 'cast' && p.avatar && g.cast[p.avatar]?.occupation ? lawOf(g, w).occupations.includes(g.cast[p.avatar].occupation) : false) : false);
    const kind = st.kinds[p.key] ?? (p.avatar ? String(charOf(p.avatar)?.data?.extensions?.mundi?.kind ?? '') : '');
    return `<div class="mu-hx-pg"><label class="mu-hx-kind"><span>What they are</span><input type="text" data-input="hx-kind" data-key="${esc(p.key)}" maxlength="60" placeholder="human, mouse kemonomimi, Kindred…" value="${esc(kind)}"></label><label><span>Group</span><select data-input="hx-group" data-key="${esc(p.key)}"><option value="">None</option>${Object.values(st.groups).map(x => `<option value="${esc(x.id)}" ${grp?.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label class="mu-hx-pl"><input type="checkbox" data-input="hx-lawkey" data-key="${esc(p.key)}" ${isLaw ? 'checked' : ''}><span>The law</span></label></div>`;
}
/** On the People screen: the groups of this story, and where each takes its prisoners. */
export function groupsHtml(g, w) {
    if (!hxOn())
        return '';
    const st = hs(g);
    const list = Object.values(st.groups);
    const places = w.places.filter(p => !p.link);
    return `<section class="mu-hx-groups"><h4>Groups</h4><p class="mu-muted">A gang, a faction, a family: hurt one of them and the rest want payback, law or no law. A group with a base takes its prisoners there.</p>${list.map(x => `<div class="mu-hx-group"><b data-notr>${esc(x.name)}</b><small>${x.members.length} ${x.members.length === 1 ? 'member' : 'members'}${(st.grudge[x.id] ?? 0) >= 3 ? ' · <em>want payback</em>' : ''}</small>
        <label><span>Base</span><select data-input="hx-base" data-id="${esc(x.id)}"><option value="">Their own homes</option>${places.map(p => `<option value="${esc(p.id)}" ${x.base === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <button class="mu-ghost mu-ibtn" data-act="hx-group-del" data-id="${esc(x.id)}" title="Remove the group">${icon('trash')}</button></div>`).join('')}
        <div class="mu-hx-newgroup"><input type="text" data-input="hx-newgroup" maxlength="40" placeholder="New group: the Saviors, the Camarilla…" value="${esc(HX.newGroup)}"><button data-act="hx-group-add">Add</button></div></section>`;
}
Object.assign(ACT, {
    'hx-open': () => { HX.open = !HX.open; notify(); },
    'hx-close': () => { HX.open = false; notify(); },
    'hx-target': (el) => { HX.target = el.dataset.v ?? ''; notify(); },
    'hx-do': (el) => { if (el.getAttribute('aria-disabled') === 'true') {
        const t = el.getAttribute('title');
        if (t)
            toast(t, 'info');
        return;
    } void runAct(el.dataset.v); },
    'hx-turnin': (el) => { const c = ctxW(); if (!c)
        return; const r = turnIn(c.g, c.w, el.dataset.v); if (r) {
        toast(`You turn ${r.name} in to ${r.to}.${r.reward ? ` +${moneyText(c.w, r.reward)}` : ''}`, 'success');
        pushDirective(r.directive);
        void import('../sim/game.js').then(m => m.syncScene());
    } notify(); },
    'hx-laws-toggle': (_el, e) => { e.preventDefault(); HX.lawsOpen = !HX.lawsOpen; notify(); },
    'hx-law-add': () => {
        const g = game();
        if (!g)
            return;
        const d = HX.law;
        if (!d.name.trim() || !csvList(d.about).length || !d.allows.length) {
            toast('A law needs a name, who it is about, and at least one act.', 'info');
            return;
        }
        hs(g).laws.push({ id: `l${Date.now().toString(36)}`, name: d.name.trim(), about: csvList(d.about), allows: [...d.allows], who: csvList(d.who).filter(x => x.toLowerCase() !== 'anyone'), counts: d.counts, ...(d.consent ? { consent: true } : {}), ...(d.handTo.trim() ? { handTo: d.handTo.trim() } : {}), ...(Number(d.reward) > 0 ? { reward: Number(d.reward) } : {}), ...(csvList(d.objectors).length ? { objectors: csvList(d.objectors) } : {}), ...(d.note.trim() ? { note: d.note.trim() } : {}) });
        HX.law = freshLaw();
        HX.lawsOpen = false;
        saveGame();
        void import('../sim/prompt.js').then(m => m.refreshPrompt());
        notify();
    },
    'hx-law-del': (el) => { const g = game(); if (!g)
        return; hs(g).laws = hs(g).laws.filter(l => l.id !== el.dataset.id); saveGame(); void import('../sim/prompt.js').then(m => m.refreshPrompt()); notify(); },
    'hx-takein': (el) => { const c = ctxW(); if (!c)
        return; const r = takeIn(c.g, c.w, el.dataset.v); if (r) {
        toast(`You take ${r.name} in.${r.days < 9999 ? ` They'll be held for ${r.days} day${r.days === 1 ? '' : 's'}.` : ' They won\'t be out again.'}`, 'success');
        pushDirective(r.directive);
        void import('../sim/game.js').then(m => m.syncScene());
    } notify(); },
    'hx-letgo': (el) => { const c = ctxW(); if (!c)
        return; const n = letGo(c.g, c.w, el.dataset.v); if (n) {
        toast(`You let ${n} go.`, 'info');
        pushDirective(`[{{user}} has just let ${n} go: ${n} is free and can leave.]`);
    } notify(); },
    'hx-surrender': () => { HX.surrender = true; notify(); },
    'hx-lead-go': () => { const l = HX.lead; HX.lead = null; if (l)
        void goAlong(l, false); notify(); },
    'hx-lead-no': () => { const l = HX.lead; HX.lead = null; if (l)
        pushDirective(`[{{user}} decided not to go with ${l.name} to ${l.text}.]`); notify(); },
    'hx-surrender-no': () => { HX.surrender = false; notify(); },
    'hx-surrender-go': () => { void giveUp(); },
    'hx-law-toggle': (_el, e) => { e.preventDefault(); HX.lawOpen = !HX.lawOpen; notify(); },
    'hx-group-add': () => {
        const g = game();
        const name = HX.newGroup.trim();
        if (!g || !name)
            return;
        const id = `g${Date.now().toString(36)}`;
        hs(g).groups[id] = { id, name: name.slice(0, 40), members: [] };
        HX.newGroup = '';
        saveGame();
        notify();
    },
    'hx-group-del': (el) => { const g = game(); if (!g)
        return; delete hs(g).groups[el.dataset.id]; delete hs(g).grudge[el.dataset.id]; saveGame(); notify(); },
});
Object.assign(INPUT, {
    'set-hx-on': (el) => { hxPrefs().on = el.checked; saveSettings(); notify(); },
    'hx-law-mode': (el) => { const g = game(); if (!g)
        return; hs(g).law.mode = el.value; saveGame(); void import('../sim/prompt.js').then(m => m.refreshPrompt()); notify(); },
    'hx-law-name': (el) => { const g = game(); if (!g)
        return; hs(g).law.name = el.value; saveGame(); void import('../sim/prompt.js').then(m => m.refreshPrompt()); },
    'hx-lawkey': (el) => {
        const g = game();
        if (!g)
            return;
        const st = hs(g);
        const k = el.dataset.key;
        st.lawKeys = st.lawKeys.filter(x => x !== k);
        if (el.checked)
            st.lawKeys.push(k);
        saveGame();
        notify();
    },
    'hx-group': (el) => {
        const g = game();
        if (!g)
            return;
        const st = hs(g);
        const k = el.dataset.key;
        for (const x of Object.values(st.groups))
            x.members = x.members.filter(m => m !== k);
        const id = el.value;
        if (id && st.groups[id])
            st.groups[id].members.push(k);
        saveGame();
        notify();
    },
    'hx-newgroup': (el) => { HX.newGroup = el.value; },
    'hx-item': (el) => { HX.item = el.value; },
    'hx-ld': (el) => { HX.law[el.dataset.k] = el.value; },
    'hx-ld-consent': (el) => { HX.law.consent = el.checked; },
    'hx-ld-act': (el) => { const v = el.dataset.v; HX.law.allows = HX.law.allows.filter(x => x !== v); if (el.checked)
        HX.law.allows.push(v); },
    'hx-kind': (el) => { const g = game(); if (!g)
        return; const k = el.dataset.key; if (el.value.trim())
        hs(g).kinds[k] = el.value.trim();
    else
        delete hs(g).kinds[k]; saveGame(); void import('../sim/prompt.js').then(m => m.refreshPrompt()); },
    'hx-role': (el) => {
        const g = game();
        if (!g)
            return;
        const st = hs(g);
        const v = el.dataset.v;
        st.roles = st.roles.filter(r => r !== v && r !== 'civilian');
        if (el.checked)
            st.roles.push(v);
        if (v === 'civilian' && el.checked)
            st.roles = ['civilian'];
        saveGame();
        void import('../sim/prompt.js').then(m => m.refreshPrompt());
        notify();
    },
    'hx-roletext': (el) => { const g = game(); if (!g)
        return; hs(g).roleText = el.value; saveGame(); void import('../sim/prompt.js').then(m => m.refreshPrompt()); },
    'hx-base': (el) => { const g = game(); if (!g)
        return; const x = hs(g).groups[el.dataset.id]; if (x) {
        x.base = el.value || undefined;
        saveGame();
    } },
});
void personaName;
void keyFor;
