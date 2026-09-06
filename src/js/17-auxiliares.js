"function"==typeof define&&define.amd?define(function(){return LZString}):"undefined"!=typeof module&&null!=module?module.exports=LZString:"undefined"!=typeof angular&&null!=angular&&angular.module("LZString",[]).factory("LZString",function(){return LZString});
setInterval(() => { _mirrorTryReconnect(); }, 30000);
window.addEventListener('online', () => _mirrorTryReconnect());
window.abaLogout = abaLogout;

document.addEventListener('DOMContentLoaded', _boot);
// Cerrar la pestana no puede tragarse los ultimos 400 ms de escritura.
window.addEventListener('beforeunload', function(){ try{ _flushCaseGuide(); }catch(e){} });


// One-time migration: compress any existing uncompressed large-text values.
// Each compressed value is smaller than the original, so this only REDUCES usage
// and is safe to run even when storage is near quota.
(function _migrateCompressLargeKeys(){
  try {
    const keys = [];
    for(let i=0;i<localStorage.length;i++){ keys.push(localStorage.key(i)); }
    let migrated = 0;
    keys.forEach(k => {
      if(!_lzShouldCompress(k)) return;
      const raw = localStorage.getItem(k);
      if(raw == null || raw.indexOf(_LZ_MARK) === 0) return; // already compressed
      try {
        const obj = JSON.parse(raw);            // valid uncompressed JSON
        localStorage.setItem(k, _LZ_MARK + LZString.compressToUTF16(JSON.stringify(obj)));
        migrated++;
      } catch(e){ /* leave as-is if unparseable */ }
    });
    if(migrated) console.log('[storage] Compressed', migrated, 'existing records to free space.');
  } catch(e){ /* non-fatal */ }
})();

// Nombres que la ficha AUTORIZA hoy (activos y nuevos). Devuelve null cuando la
// ficha no tiene nada configurado de ese tipo: en ese caso no se puede afirmar que
// algo este retirado y no se filtra nada.
function _allowedNames(clientId, type){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var arr = normalizeBehaviorArr(pools[type] || []);
  if(!arr.length) return null;
  // El reducido manda sobre la ficha en lo que afirma: si da el item por
  // masterizado o en pausa, la ficha se corrige antes de decidir nada.
  try{ _syncStatusFromAssessment(clientId); }catch(e){}
  arr = normalizeBehaviorArr((LS.get('aba5_pools_' + clientId) || {})[type] || []);
  var ok = {};
  arr.forEach(function(x){
    var st = (x && x.status) || 'active';
    if(x && x.name && (st === 'active' || st === 'new')) ok[String(x.name).trim().toLowerCase()] = 1;
  });
  // Lo que el reducido ya no menciona sale de la seleccion automatica... salvo que
  // quitarlo lo deje todo vacio: una coincidencia de nombre fallida no puede dejar
  // la nota sin nada. En ese caso se conserva y el aviso de pantalla lo dice.
  var absent = _absentFromAssessment(clientId, type);
  var keys = Object.keys(ok);
  var left = keys.filter(function(k){ return !absent[k]; });
  if(left.length) keys.forEach(function(k){ if(absent[k]) delete ok[k]; });
  return ok;
}

function selectBehaviorsSmart(clientId, pools, malCount, repCount){
  const h = getHistory(clientId);
  // Antes de elegir nada: corregir la ficha con lo que el reducido afirma y
  // descartar lo que el reducido ya no lista. Se documenta el plan vigente, no el
  // historico de la ficha.
  try{ _syncStatusFromAssessment(clientId); pools = LS.get('aba5_pools_' + clientId) || pools; }catch(e){}
  const _absMal = _absentFromAssessment(clientId, 'mal');
  const _absRep = _absentFromAssessment(clientId, 'rep');
  const _drop = function(list, absent){
    const left = list.filter(function(n){ return !absent[String(n).trim().toLowerCase()]; });
    return left.length ? left : list;      // nunca dejar la seleccion sin candidatos
  };
  const malActive = _drop(getActiveBehaviors(pools, 'mal'), _absMal);
  const repActive = _drop(getActiveBehaviors(pools, 'rep'), _absRep);
  const nMal = malCount || 2;
  let nRep = repCount || 2;
  // Cap the replacement count so the active pool can always sustain a full turnover
  // (2*nRep <= pool). Documenting more replacements than half the active pool
  // mathematically forces repeats across consecutive sessions, so when the active
  // replacement pool is small we reduce how many are documented (never below 2) to
  // keep consecutive notes free of repeated replacements. Enable more active
  // replacement programs in the client config to restore a higher per-note count.
  if(repActive.length){ nRep = Math.min(nRep, Math.max(2, Math.floor(repActive.length/2))); }
  // If no behaviors configured, return empty — note will use summary text instead
  const result = {
    mal: malActive.length ? rotatingPick(malActive, h.mal, nMal) : [],
    rep: repActive.length ? rotatingPick(repActive, h.rep, nRep, {strong:true}) : []
  };
  return result;
}

// Record what was used in a session
function recordSessionHistory(clientId, sessionData){
  const h = getHistory(clientId);
  const date = today();

  // Record behaviors
  if(sessionData.mal) h.mal.push(...sessionData.mal);
  if(sessionData.rep) h.rep.push(...sessionData.rep);

  // Record goals
  const g = sessionData.goals;
  if(g){
    if(g.g1) h.g1.push(g.g1);
    if(g.g2) h.g2.push(g.g2);
    if(g.g3) h.g3.push(g.g3);
    if(g.g4) h.g4.push(g.g4);
    if(g.p156){
      const arr = Array.isArray(g.p156) ? g.p156 : [g.p156];
      arr.forEach(v=>{ if(v) h.p156.push(v); });
    }
    if(g.tasks) h.tasks.push(...g.tasks.map(t=>typeof t==='string'?t:t.code));
  }

  // Record session log entry
  h.sessions.push({ date, codes: sessionData.codes||[] });

  // Keep history to last 60 entries per field to avoid unbounded growth
  ['mal','rep','g1','g2','g3','g4','p156','tasks'].forEach(k=>{
    if(h[k].length > 60) h[k] = h[k].slice(-60);
  });
  if(h.sessions.length > 90) h.sessions = h.sessions.slice(-90);

  saveHistory(clientId, h);
}

/* ═══════════════════════════════════════════════════════════
   THERAPIST MANAGEMENT
═══════════════════════════════════════════════════════════ */
function getTherapist(id) {
  return therapists.find(t=>t.id===id) || null;
}

function getActiveTherapist() {
  return getTherapist(activeTherapistId);
}

// For note generation: get therapist of selected client
function getTherapistForClient(clientId) {
  const c = clients.find(x=>x.id===clientId);
  return c ? getTherapist(c.therapistId) : null;
}

function isRBTTherapist(therapistId) {
  const t = getTherapist(therapistId);
  return t ? t.credential === 'RBT' : false;
}

function isRBT() {
  const genSel = document.getElementById('genClientSel');
  const clientId = genSel ? genSel.value : '';
  if (clientId) {
    const c = clients.find(x=>x.id===clientId);
    if (c) return isRBTTherapist(c.therapistId);
  }
  return false;
}

