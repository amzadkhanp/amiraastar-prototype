/* ================= 30 ecommerce basics ================= */
var KEYRE = /^(rice|hw|ap):\d+$/;
function pkey(m, id) { return m + ':' + id; }
function modal(html, onclose) {
  var d = document.createElement('div'); d.className = 'modal'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = '<div class="mbox">' + html + '</div>';
  d.onclick = function (e) { if (e.target === d || (e.target.getAttribute && e.target.getAttribute('data-close') !== null)) { d.remove(); if (onclose) onclose(); } };
  document.body.appendChild(d); var b = d.querySelector('[data-focus]'); if (b) b.focus(); return d;
}
function closeModal() { var m = document.querySelector('.modal'); if (m) m.remove(); }

/* ---- reviews and ratings ---- */
function ratingOf(k) {
  var l = db.reviews.filter(function (r) { return r.k === k && !r.hidden; });
  var avg = l.length ? l.reduce(function (a, r) { return a + r.stars; }, 0) / l.length : 0;
  return { n: l.length, avg: avg, list: l };
}
function starsHtml(avg) { var f = Math.round(avg); return '<span class="stars" aria-hidden="true">' + '★★★★★'.slice(0, f) + '☆☆☆☆☆'.slice(0, 5 - f) + '</span>'; }
function ratingLine(k) {
  var r = ratingOf(k);
  return '<div class="mut" style="margin-top:4px">' + (r.n ? starsHtml(r.avg) + ' <span class="sr">' + r.avg.toFixed(1) + ' out of 5</span> (' + r.n + ')' : 'No reviews yet') + ' · <button class="linkbtn" onclick="A2.detail(\'' + k + '\')">Details and reviews</button></div>';
}
function canReview(k) {
  return !!me && me.role === 'customer' && db.orders.some(function (o) { return o.cust === me.u && o.status === 'delivered' && o.items.some(function (i) { return pkey(i.m, i.id) === k; }); });
}
function prodName(k) { var p = k.split(':'), x = find(p[0], +p[1]); return x ? x.name : 'Product'; }
A2.detail = function (k) {
  if (!KEYRE.test(k)) return;
  var p = k.split(':'), x = find(p[0], +p[1]); if (!x) return;
  var r = ratingOf(k), h = '<div class="inv"><h3>' + esc(x.name) + '</h3><p class="mut" style="margin:0 0 8px">' + esc(p[0] === 'rice' ? x.note : x.cat + ' · per ' + x.unit) + '</p>';
  h += '<div>' + (r.n ? starsHtml(r.avg) + ' ' + r.avg.toFixed(1) + ' out of 5 from ' + r.n + ' review(s)' : 'No reviews yet') + '</div>';
  r.list.slice(0, 20).forEach(function (v) { h += '<div class="stk"><div>' + starsHtml(v.stars) + ' <b>' + esc(v.name) + '</b> <span class="mut">' + new Date(v.ts).toLocaleDateString('en-IN') + '</span></div><div>' + esc(v.text) + '</div></div>'; });
  h += '<div class="row" style="margin-top:12px;justify-content:flex-start">' + (canReview(k) ? '<button class="btn" onclick="A2.rateDlg(\'' + k + '\')">Rate this product</button>' : '') + '<button class="btn alt" data-close data-focus>Close</button></div></div>';
  modal(h);
};
A2.rateDlg = function (k) {
  if (!KEYRE.test(k) || !canReview(k)) { toast('You can review items from your delivered orders.', 3500); return; }
  A2.rate = { k: k, s: 0 }; closeModal();
  var h = '<div class="inv"><h3>Rate ' + esc(prodName(k)) + '</h3><div class="starpick" role="radiogroup" aria-label="Stars">';
  for (var i = 1; i <= 5; i++) h += '<button role="radio" aria-checked="false" aria-label="' + i + ' star' + (i > 1 ? 's' : '') + '" onclick="A2.pickStar(' + i + ')">★</button>';
  h += '</div><label class="mut">Your review (optional, up to 300 characters)<textarea id="rv" rows="3" maxlength="300" style="width:100%"></textarea></label><p class="err" id="rverr"></p><div class="row" style="justify-content:flex-start"><button class="btn" onclick="A2.rateSave()">Submit review</button><button class="btn alt" data-close>Cancel</button></div></div>';
  modal(h);
};
A2.pickStar = function (n) { A2.rate.s = n; document.querySelectorAll('.starpick button').forEach(function (b, i) { b.classList.toggle('on', i < n); b.setAttribute('aria-checked', i === n - 1 ? 'true' : 'false'); }); };
A2.rateSave = function () {
  var r = A2.rate; if (!r || !KEYRE.test(r.k) || !canReview(r.k)) return;
  if (!(r.s >= 1 && r.s <= 5)) { document.getElementById('rverr').textContent = 'Choose 1 to 5 stars.'; return; }
  var text = clean(document.getElementById('rv').value, 300), ex = db.reviews.filter(function (v) { return v.k === r.k && v.u === me.u; })[0];
  if (ex) { ex.stars = r.s; ex.text = text; ex.ts = Date.now(); ex.hidden = 0; } else db.reviews.unshift({ k: r.k, u: me.u, name: me.name.split(' ')[0], stars: r.s, text: text, ts: Date.now(), hidden: 0 });
  audit('review', r.k + ' ' + r.s + ' stars'); closeModal(); toast('Thanks for your review'); render();
};

