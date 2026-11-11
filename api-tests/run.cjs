#!/usr/bin/env node
// Dependency-free, read-only API contract and security guardrail checks.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HELP = `AmiraASTAR API checks (Node.js 24, no npm packages)

Usage: node api-tests/run.cjs [options]

Options:
  --base-url URL       App URL (default http://127.0.0.1:8000)
  --timeout-ms N       Request timeout (default 5000)
  --report-dir PATH    Output directory (default work/api-test-results)
  --allow-remote       Permit a non-local target
  --help               Show this help

Checks exercise public API contracts and security guardrails. They do not
sign in, write business state, create users, or modify account data.
`;

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') { out.help = true; continue; }
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'allow-remote') { out.allowRemote = true; continue; }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    out[key] = value;
  }
  return out;
}
function isLocal(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || host === '127.0.0.1' || host.startsWith('127.');
}
function assert(condition, message) { if (!condition) throw new Error(message); }

async function main() {
  const options = args(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const base = new URL(options['base-url'] || 'http://127.0.0.1:8000');
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Base URL must use HTTP or HTTPS.');
  if (!isLocal(base.hostname) && !options.allowRemote) throw new Error('Non-local target refused. Add --allow-remote only if you intend to test it.');
  const timeoutMs = Number(options['timeout-ms'] || 5000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw new Error('--timeout-ms must be an integer from 100 to 60000.');
  const origin = base.origin;
  const checks = [
    {
      name: 'health contract', method: 'GET', url: '/api/health', status: 200,
      validate: body => body?.ok === true && body?.storage === 'sqlite' && Number.isInteger(body?.revision),
      expect: 'ok=true, storage=sqlite, integer revision'
    },
    {
      name: 'public bootstrap contract', method: 'GET', url: '/api/bootstrap', status: 200,
      validate: body => body?.user === null && body?.state && typeof body.state === 'object' && Number.isInteger(body?.revision),
      expect: 'anonymous user, state object, integer revision'
    },
    {
      name: 'authentication guard on private state', method: 'GET', url: '/api/state', status: 401,
      validate: body => body?.code === 'unauthorized', expect: '401 unauthorized'
    },
    {
      name: 'authentication guard on database backup', method: 'GET', url: '/api/admin/backup', status: 401,
      validate: body => body?.code === 'unauthorized', expect: '401 unauthorized'
    },
    {
      name: 'cross-origin write rejected', method: 'POST', url: '/api/state', status: 403,
      headers: { Origin: 'https://untrusted.invalid' }, payload: {},
      validate: body => body?.code === 'origin_denied', expect: '403 origin_denied'
    },
    {
      name: 'unauthenticated state write rejected', method: 'POST', url: '/api/state', status: 401,
      headers: { Origin: origin }, payload: {},
      validate: body => body?.code === 'unauthorized', expect: '401 unauthorized'
    },
    {
      name: 'unknown API route returns not found', method: 'GET', url: '/api/__api_test_unknown_route__', status: 404,
      validate: body => typeof body?.error === 'string', expect: '404 JSON error'
    }
  ];
  const results = [];
  for (const check of checks) {
    const started = performance.now();
    let status = 0, body = null, error = '';
    try {
      const response = await fetch(new URL(check.url, origin), {
        method: check.method,
        headers: { ...(check.payload ? { 'Content-Type': 'application/json' } : {}), ...(check.headers || {}) },
        body: check.payload ? JSON.stringify(check.payload) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual'
      });
      status = response.status;
      if (check.url === '/api/admin/backup' && response.ok) throw new Error('Unexpectedly received a database backup without authentication.');
      try { body = await response.json(); } catch { body = null; }
      assert(status === check.status, `Expected HTTP ${check.status}, received ${status}`);
      assert(check.validate(body), `Response did not match expected contract: ${check.expect}`);
    } catch (err) { error = err.message || String(err); }
    results.push({ name: check.name, method: check.method, path: check.url, expectedStatus: check.status, status, durationMs: Number((performance.now() - started).toFixed(2)), passed: !error, error });
    console.log(`${!error ? 'PASS' : 'FAIL'} ${check.method} ${check.url}${error ? ` — ${error}` : ''}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { app: 'AmiraASTAR', type: 'api-contract-and-guardrail', baseUrl: origin, generatedAt: new Date().toISOString(), summary: { total: results.length, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length }, results };
  const reportDir = path.resolve(options['report-dir'] || path.join('work', 'api-test-results'));
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonFile = path.join(reportDir, `amiraastar-api-${stamp}.json`);
  const mdFile = path.join(reportDir, `amiraastar-api-${stamp}.md`);
  fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}${os.EOL}`);
  const rows = results.map(x => `| ${x.passed ? 'PASS' : 'FAIL'} | ${x.method} ${x.path} | ${x.status || 'no response'} | ${x.durationMs} | ${x.error.replaceAll('|', '\\|') || '—'} |`);
  fs.writeFileSync(mdFile, `# AmiraASTAR API test report\n\n- Target: \`${origin}\`\n- Generated: ${report.generatedAt}\n- Result: ${report.summary.passed}/${report.summary.total} passed\n\n| Result | Request | Status | Duration (ms) | Details |\n|---|---|---:|---:|---|\n${rows.join('\n')}\n`);
  console.log(`\nResult: ${report.summary.passed}/${report.summary.total} passed`);
  console.log(`Reports: ${jsonFile}\n         ${mdFile}`);
  if (report.summary.failed) process.exitCode = 1;
}

main().catch(err => { console.error(`API test runner error: ${err.message}`); process.exitCode = 2; });