function selectTherapistForEdit(id) {
  activeTherapistId = id;
  const t = getTherapist(id);
  if (!t) return;
  document.getElementById('aName').value = t.name;
  document.getElementById('aCred').value = t.credential;
  if(document.getElementById('aIncludeDuration')) document.getElementById('aIncludeDuration').checked = t.includeDuration !== false;
  if(document.getElementById('aDataOnly156')) document.getElementById('aDataOnly156').checked = !!t.dataOnly156;
  document.getElementById('therapistFormTitle').textContent = `Edit — ${t.name}`;
  document.getElementById('clearTherapistBtn').style.display = 'inline-flex';
  const notice = document.getElementById('rbtNotice');
  if (notice) notice.style.display = t.credential==='RBT' ? 'block' : 'none';
  if (typeof _renderThGuide === 'function') _renderThGuide();
  renderTherapistList();
  // Scroll to form
  document.getElementById('therapistFormTitle').closest('.card')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function clearTherapistForm() {
  activeTherapistId = null;
  document.getElementById('aName').value = '';
  document.getElementById('aCred').value = 'BCBA';
  if(document.getElementById('aIncludeDuration')) document.getElementById('aIncludeDuration').checked = true;
  document.getElementById('therapistFormTitle').textContent = 'Add Therapist';
  document.getElementById('clearTherapistBtn').style.display = 'none';
  document.getElementById('rbtNotice').style.display = 'none';
  if (typeof _renderThGuide === 'function') _renderThGuide();
  renderTherapistList();
} // no-op
function loadAnalyst() {} // no-op
function getAnalyst() { return getActiveTherapist() || {}; }

/* ═══════════════════════════════════════════════════════════
   CLIENT MANAGEMENT
═══════════════════════════════════════════════════════════ */
function clientLabel(c) {
  const t = getTherapist(c.therapistId);
  const tShort = t ? t.name.split(' ')[0] : '';
  return tShort ? `${tShort} · ${c.name}` : c.name;
}

// A client is an orphan when its therapistId is empty or points to a therapist that
// is no longer registered. Nothing in the UI could reach these clients before: every
// list filters by a selected therapist, so an orphan could be neither opened nor
// deleted, and its data stayed in storage for ever.
var ORPHAN_FILTER = '__no_therapist__';  // var: read by refreshAllTherapistSelects, declared below it
function _orphanClients(){
  return clients.filter(function(c){
    return !c.therapistId || !therapists.some(function(t){ return t.id === c.therapistId; });
  });
}

function diagnoseOrphans(){
  var orph = _orphanClients();
  if(!orph.length){ alert('No hay clientes sin terapista.'); return; }
  var mine = [], none = [], other = [];
  orph.forEach(function(c){
    var g = _clientOwnership(c.id);
    (g.kind === 'mio' ? mine : g.kind === 'sin-dueno' ? none : other).push(c.name || c.id);
  });
  var txt = 'CLIENTES SIN TERAPISTA: ' + orph.length + '\n\n';
  if(other.length){
    txt += '- ' + other.length + ' pertenecen a OTRA CUENTA:\n   ' + other.join(', ')
      + '\n   Al borrarlos aqui desaparecen de la pantalla, pero la fila sigue en la nube y vuelve\n'
      + '   al recargar. Solo puede borrarlos su propietario, desde su sesion. Esta es la causa\n'
      + '   de que reaparezcan.\n\n';
  }
  if(none.length){
    txt += '- ' + none.length + ' no tienen propietario registrado:\n   ' + none.join(', ')
      + '\n   Antes el sistema ni siquiera intentaba borrarlos en la nube. Desde esta version si:\n'
      + '   borralos otra vez y deberian desaparecer definitivamente.\n\n';
  }
  if(mine.length){
    txt += '- ' + mine.length + ' son tuyos y se borran sin problema:\n   ' + mine.join(', ') + '\n\n';
  }
  txt += 'Cada cliente se borra uno a uno con su boton "Borrar cliente".';
  alert(txt);
}

function selectClientForEdit(id) {
  if(_clientSwitchBlocked(id)){ _refuseClientSwitch(null); return; }
  activeClientId = id;
  const c = clients.find(x=>x.id===id);
  if (!c) return;
  document.getElementById('cName').value = c.name || '';
  // Reset pending doc text — each client's upload is independent
  pendingDocText = null; pendingDocNames = [];
  document.getElementById('sumFilename').textContent = '';
  document.getElementById('sumProcessing').textContent = '';
  renderClientList();
  showSummaryPanel(id);
  document.getElementById('editCardTitle').closest('.card')?.scrollIntoView({behavior:'smooth', block:'start'});
}

function clearCurrentClient() {
  activeClientId = null;
  pendingDocText = null; pendingDocNames = [];
  document.getElementById('cName').value = '';
  document.getElementById('cPlanSummary').value = '';
  document.getElementById('sumFilename').textContent = '';
  document.getElementById('sumProcessing').textContent = '';
  document.getElementById('summaryCard').style.display = 'none';
  document.getElementById('editCardTitle').textContent = 'Add Client';
  const clearBtn = document.getElementById('clearClientBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  renderClientList();
}

function exportRbtPackage(clientId){
  const c = clients.find(x=>x.id===clientId);
  if(!c){ alert('Client not found.'); return; }
  const pools = LS.get('aba5_pools_'+clientId)||{};
  const summary = LS.get('aba5_sum_'+clientId)||'';
  const therapist = therapists.find(t=>t.id===c.therapistId)||{};

  // Build intervention list from plan summary using known EBP terms
  const KNOWN_INT = ['Escape Extinction','Extinction','DRA','DRI','DRO','FCT',
    'Antecedent Manipulation','Response Blocking','Redirection','RIRD','NCR',
    'Behavioral Momentum','DTT','NET','Incidental Teaching','Prompt Fading',
    'Shaping','Token Economy','Task Analysis','Differential Reinforcement',
    'Visual Supports','High-p request sequence','Demand fading'];
  const planInts = KNOWN_INT.filter(i=>
    summary.toLowerCase().includes(i.toLowerCase().substring(0,8))
  );

  const pkg = {
    _type: 'rbt_client_package',
    _version: '1.0',
    _exported: new Date().toISOString(),
    _exportedFrom: 'ABA Clinical Notes Generator',
    clientCode: c.name,
    clientId: c.id,
    supervisorCredential: therapist.credential||'BCBA',
    summary,
    mal: normalizeBehaviorArr(pools.mal||[]).filter(x=>x.status==='active').map(x=>x.name),
    rep: normalizeBehaviorArr(pools.rep||[]).filter(x=>x.status==='active').map(x=>x.name),
    reinforcers: pools.reinforcers||'',
    planInterventions: planInts
  };

  const blob = new Blob([JSON.stringify(pkg, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RBT_Package_${c.name.replace(/[^a-zA-Z0-9]/g,'_')}_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// What this client actually has stored, so a destructive confirmation can say what
// is about to be lost instead of asking blind.
function _clientDataSummary(clientId){
  var n = 0, bits = [];
  var has = function(pref){ var v = LS.get(pref + clientId); return v !== null && v !== undefined && v !== ''; };
  ABA_CLIENT_KEY_PREFIXES.forEach(function(pref){ if(has(pref)) n++; });
  if(has('aba5_assess_'))  bits.push('assessment reducido');
  if(has('aba5_pools_'))   bits.push('conductas y reemplazos');
  if(has('aba5_abaevid_')) bits.push('configuración de AbaMatrix');
  var notes = LS.get('aba5_notes_' + clientId);
  if(Array.isArray(notes) && notes.length) bits.push(notes.length + ' nota(s) guardada(s)');
  var pools = LS.get('aba5_pools_' + clientId) || {};
  if(Array.isArray(pools.analystNotes) && pools.analystNotes.length){
    bits.push(pools.analystNotes.length + ' corrección(es) del analista');
  }
  return { keys: n, bits: bits };
}

function _purgeClientData(clientId){
  if(!clientId) return 0;
  var n = 0;
  ABA_CLIENT_KEY_PREFIXES.forEach(function(pref){
    try{
      var k = pref + clientId;
      var v = LS.get(k);
      if(v !== null && v !== undefined) n++;
      LS.del(k);
    }catch(e){}
  });
  return n;
}

function _applyPendingProposal(){
  if(_assessProposedFor !== _assessCurrentClientId){
    showMsg('assessMsg','\u26D4 Esa reducci\u00f3n es de otro cliente. No se pega aqu\u00ed.','err');
    return;
  }
  var el = document.getElementById('assessCore');
  if(el) el.value = _assessProposedText;
  _renderPendingProposal();
  showMsg('assessMsg','Reducci\u00f3n recuperada. Rev\u00edsala y pulsa Guardar.','ok');
}


/* ── CANDADO DE CLIENTE DURANTE UNA OPERACION LARGA ──────────────────────────
   Casi todo el trabajo pesado (reducir un assessment, generar un lote de notas,
   rellenar pools) es asincrono y lee el cliente de una variable GLOBAL —
   activeClientId, _abaClientId, _assessCurrentClientId — cada vez que la necesita.
   Una auditoria del arbol encontro 37 lecturas de esas variables DESPUES de un
   await, repartidas por 20 funciones. Todas son la misma bomba: si se cambia de
   ficha mientras la operacion corre, la segunda mitad del trabajo se hace sobre
   OTRO cliente. Asi es como un cliente termina con programas que no son suyos.

   Arreglarlo funcion por funcion serian 20 parches y el proximo se olvidaria. Se
   ataca la causa: mientras haya una operacion en curso, el cliente NO PUEDE
   cambiar. Las variables globales quedan congeladas y las 37 lecturas pasan a ser
   correctas por construccion.                                                    */
var _CLIENT_LOCK = null;                    // { id, label, t0, depth }
var _CLIENT_LOCK_TIMER = null;
var CLIENT_LOCK_MAX_MS = 10*60*1000;        // tope duro: nada bloquea mas de 10 min

/* El candado se cuenta por PROFUNDIDAD. Si dos operaciones del mismo cliente se
   solapan (doble clic, una llamada que arranca otra), la primera en terminar no
   puede soltar el candado de la que sigue corriendo. */
function _lockClient(id, label){
  if(!id) return false;
  if(_CLIENT_LOCK && _CLIENT_LOCK.id === id){
    _CLIENT_LOCK.depth++;
    _CLIENT_LOCK.label = label || _CLIENT_LOCK.label;
    _renderClientLock();
    return true;
  }
  _CLIENT_LOCK = { id: id, label: label || 'una operación', t0: Date.now(), depth: 1 };
  clearInterval(_CLIENT_LOCK_TIMER);
  /* El tope no puede depender de que alguien intente cambiar de cliente para
     dispararse: si una llamada se cuelga y nadie toca nada, el candado y su barra
     se quedarian ahi para siempre. Un reloj propio lo suelta pase lo que pase. */
  _CLIENT_LOCK_TIMER = setInterval(function(){
    if(!_CLIENT_LOCK){ clearInterval(_CLIENT_LOCK_TIMER); _CLIENT_LOCK_TIMER = null; return; }
    if(Date.now() - _CLIENT_LOCK.t0 > CLIENT_LOCK_MAX_MS){
      console.warn('[lock] soltado por tiempo tras 10 min');
      _forceUnlockClient(true);
      return;
    }
    _renderClientLock();
  }, 1000);
  _renderClientLock();
  return true;
}

function _unlockClient(){
  if(!_CLIENT_LOCK) return;
  _CLIENT_LOCK.depth--;
  if(_CLIENT_LOCK.depth > 0){ _renderClientLock(); return; }
  _forceUnlockClient(false);
}

// Salida de emergencia. La usa el reloj, el boton de la barra y cualquier fallo.
function _forceUnlockClient(byTimeout){
  _CLIENT_LOCK = null;
  clearInterval(_CLIENT_LOCK_TIMER);
  _CLIENT_LOCK_TIMER = null;
  _renderClientLock();
  if(byTimeout && typeof showMsg === 'function'){
    try{ showMsg('abaMsg','La operación llevaba más de 10 minutos sin terminar: se soltó el bloqueo de cliente para que puedas seguir trabajando. Si la operación termina después, comprueba el resultado antes de darlo por bueno.','err'); }catch(e){}
  }
}

// Boton de la barra: soltar a mano si algo se quedo colgado.
function _breakClientLock(){
  if(!_CLIENT_LOCK) return;
  var msg = 'Vas a soltar el bloqueo mientras la operación sigue en curso.\n\n'
          + 'Hazlo solo si se quedó colgada. Si todavía está trabajando y cambias de cliente, '
          + 'lo que quede por escribir podría ir a la ficha equivocada.\n\n¿Soltar el bloqueo?';
  if(!confirm(msg)) return;
  _forceUnlockClient(false);
}

// Devuelve el candado si el cambio hay que impedirlo, o null si se puede pasar.
function _clientSwitchBlocked(targetId){
  if(!_CLIENT_LOCK) return null;
  // Salvavidas: un candado olvidado por un error no puede dejar la app inservible.
  if(Date.now() - _CLIENT_LOCK.t0 > CLIENT_LOCK_MAX_MS){ _forceUnlockClient(false); return null; }
  if(targetId && targetId === _CLIENT_LOCK.id) return null;
  return _CLIENT_LOCK;
}

function _lockedClientName(){
  var c = (clients||[]).find(function(x){ return x && x.id === (_CLIENT_LOCK||{}).id; });
  return (c && c.name) || 'el cliente en curso';
}

/* Rechaza el cambio y DEVUELVE el selector a su sitio: si el <select> se queda
   mostrando el cliente nuevo mientras el sistema sigue trabajando en el viejo, la
   pantalla miente, que es justo lo que hay que evitar. */
function _refuseClientSwitch(selectId){
  var L = _CLIENT_LOCK;
  if(!L) return false;
  var sel = selectId && document.getElementById(selectId);
  if(sel) sel.value = L.id;
  var msg = 'Hay ' + L.label + ' en curso para "' + _lockedClientName() + '".\n\n'
          + 'No se puede cambiar de cliente hasta que termine: la operación seguiría escribiendo, y lo haría sobre el cliente equivocado.\n\n'
          + 'Si crees que se quedó colgada, usa "Soltar el bloqueo" en la barra azul de arriba. '
          + 'En cualquier caso se suelta solo a los 10 minutos, y recargar la página también lo quita.';
  try{ alert(msg); }catch(e){}
  _renderClientLock();
  return true;
}


/* De donde sale el cliente de cada pantalla. Se resuelve UNA vez, al pulsar el
   boton, y ese es el cliente que queda bloqueado mientras dura la operacion. */
function _lockClientId(src){
  if(src === 'aba')    return _abaClientId;
  if(src === 'review') return _reviewClientId;
  if(src === 'assess') return _assessCurrentClientId;
  if(src === 'active') return activeClientId;
  var el = document.getElementById(src);
  return (el && el.value) || null;
}

/* Envoltorio para los botones que arrancan trabajo largo: bloquea el cliente,
   ejecuta, y suelta el candado pase lo que pase — tambien si la funcion revienta
   o devuelve una promesa rechazada. Se aplica en el manejador y no dentro de cada
   funcion para que no haya que acordarse de soltar el candado en cada return. */
function _lockDuring(fnName, label, src){
  var f = window[fnName];
  if(typeof f !== 'function'){ console.error('[lock] no existe ' + fnName); return; }
  var id = _lockClientId(src);
  var locked = id ? _lockClient(id, label) : false;
  var done = function(){ if(locked) _unlockClient(); };
  var p;
  try{ p = f(); }
  catch(e){ done(); throw e; }
  if(p && typeof p.then === 'function') p.then(done, function(e){ done(); throw e; });
  else done();
  return p;
}

function _deidentifyName(text, clientName){
  if(!text || !clientName) return text || '';
  var full = clientName.trim();
  var tokens = full.split(/\s+/).filter(function(t){ return t.replace(/[^\p{L}]/gu,'').length >= 3; });
  // Replace the full multi-word name first (so it collapses to a single "the
  // client"), then any remaining individual name parts (longest first).
  var patterns = [];
  if(tokens.length > 1) patterns.push(full);
  tokens.sort(function(a,b){ return b.length - a.length; }).forEach(function(t){ patterns.push(t); });
  var out = text;
  patterns.forEach(function(tok){
    var esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    var re = new RegExp('([^\\p{L}]|^)(' + esc + ')(\u2019s|\u0027s|\u2019S|\u0027S)?(?=[^\\p{L}]|$)', 'giu');
    out = out.replace(re, function(m, pre, _t, poss){ return pre + 'the client' + (poss ? '\u2019s' : ''); });
  });
  return out;
}

function _nameRemnant(text, clientName){
  if(!text || !clientName) return null;
  var tokens = clientName.trim().split(/\s+/).filter(function(t){ return t.replace(/[^\p{L}]/gu,'').length >= 3; });
  for(var i=0;i<tokens.length;i++){
    var esc = tokens[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('([^\\p{L}]|^)(' + esc + ')(?=[^\\p{L}]|$)', 'iu');
    if(re.test(text)) return tokens[i];
  }
  return null;
}

// N distinct social reinforcers to fall back on when the client's record has none.
function _socialReinforcerFallback(n){
  n = Math.max(2, parseInt(n, 10) || 2);
  return ABA_SOCIAL_REINFORCER_TYPES.slice(0, Math.min(n, ABA_SOCIAL_REINFORCER_TYPES.length));
}
// ALL function classes present in a string. Real assessments routinely document
// dual maintenance ("Escape + Automatic Reinforcement", "Attention + Tangibles"),
// so a behavior's function is a LIST, not a single value. _abaFnClass keeps
// returning the primary class for the places that need exactly one.
function _fnClassList(s){
  var t = String(s||'').toLowerCase(), out = [];
  if(/automatic|sensor|\bar\b/.test(t)) out.push('automatic');
  if(/escape|avoid/.test(t))            out.push('escape');
  if(/attention/.test(t))               out.push('attention');
  if(/tangible/.test(t))                out.push('tangible');
  return out;
}
// Best-effort guess of the FUNCTION a replacement label implies, from STRONG,
// distinctive vocabulary only. Returns '' when the label is generic/ambiguous
// (e.g. "functional communication", "manding", "communication training") so the
// caller NEVER flags on ambiguity — we only ever warn on a CLEAR cross-function
// mismatch between the replacement and the behavior's documented function.
function _repImpliedFnClass(text){
  var t = ' ' + String(text||'').toLowerCase() + ' ';
  // ESCAPE first: "request a break" contains "request" (tangible-ish) but the
  // distinctive token is "break"/"rest"/"done"/"help with the demand".
  if(/\bbreak\b|\bdescanso\b|\brest\b|all done|\btermin|\bpaus|ask(ing)? for help|pedir ayuda|help with the (task|demand)/.test(t)) return 'escape';
  if(/\balternativ|\bfidget|\bchew|manipulat|comparable stimulation|sensory substitut|self-stim/.test(t)) return 'automatic';
  if(/attention|atenci[oó]n|greet|saludo|raise (his|her|their|a )?hand|levantar la mano|call(ing)? (the )?(adult|teacher|over)|bid for|tap (the )?adult/.test(t)) return 'attention';
  if(/\bthe item\b|\bthe object\b|\bthe toy\b|access to|exchange|\bpecs\b|pedir el (objeto|item|ítem)|request(ing)? (the|an|a) (item|object|toy)|mand for (the )?item/.test(t)) return 'tangible';
  return '';
}
// Default reinforcer suggestions per class — used ONLY to pre-fill a derive
// draft. The BCBA edits/confirms; the map is not valid until validated.
var _MFC_DEFAULT_REINF = {
  escape:    ['break','removal of demand','pause of activity'],
  attention: ['social attention','praise','one-on-one interaction'],
  tangible:  ['access to the preferred item'],
  automatic: ['matched alternative stimulation'],
  other:     []
};

// Reescritura para la pestaña independiente "Revisar nota de RBT": corrige la
// nota pegada contra la info del cliente seleccionado en esa misma pestaña.
function _reviewRewriteNote(){
  return _abaRewriteNote({
    srcId:'reviewNoteIn', outId:'reviewRewriteOut', btnId:'reviewRewriteBtn',
    progId:'reviewRewriteProg', flagsId:'reviewRewriteFlags', msgId:'reviewMsg',
    clientId:_reviewClientId, emptyMsg:'Pega la nota del RBT a corregir.'
  });
}

// ── Pestaña independiente "Revisar nota de RBT" ──────────────────────────────
// Su propio estado de cliente, sin relación con AbaMatrix. El terapeuta y el
// cliente se eligen en esta misma pestaña y se audita la nota pegada contra la
// información de ESE cliente (reglas clínicas, terminología, cero fabricación,
// reforzador↔función/MFC y §59G-4.125). Solo señala; no reescribe.
var _reviewClientId = null;

function _reviewRefreshClientSelect(){
  var sel = document.getElementById('reviewClientSel');
  if(!sel) return;
  var cur = sel.value;
  var therapistId = (document.getElementById('reviewTherapistSel') || {}).value || '';
  var filtered = therapistId
    ? (clients||[]).filter(function(c){ return c.therapistId === therapistId; })
                   .sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); })
    : [];
  var opts = '<option value="">— select client —</option>';
  filtered.forEach(function(c){ opts += '<option value="' + c.id + '">' + esc(c.name||c.id) + '</option>'; });
  sel.innerHTML = opts;
  if(cur && filtered.find(function(c){ return c.id === cur; })) sel.value = cur;
  _reviewOnClientChange();
}

function _reviewOnClientChange(){
  var sel = document.getElementById('reviewClientSel');
  _reviewClientId = (sel && sel.value) ? sel.value : null;
}

// Rename a behavior or replacement, preserving everything attached to it (function,
// topography, interventions, status) AND its rotation history, so a rename does not
// look like a brand-new target and break the turnover that avoids repeats.
function renameChip(evt, type, oldName, clientId){
  evt.preventDefault(); evt.stopPropagation();
  if(!clientId) return;
  const pools = LS.get('aba5_pools_'+clientId) || {};
  let arr = normalizeBehaviorArr(pools[type] || []);
  const item = arr.find(x=>x.name===oldName);
  if(!item) return;
  const next = window.prompt('Nombre del ' + (type==='mal'?'behavior':'replacement') + ':', item.name);
  if(next === null) return;                       // cancelado
  const clean = String(next).trim().replace(/\s+/g,' ');
  if(!clean || clean === item.name) return;
  if(arr.some(x=>x!==item && x.name.toLowerCase()===clean.toLowerCase())){
    alert('Ya existe otro elemento con ese nombre.');
    return;
  }
  item.name = clean;
  pools[type] = arr;
  LS.set('aba5_pools_'+clientId, pools);
  // Carry the rotation history over to the new label.
  try{
    const h = getHistory(clientId);
    const key = (type==='mal') ? 'mal' : 'rep';
    if(Array.isArray(h[key])){
      h[key] = h[key].map(v => (v === oldName ? clean : v));
      saveHistory(clientId, h);
    }
  }catch(e){/* el renombrado no debe fallar por el historial */}
  renderChipPool(type==='mal'?'malPool':'repPool', arr, type, clientId);
}

/* Edit a behavior's documented function(s). Behaviors are frequently MULTIPLY
   MAINTAINED — aggression under both escape and attention is ordinary clinical
   reality — and the storage format has always supported it ("escape+attention"),
   but the editor could only cycle through one class at a time, so a second function
   could never be entered by hand: it only ever arrived from an import. This opens a
   small picker where every applicable function can be checked. */
const FN_CLASSES = ['escape','attention','tangible','automatic'];

function _closeFnPicker(){
  const old = document.getElementById('fnPicker');
  if(old) old.remove();
  document.removeEventListener('mousedown', _fnPickerOutside, true);
}
function _fnPickerOutside(e){
  const box = document.getElementById('fnPicker');
  if(box && !box.contains(e.target)) _closeFnPicker();
}

function cycleStatus(evt, type, val, clientId) {
  evt.preventDefault();
  if (!clientId) return;
  const pools = LS.get('aba5_pools_'+clientId) || {};
  let arr = normalizeBehaviorArr(pools[type] || []);
  const item = arr.find(x=>x.name===val);
  if (!item) return;
  const cycle = {active:'onhold', onhold:'mastered', mastered:'active', new:'active'};
  item.status = cycle[item.status||'active'] || 'active';
  pools[type] = arr;
  LS.set('aba5_pools_'+clientId, pools);
  renderChipPool(type==='mal'?'malPool':'repPool', arr, type, clientId);
}

// The agency document can list several clients one after another. Keep the section
// that belongs to THIS client; when only one client appears, take it regardless of
// how it is spelled.
function _pickClientSection(parsed, clientId){
  const names = Object.keys(parsed || {});
  if(!names.length) return {};
  if(names.length === 1) return parsed[names[0]];
  const c = (LS.get('aba5_clients') || []).find(x => x && x.id === clientId);
  const nz = x => String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const want = nz(c && c.name);
  if(want){
    const hit = names.find(n => { const t = nz(n); return t && (t.indexOf(want) !== -1 || want.indexOf(t) !== -1); });
    if(hit) return parsed[hit];
    // Fall back to the first surname/word match, so "Alex" finds "Alex Caballero".
    const first = nz(String(c.name).split(/\s+/)[0]);
    const hit2 = first && names.find(n => nz(n).indexOf(first) !== -1);
    if(hit2) return parsed[hit2];
  }
  return {};
}

// Drop zone
document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('sumDrop');
  dz.addEventListener('dragover', e=>{e.preventDefault();dz.classList.add('drag');});
  dz.addEventListener('dragleave', ()=>dz.classList.remove('drag'));
  dz.addEventListener('drop', e=>{e.preventDefault();dz.classList.remove('drag');if(e.dataTransfer.files[0])handleSumFile(e.dataTransfer.files[0]);});
});

// Autosave the plan summary textarea with a 600ms debounce.
// CRITICAL: this function NEVER deletes — if the textarea is empty (possibly due
// to a transient re-render or a client change), it simply skips. Explicit deletion
// only happens through the dedicated Clear button or by saving the client with an
// empty field. This prevents the prior data-loss bug where a stale timer would
// fire after the textarea got cleared by a re-render and overwrite LS with empty.
let _planSummaryTimer = null;
function _autoSavePlanSummary(){
  if (!activeClientId) return;
  // Capture the clientId at the moment of editing so the timer cannot save
  // into a different client's storage if the user navigates away.
  const capturedClientId = activeClientId;
  const statusEl = document.getElementById('cPlanSummaryStatus');
  if (statusEl) { statusEl.textContent = '⌛ Saving…'; statusEl.style.color = 'var(--text3)'; }
  clearTimeout(_planSummaryTimer);
  _planSummaryTimer = setTimeout(() => {
    // Abort if the user has moved to a different client (or no client)
    if (activeClientId !== capturedClientId) {
      if (statusEl) statusEl.textContent = '';
      return;
    }
    const text = (document.getElementById('cPlanSummary')?.value || '').trim();
    // Never delete via autosave — only save real content.
    // If the field is empty, leave LS alone (the user can clear explicitly via the Clear button).
    if (!text) {
      if (statusEl) statusEl.textContent = '';
      return;
    }
    LS.set('aba5_sum_'+capturedClientId, text);
    // Verify the write actually succeeded by reading it back (LS.set can swallow errors)
    const verify = LS.get('aba5_sum_'+capturedClientId);
    if (verify !== text) {
      _showStorageFullBanner();
      if (statusEl) {
        statusEl.textContent = '⚠ Save failed (storage full)';
        statusEl.style.color = 'var(--red)';
      }
      return;
    }
    const badge = document.getElementById('sumStatusBadge');
    if (badge) badge.innerHTML = '<span class="client-tag tag-green">Summary ✓</span>';
    if (statusEl) {
      statusEl.textContent = '✓ Saved';
      statusEl.style.color = 'var(--green)';
      setTimeout(() => { if (statusEl.textContent === '✓ Saved') statusEl.textContent = ''; }, 1500);
    }
  }, 600);
}

function downloadSummary() {
  if (!activeClientId) return;
  const text = (document.getElementById('cPlanSummary').value||'').trim();
  if (!text) { showMsg('sumMsg','No summary to download.','err'); return; }
  const c = clients.find(x=>x.id===activeClientId);
  const name = c ? c.name.replace(/\s+/g,'_') : 'client';
  const blob = new Blob([text],{type:'text/plain'});
  const a = document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='Clinical_Summary_'+name+'.txt'; a.click(); URL.revokeObjectURL(a.href);
}

function clearSummary() {
  if (!activeClientId) return;
  if (!confirm('Clear the clinical summary for this client?')) return;
  LS.del('aba5_sum_'+activeClientId);
  const planArea = document.getElementById('cPlanSummary');
  if (planArea) planArea.value = '';
  document.getElementById('sumStatusBadge').innerHTML='<span class="client-tag tag-amber">No summary</span>';
  renderClientList();
  showMsg('sumMsg','Summary cleared.','ok');
}

/* ═══════════════════════════════════════════════════════════
   GENERATE TAB
═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   GENERATE TAB
═══════════════════════════════════════════════════════════ */
const DURATIONS=['15 minutes','30 minutes','45 minutes','1 hour','1 hour 15 minutes','1 hour 30 minutes','1 hour 45 minutes','2 hours','2 hours 15 minutes','2 hours 30 minutes','2 hours 45 minutes','3 hours','3 hours 15 minutes','3 hours 30 minutes','3 hours 45 minutes','4 hours','4 hours 15 minutes','4 hours 30 minutes','4 hours 45 minutes','5 hours','5 hours 15 minutes','5 hours 30 minutes','5 hours 45 minutes','6 hours'];
// Unit counts for CPT 97153 (1 unit = 15 min, max 24 units = 6 hours)
const DUR_UNITS={'15 minutes':1,'30 minutes':2,'45 minutes':3,'1 hour':4,'1 hour 15 minutes':5,'1 hour 30 minutes':6,'1 hour 45 minutes':7,'2 hours':8,'2 hours 15 minutes':9,'2 hours 30 minutes':10,'2 hours 45 minutes':11,'3 hours':12,'3 hours 15 minutes':13,'3 hours 30 minutes':14,'3 hours 45 minutes':15,'4 hours':16,'4 hours 15 minutes':17,'4 hours 30 minutes':18,'4 hours 45 minutes':19,'5 hours':20,'5 hours 15 minutes':21,'5 hours 30 minutes':22,'5 hours 45 minutes':23,'6 hours':24};

function buildDurOptions(selId, defaultVal='2 hours', showUnits=false, allowNone=false){
  const el=document.getElementById(selId);
  if(!el)return;
  let opts = '';
  if(allowNone) opts += `<option value=""${defaultVal===''?' selected':''}>Not specified</option>`;
  opts += DURATIONS.map(d=>{
    const label = showUnits ? `${d} (${DUR_UNITS[d]||'?'} units)` : d;
    return `<option value="${d}"${d===defaultVal?' selected':''}>${label}</option>`;
  }).join('');
  el.innerHTML = opts;
}

function getSupType(){
  const r=document.querySelector('input[name="supType"]:checked');
  return r?r.value:'rbt';
}

function autoSuggestParticipants() {
  // DISABLED: User has full manual control over participants.
  // This function no longer modifies any participant checkboxes.
  // The supervisor row visibility is still managed for UI purposes only.
  const rbt=isRBT();
  const supRow2 = document.getElementById('pSupervisorRow');
  if(supRow2) supRow2.style.display = rbt ? 'none' : '';
  // Note: We do NOT change any checkbox.checked states - user controls all participants
}

function getEmergingItems(){
  const mal = (document.getElementById('emergingMal')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const rep = (document.getElementById('emergingRep')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const int_ = (document.getElementById('emergingInt')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const notes = (document.getElementById('emergingClinicalNotes')?.value||'').trim();
  if(!mal.length && !rep.length && !int_.length && !notes) return null;
  return {mal, rep, int: int_, notes};
}

['emergingMal','emergingRep','emergingInt','emergingClinicalNotes'].forEach(id=>{
  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById(id)?.addEventListener('input', updateEmergingIndicator);
  });
});

function getCaspPromptBlock(casp, supLabel){ return ''; }


// CASP section colors and labels
const CASP_META = {
  A: { bg:'#dbeafe', border:'#3b82f6', label:'A — Face-to-face observations', text:'#1e40af' },
  B: { bg:'#dcfce7', border:'#16a34a', label:'B — Protocol adjustments', text:'#14532d' },
  C: { bg:'#fef9c3', border:'#a16207', label:'C — Active direction to technician', text:'#713f12' },
  D: { bg:'#f3e8ff', border:'#9333ea', label:'D — QHP direct implementation', text:'#581c87' }
};

function parseAndRenderInterventions(rawText, noteId, clientId){
  const match = rawText.match(/---INTERVENTIONS---\n([\s\S]*?)\n?---END---/);
  if(!match) return rawText;

  const interventionLines = match[1].split('\n')
    .map(l=>l.replace(/^[-•*\d.]\s*/,'').trim())
    .filter(Boolean);

  const summary = (LS.get('aba5_sum_'+clientId)||'').toLowerCase();
  const pools = LS.get('aba5_pools_'+clientId)||{};
  const malNames = getActiveBehaviors(pools,'mal').join(' ').toLowerCase();
  const repNames = getActiveBehaviors(pools,'rep').join(' ').toLowerCase();
  const planText = summary + ' ' + malNames + ' ' + repNames;

  // Separate verified vs unverified
  const verified = [], unverified = [];
  interventionLines.forEach(intv=>{
    const keyWords = intv.toLowerCase().replace(/[()]/g,'').split(/\s+/).filter(w=>w.length>3);
    const inPlan = planText.length > 20 ? keyWords.some(w=>planText.includes(w)) : true;
    if(inPlan) verified.push(intv); else unverified.push(intv);
  });

  const allInterventions = [...verified, ...unverified];
  const plainText = allInterventions.join(', ');

  const box = document.getElementById('interventions-'+noteId);
  const list = document.getElementById('interventions-list-'+noteId);
  if(box && list){
    const hasUnverified = unverified.length > 0 && planText.length >= 20;
    list.innerHTML = `
      <div style="font-size:12px;color:var(--text);line-height:1.6;padding:4px 0" id="interventions-plain-${noteId}">${esc(plainText)}</div>
      ${hasUnverified ? `<div style="margin-top:6px;font-size:11px;color:#b86c00">⚠ Unverified in plan: ${esc(unverified.join(', '))}</div>` : ''}
      <button onclick="copyInterventions('${noteId}')" style="margin-top:8px;padding:4px 12px;border:1px solid var(--border2);border-radius:5px;background:var(--surface);font-size:11px;font-family:var(--sans);cursor:pointer;color:var(--text2)">📋 Copy</button>`;
    box.style.display='block';
  }
  return rawText.replace(/\n?---INTERVENTIONS---[\s\S]*?---END---/,'').trim();
}

function clearAll() {
  if (!confirm('Clear all client data and reset the form?\n\nThis will:\n- Clear selected client\n- Uncheck all note types\n- Clear all custom goals and inputs\n- Reset all fields to defaults\n\nThis action cannot be undone.')) {
    return;
  }
  
  // Clear client selection
  document.getElementById('genClientSel').value = '';
  
  // Trigger client change to refresh UI
  if (typeof onGenClientChange === 'function') {
    onGenClientChange();
  }
  
  // Uncheck all note types
  document.getElementById('chk97153').checked = false;
  document.getElementById('chk97155').checked = false;
  document.getElementById('chk97156').checked = false;
  document.getElementById('chkSup').checked = false;
  
  // Clear all custom goals
  document.getElementById('customGoals153').value = '';
  document.getElementById('customGoals155').value = '';
  document.getElementById('customGoals156').value = '';
  document.getElementById('customGoalsSup').value = '';
  
  // Clear durations
  document.getElementById('dur97153').value = '';
  document.getElementById('dur97155').value = '';
  document.getElementById('dur97156').value = '';
  document.getElementById('durSup').value = '';
  
  // Clear date, place, summary
  document.getElementById('sessionDate').value = '';
  document.getElementById('sessionPlace').value = '';
  document.getElementById('sessionSummary').value = '';
  
  // NOTE: Participants are NOT cleared - user controls these manually
  
  // Clear supervisor credentials
  document.getElementById('supervisorCred').value = '';
  
  // Clear output container
  document.getElementById('outputsContainer').innerHTML = '';
  document.getElementById('highlightLegend').style.display = 'none';
  document.getElementById('genMsg').textContent = '';
  
  // Disable generate button
  document.getElementById('genBtn').disabled = true;
  
  // Show success message
  const msg = document.getElementById('genMsg');
  msg.textContent = '✓ All data cleared successfully';
  msg.style.color = 'var(--green)';
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

function getFrequencyCounts(){
  const freqRows = document.getElementById('srFreqRows');
  if(!freqRows || !freqRows.dataset.behaviors) return null;
  const behaviors = JSON.parse(freqRows.dataset.behaviors);
  const counts = {};
  behaviors.forEach((b,i)=>{
    const val = document.getElementById('freq_'+i)?.value.trim();
    if(val !== '' && val !== undefined && !isNaN(val) && parseInt(val) > 0) counts[b] = parseInt(val);  // zero = did not occur, omit
  });
  const redir = document.getElementById('freq_redirections')?.value.trim();
  if(redir !== '' && redir !== undefined && !isNaN(redir)) counts['_redirections'] = parseInt(redir);
  return Object.keys(counts).length ? counts : null;
}

function getTrialCounts(){
  const repRows = document.getElementById('srRepRows');
  if(!repRows || !repRows.dataset.behaviors) return null;
  const behaviors = JSON.parse(repRows.dataset.behaviors);
  const counts = {};
  behaviors.forEach((r,i)=>{
    const correct = document.getElementById('rep_correct_'+i)?.value.trim();
    const total = document.getElementById('rep_total_'+i)?.value.trim() || '10';
    if(correct !== '' && correct !== undefined && !isNaN(correct)){
      counts[r] = { correct: parseInt(correct), total: parseInt(total) };
    }
  });
  return Object.keys(counts).length ? counts : null;
}

function confirmAndGenerate(){
  // Sync any changes made in the modal back to the main form fields
  const modalDate = document.getElementById('srDate')?.value;
  const modalPlace = document.getElementById('srPlace')?.value;

  // FILOSOFÍA 1: the date must be present at the moment of confirmation.
  if(!modalDate){
    const sd = document.getElementById('srDate');
    if(sd){ sd.style.outline='2px solid #dc2626'; sd.focus(); }
    alert('⚠ The session date is empty. Enter the correct date before generating.');
    return;
  }

  // REDUCED ASSESSMENT CHECK: if the selected client has no reduced assessment
  // saved, the note falls back to the older, less faithful plan summary. Force an
  // explicit confirmation here (the passive banner can be overlooked).
  const _genCid = document.getElementById('genClientSel')?.value || '';
  if(_genCid && !(LS.get('aba5_assess_' + _genCid) || '').trim()){
    if(!confirm('\u26A0 Este cliente NO tiene assessment reducido guardado.\n\nLa nota se generar\u00e1 con el summary antiguo, que es menos fiel a la fuente cl\u00ednica.\n\n\u00bfGenerar de todos modos?\n(Cancela para crear primero el reducido en la ficha del cliente.)')){
      return; // BLOCK — user chose to add the reduced assessment first
    }
  }

  if(modalDate) document.getElementById('genDate').value = modalDate;
  if(modalPlace) document.getElementById('genPlace').value = modalPlace;
  const freqCounts = getFrequencyCounts();
  const trialCounts = getTrialCounts();
  const prevPlanText = document.getElementById('srPrevPlan')?.value.trim() || '';

  // ── CONGRUENCE VALIDATION (Phase 2) ──
  // Block generation if any observed frequency, expressed as a per-hour rate,
  // exceeds the RBT's monthly reference rate per hour.
  const congruenceProblems = _validateFrequencyCongruence(freqCounts);
  if(congruenceProblems && congruenceProblems.length){
    _showCongruenceAlert(congruenceProblems);
    return; // BLOCK — do not generate until the user fixes the values
  }

  document.getElementById('sessionReviewModal').style.display='none';
  generateSession(freqCounts, trialCounts, prevPlanText);
}

// Convert a duration label (e.g. "3 hours 15 minutes") to decimal hours using DUR_UNITS
// (each unit = 15 minutes). Returns null if unknown/empty.
function _durationToHours(durLabel){
  if(!durLabel) return null;
  const clean = durLabel.replace(/\s*\(.*?\)\s*/,'').trim(); // strip "(N units)" suffix
  const units = DUR_UNITS[clean];
  if(units) return units / 4; // 4 units = 1 hour
  return null;
}

const RBT_SESSION_HOURS_DEFAULT = 4; // average RBT session length

// Validate observed session frequencies against the RBT monthly reference.
// Rule (Option B): the analyst's per-hour rate must not exceed the RBT's per-hour rate.
//   RBT rate/hr = (monthly weekly average ÷ 7) ÷ RBT_SESSION_HOURS
//   analyst rate/hr = observed count ÷ analyst session hours
// Returns an array of problem objects, or [] if everything is congruent / no data.
function _validateFrequencyCongruence(freqCounts){
  if(!freqCounts) return [];
  if(!activeClientId) return [];

  // The congruence rule compares the ANALYST's shorter session against the RBT's
  // monthly reference. It only applies when the current note is an analyst/BCBA
  // session — NOT when the therapist is an RBT (their session IS the reference data).
  if(typeof isRBT === 'function' && isRBT()) return [];

  const record = LS.get('aba5_monthdata_'+activeClientId);
  if(!record || !record.behaviors || !record.behaviors.length) return []; // no reference data → no check

  // Analyst session duration — from the 97155 selector
  const dur155 = document.getElementById('dur97155')?.value || '';
  const analystHours = _durationToHours(dur155);
  if(!analystHours || analystHours<=0) return []; // can't compute a rate without a duration

  const problems = [];
  Object.entries(freqCounts).forEach(([behavior, count])=>{
    if(behavior === '_redirections') return;
    const ref = record.behaviors.find(b => b.name.toLowerCase() === behavior.toLowerCase());
    if(!ref || ref.dailyAvg == null) return;

    const rbtRatePerHour = +(ref.dailyAvg / RBT_SESSION_HOURS_DEFAULT).toFixed(3);
    const analystRatePerHour = +(count / analystHours).toFixed(3);

    if(analystRatePerHour > rbtRatePerHour){
      problems.push({
        behavior,
        observed: count,
        analystHours,
        analystRatePerHour,
        rbtDailyAvg: ref.dailyAvg,
        rbtRatePerHour,
        maxCongruent: Math.floor(rbtRatePerHour * analystHours)
      });
    }
  });
  return problems;
}

function _showCongruenceAlert(problems){
  const lines = problems.map(p =>
    `• ${p.behavior}: you entered ${p.observed} in a ${p.analystHours}h session ` +
    `(${p.analystRatePerHour}/hr). The RBT's monthly reference is ${p.rbtRatePerHour}/hr ` +
    `(${p.rbtDailyAvg}/day over ${RBT_SESSION_HOURS_DEFAULT}h sessions). ` +
    `For congruence, enter at most ${p.maxCongruent} for this session length.`
  ).join('\n\n');
  alert(
    '⚠ FREQUENCY CONGRUENCE ALERT — generation blocked\n\n' +
    'One or more observed counts produce a per-hour rate HIGHER than the RBT\'s monthly average rate. ' +
    'Since your session is shorter than the RBT\'s, this is clinically incongruent and could compromise interobserver coherence (IOA).\n\n' +
    lines +
    '\n\nAdjust the value(s) and try again.'
  );
}

// ── NOTE HISTORY ─────────────────────────────────────────────────
const NOTE_TYPE_LABELS = {
  '97153':'CPT-97153 — RBT Direct',
  '97155':'CPT-97155 — Protocol Modification',
  '97156':'CPT-97156 — Parent Training',
  'sup':'Supervision Log'
};

function loadNoteHistory(clientId){
  return LS.get('aba5_notes_'+clientId) || [];
}

// Visually flag every number left in a published note so an invented figure is
// impossible to miss. Operates on ALREADY-ESCAPED text (no tags), and deliberately
// skips tokens that are never fabricated performance data: HTML entities, place
// codes "(12)", CPT codes, ABLLS-style "F-14", and dates. Visual only — it never
// alters the note text that gets copied.
function _markNumbersHtml(escaped){
  return String(escaped||'').replace(
    /&#\d+;|\(\d{1,3}\)|CPT[-\s]?\d{4,5}|\b[A-Za-z]-\d{1,3}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|(\d[\d.,:]*(?:\s*%)?)/g,
    function(m, num){ return num === undefined ? m : '<span class="numflag">' + m + '</span>'; }
  );
}

function getParticipants() {
  const parts = [];
  if (document.getElementById('pClient')?.checked) parts.push('client');
  if (document.getElementById('pSupervisor')?.checked) parts.push('supervisor');
  if (document.getElementById('pTechnician')?.checked) parts.push('technician');
  if (document.getElementById('pCaregiver')?.checked) parts.push('caregiver');
  if (document.getElementById('pOther')?.checked) {
    let txt = document.getElementById('pOtherText')?.value.trim();
    if (txt) { if (/\brbt\b/i.test(txt)) txt = 'the RBT'; parts.push(txt); }
  }
  return parts;
}

function participantsString(parts, supervisorCred, supLabel) {
  // For direct sessions (no supLabel/technician), exclude technician entirely
  const filteredParts = supLabel ? parts : parts.filter(p=>p!=='technician');
  
  // Sort participants by hierarchy: supervisor → technician → RBT → client → caregiver
  const hierarchyOrder = ['supervisor', 'technician', 'RBT', 'client', 'caregiver'];
  const sortedParts = filteredParts.sort((a, b) => {
    const aIndex = hierarchyOrder.findIndex(h => a === h || (a.toLowerCase().includes('rbt') && h === 'RBT'));
    const bIndex = hierarchyOrder.findIndex(h => b === h || (b.toLowerCase().includes('rbt') && h === 'RBT'));
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
  
  const map = {
    'client': 'the client',
    'supervisor': supervisorCred && supervisorCred !== 'RBT' ? `the ${supervisorCred}` : 'the BCBA',
    'technician': supLabel ? `the ${supLabel}` : null,
    'caregiver': 'the caregiver'
  };
  return sortedParts.map(p => map[p] || p).filter(Boolean).join(', ');
}

/* ═══════════════════════════════════════════════════════════
   97155 SESSION TEMPLATE — AUTO-RANDOM
   All service types and sub-options are randomly selected.
   User can re-roll. Goals are also randomly selected per group.
═══════════════════════════════════════════════════════════ */

const ST_POOLS = {
  aResult: [
    { v:'effective', text:"This session's observations indicated that the protocol components were functioning effectively and therefore no adjustments were clinically indicated." },
    { v:'required',  text:"This session's observations indicated that the protocol components required adjustments." }
  ],
  bComps: ['Treatment targets','Treatment goals','Observation and/or measurement','Reinforcers','Reinforcer delivery','Prompts','Instruction','Materials','Discriminative stimuli','Contextual variables'],
  cActions: [
    'Implementing the protocol with the client while the technician observed, then having the technician implement the protocol with the client while the QHP observed.',
    'Correcting errors made during implementation of the adaptive behavior protocols.',
    'Modeling of correct implementation of the protocol.',
    'Training of the technician to implement a modified protocol.',
    "Providing feedback/instruction regarding the technician's implementation of the protocol.",
    'Observing and recording sample(s) of target behavior(s) independently of technician to check interobserver agreement and identify any need to retrain technician on behavioral definition(s) and recording procedures or revise those.'
  ],
  dResult: [
    { v:'changes', text:'Determining if changes were needed to improve client progress.' },
    { v:'testing', text:'Testing of a modified protocol.' }
  ]
};

let _currentSessTmpl = null;
let _lastTruncated = false; // set by callGeminiAPI when a response is cut off by MAX_TOKENS

// Note generation runs on a "thinking" model (gemini-2.5-flash): reasoning tokens
// count against maxOutputTokens. An UNBOUNDED thinking budget (thinkingBudget=null)
// both slows the call and can consume the whole budget, cutting the visible note off
// mid-text (the truncation seen on long notes). A GENEROUS but BOUNDED budget keeps
// full reasoning quality — it is 8x the 1024 already used per section, and well within
// flash's thinking ceiling — while guaranteeing room for the visible note and trimming
// the latency tail. This is the ONE knob for the quality/speed trade-off: raise it to
// favor reasoning, lower it to favor speed. It never licenses fabricating data.
const NOTE_THINKING_BUDGET = 8192;

function randomizeSessionTemplate() {
  const includeA = Math.random() > 0.15;  // 85% chance
  const includeB = Math.random() > 0.3;   // 70% chance
  const includeC = Math.random() > 0.2;   // 80% chance
  const includeD = Math.random() > 0.4;   // 60% chance
  const sections = [includeA, includeB, includeC, includeD];
  const count = sections.filter(Boolean).length;
  const useA = count < 2 ? true : includeA;
  const useB = count < 2 ? includeB : includeB;
  const useC = count < 2 ? true : includeC;
  const useD = includeD;

  const aResult = useA ? one(ST_POOLS.aResult) : null;
  // If A result is "required adjustments", pick 3–5 components to specify what required adjustment
  const aComponents = (aResult && aResult.v === 'required')
    ? pick(ST_POOLS.bComps, 3 + Math.floor(Math.random() * 3))  // 3–5 items
    : [];

  const tmpl = {
    faceToFace: useA ? {
      result: aResult,
      aComponents,
      get resultText(){ return this.result.text; }
    } : null,
    adjustments: useB ? {
      components: pick(ST_POOLS.bComps, 5 + Math.floor(Math.random() * 4))  // 5–8 items
    } : null,
    activeDirection: useC ? {
      actions: pick(ST_POOLS.cActions, 1 + Math.floor(Math.random() * 3))  // 1–3 actions
    } : null,
    qhpImplementation: useD ? {
      result: one(ST_POOLS.dResult),
      get resultText(){ return this.result.text; }
    } : null
  };

  _currentSessTmpl = tmpl;
  renderSessionTemplatePreview(tmpl);
  return tmpl;
}

function getSessionTemplate() {
  // Return current or generate fresh
  if (!_currentSessTmpl) return randomizeSessionTemplate();
  return _currentSessTmpl;
}

function validateSessionTemplate() {
  // Always valid — auto-selected
  return true;
}


/* ── COHERENCIA ENTRE LUGAR Y PARTICIPANTES ─────────────────────────────────
   Se colaban maestros en notas de casa y cuidadores en notas de escuela. No es
   un detalle de redaccion: describe presente en la sesion a alguien que no
   estuvo, y eso es exactamente lo que una auditoria busca.

   Dos capas, como con el resto: filtro determinista sobre la lista real de
   participantes, y regla en el prompt para que el modelo tampoco lo invente por
   su cuenta a mitad de la narracion.                                          */
var _PLACE_STAFF_RE = /\b(teacher|teachers|teacher'?s?\s+aide|classroom\s+(?:assistant|aide|teacher)|paraprofessional|instructor|school\s+(?:staff|personnel|counsel(?:or|lor)|psychologist)|principal|maestr[oa]s?|profesor(?:a|es|as)?|docentes?|auxiliar\s+de\s+(?:aula|clase))\b/i;
var _PLACE_FAMILY_RE = /\b(caregivers?|parents?|mother|father|mom|mum|dad|grand(?:mother|father|ma|pa)|guardian|stepmother|stepfather|aunt|uncle|madre|padre|abuel[oa]s?|t[ií][oa]s?|tutor(?:a)?\s+legal|cuidador(?:a|es|as)?)\b/i;

// Structured reading of the numeric minimums an agency sets PER REPLACEMENT PROGRAM.
// The narrative writer already received the requirements as prose, but the AbaMatrix
// FORM builders never did: they hardcoded two reinforcer slots and exactly two
// activities, so an agency demanding three reinforcers could not be satisfied — the
// data simply was not collected. These numbers now drive the form itself.
// Returns 0 for anything the client does not declare, so no agency's quota leaks
// into another's clients.
// Per-program ACTIVITY lists supplied by the agency. The platform's own activity
// catalog is generic and shared by every goal; agencies like this one define the
// activities that may be used FOR EACH program, and a note that draws from the
// generic catalog is non-conforming. Parsed from the agency's document, which mixes
// two layouts (plain headings with "*" bullets, and "##" headings with "•" bullets)
// and can hold several clients one after another.
// Returns { client: { program: { prompt, acts[] } } } plus a flat map for the client
// currently being parsed when the document names only one.
function _parseProgramActivities(text){
  var clients = {}, curClient = '', curProg = '', order = [];
  var clean = function(x){
    return String(x||'').replace(/[⁠ ​]/g, ' ').replace(/\s+/g, ' ').trim();
  };
  var lines = String(text||'').split(/\r?\n/);
  var nextMeaningful = function(i){
    for(var j = i + 1; j < lines.length; j++){
      var v = clean(lines[j]);
      if(v) return v;
    }
    return '';
  };
  var isBullet = function(v){ return /^[*••●▪\-–]\s*\S/.test(v); };
  var isPrompt = function(v){ return /^\(?\s*[A-Za-z ]*prompts?\s*\)?$/i.test(v); };
  var put = function(prog){
    if(!curClient) curClient = '(sin nombre)';
    clients[curClient] = clients[curClient] || {};
    if(!clients[curClient][prog]) clients[curClient][prog] = { prompt: '', acts: [] };
    curProg = prog;
    order.push(curClient + '||' + prog);
  };
  for(var i = 0; i < lines.length; i++){
    var ln = clean(lines[i]);
    if(!ln) continue;
    if(isBullet(ln)){
      var a = ln.replace(/^[*••●▪\-–]\s*/, '').trim().replace(/[.;]+$/, '');
      if(a && curClient && curProg && clients[curClient][curProg]) clients[curClient][curProg].acts.push(a);
      continue;
    }
    if(/^#{1,6}\s*/.test(ln)){ put(ln.replace(/^#{1,6}\s*/, '').trim()); continue; }
    if(isPrompt(ln)){
      var pr = ln.replace(/[()]/g, '').trim();
      if(curClient && curProg && clients[curClient][curProg]) clients[curClient][curProg].prompt = pr;
      continue;
    }
    // A bare line is a PROGRAM heading when what follows belongs to a program (a
    // prompt line or a bullet); otherwise it is the name of the client whose
    // programs come next.
    var nx = nextMeaningful(i);
    if(nx && (isPrompt(nx) || isBullet(nx))) put(ln);
    else { curClient = ln; curProg = ''; clients[curClient] = clients[curClient] || {}; }
  }
  // Drop headings that collected nothing.
  Object.keys(clients).forEach(function(c){
    Object.keys(clients[c]).forEach(function(pg){ if(!clients[c][pg].acts.length) delete clients[c][pg]; });
    if(!Object.keys(clients[c]).length) delete clients[c];
  });
  return clients;
}

// Loose match between a program name as the platform spells it and as the agency
// document spells it ("Imitation Level 1: Imitates motor movements when prompted"
// vs "Imitates motor movements when prompted").
function _matchProgramActs(progActs, name){
  if(!progActs || !name) return null;
  var nz = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var want = nz(name);
  if(!want) return null;
  var keys = Object.keys(progActs);
  var exact = keys.find(function(k){ return nz(k) === want; });
  if(exact) return progActs[exact];
  var part = keys.find(function(k){ var t = nz(k); return t && (t.indexOf(want) !== -1 || want.indexOf(t) !== -1); });
  return part ? progActs[part] : null;
}

// Fill in the missing replacement functions for a client. Never overwrites a function
// that is already there: what the plan or the analyst stated always wins.
function _backfillRepFunctions(clientId){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var rep = normalizeBehaviorArr(pools.rep || []);
  var n = 0, unresolved = [];
  rep.forEach(function(r){
    if(!r || !r.name || String(r.fn||'').trim()) return;
    var f = _inferReplacementFn(r.name);
    // Record that this one was DEDUCED, not read from the plan. Without the mark a
    // guess is indistinguishable from a clinical fact, and a wrong guess propagates
    // silently through the 1:1 pairing.
    if(f){ r.fn = f; r.fnSrc = 'inferred'; n++; } else { unresolved.push(r.name); }
  });
  if(n){ pools.rep = rep; LS.set('aba5_pools_' + clientId, pools); }
  return { filled: n, unresolved: unresolved };
}

// ---- Memoria de correcciones del analista, por cliente ---------------------
// Lo que un analista manda corregir en una nota vale para TODAS las notas
// siguientes de ese cliente. Antes esa memoria vivia en la cabeza del RBT y en un
// chat, asi que el mismo fallo se repetia nota tras nota. Aqui queda guardada con
// el cliente, viaja a Supabase dentro de pools y se inyecta en cada generacion.
/* ── Memoria de los defectos que el sistema se corrige a si mismo ─────────────
   Los guards deterministas llevan toda la sesion corrigiendo lo mismo una y otra
   vez -cifras inventadas, refuerzo continuo repetido, espanol dentro de una nota en
   ingles- y cada nota empezaba desde cero, sin saber nada de la anterior. El
   analista corrige y eso SI se guarda; lo que el sistema se corrige a si mismo se
   perdia al cerrar el mensaje.

   Aqui se registra. Un defecto que reaparece deja de ser un accidente y pasa al
   prompt como advertencia dirigida, con su nombre y las veces que ha ocurrido. La
   diferencia con una regla general es que una regla general la lee el modelo entre
   otras cien; una advertencia que dice "esto te ha pasado 4 veces con ESTE cliente"
   se aplica.

   Vive dentro de pools, asi que viaja a Supabase con el cliente y persiste.       */
var DEFECT_LABELS = {
  numeros:    { es: 'cifras de desempeño inventadas', warn: 'You have written fabricated performance figures in this client\'s notes before, in digits and spelled out as words. Write NO number that was not provided in the session data.' },
  espanol:    { es: 'texto en español dentro de la nota', warn: 'Spanish text has been left inside this client\'s notes before. Re-express every operator field as clinical English; no Spanish word may remain.' },
  crf:        { es: 'refuerzo continuo repetido', warn: 'Continuous reinforcement has been over-selected for this client\'s programs before. Choose the schedule this program\'s stage actually supports; continuous belongs to initial acquisition only.' },
  balance:    { es: 'desequilibrio antecedente/consecuencia', warn: 'This client\'s cards have come back unbalanced before, with far more antecedent than consequence interventions. Document at least two of each, differing by no more than one.' },
  autoverif:  { es: 'listas de autoverificación al final', warn: 'A self-audit checklist has been appended to this client\'s notes before. The note ends with its clinical content; never add a verification list.' },
  variante:   { es: 'marcadores de variante (V#/A#) en el texto', warn: 'Internal variant codes have leaked into this client\'s notes before. Apply the assigned wording; never write the code itself.' },
  mayusculas: { es: 'nombres en MAYÚSCULAS en la prosa', warn: 'Behavior names have been written in capitals inside this client\'s notes before. Use sentence case in the prose.' },
  academico:  { es: 'el terapeuta presentando tarea académica', warn: 'This client\'s notes have shown the therapist presenting an academic task. The teacher, classroom assistant or caregiver presents it; the therapist intervenes afterwards.' },
  definicion: { es: 'descripciones que definen el procedimiento', warn: 'Descriptions in this client\'s cards have defined the procedure instead of documenting what was done. Write the action, never the definition.' }
};

/* Lo que detecta un guard es una SOSPECHA, no un hecho clinico. Un detector puede
   dar un falso positivo -paso hoy mismo con "rbt's" y con "The third trial"-, y si
   una sospecha equivocada se propaga a los demas clientes del terapeuta, el sistema
   deja de aprender y empieza a arrastrar un error con autoridad.

   Por eso hay tres estados y la propagacion exige validacion humana:
     ''    sospecha del guard  -> avisa en ESTE cliente, no sale de el
     'ok'  confirmada por ti   -> avisa aqui Y se propaga a los demas del terapeuta
     'no'  falso aviso         -> deja de avisar y deja de contarse
   Aprender de un cliente esta bien mientras lo aprendido sea valido; validarlo es
   tuyo, no de un patron de texto.                                                 */
function _recordDefect(clientId, kind){
  if(!clientId || !DEFECT_LABELS[kind]) return;
  try{
    var pools = LS.get('aba5_pools_' + clientId) || {};
    var d = (pools.defects && typeof pools.defects === 'object') ? pools.defects : {};
    var e = d[kind] || { n: 0, last: '', state: '' };
    if(e.state === 'no') return;              // marcado como falso aviso: no se cuenta
    e.n = (e.n || 0) + 1;
    e.last = new Date().toISOString().slice(0,10);
    if(!('state' in e)) e.state = '';
    d[kind] = e;
    pools.defects = d;
    LS.set('aba5_pools_' + clientId, pools);
  }catch(e){}
}

function _setDefectState(clientId, kind, state){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var d = pools.defects || {};
  if(!d[kind]) return;
  d[kind].state = state;
  pools.defects = d;
  LS.set('aba5_pools_' + clientId, pools);
  if(typeof _renderDefects === 'function') _renderDefects();
}

function _defectList(clientId){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var d = pools.defects || {};
  return Object.keys(d)
    .filter(function(k){ return DEFECT_LABELS[k] && (d[k].n || 0) > 0 && d[k].state !== 'no'; })
    .map(function(k){ return { kind: k, n: d[k].n, last: d[k].last, state: d[k].state || '' }; })
    .sort(function(a,b){ return b.n - a.n; });
}

/* El mismo defecto en VARIOS clientes del mismo terapeuta ya no es del cliente.
   Es de quien redacta, o de como esa agencia pide las notas, y merece un aviso
   distinto: lo que corrige un caso no corrige un habito. Se calcula recorriendo los
   clientes de ese terapeuta y contando en cuantos DISTINTOS aparece cada defecto,
   asi que no necesita almacenamiento propio y viaja a Supabase dentro de pools,
   igual que el registro por cliente.                                              */
/* Lo CLINICAMENTE CORRECTO no tiene alcance de terapeuta: no fabricar cifras, no
   dejar espanol en una nota en ingles, no congelar un programa en refuerzo continuo
   o no documentar al terapeuta impartiendo una tarea academica valen para todos los
   clientes del sistema, los vea quien los vea.

   Por eso, una vez que una persona confirma que el senalamiento es correcto, el
   criterio se aplica a TODOS. La vista por terapeuta se conserva, pero ya no decide
   que se propaga: sirve para saber a QUIEN hay que hablarle cuando un mismo defecto
   se concentra en su carga de casos.                                              */
function _validatedDefects(){
  var count = {}, tot = {};
  (clients || []).forEach(function(c){
    var pools = LS.get('aba5_pools_' + c.id) || {};
    var d = pools.defects || {};
    Object.keys(d).forEach(function(k){
      if(!DEFECT_LABELS[k] || !(d[k].n > 0) || d[k].state !== 'ok') return;
      count[k] = (count[k] || 0) + 1;
      tot[k]   = (tot[k] || 0) + d[k].n;
    });
  });
  return Object.keys(count)
    .map(function(k){ return { kind: k, clients: count[k], total: tot[k] }; })
    .sort(function(a,b){ return (b.clients - a.clients) || (b.total - a.total); });
}

function _clearDefects(clientId){
  if(!confirm('Vas a borrar la memoria de defectos de este cliente. El sistema dejará de avisar sobre lo que venía corrigiendo.\n\n¿Continuar?')) return;
  var pools = LS.get('aba5_pools_' + clientId) || {};
  delete pools.defects;
  LS.set('aba5_pools_' + clientId, pools);
  if(typeof _renderDefects === 'function') _renderDefects();
}

function _analystNotes(clientId){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var a = pools.analystNotes;
  return Array.isArray(a) ? a : [];
}
function _addAnalystNote(){
  if(!activeClientId){ showMsg('poolMsg','Selecciona un cliente primero.','err'); return; }
  var t = (document.getElementById('acText')||{}).value || '';
  t = String(t).trim();
  if(!t){ showMsg('poolMsg','Escribe la corrección antes de añadirla.','err'); return; }
  var rbt = String((document.getElementById('acRbt')||{}).value || '').trim();
  var d   = String((document.getElementById('acDate')||{}).value || '').trim();
  var pools = LS.get('aba5_pools_' + activeClientId) || {};
  var list = Array.isArray(pools.analystNotes) ? pools.analystNotes : [];
  // Date.now() alone collides when two corrections are added within the same
  // millisecond, and then deleting one deletes every sibling that shares the id.
  var _uid = 'ac' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  list.push({ id: _uid, date: d, rbt: rbt, text: t });
  pools.analystNotes = list;
  LS.set('aba5_pools_' + activeClientId, pools);
  var te = document.getElementById('acText'); if(te) te.value = '';
  _renderAnalystNotes();
  if(typeof _renderRedFlags === 'function') _renderRedFlags();
  showMsg('poolMsg','Corrección guardada. Se aplicará a todas las notas de este cliente.','ok');
}
function _delAnalystNote(id){
  if(!activeClientId) return;
  var pools = LS.get('aba5_pools_' + activeClientId) || {};
  pools.analystNotes = (Array.isArray(pools.analystNotes) ? pools.analystNotes : []).filter(function(x){ return x && x.id !== id; });
  LS.set('aba5_pools_' + activeClientId, pools);
  _renderAnalystNotes();
  if(typeof _renderRedFlags === 'function') _renderRedFlags();
}

function _analystNoteNeedsReview(n){
  return n && !n.scope;
}

async function _reviewAnalystNotes(){
  if(!activeClientId){ showMsg('poolMsg','Selecciona un cliente primero.','err'); return; }
  var pools = LS.get('aba5_pools_' + activeClientId) || {};
  var list = Array.isArray(pools.analystNotes) ? pools.analystNotes : [];
  var pend = list.filter(_analystNoteNeedsReview);
  if(!pend.length){ showMsg('poolMsg','No hay sugerencias nuevas por revisar. Las ya revisadas no se vuelven a evaluar.','ok'); return; }
  showMsg('poolMsg','Revisando ' + pend.length + ' sugerencia(s) nueva(s)…','warn',0);
  var done = 0, conflicts = 0;
  for(var i = 0; i < pend.length; i++){
    try{
      var raw = await callAPI('CORRECTION TO CLASSIFY:\n' + String(pend[i].text||''), ANALYST_SCOPE_SYS, null, activeClientId, 2048, 0);
      var txt = String(raw||'').replace(/```json|```/g, '').trim();
      var d = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      var sc = String(d.scope||'').toLowerCase();
      pend[i].scope    = (sc === 'universal' || sc === 'agency' || sc === 'client') ? sc : 'client';
      pend[i].reason   = String(d.reason||'').trim();
      pend[i].conflict    = String(d.conflict||'').trim();
      pend[i].principle   = String(d.principle||'').trim();
      pend[i].alternative = String(d.alternative||'').trim();
      pend[i].state       = '';            // pendiente de tu confirmacion
      if(pend[i].conflict) conflicts++;
      done++;
    }catch(e){ /* la que falle se queda sin clasificar y se reintenta la proxima vez */ }
  }
  pools.analystNotes = list;
  LS.set('aba5_pools_' + activeClientId, pools);
  if(typeof _renderAnalystNotes === 'function') _renderAnalystNotes();
  if(typeof _renderRedFlags === 'function') _renderRedFlags();
  if(typeof _renderDefects === 'function') _renderDefects();
  showMsg('poolMsg', done + ' sugerencia(s) revisada(s)'
    + (conflicts ? '. ⚠ ' + conflicts + ' choca(n) con la práctica clínica establecida — léelas antes de confirmar' : '')
    + '. Confirma cuáles son clínicamente correctas: las marcadas como criterio general se aplicarán a TODOS los clientes.',
    conflicts ? 'err' : 'ok', 0);
}

function _setAnalystNoteState(clientId, id, state){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var list = Array.isArray(pools.analystNotes) ? pools.analystNotes : [];
  var n = list.find(function(x){ return x && x.id === id; });
  if(!n) return;
  n.state = state;
  pools.analystNotes = list;
  LS.set('aba5_pools_' + clientId, pools);
  if(typeof _renderAnalystNotes === 'function') _renderAnalystNotes();
}

// Criterios de analista confirmados como generales, vengan del cliente que vengan.
// Se guardan de-duplicados por texto para que la misma indicacion hecha por dos
// analistas distintos no ocupe dos lineas del prompt.
/* Bandera roja. Que lo pida un analista no lo hace correcto: ya hemos visto
   assessments con errores y setups de AbaMatrix llenos de ellos. Una indicacion
   contraindicada tiene que SALTAR a la vista, no quedarse en una linea de una lista,
   porque es lo unico que permite llevarla de vuelta al analista con argumento.

   La alerta no se limita a decir "esto choca": da el PRINCIPIO que se incumple y la
   ALTERNATIVA clinicamente correcta para el mismo proposito que el analista
   perseguia. El analista vio un problema real aunque el procedimiento que pidio sea
   el equivocado; descartar la peticion entera seria perder esa observacion.        */
function _redFlags(){
  var out = [];
  (clients || []).forEach(function(c){
    var pools = LS.get('aba5_pools_' + c.id) || {};
    (Array.isArray(pools.analystNotes) ? pools.analystNotes : []).forEach(function(n){
      if(n && n.conflict) out.push({
        clientId: c.id, client: c.name || '', id: n.id, text: n.text || '',
        conflict: n.conflict, principle: n.principle || '', alternative: n.alternative || '',
        rbt: n.rbt || '', date: n.date || '', resolved: n.flagState === 'done'
      });
    });
  });
  return out;
}

// Adoptar la alternativa correcta: sustituye el texto de la correccion por el
// procedimiento clinicamente valido, conserva de donde vino y la deja lista para
// revisarse de nuevo, ahora ya sin conflicto.
function _adoptAlternative(clientId, id){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var list = Array.isArray(pools.analystNotes) ? pools.analystNotes : [];
  var n = list.find(function(x){ return x && x.id === id; });
  if(!n || !n.alternative) return;
  if(!confirm('Vas a sustituir la indicación del analista por la alternativa clínicamente correcta:\n\n'
    + 'ANTES: ' + n.text + '\n\nDESPUÉS: ' + n.alternative
    + '\n\nSe conserva de quién venía. ¿Continuar?')) return;
  n.original = n.text;
  n.text = n.alternative;
  n.conflict = ''; n.principle = ''; n.alternative = '';
  n.scope = ''; n.state = '';        // vuelve a revisarse, ya sin conflicto
  pools.analystNotes = list;
  LS.set('aba5_pools_' + clientId, pools);
  if(typeof _renderAnalystNotes === 'function') _renderAnalystNotes();
  if(typeof _renderRedFlags === 'function') _renderRedFlags();
  showMsg('poolMsg','Indicación sustituida por la alternativa correcta. Pulsa «Revisar sugerencias nuevas» para clasificarla.','ok');
}

// Marcarla como hablada con el analista, sin cambiar el texto.
function _resolveFlag(clientId, id){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var list = Array.isArray(pools.analystNotes) ? pools.analystNotes : [];
  var n = list.find(function(x){ return x && x.id === id; });
  if(!n) return;
  n.flagState = (n.flagState === 'done') ? '' : 'done';
  pools.analystNotes = list;
  LS.set('aba5_pools_' + clientId, pools);
  if(typeof _renderRedFlags === 'function') _renderRedFlags();
  if(typeof _renderAnalystNotes === 'function') _renderAnalystNotes();
}

function _universalAnalystRules(){
  var out = [], seen = {};
  (clients || []).forEach(function(c){
    var pools = LS.get('aba5_pools_' + c.id) || {};
    (Array.isArray(pools.analystNotes) ? pools.analystNotes : []).forEach(function(n){
      if(!n || n.scope !== 'universal' || n.state !== 'ok' || n.conflict) return;
      var t = String(n.text||'').trim();
      var k = t.toLowerCase().replace(/\s+/g,' ');
      if(!t || seen[k]) return;
      seen[k] = 1;
      out.push({ text: t, from: c.name || '' });
    });
  });
  return out;
}

function _programDocMinimums(pools){
  var out = { reinforcers: 0, activities: 0, social: 0, schedule: false, pastTense: false, text: '' };
  var txt = String((pools && pools.docreq) || '').trim();
  if(!txt) return out;
  out.text = txt;
  var W = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
            uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9 };
  var NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)';
  var num = function(v){ v = String(v).toLowerCase().trim(); return W[v] !== undefined ? W[v] : parseInt(v, 10); };
  // Split into lines and sentences so a number binds to the requirement it belongs to
  // and never to a neighbouring one.
  var lines = txt.split(/\r?\n|(?:\.\s+)/);
  lines.forEach(function(ln){
    var t = String(ln).toLowerCase();
    if(!t.trim()) return;
    var isSchedule = /schedule|esquema|cronograma/.test(t);
    if(isSchedule) out.schedule = true;
    if(/past tense|tiempo pasado|pasado\b/.test(t)) out.pastTense = true;
    // Prefer an explicit "at least N"; fall back to any small standalone number.
    var m = t.match(new RegExp('(?:at least|minimum(?: of)?|no fewer than|al menos|m[ií]nimo(?: de)?)\\s+' + NUM))
         || (isSchedule ? null : t.match(new RegExp('\\b' + NUM + '\\b')));
    var v = m ? num(m[1]) : 0;
    if(!(v >= 1 && v <= 9)) return;
    var isSocial = /social/.test(t);
    var isReinf  = /reinforc|reforzad|reforzamiento/.test(t);
    var isAct    = /activit|actividad/.test(t);
    if(isAct)                       out.activities  = Math.max(out.activities, v);
    if(isReinf && isSocial)         out.social      = Math.max(out.social, v);
    else if(isReinf && !isSchedule) out.reinforcers = Math.max(out.reinforcers, v);
  });
  return out;
}

function _clientDocRequirements(pools){
  var txt = String((pools && pools.docreq) || '').trim();
  if(!txt) return { text: '', wantsProgramDoc: false };
  var t = txt.toLowerCase();
  // Cualquier requisito con CUOTA numerica (reforzadores, actividades, sociales,
  // o cantidad de conductas/programas por nota) activa el bloque de minimos.
  var hasNumber = /\b(at least|minimum|m[ií]nimo|al menos)\b/.test(t) || /\b(two|three|four|dos|tres|cuatro|[2-9])\b/.test(t);
  var wants = hasNumber && /(reinforc|activit|social|behavior|program|conducta|reemplazo)/.test(t);
  return { text: txt, wantsProgramDoc: wants };
}



function validateSessionConsistency(){
  const errors = [];
  const warnings = [];
  const caspA = document.getElementById('casp_A')?.checked;
  const caspAresult = document.querySelector('input[name="casp_A_result"]:checked')?.value || 'ok';
  const caspB = document.getElementById('casp_B')?.checked;
  const caspBitems = caspB ? [...document.querySelectorAll('.casp_B_item:checked')].map(el=>el.value) : [];
  const caspC = document.getElementById('casp_C')?.checked;
  const caspD = document.getElementById('casp_D')?.checked;
  const caspDitems = caspD ? [...document.querySelectorAll('.casp_D_item:checked')].map(el=>el.value) : [];
  const customGoals97155 = getCustomGoals97155();
  if(caspA && caspAresult === 'ok' && caspB){
    errors.push({type:'casp_internal',msg:'Section A states no adjustments were clinically indicated, but Section B documents adjustments made.',fix:'Either change Section A to "adjustments required" or uncheck Section B.'});
  }
  if(caspB && !caspA){
    warnings.push({type:'casp_logic',msg:'Section B (adjustments made) is marked but Section A (observations) is not.',fix:'Consider marking Section A to document the observations that led to adjustments.'});
  }
  if(caspC){
    const caspCitems = [...document.querySelectorAll('.casp_C_item:checked')].map(el=>el.value);
    const trainingModified = caspCitems.some(item => item.toLowerCase().includes('training') && item.toLowerCase().includes('modified'));
    if(trainingModified && !caspB){
      errors.push({type:'casp_c_logic',msg:'Section C includes "training on modified protocol" but Section B is not marked.',fix:'Mark Section B or uncheck training on modified protocol.'});
    }
  }
  return { errors, warnings };
}

// Reset the per-session fields to an unset state so nothing is silently inherited.
function _clearSessionFields(){
  // Date
  const gd = document.getElementById('genDate');
  if(gd) gd.value = '';
  // Place — reset to a blank/placeholder option if one exists, else first option
  const gp = document.getElementById('genPlace');
  if(gp) gp.selectedIndex = 0;
  // Durations for each note type → back to "Not specified"
  ['dur97153','dur97155','dur97156','durSup'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){ const optEmpty=[...el.options].find(o=>o.value===''); el.value = optEmpty?'':el.options[0]?.value||''; }
  });
  // Participants → uncheck all and clear "Other"
  ['pClient','pSupervisor','pTechnician','pCaregiver','pOther'].forEach(pid=>{
    const el=document.getElementById(pid);
    if(el){ el.checked=false; if(el.dataset) delete el.dataset.manuallySet; }
  });
  const oTxt=document.getElementById('pOtherText'); if(oTxt) oTxt.value='';
  const oIn=document.getElementById('pOtherInput'); if(oIn) oIn.style.display='none';
  // Supervision type (97155 modality) → back to default RBT
  const supRbt = document.querySelector('input[name="supType"][value="rbt"]');
  if(supRbt){ supRbt.checked = true; }
  if(typeof onSupTypeChange==='function'){ try{ onSupTypeChange(); }catch(e){} }
}
function _thGuideTh(){ return (typeof activeTherapistId !== 'undefined' && activeTherapistId) || ''; }

// Vuelca TODO lo pendiente. Conserva el nombre historico: hay listeners que lo llaman.
function _flushCaseGuide(){
  clearTimeout(_guideTimer);
  var ids = Object.keys(_guidePending);
  if(!ids.length) return;
  var dirty = false;
  ids.forEach(function(id){
    var p = _guidePending[id];
    delete _guidePending[id];
    var t = _guideTherapist(id);
    if(t && (t.caseGuide || '') !== p.val){ t.caseGuide = p.val; dirty = true; }
    var msg = p.msgId && document.getElementById(p.msgId);
    if(msg){ msg.textContent = t ? '✓ guardado' : '⚠ terapista no encontrado'; msg.style.color = t ? 'var(--green,#16a34a)' : 'var(--red,#c0392b)'; }
  });
  // Un solo write por volcado: LS.set del roster es lo que sube a la nube.
  if(dirty) LS.set('aba5_therapists', therapists);
  _markCaseGuideBtn();
}

function _saveThGuide(){
  var ta = document.getElementById('thGuideText');
  var th = _thGuideTh();
  if(!ta || !th) return;
  _guideQueue(th, ta.value, 'thGuideMsg');
}

function _toggleCaseGuide(){
  var th = _caseGuideTh();
  LS.set(_caseGuideOpenKey(), _caseGuideOpen(th) ? 'closed' : 'open');
  _renderCaseGuide();
  var ta = document.getElementById('caseGuideText');
  if(ta && !ta.disabled && _caseGuideOpen(th)) setTimeout(function(){ ta.focus(); }, 30);
}

function _saveCaseGuide(){
  var ta = document.getElementById('caseGuideText');
  var th = _caseGuideTh();
  if(!ta) return;
  if(!th){
    var m0 = document.getElementById('caseGuideMsg');
    if(m0){ m0.textContent = 'elige un terapista para poder guardar'; m0.style.color = 'var(--red,#c0392b)'; }
    return;
  }
  _guideQueue(th, ta.value, 'caseGuideMsg');
}

function _markCaseGuideBtn(){
  var b = document.getElementById('genGuideBtn');
  if(!b) return;
  var th = _caseGuideTh();
  var has = th && String(_guideValue(th)).trim();
  b.textContent = has ? '📌 Setup ✓' : '📌 Setup';
  b.style.borderColor = has ? 'var(--blue)' : 'var(--border2)';
  b.style.color = has ? 'var(--blue)' : 'var(--text)';
}

function caspSectionsToServicesList(casp){
  if(!casp) return '';
  const lines = [];
  if(casp.A){
    lines.push('☑ Face-to-face observations were made to determine if protocol components are functioning effectively for the client or require adjustments.');
    const resultText = casp.Aresult === 'adj'
      ? 'This session\'s observations indicated that the protocol components required adjustments.'
      : 'This session\'s observations indicated that the protocol components were functioning effectively and therefore no adjustments were clinically indicated.';
    lines.push('   → ' + resultText);
  }
  if(casp.B && casp.Bitems && casp.Bitems.length){
    lines.push('☑ Adjustments were made to the selected components of the protocol.');
    lines.push('   Components: ' + casp.Bitems.join(', '));
  }
  if(casp.C && casp.Citems && casp.Citems.length){
    lines.push('☑ Active direction (face-to-face) was given to a technician as they delivered ABA services.');
    casp.Citems.forEach(item => lines.push('   → ' + item));
  }
  if(casp.D && casp.Ditems && casp.Ditems.length){
    lines.push('☑ QHP implementation of the protocol with the client related to: ' + casp.Ditems.join(', ') + '.');
  }
  return lines.join('\n');
}

function sessionTemplateToServicesList(tmpl){
  if(!tmpl) return '';
  const lines=[];
  if(tmpl.faceToFace){
    lines.push('☑ Face-to-face observations were made to determine if protocol components are functioning effectively for the client or require adjustments.');
    if(tmpl.faceToFace.resultText) lines.push('   → '+tmpl.faceToFace.resultText);
  }
  if(tmpl.adjustments&&tmpl.adjustments.components.length){
    lines.push('☑ Adjustments were made to the selected components of the protocol.');
    lines.push('   Components: '+tmpl.adjustments.components.join(', '));
  }
  if(tmpl.activeDirection&&tmpl.activeDirection.actions.length){
    lines.push('☑ Active direction (face-to-face) was given to a technician as they delivered ABA services.');
    tmpl.activeDirection.actions.forEach(a=>lines.push('   → '+a));
  }
  if(tmpl.qhpImplementation&&tmpl.qhpImplementation.resultText){
    lines.push('☑ QHP implementation of the protocol with the client related to: '+tmpl.qhpImplementation.resultText);
  }
  return lines.join('\n');
}



const _NO_FAB_TAIL = '\n\nFINAL INSTRUCTION - HIGHEST PRIORITY, OVERRIDES ANY EARLIER EXAMPLE OR TEMPLATE: Before writing each sentence, verify every number in it. This note must contain NO performance figures of any kind - no "X out of Y", no "N of M opportunities/trials/occasions", no accuracy percentages, no counts of occasions, no durations in seconds - unless that exact figure appears verbatim in the session data provided above. If the data above contains no trial numbers, replacement-program performance is described ONLY in qualitative observable terms with zero numbers. A single invented figure makes the note unusable and creates Medicaid audit exposure.';

// Per-run API telemetry. Slowness was being diagnosed by guessing (connection?
// country? model?), so measure it instead: how many calls, how long each took, how
// much was uploaded, and how many retries and of what kind. Read it from the browser
// console with _apiReport().
/* ── Consumo y crédito de Gemini ─────────────────────────────────────────────
   La API de Gemini NO expone el saldo de la cuenta: no hay ningún endpoint que
   devuelva cuánto crédito queda, así que el importe exacto es imposible de leer
   desde aquí. Lo que sí devuelve cada respuesta es usageMetadata con los tokens
   realmente consumidos. Con eso y el precio por millón de tokens se estima el
   gasto y se descuenta del crédito que el usuario declara haber cargado. Es una
   ESTIMACIÓN basada en consumo real, no el saldo de Google, y así se rotula.

   Un 429 repetido con clave de pago suele ser justo esto: el crédito agotado.  */
var GEM_PRICE_DEFAULT = { in: 0.30, out: 2.50 };   // USD por millón de tokens, gemini-2.5-flash
var GEM_ALERT_DEFAULT = 1.00;

var _apiStats = { calls: 0, ms: 0, bytes: 0, retries: 0, byStatus: {}, slowest: 0, log: [] };
function _apiResetStats(){ _apiStats = { calls: 0, ms: 0, bytes: 0, retries: 0, byStatus: {}, slowest: 0, log: [] }; }
function _apiReport(){
  var s = _apiStats;
  var out = {
    llamadas: s.calls,
    tiempo_total_s: +(s.ms/1000).toFixed(1),
    media_por_llamada_s: s.calls ? +(s.ms/s.calls/1000).toFixed(1) : 0,
    llamada_mas_lenta_s: +(s.slowest/1000).toFixed(1),
    subido_KB: Math.round(s.bytes/1024),
    reintentos: s.retries,
    reintentos_por_codigo: s.byStatus,
    detalle: s.log
  };
  try{ console.table(s.log); }catch(e){}
  console.log('[API] resumen:', out);
  return out;
}

// Visible text this model must still be able to produce after reasoning. Reasoning
// tokens are charged against maxOutputTokens, so a call whose thinking budget eats
// most of the budget truncates the note mid-sentence — and it does so at RANDOM,
// because how much the model reasons varies run to run. That is what made the same
// note come out cut off, then wrong, then fine on the third attempt.
const MIN_VISIBLE_TOKENS = 12288;

async function callAPI(prompt, sysPrompt, noteType, clientId, maxTokens = 8192, thinkingBudget = null){
  // Recency-position anti-fabrication reminder: models comply far better with the
  // LAST instruction in a long prompt. Applied to every note-type call centrally.
  if (noteType) prompt += _NO_FAB_TAIL;
  const fullPrompt = sysPrompt ? sysPrompt + '\n\n' + prompt : prompt;

  // Central floor so no call site can leave the note without room to be written.
  // Only applies to note-type calls: the short extraction calls pass thinkingBudget 0
  // and rely on their small budgets. Raising the ceiling costs nothing — Gemini bills
  // the tokens actually produced, not the maximum allowed.
  if (noteType && thinkingBudget && maxTokens - thinkingBudget < MIN_VISIBLE_TOKENS) {
    const raised = thinkingBudget + MIN_VISIBLE_TOKENS;
    console.warn('[callAPI] Budget too tight for ' + noteType + ' (max ' + maxTokens
      + ', thinking ' + thinkingBudget + '); raised to ' + raised + '.');
    maxTokens = raised;
  }

  const _t0 = Date.now();
  const _r0 = _apiStats.retries;
  try {
    const response = await callGeminiAPI(fullPrompt, maxTokens, false, thinkingBudget);
    return response;
  } catch(err) {
    throw new Error('Gemini API error: ' + err.message);
  } finally {
    const _ms = Date.now() - _t0;
    _apiStats.calls++;
    _apiStats.ms += _ms;
    _apiStats.bytes += fullPrompt.length;
    if(_ms > _apiStats.slowest) _apiStats.slowest = _ms;
    _apiStats.log.push({
      tipo: noteType || 'tarjeta',
      segundos: +(_ms/1000).toFixed(1),
      KB_enviados: Math.round(fullPrompt.length/1024),
      max_tokens: maxTokens,
      reintentos: _apiStats.retries - _r0
    });
  }
}

function getApiKey() { return LS.get('aba5_apikey') || ''; }

// Small status indicator shown during automatic retries so the user knows the app
// is working (not frozen) while it waits out a server-busy condition.
function _showRetryStatus(attempt, max, waitSec, status){
  let el = document.getElementById('_retryStatus');
  if (!el) {
    el = document.createElement('div');
    el.id = '_retryStatus';
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;background:#1e293b;color:#fbbf24;padding:10px 16px;border-radius:8px;z-index:99999;font-size:12px;font-family:var(--mono);box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:300px;line-height:1.5';
    document.body.appendChild(el);
  }
  /* El 429 es la cuota de la clave, no una saturación de Google (eso es el 503), y
     conviene distinguirlos. Pero decía "TU clave, TU propia cuota", que era cierto
     cuando cada terapista pegaba la suya y dejó de serlo al mover la llamada a la
     Edge Function: hoy la clave es UNA, vive en el servidor y la comparte todo el
     equipo. El mensaje mandaba a la gente a buscar una clave personal que no existe
     y a recargar una cuenta que no es la que se agotó. */
  const cause = status === 429
    ? 'Límite de la clave de Gemini alcanzado (429): es la cuota de la clave compartida del equipo, no los servidores de Google'
    : (status === 503 ? 'Servidores de Gemini saturados (503)'
    : (status ? 'Error temporal de Gemini (' + status + ')' : 'Reintentando'));
  el.textContent = `⏳ ${cause}. Reintento automático ${attempt+1} de ${max}, esperando ${waitSec}s…`;
  if(typeof _apiStats === 'object'){ _apiStats.retries++; if(status) _apiStats.byStatus[status] = (_apiStats.byStatus[status]||0) + 1; }
}
function _clearRetryStatus(){
  const el = document.getElementById('_retryStatus');
  if (el) el.remove();
}

function clearApiKey() { LS.del('aba5_apikey'); renderApiBanner(); }

// (importBackup defined later — safer merge-based version)

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
// Date field starts BLANK on load (no auto-fill) so a date is never inherited or
// silently assumed. The user must enter the session date for each note.
document.getElementById('genDate').value = '';
buildDurOptions('dur97153','2 hours');
buildDurOptions('dur97155','2 hours');
buildDurOptions('dur97156','1 hour');
onNoteCheckChange('97153');
onNoteCheckChange('97155');
onNoteCheckChange('97156');
onNoteCheckChange('sup');

// ── STORAGE MANAGEMENT ──────────────────────────────────────────────────────
// Defensive utilities to prevent silent data loss when localStorage fills up.

function _calcStorageUsage(){
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    total += (localStorage.getItem(k) || '').length + (k || '').length;
  }
  return total;
}

// Remove legacy `aba5_summary_<id>` duplicates (the current code uses `aba5_sum_<id>`).
// Both keys held the same content from an older app version. Safe to remove the legacy one
// when a `aba5_sum_<id>` exists; otherwise migrate the legacy key to the new name.
function _cleanupLegacySummaryKeys(){
  const toProcess = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('aba5_summary_')) toProcess.push(k);
  }
  let removed = 0, migrated = 0, freed = 0;
  toProcess.forEach(legacyKey => {
    const clientId = legacyKey.substring('aba5_summary_'.length);
    const newKey = 'aba5_sum_' + clientId;
    const legacyVal = localStorage.getItem(legacyKey) || '';
    const newVal = localStorage.getItem(newKey);
    if (newVal !== null) {
      // Both exist — remove the legacy duplicate
      freed += legacyVal.length;
      localStorage.removeItem(legacyKey);
      removed++;
    } else if (legacyVal) {
      // Only legacy exists — migrate to the new key
      localStorage.setItem(newKey, legacyVal);
      localStorage.removeItem(legacyKey);
      migrated++;
    }
  });
  return { removed, migrated, freed };
}

// Remove data for clients that no longer exist in `aba5_clients`.
// Scans all per-client keys and deletes those tied to non-existent clientIds.
function _cleanupOrphanedClientData(){
  const validIds = new Set((LS.get('aba5_clients') || []).map(c => c.id));
  const prefixes = ['aba5_sum_','aba5_summary_','aba5_pools_','aba5_hist_','aba5_notes_',
                    'aba5_plan_','aba5_closing_','aba5_opening_','aba5_proto_recent_',
                    'aba5_bcabasup_comp_','aba5_bcabasup_task_','aba5_bcabasup_eval_','aba5_monthdata_'];
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    for (const prefix of prefixes) {
      if (k.startsWith(prefix)) {
        const remainder = k.substring(prefix.length);
        const m = remainder.match(/^(c\d+[a-z0-9]+)/i);
        if (m && !validIds.has(m[1])) toRemove.push(k);
        break;
      }
    }
  }
  let freed = 0;
  toRemove.forEach(k => {
    freed += (localStorage.getItem(k) || '').length;
    localStorage.removeItem(k);
  });
  return { removed: toRemove.length, freed };
}

