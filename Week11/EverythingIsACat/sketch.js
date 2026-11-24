/* DM3008 Generative Art, Sidney Ngai 2026
 * Week 11 - Generative Adversarial Networks
 * EVERYTHING IS A CAT (portfolio version)
 *
 * A drawing of something from a Singapore day (a kopi bag, a durian, the
 * Merlion, an HDB block or ice kachang) is turned into a cat by pix2pix
 * (edges2cats). The object keeps its shape: the outline is still a durian
 * or an HDB block, with fur and cat-like features laid over it like a
 * filter or a skin.
 *
 * Every function is marked: template (Ashley Hi), template modified by
 * Sidney, or new (Sidney). Template = Ashley Hi's Week 11 Pix2Pix demo.
 * Model: edges2cats_AtoB from github.com/dongphilyoo/pix2pix-ml5-demo
 *
 * Controls
 *   1-5  pick a drawing and watch it being drawn
 *   drag on the left square  draw your own lines (the cat updates when you let go)
 *   C  blank page     R  replay the drawing from the start
 *   SPACE  finish the drawing now     S  save the canvas
 */

/////////////////////////////////////////////////////////////////
// SETTINGS
// sizes, speeds and the model files
/////////////////////////////////////////////////////////////////

// Model was trained on 256x256px images
const SIZE = 256;

// the 256px squares are shown bigger on screen
let SHOW = 384;
let MARGIN = 48;
let STAGE_Y = 120;

// *** change model here: the 54MB model is split into three parts so each file fits on GitHub
let MODEL_PARTS = ["models/edges2cats_partaa.bin", "models/edges2cats_partab.bin", "models/edges2cats_partac.bin"];

// *** change drawing speed here (points of the line drawn each frame)
let PEN_SPEED = 5;

// *** change how shaky the hand is here
let WOBBLE = 1.1; // small fast tremble, in px
let DRIFT = 3.6; // slow drift along a stroke, in px

// how many moments the filmstrip keeps
let FILM = 6;

let PAPER = [250, 247, 241];
let INK = [28, 28, 30];

/////////////////////////////////////////////////////////////////
// STATE
/////////////////////////////////////////////////////////////////

let parts = [];
let model;
let status = "Loading the model (54MB)...";

let drawings = [];
let current = 0;
let title = "";
let place = "";

let strokes = []; // every stroke is { pts: [[x, y], ...], w: weight }
let strokeIndex = 0; // playhead: which stroke the pen is on
let pointIndex = 0; // playhead: how far along that stroke
let input; // the 256px drawing the model reads

let output = null;
let prevOutput = null;
let fade = 1;

let busy = false; // the model is working on a request
let dirty = false; // the drawing changed since the last request
let holdPen = false; // pen waits here until the filmstrip frame comes back
let request = 0; // changes when the drawing is swapped, so old answers are ignored
let ownDrawing = false;
let userStroke = null;

let film = [];
let saving = false;

/////////////////////////////////////////////////////////////////
// LOADING
// the model is loaded in parts and joined back into one file
/////////////////////////////////////////////////////////////////

// new (Sidney)
function preload() {
  for (let i = 0; i < MODEL_PARTS.length; i++) {
    parts.push(loadBytes(MODEL_PARTS[i]));
  }
}

