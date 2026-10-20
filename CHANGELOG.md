# Changelog

This is a fork of [tjalis/Mundi](https://github.com/tjalis/Mundi) (AGPL-3.0). Changes made in this fork are listed here, with their dates, as the license asks.

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
