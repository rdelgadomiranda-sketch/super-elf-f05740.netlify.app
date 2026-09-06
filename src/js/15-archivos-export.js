// Append extracted document text instead of overwriting, so the user can combine
// multiple sources (e.g. an OfficePuzzle note sheet + a full assessment) into one
// comprehensive extraction. Each document is capped, and the combined total is capped.
function _appendPendingDoc(newText, filename){
  const clean = (newText || '').substring(0, 30000);
  if (pendingDocText) {
    pendingDocText = (pendingDocText + '\n\n===== ADDITIONAL DOCUMENT: ' + filename + ' =====\n\n' + clean).substring(0, 60000);
  } else {
    pendingDocText = clean;
  }
  pendingDocNames.push(filename);
  const proc = document.getElementById('sumProcessing');
  if (proc) {
    proc.textContent = pendingDocNames.length > 1
      ? `${pendingDocNames.length} documents loaded (${pendingDocNames.join(', ')}). Click "Auto-generate", or add another document.`
      : `Text extracted from ${filename}. Click "Auto-generate", or add a second document (e.g. the assessment).`;
  }
}

function clearPendingDocs(){
  pendingDocText = null; pendingDocNames = [];
  const proc = document.getElementById('sumProcessing');
  if (proc) proc.textContent = 'Documents cleared. Upload a file to begin.';
  const fn = document.getElementById('sumFilename');
  if (fn) fn.textContent = '';
}

/* ═══════════════════════════════════════════════════════════
   DOCUMENT EXTRACTION
═══════════════════════════════════════════════════════════ */
function ensurePdfWorker() {
  if (!_pdfWorkerPromise) {
    _pdfWorkerPromise = fetch('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js')
      .then(r=>r.blob())
      .then(blob=>{pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(blob);})
      .catch(()=>{});
  }
  return _pdfWorkerPromise;
}

