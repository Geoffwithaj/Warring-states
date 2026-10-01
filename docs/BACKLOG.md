# Backlog

Known issues and agreed next steps, in rough priority order. Done items move to the commit log.

## Known exploits

- **Free cavalry conversion.** Re-equipping a unit costs gold per soldier (1 per 10 troops, 1 per 25 in
  horse country), charged only at the moment of conversion. Emptying a general's troops, converting
  the empty unit for free, then transferring the troops back skips the cost. Related holes:
  transferring troops into a general who already leads cavalry turns them into cavalry for nothing,
  and drafting directly into a cavalry unit costs the same as infantry.
  *Proposed:* a flat fee (about 200 gold) for any change of arm, on top of or instead of the
  per-soldier cost; consider charging the horse cost when infantry is transferred or drafted into a
  cavalry unit.

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

## To watch in playtesting

- **Archers** deal steady, risk-free but low damage (a volley about 45% of an infantry attack). Being
  able to pin raiders (no razing beside an enemy) may be enough of a role; if not, try about +20%.
- **Betrayals** never happen in simulation: faithless lords only turn on allies they have come to
  hate. Make it likelier if the politics feel too tame.
- **Pace of conquest**: lords strike at 1.3 times the defence. Lower it for a more fluid map.
- **Raids** should now be stoppable by engaging the raiders; check they are no longer a constant pain.
