function onCredChange() {
  // Only updates UI panels — does NOT call refreshGenClientSelect or renderClientList
  // (those would cause infinite recursion via onGenClientChange → onCredChange)
  const clientId = document.getElementById('genClientSel')?.value;
  const rbt = clientId ? isRBTTherapist(getTherapistForClient(clientId)?.id || '') : false;
  // In RBT mode (97153), supervisor is never present — hide and uncheck the option
  const supRow = document.getElementById('pSupervisorRow');
  const supChk = document.getElementById('pSupervisor');
  if (supRow) supRow.style.display = rbt ? 'none' : '';
  if (supChk && rbt) { supChk.checked = false; delete supChk.dataset.manuallySet; }
  const bcbaMode  = document.getElementById('bcbaModePanel');
  const rbtMode   = document.getElementById('rbtModePanel');
  const bcbaNotes = document.getElementById('bcbaNotesSection');
  const rbt153    = document.getElementById('nsr97153');
  if (bcbaMode)  bcbaMode.style.display  = rbt ? 'none' : 'block';
  if (rbtMode)   rbtMode.style.display   = rbt ? 'block' : 'none';
  if (bcbaNotes) bcbaNotes.style.display = rbt ? 'none' : 'block';
  if (rbt153)    rbt153.style.display    = rbt ? 'flex' : 'none';
  const sessPanel = document.getElementById('sessPanel97155');
  if (sessPanel) sessPanel.style.display = rbt ? 'none' : 'block';
  // Update supervision type labels
  const t = getTherapistForClient(clientId || '');
  const cred = t ? t.credential : 'BCBA';
  const sup1 = document.getElementById('srt-rbt');
  const sup2 = document.getElementById('srt-bcaba');
  const sup3 = document.getElementById('srt-direct');
  if (!rbt) {
    if (sup1) sup1.innerHTML = `<input type="radio" name="supType" value="rbt" onchange="onSupTypeChange()"> ${cred} → RBT`;
    if (sup2) sup2.innerHTML = `<input type="radio" name="supType" value="bcaba" onchange="onSupTypeChange()"> ${cred} → BCaBA`;
    if (sup3) sup3.innerHTML = `<input type="radio" name="supType" value="direct" onchange="onSupTypeChange()"> ${cred} direct`;
    // A BCaBA can only supervise an RBT or work directly — NOT supervise another BCaBA.
    // Hide the "BCaBA → BCaBA" option when the provider is a BCaBA.
    if (sup2) sup2.style.display = (cred === 'BCaBA') ? 'none' : '';
    // If the now-hidden option was selected, fall back to RBT.
    const bcabaRadio = document.querySelector('input[name="supType"][value="bcaba"]');
    if (cred === 'BCaBA' && bcabaRadio && bcabaRadio.checked) {
      const rbtRadio = document.querySelector('input[name="supType"][value="rbt"]');
      if (rbtRadio) rbtRadio.checked = true;
    }
    const checked = document.querySelector('input[name="supType"]:checked');
    if (!checked) { const r = document.querySelector('input[name="supType"][value="rbt"]'); if (r) r.checked = true; }
    if (typeof onSupTypeChange === 'function') { try { onSupTypeChange(); } catch(e){} }
  }
}

function onSupTypeChange(){
  const sup=getSupType();
  // Update radio labels style
  ['rbt','bcaba','direct'].forEach(v=>{
    const lbl=document.getElementById('srt-'+v);
    if(lbl)lbl.classList.toggle('active',v===sup);
  });
  // Update note labels
  const lbl97155=document.getElementById('lbl97155');
  if(lbl97155){
    if(sup==='rbt')lbl97155.textContent='Behavior Treatment with Protocol Modification — RBT';
    else if(sup==='bcaba')lbl97155.textContent='Behavior Treatment with Protocol Modification — BCaBA';
    else lbl97155.textContent='Behavior Treatment with Protocol Modification — BCBA Direct';
  }
  const lblSup=document.getElementById('lblSup');
  if(lblSup){
    const supLabel=sup==='bcaba'?'BCaBA':'RBT';
    lblSup.textContent=`Supervision Log — ${supLabel}`;
    const nsrSup=document.getElementById('nsrSup');
    if(nsrSup){
      nsrSup.style.opacity=sup==='direct'?'0.4':'1';
      nsrSup.style.pointerEvents=sup==='direct'?'none':'';
      if(sup==='direct'){document.getElementById('chkSup').checked=false;onNoteCheckChange('sup');}
    }
  }
  // Disable CASP Section C when direct — no technician present
  const chkC = document.getElementById('casp_C');
  const caspCDetail = document.getElementById('casp_C_detail');
  const caspCBlock = chkC ? chkC.closest('div') : null;
  const caspCWrapper = caspCBlock ? caspCBlock.parentElement : null;
  // Technician participant checkbox — not present in a direct BCBA session
  const pTech = document.getElementById('pTechnician');
  if(sup==='direct'){
    if(chkC){ chkC.checked=false; chkC.disabled=true; }
    if(caspCDetail){ caspCDetail.style.display='none'; }
    if(caspCWrapper){ caspCWrapper.style.opacity='0.4'; caspCWrapper.style.pointerEvents='none'; caspCWrapper.title='Not applicable: no technician is present in a direct BCBA session.'; }
    // Uncheck and disable the Technician participant — direct session has no technician
    if(pTech){ pTech.checked=false; pTech.disabled=true; const lab=pTech.closest('label'); if(lab){ lab.style.opacity='0.4'; lab.title='No technician is present in a direct BCBA session.'; } if(typeof onParticipantsChange==='function'){ try{ onParticipantsChange(); }catch(e){} } }
  } else {
    if(chkC){ chkC.disabled=false; }
    if(caspCWrapper){ caspCWrapper.style.opacity=''; caspCWrapper.style.pointerEvents=''; caspCWrapper.title=''; }
    // Re-enable the Technician participant for non-direct sessions
    if(pTech){ pTech.disabled=false; const lab=pTech.closest('label'); if(lab){ lab.style.opacity=''; lab.title=''; } if(!pTech.checked && !pTech.dataset.manuallySet){ pTech.checked=true; if(typeof onParticipantsChange==='function'){ try{ onParticipantsChange(); }catch(e){} } } }
  }
  // Show/hide BCaBA supervision card (only for bcaba supType)
  const bcabaSupCard = document.getElementById('bcabaSupCard97155');
  if(bcabaSupCard){
    if(sup==='bcaba'){
      bcabaSupCard.style.display='block';
      // Populate checkboxes if not yet populated
      const compHost = document.getElementById('bcabaSupComp97155');
      if(compHost && !compHost.innerHTML.trim()){
        _populateBcabaSupCheckboxes('bcabaSupComp97155', BCABA_SUP_COMPONENTS, 'bcabaSupComp_item');
        _populateBcabaSupCheckboxes('bcabaSupTask97155', BCABA_TASK_LIST, 'bcabaSupTask_item');
        _populateBcabaSupCheckboxes('bcabaSupEval97155', BCABA_EVALUATION, 'bcabaSupEval_item');
        const clientId = document.getElementById('clientSel')?.value || '';
        _autoSelectBcabaSup(clientId, '');
      }
    } else {
      bcabaSupCard.style.display='none';
    }
  }
  // NOTE: autoSuggestParticipants() disabled - user controls participants manually
  // Update participant suggestions — direct mode has no technician
  // autoSuggestParticipants();
  // Hide session template panel for direct mode — no technician to direct
  if(document.getElementById('chk97155')?.checked){
    const panel=document.getElementById('sessPanel97155');
    const sup=getSupType();
    if(panel) panel.classList.toggle('open', sup!=='direct');
    if(sup==='direct'){ _currentSessTmpl=null; }
    else if(sup!=='direct'){ randomizeSessionTemplate(); }
  }
}

function onCaspChange(){
  // Show/hide sub-details when section is checked
  ['A','B','C','D'].forEach(s=>{
    const chk=document.getElementById('casp_'+s);
    const det=document.getElementById('casp_'+s+'_detail');
    if(chk && det) det.style.display=chk.checked?'block':'none';
  });

  // ── CONTRADICTION DETECTION ──────────────────────────────────
  const A = document.getElementById('casp_A')?.checked;
  const Aresult = document.querySelector('input[name="casp_A_result"]:checked')?.value||'ok';
  const B = document.getElementById('casp_B')?.checked;
  const sup = getSupType();

  let warnings = [];

  // 1. A says "no adjustments" — DISABLE and uncheck B, it's logically impossible
  if(A && Aresult==='ok'){
    const chkB = document.getElementById('casp_B');
    const detB = document.getElementById('casp_B_detail');
    if(chkB){
      chkB.checked = false;
      chkB.disabled = true;
      if(detB) detB.style.display = 'none';
    }
    // Also uncheck D "Testing of a modified protocol" — no adjustments = no modified protocol
    document.querySelectorAll('.casp_D_item').forEach(function(chk){
      if(chk.value && chk.value.toLowerCase().includes('modified')){
        chk.checked = false;
        chk.disabled = true;
        chk.parentElement.style.opacity = '.45';
        chk.parentElement.title = 'Not applicable: Section A indicates no adjustments were made, so there is no modified protocol to test.';
      }
    });
    warnings.push({
      target:'B',
      msg:'Section A: protocol functioning effectively — no adjustments indicated. Section B is disabled (no adjustments to document). "Testing of a modified protocol" in Section D is also disabled — if no adjustments were made, there is no modified protocol.'
    });
  } else {
    const chkB = document.getElementById('casp_B');
    if(chkB) chkB.disabled = false;
    // Re-enable D items
    document.querySelectorAll('.casp_D_item').forEach(function(chk){
      chk.disabled = false;
      chk.parentElement.style.opacity = '';
      chk.parentElement.title = '';
    });
  }

  // 2. A says "adjustments required" but B is not checked
  if(A && Aresult==='adj' && !B){
    warnings.push({
      target:'A',
      msg:'Section A indicates adjustments were required. Consider checking Section B to document what was changed.'
    });
  }

  // 3. C (active direction to technician) in direct mode
  if(B && sup==='direct'){
    warnings.push({
      target:'C',
      msg:'Note: Active direction to a technician is not applicable in a BCBA direct session (no technician present). Section C has been unchecked.'
    });
    const chkC = document.getElementById('casp_C');
    if(chkC){ chkC.checked=false; document.getElementById('casp_C_detail').style.display='none'; }
  }

  // 4. CASP C VALIDATION — Protocol vs Modified Protocol contradictions
  const caspC = document.getElementById('casp_C')?.checked;
  
  if(caspC){
    const caspCitems = [...document.querySelectorAll('.casp_C_item')];
    
    // "Training on modified protocol" requires Section B
    caspCitems.forEach(item => {
      const value = item.value.toLowerCase();
      const label = item.parentElement;
      
      if(value.includes('training') && value.includes('modified')){
        if(!B){
          item.checked = false;
          item.disabled = true;
          label.style.opacity = '0.45';
          label.title = 'Not available: Training on modified protocol requires Section B (adjustments made). No modified protocol exists without adjustments.';
        } else {
          item.disabled = false;
          label.style.opacity = '';
          label.title = '';
        }
      }
    });
    
    // Visual warning for protocol vs modified protocol conflicts  
    const trainingModified = caspCitems.some(item => 
      item.checked && 
      item.value.toLowerCase().includes('training') && 
      item.value.toLowerCase().includes('modified')
    );
    
    if(trainingModified){
      // Highlight potential conflicts with original protocol activities
      caspCitems.forEach(item => {
        const value = item.value.toLowerCase();
        if(item.checked && 
           (value.includes('implementing the protocol') || 
            value.includes('modeling') || 
            value.includes('correcting errors')) && 
           !value.includes('modified')){
          item.parentElement.style.backgroundColor = '#fef3c7';
          item.parentElement.title = 'CAUTION: This focuses on original protocol, but "training on modified protocol" is also selected. Verify this combination is intentional.';
        }
      });
    } else {
      // Clear warnings when training modified is not selected
      caspCitems.forEach(item => {
        if(!item.disabled){
          item.parentElement.style.backgroundColor = '';
          if(!item.parentElement.title.includes('Not available')){
            item.parentElement.title = '';
          }
        }
      });
    }
  }

  // Render warnings
  let warnEl = document.getElementById('caspConflictWarning');
  if(!warnEl){
    warnEl = document.createElement('div');
    warnEl.id = 'caspConflictWarning';
    warnEl.style.cssText = 'margin-top:8px;border-radius:5px;overflow:hidden';
    const panel = document.getElementById('sessPanel97155');
    if(panel) panel.insertBefore(warnEl, panel.firstChild);
  }

  if(warnings.length){
    warnEl.innerHTML = warnings.map(w=>`
      <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:#fdf0ee;border:1px solid #c0392b;border-radius:5px;margin-bottom:4px">
        <span style="font-size:14px;flex-shrink:0">⚠</span>
        <span style="font-size:11px;color:#c0392b;line-height:1.4">${esc(w.msg)}</span>
      </div>`).join('');
    warnEl.style.display = 'block';
  } else {
    warnEl.innerHTML = '';
    warnEl.style.display = 'none';
  }
}

