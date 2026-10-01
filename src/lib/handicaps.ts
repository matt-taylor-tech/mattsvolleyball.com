// Level Up handicap pool for the Wednesday Shuffle league.
//
// Codes are `{level}-{n}` and are written out explicitly so they stay stable:
// when a handicap is retired, delete it and leave the gap; new ones get the
// next unused number in their level. Never reuse a retired code.

export type HandicapTag =
  | 'icebreaker'
  | 'banter'
  | 'silly'
  | 'communication'
  | 'teamspirit'
  | 'booster'
  | 'fundamentals'
  | 'gameplay';

export interface Handicap {
  code: string;
  text: string;
  tag: HandicapTag;
  /** Only used for these team sizes; omitted means every format. */
  formats?: string;
  /** Part of the engine's default set. */
  isDefault?: boolean;
  /**
   * 1-12 rating from Volleyball Engine. Levels here follow a 4-game night:
   * 1-4 is Level 2, 5-8 Level 3, 9-12 Level 4. Lists are sorted easiest first.
   */
  difficulty?: number;
}

export interface HandicapLevel {
  level: number;
  name: string;
  description: string;
  handicaps: Handicap[];
}

export const TAG_LABELS: Record<HandicapTag, string> = {
  icebreaker: 'Icebreaker',
  banter: 'Banter',
  silly: 'Silly',
  communication: 'Communication',
  teamspirit: 'Team Spirit',
  booster: 'Booster',
  fundamentals: 'Fundamentals',
  gameplay: 'Gameplay',
};

