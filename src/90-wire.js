/* ================= 90 security tab, navigation and start-up ================= */
var FIX = {
  'Password storage': 'Passwords are converted to hashes at start. Nothing to do.',
  'Default passwords': 'Open Account and change the password of each demo account (sign in as that user), or remove the demo users in Users.',
  'Demo mode': 'Switch demo mode off below before sharing the app: it hides the tap-to-fill buttons.',
  'Idle sign-out': 'Set the idle sign-out to 15 minutes or less below.',
  'Failed sign-ins and denied actions': 'Review the audit log below for the names and actions involved.',
  'Lockouts': 'Unlock a name below once you are sure it is the real person.',
  'Pending approvals': 'Approve or decline the requests in Users.',
  'Browser protections': 'Keep the content security policy tag in the page head.',
  'Where data lives': 'Move accounts, orders and checks behind a server (Step 2 of the plan).'
};
A2.auditBad = 0;
A2.setDemo = function (on) { if (!isAdmin()) { deny('setDemo'); return; } db.settings.demo = on ? 1 : 0; audit('demo-mode', on ? 'on' : 'off'); save(); toast('Demo mode ' + (on ? 'on' : 'off')); render(); };
A2.setIdle = function (v) { if (!isAdmin()) { deny('setIdle'); return; } var m = Math.min(60, Math.max(1, Math.round(N(v, 15)))); db.settings.idleMin = m; audit('idle-minutes', String(m)); save(); toast('Saved'); render(); };
A2.unlock = function (u) { if (!isAdmin()) { deny('unlock'); return; } delete db.lock[u]; audit('unlock', u); save(); render(); };
A2.reqChange = function (u) { if (!isAdmin()) { deny('reqChange'); return; } var x = db.users.filter(function (y) { return y.u === u; })[0]; if (!x) return; x.mustChange = 1; audit('password-change-required', u); save(); toast(x.name + ' must change their password at next sign-in', 3500); render(); };
A2.toggleBad = function () { A2.auditBad = A2.auditBad ? 0 : 1; render(); };
function secTab() {
  var cs2 = secChecks(), w = worst(cs2), n = count(cs2), h = '<h2>Security</h2><p class="mut">Health of this app\'s protections, the sign-in controls and the audit trail. Red means act now.</p>';
  h += '<div class="card ragtile ' + LV[w].k + '" style="margin-bottom:14px"><div class="ink mut">Overall</div><div style="margin:6px 0">' + ragBadge({ lv: w, why: LV[w].w }) + '</div><div class="ink mut">' + n.red + ' red · ' + n.amber + ' amber · ' + n.green + ' green</div></div>';
  h += '<div class="card" style="margin-bottom:14px">';
  cs2.forEach(function (r) { h += '<div class="ragrow">' + ragBadge(r) + '<div><div><b>' + esc(r.n) + '</b></div><div>' + esc(r.why) + '</div>' + (r.lv !== 'green' ? '<div class="mut">Fix: ' + esc(FIX[r.n] || '') + '</div>' : '') + '</div></div>'; });
  h += '</div><div class="card" style="margin-bottom:14px"><b>Controls</b><div class="row" style="margin-top:8px;justify-content:flex-start;flex-wrap:wrap"><button class="btn alt" aria-pressed="' + (db.settings.demo ? 'true' : 'false') + '" onclick="A2.setDemo(' + (db.settings.demo ? 0 : 1) + ')">Demo mode: ' + (db.settings.demo ? 'On (turn off)' : 'Off (turn on)') + '</button><label class="mut" style="display:flex;gap:6px;align-items:center">Idle sign-out (minutes)<input type="number" min="1" max="60" style="width:80px" value="' + N(db.settings.idleMin, 15) + '" onchange="A2.setIdle(this.value)"></label></div></div>';
  var locked = Object.keys(db.lock).filter(function (k) { return db.lock[k].until > Date.now(); });
  if (locked.length) { h += '<div class="card" style="margin-bottom:14px"><b>Locked names</b>'; locked.forEach(function (k) { h += '<div class="row" style="margin-top:6px"><span class="mono">' + esc(k) + '</span><button class="btn alt" onclick="A2.unlock(\'' + esc(k) + '\')">Unlock</button></div>'; }); h += '</div>'; }
  h += '<div class="card tw" style="margin-bottom:14px"><b>Accounts</b><table style="margin-top:8px"><tr><th>User</th><th>Role</th><th>Password</th><th></th></tr>';
  db.users.forEach(function (u) { h += '<tr><td>' + esc(u.u) + '</td><td>' + esc(u.role) + '</td><td>' + (u.defaultPw ? '<span class="rag rag-red"><i aria-hidden="true">■</i> Default</span>' : u.mustChange ? '<span class="rag rag-amber"><i aria-hidden="true">▲</i> Change required</span>' : '<span class="rag rag-green"><i aria-hidden="true">●</i> Own password</span>') + '</td><td>' + (u.u === me.u ? '' : '<button class="btn alt" onclick="A2.reqChange(\'' + esc(u.u) + '\')">Require change</button>') + '</td></tr>'; });
  h += '</table></div><div class="card tw"><div class="row"><b>Audit log</b><button class="btn alt" aria-pressed="' + (A2.auditBad ? 'true' : 'false') + '" onclick="A2.toggleBad()">' + (A2.auditBad ? 'Showing failures only' : 'Show failures only') + '</button></div>';
  var rows = db.audit.filter(function (a) { return !A2.auditBad || a.bad; }).slice(0, 100);
  if (!rows.length) return h + '<p class="mut" style="margin:8px 0 0">Nothing recorded yet.</p></div>';
  h += '<table style="margin-top:8px"><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr>';
  rows.forEach(function (a) { h += '<tr><td class="mono">' + new Date(a.t).toLocaleString('en-IN') + '</td><td>' + esc(a.u) + '</td><td>' + (a.bad ? '<span class="rag rag-red"><i aria-hidden="true">■</i> ' + esc(a.a) + '</span>' : esc(a.a)) + '</td><td>' + esc(a.d) + '</td></tr>'; });
  return h + '</table></div>';
}
A2.view_security = secTab;

