#!/usr/bin/env node
// Local-first, dependency-free performance runner for AmiraASTAR.
// All built-in requests are GET-only and do not modify business records.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PROFILES = {
  smoke: [{ vus: 1, seconds: 10 }],
  load: [{ vus: 5, seconds: 20 }, { vus: 10, seconds: 40 }],
  stress: [{ vus: 5, seconds: 15 }, { vus: 10, seconds: 15 }, { vus: 20, seconds: 15 }, { vus: 30, seconds: 15 }],
  spike: [{ vus: 2, seconds: 15 }, { vus: 25, seconds: 15 }, { vus: 2, seconds: 15 }],
  soak: [{ vus: 10, seconds: 600 }]
};
const SCENARIOS = {
  browse: [
    { name: 'app-page', path: '/', weight: 2 },
    { name: 'health', path: '/api/health', weight: 1 },
    { name: 'bootstrap', path: '/api/bootstrap', weight: 3 }
  ],
  page: [{ name: 'app-page', path: '/', weight: 1 }],
  health: [{ name: 'health', path: '/api/health', weight: 1 }],
  bootstrap: [{ name: 'bootstrap', path: '/api/bootstrap', weight: 1 }]
};
const HELP = `AmiraASTAR performance runner (Node.js 24, no npm packages)

Usage:
  node perf/run.cjs [options]

Options:
  --base-url URL          App URL (default http://127.0.0.1:8000)
  --profile NAME          smoke | load | stress | spike | soak (default smoke)
  --scenario NAME         browse | page | health | bootstrap (default browse)
  --vus N                 Run one fixed stage with N virtual users
  --duration SECONDS      Fixed-stage duration; use with --vus
  --think-ms N            Pause between requests per VU (default 100)
  --timeout-ms N          Request timeout (default 5000)
  --warmup-seconds N      Warm-up duration excluded from results (default 3)
  --max-p95-ms N          Report threshold for aggregate p95 (default 1000)
  --max-error-rate PCT    Report threshold for errors (default 1)
  --report-dir PATH       Output folder (default work/perf-results)
  --allow-remote          Allow a non-local target; remote runs are capped at 10 VUs
  --help                  Show this help

Built-in scenarios only issue GET requests to the application page, /api/health,
and /api/bootstrap. The runner refuses non-local URLs unless --allow-remote is set.
`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') { out.help = true; continue; }
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'allow-remote') { out.allowRemote = true; continue; }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    out[key] = value;
  }
  return out;
}
function integer(value, fallback, name, min, max) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`--${name} must be an integer from ${min} to ${max}.`);
  return parsed;
}
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(2));
}
function localHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || host === '127.0.0.1' || host.startsWith('127.');
}
function escMd(value) { return String(value).replaceAll('|','\\|').replace(/[\r\n]+/g,' '); }
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

function validatePayload(name, body) {
  if (name === 'app-page') {
    if (!body.includes('<title>AmiraASTAR</title>')) throw new Error('Page title not found in HTML response.');
    return;
  }
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('Expected valid JSON response.'); }
  if (name === 'health' && (data.ok !== true || data.storage !== 'sqlite')) throw new Error('Health payload did not report ok/sqlite.');
  if (name === 'bootstrap' && (!data.state || !Number.isFinite(Number(data.revision)))) throw new Error('Bootstrap payload is missing state or revision.');
}

async function requestOne(baseUrl, endpoint, timeoutMs) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(new URL(endpoint.path, baseUrl), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Accept': endpoint.name === 'app-page' ? 'text/html' : 'application/json' }
    });
    const body = await response.text();
    const latencyMs = performance.now() - started;
    if (!response.ok) return { endpoint:endpoint.name, ok:false, status:response.status, latencyMs, bytes:Buffer.byteLength(body), error:`HTTP ${response.status}` };
    try { validatePayload(endpoint.name, body); }
    catch (error) { return { endpoint:endpoint.name, ok:false, status:response.status, latencyMs, bytes:Buffer.byteLength(body), error:`Payload check: ${error.message}` }; }
    return { endpoint:endpoint.name, ok:true, status:response.status, latencyMs, bytes:Buffer.byteLength(body) };
  } catch (error) {
    return { endpoint:endpoint.name, ok:false, status:0, latencyMs:performance.now()-started, bytes:0, error:error.name === 'TimeoutError' ? `Timeout after ${timeoutMs} ms` : error.message };
  }
}