// template modified by Sidney: canvas set up, then the model is started
// once its parts have arrived (asynchronous, like the demo's .ready.then)
function setup() {
  pixelDensity(1);
  createCanvas(MARGIN * 2 + SHOW * 2 + 64, 740);
  textFont("Helvetica");

  input = createGraphics(SIZE, SIZE);
  input.pixelDensity(1);

  // *** change the series here: title, where and when, drawing function
  drawings.push({ title: "Kopi peng, takeaway", place: "Kopitiam, 7am", build: drawKopiBag });
  drawings.push({ title: "Durian", place: "Geylang, 10pm", build: drawDurian });
  drawings.push({ title: "Merlion", place: "Marina Bay", build: drawMerlion });
  drawings.push({ title: "HDB block", place: "Bedok North", build: drawHDB });
  drawings.push({ title: "Ice kachang", place: "Hawker centre, 3pm", build: drawIceKachang });

  pickDrawing(0);

  // glue the three parts back into one file in memory and give ml5 its address
  let joined = new Blob([parts[0].bytes, parts[1].bytes, parts[2].bytes]);
  ml5.pix2pix(URL.createObjectURL(joined)).ready.then(function (m) {
    model = m;
    status = "Model loaded";
    dirty = true;
  });
}

/////////////////////////////////////////////////////////////////
// DRAWINGS IN PROGRESS
// choosing, replaying and advancing the pen
/////////////////////////////////////////////////////////////////

// new (Sidney)
function pickDrawing(i) {
  current = i;
  title = drawings[i].title;
  place = drawings[i].place;
  ownDrawing = false;

  // *** change the seed here for a different hand on the same drawings
  randomSeed(11 + i);
  noiseSeed(11 + i);
  strokes = [];
  drawings[i].build();
  restart();
}

// new (Sidney)
function restart() {
  strokeIndex = 0;
  pointIndex = 0;
  input.background(255);
  output = null;
  prevOutput = null;
  film = [];
  holdPen = false;
  dirty = false;
  request++;
}

// new (Sidney): draws the next few points of the current stroke onto the input
function advancePen() {
  for (let n = 0; n < PEN_SPEED; n++) {
    if (holdPen || strokeIndex >= strokes.length) return;
    let s = strokes[strokeIndex];

    if (pointIndex < s.pts.length - 1) {
      let a = s.pts[pointIndex];
      let b = s.pts[pointIndex + 1];
      input.stroke(0);
      input.strokeWeight(s.w);
      input.line(a[0], a[1], b[0], b[1]);
      pointIndex++;
    } else {
      // stroke finished, the model should look again
      strokeIndex++;
      pointIndex = 0;
      dirty = true;

      // at every sixth of the drawing the pen waits for the cat, so the filmstrip has an even spread
      let nextFrame = film.length + 1;
      if (strokeIndex >= ceil((nextFrame * strokes.length) / FILM)) holdPen = true;
    }
  }
}

// new (Sidney)
function finishNow() {
  while (strokeIndex < strokes.length) {
    holdPen = false;
    advancePen();
  }
  holdPen = false;
  dirty = true;
}

/////////////////////////////////////////////////////////////////
// ASKING THE MODEL
// only one request at a time; if the drawing moved on while the model
// was busy, the newest drawing is sent next and the in-between ones are skipped
/////////////////////////////////////////////////////////////////

// template modified by Sidney: the demo's transfer(), now sending the
// p5.Graphics canvas and keeping the result as a p5.Image
function askModel() {
  busy = true;
  dirty = false;
  let forFilm = holdPen || ownDrawing;
  let lines = strokeIndex;
  let asked = request;
  status = "Asking the model...";

  model.transfer(input.elt).then(function (result) {
    loadImage(result.src, function (img) {
      busy = false;
      status = "Model loaded";
      if (asked !== request) return; // the drawing was swapped, this cat is for an old one

      prevOutput = output;
      output = img;
      fade = 0;

      if (forFilm) {
        film.push({ img: img, lines: lines });
        if (film.length > FILM) film.shift(); // only happens with your own drawing
        holdPen = false;
      }
    });
  });
}

/////////////////////////////////////////////////////////////////
// DRAW
/////////////////////////////////////////////////////////////////

// template modified by Sidney: the demo only drew mouse lines, this runs the pen,
// the model requests and the layout
function draw() {
  advancePen();
  if (dirty && !busy && model && !userStroke) askModel();

  background(PAPER);
  drawHeader();
  drawStage();
  drawFilm();
  if (!saving) drawHint();
}

