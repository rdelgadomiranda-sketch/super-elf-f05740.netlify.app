function showGlobalMsg(msg, type = 'info', timeout = 5000) {
  // Create or get global message container
  let msgContainer = document.getElementById('global-msg-container');
  if (!msgContainer) {
    msgContainer = document.createElement('div');
    msgContainer.id = 'global-msg-container';
    msgContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 350px;
      font-family: var(--sans);
      pointer-events: none;
    `;
    document.body.appendChild(msgContainer);
  }
  
  const msgEl = document.createElement('div');
  msgEl.style.cssText = `
    padding: 12px 16px;
    margin-bottom: 8px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    pointer-events: auto;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    cursor: pointer;
  `;
  
  // Style based on type
  switch(type) {
    case 'warn':
      msgEl.style.background = '#fffbeb';
      msgEl.style.color = '#92400e';
      msgEl.style.border = '1px solid #fbbf24';
      break;
    case 'err':
      msgEl.style.background = '#fef2f2';
      msgEl.style.color = '#dc2626';
      msgEl.style.border = '1px solid #fca5a5';
      break;
    case 'ok':
      msgEl.style.background = '#f0fdf4';
      msgEl.style.color = '#166534';
      msgEl.style.border = '1px solid #bbf7d0';
      break;
    default:
      msgEl.style.background = '#f8fafc';
      msgEl.style.color = '#475569';
      msgEl.style.border = '1px solid #cbd5e1';
  }
  
  msgEl.textContent = msg;
  msgEl.onclick = () => msgEl.remove();
  
  msgContainer.appendChild(msgEl);
  
  // Animate in
  setTimeout(() => {
    msgEl.style.transform = 'translateX(0)';
  }, 10);
  
  // Auto-remove after timeout
  if (timeout > 0) {
    setTimeout(() => {
      if (msgEl.parentNode) {
        msgEl.style.transform = 'translateX(100%)';
        setTimeout(() => msgEl.remove(), 300);
      }
    }, timeout);
  }
}

function renderGoalsPreview(g) { /* goals shown inline in output blocks */ }

function saveHistory(clientId, h){
  LS.set('aba5_hist_'+clientId, h);
}

// Reset history for a client
function resetHistory(clientId){
  LS.del('aba5_hist_'+clientId);
  renderCoveragePanel(clientId);
}

// Coverage panel renderer
function renderCoveragePanel(clientId){
  const panel = document.getElementById('coveragePanel');
  if(!panel) return;
  if(!clientId){ panel.style.display='none'; return; }

  const h = getHistory(clientId);
  const pools = LS.get('aba5_pools_'+clientId) || {};
  const malAllItems = normalizeBehaviorArr(pools.mal||[]);
  const repAllItems = normalizeBehaviorArr(pools.rep||[]);
  /* ACTIVO aqui tiene que significar lo mismo que en la generacion: getActiveBehaviors
     documenta 'active' Y 'new'. Este panel contaba solo 'active', asi que un cliente
     recien extraido del reducido — todos sus programas en 'new' — aparecia como
     "Replacement — Active (0) · No behaviors configured", como si se hubieran
     borrado, cuando en realidad se documentan con normalidad. El panel mentia. */
  const _live = a => a.filter(x=>x.status==='active' || x.status==='new').map(x=>x.name);
  const malActive = _live(malAllItems);
  const repActive = _live(repAllItems);
  const malNew = malAllItems.filter(x=>x.status==='new').map(x=>x.name);
  const repNew = repAllItems.filter(x=>x.status==='new').map(x=>x.name);
  const malOnHold = malAllItems.filter(x=>x.status==='onhold').map(x=>x.name);
  const repOnHold = repAllItems.filter(x=>x.status==='onhold').map(x=>x.name);
  const malMastered = malAllItems.filter(x=>x.status==='mastered').map(x=>x.name);
  const repMastered = repAllItems.filter(x=>x.status==='mastered').map(x=>x.name);

  // Only show coverage for client's own behaviors — no global defaults
  const malPool = malActive;
  const repPool = repActive;

  function countUsage(pool, history){
    return pool.map(item => ({
      label: item,
      count: history.filter(x=>x===item).length
    }));
  }

  function barRows(items, max){
    if(!items.length) return '<p style="font-size:11px;color:var(--text3)">No behaviors configured.</p>';
    return items.map(({label, count})=>{
      const pct = max > 0 ? Math.round((count/max)*100) : 0;
      const barClass = count===0?'':'count<=1?\'warm\':\'hot\'';
      const cls = count===0?'':'count<=max/2?\'warm\':\'hot\'';
      const realCls = count===0?'':(count<=Math.ceil(max/2)?'warm':'hot');
      return `<div class="cov-row">
        <div class="cov-label" title="${esc(label)}">${esc(label)}</div>
        <div class="cov-bar-wrap"><div class="cov-bar ${realCls}" style="width:${Math.min(pct,100)}%"></div></div>
        <div class="cov-pct">${count}×</div>
      </div>`;
    }).join('');
  }

  const totalSessions = h.sessions.length;
  const last30 = h.sessions.filter(s=>s.date>=nDaysAgo(30)).length;

  // Lo que el contraste con el reducido retiro SOLO se dice aqui y se puede deshacer
  // de un clic: un cambio automatico sobre datos clinicos tiene que ser visible y
  // reversible, no algo que se descubre viendo un pool vacio.
  const _auto = [].concat(malAllItems, repAllItems).filter(x=>x && x.autoRetired);
  const _off = !!LS.get('aba5_noautoretire_' + clientId);
  const _autoNote = _auto.length
    ? `<div style="margin:6px 0 10px;padding:8px 11px;border:1px solid #b45309;border-left:4px solid #b45309;border-radius:5px;background:#fffbeb;font-size:11px;color:#7c2d12;line-height:1.55">
         <b>${_auto.length} item(s) retirado(s) automáticamente</b> al contrastar la ficha con el reducido: ${esc(_auto.map(x=>x.name).slice(0,6).join(', '))}${_auto.length>6?` y ${_auto.length-6} más`:''}.
         Si esto no es correcto, se revierte entero:
         <span style="text-decoration:underline;cursor:pointer;font-weight:700" onclick="_undoAssessRetire('${clientId}')">Deshacer y desactivar en este cliente</span>
       </div>`
    : (_off
      ? `<div style="margin:6px 0 10px;padding:8px 11px;border:1px dashed var(--border2);border-radius:5px;font-size:11px;color:var(--text3);line-height:1.55">
           El contraste automático con el reducido está DESACTIVADO en este cliente: el estado lo decides tú en la ficha.
           <span style="text-decoration:underline;cursor:pointer" onclick="_redoAssessRetire('${clientId}')">Volver a activarlo</span>
         </div>`
      : '');

  /* El doble chequeo solo sirve si su desacuerdo se VE. Cuando el reducido y las
     actividades documentadas apuntan a modalidades distintas, uno de los dos
     esta mal y hay que arreglarlo en la ficha, no en cada nota. Mientras tanto
     el generador ya trabaja en modo prudente; esto es para que lo sepas. */
  const _lvl = (typeof _clientLevelCheck === 'function') ? _clientLevelCheck(pools) : null;
  const _lvlNote = (_lvl && _lvl.verdict === 'conflict')
    ? `<div style="margin:6px 0 10px;padding:8px 11px;border:1px solid #b45309;border-left:4px solid #b45309;border-radius:5px;background:#fffbeb;font-size:11px;color:#7c2d12;line-height:1.55">
         <b>Las dos fuentes no coinciden sobre la modalidad de comunicación.</b>
         El reducido apunta a <b>${_lvl.fromAssessment === 'alternative' ? 'modalidad alternativa (PECS / AAC / señas)' : 'habla vocal'}</b>,
         y los programas y actividades documentados apuntan a <b>${_lvl.fromLabels === 'alternative' ? 'modalidad alternativa (PECS / AAC / señas)' : 'habla vocal'}</b>.
         Uno de los dos está desactualizado. Hasta que lo corrijas en la ficha, el generador no toma partido: elige actividades
         que funcionan con cualquiera de las dos modalidades, y lee las actividades documentadas solo para el nivel de exigencia.
       </div>`
    : '';

  panel.style.display='block';
  panel.innerHTML=`<div class="cov-card">
    <div class="cov-title">
      <span>Coverage &amp; Rotation — ${totalSessions} session${totalSessions!==1?'s':''} recorded · ${last30} in last 30 days</span>
      <span class="cov-reset" onclick="resetHistory('${clientId}')">Reset history</span>
    </div>
    ${_autoNote}
    ${_lvlNote}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div class="cov-sec-lbl">Maladaptive — Active (${malPool.length})</div>
        ${barRows(malPool.map(n=>({label:n,count:(h.mal||[]).filter(x=>x===n).length})).sort((a,b)=>a.count-b.count), Math.max(1,...malPool.map(n=>(h.mal||[]).filter(x=>x===n).length)))}
        ${malOnHold.length?`<div style="margin-top:6px;font-size:10px;font-family:var(--mono);color:#92400e">⏸ On Hold (excluded): ${malOnHold.join(', ')}</div>`:''}
        ${malMastered.length?`<div style="margin-top:3px;font-size:10px;font-family:var(--mono);color:#065f46">✓ Mastered (excluded): ${malMastered.join(', ')}</div>`:''}
        ${malNew.length?`<div style="margin-top:3px;font-size:10px;font-family:var(--mono);color:#1d4ed8">★ Nuevos, sin confirmar — SÍ se documentan: ${malNew.join(', ')}</div>`:''}
        ${!malAllItems.length?`<div style="margin-top:3px;font-size:10px;font-family:var(--mono);color:#92400e">La ficha de este cliente no tiene ninguna conducta.</div>`:''}
      </div>
      <div>
        <div class="cov-sec-lbl">Replacement — Active (${repPool.length})</div>
        ${barRows(repPool.map(n=>({label:n,count:(h.rep||[]).filter(x=>x===n).length})).sort((a,b)=>a.count-b.count), Math.max(1,...repPool.map(n=>(h.rep||[]).filter(x=>x===n).length)))}
        ${repOnHold.length?`<div style="margin-top:6px;font-size:10px;font-family:var(--mono);color:#92400e">⏸ On Hold (excluded): ${repOnHold.join(', ')}</div>`:''}
        ${repMastered.length?`<div style="margin-top:3px;font-size:10px;font-family:var(--mono);color:#065f46">✓ Mastered (excluded): ${repMastered.join(', ')}</div>`:''}
        ${repNew.length?`<div style="margin-top:3px;font-size:10px;font-family:var(--mono);color:#1d4ed8">★ Nuevos, sin confirmar — SÍ se documentan: ${repNew.join(', ')}</div>`:''}
        ${!repAllItems.length?`<div style="margin-top:3px;font-size:10px;font-family:var(--mono);color:#92400e">La ficha de este cliente no tiene ningún replacement. Pestaña Assessment → "Rellenar behaviors / replacements / reinforcers".</div>`:''}
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════
   TABS
═══════════════════════════════════════════════════════════ */
function switchTab(t) {
  ['analyst','clients','gen','analystgen','sup','monthly','abamatrix','review'].forEach(id => {
    document.getElementById('tab-'+id).style.display = t===id ? 'block' : 'none';
    document.getElementById('tab-btn-'+id).classList.toggle('active', t===id);
  });
  if (t === 'analyst') { renderTherapistList(); refreshAllTherapistSelects(); }
  if (typeof _flushCaseGuide === 'function') { try{ _flushCaseGuide(); }catch(e){} }
  if (t === 'analyst' && typeof _renderThGuide === 'function') _renderThGuide();
  if (t === 'gen') { refreshAllTherapistSelects(); refreshGenClientSelect(); if(typeof _renderCaseGuide === 'function') _renderCaseGuide(); }
  if (t === 'analystgen') { refreshAnalystTherapistSelect(); }
  if (t === 'monthly') { refreshMthClientSelect(); updateOPPrompt(); }
  if (t === 'abamatrix') { refreshAllTherapistSelects(); _abaFillSelect('abaMedSel', ABA_MEDICAL.concat(['Other']), '— select —'); _abaRefreshClientSelect(); _abaCheckReady(); }
  if (t === 'review') { refreshAllTherapistSelects(); _reviewRefreshClientSelect(); }
  if (t === 'clients') {
    refreshAllTherapistSelects();
    // Auto-refresh note history for the active client when returning to Clients tab
    if (activeClientId) {
      renderNoteHistory(activeClientId);
    }
  }
}

function renderTherapistList() {
  const el = document.getElementById('therapistList');
  if (!therapists.length) { el.innerHTML='<div class="empty-state">[ no therapists yet — add one below ]</div>'; return; }
  const sorted = [...therapists].sort((a,b)=>a.name.localeCompare(b.name));
  el.innerHTML = sorted.map(t => {
    const myClients = clients.filter(c=>c.therapistId===t.id);
    const isActive = activeTherapistId === t.id;
    const ini = t.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'??';
    return `<div class="client-row${isActive?' active':''}" onclick="selectTherapistForEdit('${t.id}')">
      <div class="client-avatar">${ini}</div>
      <div style="flex:1">
        <div class="client-name">${esc(t.name)} <span class="client-tag tag-blue">${esc(t.credential)}</span>
          ${t.credential==='RBT'?'<span class="client-tag tag-amber">RBT</span>':''}
        </div>
        <div class="client-meta">${myClients.length} client${myClients.length!==1?'s':''} · Click to edit${myClients.length?' · no se puede borrar mientras tenga clientes':''}</div>
      </div>
      <button class="btn btn-outline" style="padding:4px 10px;font-size:10px;white-space:nowrap${myClients.length?';opacity:.5':';color:var(--red);border-color:var(--red)'}"
        title="${myClients.length?`Bloqueado: primero hay que borrar sus ${myClients.length} cliente(s), uno a uno, en la pestana CLIENTS`:'Borrar este terapista'}"
        onclick="deleteTherapist('${t.id}',event)">${myClients.length?'🔒 Borrar terapista':'Borrar terapista'}</button>
    </div>`;
  }).join('');
}

function saveTherapist() {
  const name = document.getElementById('aName').value.trim();
  const cred = document.getElementById('aCred').value;
  const includeDuration = document.getElementById('aIncludeDuration')?.checked !== false;
  const dataOnly156 = document.getElementById('aDataOnly156')?.checked === true;
  if (!name) { showMsg('therapistMsg','Enter a therapist name.','err'); return; }
  let t = activeTherapistId ? therapists.find(x=>x.id===activeTherapistId) : null;
  const isNew = !t;
  if (!t) {
    t = { id: uid(), name, credential: cred, includeDuration, dataOnly156 };
    therapists.push(t);
  } else {
    t.name = name;
    t.credential = cred;
    t.includeDuration = includeDuration;
    t.dataOnly156 = dataOnly156;
  }
  LS.set('aba5_therapists', therapists);
  renderTherapistList();
  refreshAllTherapistSelects();
  showMsg('therapistMsg', isNew ? `Therapist "${name}" added.` : `Therapist "${name}" updated.`, 'ok');
  activeTherapistId = null;
  if (typeof _renderThGuide === 'function') _renderThGuide();
  document.getElementById('aName').value = '';
  document.getElementById('aCred').value = 'BCBA';
  if(document.getElementById('aIncludeDuration')) document.getElementById('aIncludeDuration').checked = true;
  if(document.getElementById('aDataOnly156')) document.getElementById('aDataOnly156').checked = false;
  document.getElementById('therapistFormTitle').textContent = 'Add Therapist';
  document.getElementById('clearTherapistBtn').style.display = 'none';
  document.getElementById('rbtNotice').style.display = 'none';
}

function deleteTherapist(id, e) {
  e.stopPropagation();
  const t = therapists.find(function(x){ return x.id === id; });
  const myClients = clients.filter(function(c){ return c.therapistId === id; });

  // NO CASCADE BY DESIGN. Removing a therapist used to take every client with them in
  // one click, and that is an irreversible loss of clinical data behind a single
  // confirmation. The therapist can only be removed once they have no clients left,
  // so each deletion is a separate, deliberate decision made in front of that
  // client's own data.
  if (myClients.length) {
    const lines = myClients.map(function(c){
      const s = _clientDataSummary(c.id);
      return '  · ' + c.name + (s.bits.length ? ' — ' + s.bits.join(', ') : ' — sin datos');
    }).join('\n');
    alert('No se puede borrar a ' + ((t && t.name) || 'este terapista') + ': todavía tiene '
      + myClients.length + ' cliente(s) asignado(s).\n\n' + lines
      + '\n\nBorra primero cada cliente, uno a uno, desde la lista de clientes. '
      + 'Así cada borrado se decide viendo lo que ese cliente tiene guardado, '
      + 'en vez de perderlo todo con una sola confirmación.');
    return;
  }

  if (!confirm('Vas a borrar a ' + ((t && t.name) || 'este terapista')
      + '.\nNo tiene clientes asignados, así que no se pierde ningún dato clínico.\n\n¿Continuar?')) return;

  therapists = therapists.filter(function(x){ return x.id !== id; });
  // Su sticky note se va con el: viaja en su propio registro. Se descarta
  // ademas cualquier escritura pendiente y la clave local heredada.
  try{ delete _guidePending[id]; }catch(e){}
  try{ LS.del('aba5_caseguide_' + id); }catch(e){}
  LS.set('aba5_therapists', therapists);
  if (activeTherapistId === id) clearTherapistForm();
  renderTherapistList();
  refreshAllTherapistSelects();
  if (typeof showMsg === 'function') showMsg('therapistMsg', 'Terapista eliminado.', 'ok');
}

function refreshAllTherapistSelects() {
  const opts = '<option value="">— select —</option>' +
    [...therapists].sort((a,b)=>a.name.localeCompare(b.name))
      .map(t=>`<option value="${t.id}">${esc(t.name)} · ${esc(t.credential)}</option>`).join('');

  // Clients tab filter selector. It also has to reach ORPHANS: a client whose
  // therapistId points to a therapist that no longer exists is otherwise invisible in
  // every tab and there is no way to delete it — the list only ever renders the
  // clients of the therapist selected here.
  const ctSel = document.getElementById('clientTherapistSel');
  if (ctSel) {
    const orphans = _orphanClients();
    const cur = ctSel.value;
    ctSel.innerHTML = opts.replace('— select —','— select therapist —')
      + (orphans.length ? `<option value="${ORPHAN_FILTER}">⚠ Clientes sin terapista (${orphans.length})</option>` : '');
    if (cur === ORPHAN_FILTER && orphans.length) ctSel.value = cur;
    else if (cur && therapists.find(t=>t.id===cur)) ctSel.value = cur;
  }

  // In-form therapist selector
  const cTSel = document.getElementById('cTherapistSel');
  if (cTSel) { const cur=cTSel.value; cTSel.innerHTML=opts; if(cur&&therapists.find(t=>t.id===cur))cTSel.value=cur; }

  // Generate tab therapist selector
  const genTSel = document.getElementById('genTherapistSel');
  if (genTSel) { const cur=genTSel.value; genTSel.innerHTML=opts.replace('— select —','— select therapist —'); if(cur&&therapists.find(t=>t.id===cur))genTSel.value=cur; }

  // AbaMatrix tab therapist selector
  const abaTSel = document.getElementById('abaTherapistSel');
  if (abaTSel) { const cur=abaTSel.value; abaTSel.innerHTML=opts.replace('— select —','— select therapist —'); if(cur&&therapists.find(t=>t.id===cur))abaTSel.value=cur; }

  // Review tab therapist selector
  const revTSel = document.getElementById('reviewTherapistSel');
  if (revTSel) { const cur=revTSel.value; revTSel.innerHTML=opts.replace('— select —','— select therapist —'); if(cur&&therapists.find(t=>t.id===cur))revTSel.value=cur; }

  // Analyst tab analyst selector (non-RBT therapists only)
  if (typeof refreshAnalystTherapistSelect==='function') refreshAnalystTherapistSelect();
}

// Old single-analyst helpers — kept for compatibility with backup/restore
function saveAnalyst() {}

function onClientTherapistChange() {
  const id = document.getElementById('clientTherapistSel').value;
  activeTherapistId = id || null;
  const t = getTherapist(id);
  const notice = document.getElementById('rbtNotice');
  if (notice) notice.style.display = (t && t.credential==='RBT') ? 'block' : 'none';
  const lbl = document.getElementById('clientListTherapistLabel');
  if (lbl) lbl.textContent = t ? `— ${t.name}` : '';
  // Pre-select this therapist in the add form too
  const cTSel = document.getElementById('cTherapistSel');
  if (cTSel && id) cTSel.value = id;
  renderClientList();
  clearCurrentClient();
}

function renderClientList() {
  const el = document.getElementById('clientList');
  const filterId = document.getElementById('clientTherapistSel')?.value;
  if (!filterId) {
    const orph = _orphanClients();
    el.innerHTML = '<div class="empty-state">[ select a therapist above to see their clients ]</div>'
      + (orph.length ? `<div style="text-align:center;font-size:11px;color:var(--red);margin-top:8px">
          Hay ${orph.length} cliente(s) sin terapista asignado. Elígelos en el selector de arriba
          («⚠ Clientes sin terapista») para reasignarlos o borrarlos.
          <div style="margin-top:6px"><button class="btn btn-outline" style="padding:3px 10px;font-size:10px"
            onclick="diagnoseOrphans()">¿Por qué vuelven a aparecer?</button></div></div>` : '');
    return;
  }
  const isOrphanView = filterId === ORPHAN_FILTER;
  const myClients = isOrphanView ? _orphanClients() : clients.filter(c=>c.therapistId===filterId);
  if (!myClients.length) {
    el.innerHTML = isOrphanView
      ? '<div class="empty-state">[ no hay clientes sin terapista ]</div>'
      : '<div class="empty-state">[ no clients for this therapist — add one below ]</div>';
    return;
  }
  const sorted = [...myClients].sort((a,b)=>a.name.localeCompare(b.name));
  el.innerHTML = sorted.map(c => {
    const hasSummary = !!LS.get('aba5_sum_'+c.id);
    const pools = LS.get('aba5_pools_'+c.id) || {};
    const hasBeh = normalizeBehaviorArr(pools.mal||[]).filter(x=>x.status==='active').length > 0;
    const isActive = activeClientId === c.id;
    const ini = c.name.replace(/[^A-Za-z]/g,'').toUpperCase().slice(0,2)||'??';
    const noteCount = (LS.get('aba5_notes_'+c.id)||[]).length;
    return `<div class="client-row${isActive?' active':''}" onclick="selectClientForEdit('${c.id}')">
      <div class="client-avatar">${ini}</div>
      <div style="flex:1">
        <div class="client-name">${esc(c.name)}
          ${isOrphanView?'<span class="client-tag tag-red">Sin terapista</span>':''}
          ${hasSummary?'<span class="client-tag tag-green">Summary ✓</span>':'<span class="client-tag tag-amber">No summary</span>'}
          ${hasBeh?'<span class="client-tag tag-blue">Behaviors ✓</span>':''}
          ${noteCount?`<span class="client-tag" style="background:#f0f4ff;color:var(--blue);border-color:#bfdbfe">${noteCount} note${noteCount!==1?'s':''}</span>`:''}
        </div>
        <div class="client-meta">${isOrphanView?'Sin terapista asignado — reasígnalo o bórralo':(isActive?'Currently editing':'Click to edit')}</div>
      </div>
      <button class="btn btn-outline" style="padding:4px 10px;font-size:10px" onclick="exportRbtPackage('${c.id}');event.stopPropagation()" title="Export client data for RBT app">↓ RBT</button>
      <button class="btn btn-outline" style="padding:4px 10px;font-size:10px;color:var(--blue);border-color:var(--blue)" onclick="exportSingleClient('${c.id}');event.stopPropagation()" title="Export this client to share with another user">↑ Export</button>
      <button class="btn btn-outline" style="padding:4px 10px;font-size:10px;white-space:nowrap;color:var(--red);border-color:var(--red)" title="Borrar este cliente y todos sus datos" onclick="deleteClient('${c.id}',event)">Borrar cliente</button>
    </div>`;
  }).join('');
}

function saveClient() {
  const name = document.getElementById('cName').value.trim();
  if (!name) { showMsg('addMsg','Enter a client name.','err'); return; }
  // Read from the in-form therapist selector
  const therapistId = document.getElementById('cTherapistSel')?.value
    || document.getElementById('clientTherapistSel')?.value;
  if (!therapistId) {
    showMsg('addMsg','Select a therapist for this client.','err');
    document.getElementById('addMsg')?.scrollIntoView({behavior:'smooth',block:'center'});
    document.getElementById('cTherapistSel')?.focus();
    return;
  }
  let c = activeClientId ? clients.find(x=>x.id===activeClientId) : null;
  if (!c) {
    c = { id: uid(), name, therapistId };
    clients.push(c);
    activeClientId = c.id;
  }
  c.name = name;
  c.therapistId = therapistId;
  const planSummary = document.getElementById('cPlanSummary').value.trim();
  // SAFETY: only write to LS when there is actual content.
  // We deliberately do NOT delete from LS when the field is empty — if the user
  // wants to clear the summary, they use the explicit Clear button. This prevents
  // accidental data loss from transient empty states (re-render race conditions,
  // load-order issues, etc.) when pressing Save Client.
  if (planSummary) {
    LS.set('aba5_sum_'+c.id, planSummary);
  }
  LS.set('aba5_clients', clients);
  // Sync the filter selector to the saved therapist
  const filterSel = document.getElementById('clientTherapistSel');
  if (filterSel && filterSel.value !== therapistId) {
    filterSel.value = therapistId;
    onClientTherapistChange();
  } else {
    renderClientList();
  }
  refreshGenClientSelect();
  showSummaryPanel(c.id);
  showMsg('addMsg', 'Client saved.', 'ok');
}

function deleteClient(id, e) {
  e.stopPropagation();
  var _c = clients.find(function(x){ return x.id === id; });
  var _sum = _clientDataSummary(id);
  var _msg = 'Vas a borrar a ' + ((_c && _c.name) || 'este cliente') + ' y TODOS sus datos.\n\n'
    + (_sum.bits.length ? 'Se perderá: ' + _sum.bits.join(', ') + '.\n\n' : '')
    + 'Esto no se puede deshacer. ¿Continuar?';
  if (!confirm(_msg)) return;
  clients = clients.filter(c=>c.id!==id);
  LS.set('aba5_clients', clients);
  _purgeClientData(id);
  if (activeClientId === id) { activeClientId = null; document.getElementById('summaryCard').style.display='none'; }
  // Rebuild the selectors first: the orphan entry carries a count, and it disappears
  // when the last orphan is gone. Then render the list against the updated selection.
  refreshAllTherapistSelects();
  renderClientList();
  refreshGenClientSelect();
  if (typeof renderTherapistList === 'function') renderTherapistList();
}

function _renderPendingProposal(){
  var box = document.getElementById('assessPending');
  if(!box) return;
  if(!_assessProposedText || !_assessProposedFor){ box.style.display = 'none'; return; }
  var c = (clients||[]).find(function(x){ return x.id === _assessProposedFor; });
  var mine = _assessProposedFor === _assessCurrentClientId;
  var core = (document.getElementById('assessCore')||{}).value || '';
  if(mine && core.trim() === _assessProposedText.trim()){ box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = mine
    ? 'Hay una reducci\u00f3n generada para <b>' + esc((c&&c.name)||'este cliente') + '</b> que no est\u00e1 en el cuadro. '
      + '<span style="text-decoration:underline;cursor:pointer;font-weight:700" onclick="_applyPendingProposal()">Recuperar la reducci\u00f3n pendiente</span>'
    : '\u26A0 Hay una reducci\u00f3n pendiente que pertenece a <b>' + esc((c&&c.name)||'otro cliente') + '</b>, no a la ficha abierta. '
      + 'Abre la ficha de ese cliente para recuperarla. Aqu\u00ed no se puede pegar.';
}

function _renderClientLock(){
  var b = document.getElementById('abaClientLockBar');
  if(!_CLIENT_LOCK){ if(b) b.remove(); return; }
  if(!b){
    b = document.createElement('div');
    b.id = 'abaClientLockBar';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100002;background:#1d4ed8;color:#fff;padding:6px 14px;font-family:system-ui,sans-serif;font-size:12px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap';
    var t = document.createElement('span'); t.className = 'txt';
    var x = document.createElement('button');
    x.textContent = 'Soltar el bloqueo';
    x.style.cssText = 'background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.5);color:#fff;font-size:11px;padding:2px 9px;border-radius:4px;cursor:pointer';
    x.addEventListener('click', function(){ _breakClientLock(); });
    b.appendChild(t); b.appendChild(x);
    document.body.appendChild(b);
  }
  var secs = Math.round((Date.now() - _CLIENT_LOCK.t0) / 1000);
  var el = b.querySelector('.txt');
  if(el) el.textContent = '⏳ ' + _CLIENT_LOCK.label + ' en curso para "' + _lockedClientName() + '" ('
    + (secs < 60 ? secs + 's' : Math.floor(secs/60) + 'm ' + (secs%60) + 's')
    + ') — solo está bloqueado CAMBIAR DE CLIENTE; el resto de la app funciona.';
}

function showSummaryPanel(clientId) {
  const card = document.getElementById('summaryCard');
  const c = clients.find(x=>x.id===clientId);
  if (!c) { card.style.display='none'; return; }
  card.style.display='block';
  document.getElementById('sumClientName').textContent = c.name;
  const saved = LS.get('aba5_sum_'+clientId) || '';
  const planArea = document.getElementById('cPlanSummary');
  if (planArea) planArea.value = saved;
  document.getElementById('sumStatusBadge').innerHTML = saved
    ? '<span class="client-tag tag-green">Summary ✓</span>'
    : '<span class="client-tag tag-amber">No summary</span>';
  renderBehaviorChips(clientId);
  const pools = LS.get('aba5_pools_'+clientId) || {};
  document.getElementById('cReinf').value = pools.reinforcers || '';
  if(typeof _renderAnalystNotes === 'function') _renderAnalystNotes();
  const _dqEl = document.getElementById('cDocreq'); if(_dqEl) _dqEl.value = pools.docreq || '';
  const _paEl = document.getElementById('cProgActs'); if(_paEl) _paEl.value = pools.progActsRaw || '';
  _renderDocreqRead();
  _renderProgActsRead();
  // Pre-select therapist in the in-form selector
  const cTSel = document.getElementById('cTherapistSel');
  if (cTSel && c.therapistId) cTSel.value = c.therapistId;
  const clearBtn = document.getElementById('clearClientBtn');
  if (clearBtn) clearBtn.style.display = 'inline-flex';
  // Render note history
  renderNoteHistory(clientId);
  _assessLoad(clientId);
  // Monthly data reference (Phase 1)
  _populateMonthDataPeriods();
  _updateMonthDataBadge(clientId);
  const mdRecord = LS.get('aba5_monthdata_'+clientId);
  _renderMonthlyDataTable(mdRecord);
  pendingMonthDataText = null;
  const mdProc = document.getElementById('monthDataProcessing');
  if (mdProc) mdProc.textContent = '';
  document.getElementById('editCardTitle').textContent = 'Edit — ' + clientLabel(c);
}

// Fill the missing replacement functions for the client on screen. Without a function
// on the replacement the 1:1 function pairing has nothing to match against, so an
// empty "fn?" silently disables the rule the whole system is built on.
// El resultado se escribe AL LADO del botón. Antes iba solo a poolMsg, que está
// debajo de todo el pool de reemplazos y del campo de reforzadores: al pulsar no
// cambiaba nada a la vista y el botón parecía muerto — sobre todo con clientes cuyos
// programas son de adquisición, donde deducir CERO es el resultado correcto.
function _fillRepNote(txt, kind){
  var el = document.getElementById('repAutoNote');
  if(!el) return;
  el.textContent = txt;
  el.style.color = kind === 'err' ? 'var(--red,#c0392b)' : kind === 'warn' ? 'var(--amber,#b86c00)' : 'var(--green,#16a34a)';
}

function _fillRepFunctions(){
  if(!activeClientId){
    _fillRepNote('Selecciona un cliente primero.', 'err');
    showMsg('poolMsg','Selecciona un cliente primero.','err');
    return;
  }
  const r = _backfillRepFunctions(activeClientId);
  renderBehaviorChips(activeClientId);

  if(!r.filled && !r.unresolved.length){
    _fillRepNote('Nada que hacer: todos ya tenían función.', 'ok');
    showMsg('poolMsg','Todos los reemplazos ya tenían función.','ok');
    return;
  }

  // Deducir cero no es un fallo: los programas de adquisición (tac, ecoico,
  // intraverbal, imitación, matching, listener responding) no sirven UNA función
  // concreta, y adivinarles una sería inventar el emparejamiento 1:1.
  var short = r.filled
    ? r.filled + ' deducida(s)' + (r.unresolved.length ? ' · ' + r.unresolved.length + ' sin deducir' : '')
    : r.unresolved.length + ' sin deducir · 0 deducidas';
  _fillRepNote(short, r.filled ? (r.unresolved.length ? 'warn' : 'ok') : 'warn');

  let msg = r.filled
    ? r.filled + ' función(es) deducida(s) del nombre del programa (salen marcadas con ~ porque son una deducción, no un dato del plan).'
    : 'No se dedujo ninguna, y en muchos clientes eso es lo correcto: este botón solo deduce cuando el NOMBRE del programa dice a qué función sirve ("Request a break" → escape, "Wait for attention" → attention). Los programas de adquisición (tac, ecoico, intraverbal, imitación, matching, listener responding) no sirven una función única, así que se dejan vacíos a propósito en vez de inventarles una.';
  if(r.unresolved.length){
    msg += ' Sin deducir: "' + r.unresolved.slice(0,4).join('", "') + '"'
        + (r.unresolved.length > 4 ? ' y ' + (r.unresolved.length-4) + ' más' : '')
        + '. Asígnalas a mano con clic en su insignia de función si el plan sí las documenta.';
  }
  msg += ' Este botón NO toca las conductas maladaptativas: la función de una conducta no se puede deducir de su nombre.';
  showMsg('poolMsg', msg, r.unresolved.length ? 'err' : 'ok');
}

function renderBehaviorChips(clientId) {
  if(typeof _renderDefects === 'function') { try{ _renderDefects(); }catch(e){} }
  if(typeof _renderRedFlags === 'function') { try{ _renderRedFlags(); }catch(e){} }
  const pools = LS.get('aba5_pools_'+clientId) || {};
  renderChipPool('malPool', pools.mal || [], 'mal', clientId);
  renderChipPool('repPool', pools.rep || [], 'rep', clientId);
}

// Show ONLY client-specific behaviors — no global defaults mixed in
function renderChipPool(containerId, poolItems, type, clientId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const items = normalizeBehaviorArr(poolItems);

  if (!items.length) {
    el.innerHTML = `<div style="font-size:11px;color:var(--text3);font-family:var(--mono);padding:6px 0">[ no ${type==='mal'?'maladaptive behaviors':'replacement targets'} — upload assessment or add manually below ]</div>`;
    return;
  }

  el.innerHTML = items.map(item => {
    const status = item.status || 'active';
    const statusLabel = status==='onhold' ? ' ⏸' : status==='mastered' ? ' ✓' : status==='new' ? ' ★' : '';
    const escapedName = item.name.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    const titleText = status==='new'
      ? 'NEW suggestion — click to remove, or right-click to confirm (keep) it'
      : 'Click to remove · Right-click to change status (active / on hold / mastered)';
    // Both maladaptive and replacement chips carry an editable FUNCTION badge: the
    // behavior's function drives the intervention, and the replacement's served
    // function is what makes it functionally equivalent. Multiply-maintained items
    // may show several ("escape+automatic").
    const fnBadge = (type==='mal' || type==='rep')
      ? `<span onclick="cycleFn(event,'${type}','${escapedName}','${clientId}')"
           title="${type==='mal'?'Función del behavior (empareja intervención y replacement)':'Función que SIRVE este replacement (equivalencia funcional)'} — clic para elegir una o VARIAS.&#10;${item.fn ? (item.fnSrc==='inferred' ? 'Ahora: función DEDUCIDA del nombre del programa, no leída del plan. Verifícala.' : 'Ahora: función tomada del plan/assessment de este cliente.') : 'Ahora: sin función — el emparejamiento 1:1 por función no puede aplicarse.'}"
           style="margin-left:6px;font-size:9px;font-family:var(--mono);padding:1px 5px;border-radius:3px;cursor:pointer;background:${item.fn?(item.fnSrc==='inferred'?'rgba(217,119,6,.16)':'rgba(37,99,235,.15)'):'rgba(148,163,184,.20)'};color:${item.fn?(item.fnSrc==='inferred'?'#b45309':'#2563eb'):'var(--text3)'}"
         >${item.fn?(item.fnSrc==='inferred'?'~'+esc(item.fn):esc(item.fn)):'fn?'}</span>`
      : '';
    // Analysts rename targets and add clarifications to the label ("(New)", a date,
    // "Revised Operational Definition"...). Renaming must be possible from here, so
    // the chip carries its own edit button (click on the chip itself removes it).
    const editBtn = `<span onclick="renameChip(event,'${type}','${escapedName}','${clientId}')"
        title="Renombrar (los analistas cambian nombres y añaden aclaraciones)"
        style="margin-left:5px;font-size:10px;cursor:pointer;opacity:.55;padding:0 2px">✎</span>`;
    return `<span class="chip ${status}"
      onclick="toggleChip('${type}','${escapedName}','${clientId}')"
      oncontextmenu="cycleStatus(event,'${type}','${escapedName}','${clientId}')"
      title="${titleText}"
    >${esc(item.name)}${statusLabel?`<span class="chip-status">${statusLabel}</span>`:''}${fnBadge}${editBtn}</span>`;
  }).join('');
}

function toggleChip(type, val, clientId) {
  if (!clientId) return;
  const pools = LS.get('aba5_pools_'+clientId) || {};
  let arr = normalizeBehaviorArr(pools[type] || []);
  // All chips shown are already in plan — toggling removes them
  arr = arr.filter(x=>x.name!==val);
  pools[type] = arr;
  LS.set('aba5_pools_'+clientId, pools);
  renderChipPool(type==='mal'?'malPool':'repPool', arr, type, clientId);
}

function addCustomBehavior(type) {
  if (!activeClientId) return;
  const inputId = type === 'mal' ? 'malCustom' : 'repCustom';
  const val = document.getElementById(inputId).value.trim();
  if (!val) return;
  const pools = LS.get('aba5_pools_'+activeClientId) || {};
  let arr = normalizeBehaviorArr(pools[type] || []);
  if (!arr.find(x=>x.name===val)) arr = [...arr, {name:val, status:'active'}];
  pools[type] = arr;
  LS.set('aba5_pools_'+activeClientId, pools);
  document.getElementById(inputId).value = '';
  renderChipPool(type==='mal'?'malPool':'repPool', arr, type, activeClientId);
}

function saveBehaviorPools() {
  if (!activeClientId) return;
  const pools = LS.get('aba5_pools_'+activeClientId) || {};
  pools.reinforcers = document.getElementById('cReinf').value.trim();
  const _dq = document.getElementById('cDocreq');
  if (_dq) {
    const v = _dq.value.trim();
    if (v) pools.docreq = v; else delete pools.docreq;
  }
  const _pa = document.getElementById('cProgActs');
  if (_pa) {
    const raw = _pa.value.trim();
    if (raw) {
      pools.progActsRaw = raw;
      pools.progActs = _pickClientSection(_parseProgramActivities(raw), activeClientId);
    } else { delete pools.progActs; delete pools.progActsRaw; }
  }
  LS.set('aba5_pools_'+activeClientId, pools);
  _renderDocreqRead();
  _renderProgActsRead();
  showMsg('poolMsg','Behaviors saved.','ok');
}

// Show what was actually parsed, per program. A list that silently failed to parse
// would leave the note drawing from the platform's generic catalog again.
function _renderProgActsRead(){
  const el = document.getElementById('cProgActsRead');
  if(!el) return;
  el.style.color = '';
  if(!activeClientId){ el.textContent = ''; return; }
  const pools = LS.get('aba5_pools_'+activeClientId) || {};
  const raw = String(pools.progActsRaw||'').trim();
  if(!raw){ el.textContent = 'Sin lista propia: se usará el catálogo de actividades de la plataforma.'; return; }
  const map = pools.progActs || {};
  const progs = Object.keys(map);
  if(!progs.length){
    const detected = Object.keys(_parseProgramActivities(raw));
    el.textContent = detected.length
      ? '⚠ No se reconoció la sección de este cliente. El documento contiene: ' + detected.join(' · ') + '. Pega solo la parte de este cliente.'
      : '⚠ No se reconoció ningún programa. Revisa que cada programa tenga su encabezado y sus actividades en viñetas.';
    el.style.color = 'var(--err, #c0392b)';
    return;
  }
  const total = progs.reduce((n,p) => n + (map[p].acts||[]).length, 0);
  const min = Math.min.apply(null, progs.map(p => (map[p].acts||[]).length));
  el.textContent = progs.length + ' programa(s) con lista cerrada · ' + total + ' actividades · el programa con menos tiene ' + min + '.';
}

// Echo back what the system actually PARSED out of the requirements. The rules were
// being stored as prose only, so a client could carry them and still have nothing
// enforced, with no way to tell. This makes the numbers the form will use visible.
function _renderDocreqRead(){
  const el = document.getElementById('cDocreqRead');
  if(!el) return;
  if(!activeClientId){ el.textContent = ''; return; }
  const pools = LS.get('aba5_pools_'+activeClientId) || {};
  if(!String(pools.docreq||'').trim()){
    el.textContent = 'Sin requisitos propios: este cliente usa solo la base clínica global.';
    el.style.color = '';
    return;
  }
  const m = _programDocMinimums(pools);
  const bits = [];
  if(m.activities)  bits.push('≥ ' + m.activities + ' actividades por programa');
  if(m.reinforcers) bits.push('≥ ' + m.reinforcers + ' reforzadores por programa');
  if(m.social)      bits.push('≥ ' + m.social + ' tipos de reforzador social');
  if(m.schedule)    bits.push('esquema de reforzamiento en todos');
  if(m.pastTense)   bits.push('tiempo pasado');
  const q = (typeof _abaCardQuota === 'function') ? _abaCardQuota(activeClientId) : null;
  if(q && q.source === 'assessment') bits.push(q.mal + ' conductas + ' + q.goal + ' programas por nota');
  if(bits.length){
    el.textContent = 'El sistema aplicará: ' + bits.join(' · ') + '.';
    el.style.color = '';
  } else {
    el.textContent = '⚠ Hay texto pero no se reconoció ninguna cantidad. Escribe las cifras como "at least THREE reinforcers" / "al menos tres reforzadores" para que se apliquen al formulario.';
    el.style.color = 'var(--err, #c0392b)';
  }
}

function saveSummaryManual() {
  if (!activeClientId) return;
  const text = document.getElementById('cPlanSummary').value.trim();
  if (!text) return;
  LS.set('aba5_sum_'+activeClientId, text);
  document.getElementById('sumStatusBadge').innerHTML='<span class="client-tag tag-green">Summary ✓</span>';
  renderClientList();
  showMsg('sumMsg','Summary saved.','ok');
}

function onNoteCheckChange(which){
  const chkMap={97153:'chk97153',97155:'chk97155',97156:'chk97156',sup:'chkSup'};
  const durMap={97153:'durWrap97153',97155:'durWrap97155',97156:'durWrap97156',sup:'durWrapSup'};
  const rowMap={97153:'nsr97153',97155:'nsr97155',97156:'nsr97156',sup:'nsrSup'};
  const checked=document.getElementById(chkMap[which])?.checked;
  if(durMap[which]){
    const durWrap=document.getElementById(durMap[which]);
    if(durWrap)durWrap.style.visibility=checked?'visible':'hidden';
  }
  // Show session order selector only when BOTH 97155 and 97156 are checked
  const both97 = document.getElementById('chk97155')?.checked && document.getElementById('chk97156')?.checked;
  const orderWrap = document.getElementById('sessionOrderWrap');
  if(orderWrap) orderWrap.style.display = both97 ? 'flex' : 'none';
  // Show independent client/RBT presence toggles for 97156 whenever it is checked
  const chk156active = document.getElementById('chk97156')?.checked;
  const cp156Wrap = document.getElementById('clientPresent156Wrap');
  const rbt156Wrap = document.getElementById('rbtPresent156Wrap');
  const goals156Row = document.getElementById('goals156Row');
  if(cp156Wrap) cp156Wrap.style.display = both97 ? 'flex' : 'none';
  if(rbt156Wrap) rbt156Wrap.style.display = chk156active ? 'flex' : 'none';
  if(goals156Row) goals156Row.style.display = chk156active ? 'block' : 'none';
  // When 97156 is standalone (no 97155), default RBT to unchecked
  if(chk156active && !both97){
    const rbt156 = document.getElementById('rbtPresent156');
    if(rbt156) rbt156.checked = false;
  }
  const row=document.getElementById(rowMap[which]);
  if(row)row.classList.toggle('checked',!!checked);
  // Show/hide 97155 session template panel
  if(which==='97155'){
    const panel=document.getElementById('sessPanel97155');
    if(panel)panel.classList.toggle('open',!!checked);
    if(checked) randomizeSessionTemplate();
  }
  // Show/hide 97156 client-not-present warning
  if(which==='97156') onParticipantsChange();
  // NOTE: autoSuggestParticipants() disabled - user controls participants manually
  // Auto-suggest relevant participants based on selected notes
  // autoSuggestParticipants();
  const hasClient=!!document.getElementById('genClientSel').value;
  const rbt=isRBT();
  const anyChecked=rbt
    ?(document.getElementById('chk97153')?.checked||false)
    :(document.getElementById('chk97155').checked||document.getElementById('chk97156').checked||document.getElementById('chkSup').checked);
  document.getElementById('genBtn').disabled=!(hasClient&&anyChecked);
}

function onGenTherapistChange(){
  if(typeof _renderCaseGuide === 'function') _renderCaseGuide();
  const therapistId = document.getElementById('genTherapistSel').value;
  refreshGenClientSelect();
  onCredChange();
}

function refreshGenClientSelect(){
  const sel = document.getElementById('genClientSel');
  const cur = sel.value;
  const therapistId = document.getElementById('genTherapistSel')?.value || '';
  // Only show clients belonging to selected therapist
  const filtered = therapistId
    ? clients.filter(c=>c.therapistId===therapistId).sort((a,b)=>a.name.localeCompare(b.name))
    : [];
  sel.innerHTML = '<option value="">— select client —</option>' +
    filtered.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (cur && filtered.find(c=>c.id===cur)) sel.value = cur;
  onGenClientChange();
}

function onPlaceChange(){
  const place = document.getElementById('genPlace')?.value||'';
  const noCaregiver = ['School (03)','Daycare (12)','After School (99)','Summer Camp (99)'];
  if(noCaregiver.includes(place)){
    // Uncheck Caregiver/Parent, check Other
    const pCg = document.getElementById('pCaregiver');
    const pOth = document.getElementById('pOther');
    if(pCg){ pCg.checked=false; pCg.dataset.manuallySet='1'; }
    if(pOth){ pOth.checked=true; pOth.dataset.manuallySet='1'; }
    onParticipantsChange();
    // Show Other input field if it's hidden
    const otherInput = document.getElementById('pOtherInput');
    if(otherInput) otherInput.style.display='block';
  } else {
    // Restore Caregiver/Parent, uncheck Other (only if not manually set by user)
    const pCg = document.getElementById('pCaregiver');
    const pOth = document.getElementById('pOther');
    if(pCg){ pCg.checked=true; pCg.dataset.manuallySet=''; }
    if(pOth){ pOth.checked=false; pOth.dataset.manuallySet=''; }
    onParticipantsChange();
    const otherInput = document.getElementById('pOtherInput');
    if(otherInput) otherInput.style.display='none';
  }
}

function onGenClientChange(){
  if(_clientSwitchBlocked((document.getElementById('genClientSel')||{}).value)){ _refuseClientSwitch('genClientSel'); return; }
  _genAssessWarning((document.getElementById('genClientSel')||{}).value || '');
  const id = document.getElementById('genClientSel').value;
  const dot = document.getElementById('genDot');
  dot.style.background = id ? 'var(--green)' : 'var(--text3)';

  // CRITICAL: clear previous session data and variation history when client changes
  // to prevent any text from another client's notes leaking into this client's notes
  if (id !== (window._lastSession?.clientId || null)) {
    _sessionCount = 0;  // reset variation counter for new client
    window._lastSession = null;
    // Clear session context fields
    const ef=document.getElementById('envChanges'); if(ef) ef.value='';
    const mf=document.getElementById('medConcerns'); if(mf) mf.value='';
    const cf=document.getElementById('crisisSituation'); if(cf) cf.value='';
    // Note: we do NOT clear aba5_plan_ on client change — it persists per client
    const cgf=document.getElementById('customGoals97155'); if(cgf) cgf.value='';
    updateCustomGoalsIndicator();
    ['emergingMal','emergingRep','emergingInt'].forEach(eid=>{
      const el=document.getElementById(eid); if(el) el.value='';
    });
    updateEmergingIndicator();
    // Clear generated notes output
    const outContainer = document.getElementById('outputsContainer');
    if(outContainer) outContainer.innerHTML = '';
    // Date stays BLANK (Filosofía 1) — never auto-fill with today; the user must
    // enter the session date consciously for each note.
    const dateEl = document.getElementById('genDate');
    if(dateEl) dateEl.value = '';
    // Reset place to default
    const placeEl = document.getElementById('genPlace');
    if(placeEl) placeEl.value = placeEl.options[0]?.value || '';
    // Clear any generation messages
    const msgEl2 = document.getElementById('genMsg');
    if(msgEl2){ msgEl2.textContent=''; msgEl2.className='msg'; }
    // Clear locked rotation context
    window._lockedRotCtx = null;
    // Clear session review modal fields
    const srPrevPlan = document.getElementById('srPrevPlan');
    if(srPrevPlan) srPrevPlan.value = '';
    const srAutoplanBadge = document.getElementById('srAutoplanBadge');
    if(srAutoplanBadge) srAutoplanBadge.style.display = 'none';
    const srPrevNoteFile = document.getElementById('srPrevNoteFile');
    if(srPrevNoteFile) srPrevNoteFile.value = '';
    const srPrevNoteFileName = document.getElementById('srPrevNoteFileName');
    if(srPrevNoteFileName){ srPrevNoteFileName.textContent=''; srPrevNoteFileName.style.display='none'; }
    const srPrevNoteOPPrompt = document.getElementById('srPrevNoteOPPrompt');
    if(srPrevNoteOPPrompt) srPrevNoteOPPrompt.textContent = '';
    const srDate = document.getElementById('srDate');
    const genDateVal = document.getElementById('genDate')?.value || '';
    if(srDate) srDate.value = genDateVal;  // mirror the main field (blank stays blank)
    const srPlace = document.getElementById('srPlace');
    if(srPlace) srPlace.value = srPlace.options[0]?.value || '';
    
    // NOTE: Participants are NOT reset when client changes - user controls these manually
    // Set manual override flags to preserve current state
    ['pClient','pSupervisor','pTechnician','pCaregiver','pOther'].forEach(pid=>{
      const el=document.getElementById(pid);
      if(el) el.dataset.manuallySet = '1';  // Mark as manually set to prevent auto-suggestion
    });
    
    const otherInput=document.getElementById('pOtherInput');
    if(otherInput && !document.getElementById('pOther')?.checked) otherInput.style.display='none';
    
    // Clear custom frequency/trial inputs
    const freqSection = document.getElementById('srFreqSection');
    if(freqSection) freqSection.style.display='none';
    const repSection = document.getElementById('srRepSection');
    if(repSection) repSection.style.display='none';
  }

  onCredChange();
  const rbt = isRBT();
  const anyChecked = rbt
    ? (document.getElementById('chk97153')?.checked||false)
    : (document.getElementById('chk97155').checked||document.getElementById('chk97156').checked||document.getElementById('chkSup').checked);
  document.getElementById('genBtn').disabled = !(id && anyChecked);
  renderCoveragePanel(id||null);
  if(id && document.getElementById('chk97155')?.checked) randomizeSessionTemplate();
  
  // NOTE: autoSuggestParticipants() disabled - user controls participants manually
  
  // Show summary status warning
  const msgEl = document.getElementById('genMsg');
  if(id && msgEl){
    const hasSummary = !!LS.get('aba5_sum_'+id);
    const pools = LS.get('aba5_pools_'+id)||{};
    const hasBeh = getActiveBehaviors(pools,'mal').length > 0;
    if(!hasSummary && !hasBeh){
      msgEl.textContent = '⚠ No clinical summary for this client — go to Clients tab to upload one.';
      msgEl.className = 'msg msg-warn';
    } else if(msgEl.textContent.startsWith('⚠')){
      msgEl.textContent = ''; msgEl.className = 'msg';
    }
  }
}

function updateEmergingIndicator(){
  const items = getEmergingItems();
  const ind = document.getElementById('emergingIndicator');
  if(ind) ind.style.display = items ? 'block' : 'none';
}

function renderCaspHighlights(rawText, clientName, pools){
  // Check for any CASP tags
  if(!/\[CASP-[ABCD]\]/.test(rawText)) return null;

  const activeSections = ['A','B','C','D'].filter(s=>rawText.includes(`[CASP-${s}]`));
  if(!activeSections.length) return null;

  // Build term list for behavior/replacement highlighting (red)
  const rawTerms = [];
  if(clientName && clientName.trim()) rawTerms.push(clientName.trim());
  const mal = getActiveBehaviors(pools,'mal') || [];
  const rep = getActiveBehaviors(pools,'rep') || [];
  [...mal,...rep].forEach(t=>{ if(t&&t.trim()) rawTerms.push(t.trim()); });
  const allTerms = new Set();
  rawTerms.forEach(t=>{
    allTerms.add(t);
    const words=t.split(/\s+/);
    if(words.length>3) allTerms.add(words.slice(0,3).join(' '));
  });
  const terms=[...allTerms].sort((a,b)=>b.length-a.length);
  const escaped=terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const behaviorRx=escaped.length?new RegExp(`(${escaped.join('|')})`,'gi'):null;

  function applyBehaviorHL(txt){
    if(!behaviorRx) return esc(txt);
    return txt.split(behaviorRx).map((p,i)=>
      i%2===1?`<span style="color:#dc2626;font-weight:600">${esc(p)}</span>`:esc(p)
    ).join('');
  }

  // Replace CASP tag blocks with inline-highlighted spans
  // Each [CASP-X]...[/CASP-X] becomes a span with colored background
  let processed = rawText.replace(
    /\[CASP-([ABCD])\]([\s\S]*?)\[\/CASP-\1\]/g,
    (_, sec, content) => {
      const m = CASP_META[sec];
      const inner = content.trim();
      // Apply behavior highlights within the section
      const lines = inner.split('\n').map(line=>{
        if(!line.trim()) return '';
        return applyBehaviorHL(line);
      }).join('\n');
      return `<span style="background:${m.bg};border-bottom:2px solid ${m.border};border-radius:2px;padding:0 1px" title="§${sec}: ${m.label}">${lines}</span>`;
    }
  );

  // Apply behavior highlights to non-tagged text
  processed = processed.split('\n').map(line=>{
    if(!line.trim()) return '';
    // If line already contains our span tags (was tagged), don't double-process
    if(line.includes('background:')) return line;
    return applyBehaviorHL(line);
  }).join('\n');

  // Convert newlines to paragraphs
  const html = '<p style="margin:0 0 8px">' +
    processed.split(/\n\n+/).map(block=>block.replace(/\n/g,'<br>')).join('</p><p style="margin:0 0 8px">') +
    '</p>';

  // Legend
  const legendHtml = activeSections.map(s=>`
    <span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;font-size:11px;color:var(--text2)">
      <span style="display:inline-block;width:14px;height:8px;border-radius:2px;background:${CASP_META[s].bg};border-bottom:2px solid ${CASP_META[s].border}"></span>
      ${CASP_META[s].label}
    </span>`).join('');

  return { legend: legendHtml, html };
}

function updateCustomGoalsIndicator(){
  const val = document.getElementById('customGoals97155')?.value.trim()||'';
  const ind = document.getElementById('customGoalsIndicator');
  if(ind) ind.style.display = val ? 'block' : 'none';
}

function copyInterventions(noteId){
  const el = document.getElementById('interventions-plain-'+noteId);
  if(!el) return;
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const btn = el.nextElementSibling?.nextElementSibling || el.parentElement.querySelector('button');
    if(btn){ const orig=btn.textContent; btn.textContent='✓ Copied'; setTimeout(()=>btn.textContent=orig,1500); }
  });
}

function closeSessionReview(){
  document.getElementById('sessionReviewModal').style.display='none';
}

function saveNoteToHistory(clientId, noteKey, dt, dur, text, replaceSameSession){
  if(!clientId || !text || text.length < 50) return;
  const key = 'aba5_notes_'+clientId;
  let history = LS.get(key) || [];
  // Regenerating produces a new version of the SAME session note, not a second note.
  // Without this the history kept both the discarded version and the good one, and
  // the discarded one sat on top because it was saved first.
  if(replaceSameSession){
    let dropped = false;
    history = history.filter(function(h){
      if(!dropped && h.type === noteKey && h.date === dt){ dropped = true; return false; }
      return true;
    });
  }
  history.unshift({
    id: Date.now(),
    type: noteKey,
    date: dt,
    dur: dur,
    text: text,
    saved: new Date().toISOString()
  });
  // Keep last 30 notes per client
  LS.set(key, history.slice(0, 30));
}

function renderNoteHistory(clientId){
  // The container id is set dynamically when the panel opens
  const container = document.getElementById('noteHistoryContainer');
  if(!container) return;
  const history = loadNoteHistory(clientId);
  if(!history.length){
    container.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:4px 0">No notes generated yet for this client.</p>';
    return;
  }
  container.innerHTML = history.map(n=>`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border2);border-radius:6px;margin-bottom:6px;background:var(--bg)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text)">${esc(NOTE_TYPE_LABELS[n.type]||n.type)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">${esc(n.date)} · ${esc(n.dur||'')} · ${Math.round(n.text.split(/\s+/).length)} words</div>
      </div>
      <button onclick='viewNoteModal(${JSON.stringify(clientId)}, ${JSON.stringify(n.id)})' style="padding:4px 12px;border:1px solid var(--border2);border-radius:5px;background:var(--surface);font-size:11px;font-family:var(--sans);cursor:pointer;color:var(--text2);white-space:nowrap">View</button>
      <button onclick="deleteNoteFromHistory(${JSON.stringify(clientId)},${n.id})" style="padding:4px 8px;border:1px solid #fca5a5;border-radius:5px;background:#fff5f5;font-size:11px;cursor:pointer;color:#dc2626" title="Delete this note">✕</button>
    </div>`).join('');
}

function deleteNoteFromHistory(clientId, noteId){
  const key = 'aba5_notes_'+clientId;
  const history = loadNoteHistory(clientId);
  LS.set(key, history.filter(n=>n.id!==noteId));
  renderNoteHistory(clientId);
}

function closeNoteViewer(){
  document.getElementById('noteViewerModal').style.display='none';
}

function onParticipantsChange() {
  const otherChecked = document.getElementById('pOther')?.checked;
  const otherInput = document.getElementById('pOtherInput');
  if (otherInput) otherInput.style.display = otherChecked ? 'block' : 'none';

  // Show warning for 97156 if client not present
  const clientPresent = document.getElementById('pClient')?.checked;
  const chk156 = document.getElementById('chk97156')?.checked;
  const warn = document.getElementById('p97156Warning');
  if (warn) warn.style.display = (!clientPresent && chk156) ? 'block' : 'none';
}

function renderSessionTemplatePreview(tmpl) {
  const el = document.getElementById('sessPreview');
  if (!el) return;
  const rows = [];
  if (tmpl.faceToFace) {
    let aRow = `<div style="margin-bottom:7px"><span style="font-family:var(--mono);font-size:10px;color:var(--blue);font-weight:600">A.</span> <span style="color:var(--text)">Face-to-face observations</span> <span style="color:var(--text3)">→ ${esc(tmpl.faceToFace.resultText)}</span>`;
    if (tmpl.faceToFace.aComponents && tmpl.faceToFace.aComponents.length) {
      aRow += `<div style="padding-left:16px;margin-top:3px;color:var(--text3);font-size:11px">Components requiring adjustment: ${esc(tmpl.faceToFace.aComponents.join(', '))}</div>`;
    }
    aRow += '</div>';
    rows.push(aRow);
  }
  if (tmpl.adjustments) {
    rows.push(`<div style="margin-bottom:7px"><span style="font-family:var(--mono);font-size:10px;color:var(--blue);font-weight:600">B.</span> <span style="color:var(--text)">Adjustments made to:</span> <span style="color:var(--text3)">${esc(tmpl.adjustments.components.join(', '))}</span></div>`);
  }
  if (tmpl.activeDirection) {
    rows.push(`<div style="margin-bottom:7px"><span style="font-family:var(--mono);font-size:10px;color:var(--blue);font-weight:600">C.</span> <span style="color:var(--text)">Active direction — </span><span style="color:var(--text3)">${tmpl.activeDirection.actions.map(a=>esc(a.substring(0,60)+'…')).join(' / ')}</span></div>`);
  }
  if (tmpl.qhpImplementation) {
    rows.push(`<div style="margin-bottom:7px"><span style="font-family:var(--mono);font-size:10px;color:var(--blue);font-weight:600">D.</span> <span style="color:var(--text)">QHP implementation →</span> <span style="color:var(--text3)">${esc(tmpl.qhpImplementation.resultText)}</span></div>`);
  }
  el.innerHTML = rows.length ? rows.join('') : '<span style="color:var(--text3);font-size:11px">No services selected.</span>';
}

function onStChange() { /* no-op — kept for compatibility */ }
function _renderAnalystNotes(){
  var el = document.getElementById('acList');
  if(!el) return;
  if(!activeClientId){ el.innerHTML = ''; return; }
  var list = _analystNotes(activeClientId);
  var d = document.getElementById('acDate');
  if(d && !d.value) d.value = new Date().toISOString().slice(0,10);
  if(!list.length){
    el.innerHTML = '<span style="color:var(--text3)">Sin correcciones registradas. Las que añadas aquí se aplicarán a todas las notas de este cliente.</span>';
    return;
  }
  var esc = function(x){ return String(x||'').replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); };
  // Newest first: the most recent correction is the one most likely to be re-checked.
  el.innerHTML = list.slice().reverse().map(function(n){
    var head = [n.date || '', n.rbt ? 'RBT ' + n.rbt : ''].filter(Boolean).join(' · ');
    return '<div style="border-left:3px solid var(--blue);padding:4px 8px;margin-bottom:6px;background:rgba(37,99,235,.06);border-radius:0 4px 4px 0">'
      + (head ? '<div style="font-size:10px;color:var(--text3);font-family:var(--mono)">' + esc(head) + '</div>' : '')
      + '<div style="white-space:pre-wrap">' + esc(n.text) + '</div>'
      + (function(){
          // Alcance propuesto por el sistema y conflicto detectado. Sin revisar, la
          // correccion sigue valiendo para ESTE cliente como siempre; lo que la
          // revision decide es si ademas se eleva a criterio general.
          if(!n.scope) return '<div style="font-size:10px;color:var(--text3);margin-top:3px">Sin revisar — se aplica a este cliente. Pulsa «Revisar sugerencias nuevas» para ver si es un criterio general.</div>';
          var SC = { universal:'criterio clínico general', agency:'exigencia de esta agencia/analista', client:'hecho de este cliente' };
          var col = n.conflict ? 'var(--red,#c0392b)' : (n.scope === 'universal' ? 'var(--green,#16a34a)' : 'var(--text3)');
          var h = '<div style="font-size:10px;color:' + col + ';margin-top:3px">Alcance: <b>' + SC[n.scope] + '</b>'
                + (n.reason ? ' — ' + esc(n.reason) : '') + '</div>';
          if(n.conflict){
            h += '<div style="font-size:10px;color:var(--red,#c0392b);margin-top:2px">⚠ Choca con la práctica clínica establecida: '
              + esc(n.conflict) + '. No se aplicará a otros clientes aunque la confirmes.</div>';
          }
          if(n.scope === 'universal' && !n.conflict){
            var on = n.state === 'ok';
            h += '<div style="margin-top:4px">'
              + '<button onclick="_setAnalystNoteState(activeClientId,\'' + n.id + '\',\'' + (on ? '' : 'ok') + '\')"'
              + ' style="padding:2px 9px;font-size:10px;border-radius:3px;cursor:pointer;border:1px solid '
              + (on ? 'var(--green,#16a34a)' : 'var(--border2)') + ';background:' + (on ? 'rgba(22,163,74,.12)' : 'var(--surface)')
              + ';color:' + (on ? 'var(--green,#16a34a)' : 'var(--text3)') + '">'
              + (on ? '✓ validada — se aplica a TODOS los clientes' : 'Validar como criterio general') + '</button></div>';
          }
          return h;
        })()
      + '<button class="btn btn-outline" style="padding:2px 8px;font-size:10px;margin-top:4px" onclick="_delAnalystNote(\'' + n.id + '\')">Quitar</button>'
      + '</div>';
  }).join('');
}

