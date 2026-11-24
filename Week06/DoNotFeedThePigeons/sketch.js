/*

Sidney Ngai
DM3008 Generative Art - Week 6: Autonomous Agents
"Please Do Not Feed The Pigeons"

Synopsis
  A flock of pigeons lives at the void deck of an HDB block. Feeding them is
  against the law in Singapore, but in this sketch it takes no effort at all.
  Show the webcam a hand and seed falls from it for as long as the hand stays
  there, while the offence counter keeps climbing. Put both hands up, as if
  you are surrendering, and seed falls from both.

  Keeping your hands clean is the hard part. To stop, you have to close your
  hand into a fist, which scares the flock off too (with the mouse, let go and
  right click). Walking away does not help either: if nobody touches anything
  for a few seconds, an auntie turns up with a bag of bread and carries on for
  you. The pigeons just follow the food. They walk over to peck, keep out of
  reach of the hand, go up in a wave when scared, fly a few laps and land again.

What I changed from the Boids starter
  - The boids are pigeons with three states: on the floor, in the air or
    perched. Separation, alignment and cohesion only count pigeons in the same
    state, and the full flocking rules only run while they fly.
  - On the floor they walk in bursts with a head-bob, look for seed, stop to
    peck, fight over the auntie's bread, and go around the table, stools and
    pillars.
  - Startle and resettle: a scare makes pigeons take off with a few seconds of
    hard flapping. Each one that goes up can set off its neighbours. In the air
    they circle the block, then choose a place to land (near seed, on the
    railing, on the table or on the floor) and bring nearby pigeons with them.
  - The edges turn flying pigeons back instead of wrapping them round.
  - A webcam hand from ml5 handPose replaces the mouse follow: an open palm or
    a fist, read from the 21 hand points. The hand is drawn as a shadow on the
    floor and the pigeons keep away from it.
  - New drawing: a top-down void deck, pigeons with wing bars, a sheen on the
    neck and flapping wings, shadows that grow with height, and the sign.
  - The auntie and the street noises, so the piece still runs with no camera.
  - Removed: the key switching between rules, the momentum and separation
    lines, and the instructions text.

Controls
  open palm     scatter seed under your hand
  fist          scare the pigeons near your hand
  mouse         hold the left button to scatter seed, right click to scare
  F  scare at the mouse     C  clap: the whole flock goes up
  V  show the camera beside the sketch, mirrored     R  restart

  The webcam needs the sketch to be served (see README.md). With no camera, or
  if the camera is refused, the auntie and the mouse still work.

Attributions
  The Boids template (DM3008 week 6 class material, Ashley Hi), which follows
  Daniel Shiffman's Nature of Code version of Craig Reynolds' boids:
    - used as they were: Flock(), addBoid(), applyForce() and seek()
    - started from the template and changed by me: Flock's run(), Pigeon()
      (the template's Boid), the pigeon's run(), flock(), update(), borders(),
      separate(), align(), cohesion(), setup(), draw() and keyPressed()
  Every other function is my own.
  Hand tracking is ml5.js handPose, which runs Google's MediaPipe Hands model.
  Written for p5.js 1.11.11 and ml5.js 1.2.1.

*/

//=== the pigeons ===
let FLOCK_SIZE = 60; // *** change how many pigeons live at this block here
let PIGEON_SIZE = 1.3; // *** change pigeon size here
let SEED_SIGHT = 200; // how far a pigeon on the floor notices seed
let CONTAGION = 0.6; // *** change how easily one pigeon taking off sets off its neighbours
let SCARE_RADIUS = 220; // *** change how far a fist scares them here

//=== the seed ===
let SEED_RATE = 1; // *** change how many seeds an open palm drops each frame here
let MAX_SEEDS = 400; // the oldest seed is swept away after this many
let seeds = [];

//=== the void deck ===
let FLOOR_TOP = 48; // above this is the corridor railing and the grass
let TABLE = { x: 280, y: 420, r: 62 };
let PILLARS = [
  { x: 720, y: 230, w: 100, h: 100 },
  { x: 720, y: 460, w: 100, h: 100 },
];
let obstacles = []; // what walking pigeons go around
let perches = []; // { x, y, z, facing, taken }
let floorArt; // the void deck, drawn once in setup()

//=== the hand ===
let handPose;
let video;
let hands = []; // what ml5 last found
let modelReady = false;
let showCam = false;
let feeders = []; // every hand this frame: the webcam's, the mouse's and the auntie's
let slots = [
  { gesture: "none", log: [] },
  { gesture: "none", log: [] },
];
let lastHandFrame = 0; // the last frame someone used a hand, the mouse or a key
let NO_HAND_WAIT = 180; // *** change how long before the auntie comes here (180 = 3 s)
let handLayer;

// pairs of hand points to draw as bones (the MediaPipe order, 0 is the wrist)
let BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

//=== the auntie and the street ===
let auntie = { x: -40, y: 640, mode: "away", timer: 60, tx: 0, ty: 0, exitX: 0 };
let autoMode = false;
let nextNoise = 400;
let caption = { text: "", until: 0 };

//=== the law ===
let offences = 0;
let OFFENCE_EVERY = 20; // *** change how often feeding adds an offence here (frames)
let lastOffence = {}; // the frame each feeder last got an offence
let signFlash = 0;
let pops = []; // "+1 offence" labels
let rings = []; // a ring where each scare happened

let flock;

/////////////////////////////////////////////////////////////////
// Setup and the loop
/////////////////////////////////////////////////////////////////

// loads the hand tracking model before the sketch starts
function preload() {
  if (typeof ml5 !== "undefined") handPose = ml5.handPose({ maxHands: 2, flipped: true });
}

// builds the void deck, turns on the webcam and lets the pigeons in
function setup() {
  let canvas = createCanvas(960, 720); // 4:3, the same shape as the webcam
  canvas.elt.addEventListener("contextmenu", function (e) {
    e.preventDefault(); // right click scares the pigeons, so no menu
  });
  pixelDensity(1);
  textFont("monospace");

  obstacles.push({ x: TABLE.x, y: TABLE.y, r: TABLE.r + 4 });
  for (let i = 0; i < 4; i++) {
    let a = QUARTER_PI + i * HALF_PI;
    obstacles.push({ x: TABLE.x + cos(a) * 92, y: TABLE.y + sin(a) * 92, r: 21 });
  }
  for (let i = 0; i < PILLARS.length; i++) obstacles.push(PILLARS[i]);
  makePerches();
  floorArt = drawVoidDeck();
  handLayer = createGraphics(width, height);

  if (handPose) {
    // a silent project: the camera never asks for the microphone, and the video is muted
    video = createCapture(VIDEO, { flipped: true, audio: false });
    video.volume(0);
    video.elt.muted = true;
    video.size(640, 480);
    // the camera view sits beside the canvas, mirrored, and V shows or hides it
    video.parent(select("main"));
    video.style("transform", "scaleX(-1)");
    video.style("width", "320px"); // shown at half size; ml5 still reads it at 640 x 480
    video.style("height", "240px");
    video.class("camera");
    video.hide();
    handPose.detectStart(video, gotHands);
  }

  restart();
}