// new (Sidney)
function drawHeader() {
  fill(INK);
  noStroke();
  textAlign(LEFT, BASELINE);
  textStyle(BOLD);
  textSize(32);
  text("Everything Is A Cat", MARGIN, 66);
  textStyle(NORMAL);
  textSize(15);
  fill(90);
  let n = ownDrawing ? "" : "0" + (current + 1) + "  ";
  text(n + title + "  ·  " + place + "    →  pix2pix edges2cats", MARGIN, 96);
}

// new (Sidney): drawing on the left, the model's answer on the right
function drawStage() {
  let outX = MARGIN + SHOW + 64;

  image(input, MARGIN, STAGE_Y, SHOW, SHOW);
  noFill();
  stroke(215, 210, 200);
  strokeWeight(1);
  rect(MARGIN, STAGE_Y, SHOW, SHOW);

  fill(INK);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(22);
  text("→", MARGIN + SHOW + 32, STAGE_Y + SHOW / 2);

  // the new cat fades in over the old one
  fill(232, 227, 218);
  rect(outX, STAGE_Y, SHOW, SHOW);
  if (prevOutput) image(prevOutput, outX, STAGE_Y, SHOW, SHOW);
  if (output) {
    tint(255, fade * 255);
    image(output, outX, STAGE_Y, SHOW, SHOW);
    noTint();
    fade = min(1, fade + 0.08);
  } else {
    fill(120);
    textSize(14);
    text(model ? "waiting for the first line" : status, outX + SHOW / 2, STAGE_Y + SHOW / 2);
  }

  fill(100);
  textAlign(LEFT, TOP);
  textSize(13);
  text(strokeIndex + " of " + strokes.length + " lines drawn", MARGIN, STAGE_Y + SHOW + 12);
  textAlign(RIGHT, TOP);
  text(busy ? "the model is looking..." : "", outX + SHOW, STAGE_Y + SHOW + 12);
}

// new (Sidney): six moments of the drawing turning into a cat
function drawFilm() {
  let y = STAGE_Y + SHOW + 52;
  let w = 128;
  let gap = (width - MARGIN * 2 - w * FILM) / (FILM - 1);

  for (let i = 0; i < FILM; i++) {
    let x = MARGIN + i * (w + gap);
    if (film[i]) {
      image(film[i].img, x, y, w, w);
      fill(100);
      noStroke();
      textAlign(LEFT, TOP);
      textSize(12);
      text(film[i].lines + (film[i].lines === 1 ? " line" : " lines"), x, y + w + 6);
    } else {
      noFill();
      stroke(220, 214, 204);
      strokeWeight(1);
      rect(x, y, w, w);
    }
  }
}

// new (Sidney)
function drawHint() {
  fill(130);
  noStroke();
  textAlign(LEFT, BASELINE);
  textSize(12);
  text(
    "1-5 drawings   drag on the left to draw   C blank page   R replay   SPACE finish   S save",
    MARGIN,
    height - 16
  );
}

/////////////////////////////////////////////////////////////////
// YOUR OWN LINES
// drag on the left square; the cat updates when you let go
/////////////////////////////////////////////////////////////////

// new (Sidney)
function overInput() {
  return mouseX >= MARGIN && mouseX < MARGIN + SHOW && mouseY >= STAGE_Y && mouseY < STAGE_Y + SHOW;
}

// new (Sidney): screen position to the 256px drawing
function toInput(x, y) {
  return [((x - MARGIN) * SIZE) / SHOW, ((y - STAGE_Y) * SIZE) / SHOW];
}

// template modified by Sidney: the demo drew with the mouse straight onto the canvas
function mousePressed() {
  if (!overInput()) return;
  if (strokeIndex < strokes.length) finishNow(); // don't fight the pen
  if (!ownDrawing) {
    ownDrawing = true;
    title = "Over " + drawings[current].title.toLowerCase();
    place = "your lines";
    film = [];
  }
  userStroke = { pts: [toInput(mouseX, mouseY)], w: 2 };
  strokes.push(userStroke);
}