/* ── VISTA 1: ficha del terapista ([ THERAPIST ]) ───────────────────────── */
function _renderThGuide(){
  var box = document.getElementById('thGuideBox');
  if(!box) return;
  var th = _thGuideTh();
  box.style.display = th ? 'block' : 'none';
  if(!th){ _flushCaseGuide(); return; }
  _guidePaint('thGuideText', 'thGuideWho', th, '');
  var msg = document.getElementById('thGuideMsg');
  if(msg && !_guidePending[_caseGuideKey(th)]) msg.textContent = '';
}

function _renderCaseGuide(){
  var box = document.getElementById('caseGuideBox');
  if(!box) return;
  var th = _caseGuideTh();
  if(!th) _flushCaseGuide();                 // no perder lo escrito al quedarnos sin terapista
  box.style.display = _caseGuideOpen(th) ? 'block' : 'none';
  _guidePaint('caseGuideText', 'caseGuideWho', th, 'elige un terapista arriba');
  _markCaseGuideBtn();
}

function copyFieldText(elId, btn){
  var el = document.getElementById(elId);
  if(!el) return;
  var txt = (el.innerText || el.textContent || '').trim();
  if(!txt) return;
  navigator.clipboard.writeText(txt).then(function(){
    if(!btn) return;
    var o = btn.textContent;
    btn.textContent = '✓ Copiado';
    setTimeout(function(){ btn.textContent = o; }, 1600);
  }).catch(function(){});
}