function getCaspSections(){
  const A = document.getElementById('casp_A')?.checked;
  const Aresult = document.querySelector('input[name="casp_A_result"]:checked')?.value||'ok';
  const B = document.getElementById('casp_B')?.checked;
  const Bitems = B ? [...document.querySelectorAll('.casp_B_item:checked')].map(el=>el.value) : [];
  const C = document.getElementById('casp_C')?.checked;
  const Citems = C ? [...document.querySelectorAll('.casp_C_item:checked')].map(el=>el.value) : [];
  const D = document.getElementById('casp_D')?.checked;
  const Ditems = D ? [...document.querySelectorAll('.casp_D_item:checked')].map(el=>el.value) : [];
  if(!A && !B && !C && !D) return null;
  return {A, Aresult, B, Bitems, C, Citems, D, Ditems};
}

function getCaspSectionPrompts(casp, supLabel, minimalCtx, sessionMal, sessionRep, goalsTxt, clientName, fullNotePrompt){
  if(!casp) return [];
  const active = ['A','B','C','D'].filter(s=>casp[s]);
  if(!active.length) return [];

  /* El parrafo del plan lo firma QUIEN ESCRIBE LA NOTA, y una 97155 la escribe el
     analista. `supLabel` es el SUPERVISADO -RBT o BCaBA-, asi que usarlo aqui
     producia "the RBT plans to modificar el protocolo", que es doblemente falso:
     atribuye el plan a quien no lo decide y pone en boca de un RBT un juicio
     clinico que el propio sistema le prohibe en todas partes.
     El autor de una 97155 es siempre el BCBA, tambien cuando supervisa a un BCaBA. */
  const cred = 'BCBA';
  const supv = 'the BCBA';

  const malList = sessionMal.length ? sessionMal.join(', ') : 'behaviors in clinical context';
  const repList = sessionRep.length ? sessionRep.join(', ') : 'replacement programs in clinical context';
  const prompts = [];

  // TWO PARAGRAPHS per section — focused, explanatory, strictly NO clinical note content
  if(casp.A){
    const outcome = casp.Aresult==='adj'
      ? 'The session observations indicated that the protocol components required adjustments.'
      : 'The session observations indicated that the protocol components were functioning effectively and no adjustments were clinically indicated.';
    prompts.push({ sectionKey:'A', prompt:`${minimalCtx}\n\nWrite EXACTLY 2 short paragraphs for the Face-to-face observations narrative. HARD LIMIT: 180 words maximum across both paragraphs combined. This is a brief supporting section — keep it concise. Do NOT exceed 180 words under any circumstances; if you approach the limit, stop. The detailed clinical content belongs in the separate full note, NOT here.\nParagraph 1: State the observation outcome. Name which specific programs or protocol components were observed and what the observation process involved. ${outcome}\nParagraph 2: Explain the clinical rationale — what specific patterns, data trends, or implementation observations supported this conclusion.\nDO NOT write: behaviors, ABC sequences, interventions, replacement programs, prompts, reinforcers, client responses, or protocol modification details.\nPlain prose. Professional clinical language. Two paragraphs only — no more.\nABSOLUTE PROHIBITION — NO HEADER LINES: Do NOT begin with or include any labeled lines such as "Date:", "Place of Service:", "Duration of services:", "Participants:" or any other header/label. Those belong ONLY to the separate full note. Begin directly with the narrative prose. Flowing paragraphs only — no labels, no lists, no bullet points.\nTHIS IS NOT A SESSION NOTE: Do NOT write session-note content here. Do NOT include frequency counts or episode numbers, ABC sequences, reinforcement schedule details, trial counts, a plan paragraph ("For the next session..."), or any closing statement. All of that belongs ONLY in the separate complete session note. This section is a brief 2-paragraph supporting narrative — nothing more.` });
  }

  if(casp.B){
    const items = casp.Bitems && casp.Bitems.length ? casp.Bitems.join(', ') : 'protocol components';
    prompts.push({ sectionKey:'B', prompt:`${minimalCtx}\n\nWrite EXACTLY 2 short paragraphs for the Protocol adjustments narrative. HARD LIMIT: 180 words maximum across both paragraphs combined. This is a brief supporting section — keep it concise. Do NOT exceed 180 words under any circumstances. Even if many components are listed below, summarize them briefly together — do NOT write a separate detailed passage for each one. The detailed clinical content belongs in the separate full note, NOT here.\nParagraph 1: State which components were adjusted (${items}) and the specific changes made — briefly.\nParagraph 2: Explain the clinical rationale — what observation or data triggered the changes and the expected outcome.\nDO NOT write: full ABC sequences, behavior topographies, replacement program details, client performance data, prompt hierarchies.\nPlain prose. Professional clinical language. Two paragraphs only — no more.\nABSOLUTE PROHIBITION — NO HEADER LINES: Do NOT begin with or include any labeled lines such as "Date:", "Place of Service:", "Duration of services:", "Participants:" or any other header/label. Those belong ONLY to the separate full note. Begin directly with the narrative prose. Flowing paragraphs only — no labels, no lists, no bullet points.\nTHIS IS NOT A SESSION NOTE: Do NOT write session-note content here. Do NOT include frequency counts or episode numbers, ABC sequences, reinforcement schedule details, trial counts, a plan paragraph ("For the next session..."), or any closing statement. All of that belongs ONLY in the separate complete session note. This section is a brief 2-paragraph supporting narrative — nothing more.` });
  }

  if(casp.C){
    const items = casp.Citems && casp.Citems.length ? casp.Citems.join('; ') : 'direction activities';
    prompts.push({ sectionKey:'C', prompt:`${minimalCtx}\n\nWrite EXACTLY 2 short paragraphs for the Active direction narrative. HARD LIMIT: 180 words maximum across both paragraphs combined. This is a brief supporting section — keep it concise. Do NOT exceed 180 words under any circumstances. Even if many direction activities are listed below, summarize them briefly together — do NOT write a separate detailed passage for each one. The detailed clinical content belongs in the separate full note, NOT here.\nParagraph 1: Describe the direction activities (${items}). State what the ${supLabel||'technician'} was implementing, what implementation issue was observed, and what the analyst directed or modeled — briefly.\nParagraph 2: State the outcome — how the ${supLabel||'technician'} adjusted implementation following feedback and why this direction was necessary.\nDO NOT write: full ABC sequences, frequency data, complete behavior descriptions, replacement program implementation details.\nPlain prose. Professional clinical language. Two paragraphs only — no more.\nABSOLUTE PROHIBITION — NO HEADER LINES: Do NOT begin with or include any labeled lines such as "Date:", "Place of Service:", "Duration of services:", "Participants:" or any other header/label. Those belong ONLY to the separate full note. Begin directly with the narrative prose. Flowing paragraphs only — no labels, no lists, no bullet points.\nTHIS IS NOT A SESSION NOTE: Do NOT write session-note content here. Do NOT include frequency counts or episode numbers, ABC sequences, reinforcement schedule details, trial counts, a plan paragraph ("For the next session..."), or any closing statement. All of that belongs ONLY in the separate complete session note. This section is a brief 2-paragraph supporting narrative — nothing more.` });
  }

  if(casp.D){
    const items = casp.Ditems && casp.Ditems.length ? casp.Ditems.join('; ') : 'client progress';
    prompts.push({ sectionKey:'D', prompt:`${minimalCtx}\n\nWrite EXACTLY 2 short paragraphs for the QHP implementation narrative. HARD LIMIT: 180 words maximum across both paragraphs combined. This is a brief supporting section — keep it concise. Do NOT exceed 180 words under any circumstances. Even if many items are listed below, summarize them briefly together — do NOT write a separate detailed passage for each one. The detailed clinical content belongs in the separate full note, NOT here.\nParagraph 1: Describe what the analyst implemented directly with the client, related to: ${items}. State the specific protocols applied and the clinical purpose — briefly.\nParagraph 2: State the client's observable response to the analyst's direct implementation and the clinical implications.\nDO NOT write: full ABC sequences, replacement program details, complete protocol modification documentation.\nPlain prose. Professional clinical language. Two paragraphs only — no more.\nABSOLUTE PROHIBITION — NO HEADER LINES: Do NOT begin with or include any labeled lines such as "Date:", "Place of Service:", "Duration of services:", "Participants:" or any other header/label. Those belong ONLY to the separate full note. Begin directly with the narrative prose. Flowing paragraphs only — no labels, no lists, no bullet points.\nTHIS IS NOT A SESSION NOTE: Do NOT write session-note content here. Do NOT include frequency counts or episode numbers, ABC sequences, reinforcement schedule details, trial counts, a plan paragraph ("For the next session..."), or any closing statement. All of that belongs ONLY in the separate complete session note. This section is a brief 2-paragraph supporting narrative — nothing more.` });
  }

  // ONE complete clinical note at the end
  const sectionSummaries = active.map(s=>({
    A:'face-to-face observations', B:'protocol adjustments',
    C:`active direction to the ${supLabel||'technician'}`, D:'QHP direct implementation'
  }[s])).join(', ');

  const noteBase = fullNotePrompt || minimalCtx;
  const noModification = casp.A && casp.Aresult === 'ok';
  const protocolModConstraint = noModification
    ? '\nPROTOCOL MODIFICATION CONSTRAINT: Session goals indicate protocol components were functioning effectively and NO adjustments were indicated. DO NOT document any protocol modification in the note body.'
    : '';
  const protocolModLine = noModification ? '' : '\n- Protocol modification: area, triggering observation, change, rationale, expected outcome';
  prompts.push({ sectionKey:'NOTE', prompt:`${noteBase}\n\n${CAREGIVER_ROLE_97155_RULE}${protocolModConstraint}\n\nThis session included: ${sectionSummaries}.\n\nWrite ONE unified CPT-97155 session note covering all clinical content. CRITICAL: Length must be sufficient to document ALL clinical data provided — do not truncate or abbreviate behaviors, BASP sections, or clinical details to meet an artificial word limit. Write as many paragraphs as needed to cover all content thoroughly. Include:\n- Opening sentence referencing session activities (1 sentence)\n- Place of service, date, duration, participants\n- For each maladaptive behavior (${malList}): ABC, exact frequency count, intervention, effectiveness phrase\n- For each replacement behavior (${repList}): teaching method, prompt type and fading, reinforcement schedule, and the client's qualitative observable response. TRIAL COUNTS: include numeric trial counts (opportunities / independent / prompted) ONLY if those exact figures were explicitly provided in the session data; if not provided, describe the response qualitatively with NO numbers and NEVER invent X-of-Y ratios, occasion counts, or second/minute durations${protocolModLine}\n- Reinforcers used\n- MANDATORY FINAL PARAGRAPH (60–80 words, separate): Observable client response — prompt dependency, frequency vs. prior session, latency or accuracy trend. No emotional language.\n- PLAN PARAGRAPH (mandatory final clinical paragraph — BEFORE the closing sentence): Based on the session data documented above, state specifically what the analyst plans to address, modify, or implement in the next session. Examples: adjusting the prompt level for a specific program, modifying the reinforcement schedule, introducing a new replacement behavior, conducting a preference assessment, scheduling IOA. Use observable clinical language. Do not use vague phrases like "continue treatment" alone — be specific. Label this paragraph clearly by beginning it with the phrase: "For the next session, ${supv} plans to..." \n\nClosing sentence (AFTER the Plan paragraph): "${AN_CLOSING[Math.floor(Math.random()*AN_CLOSING.length)]}"\n\nPlain paragraphs only. No headers. Florida Medicaid audit-ready.` });

  return prompts;
}


