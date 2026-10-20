// Sprite packs: one portrait in, a whole set of expressions out. Each expression is an edit of the portrait made by
// your ComfyUI (Qwen Image Edit), through SillyTavern's own ComfyUI connection; you keep or redo each one and the
// kept ones go straight into the character's sprite folder (Character Expressions), where Mundi's scene shows them.
import { notify, esc, toast, settings, saveSettings, state } from '../core/store.js';
import { ctx, charOf, avatarUrl, fetchSprites, uploadSprite, expressionLabels } from '../st/bridge.js';
import {
    editGraph, graphProblems, fillWorkflow, expressionPrompt, basePrompt, lookOf, borderColor, chromaKey,
    PRESET_MODELS, PRESET_NAMES, MODEL_LINKS, KEY_HEX, type Preset, type Models, type BgMode, type KeyColor,
} from '../sim/spritegraph.js';
import { pickFile } from './cropper.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

/* ---------- settings (kept between packs) ---------- */

interface SpritePrefs {
    url: string; mode: 'preset' | 'custom'; preset: Preset; models: Models; useLora: boolean; workflow: string;
    bg: BgMode; key: KeyColor; tolerance: number; extra: string; negative: string;
}
function prefs(): SpritePrefs {
    const s = settings() as any;
    const sd = ctx().extensionSettings?.sd ?? {};
    s.sprites ??= {};
    const p = s.sprites as SpritePrefs;
    p.url ??= String(sd.comfy_url || 'http://127.0.0.1:8188');
    p.mode ??= 'preset';
    p.preset ??= 'qwen-2511';
    p.models ??= { ...PRESET_MODELS[p.preset] };
    p.useLora ??= true;
    p.workflow ??= '';
    p.bg ??= 'key';
    p.key ??= 'green';
    p.tolerance ??= 70;
    p.extra ??= '';
    p.negative ??= '';
    return p;
}

/* ---------- this session ---------- */

type TileState = 'wait' | 'run' | 'done' | 'error';
interface Tile { state: TileState; seed: number; raw?: Blob; out?: Blob; url?: string; err?: string; keep: boolean; look?: string }
export const SP = {
    avatar: '',
    step: 'setup' as 'setup' | 'base' | 'run',
    source: null as Blob | null, sourceUrl: '', sourceName: '',
    base: null as Blob | null, baseRaw: null as Blob | null, baseUrl: '', baseErr: '', baseBusy: false,
    labels: [] as string[], have: new Set<string>(),
    tiles: {} as Record<string, Tile>,
    running: false, abort: null as AbortController | null, started: 0, doneCount: 0,
    comfy: '' as '' | 'ok' | 'down' | 'checking', unets: null as string[] | null, vaes: null as string[] | null, workflows: null as string[] | null,
    editing: '', saving: false, showModels: false,
};
const seed = () => Math.floor(Math.random() * 2 ** 31);
const headers = () => ctx().getRequestHeaders();
const post = (url: string, body: any, signal?: AbortSignal) => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
const url = (b: Blob | null | undefined) => (b ? URL.createObjectURL(b) : '');
const drop = (u: string) => { if (u) URL.revokeObjectURL(u); };

export async function openSpritePack(avatar: string) {
    resetPack();
    SP.avatar = avatar;
    // the card's own picture, unless you choose another
    try {
        const r = await fetch(avatarUrl(avatar), { cache: 'no-cache' });
        if (r.ok) { SP.source = await r.blob(); SP.sourceUrl = url(SP.source); SP.sourceName = 'The card picture'; }
    } catch { /* you can pick a picture */ }
    const have = await fetchSprites(avatar);
    SP.have = new Set(have.map((s: any) => String(s.label)));
    const all = expressionLabels();
    const missing = all.filter(l => !SP.have.has(l));
    SP.labels = missing.length ? missing : [...all];
    notify();
    void checkComfy();
}
export function closeSpritePack() { SP.abort?.abort(); resetPack(); notify(); }
function resetPack() {
    drop(SP.sourceUrl); drop(SP.baseUrl);
    for (const t of Object.values(SP.tiles)) drop(t.url ?? '');
    Object.assign(SP, { avatar: '', step: 'setup', source: null, sourceUrl: '', sourceName: '', base: null, baseRaw: null, baseUrl: '', baseErr: '', baseBusy: false, labels: [], tiles: {}, running: false, abort: null, editing: '', saving: false, doneCount: 0 });
}