function renderApiBanner() {
  const banner = document.getElementById('apiBanner');
  if (!banner) return;
  banner.className='api-banner ok';
  banner.innerHTML='<span style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--green)">\u2713 Gemini se llama a trav\u00e9s del servidor (Supabase Edge Function) \u2014 no se necesita API key en el navegador</span>';
  _gemRenderBanner();
}

function saveApiKey() {
  const k = (document.getElementById('apiKeyInput')||{}).value||'';
  if (!k.trim()) { alert('Enter a valid API key.'); return; }
  LS.set('aba5_apikey', k.trim());
  renderApiBanner();
}
function copyBlock(id){
  const el=document.getElementById('box-'+id);
  const body=el?.dataset?.plain || el?.textContent||'';
  navigator.clipboard.writeText(body).then(()=>{
    const btn=document.querySelector(`#foot-${id} .btn-copy-note`);
    if(!btn)return;
    const orig=btn.textContent; btn.textContent='✓ Copied';
    setTimeout(()=>btn.textContent=orig,1800);
  }).catch(()=>{});
}

function copyBlockAll(id){
  const goals=document.getElementById('goals-'+id)?.textContent||'';
  const services=document.getElementById('services-'+id)?.textContent||'';
  const body=document.getElementById('box-'+id)?.textContent||'';
  let full='';
  if(goals) full+=`Goals: ${goals}\n\n`;
  if(services) full+=`Services Provided:\n${services}\n\n`;
  full+=`Summary:\n${body}`;
  navigator.clipboard.writeText(full.trim()).then(()=>{
    const btn=document.querySelector(`#foot-${id} .btn-copy-all`);
    if(!btn)return;
    const orig=btn.textContent; btn.textContent='✓ Copied';
    setTimeout(()=>btn.textContent=orig,1800);
  }).catch(()=>{});
}

