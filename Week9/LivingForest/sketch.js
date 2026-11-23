/*

Sidney Ngai
DM3008 Generative Art - Week 9: Fractals & Recursion
"Living Forest"

Synopsis
  A forest of recursive trees under a sky that runs from midday to midnight
  as you move the mouse from left to right. Every tree is the same rule: a
  branch is a line with two smaller trees on its tip. As the light goes, the
  branches open up, the sun drops and turns into the moon, the stars come out
  and the blossoms start to glow, so the forest you see at midnight is the
  same forest as at noon, just lit differently.

What I changed from the Living Tree starter
  The weekly starter draws one tree under a fixed dusk sky. On top of its
  branch() recursion I added:
  - A forest. setup() grows TREES trees, each with its own seed, position,
    trunk length and recursion depth. They are drawn far to near, so near
    trees overlap far ones. Distance drives everything: far trees are
    shorter, thinner, shallower (depth 6 instead of 9) and blended towards
    the sky colour (atmospheric perspective), so they read as distant rather
    than just small.
  - A live sky. The starter caches its sky in createGraphics, but here the
    sky changes every frame, so it is redrawn as BANDS horizontal strips,
    cheap enough to run live and smooth enough that you cannot see the steps.
  - One celestial body instead of a fixed sun. A single disc arcs across the
    sky, dips to the horizon at sunset, and its size and colour shift from
    sun to sunset to moon on the way.
  - A day / night value, u (0 at midday, 1 at midnight), taken from mouseX.
    It is the single source of truth: sky, ground, bark, blossom, stars and
    the disc all read from it, through triLerp(), a three-stop colour ramp
    (midday, sunset, midnight).
  - Night glow. After dark each blossom gets stacked, low-alpha halos that
    spread wider and whiter, so where blossoms overlap in a dense canopy the
    tree lights up more than at its loose tips.
  - For the portfolio: rewrote this header, tidied and commented the code,
    and removed the save-PNG key.

Controls
  mouse X  left = midday, middle = sunset, right = midnight. The same axis
           widens the branch angle, so the trees open up as the light goes.
  R        grow a new forest (new positions, shapes and blossoms)

Attributions
  The recursive branch() (line, translate to the tip, two rotated children
  inside push() / pop()), the random angle and length jitter fixed with
  randomSeed(), the noise() wind that only moves the tips, the depth-based
  stroke weight and bark-to-twig colour, and the blossom() at the tips come
  from the Living Tree starter (DM3008 week 9 class material, Ashley Hi).
  The forest, distance and haze, live sky, celestial body, day / night
  colour ramps, stars, ground and night glow are my own.
  Written for p5.js 1.11.11 (https://p5js.org).

*/

//=== settings ===
let TREES = 7; // *** change how many trees are in the forest here
let BANDS = 180; // horizontal strips used to draw the sky gradient
let HORIZON = 0.58; // where the distant ground starts, as a fraction of height

let forestSeed = 7; // *** change the starting forest here
let trees = [];
let stars = [];

// set once per tree and read inside branch(), so the recursion does not need
// to pass six extra arguments down every level
let curDepth, curBark, curTwig, curBloom, curHaze, curWeight;
let curNight = 0; // 0 in daylight, 1 at midnight: how much the blossoms glow
let hazeCol; // the sky colour at the horizon, which far things fade towards

/////////////////////////////////////////////////////////////////
// Setup
// the stars and the forest are made once; draw() only lights them
/////////////////////////////////////////////////////////////////
function setup() {
  createCanvas(800, 800);
  colorMode(HSB, 360, 100, 100, 100);
  makeStars();
  makeForest();
}

function makeStars() {
  randomSeed(3); // the same sky every time
  stars = [];
  for (let i = 0; i < 170; i++) {
    stars.push({
      x: random(width),
      y: random(height * HORIZON),
      r: random(0.7, 2.3),
      a: random(25, 100),
      phase: random(TWO_PI), // so they do not all twinkle together
    });
  }
}

