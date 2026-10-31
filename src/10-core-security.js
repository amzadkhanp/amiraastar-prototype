/* ================= 10 core helpers and security ================= */
var A2 = window.A2 = {
  f: { addr: '', cn: '', phone: '', pin: '', pay: 'Pay on delivery', coupon: '' },
  q: { s: '', cat: '', sort: '', stock: 0 },
  applied: null, force: 0, last: Date.now(), banner: ''
};
var RAGD = { hwRedPct: 25, riceAmber: 10, orderAmberH: 24, orderRedH: 48, expAmberD: 2, expRedD: 5, payAmberD: 3, payRedD: 7, retAmberD: 2, retRedD: 4 };
var ROLES = ['customer', 'employee', 'admin'];
var IT = 150000, MAXFAIL = 5, LOCKMIN = 5;
var DEFAULT_PW = { admin: 'admin123', employee: 'emp123', customer: 'cust123' };

function N(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }
function clean(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200); }
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
function dayMs(n) { return n * 864e5; }

/* output escaping: also quotes, backtick and slash, so a value can never leave an attribute */
window.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"'`\/]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '/': '&#47;' }[c];
  });
};

/* never trust what comes out of storage: coerce every field that is later written into the page */
function sanitize() {
  var FL = ['placed', 'confirmed', 'packed', 'delivered', 'cancelled'], ST = ['submitted', 'approved', 'rejected', 'paid'];
  db.users = (db.users || []).filter(function (u) { return u && typeof u.u === 'string'; });
  db.users.forEach(function (u) {
    if (ROLES.indexOf(u.role) < 0) u.role = 'customer';
    if (['active', 'pending'].indexOf(u.status) < 0) u.status = 'active';
    u.name = clean(u.name, 60); u.email = clean(u.email, 80); u.phone = clean(u.phone, 15);
  });
  db.orders.forEach(function (o) {
    if (FL.indexOf(o.status) < 0) o.status = 'placed';
    if (['rice', 'hw', 'ap'].indexOf(o.mod) < 0) o.mod = 'rice';
    o.date = clean(o.date, 40); o.id = N(o.id); o.total = N(o.total); o.pay = clean(o.pay, 30);
    o.custName = clean(o.custName, 60); o.addr = clean(o.addr, 300);
    (o.items || []).forEach(function (i) { i.q = N(i.q); i.price = N(i.price); i.name = clean(i.name, 80); i.label = clean(i.label, 40); });
  });
  db.exp.forEach(function (x) {
    if (ST.indexOf(x.status) < 0) x.status = 'submitted';
    if (ECATS.indexOf(x.cat) < 0) x.cat = 'Other';
    if (!isDate(x.date)) x.date = dstr(new Date(N(x.ts, Date.now())));
    if (x.paidOn && !isDate(x.paidOn)) x.paidOn = '';
    x.amount = N(x.amount); x.qty = N(x.qty);
  });
}

function ensure() {
  var S = db.settings = db.settings || {};
  if (S.idleMin === undefined) S.idleMin = 15;
  if (S.demo === undefined) S.demo = 1;
  if (S.fee === undefined) S.fee = 60;
  if (S.free === undefined) S.free = 1500;
  db.rag = Object.assign({}, RAGD, db.rag || {});
  if (!db.coupons) db.coupons = [
    { code: 'WELCOME5', type: 'pct', value: 5, min: 500, max: 150, on: 1, exp: '' },
    { code: 'BULK100', type: 'flat', value: 100, min: 2000, max: 100, on: 1, exp: '' }];
  ['wish', 'lock'].forEach(function (k) { if (!db[k]) db[k] = {}; });
  ['reviews', 'audit'].forEach(function (k) { if (!db[k]) db[k] = []; });
  db.ver = 2;
}
ensure(); sanitize();

/* ---- audit log ---- */
function audit(a, d, bad) {
  db.audit.unshift({ t: Date.now(), u: me ? me.u : '-', a: a, d: clean(d, 160), bad: bad ? 1 : 0 });
  if (db.audit.length > 300) db.audit.length = 300;
  save();
}
A2.audit = audit;

