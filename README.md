# Self Studio — Money

Bank statements in, the nine blocks of "All Transactions by trimester" out, and
a monthly dashboard on top. Runs on this Mac only.

## Start

Double-click `Запустить Money.command`. It opens <http://127.0.0.1:5190>.
Keep the Terminal window open while working; Ctrl+C stops it.

## What is where

| | |
|---|---|
| `index.html` | the whole tool: page, styles and logic in one file |
| `server.py` | serves the page and reads/writes the data file; Python standard library only |
| `vendor/` | SheetJS and pdf.js, so Excel and PDF statements are read without the internet |
| `data/db.json` | the ledger: transactions, the inbox, rules, settings |
| `data/cash.json` | the cash plan of the «Касса» tab: balances, expected invoices, payouts, taxes — appears on the first save |
| `data/backups/` | each data file as it stood at the start of each day, last 90 of each kept |

## The data

`data/` is the only thing here that cannot be rebuilt. It holds the studio's
money and is not in git on purpose. Before the first write of a day the server
copies `db.json` into `data/backups/`; a save that would drop more than half
the rows makes an extra copy named `before-shrink-…` first. `cash.json` is
kept the same way, in copies named `cash-…`.

To move the tool to another Mac, copy the whole folder.

## Where it came from

The same page is published as two claude.ai artifacts (a seeded one and an
empty trial copy). This folder is the one in use; the artifacts are older.
Styles follow `selfstudio-OPS/apps/web/src/styles/tokens.css`.
