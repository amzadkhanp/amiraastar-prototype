/* ================= 20 red / amber / green status rules ================= */
/* Every rule lives in db.rag (editable by an admin) and returns a level, a short word and the reason. */
var LV = { green: { w: 'Healthy', i: '●', k: 'g' }, amber: { w: 'Watch', i: '▲', k: 'a' }, red: { w: 'Act now', i: '■', k: 'r' } };
function R(level, why, extra) { var o = { lv: level, why: why }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
function ragBadge(r, word) { return '<span class="rag rag-' + r.lv + '" title="' + esc(r.why) + '"><i aria-hidden="true">' + LV[r.lv].i + '</i> ' + esc(word || LV[r.lv].w) + '</span>'; }
function G() { return db.rag; }

/* hardware stock: green above the reorder level, amber at or below it, red when empty or under hwRedPct % of it */
function ragHw(x) {
  if (x.s < 1) return R('red', 'Out of stock');
  if (x.s <= Math.floor(x.min * G().hwRedPct / 100)) return R('red', 'Critically low: ' + x.s + ' left, reorder level ' + x.min);
  if (x.s <= x.min) return R('amber', 'Reorder now: ' + x.s + ' left, reorder level ' + x.min);
  return R('green', x.s + ' in stock');
}
/* rice stock per bag size: red when empty, amber at or below riceAmber bags */
function ragRice(v) {
  if (v.s < 1) return R('red', 'Out of stock');
  if (v.s <= G().riceAmber) return R('amber', 'Only ' + v.s + ' left (watch level ' + G().riceAmber + ')');
  return R('green', v.s + ' in stock');
}
function ageH(t) { return (Date.now() - t) / 36e5; }
/* an order that has not been delivered yet gets older: amber after orderAmberH hours, red after orderRedH */
function ragOrder(o) {
  if (o.status === 'delivered' || o.status === 'cancelled') return null;
  var h = ageH(otime(o)), L = Math.floor(h);
  if (h >= G().orderRedH) return R('red', 'Open for ' + L + ' hours (limit ' + G().orderRedH + ')');
  if (h >= G().orderAmberH) return R('amber', 'Open for ' + L + ' hours (watch at ' + G().orderAmberH + ')');
  return R('green', 'Open for ' + L + ' hours');
}
/* expense claims: waiting for review, or approved and waiting for payment */
function ragClaim(x) {
  var d = ageH(N(x.ts, Date.now())) / 24, D = Math.floor(d);
  if (x.status === 'submitted') return d >= G().expRedD ? R('red', 'Waiting for review for ' + D + ' days') : d >= G().expAmberD ? R('amber', 'Waiting for review for ' + D + ' days') : R('green', 'Submitted ' + D + ' days ago');
  if (x.status === 'approved') return d >= G().payRedD ? R('red', 'Approved ' + D + ' days ago, not paid') : d >= G().payAmberD ? R('amber', 'Approved ' + D + ' days ago, not paid') : R('green', 'Approved, payment due');
  return null;
}
function ragReturn(o) {
  if (!o.ret || o.ret.st !== 'requested') return null;
  var d = ageH(o.ret.ts) / 24, D = Math.floor(d);
  return d >= G().retRedD ? R('red', 'Return waiting ' + D + ' days') : d >= G().retAmberD ? R('amber', 'Return waiting ' + D + ' days') : R('green', 'Return requested ' + D + ' days ago');
}
/* security posture: see the Security tab */
function secChecks() {
  var out = [], now = Date.now(), plain = db.users.filter(function (u) { return u.p !== undefined; }).length;
  out.push(Object.assign(R(plain ? 'red' : 'green', plain ? plain + ' account(s) still hold a readable password' : 'All passwords are stored as salted PBKDF2 hashes'), { n: 'Password storage' }));
  var dAdm = db.users.filter(function (u) { return u.defaultPw && u.role === 'admin'; }).length, dOth = db.users.filter(function (u) { return u.defaultPw && u.role !== 'admin'; }).length;
  out.push(Object.assign(dAdm ? R('red', dAdm + ' admin account(s) still use the published demo password') : dOth ? R('amber', dOth + ' non-admin demo account(s) still use the published password') : R('green', 'No account uses a default password'), { n: 'Default passwords' }));
  out.push(Object.assign(db.settings.demo ? R('amber', 'Demo mode is on: sign-in shows tap-to-fill buttons') : R('green', 'Demo mode is off'), { n: 'Demo mode' }));
  var idle = N(db.settings.idleMin, 15);
  out.push(Object.assign(idle <= 15 ? R('green', 'Sign-out after ' + idle + ' minutes idle') : idle <= 30 ? R('amber', 'Sign-out after ' + idle + ' minutes idle (15 or less is better)') : R('red', 'Sign-out after ' + idle + ' minutes idle is too long'), { n: 'Idle sign-out' }));
  var bad24 = db.audit.filter(function (a) { return a.bad && now - a.t < 864e5; }).length;
  out.push(Object.assign(bad24 >= 20 ? R('red', bad24 + ' failed or denied actions in 24 hours') : bad24 >= 5 ? R('amber', bad24 + ' failed or denied actions in 24 hours') : R('green', bad24 + ' failed or denied actions in 24 hours'), { n: 'Failed sign-ins and denied actions' }));
  var locked = Object.keys(db.lock).filter(function (k) { return db.lock[k].until > now; }).length;
  out.push(Object.assign(locked ? R('amber', locked + ' name(s) locked out now') : R('green', 'No lockouts now (' + MAXFAIL + ' wrong tries lock a name for ' + LOCKMIN + ' minutes)'), { n: 'Lockouts' }));
  var stale = db.users.filter(function (u) { return u.status === 'pending'; }).length;
  out.push(Object.assign(stale ? R('amber', stale + ' employee request(s) waiting for approval') : R('green', 'No pending employee requests'), { n: 'Pending approvals' }));
  var csp = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  out.push(Object.assign(csp ? R('green', 'A content security policy limits what the page can load') : R('red', 'No content security policy'), { n: 'Browser protections' }));
  out.push(Object.assign(R('amber', 'Prototype: accounts and data live in this browser only. A server is needed for real protection (Step 2).'), { n: 'Where data lives' }));
  return out;
}
function worst(list) { return list.reduce(function (a, r) { return !r ? a : (r.lv === 'red' ? 'red' : (r.lv === 'amber' && a !== 'red' ? 'amber' : a)); }, 'green'); }
function count(list) { var c = { red: 0, amber: 0, green: 0 }; list.forEach(function (r) { if (r) c[r.lv]++; }); return c; }

/* everything the board needs, in one pass */
function collect() {
  var stock = [], orders = [], claims = [], rets = [];
  db.rice.forEach(function (r) { W.forEach(function (w) { stock.push(Object.assign(ragRice(r.v[w]), { what: r.name + ' ' + w + ' kg', area: 'RiceMarket', tab: 'Stock' })); }); });
  db.hw.forEach(function (x) { stock.push(Object.assign(ragHw(x), { what: x.name, area: 'Hardware', tab: 'Inventory' })); });
  db.ap.forEach(function (x) { stock.push(Object.assign(ragHw(x), { what: x.name + ' (' + x.vtype + ' ' + x.pno + ')', area: 'Spare parts', tab: 'Parts stock' })); });
  db.orders.forEach(function (o) { var r = ragOrder(o); if (r) orders.push(Object.assign(r, { what: 'Order #' + o.id + ' · ' + o.custName, area: A2.ap.modName(o.mod), tab: 'Orders' })); var q = ragReturn(o); if (q) rets.push(Object.assign(q, { what: 'Return for order #' + o.id, area: A2.ap.modName(o.mod), tab: 'Orders' })); });
  db.exp.forEach(function (x) { var r = ragClaim(x); if (r) claims.push(Object.assign(r, { what: inr(x.amount) + ' ' + x.cat + ' · ' + x.empName, area: 'Expenses', tab: 'Payments' })); });
  return { stock: stock, orders: orders, claims: claims, rets: rets, sec: me && me.role === 'admin' ? secChecks() : [] };
}
A2.collect = collect;
A2.rag = { hw: ragHw, rice: ragRice, order: ragOrder, claim: ragClaim, ret: ragReturn, sec: secChecks };

/* ---- status at a glance (home) ---- */
function glanceHtml() {
  var c = collect(), sets = [['Stock', c.stock], ['Open orders', c.orders], ['Returns', c.rets], ['Expense claims', c.claims]];
  if (me.role === 'admin') sets.push(['Security', c.sec]);
  var h = '<div class="glance" role="group" aria-label="Status at a glance">';
  sets.forEach(function (s) {
    var n = count(s[1]), w = worst(s[1]);
    h += '<button onclick="A2.board()" aria-label="' + esc(s[0]) + ': ' + LV[w].w + '"><div class="mut">' + esc(s[0]) + '</div>' + ragBadge({ lv: w, why: n.red + ' red, ' + n.amber + ' amber, ' + n.green + ' green' }) +
      '<div class="n mut">' + n.red + ' red · ' + n.amber + ' amber · ' + n.green + ' green</div></button>';
  });
  return h + '</div>';
}
A2.board = function () { var m = mod || 'rice'; if (!mod) { mod = m; } tab = 'Status board'; render(); };

/* ---- status board ---- */
function boardSection(title, list, hint, maxGreen) {
  var n = count(list), shown = list.filter(function (r) { return r.lv !== 'green'; }).sort(function (a, b) { return (a.lv === 'red' ? 0 : 1) - (b.lv === 'red' ? 0 : 1); });
  var h = '<div class="card" style="margin-bottom:14px"><div class="row"><b>' + esc(title) + '</b><span class="mut">' + n.red + ' red · ' + n.amber + ' amber · ' + n.green + ' green</span></div><p class="mut" style="margin:4px 0 8px">' + esc(hint) + '</p>';
  if (!shown.length) h += '<p style="margin:0">' + ragBadge(R('green', 'Nothing needs attention')) + ' Nothing needs attention.</p>';
  shown.slice(0, 12).forEach(function (r) { h += '<div class="ragrow">' + ragBadge(r) + '<div><div>' + esc(r.what) + '</div><div class="mut">' + esc(r.area) + ' · ' + esc(r.why) + '</div></div></div>'; });
  if (shown.length > 12) h += '<p class="mut" style="margin:8px 0 0">and ' + (shown.length - 12) + ' more.</p>';
  return h + '</div>';
}
function board() {
  var c = collect(), g = G();
  var h = '<h2>Status board</h2><p class="mut">Red means act now, amber means watch, green means fine. Each item says why. Admins can change the thresholds in Status rules.</p>';
  h += '<div class="grid" style="margin-bottom:14px">';
  [['Stock', c.stock], ['Open orders', c.orders], ['Returns', c.rets], ['Expense claims', c.claims]].concat(me.role === 'admin' ? [['Security', c.sec]] : []).forEach(function (s) {
    var w = worst(s[1]), n = count(s[1]);
    h += '<div class="card ragtile ' + LV[w].k + '"><div class="ink mut">' + esc(s[0]) + '</div><div style="margin:6px 0">' + ragBadge({ lv: w, why: LV[w].w }) + '</div><div class="ink mut">' + n.red + ' red · ' + n.amber + ' amber · ' + n.green + ' green</div></div>';
  });
  h += '</div>';
  h += boardSection('Stock', c.stock, 'Hardware and spare parts: red when empty or at ' + g.hwRedPct + '% of the reorder level or less, amber at the reorder level. Rice: red when empty, amber at ' + g.riceAmber + ' bags or fewer.');
  h += boardSection('Open orders', c.orders, 'Not yet delivered: amber after ' + g.orderAmberH + ' hours, red after ' + g.orderRedH + ' hours.');
  h += boardSection('Returns', c.rets, 'Return requests waiting for a decision: amber after ' + g.retAmberD + ' days, red after ' + g.retRedD + ' days.');
  h += boardSection('Expense claims', c.claims, 'Waiting for review: amber after ' + g.expAmberD + ' days, red after ' + g.expRedD + ' days. Approved but unpaid: amber after ' + g.payAmberD + ' days, red after ' + g.payRedD + ' days.');
  if (me.role === 'admin') h += boardSection('Security', c.sec.map(function (r) { return Object.assign({}, r, { what: r.n, area: 'Security' }); }), 'Open the Security tab for the fix for each item.');
  return h;
}
A2.view_board = board;

/* ---- rules editor (admin) ---- */
var RULE_FIELDS = [
  ['hwRedPct', 'Hardware: red at or below this % of the reorder level', 'Hardware stock'],
  ['riceAmber', 'Rice: amber at or below this many bags', 'Rice stock'],
  ['orderAmberH', 'Orders: amber after (hours open)', 'Open orders'], ['orderRedH', 'Orders: red after (hours open)', 'Open orders'],
  ['retAmberD', 'Returns: amber after (days)', 'Returns'], ['retRedD', 'Returns: red after (days)', 'Returns'],
  ['expAmberD', 'Claims awaiting review: amber after (days)', 'Expense claims'], ['expRedD', 'Claims awaiting review: red after (days)', 'Expense claims'],
  ['payAmberD', 'Approved claims unpaid: amber after (days)', 'Expense claims'], ['payRedD', 'Approved claims unpaid: red after (days)', 'Expense claims']];
A2.setRule = function (k, v) {
  if (!isAdmin()) { deny('setRule'); return; }
  var n = Math.max(0, Math.round(N(v, RAGD[k]))); if (!(k in RAGD)) return;
  db.rag[k] = n; var g = db.rag;
  if (g.orderRedH < g.orderAmberH) g.orderRedH = g.orderAmberH; if (g.retRedD < g.retAmberD) g.retRedD = g.retAmberD; if (g.expRedD < g.expAmberD) g.expRedD = g.expAmberD; if (g.payRedD < g.payAmberD) g.payRedD = g.payAmberD;
  audit('rule-changed', k + ' = ' + n); toast('Rule saved'); render();
};
A2.resetRules = function () { if (!isAdmin()) { deny('resetRules'); return; } db.rag = Object.assign({}, RAGD); audit('rules-reset', 'Defaults restored'); toast('Defaults restored'); render(); };
function rulesTab() {
  var h = '<h2>Status rules</h2><p class="mut">These thresholds decide when something turns amber or red. A red level is never lower than its amber level. Every change is written to the audit log.</p><div class="card"><div class="ef">';
  RULE_FIELDS.forEach(function (f) { h += '<label>' + esc(f[1]) + '<input type="number" min="0" id="rl_' + f[0] + '" value="' + N(db.rag[f[0]]) + '" onchange="A2.setRule(\'' + f[0] + '\',this.value)"></label>'; });
  h += '</div><p style="margin:14px 0 0"><button class="btn alt" onclick="A2.resetRules()">Restore defaults</button></p></div>';
  h += '<div class="card" style="margin-top:14px"><b>How to read a status</b><div class="ragrow">' + ragBadge(R('green', '')) + '<div>Healthy: no action needed.</div></div><div class="ragrow">' + ragBadge(R('amber', '')) + '<div>Watch: plan to act soon.</div></div><div class="ragrow">' + ragBadge(R('red', '')) + '<div>Act now: the limit has been passed.</div></div><p class="mut" style="margin:8px 0 0">Colour is never the only signal: each status also has its own shape (circle, triangle, square) and a word.</p></div>';
  return h;
}
A2.view_rules = rulesTab;