function makeForest() {
  randomSeed(forestSeed);
  trees = [];

  for (let i = 0; i < TREES; i++) {
    // spread the trees evenly from near (0) to far (1), then jitter
    let far = constrain(i / (TREES - 1) + random(-0.08, 0.08), 0, 1);

    trees.push({
      far: far,
      x: random(width * 0.08, width * 0.92),
      baseY: lerp(height * 0.92, height * (HORIZON + 0.03), far),
      len: lerp(118, 26, far), // trunk length: 118 near, 26 far
      depth: round(lerp(9, 6, far)), // far trees need fewer levels of recursion
      weight: lerp(1, 0.38, far),
      seed: floor(random(100000)),
    });
  }

  // far trees first, so near trees paint over them
  trees.sort(function (a, b) {
    return b.far - a.far;
  });
}

/////////////////////////////////////////////////////////////////
// Draw
// everything is lit by u, 0 at midday and 1 at midnight
/////////////////////////////////////////////////////////////////
function draw() {
  let u = constrain(mouseX / width, 0, 1);
  let angle = map(mouseX, 0, width, 0.18, 0.72); // the trees open up as the light goes

  // the sky's top and bottom colour at midday, sunset and midnight
  let skyTop = triLerp(color(205, 52, 96), color(252, 58, 46), color(250, 70, 11), u);
  let skyBot = triLerp(color(196, 22, 100), color(16, 72, 96), color(238, 55, 24), u);
  hazeCol = lerpColor(skyTop, skyBot, pow(HORIZON, 1.8));
  curNight = constrain(map(u, 0.52, 0.95, 0, 1), 0, 1);

  paintSky(skyTop, skyBot);
  paintStars(u);
  paintCelestial(u);
  paintGround(u);

  for (let i = 0; i < trees.length; i++) {
    let tr = trees[i];
    randomSeed(tr.seed); // the same random numbers every frame, so the tree holds still

    curDepth = tr.depth;
    curWeight = tr.weight;
    curHaze = tr.far;
    curBark = triLerp(color(28, 48, 52), color(14, 58, 34), color(234, 34, 16), u);
    curTwig = triLerp(color(38, 42, 88), color(24, 62, 70), color(248, 24, 38), u);
    curBloom = triLerp(color(44, 52, 100), color(30, 78, 100), color(38, 58, 100), u);

    push();
    translate(tr.x, tr.baseY);
    branch(tr.len, tr.depth, angle);
    pop();
  }

  paintForegroundHill(u);
}

/////////////////////////////////////////////////////////////////
// The tree
// a branch is a line with two smaller trees on its tip
/////////////////////////////////////////////////////////////////
function branch(len, depth, angle) {
  let t = 1 - depth / curDepth; // 0 at the trunk, 1 at the tips

  // bark at the trunk, twig colour at the tips, then fade far trees into the haze
  let c = lerpColor(curBark, curTwig, pow(t, 1.6));
  if (curHaze > 0) c = lerpColor(c, hazeCol, curHaze * 0.62);

  stroke(c);
  strokeWeight(map(depth, 0, curDepth, 0.4, 13) * curWeight);
  strokeCap(ROUND);
  line(0, 0, 0, -len);
  translate(0, -len); // the origin is now the tip, so the children start here

  // base case: a blossom instead of more branches
  if (depth === 0) {
    blossom();
    return;
  }

  // wind is multiplied by t, so the tips sway and the trunk does not
  let wind = (noise(depth * 0.3, frameCount * 0.008) - 0.5) * 0.5 * t;
  let a1 = angle + random(-0.15, 0.15) + wind;
  let a2 = -angle + random(-0.15, 0.15) + wind;

  // push() / pop() so each child starts from this tip, not from where the last one ended
  push();
  rotate(a1);
  branch(len * random(0.66, 0.78), depth - 1, angle);
  pop();

  push();
  rotate(a2);
  branch(len * random(0.66, 0.78), depth - 1, angle);
  pop();
}

