// Generate the sample catalogue from the existing prototype source. No demo users are copied.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(root, 'src/original.html'), 'utf8');
const script = original.match(/<script>([\s\S]*?)<\/script>/)[1];
const marker = script.indexOf('var COLORS=');
if (marker < 0) throw new Error('Could not find the prototype seed definitions.');

const context = vm.createContext({});
vm.runInContext(script.slice(0, marker), context);
let state = JSON.parse(JSON.stringify(context.seed()));
state.agencies = [{ id: 1, name: 'Sri Karthikeya Rice Industries', brand: 'JPC', on: 1 }];
state.exp = [];
state.nx = 1;
state.maint = [];
state.machines = ['Rice mill', 'Polisher', 'Sortex machine', 'Conveyor', 'Packing machine', 'Generator', 'Other'];
state.settings = Object.assign({}, state.settings, { vendor: 'Regular cover vendor', rate: 500, idleMin: 15, demo: 0, fee: 60, free: 1500 });
state.rag = { hwRedPct: 25, riceAmber: 10, orderAmberH: 24, orderRedH: 48, expAmberD: 2, expRedD: 5, payAmberD: 3, payRedD: 7, retAmberD: 2, retRedD: 4 };
state.users = [];
state.invites = [];
state.spent = [];
state.wish = {};
state.lock = {};
state.reviews = [];
state.audit = [];
state.stockLog = [];
state.coupons = [
  { code: 'WELCOME5', type: 'pct', value: 5, min: 500, max: 150, on: 1, exp: '' },
  { code: 'BULK100', type: 'flat', value: 100, min: 2000, max: 100, on: 1, exp: '' }
];
state.demoUsers = 0;
state.ver = 2;

const parts = fs.readFileSync(path.join(root, 'src/50-parts.js'), 'utf8');
const start = parts.indexOf('function P(');
const endMarker = '  db.stockLog = [];\n}';
const end = parts.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Could not find the parts catalogue seed.');
const initParts = parts.slice(start, end + endMarker.length);
const partsContext = vm.createContext({ db: state, CARDS0: context.CARDS0, A2: {} });
vm.runInContext(initParts, partsContext);
state = JSON.parse(JSON.stringify(state));
state.cards.ap = {
  title: 'Auto Spare Parts',
  desc: 'Spare parts for cars, bikes, autos, trucks and tractors. Find parts by vehicle type and model, with live stock and low-stock alerts.',
  color: '#0f766e',
  on: 1
};
state.stockLog = [];

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/seed.json'), JSON.stringify(state, null, 2) + '\n');
console.log('Wrote data/seed.json without demo users or credentials.');