/* ═══════════════════════════════════════════════════════════
   SUP LOG FROM PASTED NOTE
═══════════════════════════════════════════════════════════ */
async function generateSupFromNote(){
  const noteText = (document.getElementById('supFromNoteText').value||'').trim();
  const clientName = (document.getElementById('supFromNoteClient').value||'').trim();
  const supType = document.getElementById('supFromNoteType').value;
  const cred = document.getElementById('supFromNoteCred').value;

  if(!noteText){ showMsg('supFromNoteMsg','Paste a 97155 session note first.','err'); return; }

  const supv = 'the ' + cred;
  const techLabel = supType === 'bcaba' ? 'BCaBA' : 'RBT';
  const clientRef = clientName || 'the client';

  const prompt =
`SOURCE — CPT-97155 session note for ${clientRef}:\n\n${noteText}\n\n---\n\nANALYZE the 97155 session note above. Identify which competencies were directly observable.\n\n${supType === 'bcaba' ? 'CREDENTIAL RULE (ABSOLUTE): the supervisee is a BCaBA. Document against the BACB CONTENT AREAS, never against RBT task codes (A-1, C-3, D-5 and the like): an RBT code in a BCaBA supervision log documents the wrong credential.\n\nBACB CONTENT AREAS - SKILLS COVERED: A. Philosophical Underpinnings | B. Concepts and Principles | C. Measurement, Data Display, and Interpretation | D. Experimental Design | E. Ethics (Professional and Ethical Compliance Code for Behavior Analysts) | F. Behavior Assessment | G. Behavior-Change Procedures | H. Selecting and Implementing Interventions | I. Personnel Supervision and Management\n\nBACB CONTENT AREAS - EVALUATION OF SUPERVISEE PERFORMANCE: A. Behaviorism and Philosophical Foundations | B. Concepts and Principles | C. Measurement, Data Display, and Interpretation | D. Experimental Design | E. Ethical and Professional Issues | F. Behavior Assessment | G. Behavior-Change Procedures | H. Intervention Development and Monitoring | I. Supervisory Relationships\n\nSUPERVISION COMPONENTS COVERED (weave in only those that occurred): Observation of supervisee working with the individual | Observation of supervisee working with caregiver/other provider | Specific recipient discussed | Recipient privacy discussed | Supervisory discussion and feedback | Required documentation reviewed | BACB Task List skills covered\n\nABSOLUTE RULE: Supervisee is exclusively "the BCaBA". NEVER write "the RBT".' : 'RBT TASK LIST: A-1 | A-2 | A-3 | A-5 | A-6 | B-1 | C-3 | C-4 | C-5 | C-9 | C-10 | D-3 | D-4 | D-5 | E-4 | F-2 | F-5'}\n\nWrite a concise Supervision Log (up to 150 words). Two short paragraphs only.\n\nParagraph 1 — Supervisory activities: ${supv} supervised the ${techLabel} during the session with ${clientRef}. Name supervisory methods used. One or two sentences on any specific correction or training provided.\n\nParagraph 2 — Competency assessment: ${supType === 'bcaba' ? 'name the BACB CONTENT AREAS covered, by letter and title, never RBT task codes' : 'list the RBT Task List codes assessed'}. Group them using Audit-Ready Monitoring categories (e.g., Procedural Fidelity, Data Collection & Documentation, Clinical Review). Describe what was observed using technical phrasing (e.g., "Evaluated procedural fidelity via direct observation," "Reviewed data trends and variability"). Close with one sentence on overall performance and any area requiring continued supervisory focus.`;

  const btn = document.getElementById('supFromNoteBtn');
  const sp = document.getElementById('supFromNoteSpinner');
  btn.disabled = true; sp.style.display = 'inline-block';
  showMsg('supFromNoteMsg','','warn',0);

  try {
    const text = await callAPI(prompt, SYS);
    document.getElementById('supFromNoteResult').textContent = text;
    document.getElementById('supFromNoteOutput').style.display = 'block';
    document.getElementById('supFromNoteOutput').scrollIntoView({behavior:'smooth',block:'start'});
    showMsg('supFromNoteMsg','Supervision log generated.','ok');
  } catch(err) {
    showMsg('supFromNoteMsg','Error: ' + err.message, 'err');
  }

  btn.disabled = false; sp.style.display = 'none';
}


/* ═══════════════════════════════════════════════════════════
   ANALYST TAB (analystgen) — CPT-97155 only, 3 modalities
   Self-contained pipeline that reuses the shared pure helpers
   (buildUserPrompt, selectBehaviorsSmart, selectGoalsSmart,
   getCaspSectionPrompts, callAPI, highlightNoteText, makeOutputBlock).
   Differences vs. Generate: no date field, 97155 only, a header
   (Behaviors / Replacements / Protocol Modification) before the body,
   and a reordered tail (Plan → closing sentence → client response LAST).
═══════════════════════════════════════════════════════════ */
let _anRotCtx = null;

function _anPlaceKey(place){
  var p = String(place||'').toLowerCase();
  // Longest key first: "After School" contains "school", and matching the shorter
  // key would hand an after-school session the classroom teacher.
  var keys = Object.keys(AN_PLACE_THIRD_PARTY).sort(function(a,b){ return b.length - a.length; });
  for(var i=0;i<keys.length;i++){ if(p.indexOf(keys[i]) !== -1) return keys[i]; }
  return '';
}

function _anOtherPreset(v){
  var txt = document.getElementById('anPOtherText');
  if(txt && v) txt.value = v;
}

function _anOnPlaceChange(){
  var place = (document.getElementById('anPlace')||{}).value || '';
  var key = _anPlaceKey(place);
  var rule = AN_PLACE_THIRD_PARTY[key];
  var cg = document.getElementById('anPCaregiver');
  var ot = document.getElementById('anPOther');
  var otTxt = document.getElementById('anPOtherText');
  var otBox = document.getElementById('anPOtherInput');
  var hint = document.getElementById('anPlaceHint');
  if(!rule){ if(hint) hint.style.display='none'; return; }

  // Solo se propone mientras el usuario no haya tocado esas casillas.
  var touched = (cg && cg.dataset.manuallySet) || (ot && ot.dataset.manuallySet);
  if(!touched){
    if(cg) cg.checked = rule.caregiver;
    if(rule.other){
      if(ot) ot.checked = true;
      if(otBox) otBox.style.display = 'block';
      if(otTxt && !String(otTxt.value||'').trim()) otTxt.value = rule.other;
    }
  }

  if(hint){
    if(touched && rule.other){
      hint.textContent = 'Lugar «' + place + '»: en este entorno el tercero suele ser ' + rule.other
        + ', no un caregiver. Ajusta las casillas si hace falta.';
      hint.style.display = 'block';
    } else if(rule.other){
      hint.textContent = 'Ajustado al lugar: ' + rule.other + ' en vez de caregiver. Cámbialo si no es así.';
      hint.style.display = 'block';
    } else { hint.style.display = 'none'; }
  }
}
function _anUpdateGenBtn(){
  const id=document.getElementById('anClientSel')?.value||'';
  const n=getAnalystProtocolModComponents().length;
  const btn=document.getElementById('anGenBtn');
  if(btn) btn.disabled = !id || n===0;
  const cnt=document.getElementById('anProtoModCount');
  if(cnt) cnt.textContent = n+' selected';
}

/* CLEAR de la pestana ANALYST.

   No estaba roto: hacia otra cosa. Limpiaba los campos de texto y las secciones
   CASP, pero acto seguido RELLENABA otra vez — elegia una meta nueva, rotaba
   conductas, marcaba solo los componentes de modificacion de protocolo y los
   factores de supervision del BCaBA. Y ni tocaba lugar, duracion ni
   participantes. Desde fuera se pulsa Clear, el formulario sigue lleno y parece
   que el boton no responde.

   Un boton llamado Clear limpia. La rotacion de conductas y la seleccion
   automatica pertenecen a la generacion, no al borrado: al dejar _anRotCtx en
   null la proxima nota elige fresco igual, sin necesidad de precargarlo aqui.
   Se conserva a proposito lo que es CONTEXTO y no sesion: terapista y cliente. */