function copySupFromNote(){
  const text = document.getElementById('supFromNoteResult').textContent || '';
  if(!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('#supFromNoteOutput .btn-outline');
    if(!btn) return;
    const orig = btn.textContent; btn.textContent = 'Copied';
    setTimeout(() => btn.textContent = orig, 1800);
  }).catch(() => {});
}


/* Date/Place alert helpers */
function onSrDateChange(){
  const v = document.getElementById('srDate')?.value;
  const isDefault = !v || v === today();
  const box = document.getElementById('srDateBox');
  if(box) box.style.borderColor = isDefault ? '#f59e0b' : 'var(--green)';
  document.getElementById('srDateFlag').textContent = isDefault ? '⚠ check' : '✓';
  updateSrAlertBanner();
}
function onSrPlaceChange(){
  const v = document.getElementById('srPlace')?.value;
  const isDefault = !v || v === 'Home (12)';
  const box = document.getElementById('srPlaceBox');
  if(box) box.style.borderColor = isDefault ? '#f59e0b' : 'var(--green)';
  document.getElementById('srPlaceFlag').textContent = isDefault ? '⚠ check' : '✓';
  updateSrAlertBanner();
}
function updateSrAlertBanner(){
  const dateOk = document.getElementById('srDate')?.value && document.getElementById('srDate').value !== today();
  const placeOk = document.getElementById('srPlace')?.value && document.getElementById('srPlace').value !== 'Home (12)';
  document.getElementById('srDatePlaceAlert').style.display = (dateOk && placeOk) ? 'none' : 'block';
}

