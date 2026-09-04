/* ═══════════════════════════════════════════════════════════
   ANTI-SIMILARITY HELPER FUNCTIONS
═══════════════════════════════════════════════════════════ */

function getCurrentAnalystId() {
  // Get current analyst from session context
  const analyst = LS.get('aba5_analyst') || {};
  return analyst.id || 'default_analyst';
}
const _therapistOwner = Object.create(null);
function _caseGuideSqlNotice(){
  if(document.getElementById('abaCaseGuideSql')) return;
  var b = document.createElement('div');
  b.id = 'abaCaseGuideSql';
  b.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:100001;background:#7a4a00;color:#fff;padding:10px 16px;border-radius:8px;font-family:system-ui,sans-serif;font-size:12px;max-width:90%;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:12px;align-items:center';
  var t = document.createElement('span');
  t.innerHTML = 'La sticky note se guarda solo en este equipo: falta la columna en Supabase. ' +
                'Corre una vez en el SQL editor:<br><code style="background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;display:inline-block;margin-top:4px">' +
                'alter table staff add column if not exists case_guide text default \'\';</code>';
  var x = document.createElement('button');
  x.textContent = '\u00d7';
  x.style.cssText = 'background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0 2px';
  x.addEventListener('click', function(){ b.remove(); });
  b.appendChild(t); b.appendChild(x);
  document.body.appendChild(b);
}

// Multi-therapist: therapists[] each has {id, name, credential}
// clients[] each has {id, name, therapistId}
let therapists = [];   // hydrated from Supabase after login
let clients    = [];

/* ═══════════════════════════════════════════════════════════
   ROTATION / HISTORY ENGINE
   Tracks per-client usage of mal, rep, goals, tasks.
   Smart selectors weight items by recency — least-used first.
═══════════════════════════════════════════════════════════ */

function getHistory(clientId){
  // Normalize against the full schema every time: older client history records
  // predate fields added later (e.g. p156, tasks) and would otherwise come back
  // missing those keys, crashing recordSessionHistory with "Cannot read
  // properties of undefined (reading 'push')" on an existing field's .push().
  const DEFAULT_HISTORY = {mal:[],rep:[],g1:[],g2:[],g3:[],g4:[],p156:[],tasks:[],sessions:[]};
  const stored = LS.get('aba5_hist_'+clientId);
  return stored ? Object.assign({}, DEFAULT_HISTORY, stored) : {...DEFAULT_HISTORY};
}

// Normalize legacy string arrays to {name, status} objects
function normalizeBehaviorArr(arr) {
  return arr.map(x => typeof x === 'string' ? {name:x, status:'active'} : x);
}

// Get only active behaviors for note generation. 'new' (auto-suggested but not yet
// confirmed) items ARE included so notes work immediately; the user removes unwanted ones.
function getActiveBehaviors(pools, type) {
  const arr = normalizeBehaviorArr(pools[type] || []);
  return arr.filter(x=>x.status==='active' || x.status==='new').map(x=>x.name);
}

// Map of maladaptive behavior name -> documented function class (escape / attention
// / tangible / automatic). Empty for behaviors with no recorded function.
// Function map for a pool. Defaults to maladaptive behaviors; pass 'rep' to get the
// function each REPLACEMENT serves — a replacement is only functionally equivalent
// with respect to a function, and a client typically has several replacements
// precisely because the behaviors are multiply maintained.
function getBehaviorFnMap(pools, type) {
  const map = {};
  normalizeBehaviorArr((pools && pools[type || 'mal']) || []).forEach(b => { if (b && b.name && b.fn) map[b.name] = b.fn; });
  return map;
}

// Annotate a list of behavior names with their function so every note-generation
// path can apply the function-matched intervention rule, e.g.
// "Aggression [function: escape] | Screaming [function: attention]".
function annotateBehaviorsWithFn(names, fnMap) {
  return (names || []).map(n => {
    const fn = fnMap && fnMap[n];
    return fn ? (n + ' [function: ' + fn + ']') : n;
  });
}

// Vista por terapeuta: NO decide la propagacion, informa de la concentracion.
function _therapistDefects(therapistId){
  if(!therapistId) return [];
  var count = {}, tot = {};
  (clients || []).filter(function(c){ return c && c.therapistId === therapistId; }).forEach(function(c){
    var pools = LS.get('aba5_pools_' + c.id) || {};
    var d = pools.defects || {};
    Object.keys(d).forEach(function(k){
      // Solo lo CONFIRMADO por una persona se propaga. Una sospecha del guard vale
      // para avisar en su propio cliente; no para sentenciar sobre los demas.
      if(!DEFECT_LABELS[k] || !(d[k].n > 0) || d[k].state !== 'ok') return;
      count[k] = (count[k] || 0) + 1;          // en cuantos clientes distintos
      tot[k]   = (tot[k] || 0) + d[k].n;       // veces en total
    });
  });
  return Object.keys(count)
    .map(function(k){ return { kind: k, clients: count[k], total: tot[k] }; })
    .filter(function(x){ return x.clients >= 2; })
    .sort(function(a,b){ return (b.clients - a.clients) || (b.total - a.total); });
}

function _therapistOf(clientId){
  var c = (clients || []).find(function(x){ return x && x.id === clientId; });
  return c ? c.therapistId : '';
}