function clearAnalyst(){
  // Campos de texto de la sesion
  ['anEnvChanges','anMedConcerns','anCrisis','anEmergingMal','anEmergingRep','anEmergingInt',
   'anEmergingClinicalNotes','anPrevPlan','anCustomGoals97155','anPOtherText']
    .forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});

  // Lugar y duracion vuelven a su primera opcion
  ['anPlace','anDur97155'].forEach(id=>{
    const el=document.getElementById(id);
    if(el && el.options && el.options.length) el.selectedIndex=0;
  });
  if(typeof _anOnPlaceChange==='function'){ try{ _anOnPlaceChange(); }catch(e){} }

  // Participantes: vuelven al estado inicial de la pestana
  [['anPClient',true],['anPSupervisor',true],['anPTechnician',true],['anPCaregiver',true],['anPOther',false]]
    .forEach(([id,def])=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.checked=def;
      if(el.dataset) el.dataset.manuallySet='';
    });
  const _oPre=document.getElementById('anPOtherPreset'); if(_oPre) _oPre.selectedIndex=0;
  const _oIn=document.getElementById('anPOtherInput'); if(_oIn) _oIn.style.display='none';

  // Secciones CASP
  ['anCasp_A','anCasp_B','anCasp_C','anCasp_D'].forEach(id=>{const el=document.getElementById(id); if(el) el.checked=false;});
  document.querySelectorAll('.anCasp_B_item:checked,.anCasp_C_item:checked,.anCasp_D_item:checked').forEach(c=>c.checked=false);
  const aOk=document.querySelector('input[name="anCasp_A_result"][value="ok"]'); if(aOk) aOk.checked=true;
  if(typeof onAnalystCaspChange==='function'){ try{ onAnalystCaspChange(); }catch(e){} }

  // Modificacion de protocolo y factores de supervision del BCaBA: se DESMARCAN.
  // Antes se marcaban solos, que es lo contrario de limpiar.
  document.querySelectorAll('.anProtoMod_item:checked,.anBcabaSupComp_item:checked,.anBcabaSupTask_item:checked,.anBcabaSupEval_item:checked')
    .forEach(c=>{c.checked=false;});

  // La rotacion se reinicia: la proxima generacion elige fresco.
  _anRotCtx=null;

  if(typeof _anUpdateGenBtn==='function'){ try{ _anUpdateGenBtn(); }catch(e){} }
  const out=document.getElementById('anOutputsContainer'); if(out) out.innerHTML='';
  // Confirmacion visible: sin ella, un boton que limpia campos ya vacios parece muerto.
  if(typeof showMsg==='function') showMsg('anMsg','Formulario de sesión limpiado. Se conservan el terapista y el cliente seleccionados.','ok');
}

// ── PROTOCOL MODIFICATION REFERENCE DATA ─────────────────────────────────────
// Maps each selectable component to its possible sub-modifications.
// These are injected as reference context into the note prompt so the model
// uses precise, audit-ready clinical language when describing what was changed.
const PROTO_MOD_DETAIL = {
  'Treatment targets and goals': [
    'New targets were added following mastery of current targets',
    'New exemplars were added to existing targets',
    'Active targets were reduced based on performance',
    'Targets were paused due to lack of readiness',
    'Target sequence was modified to address prerequisite skills',
    'Mastery criteria were adjusted',
    'Generalization criteria were added or revised',
    'Maintenance criteria were added or revised'
  ],
  'Prompting systems': [
    'Prompt level was increased',
    'Prompt level was faded',
    'Prompt hierarchy was modified',
    'Prompt delay was introduced',
    'Prompt delay was increased',
    'Prompt dependency was reduced',
    'Prompting procedures were standardized across staff'
  ],
  'Reinforcement systems': [
    'Reinforcer type was modified',
    'New reinforcers were introduced',
    'Reinforcement schedule was adjusted',
    'Reinforcement schedule was thinned',
    'Reinforcement magnitude was adjusted',
    'Reinforcement duration was adjusted',
    'Reinforcement was delivered with increased immediacy',
    'Reinforcement delivery consistency was improved',
    'Behavior-specific praise was increased',
    'Reinforcement contingencies were adjusted for alternative responses'
  ],
  'Instructional procedures': [
    'Teaching format was modified',
    'Task analysis was introduced',
    'Task analysis was modified',
    'Chaining procedure was modified',
    'Error correction procedure was modified',
    'Instructional pacing was adjusted',
    'Number of learning opportunities was increased',
    'Independent responding opportunities were increased',
    'Instruction was shifted to a more structured context',
    'Instruction was shifted to a more naturalistic context'
  ],
  'Antecedent strategies and preventive procedures': [
    'Visual supports were introduced',
    'Visual supports were modified',
    'Priming procedures were introduced',
    'Task demands were reduced',
    'Task demands were increased',
    'Choice-making opportunities were introduced',
    'Behavioral momentum procedures were introduced',
    'Environmental triggers were reduced',
    'NCR was modified',
    'HPS was modified',
    'Task difficulty was increased',
    'Task difficulty was reduced',
    'Response requirements were increased',
    'Response requirements were reduced',
    'Number of required responses was adjusted'
  ],
  'Consequence-based procedures': [
    'Differential reinforcement procedures were modified',
    'Reinforcement for alternative responses was increased',
    'Extinction procedures were modified',
    'Planned ignoring procedures were modified',
    'Redirection procedures were modified',
    'Response interruption procedures were modified',
    'Response blocking procedures were modified',
    'Consequence delivery was standardized across staff'
  ],
  'Discriminative stimuli (SDs) and instructional cues': [
    'Instructions were simplified',
    'Instructions were clarified',
    'SD presentation was standardized across staff',
    'Visual cues were added',
    'Gestural cues were added',
    'Competing stimuli were reduced'
  ],
  'Materials and stimuli used during instruction': [
    'Materials were replaced',
    'Materials were modified to increase engagement',
    'Stimuli complexity was adjusted',
    'Number of stimuli presented was adjusted',
    'Novel stimuli were introduced'
  ],
  'Data collection and measurement systems': [
    'Measurement system was modified',
    'Operational definitions were refined',
    'Data collection consistency was improved',
    'Generalization probes were added',
    'Maintenance probes were added',
    'Independence tracking was added'
  ],
  'Generalization programming': [
    'Generalization across settings was introduced',
    'Generalization across people was introduced',
    'Generalization across stimuli was introduced',
    'Opportunities for natural environment use were increased'
  ],
  'Maintenance programming': [
    'Maintenance schedule was adjusted',
    'Previously mastered targets were probed'
  ],
  'Environmental/contextual variables': [
    'Physical setting was modified',
    'Environmental distractions were reduced',
    'Session structure was adjusted',
    'Number of people present was modified',
    'Transitions between activities were adjusted'
  ],
  'Treatment integrity / implementation fidelity': [
    'Correct implementation was modeled',
    'Implementation errors were corrected in real time',
    'Performance feedback was provided',
    'Supervisee was retrained on procedures',
    'Implementation expectations were clarified'
  ]
};

// ── ANALYST OPENING SENTENCE POOLS ───────────────────────────────────────────
const AN_OPENING_RBT = [
  'The BCBA conducted direct observation of the RBT\'s session delivery, providing real-time corrective feedback and evaluating implementation fidelity against the current treatment protocols.',
  'Supervisory oversight was provided through direct observation of the RBT\'s service delivery, with clinical direction focused on implementation accuracy and protocol adherence.',
  'Direct observation of ABA service delivery was conducted by the BCBA, including performance assessment of the RBT and real-time guidance on procedural implementation.',
  'The BCBA provided active supervisory direction to the RBT, observing session activities and delivering targeted corrective feedback to support implementation fidelity.',
  'Supervisory services included direct observation of the RBT\'s implementation, procedural fidelity review, and corrective direction to address observed deviations from the treatment plan.',
  'The BCBA observed the delivery of ABA services, evaluated the RBT\'s implementation against current protocol specifications, and provided immediate corrective guidance where indicated.',
  'Clinical oversight was provided by the BCBA through structured observation of the RBT\'s session delivery, with real-time direction focused on technical accuracy and therapeutic consistency.',
  'The BCBA carried out active supervision of the RBT\'s intervention delivery, assessing procedural fidelity and directing the RBT in key aspects of protocol implementation.',
  'Supervisory contact was established through direct observation of the RBT\'s service delivery, with corrective feedback and protocol guidance provided throughout the session.',
  'The BCBA reviewed client progress in replacement skill acquisition and maladaptive behavior reduction while directing the RBT in procedural adjustments indicated by the session data.',
  'Active direction was provided to the RBT during service delivery, with observation focused on implementation accuracy, consistency of prompting, and reinforcement delivery.',
  'The BCBA observed the RBT\'s implementation of intervention procedures, provided performance-specific feedback, and directed adjustments to align delivery with the current treatment plan.'
];

const AN_OPENING_BCABA = [
  'The BCBA conducted direct observation of the BCaBA\'s service delivery, providing clinical direction and evaluating implementation fidelity across active treatment programs.',
  'Supervisory oversight was provided to the BCaBA through direct observation, performance assessment, and real-time corrective feedback on protocol implementation.',
  'Direct observation of ABA service delivery was conducted by the BCBA, with supervisory direction to the BCaBA focused on implementation accuracy and clinical decision-making.',
  'The BCBA provided active supervisory direction to the BCaBA, reviewing session activities and delivering targeted feedback to strengthen implementation consistency.',
  'Supervisory services included structured observation of the BCaBA\'s intervention delivery and corrective direction to support procedural fidelity across target programs.',
  'The BCBA observed ABA service delivery, evaluated the BCaBA\'s implementation against current protocol specifications, and provided real-time guidance where indicated.',
  'Clinical oversight was provided through direct observation of the BCaBA\'s session delivery, with supervisory direction focused on technical accuracy and therapeutic fidelity.',
  'The BCBA carried out active supervision of the BCaBA\'s intervention delivery, assessing procedural fidelity and directing the supervisee in key aspects of protocol implementation.',
  'Supervisory contact included structured observation of the BCaBA\'s service delivery, with performance-specific feedback and protocol guidance provided throughout the session.',
  'The BCBA reviewed client progress in replacement skill acquisition and maladaptive behavior reduction while directing the BCaBA in procedural adjustments indicated by the session data.',
  'Active direction was provided to the BCaBA during service delivery, with observation focused on implementation accuracy, prompting consistency, and reinforcement delivery.',
  'The BCBA observed the BCaBA\'s implementation of intervention procedures, provided corrective feedback, and directed adjustments to align delivery with the current treatment plan.'
];