function endpointFor(vu, sequence, endpoints) {
  const total=endpoints.reduce((sum,x)=>sum+x.weight,0);
  let slot=(vu*17+sequence*7)%total;
  for(const endpoint of endpoints){if(slot<endpoint.weight)return endpoint;slot-=endpoint.weight;}
  return endpoints[0];
}

async function runStage({ baseUrl, endpoints, vus, seconds, thinkMs, timeoutMs, collect, counters }) {
  const deadline=performance.now()+seconds*1000;
  const workers=Array.from({length:vus},async(_,vu)=>{
    let sequence=0;
    while(performance.now()<deadline){
      const endpoint=endpointFor(vu,sequence++,endpoints);
      const result=await requestOne(baseUrl,endpoint,timeoutMs);
      if(collect){
        counters.total++;
        counters.bytes+=result.bytes;
        counters.results.push(result);
        if(!result.ok)counters.errors++;
      }
      if(thinkMs)await sleep(thinkMs);
    }
  });
  await Promise.all(workers);
}

function summarize(results, elapsedMs, bytes) {
  const byEndpoint={};
  for(const result of results){
    const bucket=byEndpoint[result.endpoint]||(byEndpoint[result.endpoint]={count:0,errors:0,bytes:0,latencies:[],statuses:{},errorSamples:[]});
    bucket.count++;bucket.bytes+=result.bytes;bucket.latencies.push(result.latencyMs);
    const status=String(result.status||'network-error');bucket.statuses[status]=(bucket.statuses[status]||0)+1;
    if(!result.ok){bucket.errors++;if(bucket.errorSamples.length<5)bucket.errorSamples.push(result.error);}
  }
  for(const bucket of Object.values(byEndpoint)){
    bucket.p50Ms=percentile(bucket.latencies,.50);bucket.p90Ms=percentile(bucket.latencies,.90);bucket.p95Ms=percentile(bucket.latencies,.95);bucket.p99Ms=percentile(bucket.latencies,.99);
    bucket.minMs=bucket.latencies.length?Number(Math.min(...bucket.latencies).toFixed(2)):0;
    bucket.maxMs=bucket.latencies.length?Number(Math.max(...bucket.latencies).toFixed(2)):0;
    bucket.avgMs=bucket.latencies.length?Number((bucket.latencies.reduce((a,b)=>a+b,0)/bucket.latencies.length).toFixed(2)):0;
    delete bucket.latencies;
  }
  const latencies=results.map(x=>x.latencyMs),errors=results.filter(x=>!x.ok).length;
  return {
    elapsedSeconds:Number((elapsedMs/1000).toFixed(2)),requests:results.length,errors,
    errorRatePct:results.length?Number((errors*100/results.length).toFixed(2)):0,
    requestsPerSecond:elapsedMs?Number((results.length*1000/elapsedMs).toFixed(2)):0,
    bytesReceived:bytes,meanLatencyMs:latencies.length?Number((latencies.reduce((a,b)=>a+b,0)/latencies.length).toFixed(2)):0,
    p50Ms:percentile(latencies,.50),p90Ms:percentile(latencies,.90),p95Ms:percentile(latencies,.95),p99Ms:percentile(latencies,.99),
    minMs:latencies.length?Number(Math.min(...latencies).toFixed(2)):0,maxMs:latencies.length?Number(Math.max(...latencies).toFixed(2)):0,
    statuses:Object.fromEntries(Object.entries(byEndpoint).flatMap(([name,b])=>Object.entries(b.statuses).map(([code,count])=>[`${name}:${code}`,count]))),
    endpoints:Object.fromEntries(Object.entries(byEndpoint).map(([name,b])=>{const {statuses,...rest}=b;return[name,rest];})),
    errorSamples:results.filter(x=>!x.ok).slice(0,20).map(x=>({endpoint:x.endpoint,status:x.status,error:x.error}))
  };
}

