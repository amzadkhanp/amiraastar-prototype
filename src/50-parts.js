/* ================= 50 auto spare parts: catalogue by vehicle, stock, orders ================= */
/* Parts live in db.ap and reuse the shared cart, checkout, orders, returns, reviews, status colours and security of the other cards. */
var PV = {
  Car: ['Maruti Swift', 'Maruti Alto', 'Hyundai i20', 'Hyundai Creta', 'Tata Nexon', 'Honda City', 'Mahindra Scorpio'],
  Bike: ['Hero Splendor', 'Honda Activa', 'Bajaj Pulsar', 'TVS Apache', 'Royal Enfield Classic 350'],
  Auto: ['Bajaj RE', 'Piaggio Ape'],
  Truck: ['Tata Ace', 'Mahindra Bolero Pik-Up', 'Ashok Leyland Dost', 'Eicher Pro 2049', 'Tata 407'],
  Tractor: ['Mahindra 575 DI', 'Swaraj 744 FE']
};
var PTYPES = Object.keys(PV), PCATS = ['Engine', 'Brakes', 'Filters', 'Electrical', 'Suspension', 'Clutch & transmission', 'Lubricants', 'Tyres & wheels', 'Body & lights', 'Accessories'];
CARDS0.ap = { title: 'Auto Spare Parts', desc: 'Spare parts for cars, bikes, autos, trucks and tractors. Find parts by vehicle type and model, with live stock and low-stock alerts.', color: '#0f766e', on: 1 };
if (!db.cards.ap) db.cards.ap = JSON.parse(JSON.stringify(CARDS0.ap));
var AP = A2.ap = {};
A2.qa = { vt: '', model: '', cat: '', s: '', sort: '', stock: 0 };

