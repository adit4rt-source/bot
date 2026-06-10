// test/mocks/napi-canvas.js — lightweight mock for @napi-rs/canvas
'use strict';

class Canvas {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() { return new Context2D(); }
  toBuffer() { return Buffer.from('mock-png'); }
  encode() { return Buffer.from('mock-png'); }
}

class Context2D {
  constructor() {}
  fillRect() {}
  strokeRect() {}
  clearRect() {}
  drawImage() {}
  measureText(t) { return { width: (t || '').length * 8 }; }
  get fillStyle() { return '#000'; }
  set fillStyle(v) {}
  get strokeStyle() { return '#000'; }
  set strokeStyle(v) {}
  get font() { return '12px sans-serif'; }
  set font(v) {}
  get textAlign() { return 'left'; }
  set textAlign(v) {}
  get textBaseline() { return 'top'; }
  set textBaseline(v) {}
  get globalAlpha() { return 1; }
  set globalAlpha(v) {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  arcTo() {}
  clip() {}
  fill() {}
  stroke() {}
  save() {}
  restore() {}
  fillText() {}
  strokeText() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  roundRect() {}
}

function createCanvas(w, h) { return new Canvas(w, h); }

async function loadImage() {
  return { width: 100, height: 100 };
}

class GlobalFonts {
  static registerFromPath() {}
  static register() {}
}

module.exports = { createCanvas, loadImage, Canvas, GlobalFonts };
