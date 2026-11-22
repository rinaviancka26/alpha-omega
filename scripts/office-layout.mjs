// Geometry of the PLACEHOLDER office map (pixels on the 1448×1086 canvas).
// Used by make-placeholder-art.mjs to draw the map and by make-coordinates.mjs to
// produce web/src/office-coordinates.json, so the two always match.
// Room keys are the fixed contract; labels come from the card.
export const W = 1448, H = 1086;
export const WALL = 12;

// Room rectangles [x0, y0, x1, y1]
export const ROOMS = {
  briefing: [24, 24, 480, 300],
  meeting:  [480, 24, 960, 300],
  approval: [960, 24, 1424, 300],
  workspace:[24, 380, 600, 720],
  command:  [700, 380, 1424, 720],
  lounge:   [24, 800, 420, 1062],
  pantry:   [420, 800, 900, 1062],
  server:   [900, 720, 1424, 1062],
};
// Corridors [x0,y0,x1,y1] (floor only, drawn under rooms)
export const CORRIDORS = [
  [24, 300, 1424, 380],   // top: under the top row
  [600, 380, 700, 800],   // down the middle (between Workspace and Command)
  [24, 720, 900, 800],    // along the bottom (above Lounge/Pantry, beside Server)
];
// Doorways: gap in a wall. side = which wall of the room; [a,b] = span along that wall; to = what it opens into.
export const DOORS = [
  { room: 'briefing',  side: 'bottom', span: [215, 305], to: 'corridor' },
  { room: 'meeting',   side: 'bottom', span: [675, 765], to: 'corridor' },
  { room: 'approval',  side: 'bottom', span: [1145, 1235], to: 'corridor' },
  { room: 'workspace', side: 'right',  span: [505, 595], to: 'corridor' },
  { room: 'command',   side: 'left',   span: [505, 595], to: 'corridor' },
  { room: 'pantry',    side: 'top',    span: [560, 650], to: 'corridor' },
  { room: 'lounge',    side: 'right',  span: [890, 980], to: 'pantry' },   // Lounge opens into Pantry
  { room: 'server',    side: 'top',    span: [1115, 1205], to: 'command' }, // Server opens into Command
];

// Walkway graph (pixel coords). Door node ids are "d_<room>".
export const DOOR_POINTS = {
  briefing: [260, 300], meeting: [720, 300], approval: [1190, 300],
  workspace: [600, 550], command: [700, 550], pantry: [605, 800],
  lounge: [420, 935], server: [1160, 720],
};
export const NODES = {
  j_top_w: [260, 340], j_top_m: [720, 340], j_top_c: [650, 340], j_top_e: [1190, 340],
  j_mid: [650, 550], j_bot: [650, 760], j_bot_p: [605, 760],
  // inside-room waypoints so paths into rooms entered through another room stay off walls
  w_pantry: [520, 935], w_command: [1160, 650],
};
export const EDGES = [
  ['d_briefing', 'j_top_w'], ['j_top_w', 'j_top_c'], ['j_top_c', 'j_top_m'], ['d_meeting', 'j_top_m'],
  ['j_top_m', 'j_top_e'], ['d_approval', 'j_top_e'],
  ['j_top_c', 'j_mid'], ['d_workspace', 'j_mid'], ['d_command', 'j_mid'],
  ['j_mid', 'j_bot'], ['j_bot', 'j_bot_p'], ['j_bot_p', 'd_pantry'],
  ['d_pantry', 'w_pantry'], ['w_pantry', 'd_lounge'],
  ['d_command', 'w_command'], ['w_command', 'd_server'],
];
// Which graph node each room's characters use as their "front door" for pathfinding.
export const ROOM_NODE = {
  briefing: 'd_briefing', meeting: 'd_meeting', approval: 'd_approval', workspace: 'd_workspace',
  command: 'd_command', pantry: 'd_pantry', lounge: 'd_lounge', server: 'd_server',
};
// Seats (pixel coords of the character's FEET). Order matters: the lead takes the first command seat.
export const SEATS = {
  command:   [[1060, 520], [1200, 520], [1340, 520], [920, 660], [1060, 660], [1340, 660]],
  workspace: [[130, 520], [270, 520], [410, 520], [130, 670], [270, 670], [410, 670]],
  server:    [[990, 850], [1290, 850], [990, 1000], [1140, 1000], [1290, 1000]],
  briefing:  [[90, 170], [160, 250], [240, 170], [330, 250], [400, 170], [90, 260], [400, 260], [240, 100]],
  meeting:   [[560, 130], [650, 130], [740, 130], [830, 130], [560, 250], [650, 250], [790, 250], [880, 250]],
  approval:  [[1080, 200], [1220, 200], [1340, 200]],
  pantry:    [[480, 1000], [570, 1000], [660, 1000], [750, 1000], [840, 1000], [650, 905]],
  lounge:    [[80, 870], [180, 870], [280, 870], [80, 1010], [180, 1010], [300, 1010]],
};