function markdownReport(report) {
  const lines=[
    '# AmiraASTAR performance report','',
    `- Run ID: ${report.runId}`,
    `- Started: ${report.startedAt}`,
    `- Target: ${report.target}`,
    `- Profile / scenario: ${report.profile} / ${report.scenario}`,
    `- VU stages: ${report.stages.map(x=>`${x.vus} VU × ${x.seconds}s`).join(', ')}`,
    `- Warm-up: ${report.warmupSeconds}s (excluded from measurements)`,'',
    '## Aggregate results','',
    '| Requests | Errors | Error rate | Throughput | Mean | p50 | p90 | p95 | p99 | Max |','|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    `| ${report.summary.requests} | ${report.summary.errors} | ${report.summary.errorRatePct}% | ${report.summary.requestsPerSecond} req/s | ${report.summary.meanLatencyMs} ms | ${report.summary.p50Ms} ms | ${report.summary.p90Ms} ms | ${report.summary.p95Ms} ms | ${report.summary.p99Ms} ms | ${report.summary.maxMs} ms |`,'',
    `- Thresholds: p95 ≤ ${report.thresholds.maxP95Ms} ms; errors ≤ ${report.thresholds.maxErrorRatePct}%` ,
    `- Threshold result: **${report.thresholds.passed?'PASS':'REVIEW'}**`,'',
    '## Endpoint results','',
    '| Endpoint | Requests | Errors | Mean | p50 | p95 | p99 | Max | Bytes |','|---|---:|---:|---:|---:|---:|---:|---:|---:|'
  ];
  for(const [name,b] of Object.entries(report.summary.endpoints))lines.push(`| ${escMd(name)} | ${b.count} | ${b.errors} | ${b.avgMs} ms | ${b.p50Ms} ms | ${b.p95Ms} ms | ${b.p99Ms} ms | ${b.maxMs} ms | ${b.bytes} |`);
  lines.push('','## Phase results','','| Phase | VUs | Duration | Requests | Errors | RPS | p95 |','|---:|---:|---:|---:|---:|---:|---:|');
  report.phases.forEach((p,i)=>lines.push(`| ${i+1} | ${p.vus} | ${p.elapsedSeconds}s | ${p.requests} | ${p.errors} | ${p.requestsPerSecond} | ${p.p95Ms} ms |`));
  if(report.summary.errorSamples.length){lines.push('','## Error samples','');report.summary.errorSamples.forEach(e=>lines.push(`- ${escMd(e.endpoint)} (${e.status}): ${escMd(e.error)}`));}
  lines.push('','Built-in workload is read-only (GET requests). Compare runs on the same machine, Node version, database state, and load profile.');
  return lines.join('\n')+'\n';
}