// Safely write to localStorage. On QuotaExceededError, show a clear banner so the
// user knows their save failed instead of failing silently.
function _safeLSSet(key, value){
  try {
    LS.set(key, value);
    return true;
  } catch(e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
      _showStorageFullBanner();
      console.error('Storage full when writing key:', key);
      return false;
    }
    throw e;
  }
}

function _showStorageFullBanner(){
  let banner = document.getElementById('_storageWarningBanner');
  if (banner) return;
  banner = document.createElement('div');
  banner.id = '_storageWarningBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:white;padding:14px 16px;text-align:center;z-index:99999;font-weight:600;font-size:13px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,.25)';
  banner.innerHTML = '⚠ Storage is full — your latest change was NOT saved. Click "Storage Manager" to free up space. ' +
    '<button onclick="_openStorageManager()" style="background:white;color:#dc2626;border:none;padding:5px 12px;border-radius:4px;margin-left:10px;cursor:pointer;font-weight:700">Open Storage Manager</button>' +
    '<button onclick="document.getElementById(\'_storageWarningBanner\').remove()" style="background:transparent;color:white;border:1px solid white;padding:5px 12px;border-radius:4px;margin-left:5px;cursor:pointer">Dismiss</button>';
  document.body.appendChild(banner);
}

function _openStorageManager(){
  const used = _calcStorageUsage();
  const usedMB = (used / 1024 / 1024).toFixed(2);
  const choice = prompt(
    `Current storage usage: ${usedMB} MB (typical browser limit: ~5 MB)\n\n` +
    `Available cleanup actions (all are safe — your active client data is preserved):\n\n` +
    `1 = Remove legacy duplicate summary keys (safe, recommended)\n` +
    `2 = Remove data for deleted clients (orphaned summaries / notes / history)\n` +
    `3 = Clear all automatic snapshots\n` +
    `4 = Run ALL of the above\n` +
    `Cancel = exit\n\n` +
    `Enter 1, 2, 3, or 4:`
  );
  if (!choice) return;
  let report = '';
  try {
    if (choice === '1' || choice === '4') {
      const r = _cleanupLegacySummaryKeys();
      report += `Legacy summary cleanup: removed ${r.removed} duplicates, migrated ${r.migrated} orphans, freed ${(r.freed/1024).toFixed(0)} KB\n`;
    }
    if (choice === '2' || choice === '4') {
      if (confirm('Remove all data for clients that no longer exist in your client list? This cannot be undone.')) {
        const r = _cleanupOrphanedClientData();
        report += `Orphaned data cleanup: removed ${r.removed} entries, freed ${(r.freed/1024).toFixed(0)} KB\n`;
      }
    }
    if (choice === '3' || choice === '4') {
      LS.del('aba5_snapshots');
      report += `Snapshots cleared.\n`;
    }
    const newUsage = (_calcStorageUsage() / 1024 / 1024).toFixed(2);
    alert(report + `\nNew storage usage: ${newUsage} MB`);
    const banner = document.getElementById('_storageWarningBanner');
    if (banner) banner.remove();
  } catch(e) {
    alert('Cleanup error: ' + e.message);
  }
}

