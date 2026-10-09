# Design gate

## examples/good-page.html

8 pass · 0 warn · 0 fail

| Check | Status | Detail |
| --- | --- | --- |
| lang | PASS | lang="en" |
| title | PASS | "Acme Pricing" |
| viewport | PASS | viewport meta present |
| img-alt | PASS | all 1 image(s) have alt |
| headings | PASS | one h1, no skipped levels |
| links | PASS | every link and button has a name |
| landmark | PASS | <main> present |
| sprawl | PASS | 0 inline style(s), 1 font-family value(s) |

## examples/bad-page.html

0 pass · 4 warn · 4 fail

| Check | Status | Detail |
| --- | --- | --- |
| lang | FAIL | <html> has no lang attribute |
| title | FAIL | missing or empty <title> |
| viewport | WARN | no viewport meta tag (mobile layout may break) |
| img-alt | FAIL | 1 of 2 image(s) have no alt attribute |
| headings | WARN | heading levels skip (e.g. h2 then h4) |
| links | FAIL | 2 link/button(s) with no text or aria-label |
| landmark | WARN | no <main> landmark |
| sprawl | WARN | 5 distinct font-family values (limit 4) |

_Structural checks only. Not a judgment of taste, contrast, or copy._
