// Single-elimination bracket engine for the playoffs page (issue #14).
//
// Two sources feed the same view model:
//   - fromEngine(): a live bracket run in VolleyballEngine (results, advancement)
//   - project():    a projected bracket seeded from TeamLinkt standings, shown
//                   before the playoff night is set up in VolleyballEngine
//
// The match model mirrors VolleyballEngine's standalone playoffs
// (src/lib/standalone-playoffs.ts there): the field is padded to a power of two
// P, seeded in standard bracket order, and match numbers are POSITIONAL in the
// padded bracket. A round-1 pair that includes a padding seed is a bye: there is
// no match, and the real seed sits directly in its round-2 slot. Round r match m
// is fed by round r-1 matches 2m-1 (side a) and 2m (side b).

export interface Seed {
  seed: number;
  name: string;
  /** Regular-season record, e.g. "6-2". Projected brackets only. */
  record?: string;
}

export interface BracketSide {
  seed: number | null;
  name: string | null;
  /** Shown when nobody is in the slot yet, e.g. "Winner of QF 1". */
  placeholder: string;
  won: boolean;
  /** Sets won (best of 3) or points (single game). */
  score: number | null;
}

export type MatchState = 'upcoming' | 'live' | 'final' | 'bye';

export interface BracketMatch {
  key: string;
  round: number;
  number: number;
  state: MatchState;
  a: BracketSide;
  b: BracketSide;
  /** Points per set, [a, b], for sets that have a score. */
  sets: [number, number][];
  court: string | null;
  time: string | null;
}

export interface BracketRound {
  name: string;
  short: string;
  matches: BracketMatch[];
}

export interface Bracket {
  title: string;
  projected: boolean;
  rounds: BracketRound[];
  thirdPlace: BracketMatch | null;
  champion: BracketSide | null;
}

// ── Seeding ─────────────────────────────────────────────────────────────────

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Standard seed order for a power-of-two field: 1 v P, and 1 and 2 only meet in the final. */
export function seedOrder(p: number): number[] {
  let order = [1];
  while (order.length < p) {
    const sum = order.length * 2 + 1;
    const next: number[] = [];
    order.forEach((s, i) => (i % 2 === 0 ? next.push(s, sum - s) : next.push(sum - s, s)));
    order = next;
  }
  return order;
}

/** Round-1 pairs as [better, worse] seeds. `worse` above the field size means a bye. */
function firstRoundPairs(teamCount: number): [number, number][] {
  const order = seedOrder(nextPowerOfTwo(teamCount));
  const pairs: [number, number][] = [];
  for (let i = 0; i < order.length; i += 2) {
    pairs.push([Math.min(order[i], order[i + 1]), Math.max(order[i], order[i + 1])]);
  }
  return pairs;
}

// ── Round names ─────────────────────────────────────────────────────────────

function roundNames(round: number, totalRounds: number): { name: string; short: string } {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return { name: 'Final', short: 'Final' };
  if (fromEnd === 1) return { name: 'Semifinals', short: 'SF' };
  if (fromEnd === 2) return { name: 'Quarterfinals', short: 'QF' };
  return { name: `Round ${round}`, short: `R${round}` };
}

// ── Shared assembly ─────────────────────────────────────────────────────────

/** One positional match as the sources describe it, before labels and byes. */
interface RawMatch {
  round: number;
  number: number;
  a: { seed: number | null; name: string | null };
  b: { seed: number | null; name: string | null };
  winner: 'a' | 'b' | null;
  live: boolean;
  scoreA: number | null;
  scoreB: number | null;
  sets: [number, number][];
  court: string | null;
  time: string | null;
}

function side(
  raw: { seed: number | null; name: string | null },
  placeholder: string,
  won: boolean,
  score: number | null,
): BracketSide {
  return { seed: raw.seed, name: raw.name, placeholder, won, score };
}

function assemble(
  title: string,
  projected: boolean,
  teamCount: number,
  raws: RawMatch[],
  thirdPlaceRaw: RawMatch | null,
  nameForSeed: (seed: number) => string | null,
): Bracket {
  const p = nextPowerOfTwo(teamCount);
  const totalRounds = Math.max(1, Math.log2(p));
  const byPosition = new Map(raws.map((m) => [`${m.round}:${m.number}`, m]));
  const pairs = firstRoundPairs(teamCount);

  const rounds: BracketRound[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const { name, short } = roundNames(round, totalRounds);
    const prevShort = round > 1 ? roundNames(round - 1, totalRounds).short : '';
    const matches: BracketMatch[] = [];
    const count = p / 2 ** round;

    for (let number = 1; number <= count; number++) {
      const key = `${round}:${number}`;
      if (round === 1 && pairs[number - 1][1] > teamCount) {
        const seed = pairs[number - 1][0];
        const bye = { seed, name: nameForSeed(seed) };
        matches.push({
          key, round, number, state: 'bye',
          a: side(bye, '', false, null),
          b: side({ seed: null, name: null }, 'Bye', false, null),
          sets: [], court: null, time: null,
        });
        continue;
      }

      const raw = byPosition.get(key);
      const feeder = (n: number) => (round === 1 ? 'TBD' : `Winner of ${prevShort} ${n}`);
      const empty = { seed: null, name: null };
      matches.push({
        key, round, number,
        state: raw?.winner ? 'final' : raw?.live ? 'live' : 'upcoming',
        a: side(raw?.a ?? empty, feeder(number * 2 - 1), raw?.winner === 'a', raw?.scoreA ?? null),
        b: side(raw?.b ?? empty, feeder(number * 2), raw?.winner === 'b', raw?.scoreB ?? null),
        sets: raw?.sets ?? [],
        court: raw?.court ?? null,
        time: raw?.time ?? null,
      });
    }
    rounds.push({ name, short, matches });
  }

  let thirdPlace: BracketMatch | null = null;
  if (thirdPlaceRaw) {
    const raw = thirdPlaceRaw;
    thirdPlace = {
      key: 'third', round: totalRounds, number: 2,
      state: raw.winner ? 'final' : raw.live ? 'live' : 'upcoming',
      a: side(raw.a, 'Loser of SF 1', raw.winner === 'a', raw.scoreA),
      b: side(raw.b, 'Loser of SF 2', raw.winner === 'b', raw.scoreB),
      sets: raw.sets, court: raw.court, time: raw.time,
    };
  }

  const final = rounds[rounds.length - 1].matches[0];
  const champion = final.a.won ? final.a : final.b.won ? final.b : null;
  return { title, projected, rounds, thirdPlace, champion };
}

