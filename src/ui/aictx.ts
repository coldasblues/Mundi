// "AI context": what Mundi sends to the AI with every reply, block by block. Each block can be switched off, a token
// budget drops the least important blocks first, and the count shows how much of the model's context it takes.
// The texts are yours to change: each block's own text, the scene's rules, and instructions of your own.
import { esc, notify, saveSettings, game } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { ctx } from '../st/bridge.js';
import { blocksOf, promptCfg, sceneBlocks, sceneText, estTokens, refreshPrompt, DEFAULT_RULES } from '../sim/prompt.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

const A = { text: '', count: -1, preview: false, edit: '' };
function count(text: string) {
    if (text === A.text) return;
    A.text = text; A.count = -1;
    const f = (ctx() as any).getTokenCountAsync;
    if (typeof f !== 'function') { A.count = estTokens(text); return; }
    Promise.resolve(f(text)).then((n: number) => { if (A.text === text) { A.count = n; notify(); } }).catch(() => { A.count = estTokens(text); notify(); });
}
// the context size SillyTavern uses for this API
function stContext(): number {
    const c: any = ctx();
    return c.mainApi === 'openai' ? Number(c.chatCompletionSettings?.openai_max_context ?? 0) : Number(c.maxContext ?? 0);
}

export function tabAiContext(): string {
    const pc = promptCfg();
    const blocks = sceneBlocks();
    const text = sceneText();
    count(text);
    const n = A.count >= 0 ? A.count : estTokens(text);
    const max = stContext();
    const unlocked = max > 262144;
    const share = max && !unlocked ? Math.round((n / max) * 100) : 0;
    const steps = [0, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000];
    const bi = Math.max(0, steps.indexOf(pc.budget));
    return `<section class="mu-wc-sec mu-aic">
            <h4>What Mundi sends to the AI</h4>
            <p class="mu-muted">Sent with every reply, on top of your preset, the character cards and the chat. Only what is about this place and the people here.</p>
            <div class="mu-aic-meter"><b>${A.count >= 0 ? '' : '≈ '}${n.toLocaleString('en-US')} tokens</b>
                <span>${unlocked ? `SillyTavern's context size is unlocked (${max.toLocaleString('en-US')}): set it to your model's real context in AI Response Configuration.` : max ? `${share}% of your context size (${max.toLocaleString('en-US')} tokens).` : ''}</span>
                ${max && !unlocked ? `<span class="mu-aic-bar"><i style="width:${Math.min(100, share)}%"></i></span>` : ''}</div>
            <label class="mu-field slider"><span>Token budget for Mundi · ${pc.budget ? `${pc.budget} tokens` : 'no limit'}</span>
                <input type="range" min="0" max="${steps.length - 1}" step="1" value="${bi}" data-input="aic-budget"></label>
            <small class="mu-muted">Over the budget, Mundi leaves out the least important blocks first (rumors, then approval…). The scene basics are always sent.</small>
        </section>
        <section class="mu-wc-sec"><h4>Blocks</h4><div class="mu-aic-list">${blocksOf(game() ? getWorld(game()!.world) : null).map(b => {
            const x = blocks.find(y => y.id === b.id);
            const st = x?.state ?? 'empty';
            const tag = st === 'sent' ? `≈ ${estTokens(x!.text)} tokens` : st === 'cut' ? 'left out: over the budget' : st === 'off' ? 'off' : 'nothing to send here';
            const own = b.id === 'core' || b.id === 'extra' ? '' : pc.text[b.id] ?? '';
            return `<div class="mu-aic-row is-${st}">
                ${b.cut ? `<input type="checkbox" class="mu-toggle" data-input="aic-block" data-id="${b.id}" ${pc.off.includes(b.id) ? '' : 'checked'}>` : `<span class="mu-aic-lock" title="Always sent">${icon('pin')}</span>`}
                <span><b>${esc(b.name)}${own.trim() ? ' <small class="mu-aic-own">your text</small>' : ''}</b><small>${esc(b.desc)}</small></span><em>${tag}</em>
                ${b.id === 'core' ? '' : `<button class="mu-ghost mu-ibtn" data-act="aic-edit" data-id="${b.id}" title="Change the text">${icon(A.edit === b.id ? 'up' : 'pen')}</button>`}</div>
                ${A.edit === b.id ? editor(b.id, own, x?.text ?? '') : ''}`;
        }).join('')}</div></section>
        <section class="mu-wc-sec"><h4>Rules of the scene</h4>
            <p class="mu-muted">Sent last, after everything else. Empty: Mundi's own rules (shown greyed). The note about the language of replies is added by itself.</p>
            <textarea class="mu-aic-text" rows="3" data-input="aic-rules" data-focus="aic-rules" placeholder="${esc(DEFAULT_RULES)}">${esc(pc.rules)}</textarea>
            ${pc.rules.trim() ? `<button class="mu-ghost" data-act="aic-reset" data-id="rules">${icon('undo')}<span>Back to Mundi's rules</span></button>` : ''}</section>
        <section class="mu-wc-sec"><button class="mu-ghost" data-act="aic-preview">${icon(A.preview ? 'up' : 'down')}<span>${A.preview ? 'Hide the text' : 'Show the text sent now'}</span></button>
            ${A.preview ? `<div class="mu-lib-text is-code" data-notr>${esc(text)}</div>` : ''}</section>`;
}

// A block's own text, under its row. {text} is what Mundi wrote for the block; your words go around it, or replace it.
function editor(id: string, own: string, now: string) {
    if (id === 'extra') return `<div class="mu-aic-edit">
        <textarea class="mu-aic-text" rows="4" data-input="aic-extra" data-focus="aic-extra" placeholder="For example: Keep replies under 150 words. {{user}} is never described doing things they did not do.">${esc(promptCfg().extra)}</textarea>
        <small class="mu-muted">Sent with every reply, before the rules of the scene. SillyTavern's macros ({{user}}, {{char}}…) work here.</small></div>`;
    return `<div class="mu-aic-edit">
        <textarea class="mu-aic-text" rows="3" data-input="aic-text" data-id="${id}" data-focus="aic-text-${id}" placeholder="{text}">${esc(own)}</textarea>
        <small class="mu-muted"><b>{text}</b> is what Mundi writes for this block; write around it (for example <i>[Feelings] {text}</i>), or leave it out to send only your words. Your text is sent only when the block has something to say. Empty: Mundi's own text.</small>
        ${now ? `<small class="mu-muted">Now: <span data-notr>${esc(now.length > 240 ? `${now.slice(0, 240)}…` : now)}</span></small>` : ''}
        ${own.trim() ? `<button class="mu-ghost" data-act="aic-reset" data-id="${id}">${icon('undo')}<span>Back to Mundi's text</span></button>` : ''}</div>`;
}