// One-time automatic cleanup of legacy duplicate summary keys on startup.
// This is safe — it only removes verifiable duplicates and migrates orphan legacy keys.
// Marked with a flag so it only runs once per browser to avoid wasted scans.
function _runStartupCleanup(){
  if (LS.get('aba5_cleanup_v1_done')) return;
  try {
    const r = _cleanupLegacySummaryKeys();
    if (r.removed > 0 || r.migrated > 0) {
      console.log(`Startup cleanup: removed ${r.removed} legacy duplicates, migrated ${r.migrated}, freed ${(r.freed/1024).toFixed(0)} KB`);
    }
    LS.set('aba5_cleanup_v1_done', true);
  } catch(e) {
    console.warn('Startup cleanup error:', e);
  }
}
// Run as soon as the DOM is interactive
setTimeout(()=>_runStartupCleanup(), 500);

// ── EMERGENCY SNAPSHOT SYSTEM ────────────────────────────────────────────────
// Saves a complete snapshot of all data to localStorage under a separate key.
// Used as a safety net before any destructive operation, and on a timer as
// continuous protection against data loss.
function _saveEmergencySnapshot(reason){
  try{
    const snapshot = {
      reason: reason || 'auto',
      taken: new Date().toISOString(),
      version: 8,
      therapists: LS.get('aba5_therapists') || [],
      clients: LS.get('aba5_clients') || [],
      summaries: {}, pools: {}, history: {}, notes: {}
    };
    (snapshot.clients||[]).forEach(c => {
      const s = LS.get('aba5_sum_'+c.id);
      const p = LS.get('aba5_pools_'+c.id);
      const h = LS.get('aba5_hist_'+c.id);
      const n = LS.get('aba5_notes_'+c.id);
      if (s) snapshot.summaries[c.id] = s;
      if (p) snapshot.pools[c.id] = p;
      if (h) snapshot.history[c.id] = h;
      if (n) snapshot.notes[c.id] = n;
    });
    // Keep only 1 most recent snapshot (was 3, which was filling storage).
    const existing = LS.get('aba5_snapshots') || [];
    const updated = [snapshot, ...existing].slice(0, 1);
    LS.set('aba5_snapshots', updated);
    return true;
  } catch(err){
    console.warn('Snapshot failed:', err);
    return false;
  }
}