const AN_OPENING_DIRECT = [
  'The BCBA conducted a direct ABA session with the client, implementing intervention procedures and evaluating behavioral response across active treatment programs.',
  'Direct ABA services were provided by the BCBA, with clinical observation focused on the client\'s response to current intervention procedures and replacement skill programming.',
  'The BCBA delivered ABA services directly to the client, implementing behavior reduction procedures and replacement skill acquisition programs as specified in the current treatment plan.',
  'Direct service delivery was provided by the BCBA, who implemented active treatment procedures while monitoring the client\'s behavioral response and evaluating protocol effectiveness.',
  'The BCBA conducted a direct treatment session, implementing intervention strategies and evaluating the client\'s response to behavior reduction and replacement skill programs.',
  'Direct ABA intervention was provided by the BCBA, with clinical focus on implementation of active treatment procedures and real-time observation of behavioral outcomes.',
  'The BCBA implemented ABA treatment procedures directly with the client, observing changes in target behaviors and evaluating the clinical appropriateness of current protocol components.',
  'Direct service was rendered by the BCBA, who applied behavior reduction and skill acquisition procedures while monitoring the client\'s response and gathering clinical data to inform protocol decisions.',
  'The BCBA provided direct treatment, implementing the current behavior intervention plan and evaluating the effectiveness of active procedures across maladaptive and replacement behavior targets.',
  'Direct ABA services were delivered by the BCBA, with observation focused on the client\'s behavioral response and the clinical effectiveness of current intervention and skill acquisition procedures.'
];

function _pickAnalystClosing(clientId){
  // Rotate per ANALYST across ALL clients so closings do not repeat between clients.
  const key='aba5_closing_'+getCurrentAnalystId();
  const recent=LS.get(key)||[];
  const available=AN_CLOSING.map((s,i)=>({s,i})).filter(({i})=>!recent.slice(-5).includes(i));
  const pool=available.length>0?available:AN_CLOSING.map((s,i)=>({s,i}));
  const chosen=pool[Math.floor(Math.random()*pool.length)];
  LS.set(key, [...recent, chosen.i].slice(-8));
  return chosen.s;
}

// Section narratives (A/B/C/D) reuse the shared builder; the final NOTE is
// REORDERED for analyst mode: Plan → closing sentence → client response LAST.
function getAnalystNotePrompts(casp, supLabel, minimalCtx, sessionMal, sessionRep, goalsTxt, clientName, fullNotePrompt, protoComponents, clientId, isDirect){
  let prompts=[];
  if(casp && ['A','B','C','D'].some(s=>casp[s])){
    prompts=getCaspSectionPrompts(casp, supLabel, minimalCtx, sessionMal, sessionRep, goalsTxt, clientName, fullNotePrompt)
      .filter(p=>p.sectionKey!=='NOTE');
  }
  const malList=sessionMal.length?sessionMal.join(', '):'behaviors in clinical context';
  const repList=sessionRep.length?sessionRep.join(', '):'replacement programs in clinical context';
  const active=casp?['A','B','C','D'].filter(s=>casp[s]):[];
  const sectionSummaries=active.length
    ? active.map(s=>({A:'face-to-face observations',B:'protocol adjustments',C:`active direction to the ${supLabel||'technician'}`,D:'QHP direct implementation'}[s])).join(', ')
    : 'direct clinical observation and protocol oversight by the analyst';
  const noteBase=fullNotePrompt||minimalCtx;
  // BCaBA supervision factors (only when supType is BCaBA)
  const bcabaSupBlock = (supLabel==='BCaBA') ? _buildBcabaSupPromptBlock('an') : '';
  // CPT-97155 always documents a protocol modification; the required component(s) drive the note body.
  const protoCompTxt=(protoComponents&&protoComponents.length)?protoComponents.join('; '):'the protocol component(s) modified this session';
  const protocolModConstraint=bcabaSupBlock;

  // Build per-component reference block from PROTO_MOD_DETAIL
  let protoModRefBlock = '';
  if(protoComponents && protoComponents.length){
    const refLines = protoComponents
      .filter(c => PROTO_MOD_DETAIL[c])
      .map(c => `  ${c} >> ${PROTO_MOD_DETAIL[c].join(' | ')}`);
    if(refLines.length){
      protoModRefBlock = `\n\nPROTOCOL MODIFICATION REFERENCE — possible specific changes per component (use only what is clinically supported by the session data and clinical notes provided; do not fabricate or assume):\n${refLines.join('\n')}`;
    }
  }

  const protocolModLine=`\n- Protocol modification (REQUIRED — this is a CPT-97155 note): the component(s) modified this session are: ${protoCompTxt}. For each of them document the triggering clinical observation, the specific change made, the clinical rationale, and the expected outcome. Use the PROTOCOL MODIFICATION REFERENCE below to select precise language for the specific change — match it to what is described in the clinical notes.\nNEVER WRITE A COMPONENT LABEL IN BRACKETS OR AS A HEADING: the component name is the SUBJECT of a clinical sentence, not a label to announce. Write "The reinforcement schedule was adjusted from a fixed ratio to...", never "For [Reinforcement systems], ..." and never "For Reinforcement systems, ...". A bracketed label in the note is an unfilled template and is treated as an audit defect.${protoModRefBlock}`;

  const closingSentence=_pickAnalystClosing(clientId);
  const _openingSupType = isDirect ? 'direct' : (supLabel==='BCaBA' ? 'bcaba' : 'rbt');
  const openingSentence=_pickAnalystOpening(clientId, _openingSupType);
  const _recentOpenings=_recentAnalystOpeningTexts(_openingSupType);
  const recentOpeningsBlock=_recentOpenings.length
    ? '\n\nRECENT OPENINGS USED BY THIS ANALYST (across all clients) - do NOT reproduce or closely paraphrase any of these; your opening sentence must be clearly different from every one of them:\n'+_recentOpenings.map(function(t){return '- '+t;}).join('\n')
    : '';

  // Build an explicit instruction so the COMPLETE note reflects the specific CASP
  // goal areas the user selected — not just behaviors/replacements. Each selected
  // area must be woven into the narrative as its own substantive content.
  const _supRole = supLabel || 'technician';
  const goalAreaMap = {
    A: `FACE-TO-FACE OBSERVATION: document that the BCBA directly observed the session, which specific programs/protocol components were observed, and whether they were functioning effectively or required adjustment`,
    B: `PROTOCOL ADJUSTMENTS: document the specific protocol component(s) adjusted this session, the observation or data that triggered each change, the change made, and the expected outcome`,
    C: `ACTIVE DIRECTION TO THE ${_supRole.toUpperCase()}: document the specific guidance, modeling, and corrective feedback the BCBA provided to the ${_supRole} during implementation, the implementation issue addressed, and how the ${_supRole} adjusted`,
    D: `QHP DIRECT IMPLEMENTATION: document what the BCBA implemented directly with the client, the protocols applied, and the client's observable response to the BCBA's direct implementation`
  };
  const activeGoalKeys = ['A','B','C','D'].filter(k=>casp && casp[k]);
  let goalAreasBlock = '';
  if(activeGoalKeys.length){
    const lines = activeGoalKeys.map(k=>`  • ${goalAreaMap[k]}`).join('\n');
    goalAreasBlock = `\n\nMANDATORY — SELECTED SUPERVISION GOAL AREAS: This note MUST explicitly reflect EACH of the following goal areas as substantive, dedicated content woven into the narrative (not a single passing mention). Each area below was selected for this session and must be developed with specific, observable detail drawn from the session data and clinical context:\n${lines}\nDo not collapse these into one generic sentence — give each selected area its own clear treatment in the body of the note. Do not fabricate; use only what the session data and clinical notes support.`;
  }

  prompts.push({ sectionKey:'NOTE', prompt:`${noteBase}\n\n${CAREGIVER_ROLE_97155_RULE}${protocolModConstraint}\n\nThis session included: ${sectionSummaries}.\n\nWrite ONE unified CPT-97155 analyst session note covering all clinical content. CRITICAL: Length must be sufficient to document ALL clinical data provided — do not truncate or abbreviate behaviors, BASP sections, or clinical details to meet an artificial word limit. Write as many paragraphs as needed.\n\nDO NOT begin the note with a Behaviors / Replacements / Protocol Modification header — that header is added separately by the system.\n\nMANDATORY OPENING SENTENCE — Write an original opening sentence that introduces the supervision session. Do NOT copy a template. Vary the sentence structure, the opening word, and the phrasing so it does not read like previous notes. It must stay clinically accurate and professional (third person, "the BCBA", observable language, no triumphalist wording). Here is ONE example of the appropriate tone and content — match its register but write something different in your own words, do not reuse it verbatim: "${openingSentence}"${recentOpeningsBlock} Your opening must convey the same type of clinical information (the BCBA's observation/direction of the ${supLabel||'RBT'}'s service delivery) but with fresh phrasing.\n\nABSOLUTE PROHIBITION — DATE: Do NOT write any session date, date placeholder, "[DATE]", "occurred on", "this session on", or any date-related phrase anywhere in this note. The date is entered manually afterwards.\n\nDURATION — FOLLOW THE DURATION FIELD ABOVE, AND NEVER ATTRIBUTE IT TO THE SUPERVISION: if the context above says the duration is NOT PROVIDED or NOT SPECIFIED, write no time reference at all (no "hours of direct services", no "hours of services", no time span, in any sentence including the opening line). If a duration IS given, it is the length of the CPT-97155 SESSION, not the length of the supervision or the clinical oversight. A 97155 session may contain supervision without the whole session being supervision, so never write that the oversight, the observation or the supervision "lasted" that time, and never write "clinical oversight was delivered during a session lasting X". Attach the duration to the session itself ("The session lasted X") or leave it out.

ABSOLUTE PROHIBITION — INVENTED NUMBERS AND BASELINES: Do NOT write any number, count, average, rate, or percentage that was not explicitly provided in the session data. This includes: weekly incident averages ("3.5 incidents per week"), monthly baselines ("October average of X"), named-period comparisons ("baseline of X incidents"), improvement statistics ("representing a X% improvement"), or any numerical trend. If no frequency data was provided for a behavior, describe it in qualitative observable terms only. Fabricating clinical numbers is a Medicaid compliance violation.\n\nFUNCTION-MATCHED REINFORCEMENT AND REPLACEMENT (MANDATORY): Every reinforcer and every consequence procedure must be delivered in the currency of the behavior's documented function. Attention-maintained behavior is reinforced with social attention; Non-Contingent Reinforcement (NCR) for an attention function delivers non-contingent ATTENTION on a time-based schedule, never tangibles or edibles. Escape-maintained behavior is reinforced with a break or removal of the demand. Tangible-maintained behavior is reinforced with access to the item. Automatic-maintained behavior is reinforced with a comparable, matched stimulation alternative. Never pair an attention or escape function with a tangible or edible reinforcer. Additionally, every maladaptive behavior addressed must be paired with a function-matched replacement (attention to request attention, escape to request a break or request help, tangible to request the item, automatic to a matched alternative), reinforced in the same currency as its function.\n\nPROHIBITED NARRATIVE TERMINOLOGY (MANDATORY - applies to the prose you write): Never write any of these words or their variants anywhere in the note: calm, calmly, calming, relax, relaxation, relaxing, sensory, self-regulation, self-soothing, coping, mindfulness, meditation, yoga, deep breathing, breathing technique, problem solving, conflict resolution, social stories, social narratives, anger management, art therapy, frustration, frustrated, stress, anxiety, anxious, upset, overwhelmed, empathy, de-escalation, desensitization, response cost. Also never write internal-state or unsupported-progress language about the client or the caregiver: understanding, understood, comprehension, aware, awareness, realize, improved, improvement, better, enhanced, mastery, mastered, competent, competency, proficiency, progress, growth, gains, advancement, effective, effectiveness, successful, or comparative claims such as 'more independent', unless the exact supporting data was provided in the session data above. Describe only what was observed and done. TWO-LAYER RULE: this ban applies to the prose the system generates. If one of these words is part of the exact program or behavior NAME documented in the assessment or clinical context, that name may be reproduced verbatim as a closed-list citation, but the surrounding prose must never use the term and must never build a mentalist or emotional description around it.\n\nInclude, in the body:\n- The mandatory opening sentence above (copy it exactly as given)\n- Place of service and participants — NO date, NO duration\n- For each maladaptive behavior (${malList}): ABC, exact frequency count, intervention, effectiveness phrase\n- For each replacement behavior (${repList}): teaching method, prompt type and fading, reinforcement schedule, and the client's qualitative observable response. TRIAL COUNTS: include numeric trial counts (opportunities / independent / prompted) ONLY if those exact figures were explicitly provided in the session data; if not provided, describe the response qualitatively with NO numbers and NEVER invent X-of-Y ratios, occasion counts, or second/minute durations${protocolModLine}\n- Reinforcers used${goalAreasBlock}\n\nFINAL PARAGRAPH ORDER FOR THIS ANALYST NOTE (follow this EXACT sequence — it differs from a standard note):\n1) PLAN PARAGRAPH (write this FIRST of the three closing paragraphs): Based on the session data documented above, state specifically what the analyst plans to address, modify, or implement in the next session (e.g., adjusting the prompt level for a specific program, modifying the reinforcement schedule, introducing a new replacement behavior, conducting a preference assessment, scheduling IOA). Use observable clinical language. Do not use vague phrases like "continue treatment" alone — be specific. Begin this paragraph with the exact phrase: "For the next session, the BCBA plans to..."\n2) CLOSING SENTENCE (immediately AFTER the Plan paragraph, on its own line): Write an original closing sentence conveying that the analyst will review the session data to determine whether protocol modifications are indicated. Vary the phrasing from note to note — do not reuse a fixed template. Match the tone of this example but write it differently in your own words: "${closingSentence}"\n3) OBSERVED CLIENT RESPONSE (this MUST be the LAST paragraph of the entire note — it comes AFTER the Plan and AFTER the closing sentence; 60–80 words, separate paragraph): a substantive clinical summary of the client's observable response — overall engagement/response pattern across the session, prompt dependency and any change, frequency vs. prior session, latency or accuracy trend for at least one replacement program, and any notable variation. Observable, measurable language only. No emotional language. Nothing may follow this paragraph.\n\nPlain paragraphs only. No headers. Florida Medicaid audit-ready.` });

  return prompts;
}

