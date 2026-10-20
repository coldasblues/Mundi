// Sprite packs: what to ask ComfyUI for each expression, the workflow graph (Qwen Image Edit, ComfyUI's own nodes),
// and turning a plain-color background into transparency. No runtime imports, so it can be tested on its own.

/** How each of SillyTavern's expression labels should look. Custom labels fall back to their own name. */
export const EXPRESSION_LOOKS: Record<string, string> = {
    admiration: 'admiring someone, bright shining eyes and a warm small smile',
    amusement: 'amused, a playful grin with slightly squinted eyes',
    anger: 'angry, furrowed brows, glaring eyes, tense mouth',
    annoyance: 'annoyed, one eyebrow raised and a flat unimpressed mouth',
    approval: 'approving, a small confident smile with a slight nod',
    caring: 'caring and gentle, soft eyes and a tender smile',
    confusion: 'confused, head tilted slightly, knitted brows, lips parted',
    curiosity: 'curious, wide interested eyes, leaning in a little',
    desire: 'longing, a wistful half-lidded gaze and a light blush',
    disappointment: 'disappointed, downcast eyes and a small frown',
    disapproval: 'disapproving, a stern frown and narrowed eyes',
    disgust: 'disgusted, wrinkled nose and curled lip',
    embarrassment: 'embarrassed, blushing deeply, looking away with a nervous smile',
    excitement: 'excited, a big open-mouthed smile and sparkling eyes',
    fear: 'frightened, wide eyes, raised eyebrows, mouth open in fear',
    gratitude: 'grateful, a warm thankful smile',
    grief: 'grieving, tears running down the cheeks, trembling mouth',
    joy: 'joyful, a big happy smile with eyes closed from laughing',
    love: 'lovestruck, a soft blushing smile and a tender gaze',
    nervousness: 'nervous, a drop of sweat, an awkward smile, eyes darting aside',
    optimism: 'optimistic, a bright hopeful smile, looking slightly up',
    pride: 'proud, chin raised, a confident smug smile',
    realization: 'sudden realization, eyes wide open, mouth in a small O',
    relief: 'relieved, a relaxed exhale and a calm smile',
    remorse: 'remorseful, guilty eyes looking down, lips pressed together',
    sadness: 'sad, teary eyes and a downturned mouth',
    surprise: 'surprised, eyebrows raised high, mouth open',
    neutral: 'neutral, a calm relaxed face with the mouth closed',
};
export const lookOf = (label: string) => EXPRESSION_LOOKS[label.toLowerCase()] ?? `${label.toLowerCase()}`;

export type BgMode = 'key' | 'node' | 'keep';
export type KeyColor = 'green' | 'magenta' | 'blue';
export const KEY_HEX: Record<KeyColor, string> = { green: '#00FF00', magenta: '#FF00FF', blue: '#0000FF' };
export const KEY_NAME: Record<KeyColor, string> = { green: 'pure green', magenta: 'pure magenta', blue: 'pure blue' };

/** The edit for one expression. */
export function expressionPrompt(label: string, o: { bg: BgMode; key: KeyColor; extra?: string; look?: string }): string {
    const look = (o.look ?? '').trim() || lookOf(label);
    return [
        `Change the character's facial expression to: ${look}.`,
        `Keep the same character: the same face, hair, eyes, outfit, body, pose, framing and art style.`,
        o.bg === 'key' ? `Keep the flat solid ${KEY_NAME[o.key]} (${KEY_HEX[o.key]}) background, with no shadows.` : o.bg === 'keep' ? 'Keep the same background.' : '',
        (o.extra ?? '').trim(),
    ].filter(Boolean).join(' ');
}
/** The first pass for a plain background (so it can be made transparent afterwards). */
export function basePrompt(key: KeyColor, extra = ''): string {
    return [
        `Replace the background with a flat, solid, ${KEY_NAME[key]} (${KEY_HEX[key]}) background with no shadows, gradients or floor.`,
        `Keep the character exactly the same: face, expression, hair, outfit, pose, framing and art style.`,
        extra.trim(),
    ].filter(Boolean).join(' ');
}

/* ---------- the workflow (ComfyUI API format) ---------- */

