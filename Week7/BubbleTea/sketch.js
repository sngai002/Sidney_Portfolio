// Stance: Conditions (after Cheng)
/*

Sidney Ngai
DM3008 Generative Art - Week 7: Cybernetics & Emergence
"Bubble Tea"

Synopsis
  Every pearl in the cup is a bubble tea shop. New shops open right next to
  existing ones (copycats), and every shop has a small chance of closing each
  frame. Owners open a shop when the street looks like it has room for one, but
  what they see is always a little out of date, so the whole street is reacting
  to old news. Singapore has watched this happen more than once: a craze, a shop
  on every corner, then shutters.

  The piece is a feedback loop with a delay in it. The street reads its own
  size, but the reading is two seconds old. Below what the street can really
  hold, owners open shops; above it, nobody does. The slider sets how hard
  owners chase the hype (the gain). Chase it gently and the street finds its
  level. Chase it hard on old news and it can never settle: it booms and
  crashes for ever, with no ending and no reset.

  Clicking the cup is a viral post: a wave of copycat shops opens at once. Two
  seconds later the street is still acting on what it saw before the wave, so
  it keeps opening shops, overshoots, and crashes. The viewer starts the boom
  and then has to watch the crash.

What I changed from the Steersman starter
  - Started from the Conditions stance: the population is read with a delay in
    sense(), and update() opens fewer shops the bigger it was.
  - Reworked the birth rule. In the guide's rule the gain only changes how big
    the street ends up: the loop pulls back towards its level equally hard at
    every gain, so gain 1 and gain 3 settle the same way, just at different
    sizes. In my rule gain is how strongly owners react, so it decides whether
    the street settles or swings. (The working is in README.md.)
  - Added a fixed size the street can hold (HOLD), drawn as the dashed line.
  - Worked out the tipping point where the street stops settling (TIP), and
    marked it under the slider.
  - Copycats: a new shop opens next to the shop that "inspired" it, so busy
    patches of the cup get busier.
  - A slider for the gain, labelled in the story's terms, and viral posts on
    click, which are also marked on the chart.
  - The cup, pearls that pop in when they open, a chart of shops over time with
    a marker showing which moment the street is reacting to, and readouts.

Things to try
  - slider at 0: nobody reads the news, the street just drifts
  - slider at 1: it overshoots a little, then settles at the dashed line
  - slider at 3: booms and crashes, because it is reacting to where it was
  - slider at 1, then click the cup: the viral post sets off a boom and a
    crash, then the street calms down again
  - slide slowly past the tipping point and watch the swings start

Controls
  slider   how hard owners chase the hype (the gain)
  click    a viral post: a wave of copycat shops where you click in the cup
  0 1 2 3  set the gain      R  restart
  the gain can also be set in the address, e.g. index.html?gain=3

Attributions
  The sense / update / render loop, the delayed population reading and the
  open-ended birth / death population come from the Steersman starter and its
  Conditions stance (DM3008 week 7 class material, Ashley Hi), which is after
  the work of Ian Cheng. The reworked birth rule, HOLD, the tipping point,
  copycat openings, viral posts, the slider, the cup, pearls, chart and
  readouts are my own.
  Written for p5.js 1.11.11 (https://p5js.org).

*/

//=== the cup ===
// the cup is a trapezoid: wider at the top than the bottom
let CUP = { top: 90, bottom: 560, topLeft: 50, topRight: 370, bottomLeft: 90, bottomRight: 330 };
let PEARL = 11; // *** change pearl size here
let MAX_SHOPS = 1100; // the cup is full

//=== the street ===
let gain = 1; // *** change the starting gain here (try 0, 1 and 3)
let MAX_GAIN = 4; // the top of the slider
let DELAY = 120; // *** change how out of date the news is here (frames, 120 = 2 s)
let CLOSE_CHANCE = 0.004; // chance a shop closes each frame
let HOLD = 300; // *** change how many shops the street can really hold here
let REACT = 0.00002; // how much one shop above or below HOLD changes the chance of opening
let START_SHOPS = 40;

