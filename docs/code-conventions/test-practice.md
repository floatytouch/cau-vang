# Test practice

- Real logic ships with tests; bug fixes add the regression that would have caught them.
- Security and guard tests need both arms: a true-positive control and a fail-before / pass-after (or mutation) check.
- Mutation probe new guards: temporarily delete or disable the guard on a copy and confirm the suite goes red.
- Fail closed: missing or unparseable boundary input dies with an actionable message.
- Test rigs are self-contained: unique temp paths, reap children, assert teardown.
- Claims about runtime behavior ship with a proving probe/test, or are labeled unverified.
