# KaraFence

## Theme

**KaraFence** is a tower defense game set at a karaoke night gone hostile.

- **The goal:** defend the **singer on stage** from waves of disruptive audience
  members walking up the aisles toward the stage.
- **Towers** are **singers and instruments** (e.g. backup vocalists, a drummer,
  a bassist) that you place along the aisles to fend off the crowd.
- **Enemies** are **bad-audience archetypes** marching up the lanes:
  - **Hecklers** — loud, throw insults that disrupt nearby towers.
  - **Phone-scrollers** — slow, oblivious, soak up damage.
  - **Drunk uncles** — erratic movement, hard to target.
  - **Stage-rushers** — fast; make a beeline for the stage.

If too many disruptors reach the stage, the show is over.

## Stack

- **[Vite](https://vitejs.dev/)** — dev server and bundler.
- **[Phaser 3](https://phaser.io/)** — game framework (rendering, scenes, input).
- **TypeScript** — strict mode, bundler module resolution.

## Folder structure

```
karafence/
├── index.html              # Mounts the game into #game
├── vite.config.ts          # base: '/karafence/' for GitHub Pages
├── src/
│   ├── main.ts             # Phaser.Game config + entry point
│   ├── scenes/             # Phaser scenes (BootScene, future game scenes)
│   ├── data/               # Static game data (wave defs, tower/enemy stats)
│   ├── systems/            # Game logic systems (waves, targeting, economy)
│   ├── ui/                 # HUD / UI components
│   └── types/              # Shared TypeScript types
├── public/
│   └── assets/             # Static assets copied as-is (sprites, audio)
└── .github/workflows/
    └── deploy.yml          # Build + deploy dist/ to GitHub Pages on push to main
```

## Rendering config

Defined in `src/main.ts`:

- `pixelArt: true` — crisp scaling for pixel-art assets.
- Logical resolution **480×270** (16:9, deliberately wide to fit a TD lane grid).
- `Phaser.Scale.FIT` + `Phaser.Scale.CENTER_BOTH` — scales to the viewport,
  letterboxed and centered.
- Dark background (`#0b0b12`).

## Scene flow

```
BootScene  →  GameScene  →  (future) MenuScene / GameOverScene
```

- **BootScene** logs `"boot"` and immediately starts `GameScene`. Asset
  preloading will live here later.
- **GameScene** (`src/scenes/GameScene.ts`) renders the lane grid and the
  stage. It reads a data-driven map and lays it out to fit the canvas. No game
  systems (enemies, towers, waves) are wired up yet.

## Map / lanes

Maps are **data-driven**. A level is authored as ASCII rows + a legend and
parsed into a `MapDefinition`:

- `src/types/map.ts` — `TileType` (`stage` / `aisle` / `build`) and
  `MapDefinition` (grid, lane rows, spawn/stage columns).
- `src/data/level1.ts` — "The Open Mic": 16×11 grid, **5 aisles** running
  right→left toward the stage, separated by buildable rows so a tower between
  two aisles can cover both. Edit the ASCII to author a new map.

`GameScene` fits the whole map below a HUD strip and centers it; with
`Scale.FIT` this scales as a unit — fits to width on portrait phones, fills
cleanly centered on landscape desktop. Tile colors are flat placeholders:
stage (purple), aisle (carpet brown), buildable seats/floor (teal). The singer
is a placeholder rect + label in the stage zone, with a `damageSinger()` hook
for when enemies reach the stage.

## NPM scripts

- `npm run dev` — start the Vite dev server.
- `npm run build` — type-check (`tsc`) then build to `dist/`.
- `npm run preview` — preview the production build locally.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs
`npm ci && npm run build` and publishes `dist/` to GitHub Pages. The Vite
`base` is `/karafence/`, so the site serves from
`https://<user>.github.io/karafence/`.
