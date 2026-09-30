# Warring States

An homage to *Romance of the Three Kingdoms II* (SNES) that runs in the browser. It keeps the classic
structure — a provincial map of Han China, historical officers, provinces taking turns in a random order each month,
turn-based tactical battles — and adds more depth in three places: province development, delegation
to governors, and combat.

No build step and no dependencies: plain ES modules, SVG and CSS.

## Running it

ES modules must be served over HTTP, so start any static server from the repo root:

```sh
npm start            # python3 -m http.server 8000
# then open http://localhost:8000
```

It can also be deployed as-is to GitHub Pages or any static host.

```sh
npm test             # engine tests, including a 15-year all-AI simulation (Node 18+)
```

## What's in this first version

**Map and scenario**
- 51 provinces placed at the real locations of Han commanderies. Borders are Voronoi regions clipped to
  a China outline, and adjacency comes from the shared borders (with a few mountain and desert
  crossings removed by hand).
- Scenario: **190 AD — The Coalition Against Dong Zhuo**, with 24 lords, ~230 officers, and many unclaimed
  provinces to grab.
- Free officers follow RTK II's own Scenario 1 schedule, taken from B.L. Timmins' *Free Generals
  Compendium* (GameFAQs): about 200 officers become searchable in set provinces in set years (Zhuge
  Liang in 196, Xu Shu in 192, Jiang Wei in 222, …). RTK II's 41 province numbers are mapped onto this
  map's 51 provinces in `src/data/scenarios.js`.
- Auto-joiners work as in RTK II: an heir or protégé joins their relative's lord if that relative is
  serving when they appear (Sun Quan → Sun Jian in 197, Sima Yi → Cao Cao in 195); otherwise they
  appear as a searchable free officer. Officers age and die, and a lord who dies is succeeded by a
  relative or their most charismatic officer.
- Searching depends mostly on charm, and computer lords search quickly when talent appears. Released
  and deserting officers wander between provinces; officers who debut naturally stay put until found.
- Hot-seat multiplayer: pick several lords on the title screen.

**Screens (as in RTK II)**
- Between your turns the map fills the screen and other lords' actions play out on it: attacks are
  drawn as arrows and the result shown in a ticker. There's a speed setting (Normal, Fast, Instant),
  and tapping the map skips ahead.
- When one of your provinces comes up, a full orders screen appears; the Map button shows the map.
  War and Move switch to the map so you tap the target province.
- On phones the map supports pinch-zoom and drag and starts zoomed on your capital, and dialogs are
  full-screen. On wide screens the map and orders are shown side by side.

**Turn structure (as in RTK II)**
- Each month every province of every lord takes one turn, in a random order. In its turn a province
  can give any number of orders (Develop, Military, Personnel, Move, War, Trade, Diplomacy), but each
  officer can take only one job a month; officerless orders like trading are unlimited. War ends the
  turn; otherwise press End turn, or let the governor finish it. Computer lords play by the same rule.

**Economy (expanded)**
- Province stats: gold, food, population, farmland, commerce, flood control, walls, public order.
- Gold comes in every month from commerce and population. Food is harvested once a year, in the 7th
  month. Armies eat food every month, and soldiers desert when the granary runs dry.
- A tax rate per province (light, normal or heavy) trades income against public order. Order
  multiplies all income; when it is very low, bandits and riots follow.
- Summer floods hit river provinces unless their dikes are kept up. There are also locusts and plague.
  Population grows toward a cap that rises with farmland.
- Development has diminishing returns, and each project uses the relevant officer stat: INT for
  farmland, commerce and dikes, WAR for walls, CHA for relief.
- Food trades at a market price that changes with the seasons.

**Delegation and management tools (new)**
- **Delegate** any province to its governor with one of five directives: Balanced, Develop economy,
  Build military, Hold the line, or Expand. Governors act on their own and report what they did in the
  log. They also set their officers' assignments.
- **Standing assignments**: each officer can be given an ongoing job (tend farmland, oversee markets,
  maintain dikes, repair walls, keep order, drill troops). Assignments run every month for a small
  stipend, on top of the orders given in the province's turn.
- **Remit to capital**: an outlying province can send 25–75% of its income to the capital.
- Choose the governor, and see an income, harvest and upkeep forecast for each province.

**Combat (a little deeper)**
- Hex battlefields generated from the province's terrain: plains, forest, hills, mountain, marsh,
  rivers with fords, and a castle whose walls come from the province's Walls stat.
- Three unit types in a rock-paper-scissors triangle. Cavalry is fast, strong on open ground and deadly
  against archers. Infantry is steady and holds against cavalry. Archers shoot at range 2 (3 from high
  ground) without taking return damage.
- Zones of control, morale, training, fire that spreads with the wind (and is put out by rain), duels
  between officers, and supplies for a 30-day campaign.
- You win by taking the castle, routing the enemy commander, or destroying the enemy army.
- After a battle, captured officers can be recruited, released or executed.
- Battles between two computer lords resolve instantly with the same engine. Your battles can be played
  by hand or auto-resolved.

**Other**
- Diplomacy: send gifts to improve relations, or propose a three-year alliance.
- Personnel: search for talent, recruit free officers and captives, and reward officers to keep them
  loyal.
- Autosave, three save slots, a realm overview, and an officer roster.

## Code layout

```
index.html, css/style.css
src/data/        provinces (coords, terrain), officers (stats, lifespans), scenarios
src/engine/      pure game logic, no DOM — testable in Node
  state.js       game state creation and queries
  economy.js     income, harvest, development, the month-end tick, events, aging
  commands.js    the province commands and free management actions
  ai.js          province planner shared by computer lords and delegated governors
  war.js         declaring war, applying battle results, captives
  battle.js      tactical hex battle engine and battle AI
  turn.js        monthly turn flow (random province order, waiting for the player)
  map.js, geometry.js   Voronoi regions and adjacency
src/ui/          DOM/SVG rendering: map, province panel, command dialogs, battle screen
tests/           node:test suites
```

## Roadmap ideas

- More scenarios (194 Cao Cao in Yan province, 200 Guandu, 208 Red Cliffs, 220 Three Kingdoms)
- Plots and espionage: sow discord, incite rebellion, spy on provinces
- Fog of war on enemy province details
- Joint attacks with allies, and reinforcements arriving mid-battle
- Officer traits and skills (e.g. naval, fire, cavalry mastery), and officers who grow with experience
- River and naval battles on the Yangtze
- Portraits and music
