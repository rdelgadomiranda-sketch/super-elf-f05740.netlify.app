/* ═══════════════════════════════════════════════════════════
   SUMMARY GENERATION
═══════════════════════════════════════════════════════════ */
async function generateSummary() {
  if (!activeClientId) { showMsg('sumMsg','Select a client first.','err'); return; }
  // CRITICAL: capture clientId NOW before any await — switching clients mid-generation must not corrupt data
  const clientId = activeClientId;
  if (!pendingDocText) { showMsg('sumMsg','No document extracted. Upload a file first.','err'); return; }
  const c = clients.find(x=>x.id===clientId);
  if (!c) { showMsg('sumMsg','Client not found.','err'); return; }
  const btn = document.getElementById('sumGenBtn');
  const sp = document.getElementById('sumSpinner');
  btn.disabled=true; sp.style.display='inline-block';
  document.getElementById('sumProcessing').textContent=`Generating summary for ${c.name}…`;

  const prompt=`You are an ABA clinical documentation specialist. The text below contains one or more clinical documents for a SINGLE client — typically a full ABA assessment or reassessment, and/or an OfficePuzzle note sheet. Combine information from all documents provided.

Your task is to extract a COMPREHENSIVE clinical working profile. This profile is the master reference used to generate ALL future session notes for this client, so completeness is essential. Do NOT write a short summary — capture every clinical detail present in the documents. Write in plain text with simple labeled sections (no markdown, no bold, no bullet symbols, no tables).

Extract and organize the following sections IN THIS EXACT ORDER. For any section where the documents genuinely contain no information, write "Not specified in provided documents." Never invent or infer content that is not in the documents.

CLIENT
- Name (first name only if available).
- Month and year of birth ONLY, formatted as "Month YYYY". Never include the day of birth.

CLIENT CHARACTERISTICS
The client's main clinical characteristics as described in the documents, in observable terms: communication level and modality (vocal, gestural, device), language/skill repertoires, notable strengths and emerging skills, preferences and high-interest activities, barriers to learning, and any relevant medical or contextual considerations stated in the documents. No diagnostic labels.

MALADAPTIVE BEHAVIORS
For EACH maladaptive behavior found, document: the behavior label, its full operational definition, its behavioral function(s), and its topography(ies). List EVERY maladaptive behavior in the documents — do not omit or merge any.

INTERVENTIONS
All behavior-reduction interventions specified (e.g., DRA, DRO, DRI, FCT, extinction, response blocking, redirection, antecedent interventions). Where the document links an intervention to a specific target behavior, preserve that link.

REPLACEMENT / ACQUISITION BEHAVIORS
For EACH replacement or acquisition behavior, document: the behavior/skill label and its full description or target. List EVERY one found.

REINFORCEMENT
All reinforcement programs and schedules described: reinforcer types, schedules of reinforcement, and delivery methods.

PROMPTS
The prompt types and the prompt hierarchy / fading procedures to be used.

ANTECEDENT STRATEGIES AND ENVIRONMENTAL MODIFICATIONS
All antecedent-based strategies and environmental modifications described.

GENERALIZATION
Generalization objectives and programming described (across settings, people, and stimuli).

PROTOCOL MODIFICATIONS
Any protocol-modification topics, planned adjustments, or revision targets described.

CAREGIVER AND PARENT WORK
The caregiver/parent training goals or involvement described. Note: caregivers do NOT collect data; their role is limited to (1) interventions/environmental manipulations, (2) replacement/acquisition goals, and (3) use of reinforcement.

ADDITIONAL CLINICAL NOTES
Any other clinically relevant information not captured in the sections above.

STRICT RULES:
- Do NOT include diagnostic labels, diagnostic codes, or diagnosis names (no "ASD", "autism", "autism spectrum disorder", "ADHD", "intellectual disability", or any diagnosis). Document only observable behaviors and ABA procedures.
- Do NOT include Medicaid numbers, insurance numbers, addresses, phone numbers, last names, or day of birth.
- Do NOT invent any numerical data (frequencies, percentages, baselines, counts). Only include numbers explicitly present in the documents.
- Be exhaustive within the bounds of what the documents actually contain.
- DOCUMENT QUALITY: the source documents often contain copy-paste errors — duplicated fragments, broken or truncated sentences, formatting artifacts, template leftovers, and occasionally text that clearly belongs to a DIFFERENT client (wrong name, wrong pronouns, inconsistent age). Silently disregard corrupted or duplicated fragments and reconstruct only the clinically coherent content. NEVER reproduce garbled text into the profile. If a passage clearly refers to a different client than the one named in the documents, EXCLUDE it. Resolve duplications by keeping the most complete version of the information.

After the profile, add three clearly delimited sections (these are parsed automatically — keep the exact labels and format):

---MALADAPTIVE_BEHAVIORS---
[one behavior per line formatted as "label :: function", where function is drawn from: escape, attention, tangible, automatic, or unspecified. MULTIPLY-MAINTAINED BEHAVIORS: if the documents document more than one function for a behavior (e.g. "Escape + Automatic Reinforcement", "Attention + Tangibles"), list EVERY documented function joined with "+" — e.g. "Off-task Behavior :: escape+automatic". Map "Automatic Reinforcement"/"AR"/"sensory" to automatic. If the documents do not state a function for it, write unspecified. Use "::" only as the separator, no other punctuation, no numbering]

---REPLACEMENT_BEHAVIORS---
[one replacement per line formatted as "label :: function", where function is the FUNCTION THIS REPLACEMENT SERVES — the function of the maladaptive behavior it replaces — drawn from: escape, attention, tangible, automatic, or unspecified. A replacement that requests a break or help serves escape; an appropriate bid for attention serves attention; an appropriate request for an item serves tangible; a competing/alternative response producing comparable stimulation serves automatic. If the documents include a function-to-replacement map, follow it. If a replacement serves more than one function, join them with "+". If the documents do not support a function for it, write unspecified. Use "::" only as the separator, no other punctuation, no numbering]

---REINFORCERS---
[single line, all reinforcers comma-separated]

Document content:
${pendingDocText}`;

  try {
    let raw = await callGeminiAPI(prompt, 32768);
    // If the profile was cut off by the token limit, retry once at maximum budget —
    // an incomplete master profile silently degrades every future note.
    if (_lastTruncated) {
      console.warn('[Summary] Profile truncated — retrying at maximum budget.');
      const retryRaw = await callGeminiAPI(prompt, 65536);
      if (retryRaw) {
        if (!_lastTruncated) { raw = retryRaw; }
        else if (retryRaw.length >= raw.length) { raw = retryRaw; }
      }
      if (_lastTruncated) {
        showMsg('sumMsg','⚠ El documento es muy extenso y el perfil pudo quedar truncado. Revisa el final del summary; si está cortado, divide el documento y regenera.','err');
      }
    }
    // Normalize line endings before parsing — Gemini may return \r\n or extra whitespace
    const normalized = raw.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const malMatch=normalized.match(/---MALADAPTIVE_BEHAVIORS---\s*\n([\s\S]*?)(?=---|$)/);
    const repMatch=normalized.match(/---REPLACEMENT_BEHAVIORS---\s*\n([\s\S]*?)(?=---|$)/);
    const reinfMatch=normalized.match(/---REINFORCERS---\s*\n([\s\S]*?)(?=---|$)/);
    // Maladaptive behaviors now carry their function as "label :: function".
    // Parse each line into {name, fn}; fn is normalized to a known class or '' .
    const malList=(malMatch?malMatch[1]:'').split('\n').map(s=>s.trim()).filter(s=>s.length>2)
      .map(line=>{
        const idx=line.indexOf('::');
        if(idx>=0){
          const name=line.slice(0,idx).trim();
          const fn=_fnClassList(line.slice(idx+2).trim()).join('+');   // '' when unspecified; may hold several ("escape+automatic")
          return { name, fn };
        }
        return { name: line, fn: '' };
      })
      .filter(x=>x.name.length>2);
    // Replacements now carry the function they serve, same "label :: function" format.
    const repList=(repMatch?repMatch[1]:'').split('\n').map(s=>s.trim()).filter(s=>s.length>2)
      .map(line=>{
        const idx=line.indexOf('::');
        if(idx>=0) return { name: line.slice(0,idx).trim(), fn: _fnClassList(line.slice(idx+2).trim()).join('+') };
        return { name: line, fn: '' };
      })
      .filter(x=>x.name.length>2);
    const reinfStr=(reinfMatch?reinfMatch[1]:'').trim();
    const summaryOnly=normalized.split('---MALADAPTIVE_BEHAVIORS---')[0].trim();

    // Save ONLY to the captured clientId — never to activeClientId after an await
    LS.set('aba5_sum_'+clientId, summaryOnly);

    // MERGE behaviors/replacements instead of replacing. Keep everything that's
    // already there; add only items not already present, marked with status 'new'
    // so the user can see (in a distinct color) what was just suggested and decide
    // what to keep. Only mark as 'new' if there was already an existing list —
    // first-time generation just adds them as active.
    const existingPools = LS.get('aba5_pools_'+clientId) || {};
    const existingMal = normalizeBehaviorArr(existingPools.mal || []);
    const existingRep = normalizeBehaviorArr(existingPools.rep || []);
    const hadMal = existingMal.length > 0;
    const hadRep = existingRep.length > 0;

    const mergedMal = [...existingMal];
    let addedMal = 0;
    malList.forEach(item => {
      const name = item.name;
      const existing = mergedMal.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!existing) {
        mergedMal.push({ name, status: hadMal ? 'new' : 'active', fn: item.fn || '' });
        addedMal++;
      } else if (item.fn && !existing.fn) {
        existing.fn = item.fn;   // backfill function for an existing behavior that lacked one
      }
    });

    const mergedRep = [...existingRep];
    let addedRep = 0;
    repList.forEach(item => {
      const name = item.name;
      const existing = mergedRep.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!existing) {
        mergedRep.push({ name, status: hadRep ? 'new' : 'active', fn: item.fn || '' });
        addedRep++;
      } else if (item.fn && !existing.fn) {
        existing.fn = item.fn;   // backfill the served function on an existing replacement
      }
    });

    const pools = { mal: mergedMal, rep: mergedRep, reinforcers: existingPools.reinforcers || '' };
    // Reinforcers: append new ones without duplicating
    if (reinfStr) {
      if (existingPools.reinforcers) {
        const existingSet = new Set(existingPools.reinforcers.split(',').map(s=>s.trim().toLowerCase()));
        const newOnes = reinfStr.split(',').map(s=>s.trim()).filter(s=>s && !existingSet.has(s.toLowerCase()));
        pools.reinforcers = newOnes.length ? existingPools.reinforcers + ', ' + newOnes.join(', ') : existingPools.reinforcers;
      } else {
        pools.reinforcers = reinfStr;
      }
    }
    LS.set('aba5_pools_'+clientId, pools);

    // Only update UI if the user is still looking at this same client
    if(activeClientId === clientId) {
      const planArea = document.getElementById('cPlanSummary');
      if (planArea) planArea.value = summaryOnly;
      document.getElementById('sumStatusBadge').innerHTML='<span class="client-tag tag-green">Summary ✓</span>';
      if(pools.reinforcers) document.getElementById('cReinf').value = pools.reinforcers;
      renderBehaviorChips(clientId);
      document.getElementById('malAutoNote').textContent = addedMal ? `${addedMal} new behaviors added (purple) — click to remove unwanted` : (mergedMal.length ? `${mergedMal.length} behaviors` : '');
      document.getElementById('repAutoNote').textContent = addedRep ? `${addedRep} new replacements added (purple) — click to remove unwanted` : (mergedRep.length ? `${mergedRep.length} replacements` : '');
    }
    renderClientList();
    document.getElementById('sumProcessing').textContent='';
    showMsg('sumMsg', `Summary saved for ${c.name}: ${addedMal} new behavior(s), ${addedRep} new replacement(s) added. Existing items kept.`, 'ok', 6000);
  } catch(err) { showMsg('sumMsg','Connection error: '+err.message,'err',8000); }
  btn.disabled=false; sp.style.display='none';
}

