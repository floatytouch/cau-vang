# Naming

- English everywhere in code: identifiers, comments, logs, commit subjects.
- Descriptive names; no cryptic abbreviations.
- Folders by feature or domain (`braincore/`, `identity/`), not type dumps (`utils/`, `helpers/`).
- One file, one responsibility; split past ~300-400 lines or mixed concerns.
- One function, one job; keep under ~50 lines when practical.
- Magic numbers and repeated strings become named constants at the single source of truth.
