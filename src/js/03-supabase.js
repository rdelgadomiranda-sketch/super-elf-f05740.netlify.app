/* ===== SUPABASE DATA LAYER (Stage 1) — replaces the old localStorage LS =====
   Synced: aba5_therapists, aba5_clients, aba5_sum_/pools_/hist_/notes_<id>.
   Other aba5_* keys stay in localStorage for now (Stage 2).
   Requires the supabase-js CDN tag in <head> (added).
   URL is pre-filled; PASTE your PUBLISHABLE key into SUPABASE_ANON_KEY below. */
// ---- CONFIG (fill these in) --------------------------------
const SUPABASE_URL      = 'https://buweshqbeqohiuvgonip.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yA48bWv51wwa45Kfls4sZg_dTYZwZry'; // anon key is public; RLS protects the data

/* El cliente se construye la PRIMERA VEZ que alguien lo pide, no al cargar la pagina.
   Antes era `const _sb = window.supabase.createClient(...)` en el nivel superior, y esa
   sola linea obligaba a que la etiqueta de supabase-js fuera bloqueante: el navegador
   tenia que descargar y ejecutar toda la libreria antes de pintar nada. Medido, costaba
   unos 280 ms del primer pintado. Aplazado, la etiqueta puede llevar defer y el pintado
   deja de esperarla; para cuando algo necesita la base de datos —que siempre ocurre
   dentro de una funcion, nunca al arrancar— la libreria ya esta.
   Devuelve null si aun no estuviera: los sitios que lo usan ya viven en try/catch y
   degradan a localStorage, que es exactamente lo que conviene que pase. */
var _sbInstance = null;
function _sb(){
  if(_sbInstance) return _sbInstance;
  if(!window.supabase || !window.supabase.createClient) return null;
  _sbInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sbInstance;
}
let CURRENT_USER  = null;   // Supabase auth user
let CURRENT_OWNER = null;  // staffId  -> owner uid
const _clientOwner     = Object.create(null); // clientId -> owner uid
const _clientShared    = Object.create(null); // clientId -> is_shared
let   _knownTherapistIds = new Set();
let   _knownClientIds    = new Set();

// Visible sync-failure banner: silent console-only errors risk data loss.
function _syncErrorClear(){ const b = document.getElementById('abaSyncError'); if(b) b.remove(); }

function _syncError(msg){
  console.error('[supabase] ' + msg);
  // A network-level failure means the cloud is unreachable: switch to the mirror
  // so the user keeps working, instead of losing the write.
  if(/fetch|network|Failed to fetch|timeout|503|502|504/i.test(String(msg)) && !_MIRROR_MODE && _idb){
    _MIRROR_MODE = true;
    _mirrorBanner(true);
  }
  let b = document.getElementById('abaSyncError');
  if(!b){
    b = document.createElement('div');
    b.id = 'abaSyncError';
    b.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:100001;background:#b3261e;color:#fff;padding:10px 16px;border-radius:8px;font-family:system-ui,sans-serif;font-size:12px;max-width:90%;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:12px;align-items:center';
    const t = document.createElement('span'); t.className='txt';
    const x = document.createElement('button'); x.textContent='×';
    x.style.cssText='background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0 2px';
    x.addEventListener('click', ()=>b.remove());
    b.appendChild(t); b.appendChild(x);
    document.body.appendChild(b);
  }
  b.querySelector('.txt').textContent = '⚠ No se pudo guardar en la nube: ' + msg + ' — tus últimos cambios podrían NO estar sincronizados.';
}

/* La sticky note de setup viaja en staff.case_guide para que este en cualquier
   dispositivo. Si la columna todavia no existe en la base, NO se puede dejar que
   el upsert falle: se perderia el guardado de TODOS los terapeutas por un campo
   opcional. Se detecta el fallo, se reintenta sin el campo y se avisa con el SQL
   exacto que hay que correr una sola vez. */
var _staffHasCaseGuide = true;
function _staffMissingCaseGuide(msg){
  return /case_guide/i.test(String(msg || '')) &&
         /(does not exist|could not find|schema cache|unknown column|no existe)/i.test(String(msg || ''));
}