function downloadBlankForm() {
  const form=`ABA CLINICAL PROFILE FORM
Client Summary for Note Generation
Complete once per client · Update when behavior plan is revised

═══════════════════════════════════════════════════════════
1. CLIENT INFORMATION
═══════════════════════════════════════════════════════════

Client name / pseudonym: ___________________________________

Date of current behavior plan: ____________________________

═══════════════════════════════════════════════════════════
2. TARGET MALADAPTIVE BEHAVIORS
(Copy this block as needed for additional behaviors)
═══════════════════════════════════════════════════════════

BEHAVIOR 1
Behavior label / name: ____________________________________
Behavioral function (Attention / Escape / Tangible / Automatic): _______
Operational definition / topography:
___________________________________________________________
___________________________________________________________
Intervention(s) applied (e.g. EXT, DRA, DRI, DRO, FCT, NCR — response blocking only if crisis documented):
___________________________________________________________
Measurement method (e.g. Frequency, Duration, Interval): __

BEHAVIOR 2
Behavior label / name: ____________________________________
Behavioral function: _______________________________________
Operational definition / topography:
___________________________________________________________
___________________________________________________________
Intervention(s) applied:
___________________________________________________________
Measurement method: _______________________________________

BEHAVIOR 3
Behavior label / name: ____________________________________
Behavioral function: _______________________________________
Operational definition / topography:
___________________________________________________________
___________________________________________________________
Intervention(s) applied:
___________________________________________________________
Measurement method: _______________________________________

═══════════════════════════════════════════════════════════
2.1 LIST OF INTERVENTIONS TO APPLY
═══════════════════════════════════════════════════════════

Intervention 1: ___________________________________________
Intervention 2: ___________________________________________
Intervention 3: ___________________________________________
Intervention 4: ___________________________________________
Intervention 5: ___________________________________________

═══════════════════════════════════════════════════════════
3. REPLACEMENT / COMPENSATORY BEHAVIORS
(These are NOT interventions)
═══════════════════════════════════════════════════════════

Replacement behavior — Behavior 1: ________________________
Teaching method (e.g. FCT, DTT, NET, BST, Chaining): ______
Implementation description:
___________________________________________________________

Replacement behavior — Behavior 2: ________________________
Teaching method: __________________________________________
Implementation description:
___________________________________________________________

Replacement behavior — Behavior 3: ________________________
Teaching method: __________________________________________
Implementation description:
___________________________________________________________

═══════════════════════════════════════════════════════════
4. REINFORCEMENT PROGRAMS
═══════════════════════════════════════════════════════════

Primary reinforcers (e.g. Preferred snacks, juice, specific toys):
___________________________________________________________

Secondary / social reinforcers (e.g. Praise, high-five, tablet, token board):
___________________________________________________________

Reinforcement schedule (CRF / FR / VR / FI / VI / Token economy): ___
Current thinning plan (if applicable): ____________________

═══════════════════════════════════════════════════════════
5. PROMPT HIERARCHY
═══════════════════════════════════════════════════════════

Prompts in use (most to least intrusive):
e.g. Full physical → Partial physical → Model → Gestural → Vocal → Independent
___________________________________________________________
___________________________________________________________

Prompt fading strategy (MTL / LTM / Time delay / Graduated guidance): ___
Error correction procedure (e.g. 4-step, No-No prompt, Repeat trial): ___

═══════════════════════════════════════════════════════════
6. ANTECEDENT STRATEGIES & ENVIRONMENTAL MODIFICATIONS
═══════════════════════════════════════════════════════════

Antecedent modifications in place:
___________________________________________________________
___________________________________________________________

═══════════════════════════════════════════════════════════
7. GENERALIZATION TARGETS
═══════════════════════════════════════════════════════════

Settings (e.g. Home, school, community): __________________
People (e.g. BCBA, RBT, parents, teacher): ________________
Materials / stimuli generalization:
___________________________________________________________

═══════════════════════════════════════════════════════════
8. CURRENT PROTOCOL MODIFICATION TOPICS
═══════════════════════════════════════════════════════════

Active modification areas (e.g. Adjusted reinforcement schedule, revised prompt level,
updated operational definition, new behavior added to plan):
___________________________________________________________
___________________________________________________________
___________________________________________________________

═══════════════════════════════════════════════════════════
9. ADDITIONAL CLINICAL NOTES
═══════════════════════════════════════════════════════════

Medical considerations, medication changes, caregiver involvement, session format changes:
___________________________________________________________
___________________________________________________________
___________________________________________________________

═══════════════════════════════════════════════════════════
After completing this form:
Upload it to ABA Clinical Notes Generator → CLIENTS tab
→ select the client → Upload Completed Form → Generate Summary
The app will auto-generate the clinical summary and populate
the behavior chips automatically.
Update this form whenever the behavior plan changes.
═══════════════════════════════════════════════════════════
`;
  const blob=new Blob([form],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='ABA_Clinical_Profile_Form_BLANK.txt'; a.click(); URL.revokeObjectURL(a.href);
}

/* ═══════════════════════════════════════════════════════════
   BACKUP / RESTORE
═══════════════════════════════════════════════════════════ */
function exportBackup() {
  const backup = {
    version:6, exported: new Date().toISOString(),
    analyst: LS.get('aba5_analyst'),
    clients: LS.get('aba5_clients') || [],
    summaries: {}, pools: {}, history: {}
  };
  (LS.get('aba5_clients')||[]).forEach(c => {
    const s = LS.get('aba5_sum_'+c.id);
    const p = LS.get('aba5_pools_'+c.id);
    const h = LS.get('aba5_hist_'+c.id);
    if (s) backup.summaries[c.id] = s;
    if (p) backup.pools[c.id] = p;
    if (h) backup.history[c.id] = h;
  });
  const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href=URL.createObjectURL(blob); a.download=`aba_backup_${date}.json`; a.click(); URL.revokeObjectURL(a.href);
  showMsg('backupMsg','Backup exported.','ok');
}



/* ═══════════════════════════════════════════════════════════
   BACKUP / RESTORE
═══════════════════════════════════════════════════════════ */
function exportBackup() {
  const backup = {
    version:7, exported: new Date().toISOString(),
    therapists: LS.get('aba5_therapists') || [],
    clients: LS.get('aba5_clients') || [],
    summaries: {}, pools: {}, history: {}
  };
  (LS.get('aba5_clients')||[]).forEach(c => {
    const s = LS.get('aba5_sum_'+c.id);
    const p = LS.get('aba5_pools_'+c.id);
    const h = LS.get('aba5_hist_'+c.id);
    if (s) backup.summaries[c.id] = s;
    if (p) backup.pools[c.id] = p;
    if (h) backup.history[c.id] = h;
  });
  const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href=URL.createObjectURL(blob); a.download=`aba_backup_${date}.json`; a.click(); URL.revokeObjectURL(a.href);
  showMsg('backupMsg','Backup exported.','ok');
}

function importBackup(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const b = JSON.parse(e.target.result);
      if (!b.clients) { showMsg('backupMsg','Invalid backup file.','err'); return; }

      // Take an emergency snapshot of the CURRENT state before doing anything.
      // If anything goes wrong, the user can recover from this snapshot.
      _saveEmergencySnapshot('pre-import-' + Date.now());

      // Analyze what the import would do — never silently destroy anything.
      const existingClients = LS.get('aba5_clients') || [];
      const existingIds = new Set(existingClients.map(c => c.id));
      const backupClients = b.clients || [];
      const toUpdate = backupClients.filter(c => existingIds.has(c.id));
      const toAdd = backupClients.filter(c => !existingIds.has(c.id));
      const untouched = existingClients.filter(c => !backupClients.some(bc => bc.id === c.id));

      const exportDate = b.exported ? new Date(b.exported).toLocaleDateString() : 'unknown date';
      const summary =
        `This backup file contains ${backupClients.length} client(s), exported on ${exportDate}.\n\n` +
        `If you continue:\n` +
        `• ${toAdd.length} new client(s) will be ADDED to your current list.\n` +
        `• ${toUpdate.length} existing client(s) will be UPDATED with the backup data.\n` +
        `• ${untouched.length} of your current client(s) will REMAIN UNCHANGED.\n\n` +
        `No clients will be deleted. Continue?`;

      if (!confirm(summary)) {
        showMsg('backupMsg','Restore cancelled — no changes made.','ok');
        input.value='';
        return;
      }

      // Therapist merge (additive, never destructive)
      if (b.therapists && Array.isArray(b.therapists)) {
        const existingTherapistIds = new Set(therapists.map(t => t.id));
        b.therapists.forEach(t => {
          if (!existingTherapistIds.has(t.id)) therapists.push(t);
        });
        LS.set('aba5_therapists', therapists);
      } else if (b.analyst && b.analyst.name) {
        // Older backup format — add the analyst as a therapist if not present
        const existsByName = therapists.find(t => t.name === b.analyst.name);
        if (!existsByName) {
          const t = { id: uid(), name: b.analyst.name, credential: b.analyst.credential||'BCBA' };
          therapists.push(t);
          b.clients = (b.clients||[]).map(c => c.therapistId ? c : {...c, therapistId: t.id});
          LS.set('aba5_therapists', therapists);
        }
      }

      // Client merge — update existing, add new, NEVER delete
      const merged = [...existingClients];
      backupClients.forEach(bc => {
        const idx = merged.findIndex(c => c.id === bc.id);
        if (idx >= 0) merged[idx] = bc;
        else merged.push(bc);
      });
      clients = merged;
      LS.set('aba5_clients', clients);

      // Per-client data — only write if backup has it (don't overwrite existing data with nothing)
      Object.entries(b.summaries||{}).forEach(([id,s])=>{ if(s) LS.set('aba5_sum_'+id,s); });
      Object.entries(b.pools||{}).forEach(([id,p])=>{ if(p) LS.set('aba5_pools_'+id,p); });
      Object.entries(b.history||{}).forEach(([id,h])=>{ if(h) LS.set('aba5_hist_'+id,h); });

      renderTherapistList();
      refreshAllTherapistSelects();
      renderClientList();
      if(typeof refreshGenClientSelect === 'function') refreshGenClientSelect();

      showMsg('backupMsg',
        `Restored safely — ${toAdd.length} added, ${toUpdate.length} updated, ${untouched.length} unchanged. Total: ${clients.length} client(s).`,
        'ok');
    } catch (err) {
      showMsg('backupMsg','Error reading backup: '+err.message,'err');
    }
  };
  r.readAsText(file);
  input.value='';
}