// clears the floor and puts the pigeons back, some walking and some on the railing
function restart() {
  seeds = [];
  offences = 0;
  lastOffence = {};
  pops = [];
  rings = [];
  for (let i = 0; i < perches.length; i++) perches[i].taken = false;

  flock = new Flock();
  for (let i = 0; i < FLOCK_SIZE; i++) {
    let p = new Pigeon(random(40, width - 40), random(FLOOR_TOP + 30, height - 40));
    pushOut(p.position, 10);
    flock.addBoid(p);
    if (i < FLOCK_SIZE / 3) p.land({ x: 0, y: 0, perch: freePerchNear(random(width), 0) });
  }
}

// every frame: read the hands, move the auntie and the pigeons, then draw it all
function draw() {
  readHands();
  readMouse();
  runAuntie();
  useHands();

  flock.run();

  render();
}

/////////////////////////////////////////////////////////////////
// Flock Object
// Manages the array of all the boids.
/////////////////////////////////////////////////////////////////

// the flock: a list that holds every pigeon
function Flock() {
  // Initialises an array for all the boids.
  this.boids = [];
}

// moves every pigeon one step
Flock.prototype.run = function () {
  // Passing the entire list of boids to each boid individually.
  for (let i = 0; i < this.boids.length; i++) {
    this.boids[i].run(this.boids);
  }
};

// adds one pigeon to the flock
Flock.prototype.addBoid = function (b) {
  this.boids.push(b);
};

/////////////////////////////////////////////////////////////////
// Pigeon
// the starter's Boid, with a state: "ground", "air" or "perch"
/////////////////////////////////////////////////////////////////

// one pigeon: where it is, how it moves, whether it is walking, flying or perched, its colour
function Pigeon(x, y) {
  this.acceleration = createVector(0, 0);
  this.velocity = createVector(random(-1, 1), random(-1, 1));
  this.position = createVector(x, y);
  this.maxSpeed = 0.8;
  this.maxForce = 0.08;

  this.state = "ground";
  this.z = 0; // height: 0 on the floor, 1 flying
  this.heading = random(TWO_PI); // which way it faces, even when standing still
  this.id = random(1000); // so pigeons do not all move in step
  this.walking = false;
  this.gait = 0; // frames left of walking, or of standing still
  this.bob = 0; // head-bob
  this.target = null; // the seed it is walking to
  this.pecking = 0; // frames left of pecking
  this.startleIn = -1; // frames until it takes off, -1 when calm
  this.scareFrom = null;
  this.flap = 0; // frames of hard flapping left
  this.wing = random(TWO_PI); // wingbeat
  this.airTime = 0; // frames of flying left before it looks for somewhere to land
  this.landing = null; // where it is coming down: { x, y, perch }
  this.perch = null;
  this.rest = 0; // frames before it gets bored of the perch

  // most are blue-grey, some are dark and a few are pale
  let g = random();
  if (g < 0.15) this.tone = [72, 72, 82];
  else if (g < 0.25) this.tone = [205, 202, 196];
  else this.tone = [random(118, 140), random(124, 146), random(140, 160)];
}

// moves the pigeon the way its state allows: walking, flying or sitting
Pigeon.prototype.run = function (boids) {
  this.checkStartle();
  if (this.state === "air") this.fly(boids);
  else if (this.state === "ground") this.walk(boids);
  else this.sit();
  this.update();
  this.borders();
};

// nudges the pigeon in a direction
Pigeon.prototype.applyForce = function (force) {
  this.acceleration.add(force);
};

// in the air: keep apart, fly the same way, stay together, circle the block and dodge the hand
Pigeon.prototype.flock = function (boids) {
  let sep = this.separate(boids, 28); // Separation
  let ali = this.align(boids, 60); // Alignment
  let coh = this.cohesion(boids, 60); // Cohesion
  let lap = this.circleBlock(); // fly laps around the block
  let hand = this.avoidHands();

  sep.mult(1.6); // *** change how much flying pigeons keep apart here
  ali.mult(1.0); // *** change how much they fly the same way here
  coh.mult(0.8); // *** change how much they bunch up here
  lap.mult(0.5);
  hand.mult(2.0);

  this.applyForce(sep);
  this.applyForce(ali);
  this.applyForce(coh);
  this.applyForce(lap);
  this.applyForce(hand);
};

// moves the pigeon forward and turns it to face where it is going
Pigeon.prototype.update = function () {
  this.velocity.add(this.acceleration);
  this.velocity.limit(this.maxSpeed);
  this.position.add(this.velocity);
  if (this.velocity.mag() > 0.2) this.heading = this.velocity.heading();

  // Reset acceleration to 0 each cycle.
  this.acceleration.mult(0);
};

// steers the pigeon towards a point
Pigeon.prototype.seek = function (target) {
  // A vector pointing from the location to the target.
  let desired = p5.Vector.sub(target, this.position);

  // Normalize desired and scale to maximum speed.
  desired.normalize();
  desired.mult(this.maxSpeed);

  // Steering = Desired minus Velocity.
  let steer = p5.Vector.sub(desired, this.velocity);

  // Limit to maximum steering force.
  steer.limit(this.maxForce);
  return steer;
};

// turns flying pigeons back at the edges and keeps walking ones on the floor
Pigeon.prototype.borders = function () {
  if (this.state === "air") {
    let m = 40;
    if (this.position.x < m) this.velocity.x += 0.15;
    if (this.position.x > width - m) this.velocity.x -= 0.15;
    if (this.position.y < m) this.velocity.y += 0.15;
    if (this.position.y > height - m) this.velocity.y -= 0.15;
  } else if (this.state === "ground") {
    let before = this.position.copy();
    this.position.x = constrain(this.position.x, 12, width - 12);
    this.position.y = constrain(this.position.y, FLOOR_TOP + 10, height - 12);
    pushOut(this.position, 8);
    // bumped into something, so pick a new way to walk
    if (before.dist(this.position) > 0.01) this.gait = 0;
  }
};

/////////////////////////////////////////////////////////////////
// Rules of Flocking
/////////////////////////////////////////////////////////////////

// steers away from pigeons that are too close
Pigeon.prototype.separate = function (boids, desiredSeparation) {
  let steer = createVector(0, 0);
  let count = 0;

  // For every boid in the system, check if it's too close.
  for (let i = 0; i < boids.length; i++) {
    if (boids[i].state !== this.state) continue;
    let d = p5.Vector.dist(this.position, boids[i].position);

    if (d > 0 && d < desiredSeparation) {
      // Calculate vector pointing away from neighbor
      let diff = p5.Vector.sub(this.position, boids[i].position);
      diff.normalize();
      steer.add(diff);
      count++;
    }
  }

  if (count > 0) steer.div(count);

  if (steer.mag() > 0) {
    // Implement Reynolds: Steering = Desired - Velocity
    steer.normalize();
    steer.mult(this.maxSpeed);
    steer.sub(this.velocity);
    steer.limit(this.maxForce);
  }

  return steer;
};

