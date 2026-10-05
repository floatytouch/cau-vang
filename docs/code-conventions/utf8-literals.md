# UTF-8 literals

Human-readable text in source and tests is written as real UTF-8 characters.

- Vietnamese and other non-ASCII prose: write `Nốt`, `—`, etc. directly.
- Do **not** use `\uXXXX` escapes for human text in `.ts`, `.tsx`, `.json` fixtures, or tests.
- Commit messages and PR text still use ASCII punctuation (`--`, `...`, `'`) per [ascii-commits.md](./ascii-commits.md); that rule is about punctuation in git metadata, not about banning UTF-8 in code strings.