function confirmImportClient() {
  const data = _pendingImport;
  if (!data) return;

  // Verify each critical save actually succeeded — LS.set returns false on failure
  // (e.g. localStorage quota exceeded). Without this check the import would claim
  // success while silently storing nothing.
  const idx = clients.findIndex(c => c.id === data.client.id);
  if (idx >= 0) {
    clients[idx] = data.client;
  } else {
    clients.push(data.client);
  }
  const okClients = LS.set('aba5_clients', clients);

  let okPools = true, okSum = true, okHist = true, okNotes = true;
  if (data.pools) { okPools = LS.set('aba5_pools_' + data.client.id, data.pools); }
  else if (data.behaviors) { okPools = LS.set('aba5_pools_' + data.client.id, data.behaviors); }
  if (data.summary) { okSum = LS.set('aba5_sum_' + data.client.id, data.summary); }
  if (data.history && Object.keys(data.history).length) { okHist = LS.set('aba5_hist_' + data.client.id, data.history); }
  if (data.noteHistory && data.noteHistory.length) { okNotes = LS.set('aba5_notes_' + data.client.id, data.noteHistory); }

  // If any save failed, almost certainly localStorage is full. Roll back the client
  // entry we just added (so we don't leave a half-imported empty client) and tell the user.
  if (!okClients || !okPools || !okSum || !okHist || !okNotes) {
    // Roll back the clients array change
    const rb = clients.findIndex(c => c.id === data.client.id);
    if (rb >= 0 && idx < 0) clients.splice(rb, 1); // only remove if it was newly added
    LS.set('aba5_clients', clients);
    // Clean any partial writes
    LS.del('aba5_pools_' + data.client.id);
    LS.del('aba5_sum_' + data.client.id);
    LS.del('aba5_hist_' + data.client.id);
    LS.del('aba5_notes_' + data.client.id);
    _pendingImport = null;
    closeImportClientModal();
    alert('⚠ No se pudo importar: el almacenamiento del navegador está lleno.\n\n' +
          'localStorage no tiene espacio para este cliente. Para liberar espacio:\n' +
          '• Exporta y elimina clientes que ya no necesites en este dispositivo, o\n' +
          '• Usa el Storage Manager para limpiar datos antiguos.\n\n' +
          'Luego vuelve a intentar la importación. Ningún dato fue modificado.');
    if(typeof renderClientList === 'function') renderClientList();
    return;
  }

  const clientToFix = clients.find(c => c.id === data.client.id);
  if (clientToFix && !therapists.find(t => t.id === clientToFix.therapistId)) {
    if (therapists.length > 0) {
      clientToFix.therapistId = therapists[0].id;
    } else {
      const ph = { id: uid(), name: 'Imported', credential: 'BCBA' };
      therapists.push(ph);
      LS.set('aba5_therapists', therapists);
      clientToFix.therapistId = ph.id;
    }
    LS.set('aba5_clients', clients);
  }
  _pendingImport = null;
  LS.set('aba5_clients', clients);
  closeImportClientModal();
  refreshAllTherapistSelects();
  renderClientList();
  if(typeof refreshGenClientSelect === 'function') refreshGenClientSelect();
  showMsg('clientMsg', 'Cliente "' + data.client.name + '" importado correctamente.', 'ok');
}