async function _writeTherapists(arr){
  const rows = (arr || []).map(t => {
    const r = {
      id: t.id,
      owner_id: _therapistOwner[t.id] || CURRENT_OWNER,
      name: t.name,
      role: t.credential,
      include_duration: t.includeDuration !== false,
      data_only_156: t.dataOnly156 === true,
    };
    if (_staffHasCaseGuide) r.case_guide = t.caseGuide || '';
    return r;
  });
  rows.forEach(r => { _therapistOwner[r.id] = r.owner_id; });
  const newIds = new Set(rows.map(r => r.id));
  const toDelete = [..._knownTherapistIds].filter(id => !newIds.has(id));
  if (rows.length){
    let { error } = await _sb().from('staff').upsert(rows, { onConflict: 'id' });
    if (error && _staffHasCaseGuide && _staffMissingCaseGuide(error.message)) {
      _staffHasCaseGuide = false;                      // degradar: no perder el resto
      rows.forEach(r => { delete r.case_guide; });
      _caseGuideSqlNotice();
      ({ error } = await _sb().from('staff').upsert(rows, { onConflict: 'id' }));
    }
    if (error) {
      // Bulk failed (one bad row poisons the whole statement) — retry row by row
      const failed = [];
      for (const r of rows){
        const { error: e2 } = await _sb().from('staff').upsert(r, { onConflict: 'id' });
        if (e2) failed.push(r.name + ' (' + e2.message + ')');
      }
      if (failed.length) _syncError('terapeutas no guardados: ' + failed.join('; '));
    }
  }
  for (const id of toDelete){
    const { error } = await _sb().from('staff').delete().eq('id', id);
    if (error) _syncError('no se pudo eliminar terapeuta ' + id + ': ' + error.message);
  }
  _knownTherapistIds = newIds;
}

async function _writeClients(arr){
  const rows = (arr || []).map(c => ({
    id: c.id,
    owner_id: _clientOwner[c.id] || CURRENT_OWNER,
    name: c.name,
    therapist_id: c.therapistId || null,
    is_shared: (c.id in _clientShared) ? _clientShared[c.id] : true,
  }));
  rows.forEach(r => { _clientOwner[r.id] = r.owner_id; _clientShared[r.id] = r.is_shared; });
  const newIds = new Set(rows.map(r => r.id));
  // Only write rows the current user OWNS. Other users' shared clients live in
  // their account; trying to upsert them fails RLS and poisons the whole batch
  // (this is what hid Sara's imported clients: her batch included Rolando's rows).
  const myRows = rows.filter(r => r.owner_id === CURRENT_OWNER);
  if (myRows.length){
    const { error } = await _sb().from('clients').upsert(myRows, { onConflict: 'id' });
    if (error) {
      // Bulk failed (one bad row poisons the whole statement) — retry row by row
      const failed = [];
      for (const r of myRows){
        const { error: e2 } = await _sb().from('clients').upsert(r, { onConflict: 'id' });
        if (e2) failed.push(r.name + ' (' + e2.message + ')');
      }
      if (failed.length) _syncError('clientes no guardados: ' + failed.join('; '));
    }
  }
  /* Borrado en la nube de los clientes que se quitaron localmente.

     Antes se filtraba por `_clientOwner[id] === CURRENT_OWNER` ANTES de intentarlo,
     y ese filtro descartaba en silencio dos casos enteros:
       · filas con owner_id NULL (importadas o creadas antes de que existiera la
         columna): el propietario nunca coincide, asi que jamas se borraban;
       · clientes de otra cuenta compartidos con esta.
     En ambos el borrado local funcionaba, la fila seguia en Supabase, y el
     siguiente hydrate() la devolvia. El cliente "reaparecia" sin ningun aviso.

     Ahora se INTENTA siempre, salvo cuando se sabe con certeza que es de otra
     cuenta, y lo que ocurre se cuenta. Si RLS lo rechaza, se dice; el fallo deja
     de ser invisible.                                                            */
  const removed = [..._knownClientIds].filter(id => !newIds.has(id));
  const foreign = removed.filter(id => _clientOwner[id] && _clientOwner[id] !== CURRENT_OWNER);
  const mine    = removed.filter(id => foreign.indexOf(id) === -1);
  const stillThere = [];
  for (const id of mine){
    const { error } = await _sb().from('clients').delete().eq('id', id);
    if (error){ stillThere.push(id); _syncError('no se pudo eliminar cliente ' + id + ': ' + error.message); }
  }
  if (foreign.length){
    _syncError(foreign.length + ' cliente(s) pertenecen a otra cuenta: se quitaron de esta pantalla '
      + 'pero siguen en la nube y volverán a aparecer al recargar. Tiene que borrarlos su propietario.');
  }
  // Lo que no se pudo borrar sigue existiendo: mantenerlo en el registro para no
  // dar por hecho un borrado que no ocurrio.
  _knownClientIds = new Set([...newIds, ...foreign, ...stillThere]);
}

