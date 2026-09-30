// Monthly turn flow. As in the classic game, every province of every lord takes
// its turn in a random order each month; the player is prompted whenever one of
// their directly-ruled provinces comes up.

import { shuffle } from './rng.js';
import {
  officersIn, isHumanControlled, monthIndex, log, humanForces, forceName, governorOf,
} from './state.js';
import { endOfMonth } from './economy.js';
import { planProvinceTurn, aiDirective, autoAssignTasks, DIRECTIVES } from './ai.js';
import { executeCommand } from './commands.js';
import { finishBattle, isInteractive, resolveAuto } from './war.js';

export function startMonth(state) {
  const owned = Object.values(state.provinces).filter((p) => p.owner).map((p) => p.id);
  state.queue = shuffle(state, owned);
  state.queueIndex = 0;
  state.awaiting = null;
  for (const pid of owned) {
    const p = state.provinces[pid];
    const f = state.forces[p.owner];
    if (!f.human) autoAssignTasks(state, pid, 'balanced');
    else if (p.delegate) autoAssignTasks(state, pid, p.delegate.directive);
  }
}

function checkGameOver(state) {
  const alive = Object.values(state.forces).filter((f) => f.alive);
  const hadHumans = Object.values(state.forces).some((f) => f.human);
  if (hadHumans && !humanForces(state).length) {
    state.gameOver = { kind: 'defeat' };
    return;
  }
  const total = Object.keys(state.provinces).length;
  for (const f of alive) {
    const n = Object.values(state.provinces).filter((p) => p.owner === f.id).length;
    if (n === total) {
      state.gameOver = { kind: f.human ? 'victory' : 'unified', force: f.id };
      log(state, `${forceName(state, f.id)} has unified the land!`, 'major');
    }
  }
}

function runComputerTurn(state, pid) {
  const p = state.provinces[pid];
  const f = state.forces[p.owner];
  const delegated = f.human && p.delegate;
  const directive = delegated ? p.delegate.directive : aiDirective(state, pid, f.id);
  const action = planProvinceTurn(state, pid, directive, { isAI: !f.human });
  const res = executeCommand(state, pid, action.type, action.args);
  if (delegated && res.ok && action.type !== 'rest') {
    const gov = governorOf(state, pid);
    log(state, `[${p.name}] Governor ${gov?.name ?? ''} (${DIRECTIVES[directive].label}): ${res.msg}`, 'delegate', [f.id]);
  }
  return { action, res };
}

// Advance by one step: a single province's turn, or the end of the month.
// Returns one of
//   { type: 'await', pid } | { type: 'battle' } | { type: 'captives' } | { type: 'gameover' }
//   { type: 'month', idle }            the month rolled over (idle: the player has nothing to order)
//   { type: 'acted', pid, action, war } a computer-run province took its turn
//   { type: 'skip' }                   a province with nothing to do was passed over
export function step(state) {
  if (state.gameOver) return { type: 'gameover' };
  if (state.battle) return { type: 'battle' };
  if (state.pendingCaptives.length) return { type: 'captives' };
  if (state.awaiting) return { type: 'await', pid: state.awaiting };
  if (state.queueIndex >= state.queue.length) {
    endOfMonth(state);
    checkGameOver(state);
    startMonth(state);
    // A player whose every province is delegated still gets to watch each month go by.
    const idle = humanForces(state).length > 0 && !Object.keys(state.provinces).some((pid) => isHumanControlled(state, pid));
    return { type: 'month', idle };
  }
  const pid = state.queue[state.queueIndex];
  const p = state.provinces[pid];
  if (!p.owner || p.actedMonth === monthIndex(state) || !officersIn(state, pid).length) {
    state.queueIndex++;
    return { type: 'skip' };
  }
  if (isHumanControlled(state, pid)) {
    state.awaiting = pid;
    return { type: 'await', pid };
  }
  const owner = p.owner;
  const { action, res } = runComputerTurn(state, pid);
  state.queueIndex++;
  let war = null;
  if (res.ok && action.type === 'war') {
    const to = action.args.to;
    war = { from: pid, to, attacker: owner, defender: res.war.kind === 'battle' ? res.war.battle.forces.def : null, winner: 'att' };
    if (res.war.kind === 'battle') {
      if (isInteractive(res.war.battle)) {
        state.battle = res.war.battle;
        return { type: 'battle' };
      }
      war.winner = resolveAuto(state, res.war.battle).winner;
    }
  }
  return { type: 'acted', pid, owner, action, ok: res.ok, msg: res.msg, war };
}

// Advance until the game needs the player. Returns what it is waiting for:
// { type: 'await', pid } | { type: 'battle' } | { type: 'captives' } | { type: 'gameover' } | { type: 'month' }
export function advance(state, { stopAtMonthEnd = false, maxMonths = Infinity } = {}) {
  let months = 0;
  for (;;) {
    const r = step(state);
    if (r.type === 'acted' || r.type === 'skip') continue;
    if (r.type === 'month') {
      months++;
      if (stopAtMonthEnd || months >= maxMonths || r.idle) return { type: 'month' };
      continue;
    }
    return r;
  }
}

// The player issues the command for the province currently awaiting orders.
export function playerCommand(state, type, args) {
  const pid = state.awaiting;
  if (!pid) return { ok: false, msg: 'No province is awaiting orders.' };
  const res = executeCommand(state, pid, type, args, { interactiveAttacker: true });
  if (!res.ok) return res;
  state.awaiting = null;
  state.queueIndex++;
  if (res.war?.kind === 'battle') state.battle = res.war.battle;
  return res;
}

// Let the governor handle just this month's turn for an awaiting province.
export function governorTakesTurn(state, directive = 'balanced') {
  const pid = state.awaiting;
  if (!pid) return null;
  const action = planProvinceTurn(state, pid, directive, { isAI: false });
  return playerCommand(state, action.type, action.args);
}

export function concludeBattle(state) {
  const b = state.battle;
  if (!b?.result) return null;
  const outcome = finishBattle(state, b);
  state.battle = null;
  return outcome;
}

export function newGameStart(state) {
  startMonth(state);
  log(state, `${state.year} AD. The realm is in turmoil.`, 'major');
}
