# Mundi

> **This is a fork of [tjalis/Mundi](https://github.com/tjalis/Mundi) with player state tracking.** The game now knows when you're free to walk away, held, restrained or unable to move. It tracks the people the story brings into a scene, and it can end the story when you die, fail or are captured. See [What this fork adds](#what-this-fork-adds) and the [CHANGELOG](CHANGELOG.md).

**Open worlds inside SillyTavern.** Mundi turns a SillyTavern group chat into a life you live: a city with a map and a clock, needs to look after, a job, bills, people with their own days, and the story the AI writes around what you do.

<p align="center"><img src="docs/map.jpg" alt="The map of Porto Alto"></p>

It is a SillyTavern **extension** (no server plugin). Everything is built on what SillyTavern already has: your character cards, personas, lorebooks and group chats. A save *is* a chat.

## What you can do

- **Live in a world.** A map of places, time that moves when you act, weather and seasons. Energy, hunger, thirst, mood and hygiene drop over time.
- **Talk.** A visual-novel scene with Say / Do / Story / See. Type `@` to pick who answers. The engine keeps the numbers (time, money, relationships); the AI writes the scene.
- **Relationships.** Friendship and romance bars with levels, approval, feelings that fade, dates, proposals, marriage, a baby. People keep their own routines: find them, or text them.
- **Work and money.** Job interviews (a d20 roll with your traits as bonus), shifts, promotions, quick gigs, courses that teach traits, weekly rent, water and power that get cut off if you don't pay. Easy / Normal / Hard.
- **A phone.** Messages, People, Jobs, Bank, Homes, Chirp (social), Spark (dating), Calendar, Journal, Shop, Goals, Profile and Help.
- **Households and "Play as".** Live with family or roommates, then switch to playing any of them.
- **A diary.** Each night the day is written as a short entry, so the story remembers what happened.
- **Make it yours.** Layouts (Visual novel, Classic, Cards), colors with transparency, presets that tint the HUD glass, a world creator for your own maps and rules.
- **Phones.** Upright and sideways layouts, with their own scale for the HUD.
- **A tour.** Stella shows you around in a practice world. No AI needed.

Two worlds come with it: **Porto Alto** (a modern coastal city) and **Valdoria** (a medieval kingdom, RPG mode coming in a later update).

## What this fork adds

- **You can't teleport out of trouble.** Each reply ends with a small hidden block that says how free you are. Leaving a conversation is rude and costs you some friendship. Getting away when someone holds or restrains you takes a d20 roll, and the story tells how it went. Unable to move means you stay.
- **People the story brings in are real.** A police officer who knocks on your door shows up in the "Here" row and on your map pin, stays in the scene prompt, and is remembered in the visit's recap.
- **Stories can end.** Dying, failing or being captured opens an ending card. Have the narrator write an epilogue, take it back ("That's not what happened"), or load a save.
- **Save when you want, and the dead stay dead.** **Save…** in the ☰ menu keeps a named save; loading it plays a copy, so the save stays. When someone dies in the story they're gone for good, right away: off the map, out of routines, and listed as dead in the prompt.
- **People in your story.** Everyone you've met, including the people the story brought in, with their status (around, injured, captured, missing, dead), where you last saw them, and short notes the AI keeps up to date each time you leave a place. The story keeps those notes in mind.
- **Rough stuff.** A red menu in every scene: punch, kick, shove, threaten, make a scene, steal, grab, tie up, knock out, kill. The engine rolls; the people who see it remember it; where the world has law, crimes get reported and the police come (or find you later), and you can give yourself up. No law (a zombie apocalypse)? Then the victim's group comes for you instead. The AI's own characters can get caught too.
- **Rough stuff knows who you are.** As the law, grabbing a wanted man is an arrest (take them in); hitting back is self-defense; a walker is not a person; as Kindred you can Feed, and a mortal who sees it means a breach of the Masquerade.
- **Your world's own laws.** Write laws for your setting (a control order, a bounty, a curfew): who may do what to which kind of people, who they are handed to, who disapproves. Or let **Set up from the lore** read your lorebooks and cards and propose the laws, groups, the police and what each person is, for you to review.
- **Taken prisoner, or asked along.** When the story takes you prisoner, your captor takes you to their place and never leaves your side, wherever they take you next. When a character asks you to come with them, you choose; if you go, they come along.
- **Matchmaking.** Characters have crushes on each other (secret ones too). Ask someone about their love life, then introduce them to the one they like: the engine decides whether it clicks, the AI plays it, and a good match may start dating. In a crowd, talk with just two or three of the people there.
- **Characters out of lorebooks.** Library → a lorebook (or a card with a whole cast in it) → **Find the characters in it**: the AI lists the people, you tick who to keep, and each gets their own card, in a folder, with the lorebook linked.
- **The narrator keeps track of the room.** When someone leaves or walks in during a scene, a short narrator line says so, and the AI stops writing in people who are gone.
- **Sprite packs from one picture.** Library → a character → Expressions → **Make a sprite pack**: your ComfyUI makes every expression (with a transparent background) from one portrait, and you keep the ones you like. See [Sprite packs](#sprite-packs).
- **Macros** such as `{{mundi_place}}`, `{{mundi_here}}`, `{{mundi_mobility}}` and `{{mundi_can_leave}}`, for your own cards and lorebooks.
- Turn it on or off in **Settings → Game → Player state**. The full list is in the [CHANGELOG](CHANGELOG.md).

## Sprite packs

**Library → a character → Expressions → Make a sprite pack.** Give it one picture: the card's own, or any other (for example a NovelAI portrait). Each expression is an edit of that picture, so the character and the art style stay the same.

What your ComfyUI needs for the built-in workflow:

- A recent ComfyUI (with the Qwen Image Edit nodes).
- [comfyui-tooling-nodes](https://github.com/Acly/comfyui-tooling-nodes), for the `ETN_LoadImageBase64` node. It's the same node SillyTavern's own avatar workflow uses, and you can install it from ComfyUI Manager.
- The model files:

  | File | Folder | Where |
  |---|---|---|
  | `qwen_image_edit_2511_fp8mixed.safetensors` (or 2509) | `models/diffusion_models` | [Comfy-Org/Qwen-Image-Edit_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files/diffusion_models) |
  | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `models/text_encoders` | [Comfy-Org/Qwen-Image_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/text_encoders) |
  | `qwen_image_vae.safetensors` | `models/vae` | [Comfy-Org/Qwen-Image_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/vae) |
  | `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` (optional, much faster) | `models/loras` | [lightx2v/Qwen-Image-Edit-2511-Lightning](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning) |

The fp8 diffusion model is large. If it's slow or runs out of video memory on your card, a GGUF version (Q4/Q5) works too, through [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF). Pick it under **Model files** (the panel picks a Qwen Image Edit file your ComfyUI has on its own, if the default one isn't there). You can also use one of your own ComfyUI workflows from SillyTavern: it gets the picture as `%char_avatar%` and the edit as `%prompt%`.

For a transparent background, the default asks for a plain green background and keys it out in the browser. Pick magenta if the character wears green, or use ComfyUI's Remove Background node instead.

## Screenshots

| | |
|---|---|
| ![At home, with the phone open](docs/home.jpg) | ![Courses](docs/courses.jpg) |
| ![A match on Spark, the dating app](docs/spark.jpg) | ![Someone's card in a scene](docs/people.jpg) |
| ![How the day went](docs/diary.jpg) | ![Chirp, the social network](docs/chirp.jpg) |

On a phone:

<p align="center">
  <img src="docs/phone-scene.jpg" width="23%" alt="A scene on a phone">
  <img src="docs/phone-map.jpg" width="23%" alt="The map on a phone">
  <img src="docs/phone-homes.jpg" width="23%" alt="The Homes app">
  <img src="docs/phone-profile.jpg" width="23%" alt="The Profile app">
</p>

## Install

**From GitHub (gets updates):**

1. In SillyTavern, open **Extensions → Install extension**.
2. Paste `https://github.com/coldasblues/Mundi` and install. To update later, use the update button next to Mundi under **Extensions → Manage extensions**.
3. Reload SillyTavern (Ctrl+F5). Open Mundi from the **Extensions menu** (the magic wand next to the chat box). The tour starts the first time you open it.

**Without Git (a zip):**

1. Get a zip of Mundi: on this page use **Code → Download ZIP**, or take **Source code (zip)** from a release under [Releases](https://github.com/coldasblues/Mundi/releases), or use a zip someone gave you.
2. Unzip it into `SillyTavern/data/default-user/extensions/`, so the folder with `manifest.json` in it sits right inside `extensions` (for example `extensions/Mundi-main/manifest.json`). The folder's name doesn't matter. That's for one user; use your own user folder instead of `default-user` if you have several. To install for every user, unzip into `SillyTavern/public/scripts/extensions/third-party/` instead.
3. Reload SillyTavern (Ctrl+F5).

Keep only one copy of Mundi: remove or move any other Mundi folder first, or both will load. To update from a zip, replace the folder with the new one. Your saves live in your chats, not in this folder, so they stay.

Works with SillyTavern 1.19 or newer. Any chat-completion or text-completion API works; a context of about 30k tokens is a good size.


## Building from source

The repository ships the compiled `dist/` and `style.css`, so you don't need to build to use it. To change the code:

```sh
npm i -g typescript
./build.sh        # src/*.ts → dist/, css/*.css → style.css
```

## Credits

- Sounds by [Kenney](https://kenney.nl) (CC0).
- Seraphina is SillyTavern's default character; her picture is bundled for the tour.

## License

[AGPL-3.0](LICENSE), the same license as SillyTavern. The player state changes in this fork are under the same license and are listed, with dates, in the [CHANGELOG](CHANGELOG.md).