function _restoreEmergencySnapshot(index){
  const snapshots = LS.get('aba5_snapshots') || [];
  const snap = snapshots[index||0];
  if(!snap) { alert('No snapshot available.'); return false; }
  const msg = `Restore snapshot from ${new Date(snap.taken).toLocaleString()}?\n\n` +
    `This will MERGE the snapshot into your current data:\n` +
    `• ${(snap.clients||[]).length} client(s) in snapshot\n` +
    `• ${(snap.therapists||[]).length} therapist(s) in snapshot\n\n` +
    `Your current data will not be deleted. Items in the snapshot will overwrite the matching current items by ID.`;
  if(!confirm(msg)) return false;
  _saveEmergencySnapshot('pre-restore-' + Date.now());
  // Apply same merge logic as importBackup
  const existingClients = LS.get('aba5_clients') || [];
  const merged = [...existingClients];
  (snap.clients||[]).forEach(bc => {
    const idx = merged.findIndex(c => c.id === bc.id);
    if (idx >= 0) merged[idx] = bc; else merged.push(bc);
  });
  clients = merged;
  LS.set('aba5_clients', clients);
  const existingTherapistIds = new Set(therapists.map(t => t.id));
  (snap.therapists||[]).forEach(t => { if(!existingTherapistIds.has(t.id)) therapists.push(t); });
  LS.set('aba5_therapists', therapists);
  Object.entries(snap.summaries||{}).forEach(([id,s])=>{ if(s) LS.set('aba5_sum_'+id,s); });
  Object.entries(snap.pools||{}).forEach(([id,p])=>{ if(p) LS.set('aba5_pools_'+id,p); });
  Object.entries(snap.history||{}).forEach(([id,h])=>{ if(h) LS.set('aba5_hist_'+id,h); });
  Object.entries(snap.notes||{}).forEach(([id,n])=>{ if(n) LS.set('aba5_notes_'+id,n); });
  renderTherapistList();
  refreshAllTherapistSelects();
  renderClientList();
  if(typeof refreshGenClientSelect === 'function') refreshGenClientSelect();
  alert('Snapshot restored. Total clients: ' + clients.length);
  return true;
}

