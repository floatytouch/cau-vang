# No AI attribution

- No `Co-Authored-By: Claude`, `Co-authored-by: Cursor`, or similar trailers.
- No "Generated with ..." or AI/emoji footers in commits, PRs, comments, or docs.
- Commit author identity is the project standard (`TP <admin@vietbyte.tech>`).
- Local harness scratch stays untracked (`.claude/`, `.cursorrules`).
- Deliberate exception: repo-root `CLAUDE.md` and `AGENTS.md` (symlink to `CLAUDE.md`) are **tracked** so Claude and Cursor both auto-load the coding law.
