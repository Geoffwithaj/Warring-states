# Backlog

Known issues and agreed next steps, in rough priority order. Done items move to the commit log.

## Design principles

- **Realism through stylization.** Rules should evoke how war worked (the Art of War, the novel)
  without simulating it: simple, legible mechanics over exhaustive detail.
- **Many defenders, not one.** A province is held by several units; one unit alone, even behind high
  walls, should fall to a reasonable force. Defenders need not all crowd into the castle.
- **Castles protect, they don't punish.** Walls shelter the garrison (arrows, melee, entry), but the
  castle's own damage stays modest: a shared volley, sallies only every other day, weaker blows when
  pressed, and a surrounded garrison loses heart.

## Known exploits

None open. (Free cavalry conversion was closed: a general pays a flat 200 gold the first time he
takes up an arm, whatever the size of his unit, and keeps the gear.)

## Planned

- **Phase 6: joint invasions** (as in RTK II): invite adjacent allies to join an attack, paying them in
  gold. The lord leading the invasion always takes the province, whichever general captures the
  castle; helpers keep only their plunder. Allied units are computer-controlled and arrive from
  their own direction.
- **Phase 7: defensive aid and coalitions**: allies bordering an attacked province can be asked to
  send help; members choose sides when two of their allies fall out; the 190 coalition should
  break up on its own.
- **Cache-proof updates**: show a version label on the title screen, and make new versions load fresh
  instead of mixing with cached files.

## Ideas

- **Wear a castle down before battle**: plots to sabotage walls or stir desertion in the garrison;
  raided fields leaving a besieged castle short of grain.

## To watch in playtesting

- **Sieges** were eased (garrison-scaled volley, rubble after a breach, every-other-day sallies,
  encirclement). Computer lords now take castles more readily too; check your own walls still hold.

- **Archers** deal steady, risk-free but low damage (a volley about 45% of an infantry attack). Being
  able to pin raiders (no razing beside an enemy) may be enough of a role; if not, try about +20%.
- **Betrayals** never happen in simulation: faithless lords only turn on allies they have come to
  hate. Make it likelier if the politics feel too tame.
- **Computer siege judgement** still values walls at the old, tougher rate (strength × (1 + walls/70)),
  so it may be slow to attack walled provinces now that castles fall more readily.
- **Pace of conquest**: lords strike at 1.3 times the defence. Lower it for a more fluid map.
- **Raids** should now be stoppable by engaging the raiders; check they are no longer a constant pain.
