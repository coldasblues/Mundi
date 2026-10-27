// Mundi is English only for now (interface and its own AI instructions). The chat's language is left to SillyTavern
// and to the user's preset.
export const LANGS = [{ id: 'en', flag: '🇺🇸', name: 'English', ai: 'English' }];
// The interface's languages (Settings › Interface). Only Mundi's own screens: the AI's language is the preset's.
export const UI_LANGS = [{ id: 'en', name: 'English' }, { id: 'pt', name: 'Português (Brasil)' }, { id: 'es', name: 'Español' }];
export const lang = () => 'en';
export const uiLang = () => 'en';
export const aiLang = () => '';
export const aiLangName = (_id) => 'the same language as the story so far';
export const aiLangNote = () => '';