function showSessionReview(){
  const clientId = document.getElementById('genClientSel').value;
  if(!clientId){ showMsg('genMsg','Select a client first.','err'); return; }

  const rbt = isRBT();
  const c = clients.find(x=>x.id===clientId);

  // Block if hard CASP contradiction
  const caspA = document.getElementById('casp_A')?.checked;
  const caspAresult = document.querySelector('input[name="casp_A_result"]:checked')?.value||'ok';
  const caspB = document.getElementById('casp_B')?.checked;
  if(caspA && caspAresult==='ok' && caspB){
    showMsg('genMsg','CASP contradiction: Section A states no adjustments were clinically indicated, but Section B documents protocol adjustments. Resolve this before generating.','err');
    return;
  }
  const dt = document.getElementById('genDate').value;  // do NOT auto-fill with today
  const place = document.getElementById('genPlace').value;
  const pools = LS.get('aba5_pools_'+clientId)||{};
  const summary = LS.get('aba5_sum_'+clientId)||'';

  // FILOSOFÍA 1: a missing date must block, not be silently filled with today's date.
  if(!dt){
    showMsg('genMsg','⚠ Please enter the session date before generating. The date field is intentionally blank after each note to prevent reusing an old date.','err');
    const gd = document.getElementById('genDate');
    if(gd){ gd.style.outline='2px solid #dc2626'; gd.focus(); setTimeout(()=>{ if(gd) gd.style.outline=''; }, 4000); }
    return;
  }

  document.getElementById('srClientName').textContent = c ? c.name : '—';
  document.getElementById('srDate').value = dt;
  // Populate place select
  const srPlaceSel = document.getElementById('srPlace');
  if(srPlaceSel){
    srPlaceSel.value = place;
    if(!srPlaceSel.value) srPlaceSel.value = srPlaceSel.options[0]?.value || '';
  }
  // Flag a date that is NOT today (could be correct, but worth a conscious look)
  const isToday = dt === today();
  const isDefaultPlace = !place || place === 'Home (12)';
  const anyDefault = !isToday || isDefaultPlace;
  document.getElementById('srDatePlaceAlert').style.display = anyDefault ? 'block' : 'none';
  const srDateBox = document.getElementById('srDateBox');
  const srPlaceBox = document.getElementById('srPlaceBox');
  if(srDateBox) srDateBox.style.borderColor = !isToday ? '#f59e0b' : 'transparent';
  if(srPlaceBox) srPlaceBox.style.borderColor = isDefaultPlace ? '#f59e0b' : 'transparent';
  document.getElementById('srDateFlag').textContent = !isToday ? '⚠ not today — verify' : '';
  document.getElementById('srPlaceFlag').textContent = isDefaultPlace ? '⚠ check' : '';

  // Durations per selected note
  const durRows = [];
  if(rbt){
    if(document.getElementById('chk97153')?.checked){
      const _d97153 = document.getElementById('dur97153')?.value||'';
      const _u97153 = _d97153 ? ` (${DUR_UNITS[_d97153]||'?'} units)` : '';
      durRows.push({code:'CPT-97153 — RBT Direct', dur: _d97153 ? `${_d97153}${_u97153}` : ''});
    }
  } else {
    if(document.getElementById('chk97155')?.checked)
      durRows.push({code:'CPT-97155', dur:document.getElementById('dur97155')?.value||''});
    if(document.getElementById('chk97156')?.checked)
      durRows.push({code:'CPT-97156 — Parent Training', dur:document.getElementById('dur97156')?.value||''});
    if(document.getElementById('chkSup')?.checked)
      // Leaving the supervision time blank is a legitimate choice, not an oversight:
      // it is how the user keeps a time out of the document when the supervision did
      // not span the whole session. Flagged as optional, never as a missing field.
      durRows.push({code:'Supervision Log', dur:document.getElementById('durSup')?.value||'', optional:true});
  }
  document.getElementById('srDurRows').innerHTML = durRows.map(r=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border-radius:7px;margin-bottom:4px">
      <div style="font-size:13px;color:var(--text2)">${esc(r.code)}</div>
      <div style="font-weight:700;font-size:14px;color:${r.dur?'var(--blue)':(r.optional?'var(--text3)':'#dc2626')}">${r.dur||(r.optional?'sin tiempo (no se indicará)':'⚠ not set')}</div>
    </div>`).join('');

  // Participants
  const parts = getParticipants();
  const partLabels={client:'Client',supervisor:'Supervisor',technician:'Technician',caregiver:'Caregiver/Parent'};
  document.getElementById('srParticipantsList').textContent = parts.map(p=>partLabels[p]||p).join(', ')||'None selected';

  // Behavior frequency counts — only the behaviors selected for THIS session (rotation)
  const freqSection = document.getElementById('srFreqSection');
  const freqRows = document.getElementById('srFreqRows');
  const _isSrRbt = isRBT();
  // Generate 97155/97156 count is proportional to duration: short session (<1h) -> 1+1, else 2+2.
  const _srDur = (document.getElementById('dur97155')?.value) || (document.getElementById('dur97156')?.value) || '';
  const _srShort = (function(){ const h=_durationToHours(_srDur); return h!==null && h<1; })();
  // RBT 97153: 3+3 as the baseline, but a long session cannot be documented with the
  // same amount of content as a short one — five hours of direct treatment showing
  // three behaviors reads as an under-documented session to an auditor. From 5 hours
  // the minimum rises to 4+4. Uses the 97153 duration, which is the one that applies
  // to an RBT: the other two fields are empty in an RBT run.
  const _srDur153 = document.getElementById('dur97153')?.value || '';
  const _srLong153 = (function(){ const h=_durationToHours(_srDur153); return h !== null && h >= RBT_LONG_SESSION_HOURS; })();
  const _srN = _isSrRbt ? (_srLong153 ? 4 : 3) : (_srShort ? 1 : 2);
  const rotCtxPreview = selectBehaviorsSmart(clientId, pools, _srN, _srN);
  // LOCK this selection — generateSession MUST use the same behaviors shown in the modal
  window._lockedRotCtx = rotCtxPreview;
  const freqBehaviors = rotCtxPreview && rotCtxPreview.mal && rotCtxPreview.mal.length
    ? rotCtxPreview.mal
    : getActiveBehaviors(pools,'mal');
  if(freqBehaviors.length){
    freqSection.style.display='block';
    freqRows.innerHTML = freqBehaviors.map((b,i)=>`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="flex:1;font-size:12px;color:var(--text2);line-height:1.3">${esc(b)}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" id="freq_${i}" min="0" max="999" placeholder="—"
            style="width:58px;padding:5px 8px;border:1px solid var(--border2);border-radius:6px;font-size:13px;font-weight:600;text-align:center;background:var(--surface);color:var(--text);font-family:var(--mono);outline:none">
          <span style="font-size:11px;color:var(--text3)">episodes</span>
        </div>
      </div>`).join('') +
      `<div style="display:flex;align-items:center;gap:10px;margin-top:6px;padding-top:8px;border-top:1px solid var(--border2)">
        <div style="flex:1;font-size:12px;color:var(--text2)">Total redirections / interventions applied</div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" id="freq_redirections" min="0" max="999" placeholder="—"
            style="width:58px;padding:5px 8px;border:1px solid var(--border2);border-radius:6px;font-size:13px;font-weight:600;text-align:center;background:var(--surface);color:var(--text);font-family:var(--mono);outline:none">
          <span style="font-size:11px;color:var(--text3)">times</span>
        </div>
      </div>`;
    freqRows.dataset.behaviors = JSON.stringify(freqBehaviors);
  } else {
    freqSection.style.display='none';
  }
  // Previous session note — 97155 and 97156 separately; never cross-populate
  const prevPlanSection = document.getElementById('srPrevPlanSection');
  const prevPlanTA = document.getElementById('srPrevPlan');
  const autoplanBadge = document.getElementById('srAutoplanBadge');
  const prevNoteOPPrompt = document.getElementById('srPrevNoteOPPrompt');
  const prevPlanLabel = document.getElementById('srPrevPlanLabel');
  const prevPlanDesc = document.getElementById('srPrevPlanDesc');
  const c_obj = clients.find(c=>c.id===clientId);
  const c_name = c_obj ? c_obj.name : 'this client';
  const _is97156 = durRows.some(r=>r.code && r.code.includes('97156'));
  const _is97155 = durRows.some(r=>r.code && r.code.includes('97155'));
  if(!_isSrRbt && prevPlanSection && prevPlanTA && (_is97155 || _is97156)){
    prevPlanSection.style.display = 'block';
    if(_is97155 && !_is97156){
      // 97155 only: auto-load saved plan paragraph
      if(prevPlanLabel) prevPlanLabel.innerHTML = 'PREVIOUS 97155 SESSION NOTE <span style="font-weight:400;color:var(--text3)">(for plan continuity)</span>';
      if(prevPlanDesc) prevPlanDesc.textContent = 'Provide the previous 97155 analyst session note. The system will extract the plan paragraph from it:';
      const savedPlan = LS.get('aba5_plan_' + clientId) || '';
      if(savedPlan && !prevPlanTA.value){
        prevPlanTA.value = savedPlan;
        if(autoplanBadge) autoplanBadge.style.display = 'inline-block';
      }
      if(prevNoteOPPrompt) prevNoteOPPrompt.textContent =
        'READ ONLY — do not modify, save, or submit anything.\n\n' +
        'Please find and copy the most recent 97155 analyst session note for ' + c_name + ' from OfficePuzzle. ' +
        'Copy the complete text of that note exactly as written. ' +
        'I will paste it into the session generator to track plan continuity for the next 97155 note.';
    } else if(_is97156 && !_is97155){
      // 97156 only: clear any 97155 plan, use 97156 previous note
      if(prevPlanLabel) prevPlanLabel.innerHTML = 'PREVIOUS 97156 CAREGIVER TRAINING NOTE <span style="font-weight:400;color:var(--text3)">(for plan continuity)</span>';
      if(prevPlanDesc) prevPlanDesc.textContent = 'Provide the previous 97156 caregiver training note — not the 97155 note. The system will extract the plan paragraph from it:';
      if(!prevPlanTA.value){
        prevPlanTA.value = '';  // never auto-populate with 97155 plan
        if(autoplanBadge) autoplanBadge.style.display = 'none';
      }
      if(prevNoteOPPrompt) prevNoteOPPrompt.textContent =
        'READ ONLY — do not modify, save, or submit anything.\n\n' +
        'Please find and copy the most recent 97156 caregiver training note for ' + c_name + ' from OfficePuzzle. ' +
        'Copy the complete text of that note exactly as written. ' +
        'I will paste it into the session generator to track plan continuity for the next 97156 note.';
    } else {
      // Both 97155 and 97156 on same session
      if(prevPlanLabel) prevPlanLabel.innerHTML = 'PREVIOUS SESSION NOTES <span style="font-weight:400;color:var(--text3)">(for plan continuity)</span>';
      if(prevPlanDesc) prevPlanDesc.textContent = 'If available, paste the previous 97155 analyst note. The 97156 plan continuity will be handled separately:';
      const savedPlan = LS.get('aba5_plan_' + clientId) || '';
      if(savedPlan && !prevPlanTA.value){
        prevPlanTA.value = savedPlan;
        if(autoplanBadge) autoplanBadge.style.display = 'inline-block';
      }
      if(prevNoteOPPrompt) prevNoteOPPrompt.textContent =
        'READ ONLY — do not modify, save, or submit anything.\n\n' +
        'Please find and copy the most recent 97155 analyst session note for ' + c_name + ' from OfficePuzzle. ' +
        'Copy the complete text of that note exactly as written. ' +
        'I will paste it into the session generator to track plan continuity.';
    }
  } else if(prevPlanSection){
    prevPlanSection.style.display = 'none';
    if(prevPlanTA) prevPlanTA.value = '';
    if(autoplanBadge) autoplanBadge.style.display = 'none';
  }

  // Replacement behavior trial data — RBT (97153) only
  const repSection = document.getElementById('srRepSection');
  const repRows = document.getElementById('srRepRows');
  if(_isSrRbt && repSection && repRows){
    const repBehaviors = (window._lockedRotCtx && window._lockedRotCtx.rep && window._lockedRotCtx.rep.length)
      ? window._lockedRotCtx.rep
      : getActiveBehaviors(pools,'rep');
    if(repBehaviors.length){
      repSection.style.display='block';
      repRows.innerHTML = repBehaviors.map((r,i)=>`
        <div style='display:flex;align-items:center;gap:8px;margin-bottom:6px'>
          <div style='flex:1;font-size:12px;color:var(--text2);line-height:1.3'>${esc(r)}</div>
          <div style='display:flex;align-items:center;gap:4px'>
            <input type='number' id='rep_correct_${i}' min='0' max='99' placeholder='—'
              style='width:46px;padding:5px 6px;border:1px solid var(--border2);border-radius:6px;font-size:13px;font-weight:600;text-align:center;background:var(--surface);color:var(--text);font-family:var(--mono);outline:none'>
            <span style='font-size:11px;color:var(--text3)'>correct /</span>
            <input type='number' id='rep_total_${i}' min='1' max='99' value='10'
              style='width:46px;padding:5px 6px;border:1px solid var(--border2);border-radius:6px;font-size:13px;font-weight:600;text-align:center;background:var(--surface);color:var(--text);font-family:var(--mono);outline:none'>
            <span style='font-size:11px;color:var(--text3)'>trials</span>
          </div>
        </div>`).join('');
      repRows.dataset.behaviors = JSON.stringify(repBehaviors);
    } else {
      repSection.style.display='none';
    }
  } else if(repSection){
    repSection.style.display='none';
  }
  // Environmental / Medical context
  const env = document.getElementById('envChanges')?.value.trim()||'';
  const med = document.getElementById('medConcerns')?.value.trim()||'';
  const ctxRow = document.getElementById('srContextRow');
  if(env||med){
    ctxRow.style.display='block';
    document.getElementById('srContextText').innerHTML =
      (env?`<strong>Environmental:</strong> ${esc(env)}<br>`:'')+
      (med?`<strong>Medical:</strong> ${esc(med)}`:'');
  } else { ctxRow.style.display='none'; }

  // Clinical warnings
  const mal=getActiveBehaviors(pools,'mal'), rep=getActiveBehaviors(pools,'rep');
  const warns=[];
  if(!summary&&!mal.length) warns.push('No clinical summary and no active behaviors configured.');
  else if(!summary) warns.push('No clinical summary — note will rely on behavior chips only.');
  if(!mal.length) warns.push('No active maladaptive behaviors configured.');
  if(!rep.length) warns.push('No active replacement behaviors — required for Medicaid audit.');
  if(!durRows.length) warns.push('No note types selected.');
  const warnEl=document.getElementById('srWarnings');
  if(warns.length){
    warnEl.style.display='block';
    document.getElementById('srWarningText').innerHTML=warns.map(w=>`⚠ ${esc(w)}`).join('<br>');
  } else { warnEl.style.display='none'; }

  document.getElementById('sessionReviewModal').style.display='flex';
}

function sessionTemplateToPromptSection(tmpl, cred){
  if(!tmpl) return '';
  const lines=[];

  // Component-specific explanation templates for "Adjustments" section
  const componentDetail = {
    'Treatment targets': 'For "Treatment targets": describe which specific target behavior(s) were added, removed, or modified; state the observable rationale (e.g., mastery criteria met, behavior no longer clinically relevant, new priority behavior identified).',
    'Treatment goals': 'For "Treatment goals": describe how the short-term objective (STO) or long-term goal was adjusted; state the data point or clinical observation that justified the change.',
    'Observation and/or measurement': 'For "Observation and/or measurement": describe the change in measurement procedure (e.g., frequency to duration recording, interval to event recording); explain why the previous method was insufficient and how the new method better captures the behavior.',
    'Reinforcers': 'For "Reinforcers": describe which reinforcers were added, removed, or exchanged; reference any preference assessment data or observed changes in reinforcer efficacy that prompted the change.',
    'Reinforcer delivery': 'For "Reinforcer delivery": describe the change to the delivery schedule or contingency (e.g., CRF thinned to FR2, immediate delivery changed to delayed); state the clinical rationale and expected effect on behavior.',
    'Prompts': 'For "Prompts": describe the change to the prompt hierarchy (e.g., prompt faded from partial physical to gestural, or increased from gestural to vocal due to regression); state the performance data that supported the decision.',
    'Instruction': 'For "Instruction": describe the change to how the SD or instruction is delivered (e.g., shortened instruction, added visual cue, changed vocal tone or format); state the clinical rationale.',
    'Materials': 'For "Materials": describe which materials were changed and why (e.g., stimulus fading, use of naturalistic materials, removal of prompting stimuli); reference the learning objective supported by the change.',
    'Discriminative stimuli': 'For "Discriminative stimuli": describe the change to the SD or antecedent stimulus (e.g., altered SD wording, new stimulus added, distractors introduced for discrimination training); state how this advances the treatment goal.',
    'Contextual variables': 'For "Contextual variables": describe the environmental or contextual change made (e.g., setting, activity, number of people present, noise level, time of day); explain how this variable was affecting performance and what the modification is expected to achieve.'
  };

  if(tmpl.faceToFace&&tmpl.faceToFace.resultText){
    let line='Face-to-face observations were made to determine if protocol components are functioning effectively for the client or require adjustments. '+tmpl.faceToFace.resultText;
    if(tmpl.faceToFace.aComponents&&tmpl.faceToFace.aComponents.length){
      line+=' The following protocol components were identified as requiring adjustment: '+tmpl.faceToFace.aComponents.join(', ')+'.';
      // Add detailed instruction per component
      const details = tmpl.faceToFace.aComponents
        .map(c => componentDetail[c])
        .filter(Boolean);
      if(details.length) line += '\nFor each identified component, explain in the note: ' + details.join(' ');
    }
    lines.push(line);
  }

  if(tmpl.adjustments&&tmpl.adjustments.components.length){
    let adj = 'Adjustments were made to the following components of the protocol: '+tmpl.adjustments.components.join(', ')+'.';
    // Add per-component detail instructions
    const details = tmpl.adjustments.components
      .map(c => componentDetail[c])
      .filter(Boolean);
    if(details.length){
      adj += '\nFor each adjusted component, the note must include a specific explanation: ' + details.join(' ');
    }
    lines.push(adj);
  }

  if(tmpl.activeDirection&&tmpl.activeDirection.actions.length){
    // Only include active direction in supervision notes — never in direct BCBA sessions
    if(tmpl._isDirect) { /* skip */ } else {
      lines.push('Active direction (face-to-face) was given to a technician as they delivered ABA services. Specific actions included: '+tmpl.activeDirection.actions.join(' '));
    }
  }
  if(tmpl.qhpImplementation&&tmpl.qhpImplementation.resultText){
    lines.push('QHP implementation of the protocol with the client related to: '+tmpl.qhpImplementation.resultText);
  }
  return lines.join('\n');
}



async function generateSession(freqCounts, trialCounts, prevPlanText){
  const clientId=document.getElementById('genClientSel').value;
  // Independent random variant per structural element — avoids mechanical patterns
  const _rnd = () => Math.floor(Math.random() * 6) + 1;
  const _variantNum = _rnd();  // kept for legacy references
  const _structVars = {
    opening:  _rnd(),   // V1-V6 opening sentence
    bhvIntro: _rnd(),   // V1-V6 behavior paragraph intro
    antIntro: _rnd(),   // A1-A5 antecedent intro (mod 5 + 1)
    repIntro: _rnd(),   // V1-V6 replacement program intro
    dataSent: _rnd(),   // V1-V6 data monitoring sentence
    closing:  _rnd()    // V1-V6 RBT closing phrase
  };
  if(!clientId){showMsg('genMsg','Select a client first.','err');return;}

  const validation = validateSessionConsistency();
  if(validation.errors.length > 0){
    const errorMsgs = validation.errors.map(err => err.msg + ' ' + err.fix).join('\n\n');
    showMsg('genMsg', 'VALIDATION ERRORS:\n\n' + errorMsgs, 'err');
    return;
  }

  let trialLine = '';
  if(trialCounts && Object.keys(trialCounts).length){
    const tlines = [];
    Object.entries(trialCounts).forEach(([r,d])=>{
      const pct = d.total > 0 ? Math.round((d.correct/d.total)*100) : 0;
      tlines.push(`${r}: ${d.correct}/${d.total} trials correct (${pct}%)`);
    });
    trialLine = `\nREPLACEMENT PROGRAM TRIAL DATA (use these exact numbers in the note — do not omit or change them):\n${tlines.join('\n')}`;
  }

  let freqLine = '';
  if(freqCounts && Object.keys(freqCounts).length){
    const lines = [];
    Object.entries(freqCounts).forEach(([b,n])=>{
      if(b==='_redirections') lines.push(`[INTERNAL REFERENCE METRIC — do NOT write this number in the note] Approximate intervention/redirection activity level this session: ${n}. Use only to calibrate how much intervention to describe qualitatively; never state the count.`);
      else lines.push(`${b}: ${n} episode${n!==1?'s':''}`);
    });
    freqLine = `\nSESSION FREQUENCY DATA (use these exact counts in the note — do not round, change, or omit them):\n${lines.join('\n')}\nCRITICAL: If a behavior does not appear in this list, it was not provided with a count. Do NOT state 'zero episodes,' 'no occurrences,' or 'was not observed' for any behavior not listed here. Simply do not mention it, or if it must be referenced in context, state only that it was addressed without quantifying.`;
  }

  const c=clients.find(x=>x.id===clientId);
  const dt=document.getElementById('genDate').value||today();
  const place=document.getElementById('genPlace').value;
  const placeLabels={
    'Home (12)':"the client's home",
    'Office/Clinic (11)':'the clinic',
    'School (03)':'school',
    'Community (99)':'the community',
    'Daycare (12)':'daycare',
    'After School (99)':'an after-school setting',
    'Other (99)':'the service location'
  };
  const placeForNote = placeLabels[place] || place.replace(/\s*\(\d+\)\s*/,'').trim();
  const activeC=clients.find(x=>x.id===clientId);
  if(activeC){
    const planArea=document.getElementById('cPlanSummary');
    const textareaVal=planArea&&activeClientId===clientId?planArea.value.trim():'';
    if(textareaVal) LS.set('aba5_sum_'+clientId, textareaVal);
  }
  const summary=LS.get('aba5_sum_'+clientId)||'';
  const pools=LS.get('aba5_pools_'+clientId)||{};
  const rbt=isRBT();

  const sessionTasks={};
  const codeLabelMap={'97155':'CPT-97155','97156':'CPT-97156','sup':'Supervision Log','97153':'CPT-97153'};

  const envChanges = document.getElementById('envChanges')?.value.trim() || '';
  const medConcerns = document.getElementById('medConcerns')?.value.trim() || '';
  const crisisSituation = document.getElementById('crisisSituation')?.value.trim() || '';
  const emergingItems = getEmergingItems();
  const sessionOrder = document.getElementById('sessionOrder')?.value || 'none';

  const therapistObj = getTherapistForClient(clientId);
  const supervisorCred = therapistObj ? therapistObj.credential : 'BCBA';
  const includeDuration = therapistObj ? therapistObj.includeDuration !== false : true;
  const dataOnly156 = therapistObj ? !!therapistObj.dataOnly156 : false;
  const participantsList = getParticipants();

  if(window._lastSession && window._lastSession.clientId !== clientId){
    _sessionCount = 0;
  }

  if(rbt){
    if(document.getElementById('chk97153')?.checked){
      // Sin bloqueo por MFC: la nota se genera con la información seleccionada. El mapa funcional se deriva de la config para inyección/validación cuando no hay uno guardado; los guardarraíles de reforzador-por-función siguen corriendo.
      const _raw97153 = document.getElementById('dur97153')?.value;
      const dur = (_raw97153 === undefined || _raw97153 === null) ? '' : _raw97153;
      const rotCtx153 = (window._lockedRotCtx && window._lockedRotCtx.mal && window._lockedRotCtx.mal.length)
        ? window._lockedRotCtx : null;
      window._lockedRotCtx = null;
      sessionTasks['97153']={ntId:'97153',variantNum:_variantNum,structVars:_structVars,dur,goals:null,rotCtx:rotCtx153,supervisorCred,participantsList,includeDuration,envChanges,medConcerns,crisisSituation,freqLine,trialLine,emergingItems};
    }
  }else{
    const sup=getSupType();
    const rotCtx155 = (window._lockedRotCtx && window._lockedRotCtx.mal && window._lockedRotCtx.mal.length)
      ? window._lockedRotCtx
      : (function(){ const _d=document.getElementById('dur97155')?.value||''; const h=_durationToHours(_d); const n=(h!==null&&h<1)?1:2; return selectBehaviorsSmart(clientId, pools, n, n); })(); // Generate 97155: <1h -> 1+1, else 2+2
    window._lockedRotCtx = null;

    // Get dur97155 first so it can be used by both 97155 and supervision
    const dur97155 = document.getElementById('dur97155')?.value || '';

    if(document.getElementById('chk97155').checked){
      _currentSessTmpl = null;
      const caspSections = sup==='direct' ? null : getCaspSections();
      const sessTmpl = null;
      const ntId=sup==='bcaba'?'97155-bcaba':sup==='direct'?'97155-direct':'97155-rbt';
      const supLabel = sup==='bcaba'?'BCaBA':sup==='direct'?null:'RBT';
      const customGoalsTxt = getCustomGoals97155();
      const _goals97155base = customGoalsTxt
        ? { type:'97155', g1: customGoalsTxt, g2: null, g3: null, g4: null, _custom: true }
        : selectGoalsSmart(ntId, clientId);
      const goals97155 = ntId === '97155-direct'
        ? (({g3, ..._rest}) => _rest)(_goals97155base)
        : _goals97155base;
      // Capture BCaBA supervision factors (only when supType is bcaba)
      const bcabaSupBlock = (sup==='bcaba') ? _buildBcabaSupPromptBlock('') : '';
      sessionTasks['97155']={ntId,variantNum:_variantNum,structVars:_structVars,dur:dur97155,goals:goals97155,rotCtx:rotCtx155,sessTmpl,caspSections,supervisorCred,participantsList,includeDuration,dataOnly156,envChanges,medConcerns,crisisSituation,freqLine,emergingItems,prevPlanText:prevPlanText||'',bcabaSupBlock};
    }
    if(document.getElementById('chk97156').checked){
      const used155mal = rotCtx155 ? (rotCtx155.mal||[]) : [];
      const used155rep = rotCtx155 ? (rotCtx155.rep||[]) : [];
      const allMal = getActiveBehaviors(pools,'mal');
      const allRep = getActiveBehaviors(pools,'rep');
      // 97156 must ROTATE like every other note. It previously took .slice(0,2) —
      // always the first two of the pool — so caregiver-training notes kept
      // repeating the same replacements. Use the recency-weighted engine instead,
      // still preferring items not already used in the 97155 of the same session.
      const _h156 = getHistory(clientId);
      const _pickRot = (all, excluded, usage, n) => {
        const avail = all.filter(b => !excluded.includes(b));
        const pool = avail.length >= 1 ? avail : all;   // fall back if 97155 used everything
        return rotatingPick(pool, usage || [], Math.min(n, pool.length));
      };
      const rotCtx156 = {
        mal: _pickRot(allMal, used155mal, _h156.mal, 2),
        rep: _pickRot(allRep, used155rep, _h156.rep, 2)
      };
      const chk155active = document.getElementById('chk97155')?.checked;
      const rbt156checked = document.getElementById('rbtPresent156')?.checked;
      let participantsList156 = participantsList;
      if(chk155active){
        const cp156 = document.getElementById('clientPresent156')?.checked;
        participantsList156 = ['supervisor','caregiver'];
        if(cp156) participantsList156.unshift('client');
        if(rbt156checked) participantsList156.push('technician');
      } else {
        participantsList156 = participantsList.filter(p=>p!=='technician');
        if(rbt156checked) participantsList156.push('technician');
      }
      const customGoals156 = getCustomGoals156();
      const goals156 = customGoals156
        ? { type:'97156', p156: [customGoals156], _custom: true }
        : selectGoalsSmart('97156',clientId);
      sessionTasks['97156']={ntId:'97156',variantNum:_variantNum,structVars:_structVars,dur:document.getElementById('dur97156').value,goals:goals156,rotCtx:rotCtx156,excludedBehaviors:{mal:used155mal,rep:used155rep},supervisorCred,participantsList:participantsList156,includeDuration,envChanges,medConcerns,crisisSituation,freqLine,emergingItems,sessionOrder};
    }
    if(document.getElementById('chkSup').checked){
      const supNtId=sup==='bcaba'?'supervision-bcaba':'supervision';
      // NO FALLBACK TO THE 97155 DURATION. The supervision time and the 97155 session
      // time are different quantities: a 97155 session may contain supervision without
      // the whole session being supervision. Inheriting the 97155 duration made the
      // stored record assert that the supervision lasted the entire session, and it
      // overrode the deliberate choice of leaving it unspecified so no time is stated.
      const supDur = document.getElementById('durSup')?.value || '';
      // El Supervision Log ES el documento de supervision: si se marcaron componentes
      // BACB para esta sesion, tienen que llegar aqui, no solo a la nota 97155.
      const supBcabaBlock = (sup==='bcaba') ? _buildBcabaSupPromptBlock('') : '';
      sessionTasks['sup']={ntId:supNtId,dur:supDur,bcabaSupBlock:supBcabaBlock,goals:selectGoalsSmart('supervision',clientId),rotCtx:rotCtx155,supervisorCred,participantsList,includeDuration,dataOnly156,envChanges,medConcerns,crisisSituation,freqLine,emergingItems};
    }
  }

  const keys=Object.keys(sessionTasks);
  if(!keys.length)return;

  const btn=document.getElementById('genBtn');
  const sp=document.getElementById('genSpinner');
  btn.disabled=true; sp.style.display='inline-block';
  showMsg('genMsg','','warn',0);
  const container=document.getElementById('outputsContainer');
  const meta=`${place} · ${dt}`;
  container.innerHTML=keys.map(k=>{
    const t=sessionTasks[k];
    const goalsTxt=t.goals?goalsString(t.goals, t.ntId==='97155-direct'):'';
    const servicesTxt = k==='97155'
      ? (t.caspSections ? caspSectionsToServicesList(t.caspSections) : (t.sessTmpl ? sessionTemplateToServicesList(t.sessTmpl) : ''))
      : '';
    // Sin duracion, la cabecera quedaba en "CPT-97156 · " con el separador colgando,
    // que se lee como un campo que no cargo. El separador solo aparece si hay valor.
    return makeOutputBlock(k,codeLabelMap[k]+(t.dur?` · ${t.dur}`:''),meta,goalsTxt,servicesTxt, k==='97153', k==='97155');
  }).join('');
  container.scrollIntoView({behavior:'smooth',block:'start'});
  document.getElementById('highlightLegend').style.display='block';

  window._lastSession={sessionTasks,c,dt,place,placeForNote,summary,pools,clientId};

  const treatmentKeys = keys.filter(k => k !== 'sup');
  const supKey = keys.includes('sup') ? 'sup' : null;

  async function generateOne(k){
    const t=sessionTasks[k];
    try{
      const isDirectNote = t.ntId==='97155-direct';
      // A supervision log is NOT a session note. Using SYS (the full session-note
      // system prompt, with its mandatory ABC sequences, client-response paragraph,
      // medical necessity and closing phrases) pushed the model to produce another
      // session note. SYS_SECTION is the brief 2-paragraph narrative contract.
      const isSupNote = (t.ntId === 'supervision' || t.ntId === 'supervision-bcaba');
      const sys = isDirectNote ? SYS_DIRECT : (isSupNote ? SYS_SECTION : SYS);
      const noteSummary = isDirectNote
        ? summary.split(/[.\n]/).filter(s=>!/\bRBT\b|technician|supervisee/i.test(s)).join('. ')
        : summary;

      if(k==='97155' && t.caspSections){
        const supLabel97155 = t.ntId==='97155-bcaba' ? 'BCaBA' : t.ntId==='97155-direct' ? null : 'RBT';
        const rotCtxForSection = t.rotCtx||{};
        const sessionMal = rotCtxForSection.mal||[];
        const sessionRep = rotCtxForSection.rep||[];
        const clinicalSummaryCtx = noteSummary
          ? `CLINICAL CONTEXT:\n${noteSummary}\n\n`
          : (sessionMal.length ? `CLIENT BEHAVIORAL PROFILE:\nMaladaptive behaviors (bracketed function is for INTERNAL intervention-matching only — never write it in the note): ${annotateBehaviorsWithFn(sessionMal, getBehaviorFnMap(pools||{})).join(', ')}\nReplacement targets: ${sessionRep.join(', ')}\n\n` : '');
        const minimalCtx = `${clinicalSummaryCtx}CLIENT: ${c.name}\nCRITICAL — CLIENT NAME: Spell the client's name EXACTLY as "${c.name}" every single time it appears in the note. Do NOT alter, abbreviate, or vary the spelling. Use this exact spelling consistently throughout.\nDATE: ${dt}\nPLACE OF SERVICE: ${placeForNote}\nDURATION: ${t.dur}\nSUPERVISOR: ${supLabel97155 ? 'the BCBA / the '+supLabel97155 : 'the BCBA'}\n\nBehaviors this session (bracketed function is for INTERNAL intervention-matching only — never write the function label in the note): ${annotateBehaviorsWithFn(sessionMal, getBehaviorFnMap(pools||{})).join(', ')||'see clinical context'}\nReplacements this session: ${sessionRep.join(', ')||'see clinical context'}`;

        const fullNotePrompt = buildUserPrompt(t.ntId,c,t.goals,t.dur,dt,placeForNote,noteSummary,pools,t.rotCtx,null,t.supervisorCred||'BCBA',t.participantsList||[],t.includeDuration,t.excludedBehaviors||null,t.envChanges||'',t.medConcerns||'',t.crisisSituation||'',t.freqLine||'',t.emergingItems||null,null,t.sessionOrder||'none',!!t.dataOnly156,t.prevPlanText||'',t.structVars||null);

        const sectionPrompts = getCaspSectionPrompts(t.caspSections, supLabel97155, minimalCtx, sessionMal, sessionRep, t.goals?goalsString(t.goals, t.ntId==='97155-direct'):'', c.name, fullNotePrompt);

        if(sectionPrompts.length){
          const hlPools = LS.get('aba5_pools_'+clientId)||{};
          const box = document.getElementById('box-'+k);
          const legendBox = document.getElementById('casp-legend-'+k);
          const legendItems = document.getElementById('casp-legend-items-'+k);
          const allSections = ['A','B','C','D'].filter(s=>t.caspSections[s]);

          if(legendBox && legendItems){
            legendItems.innerHTML = allSections.map(s=>`
              <span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;font-size:11px;color:var(--text2)">
                <span style="display:inline-block;width:14px;height:8px;border-radius:2px;background:${CASP_META[s].bg};border-bottom:2px solid ${CASP_META[s].border}"></span>${CASP_META[s].label}
              </span>`).join('');
            legendBox.style.display='block';
          }

          document.getElementById('loading-'+k).style.display='none';
          if(box) box.style.display='block';

          let combinedPlainText = '';
          let combinedHtml = '';

          for(const {sectionKey, prompt} of sectionPrompts){
            const isGeneralNote = sectionKey==='NOTE';
            const m = isGeneralNote
              ? {bg:'var(--bg)', border:'var(--border2)', label:'General Session Note', bg2:'var(--surface)'}
              : CASP_META[sectionKey];

            const loadingId = `casp-loading-${k}-${sectionKey}`;
            const sectionLoading = `<div id="${loadingId}" style="background:${m.bg};border-left:3px solid ${m.border};border-radius:4px;padding:8px 12px;margin:6px 0;font-size:11px;color:var(--text3);"><span class="spinner spinner-dark" style="display:inline-block;margin-right:5px;width:10px;height:10px;border-width:1.5px"></span>${isGeneralNote ? 'Generating complete session note…' : `§${sectionKey} — ${m.label} generating…`}</div>`;
            combinedHtml += sectionLoading;
            if(box) box.innerHTML = combinedHtml;

            // Deterministic budget: reasoning capped at 1024 (quality preserved),
            // guaranteed ~600 tokens for visible text — no truncation, no runaway.
            const sectionMaxTokens = isGeneralNote ? 32768 : 1700;
            const sectionThinking  = isGeneralNote ? NOTE_THINKING_BUDGET : 1024;
            // CRITICAL: sections use their OWN lightweight system prompt — the
            // full-note SYS would override the section instructions.
            const sectionSys = isGeneralNote ? sys : SYS_SECTION;
            const _ssb = isGeneralNote ? _shortSessionBlock(t.dur, t.ntId) : '';
            let sectionText = await callAPI(prompt + _ssb, sectionSys, k, clientId, sectionMaxTokens, sectionThinking);
            // If the complete session note was cut off by the token limit, retry once at max budget.
            if(_lastTruncated && isGeneralNote){
              console.warn('[Generate] Complete note truncated — retrying at maximum budget.');
              const retryText = await callAPI(prompt + _ssb, sectionSys, k, clientId, 65536, sectionThinking);
              if(retryText){
                if(!_lastTruncated){ sectionText = retryText; }
                else if(retryText.length >= sectionText.length){ sectionText = retryText; }
              }
              if(_lastTruncated){
                const gm = document.getElementById('genMsg');
                if(gm){ gm.textContent='⚠ La nota es muy extensa y pudo quedar truncada. Si termina a media frase, reduce el contenido/goals seleccionado y vuelve a generar.'; gm.className='msg err'; }
              }
            }
            combinedPlainText += (combinedPlainText ? '\n\n---\n\n' : '') + sectionText.trim();

            const highlighted = highlightNoteText(sectionText.trim(), c.name, hlPools);
            const label = isGeneralNote ? 'COMPLETE SESSION NOTE' : `§${sectionKey} — ${m.label.toUpperCase()}`;
            const borderLeft = isGeneralNote ? '3px solid var(--text3)' : `3px solid ${m.border}`;
            const bg = isGeneralNote ? 'var(--surface)' : m.bg;
            const headerColor = isGeneralNote ? 'var(--text2)' : m.border;

            const sectionBlock = `<div style="background:${bg};border-left:${borderLeft};border-radius:4px;padding:10px 14px;margin:6px 0">
              <div style="font-size:10px;font-family:var(--mono);font-weight:700;color:${headerColor};letter-spacing:.05em;margin-bottom:5px">${label}</div>
              <div style="font-size:13px;line-height:1.65;color:var(--text)">${highlighted.split('\n').filter(l=>l.trim()).map(l=>`<p style="margin:0 0 6px">${l}</p>`).join('')}</div>
            </div>`;
            combinedHtml = combinedHtml.replace(sectionLoading, sectionBlock);
            if(box) box.innerHTML = combinedHtml;
          }

          sessionTasks[k].lastText = combinedPlainText;
          saveNoteToHistory(clientId, k, dt, t.dur, combinedPlainText);
          if(k !== '97153'){
            const planMatch = combinedPlainText.match(/For the next session[^\n]*(?:\n(?![A-Z][^\n]*:)[^\n]+)*/i);
            if(planMatch) LS.set('aba5_plan_' + clientId, planMatch[0].trim());
          }
          _sessionCount++;
          _postNoteChecks(combinedPlainText, clientId, 'genMsg');
          if(k==='97153') _warn97153Language(combinedPlainText, 'genMsg');
          if(k==='97153' && typeof _warnMfcAudit==='function') _warnMfcAudit(combinedPlainText, clientId, 'genMsg');
          document.getElementById('foot-'+k).style.display='flex';
          return;
        }
      }

      let prompt;
      if(k==='97153'){
        prompt=build97153Prompt(c,t.dur,dt,placeForNote,noteSummary,pools,t.rotCtx||null,t.includeDuration,t.envChanges||'',t.medConcerns||'',t.crisisSituation||'',t.freqLine||'',t.trialLine||'',t.emergingItems||null,t.participantsList||[]);
      }else{
        prompt=buildUserPrompt(t.ntId,c,t.goals,t.dur,dt,placeForNote,noteSummary,pools,t.rotCtx,t.sessTmpl||null,t.supervisorCred||'BCBA',t.participantsList||[],t.includeDuration,t.excludedBehaviors||null,t.envChanges||'',t.medConcerns||'',t.crisisSituation||'',t.freqLine||'',t.emergingItems||null,t.caspSections||null,t.sessionOrder||'none',!!t.dataOnly156,t.prevPlanText||'',t.structVars||null);
      }
      if(t.bcabaSupBlock) prompt += t.bcabaSupBlock;
      // Every note type gets the same room. 8192 for anything other than 97155 was
      // barely more than the thinking budget itself, so the 97156 and the Supervision
      // Log were being truncated by chance.
      let text=await callAPI(prompt, sys, k, clientId, 32768, NOTE_THINKING_BUDGET);
      // If the note was cut off by the token limit, retry once with the maximum budget.
      // This used to run for 97155 ONLY: a truncated 97156 was handed over silently and
      // the user had to notice it and regenerate by hand.
      if(_lastTruncated){
        console.warn('['+k+'] Note truncated — retrying with maximum token budget.');
        _showRetryStatus && _showRetryStatus('La nota '+k+' se cortó; reintentando con más espacio…');
        const text2 = await callAPI(prompt, sys, k, clientId, 65536, NOTE_THINKING_BUDGET);
        _clearRetryStatus && _clearRetryStatus();
        if(text2){
          if(!_lastTruncated){ text = text2; }
          else if(text2.length >= text.length){ text = text2; }
        }
        if(_lastTruncated){
          // Still truncated even at max budget — warn the user rather than deliver a silent cut-off note.
          showMsg('genMsg','⚠ La nota '+k+' es muy extensa y pudo quedar truncada incluso con el máximo de tokens. Revísala: si termina a media frase, reduce la cantidad de goals/contenido seleccionado y vuelve a generar.','err');
        }
      }
      // Quitar cualquier checklist de autoverificacion antes de nada mas.
      var _sa = (typeof _stripSelfAudit==='function') ? _stripSelfAudit(text) : null;
      if(_sa && _sa.cut){ text = _sa.text; showMsg('genMsg','\u26A0 Se elimin\u00F3 una lista de autoverificaci\u00F3n que el modelo a\u00F1adi\u00F3 al final de la nota. Revisa que la nota est\u00E9 completa.','err',0); }
      if(k==='97153') text = parseAndRenderInterventions(text, k, clientId);
      // HARD guard: strip any invented performance number from the 97153 note (only
      // numbers present in the provided frequency/trial data are authorized).
      var _scrub153 = (typeof _scrub97153Numbers==='function') ? _scrub97153Numbers(text, (t.freqLine||'')+' '+(t.trialLine||'')) : null;
      if(_scrub153) text = _scrub153.text;
      var _pol = (typeof _polishNoteText==='function') ? _polishNoteText(text) : null;
      if(_pol) text = _pol.text;
      sessionTasks[k].lastText=text;
      saveNoteToHistory(clientId, k, dt, t.dur, text);
      if(k !== '97153'){
        const planMatch2 = text.match(/For the next session[^\n]*(?:\n(?![A-Z][^\n]*:)[^\n]+)*/i);
        if(planMatch2) LS.set('aba5_plan_' + clientId, planMatch2[0].trim());
      }
      _sessionCount++;
      document.getElementById('loading-'+k).style.display='none';
      const box=document.getElementById('box-'+k);
      const hlPools=LS.get('aba5_pools_'+clientId)||{};
      box.innerHTML=highlightNoteText(text,c.name,hlPools);
      box.style.display='block';
      _postNoteChecks(text, clientId, 'genMsg');
      if(k==='97153') _warn97153Language(text, 'genMsg');
      if(k==='97153' && typeof _warnMfcAudit==='function') _warnMfcAudit(text, clientId, 'genMsg');
      // Safety net: a supervision log that came back looking like a session note.
      if(isSupNote){
        var _sessionish = [/place of service/i, /for the next session/i, /duration of services/i,
                           /\bantecedent\b/i, /medical necessity/i, /reinforcement schedule/i]
                          .filter(function(re){ return re.test(text); });
        if(_sessionish.length >= 2){
          showMsg('genMsg','\u26A0 La nota de SUPERVISI\u00D3N sali\u00F3 con contenido de nota de sesi\u00F3n (lugar, antecedentes, plan\u2026). Reg\u00E9nerala; si se repite, genera primero la 97155 y despu\u00E9s la supervisi\u00F3n.','err',0);
        }
      }
      if(_scrub153 && _scrub153.removed.length){ _recordDefect(clientId, 'numeros'); try{ console.warn('[97153 scrub] removed:', _scrub153.removed); }catch(e){} showMsg('genMsg','🧹 97153 — se eliminaron cifras no documentadas y se reemplazaron por lenguaje cualitativo: "'+_scrub153.removed.slice(0,6).join('", "')+'". Verifica que la redacción quede bien.','err',0); }
      document.getElementById('foot-'+k).style.display='flex';
    }catch(err){
      document.getElementById('loading-'+k).textContent='Error: '+err.message;
    }
  }

  await Promise.all(treatmentKeys.map(k=>generateOne(k)));
  if(supKey){ await generateOne(supKey); }

  if(rbt){
    const t=sessionTasks['97153'];
    if(t){
      const recordedMal = t.rotCtx?.mal || [];
      const recordedRep = t.rotCtx?.rep || [];
      recordSessionHistory(clientId,{mal:recordedMal,rep:recordedRep,goals:null,codes:['97153']});
    }
  }else{
    // Each note must record ITS OWN rotation context. Previously this took the
    // first rotCtx found (the 97155's) and recorded it for every note, so what the
    // 97156 actually used never entered the history and its rotation could never
    // advance. Fall back to the shared context only if a note has none of its own.
    const _fallbackRot = Object.values(sessionTasks).find(t=>t.rotCtx)?.rotCtx;
    keys.forEach(k=>{
      const t=sessionTasks[k];
      const own = t.rotCtx || _fallbackRot;
      recordSessionHistory(clientId,{mal:own?.mal||[],rep:own?.rep||[],goals:t.goals,codes:[codeLabelMap[k]]});
      // Rotation of the BACB items is recorded ONCE per run. The 97155 and the
      // Supervision Log now carry the same block (both read the same checkboxes), so
      // recording on both would count each item twice and skew the rotation. The sup
      // note records only when no 97155 ran, which is the case when the Supervision
      // Log is generated on its own.
      if(t.bcabaSupBlock && (k==='97155' || (k==='sup' && !sessionTasks['97155']))) _recordBcabaSupUsed(clientId, '');
    });
  }

  renderCoveragePanel(clientId);
  if (activeClientId === clientId) renderNoteHistory(clientId);
  btn.disabled=false; sp.style.display='none';
  showMsg('genMsg','','ok');

  // ── FILOSOFÍA 1: clear inherited session fields after generating ──
  // Prevents a stale date/place/duration/participants/sup-type from a previous
  // session being silently reused on the next note. The user must re-enter them
  // (and confirm) for each new session.
  _clearSessionFields();
}