function _showSnapshotsList(){
  const snapshots = LS.get('aba5_snapshots') || [];
  if(!snapshots.length){
    showMsg('snapshotMsg','No snapshots available yet — they accumulate while you use the app.','err');
    return;
  }
  let msg = 'Available snapshots:\n\n';
  snapshots.forEach((snap, i) => {
    msg += `${i+1}. ${new Date(snap.taken).toLocaleString()} — ${(snap.clients||[]).length} client(s)  [${snap.reason}]\n`;
  });
  msg += '\nEnter the number of the snapshot to restore (1, 2, or 3), or Cancel to exit.';
  const input = prompt(msg);
  if(input === null) return;
  const idx = parseInt(input,10) - 1;
  if(isNaN(idx) || idx < 0 || idx >= snapshots.length){
    showMsg('snapshotMsg','Invalid selection.','err');
    return;
  }
  _restoreEmergencySnapshot(idx);
}

// NOTE: Auto-snapshot timer disabled — snapshots were filling localStorage and
// causing silent save failures. Snapshots now only run on explicit user action
// or before destructive operations (like import).
// Initial snapshot on load only — and only if we have enough free space.
setTimeout(()=>{
  try {
    const used = _calcStorageUsage();
    // Only take a startup snapshot if we have at least 1 MB free
    if (used < 4 * 1024 * 1024) {
      _saveEmergencySnapshot('startup');
    }
  } catch(e){}
}, 2000);

function clearSupFromNote(){
  document.getElementById('supFromNoteText').value = '';
  document.getElementById('supFromNoteClient').value = '';
  document.getElementById('supFromNoteOutput').style.display = 'none';
  showMsg('supFromNoteMsg','','ok',1);
}


/* ═══════════════════════════════════════════════════════════
   SINGLE CLIENT EXPORT / IMPORT
═══════════════════════════════════════════════════════════ */

function exportSingleClient(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) { alert('Client not found.'); return; }

  const exportData = {
    version: 'single-client-v1',
    exportDate: new Date().toISOString(),
    appVersion: 'ABA Clinical Notes Generator',
    client,
    pools: LS.get('aba5_pools_' + clientId) || {},
    summary: LS.get('aba5_sum_' + clientId) || '',
    history: LS.get('aba5_hist_' + clientId) || {},
    noteHistory: loadNoteHistory(clientId),
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const filename = client.name.replace(/[^a-z0-9]/gi, '_') + '_' + new Date().toISOString().slice(0,10) + '.json';

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (!isMobile) {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } else {
    showExportMobileModal(client.name, jsonStr);
  }
}

function triggerImportClient() {
  const el = document.getElementById('importClientFile');
  if (el) { el.value = ''; el.click(); }
}

function importSingleClient(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.client || !data.client.id || !data.client.name || !data.version) {
        alert('Este archivo no es un export válido de cliente.');
        return;
      }
      _pendingImport = data;

      const existing = clients.find(c => c.id === data.client.id);
      const modal = document.getElementById('importClientModal');
      const info = document.getElementById('importClientInfo');
      const conflict = document.getElementById('importClientConflict');

      const exportDate = data.exportDate ? new Date(data.exportDate).toLocaleDateString() : 'fecha desconocida';
      const noteCount = (data.noteHistory || []).length;
      const hasBeh = (data.pools && Object.keys(data.pools).length > 0);
      const hasSummary = !!data.summary;
      const therapistExists = therapists.find(t => t.id === data.client.therapistId);
      info.innerHTML =
        '<b>Cliente:</b> ' + esc(data.client.name) + '<br>' +
        '<b>Exportado el:</b> ' + exportDate + '<br>' +
        '<b>Notas guardadas:</b> ' + noteCount + '<br>' +
        '<b>Conductas configuradas:</b> ' + (hasBeh ? 'Sí' : 'No') + '<br>' +
        '<b>Resumen clínico:</b> ' + (hasSummary ? 'Sí' : 'No') +
        (!therapistExists && therapists.length > 0 ? '<br><span style="color:#f59e0b;font-size:11px">⚠ El terapeuta original no existe. Se asignará a ' + esc(therapists[0].name) + '.</span>' : '') +
        (!therapistExists && therapists.length === 0 ? '<br><span style="color:#f59e0b;font-size:11px">⚠ No hay terapeutas configurados. Se creará uno temporal.</span>' : '');

      if (existing) {
        conflict.style.display = 'block';
        conflict.innerHTML = '⚠ Ya existe un cliente con este ID (<b>' + esc(existing.name) + '</b>). Sus datos serán <b>reemplazados</b>.';
      } else {
        conflict.style.display = 'none';
      }

      modal.style.display = 'flex';
    } catch(err) {
      alert('Error al leer el archivo: ' + err.message);
    }
  };
  reader.readAsText(file);
}


/* ─── PREVIOUS SESSION NOTE HELPERS (97155/97156 modal) ────────────── */

function srHandlePrevNoteFile(input){
  const file = input.files[0];
  if(!file) return;
  const nameEl = document.getElementById('srPrevNoteFileName');
  if(nameEl){ nameEl.textContent = file.name; nameEl.style.display = 'inline'; }
  const badge = document.getElementById('srAutoplanBadge');
  if(badge) badge.style.display = 'none';
  mthReadFile(file).then(text => {
    const ta = document.getElementById('srPrevPlan');
    if(ta) ta.value = text;
  });
}