export type Preset = 'qwen-2511' | 'qwen-2509';
export interface Models { unet: string; clip: string; vae: string; lora: string; bgModel: string }
export const PRESET_MODELS: Record<Preset, Models> = {
    'qwen-2511': { unet: 'qwen_image_edit_2511_fp8mixed.safetensors', clip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', vae: 'qwen_image_vae.safetensors', lora: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', bgModel: '' },
    'qwen-2509': { unet: 'qwen_image_edit_2509_fp8_e4m3fn.safetensors', clip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', vae: 'qwen_image_vae.safetensors', lora: 'Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors', bgModel: '' },
};
export const PRESET_NAMES: Record<Preset, string> = { 'qwen-2511': 'Qwen Image Edit 2511', 'qwen-2509': 'Qwen Image Edit 2509' };
// Where to get them (shown in the panel, so a missing file is one click away).
export const MODEL_LINKS: Record<string, string> = {
    'qwen_image_edit_2511_fp8mixed.safetensors': 'https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files/diffusion_models',
    'qwen_image_edit_2509_fp8_e4m3fn.safetensors': 'https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files/diffusion_models',
    'qwen_2.5_vl_7b_fp8_scaled.safetensors': 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/text_encoders',
    'qwen_image_vae.safetensors': 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/vae',
    'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors': 'https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning',
    'Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors': 'https://huggingface.co/lightx2v/Qwen-Image-Lightning/tree/main/Qwen-Image-Edit-2509',
};

export interface GraphOpts {
    preset: Preset; models: Models; useLora: boolean;
    image: string;                 // base64 (no data: prefix)
    prompt: string; negative?: string; seed: number;
    steps?: number; cfg?: number;  // defaults: 4 / 1 with the Lightning LoRA, 40 / 4 without
    removeBg?: boolean;            // ComfyUI's own Remove Background node (needs a model in models/background_removal)
}
type Node = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
const n = (class_type: string, inputs: Record<string, unknown>, title?: string): Node => ({ class_type, inputs, ...(title ? { _meta: { title } } : {}) });

/**
 * The same graph as ComfyUI's own Qwen Image Edit templates (2509 / 2511), with the picture coming in as base64
 * (the ETN_LoadImageBase64 node of comfyui-tooling-nodes, the one SillyTavern's own avatar workflow uses).
 */
export function editGraph(o: GraphOpts): Record<string, Node> {
    const lora = o.useLora && !!o.models.lora.trim();
    const steps = o.steps ?? (lora ? 4 : 40);
    const cfg = o.cfg ?? (lora ? 1 : 4);
    const gguf = /\.gguf$/i.test(o.models.unet);
    const g: Record<string, Node> = {
        1: n('ETN_LoadImageBase64', { image: o.image }, 'Sprite source'),
        2: n('FluxKontextImageScale', { image: ['1', 0] }),
        3: gguf ? n('UnetLoaderGGUF', { unet_name: o.models.unet }) : n('UNETLoader', { unet_name: o.models.unet, weight_dtype: 'default' }),
        4: n('CLIPLoader', { clip_name: o.models.clip, type: 'qwen_image', device: 'default' }),
        5: n('VAELoader', { vae_name: o.models.vae }),
    };
    let model: [string, number] = ['3', 0];
    if (lora) { g[6] = n('LoraLoaderModelOnly', { model, lora_name: o.models.lora, strength_model: 1 }); model = ['6', 0]; }
    g[7] = n('ModelSamplingAuraFlow', { model, shift: o.preset === 'qwen-2511' ? 3.1 : 3 });
    g[8] = n('CFGNorm', { model: ['7', 0], strength: 1 });
    g[9] = n('TextEncodeQwenImageEditPlus', { clip: ['4', 0], vae: ['5', 0], image1: ['2', 0], prompt: o.prompt }, 'Positive');
    g[10] = n('TextEncodeQwenImageEditPlus', { clip: ['4', 0], vae: ['5', 0], image1: ['2', 0], prompt: o.negative ?? '' }, 'Negative');
    let pos: [string, number] = ['9', 0], neg: [string, number] = ['10', 0];
    if (o.preset === 'qwen-2511') {
        g[11] = n('FluxKontextMultiReferenceLatentMethod', { conditioning: pos, reference_latents_method: 'index_timestep_zero' });
        g[12] = n('FluxKontextMultiReferenceLatentMethod', { conditioning: neg, reference_latents_method: 'index_timestep_zero' });
        pos = ['11', 0]; neg = ['12', 0];
    }
    g[13] = n('VAEEncode', { pixels: ['2', 0], vae: ['5', 0] });
    g[14] = n('KSampler', { model: ['8', 0], positive: pos, negative: neg, latent_image: ['13', 0], seed: o.seed, steps, cfg, sampler_name: 'euler', scheduler: 'simple', denoise: 1 });
    g[15] = n('VAEDecode', { samples: ['14', 0], vae: ['5', 0] });
    let out: [string, number] = ['15', 0];
    if (o.removeBg && o.models.bgModel.trim()) {
        g[16] = n('LoadBackgroundRemovalModel', { bg_removal_name: o.models.bgModel });
        g[17] = n('RemoveBackground', { bg_removal_model: ['16', 0], image: out });
        g[18] = n('InvertMask', { mask: ['17', 0] });   // Join Image with Alpha takes a mask where 1 = hidden
        g[19] = n('JoinImageWithAlpha', { image: out, alpha: ['18', 0] });
        out = ['19', 0];
    }
    g[20] = n('SaveImage', { images: out, filename_prefix: 'Mundi_sprite' });
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [String(k), v]));
}