/* sample catalogue: names, brands and prices are examples to be replaced with your own stock */
function P(id, name, cat, vt, models, brand, pno, unit, p, s, min) { return { id: id, name: name, cat: cat, vtype: vt, models: models, brand: brand, pno: pno, unit: unit, p: p, s: s, min: min, on: 1 }; }
if (!db.ap) {
  db.ap = [
    P(1, 'Brake pad set (front)', 'Brakes', 'Car', ['Maruti Swift', 'Maruti Alto', 'Hyundai i20'], 'Bosch', 'BP-1021', 'set', 1450, 24, 6),
    P(2, 'Brake pad set (front)', 'Brakes', 'Car', ['Hyundai Creta', 'Tata Nexon', 'Honda City'], 'Bosch', 'BP-2045', 'set', 2150, 14, 5),
    P(3, 'Oil filter', 'Filters', 'Car', ['Maruti Swift', 'Maruti Alto', 'Hyundai i20', 'Honda City'], 'Mann-Filter', 'OF-118', 'piece', 240, 60, 15),
    P(4, 'Air filter', 'Filters', 'Car', ['Maruti Swift', 'Hyundai i20'], 'Mann-Filter', 'AF-330', 'piece', 380, 32, 10),
    P(5, 'Spark plug (set of 4)', 'Engine', 'Car', ['Maruti Swift', 'Maruti Alto'], 'NGK', 'SP-4X', 'set', 520, 40, 10),
    P(6, 'Clutch plate', 'Clutch & transmission', 'Car', ['Mahindra Scorpio'], 'Valeo', 'CL-9021', 'piece', 3850, 6, 3),
    P(7, 'Front shock absorber', 'Suspension', 'Car', ['Tata Nexon', 'Hyundai Creta'], 'Gabriel', 'SA-F77', 'piece', 3200, 8, 4),
    P(8, 'Car battery 12V 45Ah', 'Electrical', 'Car', ['Maruti Swift', 'Maruti Alto', 'Hyundai i20', 'Honda City'], 'Exide', 'BT-45', 'piece', 4950, 9, 3),
    P(9, 'Headlight bulb H4', 'Body & lights', 'Car', ['All'], 'Philips', 'HB-H4', 'piece', 260, 70, 20),
    P(10, 'Wiper blade (pair)', 'Accessories', 'Car', ['All'], 'Bosch', 'WB-22', 'pair', 420, 25, 8),
    P(11, 'Brake shoe set', 'Brakes', 'Bike', ['Hero Splendor', 'Honda Activa'], 'Minda', 'BS-110', 'set', 190, 80, 20),
    P(12, 'Chain sprocket kit', 'Engine', 'Bike', ['Bajaj Pulsar', 'TVS Apache'], 'Rolon', 'CK-150', 'kit', 1250, 18, 6),
    P(13, 'Air filter', 'Filters', 'Bike', ['Hero Splendor', 'Honda Activa'], 'Hiflo', 'AF-HS', 'piece', 210, 45, 12),
    P(14, 'Spark plug', 'Engine', 'Bike', ['All'], 'NGK', 'SP-B', 'piece', 160, 90, 25),
    P(15, 'Clutch cable', 'Clutch & transmission', 'Bike', ['Royal Enfield Classic 350'], 'Minda', 'CC-350', 'piece', 320, 7, 8),
    P(16, 'Rear tyre 90/90-12', 'Tyres & wheels', 'Bike', ['Honda Activa'], 'TVS Eurogrip', 'TY-9012', 'piece', 1850, 0, 4),
    P(17, 'Engine oil 10W-30 (1 L)', 'Lubricants', 'Bike', ['All'], 'Castrol', 'CO-1030', 'litre', 420, 60, 20),
    P(18, 'Battery 12V 5Ah', 'Electrical', 'Bike', ['Bajaj Pulsar', 'TVS Apache', 'Hero Splendor'], 'Exide', 'BT-5', 'piece', 1450, 12, 5),
    P(19, 'Clutch plate', 'Clutch & transmission', 'Auto', ['Bajaj RE'], 'Minda', 'CL-RE', 'piece', 690, 14, 5),
    P(20, 'Brake drum shoe set', 'Brakes', 'Auto', ['Bajaj RE', 'Piaggio Ape'], 'Minda', 'BD-AP', 'set', 540, 20, 6),
    P(21, 'Headlamp assembly', 'Body & lights', 'Auto', ['Piaggio Ape'], 'Minda', 'HL-AP', 'piece', 1280, 3, 3),
    P(22, 'Brake liner set', 'Brakes', 'Truck', ['Tata Ace', 'Mahindra Bolero Pik-Up', 'Ashok Leyland Dost'], 'Ferodo', 'BL-LCV', 'set', 1850, 18, 6),
    P(23, 'Leaf spring (rear)', 'Suspension', 'Truck', ['Tata Ace'], 'Jamna Auto', 'LS-ACE', 'piece', 4200, 5, 3),
    P(24, 'Diesel fuel filter', 'Filters', 'Truck', ['Tata Ace', 'Eicher Pro 2049', 'Tata 407'], 'Bosch', 'FF-D12', 'piece', 480, 36, 10),
    P(25, 'Truck tyre 7.50-16', 'Tyres & wheels', 'Truck', ['Tata 407', 'Eicher Pro 2049'], 'MRF', 'TY-750', 'piece', 9400, 6, 4),
    P(26, 'Engine oil 15W-40 (5 L)', 'Lubricants', 'Truck', ['All'], 'Castrol', 'CO-1540', 'can', 2150, 22, 8),
    P(27, 'Hydraulic filter', 'Filters', 'Tractor', ['Mahindra 575 DI', 'Swaraj 744 FE'], 'Mann-Filter', 'HF-TR', 'piece', 640, 16, 5),
    P(28, 'Clutch plate', 'Clutch & transmission', 'Tractor', ['Mahindra 575 DI'], 'Valeo', 'CL-575', 'piece', 5200, 4, 3),
    P(29, 'Tractor battery 12V 88Ah', 'Electrical', 'Tractor', ['All'], 'Exide', 'BT-88', 'piece', 8900, 5, 3),
    P(30, 'Engine oil 5W-30 synthetic (1 L)', 'Lubricants', 'All', ['All'], 'Castrol', 'CO-530', 'litre', 780, 70, 20),
    P(31, 'Coolant (1 L)', 'Lubricants', 'All', ['All'], 'Shell', 'CL-1L', 'litre', 260, 48, 15),
    P(32, 'Wash and polish kit', 'Accessories', 'All', ['All'], '3M', 'AC-KIT', 'kit', 690, 18, 5),
    P(33, 'Tow rope', 'Accessories', 'All', ['All'], 'Generic', 'AC-TR', 'piece', 450, 4, 5)];
  db.stockLog = [];
}
db.stockLog = db.stockLog || [];
db.ap.forEach(function (x) {      /* clean what storage holds */
  x.id = N(x.id); x.name = clean(x.name, 80); x.brand = clean(x.brand, 40); x.pno = clean(x.pno, 30).toUpperCase(); x.unit = clean(x.unit, 15) || 'piece';
  if (PCATS.indexOf(x.cat) < 0) x.cat = 'Accessories'; if (PTYPES.concat(['All']).indexOf(x.vtype) < 0) x.vtype = 'All';
  x.models = (Array.isArray(x.models) ? x.models : ['All']).map(function (m) { return clean(m, 30); }).filter(Boolean).slice(0, 8); if (!x.models.length) x.models = ['All'];
  ['p', 's', 'min'].forEach(function (k) { x[k] = Math.max(0, N(x[k])); }); x.on = x.on ? 1 : 0;
});
db.stockLog = db.stockLog.filter(function (l) { return l && typeof l === 'object'; }).map(function (l) { return { t: N(l.t), u: clean(l.u, 20), id: N(l.id), name: clean(l.name, 80), d: N(l.d), r: clean(l.r, 80) }; });