/* ---- password hashing (PBKDF2-SHA256, per-user salt) ---- */
var cs = !!(window.crypto && crypto.subtle), ENC = new TextEncoder();
function bytes(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function b64(a) { var s = ''; new Uint8Array(a).forEach(function (c) { s += String.fromCharCode(c); }); return btoa(s); }
function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
async function derive(pw, salt, it) {
  var k = await crypto.subtle.importKey('raw', ENC.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: it, hash: 'SHA-256' }, k, 256));
}
function same(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function setPw(u, pw) { u.salt = b64(bytes(16)); u.it = IT; u.ph = await derive(pw, u.salt, IT); delete u.p; u.defaultPw = 0; u.pwAt = Date.now(); }
async function checkPw(u, pw) { return !!u.ph && same(await derive(pw, u.salt, u.it || IT), u.ph); }
var COMMON = ['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'admin123', 'letmein123', 'welcome123', 'iloveyou1'];
function pwProblem(pw, uname) {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 128) return 'Use at most 128 characters.';
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return 'Use letters and at least one number.';
  if (uname && pw.toLowerCase().indexOf(String(uname).toLowerCase()) > -1) return 'Do not include your username in the password.';
  if (COMMON.indexOf(pw.toLowerCase()) > -1) return 'That password is too common. Choose another.';
  return '';
}
A2.pwProblem = pwProblem;

/* existing accounts stored with a plain password are converted once, at start */
var ready = (async function () {
  if (!cs) return;
  var ch = 0;
  for (var i = 0; i < db.users.length; i++) {
    var u = db.users[i];
    if (u.p !== undefined) { var dflt = DEFAULT_PW[u.u] === u.p; await setPw(u, u.p); u.defaultPw = dflt ? 1 : 0; ch = 1; }
  }
  if (ch) { audit('passwords-hashed', 'Existing plain passwords converted to PBKDF2 hashes'); save(); }
})();
A2.ready = ready;

/* ---- sign in with throttling ---- */
function lockOf(u) { var L = db.lock[u]; return L && L.until > Date.now() ? L : null; }
function noteFail(u) {
  var L = db.lock[u] || (db.lock[u] = { n: 0, until: 0 });
  L.n++;
  if (L.n >= MAXFAIL) { L.until = Date.now() + LOCKMIN * 60000; L.n = 0; audit('lockout', u + ' locked for ' + LOCKMIN + ' min', 1); }
  Object.keys(db.lock).forEach(function (k) { if (!db.lock[k].until && !db.lock[k].n) delete db.lock[k]; else if (db.lock[k].until && db.lock[k].until < Date.now() - 36e5) delete db.lock[k]; });
  save();
}
window.login = async function () {
  await ready;
  var un = clean($('#u').value, 30).toLowerCase(), pw = $('#p').value, e = $('#err');
  if (!cs) { e.textContent = 'This browser cannot secure passwords here. Open the app over https or on localhost.'; return; }
  var L = lockOf(un);
  if (L) { e.textContent = 'Too many attempts. Try again in ' + Math.max(1, Math.ceil((L.until - Date.now()) / 60000)) + ' minute(s).'; audit('login-blocked', un, 1); return; }
  var u = db.users.filter(function (x) { return x.u === un; })[0], ok = false;
  if (u) ok = await checkPw(u, pw); else await derive(pw, b64(bytes(16)), IT); /* similar timing for unknown names */
  if (!ok) { noteFail(un); me = null; audit('login-failed', un, 1); e.textContent = 'Username or password is incorrect.'; return; }
  if (u.status === 'pending') { e.textContent = 'Your employee account is waiting for admin approval.'; return; }
  delete db.lock[un]; me = u; mod = null; cart = []; A2.applied = null; A2.last = Date.now();
  A2.force = u.mustChange ? 1 : 0; audit('login', 'signed in');
  render();
};
var _fill = window.fill;
window.fill = function (u) { if (db.settings.demo) _fill(u); };

/* ---- accounts: sign-up, invites, admin-created users ---- */
window.createAccount = async function () {
  await ready;
  var n = clean($('#sn').value, 60), em = clean($('#se').value, 80).toLowerCase(), ph = clean($('#sp').value, 15), u = clean($('#su').value, 20).toLowerCase(), p = $('#sw').value, r = $('#sr').value, e = $('#err');
  if (!n || !em || !u || !p) { e.textContent = 'Fill in your name, email, username and password.'; return; }
  if (!validEmail(em)) { e.textContent = 'Enter a valid email address.'; return; }
  if (ph && !/^[6-9]\d{9}$/.test(ph)) { e.textContent = 'Enter a 10 digit mobile number or leave it empty.'; return; }
  if (!validUser(u)) { e.textContent = 'Username: 3 to 20 letters, numbers, dot or underscore.'; return; }
  var pp = pwProblem(p, u); if (pp) { e.textContent = pp; return; }
  if (db.users.some(function (x) { return x.u === u; })) { e.textContent = 'That username is taken. Try another.'; return; }
  if (db.users.some(function (x) { return x.email === em; })) { e.textContent = 'An account with this email already exists.'; return; }
  var emp = r === 'employee', a = { u: u, role: emp ? 'employee' : 'customer', name: n, email: em, phone: ph, status: emp ? 'pending' : 'active' };
  await setPw(a, p); db.users.push(a); save(); signup = false;
  if (emp) { audit('signup', u + ' requested employee access'); render(); toast('Request sent. An admin must approve your employee account before you can sign in.', 4500); return; }
  me = a; mod = null; cart = []; A2.last = Date.now(); audit('signup', u + ' created a customer account'); toast('Account created'); render();
};
/* an invite only works if the admin created it in this app: the link alone can never grant a role */
window.readInvite = function (x) {
  var iv = db.invites.filter(function (i) { return i.code === String(x).trim().toUpperCase(); })[0];
  if (!iv) { try { var d = b64d(x); iv = d && d.c ? db.invites.filter(function (i) { return i.code === String(d.c).toUpperCase(); })[0] : null; } catch (er) { iv = null; } }
  if (!iv || db.spent.indexOf(iv.code) > -1 || !validEmail(iv.email) || ROLES.indexOf(iv.role) < 0) return null;
  if (db.users.some(function (u) { return u.email === iv.email; })) return null;
  return iv;
};
window.acceptInvite = async function () {
  await ready;
  var n = clean($('#in').value, 60), u = clean($('#iu').value, 20).toLowerCase(), p = $('#ip').value, e = $('#err'), iv = readInvite($('#ic').value.trim());
  if (!iv) { e.textContent = 'That invite is not valid or has already been used. Ask your admin for a new invite.'; return; }
  if (!n || !validUser(u)) { e.textContent = 'Enter your name and a username (3 to 20 letters or numbers).'; return; }
  var pp = pwProblem(p, u); if (pp) { e.textContent = pp; return; }
  if (db.users.some(function (x) { return x.u === u; })) { e.textContent = 'That username is taken. Try another.'; return; }
  var a = { u: u, role: iv.role, name: n, email: iv.email, status: 'active' };
  await setPw(a, p); db.users.push(a); db.spent.push(iv.code); db.invites = db.invites.filter(function (x) { return x.code !== iv.code; }); save();
  me = a; mod = null; cart = []; invMode = false; invPre = ''; A2.last = Date.now(); audit('invite-accepted', u + ' joined as ' + a.role);
  try { history.replaceState(null, '', location.pathname + location.search); } catch (x) { }
  toast('Welcome, ' + n.split(' ')[0]); render();
};
window.sendInvite = function () {
  var n = clean($('#an').value, 60), em = clean($('#ae').value, 80).toLowerCase(), e = $('#err');
  if (!validEmail(em)) { e.textContent = 'Enter the email address to invite.'; return; }
  if (db.users.some(function (x) { return x.email === em; })) { e.textContent = 'An account with this email already exists.'; return; }
  var role = ROLES.indexOf($('#ar').value) > -1 ? $('#ar').value : 'customer';
  db.invites = db.invites.filter(function (x) { return x.email !== em; });
  var code = Array.from(bytes(6)).map(function (b) { return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]; }).join('');
  db.invites.unshift({ code: code, email: em, name: n, role: role, date: new Date().toLocaleDateString('en-IN') }); save();
  audit('invite-created', em + ' as ' + role); toast('Invite created. Choose Email invite to send it.', 3500); render();
};
window.addUser = async function () {
  await ready;
  var n = clean($('#an').value, 60), em = clean($('#ae').value, 80).toLowerCase(), u = clean($('#au').value, 20).toLowerCase(), p = $('#ap').value, e = $('#err');
  if (!n || !validUser(u)) { e.textContent = 'To create now, enter a name, a username (3 to 20 letters or numbers) and a password.'; return; }
  var pp = pwProblem(p, u); if (pp) { e.textContent = pp; return; }
  if (em && !validEmail(em)) { e.textContent = 'Enter a valid email address or leave it empty.'; return; }
  if (db.users.some(function (x) { return x.u === u; })) { e.textContent = 'That username is taken.'; return; }
  var role = ROLES.indexOf($('#ar').value) > -1 ? $('#ar').value : 'customer', a = { u: u, role: role, name: n, email: em, status: 'active', mustChange: 1 };
  await setPw(a, p); db.users.push(a); save(); audit('user-created', u + ' as ' + role); toast('Account created. They must change the password at first sign-in.', 4000); render();
};