/* ── ANALYST MONTHLY BATCH ───────────────────────────────────────
   Generates a month of 97155 notes for the selected client by driving the
   existing single-note pipeline (rotation, protocol-mod rotation, fabrication
   guard, similarity check all included), then exports one real .docx. */
var _anBatch = { results: [], running: false };

// Build one batch row: three dropdowns (type / place / duration) that MIRROR the
// real selectors, so every value is canonical \u2014 no typing, no typos, no date.
function anBatchAddRow(){
  var wrap = document.getElementById('anBatchRows'); if(!wrap) return;
  var cell = 'padding:5px 7px;border:1px solid var(--border2);border-radius:4px;font-size:12px;background:var(--surface);color:var(--text);min-width:0';
  var row = document.createElement('div');
  row.className = 'anBatchRow';
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1.4fr 1.3fr auto;gap:6px;align-items:center';
  var typeSel = document.createElement('select');
  typeSel.className = 'anBatchType'; typeSel.style.cssText = cell;
  [['rbt','RBT'],['bcaba','BCABA'],['direct','DIRECT']].forEach(function(o){ var op=document.createElement('option'); op.value=o[0]; op.textContent=o[1]; typeSel.appendChild(op); });
  var placeSel = document.createElement('select');
  placeSel.className = 'anBatchPlace'; placeSel.style.cssText = cell;
  var srcPlace = document.getElementById('anPlace'); if(srcPlace) placeSel.innerHTML = srcPlace.innerHTML;

  // Third party PER ROW: a batch is exactly where the place changes from note to
  // note, and the participants were read once from the form for all of them \u2014 so a
  // school note came out with a caregiver present.
  var thirdSel = document.createElement('select');
  thirdSel.className = 'anBatchThird'; thirdSel.style.cssText = cell;
  thirdSel.title = 'Qui\u00e9n acompa\u00f1a en esta sesi\u00f3n, adem\u00e1s del cliente y el t\u00e9cnico';
  [['auto','seg\u00fan el lugar'],['caregiver','caregiver / parent'],
   ['the classroom teacher','maestra'],["the teacher's assistant",'asistente de aula'],
   ['the instructor','instructor'],['the daycare staff','personal del daycare'],
   ['the camp counselor','consejero del campamento'],['none','nadie m\u00e1s']]
   .forEach(function(o){ var op=document.createElement('option'); op.value=o[0]; op.textContent=o[1]; thirdSel.appendChild(op); });
  placeSel.onchange = function(){
    if(thirdSel.value !== 'auto' && thirdSel.dataset.manuallySet) return;
    thirdSel.value = 'auto';
  };

  var rm = document.createElement('button');
  rm.type = 'button'; rm.textContent = '\u2715'; rm.title = 'Quitar esta nota';
  rm.style.cssText = 'padding:4px 9px;border:1px solid var(--border2);border-radius:4px;background:var(--surface);color:var(--text3);cursor:pointer;font-size:12px';
  rm.onclick = function(){ row.remove(); };
  thirdSel.onchange = function(){ thirdSel.dataset.manuallySet = '1'; };
  row.appendChild(typeSel); row.appendChild(placeSel); row.appendChild(thirdSel); row.appendChild(rm);
  wrap.appendChild(row);
}

// Resolve a row's third party into the participant checkboxes for that note.
function _anApplyRowThirdParty(place, third){
  var cg = document.getElementById('anPCaregiver');
  var ot = document.getElementById('anPOther');
  var otTxt = document.getElementById('anPOtherText');
  var otBox = document.getElementById('anPOtherInput');
  var resolved = third;
  if(third === 'auto'){
    var rule = AN_PLACE_THIRD_PARTY[_anPlaceKey(place)];
    resolved = !rule ? 'none' : (rule.other ? rule.other : 'caregiver');
  }
  if(resolved === 'none'){
    if(cg) cg.checked = false;
    if(ot) ot.checked = false;
    if(otBox) otBox.style.display = 'none';
  } else if(resolved === 'caregiver'){
    if(cg) cg.checked = true;
    if(ot) ot.checked = false;
    if(otBox) otBox.style.display = 'none';
  } else {
    if(cg) cg.checked = false;
    if(ot) ot.checked = true;
    if(otBox) otBox.style.display = 'block';
    if(otTxt) otTxt.value = resolved;
  }
  return resolved;
}
// Seed the panel with one row the first time it is opened (if empty).
function anBatchEnsureRows(){
  var wrap = document.getElementById('anBatchRows');
  if(wrap && !wrap.querySelector('.anBatchRow')) anBatchAddRow();
  _anInitBatchMonth();
}

/* MES DEL LOTE. El DOCX se titulaba y se nombraba SIEMPRE con el mes en curso:
   generar en noviembre las notas de octubre producia un documento titulado
   noviembre. Ahora el mes se elige, se recuerda entre sesiones, y por defecto es
   el mes actual — que es lo correcto la mayoria de las veces. */
function _anBatchMonthKey(){ return 'aba5_anbatchmonth'; }

function _anInitBatchMonth(){
  var el = document.getElementById('anBatchMonth');
  if(!el || el.value) return;
  var saved = '';
  try{ saved = LS.get(_anBatchMonthKey()) || ''; }catch(e){}
  if(/^\d{4}-\d{2}$/.test(saved)){ el.value = saved; return; }
  var d = new Date();
  el.value = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2);
}

function _anSaveBatchMonth(){
  var el = document.getElementById('anBatchMonth');
  if(!el) return;
  try{ LS.set(_anBatchMonthKey(), el.value || ''); }catch(e){}
}

/* Devuelve { label: "October 2026", file: "October_2026" }. Si la casilla esta
   vacia o trae algo que no es un mes, cae al mes actual en vez de romper la
   exportacion. */
function _anBatchMonthLabel(){
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var raw = (document.getElementById('anBatchMonth')||{}).value || '';
  var m = /^(\d{4})-(\d{2})$/.exec(raw);
  var yr, mo;
  if(m){ yr = m[1]; mo = parseInt(m[2],10); }
  else { var d = new Date(); yr = d.getFullYear(); mo = d.getMonth()+1; }
  if(!(mo>=1 && mo<=12)){ var d2 = new Date(); yr = d2.getFullYear(); mo = d2.getMonth()+1; }
  var name = months[mo-1];
  return { label: name + ' ' + yr, file: name + '_' + yr };
}
// Read the batch definition from the selectable rows (type | place | duration; no date).
function _anBatchParse(){
  var rowsEl = Array.prototype.slice.call(document.querySelectorAll('#anBatchRows .anBatchRow'));
  var rows = [], errors = [];
  if(!rowsEl.length) return { rows: rows, errors: ['agrega al menos una nota'] };
  rowsEl.forEach(function(rEl, i){
    var variant = (rEl.querySelector('.anBatchType') || {}).value || '';
    var place   = (rEl.querySelector('.anBatchPlace') || {}).value || '';
    var third   = (rEl.querySelector('.anBatchThird') || {}).value || 'auto';
    if(!variant || !place){ errors.push('nota ' + (i+1) + ': completa tipo y lugar'); return; }
    rows.push({ variant: variant, place: place, third: third });
  });
  return { rows: rows, errors: errors };
}