/* the shared cart and orders look products up through ref(): teach it about parts */
var _ref = window.ref;
window.ref = function (c) {
  if (c.m === 'ap') { var x = find('ap', c.id); return { name: x.name, label: [x.brand, x.pno].filter(Boolean).join(' '), v: x }; }
  return _ref(c);
};
function modName(m) { return { rice: 'RiceMarket', hw: 'Hardware', ap: 'Spare parts' }[m] || m; }
AP.modName = modName;

/* ---- stock movements ---- */
function slog(x, d, r) { if (!x || !d) return; db.stockLog.unshift({ t: Date.now(), u: me ? me.u : '-', id: x.id, name: x.name, d: d, r: clean(r, 80) }); if (db.stockLog.length > 400) db.stockLog.length = 400; }
var _place2 = window.place;
window.place = function () {
  var n = db.orders.length; _place2();
  if (db.orders.length > n) { var o = db.orders[0]; o.items.forEach(function (i) { if (i.m === 'ap') slog(find('ap', i.id), -i.q, 'Order #' + o.id); }); save(); }
};
var _ss2 = window.setStatus;
window.setStatus = function (id, s) {
  var o = ordr(id), prev = o && o.status; _ss2(id, s);
  if (o && prev !== 'cancelled' && o.status === 'cancelled') { o.items.forEach(function (i) { if (i.m === 'ap') slog(find('ap', i.id), i.q, 'Order #' + o.id + ' cancelled'); }); save(); }
};
var _rd = A2.retDecide;
A2.retDecide = function (id, ok) {
  var o = ordr(id), was = o && o.ret && o.ret.st; _rd(id, ok);
  if (ok && o && was === 'requested' && o.ret.st === 'approved') { o.items.forEach(function (i) { if (i.m === 'ap') slog(find('ap', i.id), i.q, 'Return of order #' + o.id); }); save(); }
};

