// Add-ons: SillyTavern extensions Mundi knows how to use. Mundi finds out by itself whether each one is
// installed (and turned on); when it is, its button shows up in Mundi's scene. Each can be hidden in Settings.
import { state, notify, esc, settings, saveSettings, toast, ROOT_ID } from '../core/store.js';
import { ctx, chat, scriptText, scriptQuoted } from '../st/bridge.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

interface Addon { id: string; name: string; desc: string; url: string; cfg: string; native?: boolean; found: () => boolean; ready: () => boolean; off: string }
const ext = () => (ctx().extensionSettings ?? {}) as any;
const micEl = () => document.getElementById('microphone_button');

export const ADDONS: Addon[] = [
    {
        id: 'tts', name: 'Text to speech (TTS)', native: true, cfg: 'TTS',
        desc: 'Reads the characters\' lines aloud with SillyTavern\'s voices. Adds a speaker button to each line; automatic narration keeps working as set up in SillyTavern.',
        url: 'https://docs.sillytavern.app/extensions/tts/',
        found: () => !!ext().tts, ready: () => !!(ext().tts?.enabled ?? ext().tts?.ttsEnabled),
        off: 'Installed, but turned off: enable it in SillyTavern\'s Extensions → TTS.',
    },
    {
        id: 'stt', name: 'Speech Recognition', cfg: 'Speech Recognition',
        desc: 'Talk instead of typing: a microphone button next to Send. What you say goes into the message box (or is sent, if the extension is set to send by itself).',
        url: 'https://github.com/SillyTavern/Extension-Speech-Recognition',
        found: () => !!ext().speech_recognition || !!micEl(), ready: () => !!micEl() && micEl()!.style.display !== 'none',
        off: 'Installed, but no speech provider is chosen: pick one in SillyTavern\'s Extensions → Speech Recognition.',
    },
    {
        id: 'sd', name: 'Image Generation', native: true, cfg: 'Image Generation',
        desc: 'Draws pictures with SillyTavern\'s Image Generation. A picture button next to Send opens its options (the character, their face, you, the whole story, the last message, a background); the picture appears in the chat.',
        url: 'https://docs.sillytavern.app/extensions/stable-diffusion/',
        found: () => !!ext().sd, ready: () => !!ext().sd && !!String(ext().sd?.source ?? ''),
        off: 'Installed, but no image source is chosen: pick one in SillyTavern\'s Extensions → Image Generation.',
    },
];
const prefs = () => { const s = settings() as any; s.addons ??= {}; return s.addons as Record<string, boolean>; };
// On when it is installed and ready, unless hidden in Settings.
export const addonOn = (id: string) => { const a = ADDONS.find(x => x.id === id); return !!a && a.found() && a.ready() && prefs()[id] !== false; };

/* ---------- TTS: quiet about characters without a voice (on by default) ---------- */

export const ttsQuiet = () => (settings() as any).ttsQuiet !== false;
const NO_VOICE = [/^TTS voice for .+ is disabled\.?$/i, /^Specified voice for .+ was not found\./i, / not in voicemap\. Configure character/i, /^Unable to attain voiceId for /i];
// a TTS notice about a character without a voice (silenced when the option is on)
export const ttsNoise = (msg: unknown) => ttsQuiet() && NO_VOICE.some(r => r.test(String(msg ?? '').trim()));
(function quietTts() {
    const t = (window as any).toastr;
    if (!t || t.__mundiQuiet) return;
    t.__mundiQuiet = true;
    for (const kind of ['info', 'warning', 'error']) {
        const orig = t[kind].bind(t);
        t[kind] = (msg: unknown, ...rest: unknown[]) => (ttsNoise(msg) ? undefined : orig(msg, ...rest));
    }
})();