function makeOutputBlock(id, codeLabel, meta, goalsText, servicesText, showInterventions, showCasp){
  // Este bloque se pega TAL CUAL en el formulario de la plataforma, asi que copiarlo
  // a mano seleccionando el texto invita a llevarse un salto de linea de mas o a
  // dejarse la ultima palabra. Un boton lo copia exacto.
  const goalsHtml=goalsText?`<div class="out-goals"><div class="out-goals-lbl" style="display:flex;justify-content:space-between;align-items:center;gap:8px">Goals — paste into Goals field of session form<button class="btn btn-outline btn-copy-field" data-target="goals-${id}" onclick="copyFieldText('goals-${id}',this)" style="padding:2px 9px;font-size:9px;font-family:var(--sans);letter-spacing:0;text-transform:none">Copiar</button></div><div class="out-goals-val" id="goals-${id}">${esc(goalsText)}</div></div>`:'';
  const servHtml=servicesText?`<div class="out-goals" style="background:#f0fdf4;border-color:#a7f3d0"><div class="out-goals-lbl" style="color:#065f46;display:flex;justify-content:space-between;align-items:center;gap:8px">Services Provided — check in session form<button class="btn btn-outline btn-copy-field" onclick="copyFieldText('services-${id}',this)" style="padding:2px 9px;font-size:9px;font-family:var(--sans);letter-spacing:0;text-transform:none">Copiar</button></div><div class="out-goals-val" style="color:#065f46;white-space:pre-line" id="services-${id}">${esc(servicesText)}</div></div>`:'';
  const intervBox=showInterventions?`<div id="interventions-${id}" style="display:none;margin-top:10px;padding:10px 14px;background:#f0f4ff;border:1px solid #93aee0;border-radius:7px"><div style="font-size:10px;font-family:var(--mono);font-weight:600;color:var(--blue);letter-spacing:.05em;margin-bottom:6px">INTERVENTIONS USED THIS SESSION — PLAN VERIFICATION</div><div id="interventions-list-${id}" style="font-size:12px;line-height:1.7;color:var(--text)"></div></div>`:'';
  const caspLegendBox=`<div id="casp-legend-${id}" style="display:none;margin-top:8px;padding:7px 10px;background:var(--bg);border:1px dashed var(--border2);border-radius:6px;font-size:11px;line-height:1.8"><span style="font-family:var(--mono);font-size:9px;color:var(--text3);letter-spacing:.06em;display:block;margin-bottom:3px">CASP SECTIONS</span><div id="casp-legend-items-${id}"></div></div>`;
  return`<div class="out-block" id="block-${id}">
    <div class="out-block-header">
      <span class="out-block-code">${esc(codeLabel)}</span>
      <span class="out-block-meta">${esc(meta)}</span>
    </div>
    ${goalsHtml}
    ${servHtml}
    <div class="out-sum-lbl">Summary</div>
    <div class="out-loading" id="loading-${id}"><span class="spinner spinner-dark" style="display:inline-block;margin-right:6px"></span>Generating…</div>
    <div class="out-box" id="box-${id}" contenteditable="true" style="display:none"></div>
    ${caspLegendBox}
    ${intervBox}
    <div class="out-foot" id="foot-${id}" style="display:none">
      <button class="btn btn-outline btn-copy-note" onclick="copyBlock('${id}')">📋 Copy note</button>
      <button class="btn btn-outline btn-copy-all" onclick="copyBlockAll('${id}')">📋 Copy all (goals + note)</button>
      <button class="btn btn-secondary" onclick="regenBlock('${id}')">↻ Regenerate</button>
      <button class="btn btn-outline" onclick="analyzeNote('${id}')" style="color:#7c3aed;border-color:#7c3aed;font-size:11px">🔍 Análisis</button>
    </div>
    <div id="analysis-${id}" style="display:none"></div>
  </div>`;
}                      // avisar cuando queda menos de 1 USD