// new (Sidney)
function mouseDragged() {
  if (!userStroke) return;
  let p = toInput(constrain(mouseX, MARGIN, MARGIN + SHOW), constrain(mouseY, STAGE_Y, STAGE_Y + SHOW));
  let last = userStroke.pts[userStroke.pts.length - 1];
  userStroke.pts.push(p);
  input.stroke(0);
  input.strokeWeight(userStroke.w);
  input.line(last[0], last[1], p[0], p[1]);
}

// new (Sidney)
function mouseReleased() {
  if (!userStroke) return;
  userStroke = null;
  strokeIndex = strokes.length;
  dirty = true;
}

/////////////////////////////////////////////////////////////////
// KEYS
/////////////////////////////////////////////////////////////////

// new (Sidney)
function keyPressed() {
  let n = int(key) - 1;
  if (n >= 0 && n < drawings.length) pickDrawing(n);

  let k = key.toLowerCase();
  if (k === "r") restart();
  if (key === " ") finishNow();
  if (k === "c") {
    strokes = [];
    restart();
    ownDrawing = true;
    title = "Your drawing";
    place = "a blank page";
  }
  if (k === "s") {
    saving = true;
    redraw();
    saveCanvas("everythingIsACat", "png");
    saving = false;
  }
}

/////////////////////////////////////////////////////////////////
// SHAKY PEN
// every shape is turned into points with a wobbling hand and stored
// as a stroke, so it can be drawn back one stroke at a time
/////////////////////////////////////////////////////////////////

let strokeId = 0;

// new (Sidney): jitter a list of points like a hand and keep it as one stroke
function shaky(pts) {
  strokeId++;

  // small shapes drift less, otherwise a window turns into a blob
  let minX = 9999;
  let maxX = -9999;
  let minY = 9999;
  let maxY = -9999;
  for (let i = 0; i < pts.length; i++) {
    minX = min(minX, pts[i][0]);
    maxX = max(maxX, pts[i][0]);
    minY = min(minY, pts[i][1]);
    maxY = max(maxY, pts[i][1]);
  }
  let amp = constrain(max(maxX - minX, maxY - minY) / 100, 0.25, 1);

  let out = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) along += dist(pts[i][0], pts[i][1], pts[i - 1][0], pts[i - 1][1]);
    let slow = along * 0.015;
    let fast = along * 0.3;
    let dx = (noise(strokeId * 7, slow) - 0.5) * 2 * DRIFT * amp + (noise(strokeId * 7 + 3, fast) - 0.5) * 2 * WOBBLE;
    let dy = (noise(strokeId * 7 + 1, slow) - 0.5) * 2 * DRIFT * amp + (noise(strokeId * 7 + 5, fast) - 0.5) * 2 * WOBBLE;
    out.push([pts[i][0] + dx, pts[i][1] + dy]);
  }
  strokes.push({ pts: out, w: random(1.5, 2.3) });
}

// new (Sidney): add points every 2px between two points
function addSegment(pts, x1, y1, x2, y2) {
  let n = max(2, ceil(dist(x1, y1, x2, y2) / 2));
  for (let i = 0; i <= n; i++) {
    pts.push([lerp(x1, x2, i / n), lerp(y1, y2, i / n)]);
  }
}

// new (Sidney): straight line, a little over or under at the ends like a quick stroke
function sLine(x1, y1, x2, y2) {
  let a = atan2(y2 - y1, x2 - x1);
  let o1 = random(-1, 3);
  let o2 = random(-1, 3);
  let pts = [];
  addSegment(pts, x1 - cos(a) * o1, y1 - sin(a) * o1, x2 + cos(a) * o2, y2 + sin(a) * o2);
  shaky(pts);
}