// Opens the Extensions tab and the extension's own settings in it.
function openExtSettings(title: string) {
    state.settingsTab = 'st-ext'; notify();
    setTimeout(() => {
        const heads = [...document.querySelectorAll<HTMLElement>('#extensions_settings .inline-drawer-header, #extensions_settings2 .inline-drawer-header')];
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const t = norm(title);
        const h = heads.find(x => norm(x.textContent ?? '') === t) ?? heads.find(x => norm(x.textContent ?? '').includes(t) || (t.length > 3 && t.includes(norm(x.textContent ?? ''))));
        if (!h) { toast('This extension has no settings of its own in the Extensions tab.', 'info'); return; }
        const content = h.parentElement?.querySelector<HTMLElement>('.inline-drawer-content');
        if (content && getComputedStyle(content).display === 'none') h.click();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        h.classList.add('mu-flash'); setTimeout(() => h.classList.remove('mu-flash'), 1600);
    }, 120);
}

export function addonsTab(): string {
    return `<section><h3>Add-ons</h3><p class="mu-muted">SillyTavern extensions that Mundi supports. Mundi checks by itself whether each one is installed; when it is, its button appears in the scene.</p>
        <div class="mu-addons">${ADDONS.map(a => {
            const found = a.found(), ready = found && a.ready();
            return `<article class="mu-addon ${ready ? 'is-ready' : ''}"><header><b>${esc(a.name)}</b>
                <span class="mu-addon-state ${ready ? 'is-ok' : found ? 'is-warn' : ''}">${ready ? 'Installed' : found ? 'Turned off' : 'Not installed'}${a.native ? ' · built into SillyTavern' : ''}</span></header>
                <p>${esc(a.desc)}</p>
                ${found && !ready ? `<p class="mu-muted">${esc(a.off)}</p>` : ''}
                ${a.id === 'tts' ? `<label class="mu-check ${ttsQuiet() ? '' : 'is-danger'}"><input type="checkbox" data-input="tts-quiet" ${ttsQuiet() ? 'checked' : ''}><span>Silence notices about characters without a voice${ttsQuiet() ? '' : ' <em>(not recommended to turn off)</em>'}<small>TTS warns about each character with no voice, a disabled voice or one missing from the voice map. On: those notices are not shown.</small></span></label>` : ''}
                <div class="mu-row"><label class="mu-check"><input type="checkbox" data-input="addon" data-id="${a.id}" ${prefs()[a.id] !== false ? 'checked' : ''} ${ready ? '' : 'disabled'}><span>Show its button in Mundi</span></label>
                    ${found ? `<button class="mu-ghost mu-addon-cfg" data-act="ext-config" data-title="${esc(a.cfg)}">${icon('gear')}<span>Configure</span></button>` : ''}
                    <a class="mu-addon-link" href="${esc(a.url)}" target="_blank" rel="noopener">${icon('globe')}<span>${a.native ? 'Documentation' : 'Get it on GitHub'}</span></a></div></article>`;
        }).join('')}</div></section>`;
}

/* ---------- image generation: a picture button next to Send, with SillyTavern's own options ---------- */

const SD = { open: false };
// the same choices (and order) as SillyTavern's own image button
const SD_MODES: [string, string][] = [['you', 'Yourself'], ['face', 'Your face'], ['me', 'Me'], ['scene', 'The whole story'], ['last', 'The last message'], ['raw_last', 'Raw last message'], ['background', 'Background']];
export function sdButton(): string {
    if (!addonOn('sd')) return '';
    return `<span class="mu-sdwrap"><button class="${SD.open ? 'is-on' : ''}" data-act="sd-menu" title="Generate a picture" aria-expanded="${SD.open}">${icon('image')}</button>${SD.open
        ? `<div class="mu-sdmenu mh-glass" role="menu">${SD_MODES.map(([v, l]) => `<button class="mu-ghost" role="menuitem" data-act="sd-gen" data-v="${v}">${l}</button>`).join('')}</div>` : ''}</span>`;
}
// a click anywhere else closes the menu
document.addEventListener('pointerdown', (e) => { if (SD.open && !(e.target as Element)?.closest?.('.mu-sdwrap')) { SD.open = false; notify(); } }, true);

/* ---------- speech recognition: the microphone next to Send ---------- */

