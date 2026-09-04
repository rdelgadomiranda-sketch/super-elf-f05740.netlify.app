const _clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));   // hydrated from Supabase after login

let activeTherapistId = null;   // selected in therapist tab/clients tab
let activeClientId    = null;
let currentGoals      = null;
let currentNoteType   = '97155-rbt';
let _sessionCount = 0;  // counts generations within this client session for structural variation
let pendingDocText    = null;
let pendingDocNames   = [];
let _pdfWorkerPromise = null;
let pendingMonthDataText = null;

// Repair common JSON malformations that Gemini occasionally produces:
// trailing commas, and missing commas between array elements or object entries.
function _repairJson(s){
  let t = s.trim();
  // Remove trailing commas before } or ]
  t = t.replace(/,\s*([}\]])/g, '$1');
  // Insert missing commas between adjacent objects/arrays: }{ → },{  and ]" → ],"
  t = t.replace(/}\s*{/g, '},{');
  t = t.replace(/}\s*"/g, '},"');
  t = t.replace(/]\s*\[/g, '],[');
  // Insert missing comma between a closing quote/number and the next opening quote
  // (e.g.  "a":"x" "b":"y"  → "a":"x","b":"y")
  t = t.replace(/("(?:[^"\\]|\\.)*"|\d)\s+(")/g, '$1,$2');
  return t;
}

// Compare two client names tolerantly: case-insensitive, accent-insensitive,
// order-insensitive (first/last swapped), ignoring extra spaces and punctuation.
// Returns true if they plausibly refer to the same person.
function _namesLikelyMatch(a, b){
  const norm = s => (s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')  // strip accents
    .replace(/[.]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  const na = norm(a), nb = norm(b);
  if(!na || !nb) return true; // can't compare → don't block
  if(na === nb) return true;
  // Compare as sets of name tokens (handles "First Last" vs "Last First")
  const ta = na.split(' ').filter(Boolean).sort();
  const tb = nb.split(' ').filter(Boolean).sort();
  if(ta.join(' ') === tb.join(' ')) return true;
  // Consider a match if most tokens overlap (handles middle names / partial)
  const setB = new Set(tb);
  const shared = ta.filter(t => setB.has(t)).length;
  const minLen = Math.min(ta.length, tb.length);
  // Require at least 2 shared name tokens, or all tokens of the shorter name
  if(shared >= 2) return true;
  if(minLen === 1 && shared === 1) return true;
  return false;
}

/* ═══════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════ */
const uid = () => `c${Date.now()}${Math.random().toString(36).slice(2,5)}`;
const one = arr => arr[Math.floor(Math.random()*arr.length)];
const pick = (arr,n) => [...arr].sort(()=>Math.random()-.5).slice(0,Math.min(n,arr.length));
const today = () => new Date().toISOString().split('T')[0];
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function showMsg(id, text, type, ms=3000) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'msg msg-' + type;
  if (ms) setTimeout(() => { el.textContent=''; el.className='msg'; }, ms);
}

function nDaysAgo(n){
  const d = new Date();
  d.setDate(d.getDate()-n);
  return d.toISOString().split('T')[0];
}