// above this gain the street can never settle. a loop that corrects at rate k
// on news that is DELAY frames old keeps swinging once k * DELAY passes PI / 2,
// and here k = REACT * gain * HOLD (the working is in README.md).
// worked out in setup(), because p5's HALF_PI does not exist until then
let TIP;

//=== viral posts ===
let VIRAL_BURST = 60; // *** change how many copycats one viral post brings here
let posts = []; // the rings drawn where a post landed
let postedSinceChart = false; // marks the next chart point

let shops = [];
let popHistory = []; // the last DELAY frames, which sense() reads from
let chart = []; // a longer history, only for drawing
let chartPosts = []; // true where a viral post happened, lined up with chart
let CHART_STEP = 4; // frames between points on the chart (185 points x 4 = about 12 s)
let lastReading = 0;
let opened = 0;
let closed = 0;

let slider;

//=== layout of the right-hand panel ===
let PANEL = { x: 395, w: 185 };
let CHART = { y: 105, h: 260 };
let SLIDER_Y = 488;

/////////////////////////////////////////////////////////////////
// Shop
// one pearl, drifting slowly around the cup
/////////////////////////////////////////////////////////////////
function Shop(x, y) {
  this.x = x;
  this.y = y;
  this.a = random(TWO_PI);
  this.age = 0;
}

Shop.prototype.update = function () {
  // wander, and sink a little like a real pearl
  this.a += random(-0.2, 0.2);
  this.x += cos(this.a) * 0.6;
  this.y += sin(this.a) * 0.6 + 0.05;
  this.age++;
  this.keepInCup();
};

// keep inside the cup, which narrows towards the bottom
Shop.prototype.keepInCup = function () {
  this.y = constrain(this.y, CUP.top + 30, CUP.bottom - PEARL / 2);
  let t = map(this.y, CUP.top, CUP.bottom, 0, 1);
  let left = lerp(CUP.topLeft, CUP.bottomLeft, t) + PEARL / 2;
  let right = lerp(CUP.topRight, CUP.bottomRight, t) - PEARL / 2;
  this.x = constrain(this.x, left, right);
};

Shop.prototype.show = function () {
  // a new shop pops in, so you can see where the openings are
  let s = min(PEARL, this.age * 0.5);
  fill(40, 24, 16);
  circle(this.x, this.y, s);
  // a small highlight makes it read as a pearl
  fill(255, 255, 255, 70);
  circle(this.x - s * 0.2, this.y - s * 0.2, s * 0.3);
};

/////////////////////////////////////////////////////////////////
// Setup and the loop
/////////////////////////////////////////////////////////////////
function setup() {
  createCanvas(600, 600);
  pixelDensity(1);
  textFont("monospace");
  TIP = HALF_PI / (REACT * HOLD * DELAY);

  // a gain in the address overrides the one above
  let params = getURLParams();
  if (params.gain !== undefined) gain = float(params.gain);

  // the slider sits over the canvas, under its label in the right-hand panel
  slider = createSlider(0, MAX_GAIN, gain, 0.1);
  slider.position(PANEL.x, SLIDER_Y);
  slider.style("width", PANEL.w + "px");

  restart();
}

// a fresh street: a few shops at the bottom of the cup and no history
function restart() {
  shops = [];
  popHistory = [];
  chart = [];
  chartPosts = [];
  posts = [];
  opened = 0;
  closed = 0;
  for (let i = 0; i < START_SHOPS; i++) {
    let s = new Shop(random(120, 300), random(400, 540));
    s.age = 100; // already open, so they do not pop in
    shops.push(s);
  }
}

function draw() {
  gain = slider.value();

  const pastPop = sense(); // 1. read the street's size, as it was DELAY frames ago
  update(pastPop); // 2. open and close shops based on that old reading
  render(); // 3. draw it
}