let listening = false, watching = false;
const isRecording = () => !!micEl()?.classList.contains('fa-microphone-slash');
export function micButton(): string {
    if (!addonOn('stt')) return '';
    return `<button class="mu-mic ${listening ? 'is-on' : ''}" data-act="addon-mic" title="${listening ? 'Stop and transcribe' : 'Speak'}">${icon('mic')}</button>`;
}
// While SillyTavern's microphone records, Mundi's shows it; afterwards the transcript is copied into Mundi's box.
function watchMic() {
    const b = micEl(); if (!b || watching) return;
    watching = true;
    new MutationObserver(() => {
        const rec = isRecording();
        if (rec === listening) return;
        listening = rec;
        if (!rec) followTranscript();
        notify();
    }).observe(b, { attributes: true, attributeFilter: ['class'] });
}
function followTranscript() {
    const ta = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
    if (!ta) return;
    const before = ta.value; const until = Date.now() + 20000;
    const t = setInterval(() => {
        if (ta.value !== before && ta.value.trim()) { state.composer = ta.value; notify(); focusComposer(); clearInterval(t); }
        else if (Date.now() > until) clearInterval(t);
    }, 250);
}
const focusComposer = () => document.getElementById(ROOT_ID)?.querySelector<HTMLTextAreaElement>('[data-focus="composer"]')?.focus();

/* ---------- TTS: read a line aloud ---------- */

// Reads any text aloud (the diary): in your persona's voice, or TTS's default voice when you have none.
export async function speakText(text: string, voice = '') {
    const t = scriptText(text.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!t) return;
    try { await ctx().executeSlashCommandsWithOptions(voice ? `/speak voice="${scriptQuoted(voice)}" ${t}` : `/speak ${t}`); }
    catch { if (voice) { try { await ctx().executeSlashCommandsWithOptions(`/speak ${t}`); } catch (e: any) { toast(String(e?.message ?? e), 'error'); } } }
}
// The "read aloud" button for a diary entry (shown only when TTS is installed and on).
export const diaryTtsButton = (day: number) => (addonOn('tts') ? `<button class="mu-ghost mu-tts-diary" data-act="diary-say" data-day="${day}" title="Read it aloud">${icon('speaker')}<span>Read aloud</span></button>` : '');

export const ttsButton = (i: number) => (addonOn('tts') ? `<button data-act="addon-say" data-i="${i}" title="Read aloud">${icon('speaker')}</button>` : '');

Object.assign(ACT, {
    'sd-menu': () => { SD.open = !SD.open; notify(); },
    'sd-gen': async (el) => {
        SD.open = false; notify();
        try { await ctx().executeSlashCommandsWithOptions(`/sd ${scriptText(el.dataset.v)}`); }
        catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    },
    'addon-mic': () => {
        const b = micEl();
        if (!b) { toast('Speech Recognition is not available.', 'warn'); return; }
        watchMic();
        // what is already typed in Mundi goes to SillyTavern's box first, so "append" mode adds to it
        const ta = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
        if (ta && !isRecording()) ta.value = state.composer;
        b.click();
        setTimeout(() => { listening = isRecording(); notify(); }, 300);
    },
    'addon-say': async (el) => {
        const m = chat()[Number(el.dataset.i)];
        if (!m) return;
        const text = scriptText(String(m.mes ?? '').replace(/<[^>]+>/g, '')).trim();
        if (!text) return;
        try { await ctx().executeSlashCommandsWithOptions(`/speak voice="${scriptQuoted(m.name)}" ${text}`); }
        catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    },
});
Object.assign(ACT, {
    'ext-config': (el) => openExtSettings(el.dataset.title ?? ''),
    'diary-say': async (el) => {
        const g = (await import('../core/store.js')).game(); if (!g) return;
        const text = (await import('../sim/diary.js')).diaryShown(g, el.dataset.day!);
        const { personaName } = await import('../st/bridge.js');
        await speakText(text, personaName());
    },
});
Object.assign(INPUT, {
    addon: (el) => { prefs()[el.dataset.id!] = el.checked; saveSettings(); notify(); },
    'tts-quiet': (el) => { (settings() as any).ttsQuiet = el.checked; saveSettings(); notify(); },
});
