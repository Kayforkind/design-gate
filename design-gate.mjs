#!/usr/bin/env node
/**
 * HTML design-quality gate (prototype). Deterministic, no LLM, no screenshots.
 *
 * Structural checks that AI-generated pages often miss:
 *  - lang:      <html lang> set
 *  - title:     non-empty <title>
 *  - viewport:  <meta name="viewport"> present (mobile layout)
 *  - img-alt:   every <img> has an alt attribute (alt="" is allowed for decoration)
 *  - headings:  exactly one <h1>; no skipped levels (h2 -> h4)
 *  - links:     every <a> and <button> has text or an aria-label
 *  - landmark:  a <main> element exists
 *  - sprawl:    inline style attributes and distinct font-family values stay modest
 *
 * This does not judge taste or contrast. It catches the mechanical problems a
 * gate should block before a human looks at the page.
 *
 * Usage: design-gate page.html [more.html ...] [--json out.json] [--md out.md] [--fail-on fail|warn]
 *                       [--skip id,id] [--max-inline-styles N] [--max-fonts N]
 * Exit: 0 clean · 1 failure (or warning with --fail-on warn) · 2 unreadable input
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse } from 'parse5';

const INLINE_STYLE_LIMIT = 40;
const FONT_FAMILY_LIMIT = 4;

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
  if (node.content) walk(node.content, visit);
}

const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value;
const hasAttr = (n, name) => n.attrs?.some((a) => a.name === name) ?? false;
const textOf = (n) => {
  let s = '';
  walk(n, (x) => {
    if (x.nodeName === '#text') s += x.value;
  });
  return s.trim();
};

export const CHECK_IDS = ['lang', 'title', 'viewport', 'img-alt', 'headings', 'links', 'landmark', 'sprawl'];

/**
 * Run the structural checks. Options:
 *  - skip: check ids to leave out (unknown ids throw)
 *  - inlineStyleLimit, fontFamilyLimit: thresholds for the sprawl check
 */
export function checkDesign(html, { inlineStyleLimit = INLINE_STYLE_LIMIT, fontFamilyLimit = FONT_FAMILY_LIMIT, skip = [] } = {}) {
  const unknown = skip.filter((id) => !CHECK_IDS.includes(id));
  if (unknown.length) throw new Error(`unknown check id: ${unknown.join(', ')} (known: ${CHECK_IDS.join(', ')})`);
  const doc = parse(html);
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });

  const els = { html: [], title: [], meta: [], img: [], h: [], a: [], button: [], main: [] };
  let inlineStyles = 0;
  const fonts = new Set();
  walk(doc, (n) => {
    if (!n.tagName) return;
    const t = n.tagName;
    if (t in els) els[t].push(n);
    if (/^h[1-6]$/.test(t)) els.h.push(n);
    if (hasAttr(n, 'style')) inlineStyles++;
    const style = attr(n, 'style') ?? '';
    for (const m of style.matchAll(/font-family\s*:\s*([^;]+)/gi)) fonts.add(m[1].trim().toLowerCase());
  });
  // font-family inside <style> blocks
  walk(doc, (n) => {
    if (n.tagName === 'style') {
      for (const m of textOf(n).matchAll(/font-family\s*:\s*([^;}]+)/gi)) fonts.add(m[1].trim().toLowerCase());
    }
  });

  const htmlEl = els.html[0];
  if (htmlEl && attr(htmlEl, 'lang')) add('lang', 'PASS', `lang="${attr(htmlEl, 'lang')}"`);
  else add('lang', 'FAIL', '<html> has no lang attribute');

  const title = els.title[0] ? textOf(els.title[0]) : '';
  if (title) add('title', 'PASS', `"${title.slice(0, 60)}"`);
  else add('title', 'FAIL', 'missing or empty <title>');

  const viewport = els.meta.some((m) => (attr(m, 'name') ?? '').toLowerCase() === 'viewport');
  if (viewport) add('viewport', 'PASS', 'viewport meta present');
  else add('viewport', 'WARN', 'no viewport meta tag (mobile layout may break)');

  const noAlt = els.img.filter((i) => !hasAttr(i, 'alt'));
  if (els.img.length === 0) add('img-alt', 'PASS', 'no images');
  else if (noAlt.length) add('img-alt', 'FAIL', `${noAlt.length} of ${els.img.length} image(s) have no alt attribute`);
  else add('img-alt', 'PASS', `all ${els.img.length} image(s) have alt`);

  const h1s = els.h.filter((h) => h.tagName === 'h1').length;
  const levels = els.h.map((h) => Number(h.tagName[1]));
  const skipped = levels.some((lv, i) => i > 0 && lv - levels[i - 1] > 1);
  if (h1s !== 1) add('headings', 'WARN', `${h1s} <h1> element(s); expected exactly one`);
  else if (skipped) add('headings', 'WARN', 'heading levels skip (e.g. h2 then h4)');
  else add('headings', 'PASS', 'one h1, no skipped levels');

  const emptyControls = [...els.a, ...els.button].filter((c) => !textOf(c) && !hasAttr(c, 'aria-label'));
  if (emptyControls.length) add('links', 'FAIL', `${emptyControls.length} link/button(s) with no text or aria-label`);
  else add('links', 'PASS', 'every link and button has a name');

  if (els.main.length) add('landmark', 'PASS', '<main> present');
  else add('landmark', 'WARN', 'no <main> landmark');

  const sprawl = [];
  if (inlineStyles > inlineStyleLimit) sprawl.push(`${inlineStyles} inline style attributes (limit ${inlineStyleLimit})`);
  if (fonts.size > fontFamilyLimit) sprawl.push(`${fonts.size} distinct font-family values (limit ${fontFamilyLimit})`);
  if (sprawl.length) add('sprawl', 'WARN', sprawl.join('; '));
  else add('sprawl', 'PASS', `${inlineStyles} inline style(s), ${fonts.size} font-family value(s)`);

  const active = checks.filter((c) => !skip.includes(c.id));
  const summary = {
    PASS: active.filter((c) => c.status === 'PASS').length,
    WARN: active.filter((c) => c.status === 'WARN').length,
    FAIL: active.filter((c) => c.status === 'FAIL').length,
  };
  return { summary, checks: active };
}

