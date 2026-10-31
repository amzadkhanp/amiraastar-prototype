/* ================= 100 server-backed mode =================
   The static GitHub Pages preview stays in demo mode. server.cjs adds this marker
   only when serving the app with SQLite-backed accounts and records.
*/
(function () {
  if (!document.querySelector('meta[name="amira-mode"][content="live"]')) return;

  var booted = false, revision = 0, queueEpoch = 0, writeQueue = Promise.resolve(), baseRender = window.render;
  window.AMIRA_LIVE = true;
  window.load = function () { return null; };
  window.ready = Promise.resolve();
  if (window.A2) window.A2.ready = window.ready;

  function message(text) {
    var e = document.getElementById('err');
    if (e) e.textContent = text;
    else if (typeof toast === 'function') toast(text, 4500);
  }
  function api(path, method, data) {
    return fetch(path, {
      method: method || 'GET',
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      cache: 'no-store'
    }).then(async function (response) {
      var payload = {};
      try { payload = await response.json(); } catch (e) { /* handled below */ }
      if (!response.ok) throw Object.assign(new Error(payload.error || 'The server could not complete that request.'), { status: response.status, payload: payload });
      return payload;
    });
  }
  function install(payload) {
    if (!payload || !payload.state) throw new Error('The server returned incomplete app data.');
    db = payload.state;
    db.settings = db.settings || {};
    db.settings.demo = 0;
    db.demoUsers = 0;
    me = payload.user || null;
    revision = Number(payload.revision) || 1;
    ready = Promise.resolve();
    A2.ready = ready;
    ensure();
    sanitize();
    booted = true;
  }
  function profilePayload() {
    return me ? { name: me.name, phone: me.phone, addr: me.addr, pin: me.pin } : null;
  }
  function applyIdMap(rows, map) {
    if (!Array.isArray(rows) || !Array.isArray(map)) return;
    map.forEach(function (item) {
      if (!item || !item.collection) return;
      var list = db[item.collection];
      if (!Array.isArray(list)) return;
      var row = list.filter(function (x) { return Number(x.id) === Number(item.from); })[0];
      if (row) row.id = Number(item.to);
    });
  }
  function refreshAfterConflict(payload) {
    install(payload);
    render();
    message('Someone else changed the data. The latest version is loaded; please repeat your change if needed.');
  }

  window.save = function () {
    if (!booted || !me) return true;
    var snapshot;
    try { snapshot = JSON.parse(JSON.stringify(db)); }
    catch (e) { message('Could not prepare the data to save.'); return false; }
    var profile = profilePayload();
    var thisEpoch = queueEpoch;
    writeQueue = writeQueue.then(function () {
      if (thisEpoch !== queueEpoch) return null;
      return api('/api/state', 'PUT', { revision: revision, state: snapshot, profile: profile });
    }).then(function (payload) {
      if (!payload) return;
      revision = Number(payload.revision) || revision;
      applyIdMap(db.orders, payload.idMap);
      applyIdMap(db.exp, payload.idMap);
      applyIdMap(db.maint, payload.idMap);
    }).catch(function (error) {
      if (error.payload && error.payload.code === 'stale_state') {
        queueEpoch += 1;
        refreshAfterConflict(error.payload);
        return;
      }
      if (error.status === 409) {
        queueEpoch += 1;
        api('/api/state').then(function (latest) {
          install(latest); render(); message(error.message);
        }).catch(function () { message(error.message); });
        return;
      }
      if (error.status === 401) {
        me = null;
        api('/api/bootstrap').then(function (payload) { install(payload); render(); });
      }
      message(error.message || 'Could not save. Check that AmiraASTAR is still running.');
    });
    return true;
  };

  window.render = function () {
    if (!booted) return;
    baseRender();
    var demo = document.getElementById('demoNote');
    if (demo) demo.remove();
    var header = document.querySelector('header');
    if (me && header && !header.querySelector('.live-storage')) {
      var label = document.createElement('span');
      label.className = 'live-storage';
      label.textContent = 'Saved on this laptop';
      label.style.cssText = 'font-size:12px;opacity:.8';
      header.insertBefore(label, header.lastElementChild);
    }
    if (!me) {
      var login = document.querySelector('.login');
      if (login && !document.getElementById('liveNote')) {
        var note = document.createElement('p');
        note.className = 'banner';
        note.id = 'liveNote';
        note.setAttribute('role', 'note');
        note.textContent = 'Live mode. Accounts and business records are saved in the SQLite database on this laptop.';
        login.insertBefore(note, login.firstChild.nextSibling);
      }
    }
  };

  window.login = async function () {
    var username = clean(document.getElementById('u').value, 30).toLowerCase();
    var password = document.getElementById('p').value;
    try {
      var payload = await api('/api/login', 'POST', { username: username, password: password });
      install(payload); mod = null; cart = []; A2.applied = null; A2.f = { addr: '', cn: '', phone: '', pin: '', pay: 'Pay on delivery', coupon: '' }; A2.pre = 0; A2.force = me.mustChange ? 1 : 0; A2.last = Date.now();
      render();
    } catch (error) {
      var msg = error.payload && error.payload.code === 'pending' ? error.message : error.message;
      message(msg || 'Username or password is incorrect.');
    }
  };

  window.createAccount = async function () {
    var fields = {
      name: clean(document.getElementById('sn').value, 60),
      email: clean(document.getElementById('se').value, 80).toLowerCase(),
      phone: clean(document.getElementById('sp').value, 15),
      username: clean(document.getElementById('su').value, 20).toLowerCase(),
      password: document.getElementById('sw').value,
      role: document.getElementById('sr').value
    };
    if (!fields.name || !fields.email || !fields.username || !fields.password) return message('Fill in your name, email, username and password.');
    if (!validEmail(fields.email)) return message('Enter a valid email address.');
    if (!validUser(fields.username)) return message('Username: 3 to 20 letters, numbers, dot or underscore.');
    var problem = pwProblem(fields.password, fields.username);
    if (problem) return message(problem);
    try {
      var payload = await api('/api/signup', 'POST', fields);
      signup = false;
      if (payload.pending) {
        install(payload);
        render();
        toast('Request sent. An admin must approve your employee account before you can sign in.', 4500);
        return;
      }
      install(payload); mod = null; cart = []; A2.f = { addr: '', cn: '', phone: '', pin: '', pay: 'Pay on delivery', coupon: '' }; A2.pre = 0; render(); toast('Account created');
    } catch (error) { message(error.message); }
  };

  window.acceptInvite = async function () {
    var code = clean(document.getElementById('ic').value, 160);
    var username = clean(document.getElementById('iu').value, 20).toLowerCase();
    var name = clean(document.getElementById('in').value, 60);
    var password = document.getElementById('ip').value;
    try {
      var payload = await api('/api/invite/accept', 'POST', { code: code, username: username, name: name, password: password });
      install(payload); invMode = false; invPre = ''; mod = null; cart = [];
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
      render(); toast('Welcome, ' + name.split(' ')[0]);
    } catch (error) { message(error.message); }
  };

  window.addUser = async function () {
    if (!me || me.role !== 'admin') return message('Admin access is required.');
    var fields = {
      name: clean(document.getElementById('an').value, 60),
      email: clean(document.getElementById('ae').value, 80).toLowerCase(),
      username: clean(document.getElementById('au').value, 20).toLowerCase(),
      password: document.getElementById('ap').value,
      role: document.getElementById('ar').value
    };
    var problem = pwProblem(fields.password, fields.username);
    if (problem) return message(problem);
    try {
      var payload = await api('/api/admin/users', 'POST', fields);
      install(payload); render(); toast('Account created. They must change the password at first sign-in.', 4000);
    } catch (error) { message(error.message); }
  };

  window.logout = async function () {
    try { await api('/api/logout', 'POST', {}); } catch (e) { /* clear the local view even if the server restarted */ }
    cart = []; me = null; mod = null; A2.applied = null; A2.force = 0;
    A2.f = { addr: '', cn: '', phone: '', pin: '', pay: 'Pay on delivery', coupon: '' }; A2.pre = 0;
    try { install(await api('/api/bootstrap')); } catch (e) { booted = false; }
    render();
  };

  A2.changePw = async function () {
    var current = document.getElementById('pw0').value;
    var next = document.getElementById('pw1').value;
    var repeat = document.getElementById('pw2').value;
    var err = document.getElementById('pwerr');
    if (!validPassword(next) || next.toLowerCase().includes(me.u)) { err.textContent = 'Use at least 10 characters with a letter and a number. Do not include your username.'; return; }
    if (next !== repeat) { err.textContent = 'The two new passwords do not match.'; return; }
    if (next === current) { err.textContent = 'Choose a password you have not used before.'; return; }
    try {
      var payload = await api('/api/password', 'POST', { current: current, password: next });
      install(payload); A2.force = 0; render(); toast('Password changed');
    } catch (error) { err.textContent = error.message; }
  };

  var saveProfile = A2.saveProfile;
  A2.saveProfile = function () {
    saveProfile.apply(this, arguments);
    if (me && me.role === 'admin') {
      var own = db.users.filter(function (u) { return u.u === me.u; })[0];
      if (own) { own.name = me.name; own.phone = me.phone; own.addr = me.addr; own.pin = me.pin; }
      save();
    }
  };

  var baseSetDemo = A2.setDemo;
  A2.setDemo = function () { if (me && me.role === 'admin') { db.settings.demo = 0; save(); toast('Demo accounts are disabled in live mode.'); render(); } else baseSetDemo.apply(this, arguments); };
  if (window.FIX) {
    FIX['Default passwords'] = 'No published demo accounts are enabled. Each account uses a server-side password hash.';
    FIX['Demo mode'] = 'Demo accounts are disabled in live mode.';
    FIX['Where data lives'] = 'Accounts and business records are stored in the SQLite database on this laptop.';
  }
  var prototypeSecChecks = window.secChecks;
  window.secChecks = function () {
    var checks = prototypeSecChecks();
    checks.forEach(function (item) {
      if (item.n === 'Password storage') {
        item.lv = 'green'; item.why = 'Passwords are checked by the server and stored as scrypt hashes.';
      }
      if (item.n === 'Where data lives') {
        item.lv = 'green'; item.why = 'Accounts and business records are stored in this laptop’s SQLite database.';
      }
    });
    return checks;
  };

  window.render = window.render; // Keep the gated renderer installed before startup.
  api('/api/state').then(function (payload) { install(payload); render(); }).catch(function () {
    api('/api/bootstrap').then(function (payload) { install(payload); render(); }).catch(function () {
      var app = document.getElementById('app');
      app.innerHTML = '<div class="wrap login"><h1>AmiraASTAR</h1><div class="banner" role="alert">Could not reach the AmiraASTAR local server. Keep the server window open and reload this page.</div></div>';
    });
  });
})();