// El contador vive por CUENTA, no por navegador: en un mismo equipo pueden entrar
// dos personas distintas y sus consumos no deben mezclarse.
function _gemWho(){
  try{ return String((CURRENT_USER && CURRENT_USER.email) || '').toLowerCase() || '_'; }catch(e){ return '_'; }
}
function _gemKey(base){ return base + '_' + _gemWho(); }

function _gemCfg(){
  var c = LS.get(_gemKey('aba5_gemcredit')) || {};
  return {
    credit:  typeof c.credit === 'number' ? c.credit : null,   // null = sin declarar
    priceIn: typeof c.priceIn === 'number' ? c.priceIn : GEM_PRICE_DEFAULT.in,
    priceOut:typeof c.priceOut === 'number' ? c.priceOut : GEM_PRICE_DEFAULT.out,
    alertAt: typeof c.alertAt === 'number' ? c.alertAt : GEM_ALERT_DEFAULT,
    // Quien NO carga credito gasta el de otra persona. Mostrarle un saldo no
    // significa nada; lo util es que sepa a quien avisar antes de quedarse parado.
    pays:    typeof c.pays === 'boolean' ? c.pays : null,      // null = sin responder
    payer:   c.payer || '',
    since:   c.since || ''
  };
}
function _gemSaveCfg(patch){
  var c = _gemCfg();
  Object.keys(patch||{}).forEach(function(k){ c[k] = patch[k]; });
  LS.set(_gemKey('aba5_gemcredit'), c);
  _gemRenderBanner();
}
function _gemUse(){
  var u = LS.get(_gemKey('aba5_gemuse')) || {};
  return { inTok: u.inTok||0, outTok: u.outTok||0, calls: u.calls||0, q429: u.q429||0, last: u.last||'' };
}
function _gemSpent(){
  var u = _gemUse(), c = _gemCfg();
  return (u.inTok/1e6)*c.priceIn + (u.outTok/1e6)*c.priceOut;
}
// Reasoning tokens are billed as OUTPUT, and this app runs a large thinking budget:
// leaving them out would understate the spend by a wide margin.
function _gemRecordUsage(meta){
  if(!meta) return;
  var u = _gemUse();
  var inTok  = Number(meta.promptTokenCount||0);
  var outTok = Number(meta.candidatesTokenCount||0) + Number(meta.thoughtsTokenCount||0);
  if(!inTok && !outTok){
    var tot = Number(meta.totalTokenCount||0);
    if(!tot) return;
    outTok = tot;   // sin desglose: se cuenta al precio más alto, nunca a la baja
  }
  u.inTok += inTok; u.outTok += outTok; u.calls++;
  u.last = new Date().toISOString();
  LS.set(_gemKey('aba5_gemuse'), u);
  _gemRenderBanner();
}
function _gemRecord429(){
  var u = _gemUse();
  u.q429++;
  LS.set(_gemKey('aba5_gemuse'), u);
  _gemRenderBanner();
}
function _gemResetUsage(){
  if(!confirm('Vas a poner el contador de consumo a cero. Hazlo cuando acabes de recargar crédito.\n\n¿Continuar?')) return;
  LS.set(_gemKey('aba5_gemuse'), { inTok:0, outTok:0, calls:0, q429:0, last:'' });
  _gemSaveCfg({ since: new Date().toISOString().slice(0,10) });
}