/* ---- session: idle sign-out, clean logout ---- */
var _logout = window.logout;
window.logout = function () { if (me) audit('logout', 'signed out'); A2.applied = null; A2.force = 0; A2.f = { addr: '', cn: '', phone: '', pin: '', pay: 'Pay on delivery', coupon: '' }; cart = []; _logout(); };
['click', 'keydown', 'touchstart', 'input'].forEach(function (ev) { document.addEventListener(ev, function () { A2.last = Date.now(); }, true); });
setInterval(function () {
  if (me && Date.now() - A2.last > Math.max(1, N(db.settings.idleMin, 15)) * 60000) {
    audit('session-timeout', 'signed out after ' + db.settings.idleMin + ' min idle'); window.logout(); toast('You were signed out after ' + db.settings.idleMin + ' minutes without activity.', 5000);
  }
}, 5000);

/* ---- role checks inside the actions themselves, not only in the menus ---- */
function deny(n) { audit('denied', (me ? me.role : 'nobody') + ' tried ' + n, 1); toast('You do not have permission to do that.', 3000); }
function guard(name, ok, log) {
  var f = window[name];
  if (typeof f !== 'function') return;
  window[name] = function () {
    var a = arguments;
    if (!me || !ok.apply(null, a)) { deny(name); return; }
    if (log) audit(name, log.apply(null, a));
    return f.apply(this, a);
  };
}
var isAdmin = function () { return !!me && me.role === 'admin'; }, isStaff = function () { return !!me && me.role !== 'customer'; };
['addRice', 'addHw', 'addAgency', 'togAgency', 'setAgency', 'setSet', 'approve', 'setRole', 'delUser', 'revoke', 'decide', 'markPaid', 'submitAdminExp', 'tog'].forEach(function (n) { guard(n, isAdmin); });
['setRole', 'delUser', 'approve', 'tog', 'markPaid', 'decide', 'addAgency', 'revoke'].forEach(function (n) {
  guard(n, isAdmin, function () { return Array.prototype.join.call(arguments, ' '); });
});
['setN', 'setLab', 'labPay', 'setCard', 'toggleEdit', 'buyCovers', 'submitExp', 'addMaint', 'delMaint', 'addMachine'].forEach(function (n) { guard(n, isStaff); });
guard('setV', function (id, w, f) { return isStaff() && (f !== 'p' || isAdmin()); }, function (id, w, f, v) { return f === 'p' ? 'price of rice ' + id + ' / ' + w + ' kg set to ' + v : ''; });
guard('setH', function (id, f) { return isStaff() && (f === 's' || isAdmin()); }, function (id, f, v) { return f !== 's' ? 'hardware ' + id + ' ' + f + ' set to ' + v : ''; });
guard('setStatus', function (id, s) {
  var o = ordr(id); if (!o) return false;
  if (isStaff()) return FLOW.indexOf(s) > -1;
  return o.cust === me.u && s === 'cancelled' && o.status === 'placed';
}, function (id, s) { return 'order ' + id + ' set to ' + s; });
var _go = window.go;
window.go = function (x) { if (tabsFor().indexOf(x) < 0) { deny('open ' + x); return; } _go(x); };

/* ---- uploads: images only, limited size (the original then re-encodes the picture) ---- */
var _readPod = window.readPod;
window.readPod = function (inp, t) {
  var f = inp.files && inp.files[0];
  if (f && (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 6e6)) { toast('Upload a JPG, PNG or WebP photo under 6 MB.', 3500); inp.value = ''; return; }
  _readPod(inp, t);
};

/* one message at a time, so an old toast never sits under a new one */
var _toast = window.toast;
window.toast = function (m, ms) { document.querySelectorAll('.toast').forEach(function (e) { e.remove(); }); _toast(m, ms); };