/* ---------- ComfyUI, through SillyTavern ---------- */

async function checkComfy() {
    const p = prefs();
    SP.comfy = 'checking'; notify();
    try {
        const ping = await post('/api/sd/comfy/ping', { url: p.url });
        SP.comfy = ping.ok ? 'ok' : 'down';
        if (ping.ok) {
            const [m, v, wf] = await Promise.all([
                post('/api/sd/comfy/models', { url: p.url }).then(r => (r.ok ? r.json() : [])).catch(() => []),
                post('/api/sd/comfy/vaes', { url: p.url }).then(r => (r.ok ? r.json() : [])).catch(() => []),
                post('/api/sd/comfy/workflows', {}).then(r => (r.ok ? r.json() : [])).catch(() => []),
            ]);
            // diffusion models (UNet loader and GGUF), not whole checkpoints: the edit models come as UNets
            SP.unets = (m as any[]).filter(x => /^(UNet|GGUF):/.test(String(x.text))).map(x => String(x.value));
            SP.vaes = (v as any[]).map(String);
            SP.workflows = (wf as any[]).map(String);
        }
    } catch { SP.comfy = 'down'; }
    notify();
}
const b64 = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = rej; r.readAsDataURL(blob); });
const unb64 = (data: string, type: string) => { const bin = atob(data); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type }); };