let _driveToken   = null;
let _driveFileId  = null;
let _driveSaveTimer = null;
let _driveSaving  = false;

// ── Persist token across page reloads (session only — never stored long-term) ──
function _driveLoadToken(){ _driveToken = sessionStorage.getItem('_gDriveToken')||null; }
function _driveSaveToken(t){ _driveToken=t; sessionStorage.setItem('_gDriveToken',t||''); }

function _driveLoadClientId(){
  const el = document.getElementById('driveClientId');
  if(el){ const saved = LS.get('drive_client_id'); if(saved) el.value=saved; }
}

function _driveUpdateUI(){
  const connected = !!_driveToken;
  const badge = document.getElementById('driveStatusBadge');
  const connectBtn = document.getElementById('driveConnectBtn');
  const syncBtn = document.getElementById('driveSyncBtn');
  const disconnectBtn = document.getElementById('driveDisconnectBtn');
  if(badge){
    badge.style.display = connected ? 'inline-block' : 'none';
    badge.textContent = connected ? '✓ Connected' : '';
    badge.style.cssText += connected
      ? ';background:#d1fae5;color:#065f46'
      : ';background:#fee2e2;color:#991b1b';
  }
  if(connectBtn)  connectBtn.style.display = connected ? 'none' : '';
  if(syncBtn)     syncBtn.style.display = connected ? '' : 'none';
  if(disconnectBtn) disconnectBtn.style.display = connected ? '' : 'none';
}

