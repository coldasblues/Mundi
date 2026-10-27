export function setWorldDicts(_id, _dicts) { }
let dict = null;
let pats = [];
let depth = 0;
// a part inside a pattern: translated too, as far as it can be
const trDeep = (part) => { try {
    return tr(part);
}
finally {
    depth--;
} };
let current = 'en';
export const trLang = () => current;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function build(d) {
    dict = {};
    pats = [];
    for (const [k, v] of Object.entries(d)) {
        if (!v)
            continue;
        const key = norm(k);
        if (!/\{\d+\}/.test(key)) {
            dict[key] = v;
            continue;
        }
        // a pattern with almost no fixed words around open ends ("{0} and {1}") would catch any sentence: left out
        const fixed = key.replace(/\{\d+\}/g, '').replace(/[^A-Za-z]/g, '');
        if (/^\{\d+\}/.test(key) && /\{\d+\}$/.test(key) && fixed.length < 8)
            continue;
        if (fixed.length < 3 || /^(The|A|An) \{\d+\}$/.test(key))
            continue; // "The {0}" would catch any name
        const idx = [];
        const re = new RegExp(`^${key.split(/(\{\d+\})/).map(p => { const m = /^\{(\d+)\}$/.exec(p); if (m) {
            idx.push(Number(m[1]));
            return '(.+?)';
        } return escRe(p); }).join('')}$`, 's');
        pats.push({ re, idx, out: v, word: /^[A-Za-z]+ \{\d+\}$/.test(key) });
    }
    // the most specific first: the one with the most fixed letters
    pats.sort((a, b) => b.re.source.replace(/\(\.\+\?\)/g, '').length - a.re.source.replace(/\(\.\+\?\)/g, '').length);
}
// Loads a language ('en': none). The dictionaries are loaded only when chosen.
export async function setLang(id) {
    current = id || 'en';
    if (current === 'en') {
        dict = null;
        pats = [];
        return;
    }
    try {
        const m = await import(`../lang/${current}.js`);
        build(m.default ?? m.DICT ?? {});
    }
    catch (e) {
        console.warn('[Mundi] language', current, e);
        dict = null;
        pats = [];
        current = 'en';
    }
}
// One text in the current language (as it is when there is no translation).
export function tr(text) {
    if (!dict)
        return text;
    const t = norm(text);
    if (!t || !/[A-Za-z]/.test(t))
        return text;
    const out = look(t);
    if (out !== null)
        return out;
    // an icon or emoji before it ("🎉 A party at home"), or a colon after it ("Now:"): the words alone
    const m = /^([^A-Za-z"“¿¡(]*)(.*?)([\s:;,.…!?·–—-]*)$/s.exec(t);
    if (m && (m[1] || m[3]) && m[2]) {
        const core = look(m[2]);
        if (core !== null)
            return m[1] + core + m[3];
    }
    // parts joined by " · " ("Cooking · 3 days · $120"): each part on its own, the ones it knows
    for (const sep of [' · ', ' / '])
        if (t.includes(sep)) {
            const parts = t.split(sep);
            const outs = parts.map(p => tr(p));
            if (outs.some((o, i) => o !== parts[i]))
                return outs.join(sep);
        }
    // "Hygiene: Fresh": both sides known
    {
        const i = t.indexOf(': ');
        if (i > 0) {
            const a = t.slice(0, i), b = t.slice(i + 2);
            const ta = look(a), tb = b && /[A-Za-z]/.test(b) ? look(b) : b;
            if (ta !== null && tb !== null)
                return `${ta}: ${tb}`;
        }
    }
    return text;
}
function look(t) {
    const hit = dict[t];
    if (hit !== undefined)
        return hit;
    // the same word in lower case ("until evening"): the translation in lower case too
    if (/^[a-z]/.test(t)) {
        const up = dict[t[0].toUpperCase() + t.slice(1)];
        if (up !== undefined && !up.includes('{'))
            return up[0].toLowerCase() + up.slice(1);
    }
    for (const p of pats) {
        const m = p.re.exec(t);
        if (!m)
            continue;
        let out = p.out;
        // "Floor {0}", "Spring {0}": one word and a number, never a name ("Spring Street Fair")
        if (p.word && !/\d/.test(m[1]))
            continue;
        p.idx.forEach((n, i) => { const part = m[i + 1]; out = out.split(`{${n}}`).join(depth < 3 ? (depth++, trDeep(part)) : part); });
        return out;
    }
    return null;
}
// The same text with its spaces around it kept ("  Back " → "  Voltar ").
const trKeep = (s) => { const t = tr(s); if (t === s)
    return s; const lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0]; return lead + t.trim() + trail; };
const SKIP = 'script,style,textarea,[data-notr],[contenteditable],[data-native],.mu-line-text,.mes_text,code,pre';
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
export function translateTree(root) {
    if (!dict || !root)
        return;
    const walk = (n) => {
        if (n.nodeType === 3) {
            const v = n.nodeValue ?? '';
            if (/[A-Za-z]/.test(v)) {
                const t = trKeep(v);
                if (t !== v)
                    n.nodeValue = t;
            }
            return;
        }
        if (n.nodeType !== 1 && n.nodeType !== 11)
            return;
        if (n.nodeType === 1) {
            const el = n;
            const field = el.matches('textarea, input'); // a field: its hint and title, never what is typed in it
            if (!field && el.matches(SKIP))
                return;
            for (const a of ATTRS) {
                const v = el.getAttribute(a);
                if (v && /[A-Za-z]/.test(v)) {
                    const t = tr(v);
                    if (t !== v)
                        el.setAttribute(a, t);
                }
            }
            if (el.tagName === 'TEMPLATE')
                walk(el.content);
            if (field)
                return;
        }
        for (let c = n.firstChild; c; c = c.nextSibling)
            walk(c);
    };
    walk(root);
}
// What is added to the screen outside the normal drawing (toasts, pop-ups made by hand) is translated as it comes.
let observer = null;
export function installTranslator(root) {
    observer?.disconnect();
    observer = new MutationObserver(list => {
        if (!dict)
            return;
        for (const m of list) {
            if (m.type === 'childList')
                m.addedNodes.forEach(n => { const p = n.parentElement; if (!p || !p.closest(SKIP))
                    translateTree(n); });
            else if (m.type === 'characterData') {
                const n = m.target;
                const p = n.parentElement;
                if (p && !p.closest(SKIP)) {
                    const v = n.nodeValue ?? '';
                    const t = trKeep(v);
                    if (t !== v)
                        n.nodeValue = t;
                }
            }
        }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
}
// After the screen is drawn (already translated): what the drawing itself changed is not translated a second time.
export const settle = () => { observer?.takeRecords(); };
export const known = (text, _l) => (dict ? dict[norm(text)] ?? null : null);