// ════════════════════════════════════════════════════════════
// GEMINI API HELPER
// ════════════════════════════════════════════════════════════
async function callGeminiAPI(prompt, maxTokens = 2500, jsonMode = false, thinkingBudget = null) {
  // The Gemini API key no longer lives in the browser. Calls go through the
  // authenticated Supabase Edge Function 'generate-note', which holds the key
  // as a server-side secret and passes Gemini's status/body through untouched.

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: jsonMode ? 0.2 : 0.7,
      topP: 0.95,
      topK: 64
    }
  };
  // Strict JSON mode: forces the model to return syntactically valid JSON.
  // Used for data extraction where a parseable structure is required.
  if (jsonMode) {
    requestBody.generationConfig.responseMimeType = 'application/json';
  }
  // gemini-2.5-flash is a "thinking" model: reasoning tokens count against
  // maxOutputTokens. For short sections with a tight token budget, the reasoning
  // can consume the whole budget and truncate the visible text mid-sentence.
  // Setting a thinkingBudget (e.g. 0) frees the full budget for visible output.
  if (thinkingBudget !== null) {
    requestBody.generationConfig.thinkingConfig = { thinkingBudget: thinkingBudget };
  }

  // Exponential backoff: Gemini returns 503 (model overloaded), 429 (rate limit) or
  // 500 (transient) when busy. 503 is Google's capacity, not this user's quota, and it
  // arrives in bursts that outlast a 4-step ladder — so it gets more attempts, a longer
  // ceiling, and a fallback to a sibling model once the primary keeps refusing.
  const RETRYABLE = [429, 500, 502, 503, 504];
  const MAX_ATTEMPTS = 7;
  const MODEL_PRIMARY = 'gemini-2.5-flash';
  // Tried only after the primary keeps returning 503. If one of these is not available
  // for this account the call fails with a NON-retryable error, so it is struck off and
  // the loop goes back to the primary instead of dying.
  const MODEL_FALLBACKS = ['gemini-flash-latest', 'gemini-2.0-flash'];
  let _modelIdx = -1;              // -1 = primary
  let _overloadStreak = 0;
  const _deadModels = {};
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // 1s, 2s, 4s, 8s, 16s, 20s (capped) plus jitter, so a burst of 503 is ridden out
      // instead of failing the whole note.
      const waitMs = Math.min(Math.pow(2, attempt - 1) * 1000, 20000) + Math.random() * 500;
      _showRetryStatus(attempt, MAX_ATTEMPTS, Math.round(waitMs/1000), lastError && lastError.status);
      await new Promise(r => setTimeout(r, waitMs));
    }
    // After two consecutive overloads, move to the next model that is still alive.
    if (_overloadStreak >= 2) {
      for (let k = _modelIdx + 1; k < MODEL_FALLBACKS.length; k++) {
        if (!_deadModels[MODEL_FALLBACKS[k]]) { _modelIdx = k; _overloadStreak = 0; break; }
      }
    }
    const _model = _modelIdx >= 0 ? MODEL_FALLBACKS[_modelIdx] : MODEL_PRIMARY;

    const _sess = (await _sb().auth.getSession()).data.session;
    if (!_sess) {
      _clearRetryStatus();
      throw new Error('Sesi\u00f3n expirada. Cierra sesi\u00f3n y vuelve a entrar para seguir generando.');
    }
    let response;
    try {
      response = await fetch(SUPABASE_URL + '/functions/v1/generate-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + _sess.access_token,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ model: _model, requestBody: requestBody })
      });
    } catch(networkErr) {
      // Network failure (no connection, DNS, etc.) — also retryable
      lastError = new Error('Network error: ' + networkErr.message);
      continue;
    }

    if (response.ok) {
      _clearRetryStatus();
      _overloadStreak = 0;
      if (_modelIdx >= 0 && typeof _apiStats === 'object') _apiStats.byStatus['modelo:' + _model] = (_apiStats.byStatus['modelo:' + _model] || 0) + 1;
      const data = await response.json();
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response from Gemini');
      }
      // Tokens realmente consumidos por esta llamada. Es lo único medible: Google no
      // publica el saldo, así que el gasto se estima desde aquí.
      try{ if (typeof _gemRecordUsage === 'function') _gemRecordUsage(data.usageMetadata); }catch(e){}
      const cand = data.candidates[0];
      const outText = cand.content?.parts?.[0]?.text || '';
      // Detect truncation: Gemini sets finishReason MAX_TOKENS when it ran out of
      // output budget mid-generation. Returning this silently produces a cut-off note.
      if (cand.finishReason === 'MAX_TOKENS') {
        _lastTruncated = true;
        console.warn('[Gemini] Response truncated (MAX_TOKENS). Output length:', outText.length, 'maxTokens used:', maxTokens);
      } else {
        _lastTruncated = false;
      }
      return outText;
    }

    // Not OK — decide whether to retry
    let errMsg = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      errMsg = errorData.error?.message || errorData.msg || errMsg;
    } catch(e){}
    if (response.status === 401) {
      errMsg = 'No autorizado (la sesi\u00f3n no es v\u00e1lida). Cierra sesi\u00f3n y vuelve a entrar.';
    }
    lastError = new Error(errMsg);
    lastError.status = response.status;
    if (response.status === 429) { try{ _gemRecord429(); }catch(e){} }

    if (!RETRYABLE.includes(response.status)) {
      // A permanent error on a FALLBACK model usually means that model is not enabled
      // for this account. Strike it off and return to the primary rather than failing
      // the whole run over a model the user never chose.
      if (_modelIdx >= 0) {
        _deadModels[_model] = true;
        console.warn('[Gemini] modelo de respaldo descartado:', _model, '-', lastError.message);
        _modelIdx = -1; _overloadStreak = 0; lastError = null;
        continue;
      }
      // Permanent error (bad key, bad request, etc.) — do not retry
      _clearRetryStatus();
      throw lastError;
    }
    if (response.status === 503) _overloadStreak++; else _overloadStreak = 0;
    // Otherwise loop and retry after backoff
  }

  // All retries exhausted
  _clearRetryStatus();
  const friendly = (lastError && lastError.status === 503)
    ? 'Los servidores de Gemini están saturados en este momento (error 503). No es un problema de la aplicación. Espera uno o dos minutos e intenta de nuevo. Si es urgente, puedes intentar en horario de menor demanda.'
    : (lastError && lastError.status === 429)
      ? (function(){
          // Distinguir las dos causas del 429: ir demasiado rápido (se pasa solo) o
          // haber agotado el crédito (no se pasa esperando). El gasto estimado es lo
          // único que permite orientar al usuario hacia la causa correcta.
          var msg = 'Se alcanzó el límite de la API de Gemini (error 429) tras varios reintentos.';
          try{
            var c = _gemCfg(), left = (c.credit === null) ? null : (c.credit - _gemSpent());
            if(c.pays === false){
              return msg + ' Tú no cargas crédito en esta clave: avisa a '
                + (c.payer ? c.payer : 'quien la paga')
                + ' para que recargue en Google AI Studio. Esperar no lo resolverá si el crédito se agotó.';
            }
            if(left !== null && left <= c.alertAt){
              msg += ' El contador estima que te queda ' + '$' + (Math.round(left*100)/100).toFixed(2)
                + ' de crédito: es muy probable que se haya agotado. Recarga en Google AI Studio — esperar no lo resolverá.';
            } else {
              msg += ' Si tu clave es de pago y tiene crédito, espera un minuto: suele ser velocidad, no cuota.'
                + ' Si se repite, revisa el crédito en Google AI Studio.';
            }
          }catch(e){ msg += ' Revisa tu cuota y tu crédito en Google AI Studio.'; }
          return msg;
        })()
      : ('No se pudo conectar con Gemini tras varios intentos. ' + (lastError ? lastError.message : ''));
  throw new Error(friendly);
}