export function toMarkdown(results) {
  const lines = ['# Design gate', ''];
  for (const { file, report } of results) {
    lines.push(`## ${file}`, '', `${report.summary.PASS} pass · ${report.summary.WARN} warn · ${report.summary.FAIL} fail`, '');
    lines.push('| Check | Status | Detail |', '| --- | --- | --- |');
    for (const c of report.checks) lines.push(`| ${c.id} | ${c.status} | ${c.detail.replace(/\|/g, '\|')} |`);
    lines.push('');
  }
  lines.push('_Structural checks only. Not a judgment of taste, contrast, or copy._', '');
  return lines.join('\n');
}

function setExit(code) {
  // Set, do not force-exit (forced exit can trip a libuv assertion on Windows).
  process.exitCode = code;
  return code;
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'string' },
      md: { type: 'string' },
      'fail-on': { type: 'string', default: 'fail' },
      skip: { type: 'string' },
      'max-inline-styles': { type: 'string' },
      'max-fonts': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || positionals.length === 0) {
    console.log('usage: design-gate page.html [more.html ...] [--json out.json] [--md out.md] [--fail-on fail|warn]\n                  [--skip id,id] [--max-inline-styles N] [--max-fonts N]');
    return setExit(values.help ? 0 : 2);
  }
  if (!['fail', 'warn'].includes(values['fail-on'])) {
    console.error('--fail-on must be "fail" or "warn"');
    return setExit(2);
  }
  const opts = {};
  for (const [flag, key] of [['max-inline-styles', 'inlineStyleLimit'], ['max-fonts', 'fontFamilyLimit']]) {
    if (values[flag] === undefined) continue;
    const n = Number(values[flag]);
    if (!Number.isInteger(n) || n < 0) {
      console.error(`--${flag} must be a whole number, 0 or more`);
      return setExit(2);
    }
    opts[key] = n;
  }
  if (values.skip) opts.skip = values.skip.split(',').map((s) => s.trim()).filter(Boolean);
  const results = [];
  for (const file of positionals) {
    let html;
    try {
      html = readFileSync(file, 'utf8');
    } catch (e) {
      console.error(`cannot read ${file}: ${e.message}`);
      return setExit(2);
    }
    try {
      results.push({ file, report: checkDesign(html, opts) });
    } catch (e) {
      console.error(e.message);
      return setExit(2);
    }
  }
  if (values.json) writeFileSync(values.json, JSON.stringify(results.length === 1 ? results[0].report : results, null, 2) + '\n');
  if (values.md) writeFileSync(values.md, toMarkdown(results));
  for (const { file, report } of results) {
    console.log(`\n${file}`);
    for (const c of report.checks) console.log(`  ${c.status.padEnd(4)} ${c.id.padEnd(9)} ${c.detail}`);
    console.log(`  ${report.summary.PASS} pass, ${report.summary.WARN} warn, ${report.summary.FAIL} fail`);
  }
  const fail = results.some((r) => r.report.summary.FAIL > 0);
  const warn = results.some((r) => r.report.summary.WARN > 0);
  return setExit(fail || (values['fail-on'] === 'warn' && warn) ? 1 : 0);
}

if (process.argv[1]?.endsWith('design-gate.mjs')) {
  // Usage errors (e.g. unknown flags) and bad values exit 2 with a one-line message, never a stack trace.
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    setExit(2);
  });
}