async function driveConnect(){
  const clientId = LS.get('drive_client_id');
  if(!clientId){
    showMsg('driveMsg','Paste and save your Google Client ID first.','err'); return;
  }
  showMsg('driveMsg','Opening Google sign-in…','warn',0);

  // Load Google Identity Services if not already loaded
  if(!window.google?.accounts?.oauth2){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src=GSI_SRC; s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: async (resp)=>{
      if(resp.error){ showMsg('driveMsg','Sign-in failed: '+resp.error,'err'); return; }
      _driveSaveToken(resp.access_token);
      _driveUpdateUI();
      showMsg('driveMsg','Connected — loading data from Drive…','warn',0);
      await driveLoad();
      showMsg('driveMsg','✓ Connected and synced.','ok');
      _driveAutoSaveSetup();
    }
  }).requestAccessToken();
}

function driveDisconnect(){
  _driveSaveToken(null);
  _driveFileId = null;
  _driveUpdateUI();
  const info = document.getElementById('driveSyncInfo');
  if(info) info.style.display='none';
  showMsg('driveMsg','Disconnected from Google Drive.','ok');
}

async function driveSync(){
  if(!_driveToken){ showMsg('driveMsg','Connect to Google Drive first.','err'); return; }
  const btn=document.getElementById('driveSyncBtn');
  const orig=btn?.textContent;
  if(btn) btn.textContent='Syncing…';
  showMsg('driveMsg','','warn',0);
  try{
    await _drivePush();
    await driveLoad();
    showMsg('driveMsg','✓ Synced successfully.','ok');
  }catch(e){
    showMsg('driveMsg','Sync error: '+e.message,'err');
  }
  if(btn) btn.textContent=orig||'↕ Sync now';
}