export const HANDICAP_LEVELS: HandicapLevel[] = [
  {
    level: 1,
    name: 'Standard Play',
    description: 'Social and silly handicaps to break the ice, plus a few boosters that give your team a little help.',
    handicaps: [
      // Icebreakers
      { code: '1-1', tag: 'icebreaker', text: "First serve each rotation: guess an opponent's hidden talent - they confirm or deny." },
      { code: '1-2', tag: 'icebreaker', text: 'First serve each rotation: share a fun fact about yourself.' },
      { code: '1-3', tag: 'banter', text: 'First serve each rotation: compliment an opponent.' },
      { code: '1-4', tag: 'icebreaker', text: 'First serve each rotation: ask an opponent a get-to-know-you question.' },
      { code: '1-5', tag: 'icebreaker', text: 'First serve each rotation: share an embarrassing fact about yourself.' },
      { code: '1-6', tag: 'icebreaker', text: 'First serve each rotation: reveal a guilty pleasure TV show or song.' },
      { code: '1-7', tag: 'icebreaker', text: "First serve each rotation: ask an opponent a 'would you rather' question." },
      { code: '1-8', tag: 'icebreaker', text: 'First serve each rotation: share your hottest food take.' },
      { code: '1-9', tag: 'icebreaker', text: 'Everyone must yell their own name before playing the ball.' },
      // Recategorized after review; codes kept stable
      { code: '1-10', tag: 'icebreaker', text: "First serve each rotation: tell an opponent what they'd be famous for." },
      { code: '1-11', tag: 'banter', text: 'First serve each rotation: offer an opponent unsolicited coaching advice.' },
      { code: '1-12', tag: 'silly', text: 'First serve each rotation: do your best impression of someone on the court.' },
      { code: '1-13', tag: 'banter', text: 'First serve each rotation: insult an opponent.' },
      // Silly
      { code: '1-14', tag: 'silly', text: 'First serve each rotation: dramatic slow-motion wind-up.' },
      { code: '1-15', tag: 'silly', text: 'For each of your subsequent serves, yell the score in a higher tone than the last.' },
      { code: '1-16', tag: 'silly', text: 'For each of your subsequent serves, yell the score in a lower tone than the last.' },
      { code: '1-17', tag: 'silly', text: "Royal Court: Players must address their teammates as 'Your Majesty' for the entire game." },
      { code: '1-18', tag: 'silly', text: 'First serve each rotation: make a sound effect as you serve.' },
      { code: '1-19', tag: 'silly', text: 'First serve each rotation: tell your worst joke. If anyone laughs, earn a point.' },
      { code: '1-20', tag: 'silly', text: 'First serve each rotation: deliver a movie quote before serving.' },
      { code: '1-21', tag: 'silly', text: 'First serve each rotation: give the ball a pep talk before serving.' },
      { code: '1-22', tag: 'silly', text: 'First serve each rotation: sing a line from a song.' },
      { code: '1-23', tag: 'silly', text: 'All players must talk in an accent for the entire game.' },
      // Communication, team spirit
      { code: '1-24', tag: 'communication', text: 'Your server is not allowed to talk until they are out of the server position.' },
      { code: '1-25', tag: 'communication', text: 'Your setter is not allowed to talk until they are out of the setter position.' },
      { code: '1-26', tag: 'communication', text: "Everyone must announce what they're about to do before they do it." },
      { code: '1-27', tag: 'teamspirit', text: 'Pick a team catchphrase and yell it before your serve.' },
      { code: '1-28', tag: 'teamspirit', text: 'Publicist: After a teammate makes a great play, another teammate must announce why everyone should be impressed.' },
      // Boosters
      { code: '1-29', tag: 'booster', text: 'Server gets a free re-serve if the serve lands out.' },
      { code: '1-30', tag: 'booster', text: 'Free re-serve if the serve hits the net (let rule).' },
      { code: '1-31', tag: 'booster', text: "Serve errors don't count. Side-out but no point awarded to opponent." },
      { code: '1-32', tag: 'booster', text: "A player may yell 'Corona' before a 4th touch to keep the ball alive." },
      { code: '1-33', tag: 'booster', text: 'Your team gets 4 touches instead of 3 for the entire game.' },
      { code: '1-34', tag: 'booster', text: 'Start with a 5-point head start.' },
      { code: '1-35', tag: 'booster', text: 'Confusion Replay: if the ball drops untouched or two players collide going for it, call a replay.' },
    ],
  },
  {
    level: 2,
    name: 'Mild Restrictions',
    description: 'Light gameplay restrictions. Many are Fundamentals: habits good teams already have, like calling the ball and talking through the score.',
    handicaps: [
      { code: '2-1', difficulty: 1, tag: 'fundamentals', text: "Every ball crossing the net must be called 'in' or 'out' by your team." },
      { code: '2-2', difficulty: 1, tag: 'fundamentals', text: 'Server must call the score loudly before each serve.' },
      { code: '2-3', difficulty: 1, tag: 'fundamentals', text: 'Everyone on your team must repeat the score back after the server calls it.' },
      { code: '2-4', difficulty: 1, tag: 'gameplay', text: "Customer Support: When the setter needs help, they must yell, 'Your call is very important to us!'" },
      { code: '2-5', difficulty: 1, tag: 'fundamentals', text: 'All passes require an audible "mine" or "got it."' },
      { code: '2-6', difficulty: 1, tag: 'fundamentals', text: 'Seam Negotiation: Before serve receive, adjacent passers must loudly and politely negotiate who owns the seam.' },
      { code: '2-7', difficulty: 1, tag: 'gameplay', text: 'Your team must count your touches out loud. "ONE. TWO. THREE."' },
      { code: '2-8', difficulty: 1, tag: 'fundamentals', text: "GPS Setter: The setter must announce their location before every serve, such as 'Setter front-left!'" },
      { code: '2-9', difficulty: 2, tag: 'gameplay', text: 'The server cannot serve to the same player twice in a row.' },
      { code: '2-10', difficulty: 2, tag: 'fundamentals', text: 'All players on the team must rotate positions after each side-out.' },
      { code: '2-11', difficulty: 2, tag: 'fundamentals', isDefault: true, text: 'EVERY serve, the server must call out the name of the player they are serving to before making contact.' },
      { code: '2-12', difficulty: 2, tag: 'fundamentals', text: "Setter must call their target's name before setting." },
      { code: '2-13', difficulty: 2, tag: 'gameplay', text: 'Up to 3x per game, your opponent can call for an extra rotation before their serve.' },
      { code: '2-14', difficulty: 2, tag: 'fundamentals', text: 'Server must call which side of the court (left or right) they are serving to before serving.' },
      { code: '2-15', difficulty: 2, tag: 'gameplay', text: 'Your team must rotate every point, not just on side-out.' },
      { code: '2-16', difficulty: 3, tag: 'gameplay', text: "All serves must land in the BACK half of the opponent's court." },
      { code: '2-17', difficulty: 3, tag: 'gameplay', text: 'All sets must be bump sets - no hand setting allowed.' },
      { code: '2-18', difficulty: 3, tag: 'gameplay', text: 'Up to 3x per game, your opponent can arrange your team in beer pong formation (play button, straight line, etc.) before their serve.' },
      { code: '2-19', difficulty: 3, tag: 'gameplay', formats: '3v3-6v6', text: 'Only your setter is allowed to talk until they are out of the setter position.' },
      { code: '2-20', difficulty: 4, tag: 'gameplay', text: 'Up to 3x per game, your opponent can freeze one of your players before their serve. That player cannot move until a teammate touches the ball.' },
      { code: '2-21', difficulty: 4, tag: 'gameplay', text: 'All blocks must be performed by female players only.' },
      { code: '2-22', difficulty: 4, tag: 'gameplay', text: "Committee Decision: Your team votes on which opponent to serve to. The server must call out that player's name and serve to them." },
      { code: '2-23', difficulty: 4, tag: 'gameplay', text: 'Server must call which third (left, right, middle) of the court they are serving to before serving.' },
      { code: '2-24', difficulty: 4, tag: 'gameplay', text: "Up to 2x per game, your opponent can name two of your players who must stay within arm's reach of each other for the whole rally." },
      { code: '2-25', difficulty: 4, tag: 'gameplay', text: 'Mandatory Approach: A player sending over an attack must begin behind the attack line before approaching.' },
      { code: '2-26', difficulty: 4, tag: 'gameplay', formats: '3v3-4v4', text: 'One player (chosen by your team) must play the entire game in the back row only.' },
      { code: '2-27', difficulty: 4, tag: 'gameplay', text: 'First serve each rotation must be a sky ball.' },
    ],
  },
  {
    level: 3,
    name: 'Moderate Restrictions',
    description: 'Tighter gameplay restrictions that change who does what on your team.',
    handicaps: [
      { code: '3-1', difficulty: 5, tag: 'gameplay', text: 'All attacks (overhand hits) must go cross-court - no line shots allowed.' },
      { code: '3-2', difficulty: 5, tag: 'gameplay', text: "All serves must land in the FRONT half of the opponent's court." },
      { code: '3-3', difficulty: 5, tag: 'gameplay', text: 'The tallest player on your team cannot jump for blocks or attacks.' },
      { code: '3-4', difficulty: 5, tag: 'gameplay', text: 'Opposing team picks which half your serves must land in: front/back OR left/right.' },
      { code: '3-5', difficulty: 5, tag: 'gameplay', text: "Cry Wolf: The designated setter must yell 'HELP!' every time the ball comes toward them, whether they intend to take first contact or not." },
      { code: '3-6', difficulty: 6, tag: 'gameplay', text: 'The opposing team chooses one of your players to be the server the entire game.' },
      { code: '3-7', difficulty: 6, tag: 'gameplay', text: 'Your team must designate one player who is not your primary setter to set every ball for the entire game.' },
      { code: '3-8', difficulty: 6, tag: 'gameplay', text: 'All attacks (hard overhand hits) must be performed by a female player.' },
      { code: '3-9', difficulty: 6, tag: 'gameplay', isDefault: true, text: 'One of your male players, chosen by the opposing team, is not allowed to jump for the entire game.' },
      { code: '3-10', difficulty: 6, tag: 'gameplay', text: 'The opposing team designates your strongest hitter, who must then play defense for the entire game.' },
      { code: '3-11', difficulty: 6, tag: 'gameplay', text: 'Secret Setter: The designated setter must change every rotation, but the team cannot announce who it is.' },
      { code: '3-12', difficulty: 7, tag: 'gameplay', text: 'No Return to Sender: The player who makes first contact cannot send the ball over the net during that rally.' },
      { code: '3-13', difficulty: 7, tag: 'gameplay', text: 'All serves from your team must be underhand.' },
      { code: '3-14', difficulty: 7, tag: 'gameplay', isDefault: true, text: 'Players cannot use the same type of serve twice in a row (must alternate underhand, overhand, jump serve, etc.).' },
      { code: '3-15', difficulty: 7, tag: 'gameplay', text: 'The second touch must always be made by your designated setter.' },
      { code: '3-16', difficulty: 7, tag: 'gameplay', text: "All attacks (overhand swings) must go to the BACK half of the opponent's court - no short shots." },
      { code: '3-17', difficulty: 7, tag: 'gameplay', text: 'Your team must alternate which side of the court attacks come from (left side attack, then right side attack, etc.).' },
      { code: '3-18', difficulty: 8, tag: 'gameplay', text: 'Your team cannot block at the net. All players must stay behind the attack line on defense.' },
      { code: '3-19', difficulty: 8, tag: 'gameplay', text: "All attacks must go to the FRONT half of the opponent's court - no long shots." },
      { code: '3-20', difficulty: 8, tag: 'gameplay', text: 'Serve with your non-dominant hand.' },
      { code: '3-21', difficulty: 8, tag: 'gameplay', text: 'Receiver Must Finish: The player who makes first contact must also make the third contact that sends the ball over.' },
      { code: '3-22', difficulty: 8, tag: 'gameplay', text: 'No attack may travel in a straight line. Everything must be an off-speed shot with visible arc.' },
      { code: '3-23', difficulty: 8, tag: 'gameplay', text: 'Every serve, serve backwards or with eyes closed.' },
    ],
  },
  {
    level: 4,
    name: 'Tough Restrictions',
    description: 'The top level. Tough restrictions that take away your best weapons or flip how volleyball works.',
    handicaps: [
      { code: '4-1', difficulty: 9, tag: 'gameplay', formats: '4v4-6v6', text: 'Your team is not allowed to have any front-row players attack the ball.' },
      { code: '4-2', difficulty: 9, tag: 'gameplay', text: 'Male players cannot attack balls above the height of the net.' },
      { code: '4-3', difficulty: 9, tag: 'gameplay', text: "All of your team's hits over the net must be with a closed fist (a 'dink' or 'knuckles')." },
      { code: '4-4', difficulty: 9, tag: 'gameplay', text: 'Only one of your players can play the ball in the FRONT half of the court.' },
      { code: '4-5', difficulty: 9, tag: 'gameplay', text: 'Only one of your players can play the ball in the BACK half of the court.' },
      { code: '4-6', difficulty: 9, tag: 'gameplay', text: 'ALL serves must be a sky ball.' },
      { code: '4-7', difficulty: 9, tag: 'gameplay', text: 'All attacks must be pokes or roll shots - no hard spikes.' },
      { code: '4-8', difficulty: 10, tag: 'gameplay', isDefault: true, text: 'No player on your team is allowed to jump.' },
      { code: '4-9', difficulty: 10, tag: 'gameplay', text: "Your team's designated setter is not allowed to cross in front of the 10-foot line." },
      { code: '4-10', difficulty: 10, tag: 'gameplay', text: 'All serves must be underhand jump serves.' },
      { code: '4-11', difficulty: 10, tag: 'gameplay', text: 'No overhand contact at all. Bumps and body only.' },
      { code: '4-12', difficulty: 10, tag: 'gameplay', text: 'Your team is only allowed two touches to get the ball back over the net.' },
      { code: '4-13', difficulty: 10, tag: 'gameplay', text: 'Same-Player Ban: No player may contact the ball twice during the same possession.' },
      { code: '4-14', difficulty: 11, tag: 'gameplay', text: 'All attacks must land within 3 feet of the sidelines - no middle shots.' },
      { code: '4-15', difficulty: 11, tag: 'gameplay', text: 'Your team must set every ball backwards (setter facing away from target).' },
      { code: '4-16', difficulty: 11, tag: 'gameplay', text: 'All sets must be with one hand.' },
      { code: '4-17', difficulty: 11, tag: 'gameplay', text: 'All attacks must be one-handed and off your non-dominant hand.' },
      { code: '4-18', difficulty: 11, tag: 'gameplay', text: 'All overhand sets must be directed to the antenna (extreme angle sets only).' },
      { code: '4-19', difficulty: 12, tag: 'gameplay', text: "Opponent's Playbook: Before each rally, the opposing team chooses the required contact sequence, such as Player A → Player B → Player C." },
      { code: '4-20', difficulty: 12, tag: 'gameplay', text: 'One of your three hits must be without using your hands.' },
      { code: '4-21', difficulty: 12, tag: 'gameplay', text: 'All players on your team must jump when contacting the ball.' },
      { code: '4-22', difficulty: 12, tag: 'gameplay', text: 'No Repeat Contact Type: The team cannot use the same contact type twice during one possession - for example, two forearm passes.' },
    ],
  },
];
