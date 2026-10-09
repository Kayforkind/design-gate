# design-gate

**A deterministic quality gate for generated HTML.**

AI-written and template-written pages often ship with the same mechanical problems: no `lang`, no alt text, skipped heading levels, icon buttons with no name, and style sprawl. design-gate checks for those in milliseconds. It runs no LLM and takes no screenshots, so the same page always gets the same result.

It catches what a gate should block before a person looks. It does **not** judge taste, contrast, or copy.

## What it checks

| Check | Passes when | Warns or fails when |
| --- | --- | --- |
| `lang` | `<html lang>` is set | Fails if missing |
| `title` | `<title>` is non-empty | Fails if missing or empty |
| `viewport` | A viewport meta tag exists | Warns if missing |
| `img-alt` | Every `<img>` has an `alt` attribute (empty is fine for decoration) | Fails if any `<img>` lacks `alt` |
| `headings` | Exactly one `<h1>`, no skipped levels | Warns otherwise |
| `links` | Every link and button has text or `aria-label` | Fails if any is unnamed |
| `landmark` | A `<main>` element exists | Warns if missing |
| `sprawl` | ≤ 40 inline style attributes and ≤ 4 distinct font families | Warns if over |

## Install

```bash
npm install
```

Requires Node 20+. The only dependency is `parse5`, an HTML parser.

## Usage

```bash
node design-gate.mjs dist/index.html
node design-gate.mjs $(find dist -name "*.html") --md report.md --json report.json --fail-on warn
```

```
examples/bad-page.html
  FAIL lang      <html> has no lang attribute
  FAIL title     missing or empty <title>
  WARN viewport  no viewport meta tag (mobile layout may break)
  FAIL img-alt   1 of 2 image(s) have no alt attribute
  WARN headings  heading levels skip (e.g. h2 then h4)
  FAIL links     2 link/button(s) with no text or aria-label
  WARN landmark  no <main> landmark
  WARN sprawl    5 distinct font-family values (limit 4)
  0 pass, 4 warn, 4 fail
```

Sample pages live in [`examples/`](examples/). The full Markdown report is [`examples/report.md`](examples/report.md).

| Exit | Meaning |
| --- | --- |
| `0` | Clean (warnings allowed unless `--fail-on warn`) |
| `1` | A failure, or a warning with `--fail-on warn` |
| `2` | Unreadable input or bad usage |

## CI

`.github/workflows/design-gate.yml` builds the site, gates every HTML file in `dist/`, and fails the pull request on any warning.

## Limits

- Structural only. A page can pass every check and still look bad.
- Contrast is not computed. That needs rendered styles.
- Inline `style` and `<style>` blocks are scanned with regexes for font families, so unusual CSS can be missed.
- It reads static HTML. JavaScript-rendered content is not checked.

## License

MIT
