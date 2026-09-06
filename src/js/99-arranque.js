(function init(){
  document.getElementById('genDate').value = '';  // start blank — never inherit/assume a date
  // Some browsers re-fill date inputs from their own history AFTER load — clear again
  // on the next tick and after a short delay to defeat that autofill.
  setTimeout(()=>{ const g=document.getElementById('genDate'); if(g) g.value=''; }, 0);
  setTimeout(()=>{ const g=document.getElementById('genDate'); if(g) g.value=''; }, 300);

  // Persistent guard: until the user actively interacts with the date field,
  // any value the BROWSER injects (autofill/history) is wiped. Once the user
  // focuses or types in the field, the guard stops and the user's value sticks.
  (function _guardDateField(){
    const g = document.getElementById('genDate');
    if(!g) return;
    let userTouched = false;
    const markTouched = ()=>{ userTouched = true; };
    g.addEventListener('focus', markTouched);
    g.addEventListener('input', markTouched);
    g.addEventListener('change', markTouched);
    // Poll briefly after load: if a value appears without the user touching it, clear it.
    let ticks = 0;
    const iv = setInterval(()=>{
      ticks++;
      if(userTouched){ clearInterval(iv); return; }
      if(g.value){ g.value = ''; }
      if(ticks > 20){ clearInterval(iv); } // stop after ~3s
    }, 150);
  })();

  const _now=new Date(); const _mthPeriodEl=document.getElementById('mthPeriod'); if(_mthPeriodEl) _mthPeriodEl.value=_now.getFullYear()+'-'+String(_now.getMonth()+1).padStart(2,'0');
  setTimeout(updateOPPrompt, 100);
  buildDurOptions('dur97153','', true, true);
  buildDurOptions('dur97155','', false, true);
  buildDurOptions('dur97156','', false, true);
  buildDurOptions('durSup','', false, true);
  renderApiBanner();
  renderTherapistList();
  refreshAllTherapistSelects();
  // Google Drive sync init
  _driveLoadClientId();
  _driveLoadToken();
  if(_driveToken){ _driveUpdateUI(); _driveAutoSaveSetup(); driveLoad().catch(()=>{ _driveSaveToken(null); _driveUpdateUI(); }); }
  onNoteCheckChange('97153');
  onNoteCheckChange('97155');
  onNoteCheckChange('97156');
  onNoteCheckChange('sup');
  if(document.getElementById('chk97155')?.checked) randomizeSessionTemplate();
  try {
    const noteViewer = document.getElementById('noteViewerModal');
    if(noteViewer) {
      noteViewer.addEventListener('click',function(e){
        if(e.target===this) closeNoteViewer();
      });
    }
    const sessionReview = document.getElementById('sessionReviewModal');
    if(sessionReview) {
      sessionReview.addEventListener('click',function(e){
        if(e.target===this) closeSessionReview();
      });
    }
  } catch(error) {
    console.warn('Modal initialization warning:', error);
  }

  const bItems=[
    'Treatment targets','Treatment goals','Observation and/or measurement',
    'Reinforcers','Reinforcer delivery','Prompts',
    'Instruction','Materials','Discriminative stimuli',
    'Contextual variables'
  ];
  const bContainer=document.getElementById('casp_B_items');
  if(bContainer) bContainer.innerHTML=bItems.map(item=>`
    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2);cursor:pointer;line-height:1.3">
      <input type="checkbox" class="casp_B_item" value="${item}" style="accent-color:var(--blue);flex-shrink:0">${item}
    </label>`).join('');

  const cItems=[
    'Implementing the protocol with the client while the technician observed, then having the technician implement the protocol with the client while the QHP observed.',
    'Correcting errors made during implementation of the adaptive behavior protocols.',
    'Modeling of correct implementation of the protocol.',
    'Training of the technician to implement a modified protocol.',
    "Providing feedback/instruction regarding the technician's implementation of the protocol.",
    'Observing and recording sample(s) of target behavior(s) independently of technician to check interobserver agreement and identify any need to retrain technician on behavioral definition(s) and recording procedures or revise those.',
    'Other'
  ];
  const cContainer=document.getElementById('casp_C_items');
  if(cContainer) cContainer.innerHTML=cItems.map(item=>`
    <label style="display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--text2);cursor:pointer;line-height:1.4">
      <input type="checkbox" class="casp_C_item" value="${item}" onchange="onCaspChange()" style="accent-color:var(--blue);flex-shrink:0;margin-top:1px">${item}
    </label>`).join('');

  // ── ANALYST tab init (97155 only) ──────────────────────────────
  buildDurOptions('anDur97155','2 hours', false, true);  // admite "Not specified": la supervision no siempre cubre toda la sesion
  const anBContainer=document.getElementById('anCasp_B_items');
  if(anBContainer) anBContainer.innerHTML=bItems.map(item=>`
    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2);cursor:pointer;line-height:1.3">
      <input type="checkbox" class="anCasp_B_item" value="${item}" style="accent-color:var(--blue);flex-shrink:0">${item}
    </label>`).join('');
  const anCContainer=document.getElementById('anCasp_C_items');
  if(anCContainer) anCContainer.innerHTML=cItems.map(item=>`
    <label style="display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--text2);cursor:pointer;line-height:1.4">
      <input type="checkbox" class="anCasp_C_item" value="${item}" style="accent-color:var(--blue);flex-shrink:0;margin-top:1px">${item}
    </label>`).join('');
  const protoModItems=[
    'Treatment targets and goals',
    'Prompting systems',
    'Reinforcement systems',
    'Instructional procedures',
    'Antecedent strategies and preventive procedures',
    'Consequence-based procedures',
    'Discriminative stimuli (SDs) and instructional cues',
    'Materials and stimuli used during instruction',
    'Data collection and measurement systems',
    'Generalization programming',
    'Maintenance programming',
    'Environmental/contextual variables',
    'Treatment integrity / implementation fidelity'
  ];
  const anPMContainer=document.getElementById('anProtoMod_items');
  if(anPMContainer) anPMContainer.innerHTML=protoModItems.map(item=>`
    <label style="display:flex;align-items:flex-start;gap:6px;font-size:11px;color:var(--text2);cursor:pointer;line-height:1.35">
      <input type="checkbox" class="anProtoMod_item" value="${item}" onchange="onAnalystProtoModChange()" style="accent-color:#7c3aed;flex-shrink:0;margin-top:1px">${item}
    </label>`).join('');
  refreshAnalystTherapistSelect();
}());
