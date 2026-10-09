import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDesign } from './design-gate.mjs';

const clean = `<!doctype html><html lang="en"><head><title>Pricing</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><main><h1>Pricing</h1><h2>Plans</h2><h3>Pro</h3>
<img src="a.png" alt="Pro plan badge"><img src="deco.png" alt="">
<a href="/buy">Buy now</a><button>Subscribe</button></main></body></html>`;

const sloppy = `<html><head></head><body>
<h1>One</h1><h1>Two</h1><h2>A</h2><h4>Skipped</h4>
<img src="a.png"><img src="b.png" alt="ok">
<a href="/x"></a><button></button>
<style>body{font-family: Arial, sans-serif} h1{font-family: Georgia} p{font-family: "Fira Code"} small{font-family: serif} em{font-family: cursive}</style>
${'<p style="color:red">x</p>'.repeat(45)}
</body></html>`;

const statusOf = (r, id) => r.checks.find((c) => c.id === id).status;

test('a clean page passes every check', () => {
  const r = checkDesign(clean);
  assert.equal(r.summary.FAIL, 0);
  assert.equal(r.summary.WARN, 0);
  assert.equal(r.checks.length, 8);
});

test('a sloppy page trips each structural check', () => {
  const r = checkDesign(sloppy);
  assert.equal(statusOf(r, 'lang'), 'FAIL');
  assert.equal(statusOf(r, 'title'), 'FAIL');
  assert.equal(statusOf(r, 'viewport'), 'WARN');
  assert.equal(statusOf(r, 'img-alt'), 'FAIL');
  assert.match(r.checks.find((c) => c.id === 'img-alt').detail, /1 of 2/);
  assert.equal(statusOf(r, 'headings'), 'WARN');
  assert.equal(statusOf(r, 'links'), 'FAIL');
  assert.equal(statusOf(r, 'landmark'), 'WARN');
  assert.equal(statusOf(r, 'sprawl'), 'WARN');
});

test('alt="" counts as decorative, not missing', () => {
  const r = checkDesign('<html lang="en"><head><title>t</title><meta name="viewport" content="x"></head><body><main><h1>x</h1><img src="d.png" alt=""></main></body></html>');
  assert.equal(statusOf(r, 'img-alt'), 'PASS');
});

test('an aria-label names an otherwise empty button', () => {
  const r = checkDesign('<html lang="en"><head><title>t</title></head><body><main><h1>x</h1><button aria-label="Close"></button></main></body></html>');
  assert.equal(statusOf(r, 'links'), 'PASS');
});