// ── VolleyballEngine ────────────────────────────────────────────────────────

/** A playoff_brackets row from VolleyballEngine. */
export interface EngineBracket {
  id: string;
  division_name: string;
  team_count: number;
  seeds: { seed: number; name: string }[];
  display_order: number;
}

/** A playoff_matches row from VolleyballEngine. */
export interface EngineMatch {
  bracket_id: string;
  round: number;
  match_number: number;
  slot_a: number | null;
  slot_b: number | null;
  team_a: string | null;
  team_b: string | null;
  result_a: number | null;
  result_b: number | null;
  result_a2: number | null;
  result_b2: number | null;
  result_a3: number | null;
  result_b3: number | null;
  sets_a: number | null;
  sets_b: number | null;
  status: 'upcoming' | 'in_progress' | 'completed';
  court: string | null;
  time: string | null;
  format: 'single' | 'best_of_3';
  is_third_place: boolean;
}

/** Same rule as VolleyballEngine's getMatchWinner: sets for best of 3, points for one game. */
function engineWinner(m: EngineMatch): 'a' | 'b' | null {
  if (m.status !== 'completed') return null;
  const [x, y] = m.format === 'best_of_3' ? [m.sets_a ?? 0, m.sets_b ?? 0] : [m.result_a ?? 0, m.result_b ?? 0];
  return x > y ? 'a' : y > x ? 'b' : null;
}

export function fromEngine(bracket: EngineBracket, matches: EngineMatch[]): Bracket {
  const seedNames = new Map(bracket.seeds.map((s) => [s.seed, s.name]));
  const nameForSeed = (seed: number) => seedNames.get(seed) ?? null;
  const sideOf = (slot: number | null, team: string | null) =>
    slot !== null ? { seed: slot, name: nameForSeed(slot) } : { seed: null, name: team };

  const toRaw = (m: EngineMatch): RawMatch => {
    const sets: [number, number][] = [];
    for (const [x, y] of [[m.result_a, m.result_b], [m.result_a2, m.result_b2], [m.result_a3, m.result_b3]]) {
      if (x !== null && y !== null) sets.push([x, y]);
    }
    const single = m.format !== 'best_of_3';
    return {
      round: m.round,
      number: m.match_number,
      a: sideOf(m.slot_a, m.team_a),
      b: sideOf(m.slot_b, m.team_b),
      winner: engineWinner(m),
      live: m.status === 'in_progress',
      scoreA: single ? m.result_a : m.sets_a,
      scoreB: single ? m.result_b : m.sets_b,
      // A single game's score is already shown as the score.
      sets: single ? [] : sets,
      court: m.court,
      time: m.time,
    };
  };

  const tree = matches.filter((m) => !m.is_third_place).map(toRaw);
  const third = matches.find((m) => m.is_third_place);
  return assemble(bracket.division_name, false, bracket.team_count, tree, third ? toRaw(third) : null, nameForSeed);
}

// ── Projection from standings ───────────────────────────────────────────────

/** A bracket seeded from standings, before the night is set up in VolleyballEngine. */
export function project(title: string, seeds: Seed[]): Bracket {
  const teamCount = seeds.length;
  const bySeed = new Map(seeds.map((s) => [s.seed, s]));
  const raws: RawMatch[] = [];
  const blank = { winner: null, live: false, scoreA: null, scoreB: null, sets: [], court: null, time: null };
  firstRoundPairs(teamCount).forEach(([better, worse], i) => {
    if (worse > teamCount) return;
    raws.push({
      round: 1, number: i + 1,
      a: { seed: better, name: bySeed.get(better)?.name ?? null },
      b: { seed: worse, name: bySeed.get(worse)?.name ?? null },
      ...blank,
    });
  });
  // Byes move straight into round 2, as VolleyballEngine seats them.
  firstRoundPairs(teamCount).forEach(([better, worse], i) => {
    if (worse <= teamCount || teamCount <= 2) return;
    const number = Math.ceil((i + 1) / 2);
    let target = raws.find((m) => m.round === 2 && m.number === number);
    if (!target) {
      target = { round: 2, number, a: { seed: null, name: null }, b: { seed: null, name: null }, ...blank };
      raws.push(target);
    }
    target[(i + 1) % 2 === 1 ? 'a' : 'b'] = { seed: better, name: bySeed.get(better)?.name ?? null };
  });
  return assemble(title, true, teamCount, raws, null, (s) => bySeed.get(s)?.name ?? null);
}

/** The round to open on a phone: the first with a match still to play, else the final. */
export function currentRoundIndex(bracket: Bracket): number {
  const i = bracket.rounds.findIndex((r) => r.matches.some((m) => m.state === 'upcoming' || m.state === 'live'));
  return i === -1 ? bracket.rounds.length - 1 : i;
}