function showExportMobileModal(clientName, jsonStr) {
  const existing = document.getElementById('exportMobileModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'exportMobileModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px 16px 0 0;padding:20px 18px 32px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0">
        <div style="font-size:14px;font-weight:700;color:var(--text)">Export — ${esc(clientName)}</div>
        <button onclick="document.getElementById('exportMobileModal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);line-height:1">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;flex-shrink:0;line-height:1.5">
        Tu dispositivo no permite descargas directas.<br>
        Presiona <strong>Copy JSON</strong>, luego pégalo en un email o mensaje y ábrelo en el otro dispositivo.
      </div>
      <textarea id="exportMobileJson" readonly style="flex:1;min-height:180px;font-size:10px;font-family:monospace;padding:10px;border:1px solid var(--border2);border-radius:8px;background:var(--bg);color:var(--text);resize:none;outline:none">${esc(jsonStr)}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px;flex-shrink:0">
        <button onclick="copyExportJson()" style="flex:1;padding:12px;background:var(--blue);color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;font-family:var(--sans);cursor:pointer" id="copyExportBtn">Copy JSON</button>
        <button onclick="document.getElementById('exportMobileModal').remove()" style="padding:12px 16px;background:var(--surface);border:1px solid var(--border2);border-radius:8px;font-size:14px;font-family:var(--sans);cursor:pointer;color:var(--text2)">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function copyExportJson() {
  const ta = document.getElementById('exportMobileJson');
  if (!ta) return;
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.getElementById('copyExportBtn');
    if (btn) { btn.textContent = '✓ Copied!'; btn.style.background = '#059669'; }
    setTimeout(() => {
      if (btn) { btn.textContent = 'Copy JSON'; btn.style.background = 'var(--blue)'; }
    }, 2500);
  }).catch(() => {
    ta.select();
    ta.setSelectionRange(0, 99999);
    document.execCommand('copy');
    alert('Selected all text. Use long-press → Copy to copy it manually.');
  });
}

