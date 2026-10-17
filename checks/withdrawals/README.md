# The dealing of withdrawals, checked without a browser

`index.html` holds the engine (`Live.compute` and its writers). These scripts cut it out of a page and run it
under node, to hold the rules of 13 October 2026 - *a change to the plan deals nothing of a marked withdrawal
over*, and *a change to another line moves no taking of a balance's own day into that balance or out of it*
(`docs/handoff.md`, the entries of that day) - against the page as it was before them, on plans nobody wrote by
hand: the made-up studio and seeded random ones; and, since 17 October 2026, the owner's decisions of that day
(N, W1, W2, D - below). No document of the real ledger is read; like the tests, the scripts refuse to run beside a
`data/` folder.

They are not part of CI and need nothing installed: node as `scripts/check-one` uses it
(`~/Developer/_tools/money-checks/node/bin/node`), and git for the page of before.

```sh
N=~/Developer/_tools/money-checks/node/bin/node
E=$(mktemp -d)                                         # the two engines live outside the checkout
$N checks/withdrawals/engine.mjs index.html $E/new.cjs
git show a943def:index.html > $E/before.html           # develop before the rule (release 1.9.0)
$N checks/withdrawals/engine.mjs $E/before.html $E/dev.cjs

ENGINES=$E $N checks/withdrawals/cases.cjs             # the faults the review of 17 October 2026 found, by hand
ENGINES=$E $N checks/withdrawals/same.mjs              # a plan without a memory: the old model, byte for byte
ENGINES=$E $N checks/withdrawals/lives.cjs 2500        # random lives of a plan
ENGINES=$E STEPS=16 $N checks/withdrawals/lives.cjs 1500 rich
ENGINES=$E BIAS=1 STEPS=14 $N checks/withdrawals/lives.cjs 1200 rich
ENGINES=$E $N checks/withdrawals/dense.cjs 600 14      # lives lived mostly with a memory in force
ENGINES=$E ON=dev BIAS=1 STEPS=14 $N checks/withdrawals/lives.cjs 300 rich   # the page before the rule: B fails
ENGINES=$E STEPS=12 $N checks/withdrawals/sameday.cjs 4000        # lives around a balance's own day
ENGINES=$E ON=dev STEPS=12 $N checks/withdrawals/sameday.cjs 300  # the page before the rules: S fails
```

These are the runs `docs/handoff.md` quotes; each takes a few minutes on the Mac - one at a time. (The entry of
17 October 2026 quotes a first pass of the same commands with fewer lives: `lives.cjs` 600 in each of its three
runs, `dense.cjs` 200, `sameday.cjs` 1000.)
`lives.cjs`, `dense.cjs` and `sameday.cjs` say at their head what they hold, and print how often each thing was
looked at (and how often there was anything to move). `sameday.cjs` makes the lives the others make too rarely:
a balance typed for today or for yesterday, withdrawals ticked in «Что из этого уже прошло?» or marked after it,
and founders' rows dated on the balance's day.

The owner's decisions of 17 October 2026 (`docs/handoff.md`, the entry of that day) are held by every script:
- **N, D** - the page reads a plan and a table exactly as it reads them with every withdrawal named after a founder
  given that owner by hand, and every move to or back from a founder's Daily or Monthly account from October filed
  as a transfer between own accounts (`named` and `toOwn` in `lib.cjs`, written apart from the page) - the whole
  model, byte for byte, memory or not;
- **F** - a plan with no memory, read with those two written out, is the model of before (`dev.cjs`) byte for byte,
  where no withdrawal is a record (W1); a model with a record is counted and not asked F. So a plan with no
  withdrawal named after a founder and nobody's, no record W1 can match and no Daily move from October gives the
  old model byte for byte;
- **W** - `wCheck` in `lib.cjs`: a record is a withdrawal that may be one, it holds one to four rows of its
  founder within five days of its date, none a Daily move, within the tolerance of its sum, held by no other line,
  and not a set where one row would do; a withdrawal that may be a record and has a row of its founder that fits
  it is one (asked where the plan holds no memory); a rest «вне плана» and what was taken make the row exactly in
  its own currency, and over the rows withdrawals hold the takings and the rests make those rows to the penny.
- **Y** (`lives.cjs`) - a change that moves only the day of a withdrawal whose mark can count leaves it holding what
  it held, its mark counting or not as it did (13 October 2026, rule 5: «Новый день — нет»); records among them, some
  moved past today. Besides its own draws, a stream of its own moves such days now and then.
- **`cases.cjs`** - what the review of 17 October 2026 found, written by hand: a record keeps the taking of a
  balance's day its memory holds when a tie by hand on another line is taken off (S broke); a record's memory holds
  its rows once its day has moved past today, and keeps naming them as a record's when it is written again (Y and K
  broke); a row such a memory holds stays the record's whole, its rest «вне плана» (K broke); and a memory's claim on
  a taking its withdrawal could not be given - news of an earlier day took the room - keeps no record from it (K
  broke). Each case fails on an engine without its fix.
Half the lives (and half the random plans of `same.mjs`) are given these by a stream of their own, so that a seed
makes the same plan as before but for them (`news` in `gen.cjs`; `dense.cjs` and `sameday.cjs` have their own):
withdrawals named after a founder, sometimes with «общий» chosen by hand; records written after their rows and
marked, a row more beside them now and then; moves to Daily and Monthly accounts by the statement's words or by the
label, before October and in it, moves back from them, card payments, direct debits and standing orders under the
label; and (`sameday.cjs`) a record written before its rows came, whose nearer row another line holds by hand.
`ON=dev` asks none of these (the page of before knows nothing of them) and is there for B and S to fail.

- `engine.mjs` - the engine of a page as a node module.
- `lib.cjs` - rows, plans and ledgers made by hand; `bare(M)`, which takes out of a model every field the page
  has gained since the page of before, so that the rest is compared byte for byte (a new field of the model is
  added there, or these runs report it as a difference); `mk(Live)`: `wr` and `page` change a plan the page's way
  (see, change, keep - `Plan.edit`), `raw` is the bare writer: a page from before the rule; and the decisions of
  17 October 2026 written out apart from the page - `named`, `toOwn`, `isDaily`, `wCheck`.
- `gen.cjs` - seeded random plans and ledgers.
- `cases.cjs` - the review's cases, by hand; it asks the page as it is (`new.cjs`) alone.

A change to how withdrawals are dealt (`D2` in the engine, W1 among it, `Live.write.see` and `.keep`), or to whether
a row of a balance's day is inside that balance (`B`, `tookMark`), or to which rows are a founder's (`Live.daily`),
is not finished until these runs say `every property held`, `0 differ` and `all … held` - and the checks `rv-wdmark`, `rv-wdday`,
`records`, `rest` and `daily` are green in CI.
