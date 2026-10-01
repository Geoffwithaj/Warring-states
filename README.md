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
  can give any number of orders (Develop, Military, Personnel, Move, War, Trade, Diplomacy, Plots), but each
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
- **Geography sets potential**: each province has a number of fertile tiles (25 Farmland each) and
  market sites (60 Commerce each). The Yellow River plain can hold many fields; the mountainous north
  and the far south have little land but strong ground. Development stays a continuous number; every
  full tile's worth shows as a field or market on the province's battlefield.

**Delegation and management tools (new)**
- **Delegate** any province to its governor with one of five directives: Balanced, Develop economy,
  Build military, Hold the line, or Expand. Governors act on their own and report what they did in the
  log. They also set their officers' assignments.
- **Standing assignments**: each officer can be given an ongoing job (tend farmland, oversee markets,
  maintain dikes, repair walls, keep order, drill troops) that runs at the end of every month. It
  counts as that officer's job for the month: officers on assignment are busy, and clearing the
  assignment frees them for orders the same turn (that month's work is then skipped).
- **Assignment budget**: drilling and patrols are free; building work (farmland, markets, dikes,
  walls) shares a per-province budget of 0–100% of monthly income, spent as efficiently as Develop,
  plus a little from the officers' own labour. Governors set the budget from their directive.
- **Remit to capital**: an outlying province can send 25–75% of its income to the capital.
- Choose the governor, and see an income, harvest and upkeep forecast for each province.

**Combat (in the spirit of the Art of War)**
- Every province has its own fixed battlefield (terrain, rivers and fords, castle position), so you
  learn its ground. Armies arrive from the side their home province lies on.
- Terrain decides what each arm can do:
  - Forest and hills give cover: better melee defence, and forest stops about half of all arrows.
  - Marsh and fords are poor footing: defenders there are exposed to arrows and fight worse.
  - Attacking uphill is harder; archers on high ground shoot one hex farther and hit harder.
- Cavalry is decisive only in the right place. A **charge** (fresh cavalry that has not moved) rides
  through the target and out the far side, and is only as good as the worst ground it crosses: across
  open plains it hits very hard, through forest or marsh it fizzles, and the castle cannot be charged.
  Ordinary cavalry attacks are modest. Infantry holds against cavalry; cavalry rides down archers.
- Archers trade volleys with archers in range, and are weak in melee.
- **Flanking**: a unit attacked while other enemies stand beside it takes more damage (a garrison
  too, once its walls are breached), and a unit attacked several times in one turn strikes back less
  hard each time.
- **The castle is a unit of its own**. Each defender turn its walls loose a free volley at every
  attacker beside them (stronger walls, heavier volleys), while the unit inside acts normally.
  The volley needs men on the walls — a full garrison (5,000 or more) shoots at full strength, a token
  one at a quarter — and it is shared among all the attackers beside the castle, so surrounding the
  walls spreads it thin. Strong walls also shelter the garrison from arrows and blows; once breached they
  are rubble and shelter it half as well. The unit holding the castle may strike out only every
  other day. **Encirclement**: when every open hex beside the castle is held by an attacker or covered
  by one next to it (three units spaced around the walls will do), the cut-off garrison loses heart
  each day, its volley weakens, and in the end it breaks. Infantry (and, weakly, archers) can
  assault the walls; the castle can only be entered once the walls are breached (down to half) and it
  is empty. An occupied castle holds even with ruined walls. Wall damage stays with the province.
- **Duels**: War decides them steeply — close matches are risky, a wide gap rarely loses. Refusing a
  challenge in the open costs the refusing unit and the whole army morale (never below 20); refuse
  twice and that unit loses heart for a day. A unit holding the castle may ignore challenges without
  shame. When challenged, you choose whether to accept, seeing the odds.
- Your turn ends by itself when no unit has anything left to do; press End turn to finish early.
- Morale, training, fire that spreads with the wind (put out by rain), supplies for a 30-day
  campaign. Win by taking the castle, routing the enemy commander, or destroying the enemy army.
- **Raiding**: battle is battle — a couple of fast units can go in to burn and plunder instead of
  laying siege. Developed fields and markets appear on the battlefield (the first six markets ring the
  castle; fields follow the rivers outward from the city). A unit that *starts* its turn on one, with
  no enemy beside it, can **Raze** it: a field gives 150 grain to the army's supplies, a market 40 gold carried by the unit, and
  the province loses that tile's development (and a little order and population) until it is rebuilt.
  Computer lords raid neighbours they cannot yet conquer, mostly before the harvest.
- **Withdrawing**: leaving from your own edge of the map is orderly and free — troops and plunder go
  home. Defenders can leave by any other edge if a friendly province lies beyond. Units that rout lose
  men and their plunder, and plunder taken back from captured officers returns to the province. If the
  commander withdraws, the rest fall back with 10% losses; if the commander is broken, they rout (40%).
- **Hold or pillage**: when your attack wins a province you choose to hold it, or to pillage it — carry
  off 70% of its gold and grain and your prisoners, and march home, leaving it to its lord. Computer
  raiders pillage unless the land is their war goal, their homeland, or easily held.
- A lord who leads an army abroad heads home to his seat on his next turn; the realm's usual
  balancing moves the other officers as threats require.
- **Defender deployment**: as in RTK II, the defender places its units before the first day, anywhere
  but the attackers' approach; the commander holds the castle. With few units you choose what to guard.
- After a battle, captured officers can be recruited, released or executed.
- Battles between two computer lords resolve instantly with the same engine. Your battles can be played
  by hand or auto-resolved.

**Politics and espionage (new)**
- Every house has a hidden temperament — ambition, honour, boldness, vengefulness and guile — set
  from the novel (Cao Cao ambitious and cunning, Liu Bei honourable and cautious, Yuan Shao ambitious
  but hesitant…). An heir inherits the house's temperament and carries on its designs.
- **Opinion** is built from remembered deeds — gifts, alliances, attacks, raids, conquests,
  executions, releases, spies caught — each fading at its own pace, grudges slowest in the vengeful.
  Attacking a lord angers that lord's friends; fighting a common enemy warms others.
- **Trust** is a lord's reputation for keeping faith, visible to all. Allies can be attacked, but it
  breaks the alliance and costs trust with every lord. A lapsed alliance leaves a year's truce, and
  breaking that costs trust too.
- **Homelands**: the provinces a house starts with. Its troops fight harder there, it pays dearly to
  recover them and resents whoever holds them. Land held for ten settled years becomes homeland.
- **What you can see**: how neighbouring lords regard you, and the deeds behind it. Distant lords are
  unknown until you send an envoy (their standing stays visible for a year).
- **Plots → Gather intelligence**: send an officer to a lord's court. Intelligence decides success, how
  much they bring back and how plainly: *"Dong Zhuo would betray an ally without a second thought."
  "Yuan Shao distrusts Yuan Shu, though they are allies." "Sun Jian desires Jiangxia above all
  else."* A failed agent may be caught and imprisoned. Reports go in the Intelligence journal.
- **War goals**: a computer lord picks one neighbouring province to take — a lost homeland first,
  then rich land held by lords it dislikes — and holds to it for up to two and a half years. Spare
  officers, troops, gold and food march province by province to a staging province on that border
  while enough stays home to deter the other neighbours; guileful lords raid the target meanwhile.
  It strikes once the gathered army is strong enough for the lord's boldness. Two failures, or a
  goal that stalls, and it looks elsewhere. A province facing a real threat draws reinforcements
  first. If you are the target, your scouts report the army massing across the border, and an
  agent can learn the goal outright.
- The 190 scenario starts with the coalition bound against Dong Zhuo, and old rivalries (the Yuan
  brothers; Gongsun Zan and Liu Yu).
- The political engine lives in `src/engine/politics/` and the rest of the game only uses its exported
  functions, so it can be reworked on its own.

**Other**
- Diplomacy: send gifts to improve relations, or propose a three-year alliance.
- Personnel: search for talent, recruit free officers and captives, and reward officers to keep them
  loyal.
- Autosave, three save slots, and save files you can export and import (to keep a game, move it to
  another device, or share it); a realm overview and an officer roster.

## Code layout

```
index.html, css/style.css
src/data/        provinces (coords, terrain), officers (stats, lifespans), scenarios
src/engine/      pure game logic, no DOM — testable in Node
  state.js       game state creation and queries
  economy.js     income, harvest, development, the month-end tick, events, aging
  commands.js    the province commands and free management actions
  ai.js          province planner shared by computer lords and delegated governors
  politics/      temperaments, opinion and trust, homelands, what each house wants, espionage
  war.js         declaring war, applying battle results, captives
  battle.js      tactical hex battle engine and battle AI
  turn.js        monthly turn flow (random province order, waiting for the player)
  map.js, geometry.js   Voronoi regions and adjacency
src/ui/          DOM/SVG rendering: map, province panel, command dialogs, battle screen
tests/           node:test suites
```

## Roadmap ideas

- More scenarios (194 Cao Cao in Yan province, 200 Guandu, 208 Red Cliffs, 220 Three Kingdoms)
- Fog of war on enemy province details
- Joint invasions as in RTK II: invite adjacent allies to join, paying them in gold. The lord leading
  the invasion always takes the province; helpers keep only what they plunder. Defensive aid, and
  coalitions that split when their members fall out
- Reinforcements arriving mid-battle
- More plots: sow discord, incite rebellion, false rumours
- Officer traits and skills (e.g. naval, fire, cavalry mastery), and officers who grow with experience
- River and naval battles on the Yangtze
- Portraits and music
