#!/bin/sh
# Builds the extension: TypeScript → dist/, CSS parts → style.css. Then the save-safety checks run: a build that
# would break players' saves (a removed id in a built-in world, or an old save that no longer opens) fails.
# Needs TypeScript (npm i -g typescript, or set TSC to your tsc) and Node 18+.
set -e
cd "$(dirname "$0")"
${TSC:-tsc} -p tsconfig.json
cat css/*.css > style.css
# the save-safety and system tests live in tests/ (not part of this repository): they run when it is there
if [ -d tests ]; then
    node tests/ids.mjs
    node tests/parity.test.mjs 2>/dev/null | grep -v '^\[Mundi\]'
    node tests/saves.test.mjs > /tmp/mundi-saves-test.log 2>&1 || { cat /tmp/mundi-saves-test.log; echo "SAVE TESTS FAILED"; exit 1; }
    tail -1 /tmp/mundi-saves-test.log
    node tests/systems.test.mjs > /tmp/mundi-systems-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-systems-test.log; echo "SYSTEM TESTS FAILED"; exit 1; }
    echo "systems: $(tail -1 /tmp/mundi-systems-test.log)"
    node tests/prompt.test.mjs > /tmp/mundi-prompt-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-prompt-test.log; echo "PROMPT TESTS FAILED"; exit 1; }
    echo "prompt: $(tail -1 /tmp/mundi-prompt-test.log)"
    node tests/world.test.mjs > /tmp/mundi-world-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-world-test.log; echo "WORLD TESTS FAILED"; exit 1; }
    echo "world: $(tail -1 /tmp/mundi-world-test.log)"
    node tests/daylife.test.mjs > /tmp/mundi-daylife-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-daylife-test.log; echo "DAY LIFE TESTS FAILED"; exit 1; }
    echo "day life: $(tail -1 /tmp/mundi-daylife-test.log)"
    node tests/rumors.test.mjs > /tmp/mundi-rumors-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-rumors-test.log; echo "RUMOR TESTS FAILED"; exit 1; }
    echo "rumors: $(tail -1 /tmp/mundi-rumors-test.log)"
    node tests/daynight.test.mjs > /tmp/mundi-daynight-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-daynight-test.log; echo "DAY/NIGHT TESTS FAILED"; exit 1; }
    echo "day/night: $(tail -1 /tmp/mundi-daynight-test.log)"
    node tests/social.test.mjs > /tmp/mundi-social-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-social-test.log; echo "SOCIAL TESTS FAILED"; exit 1; }
    echo "social: $(tail -1 /tmp/mundi-social-test.log)"
    node tests/rpg.test.mjs > /tmp/mundi-rpg-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-rpg-test.log; echo "RPG TESTS FAILED"; exit 1; }
    echo "rpg: $(tail -1 /tmp/mundi-rpg-test.log)"
    node tests/combat.test.mjs > /tmp/mundi-combat-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-combat-test.log; echo "COMBAT TESTS FAILED"; exit 1; }
    echo "combat: $(tail -1 /tmp/mundi-combat-test.log)"
    node tests/society.test.mjs > /tmp/mundi-society-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-society-test.log; echo "SOCIETY TESTS FAILED"; exit 1; }
    echo "society: $(tail -1 /tmp/mundi-society-test.log)"
    node tests/realm.test.mjs > /tmp/mundi-realm-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-realm-test.log; echo "REALM TESTS FAILED"; exit 1; }
    echo "realm: $(tail -1 /tmp/mundi-realm-test.log)"
    node tests/growth.test.mjs > /tmp/mundi-growth-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-growth-test.log; echo "GROWTH TESTS FAILED"; exit 1; }
    echo "growth: $(tail -1 /tmp/mundi-growth-test.log)"
    node tests/economy.test.mjs > /tmp/mundi-economy-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-economy-test.log; echo "ECONOMY TESTS FAILED"; exit 1; }
    echo "economy: $(tail -1 /tmp/mundi-economy-test.log)"
    node tests/adventure.test.mjs > /tmp/mundi-adventure-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-adventure-test.log; echo "ADVENTURE TESTS FAILED"; exit 1; }
    echo "adventure: $(tail -1 /tmp/mundi-adventure-test.log)"
    node tests/hobbies.test.mjs > /tmp/mundi-hobbies-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-hobbies-test.log; echo "EVENTS/HOBBIES TESTS FAILED"; exit 1; }
    echo "events and hobbies: $(tail -1 /tmp/mundi-hobbies-test.log)"
    node tests/rpglock.test.mjs > /tmp/mundi-rpglock-test.log 2>&1 || { grep -v "^\[Mundi\]" /tmp/mundi-rpglock-test.log; echo "RPG LOCK TESTS FAILED"; exit 1; }
    echo "rpg lock: $(tail -1 /tmp/mundi-rpglock-test.log)"
    node tests/version.test.mjs > /tmp/mundi-version-test.log 2>&1 || { cat /tmp/mundi-version-test.log; echo "VERSION TESTS FAILED"; exit 1; }
    echo "version: $(tail -1 /tmp/mundi-version-test.log)"
fi
echo "build ok"