// Barra de cr\u00e9dito. Vive junto al banner de la API porque es donde el usuario mira
// cuando algo falla con Gemini, que es justo cuando el cr\u00e9dito importa.
function _gemRenderBanner(){
  var host = document.getElementById('apiBanner');
  if(!host) return;
  var box = document.getElementById('gemCreditBox');
  if(!box){
    box = document.createElement('div');
    box.id = 'gemCreditBox';
    box.style.cssText = 'margin-top:8px;font-size:11px;line-height:1.6';
    host.appendChild(box);
  }
  var c = _gemCfg(), u = _gemUse(), spent = _gemSpent();
  var left = (c.credit === null) ? null : (c.credit - spent);
  var low  = (left !== null && left < c.alertAt);
  var out  = (left !== null && left <= 0);
  var money = function(n){ return '$' + (Math.round(n*100)/100).toFixed(2); };

  var esc2 = function(x){ return String(x||'').replace(/[&<>]/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[ch]; }); };
  var head;
  if(c.pays === false){
    // No carga cr\u00e9dito: gasta el de otra persona. Un saldo aqu\u00ed ser\u00eda falso, as\u00ed que
    // se muestra el consumo y a qui\u00e9n avisar, que es lo \u00fanico accionable.
    head = '<b style="color:var(--text2)">Tu consumo de Gemini:</b> ' + money(spent) + ' estimados'
      + ' \u00b7 ' + u.calls + ' llamada(s) \u00b7 ' + (u.inTok+u.outTok).toLocaleString('es') + ' tokens'
      + '<div style="color:var(--text3)">T\u00fa no cargas cr\u00e9dito: estas notas gastan el de '
      + (c.payer ? '<b>' + esc2(c.payer) + '</b>' : 'quien paga la clave')
      + '. Este consumo <b>no aparece</b> en el contador de esa persona, as\u00ed que p\u00e1sale esta cifra '
      + 'cuando te la pida o cuando empiecen los errores 429.</div>';
  } else if(c.credit === null){
    head = '<b style="color:var(--text2)">Consumo de Gemini:</b> ' + money(spent) + ' estimados'
      + ' \u00b7 ' + u.calls + ' llamada(s) \u00b7 ' + (u.inTok+u.outTok).toLocaleString('es') + ' tokens'
      + '<div style="color:var(--text3)">Declara abajo el cr\u00e9dito que cargaste para que el sistema avise cuando queden menos de ' + money(c.alertAt) + '.'
      + ' Si t\u00fa no cargas cr\u00e9dito, m\u00e1rcalo abajo y el aviso cambiar\u00e1 por el aviso correcto.</div>';
  } else {
    var col = out ? 'var(--red,#c0392b)' : low ? 'var(--amber,#b86c00)' : 'var(--green,#16a34a)';
    head = '<b style="color:' + col + '">'
      + (out ? '\u26d4 Cr\u00e9dito de Gemini agotado (estimado)'
             : low ? '\u26a0 Queda poco cr\u00e9dito de Gemini: ' + money(left) + ' (estimado)'
                   : 'Cr\u00e9dito de Gemini: ' + money(left) + ' de ' + money(c.credit) + ' (estimado)')
      + '</b>'
      + '<div style="color:var(--text3)">Gastado ' + money(spent) + ' en ' + u.calls + ' llamada(s) \u00b7 '
      + (u.inTok).toLocaleString('es') + ' tokens de entrada, ' + (u.outTok).toLocaleString('es') + ' de salida'
      + (c.since ? ' \u00b7 desde ' + c.since : '') + '.</div>'
      + (low ? '<div style="color:' + col + '">Recarga en Google AI Studio antes de seguir generando: cuando se agota, la API responde 429 y las notas dejan de salir.</div>' : '');
  }
  if(u.q429){
    head += '<div style="color:var(--amber,#b86c00)">' + u.q429 + ' respuesta(s) 429 (l\u00edmite alcanzado) registradas. '
      + 'Con clave de pago, un 429 que se repite suele significar cr\u00e9dito agotado, no exceso de velocidad.</div>';
  }

  var det = '<details style="margin-top:5px"><summary style="cursor:pointer;color:var(--text3);font-size:10px">Ajustar cr\u00e9dito y precios</summary>'
    + '<div style="margin-top:6px;font-size:11px;color:var(--text2)">'
    + '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">'
    + '<input type="checkbox" id="gemPaysIn"' + (c.pays === false ? '' : ' checked') + ' style="accent-color:var(--blue)">'
    + ' Yo cargo el cr\u00e9dito de esta clave</label>'
    + '<label style="display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:10px;color:var(--text3)">'
    + 'Si no, \u00bfqui\u00e9n lo carga? <input type="text" id="gemPayerIn" value="' + esc2(c.payer) + '" placeholder="p. ej. Sara"'
    + ' style="width:110px;padding:3px 6px;border:1px solid var(--border2);border-radius:4px;background:var(--surface);color:var(--text)"></label>'
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-top:6px">'
    + '<label style="font-size:10px;color:var(--text3)">Cr\u00e9dito cargado (USD)<br><input type="number" step="0.01" min="0" id="gemCreditIn" value="' + (c.credit===null?'':c.credit) + '" style="width:96px;padding:3px 6px;border:1px solid var(--border2);border-radius:4px;background:var(--surface);color:var(--text)"></label>'
    + '<label style="font-size:10px;color:var(--text3)">Avisar bajo (USD)<br><input type="number" step="0.01" min="0" id="gemAlertIn" value="' + c.alertAt + '" style="width:88px;padding:3px 6px;border:1px solid var(--border2);border-radius:4px;background:var(--surface);color:var(--text)"></label>'
    + '<label style="font-size:10px;color:var(--text3)">USD / mill\u00f3n entrada<br><input type="number" step="0.01" min="0" id="gemPriceIn" value="' + c.priceIn + '" style="width:96px;padding:3px 6px;border:1px solid var(--border2);border-radius:4px;background:var(--surface);color:var(--text)"></label>'
    + '<label style="font-size:10px;color:var(--text3)">USD / mill\u00f3n salida<br><input type="number" step="0.01" min="0" id="gemPriceOut" value="' + c.priceOut + '" style="width:96px;padding:3px 6px;border:1px solid var(--border2);border-radius:4px;background:var(--surface);color:var(--text)"></label>'
    + '<button onclick="_gemApplyCfg()" style="padding:5px 12px;font-size:11px;border:1px solid var(--border2);border-radius:4px;background:var(--surface);color:var(--text);cursor:pointer">Guardar</button>'
    + '<button onclick="_gemResetUsage()" style="padding:5px 12px;font-size:11px;border:1px solid var(--border2);border-radius:4px;background:var(--surface);color:var(--text3);cursor:pointer">Recargu\u00e9: poner a cero</button>'
    + '</div>'
    + '<div style="font-size:10px;color:var(--text3);margin-top:6px;line-height:1.5">'
    + 'Google no publica ning\u00fan endpoint con el saldo de la cuenta, as\u00ed que esto NO lee tu saldo real: '
    + 'estima el gasto con los tokens que cada respuesta declara haber consumido y los precios de arriba. '
    + 'Los tokens de razonamiento se cobran como salida y est\u00e1n incluidos. '
    + 'Comprueba los precios de tu modelo en Google AI Studio y aj\u00fastalos aqu\u00ed si cambian.'
    + '</div></details>';

  box.innerHTML = head + det;
}