async function hydrate(){
  const [{ data: staff, error: e1 }, { data: cli, error: e2 }] = await Promise.all([
    _sb().from('staff').select('*'),
    _sb().from('clients').select('*'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  MEM['aba5_therapists'] = (staff || []).map(s => ({
    id: s.id, name: s.name, credential: s.role,
    includeDuration: s.include_duration, dataOnly156: s.data_only_156,
    caseGuide: s.case_guide || '',
  }));
  (staff || []).forEach(s => { _therapistOwner[s.id] = s.owner_id; });
  _knownTherapistIds = new Set((staff || []).map(s => s.id));

  MEM['aba5_clients'] = (cli || []).map(c => ({ id: c.id, name: c.name, therapistId: c.therapist_id }));
  (cli || []).forEach(c => {
    _clientOwner[c.id]  = c.owner_id;
    _clientShared[c.id] = c.is_shared;
    if (c.summary) MEM['aba5_sum_' + c.id] = c.summary;
    MEM['aba5_pools_' + c.id] = c.pools   || { mal: [], rep: [], reinforcers: '' };
    MEM['aba5_hist_'  + c.id] = c.history || {};
    MEM['aba5_notes_' + c.id] = c.notes   || [];
    if (c.assessment_core)     MEM['aba5_assess_'  + c.id] = c.assessment_core;
    if (c.assessment_excludes) MEM['aba5_assessx_' + c.id] = c.assessment_excludes;
    if (c.aba_evidenced_by) MEM['aba5_abaevid_'  + c.id] = c.aba_evidenced_by;
    if (c.aba_roster)       MEM['aba5_abaroster_' + c.id] = c.aba_roster;
    if (c.aba_locations)    MEM['aba5_abalocs_'   + c.id] = c.aba_locations;
    if (c.assessment_date)  MEM['aba5_assessdate_' + c.id] = c.assessment_date;
  });
  _knownClientIds = new Set((cli || []).map(c => c.id));
  _mirrorSave();
}

// ---- auth + boot -------------------------------------------
async function _afterLogin(session){
  CURRENT_USER  = session.user;
  CURRENT_OWNER = session.user.id;
  _hideLogin();
  try { _idb = await _idbOpen(); await _pendingLoad(); } catch(e){ console.warn('[mirror] IndexedDB no disponible', e); }
  try {
    await hydrate();
    _MIRROR_MODE = false;
    _mirrorBanner(false);
    _mirrorSave();
    // If writes were queued in a previous offline session, replay them now.
    if (_PENDING.length) { _MIRROR_MODE = true; await _mirrorTryReconnect(); }
  }
  catch (e){
    // Cloud unreachable: work from the local mirror instead of dying.
    const restored = await _mirrorLoad();
    if (restored){
      _MIRROR_MODE = true;
      _mirrorBanner(true);
      console.warn('[mirror] Supabase no responde; trabajando desde el espejo local.');
    } else {
      alert('No se pudo conectar con Supabase y no hay copia local en este equipo: ' + (e.message || e));
      return;
    }
  }
  therapists = LS.get('aba5_therapists') || [];
  clients    = LS.get('aba5_clients')    || [];
  if (typeof _migrateCaseGuides === 'function') { try{ _migrateCaseGuides(); }catch(e){} }
  if (typeof refreshAllTherapistSelects === 'function') refreshAllTherapistSelects();
  // La ficha de casos se dibuja al arrancar: si quedo abierta, tiene que estar ahi
  // sin necesidad de cambiar de pestana para que aparezca.
  if (typeof _renderCaseGuide === 'function') _renderCaseGuide();
  // The Registered Therapists list was never drawn after hydration, only when a
  // therapist was added or edited. On every fresh page load the THERAPIST tab
  // therefore showed "no therapists yet" even with a full roster in storage — and
  // with it went the only way to reach the delete button.
  if (typeof renderTherapistList === 'function') renderTherapistList();
  if (typeof renderClientList === 'function') renderClientList();
  if (typeof refreshGenClientSelect === 'function') refreshGenClientSelect();
  _showUserBar(CURRENT_USER && CURRENT_USER.email);
}

/* Si supabase-js no llego —red de la clinica que bloquea el CDN, por ejemplo— antes esto
   reventaba con un error mudo en la consola y la pantalla se quedaba en blanco, sin decir
   por que. Ahora se dice: es lo unico que el usuario puede accionar, porque el arreglo no
   esta en la app sino en la red. */
function _sbUnavailableNotice(){
  var o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.92);padding:24px;font-family:system-ui,sans-serif';
  o.innerHTML = '<div style="max-width:460px;background:#fff;border-radius:10px;padding:22px 26px;line-height:1.6;color:#1e293b">'
    + '<div style="font-weight:700;margin-bottom:8px">No se pudo cargar la librería de datos</div>'
    + '<div style="font-size:13px">El navegador no alcanzó <code>cdn.jsdelivr.net</code>, así que la aplicación no puede iniciar sesión ni sincronizar. '
    + 'Suele ser la red o un cortafuegos que bloquea ese dominio. Comprueba la conexión y recarga la página.</div></div>';
  document.body.appendChild(o);
}

async function _boot(){
  if(!_sb()){ _sbUnavailableNotice(); return; }
  const { data: { session } } = await _sb().auth.getSession();
  if (session) await _afterLogin(session);
  else _showLogin();
}

async function abaLogin(email, pwd, msgEl){
  if(!_sb()){ if (msgEl) msgEl.textContent = 'La librería de datos no cargó; revisa la conexión y recarga.'; return; }
  const { data, error } = await _sb().auth.signInWithPassword({ email: email.trim(), password: pwd });
  if (error){ if (msgEl) msgEl.textContent = error.message; return; }
  await _afterLogin(data.session);
}

async function abaLogout(){
  await _sb().auth.signOut();
  location.reload();
}

// ---- minimal login overlay (injected, no HTML edit needed) ----
function _showLogin(){
  if (document.getElementById('abaLoginOverlay')) { document.getElementById('abaLoginOverlay').style.display = 'flex'; return; }
  const o = document.createElement('div');
  o.id = 'abaLoginOverlay';
  o.style.cssText = 'position:fixed;inset:0;background:#0e1726;z-index:100000;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
  o.innerHTML = `
    <div style="background:#fff;padding:28px;border-radius:10px;width:320px;box-shadow:0 12px 40px rgba(0,0,0,.4)">
      <div style="font-weight:700;font-size:16px;color:#1e2d3d;margin-bottom:14px">ABA Notes — Sign in</div>
      <input id="abaEmail" type="email" placeholder="email" autocomplete="username"
        style="width:100%;padding:10px;margin-bottom:8px;border:1px solid #c5cfe0;border-radius:6px;box-sizing:border-box">
      <input id="abaPwd" type="password" placeholder="password" autocomplete="current-password"
        style="width:100%;padding:10px;margin-bottom:12px;border:1px solid #c5cfe0;border-radius:6px;box-sizing:border-box">
      <button id="abaLoginBtn" style="width:100%;padding:10px;background:#2254b5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">Sign in</button>
      <div id="abaLoginMsg" style="color:#d32f2f;font-size:12px;margin-top:10px;min-height:16px"></div>
    </div>`;
  document.body.appendChild(o);
  const go = () => abaLogin(
    document.getElementById('abaEmail').value,
    document.getElementById('abaPwd').value,
    document.getElementById('abaLoginMsg'));
  document.getElementById('abaLoginBtn').addEventListener('click', go);
  document.getElementById('abaPwd').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
function _hideLogin(){ const o = document.getElementById('abaLoginOverlay'); if (o) o.style.display = 'none'; }
function _showUserBar(email){
  let bar = document.getElementById('abaUserBar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'abaUserBar';
    bar.style.cssText = 'position:fixed;top:8px;right:10px;z-index:99999;display:flex;align-items:center;gap:8px;background:var(--surface,#fff);border:1px solid var(--border2,#c5cfe0);border-radius:20px;padding:4px 6px 4px 12px;font-family:system-ui,sans-serif;font-size:11px;color:var(--text3,#5b6b7f);box-shadow:0 2px 8px rgba(0,0,0,.15)';
    const span = document.createElement('span');
    span.className = 'abaUserEmail';
    span.style.cssText = 'max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const btn = document.createElement('button');
    btn.textContent = 'Log out';
    btn.style.cssText = 'background:#2254b5;color:#fff;border:none;border-radius:14px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:600';
    btn.addEventListener('click', abaLogout);
    bar.appendChild(span);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }
  bar.querySelector('.abaUserEmail').textContent = email || '';
}

// Por que un cliente borrado vuelve a aparecer. El borrado local siempre funciona;
// el de la nube solo si esta cuenta puede borrar esa fila. Sin esto el usuario
// repite el borrado indefinidamente sin saber que nunca va a servir.
function _clientOwnership(id){
  var o;
  try{ o = _clientOwner ? _clientOwner[id] : undefined; }catch(e){ o = undefined; }
  if(!o) return { kind:'sin-dueno', label:'sin propietario registrado', canDelete:true };
  if(o === CURRENT_OWNER) return { kind:'mio', label:'tuyo', canDelete:true };
  return { kind:'ajeno', label:'de otra cuenta', canDelete:false };
}