// turns to fly the same way as the pigeons nearby
Pigeon.prototype.align = function (boids, neighbordist) {
  let sum = createVector(0, 0);
  let count = 0;

  for (let i = 0; i < boids.length; i++) {
    if (boids[i].state !== this.state) continue;
    let d = p5.Vector.dist(this.position, boids[i].position);
    if (d > 0 && d < neighbordist) {
      sum.add(boids[i].velocity);
      count++;
    }
  }

  if (count > 0) {
    sum.div(count);
    sum.normalize();
    sum.mult(this.maxSpeed);
    let steer = p5.Vector.sub(sum, this.velocity);
    steer.limit(this.maxForce);
    return steer;
  } else {
    return createVector(0, 0);
  }
};

// steers towards the middle of the pigeons nearby
Pigeon.prototype.cohesion = function (boids, neighbordist) {
  let sum = createVector(0, 0);
  let count = 0;
  for (let i = 0; i < boids.length; i++) {
    if (boids[i].state !== this.state) continue;
    let d = p5.Vector.dist(this.position, boids[i].position);
    if (d > 0 && d < neighbordist) {
      sum.add(boids[i].position);
      count++;
    }
  }

  if (count > 0) {
    sum.div(count);
    return this.seek(sum); // Steer towards the location.
  } else {
    return createVector(0, 0);
  }
};

/////////////////////////////////////////////////////////////////
// On the floor: walk, look for seed, peck
/////////////////////////////////////////////////////////////////

// on the floor: hop away from a hand, peck, walk to seed, or wander about
Pigeon.prototype.walk = function (boids) {
  this.z = 0;
  this.maxSpeed = this.target && this.target.bread ? 1.4 : 0.8; // they hurry for bread
  this.maxForce = 0.08;

  // a hand coming down right on top of it: hop out of the way
  for (let i = 0; i < feeders.length; i++) {
    let f = feeders[i];
    if (dist(f.x, f.y, this.position.x, this.position.y) < f.size * 0.7 && random() < 0.05) {
      this.takeOff(createVector(f.x, f.y), "hop");
      return;
    }
  }

  if (this.pecking > 0) {
    this.pecking--;
    this.velocity.mult(0.5);
    if (this.pecking === 0) this.eat();
    return;
  }

  this.findSeed();
  if (this.target) {
    let d = dist(this.position.x, this.position.y, this.target.x, this.target.y);
    if (d < 5) {
      this.startPecking();
      return;
    }
    this.applyForce(this.seek(createVector(this.target.x, this.target.y)));
  } else {
    this.wander();
  }

  let sep = this.separate(boids, 18);
  sep.mult(2.0); // *** change how much pigeons on the floor keep apart here
  this.applyForce(sep);
  let hand = this.avoidHands();
  hand.mult(3.0);
  this.applyForce(hand);

  this.bob += this.velocity.mag() * 0.6;

  // now and then one gets bored and flies up to a perch
  if (random() < 0.0006) this.takeOff(null, "perch");
};

// walks a few steps, stops for a while, then walks off in a new direction
Pigeon.prototype.wander = function () {
  this.gait--;
  if (this.gait <= 0) {
    this.walking = !this.walking;
    this.gait = this.walking ? random(30, 90) : random(20, 140);
    if (this.walking) this.heading += random(-1.4, 1.4);
  }
  if (this.walking) {
    let desired = p5.Vector.fromAngle(this.heading, this.maxSpeed * 0.7);
    let steer = p5.Vector.sub(desired, this.velocity);
    steer.limit(this.maxForce);
    this.applyForce(steer);
  } else {
    this.velocity.mult(0.8);
  }
};