async function graphFor(image: Blob, prompt: string, s: number): Promise<any> {
    const p = prefs();
    const img = await b64(image);
    if (p.mode === 'custom') {
        if (!p.workflow) throw new Error('Choose one of your ComfyUI workflows, or use the built-in one.');
        const r = await post('/api/sd/comfy/workflow', { file_name: p.workflow });
        if (!r.ok) throw new Error('Could not read that workflow.');
        const text = JSON.parse(await r.text());
        const sd = ctx().extensionSettings?.sd ?? {};
        const { graph, missing } = fillWorkflow(text, {
            char_avatar: img, user_avatar: img, prompt, negative_prompt: p.negative, seed: s,
            steps: sd.steps ?? 20, scale: sd.scale ?? 4, sampler: sd.sampler ?? 'euler', scheduler: sd.scheduler ?? 'simple',
            denoise: 1, width: sd.width ?? 1024, height: sd.height ?? 1024, model: sd.model ?? '', vae: sd.comfy_vae ?? '', clip_skip: sd.clip_skip ?? 1,
        });
        if (!graph) throw new Error(`The workflow has placeholders Mundi cannot fill: ${missing.join(', ')}. It needs "%char_avatar%" (the picture) and "%prompt%".`);
        return graph;
    }
    const g = editGraph({ preset: p.preset, models: p.models, useLora: p.useLora, image: img, prompt, negative: p.negative, seed: s, removeBg: p.bg === 'node' });
    const bad = graphProblems(g);
    if (bad.length) throw new Error(bad.join('; '));
    return g;
}
// ComfyUI's own error says which node or file is wrong: turn the usual ones into something to do.
function explain(raw: string): string {
    const t = String(raw ?? '');
    if (/ETN_LoadImageBase64/.test(t)) return 'Your ComfyUI is missing the "ETN_LoadImageBase64" node. Install "comfyui-tooling-nodes" (ComfyUI Manager → Custom Nodes) and restart ComfyUI.';
    // SillyTavern passes on only this when ComfyUI refuses the workflow itself (before running it)
    if (/^ComfyUI returned an error\.?$/i.test(t.trim())) {
        const p = prefs();
        return p.mode === 'custom' ? 'ComfyUI refused the workflow. Its own window says why (a missing node or file).'
            : `ComfyUI refused the workflow, usually because a node or a file is missing. Check that: comfyui-tooling-nodes is installed (the "ETN_LoadImageBase64" node); ComfyUI is up to date (Qwen Image Edit nodes); and these files exist: ${[p.models.clip, p.useLora ? p.models.lora : '', p.bg === 'node' ? p.models.bgModel : ''].filter(Boolean).join(', ')}. ComfyUI's own window shows exactly which.`;
    }
    const node = t.match(/node[^"]*"?([A-Za-z0-9_]+)"? (?:does not exist|not found)/i)?.[1];
    if (node) return `Your ComfyUI doesn't have the "${node}" node. Update ComfyUI (Qwen Image Edit needs a recent version)${node === 'UnetLoaderGGUF' ? ', and install ComfyUI-GGUF' : ''}.`;
    const file = t.match(/Value not in list: ([a-z_]+): '([^']+)'/i);
    if (file) return `ComfyUI doesn't have the file "${file[2]}" (${file[1]}). Put it in the right models folder${MODEL_LINKS[file[2]] ? ` (download: ${MODEL_LINKS[file[2]]})` : ''}, or choose another file under Models.`;
    if (/out of memory|OOM|CUDA error/i.test(t)) return 'ComfyUI ran out of video memory. Try a smaller model file (fp8 or GGUF), or close other programs using the GPU.';
    if (/ECONNREFUSED|fetch failed|ComfyUI returned an error/i.test(t)) return `SillyTavern can't reach ComfyUI at ${prefs().url}. Is it running?`;
    return t.slice(0, 400) || 'ComfyUI did not answer.';
}
// The files SillyTavern can list (diffusion models and VAEs): a missing one is said before anything runs.
function missingFiles(): string {
    const p = prefs();
    if (p.mode !== 'preset') return '';
    if (SP.unets && SP.unets.length && !SP.unets.includes(p.models.unet)) return `Your ComfyUI doesn't have the diffusion model "${p.models.unet}". Choose one under Model files${MODEL_LINKS[p.models.unet] ? `, or download it: ${MODEL_LINKS[p.models.unet]}` : ''}.`;
    if (SP.vaes && SP.vaes.length && !SP.vaes.includes(p.models.vae)) return `Your ComfyUI doesn't have the VAE "${p.models.vae}". Choose one under Model files${MODEL_LINKS[p.models.vae] ? `, or download it: ${MODEL_LINKS[p.models.vae]}` : ''}.`;
    return '';
}
async function generate(image: Blob, prompt: string, s: number, signal: AbortSignal): Promise<Blob> {
    const p = prefs();
    const miss = missingFiles();
    if (miss) throw new Error(miss);
    const graph = await graphFor(image, prompt, s);
    const sd = ctx().extensionSettings?.sd ?? {};
    const r = await post('/api/sd/comfy/generate', { url: p.url, prompt: JSON.stringify({ prompt: graph }), auth: sd.comfy_auth }, signal);
    if (!r.ok) throw new Error(explain(await r.text()));
    const j = await r.json();
    return unb64(String(j.data), `image/${j.format || 'png'}`);
}

/* ---------- a plain background → transparent, in the browser ---------- */

async function keyOut(blob: Blob): Promise<Blob> {
    const p = prefs();
    if (p.bg !== 'key') return blob;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    const ref = borderColor(img.data, c.width, c.height);
    chromaKey(img.data, c.width, c.height, p.key, ref, p.tolerance);
    g.putImageData(img, 0, 0);
    return new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not make the picture.'))), 'image/png'));
}

/* ---------- running ---------- */

async function makeBase() {
    const p = prefs();
    if (!SP.source) { toast('Choose a picture first.', 'warn'); return; }
    SP.step = 'base'; SP.baseBusy = true; SP.baseErr = ''; notify();
    SP.abort = new AbortController();
    try {
        SP.baseRaw = await generate(SP.source, basePrompt(p.key, p.extra), seed(), SP.abort.signal);
        drop(SP.baseUrl);
        SP.base = SP.baseRaw;
        SP.baseUrl = url(await keyOut(SP.baseRaw));
    } catch (e: any) { if (e?.name !== 'AbortError') SP.baseErr = String(e?.message ?? e); }
    SP.baseBusy = false; SP.abort = null; notify();
}
async function runAll(only?: string[]) {
    if (SP.running) return;
    const from = SP.base ?? SP.source;
    if (!from) { toast('Choose a picture first.', 'warn'); return; }
    SP.step = 'run'; SP.running = true; SP.started = Date.now(); SP.doneCount = 0;
    const list = only ?? SP.labels;
    for (const l of list) {
        const t = SP.tiles[l];
        if (!t || only) SP.tiles[l] = { ...(t ?? { keep: true }), state: 'wait', seed: only ? seed() : (t?.seed ?? seed()), err: '' };
    }
    SP.abort = new AbortController();
    notify();
    for (const l of list) {
        if (SP.abort?.signal.aborted) break;
        const t = SP.tiles[l];
        if (t.state === 'done' && !only) continue;
        t.state = 'run'; notify();
        try {
            const p = prefs();
            t.raw = await generate(from, expressionPrompt(l, { bg: p.bg, key: p.key, extra: p.extra, look: t.look }), t.seed, SP.abort!.signal);
            t.out = await keyOut(t.raw);
            drop(t.url ?? ''); t.url = url(t.out);
            t.state = 'done'; t.keep = true; SP.doneCount++;
        } catch (e: any) {
            if (e?.name === 'AbortError') { t.state = 'wait'; break; }
            t.state = 'error'; t.err = String(e?.message ?? e);
            // the same problem would stop every one of them (a missing file or node): stop here and say it once
            if (!/out of memory/i.test(t.err)) { toast(t.err, 'error', { ms: 9000 }); break; }
        }
        notify();
    }
    SP.running = false; SP.abort = null; notify();
}
async function saveKept() {
    const kept = SP.labels.filter(l => SP.tiles[l]?.state === 'done' && SP.tiles[l].keep && SP.tiles[l].out);
    if (!kept.length) { toast('Nothing to save: keep at least one picture.', 'info'); return; }
    SP.saving = true; notify();
    let n = 0;
    try {
        for (const l of kept) { await uploadSprite(SP.avatar, l, SP.tiles[l].out!, l); n++; }
        toast(`${n} expression${n === 1 ? '' : 's'} saved to ${charOf(SP.avatar)?.name ?? 'the character'}'s sprites.`, 'success');
        state.lib.sprites = null;   // the Expressions screen loads the new pictures
        closeSpritePack();
    } catch (e: any) { toast(`Saved ${n}, then: ${String(e?.message ?? e)}`, 'error'); SP.saving = false; notify(); }
}

/* ---------- drawing ---------- */

const chk = (name: string, on: boolean, label: string, small = '', attrs = '') => `<label class="mu-check"><input type="checkbox" data-input="${name}" ${on ? 'checked' : ''} ${attrs}><span>${label}${small ? `<small>${small}</small>` : ''}</span></label>`;
const field = (label: string, inner: string, cls = '') => `<label class="mu-field ${cls}"><span>${label}</span>${inner}</label>`;
const options = (list: string[], cur: string) => [...new Set([cur, ...list].filter(Boolean))].map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}${list.length && !list.includes(v) ? ' (not in your ComfyUI)' : ''}</option>`).join('');

function setupHtml() {
    const p = prefs();
    const all = expressionLabels();
    const status = SP.comfy === 'ok' ? `<span class="mu-spk-ok">${icon('check')} Connected</span>` : SP.comfy === 'checking' ? '<span class="mu-muted">Checking…</span>' : SP.comfy === 'down' ? `<span class="mu-spk-bad">${icon('x')} Not reachable. Start ComfyUI, or fix the address.</span>` : '';
    const models = p.mode === 'preset' ? `
        <div class="mu-row2">${field('Model', `<select data-input="spk-preset">${(Object.keys(PRESET_NAMES) as Preset[]).map(k => `<option value="${k}" ${p.preset === k ? 'selected' : ''}>${PRESET_NAMES[k]}</option>`).join('')}</select>`)}
            ${chk('spk-lora', p.useLora, 'Lightning LoRA (4 steps)', 'Much faster. Without it each picture takes 40 steps.')}</div>
        <button class="mu-ghost mu-spk-more" data-act="spk-models">${icon(SP.showModels ? 'up' : 'down')}<span>Model files</span></button>
        ${SP.showModels ? `<div class="mu-spk-models">
            ${field('Diffusion model (models/diffusion_models)', `<select data-input="spk-m" data-k="unet">${options(SP.unets ?? [], p.models.unet)}</select>`)}
            ${field('Text encoder (models/text_encoders)', `<input type="text" data-input="spk-m" data-k="clip" value="${esc(p.models.clip)}">`)}
            ${field('VAE (models/vae)', `<select data-input="spk-m" data-k="vae">${options(SP.vaes ?? [], p.models.vae)}</select>`)}
            ${field('Lightning LoRA (models/loras)', `<input type="text" data-input="spk-m" data-k="lora" value="${esc(p.models.lora)}">`)}
            <p class="mu-muted">Missing a file? ${[...new Set(Object.values(PRESET_MODELS[p.preset]).filter(f => MODEL_LINKS[f]).map(f => MODEL_LINKS[f]))].map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https:\/\/huggingface\.co\//, '').replace(/\/tree\/main.*$/, ''))}</a>`).join(' · ')}. A GGUF model works too (with ComfyUI-GGUF). The picture comes in through the "ETN_LoadImageBase64" node from comfyui-tooling-nodes, like SillyTavern's own avatar workflow.</p>
        </div>` : ''}`
        : field('Your workflow (SillyTavern → Image Generation → ComfyUI workflows)', `<select data-input="spk-workflow"><option value="">Choose…</option>${(SP.workflows ?? []).map(w => `<option value="${esc(w)}" ${p.workflow === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select><small class="mu-muted">It gets the picture as "%char_avatar%" and the edit as "%prompt%" (also %negative_prompt% and %seed%).</small>`);
    const bg = `${field('Background', `<select data-input="spk-bg">
            <option value="key" ${p.bg === 'key' ? 'selected' : ''}>Transparent (a plain color, taken out here)</option>
            <option value="node" ${p.bg === 'node' ? 'selected' : ''}>Transparent (ComfyUI's Remove Background node)</option>
            <option value="keep" ${p.bg === 'keep' ? 'selected' : ''}>Keep the picture's background</option></select>`)}
        ${p.bg === 'key' ? `<div class="mu-row2"><div class="mu-field"><span>Plain color</span><div class="mu-chips">${(['green', 'magenta', 'blue'] as KeyColor[]).map(k => `<button class="mu-chip ${p.key === k ? 'is-on' : ''}" data-act="spk-key" data-v="${k}"><i class="mu-spk-swatch" style="background:${KEY_HEX[k]}"></i>${k}</button>`).join('')}</div><small class="mu-muted">Pick a color the character doesn't wear (magenta for green hair or clothes).</small></div>
            <label class="mu-field slider"><span>How much of the color to take out</span><input type="range" min="20" max="160" value="${p.tolerance}" data-input="spk-tol"><output>${p.tolerance}</output></label></div>` : ''}
        ${p.bg === 'node' ? field('Background removal model (models/background_removal)', `<input type="text" data-input="spk-m" data-k="bgModel" value="${esc(p.models.bgModel)}" placeholder="for example birefnet.safetensors">`) : ''}`;
    return `<div class="mu-spk-setup">
        <div class="mu-spk-src">
            <div class="mu-spk-pic is-checker">${SP.sourceUrl ? `<img src="${esc(SP.sourceUrl)}" alt="">` : icon('image')}</div>
            <small class="mu-muted">${esc(SP.sourceName || 'No picture yet')}</small>
            <div class="mu-row"><button data-act="spk-pick">${icon('upload')}<span>Another picture</span></button>${SP.sourceName !== 'The card picture' ? `<button class="mu-ghost" data-act="spk-card">Card picture</button>` : ''}</div>
            <p class="mu-muted">Best: one character, facing you, the whole upper body or more, nothing in front of them. Every expression is an edit of this picture.</p>
        </div>
        <div class="mu-spk-form">
            <section><h4>ComfyUI</h4>
                <div class="mu-spk-url">${field('Address', `<input type="text" data-input="spk-url" value="${esc(p.url)}">`)}<button data-act="spk-check">${icon('redo')}<span>Check</span></button></div>${status}
                <div class="mu-chips mu-spk-mode"><button class="mu-chip ${p.mode === 'preset' ? 'is-on' : ''}" data-act="spk-mode" data-v="preset">Built-in workflow</button><button class="mu-chip ${p.mode === 'custom' ? 'is-on' : ''}" data-act="spk-mode" data-v="custom">My own workflow</button></div>
                ${models}</section>
            <section><h4>Background</h4>${bg}</section>
            <section><h4>Expressions <small class="mu-muted">${SP.labels.length} of ${all.length}</small></h4>
                <div class="mu-row"><button class="mu-ghost" data-act="spk-sel" data-v="missing">Missing ones</button><button class="mu-ghost" data-act="spk-sel" data-v="all">All</button><button class="mu-ghost" data-act="spk-sel" data-v="none">None</button></div>
                <div class="mu-chips mu-spk-labels">${all.map(l => `<button class="mu-chip ${SP.labels.includes(l) ? 'is-on' : ''} ${SP.have.has(l) ? 'is-have' : ''}" data-act="spk-label" data-v="${esc(l)}" title="${esc(lookOf(l))}${SP.have.has(l) ? ' · already has a picture' : ''}">${esc(l)}</button>`).join('')}</div>
                ${field('Also tell the model (optional)', `<input type="text" data-input="spk-extra" value="${esc(p.extra)}" placeholder="for example: keep the hands out of the picture">`)}</section>
            <div class="mu-row mu-spk-go">
                <button class="mu-primary mu-big" data-act="spk-start" ${SP.source && SP.labels.length ? '' : 'disabled'}>${icon('sparkles')}<span>${p.bg === 'key' ? 'Make the plain background first' : `Make ${SP.labels.length} expression${SP.labels.length === 1 ? '' : 's'}`}</span></button>
                <button class="mu-ghost" data-act="spk-close">Cancel</button></div>
        </div></div>`;
}

function baseHtml() {
    return `<div class="mu-spk-base">
        <div class="mu-spk-pair">
            <figure><div class="mu-spk-pic is-checker"><img src="${esc(SP.sourceUrl)}" alt=""></div><figcaption>Your picture</figcaption></figure>
            <figure><div class="mu-spk-pic is-checker">${SP.baseBusy ? '<i class="mu-spk-spin"></i>' : SP.baseUrl ? `<img src="${esc(SP.baseUrl)}" alt="">` : icon('image')}</div><figcaption>${SP.baseBusy ? 'Making the plain background…' : 'With the background taken out'}</figcaption></figure>
        </div>
        ${SP.baseErr ? `<p class="mu-spk-bad">${esc(SP.baseErr)}</p>` : ''}
        <p class="mu-muted">Every expression starts from this picture. If the character changed, or bits of the background are left, try again (or change the color or the amount taken out, back in the settings).</p>
        <div class="mu-row">
            <button class="mu-primary" data-act="spk-run" ${SP.base && !SP.baseBusy ? '' : 'disabled'}>${icon('sparkles')}<span>Looks good: make ${SP.labels.length} expressions</span></button>
            <button data-act="spk-base" ${SP.baseBusy ? 'disabled' : ''}>${icon('redo')}<span>Try again</span></button>
            ${SP.baseBusy ? '<button class="mu-danger" data-act="spk-stop">■ Stop</button>' : '<button class="mu-ghost" data-act="spk-back">Back to the settings</button>'}
        </div></div>`;
}

function runHtml() {
    const tiles = SP.labels.map(l => [l, SP.tiles[l]] as const).filter(([, t]) => t);
    const done = tiles.filter(([, t]) => t.state === 'done').length;
    const kept = tiles.filter(([, t]) => t.state === 'done' && t.keep).length;
    const each = SP.doneCount ? Math.round((Date.now() - SP.started) / SP.doneCount / 1000) : 0;
    return `<div class="mu-spk-run">
        <div class="mu-spk-bar"><b>${done} / ${tiles.length}</b>${SP.running ? `<span class="mu-muted">${each ? `about ${each} s each` : 'starting…'}</span>` : ''}<span class="mu-spk-progress"><i style="width:${tiles.length ? Math.round(done / tiles.length * 100) : 0}%"></i></span>
            ${SP.running ? '<button class="mu-danger" data-act="spk-stop">■ Stop</button>' : `<button data-act="spk-back">${icon('back')}<span>Settings</span></button>`}</div>
        <div class="mu-spk-grid">${tiles.map(([l, t]) => `<div class="mu-spk-tile is-${t.state} ${t.keep ? '' : 'is-dropped'}">
            <div class="mu-spk-pic is-checker">${t.state === 'done' && t.url ? `<img src="${esc(t.url)}" alt="" data-act="spk-zoom" data-v="${esc(l)}">` : t.state === 'run' ? '<i class="mu-spk-spin"></i>' : t.state === 'error' ? `<span class="mu-spk-bad" title="${esc(t.err ?? '')}">${icon('x')}</span>` : '<span class="mu-muted">waiting</span>'}</div>
            <div class="mu-spk-tilehead"><b data-notr>${esc(l)}</b>
                ${t.state === 'done' ? `<label class="mu-check" title="Keep this one"><input type="checkbox" data-input="spk-keep" data-v="${esc(l)}" ${t.keep ? 'checked' : ''}><span></span></label>` : ''}</div>
            ${SP.editing === l ? `<input type="text" class="mu-spk-look" data-input="spk-look" data-v="${esc(l)}" data-focus="spk-look" value="${esc(t.look ?? lookOf(l))}">` : ''}
            <div class="mu-row mu-spk-tilebtns">
                <button class="mu-ibtn" data-act="spk-redo" data-v="${esc(l)}" title="Make it again" ${SP.running ? 'disabled' : ''}>${icon('redo')}</button>
                <button class="mu-ibtn ${SP.editing === l ? 'is-on' : ''}" data-act="spk-edit" data-v="${esc(l)}" title="Describe this expression">${icon('edit')}</button></div>
        </div>`).join('')}</div>
        <div class="mu-row mu-spk-go">
            <button class="mu-primary mu-big" data-act="spk-save" ${!SP.running && kept && !SP.saving ? '' : 'disabled'}>${icon('save')}<span>${SP.saving ? 'Saving…' : `Save ${kept} to ${esc(charOf(SP.avatar)?.name ?? 'the character')}'s sprites`}</span></button>
            ${!SP.running && tiles.some(([, t]) => t.state !== 'done') ? '<button data-act="spk-resume">Make the rest</button>' : ''}
            <button class="mu-ghost" data-act="spk-close">Close</button></div>
        <p class="mu-muted">Pictures you keep replace the ones with the same expression. Click one to see it bigger; ✎ to describe it differently, then ↻.</p>
    </div>`;
}

let zoom = '';
export function spritePackHtml(): string {
    const c = charOf(SP.avatar);
    const head = `<div class="mu-gal-albumhead"><button class="mu-ghost" data-act="spk-close">${icon('back')}<span>Expressions</span></button><div><h3>Make a sprite pack</h3><small data-notr>${esc(c?.name ?? SP.avatar)}</small></div></div>`;
    const big = zoom && SP.tiles[zoom]?.url ? `<div class="mu-dlg-veil is-fixed" data-act="spk-zoom" data-v=""></div><div class="mu-spk-zoom is-checker" data-act="spk-zoom" data-v=""><img src="${esc(SP.tiles[zoom].url!)}" alt=""><b data-notr>${esc(zoom)}</b></div>` : '';
    return `<div class="mu-spk">${head}${SP.step === 'setup' ? setupHtml() : SP.step === 'base' ? baseHtml() : runHtml()}${big}</div>`;
}
export const spritePackOpen = (avatar: string) => SP.avatar === avatar;

Object.assign(ACT, {
    'spk-open': (el) => { void openSpritePack(el.dataset.avatar!); },
    'spk-close': () => closeSpritePack(),
    'spk-check': () => { void checkComfy(); },
    'spk-pick': async () => {
        const f = await pickFile('image/*'); if (!f) return;
        drop(SP.sourceUrl); SP.source = f; SP.sourceUrl = url(f); SP.sourceName = f.name; SP.base = null; notify();
    },
    'spk-card': async () => { const a = SP.avatar; const labels = SP.labels; await openSpritePack(a); SP.labels = labels; notify(); },
    'spk-mode': (el) => { prefs().mode = el.dataset.v as any; saveSettings(); notify(); },
    'spk-models': () => { SP.showModels = !SP.showModels; notify(); },
    'spk-key': (el) => { prefs().key = el.dataset.v as KeyColor; saveSettings(); notify(); },
    'spk-label': (el) => { const l = el.dataset.v!; SP.labels = SP.labels.includes(l) ? SP.labels.filter(x => x !== l) : expressionLabels().filter(x => x === l || SP.labels.includes(x)); notify(); },
    'spk-sel': (el) => { const all = expressionLabels(); SP.labels = el.dataset.v === 'all' ? [...all] : el.dataset.v === 'none' ? [] : all.filter(l => !SP.have.has(l)); notify(); },
    'spk-start': () => { if (prefs().bg === 'key') void makeBase(); else void runAll(); },
    'spk-base': () => { void makeBase(); },
    'spk-run': () => { void runAll(); },
    'spk-resume': () => { void runAll(); },
    'spk-stop': () => { SP.abort?.abort(); },
    'spk-back': () => { SP.step = 'setup'; notify(); },
    'spk-redo': (el) => { void runAll([el.dataset.v!]); },
    'spk-edit': (el) => { SP.editing = SP.editing === el.dataset.v ? '' : el.dataset.v!; notify(); },
    'spk-zoom': (el) => { zoom = el.dataset.v ?? ''; notify(); },
    'spk-save': () => { void saveKept(); },
});
Object.assign(INPUT, {
    'spk-url': (el) => { prefs().url = el.value.trim(); saveSettings(); },
    'spk-preset': (el) => { const p = prefs(); p.preset = el.value as Preset; p.models = { ...PRESET_MODELS[p.preset], bgModel: p.models.bgModel }; saveSettings(); notify(); },
    'spk-lora': (el) => { prefs().useLora = el.checked; saveSettings(); },
    'spk-m': (el) => { (prefs().models as any)[el.dataset.k!] = el.value.trim(); saveSettings(); },
    'spk-workflow': (el) => { prefs().workflow = el.value; saveSettings(); },
    'spk-bg': (el) => { prefs().bg = el.value as BgMode; SP.base = null; saveSettings(); notify(); },
    'spk-tol': (el) => { prefs().tolerance = Number(el.value); const o = el.nextElementSibling; if (o) o.textContent = el.value; saveSettings(); },
    'spk-extra': (el) => { prefs().extra = el.value; saveSettings(); },
    'spk-keep': (el) => { const t = SP.tiles[el.dataset.v!]; if (t) { t.keep = el.checked; notify(); } },
    'spk-look': (el) => { const t = SP.tiles[el.dataset.v!]; if (t) t.look = el.value; },
});