function _gemApplyCfg(){
  var num = function(id){ var v = (document.getElementById(id)||{}).value; return v === '' ? null : Number(v); };
  var cr = num('gemCreditIn'), al = num('gemAlertIn'), pi = num('gemPriceIn'), po = num('gemPriceOut');
  var c = _gemCfg();
  var pays = !!(document.getElementById('gemPaysIn')||{}).checked;
  var payer = String((document.getElementById('gemPayerIn')||{}).value||'').trim();
  _gemSaveCfg({
    pays: pays,
    payer: payer,
    credit:  pays ? ((cr === null || isNaN(cr)) ? null : cr) : null,
    alertAt: (al === null || isNaN(al)) ? c.alertAt : al,
    priceIn: (pi === null || isNaN(pi)) ? c.priceIn : pi,
    priceOut:(po === null || isNaN(po)) ? c.priceOut : po,
    since:   c.since || new Date().toISOString().slice(0,10)
  });
}

async function regenBlock(id){
  // Analyst note: re-run the full generation (form data is still populated)
  if(id==='an97155'){
    const box=document.getElementById('box-an97155');
    const foot=document.getElementById('foot-an97155');
    const out=document.getElementById('anOutputsContainer');
    if(box) box.style.display='none';
    if(foot) foot.style.display='none';
    await generateAnalystSession();
    return;
  }
  if(!window._lastSession)return;
  const{sessionTasks,c,dt,place,placeForNote:pFN,summary,pools,clientId}=window._lastSession;
  const placeForNote=pFN||place.replace(/\s*\(\d+\)\s*/,'').trim();
  const t=sessionTasks[id];
  if(!t)return;
  document.getElementById('box-'+id).style.display='none';
  document.getElementById('foot-'+id).style.display='none';
  const loading=document.getElementById('loading-'+id);
  loading.innerHTML='<span class="spinner spinner-dark" style="display:inline-block;margin-right:6px"></span>Regenerating…';
  loading.style.display='block';
  let goalsTxt='';
  if(id!=='97153'){
    t.goals=selectGoalsSmart(t.ntId,clientId||'');
    if(t.ntId==='97155-direct') t.goals=(({g3, ...rest})=>rest)(t.goals);
    goalsTxt=goalsString(t.goals, t.ntId==='97155-direct');
    const goalsEl=document.getElementById('goals-'+id);
    if(goalsEl)goalsEl.textContent=goalsTxt;
  }
  try{
    let prompt=id==='97153'
      ?build97153Prompt(c,t.dur,dt,placeForNote,summary,pools,t.rotCtx||null,t.includeDuration,t.envChanges||'',t.medConcerns||'',t.crisisSituation||'',t.freqLine||'',t.trialLine||'',t.emergingItems||null,t.participantsList||[])
      :buildUserPrompt(t.ntId,c,t.goals,t.dur,dt,placeForNote,summary,pools,t.rotCtx,t.sessTmpl||null,t.supervisorCred||'BCBA',t.participantsList||[],t.includeDuration,t.excludedBehaviors||null,t.envChanges||'',t.medConcerns||'',t.crisisSituation||'',t.freqLine||'',t.emergingItems||null,t.caspSections||null,t.sessionOrder||'none',!!t.dataOnly156,t.prevPlanText||'',t.structVars||null);
    if(t.bcabaSupBlock) prompt += t.bcabaSupBlock;
    const rSys = t.ntId==='97155-direct' ? SYS_DIRECT : SYS;
    // Regenerate had the same tight budget as the first run AND no truncation retry,
    // so re-pressing it on a cut-off note was a coin flip with no safety net.
    let text=await callAPI(prompt, rSys, id, c.id, 32768, NOTE_THINKING_BUDGET);
    if(_lastTruncated){
      console.warn('['+id+'] Regenerated note truncated — retrying with maximum token budget.');
      _showRetryStatus && _showRetryStatus('La nota '+id+' se cortó; reintentando con más espacio…');
      const rtext2 = await callAPI(prompt, rSys, id, c.id, 65536, NOTE_THINKING_BUDGET);
      _clearRetryStatus && _clearRetryStatus();
      if(rtext2){
        if(!_lastTruncated){ text = rtext2; }
        else if(rtext2.length >= text.length){ text = rtext2; }
      }
      if(_lastTruncated){
        showMsg('genMsg','⚠ La nota '+id+' quedó truncada incluso con el máximo de tokens. Revisa el final: si corta a media frase, reduce el contenido seleccionado.','err');
      }
    }
    // Regenerating bypassed every output guard the first run applies, and then threw
    // the result away: the note history and sessionTasks kept the ORIGINAL text, so a
    // note regenerated because it came out truncated was still stored truncated, and
    // a Supervision Log built afterwards read the discarded 97155.
    const _rsa = (typeof _stripSelfAudit==='function') ? _stripSelfAudit(text) : null;
    if(_rsa && _rsa.cut) text = _rsa.text;
    if(id==='97153' && typeof parseAndRenderInterventions==='function') text = parseAndRenderInterventions(text, id, clientId);
    const _rscrub = (typeof _scrub97153Numbers==='function')
      ? _scrub97153Numbers(text, (t.freqLine||'')+' '+(t.trialLine||'')) : null;
    if(_rscrub) text = _rscrub.text;
    const _rpol = (typeof _polishNoteText==='function') ? _polishNoteText(text) : null;
    if(_rpol) text = _rpol.text;

    t.lastText = text;
    if(typeof saveNoteToHistory==='function') saveNoteToHistory(clientId, id, dt, t.dur, text, true);

    loading.style.display='none';
    const box=document.getElementById('box-'+id);
    const rhlPools=LS.get('aba5_pools_'+clientId)||{};
    box.innerHTML=highlightNoteText(text,c.name,rhlPools);
    box.style.display='block';
    if(typeof _postNoteChecks==='function') _postNoteChecks(text, clientId, 'genMsg');
    document.getElementById('foot-'+id).style.display='flex';
  }catch(err){loading.textContent='Error: '+err.message;}
}