// Copia el contenido exacto de un campo de salida al portapapeles.
/* Ficha de referencia del analista. No es contenido clinico ni entra en ninguna
   nota: es la chuleta que el analista consulta al montar la sesion -que caso lleva
   con BCaBA, cual con RBT, cuantas horas de supervision y de parent training-. Se
   guarda por analista y NUNCA se envia al modelo: contiene nombres reales de
   clientes, y todo lo que viaja al prompt va de-identificado.                     */
/* UNA sola ficha, siempre la misma. Antes se guardaba por terapista, asi que al
   cambiar de terapista aparecia vacia y habia que volver a pegarla — que es
   exactamente lo que no puede pasar con una chuleta de consulta. Es la referencia
   de quien monta las sesiones, no de un terapista concreto: mezcla casos de varios
   analistas a proposito.

   No se envia nunca al modelo: contiene nombres reales de clientes, y todo lo que
   viaja a un prompt va de-identificado.                                           */
/* Una nota adhesiva POR TERAPISTA: la guia para montar los setups de SUS clientes.
   Cada uno tiene la suya y no se mezclan.

   Dos fallos de guardado que tenia la version anterior, los dos corregidos aqui:

   1. El autoguardado resolvia el terapista en el momento de ESCRIBIR EN DISCO, no
      en el momento de teclear. Si escribias y cambiabas de terapista antes de que
      saltara el temporizador, el texto se guardaba bajo el terapista NUEVO: se
      perdia lo tuyo y se corrompia lo del otro. Ahora la clave se captura al
      teclear y viaja con el temporizador.
   2. Cambiar de terapista no volcaba lo pendiente. Ahora se fuerza el guardado
      antes de cambiar de nota.                                                    */
/* Clave LOCAL heredada. La nota vive ahora en el registro del terapista
   (therapists[].caseGuide -> staff.case_guide), asi esta en cualquier
   dispositivo donde se abra la cuenta. Esta clave solo se usa para migrar lo
   que quedo guardado en equipos donde ya se escribio algo. */
function _caseGuideKey(thId){ return 'aba5_caseguide_' + thId; }
function _guideTherapist(thId){
  return (typeof therapists !== 'undefined' ? therapists : []).find(function(x){ return x && x.id === thId; }) || null;
}
function _caseGuideOpenKey(){ return 'aba5_caseguide_open'; }
function _caseGuideTh(){ return (document.getElementById('genTherapistSel')||{}).value || ''; }
function _guideName(thId){
  var t = (typeof therapists !== 'undefined' ? therapists : []).find(function(x){ return x && x.id === thId; });
  return (t && t.name) || '';
}

/* ── AUTOGUARDADO COMPARTIDO ────────────────────────────────────────────────
   Una sola cola para las dos vistas de la misma nota (ficha del terapista y
   GENERATE). El TERAPISTA se fija al TECLEAR, nunca al escribir: si se cambia
   de terapista antes de que salte el temporizador, el texto sigue viajando con
   su propio id y no cae en la nota de otro.
   Cada volcado guarda el roster completo, que es lo que dispara la subida a
   Supabase; por eso el retardo es mas largo que el de un campo local y no se
   escribe nada si el texto no cambio.                                        */
var _guideTimer = null, _guidePending = {};

function _guideQueue(thId, val, msgId){
  var msg = msgId && document.getElementById(msgId);
  if(msg){ msg.textContent = 'guardando…'; msg.style.color = 'var(--text3)'; }
  _guidePending[thId] = { val: val, msgId: msgId };
  clearTimeout(_guideTimer);
  _guideTimer = setTimeout(_flushCaseGuide, 1200);
}

// Valor guardado + lo que todavia no se ha volcado, para que las dos vistas coincidan.
function _guideValue(thId){
  if(_guidePending[thId]) return _guidePending[thId].val;
  var t = _guideTherapist(thId);
  return (t && t.caseGuide) || '';
}

/* Pinta un textarea sin pisar lo que se esta escribiendo: solo recarga si
   cambio de terapista o si el campo no tiene el foco. */
function _guidePaint(taId, whoId, thId, emptyLabel){
  var ta  = document.getElementById(taId);
  var who = document.getElementById(whoId);
  if(!ta) return;
  if(!thId){
    if(who) who.textContent = emptyLabel;
    if(document.activeElement !== ta){ ta.value = ''; }
    ta.disabled = true; ta.dataset.th = '';
    return;
  }
  if(who) who.textContent = _guideName(thId);
  ta.disabled = false;
  if(ta.dataset.th !== thId || document.activeElement !== ta){
    ta.value = _guideValue(thId);
    ta.dataset.th = thId;
  }
}

/* ── VISTA 2: selector de GENERATE ──────────────────────────────────────── */
/* Estado del panel: 'open' | 'closed' | sin valor = automatico (se abre solo
   cuando ese terapista ya tiene setup guardado, para que se vea sin buscarlo). */
function _caseGuideOpen(th){
  var v = LS.get(_caseGuideOpenKey());
  if(v === 'open'  || v === true)  return true;
  if(v === 'closed'|| v === false) return false;
  return !!(th && String(_guideValue(th)).trim());
}