/* ---- finding parts by vehicle ---- */
AP.models = function (vt) {
  var out = []; (vt ? [vt] : PTYPES).forEach(function (t) { (PV[t] || []).forEach(function (m) { if (out.indexOf(m) < 0) out.push(m); }); });
  db.ap.forEach(function (x) { if ((!vt || x.vtype === vt) && x.vtype !== 'All') x.models.forEach(function (m) { if (m !== 'All' && out.indexOf(m) < 0) out.push(m); }); });
  return out.sort();
};
function fits(x) {
  var q = A2.qa;
  if (q.vt && x.vtype !== 'All' && x.vtype !== q.vt) return false;
  if (q.model && x.models.indexOf('All') < 0 && x.models.indexOf(q.model) < 0) return false;
  return true;
}
AP.f = function (k, v) {
  var q = A2.qa; v = clean(v, 40);
  if (k === 'vt') { q.vt = PTYPES.indexOf(v) > -1 ? v : ''; q.model = ''; }
  else if (k === 'model') q.model = AP.models(q.vt).indexOf(v) > -1 ? v : '';
  else if (k === 'cat') q.cat = PCATS.indexOf(v) > -1 ? v : '';
  else if (k === 'sort') q.sort = ['', 'plow', 'phigh', 'name'].indexOf(v) > -1 ? v : '';
  else if (k === 'stock') q.stock = v === '1' ? 1 : 0;
  else if (k === 's') { q.s = v; var pos = v.length; render(); var e = document.getElementById('aq'); if (e) { e.focus(); try { e.setSelectionRange(pos, pos); } catch (x) { } } return; }
  render();
};
AP.clear = function () { A2.qa = { vt: '', model: '', cat: '', s: '', sort: '', stock: 0 }; render(); };
function opts(list, cur, all) { return '<option value="">' + all + '</option>' + list.map(function (c) { return '<option' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join(''); }
function apToolbar(forStock) {
  var q = A2.qa, h = '<div class="toolbar" role="search"><label class="grow">Search by part, brand or part number<input type="search" id="aq" value="' + esc(q.s) + '" maxlength="40" placeholder="Brake pad, Bosch, OF-118" oninput="A2.ap.f(\'s\',this.value)"></label>' +
    '<label>Vehicle type<select onchange="A2.ap.f(\'vt\',this.value)">' + opts(PTYPES, q.vt, 'All types') + '</select></label>';
  if (!forStock) h += '<label>Vehicle model<select onchange="A2.ap.f(\'model\',this.value)">' + opts(AP.models(q.vt), q.model, 'All models') + '</select></label>';
  h += '<label>Category<select onchange="A2.ap.f(\'cat\',this.value)">' + opts(PCATS, q.cat, 'All categories') + '</select></label>';
  if (!forStock) h += '<label>Sort by<select onchange="A2.ap.f(\'sort\',this.value)">' + [['', 'Featured'], ['plow', 'Price: low to high'], ['phigh', 'Price: high to low'], ['name', 'Name']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === q.sort ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
  h += '<label style="flex-direction:row;align-items:center;gap:6px;padding-bottom:9px"><input type="checkbox"' + (q.stock ? ' checked' : '') + ' onchange="A2.ap.f(\'stock\',this.checked?\'1\':\'0\')"> In stock only</label>' + ((q.s || q.vt || q.model || q.cat || q.sort || q.stock) ? '<button class="btn alt" onclick="A2.ap.clear()">Clear</button>' : '') + '</div>';
  return h;
}
function apList(onlySaved, listedOnly) {
  var q = A2.qa, s = q.s.toLowerCase(), sv = wishOf();
  var l = db.ap.filter(function (x) {
    return (!listedOnly || x.on) && fits(x) && (!q.cat || x.cat === q.cat) && (!q.stock || x.s > 0) && (!s || (x.name + ' ' + x.brand + ' ' + x.pno + ' ' + x.cat + ' ' + x.models.join(' ')).toLowerCase().indexOf(s) > -1) && (!onlySaved || sv.indexOf(pkey('ap', x.id)) > -1);
  });
  return ordering(l, function (x) { return x.p; }, q.sort);
}

/* ---- the customer catalogue ---- */
function fitText(x) { var m = x.models.indexOf('All') > -1 ? ['All ' + (x.vtype === 'All' ? 'vehicles' : x.vtype.toLowerCase() + ' models')] : x.models; return m.length > 3 ? m.slice(0, 3).join(', ') + ' +' + (m.length - 3) + ' more' : m.join(', '); }
function apCard(x) {
  var k = pkey('ap', x.id), g = ragHw(x), word = x.s < 1 ? 'Out of stock' : x.s <= x.min ? 'Only ' + x.s + ' left' : 'In stock';
  return '<div class="card"><div class="row"><h3>' + esc(x.name) + '</h3>' + (me ? heart(k) : '') + '</div><div class="mut">' + esc(x.brand) + ' · ' + esc(x.pno) + ' · ' + esc(x.cat) + '</div><div style="margin:6px 0"><span class="badge">' + esc(x.vtype === 'All' ? 'All vehicles' : x.vtype) + '</span> <span class="mut">Fits: ' + esc(fitText(x)) + '</span></div>' + ratingLine(k) +
    '<div class="row" style="margin-top:10px"><div><div class="price">' + inr(x.p) + '</div><div class="mut">per ' + esc(x.unit) + '</div><div style="margin-top:4px">' + ragBadge(g, word) + '</div></div><button class="btn" ' + (x.s < 1 ? 'disabled' : '') + ' onclick="addCart(' + x.id + ')">Add</button></div></div>';
}
function partsShop() {
  var l = apList(false, true), q = A2.qa, h = '<h2>Spare parts</h2><p class="mut">Pick your vehicle type and model to see only the parts that fit it.</p>' + apToolbar(false);
  h += '<div class="grid">'; l.forEach(function (x) { h += apCard(x); });
  return shopWrap(h + (l.length ? '' : noMatch()) + '</div>');
}
A2.view_parts = partsShop;

/* ---- stock for staff ---- */
AP.set = function (id, f, v) {
  var x = db.ap.filter(function (y) { return y.id === id; })[0];
  if (!x || ['p', 's', 'min'].indexOf(f) < 0 || !isStaff() || (f !== 's' && !isAdmin())) { deny('parts.set'); return; }
  var n = Math.round(N(v, -1)); if (!(n >= 0 && n <= 1e6)) { toast('Enter a whole number from 0 to 1,000,000.', 3500); render(); return; }
  if (f === 's') { slog(x, n - x.s, 'Stock count'); } else audit('part', x.name + ' ' + f + ' = ' + n);
  x[f] = n; save(); toast('Saved'); render();
};
AP.receive = function () {
  if (!isStaff()) { deny('parts.receive'); return; }
  var x = db.ap.filter(function (y) { return y.id === +document.getElementById('rc_p').value; })[0], n = Math.round(N(document.getElementById('rc_q').value)), note = clean(document.getElementById('rc_n').value, 60), e = document.getElementById('rcerr');
  if (!x) { e.textContent = 'Choose a part.'; return; }
  if (!(n >= 1 && n <= 10000)) { e.textContent = 'Enter how many arrived (1 to 10,000).'; return; }
  x.s += n; slog(x, n, 'Stock in' + (note ? ': ' + note : '')); audit('stock-in', x.name + ' +' + n); save(); toast(n + ' added to ' + x.name); render();
};
AP.add = function () {
  if (!isAdmin()) { deny('parts.add'); return; }
  var g = function (k) { return document.getElementById('np_' + k).value; }, e = document.getElementById('nperr');
  var name = clean(g('name'), 80), cat = PCATS.indexOf(g('cat')) > -1 ? g('cat') : 'Accessories', vt = PTYPES.concat(['All']).indexOf(g('vt')) > -1 ? g('vt') : 'All', brand = clean(g('brand'), 40), pno = clean(g('pno'), 30).toUpperCase(), unit = clean(g('unit'), 15) || 'piece';
  var models = clean(g('models'), 200).split(',').map(function (m) { return clean(m, 30); }).filter(Boolean).slice(0, 8); if (!models.length) models = ['All'];
  var p = Math.round(N(g('p'), -1)), s = Math.round(N(g('s'), -1)), min = Math.round(N(g('min'), -1));
  var err = name.length < 3 ? 'Enter the part name.' : !pno ? 'Enter the part number.' : db.ap.some(function (x) { return x.pno === pno && x.vtype === vt && x.name === name; }) ? 'That part is already listed.' : !(p >= 1 && p <= 1e6) ? 'Enter the selling price in rupees.' : !(s >= 0 && s <= 1e6) ? 'Enter the opening stock.' : !(min >= 0 && min <= 1e5) ? 'Enter the reorder level.' : '';
  if (err) { e.textContent = err; return; }
  var id = db.ap.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1, x = { id: id, name: name, cat: cat, vtype: vt, models: models, brand: brand, pno: pno, unit: unit, p: p, s: s, min: min, on: 1 };
  db.ap.push(x); slog(x, s, 'Opening stock'); audit('part-added', name + ' ' + pno); save(); toast('Part added'); render();
};
function partsStockTab() {
  var adm = isAdmin(), l = apList(false, false), h = '<h2>Parts stock</h2>' + (adm ? '' : '<p class="mut">Staff can update stock. Only an admin can change prices and reorder levels.</p>') + apToolbar(true);
  h += '<div class="card tw"><table><tr><th>Part</th><th>Vehicle</th><th>Price (₹)</th><th>Stock</th><th>Reorder at</th><th>Status</th>' + (adm ? '<th>Listed</th>' : '') + '</tr>';
  l.forEach(function (x) {
    h += '<tr><td><input type="text" style="width:190px;margin:0" value="' + esc(x.name) + '" onchange="setN(\'ap\',' + x.id + ',\'name\',this.value)" aria-label="Part name"><div class="mut">' + esc(x.brand) + ' · ' + esc(x.pno) + ' · ' + esc(x.cat) + '</div></td><td><span class="badge">' + esc(x.vtype) + '</span><div class="mut">' + esc(fitText(x)) + '</div></td>' +
      '<td><input type="number" min="0" value="' + x.p + '" ' + (adm ? '' : 'disabled') + ' onchange="A2.ap.set(' + x.id + ',\'p\',this.value)" aria-label="' + esc(x.name) + ' price"></td><td><input type="number" min="0" value="' + x.s + '" onchange="A2.ap.set(' + x.id + ',\'s\',this.value)" aria-label="' + esc(x.name) + ' stock"></td><td><input type="number" min="0" value="' + x.min + '" ' + (adm ? '' : 'disabled') + ' onchange="A2.ap.set(' + x.id + ',\'min\',this.value)" aria-label="' + esc(x.name) + ' reorder level"></td><td>' + ragBadge(ragHw(x), x.s < 1 ? 'Out of stock' : x.s <= x.min ? 'Reorder' : 'OK') + '</td>' + (adm ? '<td><button class="btn alt" onclick="tog(\'ap\',' + x.id + ')">' + (x.on ? 'Hide' : 'Show') + '</button></td>' : '') + '</tr>';
  });
  h += '</table>' + (l.length ? '' : '<p class="mut" style="margin:8px 0 0">No parts match these filters.</p>') + '</div>';
  h += '<div class="card" style="margin-top:14px"><b>Receive stock</b><p class="mut" style="margin:4px 0 8px">Record parts that arrived from a supplier.</p><div class="row" style="justify-content:flex-start;flex-wrap:wrap"><select id="rc_p" style="width:auto;max-width:320px" aria-label="Part">' + db.ap.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + ' · ' + esc(x.pno) + ' (' + esc(x.vtype) + ')</option>'; }).join('') + '</select><input type="number" id="rc_q" min="1" placeholder="Quantity" style="width:110px;margin:0"><input type="text" id="rc_n" maxlength="60" placeholder="Supplier or bill no. (optional)" style="flex:1;min-width:180px;margin:0"><button class="btn" onclick="A2.ap.receive()">Add to stock</button></div><p class="err" id="rcerr" style="margin:8px 0 0"></p></div>';
  if (adm) h += '<div class="card" style="margin-top:14px"><b>Add a part</b><div class="ef" style="margin-top:8px"><label>Part name<input type="text" id="np_name" maxlength="80"></label><label>Category<select id="np_cat">' + PCATS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label><label>Vehicle type<select id="np_vt"><option>All</option>' + PTYPES.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label><label class="full">Vehicle models it fits (comma separated, or All)<input type="text" id="np_models" maxlength="200" placeholder="Maruti Swift, Hyundai i20"></label><label>Brand<input type="text" id="np_brand" maxlength="40"></label><label>Part number<input type="text" id="np_pno" maxlength="30"></label><label>Unit<input type="text" id="np_unit" maxlength="15" placeholder="piece, set, litre"></label><label>Selling price ₹<input type="number" id="np_p" min="1"></label><label>Opening stock<input type="number" id="np_s" min="0"></label><label>Reorder at<input type="number" id="np_min" min="0"></label></div><p class="err" id="nperr" style="margin:8px 0 0"></p><button class="btn" onclick="A2.ap.add()">Add part</button></div>';
  h += '<div class="card tw" style="margin-top:14px"><b>Stock history</b>';
  if (!db.stockLog.length) h += '<p class="mut" style="margin:6px 0 0">Every sale, cancellation, return, stock count and delivery is recorded here.</p>';
  else { h += '<table style="margin-top:8px"><tr><th>When</th><th>Part</th><th>Change</th><th>Why</th><th>By</th></tr>'; db.stockLog.slice(0, 30).forEach(function (l) { h += '<tr><td class="mono">' + new Date(l.t).toLocaleString('en-IN') + '</td><td>' + esc(l.name) + '</td><td><b style="color:' + (l.d < 0 ? 'var(--rag-r)' : 'var(--rag-g)') + '">' + (l.d > 0 ? '+' : '') + l.d + '</b></td><td>' + esc(l.r) + '</td><td>' + esc(l.u) + '</td></tr>'; }); h += '</table>'; }
  return h + '</div>';
}
A2.view_partsstock = partsStockTab;

/* ---- report: sales and stock position ---- */
function partsReport() {
  var os = db.orders.filter(function (o) { return o.mod === 'ap' && o.status !== 'cancelled'; }), week = os.filter(function (o) { return Date.now() - otime(o) < 7 * 864e5; });
  var rev = os.reduce(function (a, o) { return a + o.total; }, 0), units = {}, byType = {}, val = 0, low = [];
  os.forEach(function (o) { o.items.forEach(function (i) { if (i.m !== 'ap') return; var x = db.ap.filter(function (y) { return y.id === i.id; })[0]; units[i.id] = (units[i.id] || 0) + i.q; var t = x ? x.vtype : 'All'; byType[t] = (byType[t] || 0) + i.price * i.q; }); });
  db.ap.forEach(function (x) { val += x.p * x.s; var r = ragHw(x); if (r.lv !== 'green') low.push(x); });
  var top = Object.keys(units).map(function (id) { return [db.ap.filter(function (y) { return y.id === +id; })[0], units[id]]; }).filter(function (p) { return p[0]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
  var tile = function (l, n, s) { return '<div class="card"><div class="mut">' + l + '</div><div class="stat">' + n + '</div>' + (s ? '<div class="mut">' + s + '</div>' : '') + '</div>'; };
  var h = '<h2>Parts report</h2><div class="grid" style="margin-bottom:14px">' + tile('Orders (not cancelled)', os.length, week.length + ' in the last 7 days') + tile('Revenue', inr(rev)) + tile('Parts listed', db.ap.filter(function (x) { return x.on; }).length, db.ap.length + ' in the catalogue') + tile('Stock value (at selling price)', inr(val)) + tile('Needs restocking', low.length, 'amber or red') + '</div>';
  h += '<div class="grid2f"><div class="card"><b>Best sellers</b>' + (top.length ? '<table style="margin-top:8px"><tr><th>Part</th><th>Units</th></tr>' + top.map(function (p) { return '<tr><td>' + esc(p[0].name) + '<div class="mut">' + esc(p[0].vtype) + ' · ' + esc(p[0].pno) + '</div></td><td>' + p[1] + '</td></tr>'; }).join('') + '</table>' : '<p class="mut" style="margin:6px 0 0">No sales yet.</p>') + '</div>';
  h += '<div class="card"><b>Sales by vehicle type</b>' + (Object.keys(byType).length ? '<table style="margin-top:8px"><tr><th>Type</th><th style="text-align:right">Sales</th></tr>' + Object.keys(byType).sort().map(function (t) { return '<tr><td>' + esc(t) + '</td><td style="text-align:right">' + inr(byType[t]) + '</td></tr>'; }).join('') + '</table>' : '<p class="mut" style="margin:6px 0 0">No sales yet.</p>') + '</div></div>';
  h += '<div class="card" style="margin-top:14px"><b>Needs restocking</b>';
  if (!low.length) h += '<p class="mut" style="margin:6px 0 0">Everything is well stocked.</p>'; else low.sort(function (a, b) { return a.s - b.s; }).forEach(function (x) { var r = ragHw(x); h += '<div class="ragrow">' + ragBadge(r) + '<div>' + esc(x.name) + ' <span class="mut">(' + esc(x.vtype) + ' · ' + esc(x.pno) + ')</span><div class="mut">' + esc(r.why) + '</div></div></div>'; });
  return h + '</div>';
}
A2.view_partsreport = partsReport;

/* ---- tabs for this card ---- */
A2.apTabs = function () {
  if (me.role === 'customer') return ['Parts', 'Saved', 'My orders', 'Account'];
  if (me.role === 'employee') return ['Orders', 'Parts', 'Parts stock', 'Status board', 'Account'];
  return ['Orders', 'Parts', 'Parts stock', 'Parts report', 'Users', 'Offers', 'Status board', 'Status rules', 'Security', 'Account'];
};

/* ---- the home card ---- */
A2.apCard = function () {
  var c = db.cards.ap; if (!c || (!c.on && !staff())) return '';
  var h = '<div class="card mod' + (c.on ? '' : ' dim') + '" style="--c:' + esc(c.color) + '">';
  if (edit && staff()) {
    h += '<label class="mut">Card title<input type="text" value="' + esc(c.title) + '" onchange="setCard(\'ap\',\'title\',this.value)"></label><label class="mut">Description<textarea rows="3" onchange="setCard(\'ap\',\'desc\',this.value)">' + esc(c.desc) + '</textarea></label><div class="mut">Colour</div><div class="row" style="justify-content:flex-start;margin:6px 0 12px">';
    COLORS.forEach(function (x) { h += '<button class="sw' + (x === c.color ? ' on' : '') + '" style="background:' + x + '" aria-label="Colour ' + x + '" onclick="setCard(\'ap\',\'color\',\'' + x + '\')"></button>'; });
    h += '</div><button class="btn alt" onclick="setCard(\'ap\',\'on\',' + (c.on ? 0 : 1) + ')">' + (c.on ? 'Hide from customers' : 'Show to customers') + '</button>';
  } else {
    var low = staff() ? db.ap.filter(function (x) { return ragHw(x).lv !== 'green'; }).length : 0;
    h += '<h3>' + esc(c.title) + '</h3><div class="mut">' + esc(c.desc) + '</div>' + (c.on ? '' : '<div class="badge low" style="margin-top:8px">Hidden from customers</div>') + (staff() ? '<div style="margin:10px 0">' + (low ? '<span class="rag rag-amber"><i aria-hidden="true">▲</i> ' + low + ' parts to restock</span>' : '<span class="rag rag-green"><i aria-hidden="true">●</i> Stock healthy</span>') + '</div>' : '') + '<div><button class="btn" onclick="open_(\'ap\')">Open ' + esc(c.title) + '</button></div>';
  }
  return h + '</div>';
};