async function anBatchRun(){
  if(_anBatch.running) return;
  var clientId = document.getElementById('anClientSel').value;
  if(!clientId){ showMsg('anMsg','Selecciona un cliente antes de correr el batch.','err'); return; }
  var parsed = _anBatchParse();
  if(parsed.errors.length){ showMsg('anMsg','Batch: '+parsed.errors.join(' \u00b7 '),'err'); return; }
  if(!parsed.rows.length){ showMsg('anMsg','Batch: no hay l\u00edneas v\u00e1lidas.','err'); return; }
  _anBatch = { results: [], running: true };
  var runBtn = document.getElementById('anBatchRunBtn');
  var expBtn = document.getElementById('anBatchExportBtn');
  var prog = document.getElementById('anBatchProg');
  if(runBtn) runBtn.disabled = true;
  if(expBtn) expBtn.disabled = true;
  // Within-run rotation of protocol-mod components: shuffled order, no repeats until exhausted.
  var compEls = Array.prototype.slice.call(document.querySelectorAll('.anProtoMod_item'));
  var compOrder = compEls.map(function(e){ return e.value; });
  for(var x = compOrder.length - 1; x > 0; x--){ var j = Math.floor(Math.random()*(x+1)); var tmp = compOrder[x]; compOrder[x] = compOrder[j]; compOrder[j] = tmp; }
  var compIdx = 0;
  try{
    for(var i=0;i<parsed.rows.length;i++){
      var r = parsed.rows[i];
      var vLabel = r.variant==='rbt' ? 'BCBA-RBT' : (r.variant==='bcaba' ? 'BCBA-BCaBA' : 'BCBA direct');
      if(prog) prog.textContent = 'Generando nota '+(i+1)+' de '+parsed.rows.length+' ('+vLabel+', '+r.place+')\u2026';
      var radio = document.querySelector('input[name="anSupType"][value="'+r.variant+'"]');
      if(!radio){ showMsg('anMsg','Batch detenido en la l\u00ednea '+(i+1)+': la variante '+vLabel+' no est\u00e1 disponible para este analista.','err'); break; }
      radio.checked = true;
      if(typeof onAnalystSupTypeChange === 'function') onAnalystSupTypeChange();
      var pSel = document.getElementById('anPlace'); if(pSel) pSel.value = r.place;
      // Cada nota lleva su propio acompanante: el lote es justo donde el lugar cambia
      // de una nota a otra y los participantes se leian una sola vez del formulario.
      var _third = _anApplyRowThirdParty(r.place, r.third);
      if(prog) prog.textContent = 'Generando nota '+(i+1)+' de '+parsed.rows.length+' ('+vLabel+', '+r.place
        + (_third && _third !== 'none' ? ', con ' + (_third === 'caregiver' ? 'caregiver' : _third) : ', sin acompanante')
        + ')\u2026';
      compEls.forEach(function(e){ e.checked = false; });
      var take = (compOrder.length > 1 && Math.random() < 0.25) ? 2 : 1;
      for(var t=0;t<take;t++){
        var val = compOrder[compIdx % compOrder.length]; compIdx++;
        var el = compEls.filter(function(e){ return e.value === val; })[0];
        if(el) el.checked = true;
      }
      if(typeof _anUpdateGenBtn === 'function') _anUpdateGenBtn();
      var boxBefore = document.getElementById('box-an97155');
      var before = (boxBefore && boxBefore.dataset.plain) || '';
      window._anLastMeta = null;
      await generateAnalystSession();
      // Re-query: generateAnalystSession rebuilds the output container, so the
      // pre-call element reference is stale and never receives dataset.plain.
      var boxAfter = document.getElementById('box-an97155');
      var after = (boxAfter && boxAfter.dataset.plain) || '';
      if(!after || after === before){
        showMsg('anMsg','Batch detenido: la nota '+(i+1)+' no se gener\u00f3. Corrige el error mostrado y vuelve a correr el batch desde esa nota.','err');
        break;
      }
      // _anLastMeta is only set once the note finished cleanly. The text alone is not
      // proof: it is written to the box before the final steps, so a note that failed
      // at the end would look complete here and get exported with an empty header.
      var meta = window._anLastMeta;
      if(!meta){
        showMsg('anMsg','Batch detenido: la nota '+(i+1)+' se generó pero falló al terminar (mira el error en rojo bajo la nota). No se exporta a medias.','err');
        break;
      }
      _anBatch.results.push({ variant: vLabel, place: r.place, text: after, mal: meta.mal, rep: meta.rep, mods: meta.mods });
      await new Promise(function(res){ setTimeout(res, 1200); });
    }
  } finally {
    _anBatch.running = false;
    if(runBtn) runBtn.disabled = false;
    if(expBtn) expBtn.disabled = _anBatch.results.length === 0;
    if(prog) prog.textContent = _anBatch.results.length === parsed.rows.length
      ? 'Batch completo: '+_anBatch.results.length+' notas generadas. Listo para exportar DOCX.'
      : 'Batch parcial: '+_anBatch.results.length+' de '+parsed.rows.length+' notas. Puedes exportar las generadas o corregir y repetir.';
  }
}