// new (Sidney): rectangle in one stroke, the corner where it starts never quite meets
function sRect(x, y, w, h) {
  let pts = [];
  addSegment(pts, x, y, x + w, y);
  addSegment(pts, x + w, y, x + w, y + h);
  addSegment(pts, x + w, y + h, x, y + h);
  addSegment(pts, x, y + h, x + random(-1, 2), y + random(-2, 2));
  shaky(pts);
}

// new (Sidney): ellipse or arc; an ellipse goes a bit past where it started
function sArc(cx, cy, w, h, start, stop) {
  let pts = [];
  let steps = max(12, ceil(((stop - start) * (w + h)) / 4));
  for (let i = 0; i <= steps; i++) {
    let a = lerp(start, stop, i / steps);
    pts.push([cx + (cos(a) * w) / 2, cy + (sin(a) * h) / 2]);
  }
  shaky(pts);
}

// new (Sidney)
function sEllipse(cx, cy, w, h) {
  let start = random(TWO_PI);
  sArc(cx, cy, w, h, start, start + TWO_PI + random(0.1, 0.4));
}

// new (Sidney)
function sBezier(x1, y1, x2, y2, x3, y3, x4, y4) {
  let pts = [];
  for (let i = 0; i <= 40; i++) {
    let t = i / 40;
    pts.push([bezierPoint(x1, x2, x3, x4, t), bezierPoint(y1, y2, y3, y4, t)]);
  }
  shaky(pts);
}

