# AmiraASTAR performance runner

The dependency-free runner measures read-only application-page, health, and bootstrap requests. It writes JSON and Markdown reports to `work/perf-results/`, which is ignored by Git.

Run from the repository root with Node.js 24:

```powershell
& "$env:LOCALAPPDATA\Programs\AmiraASTAR-Node24\node.exe" perf/run.cjs --profile smoke
```

Profiles: `smoke`, `load`, `stress`, `spike`, `soak`. Scenarios: `browse`, `page`, `health`, `bootstrap`. Use `node perf/run.cjs --help` for all options.

The default target is `http://127.0.0.1:8000`. Remote URLs require `--allow-remote`; remote runs are capped at 10 virtual users. Local runs are capped at 50 virtual users, and every run is capped at 15 minutes. Built-in scenarios issue GET requests only and do not modify business data.
