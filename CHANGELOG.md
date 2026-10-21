# Changelog

This is a fork of [tjalis/Mundi](https://github.com/tjalis/Mundi) (AGPL-3.0). Changes made in this fork are listed here, with their dates, as the license asks.

## 0.1.0-ps.13 — 2026-10-21

Which parts were skipped, by name, and reading just those again.

### Added

- **Set up from the lore names what it skipped.** Under the warning, "Skipped: Willow, Kayla, Arlette and 9 more" opens to the full list of the lorebook entries (or characters) in the parts the AI gave nothing back for.
- **Read the skipped parts again.** One button reads only those again, splitting them further, so an entry that shares a half with a refused one is separated from it this time. What it finds joins the review, and your ticks are kept.
- **Continue reading after Stop.** The review offers "Continue reading (N parts left)", which picks up where you stopped, the cut-off part included.
- **Find the characters names what it skipped**, in the dialog.

## 0.1.0-ps.12 — 2026-10-21

Reading the lore with a thinking model (GLM 5.3 on OpenRouter): fast, and never stuck.

### Fixed

- **Set up from the lore seemed stuck on a thinking model.** GLM 5.3 spent its whole answer thinking (2,500 tokens, then 4,000 on the retry) and never wrote the answer, so every part came back empty, each after several slow calls. Now, while Mundi reads the lore or looks for characters, the model's thinking is turned down as far as it goes. SillyTavern's settings are set to reasoning effort "Minimum" with "Request model reasoning" off. On OpenRouter that means no thinking at all; on Claude it is low, and on Gemini none. The settings are put back as soon as the reading ends, and they are never saved.
- **It gives up by itself** when the first three pieces all come back empty, and says it is probably the model or its settings rather than the lore. Before, a reading like that went through all 17 parts, at about six calls each.

### Added

- **The reading shows it is working:** what it is reading, a clock for the current part and one for the whole reading.
- **A time limit per part (3 minutes).** A part that takes longer is split in two, and a half that is still too slow is skipped, like an empty one.
- **Stop, and keep what was read.** Set up from the lore and Find the characters both have it. The review shows what was found up to that point, and says where it stopped.

## 0.1.0-ps.11 — 2026-10-21

Reading the lore no longer gives up on the first empty answer.

### Fixed

- **"No message generated" when setting up from the lore, or finding the characters in a lorebook.** One empty answer from the AI used to stop the whole reading. Now:
  - an empty part is asked again as two halves (less for a thinking model to chew on, and a passage that trips a filter is cut off from the rest);
  - a half that is still empty is skipped, and everything else is still read;
  - the review says how many parts were skipped and the likely reasons (a model that ran out of room while thinking, or the provider's filter refusing dark lore), and Find the characters says the same in a notice;
  - when nothing at all could be read, the setup says so and has a **Try again** button.
- The AI is told it is cataloguing fiction for a game engine, which some providers' filters let through more often.

## 0.1.0-ps.10 — 2026-10-21

The story's own laws, and a setup step where the AI reads the lore and fills in who is who.

### Added

- **Laws of this story** (Rough stuff menu → You · Law in this story → Laws of this story, or `"laws"` in world.json). A law makes some acts against some kind of people lawful: a control order, a bounty, a curfew. Each law has:
  - a name ("the K4 control order");
  - who it is about, as words ("mouse, mice"), matched against what someone is;
  - the acts it allows (grab, tie up, knock out, kill…);
  - who may use it: anyone, the law, or words from who you are ("animal control");
  - what it counts as: legal, or a minor offense;
  - optionally, who they are handed over to ("Animal Control") and a reward;
  - optionally, who disapproves ("kemonomimi"): such witnesses don't report it, but they remember it and like you less;
  - a note for the story.
- **The verdict follows the law.** Under the K4 control order, a hotel receptionist grabbing a mouse girl shows **legal: K4 control order**: no crime, nobody calls it in. What the law doesn't allow (killing her, unless it says so) is still a crime. A law only some people may use is a crime for everyone else.
- **Turn in.** Someone caught under such a law can be turned in ("Turn in to Animal Control · +$50"): the reward is paid and they are taken away.
- **What someone is.**
  - The People screen has a **What they are** field ("mouse kemonomimi", "Kindred", "human").
  - Cards made by Find the characters get it from the lore.
  - A card's own tags, a person's group, and a passer-by's name ("a mouse girl") count too.
- **The story is told the laws**, and who in the scene they cover, so it plays the world consistently.
- **Set up from the lore.** The AI reads the game's lorebooks (the world's, the save's, and the ones linked to its characters) and the characters' cards, and proposes:
  - whether there is police at all, and what it is called;
  - the world's laws, written up like the ones above;
  - the groups, with a base on the map;
  - for each person: what they are, whether they are the law, and their group;
  - what is not a person.
  You review it all on one screen (untick, fix a kind, pick a base) and only then is it applied. It is offered at the start of a new game (on by default), and any time from the Rough stuff menu and the People screen.

### Changed

- The Rough stuff, Find the characters and Set up dialogs are darker, so they read over a busy scene.

### Files

- New: `src/sim/setup.ts` (reading the lore, applying the plan), `src/ui/setupui.ts`, `css/94-setup.css`.
- Touched: `src/sim/judge.ts` (story laws), `src/sim/hostile.ts` (laws, what someone is, turning in, the prompt), `src/sim/extract.ts` and `src/ui/extractui.ts` (what they are), `src/ui/hostileui.ts` (the laws editor, turn in), `src/ui/storyui.ts`, `src/ui/newgame.ts`, `src/ui/hud.ts`, `css/91-hostile.css`, `manifest.json`, `README.md`.

## 0.1.0-ps.9 — 2026-10-21

A decision engine for rough stuff: who you are, who they are and the setting's own codes decide what an act is.

### Added

- **Who you are** (Rough stuff menu → You · Law in this story):
  - **an ordinary person**;
  - **the law** (police, a guard). Picked for you when your job is police or guard work;
  - **Kindred** (a vampire).
  - A line in your own words for the story ("a detective of the 9th precinct", "a Toreador of the Camarilla"). The AI is told all of it.
- **Who they are:** wanted (for a crime the story reported, still open), attacking or holding you right now, the law, or not a person at all (zombies, walkers, biters; a world can add more with `"notPeople"`).
- **The verdict, before you choose.** Each action in the menu shows what it would be, with a line saying why:
  - **arrest**: you are the law and they are wanted or attacking you. Grabbing, tying up, knocking down: no crime, nobody calls it in, and an officer who sees it does not arrest *you*. Grabbing an innocent person is still assault, and killing is still murder, badge or not;
  - **self-defense**: they are attacking you, so hitting back is no crime. Killing them counts only when they had you held or tied up;
  - **not a person**: a walker is nobody's business;
  - otherwise the crime itself (assault, theft, kidnapping, murder).
- **Take them in.** As the law, someone in your grip who is under arrest (or wanted, or was attacking you) can be taken in: they are jailed for a while (a day for a disturbance, up to never for murder), and their crimes are closed.
- **Codes besides the law: the Masquerade.**
  - As Kindred you get **Feed**: quiet, your hunger is sated, the vessel is left dazed and remembers little. Someone who trusts you (a close friend, your partner) is a willing vessel: no crime.
  - If anyone outside the Kindred sees it (the people here, or people nearby), it is a **breach of the Masquerade**. The group that enforces it (any group of yours with Camarilla, Prince, Sheriff or Court in its name) holds a grudge. Kindred witnesses (in such a group, or named so) don't count.
  - The police care separately, if what a mortal saw looked like an assault.
  - The menu marks Feed with the Masquerade, and the story is told about recent breaches.
- **Take something** (no target): name it ("a blood bag", "the cash box"). It is theft at a business (the staff may catch you), and nothing at your own home. As Kindred, taking blood feeds you.

### Changed

- The story's crimes stay open (the person is wanted) until they are arrested.
- "The mugger", "a mugger" and "Mugger" are the same person.

### Files

- New: `src/sim/judge.ts` (roles, codes, who is not a person, the verdict; unit-testable).
- Touched: `src/sim/hostile-rules.ts` (Feed, Take something), `src/sim/hostile.ts` (the verdict in every act, wanted, attacking, taking in, breaches, the prompt), `src/ui/hostileui.ts`, `css/91-hostile.css`, `manifest.json`, `README.md`.

## 0.1.0-ps.8 — 2026-10-21

Talking with one or a few people: the scene says so, and the people on the side cut in only when the engine says.

### Added

- **The narrator says who you turn to.** Choosing "Talk only with them", bringing someone into the conversation, leaving someone out, or going back to everyone posts one line in the scene: "Zack turns to talk with Mona alone; the others give them some space.", "Zack brings Dev into the conversation.", "Zack turns back to everyone." The narrator's line is part of the chat the AI reads, so it knows who the conversation is with.
- **Cutting in, as a mechanic.** While you talk with some of the people here, the others stay quiet, but after each of your lines the engine may let one of them cut in:
  - nearly always when your line speaks to them ("Dev, what do you think?"), and often when it names them;
  - more likely when they have a crush on, or are dating, someone you are talking with, or when they are close to you;
  - otherwise, now and then.
  - When someone cuts in, the narrator says so first ("Dev, nearby, is listening in."). They speak this once, then they are on the side again. To keep them in the conversation, use "Bring them into the conversation".

### Files

- Touched: `src/sim/presence.ts` (the line when who you talk with changes), `src/sim/match.ts` (who cuts in), `src/sim/social.ts` (the one who cuts in), `src/sim/game.ts`, `src/ui/matchui.ts`, `src/ui/lifeui.ts`, `src/ui/scene.ts`, `manifest.json`.

## 0.1.0-ps.7 — 2026-10-21

Characters out of lorebooks and ensemble cards, and the narrator says who leaves or walks in.

### Added

- **Find the characters** in a lorebook, or **Split into characters** for a card with several people in it (a world card, a narrator card, an ensemble). It's in Mundi's Library, on the lorebook or the card.
  - **The AI reads it** part by part and lists the people in it: their name and other names, age, look, personality, background, relationships, how they talk, and a first line. Places, items, factions and rules are left out. The same person found in several parts is merged into one.
  - For a lorebook, there is also a **Quick look (no AI)**: the entries named like a person that read like a person.
  - **You choose:** tick who to keep, fix a name, open one to read what was found.
    - People you already have a card for are not ticked.
    - People the text says are underage are not ticked, and if you make them anyway their card is marked so Mundi keeps them out of any romance or matchmaking.
  - **Mundi makes a card for each one:**
    - in a folder named after the source, so a new game's cast step can take them all at once;
    - the source's lorebook linked, so they keep their world's lore (can be turned off);
    - a picture with their initials, or the source card's picture;
    - their way of talking as example dialogue.
  - The source card and lorebook are not changed.
- **The narrator says who leaves and who walks in.** When someone's day takes them away in the middle of a scene ("Mona has to go: off to work."), when a friend's time with you is up, or when someone walks in, one line in the scene says so. The narrator's line is part of the chat the AI reads, so in a long scene it stops writing in people who left. It says nothing when the story already told it (someone left in a reply, died, or left with someone after you introduced them).

### Fixed

- Rough stuff: a "Station agent" or a "Lifeguard" no longer counts as the law. Only plainly police or guard jobs do.

### Files

- New: `src/sim/extract.ts` (reading a lorebook or a card, the AI's list, merging, the quick look, making the cards), `src/ui/extractui.ts`, `src/sim/presence.ts` (who left or came in), `css/93-extract.css`.
- Touched: `src/st/bridge.ts` (a card's example dialogue), `src/sim/family.ts` (a card marked underage is never in a romance), `src/sim/game.ts`, `src/sim/hostile.ts`, `src/sim/hostile-rules.ts`, `src/ui/library.ts`, `manifest.json`, `README.md`.

## 0.1.0-ps.6 — 2026-10-21

Love between the characters, with you as the matchmaker, and conversations with just a few of the people here.

### Added

- **Crushes between characters.** Each adult may carry a secret crush on someone else in the cast, and feelings go one way: A can like B while B barely notices A. It is fixed per save (people with the same hangouts are likelier), and the couples the world already has like each other. Never anyone underage, and never two people of the same family.
- **Ask about their love life** (a person's card, once you are friends). Only they answer, privately. They tell you who they like (or who they are seeing, or that there is nobody), and the card remembers it: "Has a crush on Seraphina".
- **Introduce to…** (a person's card): pick anyone else here. Each name shows your hunch, when you know them well enough: "a good feeling", "could go either way", "a long shot". A ❤ marks their known crush.
  - **The engine decides** how it goes: does B like A back, is B seeing someone, are you charming or outgoing, does B trust you, is it a good night out. There are three results: they **hit it off**, B is **polite, not interested**, or it is **awkward** (A won't thank you).
  - The two of them (and you) talk; the others here stay in the background. The AI plays the meeting with both of them speaking.
  - A pair who hit it off may **start dating** over the next days, "thanks to you". Both think better of you, and word gets around (it is gossip).
  - On a great night out (a bar or a café, late), a strong match may **leave together**: they spend the night at one of their homes, back to their lives in the morning.
- **Talk with a chosen few.** "Talk only with them" was one person. Now a person's card also has **Bring them into the conversation** and **Leave them out of it**, so in a crowd you can talk with two or three people while the others give you space. They are highlighted in the Here row, only their pictures stay in the scene, the others keep quiet, and the story is told so.
- **The scene prompt** has a new block, **Love between them**: the crushes of the people here (the secret ones too, so the story can play them: blushing, glances, jealousy), whether the other one is drawn to them, and the pairs who hit it off.

### Changed

- The person card is darker, so it reads over a busy scene.

### Files

- New: `src/sim/match.ts` (feelings, asking, introductions, dating, leaving together, the prompt lines), `src/ui/matchui.ts` (the card's buttons, talking with a few), `css/92-match.css`.
- Touched: `src/sim/social.ts` (who you talk with: everyone, one, or a few), `src/sim/game.ts`, `src/sim/prompt.ts`, `src/ui/plans.ts`, `src/ui/lifeui.ts`, `src/ui/scene.ts`, `src/ui/hud.ts`, `src/index.ts`, `manifest.json`, `README.md`.

## 0.1.0-ps.5 — 2026-10-21

Rough stuff: hostile actions for any genre, with consequences that come from the world. Being taken somewhere: as a prisoner, or because someone asked you to come along.

### Added

- **A red "Rough stuff" button** in every scene (under Things to do). Pick someone from the people here, then an action:
  - **Punch**, **Kick**, **Shove**, **Threaten**, **Make a scene**, **Steal**, **Grab**, **Tie up**, **Knock out**, **Kill**.
  - Each one shows its chance and the crime it is. Tie up and Kill only work on someone who is down or in your grip.
  - **The engine rolls** (a d20 plus your traits, like getting away). Someone helpless is easy; a police officer fights back better. The result is final, and the AI is told exactly what happened and writes it.
  - **What it does to them** is written at once: hurt, on the ground, knocked out for a while (a 💤 on their face), in your grip or tied up (⛓️), scared off, or dead for good.
  - **What it does to you:** a missed punch starts a fight that holds you; landing one leaves you in a fight; shoving or knocking out the one holding you frees you; being caught stealing holds you.
  - A world can add or replace actions (`"hostileActions"` in world.json): a vampire's Feed, a zombie's Bite.
- **Witnesses.** The people in the scene see it (a quiet theft may go unnoticed), and so may the crowd: it depends on how busy the place is right now (your flat: nobody; the mall at noon: packed; a park at night: almost nobody). A world can set it per place (`"crowd": 0–3`). The people who saw it remember it and are shaken; the town talks.
- **The law, only where there is law.** Each world has some (the police, the city watch), or none (`"law": { "exists": false }` in world.json). Each game can override it in the Rough stuff menu: as the world says, yes, or no law at all (a zombie apocalypse, the wilderness).
  - A crime someone sees may get reported. The police arrive some minutes later; if you are still there, someone points at you and you are held.
  - If you left, you are wanted. They may find you later, and at home most of all: they know where you live.
  - An officer who sees it steps in on the spot.
  - **Give yourself up** (a chip under the clock while the law holds you): a fine for a disturbance; a night in a cell and a fine for theft or assault (you are out in the morning); for kidnapping or murder, you are taken away and the story ends. Or try to get away (the usual roll).
  - Who counts as the law: police officers, guards, detectives… by name, the world's police or guard jobs, and anyone you mark as the law on the People screen.
- **Groups, law or no law.** On the People screen, put people in groups (a gang, a faction, a family) and give a group a base. Hurt one of them and the group holds a grudge: the next time you run into them they confront you, and if it is bad enough they come looking for you.
- **The AI's characters too.** The state block has a `crimes:` line. A crime the story reports (`the mugger = theft on the clerk`) is followed up when you leave: with an officer there, they are arrested on the spot; otherwise maybe later, and they are out of jail after a while (never, for murder).
- **Hard captures.** The state block has a `captor:` line. When the story says someone has taken you prisoner (tied up, locked in, carried off; not a scuffle), you are their prisoner:
  - a cast member takes you to their home; a group with a base, to the base; a stranger the story brought in keeps you where you are;
  - your captor never leaves your side, on every move, until you get away (the roll) or they let you go;
  - wherever they take you next, you go too (the `going:` line, below).
- **Being taken somewhere, or asked to come along.** The state block has a `going:` line (`Bianca → the docks`). The engine finds the place on the map ("the docks", "her place", "your apartment").
  - As a prisoner, you are moved with your captor, no choice.
  - Otherwise it is an invitation: "Bianca wants you to come along to the Beach · 30 min away", **Go with her** or **Stay**. If you go, she comes with you as company, the same as when you ask someone to come along. Someone the story brought in comes along too.
- **Your own captives** come with you when you go. Walking into a busy place with someone in your grip is seen (kidnapping). Someone in your grip may slip away within the hour (much less often when tied up); free, they may go to the police. **Let go** in the menu.
- **The scene prompt** has a new block, **Trouble**: whether there is law here (and who of it is in the scene), your captives, who is on the ground, whether you are wanted, who wants payback, and whose prisoner you are.
- Settings → Game → **Rough stuff** turns it all off.

### Files

- New: `src/sim/hostile-rules.ts` (the actions, crowds, witnesses, who the law is, the rolls; unit-testable), `src/sim/hostile.ts` (the engine: effects, incidents, the law, groups, captives, captors, leads, the prompt), `src/ui/hostileui.ts` (the menu, giving up, the come-along card, moves, the groups), `css/91-hostile.css`.
- Touched: `src/sim/pstate.ts` (the `crimes:`, `captor:` and `going:` lines; the engine's decision on your own line), `src/sim/pstate-live.ts` (hooks), `src/sim/roster.ts` (written at once when the engine decides; captives are not gone; someone who died in this visit is still the one meant), `src/sim/people.ts` (a hook for where someone is), `src/sim/hooks.ts` and `time.ts` (a step hook), `src/sim/visits.ts`, `src/sim/game.ts`, `src/sim/prompt.ts` (the Trouble block), `src/ui/map.ts`, `src/ui/app.ts`, `src/ui/hud.ts`, `src/ui/pstateui.ts`, `src/ui/settings.ts`, `src/ui/storyui.ts`, `src/index.ts`, `manifest.json`, `README.md`.

## 0.1.0-ps.4 — 2026-10-20

### Fixed

- **A busy place on the map could not be clicked.** Its card (the one that opens when you hover a pin) got so tall that it covered its own pin. Now:
  - the card always ends with a button: **Join** when people are there ("Join Samantha", "Join them"), **Go here** when it's empty, **Enter the scene** where you are. It's on the card with a mouse too, not only on touch screens;
  - a card too tall to fit above or below its pin opens beside it, so the pin stays clickable;
  - a long list of people scrolls inside the card ("12 people here"), and the button stays at the bottom;
  - the card no longer slides under the clock or the other top panels;
  - the card is darker, so the map's labels don't show through the text.

### Files

- Touched: `src/ui/map.ts` (the card and where it opens), `css/50-phone.css`, `manifest.json`.

## 0.1.0-ps.3 — 2026-10-20

Saves you make yourself, a record of everyone in your story, and a fix for the end-of-day recap.

### Added

- **A Save button** (the ☰ menu in a game → **Save…**). Mundi already writes your game as you play. Save… keeps a named copy of it as it is now ("Before the heist"). Under the button you see when the game was last written.
  - **Load** (main menu) shows your saves with a **Save** badge and a one-line card: day, place, how many people you know, and who is dead.
  - **Loading a save plays a copy of it**, "(from Before the heist)", so the save is still there the next time things go wrong.
- **People in your story** (☰ menu). Everyone you've met: the cast, and the people the story brought in (the officer at your door). For each one:
  - their status: around, left, injured, captured, missing or dead;
  - where and when you first and last saw them;
  - a few lines of notes about who they are to you and what happened between you. When you leave a place, one short AI call brings the notes of everyone who was there up to date. You can turn it off on the same screen.
  - The story keeps the notes of the people in the scene in mind, under "People in your story" in the scene prompt.
- **Deaths are final, right away.** The state block has a new line, `changes:` (for example `changes: police officer = dead`). When someone dies, they leave the scene at once, they never come back on the map or in a routine, and the prompt lists them as dead for good. The death goes into the Journal ("police officer died at home"). There is no confirm and no undo, except loading a save. Swiping or editing the reply that said it takes it back, the same way it does for the player state.
  - Also: `left`, `injured`, `captured`, `missing` and `around`. A cast member who left the scene goes back to their routine once you leave; someone captured or missing stays off the map until the story brings them back.
- **Freed when the person holding you is gone.** If the one holding you dies, leaves or is captured in the same reply, you're free at once (or "held" if you were restrained), instead of waiting for two calm replies.
- Walk-ons with a role for a name are told apart: after the first police officer died, the next one who knocks is someone else, and the prompt says "police officer (died at home, day 1)".
- Sprite packs: the panel picks a Qwen Image Edit diffusion model and VAE that your ComfyUI actually has (2511 or 2509, safetensors or GGUF) when the default file isn't there.

### Fixed

- **"How the day went" could squeeze the diary to one line**, and on some setups the cards stayed invisible. The diary now gets the room it needs (and scrolls past a third of the screen), the cards show even with animations turned off, `**bold**` and `*italics*` in the diary render, and the card behind the text is darker so it reads over any background.

### Files

- New: `src/sim/roster.ts` (the roster: statuses, this visit's changes, notes, the prompt lines), `src/sim/saves.ts` (save slots and their cards), `src/ui/storyui.ts` (the People screen and the Save dialog), `css/89-story.css`.
- Touched: `src/sim/pstate.ts` and `pstate-live.ts` (the `changes:` line), `src/sim/people.ts` (the dead aren't anywhere), `src/sim/visits.ts` (leaving writes the visit into the roster), `src/sim/prompt.ts` (the People block), `src/core/store.ts` (a hook when the game is written), `src/sim/game.ts`, `src/ui/hud.ts`, `src/ui/menu.ts`, `src/ui/relui.ts`, `src/ui/spritepack.ts`, `css/88-chat.css`, `manifest.json`, `README.md`.

## 0.1.0-ps.2 — 2026-10-20

Sprite packs.

### Added

- **Make a sprite pack** (Library → a character → Expressions). Give it one picture (the card's own, or any other) and your ComfyUI makes every expression from it. You keep or redo each one, and the ones you keep go straight into the character's sprite folder, where SillyTavern's Character Expressions and Mundi's scene use them.
  - **Through SillyTavern's own ComfyUI connection** (the address from Image Generation, which you can change in the panel). Nothing extra runs in the browser, and SillyTavern stops ComfyUI when you press Stop.
  - **Built-in workflow**: Qwen Image Edit 2511 or 2509, the same graph as ComfyUI's own templates. It uses ComfyUI's own nodes, plus `ETN_LoadImageBase64` from comfyui-tooling-nodes (the node SillyTavern's own avatar workflow uses). The Lightning LoRA (4 steps) is optional, a GGUF diffusion model works through ComfyUI-GGUF, and the diffusion model and VAE are picked from what your ComfyUI has.
  - **Or your own workflow** from SillyTavern's ComfyUI workflows. It receives the picture as `%char_avatar%` and the edit as `%prompt%`, plus `%negative_prompt%` and `%seed%`.
  - **Transparent backgrounds**:
    - The default asks the model for a plain green, magenta or blue background, which is then keyed out in the browser. Only the background is taken out, starting from the picture's edges and from spots of the pure color (so green eyes stay), and the color is cleaned off the edges.
    - Or use ComfyUI's own Remove Background node.
    - Or keep the background.
  - **Steps**: choose the expressions (by default, the ones without a picture). When the background is keyed out, you first check the plain-background version. Then a grid of results: keep, redo, describe an expression differently, or see one bigger.
  - Clear messages for the usual problems: ComfyUI not running, a model file missing (with the download link), the base64 node missing, or running out of video memory.

### Files

- New: `src/sim/spritegraph.ts` (prompts, the workflow graph and the chroma key, unit-testable), `src/ui/spritepack.ts` (the panel), `css/90-spritepack.css`.
- Touched: `src/ui/library.ts` (the button on the Expressions screen), `manifest.json`, `README.md`.

## 0.1.0-ps.1 — 2026-10-20

Player state, on top of Mundi 0.1.0 (upstream commit `33837e1`, 2026-10-19).

### Why

In Mundi 0.1.0, the game never knew what the story said about you. You could walk out of any conversation or encounter and appear across the city. People the AI added to a scene (a police officer at your door) weren't on the map, weren't in the "Here" row, and were forgotten once you left. The story also couldn't end: dying meant nothing to the engine.

### Added

- **A hidden state block on every reply.** The model ends each reply with:
  ```
  <state>
  mobility: free | engaged | held | restrained | incapacitated
  reason: a few words
  present: everyone else in the scene
  outcome: none | dead | failed | captured
  </state>
  ```
  Mundi cuts the block out of the message, so it never shows in the scene or in SillyTavern's own chat, and keeps it in the message's data. The current state is always worked out again from this visit's lines, so swipes, edits, deletes and loaded saves stay correct with no extra bookkeeping. The instruction goes in at depth 0, after the last line, where models follow a format best. The hidden narrator (scenes with no one from the cast) writes the block too.
- **The AI proposes, the engine decides.**
  - A worse state takes effect at once.
  - A better state needs proof. Leaving a conversation takes effect at once. Leaving "held" takes two replies in a row that say so. Leaving "restrained" or "incapacitated" goes back to "held" first, so a model that forgets the handcuffs can't free you.
  - A reply with no block keeps the last state (fail closed).
- **Filling in a missing block** (on by default). When a character's reply has no block, one short AI call reads the reply and fills it in.
- **A gate on leaving.** It covers travel (map, phone, Go home, Go to work, plans), sleep, work shifts and letting time pass.
  - *Free*: go.
  - *Engaged*: you can walk out. The people there are upset for a while (a timed feeling), and you lose some of their friendship. The walk-out goes into the Journal.
  - *Held*: "Try to get away", a d20 roll at difficulty 12 with charm, wits and nerve as bonuses. The model is told the result and narrates it. A failed roll means waiting two replies before you can try again. A critical failure makes you restrained.
  - *Restrained*: the same roll at difficulty 16, with strength and skill as bonuses.
  - *Incapacitated*: you can't leave.
  - Getting away shows a "You got away · go to …" button.
- **State chip** under the clock in the scene, shown when you're not free. It says the state and the reason.
- **Walk-ons**: people the story brings in who aren't in the cast. They show as plain faces in the "Here" row and are counted on your map pin and its card. They're listed in the scene prompt ("Also here, already part of this scene"), and the visit recap remembers them ("ran into a police officer at home").
- **The end of the story.** When the outcome is dead, failed or captured, an ending card opens and the message box is replaced, and travel, sleep and time skips stop. You can:
  - have the narrator write an epilogue,
  - choose **That's not what happened** (that reply's block is ignored and the story goes on),
  - load a save,
  - or close the card to look at the scene.
- **Macros** for cards, lorebooks and presets:

  | Macro | Value |
  |---|---|
  | `{{mundi_place}}` | Where you are |
  | `{{mundi_time}}` | The game clock |
  | `{{mundi_day}}` | Weekday and game day |
  | `{{mundi_here}}` | The cast present and the walk-ons |
  | `{{mundi_walkons}}` | Walk-ons only |
  | `{{mundi_mobility}}` | free, engaged, held, restrained or incapacitated |
  | `{{mundi_mobility_reason}}` | Why |
  | `{{mundi_outcome}}` | none, dead, failed or captured |
  | `{{mundi_can_leave}}` | yes or no |

- **Settings → Game → Player state**: turn it all off, or turn off the call that fills in a missing block.
- **World tuning** (optional, in `world.json`): `"playerState": { "heldDc": 12, "restrainedDc": 16, "heldTraits": [...], "restrainedTraits": [...] }`.
- Icons: lock, hand, skull, door.

### Changed

- The scene prompt's "only they are in this scene" line now makes room for the walk-ons already in the scene.
- The hidden narrator, when walk-ons are present, may voice the people already there (still nobody new).
- `travelTo(loc, { force })` returns whether you moved. `force` is for moves the engine has already decided (walking out, getting away).
- Editing a line in the scene keeps that line's state with the new text.

### Known limits

- If the model puts a cast member in the scene when Mundi's schedule has them elsewhere, that is ignored (they aren't moved or counted as a walk-on).
- While a reply streams in, SillyTavern's own chat view can show the block for a moment before it is cut. Mundi's scene never shows it.
- The fill-in call runs only for character replies, not for the hidden narrator.
- How reliably a model writes the block depends on the model. Tested so far against a scripted stand-in model only.

### Files

- New: `src/sim/pstate.ts` (the rules, no runtime imports, unit-testable), `src/sim/pstate-live.ts` (reading replies, the prompt, macros), `src/ui/pstateui.ts` (gate, chip, ending card, settings), `css/89-pstate.css`, `CHANGELOG.md`.
- Touched: `src/index.ts`, `src/sim/prompt.ts`, `src/sim/visits.ts`, `src/ui/hud.ts`, `src/ui/map.ts`, `src/ui/scene.ts`, `src/ui/settings.ts`, `src/ui/tools.ts`, `src/ui/icons.ts`, `src/ui/menu.ts`, `manifest.json`, `README.md`.
