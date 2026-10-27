// The Lexicon: the same feature, named for each style. A phone message in Modern is a letter in Medieval; the
// mechanics are the same, only the words change. A world can rename any term (world.lexicon); a style without
// its own word falls back to Modern. Texts are in English and translated like the rest of the interface.
import { styleOf, appsOf, worldTags, type WorldDef } from './world.js';

export const LEXICON: Record<string, Record<string, string>> = {
    matchLine: { modern: 'You and {0} liked each other.', medieval: '{0} would gladly meet you.' },
    matchTitle: { modern: 'It\'s a match!', medieval: 'The matchmaker has news!' },
    profileAbout: { modern: 'About you', medieval: 'Tell the matchmaker about yourself' },
    choosePath: { modern: 'You are ready for the next step at {0}: choose your path in the Jobs app.', medieval: 'You are ready for the next step in your trade ({0}): choose your path on the Trade page of your journal.' },
    choosePathTitle: { modern: 'Choose your path', medieval: 'Choose your path' },
    jobApply: { modern: 'Apply', medieval: 'Ask for work' },
    balance: { modern: 'Balance', medieval: 'In your purse' },
    nextSuitor: { modern: 'Keep swiping', medieval: 'Hear of someone else' },
    like: { modern: 'Like', medieval: 'I would like to meet them' },
    matches: { modern: 'Matches', medieval: 'Introductions' },
    writeMessage: { modern: 'Message', medieval: 'Write a letter' },
    messagePlaceholder: { modern: 'Message', medieval: 'Write a letter…' },
    noMatches: { modern: 'No matches yet.', medieval: 'No introductions yet.' },
    noMovements: { modern: 'No movements yet.', medieval: 'Nothing in the ledger yet.' },
    noCandidates: { modern: 'No one new around. Come back another day.', medieval: 'The matchmaker knows no one else for now. Come back another day.' },
    openings: { modern: 'Openings', medieval: 'Work to be had' },
    pass: { modern: 'Pass', medieval: 'Not for me' },
    emptyThread: { modern: 'Say hi.', medieval: 'No letters yet. Write the first one.' },
    sendMessage: { modern: 'Send a message', medieval: 'Write a letter' },
    send: { modern: 'Send', medieval: 'Send the letter' },
    profileStart: { modern: 'Start', medieval: 'Hand it to the matchmaker' },
    statement: { modern: 'Statement', medieval: 'Ledger' },
    noContacts: { modern: 'You have no contacts yet. Meet people around the city.', medieval: 'No one to write to yet. Meet people around the kingdom.' },
    noJob: { modern: 'You have no job. Pick one below; you work at its place, on the map.', medieval: 'You have no trade. Pick one below; you work at its place, on the map.' },
    yourJob: { modern: 'Your job', medieval: 'Your trade' },
    yourProfile: { modern: 'Your profile', medieval: 'Your entry' },
    typing: { modern: 'typing…', medieval: 'writing back…' },
    newMessage: { modern: 'New message from {0}.', medieval: 'The courier brought you a letter from {0}.' },
    device: { modern: 'Phone', medieval: 'Journal' },
    journal: { modern: 'Journal', medieval: 'Chronicle' },
    journalEmpty: { modern: 'Nothing written yet. What you live is noted here by itself.', medieval: 'Nothing written yet. What you live is noted here by itself.' },
    readAsProse: { modern: 'Read it as a diary', medieval: 'Read it as a chronicle' },
    // where things are done: "in the Homes app" / "on the Lodging page of your journal" ({0} = the app's name)
    appRef: { modern: 'in the {0} app', medieval: 'on the {0} page of your journal' },
    // bills: the same three bills everywhere; Power is the firewood of a medieval home
    bill_rent: { modern: 'Rent', medieval: 'Rent' },
    bill_water: { modern: 'Water', medieval: 'Water' },
    bill_power: { modern: 'Power', medieval: 'Firewood' },
    billDue: { modern: '{0} is due: {1}. Pay it {2} within a week.', medieval: '{0} is due: {1}. Pay it {2} within a week.' },
    cutRent: { modern: 'You did not pay the rent for a week: you are locked out of your home until you pay it ({0}).', medieval: 'You did not pay the rent for a week: the landlord changed the lock until you pay it ({0}).' },
    cutWater: { modern: 'Your water was cut off: no shower, tap or cooking at home until you pay the bill ({0}).', medieval: 'The water carrier stopped coming: no washing or cooking at home until you pay him ({0}).' },
    cutPower: { modern: 'Your power was cut off: no stove, TV, computer or machines at home until you pay the bill ({0}).', medieval: 'You ran out of firewood: no fire to cook or sit by at home until you pay for more ({0}).' },
    backRent: { modern: 'Rent paid: you can go back into your home.', medieval: 'Rent paid: the landlord gave you back your key.' },
    backWater: { modern: 'Water is back on.', medieval: 'The water carrier is back.' },
    backPower: { modern: 'Power is back on.', medieval: 'You have firewood again.' },
    cutGeneric: { modern: '{0} was not paid for a week: it stopped until you pay it ({1}).', medieval: '{0} was not paid for a week: it stopped until you pay it ({1}).' },
    backGeneric: { modern: '{0} is back.', medieval: '{0} is back.' },
    noGeneric: { modern: '{0} is unpaid.', medieval: '{0} is unpaid.' },
    lockedOut: { modern: 'You are locked out until you pay the rent.', medieval: 'The landlord locked you out until you pay the rent.' },
    noWater: { modern: 'The water is cut off.', medieval: 'There is no water at home.' },
    noPower: { modern: 'The power is cut off.', medieval: 'There is no firewood at home.' },
    // things at home that break (their names are the world's: homes.breakables)
    brokeHome: { modern: 'Oh no: {0} broke at home. Fix it yourself, or pay someone.', medieval: 'Oh no: {0} broke at home. Pay someone to fix it.' },
    // at someone's door
    doorNobody: { modern: 'You ring {0}\'s doorbell. Nobody answers.', medieval: 'You knock on {0}\'s door. Nobody answers.' },
    doorIn: { modern: 'You ring the doorbell. {0} opens the door and lets you in.', medieval: 'You knock. {0} opens the door and lets you in.' },
    doorOut: { modern: 'You ring the doorbell. {0} talks to you through the door, but does not let you in.', medieval: 'You knock. {0} talks to you through the door, but does not let you in.' },
    // the phone / journal screens
    inYourDevice: { modern: '“{0}” in your phone', medieval: '“{0}” in your journal' },
    searchMessages: { modern: 'Search names and messages', medieval: 'Search names and letters' },
    deleteMsgHint: { modern: 'Tap a message to delete it.', medieval: 'Tap a letter to throw it away.' },
    editThread: { modern: 'Edit: contact name, delete messages', medieval: 'Edit: the name you call them, throw letters away' },
    deleteMsg: { modern: 'Delete this message', medieval: 'Throw this letter away' },
    noneMet: { modern: 'You have not met anyone yet.', medieval: 'You have not met anyone yet.' },
    billsLine: { modern: 'Bills: {0} a week · pay them {1}', medieval: 'Bills: {0} a week · pay them {1}' },
    myHome: { modern: 'My home', medieval: 'Where you live' },
    yourHome: { modern: 'your home', medieval: 'your home' },
    homesForRent: { modern: 'Homes for rent', medieval: 'Lodgings to let' },
    billsNote: { modern: 'Bills are weekly. One left unpaid for a week is cut off until you pay it (for the rent, you are locked out of your home).', medieval: 'Bills are weekly. One left unpaid for a week stops until you pay it (for the rent, the landlord locks you out).' },
    movingNote: { modern: 'Moving costs one week of rent in advance; your bills start over in the new home.', medieval: 'Moving costs one week of rent in advance; your bills start over in the new home.' },
    cutOff: { modern: 'Cut off', medieval: 'Stopped' },
    lockedOutShort: { modern: 'Locked out', medieval: 'Locked out' },
    closeDevice: { modern: 'Close the phone', medieval: 'Close the journal' },
    // words the AI is given (and a few fallbacks), so a medieval character writes letters instead of texting
    msgNoun: { modern: 'message', medieval: 'letter' },
    msgWrite: { modern: 'text', medieval: 'write' },
    stoodUpFallback: { modern: 'I waited an hour for you. You didn\'t even text. Seriously?', medieval: 'I waited an hour for you. Not a word, not a note. Truly?' },
    stoodUpFact: { modern: '{0} texted {u}, angry about being stood up: "{1}"', medieval: '{0} wrote to {u}, angry about being stood up: "{1}"' },
    needCourse: { modern: 'You need the course "{0}" first (at home or at the University).', medieval: 'You need the lessons "{0}" first.' },
    // courses are lessons in a medieval world
    courses: { modern: 'Courses', medieval: 'Lessons' },
    studyWhere: { modern: 'at home or at the University', medieval: 'at home or at a place of learning' },
    takeCourse: { modern: 'Take a course…', medieval: 'Take lessons…' },
    noCourses: { modern: 'No courses yet. Take one at home or at the University.', medieval: 'No lessons yet. Take some at home or at a place of learning.' },
    finishCourse: { modern: 'Finish your course first', medieval: 'Finish your lessons first' },
    neededFor: { modern: 'Needed for', medieval: 'Asked for by' },
    planTitleEg: { modern: 'e.g. Movie night, Her birthday dinner', medieval: 'e.g. Harvest supper, Her name day' },
    dateNeeds: { modern: 'A date needs a closer bond ({0}/{1}) or a Spark match.', medieval: 'Courting needs a closer bond ({0}/{1}) or an introduction by the matchmaker.' },
    jobsHere: { modern: 'Jobs here', medieval: 'Work to be had here' },
    applyThere: { modern: 'Go there to apply, or use the phone.', medieval: 'Go there to ask for work, or use your journal.' },
    quitFirst: { modern: 'You already have a job. Quit it first in the phone.', medieval: 'You already have a trade. Leave it first in your journal.' },
    lockedOutGo: { modern: 'You are locked out: pay the rent {0} first.', medieval: 'The landlord locked you out: pay the rent {0} first.' },
    lockedOutHint: { modern: 'Pay the rent {0} to get back in', medieval: 'Pay the rent {0} to get back in' },
    needsCourse: { modern: 'Needs the course', medieval: 'Needs the lessons' },
    courseDone: { modern: 'Course done ✓', medieval: 'Lessons done ✓' },
    // the profile and the help
    profile: { modern: 'Profile', medieval: 'Character' },
    help: { modern: 'Help', medieval: 'Guide' },
    openToWork: { modern: 'Open to work', medieval: 'Looking for a trade' },
    noJobYet: { modern: 'No job yet. Apply {0} or at the place itself.', medieval: 'No trade yet. Ask for work {0} or at the place itself.' },
    noGoalYet: { modern: 'None yet. Pick one {0}.', medieval: 'None yet. Pick one {0}.' },
    browseCourses: { modern: 'Browse courses', medieval: 'See the lessons' },
    learnedIn: { modern: 'Learned in courses', medieval: 'Learned in lessons' },
    coursesShort: { modern: 'courses', medieval: 'lessons' },
    profileHelp: { modern: 'Your skills, traits, courses, life goals and career, like a professional profile.', medieval: 'Who you are: your skills, traits, lessons, ambitions and trade.' },
    reachThem: { modern: 'Find them where they are, or text them.', medieval: 'Find them where they are, or write them a letter.' },
    standUpHelp: { modern: 'They wait an hour, text you, and remember it.', medieval: 'They wait an hour, write you an angry letter, and remember it.' },
    interviewHelp: { modern: 'Applying is a roll: the traits the job looks for are your bonus (the chance is shown). If it goes wrong, try again the next day. Shower first: nobody hires someone who smells.', medieval: 'Asking for work is a roll: the traits the trade looks for are your bonus (the chance is shown). If it goes wrong, try again the next day. Wash first: nobody takes on someone who smells.' },
    homeUnwind: { modern: 'Every home has an old TV to unwind a little; better things come from {0}.', medieval: 'Every home has a hearth to sit by; better things come from {0}.' },
    deviceIntro: { modern: 'The phone in the corner holds your apps.', medieval: 'The journal in the corner holds your letters, the people you know and everything you keep track of.' },
    messagesHelp: { modern: 'Text anyone you have met. The ✎ pencil renames a contact and lets you delete messages.', medieval: 'Write to anyone you have met; a courier carries your letters. The ✎ pencil changes the name you call them and lets you throw letters away.' },
    socialHelp: { modern: 'The social network and the dating app.', medieval: 'The notice board in the square, and the matchmaker who introduces you to people.' },
    // someone asks you out
    // the world around you (region news: {0} = the region)
    overheard: { modern: 'You overhear people talking: "{0}"', medieval: 'You overhear folk whispering: "{0}"' },
    heardAround: { modern: 'Heard around town', medieval: 'Whispers in town' },
    journey: { modern: 'Road trip', medieval: 'A journey' },
    journeyText: { modern: 'The trip takes about {0} hours: {1} night(s) on the road.', medieval: 'The road takes about {0} hours: {1} night(s) under the open sky.' },
    makeCamp: { modern: 'Stop for the night', medieval: 'Make camp' },
    pushOn: { modern: 'Drive through', medieval: 'Push on through the night' },
    quests: { modern: 'Missions', medieval: 'Quests' },
    newQuest: { modern: 'New mission: {0}.', medieval: 'New quest: {0}.' },
    grimoire: { modern: 'Abilities', medieval: 'Grimoire' },
    sheet: { modern: 'Character', medieval: 'Character sheet' },
    rollAsk: { modern: 'Roll for it', medieval: 'Roll the dice' },
    bill_upkeep: { modern: 'Gear upkeep', medieval: 'Upkeep of arms and gear' },
    // life and society
    letter: { modern: 'message', medieval: 'letter' },
    alias: { modern: 'Alter ego', medieval: 'Mask' },
    apprentice: { modern: 'Mentee', medieval: 'Apprentice' },
    festival: { modern: 'Holiday', medieval: 'Festival' },
    factions: { modern: 'Organizations', medieval: 'Guilds and factions' },
    tensionUp: { modern: 'Something has people on edge in {0}. Tension is running high.', medieval: 'Unrest stirs in {0}. Folk are on edge.' },
    tensionDown: { modern: 'Things have calmed down in {0}.', medieval: 'The unrest in {0} has died down.' },
    pricesUp: { modern: 'Prices are going up in {0}.', medieval: 'Prices climb at the stalls of {0}.' },
    pricesDown: { modern: 'Prices are down in {0} for now.', medieval: 'Goods are cheap in {0} for now.' },
    inviteText: { modern: 'Hey! Want to meet at {0} around {1}?', medieval: 'Would you meet me at {0} around {1}?' },
    // adventure words by style and tone (realistic: martial arts and the police; fantasy: powers, or magic in the old days)
    spellNoun: { modern: 'technique', 'modern-fantasy': 'power', medieval: 'spell' },
    spellsNoun: { modern: 'techniques', 'modern-fantasy': 'powers', medieval: 'spells' },
    castBtn: { modern: 'Use', 'modern-fantasy': 'Use', medieval: 'Cast' },
    castVerb: { modern: 'use', 'modern-fantasy': 'use', medieval: 'cast' },
    magicMenu: { modern: 'TECHNIQUE', 'modern-fantasy': 'POWER', medieval: 'MAGIC' },
    spellIcon: { modern: '🥋', 'modern-fantasy': '⚡', medieval: '🔮' },
    whichSpell: { modern: 'Which technique?', 'modern-fantasy': 'Which power?', medieval: 'Which spell?' },
    noFightSpell: { modern: 'No technique for a fight is ready.', 'modern-fantasy': 'No power for a fight is ready.', medieval: 'No spell for a fight is prepared.' },
    noSpells: { modern: 'No techniques learned yet.', 'modern-fantasy': 'No powers yet.', medieval: 'No spells known yet.' },
    notCaster: { modern: '{0} has no techniques.', 'modern-fantasy': '{0} has no powers.', medieval: '{0} does not cast spells.' },
    learnSpells: { modern: 'Learn {0} new technique(s)', 'modern-fantasy': 'Unlock {0} new power(s)', medieval: 'Learn {0} new spell(s)' },
    spellLearned: { modern: 'Technique learned.', 'modern-fantasy': 'Power unlocked.', medieval: 'Spell learned.' },
    cannotCast: { modern: 'You cannot use that now.', 'modern-fantasy': 'You cannot use that now.', medieval: 'You cannot cast that now.' },
    youCast: { modern: '🥋 You use {0}.', 'modern-fantasy': '⚡ You use {0}.', medieval: '✨ You cast {0}.' },
    schoolsWord: { modern: 'Fighting styles', 'modern-fantasy': 'Kinds of power', medieval: 'Schools of magic' },
    healer: { modern: 'doctor', 'modern-fantasy': 'doctor', medieval: 'healer' },
    seeHealer: { modern: 'See a doctor', 'modern-fantasy': 'See a doctor', medieval: 'See the healer' },
    atHealer: { modern: 'At a hospital or clinic', 'modern-fantasy': 'At a hospital or clinic', medieval: 'At a healer' },
    healerOnly: { modern: 'Only a doctor can treat you (a hospital or a clinic).', 'modern-fantasy': 'Only a doctor can treat you (a hospital or a clinic).', medieval: 'Only a healer can treat you.' },
    healerAsks: { modern: 'The doctor asks {0}.', 'modern-fantasy': 'The doctor asks {0}.', medieval: 'The healer asks {0}.' },
    healerDone: { modern: 'The doctor treats you: the afflictions are gone, and your injuries will mend by tomorrow.', 'modern-fantasy': 'The doctor treats you: the afflictions are gone, and your injuries will mend by tomorrow.', medieval: 'The healer treats you: the afflictions are gone, and your injuries will mend by tomorrow.' },
    guards: { modern: 'the police', 'modern-fantasy': 'the police', medieval: 'the guards' },
    guardsTitle: { modern: 'The police', 'modern-fantasy': 'The police', medieval: 'The guards' },
    guardsStop: { modern: '🚓 The police stop you: "You are wanted here ({0})."', 'modern-fantasy': '🚓 The police stop you: "You are wanted here ({0})."', medieval: '🛡️ Guards stop you: "You are wanted here (a bounty of {0})."' },
    resistArrest: { modern: 'Resist the police (more bounty)', 'modern-fantasy': 'Resist the police (more bounty)', medieval: 'Fight the guards (more bounty)' },
    mercs: { modern: 'Bodyguards for hire', 'modern-fantasy': 'Heroes for hire', medieval: 'Sellswords for hire' },
    mercAlone: { modern: 'You go alone. People who trust you (bond 40+) can come along; bodyguards can be hired at a bar.', 'modern-fantasy': 'You go alone. People who trust you (bond 40+) can come along; heroes for hire wait at bars.', medieval: 'You travel alone. People who trust you (bond 40+) can join you; sellswords can be hired at a tavern or an inn.' },
    mercLeaves: { modern: 'The bodyguard leaves.', 'modern-fantasy': 'The hero for hire leaves.', medieval: 'The sellsword takes their leave.' },
    askTavern: { modern: 'Ask around (bar)', 'modern-fantasy': 'Ask around (bar)', medieval: 'Ask around (tavern)' },
    gems: { modern: 'mods', 'modern-fantasy': 'mods', medieval: 'gems' },
};
// "in the Homes app" / "on the Lodging page of your journal", with the name this world gives the app.
export const appRef = (w: WorldDef | null | undefined, id: string) => lex(w, 'appRef', w ? appsOf(w).find(a => a.id === id)?.name ?? id : id);
// The terms as the world creator shows them, in groups (any term not listed here goes to "Other").
export const LEX_GROUPS: { title: string; keys: string[] }[] = [
    { title: 'The device and messages', keys: ['device', 'journal', 'appRef', 'writeMessage', 'messagePlaceholder', 'send', 'sendMessage', 'typing', 'newMessage', 'emptyThread', 'noContacts', 'msgNoun', 'msgWrite', 'inYourDevice', 'searchMessages', 'deleteMsgHint', 'editThread', 'deleteMsg', 'closeDevice', 'readAsProse', 'journalEmpty'] },
    { title: 'Work and money', keys: ['choosePath', 'choosePathTitle', 'jobApply', 'openings', 'noJob', 'yourJob', 'balance', 'statement', 'noMovements', 'openToWork', 'noJobYet', 'jobsHere', 'applyThere', 'quitFirst'] },
    { title: 'Courses', keys: ['courses', 'coursesShort', 'studyWhere', 'takeCourse', 'noCourses', 'finishCourse', 'neededFor', 'needsCourse', 'courseDone', 'needCourse', 'browseCourses', 'learnedIn'] },
    { title: 'Home and bills', keys: ['bill_rent', 'bill_water', 'bill_power', 'billDue', 'billsLine', 'cutRent', 'cutWater', 'cutPower', 'cutGeneric', 'backRent', 'backWater', 'backPower', 'backGeneric', 'lockedOut', 'lockedOutShort', 'lockedOutGo', 'lockedOutHint', 'noWater', 'noPower', 'noGeneric', 'cutOff', 'billsNote', 'myHome', 'yourHome', 'homesForRent', 'movingNote', 'brokeHome', 'homeUnwind'] },
    { title: 'Life and society', keys: ['letter', 'alias', 'apprentice', 'festival', 'factions'] },
    { title: 'Adventure (RPG)', keys: ['spellNoun', 'spellsNoun', 'castBtn', 'castVerb', 'magicMenu', 'spellIcon', 'whichSpell', 'noFightSpell', 'noSpells', 'notCaster', 'learnSpells', 'spellLearned', 'cannotCast', 'youCast', 'schoolsWord', 'healer', 'seeHealer', 'atHealer', 'healerOnly', 'healerAsks', 'healerDone', 'guards', 'guardsTitle', 'guardsStop', 'resistArrest', 'mercs', 'mercAlone', 'mercLeaves', 'askTavern', 'gems', 'journey', 'journeyText', 'makeCamp', 'pushOn', 'quests', 'newQuest', 'grimoire', 'sheet', 'rollAsk', 'bill_upkeep'] },
    { title: 'The world around you', keys: ['tensionUp', 'tensionDown', 'pricesUp', 'pricesDown', 'overheard', 'heardAround'] },
    { title: 'People, plans and love', keys: ['inviteText', 'doorNobody', 'doorIn', 'doorOut', 'reachThem', 'standUpHelp', 'stoodUpFallback', 'stoodUpFact', 'noneMet', 'dateNeeds', 'planTitleEg', 'matchTitle', 'profileAbout', 'nextSuitor', 'like', 'pass', 'matches', 'noMatches', 'noCandidates', 'profileStart', 'yourProfile'] },
    { title: 'Profile and help', keys: ['profile', 'help', 'profileHelp', 'deviceIntro', 'messagesHelp', 'socialHelp', 'interviewHelp', 'noGoalYet'] },
];
export const lexGroups = () => {
    const listed = new Set(LEX_GROUPS.flatMap(g => g.keys));
    const other = Object.keys(LEXICON).filter(k => !listed.has(k));
    return other.length ? [...LEX_GROUPS, { title: 'Other', keys: other }] : LEX_GROUPS;
};
// The word a style gives a term (what the world uses when it has none of its own).
// A row can have a word per style and tone ("modern-fantasy"), per style ("medieval"), or the modern one.
const toneOf = (w: WorldDef | null | undefined) => (worldTags(w).includes('fantasy') ? 'fantasy' : 'realistic');
const pickWord = (w: WorldDef | null | undefined, row: Record<string, string> | undefined) => row?.[`${styleOf(w)}-${toneOf(w)}`] ?? row?.[styleOf(w)] ?? row?.modern;
export const lexDefault = (w: WorldDef | null | undefined, key: string) => String(pickWord(w, LEXICON[key]) ?? key);
export type LexKey = keyof typeof LEXICON;
export function lex(w: WorldDef | null | undefined, key: string, ...args: string[]): string {
    const own = (w as any)?.lexicon?.[key];   // the world's own word (an empty one means: the style's)
    const row = LEXICON[key];
    const s = String(own || (pickWord(w, row) ?? key));
    return s.replace(/\{(\d)\}/g, (_, n) => args[Number(n)] ?? '');
}