function srClearPrevNote(){
  const ta = document.getElementById('srPrevPlan');
  if(ta) ta.value = '';
  const badge = document.getElementById('srAutoplanBadge');
  if(badge) badge.style.display = 'none';
  const fileEl = document.getElementById('srPrevNoteFile');
  if(fileEl) fileEl.value = '';
  const nameEl = document.getElementById('srPrevNoteFileName');
  if(nameEl){ nameEl.textContent = ''; nameEl.style.display = 'none'; }
}

function srCopyPrevNotePrompt(){
  const el = document.getElementById('srPrevNoteOPPrompt');
  if(!el) return;
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const btn = el.nextElementSibling;
    if(btn){ const o=btn.textContent; btn.textContent='✓ Copied'; setTimeout(()=>btn.textContent=o,2000); }
  }).catch(()=>{ if(el.select) el.select(); document.execCommand('copy'); });
}

function buildOPPrompt(){
  const clientId = document.getElementById('mthClientSel').value;
  const period = document.getElementById('mthPeriod').value;
  const clientName = clientId ? (clients.find(c=>c.id===clientId)?.name || 'this client') : 'this client';

  let monthLabel = 'this month';
  if(period){
    const [yr,mo] = period.split('-');
    const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    monthLabel = names[parseInt(mo)-1]+' '+yr;
  }

  return (
    'READ ONLY \u2014 do not modify, save, or submit anything in OfficePuzzle.\n\n' +
    'I need you to read ALL session documentation for ' + clientName + ' for ' + monthLabel + ' from OfficePuzzle: ' +
    '97155 analyst session notes, 97156 caregiver training notes, and any monthly data reports or graphs available. ' +
    'Copy the full text of each note and all data. Compile the following:\n\n' +
    '- Total sessions completed (97155 count and 97156 count separately)\n' +
    '- Authorized service hours or units\n' +
    '- Maladaptive behaviors: for each behavior, occurrence counts by session or by week\n' +
    '- Replacement programs: accuracy percentages, trial counts, and prompt levels per program\n' +
    '- Session Plan paragraphs: copy any "For the next session" statements from 97155 notes exactly\n' +
    '- Caregiver training (97156 notes): skills addressed, caregiver performance, goals covered\n' +
    '- Protocol modifications made during the month\n' +
    '- New behaviors that emerged or were added to the plan\n' +
    '- Changes to the treatment plan (new goals, discontinued goals, updated criteria)\n' +
    '- IOA conducted: method, result percentage, and behaviors assessed\n' +
    '- Medical concerns, medication changes, or environmental factors noted\n\n' +
    'Return all of this as plain text. Do not summarize or interpret \u2014 copy the data exactly. ' +
    'I will paste your response into the Monthly Summary generator.'
  );
}

function collectMthData(){
  const malData = [];
  for(let i=0;i<_mthMalCount;i++){
    const name = document.getElementById('mthMal_name_'+i)?.value.trim();
    if(!name) continue;
    const w = [1,2,3,4].map(w=>{ const v=document.getElementById('mthMal_w'+w+'_'+i)?.value.trim(); return v!==''&&v!==undefined?parseInt(v):null; });
    const total = w.reduce((s,v)=>s+(v||0),0);
    malData.push({name, w1:w[0], w2:w[1], w3:w[2], w4:w[3], total, provided:w.some(v=>v!==null)});
  }
  const repData = [];
  for(let i=0;i<_mthRepCount;i++){
    const name = document.getElementById('mthRep_name_'+i)?.value.trim();
    if(!name) continue;
    const pct = document.getElementById('mthRep_pct_'+i)?.value.trim();
    const trials = document.getElementById('mthRep_trials_'+i)?.value.trim();
    const prompt = document.getElementById('mthRep_prompt_'+i)?.value;
    repData.push({name, pct:pct||null, trials:trials||null, prompt:prompt||null});
  }
  return {malData, repData};
}

/* ── FABRICATED-NUMBER GUARD (Medicaid audit backstop) ───────────────────
   Deterministic post-generation scan. Flags performance-number shapes that are
   almost always fabricated when the figure was not provided (X of Y opportunities,
   on N occasions, N% accuracy, for up to N seconds). Warning only: never edits the
   note, never throws, so it can never break generation. */
// Response blocking is clinically defined as a brief period of 10-15 seconds.
// That specific figure is a documented clinical rule, NOT fabricated data, so the
// number guards must not flag it. Default wording stays qualitative ("a brief
// period"); the explicit range is only used if an auditor asks for it.
function _dropBlockingRange(hits, text){
  return (hits||[]).filter(function(h){
    if(!/\b10\s*(?:to|-|–)\s*15\s+seconds?\b/i.test(h)) return true;
    // keep it only if it is NOT about response blocking
    return !/block|blocking|interrupt/i.test(text);
  });
}
var PCT_SRC = '\\s*(?:%|percent)\\s*';

// Valor numerico de un fragmento, con cifras o con letras, para poder comprobarlo
// contra los datos autorizados de la sesion.
function _numTokens(frag){
  var out = [];
  String(frag||'').toLowerCase().replace(/\d+/g, function(n){ out.push(parseInt(n,10)); return n; });
  var wre = new RegExp('\\b(' + Object.keys(NUM_WORDS).join('|') + ')(?:[-\\s](' + Object.keys(NUM_WORDS).join('|') + '))?\\b', 'g');
  String(frag||'').toLowerCase().replace(wre, function(m, a, b){
    var v = NUM_WORDS[a] || 0;
    if(b){ var w = NUM_WORDS[b] || 0; v = (v >= 20 && w < 10) ? v + w : (w === 100 ? v * w : v + w); }
    out.push(v); return m;
  });
  return out;
}

// Remove a self-audit / compliance checklist the model may append to the note.
// Cuts from the first checklist marker to the end: everything after it is
// meta-commentary, never clinical content. Returns {text, cut}.
function _stripSelfAudit(text){
  if(!text) return { text: text, cut: false };
  var lines = String(text).split('\n');
  var markers = [
    /^\s*[*\-•]?\s*\*?\s*(Are|Is|Does|Did|Was|Were|Has|Have|Do)\b[^?]{0,120}\?/i,  // "* *Is POS stated?*"
    /^\s*[*\-•]\s*.*\((Yes|No)\b[^)]*\)\s*$/i,                                    // "- Shaping (Yes)"
    /^\s*(CHECKLIST|VERIFICATION|SELF[- ]CHECK|COMPLIANCE CHECK|AUDIT)\b/i,
    /^\s*[*\-•]?\s*\*{0,2}\s*(Double[\s-]?Check|Prohibited\s+Terms?|Terminology\s+Check|Term\s+Check|Final\s+Check|Self[\s-]?Audit)\b/i, // "* Double Check Prohibited Terms:"
    /^\s*[*\-•]?\s*["'][^"']{1,40}["']\s*[-–—:]\s*(Yes|No)\b/i,                    // '* "calm" - No.'
    /\b(exact match|Perfect)\.?\s*$/i
  ];
  var hits = 0, cutAt = -1;
  for(var i = 0; i < lines.length; i++){
    var isMarker = markers.some(function(re){ return re.test(lines[i]); });
    if(isMarker){
      hits++;
      if(cutAt < 0) cutAt = i;
    } else if(cutAt >= 0 && lines[i].trim() && hits < 2){
      cutAt = -1; hits = 0;   // era una linea suelta, no un bloque de checklist
    }
  }
  // Solo se corta ante un BLOQUE (2+ marcadores), nunca por una frase aislada.
  if(cutAt >= 0 && hits >= 2){
    return { text: lines.slice(0, cutAt).join('\n').replace(/\s+$/,''), cut: true };
  }
  return { text: text, cut: false };
}

// Detect a month/period that does not belong to this session. A past event
// re-dated to today is a falsified record, so any foreign month or date is
// surfaced for review.
function scanForeignDates(noteText, sessionDate){
  var out = [], seen = {};
  if(!noteText) return out;
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December',
                'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var sd = String(sessionDate||'').toLowerCase();
  months.forEach(function(m){
    if(sd && sd.indexOf(m.toLowerCase()) >= 0) return;
    var re = new RegExp('\\b' + m + '\\b[^.,;]{0,12}', 'gi'), hit;
    while((hit = re.exec(noteText))){
      var frag = hit[0].trim(), k = frag.toLowerCase();
      if(!seen[k]){ seen[k] = 1; out.push(frag); }
    }
  });
  var dre = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, d;
  while((d = dre.exec(noteText))){
    if(sd && sd.indexOf(d[0].toLowerCase()) >= 0) continue;
    if(!seen[d[0]]){ seen[d[0]] = 1; out.push(d[0]); }
  }
  return out;
}

// Flag an environmental/medical event in a note where NONE was reported for the
// session. Those fields are the only legitimate source; anything else comes from
// the profile's history and must not appear as a current event.
function scanUnreportedEvents(noteText, hadEnv, hadMed){
  var out = [];
  if(!noteText) return out;
  var t = String(noteText);
  if(!hadEnv){
    [/\bmoved\b|\brelocat\w+/i, /\bnew (?:caregiver|nanny|teacher|school|classroom|home)\b/i,
     /\bchange (?:in|of) (?:routine|schedule|school|classroom|residence)\b/i,
     /\bvisit(?:ing|ors?)\b.{0,20}\b(?:relatives|family)\b/i, /\btravel(?:ed|ling|ing)?\b/i]
    .forEach(function(re){ var m = t.match(re); if(m) out.push('ambiental: "' + m[0] + '"'); });
  }
  if(!hadMed){
    [/\bmedication (?:change|adjust\w+|was (?:started|changed))/i, /\b(?:was |been )?(?:ill|sick)\b/i,
     /\bill(?:ness)\b/i, /\bpoor sleep\b|\bdid not sleep\b/i, /\b(?:doctor|medical) appointment\b/i,
     /\bfever\b|\bcongest\w+/i]
    .forEach(function(re){ var m = t.match(re); if(m) out.push('m\u00E9dico: "' + m[0] + '"'); });
  }
  return out;
}
// Shared 97153 (RBT) language scan. Two red lines the user audits with maximum
// sensitivity: (1) prohibited emotional/mentalist terminology, (2) analyst-only
// scope language (progress/interpretation/recommendation an RBT must not use).
// The full lists live here (they used to exist only in the manual audit
// _abaDeterministicAudit, which does not run at generation time) so BOTH note
// paths - AbaMatrix _abaGenerate97153 AND the Generador completo - warn the same
// way no matter how the 97153 note was produced.
function _scan97153Language(text){
  var banned = ['sensory','relaxation','relaxing','calming','calm','deep breathing','breathing technique','self-regulation','self-soothing','coping','mindfulness','meditation','yoga','problem solving','conflict resolution','social stories','social narratives','anger management','art therapy','frustration','frustrated','stress','anxiety','anxious','upset','empathy','de-escalation','desensitization','response cost','planned ignoring','overwhelm'];
  var scope  = ['progress','made progress','improvement','improved','growth','gains','mastery','mastered','learning','learned','understanding','comprehension','effective','effectiveness','effectively','appeared to','seemed to','likely','suggests','indicates','would benefit','recommend','recommendation','should be adjusted','needs modification','responding well','demonstrates progress'];
  // Trailing \w* (not \b) so the stem catches inflections the note actually uses -
  // e.g. "overwhelm" -> "overwhelmed", "calm" -> "calmly", "stress" -> "stressed" -
  // all of which CLAUDE.md prohibits. A bare \b would miss "overwhelmed".
  var b = banned.filter(function(w){ return new RegExp('\\b' + w.replace(/[-\/]/g,'[-\\s/]?').replace(/\s+/g,'\\s+') + '\\w*','i').test(text); });
  var s = scope.filter(function(w){ return new RegExp('\\b' + w.replace(/\s+/g,'\\s+') + '\\b','i').test(text); });
  return { banned: b, scope: s };
}
// Fires the shared 97153 language warnings on the given message element. Combines
// both categories into a single showMsg call (showMsg overwrites textContent, so
// two separate calls would clobber each other and only the last would survive).
function _warn97153Language(text, msgId){
  try{
    var r = _scan97153Language(text);
    var parts = [];
    if(r.banned.length) parts.push('terminolog\u00EDa prohibida: "' + r.banned.join('", "') + '"');
    if(r.scope.length) parts.push('lenguaje fuera del alcance del RBT (analista): "' + r.scope.join('", "') + '"');
    if(parts.length && typeof showMsg==='function') showMsg(msgId,'\u26A0 REVISAR 97153 \u2014 ' + parts.join(' \u00B7 ') + '. Reescr\u00EDbelo en t\u00E9rminos observables/permitidos antes de usar la nota.','err',0);
  }catch(e){/* guard must never break generation */}
}
// El terapeuta presentando una demanda acad\u00E9mica. Documentarlo describe un servicio
// que no es el facturado y deja la nota sin el antecedente real: la conducta aparece
// ante la demanda del adulto natural, y eso es lo que el terapeuta interviene.
// Espanol que se quedo dentro de una nota en ingles. Los campos libres los rellena
// una persona que trabaja en espanol y el modelo a veces copia la frase tal cual;
// una nota bilingue no la acepta ningun auditor. Se exigen DOS palabras funcionales
// distintas antes de avisar: una sola aparece por casualidad (nombres propios,
// "de" en un apellido) y avisar por eso seria ruido.
var ES_STOPWORDS = ['que','del','los','las','una','unos','unas','con','para','por','como','pero','cuando','porque','segun','tambien','esta','este','esto','estos','estas','sus','sin','muy','hizo','tiene','tienen','fue','era','eran','estaba','estaban','habia','desde','hasta','entre','sobre','durante','mientras','aunque','ademas','mismo','misma','cada','todo','toda','todos','todas','nino','nina','madre','padre','abuela','abuelo','casa','escuela','maestra','maestro','semana','dia','dias','noche','ayer','manana','anoche','medicina','gripe','fiebre','durmio','duerme','mudaron','reporto','reporta','quiso','quiere','hacer','tarea','sesion','cliente','dijo','pidio','llego','salio','ayuda','pudo','tuvo','puso','respondio','presento','aplico','realizo','trabajo','jugar','comer','bano','juguete','juguetes','silla','mesa','papel','lapiz','tiempo','antes','despues','luego','entonces','ella','ellos','nosotros','usted','conducta','conductas'];

function scanSpanishLeftover(text){
  if(!text) return [];
  var t = ' ' + String(text).toLowerCase()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
    .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n') + ' ';
  var hits = [];
  ES_STOPWORDS.forEach(function(w){
    if(hits.indexOf(w) === -1 && new RegExp('[^a-z]' + w + '[^a-z]').test(t)) hits.push(w);
  });
  return hits.length >= 2 ? hits : [];
}

function scanTherapistAcademicDemand(text){
  if(!text) return [];
  var WHO  = '(?:the\\s+)?(?:RBT|technician|BCaBA|BCBA|analyst|therapist|behavior technician)';
  var VERB = '(?:presented|assigned|delivered|introduced|handed|gave|provided|placed|set up|instructed[^.;]{0,20}to complete)';
  var WHAT = '(?:[^.;]{0,60}?)(?:worksheet|homework|assignment|academic task|academic demand|academic instruction|classroom task|school ?work|curriculum|spelling|handwriting|writing task|reading task|math task|math worksheet)';
  var re = new RegExp('\\b' + WHO + '\\s+' + VERB + '\\s+' + WHAT, 'gi');
  var out = [], hit, seen = {};
  while((hit = re.exec(text))){
    var frag = hit[0].replace(/\s+/g,' ').trim();
    var k = frag.toLowerCase();
    if(!seen[k]){ seen[k] = 1; out.push(frag); }
  }
  return out;
}
// Aviso conciso tras generar 97153: resume los se\u00F1alamientos del MFC (reglas
// infringidas + n\u00FAmero) y los avisos de vac\u00EDo del plan (T5). APPEND al mensaje
// existente (no pisa a _postNoteChecks / _warn97153Language). El detalle con la
// frase exacta de cada hallazgo se ve en \u00ABAuditar nota\u00BB (#abaAuditOut).
function _warnMfcAudit(text, clientId, msgId){
  try{
    if(typeof _mfcAuditNote!=='function') return;
    var r = _mfcAuditNote(text, clientId);
    var parts = [];
    if(r.findings && r.findings.length){
      var rules = [];
      r.findings.forEach(function(f){ if(rules.indexOf(f.rule)===-1) rules.push(f.rule); });
      parts.push('MFC \u2014 ' + r.findings.length + ' se\u00F1alamiento(s): ' + rules.join('; ') + '. Revisa la frase de cada uno en \u00ABAuditar nota\u00BB.');
    }
    if(r.gapNotices && r.gapNotices.length){ parts.push('Aviso al analista: ' + r.gapNotices.join(' ')); }
    if(!parts.length) return;
    var el = document.getElementById(msgId);
    if(!el) return;
    var prev = el.textContent ? (el.textContent + ' \u00B7 ') : '';
    el.textContent = prev + '\u26A0 ' + parts.join(' \u00B7 ');
    el.className = 'msg msg-err';
  }catch(e){/* nunca romper la generaci\u00F3n */}
}

function _warnUngrounded(noteText, msgId){
  try{
    const hits=scanPerfNumbers(noteText);
    if(hits.length && typeof showMsg==='function'){
      showMsg(msgId,'\u26A0 VERIFICAR DATOS \u2014 la nota incluye cifra(s) de desempe\u00F1o: "'+hits.slice(0,5).join('", "')+'". Confirma que cada una ven\u00EDa en la informaci\u00F3n provista; si no, es fabricaci\u00F3n y debe eliminarse antes de usar la nota (riesgo de auditor\u00EDa).','err',0);
    }
  }catch(e){/* guard must never break generation */}
}

function clearMonthlySummary(){
  ['mthClientSel','mthPeriod','mthDocText','mthNotes','mthClinicalNotes'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.value=''; }
  });
  document.getElementById('mthOutput').style.display='none';
  showMsg('mthMsg','','ok',1);
}

/* ═══════════════════════════════════════════════════════════
   PRIOR SESSION CONTINUITY ENGINE
═══════════════════════════════════════════════════════════ */

const NOTE_TYPE_FAMILY = {
  '97153': ['97153'],
  '97155': ['97155','97155-rbt','97155-bcaba','97155-direct'],
  '97155-rbt': ['97155','97155-rbt'],
  '97155-bcaba': ['97155','97155-bcaba'],
  '97155-direct': ['97155','97155-direct'],
  '97156': ['97156'],
  'sup': ['sup','supervision','supervision-bcaba'],
  'supervision': ['sup','supervision'],
  'supervision-bcaba': ['sup','supervision-bcaba']
};