async function anBatchExportDocx(){
  if(!_anBatch.results.length){ showMsg('anMsg','No hay notas de batch para exportar.','err'); return; }
  if(typeof JSZip === 'undefined'){ showMsg('anMsg','JSZip no carg\u00f3 (revisa la conexi\u00f3n) \u2014 no se puede crear el DOCX.','err'); return; }
  var clientId = document.getElementById('anClientSel').value;
  var c = clients.find(function(x){ return x.id === clientId; });
  var cname = (c && c.name) || 'Client';
  // El mes lo elige el usuario en el panel del batch; por defecto, el mes actual.
  var _mth = _anBatchMonthLabel();
  var paras = [];
  function P(text){ paras.push('<w:p><w:r><w:t xml:space="preserve">'+_xmlEsc(text)+'</w:t></w:r></w:p>'); }
  function PB(){ paras.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); }
  P(cname + ' \u2014 CPT 97155 Session Notes \u2014 ' + _mth.label);
  P('');
  for(var i=0;i<_anBatch.results.length;i++){
    var r = _anBatch.results[i];
    // Three-line header, consecutive lines with no blanks in between:
    // maladaptives / replacements / Modifications were made to: ...
    if(r.mal && r.mal.length) P(r.mal.join(', '));
    if(r.rep && r.rep.length) P(r.rep.join(', '));
    if(r.mods && r.mods.length) P('Modifications were made to: ' + r.mods.join('; ') + '.');
    P('');
    var lines = r.text.split('\n');
    for(var l=0;l<lines.length;l++){ P(lines[l]); }
    if(i < _anBatch.results.length - 1) PB();
  }
  var docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:body>' + paras.join('') + '<w:sectPr/></w:body></w:document>';
  var zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', docXml);
  var blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = cname.replace(/[^A-Za-z0-9_-]+/g,'_') + '_97155_' + _mth.file + '.docx';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function generateAnalystSession(){
  const clientId=document.getElementById('anClientSel').value;
  if(!clientId){ showMsg('anMsg','Select a client first.','err'); return; }

  const sup=getAnalystSupType();
  const casp=getAnalystCaspSections();
  const protoComponents=getAnalystProtocolModComponents();
  if(!protoComponents.length){
    showMsg('anMsg','Select at least one protocol modification component — CPT-97155 always documents a protocol modification.','err');
    return;
  }
  if(casp && casp.A && casp.Aresult==='ok'){
    showMsg('anMsg','Section A is set to "no adjustments were indicated," which contradicts a 97155 protocol-modification note. Set Section A to "adjustments were required," or leave Section A unchecked.','err');
    return;
  }

  const c=clients.find(x=>x.id===clientId);
  const place=document.getElementById('anPlace').value;
  const placeLabels={
    'Home (12)':"the client's home",'Office/Clinic (11)':'the clinic','School (03)':'school',
    'Community (99)':'the community','Daycare (12)':'daycare','After School (99)':'an after-school setting',
    'Summer Camp (99)':'a summer-camp setting','Other (99)':'the service location'
  };
  const placeForNote=placeLabels[place]||place.replace(/\s*\(\d+\)\s*/,'').trim();
  // Sin fallback: "Not specified" es una eleccion, no un campo vacio. El tiempo de la
  // supervision y el de la sesion 97155 son cantidades distintas -la sesion puede
  // contener supervision sin que toda la sesion lo sea-, asi que dejarlo en blanco
  // tiene que mantener el tiempo fuera del texto.
  const dur=document.getElementById('anDur97155').value||'';
  const _anShortBlock = _shortSessionBlock(dur, '97155');
  const summary=LS.get('aba5_sum_'+clientId)||'';
  const pools=LS.get('aba5_pools_'+clientId)||{};
  const participantsList=getAnalystParticipants();
  const emerging=getAnalystEmergingItems();
  const envChanges=document.getElementById('anEnvChanges')?.value.trim()||'';
  const medConcerns=document.getElementById('anMedConcerns')?.value.trim()||'';
  const crisisSituation=document.getElementById('anCrisis')?.value.trim()||'';
  const prevPlanText=document.getElementById('anPrevPlan')?.value.trim()||'';
  const customGoalsTxt=getAnalystCustomGoals97155();

  // Frequency data (optional)
  const freqCounts=getAnalystFreqCounts();
  let freqLine='';
  if(freqCounts && Object.keys(freqCounts).length){
    const lines=[];
    Object.entries(freqCounts).forEach(([b,n])=>{
      if(b==='_redirections') lines.push(`[INTERNAL REFERENCE METRIC — do NOT write this number in the note] Approximate intervention/redirection activity level this session: ${n}. Use only to calibrate how much intervention to describe qualitatively; never state the count.`);
      else lines.push(`${b}: ${n} episode${n!==1?'s':''}`);
    });
    freqLine=`\nSESSION FREQUENCY DATA (use these exact counts in the note — do not round, change, or omit them):\n${lines.join('\n')}\nCRITICAL: If a behavior does not appear in this list, it was not provided with a count. Do NOT state 'zero episodes,' 'no occurrences,' or 'was not observed' for any behavior not listed here.`;
  }

  // Rotation behaviors — reuse the locked rotation that drove the freq inputs
  const rotCtx155=(_anRotCtx && _anRotCtx.mal && _anRotCtx.mal.length)
    ? _anRotCtx
    : selectBehaviorsSmart(clientId, pools, 2, 2);

  const ntId=sup==='bcaba'?'97155-bcaba':sup==='direct'?'97155-direct':'97155-rbt';
  const supLabel=sup==='bcaba'?'BCaBA':sup==='direct'?null:'RBT';
  const _goalsBase=customGoalsTxt
    ? {type:'97155', g1:customGoalsTxt, g2:null, g3:null, g4:null, _custom:true}
    : selectGoalsSmart(ntId, clientId);
  const goals97155=ntId==='97155-direct' ? (({g3, ..._rest})=>_rest)(_goalsBase) : _goalsBase;

  const supervisorCred='BCBA';
  const includeDuration=false;
  const dt='[DATE — analyst to complete]';  // no date field; analyst fills manually

  const btn=document.getElementById('anGenBtn');
  const sp=document.getElementById('anGenSpinner');
  btn.disabled=true; sp.style.display='inline-block';
  showMsg('anMsg','','warn',0);

  const container=document.getElementById('anOutputsContainer');
  const modalityLabel=sup==='bcaba'?'BCBA→BCaBA':sup==='direct'?'BCBA Direct':'BCBA→RBT';
  const meta=`${place} · 97155 · ${modalityLabel} · (date entered manually)`;
  container.innerHTML=makeOutputBlock('an97155','CPT-97155 · '+dur, meta, '', casp?caspSectionsToServicesList(casp):'', false, true);
  container.scrollIntoView({behavior:'smooth',block:'start'});

  const sessionMal=rotCtx155.mal||[];
  const sessionRep=rotCtx155.rep||[];
  const isDirect=ntId==='97155-direct';
  const sys=isDirect?SYS_DIRECT:SYS;
  const noteSummary=isDirect
    ? summary.split(/[.\n]/).filter(s=>!/\bRBT\b|technician|supervisee/i.test(s)).join('. ')
    : summary;

  const clinicalSummaryCtx=noteSummary
    ? `CLINICAL CONTEXT:\n${noteSummary}\n\n`
    : (sessionMal.length?`CLIENT BEHAVIORAL PROFILE:\nMaladaptive behaviors (bracketed function is for INTERNAL intervention-matching only — never write it in the note): ${annotateBehaviorsWithFn(sessionMal, getBehaviorFnMap(pools||{})).join(', ')}\nReplacement targets: ${sessionRep.join(', ')}\n\n`:'');
  const minimalCtx=`${clinicalSummaryCtx}CLIENT: ${c.name}\nCRITICAL — CLIENT NAME: Spell the client's name EXACTLY as "${c.name}" every single time it appears in the note. Do NOT alter, abbreviate, or vary the spelling (e.g. do not switch between "${c.name}" and any other spelling). Use this exact spelling consistently throughout.\nPLACE OF SERVICE: ${placeForNote}\nSUPERVISOR: ${supLabel?'the BCBA / the '+supLabel:'the BCBA'}\nNOTE: This is an analyst-authored note with NO calendar date — the analyst enters the date manually.\n\nBehaviors this session (bracketed function is for INTERNAL intervention-matching only — never write the function label in the note): ${annotateBehaviorsWithFn(sessionMal, getBehaviorFnMap(pools||{})).join(', ')||'see clinical context'}\nReplacements this session: ${sessionRep.join(', ')||'see clinical context'}`;

  const fullNotePrompt=buildUserPrompt(ntId,c,goals97155,'',dt,placeForNote,noteSummary,pools,rotCtx155,null,supervisorCred,participantsList,false,null,envChanges,medConcerns,crisisSituation,freqLine,emerging,casp||null,'none',false,prevPlanText,null);

  const sectionPrompts=getAnalystNotePrompts(casp, supLabel, minimalCtx, sessionMal, sessionRep, goals97155?goalsString(goals97155, isDirect):'', c.name, fullNotePrompt, protoComponents, clientId, isDirect);

  const hlPools=LS.get('aba5_pools_'+clientId)||{};
  const box=document.getElementById('box-an97155');
  const legendBox=document.getElementById('casp-legend-an97155');
  const legendItems=document.getElementById('casp-legend-items-an97155');
  const allSections=casp?['A','B','C','D'].filter(s=>casp[s]):[];
  if(legendBox && legendItems && allSections.length){
    legendItems.innerHTML=allSections.map(s=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;font-size:11px;color:var(--text2)"><span style="display:inline-block;width:14px;height:8px;border-radius:2px;background:${CASP_META[s].bg};border-bottom:2px solid ${CASP_META[s].border}"></span>${CASP_META[s].label}</span>`).join('');
    legendBox.style.display='block';
  }

  document.getElementById('loading-an97155').style.display='none';
  if(box) box.style.display='block';

  // Header (Behaviors / Replacements / Protocol Modification) BEFORE the note body.
  const header=buildAnalystHeader(sessionMal, sessionRep, casp, emerging, protoComponents);
  let combinedPlainText=header.plain;
  let combinedHtml=header.html;
  if(box) box.innerHTML=combinedHtml;

  // Counters for the two hard guards, applied per section below.
  let _anSelfAuditCut=false, _anNumsCut=0; const _anPolished=[];

  try{
    for(const {sectionKey, prompt} of sectionPrompts){
      const isGeneralNote=sectionKey==='NOTE';
      const m=isGeneralNote?{bg:'var(--bg)',border:'var(--border2)',label:'General Session Note'}:CASP_META[sectionKey];
      const loadingId=`casp-loading-an97155-${sectionKey}`;
      const sectionLoading=`<div id="${loadingId}" style="background:${m.bg};border-left:3px solid ${m.border};border-radius:4px;padding:8px 12px;margin:6px 0;font-size:11px;color:var(--text3)"><span class="spinner spinner-dark" style="display:inline-block;margin-right:5px;width:10px;height:10px;border-width:1.5px"></span>${isGeneralNote?'Generating complete session note…':`§${sectionKey} — ${m.label} generating…`}</div>`;
      combinedHtml+=sectionLoading;
      if(box) box.innerHTML=combinedHtml;

      // Deterministic budget for short sections: reasoning is ENABLED but capped
      // (1024 tokens — ample for a 2-paragraph narrative), and the total leaves a
      // guaranteed ~600 tokens for visible text. This prevents BOTH failure modes:
      // mid-sentence truncation (unpredictable reasoning eating the budget) and
      // runaway full-note-length sections (unlimited budget ignoring word limits).
      const sectionMaxTokens = isGeneralNote ? 32768 : 1700;
      const sectionThinking  = isGeneralNote ? NOTE_THINKING_BUDGET : 1024;
      // CRITICAL: sections use their OWN lightweight system prompt. The full-note
      // SYS would override the section instructions with full-note structure.
      const sectionSys = isGeneralNote ? sys : SYS_SECTION;
      const _ssbAn = isGeneralNote ? _anShortBlock : '';
      let sectionText=await callAPI(prompt + _ssbAn, sectionSys, '97155', clientId, sectionMaxTokens, sectionThinking);
      // If the general note was cut off by the token limit, retry once at max budget.
      if(_lastTruncated && isGeneralNote){
        console.warn('[Analyst 97155] General note truncated — retrying at maximum budget.');
        const wasTruncated = true;
        const retryText = await callAPI(prompt + _ssbAn, sectionSys, '97155', clientId, 65536, sectionThinking);
        // Prefer the retry if it did NOT truncate (even if shorter — a complete note
        // beats a longer cut-off one). Otherwise keep whichever is longer.
        if(retryText){
          if(!_lastTruncated){ sectionText = retryText; }
          else if(retryText.length >= sectionText.length){ sectionText = retryText; }
        }
        if(_lastTruncated){
          const am = document.getElementById('anMsg');
          if(am){ am.textContent='⚠ La nota es muy extensa y pudo quedar truncada. Si termina a media frase, reduce el contenido/goals seleccionado y vuelve a generar.'; am.className='msg err'; }
        }
      }
      // The two hard guards run HERE, per section, not after the loop. Running them
      // afterwards left the rendered note, box.dataset.plain and the DOCX export
      // holding the unscrubbed text while only the saved copy was cleaned — and the
      // analyst has no session data loaded, so every performance figure is invented.
      // Doing it per section keeps what is shown, saved and exported identical.
      const _saSec = (typeof _stripSelfAudit==='function') ? _stripSelfAudit(sectionText) : null;
      if(_saSec && _saSec.cut){ sectionText = _saSec.text; _anSelfAuditCut = true; }
      const _scrubSec = (typeof _scrub97153Numbers==='function') ? _scrub97153Numbers(sectionText, '') : null;
      if(_scrubSec){ sectionText = _scrubSec.text; _anNumsCut += _scrubSec.removed.length; }
      const _polSec = (typeof _polishNoteText==='function') ? _polishNoteText(sectionText) : null;
      if(_polSec){ sectionText = _polSec.text; _polSec.fixed.forEach(function(f){ if(_anPolished.indexOf(f)===-1) _anPolished.push(f); }); }

      combinedPlainText+='\n\n'+sectionText.trim();

      const highlighted=highlightNoteText(sectionText.trim(), c.name, hlPools);
      const label=isGeneralNote?'':`§${sectionKey} — ${m.label.toUpperCase()}`;
      const borderLeft=isGeneralNote?'3px solid var(--text3)':`3px solid ${m.border}`;
      const bg=isGeneralNote?'var(--surface)':m.bg;
      const headerColor=isGeneralNote?'var(--text2)':m.border;
      const labelHtml=label?`<div style="font-size:10px;font-family:var(--mono);font-weight:700;color:${headerColor};letter-spacing:.05em;margin-bottom:5px">${label}</div>`:'';
      const sectionBlock=`<div style="background:${bg};border-left:${borderLeft};border-radius:4px;padding:10px 14px;margin:6px 0">${labelHtml}<div style="font-size:13px;line-height:1.65;color:var(--text)">${highlighted.split('\n').filter(l=>l.trim()).map(l=>`<p style="margin:0 0 6px">${l}</p>`).join('')}</div></div>`;
      combinedHtml=combinedHtml.replace(sectionLoading, sectionBlock);
      if(box) box.innerHTML=combinedHtml;
    }
    const cleanPlain=combinedPlainText.trim();
    if(box) box.dataset.plain=cleanPlain;
    const planMatch=cleanPlain.match(/For the next session[^\n]*(?:\n(?![A-Z][^\n]*:)[^\n]+)*/i);
    if(planMatch) LS.set('aba5_plan_'+clientId, planMatch[0].trim());
    // Expose the exact selection used by THIS note so the batch can head each
    // exported note with its three lines (maladaptives / replacements / mods).
    window._anLastMeta = { mal: sessionMal.slice(), rep: sessionRep.slice(), mods: protoComponents.slice() };
    _recordProtoModsUsed(clientId, protoComponents);
    if(getAnalystSupType()==='bcaba') _recordBcabaSupUsed(clientId, 'an');
    recordSessionHistory(clientId, {mal:sessionMal, rep:sessionRep, goals:goals97155, codes:['97155']});
    // Refresh the rotation context NOW, using the just-updated history, so that the
    // NEXT note for this client (a different day/session) rotates to less-recently-used
    // behaviors/replacements — without requiring the user to press Clear first.
    try {
      const _poolsRefresh = LS.get('aba5_pools_'+clientId) || {};
      _anRotCtx = _freshAnalystBehaviors(clientId, _poolsRefresh, sessionMal);
    } catch(e){ /* non-fatal: rotation will still refresh on Clear */ }
    saveNoteToHistory(clientId, '97155', today(), dur, cleanPlain);
    document.getElementById('foot-an97155').style.display='flex';
    var _anWarn = [];
    if(_anSelfAuditCut){ _recordDefect(clientId, 'autoverif'); _anWarn.push('se eliminó una lista de autoverificación que el modelo añadió'); }
    if(_anNumsCut){ _recordDefect(clientId, 'numeros'); _anWarn.push('se quitaron ' + _anNumsCut + ' cifra(s) de desempeño sin dato que las respalde'); }
    if(_anPolished.length){
      _anWarn.push('se corrigió ' + _anPolished.join(', '));
      if(_anPolished.indexOf('marcador de variante interna (V#/A#)') !== -1) _recordDefect(clientId, 'variante');
      if(_anPolished.indexOf('nombre en mayúsculas a Sentence case') !== -1) _recordDefect(clientId, 'mayusculas');
    }
    showMsg('anMsg','Analyst 97155 note generated — remember to enter the session date manually.'
      + (_anWarn.length ? ' (' + _anWarn.join('; ') + '.)' : ''), 'ok');
    _postNoteChecks(cleanPlain, clientId, 'anMsg');
  }catch(err){
    showMsg('anMsg','Generation error: '+err.message,'err');
    if(box) box.innerHTML=combinedHtml+`<div style="color:var(--red);font-size:12px;padding:8px">Error: ${esc(err.message)}</div>`;
  }finally{
    btn.disabled=false; sp.style.display='none';
  }
}