/* ---- saved items ---- */
function wishOf() { return me ? (db.wish[me.u] || (db.wish[me.u] = [])) : []; }
A2.heart = function (k) {
  if (!me || !KEYRE.test(k)) return;
  var l = wishOf(), i = l.indexOf(k); if (i > -1) l.splice(i, 1); else if (l.length < 100) l.push(k);
  save(); render();
};
function heart(k) { var on = wishOf().indexOf(k) > -1; return '<button class="heart' + (on ? ' on' : '') + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove from saved items' : 'Save for later') + '" onclick="A2.heart(\'' + k + '\')">' + (on ? '♥' : '♡') + '</button>'; }

/* ---- search, filter, sort ---- */
A2.search = function (v) { A2.q.s = clean(v, 40); var pos = String(v).length; render(); var e = document.getElementById('q'); if (e) { e.focus(); try { e.setSelectionRange(pos, pos); } catch (x) { } } };
A2.sort = function (v) { A2.q.sort = ['', 'plow', 'phigh', 'name'].indexOf(v) > -1 ? v : ''; render(); };
A2.instock = function (b) { A2.q.stock = b ? 1 : 0; render(); };
A2.cat = function (v) { A2.q.cat = CATS.indexOf(v) > -1 ? v : ''; render(); };
A2.clear = function () { A2.q = { s: '', cat: '', sort: '', stock: 0 }; render(); };
function toolbar(hw) {
  var q = A2.q;
  return '<div class="toolbar" role="search"><label class="grow">Search<input type="search" id="q" value="' + esc(q.s) + '" placeholder="' + (hw ? 'Search cement, pipes, wire' : 'Search rice') + '" oninput="A2.search(this.value)" maxlength="40"></label>' +
    (hw ? '<label>Category<select onchange="A2.cat(this.value)"><option value="">All</option>' + CATS.map(function (c) { return '<option' + (c === q.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' : '') +
    '<label>Sort by<select onchange="A2.sort(this.value)">' + [['', 'Featured'], ['plow', 'Price: low to high'], ['phigh', 'Price: high to low'], ['name', 'Name']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === q.sort ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
    '<label style="flex-direction:row;align-items:center;gap:6px;padding-bottom:9px"><input type="checkbox"' + (q.stock ? ' checked' : '') + ' onchange="A2.instock(this.checked)"> In stock only</label>' +
    ((q.s || q.cat || q.sort || q.stock) ? '<button class="btn alt" onclick="A2.clear()">Clear</button>' : '') + '</div>';
}
function ordering(list, priceOf, sort) {
  var s = sort === undefined ? A2.q.sort : sort; if (!s) return list;
  return list.slice().sort(function (a, b) { return s === 'name' ? a.name.localeCompare(b.name) : s === 'plow' ? priceOf(a) - priceOf(b) : priceOf(b) - priceOf(a); });
}
function matches(name, extra) { var s = A2.q.s.toLowerCase(); return !s || (name + ' ' + (extra || '')).toLowerCase().indexOf(s) > -1; }
function noMatch() { return '<div class="card" style="grid-column:1/-1"><b>Nothing matches</b><p class="mut" style="margin:4px 0 0">Try a different word, or clear the filters.</p></div>'; }

/* ---- product cards ---- */
function riceCard(r) {
  var w = sel[r.id]; if (!w || r.v[w].s < 1) { w = W.filter(function (x) { return r.v[x].s > 0; })[0] || 10; sel[r.id] = w; }
  var v = r.v[w], k = pkey('rice', r.id), g = ragRice(v), word = v.s < 1 ? 'Out of stock' : v.s <= G().riceAmber ? 'Only ' + v.s + ' left' : 'In stock';
  var h = '<div class="card"><div class="row"><h3>' + esc(r.name) + '</h3>' + (me ? heart(k) : '') + '</div><div class="mut">' + esc(r.note) + '</div>' + ratingLine(k) + '<div class="chips">';
  W.forEach(function (x) { h += '<button class="chip ' + (x === w ? 'on' : '') + '" ' + (r.v[x].s < 1 ? 'disabled' : '') + ' onclick="pick(' + r.id + ',' + x + ')">' + x + ' kg</button>'; });
  return h + '</div><div class="row"><div><div class="price">' + inr(v.p) + '</div><div class="mut">' + inr(Math.round(v.p / w)) + ' per kg</div></div><button class="btn" ' + (v.s < 1 ? 'disabled' : '') + ' onclick="addCart(' + r.id + ')">Add to cart</button></div><div style="margin-top:8px">' + ragBadge(g, word) + '</div></div>';
}
function hwCard(x) {
  var k = pkey('hw', x.id), g = ragHw(x), word = x.s < 1 ? 'Out of stock' : x.s <= x.min ? 'Only ' + x.s + ' left' : 'In stock';
  return '<div class="card"><div class="row"><h3>' + esc(x.name) + '</h3>' + (me ? heart(k) : '') + '</div><div class="mut">per ' + esc(x.unit) + '</div>' + ratingLine(k) + '<div class="row" style="margin-top:10px"><div><div class="price">' + inr(x.p) + '</div><div style="margin-top:4px">' + ragBadge(g, word) + '</div></div><button class="btn" ' + (x.s < 1 ? 'disabled' : '') + ' onclick="addCart(' + x.id + ')">Add</button></div></div>';
}
function riceList(onlySaved) {
  var sv = wishOf(), l = db.rice.filter(function (r) { return r.on && r.agency === ag && matches(r.name, r.note) && (!A2.q.stock || W.some(function (w) { return r.v[w].s > 0; })) && (!onlySaved || sv.indexOf(pkey('rice', r.id)) > -1); });
  return ordering(l, function (r) { return r.v[sel[r.id] || 10].p; });
}
function hwList(onlySaved) {
  var sv = wishOf();
  return ordering(db.hw.filter(function (x) { return x.on && matches(x.name, x.cat) && (!A2.q.cat || x.cat === A2.q.cat) && (!A2.q.stock || x.s > 0) && (!onlySaved || sv.indexOf(pkey('hw', x.id)) > -1); }), function (x) { return x.p; });
}
window.shop = function () {
  var l = riceList(false), h = '<h2>Choose your rice</h2>' + agBar() + toolbar(false) + '<div class="grid">';
  l.forEach(function (r) { h += riceCard(r); });
  return shopWrap(h + (l.length ? '' : noMatch()) + '</div>');
};
window.hwShop = function () {
  var l = hwList(false), h = '<h2>Hardware catalog</h2><p class="mut">Indicative market prices. Final rates are confirmed at order.</p>' + toolbar(true);
  if (!l.length) return shopWrap(h + '<div class="grid">' + noMatch() + '</div>');
  if (A2.q.sort) { h += '<div class="grid">'; l.forEach(function (x) { h += hwCard(x); }); return shopWrap(h + '</div>'); }
  CATS.forEach(function (c) { var m = l.filter(function (x) { return x.cat === c; }); if (!m.length) return; h += '<h4>' + esc(c) + '</h4><div class="grid">'; m.forEach(function (x) { h += hwCard(x); }); h += '</div>'; });
  return shopWrap(h);
};
function savedTab() {
  var rice = mod === 'rice', l = rice ? riceList(true) : mod === 'ap' ? apList(true, true) : hwList(true), h = '<h2>Saved items</h2><p class="mut">Items you saved with the heart. Tap the heart again to remove one.</p>';
  if (!wishOf().length || !l.length) return h + '<div class="card"><b>Nothing saved here yet</b><p class="mut" style="margin:4px 0 0">Tap the heart on any ' + (rice ? 'rice' : 'item') + ' to find it again quickly.</p></div>';
  h += (rice ? agBar() : '') + '<div class="grid">'; l.forEach(function (x) { h += rice ? riceCard(x) : mod === 'ap' ? apCard(x) : hwCard(x); });
  return shopWrap(h + '</div>');
}

/* ---- coupons, totals, cart ---- */
function couponCalc(code, sub) {
  var c = db.coupons.filter(function (x) { return x.code === code; })[0], today = dstr(new Date());
  if (!c || !c.on) return { ok: 0, msg: 'That code is not valid.' };
  if (c.exp && c.exp < today) return { ok: 0, msg: 'That code has expired.' };
  if (sub < c.min) return { ok: 0, msg: 'Spend ' + inr(c.min) + ' or more to use ' + c.code + '.' };
  var d = c.type === 'pct' ? Math.min(c.max || 1e9, Math.round(sub * c.value / 100)) : Math.min(c.value, sub);
  return { ok: 1, disc: Math.max(0, d) };
}
function totals() {
  var sub = 0, q = 0; cart.forEach(function (c) { if (c.m !== mod) return; var r = ref(c); sub += r.v.p * c.q; q += c.q; });
  var disc = 0, cp = A2.applied;
  if (cp) { var x = couponCalc(cp.code, sub); if (x.ok) disc = x.disc; else { A2.applied = null; A2.cmsg = x.msg; } }
  var after = sub - disc, fee = q && after < N(db.settings.free) ? N(db.settings.fee) : 0, rate = mod === 'rice' ? 0.05 : 0.18, total = after + fee;
  return { sub: sub, q: q, disc: disc, fee: fee, total: total, rate: rate, gst: Math.round(after * rate / (1 + rate)) };
}
A2.field = function (k, v) { A2.f[k] = k === 'addr' ? String(v).slice(0, 300) : String(v).slice(0, 60); };
A2.coupon = function () {
  var code = clean(document.getElementById('cpn').value, 20).toUpperCase(), t = totals(), x = couponCalc(code, t.sub);
  if (!code) { toast('Enter a coupon code'); return; }
  if (!x.ok) { A2.applied = null; A2.cmsg = x.msg; toast(x.msg, 3000); render(); return; }
  A2.applied = { code: code }; A2.cmsg = ''; toast(code + ' applied: you save ' + inr(x.disc), 3000); render();
};
A2.dropCoupon = function () { A2.applied = null; A2.cmsg = ''; render(); };
window.cartHtml = function () {
  if (!A2.pre && me) { A2.pre = 1; A2.f.addr = A2.f.addr || me.addr || ''; A2.f.phone = A2.f.phone || me.phone || ''; A2.f.pin = A2.f.pin || me.pin || ''; }
  var h = '', n = 0, q = 0;
  cart.forEach(function (c, i) {
    if (c.m !== mod) return; n++; q += c.q; var r = ref(c);
    h += '<div class="li"><div><div class="nm">' + esc(r.name) + '</div><div class="mut">' + esc(r.label) + ' · ' + inr(r.v.p) + ' each</div></div><div class="pr">' + inr(r.v.p * c.q) + '</div><div class="qty"><button onclick="chg(' + i + ',-1)" aria-label="Fewer">−</button><span>' + c.q + '</span><button onclick="chg(' + i + ',1)" aria-label="More">+</button></div><div style="text-align:right"><button class="btn alt" style="padding:4px 10px;font-size:13px" onclick="chg(' + i + ',-' + c.q + ')">Remove</button></div></div>';
  });
  if (!n) return '<div class="cartp"><h3>Your cart</h3><p class="mut" style="margin:0">Nothing here yet. Add ' + (mod === 'rice' ? 'a bag of rice' : 'an item') + ' to start an order.</p></div>';
  var t = totals(), f = A2.f;
  return '<div class="cartp"><h3>Your cart (' + q + ')</h3><div>' + h + '</div>' +
    (staff() ? '<label>Customer name or phone<input type="text" maxlength="60" value="' + esc(f.cn) + '" oninput="A2.field(\'cn\',this.value)" placeholder="Who is this order for?"></label>' : '') +
    '<label>Delivery address<textarea rows="3" maxlength="300" oninput="A2.field(\'addr\',this.value)" placeholder="House no, street, area, Bengaluru">' + esc(f.addr) + '</textarea></label>' +
    '<div class="row" style="gap:8px"><label style="flex:1">Mobile number<input type="text" inputmode="numeric" maxlength="10" value="' + esc(f.phone) + '" oninput="A2.field(\'phone\',this.value)" placeholder="10 digits"></label><label style="flex:1">PIN code<input type="text" inputmode="numeric" maxlength="6" value="' + esc(f.pin) + '" oninput="A2.field(\'pin\',this.value)" placeholder="6 digits"></label></div>' +
    '<label>Payment<select onchange="A2.field(\'pay\',this.value)">' + ['Pay on delivery', 'UPI (demo)'].map(function (o) { return '<option' + (o === f.pay ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>' +
    '<p class="mut" style="margin:0">Payments are simulated. No card or bank details are collected or stored.</p>' +
    (A2.applied ? '<div class="row"><span class="disc">' + esc(A2.applied.code) + ' applied</span><button class="linkbtn" onclick="A2.dropCoupon()">Remove</button></div>' :
      '<div><label>Coupon code</label><div class="cpn"><input type="text" id="cpn" maxlength="20" placeholder="Enter code" aria-label="Coupon code"><button class="btn alt" onclick="A2.coupon()">Apply</button></div>' + (A2.cmsg ? '<div class="err" style="margin:6px 0 0">' + esc(A2.cmsg) + '</div>' : '') + '</div>') +
    '<div class="sumrows"><div><span>Subtotal</span><span>' + inr(t.sub) + '</span></div>' + (t.disc ? '<div class="disc"><span>Coupon discount</span><span>−' + inr(t.disc) + '</span></div>' : '') +
    '<div><span>Delivery</span><span>' + (t.fee ? inr(t.fee) : 'Free') + '</span></div>' + (t.fee ? '<div class="mut"><span>Free delivery from ' + inr(db.settings.free) + '</span><span></span></div>' : '') +
    '<div class="mut"><span>Includes GST (' + Math.round(t.rate * 100) + '%)</span><span>' + inr(t.gst) + '</span></div></div>' +
    '<div class="tot"><span>Total</span><span>' + inr(t.total) + '</span></div><button class="btn" style="width:100%;padding:12px" onclick="place()">Place order</button></div>';
};
window.cartBar = function () { var t = totals(); return t.q ? '<button class="cartbar" onclick="document.getElementById(\'cart\').scrollIntoView({behavior:\'smooth\'})"><span>View cart (' + t.q + ')</span><span>' + inr(t.total) + '</span></button>' : ''; };

/* ---- placing an order ---- */
window.place = function () {
  var f = A2.f, ad = clean(f.addr, 250), ph = String(f.phone).replace(/\s/g, ''), pin = String(f.pin).trim();
  if (!ad) { toast('Enter a delivery address'); return; }
  if (ad.length < 10) { toast('Add a fuller delivery address (house, street, area)', 3500); return; }
  if (!/^[6-9]\d{9}$/.test(ph)) { toast('Enter a 10 digit mobile number', 3500); return; }
  if (!/^\d{6}$/.test(pin)) { toast('Enter a 6 digit PIN code', 3500); return; }
  var cn = staff() ? clean(f.cn, 60) : ''; if (staff() && !cn) { toast('Enter the customer name or phone'); return; }
  var pay = ['Pay on delivery', 'UPI (demo)'].indexOf(f.pay) > -1 ? f.pay : 'Pay on delivery', items = [];
  for (var i = 0; i < cart.length; i++) {
    var c = cart[i]; if (c.m !== mod) continue; var r = ref(c);
    if (!(c.q >= 1 && c.q <= r.v.s)) { toast(r.name + ' is low on stock'); return; }
    items.push({ m: c.m, id: c.id, w: c.w, name: r.name, label: r.label, q: c.q, price: r.v.p });
  }
  if (!items.length) { toast('Your cart is empty'); return; }
  var t = totals(); items.forEach(function (it) { ref(it).v.s -= it.q; }); cart = cart.filter(function (c) { return c.m !== mod; });
  var agid = mod === 'rice' && items.length ? find('rice', items[0].id).agency : 0, A = agid ? find('agencies', agid) : null, now = new Date();
  db.orders.unshift({ id: db.next++, mod: mod, ag: agid, agName: A ? A.name : '', brand: A ? A.brand : '', lab: mod === 'rice' ? { heads: 0, rate: db.settings.rate, paid: '' } : null, cust: me.u, custName: staff() ? cn : me.name, by: staff() ? me.name : '', items: items, sub: t.sub, disc: t.disc, coupon: A2.applied ? A2.applied.code : '', fee: t.fee, gst: t.gst, total: t.total, status: 'placed', addr: ad, phone: ph, pin: pin, pay: pay, paid: pay.indexOf('UPI') === 0, ts: now.getTime(), date: now.toLocaleString('en-IN'), eta: now.getTime() + dayMs(3), tl: [{ s: 'placed', t: now.getTime() }] });
  if (!staff()) { me.addr = me.addr || ad; me.phone = me.phone || ph; me.pin = me.pin || pin; }
  audit('order-placed', 'order ' + (db.next - 1) + ' ' + inr(t.total));
  A2.f.addr = ''; A2.f.cn = ''; A2.applied = null; A2.cmsg = ''; save(); tab = staff() ? 'Orders' : 'My orders'; toast('Order placed'); render();
};
var _setStatus = window.setStatus;
window.setStatus = function (id, s) {
  var o = ordr(id), prev = o && o.status; _setStatus(id, s);
  if (o && o.status === s && prev !== s) { (o.tl = o.tl || []).push({ s: s, t: Date.now() }); save(); }
};

/* ---- orders: timeline, invoice, cancel, return, reorder ---- */
function stamp(o, s) { var e = (o.tl || []).filter(function (x) { return x.s === s; }).pop(); return e ? e.t : 0; }
function timeline(o) {
  var steps = ['placed', 'confirmed', 'packed', 'delivered'], i = steps.indexOf(o.status), h = '<ol class="tl" aria-label="Order progress">';
  if (o.status === 'cancelled') return h + '<li class="done">Placed</li><li class="stop">Cancelled</li></ol>';
  steps.forEach(function (s, n) { h += '<li class="' + (n <= i ? 'done' : '') + '"' + (n === i ? ' aria-current="step"' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</li>'; });
  return h + '</ol>';
}
function etaLine(o) {
  if (o.status === 'cancelled') return '';
  if (o.status === 'delivered') return '<div class="mut">Delivered ' + new Date(stamp(o, 'delivered') || o.ts).toLocaleDateString('en-IN') + '</div>';
  return '<div class="mut">Expected by ' + new Date(o.eta || otime(o) + dayMs(3)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + '</div>';
}
function returnable(o) { return o.status === 'delivered' && !o.ret && Date.now() - (stamp(o, 'delivered') || otime(o)) < dayMs(7); }
A2.invoice = function (id) {
  var o = ordr(id); if (!o || !me || (me.role === 'customer' && o.cust !== me.u)) { deny('invoice'); return; }
  var h = '<div class="inv"><h3>AmiraASTAR · Invoice #' + o.id + '</h3><div class="mut">' + esc(o.date) + (o.agName ? ' · ' + esc(o.agName) : '') + '</div><p style="margin:8px 0"><b>' + esc(o.custName) + '</b><br>' + esc(o.addr) + (o.pin ? ' - ' + esc(o.pin) : '') + (o.phone ? '<br>Mobile ' + esc(o.phone) : '') + '</p><table><tr><th>Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr>';
  o.items.forEach(function (i) { h += '<tr><td>' + esc(i.name) + ' (' + esc(i.label) + ')</td><td>' + i.q + '</td><td style="text-align:right">' + inr(i.price * i.q) + '</td></tr>'; });
  var sub = o.sub !== undefined ? o.sub : o.total;
  h += '</table><div class="sumrows"><div><span>Subtotal</span><span>' + inr(sub) + '</span></div>' + (o.disc ? '<div class="disc"><span>Discount' + (o.coupon ? ' (' + esc(o.coupon) + ')' : '') + '</span><span>−' + inr(o.disc) + '</span></div>' : '') + (o.fee ? '<div><span>Delivery</span><span>' + inr(o.fee) + '</span></div>' : '') + (o.gst ? '<div class="mut"><span>Includes GST</span><span>' + inr(o.gst) + '</span></div>' : '') + '<div class="tot"><span>Total</span><span>' + inr(o.total) + '</span></div></div><p class="mut">Paid by: ' + esc(o.pay) + (o.paid ? ' (paid)' : '') + '</p><div class="row" style="justify-content:flex-start"><button class="btn" onclick="window.print()">Print</button><button class="btn alt" data-close data-focus>Close</button></div></div>';
  modal(h);
};
A2.reorder = function (id) {
  var o = ordr(id); if (!o || o.cust !== me.u) return; var added = 0, miss = 0;
  o.items.forEach(function (it) {
    var r = null; try { r = ref(it); } catch (e) { r = null; } if (!r || !r.v || r.v.s < 1) { miss++; return; }
    var c = cart.filter(function (x) { return x.m === it.m && x.id === it.id && x.w === it.w; })[0], q = Math.min(it.q, r.v.s - (c ? c.q : 0));
    if (q < 1) { miss++; return; } if (c) c.q += q; else cart.push({ m: it.m, id: it.id, w: it.w, q: q }); added++;
  });
  tab = mod === 'rice' ? 'Shop' : mod === 'ap' ? 'Parts' : 'Catalog'; toast(added ? 'Added ' + added + ' item(s) to your cart' + (miss ? ' (' + miss + ' out of stock)' : '') : 'Those items are out of stock', 3500); render();
};
A2.returnDlg = function (id) {
  var o = ordr(id); if (!o || o.cust !== me.u || !returnable(o)) { toast('This order cannot be returned now.', 3500); return; }
  modal('<div class="inv"><h3>Return order #' + o.id + '</h3><p class="mut">You can ask for a return within 7 days of delivery. We review every request.</p><label class="mut">Reason<select id="rr" style="width:100%"><option>Wrong item</option><option>Damaged or spoiled</option><option>Quality not as expected</option><option>Other</option></select></label><label class="mut">Details (optional)<textarea id="rd" rows="3" maxlength="200" style="width:100%"></textarea></label><div class="row" style="justify-content:flex-start;margin-top:10px"><button class="btn" onclick="A2.returnSend(' + o.id + ')">Send request</button><button class="btn alt" data-close>Cancel</button></div></div>');
};
A2.returnSend = function (id) {
  var o = ordr(id); if (!o || o.cust !== me.u || !returnable(o)) return;
  o.ret = { st: 'requested', reason: clean(document.getElementById('rr').value, 40), note: clean(document.getElementById('rd').value, 200), ts: Date.now() };
  audit('return-requested', 'order ' + id); closeModal(); save(); toast('Return requested'); render();
};
A2.retDecide = function (id, ok) {
  var o = ordr(id); if (!isStaff() || !o || !o.ret || o.ret.st !== 'requested') { deny('retDecide'); return; }
  o.ret.st = ok ? 'approved' : 'rejected'; o.ret.by = me.name; o.ret.at = Date.now();
  if (ok) o.items.forEach(function (it) { try { ref(it).v.s += it.q; } catch (e) { } });
  audit('return-' + (ok ? 'approved' : 'rejected'), 'order ' + id); save(); toast(ok ? 'Return approved and stock restored' : 'Return declined'); render();
};
function retHtml(o) {
  if (!o.ret) return '';
  var st = o.ret.st, cls = st === 'approved' ? 'rag-green' : st === 'rejected' ? 'rag-red' : 'rag-amber';
  return '<div class="stk"><b>Return ' + esc(st) + '</b> <span class="mut">· ' + esc(o.ret.reason) + (o.ret.note ? ' · ' + esc(o.ret.note) : '') + '</span></div>';
}
window.orders = function (mine) {
  var l = db.orders.filter(function (o) { return o.mod === mod && (!mine || o.cust === me.u); });
  if (!l.length) return '<div class="card"><b>No orders yet</b><p class="mut" style="margin:4px 0 0">' + (mine ? 'Add something from the ' + (mod === 'rice' ? 'Shop' : mod === 'ap' ? 'Parts' : 'Catalog') + ' tab to place your first order.' : 'New customer orders will show up here.') + '</p></div>';
  var h = '<h2>' + (mine ? 'My orders' : 'Customer orders') + '</h2><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">';
  l.forEach(function (o) {
    var rg = !mine ? ragOrder(o) : null, rr = !mine ? ragReturn(o) : null;
    h += '<div class="card"><div class="row"><b>#' + o.id + '</b><span class="badge ' + o.status + '">' + o.status + '</span></div>' +
      (rg ? '<div style="margin:6px 0">' + ragBadge(rg) + ' <span class="mut">' + esc(rg.why) + '</span></div>' : '') +
      '<div class="mut">' + esc(o.date) + (mine ? '' : ' · ' + esc(o.custName) + (o.by ? ' · placed by ' + esc(o.by) : '')) + '</div>' + timeline(o) + etaLine(o) + '<div style="margin:8px 0">';
    o.items.forEach(function (i) {
      var k = pkey(i.m, i.id);
      h += '<div class="row"><span>' + esc(i.name) + ' (' + esc(i.label) + ') × ' + i.q + (mine && o.status === 'delivered' ? ' <button class="linkbtn" onclick="A2.rateDlg(\'' + k + '\')">Rate</button>' : '') + '</span><span>' + inr(i.price * i.q) + '</span></div>';
    });
    h += '</div>' + (o.disc || o.fee ? '<div class="sumrows mut">' + (o.disc ? '<div class="disc"><span>Coupon' + (o.coupon ? ' ' + esc(o.coupon) : '') + '</span><span>−' + inr(o.disc) + '</span></div>' : '') + (o.fee ? '<div><span>Delivery</span><span>' + inr(o.fee) + '</span></div>' : '') + '</div>' : '') +
      '<div class="row"><b>Total ' + inr(o.total) + '</b><span class="mut">' + esc(o.pay) + (o.paid ? ' · paid' : '') + '</span></div><div class="mut" style="margin-top:6px">' + esc(o.addr) + (o.pin ? ' - ' + esc(o.pin) : '') + '</div>' + (!mine && o.phone ? '<div class="mut">Mobile ' + esc(o.phone) + '</div>' : '');
    if (o.mod === 'rice' && o.agName) h += '<div class="mut" style="margin-top:6px">Agency: ' + esc(o.agName) + (o.brand ? ' (' + esc(o.brand) + ' brand)' : '') + '</div>';
    if (!mine && o.mod === 'rice') h += opsHtml(o);
    if (!mine && o.status !== 'delivered' && o.status !== 'cancelled') h += '<div class="row" style="margin-top:10px"><select style="width:auto" id="s' + o.id + '" aria-label="Status for order ' + o.id + '">' + FLOW.map(function (f) { return '<option' + (f === o.status ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select><button class="btn" onclick="setStatus(' + o.id + ',$(\'#s' + o.id + '\').value)">Update status</button></div>';
    h += retHtml(o);
    if (!mine && rr) h += '<div class="row" style="margin-top:8px">' + ragBadge(rr) + '<span><button class="btn" onclick="A2.retDecide(' + o.id + ',1)">Approve return</button> <button class="btn alt" onclick="A2.retDecide(' + o.id + ',0)">Decline</button></span></div>';
    h += '<div class="row" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap"><button class="btn alt" onclick="A2.invoice(' + o.id + ')">Invoice</button>';
    if (mine && o.status === 'placed') h += '<button class="btn alt" onclick="setStatus(' + o.id + ',\'cancelled\')">Cancel order</button>';
    if (mine && returnable(o)) h += '<button class="btn alt" onclick="A2.returnDlg(' + o.id + ')">Return</button>';
    if (mine) h += '<button class="btn alt" onclick="A2.reorder(' + o.id + ')">Order again</button>';
    h += '</div></div>';
  });
  return h + '</div>';
};

/* ---- offers, delivery and review moderation (admin) ---- */
A2.cpnSet = function (i, f, v) {
  if (!isAdmin()) { deny('cpnSet'); return; } var c = db.coupons[i]; if (!c) return;
  if (f === 'code') { v = clean(v, 12).toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v.length < 4 || db.coupons.some(function (x, j) { return j !== i && x.code === v; })) { toast('Codes are 4 to 12 letters or numbers and must be unique.', 3500); render(); return; } }
  else if (f === 'type') v = v === 'flat' ? 'flat' : 'pct';
  else if (f === 'exp') v = isDate(v) ? v : '';
  else v = Math.max(0, Math.round(N(v))); if (f === 'value' && c.type === 'pct') v = Math.min(90, v);
  c[f] = v; audit('coupon', c.code + ' ' + f + ' = ' + v); save(); toast('Saved'); render();
};
A2.cpnToggle = function (i) { if (!isAdmin()) { deny('cpnToggle'); return; } var c = db.coupons[i]; if (!c) return; c.on = c.on ? 0 : 1; audit('coupon', c.code + (c.on ? ' on' : ' off')); save(); render(); };
A2.cpnDel = function (i) { if (!isAdmin()) { deny('cpnDel'); return; } var c = db.coupons[i]; if (!c) return; audit('coupon', c.code + ' deleted'); db.coupons.splice(i, 1); save(); render(); };
A2.cpnAdd = function () {
  if (!isAdmin()) { deny('cpnAdd'); return; }
  var code = clean(document.getElementById('nc').value, 12).toUpperCase().replace(/[^A-Z0-9]/g, ''), type = document.getElementById('nt').value === 'flat' ? 'flat' : 'pct', val = Math.round(N(document.getElementById('nv').value)), min = Math.round(N(document.getElementById('nm').value));
  if (code.length < 4 || db.coupons.some(function (x) { return x.code === code; })) { toast('Codes are 4 to 12 letters or numbers and must be unique.', 3500); return; }
  if (val < 1 || (type === 'pct' && val > 90)) { toast('Enter a discount (percent up to 90, or rupees).', 3500); return; }
  db.coupons.push({ code: code, type: type, value: val, min: Math.max(0, min), max: type === 'pct' ? 500 : 0, on: 1, exp: '' }); audit('coupon', code + ' created'); save(); toast('Coupon added'); render();
};
A2.setFee = function (k, v) { if (!isAdmin()) { deny('setFee'); return; } if (['fee', 'free'].indexOf(k) < 0) return; db.settings[k] = Math.max(0, Math.round(N(v))); audit('delivery', k + ' = ' + db.settings[k]); save(); toast('Saved'); render(); };
A2.revHide = function (i) { if (!isAdmin()) { deny('revHide'); return; } var r = db.reviews[i]; if (!r) return; r.hidden = r.hidden ? 0 : 1; audit('review-moderated', r.k + ' by ' + r.u + (r.hidden ? ' hidden' : ' shown')); save(); render(); };
function offersTab() {
  var h = '<h2>Offers, delivery and reviews</h2><div class="card tw"><b>Coupons</b><table style="margin-top:8px"><tr><th>Code</th><th>Type</th><th>Value</th><th>Min spend ₹</th><th>Max off ₹</th><th>Expires</th><th>Active</th><th></th></tr>';
  db.coupons.forEach(function (c, i) {
    h += '<tr><td><input type="text" style="width:110px" value="' + esc(c.code) + '" maxlength="12" onchange="A2.cpnSet(' + i + ',\'code\',this.value)" aria-label="Code"></td>' +
      '<td><select style="width:auto" onchange="A2.cpnSet(' + i + ',\'type\',this.value)" aria-label="Type"><option value="pct"' + (c.type === 'pct' ? ' selected' : '') + '>Percent</option><option value="flat"' + (c.type === 'flat' ? ' selected' : '') + '>Flat ₹</option></select></td>' +
      '<td><input type="number" min="0" value="' + N(c.value) + '" onchange="A2.cpnSet(' + i + ',\'value\',this.value)" aria-label="Value"></td><td><input type="number" min="0" value="' + N(c.min) + '" onchange="A2.cpnSet(' + i + ',\'min\',this.value)" aria-label="Minimum spend"></td><td><input type="number" min="0" value="' + N(c.max) + '" onchange="A2.cpnSet(' + i + ',\'max\',this.value)" aria-label="Maximum discount"></td>' +
      '<td><input type="date" style="width:140px" value="' + esc(c.exp) + '" onchange="A2.cpnSet(' + i + ',\'exp\',this.value)" aria-label="Expiry"></td><td><button class="btn alt" aria-pressed="' + (c.on ? 'true' : 'false') + '" onclick="A2.cpnToggle(' + i + ')">' + (c.on ? 'On' : 'Off') + '</button></td><td><button class="btn alt" onclick="A2.cpnDel(' + i + ')">Delete</button></td></tr>';
  });
  h += '</table><div class="row" style="margin-top:10px;flex-wrap:wrap;justify-content:flex-start"><input type="text" id="nc" placeholder="New code" maxlength="12" style="width:120px;margin:0"><select id="nt" style="width:auto"><option value="pct">Percent</option><option value="flat">Flat ₹</option></select><input type="number" id="nv" min="1" placeholder="Value" style="width:90px;margin:0"><input type="number" id="nm" min="0" placeholder="Min spend ₹" style="width:120px;margin:0"><button class="btn" onclick="A2.cpnAdd()">Add coupon</button></div></div>';
  h += '<div class="card" style="margin-top:14px"><b>Delivery</b><div class="ef" style="margin-top:8px"><label>Delivery fee (₹)<input type="number" min="0" value="' + N(db.settings.fee) + '" onchange="A2.setFee(\'fee\',this.value)"></label><label>Free delivery from (₹)<input type="number" min="0" value="' + N(db.settings.free) + '" onchange="A2.setFee(\'free\',this.value)"></label></div></div>';
  h += '<div class="card tw" style="margin-top:14px"><b>Customer reviews</b>';
  if (!db.reviews.length) h += '<p class="mut" style="margin:6px 0 0">No reviews yet. Customers can rate items from delivered orders.</p>';
  else { h += '<table style="margin-top:8px"><tr><th>Product</th><th>Stars</th><th>Review</th><th>By</th><th></th></tr>'; db.reviews.slice(0, 50).forEach(function (r, i) { h += '<tr><td>' + esc(prodName(r.k)) + '</td><td>' + starsHtml(r.stars) + '</td><td>' + esc(r.text) + '</td><td>' + esc(r.name) + '</td><td><button class="btn alt" onclick="A2.revHide(' + i + ')">' + (r.hidden ? 'Show' : 'Hide') + '</button></td></tr>'; }); h += '</table>'; }
  return h + '</div>';
}
A2.view_offers = offersTab;
A2.view_saved = savedTab;

/* ---- account (every role) ---- */
A2.saveProfile = function () {
  var n = clean(document.getElementById('pn').value, 60), ph = clean(document.getElementById('pp').value, 15).replace(/\s/g, ''), ad = clean(document.getElementById('pa').value, 250), pin = clean(document.getElementById('pc').value, 6), e = document.getElementById('perr');
  if (n.length < 2) { e.textContent = 'Enter your name.'; return; }
  if (ph && !/^[6-9]\d{9}$/.test(ph)) { e.textContent = 'Enter a 10 digit mobile number or leave it empty.'; return; }
  if (pin && !/^\d{6}$/.test(pin)) { e.textContent = 'PIN code is 6 digits.'; return; }
  me.name = n; me.phone = ph; me.addr = ad; me.pin = pin; audit('profile', 'profile updated'); save(); toast('Profile saved'); render();
};
A2.changePw = async function () {
  await ready;
  var cur = document.getElementById('pw0').value, a = document.getElementById('pw1').value, b = document.getElementById('pw2').value, e = document.getElementById('pwerr');
  if (!(await checkPw(me, cur))) { audit('password-change-failed', 'wrong current password', 1); e.textContent = 'Your current password is not correct.'; return; }
  var pp = pwProblem(a, me.u); if (pp) { e.textContent = pp; return; }
  if (a !== b) { e.textContent = 'The two new passwords do not match.'; return; }
  if (a === cur) { e.textContent = 'Choose a password you have not used before.'; return; }
  var wasForced = A2.force; await setPw(me, a); me.mustChange = 0; A2.force = 0; audit('password-changed', 'password changed'); save(); toast('Password changed'); if (wasForced) mod = null; render();
};
A2.exportMe = function () {
  var d = { profile: { username: me.u, name: me.name, email: me.email, phone: me.phone, address: me.addr, pin: me.pin, role: me.role }, orders: db.orders.filter(function (o) { return o.cust === me.u; }), saved: wishOf(), reviews: db.reviews.filter(function (r) { return r.u === me.u; }) };
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = 'my-amiraastar-data.json'; document.body.appendChild(a); a.click(); a.remove(); audit('export', 'downloaded own data');
};
function accountTab() {
  var h = '<h2>Account</h2>' + (A2.force ? '<div class="banner" role="alert"><b>Change your password to continue.</b> Your account was created with a temporary password.</div>' : '');
  h += '<div class="card"><b>Profile</b><dl class="kv" style="margin:8px 0"><dt>Username</dt><dd>' + esc(me.u) + '</dd><dt>Email</dt><dd>' + esc(me.email || '-') + '</dd><dt>Role</dt><dd>' + esc(me.role) + '</dd></dl><div class="ef"><label>Full name<input type="text" id="pn" maxlength="60" value="' + esc(me.name) + '"></label><label>Mobile number<input type="text" id="pp" maxlength="10" inputmode="numeric" value="' + esc(me.phone || '') + '"></label><label class="full">Default delivery address<textarea id="pa" rows="2" maxlength="250">' + esc(me.addr || '') + '</textarea></label><label>PIN code<input type="text" id="pc" maxlength="6" inputmode="numeric" value="' + esc(me.pin || '') + '"></label></div><p class="err" id="perr" style="margin:8px 0 0"></p><button class="btn" onclick="A2.saveProfile()">Save profile</button></div>';
  h += '<div class="card" style="margin-top:14px"><b>Change password</b><p class="mut" style="margin:4px 0 8px">At least 10 characters with letters and a number. Passwords are stored only as salted hashes.</p><div class="ef"><label>Current password<input type="password" id="pw0" autocomplete="current-password"></label><label>New password<input type="password" id="pw1" autocomplete="new-password"></label><label>Repeat new password<input type="password" id="pw2" autocomplete="new-password"></label></div><p class="err" id="pwerr" style="margin:8px 0 0"></p><button class="btn" onclick="A2.changePw()">Change password</button></div>';
  return h + '<div class="card" style="margin-top:14px"><b>Your data</b><p class="mut" style="margin:4px 0 8px">Download your profile, orders, saved items and reviews.</p><button class="btn alt" onclick="A2.exportMe()">Download my data</button></div>';
}
A2.view_account = accountTab;
