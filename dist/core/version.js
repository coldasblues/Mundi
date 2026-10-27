// The version of Mundi (the same as manifest.json: a test checks it) and what each version brought.
export const VERSION = '0.2.0-ps.23';
// Newest first. The first one is what the window shows after an update.
export const CHANGELOG = [
    { v: '0.2.0', title: 'Homes', items: [
            ['home', 'Home: a new way to play. One house, the characters you choose, and no work, money or bills: just the people and the story.'],
            ['users', 'A ready Home, The Shared House, or your own one made in the Home creator.'],
            ['map', 'Houses with floors and a floor plan, Go out to take the story anywhere, Who lives here to move people in and out, and a dress code for each room.'],
            ['skip', 'In a Home, the clock moves a little with each message. Click it to let time pass.'],
            ['folder', 'Library: drag cards into folders, rename folders and sort them.'],
            ['image', 'Sprites overlap like a stage, and whoever spoke last stands in front.'],
            ['image', 'Porto Alto has a picture for every place, three kinds of apartments and houses, a gym and a cinema.'],
            ['lock', 'The RPG mode and the medieval style are coming soon: they are locked while they get finished.'],
        ] },
];
// "0.2.0" > "0.1.3"
// The fork's versions add "-ps.N" ("0.2.0-ps.23"): compared after the numbers ("0.2.0-ps.24" > "0.2.0-ps.23" > "0.2.0").
export function newer(a, b) {
    const split = (v) => { const [base, ps] = String(v).split('-ps.'); return [...base.split('.').map(n => parseInt(n, 10) || 0).concat([0, 0, 0]).slice(0, 3), parseInt(ps ?? '0', 10) || 0]; };
    const pa = split(a), pb = split(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d)
            return d > 0;
    }
    return false;
}
