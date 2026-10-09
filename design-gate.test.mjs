import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDesign, CHECK_IDS } from './design-gate.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'design-gate.mjs');

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

test('skip removes checks from the report and from the summary', () => {
  const r = checkDesign(sloppy, { skip: ['lang', 'title'] });
  assert.equal(r.checks.length, 6);
  assert.equal(r.checks.find((c) => c.id === 'lang'), undefined);
  assert.equal(r.summary.FAIL, 2); // img-alt and links still fail
});

test('an unknown check id is rejected, not silently ignored', () => {
  assert.throws(() => checkDesign(clean, { skip: ['langs'] }), /unknown check id: langs/);
  assert.equal(CHECK_IDS.length, 8);
});

test('sprawl thresholds can be raised for pages that need them', () => {
  assert.equal(statusOf(checkDesign(sloppy), 'sprawl'), 'WARN');
  assert.equal(statusOf(checkDesign(sloppy, { inlineStyleLimit: 100, fontFamilyLimit: 10 }), 'sprawl'), 'PASS');
});

test('CLI: bad --max-fonts and unknown --skip ids exit 2 with a message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dg-'));
  const file = join(dir, 'p.html');
  writeFileSync(file, clean);
  const neg = spawnSync(process.execPath, [CLI, file, '--max-fonts=-1'], { encoding: 'utf8' });
  assert.equal(neg.status, 2);
  assert.match(neg.stderr, /--max-fonts must be a whole number/);
  const typo = spawnSync(process.execPath, [CLI, file, '--skip', 'lnag'], { encoding: 'utf8' });
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /unknown check id: lnag/);
});

test('CLI: --skip lets a page with a known gap pass the gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dg-'));
  const file = join(dir, 'p.html');
  writeFileSync(file, '<html lang="en"><head><title>t</title><meta name="viewport" content="x"></head><body><main><h1>x</h1><img src="a.png"></main></body></html>');
  assert.equal(spawnSync(process.execPath, [CLI, file], { encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync(process.execPath, [CLI, file, '--skip', 'img-alt'], { encoding: 'utf8' }).status, 0);
});

test('an aria-label names an otherwise empty button', () => {
  const r = checkDesign('<html lang="en"><head><title>t</title></head><body><main><h1>x</h1><button aria-label="Close"></button></main></body></html>');
  assert.equal(statusOf(r, 'links'), 'PASS');
});