function closeImportClientModal() {
  document.getElementById('importClientModal').style.display = 'none';
  _pendingImport = null;
}

function updateOPPrompt(){
  const box = document.getElementById('opPromptBox');
  if(box) box.textContent = buildOPPrompt();
}

function copyOPPrompt(){
  const text = buildOPPrompt();
  navigator.clipboard.writeText(text).then(()=>{
    const btn = document.querySelector('#opPromptBox + div .btn-outline');
    if(btn){ const o=btn.textContent; btn.textContent='\u2713 Copied'; setTimeout(()=>btn.textContent=o,2000); }
  }).catch(()=>{
    const box = document.getElementById('opPromptBox');
    if(box){ box.select && box.select(); document.execCommand('copy'); }
  });
}

function onMthClientChange(){
  const clientId = document.getElementById('mthClientSel').value;
  if(_clientSwitchBlocked(clientId)){ _refuseClientSwitch('mthClientSel'); return; }
  updateOPPrompt();
  if(!clientId) return;
  const pools = LS.get('aba5_pools_'+clientId)||{};
  const malBehaviors = getActiveBehaviors(pools,'mal');
  const repBehaviors = getActiveBehaviors(pools,'rep');
  const malContainer = document.getElementById('mthMalRows');
  const repContainer = document.getElementById('mthRepRows');
  malContainer.innerHTML = ''; repContainer.innerHTML = ''; _mthMalCount = 0; _mthRepCount = 0;
  if(malBehaviors.length){ malBehaviors.forEach(b => addMthMalRow(b)); } else { addMthMalRow(); }
  if(repBehaviors.length){ repBehaviors.forEach(r => addMthRepRow(r)); } else { addMthRepRow(); }
}