// ── Find or create the sync file in Drive ──────────────────────────────────
async function _driveFindOrCreate(){
  if(_driveFileId) return _driveFileId;
  // Search for existing file
  const q=encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const res=await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`,
    {headers:{Authorization:'Bearer '+_driveToken}}
  );
  const d=await res.json();
  if(d.files&&d.files.length){
    _driveFileId=d.files[0].id;
    return _driveFileId;
  }
  // Create new file
  const meta={name:DRIVE_FILE_NAME,mimeType:'application/json'};
  const emptyData=JSON.stringify({version:1,data:{}});
  const boundary='aba_sync_boundary';
  const body=[
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(meta),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    emptyData,
    `--${boundary}--`
  ].join('\r\n');
  const cr=await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {method:'POST',headers:{Authorization:'Bearer '+_driveToken,'Content-Type':`multipart/related; boundary=${boundary}`},body}
  );
  const cd=await cr.json();
  _driveFileId=cd.id;
  return _driveFileId;
}

// ── Push local data to Drive ───────────────────────────────────────────────
async function _drivePush(){
  if(!_driveToken) return;
  _driveSaving=true;
  try{
    const fileId=await _driveFindOrCreate();
    const payload=_driveCollectAllData();
    const res=await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {method:'PATCH',headers:{Authorization:'Bearer '+_driveToken,'Content-Type':'application/json'},
       body:JSON.stringify(payload)}
    );
    if(!res.ok) throw new Error('Drive write failed: '+res.status);
    const now=new Date().toLocaleTimeString();
    const info=document.getElementById('driveSyncInfo');
    if(info){ info.style.display='block'; info.textContent='Last synced: '+now; }
  }finally{ _driveSaving=false; }
}

// ── Pull Drive data and merge into localStorage ────────────────────────────
async function driveLoad(){
  if(!_driveToken) return;
  const fileId=await _driveFindOrCreate();
  const res=await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {headers:{Authorization:'Bearer '+_driveToken}}
  );
  if(!res.ok) return;
  const payload=await res.json();
  _driveApplyData(payload);
  renderTherapistList();
  refreshAllTherapistSelects();
  renderClientList();
  if(typeof refreshGenClientSelect==='function') refreshGenClientSelect();
  if(typeof refreshMthClientSelect==='function') refreshMthClientSelect();
}

// ── Collect all app data into one object ──────────────────────────────────
function _driveCollectAllData(){
  const data={
    version:2,
    savedAt:new Date().toISOString(),
    therapists: LS.get('aba5_therapists')||[],
    clients:    LS.get('aba5_clients')||[],
    summaries:{}, pools:{}, history:{}, notes:{}, plans:{}, notecnt:{}
  };
  (LS.get('aba5_clients')||[]).forEach(c=>{
    const id=c.id;
    const sum=LS.get('aba5_summary_'+id)||LS.get('aba5_sum_'+id);
    const pool=LS.get('aba5_pools_'+id);
    const hist=LS.get('aba5_hist_'+id);
    const note=LS.get('aba5_notes_'+id);
    const plan=LS.get('aba5_plan_'+id);
    const cnt=LS.get('aba5_notecnt_'+id);
    if(sum) data.summaries[id]=sum;
    if(pool) data.pools[id]=pool;
    if(hist) data.history[id]=hist;
    if(note) data.notes[id]=note;
    if(plan) data.plans[id]=plan;
    if(cnt)  data.notecnt[id]=cnt;
  });
  return data;
}

// ── Apply Drive data to localStorage ──────────────────────────────────────
function _driveApplyData(payload){
  if(!payload||!payload.clients) return;
  // Merge: Drive data wins for all keys
  LS.set('aba5_therapists', payload.therapists||[]);
  LS.set('aba5_clients',    payload.clients||[]);
  therapists = payload.therapists||[];
  clients    = payload.clients||[];
  Object.entries(payload.summaries||{}).forEach(([id,v])=>{ LS.set('aba5_summary_'+id,v); LS.set('aba5_sum_'+id,v); });
  Object.entries(payload.pools||{}).forEach(([id,v])=>LS.set('aba5_pools_'+id,v));
  Object.entries(payload.history||{}).forEach(([id,v])=>LS.set('aba5_hist_'+id,v));
  Object.entries(payload.notes||{}).forEach(([id,v])=>LS.set('aba5_notes_'+id,v));
  Object.entries(payload.plans||{}).forEach(([id,v])=>LS.set('aba5_plan_'+id,v));
  Object.entries(payload.notecnt||{}).forEach(([id,v])=>LS.set('aba5_notecnt_'+id,v));
}

// ── Auto-save: push to Drive 3s after any localStorage change ─────────────
function _driveAutoSaveSetup(){
  const origSet=LS.set.bind(LS);
  LS.set=function(k,v){
    origSet(k,v);
    if(_driveToken && !_driveSaving){
      clearTimeout(_driveSaveTimer);
      _driveSaveTimer=setTimeout(()=>_drivePush().catch(console.warn), 3000);
    }
  };
}
