# AmiraASTAR API testing

This dependency-free Node.js 24 runner checks the API response contracts and security guardrails without signing in or changing business data.

Run from the repository root while AmiraASTAR is running:

```powershell
& "$env:LOCALAPPDATA\Programs\AmiraASTAR-Node24\node.exe" api-tests/run.cjs
```

Reports are written to `work/api-test-results/` as JSON and Markdown. Use `--help` to see target, timeout, and remote-target options. Non-local targets require `--allow-remote`.

## Included checks

- Health and public bootstrap response contracts
- Authentication guards for private state and database backup
- Cross-origin write rejection and unauthenticated write rejection
- Unknown API route returns a JSON 404

These are API contract and guardrail checks. Real-time testing is a separate concern: AmiraASTAR uses revision checks to detect stale concurrent updates, which can be exercised in a controlled authenticated test environment. RAG means retrieval-augmented generation; the current app has no AI retrieval API, so RAG grounding and citation tests are not applicable until such an endpoint exists.
