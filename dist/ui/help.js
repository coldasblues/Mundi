// The phone's Help app: a window in the middle of the screen that explains each part of the game, topic by topic.
import { notify, game } from '../core/store.js';
import { getWorld, appsOf, styleOf, isScenario } from '../core/world.js';
import { lex, appRef } from '../core/lexicon.js';
import { billList as bills } from '../sim/bills.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
// Written with the world's own words: its apps, bills, courses and device (a phone, a journal…).
// A Home: one house, no work or money, so its own short set of topics.
const homeTopics = (w) => {
    const app = (id) => appsOf(w).find(a => a.id === id)?.name ?? id;
    const dev = lex(w, 'device');
    const devl = dev.toLowerCase();
    const medieval = styleOf(w) === 'medieval';
    return [
        { id: 'start', icon: 'home', title: 'Getting started', intro: 'A Home is one house and the characters you chose to live in it. No work, money or bills: just the people, their days and the story the AI writes.',
            items: [
                ['The clock (top left)', 'The day, the time and the weather. Click it to let time pass until the next part of the day.'],
                ['Here', 'Who is in this room with you. Click a face for what you can do with that person.'],
                ['Things to do (right)', 'What this room offers: eat, rest, shower… and "Something else…" for anything you can think of. They cost nothing.'],
                ['Rooms', 'The house, floor by floor. Click a room to go there: inside the house, walking takes no time.'],
            ] },
        { id: 'talk', icon: 'chat', title: 'Talking', intro: 'Write in the box under the story. The engine keeps the time and the relationships; the AI writes the scene.',
            items: [
                ['Say, Do, Story, See', 'Say: what you say out loud. Do: what you do. Story: a direction for the story ("it starts to rain"). See: ask the narrator to describe something.'],
                ['@ someone', 'Type @ and pick a name: only that person answers your line.'],
                ['Buttons on a line', 'Edit, delete, regenerate, continue, or let the AI write your line.'],
                ['Bonds grow as you talk', 'Being kind brings people closer. How fast depends on the difficulty you chose (Easy is quicker, Hard is slower).'],
            ] },
        { id: 'time', icon: 'moon', title: 'Time and sleep', intro: 'Time moves a little with each message, and jumps when you sleep or let it pass.',
            items: [
                ['Each message', 'A few minutes go by with every message you send (☰ → This Home → Home sets how many, or turns it off).'],
                ['Let time pass', 'Click the clock: time jumps to the next part of the day.'],
                ['Sleep', 'In your bedroom. You wake up in the morning, back where you went to bed, and the diary of the day is written.'],
                ['Their days', 'People get up, eat, go to bed, and (if you turned it on in This Home) go out or to work for a while. A job and its shift are written in This Home → People.'],
            ] },
        { id: 'house', icon: 'users', title: 'The house', intro: 'Who lives where, who comes and goes, and what people wear.',
            items: [
                ['Who lives here (☰)', 'Everyone\'s bedroom. Pick another one for someone; two people in the same bedroom share it, and the AI knows.'],
                ['Someone moves in', 'Any of your characters can move in during the game. They take a free bedroom, or share one when the house is full.'],
                ['Moving out', 'Someone leaves the house for good: their bedroom is free again and plans with them are off. They can move back in later.'],
                ['Dress code', 'In This Home: what people wear in each room (towels in the bathroom, pajamas in the bedrooms…). The AI is told.'],
                ['Floors', 'With a floor plan, the floors are at the bottom left; the faces show who is on each floor. A red "!" marks a room that is not on the plan yet.'],
            ] },
        { id: 'out', icon: 'map', title: 'Going out', intro: 'The story can leave the house for a while.',
            items: [
                ['Go out (☰, or the top of Rooms)', `Write where you are going (${medieval ? '"the market square", "the village tavern"' : '"the beach", "a café downtown"'}), pick who comes with you from the people in the house, and a background from SillyTavern's.`],
                ['Out there', 'A free scene, like a chat. ☰ → Background changes the picture.'],
                ['Back home', 'The button at the top right. The people who came with you come back too.'],
                ['Plans', `Plans can be "Somewhere out…": write the place and the time${medieval ? '' : ' (a date, a party)'}.`],
            ] },
        { id: 'people', icon: 'heart', title: 'People and relationships', intro: 'Everyone has two bars: friendship and romance. Each bar fills inside its level, then the level goes up.',
            items: [
                ['Levels', 'Stranger, acquaintance, friend, good friend, best friend; and for romance, from a crush up to love.'],
                ['Asking someone out', 'From their card or with your own words. The engine decides how ready they are; the scene shows the answer.'],
                ['Your persona (☰)', 'Play as another of your SillyTavern personas, like in a chat.'],
                ['Difficulty', 'Easy, Normal or Hard: how fast people grow close to you.'],
            ] },
        { id: 'phone', icon: medieval ? 'book' : 'phone', title: `The ${devl}`, intro: lex(w, 'deviceIntro'),
            items: [
                [app('messages'), lex(w, 'messagesHelp')],
                [app('people'), 'Everyone you know, with their bars and what they feel.'],
                [app('plans'), 'Your plans, who is with you, and parties (free in a Home).'],
                [app('journal'), 'A calendar of your days, with each day\'s diary and what happened.'],
            ] },
        { id: 'journal', icon: 'book', title: 'Memory and the diary', intro: 'Mundi remembers in short facts ("You met Bianca in the kitchen"). The AI gets only the facts of the people in the scene.',
            items: [
                ['One long conversation', 'Moving from room to room or going out keeps the conversation: the AI still sees what was just said. Sleeping closes the day: the next morning starts fresh, with the diary.'],
                ['The diary', 'Written when you sleep, from the day\'s facts and conversations. It tells the AI what happened on the days before.'],
                ['Remember this', 'On a line of the story: turns it into a fact.'],
            ] },
        { id: 'look', icon: 'palette', title: 'Look and settings', intro: 'Make it yours.',
            items: [
                ['Chat look (☰ menu)', 'Visual novel, Classic or Cards; sizes; colors with transparency; colors from a SillyTavern theme.'],
                ['This Home (☰ menu)', 'People, bedrooms, dress code, time per message, jobs and shifts, and what the AI is told.'],
                ['A red warning on top', 'Something in SillyTavern may hurt the game (context too big, Summarize on…). It says what to change.'],
            ] },
    ];
};
const topics = (w) => {
    if (w && isScenario(w))
        return homeTopics(w);
    const app = (id) => (w ? appsOf(w).find(a => a.id === id)?.name ?? id : id);
    const on = (id) => !w || appsOf(w).find(a => a.id === id)?.on !== false;
    const dev = lex(w, 'device');
    const devl = dev.toLowerCase();
    const billList = bills(w).map(b => b.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
    const modern = styleOf(w) === 'modern';
    return [
        { id: 'start', icon: 'home', title: 'Getting started', intro: 'Mundi turns a SillyTavern group chat into a life you live: a world, a clock, needs, people with their own days, and the story the AI writes around what you do.',
            items: [
                ['Your card (top left)', 'Your name, money, energy and needs. Click your photo to play as someone else.'],
                ['The clock (top)', 'The day, the time, where you are and the weather. Time passes when you do things, travel or sleep. Click it to let time pass.'],
                ['Here', 'Who is with you right now. Click a face for what you can do with that person.'],
                ['Things to do (right)', 'What this place offers: eat, drink, work, rest… and "Something else…" for anything you can think of.'],
                ['Map', 'Go to other places. Travelling takes time; the people you are with can come along.'],
            ] },
        { id: 'talk', icon: 'chat', title: 'Talking', intro: 'Write in the box under the story. The engine keeps the numbers (time, money, relationships); the AI writes the scene.',
            items: [
                ['Say, Do, Story, See', 'Say: what you say out loud. Do: what you do. Story: a direction for the story ("it starts to rain"). See: ask the narrator to describe something.'],
                ['@ someone', 'Type @ and pick a name: only that person answers your line.'],
                ['Talk only with them', 'On a person\'s card: the others stay but give you space.'],
                ['Buttons on a line', 'Edit, delete, regenerate, continue, or let the AI write your line.'],
                ['Bonds grow as you talk', 'Being kind brings people closer (a little each line, up to a limit each day). Rude lines push them away.'],
            ] },
        { id: 'needs', icon: 'bolt', title: 'Time and needs', intro: 'Energy, hunger, thirst, mood and hygiene drop over time. Keep them up with the things you do.',
            items: [
                ['Actions take time', 'Each action shows its cost and how long it takes. The clock moves forward when you do it.'],
                ['Sleep', 'At home (or where you stay the night). The night ends the day: your diary is written and you see how the day went with everyone.'],
                ['Let time pass', 'Click the clock: time jumps to the next part of the day.'],
                ...(billList ? [['Rent and bills', `${billList} are weekly bills: pay them ${appRef(w, 'homes')} (they turn red when due). One left unpaid for a week stops (or, for the rent, you are locked out of your home).`]] : []),
                ['Difficulty', 'Easy, Normal or Hard (chosen when you start, changeable in ☰ → This world): it changes what work pays and what things cost.'],
                ['Events lift your mood', 'Being on a date or at a party raises your mood and keeps it up while it lasts.'],
            ] },
        { id: 'people', icon: 'heart', title: 'People and relationships', intro: 'Everyone has two bars: friendship and romance. Each bar fills inside its level, then the level goes up and the bar changes color.',
            items: [
                ['Levels', 'Stranger, acquaintance, friend, good friend, best friend; and for romance, from a crush up to love.'],
                ['Asking someone out', 'From their card or with your own words ("will you be my girlfriend?"). The engine decides how ready they are; the scene shows the answer. If they need time, wait before asking again.'],
                ['Proposing, marriage, a baby', 'Once you are a couple, the next steps appear on their card.'],
                ['What they think of you', 'Approval goes up when you keep your word and down when you let people down. Feelings (happy, hurt…) fade with the days.'],
                ['Their own lives', `People work, go out and sleep on their own schedule. ${lex(w, 'reachThem')}`],
            ] },
        { id: 'plans', icon: 'calendar', title: 'Plans and events', intro: 'Invite people to hang out, go on a date or come to your party. A plan becomes an event when it starts.',
            items: [
                ['Make plans', `From a person's card (in person) or the ${devl}. Choose where, when, and give it a name: the story will be about it ("${lex(w, 'planTitleEg').replace(/^e\.g\. /, '').split(',')[0]}").`],
                ['Getting there', 'An hour before, "Things to do" lets you wait for them; half an hour before, a reminder asks if you want to go.'],
                ['During the event', 'A panel shows it. End it to say goodbye (they tell you what they thought), or ask them to stay the night.'],
                ['A party', `Invite several people at once ${appRef(w, 'plans')}. You wait for all your guests in one go.`],
                ['Standing someone up', lex(w, 'standUpHelp')],
            ] },
        { id: 'work', icon: 'briefcase', title: 'Work and money', intro: `Find work ${appRef(w, 'jobs')} or at the place itself, then work your shifts. The Work button (top right) takes you there.`,
            items: [
                ['Job interviews', lex(w, 'interviewHelp')],
                [lex(w, 'courses'), `${lex(w, 'studyWhere').replace(/^./, c => c.toUpperCase())}: pay once, then study 2 h a day for a few days. You learn its traits for good, and some jobs need it first.`],
                ['Shifts', 'Choose how hard you work. If you have plans, you can work part of the shift and then go.'],
                ['Promotions', 'Each shift brings you closer to the next rank and a better salary.'],
                ['Quick gigs', 'Some places offer one-off work for quick money.'],
                [`${app('bank')} and ${app('shop')}`, 'See where your money goes, and buy things that make life easier.'],
                ['At home', lex(w, 'homeUnwind', app('shop'))],
            ] },
        { id: 'phone', icon: modern ? 'phone' : 'book', title: `The ${devl}`, intro: lex(w, 'deviceIntro'),
            items: [
                [app('messages'), lex(w, 'messagesHelp')],
                [app('people'), 'Everyone you know, with their bars and what they feel.'],
                ...(on('social') || on('dating') ? [[[on('social') ? app('social') : '', on('dating') ? app('dating') : ''].filter(Boolean).join(' and '), lex(w, 'socialHelp')]] : []),
                [app('plans'), 'Your plans, who is with you, and parties.'],
                [app('journal'), 'A calendar of your days, with each day\'s diary and what happened.'],
                [lex(w, 'profile'), lex(w, 'profileHelp')],
                [app('goals'), 'Pick a life goal. Reaching it gives you a trait for good.'],
                ...(modern ? [['Settings', 'Change the wallpaper: a picture from your computer, a link, or your gallery.']] : []),
            ] },
        { id: 'journal', icon: 'book', title: 'Memory and the diary', intro: 'Mundi remembers in short facts ("You met Bianca at the café"). The AI gets only the facts of the people in the scene.',
            items: [
                ['The diary', 'Written when you sleep, from the day\'s facts and conversations. It tells the AI what happened on the days before.'],
                ['Translated', 'If SillyTavern\'s Chat Translation translates the replies, the diary and Mundi\'s ready-made lines are translated too.'],
                ['Remember this', 'On a line of the story: turns it into a fact.'],
            ] },
        { id: 'family', icon: 'users', title: 'Households and family', intro: 'People who live together share a home, like in The Sims.',
            items: [
                ['Your household', 'The faces under your card. Click one to play as them, call them over or go to them.'],
                ['Households', 'In ☰ → This world: who lives where, and how they are related.'],
                ['Children', 'A baby grows a stage at each birthday, once a week. Celebrate it from their card.'],
            ] },
        { id: 'playas', icon: 'user', title: 'Play as someone else', intro: 'Click your photo to switch to another person of the world.',
            items: [
                ['Choosing who you can play', '"Choose who you can play" keeps people ready; you switch only when you click one.'],
                ['What changes', 'You go where they are and live in their home. Each person keeps their own relationships, diary and job.'],
                ['What stays', 'Energy, needs and money are the same for everyone you play.'],
                ['The one you were', 'Stays where they were, or with you if they were your company.'],
            ] },
        { id: 'look', icon: 'palette', title: 'Look and settings', intro: 'Make it yours.',
            items: [
                ['Chat look (☰ menu)', 'Visual novel, Classic or Cards; sizes; colors with transparency; colors from a SillyTavern theme.'],
                ['Presets', 'Mundi\'s presets (Midnight Glass, Rose Dusk, Forest Calm) and your own. They also tint the HUD\'s glass.'],
                ['This world', 'People, homes, households and what the AI is told (AI context).'],
                ['A red warning on top', 'Something in SillyTavern may hurt the game (context too big, Summarize on…). It says what to change.'],
                ['Tip', 'A context of about 30k tokens works well. Keep it the same in SillyTavern and in your AI program.'],
            ] },
    ];
};
const H = { open: false, topic: 'start' };
export const openHelp = () => { H.open = true; notify(); };
export function helpHtml() {
    if (!H.open)
        return '';
    const g = game();
    const w = g ? getWorld(g.world) : null;
    const TOPICS = topics(w);
    const t = TOPICS.find(x => x.id === H.topic) ?? TOPICS[0];
    return `<div class="mu-recap-veil mu-help-veil" data-act="help-bg"><section class="mu-recap mh-glass mu-help" role="dialog" aria-label="${lex(w, 'help')}">
        <header class="mu-row"><div><small>${lex(w, 'help')}</small><h3>How Mundi works</h3></div><button class="mu-ibtn mu-ghost mu-right" data-act="help-close" aria-label="Close">${icon('x')}</button></header>
        <div class="mu-help-body">
            <nav class="mu-help-nav">${TOPICS.map(x => `<button class="${x.id === t.id ? 'is-on' : ''}" data-act="help-topic" data-id="${x.id}">${icon(x.icon)}<span>${x.title}</span></button>`).join('')}</nav>
            <article class="mu-help-page" data-keep="help-page">
                <h4>${icon(t.icon)} ${t.title}</h4>
                <p class="mu-help-intro">${t.intro}</p>
                <dl>${t.items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
            </article>
        </div></section></div>`;
}
Object.assign(ACT, {
    'help-close': () => { H.open = false; notify(); },
    'help-bg': (el, e) => { if (e.target === el) {
        H.open = false;
        notify();
    } },
    'help-topic': (el) => { H.topic = el.dataset.id; notify(); requestAnimationFrame(() => { const p = document.querySelector('#mundi-root .mu-help-page'); if (p)
        p.scrollTop = 0; }); },
});