// new (Sidney): smooth curve through a list of points (like curveVertex)
function sCurve(list) {
  let pts = [];
  for (let i = 0; i < list.length - 1; i++) {
    let p0 = list[max(i - 1, 0)];
    let p1 = list[i];
    let p2 = list[i + 1];
    let p3 = list[min(i + 2, list.length - 1)];
    for (let s = 0; s < 10; s++) {
      let t = s / 10;
      pts.push([curvePoint(p0[0], p1[0], p2[0], p3[0], t), curvePoint(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  pts.push(list[list.length - 1]);
  shaky(pts);
}

// new (Sidney)
function sTriangle(x1, y1, x2, y2, x3, y3) {
  let pts = [];
  addSegment(pts, x1, y1, x2, y2);
  addSegment(pts, x2, y2, x3, y3);
  addSegment(pts, x3, y3, x1 + random(-1, 1), y1 + random(-1, 1));
  shaky(pts);
}

/////////////////////////////////////////////////////////////////
// DRAWINGS
// plain outlines on a 256px page, roughly filling it like the cat photos;
// they are listed in the order a person would draw them
/////////////////////////////////////////////////////////////////

// new (Sidney): kopi peng in a plastic bag with a string handle and a straw
function drawKopiBag() {
  // bag body, knotted at the top
  sCurve([
    [118, 72],
    [96, 110],
    [70, 170],
    [78, 222],
    [128, 236],
    [178, 222],
    [186, 170],
    [160, 110],
    [138, 72],
  ]);

  // knot and string loop
  sEllipse(128, 64, 22, 14);
  sBezier(120, 60, 60, 10, 70, 150, 104, 92);
  sBezier(136, 60, 196, 10, 186, 150, 152, 92);

  // coffee level and ice
  sBezier(84, 140, 110, 132, 146, 148, 172, 140);
  sRect(102, 152, 18, 16);
  sRect(132, 170, 18, 16);
  sRect(112, 190, 16, 14);

  // straw
  sLine(150, 30, 136, 160);
  sLine(156, 31, 142, 160);
}

// new (Sidney): durian, a spiky oval with a stem and spikes all over
function drawDurian() {
  let cx = 128;
  let cy = 146;
  let rx = 82;
  let ry = 92;
  sEllipse(cx, cy, rx * 2, ry * 2);
  sRect(120, 30, 16, 26); // stem

  // spikes all the way round the edge, not all the same size
  for (let a = 0; a < TWO_PI; a += TWO_PI / 28) {
    let b = a + random(-0.04, 0.04);
    let spike = random(9, 15);
    let pts = [];
    addSegment(pts, cx + cos(b - 0.08) * rx, cy + sin(b - 0.08) * ry, cx + cos(b) * (rx + spike), cy + sin(b) * (ry + spike));
    addSegment(pts, cx + cos(b) * (rx + spike), cy + sin(b) * (ry + spike), cx + cos(b + 0.08) * rx, cy + sin(b + 0.08) * ry);
    shaky(pts);
  }

  // spikes on the surface, in loose rows
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      let x = 76 + c * 26 + (r % 2) * 13 + random(-3, 3);
      let y = 86 + r * 30 + random(-3, 3);
      if (dist(x, y, cx, cy) > 70) continue;
      sTriangle(x - 5, y + 5, x + random(-1, 1), y - 6, x + 5, y + 5);
    }
  }
}

// new (Sidney): Merlion, lion head with a mane, fish body curling down, water out the mouth
function drawMerlion() {
  // head and mane
  sEllipse(104, 82, 70, 66);
  for (let a = -PI * 0.9; a < PI * 0.6; a += 0.4) {
    let x = 104 + cos(a) * 44;
    let y = 82 + sin(a) * 42;
    sArc(x, y, 22, 22, a - HALF_PI, a + HALF_PI);
  }
  sEllipse(116, 72, 8, 8); // eye
  sLine(124, 96, 140, 92); // open mouth
  sLine(124, 104, 140, 108);

  // fish body and tail
  sBezier(78, 112, 60, 170, 110, 200, 150, 196);
  sBezier(122, 116, 118, 150, 150, 168, 176, 172);
  sBezier(150, 196, 180, 194, 196, 184, 206, 200);
  sBezier(176, 172, 196, 168, 214, 160, 220, 140);

  // scales
  for (let i = 0; i < 6; i++) {
    sArc(96 + i * 14, 150 + i * 6, 16, 16, 0, PI);
  }

  // water jet arcing out of frame
  sBezier(142, 100, 190, 80, 230, 110, 250, 170);
  sBezier(142, 104, 186, 92, 222, 120, 240, 172);

  // plinth
  sRect(52, 214, 160, 28);
}

// new (Sidney): HDB block, corridors, windows, block number, void deck columns
function drawHDB() {
  sRect(34, 28, 188, 204);
  sLine(10, 232, 246, 232); // ground
  sRect(52, 36, 30, 16); // block number

  for (let f = 0; f < 7; f++) {
    let y = 60 + f * 20;
    sLine(34, y + 16, 222, y + 16); // corridor parapet
    for (let u = 0; u < 6; u++) {
      sRect(42 + u * 30, y + 2, 16, 10);
    }
  }

  // void deck columns
  for (let x = 44; x < 222; x += 44) {
    sLine(x, 200, x, 232);
  }
}

// new (Sidney): ice kachang, bumpy shaved ice in a bowl, syrup stripes, toppings
function drawIceKachang() {
  // bowl
  sArc(128, 188, 196, 80, 0, PI);
  sLine(30, 188, 226, 188);
  sRect(104, 226, 48, 12);

  // ice mound, bumpy outline
  sCurve([
    [40, 188],
    [56, 150],
    [76, 112],
    [96, 80],
    [118, 52],
    [140, 50],
    [160, 76],
    [182, 112],
    [200, 150],
    [216, 188],
  ]);

  // syrup stripes running down
  sBezier(92, 86, 110, 110, 96, 140, 112, 180);
  sBezier(132, 54, 140, 100, 124, 140, 140, 184);
  sBezier(166, 88, 160, 120, 178, 150, 168, 184);

  // sweet corn and attap chee on top
  sEllipse(128, 44, 14, 12);
  sEllipse(112, 58, 8, 8);
  sEllipse(146, 60, 8, 8);
}
