# @noot/engine-openai

Bare-API `EngineAdapter` for any OpenAI-compatible HTTP API (`/v1/chat/completions`).
Use for vLLM, Gemini OpenAI shim, local inference — BrainCore keeps the tool loop.

Factory-only config (no `process.env` in this package). See `createOpenAiAdapter`.