Object.assign(ACT, {
    'aic-preview': () => { A.preview = !A.preview; notify(); },
    'aic-edit': (el) => { A.edit = A.edit === el.dataset.id ? '' : el.dataset.id!; notify(); },
    'aic-reset': (el) => { const pc = promptCfg(); const id = el.dataset.id!; if (id === 'rules') pc.rules = ''; else delete pc.text[id]; saveSettings(); refreshPrompt(); notify(); },
});
Object.assign(INPUT, {
    'aic-block': (el) => {
        const pc = promptCfg(); const id = el.dataset.id!;
        pc.off = el.checked ? pc.off.filter(x => x !== id) : [...new Set([...pc.off, id])];
        saveSettings(); refreshPrompt(); notify();
    },
    // typing: saved and sent right away; the screen catches up on the next redraw
    'aic-text': (el) => { const pc = promptCfg(); const v = (el as unknown as HTMLTextAreaElement).value; if (v.trim()) pc.text[el.dataset.id!] = v; else delete pc.text[el.dataset.id!]; saveSettings(); refreshPrompt(); },
    'aic-rules': (el) => { promptCfg().rules = (el as unknown as HTMLTextAreaElement).value; saveSettings(); refreshPrompt(); },
    'aic-extra': (el) => { promptCfg().extra = (el as unknown as HTMLTextAreaElement).value; saveSettings(); refreshPrompt(); },
    'aic-budget': (el) => {
        const steps = [0, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000];
        promptCfg().budget = steps[Number(el.value)] ?? 0;
        saveSettings(); refreshPrompt(); notify();
    },
});