/* ---- navigation ---- */
var _tabsFor = window.tabsFor;
window.tabsFor = function () {
  if (A2.force || mod === 'acct') return ['Account'];
  if (mod === 'ap') return A2.apTabs();
  var t = _tabsFor(); if (mod === 'mt') return t;
  var r = me.role;
  if (r === 'customer') { t.splice(t.indexOf('My orders'), 0, 'Saved'); t.push('Account'); }
  else if (r === 'employee') t.push('Status board', 'Account');
  else t.push('Offers', 'Status board', 'Status rules', 'Security', 'Account');
  return t;
};
var VIEWS = { 'Parts': A2.view_parts, 'Parts stock': A2.view_partsstock, 'Parts report': A2.view_partsreport, 'Saved': savedTab, 'Account': accountTab, 'Offers': offersTab, 'Status board': board, 'Status rules': rulesTab, 'Security': secTab };
var _view = window.view;
window.view = function () { if (VIEWS[tab] && tabsFor().indexOf(tab) > -1) return VIEWS[tab](); return _view(); };
var _home = window.homeHtml;
window.homeHtml = function () {
  var h = _home(), card = A2.apCard();
  if (card) h = h.replace(/<\/div>$/, card + '</div>');
  return (staff() ? glanceHtml() : '') + h;
};
A2.openAcct = function () { mod = 'acct'; tab = 'Account'; render(); };
var _open = window.open_;
window.open_ = function (m) { A2.q = { s: '', cat: '', sort: '', stock: 0 }; _open(m); };

/* put the red / amber / green status on the screens that already existed */
function decorateRag() {
  document.querySelectorAll('table tr').forEach(function (tr) {
    var h = tr.querySelector('input[onchange^="setH("]');
    if (h) {
      var id = +h.getAttribute('onchange').match(/setH\((\d+)/)[1], x = db.hw.filter(function (y) { return y.id === id; })[0], old = tr.querySelector('.badge.low, .badge.delivered');
      if (x && old) old.outerHTML = ragBadge(ragHw(x), x.s < 1 ? 'Out of stock' : x.s <= x.min ? 'Reorder' : 'OK');
    }
    tr.querySelectorAll('input[onchange^="setV("]').forEach(function (i) {
      var m = i.getAttribute('onchange').match(/setV\((\d+),(\d+),'s'/);
      if (!m) return;
      var r = db.rice.filter(function (y) { return y.id === +m[1]; })[0];
      if (r && r.v[m[2]]) i.insertAdjacentHTML('afterend', '<div style="margin-top:4px">' + ragBadge(ragRice(r.v[m[2]])) + '</div>');
    });
  });
  document.querySelectorAll('.card').forEach(function (c) {
    var b = c.querySelector('button[onclick^="decide("], button[onclick^="markPaid("]'), st = c.querySelector(':scope > .row .badge.submitted, :scope > .row .badge.approved');
    if (!b || !st) return;
    var x = db.exp.filter(function (y) { return y.id === +b.getAttribute('onclick').match(/\((\d+)/)[1]; })[0], r = x && ragClaim(x);
    if (r) st.insertAdjacentHTML('beforebegin', ragBadge(r) + ' ');
  });
}
var _render = window.render;
window.render = function () {
  if (me && A2.force && mod !== 'acct') { mod = 'acct'; tab = 'Account'; }
  if (me && mod === 'acct') tab = 'Account';
  _render();
  if (me) decorateRag();
  var hd = document.querySelector('header');
  if (me && hd) {
    var out = hd.querySelector('button[onclick="logout()"]');
    if (A2.force) { var all = hd.querySelector('button[onclick="home()"]'); if (all) all.remove(); }
    else if (out && mod !== 'acct') { var b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Account'; b.setAttribute('onclick', 'A2.openAcct()'); hd.insertBefore(b, out); }
  }
  if (!me && !document.getElementById('demoNote')) {
    var lc = document.querySelector('.login .card');
    if (lc) lc.insertAdjacentHTML('beforebegin', '<p class="banner" id="demoNote" role="note"><b>Demo only.</b> Everything you enter stays in this browser on your device and is not sent anywhere. Please do not enter real personal information.</p>');
  }
  if (!me && !db.settings.demo) {
    var dm = document.querySelector('.demo'); if (dm) { var p = dm.previousElementSibling; if (p && /Demo accounts/.test(p.textContent)) p.remove(); dm.remove(); }
  }
};
/* the original start-up call follows this file */
