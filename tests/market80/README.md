# Monthly market reporting tests

Install test-only dependencies `jsdom` and `@electric-sql/pglite`, then run:

```
node tests/market80/test-market-sql.cjs
node tests/market80/test-market-ui.cjs
node tests/market80/test-export.cjs
```

The export test requires `MARKET_TEMPLATE80` to point to an authorized local copy of the cleaned company template. The template is kept in the authenticated database and intentionally is not in this public repository. The photo fixture is synthetic.

Coverage: active membership and private object policies; shared edits and revision conflicts; recoverable removal; monthly and account isolation; draft recovery; field-wise conflict merging; photo embedding and overflow pages; preservation of the brand appendix/styles/dropdowns; XML escaping and failed-photo handling. Tests create their own temporary database and never connect to production.