async function main() {
  const args=parseArgs(process.argv.slice(2));
  if(args.help){process.stdout.write(HELP);return;}
  const profile=args.profile||'smoke',scenario=args.scenario||'browse';
  if(!PROFILES[profile])throw new Error(`Unknown profile "${profile}". Choose: ${Object.keys(PROFILES).join(', ')}.`);
  if(!SCENARIOS[scenario])throw new Error(`Unknown scenario "${scenario}". Choose: ${Object.keys(SCENARIOS).join(', ')}.`);
  const baseUrl=new URL(args['base-url']||'http://127.0.0.1:8000');
  if(!['http:','https:'].includes(baseUrl.protocol))throw new Error('Base URL must use http or https.');
  const local=localHost(baseUrl.hostname);
  if(!local&&!args.allowRemote)throw new Error('Target is not localhost. Add --allow-remote only when you intend to load a remote environment.');
  let stages=PROFILES[profile].map(x=>({...x}));
  if(args.vus!==undefined||args.duration!==undefined){
    if(args.vus===undefined||args.duration===undefined)throw new Error('Use --vus and --duration together.');
    stages=[{vus:integer(args.vus,1,'vus',1,local?50:10),seconds:integer(args.duration,10,'duration',1,600)}];
  }
  const maxStageVus=local?50:10;
  if(stages.some(x=>x.vus>maxStageVus))throw new Error(`Stage VUs exceed the ${maxStageVus} VU cap for this target.`);
  if(stages.reduce((sum,x)=>sum+x.seconds,0)>900)throw new Error('Total profile duration may not exceed 900 seconds.');
  const thinkMs=integer(args['think-ms'],100,'think-ms',0,5000);
  const timeoutMs=integer(args['timeout-ms'],5000,'timeout-ms',100,30000);
  const warmupSeconds=integer(args['warmup-seconds'],3,'warmup-seconds',0,30);
  const maxP95Ms=integer(args['max-p95-ms'],1000,'max-p95-ms',1,60000);
  const maxErrorRatePct=Number(args['max-error-rate']??1);
  if(!Number.isFinite(maxErrorRatePct)||maxErrorRatePct<0||maxErrorRatePct>100)throw new Error('--max-error-rate must be between 0 and 100.');
  const endpoints=SCENARIOS[scenario];
  const counters={total:0,errors:0,bytes:0,results:[]};
  const phases=[];
  const startedAt=new Date().toISOString();
  const runId=startedAt.replace(/[-:.TZ]/g,'').slice(0,14);
  console.log(`Target: ${baseUrl.origin}`);
  console.log(`Profile: ${profile}; scenario: ${scenario}; VUs: ${stages.map(s=>s.vus).join(' → ')}; duration: ${stages.reduce((a,b)=>a+b.seconds,0)}s`);
  console.log(`Read-only endpoints: ${endpoints.map(e=>e.path).join(', ')}`);
  if(!local)console.log('Remote target explicitly enabled; VU cap is 10.');
  if(warmupSeconds){console.log(`Warm-up: ${warmupSeconds}s`);await runStage({baseUrl,endpoints,vus:stages[0].vus,seconds:warmupSeconds,thinkMs,timeoutMs,collect:false,counters});}
  for(let i=0;i<stages.length;i++){
    const stage=stages[i];
    console.log(`Phase ${i+1}/${stages.length}: ${stage.vus} VU × ${stage.seconds}s`);
    const phaseCounters={total:0,errors:0,bytes:0,results:[]};
    const phaseStart=performance.now();
    await runStage({baseUrl,endpoints,vus:stage.vus,seconds:stage.seconds,thinkMs,timeoutMs,collect:true,counters:phaseCounters});
    const elapsed=performance.now()-phaseStart;
    const phaseSummary=summarize(phaseCounters.results,elapsed,phaseCounters.bytes);
    phases.push({vus:stage.vus,...phaseSummary});
    counters.total+=phaseCounters.total;counters.errors+=phaseCounters.errors;counters.bytes+=phaseCounters.bytes;counters.results.push(...phaseCounters.results);
  }
  const elapsedMs=phases.reduce((sum,p)=>sum+p.elapsedSeconds*1000,0);
  const summary=summarize(counters.results,elapsedMs,counters.bytes);
  const thresholds={maxP95Ms,maxErrorRatePct,passed:summary.p95Ms<=maxP95Ms&&summary.errorRatePct<=maxErrorRatePct};
  const report={runId,startedAt,target:baseUrl.href,profile,scenario,stages,warmupSeconds,thinkMs,timeoutMs,thresholds,summary,phases,host:{platform:process.platform,arch:process.arch,node:process.version,cpus:os.cpus().length}}
  const reportDir=path.resolve(args['report-dir']||path.join(__dirname,'..','work','perf-results'));
  fs.mkdirSync(reportDir,{recursive:true});
  const jsonFile=path.join(reportDir,`amiraastar-perf-${runId}.json`);
  const mdFile=path.join(reportDir,`amiraastar-perf-${runId}.md`);
  fs.writeFileSync(jsonFile,JSON.stringify(report,null,2),'utf8');
  fs.writeFileSync(mdFile,markdownReport(report),'utf8');
  console.log(`Requests: ${summary.requests}; errors: ${summary.errors} (${summary.errorRatePct}%); p95: ${summary.p95Ms} ms; throughput: ${summary.requestsPerSecond} req/s`);
  console.log(`Thresholds: ${thresholds.passed?'PASS':'REVIEW'} (p95 ≤ ${maxP95Ms} ms; errors ≤ ${maxErrorRatePct}%)`);
  console.log(`Reports: ${jsonFile}`);
  console.log(`         ${mdFile}`);
  if(summary.requests===0)throw new Error('No measured requests completed.');
  if(!thresholds.passed)process.exitCode=2;
}

main().catch(error=>{console.error(`Performance run failed: ${error.message}`);process.exitCode=1;});