/** Every node id an input points to exists (a quick check of a graph before it is sent). */
export function graphProblems(g: Record<string, Node>): string[] {
    const out: string[] = [];
    for (const [id, node] of Object.entries(g)) for (const [k, v] of Object.entries(node.inputs)) {
        if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number' && !g[v[0]]) out.push(`${node.class_type} [${id}].${k} → missing node ${v[0]}`);
    }
    return out;
}

/* ---------- your own workflow (from SillyTavern's ComfyUI workflows) ---------- */

/**
 * Fills SillyTavern's placeholders in a workflow file: "%char_avatar%" gets the source picture, "%prompt%" the edit.
 * Returns the graph, or the placeholders nothing could fill.
 */
export function fillWorkflow(text: string, values: Record<string, string | number>): { graph?: any; missing: string[] } {
    let t = String(text ?? '');
    for (const [k, v] of Object.entries(values)) {
        const ph = `%${k}%`;
        // a placeholder that is a whole JSON string ("%seed%") becomes the value itself (numbers stay numbers)
        t = t.split(`"${ph}"`).join(JSON.stringify(v));
        t = t.split(ph).join(String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'));
    }
    const missing = [...new Set(t.match(/%[a-z_]+%/gi) ?? [])];
    if (missing.length) return { missing };
    try { return { graph: JSON.parse(t), missing: [] }; } catch { return { missing: ['(the workflow is not valid JSON)'] }; }
}

/* ---------- a plain background → transparency ---------- */

/** The color of the background, from the picture's border (what the model actually painted). */
export function borderColor(px: Uint8ClampedArray, w: number, h: number): [number, number, number] {
    let r = 0, g = 0, b = 0, c = 0;
    const take = (x: number, y: number) => { const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; c++; };
    const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
    for (let x = 0; x < w; x += step) { take(x, 0); take(x, h - 1); }
    for (let y = 0; y < h; y += step) { take(0, y); take(w - 1, y); }
    return [r / c, g / c, b / c];
}
const spillOf = (key: KeyColor, r: number, g: number, b: number) => (key === 'green' ? g - Math.max(r, b) : key === 'magenta' ? Math.min(r, b) - g : b - Math.max(r, g));
/**
 * Chroma key. A pixel becomes (partly) transparent by how much of the key color it has over its other channels,
 * but only where it touches the background: from the picture's border, or from a spot very close to the painted
 * background color (`tolerance`, a color distance), such as a gap between an arm and the body. So green eyes in the
 * middle of a face stay as they are. The key color that spilled onto the edges is taken out. Returns the share of
 * pixels made fully transparent.
 */
export function chromaKey(px: Uint8ClampedArray, w: number, h: number, key: KeyColor, ref: [number, number, number], tolerance = 70): number {
    const N = w * h;
    const bgS = Math.max(40, spillOf(key, ref[0], ref[1], ref[2]));
    const lo = bgS * 0.12, hi = bgS * 0.6;
    const cand = new Float32Array(N);   // the alpha a pixel would get if it is background
    const seen = new Uint8Array(N);
    const queue = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let p = 0; p < N; p++) {
        const i = p * 4, r = px[i], g = px[i + 1], b = px[i + 2];
        const s = spillOf(key, r, g, b);
        const near = Math.hypot(r - ref[0], g - ref[1], b - ref[2]) <= tolerance;
        cand[p] = near ? 0 : s <= lo ? 1 : s >= hi ? 0 : 1 - (s - lo) / (hi - lo);
        const x = p % w, y = (p / w) | 0;
        const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        if ((near || border) && cand[p] < 0.98) { seen[p] = 1; queue[qt++] = p; }
    }
    // spread through anything with some key in it, from those seeds
    while (qh < qt) {
        const p = queue[qh++], x = p % w, y = (p / w) | 0;
        const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of next) if (q >= 0 && !seen[q] && cand[q] < 0.98) { seen[q] = 1; queue[qt++] = q; }
    }
    let cleared = 0;
    for (let p = 0; p < N; p++) {
        if (!seen[p]) continue;
        const i = p * 4, r = px[i], g = px[i + 1], b = px[i + 2];
        // despill: pull the key channel(s) back to the others
        if (key === 'green') px[i + 1] = Math.min(g, Math.max(r, b));
        else if (key === 'blue') px[i + 2] = Math.min(b, Math.max(r, g));
        else { px[i] = Math.min(r, Math.max(g, r - (Math.min(r, b) - g))); px[i + 2] = Math.min(b, Math.max(g, b - (Math.min(r, b) - g))); }
        const alpha = Math.round(px[i + 3] * cand[p]);
        px[i + 3] = alpha;
        if (alpha === 0) cleared++;
    }
    return cleared / N;
}