/////////////////////////////////////////////////////////////////
// Sense: the street reads its own size, DELAY frames late
/////////////////////////////////////////////////////////////////
function sense() {
  popHistory.push(shops.length);
  if (popHistory.length > DELAY) popHistory.shift();

  // the chart keeps one point every CHART_STEP frames, so it can show whole booms and crashes
  if (frameCount % CHART_STEP === 0) {
    chart.push(shops.length);
    chartPosts.push(postedSinceChart);
    postedSinceChart = false;
    if (chart.length > PANEL.w) {
      chart.shift();
      chartPosts.shift();
    }
  }

  // the oldest reading we have is the one the street acts on
  lastReading = popHistory[0];
  return lastReading;
}

/////////////////////////////////////////////////////////////////
// Update: open fewer shops the bigger the street was
/////////////////////////////////////////////////////////////////
function update(pastPop) {
  // at HOLD, openings and closings balance. below it, owners open more shops,
  // above it, fewer. gain is how strongly they react to the (old) news
  let pOpen = constrain(CLOSE_CHANCE + REACT * gain * (HOLD - pastPop), 0, 0.03);

  let born = [];
  for (let i = 0; i < shops.length; i++) {
    shops[i].update();
    if (random() < pOpen && shops.length + born.length < MAX_SHOPS) {
      // a copycat opens right next door
      born.push(new Shop(shops[i].x + random(-12, 12), shops[i].y + random(-12, 12)));
    }
  }

  // every shop has the same small chance of closing
  let before = shops.length;
  shops = shops.filter(function () {
    return random() > CLOSE_CHANCE;
  });
  closed += before - shops.length;
  opened += born.length;
  shops = shops.concat(born);

  // viral post rings grow and fade
  for (let i = posts.length - 1; i >= 0; i--) {
    posts[i].age++;
    if (posts[i].age > 60) posts.splice(i, 1);
  }
}

/////////////////////////////////////////////////////////////////
// Viral post: a wave of copycats opens where you click
/////////////////////////////////////////////////////////////////
function viralPost(x, y) {
  for (let i = 0; i < VIRAL_BURST && shops.length < MAX_SHOPS; i++) {
    let s = new Shop(x + randomGaussian(0, 30), y + randomGaussian(0, 30));
    s.keepInCup();
    shops.push(s);
  }
  opened += VIRAL_BURST;
  posts.push({ x: x, y: y, age: 0 });
  postedSinceChart = true;
}

function insideCup(x, y) {
  if (y < CUP.top || y > CUP.bottom) return false;
  let t = map(y, CUP.top, CUP.bottom, 0, 1);
  return x > lerp(CUP.topLeft, CUP.bottomLeft, t) && x < lerp(CUP.topRight, CUP.bottomRight, t);
}

/////////////////////////////////////////////////////////////////
// Render
/////////////////////////////////////////////////////////////////
function render() {
  background(245, 236, 220);
  noStroke();

  // the straw sits behind the tea
  fill(60, 60, 70);
  quad(250, 20, 266, 20, 236, 540, 220, 540);

  // the tea, then the pearls in it
  fill(205, 160, 110);
  quad(CUP.topLeft, CUP.top + 20, CUP.topRight, CUP.top + 20, CUP.bottomRight, CUP.bottom, CUP.bottomLeft, CUP.bottom);
  for (let i = 0; i < shops.length; i++) shops[i].show();

  // the cup outline
  noFill();
  stroke(90, 70, 50);
  strokeWeight(3);
  quad(CUP.topLeft, CUP.top, CUP.topRight, CUP.top, CUP.bottomRight, CUP.bottom, CUP.bottomLeft, CUP.bottom);
  strokeWeight(1);

  drawPosts();
  drawChart(PANEL.x, CHART.y, PANEL.w, CHART.h);
  drawReadouts();
  drawSliderScale();
}

// a ring and a label where each viral post landed
function drawPosts() {
  for (let i = 0; i < posts.length; i++) {
    let p = posts[i];
    let fade = map(p.age, 0, 60, 255, 0);
    noFill();
    stroke(220, 60, 120, fade);
    strokeWeight(3);
    circle(p.x, p.y, 20 + p.age * 2);
    // white label with a pink outline, so it reads on top of the tea
    strokeWeight(4);
    fill(255, fade);
    textSize(14);
    textStyle(BOLD);
    textAlign(CENTER);
    text("viral post!", p.x, p.y - 30 - p.age * 0.5);
    textAlign(LEFT);
    textStyle(NORMAL);
    strokeWeight(1);
    noStroke();
  }
}