function addMthMalRow(name=''){
  const i = _mthMalCount++;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 80px 80px 80px 80px;gap:8px;align-items:center;margin-bottom:8px';
  div.innerHTML = `
    <input type="text" id="mthMal_name_${i}" value="${esc(name)}" placeholder="Behavior name" style="padding:7px 9px;border:1px solid var(--border2);border-radius:5px;font-size:12px;background:var(--surface);color:var(--text);outline:none;font-family:var(--sans)">
    <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px;text-align:center">Wk 1</div><input type="number" id="mthMal_w1_${i}" min="0" placeholder="—" style="width:100%;padding:6px 4px;border:1px solid var(--border2);border-radius:5px;font-size:12px;text-align:center;background:var(--surface);color:var(--text);outline:none;font-family:var(--mono)"></div>
    <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px;text-align:center">Wk 2</div><input type="number" id="mthMal_w2_${i}" min="0" placeholder="—" style="width:100%;padding:6px 4px;border:1px solid var(--border2);border-radius:5px;font-size:12px;text-align:center;background:var(--surface);color:var(--text);outline:none;font-family:var(--mono)"></div>
    <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px;text-align:center">Wk 3</div><input type="number" id="mthMal_w3_${i}" min="0" placeholder="—" style="width:100%;padding:6px 4px;border:1px solid var(--border2);border-radius:5px;font-size:12px;text-align:center;background:var(--surface);color:var(--text);outline:none;font-family:var(--mono)"></div>
    <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px;text-align:center">Wk 4</div><input type="number" id="mthMal_w4_${i}" min="0" placeholder="—" style="width:100%;padding:6px 4px;border:1px solid var(--border2);border-radius:5px;font-size:12px;text-align:center;background:var(--surface);color:var(--text);outline:none;font-family:var(--mono)"></div>`;
  document.getElementById('mthMalRows').appendChild(div);
}

