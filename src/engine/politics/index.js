// The political engine: temperaments, opinion and trust, homelands, what each
// house wants, and espionage. The rest of the game talks to politics only
// through what is exported here, so it can be reworked on its own.

import { initTraits } from './traits.js';
import { initOpinion, opinionMonthly } from './opinion.js';
import { initHomelands, homelandMonthly } from './homeland.js';

export { TRAITS, traitOf, traitScale } from './traits.js';
export {
  opinionOf, opinionParts, standingWord, trustOf, trustWord, loseTrust, remember, canSeeStanding, makeContact,
  neighboursOf, onAttack, inTruce, DEEDS,
} from './opinion.js';
export { isHomeland, lostHomeland, grievance, onConquest, onFall } from './homeland.js';
export { covetedProvince } from './strategy.js';
export { spyChance, gatherIntelligence, factsFor, plainChance, SPY_COST } from './intel.js';

export function initPolitics(state, scenario) {
  initTraits(state);
  initOpinion(state, scenario.bonds);
  initHomelands(state);
  state.intel = {};
}

export function politicsMonthly(state) {
  opinionMonthly(state);
  homelandMonthly(state);
}
