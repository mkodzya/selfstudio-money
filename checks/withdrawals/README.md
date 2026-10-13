# The dealing of withdrawals, checked without a browser

`index.html` holds the engine (`Live.compute` and its writers). These scripts cut it out of a page and run it
under node, to hold the rules of 13 October 2026 - *a change to the plan deals nothing of a marked withdrawal
over*, and *a change to another line moves no taking of a balance's own day into that balance or out of it*
(`docs/handoff.md`, the entries of that day) - against the page as it was before them, on plans nobody wrote by
hand: the made-up studio and seeded random ones. No document of the real ledger is read; like the
tests, the scripts refuse to run beside a `data/` folder.

They are not part of CI and need nothing installed: node as `scripts/check-one` uses it
(`~/Developer/_tools/money-checks/node/bin/node`), and git for the page of before.

```sh
N=~/Developer/_tools/money-checks/node/bin/node
E=$(mktemp -d)                                         # the two engines live outside the checkout
$N checks/withdrawals/engine.mjs index.html $E/new.cjs
git show a943def:index.html > $E/before.html           # develop before the rule (release 1.9.0)
$N checks/withdrawals/engine.mjs $E/before.html $E/dev.cjs

ENGINES=$E $N checks/withdrawals/same.mjs              # a plan without a memory: the old model, byte for byte
ENGINES=$E $N checks/withdrawals/lives.cjs 2500        # random lives of a plan
ENGINES=$E STEPS=16 $N checks/withdrawals/lives.cjs 1500 rich
ENGINES=$E BIAS=1 STEPS=14 $N checks/withdrawals/lives.cjs 1200 rich
ENGINES=$E $N checks/withdrawals/dense.cjs 600 14      # lives lived mostly with a memory in force
ENGINES=$E ON=dev BIAS=1 STEPS=14 $N checks/withdrawals/lives.cjs 300 rich   # the page before the rule: B fails
ENGINES=$E STEPS=12 $N checks/withdrawals/sameday.cjs 4000        # lives around a balance's own day
ENGINES=$E ON=dev STEPS=12 $N checks/withdrawals/sameday.cjs 300  # the page before the rules: S fails
```

These are the runs `docs/handoff.md` quotes; each takes a few minutes on the Mac - one at a time.
`lives.cjs`, `dense.cjs` and `sameday.cjs` say at their head what they hold, and print how often each thing was
looked at (and how often there was anything to move). `sameday.cjs` makes the lives the others make too rarely:
a balance typed for today or for yesterday, withdrawals ticked in «Что из этого уже прошло?» or marked after it,
and founders' rows dated on the balance's day.

- `engine.mjs` - the engine of a page as a node module.
- `lib.cjs` - rows, plans and ledgers made by hand, and `mk(Live)`: `wr` and `page` change a plan the page's way
  (see, change, keep - `Plan.edit`), `raw` is the bare writer: a page from before the rule.
- `gen.cjs` - seeded random plans and ledgers.

A change to how withdrawals are dealt (`D2` in the engine, `Live.write.see` and `.keep`), or to whether a row of a
balance's day is inside that balance (`B`, `tookMark`), is not finished until these runs say `every property held`
and `0 differ` - and the checks `rv-wdmark` and `rv-wdday` are green in CI.