function blossom() {
  if (random() > 0.82) return; // leave some tips bare

  noStroke();
  let r = random(4, 11) * curWeight;
  let fade = 1 - curHaze * 0.45; // distant blossoms sit in the haze
  let c = lerpColor(curBloom, hazeCol, curHaze * 0.5);

  // the glow. by day this is one faint halo you barely notice. at night it
  // opens into stacked low-alpha discs that spread wider and whiter, and they
  // add up where blossoms overlap, so dense parts of the canopy light up most
  let layers = 1;
  if (curNight > 0.05) layers = curHaze > 0.5 ? 2 : 3;
  for (let i = layers; i >= 1; i--) {
    let spread = 2.5 + curNight * 2.8 * (i / layers);
    let a = (11 + curNight * 28) / i;
    fill(hue(c), saturation(c) * (0.72 - curNight * 0.12), brightness(c), a * fade);
    circle(0, 0, r * spread);
  }

  // the blossom itself, brighter and hotter after dark
  fill(
    hue(c) + random(-12, 12),
    saturation(c) * random(0.85, 1.15) * (1 - curNight * 0.1),
    min(100, brightness(c) * random(0.9, 1.05) + curNight * 16),
    min(100, (random(45, 80) + curNight * 20) * fade)
  );
  circle(random(-2, 2) * curWeight, random(-2, 2) * curWeight, r);
}

/////////////////////////////////////////////////////////////////
// The sky
/////////////////////////////////////////////////////////////////
// a vertical gradient drawn as BANDS strips, redrawn every frame
function paintSky(top, bot) {
  noStroke();
  let h = height / BANDS + 1; // +1 so the strips overlap and leave no gaps
  for (let i = 0; i < BANDS; i++) {
    let ty = i / BANDS;
    fill(lerpColor(top, bot, pow(ty, 1.8)));
    rect(0, ty * height, width, h);
  }
}

function paintStars(u) {
  // stars fade in from just after sunset
  let night = constrain(map(u, 0.45, 0.88, 0, 1), 0, 1);
  if (night <= 0) return;

  noStroke();
  for (let i = 0; i < stars.length; i++) {
    let s = stars[i];
    let twinkle = 0.65 + 0.35 * sin(frameCount * 0.03 + s.phase);
    fill(0, 0, 100, s.a * night * twinkle);
    circle(s.x, s.y, s.r);
  }
}

// one disc for both sun and moon: it arcs from high left to high right,
// dips to the horizon at sunset, and changes size and colour on the way
function paintCelestial(u) {
  let x = lerp(width * 0.16, width * 0.84, u);
  let y = height * 0.13 + sin(u * PI) * height * 0.43;

  let size = triLerpNum(84, 112, 54, u); // biggest at sunset, smallest as the moon
  let glowA = triLerpNum(16, 34, 10, u);
  let glowR = triLerpNum(3.0, 3.8, 2.3, u);
  let body = triLerp(color(50, 26, 100), color(22, 82, 100), color(46, 7, 100), u);

  noStroke();

  // a soft glow from a few stacked discs
  for (let i = 4; i >= 1; i--) {
    fill(hue(body), saturation(body), brightness(body), (glowA / i) * 0.9);
    circle(x, y, size * (1 + ((glowR - 1) * i) / 4));
  }

  fill(body);
  circle(x, y, size);
}

/////////////////////////////////////////////////////////////////
// The ground
/////////////////////////////////////////////////////////////////
function groundColour(u) {
  return triLerp(color(96, 44, 42), color(24, 58, 28), color(236, 46, 11), u);
}

function paintGround(u) {
  let g = groundColour(u);
  noStroke();
  // the far ground sits in haze, so push it towards the sky colour
  fill(lerpColor(g, hazeCol, 0.5));
  rect(0, height * HORIZON, width, height * (1 - HORIZON));
}

// a dark hill in front of everything, so the nearest trunks have somewhere to stand
function paintForegroundHill(u) {
  let g = groundColour(u);
  noStroke();
  fill(hue(g), saturation(g), brightness(g) * 0.55);
  ellipse(width / 2, height + 40, width * 1.6, 300);
}

/////////////////////////////////////////////////////////////////
// Helpers
/////////////////////////////////////////////////////////////////
// three-stop colour ramp: a at u = 0 (midday), b at u = 0.5 (sunset), c at u = 1 (midnight)
function triLerp(a, b, c, u) {
  return u < 0.5 ? lerpColor(a, b, u * 2) : lerpColor(b, c, (u - 0.5) * 2);
}

// the same ramp for plain numbers
function triLerpNum(a, b, c, u) {
  return u < 0.5 ? lerp(a, b, u * 2) : lerp(b, c, (u - 0.5) * 2);
}

/////////////////////////////////////////////////////////////////
// Controls
/////////////////////////////////////////////////////////////////
function keyPressed() {
  if (key === "r" || key === "R") {
    forestSeed = floor(random(100000));
    makeForest();
  }
}