// shops over time, the level the street can hold, the moment it is reacting to, and posts
function drawChart(x, y, w, h) {
  noStroke();
  fill(255, 250, 240);
  rect(x, y, w, h);

  // dashed line: the size the street can really hold
  let hy = map(HOLD, 0, MAX_SHOPS, y + h, y);
  stroke(120, 160, 120);
  drawingContext.setLineDash([4, 4]);
  line(x, hy, x + w, hy);
  drawingContext.setLineDash([]);

  // pink ticks: viral posts
  stroke(220, 60, 120);
  for (let i = 0; i < chartPosts.length; i++) {
    if (chartPosts[i]) line(x + i, y, x + i, y + h);
  }

  // shops over time, newest on the right
  noFill();
  stroke(40, 24, 16);
  strokeWeight(2);
  beginShape();
  for (let i = 0; i < chart.length; i++) {
    vertex(x + i, map(chart[i], 0, MAX_SHOPS, y + h, y));
  }
  endShape();
  strokeWeight(1);

  // red line: where the reading comes from, DELAY frames back
  let back = DELAY / CHART_STEP;
  if (chart.length > back) {
    let rx = x + chart.length - back;
    stroke(170, 70, 40);
    line(rx, y, rx, y + h);
  }

  noStroke();
  fill(110);
  textSize(10);
  text("shops over time", x, y - 6);
  text("- - what the street can hold", x, y + h + 14);
}

function drawReadouts() {
  noStroke();
  fill(40);
  textSize(18);
  text("BUBBLE TEA", PANEL.x, 50);
  textSize(12);
  let mood = "finding its level";
  if (gain === 0) mood = "nobody is reacting";
  if (gain > TIP) mood = "boom and bust";
  text(mood, PANEL.x, 72);

  text("shops open now  " + shops.length, PANEL.x, 405);
  fill(170, 70, 40);
  text("what owners see " + lastReading, PANEL.x, 421);
  fill(110);
  text("(" + nf(DELAY / 60, 1, 0) + " s out of date)", PANEL.x, 437);

  fill(40);
  text("how hard owners chase", PANEL.x, 466);
  text("the hype: " + nf(gain, 1, 1), PANEL.x, 480);
}

// under the slider: calm on the left, boom and bust on the right, the tipping point between
function drawSliderScale() {
  // the slider's thumb travels a little inside its ends
  let x0 = PANEL.x + 8;
  let x1 = PANEL.x + PANEL.w - 8;
  let tx = map(TIP, 0, MAX_GAIN, x0, x1);
  let y = SLIDER_Y + 26;

  stroke(120, 160, 120);
  strokeWeight(3);
  line(x0, y, tx, y);
  stroke(220, 60, 120);
  line(tx, y, x1, y);
  strokeWeight(1);
  stroke(40);
  line(tx, y - 5, tx, y + 5);

  noStroke();
  textSize(10);
  fill(80, 120, 80);
  text("calm", x0, y + 15);
  fill(200, 50, 110);
  textAlign(RIGHT);
  text("boom & bust", x1, y + 15);
  textAlign(CENTER);
  fill(40);
  text("tipping point " + nf(TIP, 1, 1), tx, y + 28);
  textAlign(LEFT);

  fill(110);
  text("click the cup for a viral post", PANEL.x, 572);
  text("0-3 gain   R restart", PANEL.x, 586);
}

/////////////////////////////////////////////////////////////////
// Controls
/////////////////////////////////////////////////////////////////
function mousePressed() {
  // only clicks inside the cup count, so using the slider does not post
  if (insideCup(mouseX, mouseY)) viralPost(mouseX, mouseY);
}

function keyPressed() {
  if (key === "0" || key === "1" || key === "2" || key === "3") slider.value(int(key));
  if (key === "r" || key === "R") restart();
}