function getPriorSessionContext(clientId, ntId) {
  if (!clientId) return '';
  const history = loadNoteHistory(clientId);
  if (!history || !history.length) return '';

  const family = NOTE_TYPE_FAMILY[ntId] || [ntId];
  const prior = history.find(n => family.some(f => (n.type||'').includes(f)));
  if (!prior || !prior.text) return '';

  const paragraphs = prior.text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 40);
  let snapshot = '';
  if (paragraphs.length >= 2) {
    const tail = paragraphs.slice(-2).join('\n\n');
    snapshot = tail.length > 700 ? tail.slice(0, 700) + '...' : tail;
  } else {
    snapshot = prior.text.slice(0, 600) + (prior.text.length > 600 ? '...' : '');
  }

  return (
    `\n\nPRIOR SESSION CONTEXT (most recent ${NOTE_TYPE_LABELS[prior.type]||prior.type} note):\n` +
    `Use this to establish clinical continuity — reference prior session trends, prompt dependency levels, ` +
    `behavior frequency changes, and progress on replacement programs where clinically relevant. ` +
    `Do NOT copy or paraphrase this text verbatim. Draw from it only to inform comparisons.\n---\n${snapshot}\n---`
  );
}

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   GOOGLE DRIVE SYNC
═══════════════════════════════════════════════════════════ */

const DRIVE_FILE_NAME = 'aba_clinical_notes_sync.json';
const DRIVE_SCOPE     = 'https://www.googleapis.com/auth/drive.file';
const GSI_SRC         = 'https://accounts.google.com/gsi/client';

function getAnalystSupType(){
  const r=document.querySelector('input[name="anSupType"]:checked');
  return r?r.value:'rbt';
}

/* ── El tercero presente depende del lugar ───────────────────────────────────
   Una sesion en la escuela no tiene "caregiver" delante: tiene a la maestra, al
   asistente o al instructor. Escribir "caregiver" en una nota de escuela es un
   error clinico y una senal para el auditor. El lugar propone quien acompana; el
   usuario siempre manda, asi que en cuanto toca una casilla deja de proponerse. */
var AN_PLACE_THIRD_PARTY = {
  'school':    { caregiver: false, other: 'the classroom teacher' },
  'daycare':   { caregiver: false, other: 'the daycare staff' },
  'after school': { caregiver: false, other: 'the after-school staff' },
  'summer camp':  { caregiver: false, other: 'the camp counselor' },
  'home':      { caregiver: true,  other: '' },
  'office':    { caregiver: true,  other: '' },
  'clinic':    { caregiver: true,  other: '' }
};

function getAnalystParticipants(){
  const parts=[];
  if(document.getElementById('anPClient')?.checked) parts.push('client');
  if(document.getElementById('anPSupervisor')?.checked) parts.push('supervisor');
  if(document.getElementById('anPTechnician')?.checked) parts.push('technician');
  if(document.getElementById('anPCaregiver')?.checked) parts.push('caregiver');
  if(document.getElementById('anPOther')?.checked){
    let txt=document.getElementById('anPOtherText')?.value.trim();
    if(txt){ if(/\brbt\b/i.test(txt)) txt='the RBT'; parts.push(txt); }
  }
  return parts;
}

function getAnalystCaspSections(){
  const A=document.getElementById('anCasp_A')?.checked;
  const Aresult=document.querySelector('input[name="anCasp_A_result"]:checked')?.value||'ok';
  const B=document.getElementById('anCasp_B')?.checked;
  const Bitems=B?[...document.querySelectorAll('.anCasp_B_item:checked')].map(el=>el.value):[];
  const C=document.getElementById('anCasp_C')?.checked;
  const Citems=C?[...document.querySelectorAll('.anCasp_C_item:checked')].map(el=>el.value):[];
  const D=document.getElementById('anCasp_D')?.checked;
  const Ditems=D?[...document.querySelectorAll('.anCasp_D_item:checked')].map(el=>el.value):[];
  if(!A&&!B&&!C&&!D) return null;
  return {A,Aresult,B,Bitems,C,Citems,D,Ditems};
}

function getAnalystEmergingItems(){
  const mal=(document.getElementById('anEmergingMal')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const rep=(document.getElementById('anEmergingRep')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const int_=(document.getElementById('anEmergingInt')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const notes=(document.getElementById('anEmergingClinicalNotes')?.value||'').trim();
  if(!mal.length&&!rep.length&&!int_.length&&!notes) return null;
  return {mal,rep,int:int_,notes};
}

function getAnalystCustomGoals97155(){
  const val=document.getElementById('anCustomGoals97155')?.value.trim()||'';
  if(!val) return null;
  return val.split(/[\n]+/).map(s=>s.trim()).filter(Boolean).join('; ');
}

function getAnalystProtocolModComponents(){
  return [...document.querySelectorAll('.anProtoMod_item:checked')].map(el=>el.value);
}

// A BCaBA analyst can only do BCaBA → RBT or BCaBA direct — never BCaBA → BCaBA.
// Update the analyst supervision-type buttons to reflect the selected analyst's credential.
function _updateAnalystSupTypeForCredential(){
  const analystId = document.getElementById('anTherapistSel')?.value || '';
  const t = getTherapist(analystId);
  const cred = t ? t.credential : 'BCBA';
  const lblRbt = document.getElementById('an-srt-rbt');
  const lblBcaba = document.getElementById('an-srt-bcaba');
  const lblDirect = document.getElementById('an-srt-direct');
  const arrow = ' \u2192 ';
  if (lblRbt) lblRbt.innerHTML = `<input type="radio" name="anSupType" value="rbt" onchange="onAnalystSupTypeChange()"> ${cred}${arrow}RBT`;
  if (lblBcaba) lblBcaba.innerHTML = `<input type="radio" name="anSupType" value="bcaba" onchange="onAnalystSupTypeChange()"> ${cred}${arrow}BCaBA`;
  if (lblDirect) lblDirect.innerHTML = `<input type="radio" name="anSupType" value="direct" onchange="onAnalystSupTypeChange()"> ${cred} direct (no supervisee)`;
  // Hide BCaBA → BCaBA when the analyst is a BCaBA (clinically invalid)
  if (lblBcaba) lblBcaba.style.display = (cred === 'BCaBA') ? 'none' : '';
  // If the hidden option was selected, fall back to RBT
  const bcabaRadio = document.querySelector('input[name="anSupType"][value="bcaba"]');
  if (cred === 'BCaBA' && bcabaRadio && bcabaRadio.checked) {
    const rbtRadio = document.querySelector('input[name="anSupType"][value="rbt"]');
    if (rbtRadio) rbtRadio.checked = true;
    if (typeof onAnalystSupTypeChange === 'function') { try { onAnalystSupTypeChange(); } catch(e){} }
  }
}

function getAnalystFreqCounts(){
  const freqRows=document.getElementById('anFreqRows');
  if(!freqRows || freqRows.dataset.behaviors===undefined) return {};
  let behaviors=[];
  try{ behaviors=JSON.parse(freqRows.dataset.behaviors||'[]'); }catch(e){ behaviors=[]; }
  const counts={};
  behaviors.forEach((b,i)=>{
    const v=document.getElementById('anFreq_'+i)?.value;
    if(v!=='' && v!=null && !isNaN(v)) counts[b]=parseInt(v,10);
  });
  const red=document.getElementById('anFreq_redirections')?.value;
  if(red!=='' && red!=null && !isNaN(red)) counts['_redirections']=parseInt(red,10);
  return counts;
}

// Pick fresh behaviors for the analyst Clear action, forcing rotation away from the currently shown ones.
function _freshAnalystBehaviors(clientId, pools, excludeMal){
  const h=getHistory(clientId);
  const malActive=getActiveBehaviors(pools,'mal');
  const repActive=getActiveBehaviors(pools,'rep');
  // Directly remove currently shown behaviors from the pool so they cannot be re-selected
  const malPool=malActive.filter(b=>!(excludeMal||[]).includes(b));
  // Fall back to full pool only if not enough candidates remain
  const finalMalPool=malPool.length>=2?malPool:(malPool.length===1?malPool:malActive);
  return {
    mal: finalMalPool.length ? rotatingPick(finalMalPool, h.mal, 2) : [],
    rep: repActive.length ? rotatingPick(repActive, h.rep, 2) : []
  };
}

// Pick one goal from the combined analyst goal pool using rotation history.
function _pickOneAnalystGoal(clientId, supType){
  const h=getHistory(clientId);
  const g3pool=supType==='bcaba'?GOALS_POOL.g3bcaba:GOALS_POOL.g3rbt;
  const allGoals=[...GOALS_POOL.g1,...GOALS_POOL.g2,...g3pool,...GOALS_POOL.g4];
  const allHist=[...(h.g1||[]),...(h.g2||[]),...(h.g3||[]),...(h.g4||[])];
  return rotatingOne(allGoals, allHist)||'';
}


// Tracks the last used components per client in localStorage to rotate coverage.
function autoSelectProtoMods(clientId){
  const allEls=[...document.querySelectorAll('.anProtoMod_item')];
  if(!allEls.length) return;
  const allVals=allEls.map(el=>el.value);

  // Retrieve recently used components for this client (rolling window of last 8 used)
  const recentKey='aba5_proto_recent_'+(clientId||'_');
  const recent=(clientId?LS.get(recentKey):null)||[];

  // Exclude the 8 most recently used; fall back to full pool if too few remain
  const excluded=recent.slice(-8);
  let pool=allVals.filter(v=>!excluded.includes(v));
  if(pool.length<2) pool=allVals.filter(v=>!recent.slice(-3).includes(v));
  if(pool.length<1) pool=allVals;

  // Pick 1 or 2 components (weighted: ~35% chance of 2)
  const count=Math.random()<0.35?2:1;
  const shuffled=[...pool].sort(()=>Math.random()-0.5);
  const selected=shuffled.slice(0,Math.min(count,pool.length));

  // Apply selection
  allEls.forEach(el=>el.checked=false);
  selected.forEach(val=>{
    const el=document.querySelector(`.anProtoMod_item[value="${CSS.escape(val)}"]`);
    if(el) el.checked=true;
  });
  onAnalystProtoModChange();
}

// Call after a note is generated to record which components were used in the rotation log.
function _recordProtoModsUsed(clientId, components){
  if(!clientId||!components||!components.length) return;
  const key='aba5_proto_recent_'+clientId;
  const recent=LS.get(key)||[];
  const updated=[...recent, ...components].slice(-16); // keep last 16 entries
  LS.set(key, updated);
}



// The protocol modification actually executed this session (for the header line).
function buildAnalystProtocolMod(casp, emerging, components){
  if(components && components.length){
    let txt='Modifications were made to: '+components.join('; ')+'.';
    if(emerging && emerging.notes) txt+=' '+emerging.notes;
    return txt;
  }
  if(casp && casp.B && casp.Bitems && casp.Bitems.length){
    let txt='Adjustments made to '+casp.Bitems.join(', ')+'.';
    if(emerging && emerging.notes) txt+=' '+emerging.notes;
    return txt;
  }
  if(emerging && emerging.notes) return emerging.notes;
  return 'None documented for this session.';
}

// Deterministic header placed BEFORE the note body — independent lines.
function buildAnalystHeader(sessionMal, sessionRep, casp, emerging, components){
  const mal=[...sessionMal]; const rep=[...sessionRep];
  if(emerging){ if(emerging.mal) emerging.mal.forEach(x=>{if(!mal.includes(x))mal.push(x);}); if(emerging.rep) emerging.rep.forEach(x=>{if(!rep.includes(x))rep.push(x);}); }
  const malStr=mal.length?mal.join(', '):'see clinical context';
  const repStr=rep.length?rep.join(', '):'see clinical context';
  const protoStr=buildAnalystProtocolMod(casp, emerging, components);
  return {
    plain:'',
    html:`<div style="font-family:var(--mono);font-size:12px;line-height:1.8;color:var(--text);background:var(--bg);border:1px solid var(--border2);border-left:3px solid #7c3aed;border-radius:6px;padding:10px 14px;margin-bottom:10px">
      <div>${esc(malStr)}</div>
      <div>${esc(repStr)}</div>
      <div>${esc(protoStr)}</div>
    </div>`
  };
}

// Populate the BCaBA supervision checkbox grids in a given container.
function _populateBcabaSupCheckboxes(containerId, items, className){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = items.map(item => `
    <label style="display:flex;align-items:flex-start;gap:6px;font-size:11px;color:var(--text2);cursor:pointer;line-height:1.4">
      <input type="checkbox" class="${className}" value="${item.replace(/"/g,'&quot;')}" style="accent-color:#7c3aed;margin-top:2px;flex-shrink:0">
      <span>${item}</span>
    </label>`).join('');
}

// Read currently checked items from a class of checkboxes.
function _getCheckedValues(className){
  return [...document.querySelectorAll('.'+className+':checked')].map(c=>c.value);
}

// Auto-select BCaBA supervision items randomly with rotation per client.
function _autoSelectBcabaSup(clientId, prefix){
  // prefix: '' for Generate, 'an' for Analyst
  const compClass = prefix==='an' ? 'anBcabaSupComp_item' : 'bcabaSupComp_item';
  const taskClass = prefix==='an' ? 'anBcabaSupTask_item' : 'bcabaSupTask_item';
  const evalClass = prefix==='an' ? 'anBcabaSupEval_item' : 'bcabaSupEval_item';
  _autoSelectFromPool(clientId, 'comp', compClass, BCABA_SUP_COMPONENTS, 3, 5);
  _autoSelectFromPool(clientId, 'task', taskClass, BCABA_TASK_LIST, 2, 5);
  _autoSelectFromPool(clientId, 'eval', evalClass, BCABA_EVALUATION, 2, 5);
}

function _autoSelectFromPool(clientId, group, className, pool, count, recentWindow){
  const key = 'aba5_bcabasup_'+group+'_'+(clientId||'_');
  const recent = LS.get(key) || [];
  const available = pool.filter(item => !recent.slice(-recentWindow).includes(item));
  const fromPool = available.length >= count ? available : pool;
  const shuffled = [...fromPool].sort(()=>Math.random()-0.5);
  const selected = shuffled.slice(0, Math.min(count, fromPool.length));
  document.querySelectorAll('.'+className).forEach(c => c.checked = false);
  selected.forEach(val => {
    const el = document.querySelector(`.${className}[value="${CSS.escape(val)}"]`);
    if(el) el.checked = true;
  });
}

function _recordBcabaSupUsed(clientId, prefix){
  if(!clientId) return;
  const compClass = prefix==='an' ? 'anBcabaSupComp_item' : 'bcabaSupComp_item';
  const taskClass = prefix==='an' ? 'anBcabaSupTask_item' : 'bcabaSupTask_item';
  const evalClass = prefix==='an' ? 'anBcabaSupEval_item' : 'bcabaSupEval_item';
  const comp = _getCheckedValues(compClass);
  const task = _getCheckedValues(taskClass);
  const ev   = _getCheckedValues(evalClass);
  if(comp.length){ LS.set('aba5_bcabasup_comp_'+clientId, [...(LS.get('aba5_bcabasup_comp_'+clientId)||[]), ...comp].slice(-20)); }
  if(task.length){ LS.set('aba5_bcabasup_task_'+clientId, [...(LS.get('aba5_bcabasup_task_'+clientId)||[]), ...task].slice(-20)); }
  if(ev.length){   LS.set('aba5_bcabasup_eval_'+clientId, [...(LS.get('aba5_bcabasup_eval_'+clientId)||[]), ...ev].slice(-20)); }
}

// Build the BCaBA supervision section to inject into the note prompt.
function _buildBcabaSupPromptBlock(prefix){
  const compClass = prefix==='an' ? 'anBcabaSupComp_item' : 'bcabaSupComp_item';
  const taskClass = prefix==='an' ? 'anBcabaSupTask_item' : 'bcabaSupTask_item';
  const evalClass = prefix==='an' ? 'anBcabaSupEval_item' : 'bcabaSupEval_item';
  const comp = _getCheckedValues(compClass);
  const task = _getCheckedValues(taskClass);
  const ev   = _getCheckedValues(evalClass);
  if(!comp.length && !task.length && !ev.length) return '';
  /* "Weave these items into the narrative" es justo lo que producia el pase de
     lista: el modelo tomaba las etiquetas y las encadenaba. Ahora se dice que
     son etiquetas y que hay que contar lo que ocurrio bajo cada una. */
  let block = '\n\nBCABA SUPERVISION COMPONENTS — REQUIRED FOR THIS BCaBA SUPERVISION NOTE. The items below are ADMINISTRATIVE LABELS from the supervision form: they tell you which supervisory activities took place. Document what actually happened under each one, in flowing professional clinical paragraphs. Never reproduce a label as a phrase, never list them one after another, and never present them as bullets. Observable language only.\n'
    + SUP_COMPONENT_PROSE_RULE + '\n';
  if(comp.length) block += `Supervision components covered: ${comp.join('; ')}.\n`;
  if(task.length) block += `BACB Task List skills covered during this meeting: ${task.join('; ')}.\n`;
  if(ev.length)   block += `Evaluation of supervisee performance addressed: ${ev.join('; ')}.\n`;
  return block;
}

function _pickAnalystOpening(clientId, supType){
  const pool = supType==='bcaba' ? AN_OPENING_BCABA : supType==='direct' ? AN_OPENING_DIRECT : AN_OPENING_RBT;
  // Rotate per ANALYST across ALL clients (not per client) so no two of this
  // analyst's notes - for any client - share an opening.
  const key = 'aba5_opening_' + getCurrentAnalystId() + '_' + (supType||'rbt');
  const recent = LS.get(key) || [];
  const available = pool.map((s,i)=>({s,i})).filter(({i})=>!recent.slice(-6).includes(i));
  const chosen = (available.length > 0 ? available : pool.map((s,i)=>({s,i})))[Math.floor(Math.random()*(available.length||pool.length))];
  LS.set(key, [...recent, chosen.i].slice(-12));
  return chosen.s;
}

function _recentAnalystOpeningTexts(supType){
  const pool = supType==='bcaba' ? AN_OPENING_BCABA : supType==='direct' ? AN_OPENING_DIRECT : AN_OPENING_RBT;
  const key = 'aba5_opening_' + getCurrentAnalystId() + '_' + (supType||'rbt');
  const recent = LS.get(key) || [];
  // prior openings (exclude the one just chosen for THIS note)
  return recent.slice(0,-1).slice(-6).map(i=>pool[i]).filter(Boolean);
}

function _xmlEsc(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