// picks the nearest seed it can see (bread looks nearer, they want it more)
Pigeon.prototype.findSeed = function () {
  if (this.target && seeds.indexOf(this.target) < 0) this.target = null;
  if (floor(this.id + frameCount) % 8 !== 0) return;
  let best = null;
  let bestD = SEED_SIGHT;
  for (let i = 0; i < seeds.length; i++) {
    let s = seeds[i];
    let d = dist(this.position.x, this.position.y, s.x, s.y);
    if (s.bread) d *= 0.5;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  this.target = best;
};

// stops and faces the seed. bread takes longer, and a second pigeon shoves one off
Pigeon.prototype.startPecking = function () {
  this.heading = atan2(this.target.y - this.position.y, this.target.x - this.position.x);
  this.velocity.mult(0);
  if (!this.target.bread) {
    this.pecking = floor(random(20, 40));
    return;
  }
  // someone is already on this piece: one of them gets shoved off
  for (let i = 0; i < flock.boids.length; i++) {
    let other = flock.boids[i];
    if (other !== this && other.pecking > 0 && other.target === this.target) {
      if (random() < 0.5) other.takeOff(this.position.copy(), "hop");
      else {
        this.takeOff(other.position.copy(), "hop");
        return;
      }
    }
  }
  this.pecking = 90;
};

// the seed disappears from the floor
Pigeon.prototype.eat = function () {
  let i = seeds.indexOf(this.target);
  if (i >= 0) seeds.splice(i, 1);
  this.target = null;
};

/////////////////////////////////////////////////////////////////
// Startle, take off, fly, land
/////////////////////////////////////////////////////////////////

// counts down to take-off after a scare, so far pigeons go up a moment later
Pigeon.prototype.checkStartle = function () {
  if (this.startleIn < 0) return;
  this.startleIn--;
  if (this.startleIn <= 0) {
    this.startleIn = -1;
    if (this.state !== "air") this.takeOff(this.scareFrom, "scare");
  }
};

// jumps into the air away from the scare, flapping hard. its neighbours may follow
// kind: "scare" flies laps, "hop" goes a short way, "perch" flies up, "down" leaves a perch
Pigeon.prototype.takeOff = function (from, kind) {
  if (this.perch) {
    this.perch.taken = false;
    this.perch = null;
  }
  this.state = "air";
  this.pecking = 0;
  this.target = null;
  this.landing = null;
  this.flap = kind === "scare" ? 45 : 20;
  this.airTime = kind === "scare" ? random(300, 600) : 0;

  // leap away from whatever scared it
  let away = from ? p5.Vector.sub(this.position, from) : p5.Vector.random2D();
  if (away.mag() === 0) away = p5.Vector.random2D();
  away.setMag(kind === "hop" ? 2 : 4);
  this.velocity = away;

  if (kind === "hop") {
    let spot = { x: this.position.x + away.x * 15, y: this.position.y + away.y * 15, perch: null };
    this.landing = groundSpot(spot);
  } else if (kind === "perch") {
    let p = freePerchNear(this.position.x, this.position.y);
    if (p) this.landing = { x: p.x, y: p.y, perch: p };
    else this.airTime = random(120, 240);
  } else if (kind === "down") {
    this.chooseLanding(true);
  }

  // the neighbours see it go, and most of them go too
  if (kind !== "scare") return;
  for (let i = 0; i < flock.boids.length; i++) {
    let other = flock.boids[i];
    if (other.state === "air" || other.startleIn >= 0) continue;
    if (other.position.dist(this.position) < 45 && random() < CONTAGION) {
      other.startleIn = floor(random(6, 16));
      other.scareFrom = this.position.copy();
    }
  }
};

// beats its wings, flies with the flock, and looks for somewhere to land after a while
Pigeon.prototype.fly = function (boids) {
  if (this.flap > 0) this.flap--;
  this.wing += this.flap > 0 ? 0.8 : 0.35;
  this.maxSpeed = this.flap > 0 ? 4.5 : 3.2;
  this.maxForce = 0.12;

  if (this.landing) {
    this.comeDown(boids);
    return;
  }
  this.z = lerp(this.z, 1, 0.04);
  this.flock(boids);
  this.airTime--;
  if (this.airTime <= 0) this.chooseLanding(false);
};

// pulls the pigeon round in a big circle over the void deck
Pigeon.prototype.circleBlock = function () {
  let centre = createVector(width / 2, height / 2 + 20);
  let out = p5.Vector.sub(this.position, centre);
  let around = createVector(-out.y, out.x); // at right angles to the middle, so it goes round
  around.setMag(this.maxSpeed);
  // pulled back in when it drifts out too far
  if (out.mag() > 260) around.add(out.copy().setMag((-this.maxSpeed * (out.mag() - 260)) / 150));
  let steer = p5.Vector.sub(around, this.velocity);
  steer.limit(this.maxForce);
  return steer;
};

// picks a landing spot: near seed, the railing, the table or open floor
// pigeons flying close by come down with it
Pigeon.prototype.chooseLanding = function (soon) {
  let spot;
  if (seeds.length > 0 && random() < 0.8) {
    let s = random(seeds);
    spot = groundSpot({ x: s.x + random(-30, 30), y: s.y + random(-30, 30), perch: null });
  } else if (random() < 0.5) {
    let p = freePerchNear(random(width), random(height));
    if (p) spot = { x: p.x, y: p.y, perch: p };
  }
  if (!spot) {
    let x = random(40, width - 40);
    let y = random(FLOOR_TOP + 40, height - 40);
    spot = groundSpot({ x: x, y: y, perch: null });
  }
  this.landing = spot;
  if (soon) return;

  // pigeons flying close by come down with it
  for (let i = 0; i < flock.boids.length; i++) {
    let other = flock.boids[i];
    if (other === this || other.state !== "air" || other.landing) continue;
    if (other.airTime > 150 || other.position.dist(this.position) > 60) continue;
    if (spot.perch) {
      let p = freePerchNear(spot.x, spot.y);
      if (p) other.landing = { x: p.x, y: p.y, perch: p };
    } else {
      other.landing = groundSpot({ x: spot.x + random(-25, 25), y: spot.y + random(-25, 25) });
    }
  }
};

// slows down and drops towards the landing spot, flapping to brake
Pigeon.prototype.comeDown = function (boids) {
  let to = createVector(this.landing.x, this.landing.y);
  let d = this.position.dist(to);
  if (this.landing.perch && this.landing.perch.taken) {
    // someone got there first
    this.landing = groundSpot({ x: to.x, y: to.y + 40, perch: null });
    return;
  }
  let desired = p5.Vector.sub(to, this.position);
  let speed = d < 120 ? map(d, 0, 120, 0.6, this.maxSpeed) : this.maxSpeed;
  desired.setMag(speed);
  let steer = p5.Vector.sub(desired, this.velocity);
  steer.limit(this.maxForce * 2);
  this.applyForce(steer);
  let sep = this.separate(boids, 18);
  this.applyForce(sep);

  let groundZ = this.landing.perch ? this.landing.perch.z : 0;
  this.z = lerp(groundZ, 1, constrain(d / 120, 0, 1));
  if (d < 120) this.wing += 0.3; // quick wingbeats to brake
  if (d < 4) this.land(this.landing);
};

// settles on the perch or the floor
Pigeon.prototype.land = function (spot) {
  this.landing = null;
  this.flap = 0;
  if (spot.perch) {
    this.state = "perch";
    this.perch = spot.perch;
    this.perch.taken = true;
    this.position.set(this.perch.x, this.perch.y);
    this.z = this.perch.z;
    this.heading = this.perch.facing + random(-0.4, 0.4);
    this.rest = random(400, 1400);
  } else {
    this.state = "ground";
    this.z = 0;
    this.gait = 0;
  }
  this.velocity.mult(0);
};

// sits still on the perch, then flies down when bored or when it sees food
Pigeon.prototype.sit = function () {
  this.velocity.mult(0);
  this.rest--;
  if (this.rest <= 0) {
    this.takeOff(null, "down");
    return;
  }
  if (seeds.length > 0 && random() < 0.006) this.takeOff(null, "down");
};

// steers away from hands and from the auntie
Pigeon.prototype.avoidHands = function () {
  let steer = createVector(0, 0);
  for (let i = 0; i < feeders.length; i++) {
    let f = feeders[i];
    let reach = f.size * 1.3 + (this.state === "air" ? 30 : 10);
    let away = createVector(this.position.x - f.x, this.position.y - f.y);
    let d = away.mag();
    if (d > 0 && d < reach) {
      away.setMag(map(d, 0, reach, this.maxSpeed * 2, 0));
      steer.add(away);
    }
  }
  steer.limit(this.maxForce * 3);
  return steer;
};

/////////////////////////////////////////////////////////////////
// Drawing a pigeon, seen from above
/////////////////////////////////////////////////////////////////

// draws the pigeon from above: tail, body, wing bars, shiny neck, head, eyes and beak
Pigeon.prototype.render = function () {
  let c = this.tone;
  let open = this.state === "air";
  push();
  translate(this.position.x, this.position.y);
  rotate(this.heading);
  scale(PIGEON_SIZE * (1 + this.z * 0.3)); // closer to us when it is up
  noStroke();

  if (open) this.drawWings();

  // tail, with the dark band at its end
  fill(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
  quad(-5, -2.5, -12, -3.5, -12, 3.5, -5, 2.5);
  fill(45, 45, 50);
  rect(-12, -3.5, 1.8, 7);

  fill(c[0], c[1], c[2]);
  ellipse(0, 0, 15, 9.5);

  // the two black bars across each folded wing
  if (!open) {
    stroke(45, 45, 50);
    strokeWeight(1.1);
    line(-1.5, -4.3, -2.2, -1.6);
    line(-1.5, 4.3, -2.2, 1.6);
    line(-4.5, -4, -5, -1.6);
    line(-4.5, 4, -5, 1.6);
    noStroke();
  }

  // the green and purple sheen on the neck
  fill(90, 140, 115, 170);
  ellipse(4.5, 0, 6, 7.5);
  fill(140, 90, 150, 110);
  ellipse(4, 0, 3.5, 7);

  // head, turned a little when perched, bobbing when walking, dipping when pecking
  push();
  translate(4.5, 0);
  if (this.state === "perch") rotate(sin(frameCount * 0.03 + this.id) * 0.6);
  let hx = 2 + this.headOffset();
  let hs = this.pecking > 0 && sin(this.pecking * 0.7) > 0 ? 0.85 : 1; // smaller = head down
  fill(c[0] * 0.72, c[1] * 0.72, c[2] * 0.72);
  circle(hx, 0, 6 * hs);
  fill(230, 120, 40);
  circle(hx + 0.6, -2.2 * hs, 1.1); // eyes
  circle(hx + 0.6, 2.2 * hs, 1.1);
  fill(55, 50, 50);
  triangle(hx + 2.6, -0.8, hx + 2.6, 0.8, hx + 4.6, 0); // beak
  fill(235, 232, 225);
  circle(hx + 2.4, 0, 1.3); // the white patch above the beak
  pop();

  pop();
};

// draws open wings that beat fast after take-off, slower in the air, and spread to glide
Pigeon.prototype.drawWings = function () {
  let c = this.tone;
  let gliding = this.flap === 0 && !this.landing && sin(frameCount * 0.02 + this.id) > 0.5;
  let beat = gliding ? 1 : abs(sin(this.wing));
  let span = 5 + 12 * beat;
  for (let side = -1; side <= 1; side += 2) {
    fill(c[0] * 0.92, c[1] * 0.92, c[2] * 0.92);
    quad(3, side * 3, -1, side * span, -6, side * (span - 1), -5, side * 3);
    fill(50, 50, 55); // dark wing tips
    quad(-1, side * span, -6, side * (span - 1), -5.6, side * (span - 3), -1.4, side * (span - 3));
    stroke(50, 50, 55);
    strokeWeight(1);
    line(-1.5, side * 4.5, -3, side * span * 0.6);
    noStroke();
  }
};

// how far the head pokes forward: bobbing when walking, dipping when pecking
Pigeon.prototype.headOffset = function () {
  if (this.pecking > 0) return 1.5 + 1.5 * sin(this.pecking * 0.7);
  if (this.state === "ground") return 1.6 * max(0, sin(this.bob)); // thrust forward, then hold
  return 0;
};

// draws the shadow on the floor, further away the higher the pigeon flies
Pigeon.prototype.renderShadow = function () {
  if (this.z < 0.05) return;
  let s = PIGEON_SIZE * (1 + this.z * 0.3);
  push();
  translate(this.position.x + this.z * 18, this.position.y + this.z * 18);
  rotate(this.heading);
  noStroke();
  fill(40, 35, 30, 60);
  ellipse(0, 0, 18 * s, 9 * s);
  if (this.state === "air") ellipse(-1 * s, 0, 6 * s, 26 * s);
  pop();
};

/////////////////////////////////////////////////////////////////
// The hand: ml5 handPose, the mouse, and what each gesture does
/////////////////////////////////////////////////////////////////

// ml5 hands back the hands it found in the webcam
function gotHands(results) {
  hands = results;
  modelReady = true;
}

// turns each hand into a feeder and fires off a scare when a fist closes
function readHands() {
  feeders = [];
  let seen = [];
  if (video && video.width > 0) {
    for (let i = 0; i < hands.length && i < 2; i++) {
      seen.push(handFromKeypoints(hands[i].keypoints));
    }
  }
  // left to right, so each hand keeps its slot from frame to frame
  seen.sort(function (a, b) {
    return a.x - b.x;
  });

  for (let i = 0; i < 2; i++) {
    let slot = slots[i];
    let h = seen[i];
    if (!h) {
      slot.gesture = "none";
      slot.log = [];
      continue;
    }
    // only change gesture when most of the last five frames agree
    slot.log.push(h.raw);
    if (slot.log.length > 5) slot.log.shift();
    let was = slot.gesture;
    let g = mostOf(slot.log);
    if (g) slot.gesture = g;
    h.gesture = slot.gesture;
    h.who = "hand" + i; // each hand racks up its own offences
    if (h.gesture !== was) gestureStarted(h);
    feeders.push(h);
    lastHandFrame = frameCount;
  }
}

// moves the 21 hand points from webcam pixels onto the canvas
function handFromKeypoints(k) {
  let pts = [];
  for (let j = 0; j < k.length; j++) {
    // elt.width is the 640 x 480 the model sees, not the size it is shown at
    let x = (k[j].x * width) / video.elt.width;
    let y = (k[j].y * height) / video.elt.height;
    pts.push(createVector(x, y));
  }
  // the middle of the palm: the wrist and the four knuckles
  let palm = createVector(0, 0);
  let ids = [0, 5, 9, 13, 17];
  for (let j = 0; j < ids.length; j++) palm.add(pts[ids[j]]);
  palm.div(ids.length);
  let size = p5.Vector.dist(pts[0], pts[9]); // wrist to middle knuckle
  return { x: palm.x, y: palm.y, size: size, points: pts, raw: readGesture(pts) };
}

// a hand with no fingers out is a fist. any other hand counts as open and drops seed
function readGesture(p) {
  let tips = [8, 12, 16, 20];
  let joints = [6, 10, 14, 18];
  let out = 0;
  for (let i = 0; i < 4; i++) {
    // a finger is out when its tip is further from the wrist than its middle joint
    if (p5.Vector.dist(p[tips[i]], p[0]) > p5.Vector.dist(p[joints[i]], p[0]) * 1.15) out++;
  }
  if (out === 0) return "fist";
  return "palm";
}

// the gesture most of the last five frames agree on, so it does not flicker
function mostOf(log) {
  let names = ["palm", "fist"];
  for (let i = 0; i < names.length; i++) {
    let n = 0;
    for (let j = 0; j < log.length; j++) if (log[j] === names[i]) n++;
    if (n >= 3) return names[i];
  }
  return null;
}

// a fist scares the pigeons once, when the hand closes
function gestureStarted(h) {
  if (h.gesture === "fist") scare(h.x, h.y, SCARE_RADIUS);
}

// holding the left mouse button acts as an open palm
function readMouse() {
  if (mouseIsPressed && mouseButton === LEFT) {
    feeders.push({ x: mouseX, y: mouseY, size: 40, gesture: "palm", who: "mouse" });
    lastHandFrame = frameCount;
  }
}

// every open palm drops seed
function useHands() {
  for (let i = 0; i < feeders.length; i++) {
    let f = feeders[i];
    if (f.gesture === "palm") dropSeeds(f.x, f.y, f.size * 0.9, SEED_RATE, f.who);
  }
}

/////////////////////////////////////////////////////////////////
// Seed, scares and the law
/////////////////////////////////////////////////////////////////

// drops seed (or the auntie's bread) onto open floor and counts it as an offence
function dropSeeds(x, y, spread, count, who) {
  for (let i = 0; i < count; i++) {
    let s = { x: x + randomGaussian(0, spread), y: y + randomGaussian(0, spread) };
    s.bread = who === "auntie";
    s.a = random(TWO_PI);
    let pos = createVector(s.x, s.y);
    pos.x = constrain(pos.x, 10, width - 10);
    pos.y = constrain(pos.y, FLOOR_TOP + 10, height - 10);
    pushOut(pos, 6);
    s.x = pos.x;
    s.y = pos.y;
    seeds.push(s);
    if (seeds.length > MAX_SEEDS) seeds.shift();
  }
  noteFeeding(x, y, who);
}

// adds an offence and a "+1 offence" label every OFFENCE_EVERY frames of feeding
function noteFeeding(x, y, who) {
  let last = lastOffence[who];
  if (last === undefined || frameCount - last >= OFFENCE_EVERY) {
    offences++;
    signFlash = 90;
    pops.push({ x: x + random(-15, 15), y: y, age: 0 });
    lastOffence[who] = frameCount;
  }
}

// sends a scare out from a point: the nearest pigeons go first, and a ring spreads out
function scare(x, y, radius) {
  let from = createVector(x, y);
  for (let i = 0; i < flock.boids.length; i++) {
    let p = flock.boids[i];
    let d = p.position.dist(from);
    if (d > radius) continue;
    if (p.state === "air") {
      // already up: pushed away, and stays up a while longer
      p.velocity.add(p5.Vector.sub(p.position, from).setMag(2));
      p.landing = null;
      p.airTime = max(p.airTime, 200);
      continue;
    }
    let delay = floor(map(d, 0, radius, 1, 20) + random(0, 4));
    if (p.startleIn < 0 || delay < p.startleIn) {
      p.startleIn = delay;
      p.scareFrom = from;
    }
  }
  rings.push({ x: x, y: y, r: min(radius, 400), age: 0 });
}

// the C key: scares every pigeon, starting from the middle
function clap() {
  scare(width / 2, height / 2, width * 2);
  say("clap!");
}

// shows a caption at the top of the floor for two seconds
function say(words) {
  caption.text = words;
  caption.until = frameCount + 120;
}

/////////////////////////////////////////////////////////////////
// The auntie: she comes when nobody else is feeding them
/////////////////////////////////////////////////////////////////

// the auntie walks in, throws bread for a while and walks off. a hand showing up sends her off
function runAuntie() {
  autoMode = frameCount - lastHandFrame > NO_HAND_WAIT;
  let a = auntie;
  // a real hand turned up, so she heads off
  if (!autoMode && (a.mode === "coming" || a.mode === "feeding")) a.mode = "leaving";

  if (a.mode === "away") {
    if (!autoMode) return;
    streetNoise();
    a.timer--;
    if (a.timer <= 0) {
      let fromRight = random() < 0.5;
      a.x = fromRight ? width + 30 : -30;
      a.y = random(560, 590);
      a.y0 = a.y; // she leaves the way she came in
      a.exitX = fromRight ? -40 : width + 40;
      a.tx = random(450, 580);
      a.ty = random(430, 540);
      a.mode = "coming";
    }
  } else if (a.mode === "coming") {
    // along the bottom first, then up to her spot
    if (walkTo(a, a.tx, a.y, a.tx, a.ty)) {
      a.mode = "feeding";
      a.timer = random(360, 540);
    }
  } else if (a.mode === "feeding") {
    a.timer--;
    if (frameCount % 40 === 0) {
      // a few pieces of bread thrown somewhere in front of her
      a.throwAngle = -HALF_PI + random(-1.3, 1.3);
      let reach = random(60, 120);
      let tx = a.x + cos(a.throwAngle) * reach;
      let ty = a.y + sin(a.throwAngle) * reach;
      dropSeeds(tx, ty, 22, floor(random(2, 5)), "auntie"); // *** change how much bread here
      a.throwing = 12;
    }
    if (a.throwing > 0) a.throwing--;
    if (a.timer <= 0) a.mode = "leaving";
  } else if (a.mode === "leaving") {
    a.throwing = 0;
    if (walkTo(a, a.x, a.y0, a.exitX, a.y0)) {
      a.mode = "away";
      a.timer = random(300, 600);
    }
  }
  if (a.mode !== "away") feeders.push({ x: a.x, y: a.y, size: 26, gesture: "auntie" });
}

// walks the auntie to the first point, then the second. true once she arrives
function walkTo(a, x1, y1, x2, y2) {
  let step = a.mode === "leaving" ? 1.8 : 1.1; // she hurries off once someone else is here
  let tx = x1;
  let ty = y1;
  if (abs(a.x - x1) < step && abs(a.y - y1) < step) {
    tx = x2;
    ty = y2;
  }
  let dx = tx - a.x;
  let dy = ty - a.y;
  let d = sqrt(dx * dx + dy * dy);
  if (d < step) {
    a.x = tx;
    a.y = ty;
    return tx === x2 && ty === y2;
  }
  a.x += (dx / d) * step;
  a.y += (dy / d) * step;
  a.facing = atan2(dy, dx);
  return false;
}

// now and then a motorbike, a door or a kid scares the pigeons
function streetNoise() {
  nextNoise--;
  if (nextNoise > 0) return;
  nextNoise = floor(random(500, 900));
  let pick = floor(random(3));
  if (pick === 0) {
    scare(random() < 0.5 ? -20 : width + 20, random(150, 650), 350);
    say("a motorbike goes past");
  } else if (pick === 1) {
    scare(random(100, width - 100), random(FLOOR_TOP + 50, height - 100), 280);
    say("a door slams upstairs");
  } else {
    scare(random(100, width - 100), random(FLOOR_TOP + 50, height - 100), 200);
    say("a kid runs through");
  }
}

/////////////////////////////////////////////////////////////////
// The void deck
/////////////////////////////////////////////////////////////////

// the places pigeons can sit: along the railing, on the table and on the stools
function makePerches() {
  for (let x = 40; x <= width - 40; x += 22) {
    perches.push({ x: x, y: 36, z: 0.4, facing: HALF_PI, taken: false });
  }
  for (let i = 0; i < 6; i++) {
    let a = (i * TWO_PI) / 6;
    let x = TABLE.x + cos(a) * 42;
    let y = TABLE.y + sin(a) * 42;
    perches.push({ x: x, y: y, z: 0.25, facing: a, taken: false });
  }
  for (let i = 0; i < 4; i++) {
    let a = QUARTER_PI + i * HALF_PI;
    let x = TABLE.x + cos(a) * 92;
    let y = TABLE.y + sin(a) * 92;
    perches.push({ x: x, y: y, z: 0.15, facing: a, taken: false });
  }
}

// the nearest empty perch
function freePerchNear(x, y) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < perches.length; i++) {
    let p = perches[i];
    let d = dist(x, y, p.x, p.y) + random(30); // so they do not all pick the same one
    if (!p.taken && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// moves a landing spot onto open floor
function groundSpot(spot) {
  let pos = createVector(spot.x, spot.y);
  pos.x = constrain(pos.x, 20, width - 20);
  pos.y = constrain(pos.y, FLOOR_TOP + 20, height - 20);
  pushOut(pos, 10);
  return { x: pos.x, y: pos.y, perch: null };
}

// pushes a point out of the table, the stools and the pillars
function pushOut(pos, pad) {
  for (let i = 0; i < obstacles.length; i++) {
    let o = obstacles[i];
    if (o.r) {
      let dx = pos.x - o.x;
      let dy = pos.y - o.y;
      let d = sqrt(dx * dx + dy * dy);
      if (d < o.r + pad) {
        if (d === 0) dx = d = 1;
        pos.x = o.x + (dx / d) * (o.r + pad);
        pos.y = o.y + (dy / d) * (o.r + pad);
      }
    } else {
      // a pillar: out through whichever side is nearest
      let left = o.x - o.w / 2 - pad;
      let right = o.x + o.w / 2 + pad;
      let top = o.y - o.h / 2 - pad;
      let bottom = o.y + o.h / 2 + pad;
      if (pos.x > left && pos.x < right && pos.y > top && pos.y < bottom) {
        let gaps = [pos.x - left, right - pos.x, pos.y - top, bottom - pos.y];
        let m = min(gaps);
        if (m === gaps[0]) pos.x = left;
        else if (m === gaps[1]) pos.x = right;
        else if (m === gaps[2]) pos.y = top;
        else pos.y = bottom;
      }
    }
  }
}

// draws the floor tiles, grass, railing, table, stools and pillars once, since they never move
function drawVoidDeck() {
  let g = createGraphics(width, height);
  g.noStroke();

  // floor tiles
  let t = 48;
  for (let x = 0; x < width; x += t) {
    for (let y = FLOOR_TOP; y < height; y += t) {
      let v = random(-6, 6);
      g.fill(196 + v, 190 + v, 180 + v);
      g.rect(x, y, t, t);
    }
  }
  g.stroke(172, 166, 156);
  for (let x = 0; x < width; x += t) g.line(x, FLOOR_TOP, x, height);
  for (let y = FLOOR_TOP; y < height; y += t) g.line(0, y, width, y);

  // grass beyond the corridor, then the parapet
  g.noStroke();
  g.fill(112, 150, 82);
  g.rect(0, 0, width, 26);
  g.stroke(90, 130, 66);
  for (let i = 0; i < 500; i++) {
    let x = random(width);
    let y = random(2, 24);
    g.line(x, y, x + random(-2, 2), y - random(2, 5));
  }
  g.noStroke();
  g.fill(218, 213, 203);
  g.rect(0, 26, width, 20);
  g.fill(150, 145, 138);
  g.rect(0, 45, width, 3);

  // droppings under the railing, where they sit the most
  for (let i = 0; i < 120; i++) {
    g.fill(240, 238, 230, random(120, 220));
    g.circle(random(width), random(50, 70), random(1.5, 3.5));
  }

  // the stone table and stools, with a shadow under each
  g.fill(150, 140, 128, 90);
  g.circle(TABLE.x + 8, TABLE.y + 8, TABLE.r * 2);
  terrazzo(g, TABLE.x, TABLE.y, TABLE.r);
  for (let i = 0; i < 4; i++) {
    let a = QUARTER_PI + i * HALF_PI;
    let x = TABLE.x + cos(a) * 92;
    let y = TABLE.y + sin(a) * 92;
    g.fill(150, 140, 128, 90);
    g.circle(x + 5, y + 5, 36);
    terrazzo(g, x, y, 17);
  }

  // the pillars
  g.rectMode(CENTER);
  for (let i = 0; i < PILLARS.length; i++) {
    let p = PILLARS[i];
    g.fill(150, 140, 128, 110);
    g.rect(p.x + 10, p.y + 10, p.w, p.h);
    g.fill(226, 222, 214);
    g.stroke(170, 165, 158);
    g.rect(p.x, p.y, p.w, p.h);
    g.noStroke();
  }
  g.rectMode(CORNER);
  return g;
}

// draws a round stone top with flecks in it
function terrazzo(g, x, y, r) {
  g.fill(158, 154, 148);
  g.circle(x, y, r * 2);
  for (let i = 0; i < r * 3; i++) {
    let a = random(TWO_PI);
    let d = sqrt(random()) * (r - 3);
    g.fill(random([110, 200, 230]), random(150, 255));
    g.circle(x + cos(a) * d, y + sin(a) * d, random(1, 3));
  }
  g.noFill();
  g.stroke(120, 116, 110);
  g.circle(x, y, r * 2);
  g.noStroke();
}

/////////////////////////////////////////////////////////////////
// Render
/////////////////////////////////////////////////////////////////

// draws back to front: floor, seed, shadows, walkers, auntie, perched pigeons, hands, flyers
function render() {
  image(floorArt, 0, 0);
  drawSeeds();

  let birds = flock.boids;
  for (let i = 0; i < birds.length; i++) birds[i].renderShadow();
  for (let i = 0; i < birds.length; i++) if (birds[i].state === "ground") birds[i].render();
  drawAuntie();
  for (let i = 0; i < birds.length; i++) if (birds[i].state === "perch") birds[i].render();
  drawSign();
  drawHands();
  for (let i = 0; i < birds.length; i++) if (birds[i].state === "air") birds[i].render();

  drawRings();
  drawPops();
  drawReadouts();
}

// draws seed as small grains and bread as torn pieces with a crust
function drawSeeds() {
  noStroke();
  for (let i = 0; i < seeds.length; i++) {
    let s = seeds[i];
    push();
    translate(s.x, s.y);
    rotate(s.a);
    if (s.bread) {
      fill(200, 150, 90); // crust
      rect(-4.5, -3.5, 9, 7, 2);
      fill(240, 222, 182);
      rect(-3, -2, 6, 4, 1);
    } else {
      fill(196, 158, 88);
      ellipse(0, 0, 4.4, 2.8);
    }
    pop();
  }
}

// draws each hand as a soft shadow on the floor, with what it is doing above it
function drawHands() {
  handLayer.clear();
  handLayer.noFill();
  handLayer.stroke(30, 28, 36);
  handLayer.fill(30, 28, 36);
  handLayer.strokeCap(ROUND);
  let labels = [];
  for (let i = 0; i < feeders.length; i++) {
    let f = feeders[i];
    if (f.gesture === "auntie") continue;
    if (f.points) {
      let p = f.points;
      handLayer.strokeWeight(f.size * 0.32);
      for (let j = 0; j < BONES.length; j++) {
        let a = p[BONES[j][0]];
        let b = p[BONES[j][1]];
        handLayer.line(a.x, a.y, b.x, b.y);
      }
      handLayer.strokeWeight(1);
      handLayer.beginShape();
      let palm = [0, 1, 5, 9, 13, 17];
      for (let j = 0; j < palm.length; j++) handLayer.vertex(p[palm[j]].x, p[palm[j]].y);
      handLayer.endShape(CLOSE);
    } else {
      handLayer.noStroke();
      handLayer.circle(f.x, f.y, f.size * 1.4);
      handLayer.stroke(30, 28, 36);
    }
    labels.push(f);
  }
  tint(255, 80);
  image(handLayer, 0, 0);
  noTint();

  // what each hand is doing, above it
  noStroke();
  fill(40, 36, 44);
  textSize(13);
  textAlign(CENTER);
  for (let i = 0; i < labels.length; i++) {
    let f = labels[i];
    let words = { palm: "seed", fist: "fist!" }[f.gesture];
    if (words) text(words, f.x, f.y - f.size * 1.9);
  }
  textAlign(LEFT);
}

// draws the auntie from above: floral blouse, grey bun, red plastic bag, throwing arm
function drawAuntie() {
  let a = auntie;
  if (a.mode === "away") return;
  let facing = a.mode === "feeding" ? -HALF_PI : a.facing;
  push();
  translate(a.x, a.y);
  noStroke();
  fill(40, 35, 30, 60);
  ellipse(8, 8, 46, 30);
  rotate(facing + HALF_PI);
  // the arm reaching out to throw
  if (a.throwing > 0) {
    push();
    rotate(a.throwAngle + HALF_PI);
    stroke(200, 160, 130);
    strokeWeight(5);
    line(12, 0, 12, -28);
    pop();
  }
  fill(196, 82, 96);
  ellipse(0, 0, 44, 24);
  fill(240, 200, 120);
  for (let i = 0; i < 6; i++) circle(-16 + i * 6.5, (i % 2) * 6 - 3, 4); // flowers
  fill(225, 70, 60, 230);
  circle(-24, 6, 14); // the red plastic bag
  fill(150, 150, 152);
  circle(0, 0, 18);
  fill(120, 120, 124);
  circle(0, 7, 8); // the bun
  pop();
}

// draws the notice on the pillar, which flashes red when someone feeds them
function drawSign() {
  let p = PILLARS[0];
  let flash = signFlash > 0 && floor(signFlash / 10) % 2 === 0;
  if (signFlash > 0) signFlash--;
  push();
  rectMode(CENTER);
  stroke(flash ? color(220, 40, 40) : color(150, 40, 40));
  strokeWeight(flash ? 4 : 2);
  fill(flash ? color(255, 235, 230) : color(252, 250, 244));
  rect(p.x, p.y, 84, 66, 3);
  noStroke();
  fill(170, 30, 30);
  textAlign(CENTER);
  textStyle(BOLD);
  textSize(10);
  text("PLEASE DO NOT", p.x, p.y - 16);
  text("FEED THE PIGEONS", p.x, p.y - 4);
  textStyle(NORMAL);
  fill(60);
  textSize(8);
  text("Feeding pigeons", p.x, p.y + 12);
  text("is an offence", p.x, p.y + 22);
  pop();
}

// draws the "+1 offence" labels floating up and fading, on top of everything
function drawPops() {
  textAlign(CENTER);
  textStyle(BOLD);
  textSize(15);
  strokeWeight(4);
  for (let i = pops.length - 1; i >= 0; i--) {
    let o = pops[i];
    o.age++;
    let fade = map(o.age, 0, 90, 255, 0);
    stroke(255, fade); // a white outline, so it reads over the hand and the birds
    fill(190, 30, 30, fade);
    text("+1 offence", o.x, o.y - 40 - o.age * 0.9); // rises fast enough not to overlap the next
    if (o.age > 90) pops.splice(i, 1);
  }
  noStroke();
  strokeWeight(1);
  textStyle(NORMAL);
  textAlign(LEFT);
}

// draws a ring spreading out from each scare
function drawRings() {
  noFill();
  for (let i = rings.length - 1; i >= 0; i--) {
    let r = rings[i];
    r.age++;
    stroke(60, 55, 65, map(r.age, 0, 40, 160, 0));
    strokeWeight(2);
    circle(r.x, r.y, map(r.age, 0, 40, 20, r.r * 2));
    if (r.age > 40) rings.splice(i, 1);
  }
  strokeWeight(1);
  noStroke();
}

// draws the panel: title, offence counter, gesture hints, camera, mouse and keys
function drawReadouts() {
  noStroke();
  fill(252, 250, 244, 225);
  rect(12, height - 142, 610, 130, 8);
  fill(40);
  textSize(16);
  textStyle(BOLD);
  text("PLEASE DO NOT FEED THE PIGEONS", 24, height - 118);
  textStyle(NORMAL);
  textSize(12);
  fill(170, 30, 30);
  text("offence counter: " + offences, 24, height - 98);

  fill(90);
  let status;
  if (autoMode) status = "no hand seen: an auntie is feeding them. show the camera your hand";
  else status = "hand up: seed   fist: stop and scare";
  text(status, 24, height - 78);
  let cam = "camera: ";
  if (!handPose) cam += "hand model not loaded (needs internet and a web server)";
  else if (video.elt.readyState === 0 && frameCount > 300) cam += "none (refused or not found)";
  else if (!modelReady) cam += "starting...";
  else cam += hands.length + " hand" + (hands.length === 1 ? "" : "s") + " seen";
  text(cam, 24, height - 58);
  text("mouse: hold left click to feed, right click to scare", 24, height - 40);
  let keys = "keys: F scare   C clap   ";
  if (handPose) keys += showCam ? "V to hide camera   " : "V to show camera   ";
  text(keys + "R restart", 24, height - 22);

  if (frameCount < caption.until) {
    textAlign(CENTER);
    textSize(18);
    fill(40, 36, 44, map(caption.until - frameCount, 0, 30, 0, 255, true));
    text(caption.text, width / 2, FLOOR_TOP + 40);
    textAlign(LEFT);
  }
}

/////////////////////////////////////////////////////////////////
// Controls
/////////////////////////////////////////////////////////////////

// right click scares the pigeons near the mouse
function mousePressed() {
  lastHandFrame = frameCount;
  if (mouseButton === RIGHT) scare(mouseX, mouseY, SCARE_RADIUS);
}

// F scare, C clap, V camera, R restart
function keyPressed() {
  lastHandFrame = frameCount;
  if (key === "f" || key === "F") scare(mouseX, mouseY, SCARE_RADIUS);
  if (key === "c" || key === "C") clap();
  if ((key === "v" || key === "V") && video) {
    showCam = !showCam;
    if (showCam) video.show();
    else video.hide();
  }
  if (key === "r" || key === "R") restart();
}