function addMthRepRow(name=''){
  const i = _mthRepCount++;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 90px 90px 90px;gap:8px;align-items:center;margin-bottom:8px';
  div.innerHTML = `
    <input type="text" id="mthRep_name_${i}" value="${esc(name)}" placeholder="Program name" style="padding:7px 9px;border:1px solid var(--border2);border-radius:5px;font-size:12px;background:var(--surface);color:var(--text);outline:none;font-family:var(--sans)">
    <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px;text-align:center">Avg accuracy %</div><input type="number" id="mthRep_pct_${i}" min="0" max="100" placeholder="—" style="width:100%;padding:6px 4px;border:1px solid var(--border2);border-radius:5px;font-size:12px;text-align:center;background:var(--surface);color:var(--text);outline:none;font-family:var(--mono)"></div>
    <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px;text-align:center">Total trials</div><input type="number" id="mthRep_trials_${i}" min="0" placeholder="—" style="width:100%;padding:6px 4px;border:1px solid var(--border2);border-radius:5px;font-size:12px;text-align:center;background:var(--surface);color:var(--text);outline:none;font-family:var(--mono)"></div>
    <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px;text-align:center">Prompt level</div><select id="mthRep_prompt_${i}" style="width:100%;padding:6px 4px;border:1px solid var(--border2);border-radius:5px;font-size:11px;background:var(--surface);color:var(--text);outline:none;font-family:var(--sans)"><option value="">—</option><option>Independent</option><option>Gestural</option><option>Verbal</option><option>Partial physical</option><option>Full physical</option><option>Model</option></select></div>`;
  document.getElementById('mthRepRows').appendChild(div);
}

function toggleMthIOA(){
  const show = document.getElementById('mthIOA').value === 'yes';
  ['mthIOAMethodWrap','mthIOAPctWrap','mthIOABehaviorsWrap'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = show ? '' : 'none';
  });
}

function copyMthSummary(){
  const text = document.getElementById('mthResult').textContent||'';
  if(!text) return;
  navigator.clipboard.writeText(text).then(()=>{
    const btn = document.querySelector('#mthOutput .btn-outline');
    if(btn){ const o=btn.textContent; btn.textContent='Copied'; setTimeout(()=>btn.textContent=o,1800); }
  }).catch(()=>{});
}

function refreshMthClientSelect(){
  const sel = document.getElementById('mthClientSel');
  if(!sel) return;
  const cur = sel.value;
  const analysts = therapists
    .filter(t => t.credential !== 'RBT')
    .sort((a,b)=>a.name.localeCompare(b.name));
  let html = '<option value="">— select client —</option>';
  analysts.forEach(t=>{
    const mine = clients
      .filter(c=>c.therapistId===t.id)
      .sort((a,b)=>a.name.localeCompare(b.name));
    if(!mine.length) return;
    const label = esc(t.name) + (t.credential ? ' ('+esc(t.credential)+')' : '');
    html += `<optgroup label="${label}">` +
      mine.map(c=>`<option value="${c.id}"${c.id===cur?' selected':''}>${esc(c.name)}</option>`).join('') +
      `</optgroup>`;
  });
  sel.innerHTML = html;
}

function saveDriveClientId(){
  const v = document.getElementById('driveClientId')?.value.trim();
  if(!v){ showMsg('driveMsg','Paste your Client ID first.','err'); return; }
  LS.set('drive_client_id', v);
  showMsg('driveMsg','Client ID saved.','ok');
}

function showDriveSetup(){
  document.getElementById('driveSetupModal').style.display='flex';
}
function onAnalystProtoModChange(){ _anUpdateGenBtn(); }

// Populate the ANALYST selector with analyst-credentialed therapists only
// (non-RBT: BCBA / BCBA-D / BCaBA). Client selection is gated by this choice.
function refreshAnalystTherapistSelect(){
  const sel=document.getElementById('anTherapistSel');
  if(!sel) return;
  const cur=sel.value;
  const analysts=[...therapists].filter(t=>t.credential!=='RBT').sort((a,b)=>a.name.localeCompare(b.name));
  sel.innerHTML='<option value="">— select analyst —</option>'+analysts.map(t=>`<option value="${t.id}">${esc(t.name)} · ${esc(t.credential)}</option>`).join('');
  if(cur && analysts.find(t=>t.id===cur)) sel.value=cur;
  refreshAnalystClientSelect();
}

function onAnalystTherapistChange(){
  refreshAnalystClientSelect();
  _updateAnalystSupTypeForCredential();
}

function refreshAnalystClientSelect(){
  const sel=document.getElementById('anClientSel');
  if(!sel) return;
  const cur=sel.value;
  const analystId=document.getElementById('anTherapistSel')?.value||'';
  // Only show clients whose assigned therapist is the selected analyst
  const filtered=analystId
    ? clients.filter(c=>c.therapistId===analystId).sort((a,b)=>a.name.localeCompare(b.name))
    : [];
  sel.innerHTML='<option value="">— select client —</option>'+filtered.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if(cur && filtered.find(c=>c.id===cur)) sel.value=cur;
  onAnalystClientChange();
}

function onAnalystClientChange(){
  if(_clientSwitchBlocked((document.getElementById('anClientSel')||{}).value)){ _refuseClientSwitch('anClientSel'); return; }
  const id=document.getElementById('anClientSel')?.value||'';
  const dot=document.getElementById('anDot');
  if(dot) dot.style.background=id?'var(--green)':'var(--text3)';
  _anUpdateGenBtn();
  _anRotCtx=null;
  const msg=document.getElementById('anMsg');
  if(msg){ msg.textContent=''; msg.className='msg'; }
  if(!id) return;
  // Auto-select random protocol modification components for this client
  autoSelectProtoMods(id);
  // Silently update behavior rotation context for note generation (no freq display)
  const pools=LS.get('aba5_pools_'+id)||{};
  _anRotCtx=selectBehaviorsSmart(id, pools, 2, 2);
}

function onAnalystSupTypeChange(){
  const sup=getAnalystSupType();
  ['rbt','bcaba','direct'].forEach(v=>{
    const lbl=document.getElementById('an-srt-'+v);
    if(lbl) lbl.classList.toggle('active', v===sup);
  });
  const wrap=document.getElementById('anCasp_C_wrap');
  const chkC=document.getElementById('anCasp_C');
  const detC=document.getElementById('anCasp_C_detail');
  if(sup==='direct'){
    if(chkC){ chkC.checked=false; chkC.disabled=true; }
    if(detC) detC.style.display='none';
    if(wrap){ wrap.style.opacity='0.4'; wrap.style.pointerEvents='none'; wrap.title='Not applicable: no technician is present in a direct BCBA session.'; }
    const t=document.getElementById('anPTechnician'); if(t) t.checked=false;
  } else {
    if(chkC) chkC.disabled=false;
    if(wrap){ wrap.style.opacity=''; wrap.style.pointerEvents=''; wrap.title=''; }
    const t=document.getElementById('anPTechnician'); if(t && !t.checked) t.checked=true;
  }
  // Show/hide BCaBA supervision card (only for bcaba supType)
  const bcabaSupCard=document.getElementById('anBcabaSupCard');
  if(bcabaSupCard){
    if(sup==='bcaba'){
      bcabaSupCard.style.display='block';
      const compHost=document.getElementById('anBcabaSupComp');
      if(compHost && !compHost.innerHTML.trim()){
        _populateBcabaSupCheckboxes('anBcabaSupComp', BCABA_SUP_COMPONENTS, 'anBcabaSupComp_item');
        _populateBcabaSupCheckboxes('anBcabaSupTask', BCABA_TASK_LIST, 'anBcabaSupTask_item');
        _populateBcabaSupCheckboxes('anBcabaSupEval', BCABA_EVALUATION, 'anBcabaSupEval_item');
        const clientId=document.getElementById('anClientSel')?.value||'';
        _autoSelectBcabaSup(clientId, 'an');
      }
    } else {
      bcabaSupCard.style.display='none';
    }
  }
}

function onAnalystCaspChange(){
  ['A','B','C','D'].forEach(s=>{
    const chk=document.getElementById('anCasp_'+s);
    const det=document.getElementById('anCasp_'+s+'_detail');
    if(chk && det) det.style.display=chk.checked?'block':'none';
  });
  const A=document.getElementById('anCasp_A')?.checked;
  const Aresult=document.querySelector('input[name="anCasp_A_result"]:checked')?.value||'ok';
  const chkB=document.getElementById('anCasp_B');
  const detB=document.getElementById('anCasp_B_detail');
  if(A && Aresult==='ok'){
    if(chkB){ chkB.checked=false; chkB.disabled=true; }
    if(detB) detB.style.display='none';
    document.querySelectorAll('.anCasp_D_item').forEach(c=>{
      if(c.value && c.value.toLowerCase().includes('modified')){ c.checked=false; c.disabled=true; if(c.parentElement) c.parentElement.style.opacity='.45'; }
    });
  } else {
    if(chkB) chkB.disabled=false;
    document.querySelectorAll('.anCasp_D_item').forEach(c=>{ c.disabled=false; if(c.parentElement) c.parentElement.style.opacity=''; });
  }
}


// Render behavior frequency rows in the analyst tab (shared between onAnalystClientChange and clearAnalyst).
function _renderAnFreqRows(behaviors){
  const freqSection=document.getElementById('anFreqSection');
  const freqRows=document.getElementById('anFreqRows');
  if(!freqSection||!freqRows) return;
  if(behaviors&&behaviors.length){
    freqSection.style.display='block';
    freqRows.innerHTML=behaviors.map((b,i)=>`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="flex:1;font-size:12px;color:var(--text2);line-height:1.3">${esc(b)}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" id="anFreq_${i}" min="0" max="999" placeholder="—" style="width:58px;padding:5px 8px;border:1px solid var(--border2);border-radius:6px;font-size:13px;font-weight:600;text-align:center;background:var(--surface);color:var(--text);font-family:var(--mono);outline:none">
          <span style="font-size:11px;color:var(--text3)">episodes</span>
        </div>
      </div>`).join('')+`
      <div style="display:flex;align-items:center;gap:10px;margin-top:6px;padding-top:8px;border-top:1px solid var(--border2)">
        <div style="flex:1;font-size:12px;color:var(--text2)">Total redirections / interventions applied</div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" id="anFreq_redirections" min="0" max="999" placeholder="—" style="width:58px;padding:5px 8px;border:1px solid var(--border2);border-radius:6px;font-size:13px;font-weight:600;text-align:center;background:var(--surface);color:var(--text);font-family:var(--mono);outline:none">
          <span style="font-size:11px;color:var(--text3)">times</span>
        </div>
      </div>`;
    freqRows.dataset.behaviors=JSON.stringify(behaviors);
  } else {
    freqSection.style.display='none';
    freqRows.innerHTML='';
    delete freqRows.dataset.behaviors;
  }
}
