// Bloque para el prompt: nombra lo retirado para que el modelo no lo tome del
// reducido, que lo sigue listando.
function _retiredPromptBlock(clientId){
  var r = _retiredItems(clientId);
  if(!r.all.length) return '';
  var lab = function(x){ return '"' + x.name + '" (' + (x.status === 'mastered' ? 'mastered' : 'on hold') + ')'; };
  return 'WITHDRAWN FROM TREATMENT — ABSOLUTE EXCLUSION: the following items are marked in this client\'s record as mastered or on hold and are NOT being worked on. '
    + 'They still appear in the reduced assessment and in the platform catalogue because those are historical documents, but documenting any of them describes treatment that is not being delivered:\n'
    + r.all.map(lab).join(' | ') + '\n'
    + 'Never name any of them as a behavior addressed, a replacement taught, a goal implemented or a program worked on. If one is the only option that seems to fit, leave it out and document what actually was worked on.\n\n';
}

// SHORT-SESSION PROPORTIONALITY: sessions under 1 hour must produce shorter,
// less clinically dense notes. A 30-minute supervision note with the same volume
// of behaviors, replacements, and interventions as a 2-hour note is itself an
// audit red flag. Returns '' for sessions >= 1 hour or unknown duration.
function _shortSessionBlock(durLabel, noteType){
  const h = _durationToHours(durLabel);
  if(h === null || h >= 1) return '';
  const mins = Math.round(h * 60);
  const is156 = String(noteType||'').indexOf('97156') === 0;
  // 97156 (caregiver training) is reduced too, but with a higher ceiling than 97155.
  const cap = is156 ? '230-300 words - do NOT exceed 300 words' : '150-220 words - do NOT exceed 220 words';
  const density = is156
    ? '(b) Focus the caregiver-training content on the specific procedure(s) actually practiced this session; do not pad with additional programs or behaviors that were not addressed in this short session.'
    : '(b) Document AT MOST two maladaptive behaviors and AT MOST one replacement program, selected from the provided data only (prefer those with documented frequency data); silently omit the rest even if more were provided - a short session does not allow observing everything.';
  return '\n\nSHORT SESSION - PROPORTIONALITY RULE (MANDATORY - this session lasted only ' + mins + ' minutes, under one hour): The note MUST be brief and clinically proportional to a short observation window. HARD LIMITS: (a) Total note length ' + cap + '. ' + density + ' (c) Apply and document only the intervention(s)/procedure(s) tied to what was actually addressed; do not list additional interventions. (d) The protocol modification/revision is still MANDATORY and must never be omitted, but state it concisely in one or two sentences. (e) Keep the opening and closing to one sentence each. A note whose length or clinical density exceeds what a session of this duration can support is an audit red flag.';
}

// Solo lo REINCIDENTE llega al prompt. Un defecto que ocurrio una vez fue un
// accidente y advertir sobre el solo anade ruido a un prompt ya largo.
function _recurringDefectsBlock(clientId){
  var out = '';
  var list = _defectList(clientId).filter(function(x){ return x.n >= 2; });
  if(list.length){
    out += 'RECURRING DEFECTS IN THIS CLIENT\'S NOTES — the system has had to correct each of these more than once here, so they are not hypothetical. Prevent them while writing, do not rely on the correction:\n'
      + list.slice(0,5).map(function(x){
          return '- ' + DEFECT_LABELS[x.kind].warn + ' (corrected ' + x.n + ' times, most recently ' + x.last + ')';
        }).join('\n') + '\n\n';
  }
  // Criterio clinico validado: se aplica a TODOS los clientes, no solo a los de este
  // terapeuta. Se excluye lo ya advertido arriba, porque repetir el mismo aviso dos
  // veces en el prompt lo debilita en vez de reforzarlo.
  var yaDicho = {};
  list.forEach(function(x){ yaDicho[x.kind] = 1; });
  var glob = _validatedDefects().filter(function(x){ return !yaDicho[x.kind]; });
  if(glob.length){
    out += 'VALIDATED CLINICAL CRITERIA — each of the following was confirmed by the clinician as a genuine documentation defect after it appeared in this practice. They are not preferences and they are not specific to one client or one therapist: they apply to every note. They have not been corrected in THIS client and must not start here:\n'
      + glob.slice(0,6).map(function(x){
          // El aviso esta redactado en clave de cliente; aqui es un criterio general.
          var w = DEFECT_LABELS[x.kind].warn.replace(/\bthis client's\s*/gi, function(m){
            return m.charAt(0) === 'T' ? 'These ' : '';
          });
          return '- ' + w + ' (confirmed across ' + x.clients + ' client' + (x.clients === 1 ? '' : 's') + ', ' + x.total + ' occurrence' + (x.total === 1 ? '' : 's') + ')';
        }).join('\n') + '\n\n';
  }
  return out;
}

// Prompt block. These are corrections a clinician already demanded on a real note of
// this client, so they outrank the model's own judgement — but they never license
// inventing data, which is the one thing no instruction may override.
function _analystCorrectionsBlock(clientId){
  var list = _analystNotes(clientId);
  if(!list.length) return '';
  // Lo ya confirmado como criterio GENERAL viaja en su propio bloque para todos los
  // clientes; repetirlo aqui gasta prompt y debilita el aviso.
  var lines = list.filter(function(n){
    return !(n && n.scope === 'universal' && n.state === 'ok' && !n.conflict);
  }).map(function(n){
    var tag = [n.date || '', n.rbt ? 'RBT ' + n.rbt : ''].filter(Boolean).join(' · ');
    var line = '  - ' + (tag ? '[' + tag + '] ' : '') + String(n.text||'').replace(/\s*\n\s*/g, ' / ');
    // Una correccion que choca con la practica clinica NO puede entrar como mandato:
    // este bloque dice que las correcciones del analista pesan mas que el criterio
    // propio del modelo, y sin esta marca una indicacion contraindicada -planned
    // ignoring en agresion- pasaria por encima del veto de seguridad. Se muestra,
    // porque el analista la pidio y hay que saberlo, pero desactivada.
    if(n && n.conflict){
      line += '\n      *** DO NOT APPLY THIS ONE: it conflicts with established clinical practice — ' + n.conflict
            + ' Document the safe, evidence-based procedure instead, and do not reproduce the contraindicated part of this request. ***';
    }
    return line;
  });
  if(!lines.length) return '';
  return 'CORRECTIONS THE SUPERVISING ANALYST ALREADY DEMANDED FOR THIS CLIENT — MANDATORY, AND THEY OUTRANK YOUR OWN JUDGEMENT.\n'
    + 'Each line is a defect a clinician found in a REAL note of this client and asked to have fixed. Repeating any of them makes this note fail review:\n'
    + lines.join('\n') + '\n'
    + 'Apply every one of them to this note. If a correction removes a procedure, do not document that procedure for this client. If a correction demands a wording or a structure, use it. None of them ever licenses inventing a datum: when a correction cannot be met with the material available, document what genuinely happened and leave the gap visible.\n\n';
}

function _universalAnalystBlock(clientId){
  var list = _universalAnalystRules();
  if(!list.length) return '';
  return 'CLINICAL CRITERIA ESTABLISHED BY SUPERVISING ANALYSTS — VALIDATED AND GENERAL. Each line is a correction a behavior analyst demanded on a real note, reviewed and confirmed as a general clinical principle rather than a preference of one client or one organisation. They apply to every note, including this one:\n'
    + list.slice(0,10).map(function(x){ return '  - ' + x.text.replace(/\s*\n\s*/g, ' / '); }).join('\n') + '\n\n';
}

// Etapa 2 (Objetivo B): the reduced assessment profile REPLACES the summary as
// the clinical source of truth when the client has one; otherwise the summary
// is used, so clients without a profile keep working exactly as before.
// The client name is NOT in the profile — it is injected separately at generation.
function _effectiveContext(clientId, fallbackSummary){
  const prof = (LS.get('aba5_assess_' + clientId) || '').trim();
  if(!prof) return fallbackSummary || '';
  const excl = (LS.get('aba5_assessx_' + clientId) || '').trim();
  let ctx = 'REDUCED ASSESSMENT PROFILE (authoritative clinical source of truth for this client). Use ONLY the clinical content below; the client name is provided separately and must be used exactly as given.\n' + prof;
  if(excl){
    ctx += '\n\nEXCLUDED BY THE BCBA \u2014 DO NOT USE ANY OF THE FOLLOWING (they contain conceptual errors):\n' + excl;
  }
  ctx += '\n\nAUTOMATIC CLINICAL FILTER: Use only clinically correct elements from the profile above. Silently DISREGARD (do not mention, do not correct, do not flag) any element that violates hard ABA rules \u2014 for example: a replacement that is not functionally equivalent to the behavior\u2019s function; an intervention that does not match the behavior\u2019s function; DRL or planned ignoring proposed for a dangerous behavior (aggression, SIB, elopement, property destruction); or misapplied response blocking. IMPORTANT BIAS: there is far more correct than incorrect content here, so when in doubt, KEEP and use the element. Never invent replacements or interventions that are not in the profile.';
  return ctx;
}

function buildUserPrompt(ntId, clientObj, goals, dur, dt, place, summary, pools, rotCtx, sessTmpl, supervisorCred, participantsList, includeDuration, excludedBehaviors, envChanges, medConcerns, crisisSituation, freqLine, emergingItems, caspSections, sessionOrder, t_dataOnly156, t_prevPlanText, t_structVars){
  summary = _effectiveContext(clientObj.id, summary);
  const goalsTxt=goalsString(goals, ntId==='97155-direct');
  const cg='the caregiver';
  const supv = supervisorCred && supervisorCred !== 'RBT' ? `the ${supervisorCred}` : 'the BCBA';
  const supLabel97155 = ntId==='97155-bcaba' ? 'BCaBA' : ntId==='97155-direct' ? null : 'RBT';
  // El sitio decide quien puede figurar. En casa el personal docente se cae aqui,
  // antes de que llegue a la cadena de participantes; en la escuela no se toca al
  // cuidador, porque estar en la lista ya es haberlo indicado a mano.
  const _placeFilt = _filterParticipantsByPlace(participantsList, place);
  if(_placeFilt.removed.length){
    participantsList = _placeFilt.kept;
    try{ _placeFilterNotice(_placeFilt, place, 'genMsg'); }catch(e){}
  }
  const partStr = participantsList && participantsList.length
    ? participantsString(participantsList, supervisorCred, supLabel97155)
    : null;
  // Identify any "Other" free-text participants (anything not a known role keyword)
  const knownRoles = ['client','supervisor','technician','caregiver'];
  const otherParts = (participantsList||[]).filter(p => !knownRoles.includes(p));
  // The extra person must be woven into the SUPERVISION CHAIN, not merely named as an
  // attendee — otherwise the model defaults to the two-role template and drops them.
  // Detect the two canonical multi-role scenarios deterministically from the roles.
  const _otherHasRBT   = otherParts.some(p => /\brbt\b/i.test(p));
  const _otherHasBCaBA = otherParts.some(p => /\bbcaba\b/i.test(p));
  let otherNote = '';
  if(otherParts.length){
    if(supLabel97155 === 'BCaBA' && _otherHasRBT){
      // BCBA → BCaBA session, RBT also present and JOINTLY supervised by both.
      otherNote = ` MANDATORY — MULTI-ROLE SUPERVISION (do NOT collapse to two roles): this session also included the RBT, who delivered the direct treatment to the client and was supervised JOINTLY by the BCBA and the BCaBA. Document the full chain: the BCBA directed and evaluated the BCaBA, and the BCaBA in turn oversaw the RBT's implementation, with the RBT under the joint supervision of both. Weave the RBT throughout the narrative as the person whose implementation fidelity was observed and corrected — never as an attendee named only once. Name all three (the BCBA, the BCaBA, the RBT) in the opening sentence.`;
    } else if(supLabel97155 === 'RBT' && _otherHasBCaBA){
      // BCBA → RBT session, BCaBA also present, co-supervising the RBT.
      otherNote = ` MANDATORY — MULTI-ROLE SUPERVISION (do NOT collapse to two roles): this session also included the BCaBA, who co-supervised the RBT's implementation alongside the BCBA. Document that the RBT delivered the direct treatment while BOTH the BCBA and the BCaBA provided supervisory oversight, direction and corrective feedback. Reflect the BCaBA's supervisory participation throughout the narrative — never as an attendee named only once. Name all three (the BCBA, the RBT, the BCaBA) in the opening sentence.`;
    } else {
      otherNote = ` MANDATORY: The following additional participant(s) were physically present and MUST be explicitly named as present in the note's opening and acknowledged where clinically relevant: ${otherParts.join(', ')}. Do NOT omit them. Even though this is a ${supLabel97155||'direct'} session, these individuals were present and their presence must be documented. List each of them by name in the SAME opening sentence that lists the other attendees present.`;
    }
  }
  const participantsNote = partStr 
    ? `\nPARTICIPANTS PRESENT: ${partStr}. State ALL of these participants explicitly in the opening of the note — do not omit any of them.${otherNote}${place.toLowerCase().includes('school') && !participantsList.includes('caregiver') ? ' For school-based services, the classroom teacher serves in the caregiver role — do not mention caregiver absence.' : ''}`
    : '';
  const variationNote=`CRITICAL — CLIENT ISOLATION: This note is for ${clientObj.name} ONLY. Never write the name of any other client, in any context. Every behavior, intervention, replacement, and outcome in this note belongs exclusively to ${clientObj.name}. Begin with a clinical opening sentence that does not start with the client name or the date. Vary paragraph structure (session note #${_sessionCount+1} for this client).`;

  let rotNote='';
  const _fnMap = getBehaviorFnMap(pools||{});
  // Behavior↔replacement 1:1 pairing is REQUIRED for caregiver training (97156) — it
  // is the core lesson: teach the caregiver to decrease a behavior by increasing its
  // function-matched replacement. (97153 enforces its own 1:1 in build97153Prompt /
  // AbaMatrix.) For 97155 analyst notes the 1:1 is not required, so those document the
  // behaviors observed and the replacements implemented as two function-matched chains.
  const _force11pairing = (ntId === '97156');
  const _pairingClause = _force11pairing
    ? "Additionally, every maladaptive behavior addressed must be paired with a function-matched replacement (attention to request attention, escape to request a break or request help, tangible to request the item, automatic to a matched alternative), reinforced in the same currency as its function. In caregiver training this pairing IS the core lesson: for each maladaptive behavior, the caregiver is coached, shown a model, and given guided practice on the function-matched replacement that serves the same function, so reducing the behavior and strengthening its replacement are taught as one paired procedure — always described in observable terms, never as caregiver 'understanding' or 'progress'. Take the specific replacement and reinforcer from the clinical context below; if the plan does not document a function-matched replacement for a behavior, do not invent one and state that no matched replacement is documented."
    : "Additionally, this note documents the maladaptive behaviors OBSERVED and the replacement programs IMPLEMENTED during the session as two separate sets — do NOT force a one-to-one pairing between a behavior and a replacement (the session simply observed a number of behaviors and implemented a number of replacements). What MUST hold is the function match along two INDEPENDENT chains: (1) each maladaptive behavior's consequence intervention and reinforcer are delivered in the currency of THAT BEHAVIOR's function; (2) each replacement program's teaching/intervention and reinforcer are delivered in the currency of THAT REPLACEMENT's own function (a replacement that requests attention is reinforced with attention; one that requests a break is reinforced with the break/escape; one that requests an item is reinforced with access to the item; an alternative that produces comparable automatic stimulation is reinforced by that stimulation). Take the specific behaviors, replacements, interventions and reinforcers from the clinical context below; never invent any, and if a function-matched element is not documented, say so rather than fabricating it.";
  const sessionMal = rotCtx&&rotCtx.mal&&rotCtx.mal.length ? rotCtx.mal : [];
  const sessionRep = rotCtx&&rotCtx.rep&&rotCtx.rep.length ? rotCtx.rep : [];
  if(sessionMal.length){
    const _malAnn = annotateBehaviorsWithFn(sessionMal, _fnMap);
    const _fnHint = _malAnn.some((s,i)=>s!==sessionMal[i])
      ? `\nFUNCTION TAGS: the bracketed "[function: …]" after a behavior is its documented function; a behavior may be multiply maintained and show several ("escape+automatic"). Use it ONLY to select the function-matched intervention and replacement for that behavior (see the FUNCTION-MATCHED INTERVENTION rule). Do NOT write the function label or the brackets anywhere in the note prose.`
      : '';
    // Structured topography / operational definition for the behaviors of this note,
    // so the antecedent and the description are written from the assessment's own
    // definition (including onset/offset and exclusions) instead of a generic label.
    const _topoMap = {};
    normalizeBehaviorArr((pools&&pools.mal)||[]).forEach(b=>{ if(b&&b.name&&b.topo) _topoMap[b.name]=b.topo; });
    const _topoLines = sessionMal.filter(n=>_topoMap[n]).map(n=>`  - ${n}: ${_topoMap[n]}`);
    const _topoBlock = _topoLines.length
      ? `\nTOPOGRAPHY / OPERATIONAL DEFINITION (from this client's assessment — write each behavior's antecedent and description consistently with its own definition, respecting onset, offset and exclusion criteria; never describe another behavior's topography inside it):\n${_topoLines.join('\n')}`
      : '';
    // Interventions the plan documents for each behavior: the note must draw the
    // consequence procedure from here, never from a generic catalogue.
    const _intMap = {};
    normalizeBehaviorArr((pools&&pools.mal)||[]).forEach(b=>{ if(b&&b.name&&b.int) _intMap[b.name]=b.int; });
    const _intLines = sessionMal.filter(n=>_intMap[n]).map(n=>`  - ${n}: ${_intMap[n]}`);
    const _intBlock = _intLines.length
      ? `\nINTERVENTIONS DOCUMENTED FOR EACH BEHAVIOR (use these — they are this client's planned procedures; pick the one that matches the behavior's function and never substitute a generic procedure):\n${_intLines.join('\n')}`
      : '';
    // Actividades que el plan documenta para cada replacement. Sin esto la nota
    // describe la ensenanza sin decir en que actividad ocurrio, que es lo que la
    // hace sonar a plantilla.
    const _actMap = {};
    normalizeBehaviorArr((pools&&pools.rep)||[]).forEach(b=>{ if(b&&b.name&&b.act) _actMap[b.name]=b.act; });
    /* Las actividades del reducido son texto libre y pueden venir atadas a un
       entorno ("clean-up routine in the bedroom"). Se marcan para que el modelo
       sepa cual no puede usar aqui, en vez de dejarle deducirlo. */
    /* Y la segunda dimension: la actividad que exige habla vocal cuando el
       reducido documenta otra modalidad. Se marca, no se quita — la actividad
       que exige la habilidad suele ser la que la ensena. */
    const _nonVocal = _clientLevelCheck(pools).modality === 'alternative';
    const _actLines = sessionRep.filter(n=>_actMap[n]).map(n=>{
      const _parts = String(_actMap[n]).split(/;|\n/).map(x=>x.trim()).filter(Boolean);
      const _bad = _parts.filter(x=>{ const st=_activitySetting(x); return st!=='any' && st!==_placeKind(place); });
      const _voc = _nonVocal ? _parts.filter(x=>ACT_VOCAL_RE.test(x)) : [];
      return `  - ${n}: ${_actMap[n]}` + (_bad.length
        ? `   [NOT USABLE AT THIS PLACE OF SERVICE — teach this program through another routine that exists here: ${_bad.join('; ')}]`
        : '') + (_voc.length
        ? `   [REQUIRES VOCAL SPEECH — this client's assessment documents a different communication modality; run the same target in THAT modality: ${_voc.join('; ')}]`
        : '');
    });
    const _actBlock = _actLines.length
      ? `\nACTIVITIES DOCUMENTED FOR EACH REPLACEMENT PROGRAM (this client's own activities — teach each program inside one of ITS activities and name it; never invent an activity and never move an activity from one program to another):\n${_actLines.join('\n')}`
      : '';
    rotNote=`\nSESSION BEHAVIOR LIST — HARD CONSTRAINT:\nMALADAPTIVE BEHAVIORS FOR THIS NOTE (exactly these, no others): ${_malAnn.join(' | ')}${_fnHint}${_topoBlock}${_intBlock}\nREPLACEMENT BEHAVIORS FOR THIS NOTE (exactly these, no others): ${annotateBehaviorsWithFn(sessionRep, getBehaviorFnMap(pools||{}, 'rep')).join(' | ')}${_actBlock}\nCRITICAL: Every paragraph of this note — including the interventions paragraph, the client response paragraph, and the closing — must reference ONLY the behaviors and replacements listed above. Never introduce a behavior, replacement, or intervention target that is not in this list.\n\nABSOLUTE PROHIBITION: Do not write about any maladaptive behaviors other than: ${sessionMal.join(', ')}. Do not invent, assume, or mention additional behaviors like "off-task behavior," "hyperactive behavior," "elopement," "aggression," or any others not explicitly listed above. If you mention ANY behavior not in the approved list, this note will fail audit compliance.\n\nBEHAVIOR COUNT ENFORCEMENT: This session focuses on EXACTLY ${sessionMal.length} maladaptive behavior${sessionMal.length > 1 ? 's' : ''}. The note must discuss exactly ${sessionMal.length} behavior${sessionMal.length > 1 ? 's' : ''}, no more, no less. COUNT CHECK: ${sessionMal.join(' + ')} = ${sessionMal.length} total behaviors for this note.`;
  }

  let ctx='';
  // Situational background travels with every note: it is what lets the narrative be
  // contextually rich (communication modality, repertoires, preferences, barriers,
  // prompt hierarchy, setting) instead of generic. Never a source of numbers or events.
  const _bg = String((pools&&pools.background)||'').trim();
  const _bgBlock = _bg
    ? `CLIENT BACKGROUND (situational context — use it to make the narrative specific to this client: communication modality, repertoires, preferences, barriers, prompt hierarchy, setting. It is CONTEXT ONLY: it describes what the client is LIKE, not what happened today. Never turn any of it into an event of this session, never take a date or month from it, never derive numbers from it, and never contradict it):\n${_bg}\n\n`
    : '';
  if(summary){
    ctx=`${_bgBlock}CLINICAL CONTEXT FOR ${clientObj.name.toUpperCase()}:\n${summary}\n\n`;
  }else if(pools&&(pools.mal||[]).length){
    const mal=annotateBehaviorsWithFn(getActiveBehaviors(pools,'mal'), _fnMap).join(', ');
    const rep=getActiveBehaviors(pools,'rep').join(', ');
    const reinf=pools.reinforcers||'';
    ctx=`${_bgBlock}CLIENT BEHAVIORAL PROFILE:\nMaladaptive behaviors (active, with documented function for intervention-matching — do NOT write the function label in the note): ${mal}\nReplacement targets (active): ${rep}${reinf?'\nReinforcers: '+reinf:''}\n\n`;
  }
  const durLine = !dur
    ? 'DURATION: NOT SPECIFIED — ABSOLUTE PROHIBITION: Do NOT write any duration, time span, number of hours, session length, or any time reference anywhere in this note. Do not write "2-hour session," "hours of services," "spanned X hours," or any similar phrase. Omit session time entirely.'
    : includeDuration !== false
      ? `DURATION: ${dur} — state exactly this duration explicitly in the note body using ONLY the provided duration text. CRITICAL INSTRUCTION: Write "${dur}" exactly as provided. Do NOT convert this to a time range (e.g., "Between 10:00 AM and 12:00 PM"), clock times, or specific hours. Write only: "The session lasted ${dur}." or "This ${dur} session..." or similar. ABSOLUTE PROHIBITION: fabricating clock times, start/end times, or time ranges from the duration value. THIS IS THE LENGTH OF THE SESSION, NOT OF THE SUPERVISION: a session may contain supervision without the whole session being supervision, so never write that the supervision, the observation or the clinical oversight lasted "${dur}" — attach the time to the session only.`
      : `DURATION: ${dur} — do NOT mention duration in the note body; omit it from the narrative entirely. ABSOLUTE PROHIBITION: Do not write "${dur}", "hours of direct services", "hours of services", any time span, any duration phrase, or any reference to session length anywhere in this note. This applies to every sentence, including participant statements and opening/closing lines.`;
  // When the field is empty the prompt used to say nothing, and that silence was
  // filled with historical events from the profile. Absence must be explicit.
  try{ window._lastEnvChanges = envChanges||''; window._lastMedConcerns = medConcerns||''; }catch(e){}
  const envLine = envChanges ? `\nENVIRONMENTAL CHANGES: ${envChanges} — mention this at the start of the note.` : `\nENVIRONMENTAL CHANGES: NONE WERE REPORTED FOR THIS SESSION — ABSOLUTE PROHIBITION: do NOT mention any environmental change, setting event, move or relocation, change of school or classroom, new or absent caregiver, change of routine or schedule, visitors, travel, or any household/context event. Do not take one from the client profile, the reduced assessment or the background: those are history, not events of this session. The note simply does not mention this topic.`;
  const medLine = medConcerns ? `\nMEDICAL CONCERNS: ${medConcerns} — mention this at the start of the note.` : `\nMEDICAL CONCERNS: NONE WERE REPORTED FOR THIS SESSION — ABSOLUTE PROHIBITION: do NOT mention any medication change, illness, sickness, poor sleep, allergy, appointment, injury or any medical event. Do not take one from the client profile, the reduced assessment or the background. The note simply does not mention this topic.`;
  // Previous session plan continuity
  const t_prevPlan = typeof t_prevPlanText !== 'undefined' ? t_prevPlanText : '';
  const _is97156note = ntId === '97156';
  const prevPlanLine = t_prevPlan
    ? (_is97156note
      ? `\nPREVIOUS 97156 CAREGIVER TRAINING NOTE PROVIDED:\n${t_prevPlan}\n\nPLAN CONTINUITY REQUIREMENT (97156): Extract the plan or follow-up intentions from the previous 97156 note above. The opening paragraph of THIS 97156 note must briefly reference whether the caregiver training plan from the previous session was carried out, what was practiced, and what follow-up was implemented at home. Use observable language only. Do not reference the 97155 note — this continuity is strictly between caregiver training sessions.`
      : `\nPREVIOUS SESSION NOTE PROVIDED:\n${t_prevPlan}\n\nPLAN CONTINUITY REQUIREMENT: Extract the 'For the next session...' plan paragraph from the previous note above (if present). The opening paragraph of THIS note must briefly reference whether that plan was carried out, modified, or deferred — and what occurred. If no explicit plan paragraph exists in the previous note, identify any clinical intentions stated at the end of the note and reference those. Use observable language only. Do not evaluate outcomes, just document what was implemented.`)
    : '';

  const crisisLine = crisisSituation
    ? `\nCRISIS SITUATION THIS SESSION: ${crisisSituation}\nCRISIS DOCUMENTATION RULES: (1) Describe the crisis in observable, measurable terms only. (2) Response blocking may be documented ONLY for this session and ONLY as directly related to the crisis event — applied for 10-15 seconds maximum to prevent harm. (3) Document what was done to de-escalate using plan-approved procedures. (4) State that the supervisor was notified. No other session may reference response blocking or physical restrictions.`
    : `\nNO CRISIS THIS SESSION — RESPONSE BLOCKING AND PHYSICAL RESTRICTIONS ARE STRICTLY PROHIBITED in this note. Do not mention response blocking, physical guidance as a restrictive procedure, or any physical intervention regardless of what the assessment or plan may contain. Use only: EXT, DRA, DRI, DRO, FCT, NCR, antecedent manipulation, and prompting procedures.`;
  const freqNote = freqLine || '';
  // Emerging items — observed between assessments
  let emergingLine = '';
  if(emergingItems){
    const parts=[];
    if(emergingItems.mal?.length) parts.push(`NEWLY OBSERVED MALADAPTIVE BEHAVIORS (emerging — not yet in formal plan, document as observed during this session prior to reassessment): ${emergingItems.mal.join('; ')}`);
    if(emergingItems.rep?.length) parts.push(`NEWLY OBSERVED REPLACEMENT BEHAVIORS (emerging — not yet in formal plan, document as observed/introduced during this session): ${emergingItems.rep.join('; ')}`);
    if(emergingItems.int?.length) parts.push(`NEWLY APPLIED INTERVENTIONS (emerging — introduced during protocol modification or observation, document as a new clinical element observed prior to reassessment): ${emergingItems.int.join('; ')}`);
    if(parts.length) emergingLine=`\n\nEMERGING CLINICAL ITEMS — IMPORTANT: These items were observed or introduced during this session and are not yet part of the formal plan. Document them in the note as newly observed/emerging, establishing a clinical record prior to reassessment. Do not present them as established plan targets.\n${parts.join('\n')}`;
    if(emergingItems&&emergingItems.notes) emergingLine+=`\\n\\nCLINICAL NOTES FOR THIS SESSION — MANDATORY: Incorporate all of the following when writing the note. Direct clinical instructions from the supervisor:\\n`+emergingItems.notes;
  }

  const dataOnly156Flag = (ntId==='97155-rbt'||ntId==='97155-bcaba'||ntId==='97155-direct'||ntId==='supervision'||ntId==='supervision-bcaba') && t_dataOnly156
    ? '\n\nDATA COLLECTION RULE FOR THIS THERAPIST: This therapist does NOT collect data during 97155 or supervision sessions. Do NOT include any data collection or data recording language in this note. Data collection occurs exclusively during parent training (97156) sessions.'
    : '';
  const _priorCtx = ''; // Prior session context disabled
  const _sv = t_structVars || {opening:1,bhvIntro:2,antIntro:3,repIntro:4,dataSent:5,closing:6};
  const _variantLine = `\nSTRUCTURAL VARIATION ASSIGNMENT FOR THIS NOTE (use exactly these variants — do not default to the same phrase):\n- Opening (no setting events): use V${_sv.opening}\n- Behavior paragraph intro: use V${_sv.bhvIntro}\n- Antecedent intro within each behavior paragraph: start with A${((_sv.antIntro-1)%5)+1} and cycle through A1–A5 for each behavior\n- Replacement program section intro: use V${_sv.repIntro}\n- Data monitoring sentence: use V${_sv.dataSent}\n- RBT closing phrase: use V${_sv.closing}\nThese are randomly assigned to prevent detectable structural patterns across notes.\nTHE VARIANT CODES ARE INTERNAL SELECTORS, NOT TEXT: never write "V5:", "V1:", "A3:" or any such code in the note. Apply the assigned wording and write the sentence directly. A code appearing in the note is an audit defect.\n`;
  const _dateField = (dt==='[DATE — analyst to complete]' || !dt)
    ? 'DATE: NOT FOR NOTE — ABSOLUTE PROHIBITION: Do NOT write any date, date placeholder, "[DATE]", "occurred on", "this session on", or any date-related phrase anywhere in the note body. The analyst enters the date manually after the note is generated; omit it entirely.'
    : `DATE: ${dt}`;
  const base=`${_variantLine}${variationNote}${rotNote}${participantsNote}${prevPlanLine}${envLine}${medLine}${crisisLine}${freqNote}${emergingLine}${dataOnly156Flag}${_priorCtx}\n\nPRIVACY REMINDER: No diagnosis, no PII, no proper names.\n\nCRITICAL — DATA INTEGRITY: Never invent specific numerical data (percentages, exact counts, fidelity scores, IOA percentages, etc.) unless explicitly provided in the session frequency data or trial data above. ZERO-EPISODE RULE: Never write 'zero episodes,' 'no occurrences,' 'was not observed,' or 'did not occur' for any behavior. If a behavior had no documented occurrences in a session, it is simply not mentioned. There is no note content for a behavior that did not occur. If no numeric data was provided for a behavior or program, use qualitative observable descriptions only: "consistent prompt delivery was observed," "the client responded to gestural prompts," "the behavior occurred during demand contexts." Do not estimate, approximate, or fabricate any number, IN DIGITS OR IN WORDS: "four out of five", "eighty percent" and "on three occasions" are fabricated data exactly as 4/5, 80% and 3 are.\n\nABSOLUTE PROHIBITION — INVENTED BASELINES AND COMPARATIVE STATISTICS: NEVER write any of the following unless the exact number was explicitly provided in the session data above: weekly averages ("X incidents per week"), monthly averages, named-period baselines ("October average," "baseline of X"), improvement percentages ("representing a X% improvement"), rate comparisons ("higher than the baseline of X"), or any numerical claim presented as a trend, average, or historical comparison. These numbers do not exist in the session data — writing them is data fabrication and constitutes a Medicaid fraud risk. If no baseline or comparative data was provided, describe behavior in purely qualitative, session-specific observable terms only.\n\nPLAN FIDELITY WITH ERROR FILTERING (MANDATORY): Use the behaviors, interventions, replacement programs, teaching methods, prompts, and reinforcers from the clinical context below — BUT apply this filter: if the plan contains prohibited terms (calming, sensory, self-regulation, etc.), planned ignoring for aggression/SIB/elopement, DRL for dangerous behaviors, or any non-evidence-based procedure, silently exclude those items from the note. Do not replicate plan errors. Document only what is clinically defensible and audit-safe.\n\nFUNCTION-MATCHED REINFORCEMENT AND REPLACEMENT (MANDATORY): Every reinforcer and every consequence procedure must be delivered in the currency of the behavior's documented function. Attention-maintained behavior is reinforced with social attention; Non-Contingent Reinforcement (NCR) for an attention function delivers non-contingent ATTENTION on a time-based schedule, never tangibles or edibles. Escape-maintained behavior is reinforced with a break or removal of the demand. Tangible-maintained behavior is reinforced with access to the item. Automatic-maintained behavior is reinforced with a comparable, matched stimulation alternative. Never pair an attention or escape function with a tangible or edible reinforcer. ${_pairingClause}\n\n${FN_INTERVENTION_RULE}\n\n${KB_FRAME_RULE}\n\n${KB_DIFFERENTIAL_RULE}\n\n${NO_CROSS_SESSION_RULE}\n\n${OUTPUT_ONLY_NOTE_RULE}\n\n${SESSION_EVENT_SOURCING_RULE}\n\n${SCHOOL_DEMAND_SOURCE_RULE}\n\n${_placeCoherenceRule(place, partStr || '')}\n\n${_activitySettingRule(place)}\n\n${_activityFitsClientRule(pools, place)}\n\n${OPERATOR_TEXT_LANGUAGE_RULE}\n\n${(typeof _universalAnalystBlock === 'function') ? _universalAnalystBlock(clientObj && clientObj.id) : ''}${(typeof _recurringDefectsBlock === 'function') ? _recurringDefectsBlock(clientObj && clientObj.id) : ''}\n\n${(typeof _retiredPromptBlock === 'function') ? _retiredPromptBlock(clientObj && clientObj.id) : ''}\n\n${String(ntId).indexOf('97155')===0 ? CAREGIVER_ROLE_97155_RULE + '\\n\\n' + RBT_SEQUENCE_RULE + '\\n\\n' + RBT_ANTECEDENT_RULE + '\\n\\n' + KB_HIGH_P_RULE + '\\n\\n' + KB_PROMPT_HIERARCHY_RULE + '\\n\\n' : (ntId==='supervision'||ntId==='supervision-bcaba') ? CAREGIVER_ROLE_97155_RULE + '\\n\\n' : ''}\n\nPROHIBITED NARRATIVE TERMINOLOGY (MANDATORY - applies to the prose you write): Never write any of these words or their variants anywhere in the note: calm, calmly, calming, relax, relaxation, relaxing, sensory, self-regulation, self-soothing, coping, mindfulness, meditation, yoga, deep breathing, breathing technique, problem solving, conflict resolution, social stories, social narratives, anger management, art therapy, frustration, frustrated, stress, anxiety, anxious, upset, overwhelmed, empathy, de-escalation, desensitization, response cost. Also never write internal-state or unsupported-progress language about the client or the caregiver: understanding, understood, comprehension, aware, awareness, realize, improved, improvement, better, enhanced, mastery, mastered, competent, competency, proficiency, progress, growth, gains, advancement, effective, effectiveness, successful, or comparative claims such as 'more independent', unless the exact supporting data was provided in the session data above. Describe only what was observed and done. TWO-LAYER RULE: this ban applies to the prose the system generates. If one of these words is part of the exact program or behavior NAME documented in the assessment or clinical context, that name may be reproduced verbatim as a closed-list citation, but the surrounding prose must never use the term and must never build a mentalist or emotional description around it.\n\n${ctx}CLIENT PSEUDONYM: ${clientObj.name}\n${_dateField}\n${durLine}${(String(ntId).indexOf('97155')===0||String(ntId).indexOf('97156')===0||ntId==='supervision'||ntId==='supervision-bcaba')?_shortSessionBlock(dur, ntId):''}\nPLACE OF SERVICE: ${place}`;

  const tmplStr = sessTmpl ? sessionTemplateToPromptSection(sessTmpl) : '';
  // Use CASP checkbox sections if provided; fall back to session template
  const caspBlock = caspSections ? getCaspPromptBlock(caspSections, supLabel97155) : '';
  const tmplInstruction = caspBlock
    ? caspBlock
    : tmplStr
      ? `\n\nSESSION TEMPLATE (services provided this session):\n${tmplStr}\n\nOpen with a brief paragraph restating services, then continue the full narrative.`
      : '';

  if(ntId==='97156'){
    const clientPresent = participantsList && participantsList.includes('client');
    const presenceNote = clientPresent
      ? 'The client was present during the session.'
      : 'The session was conducted with the caregiver without the client present (per CPT 97156 — with or without the patient present).';
    const excl = excludedBehaviors && excludedBehaviors.mal && excludedBehaviors.mal.length
      ? `\nSESSION TIMING: Both CPT-97155 and CPT-97156 were delivered on the same day. ${
          sessionOrder==='155first' ? 'The 97155 (Behavior Treatment) session occurred first; the 97156 (Parent Training) session occurred afterward.' :
          sessionOrder==='156first' ? 'The 97156 (Parent Training) session occurred first; the 97155 (Behavior Treatment) session occurred afterward.' :
          'The order of the two sessions on this date is not specified — do not make any assumption about which occurred first. Do not reference order of sessions.'
        } The following behaviors and replacements were already addressed in the 97155 note for this day: maladaptive behaviors: ${excludedBehaviors.mal.join(', ')}; replacements: ${(excludedBehaviors.rep||[]).join(', ')}. For this parent training note, address DIFFERENT behaviors and replacement programs from the client's plan.`
      : '';

    // Build distinct prompt depending on whether client was present
    const clientAbsentRules = !clientPresent ? `

CLIENT ABSENCE RULES — MANDATORY:
The client was NOT present during this session. Therefore:
- Do NOT describe the client doing anything during this session (no "the client demonstrated," "the client responded," "the client engaged in" — none of that happened in this session).
- Do NOT describe any behaviors occurring in the session — the client was not there.
- Behaviors are discussed HISTORICALLY and HYPOTHETICALLY based on the treatment plan and the caregiver's reported experience, not as events that occurred today.
- The session consisted entirely of: role-play between ${supv} and the caregiver, discussion of the client's typical behavioral patterns, instruction on how to implement strategies at home, and caregiver practice and feedback.
- Use language such as: "the caregiver was trained on how to respond when the client engages in...", "through role-play, the caregiver practiced...", "the caregiver discussed the client's typical pattern of...", "strategies were reviewed for situations in which the client typically..."
- The client's behaviors may be referenced as TYPICAL PATTERNS from the treatment plan, not as session events.` : '';

        const mal156List = sessionMal.length ? annotateBehaviorsWithFn(sessionMal, _fnMap).join(' | ') : 'maladaptive behaviors from the clinical context';
    const rep156List = sessionRep.length ? sessionRep.join(' | ') : 'replacement programs from the clinical context';
    /* Las técnicas que se entrenan en ESTA sesión.

       Antes esto barría el resumen clínico entero buscando 21 nombres y devolvía
       TODOS los que encontrara, y el prompt exigía nombrarlos uno a uno en 380
       palabras. El resultado no era una nota de sesión sino un pase de lista de
       procedimientos, sin sitio para lo único que justifica el 97156: qué hizo el
       cuidador. Nadie entrena a una familia en quince procedimientos en una sesión.

       Tres defectos concretos, los tres corregidos aquí:
       · Sinónimos duplicados en la lista (NCR y Non-Contingent Reinforcement, NET y
         Naturalistic Environment Teaching, Behavioral Momentum y High Probability
         Request Sequence). Los dos miembros del par entraban, y de ahí salían frases
         como "Naturalistic Environment Teaching (NET), also referred to as NET".
       · Comparación por los 7 primeros caracteres: "DRA" casaba con "drawing",
         "DRO" con "dropped", "DRI" con "drink". Técnicas listadas que el plan no tiene.
       · Sin tope: cuanto más rico el plan, más irreal la nota.                     */
    const int156List = (()=>{
      // Un nombre canónico por procedimiento, con sus variantes solo para detectar.
      const known = [
        { name:'Escape Extinction',                 rx:/\bescape\s+extinction\b/i },
        { name:'Extinction',                        rx:/\bextinction\b/i },
        { name:'Differential Reinforcement of Alternative Behavior (DRA)', rx:/\bDRA\b|differential reinforcement of alternative/i },
        { name:'Differential Reinforcement of Incompatible Behavior (DRI)', rx:/\bDRI\b|differential reinforcement of incompatible/i },
        { name:'Differential Reinforcement of Other Behavior (DRO)', rx:/\bDRO\b|differential reinforcement of other/i },
        { name:'Functional Communication Training (FCT)', rx:/\bFCT\b|functional communication training/i },
        { name:'Non-Contingent Reinforcement (NCR)', rx:/\bNCR\b|non-?contingent reinforcement/i },
        { name:'Antecedent Manipulation',           rx:/antecedent manipulation/i },
        { name:'Discrete Trial Training (DTT)',     rx:/\bDTT\b|discrete trial/i },
        { name:'Naturalistic Environment Teaching (NET)', rx:/\bNET\b|naturalistic environment teaching|naturalistic teaching/i },
        { name:'Prompt Fading',                     rx:/prompt fading/i },
        { name:'High Probability Request Sequence (behavioral momentum)', rx:/high[- ]probability request|behaviou?ral momentum/i },
        { name:'Premack Principle',                 rx:/premack/i },
        { name:'Shaping',                           rx:/\bshaping\b/i },
        { name:'Task Analysis',                     rx:/task analysis/i },
        { name:'Token Economy',                     rx:/token economy/i },
        { name:'Activity Schedule',                 rx:/activity schedule/i },
        { name:'Visual Schedule',                   rx:/visual schedule/i }
      ];
      const src = String(summary||'');
      let found = known.filter(k => k.rx.test(src)).map(k => k.name);
      // Extinción genérica sobra si ya está la específica de escape.
      if(found.indexOf('Escape Extinction') !== -1) found = found.filter(x => x !== 'Extinction');
      if(!found.length) return 'evidence-based interventions from the clinical context';
      // Tope por sesión, rotando con el resto de la nota para que a lo largo del mes
      // se cubra todo el plan sin que ninguna sesión resulte inverosímil.
      const MAX_TECH = 4;
      if(found.length > MAX_TECH){
        const off = Math.floor(Math.random() * found.length);
        const rot = found.slice(off).concat(found.slice(0, off));
        found = rot.slice(0, MAX_TECH);
      }
      return found.join(', ');
    })();
    return`${base}\nCAREGIVER: ${cg}\nGOALS: ${goalsTxt}\nCLIENT PRESENCE: ${presenceNote}${excl}${clientAbsentRules}\n\nMANDATORY 97156 CONTENT (AUDIT CRITICAL):\nMALADAPTIVE BEHAVIORS addressed: ${mal156List}\nREPLACEMENT BEHAVIORS / PROGRAMS covered: ${rep156List}\nABA TECHNIQUES trained THIS SESSION: ${int156List}\nThese are the items for THIS session and the note must name each one — but naming them is NOT the note. A 97156 documents the TRAINING OF THE CAREGIVER: for every item above, the note must say what the caregiver DID with it (what they rehearsed, at what level of support from ${supv}, what corrective feedback followed, what they will do at home). An item named without the caregiver's observable performance attached is a roll call of procedures, not a record of a training session, and it is what makes a 97156 indefensible in an audit. Do NOT add techniques beyond the list above: a caregiver is not trained in a dozen procedures in one session, and a note that claims it reads as a template. Do NOT restate a procedure's synonym or acronym gloss (never \"X, also referred to as X\"); name each procedure once, the way it is written above.\n\nFUNCTION-MATCHED TRAINING (MANDATORY): the behavior-reduction technique the caregiver is trained on for each maladaptive behavior above MUST be that behavior's function-matched intervention, per the FUNCTION-MATCHED INTERVENTION rule (escape → escape extinction plus teaching an appropriate break/help request; attention → attention extinction plus reinforcing an appropriate attention bid; tangible → extinction plus teaching an appropriate request for the item; automatic → RIRD/DRI plus a matched alternative). Tie each technique explicitly to the specific behavior and its function; do NOT train the caregiver on a technique that does not match a behavior's function, and pair each behavior with its function-matched replacement. The bracketed "[function: …]" beside a behavior is for this matching only — never write the function label anywhere in the note.\n\nWrite a CPT-97156 Family Adaptive Behavior Treatment Guidance note (up to 380 words — do not pad; write only what the session data supports). ${presenceNote} Write in fluid paragraphs. Apply all of the following:

BALANCE OF THE NOTE (the single most common defect in these notes): at least HALF the text must describe the CAREGIVER'S observable performance — what they rehearsed, the level of support they needed, the corrective feedback given and what they did after it, and what they will implement at home. Describing what ${supv} taught is the setup; describing what the caregiver did is the service billed. The client's response, when the client was present, is at most one short sentence — it is not the substance of a 97156.

PARTICIPANTS: state who was present ONCE. Never name the same person twice (never \"...and the caregiver, with the client present\" when the client was already listed).

CLOSING PLAN: state specifically what the next caregiver training session will target, taken from what happened in THIS session (the step the caregiver still needed support for, the procedure to be rehearsed again, the setting to generalise to). Never close with a generic line such as \"will continue working on the objectives set in the plan\".

97156 KEYWORDS — use these verbs throughout: coached, directed, educated, guided, instructed, modeled, practiced, provided feedback, supported, trained, used guided practice, used behavioral skills training (BST).

STRUCTURE — four-part clinical framework woven into prose:
For each training activity: (1) Coaching Strategy used (BST, modeling, role-play, guided practice, verbal/written instruction, performance feedback, problem-solving); (2) Skill or Behavior targeted; (3) clinical rationale ("to remediate deficits related to [functional area]" or "to address the caregiver's difficulties with [specific situation]"); (4) Caregiver Performance — an observable description of what the caregiver did during the activity, using only what was observed and done (e.g., "the caregiver delivered the prompt sequence as modeled and, after corrective feedback, adjusted the timing of reinforcement"). Do not claim improvement, progress, understanding, or mastery, and do not compare to previous sessions unless caregiver-performance data for those sessions was provided. Vary sentence structure across activities; do not reuse a fixed template such as "the caregiver practiced X, showing improved Y".

OPENING: Begin with the analyst checking in with the caregiver on any concerns or difficulties from the past week, and whether any setting events might impact the session.

INCLUDE in fluid paragraphs:
- Place of service and participants (state clearly whether client was or was not present)
- Purpose and specific training goals of the session
${clientPresent
  ? `- Maladaptive behaviors observed and discussed during the session (observable terms, topography)
- For EACH replacement behavior and skill acquisition program listed above: name it explicitly, describe what the caregiver was coached on, what was modeled, what the caregiver practiced, and the specific ABA technique applied
- For EACH ABA technique listed above: name it and describe how the caregiver was trained to implement it
- Client's observable response to interventions modeled during the session`
  : `- Maladaptive behaviors reviewed and discussed based on typical patterns from the treatment plan and caregiver report (not as session events)
- For EACH replacement behavior and skill acquisition program listed above: name it explicitly, describe what was reviewed, what the caregiver was trained to implement at home, the specific ABA technique involved, and how the caregiver will support the program between sessions
- For EACH ABA technique listed above: name it and describe how the caregiver was instructed to apply it at home
- Caregiver's report of recent occurrences at home with specific context`}

- Which BST components were used: instruction (verbal/written), modeling, rehearsal (role-play), feedback — describe each
- Specific ABA techniques covered; name each and describe how it supports the client's treatment objectives. CRITICAL: Reference goals GENERALLY (e.g., "supports skill acquisition objectives," "addresses behavior reduction goals," "targets communication development goals") — do NOT fabricate specific goal numbers like "Goal 2.1" or "STO 1.3" unless these exact numbers were provided in the session goals. NEVER write "Goal 2.1," "Goal 2.3," "Goal 3.4," "STO 1.3," or any numbered objective unless explicitly provided.
- Caregiver's demonstration of the procedure, described in observable terms based only on the information provided. CRITICAL: Do NOT fabricate percentages, scores, or prompt counts (like "scored 80% on the procedural fidelity checklist" or "required 5 prompts, reducing to 1") unless that specific caregiver-performance data was provided. Use observable descriptors of what was done, not claims of progress or internal states: "delivered the procedure as modeled," "required prompting from the analyst to complete the steps," "implemented the sequence after corrective feedback." Do not write "improved," "improved consistency," "mastery," "understanding," or comparisons to previous sessions unless caregiver-performance data was provided.
- Feedback provided to the caregiver — specific and corrective.
- Any new goals created or existing goals modified based on caregiver input; rationale
- Reinforcer types discussed; reinforcement schedule reviewed
- Follow-up from previous session procedure
- If applicable: barriers to treatment progress (prompt dependence, ratio strain, reinforcer dependence, high rate of maladaptive behavior, etc.), environmental changes, medication changes
- End with 1–2 CLOSING PHRASES from the 97156/Parent Training list (replacing "the supervisor" with "${supv}")
- DATA STATEMENT (MANDATORY for 97156): The data documented in this note refers exclusively to the CAREGIVER'S implementation accuracy and procedural fidelity, not to the client's behavioral data. Client behavioral data (frequency of maladaptive behaviors, replacement skill acquisition) is collected by the RBT during 97155/97153 sessions. Use caregiver-performance data language: e.g., "Data on the caregiver's implementation accuracy were collected throughout the session and entered into the client's medical record." Never write that the analyst collected client behavioral data in a 97156 note.
Plain paragraphs only. Always use "${supv}" — never any proper name.`;
  }

  if(ntId==='97155-direct'){
    const gl=[goals.g1,goals.g2,goals.g4].filter(Boolean).join(', ');
    const malList = sessionMal.length ? annotateBehaviorsWithFn(sessionMal, _fnMap).join(' | ') : 'see clinical context';
    const repList = sessionRep.length ? sessionRep.join(' | ') : 'see clinical context';
    return`${base}\nGOALS: ${gl}${tmplInstruction}

MANDATORY SESSION CONTENT — DOCUMENT ALL OF THESE:
MALADAPTIVE BEHAVIORS (each must have its own ABC paragraph): ${malList}
REPLACEMENT BEHAVIORS (each must be documented with teaching method, prompt, and reinforcement): ${repList}
CRITICAL: Replacement behaviors are NOT optional. Every replacement listed above must be documented in a dedicated paragraph. A note that omits replacement behaviors is incomplete and will fail audit.

DIRECT SESSION RULES (STRICT):
- This is a DIRECT treatment session: ${supv} worked face-to-face with ${clientObj.name} with NO RBT or technician present.
- Do NOT mention an RBT, technician, or supervisee anywhere in this note.
- Do NOT include goals related to directing, supervising, or training a technician — those apply only to supervision sessions.
- Participants: ${supv}, ${clientObj.name}, and the caregiver. No technician.

Write a CPT-97155 Behavior Treatment with Protocol Modification note (up to 550 words — do not pad to reach this limit; write only what the clinical data supports). ${supv} provided direct treatment. Write in fluid paragraphs. Include:
- Place of service and participants (${supv}, ${clientObj.name}, caregiver — no RBT). If applicable: environmental changes, medication changes, sickness.
- Specific session goals and objectives
- BEHAVIOR REDUCTION SECTION: For each maladaptive behavior listed above, write a full ABC sequence (antecedent with context and materials; behavior topography; consequence: intervention named and described; effectiveness phrase)
- REPLACEMENT BEHAVIOR SECTION (MANDATORY): For EACH replacement behavior listed above, document: program name, TEACHING METHOD, PROMPT TYPE and fading plan, REINFORCEMENT SCHEDULE, reinforcer category, and ${clientObj.name}'s observable response
- Protocol modification: PROTOCOL MODIFICATION AREA(s); (1) real-time data/observation, (2) specific change with example, (3) rationale, (4) expected outcome and next-session follow-up
- Reinforcers / preferred and aversive stimuli
- If applicable: significant changes vs. prior sessions, incidents, barriers
- End with 1–2 CLOSING PHRASES from the 97155/Supervision list (replacing "the supervisor" with "${supv}")

MANDATORY FINAL PARAGRAPH — CLIENT RESPONSE (60–80 words minimum, separate paragraph, NEVER shorter): This paragraph must be a substantive clinical summary of the client's overall behavioral response during the session. It must include: (1) overall engagement or response pattern across the session; (2) prompt dependency level and any changes observed; (3) frequency or rate of target behaviors observed in THIS session only — NEVER compared to another session; (4) latency or accuracy for at least one replacement program; (5) any notable variation from typical responding. Observable and measurable language only. This paragraph carries independent audit weight — a short or vague client response paragraph is a downcode risk.

NARRATIVE EMPHASIS: Place emphasis on WHY each clinical action was necessary for this client's progress, not just what was done. For each intervention: state the antecedent context, what the analyst did, and the observable effect on the client's behavior. For protocol modification: explain the clinical rationale, what behavioral data or observation triggered the change, and the expected outcome.

PLAN PARAGRAPH (mandatory — BEFORE the closing sentence): Based on the session data documented above, state specifically what the analyst plans to address, modify, or implement in the next session. Begin this paragraph with: "For the next session, ${supv} plans to..." Examples: adjusting the prompt level for a specific program, modifying the reinforcement schedule, introducing a new replacement behavior, conducting a preference assessment, scheduling IOA. Use observable clinical language. Do not use vague phrases like "continue treatment" alone — be specific.

Closing sentence (AFTER the Plan paragraph): Write an original closing sentence conveying that the analyst will review the session data to determine whether protocol modifications are indicated. Vary the wording from previous notes — do not reuse a fixed template. Match the tone of this example but phrase it differently in your own words: "${_pickAnalystClosing(clientObj?.id)}"

Plain paragraphs only. Always use "${supv}" — never any proper name. Never mention an RBT or technician.
FINAL CONSISTENCY CHECK: Every behavior and replacement in the closing and client response must have been introduced earlier in the note.`;
  }

  if(ntId==='supervision-bcaba'){
    const s=window._lastSession;
    // CRITICAL: only use 97155 text if it belongs to the exact same client AND same session
    const raw155=(s&&s.clientId===clientObj.id&&s.sessionTasks&&s.sessionTasks['97155'])
      ?s.sessionTasks['97155'].lastText||''
      :'';
    // Sanitize: strip any name that is not the current client's pseudonym by replacing with "the client"
    const prevNote = raw155
      ? raw155.replace(new RegExp(`\\b${clientObj.name}\\b`,'gi'), clientObj.name)  // normalize casing
      : '';
    const ctx97155=prevNote
      ?`SOURCE — 97155 session note for ${clientObj.name} (this session):\n\n${prevNote}\n\n`
      :`NO 97155 SESSION NOTE IS AVAILABLE FOR THIS RUN. Do NOT invent its content and do NOT write one. Write the supervision log from the supervisory activities alone, keeping it generic about the clinical content: name the supervisory methods used and the competencies assessed, WITHOUT describing behaviors, interventions or the client's responses.\n\n`;
    return`SUPERVISION LOG — THIS IS NOT A SESSION NOTE (ABSOLUTE): you are writing a short SUPERVISION LOG documenting what the supervisor did. NEVER produce a session note here. Forbidden in this document: date, duration, place of service, participants list, setting events, ABC sequences, behavior topographies, frequency data, interventions applied to the client, replacement program implementation, reinforcers, a client-response paragraph, a plan paragraph (\"For the next session...\"), medical-necessity statements and session-note closing phrases. If you find yourself describing what the CLIENT did, stop: this document is about the SUPERVISEE and the supervisor's activities.\n\n${ctx97155}ABSOLUTE ROLE RULE — BCaBA SUPERVISION: The supervisee in this note is EXCLUSIVELY "the BCaBA". NEVER write "the RBT" or "technician" anywhere in this note. This is a BCBA → BCaBA supervision session. Writing "the RBT" in this note is a critical compliance error.

ANALYZE the 97155 session note above and determine which BACB content areas were actually observable and assessable during this supervision session.

CREDENTIAL RULE (ABSOLUTE): the supervisee is a BCaBA, NOT an RBT. A BCaBA is documented against the BACB CONTENT AREAS below, never against the RBT Task List codes (A-1, C-3, D-5, F-2 and the like). Writing an RBT task code in a BCaBA supervision note documents the wrong credential and is a compliance error.

BACB CONTENT AREAS — TASK LIST SKILLS COVERED (select only those the session content supports):
A. Philosophical Underpinnings | B. Concepts and Principles | C. Measurement, Data Display, and Interpretation | D. Experimental Design | E. Ethics (Professional and Ethical Compliance Code for Behavior Analysts) | F. Behavior Assessment | G. Behavior-Change Procedures | H. Selecting and Implementing Interventions | I. Personnel Supervision and Management

BACB CONTENT AREAS — EVALUATION OF SUPERVISEE PERFORMANCE (a distinct axis from the one above; select only what the session supports):
A. Behaviorism and Philosophical Foundations | B. Concepts and Principles | C. Measurement, Data Display, and Interpretation | D. Experimental Design | E. Ethical and Professional Issues | F. Behavior Assessment | G. Behavior-Change Procedures | H. Intervention Development and Monitoring | I. Supervisory Relationships

SUPERVISION COMPONENTS COVERED (name the ones that actually occurred, woven into the prose, never as a list):
Observation of supervisee working with the individual | Observation of supervisee working with caregiver/other provider | Specific recipient discussed | Recipient privacy discussed | Supervisory discussion and feedback | Required documentation reviewed | BACB Task List skills covered

If specific items were selected for this session, they arrive at the end of this prompt under BCABA SUPERVISION COMPONENTS and those take precedence over your own selection: use exactly those.

Write a concise Supervision Log (up to 150 words — write only what the session data supports). Two short paragraphs only.

Paragraph 1 — Supervisory activities: State that ${supv} supervised the BCaBA during the session with ${clientObj.name}. Name supervisory methods used. One or two sentences on any specific correction or training provided.

Paragraph 2 — Competency assessment: name the BACB CONTENT AREAS covered (by their letter and title, e.g. "C. Measurement, Data Display, and Interpretation"), each with one brief phrase on what was actually reviewed or assessed. Where the evaluation axis differs from the skills-covered axis, keep them distinct — evaluating the supervisee's performance in an area is not the same as covering that area during the meeting. Close with one sentence on the supervisee's observable performance and the area requiring continued supervisory focus. Never use RBT task codes here.

STRICT RULES: No clinical narrative. No behavior descriptions or intervention lists. Only supervision activities and competency ratings. No date, duration, or place of service. "${supv}" as supervisor, "the BCaBA" as supervisee — never proper names. NEVER write "the RBT".`;
  }

  if(ntId==='supervision'){
    const s=window._lastSession;
    // CRITICAL: only use 97155 text if it belongs to the exact same client AND same session
    const raw155=(s&&s.clientId===clientObj.id&&s.sessionTasks&&s.sessionTasks['97155'])
      ?s.sessionTasks['97155'].lastText||''
      :'';
    const prevNote = raw155
      ? raw155.replace(new RegExp(`\\b${clientObj.name}\\b`,'gi'), clientObj.name)
      : '';
    const ctx97155=prevNote
      ?`SOURCE — 97155 session note for ${clientObj.name} (this session):\n\n${prevNote}\n\n`
      :`NO 97155 SESSION NOTE IS AVAILABLE FOR THIS RUN. Do NOT invent its content and do NOT write one. Write the supervision log from the supervisory activities alone, keeping it generic about the clinical content: name the supervisory methods used and the competencies assessed, WITHOUT describing behaviors, interventions or the client's responses.\n\n`;
    return`SUPERVISION LOG — THIS IS NOT A SESSION NOTE (ABSOLUTE): you are writing a short SUPERVISION LOG documenting what the supervisor did. NEVER produce a session note here. Forbidden in this document: date, duration, place of service, participants list, setting events, ABC sequences, behavior topographies, frequency data, interventions applied to the client, replacement program implementation, reinforcers, a client-response paragraph, a plan paragraph (\"For the next session...\"), medical-necessity statements and session-note closing phrases. If you find yourself describing what the CLIENT did, stop: this document is about the SUPERVISEE and the supervisor's activities.\n\n${ctx97155}Based on the 97155 session note above, identify which RBT Task List competencies were directly observable during this session. Select ONLY codes with clear evidence in the note.

RBT TASK LIST:
A-1 | A-2 | A-3 | A-5 | A-6 | B-1 | C-3 | C-4 | C-5 | C-9 | C-10 | D-3 | D-4 | D-5 | E-4 | F-2 | F-5

Write a concise Supervision Log (up to 150 words — write only what the session data supports). Two short paragraphs only.

Paragraph 1 — Supervisory activities: State that ${supv} supervised the RBT during the session with ${clientObj.name}. Name the supervisory methods used (direct observation, active direction, real-time corrective feedback, performance assessment, BST components if applicable). One or two sentences on any specific correction or training provided.

Paragraph 2 — Competency assessment: List the Task List codes assessed. Group them using Audit-Ready Monitoring categories (e.g., Procedural Fidelity, Data Collection & Documentation, Clinical Review). Describe what was observed using technical phrasing (e.g., "Evaluated procedural fidelity via direct observation," "Reviewed data trends and variability"). Close with one sentence on overall performance and any area requiring continued supervisory focus.

STRICT RULES: No clinical narrative (that belongs in the 97155 note). No behavior descriptions, no ABC sequences, no intervention lists, no reinforcer lists. Only supervision activities and Task List competency ratings. No date, duration, or place of service. Always "${supv}" as supervisor, "the RBT" as supervisee — never proper names.`;
  }

  const supLabel=ntId==='97155-bcaba'?'BCaBA':'RBT';
  const supOpenings = ntId==='97155-bcaba'
    ? ['The BCBA observed the clinical work of the BCaBA with the client and the caregiver, directed the case analysis and protocol decisions, and evaluated the BCaBA across the relevant BACB content areas,']
    : ['Conducted active direction while the RBT was delivering the service to ensure that the procedures were being implemented correctly, to correct errors in implementation if needed, and to train the supervisee in needed aspects of protocol implementation,'];
  const openingPool = supOpenings.join(' / ');
  const malList = sessionMal.length ? annotateBehaviorsWithFn(sessionMal, _fnMap).join(' | ') : 'see clinical context';
  const repList = sessionRep.length ? sessionRep.join(' | ') : 'see clinical context';
  return`${base}\nGOALS: ${goalsTxt}${tmplInstruction}

MANDATORY SESSION CONTENT — DOCUMENT ALL OF THESE:
MALADAPTIVE BEHAVIORS (each must have its own ABC paragraph): ${malList}
REPLACEMENT BEHAVIORS (each must be documented with teaching method, prompt, and reinforcement): ${repList}
CRITICAL: Replacement behaviors are NOT optional. Every replacement listed above must be documented in a dedicated section of the note. A note that omits replacement behaviors is incomplete and will fail audit.

${supLabel === 'BCaBA' ? 'ABSOLUTE ROLE RULE — BCaBA SESSION: The supervisee implementing treatment in this note is EXCLUSIVELY "the BCaBA". NEVER write "the RBT" anywhere in this note. Only the BCaBA and the BCBA are present. Writing "the RBT" in a BCaBA session note is a critical compliance error that will fail audit.' : ''}

Write a CPT-97155 Behavior Treatment with Protocol Modification note (up to 550 words — length is determined by the clinical data provided, not a minimum to reach). The ${supLabel} implemented treatment; ${supv} provided active supervision, direction, corrective feedback, and protocol modifications. Write in fluid paragraphs. Include all of the following:
- Open with an ORIGINAL opening sentence that you write yourself — do NOT copy a template and do NOT start every note the same way (in particular, do NOT always begin with "Made direct observations" or "Conducted treatment"). Vary the opening word, sentence structure, and phrasing from note to note so no two notes read alike. Keep it clinically accurate and professional (third person, observable language). These are examples ONLY of the appropriate tone and content — match the register but write something different in your own words, do not reuse them verbatim: ${openingPool}
- Place of service and participants. If applicable: environmental changes, medication changes, sickness noted at session start.
- Specific session goals and objectives
- Active direction given to the ${supLabel}: training, directing, BST components; feedback provided in real time with specific examples
- BEHAVIOR REDUCTION SECTION: For each maladaptive behavior listed above, write a full ABC sequence (observable antecedent including context and materials; behavior topography; consequence: name the exact intervention, describe how applied, include an effectiveness phrase)
- REPLACEMENT BEHAVIOR SECTION (MANDATORY — cannot be omitted): For EACH replacement behavior listed above, write a dedicated paragraph documenting: the replacement program by name, the specific TEACHING METHOD used (DTT, NET, chaining, etc.), the specific PROMPT TYPE delivered and fading plan, the REINFORCEMENT SCHEDULE applied, the specific reinforcer category used, and ${clientObj.name}'s observable response
- Protocol modification: name the specific PROTOCOL MODIFICATION AREA(s); (1) real-time in-session data or direct observation that triggered the modification — state the measurable indicator observed BEFORE the change (e.g., frequency, latency, accuracy, prompt level); (2) specific change made, with a concrete example; (3) rationale connecting the observed pattern to the clinical decision; (4) the measurable or observable change noted AFTER the modification within the same session; (5) expected outcome and next-session follow-up. AUDIT RULE: A 97155 note without a before/after within-session comparison is a downcode risk. The before and after must both reference data from THIS session only — never compare to prior sessions.
- Reinforcers / preferred and aversive stimuli
- If applicable: significant changes vs. prior sessions, incidents, barriers, environmental changes, medication changes, sickness
- End with 1–2 CLOSING PHRASES from the 97155/Supervision list (replacing "the supervisor" with "${supv}" and "the technician" with "the ${supLabel}")

MANDATORY FINAL PARAGRAPH — CLIENT RESPONSE (60–80 words minimum, separate paragraph, NEVER shorter): This paragraph must be a substantive clinical summary of the client's overall behavioral response during the session. It must include: (1) overall engagement or response pattern across the session; (2) prompt dependency level and any changes from prior session; (3) frequency or rate of target behaviors observed in THIS session only — NEVER compared to another session; (4) latency or accuracy for at least one replacement program; (5) any notable variation from typical responding. Observable and measurable language only. A short or vague client response paragraph is a downcode risk.

PLAN PARAGRAPH (mandatory — BEFORE the closing sentence): Based on the session data documented above, state specifically what the analyst plans to address, modify, or implement in the next session. Begin this paragraph with: "For the next session, ${supv} plans to..." Use observable clinical language. Be specific — not just "continue treatment".

Closing sentence (AFTER the Plan paragraph): Write an original closing sentence conveying that the analyst will review the session data to determine whether protocol modifications are indicated. Vary the wording from previous notes — do not reuse a fixed template. Match the tone of this example but phrase it differently in your own words: "${_pickAnalystClosing(clientObj?.id)}"

State duration explicitly. Plain paragraphs only. Always use "${supv}" and "the ${supLabel}" — never proper names. ${supLabel === 'BCaBA' ? 'FINAL CHECK: confirm the note contains ZERO mentions of "the RBT". If any RBT reference exists, it must be removed — this is a BCaBA session.' : ''}
FLORIDA MEDICAID COMPLIANCE CHECK — verify the note contains all 7 required elements: (1) date/time/location/duration, (2) maladaptive behaviors observed, (3) replacement/compensatory skills targeted, (4) recipient response to interventions, (5) protocol modification or therapist directions, (6) caregiver presence noted, (7) participants listed.
FINAL CONSISTENCY CHECK: Every behavior and replacement in the closing and client response must have been introduced earlier in the note. Do not add new targets in the closing.`;
}




function build97153Prompt(clientObj, dur, dt, place, summary, pools, rotCtx, includeDuration, envChanges, medConcerns, crisisSituation, freqLine, trialLine, emergingItems, participantsList){
  summary = _effectiveContext(clientObj.id, summary);
  const variationNote=`CRITICAL — CLIENT ISOLATION: This note is for ${clientObj.name} ONLY. Never write the name of any other client, in any context. Every behavior, intervention, replacement, and outcome in this note belongs exclusively to ${clientObj.name}. Begin with a varied clinical opening sentence that does not start with the client name or the date.`;

  // Build participants note if provided — 97153 excludes supervisor/BCBA
  const partStr = participantsList && participantsList.length
    ? participantsList.filter(p => p !== 'supervisor').join(', ')  // Exclude supervisor
    : null;
  const participantsNote = partStr 
    ? `\nPARTICIPANTS PRESENT (RBT session — supervisor NOT present): ${partStr}. State these participants in the opening of the note.`
    : '';

  const malActive=getActiveBehaviors(pools,'mal');
  const repActive=getActiveBehaviors(pools,'rep');
  const malPool=malActive.length?malActive:[];
  const repPool=repActive.length?repActive:[];
  const h=getHistory(clientObj.id||'');
  const selMal = (rotCtx&&rotCtx.mal&&rotCtx.mal.length) ? rotCtx.mal
    : malPool.length ? rotatingPick(malPool,h.mal,3) : [];
  const selRep = (rotCtx&&rotCtx.rep&&rotCtx.rep.length) ? rotCtx.rep
    : repPool.length ? rotatingPick(repPool,h.rep,3) : [];

  let ctx='';
  if(summary){
    ctx=`CLINICAL CONTEXT FOR ${clientObj.name.toUpperCase()}:\n${summary}\n\n`;
  }else if(malPool.length){
    const reinf=pools.reinforcers||'';
    ctx=`CLIENT BEHAVIORAL PROFILE:\nMaladaptive behaviors: ${malPool.join(', ')}\nReplacement targets: ${repPool.join(', ')}${reinf?'\nReinforcers: '+reinf:''}\n\n`;
  }

  // Agency-specific documentation requirements travel with the CLIENT (declared in
  // that client's reduced assessment). Nothing is imposed on clients whose agency
  // has different rules; when a client declares none, this block is empty.
  const _dq = (typeof _clientDocRequirements === 'function') ? _clientDocRequirements(pools||{}) : { text:'', wantsProgramDoc:false };
  // The prose requirements alone were not enough: the model met them "in spirit"
  // (two reinforcers, a generic "verbal praise"). Restate the agency's numbers as
  // explicit per-program quotas, and give the closed per-program activity list when
  // the agency defines one, so this path enforces exactly what the AbaMatrix form does.
  const _pmin = (typeof _programDocMinimums === 'function') ? _programDocMinimums(pools||{}) : null;
  const _hardMin = (_pmin && (_pmin.reinforcers || _pmin.activities || _pmin.social))
    ? ('PER-PROGRAM QUOTAS FOR THIS CLIENT — COUNTED, NOT APPROXIMATED. Apply EVERY one to EVERY replacement program documented in this note:\n'
        + (_pmin.activities  ? '  - name at least ' + _pmin.activities + ' DIFFERENT activities used to teach that program.\n' : '')
        + (_pmin.reinforcers ? '  - name at least ' + _pmin.reinforcers + ' reinforcers delivered while teaching that program.\n' : '')
        + (_pmin.social      ? '  - among them, at least ' + _pmin.social + ' DISTINCT forms of SOCIAL reinforcement, each NAMED. The bare phrases "verbal praise", "social praise" and "praise" do NOT satisfy this on their own — name the form delivered: ' + ABA_SOCIAL_REINFORCER_TYPES.join(', ') + '. Two wordings of praise are ONE form, not two.\n' : '')
        + (_pmin.schedule    ? '  - state its schedule of reinforcement (CRF, FR1, FR2, VR, VI, FI). Every program, not only some.\n' : '')
        + 'Take them only from what this client actually has. A quota NEVER licenses inventing a reinforcer, an activity or a number.\n\n')
    : '';
  const _progActsBlock = (function(){
    const map = (pools && pools.progActs) || null;
    if(!map || typeof _matchProgramActs !== 'function') return '';
    const lines = (selRep||[]).map(function(r){
      const hit = _matchProgramActs(map, r);
      if(!hit || !hit.acts.length) return null;
      return '  - ' + r + (hit.prompt ? ' [' + hit.prompt + ']' : '') + ': ' + hit.acts.join('; ');
    }).filter(Boolean);
    return lines.length
      ? ('ACTIVITIES AUTHORISED BY THE AGENCY FOR EACH PROGRAM OF THIS NOTE — CLOSED LIST. Document each program only through activities from ITS OWN line below. An activity that is not on that program\'s line is not accepted for this client, however sensible it sounds:\n' + lines.join('\n') + '\n\n')
      : '';
  })();
  const _acBlock = (typeof _analystCorrectionsBlock === 'function' && clientObj && clientObj.id)
    ? _analystCorrectionsBlock(clientObj.id) : '';
  const _docReqBlock = _dq.text
    ? ('CLIENT / AGENCY DOCUMENTATION REQUIREMENTS (declared in this client\'s plan — MANDATORY for this client only, additive to the rules above; they never license inventing data):\n' + _dq.text + '\n\n' + _hardMin + _progActsBlock + (_dq.wantsProgramDoc ? RBT_REPLACEMENT_DOC_RULE + '\n' : ''))
    : (_hardMin + _progActsBlock);
  // El minimo ya no es fijo: una sesion de RBT de 5 horas o mas exige 4+4.
  const _min153 = (typeof _rbtMinItems === 'function') ? _rbtMinItems(dur) : 3;
  const _longMinNote = _min153 > 3
    ? ` This session lasts ${dur}, and a session of that length must document at least ${_min153} maladaptive behaviors and ${_min153} replacement programs: documenting only three across five or more hours of direct treatment reads as an under-documented session.`
    : '';
  const selMalStr=selMal.length?selMal.join(', '):'behaviors described in clinical context';
  const selRepStr=selRep.length?annotateBehaviorsWithFn(selRep, getBehaviorFnMap(pools||{}, 'rep')).join(', '):'replacement programs described in clinical context';

  try{ window._lastEnvChanges = envChanges||''; window._lastMedConcerns = medConcerns||''; }catch(e){}
  const envLine97153=envChanges?`\nENVIRONMENTAL CHANGES: ${envChanges} — mention at start of note.`:`\nENVIRONMENTAL CHANGES: NONE WERE REPORTED FOR THIS SESSION — ABSOLUTE PROHIBITION: do NOT mention any environmental change, setting event, move or relocation, change of school or classroom, new or absent caregiver, change of routine or schedule, visitors, travel, or any household/context event. Do not take one from the client profile, the reduced assessment or the background: those are history, not events of this session. The note simply does not mention this topic.`;
  const medLine97153=medConcerns?`\nMEDICAL CONCERNS: ${medConcerns} — mention at start of note.`:`\nMEDICAL CONCERNS: NONE WERE REPORTED FOR THIS SESSION — ABSOLUTE PROHIBITION: do NOT mention any medication change, illness, sickness, poor sleep, allergy, appointment, injury or any medical event. Do not take one from the client profile, the reduced assessment or the background. The note simply does not mention this topic.`;
  // Apertura de setting events: si el analista reportó un cambio ambiental o médico
  // para ESTA sesión, se OBLIGA a documentarlo y se PROHÍBE la apertura "no changes
  // reported". Si no reportó nada, se rota entre las variantes de "sin cambios".
  const _settingReported97153 = !!(envChanges || medConcerns);
  const settingEventsOpening97153 = _settingReported97153
    ? `A SETTING EVENT / CONTEXT CHANGE WAS PROVIDED FOR THIS SESSION (see ENVIRONMENTAL CHANGES / MEDICAL CONCERNS above). You MUST open the note by documenting the specific change(s), and you are ABSOLUTELY PROHIBITED from writing that no environmental or medical changes were reported (do NOT use any "no environmental or medical changes" / "without reported ... changes" phrasing anywhere in the note). Do NOT reframe the change as a mere attendance/participant fact and then negate it.
ATTRIBUTION — match the source to the type of change; do NOT default to "the caregiver reported":
  - Caregiver-reported conditions (poor sleep, missed/changed medication, illness, diet change, an incident at home): "The caregiver reported [the exact condition] prior to the session."
  - Contextual/staffing/setting changes that the RBT observes directly (a new RBT, a new therapist, a change of setting or room, a schedule change, a new person present): state it as an observed context WITHOUT attributing it to the caregiver — e.g. "This session was conducted with a new RBT," / "Services were delivered in a new setting this session," — the caregiver did not "report" a staffing change.
INTEGRATION — MANDATORY: the change is not a throwaway opening line. Reflect its clinical relevance again in the body at least once, in OBSERVABLE terms only (e.g. how the client responded to the changed context at session start and/or during early tasks), without inventing numbers and without speculating about internal states. If the change had no observable effect, you may state that no change in the client's observed behavior was associated with it — but you may NOT negate that the change itself occurred.`
    : `NO SETTING EVENTS WERE REPORTED. Choose ONE of the following variations — rotate across notes, never repeat the same one consecutively:
  V1: "The session began with no environmental or medical changes reported."
  V2: "No environmental or medical changes were reported at session start."
  V3: "The caregiver reported no changes in environmental conditions or medical status prior to the session."
  V4: "No medical or environmental changes were noted prior to the initiation of services."
  V5: "Services were initiated without reported environmental or medical changes."
  V6: "The caregiver indicated no changes in medical status or environmental conditions preceding the session."`;
  const crisisLine97153 = crisisSituation
    ? `\nCRISIS SITUATION THIS SESSION: ${crisisSituation}\nCRISIS RULES: Document the crisis in observable terms. Response blocking may be referenced ONLY as directly caused by this crisis — 10-15 seconds maximum to prevent harm, paired with prompt toward replacement behavior. Notify supervisor per plan. No physical restrictions beyond this.`
    : `\nNO CRISIS THIS SESSION — RESPONSE BLOCKING AND ALL PHYSICAL RESTRICTIONS ARE STRICTLY PROHIBITED. Never mention response blocking in this note. Use only: EXT, DRA, DRI, DRO, FCT, NCR, antecedent manipulation, prompting.`;
  const freqNote97153=freqLine||'';
  const trialNote97153=trialLine||'';
  let emergingLine97153='';
  if(emergingItems){
    const parts=[];
    if(emergingItems.mal?.length) parts.push(`NEWLY OBSERVED MALADAPTIVE BEHAVIORS (emerging — not yet in formal plan, document as newly observed during this session): ${emergingItems.mal.join('; ')}`);
    if(emergingItems.rep?.length) parts.push(`NEWLY OBSERVED REPLACEMENT BEHAVIORS (emerging — document as newly introduced/observed during this session): ${emergingItems.rep.join('; ')}`);
    if(emergingItems.int?.length) parts.push(`NEWLY APPLIED INTERVENTIONS (emerging — introduced during this session, document as new clinical element): ${emergingItems.int.join('; ')}`);
    if(parts.length) emergingLine97153=`\nEMERGING CLINICAL ITEMS (observed this session, not yet in formal plan — document as newly observed prior to reassessment):\n${parts.join('\n')}`;
    if(emergingItems.notes) emergingLine97153+=`\n\nCLINICAL NOTES FOR THIS SESSION — MANDATORY: Incorporate all of the following when writing the note. These are direct clinical instructions from the supervisor and must be reflected in the note content:\n${emergingItems.notes}`;
  }
  const KNOWN_INTERVENTIONS = [
    'Escape Extinction','Extinction','DRA','DRI','DRO','DRL','FCT',
    'Antecedent Manipulation','Response Blocking','Redirection','RIRD',
    'NCR','Non-Contingent Reinforcement','DTT','Discrete Trial Training',
    'NET','Naturalistic Environment Teaching','Incidental Teaching',
    'Prompt Fading','Behavioral Momentum','Premack Principle','Shaping',
    'Task Analysis','Token Economy','Differential Reinforcement',
    'High Probability Request Sequence','Planned Ignoring','Response Interruption',
    'Activity Schedule','Visual Schedule','Stimulus Control Transfer',
    'Generalization','Chaining','Error Correction','Demand Fading',
    'Proximity Control','Provide Choices','Choice Making',
    'Backward Chaining','Forward Chaining','Total Task Presentation',
    'Token Reinforcement','Self-Management','Video Modeling'
  ];
  // Highest-authority source: the interventions the assessment documents FOR EACH
  // maladaptive behavior worked this session (pools.mal[].int). This is the same
  // per-behavior planned procedure the AbaMatrix path uses; it is the real closed
  // list, unlike a fuzzy substring match against the free-text summary.
  const _docdInterventions = (function(){
    const rows = (typeof normalizeBehaviorArr === 'function') ? normalizeBehaviorArr((pools && pools.mal) || []) : [];
    const out = [];
    (selMal||[]).forEach(function(name){
      const row = rows.find(function(b){ return b && String(b.name||'').trim().toLowerCase() === String(name).trim().toLowerCase(); });
      const doc = row && String(row.int||'').trim();
      if(doc) out.push('  - ' + name + ': ' + doc);
    });
    return out;
  })();
  const planInterventions = KNOWN_INTERVENTIONS.filter(intv =>
    summary.toLowerCase().includes(intv.toLowerCase().substring(0,8))
  );
  const interventionConstraint = _docdInterventions.length
    ? `\nINTERVENTION CONSTRAINT — ABSOLUTE CLOSED LIST BY BEHAVIOR (highest authority — these are this client's planned procedures documented in the assessment for each behavior of this session):\n${_docdInterventions.join('\n')}\nYou may document ONLY the interventions named above for each corresponding behavior, plus the always-implicit antecedent manipulation, prompting, and reinforcement delivery. It is STRICTLY PROHIBITED to introduce ANY intervention not documented above for that behavior — do NOT add Redirection / Redirecting, Modeling / Imitation, Premack Principle, DTT, or any other procedure that is not in this client's plan for that behavior, however clinically plausible it looks. Adding an intervention not in the plan is a compliance failure and is forbidden.`
    : planInterventions.length
    ? `\nINTERVENTION CONSTRAINT — ABSOLUTE: You may ONLY use interventions explicitly found in this client's plan. Permitted interventions for this client: ${planInterventions.join(', ')}. Do NOT use any other intervention not listed here — do NOT add Redirection, Modeling, Premack, or any procedure absent from the plan.`
    : `\nINTERVENTION CONSTRAINT: Use only interventions explicitly described in the clinical context above. Do not use generic interventions not mentioned in the plan. Do NOT invent or add interventions that are not present in the clinical context.`;

  // Long session protection (3+ hours): Medicaid requires evidence treatment was
  // active throughout the full session. Inject protection language into prompt.
  const _durHours = dur ? parseFloat(dur.replace(/[^\d.]/g,'')) || 0 : 0;
  const longSessionNote = _durHours >= 3 ? `
LONG SESSION DURATION: ${dur}. This session exceeds 3 hours. Apply ALL of the following protections:
1. TEMPORAL DISTRIBUTION — document that each behavior and each replacement program was addressed
   across multiple points during the session, not only at the beginning. Use language such as:
   'across the session,' 'throughout the session,' 'during both structured and naturally occurring
   activities,' 'at multiple points during the session.' Never imply treatment occurred only at one point.
2. PROGRAM ROTATION EVIDENCE — the note must make clear that different targets were addressed
   at different times. Each behavior and replacement program must be mentioned in context of
   when it occurred (e.g., 'during transitional activities,' 'during academic tasks,'
   'during preferred activity periods'). Do not group everything into one undifferentiated block.
3. ENGAGEMENT ACROSS DURATION — include ONE sentence (not more) from among these options
   (vary which one you use, do not repeat the same one in consecutive notes):
   - 'Behavior reduction procedures were implemented consistently throughout the session.'
   - 'Targets were addressed across repeated structured and naturally occurring opportunities throughout the session.'
   - 'The RBT maintained consistent implementation of prompting and reinforcement procedures across the session duration.'
   - 'Intervention procedures were applied across the full duration of the session, with opportunities distributed across structured activities and natural routines.'
4. PROMPT DEPENDENCE — document prompt dependence at least once in the closing section.
   This is mandatory for long sessions and protects the level-of-care justification.
5. DO NOT use phrases prohibited by the CRITICAL AUDIT VIOLATIONS above even for long sessions.
   'Programs were rotated systematically' remains prohibited. Use the approved language above.
` : '';

  const behaviorConstraint97153 = selMal.length
    ? `\nHARD CONSTRAINT — SESSION BEHAVIOR LIST:\nMALADAPTIVE BEHAVIORS (exactly these ${selMal.length}, minimum ${_min153}, no others): ${selMal.join(' | ')}\nSKILL ACQUISITION / REPLACEMENT PROGRAMS — document EXACTLY these ${selRep.length}, no more and no fewer: ${selRep.join(' | ')}\nSKILL-PROGRAM EXCLUSIVITY (ABSOLUTE): The clinical context/plan below lists many replacement and skill acquisition programs FOR REFERENCE ONLY. In the dedicated skill acquisition / replacement programming section of the note, document ONLY the ${selRep.length} program(s) named in this session list. Do NOT add, mention, or document any other skill acquisition or replacement program from the plan — not even the most salient ones such as focusing on task or accepting "no" — unless it appears in this exact session list. Documenting a program not in this list is a compliance failure and is the exact repetition problem to avoid. (This exclusivity applies ONLY to the dedicated skill acquisition section; it does NOT restrict the brief function-matched replacement response you must name inside each maladaptive-behavior ABC paragraph, which always pairs to that behavior's documented function.)\nACTIVITY VARIATION (MANDATORY): For each skill program above, vary the specific teaching activities, materials, and phrasing from what a prior note would use. Do NOT default to the same activity every session (for example, do not always pair task-focus with the same block/tower-and-puzzle activity). Draw alternative activities and materials from the plan when available, and vary the sentence structure describing them.\nCRITICAL: The note MUST include a dedicated ABC sequence for EVERY one of the ${selMal.length} maladaptive behaviors listed above. Addressing fewer than ${_min153} behaviors is a compliance failure.${_longMinNote} Do not skip, merge, or omit any behavior from the list.\nEvery paragraph — including the interventions paragraph, the client response, and the closing — must reference ONLY these behaviors and replacements. Never introduce any behavior or replacement target not listed here.`
    : '';
  const _prior97153 = ''; // Prior session context disabled
  // MFC closed list (T3): inject only the session-selected behaviors + §4 rule.
  const mfcBlock97153 = _mfcPromptBlock(_mfcGet(clientObj.id||''), selMal);
  return`${variationNote}${participantsNote}${envLine97153}${medLine97153}${crisisLine97153}${freqNote97153}${emergingLine97153}${longSessionNote}${behaviorConstraint97153}${mfcBlock97153}${trialNote97153}${interventionConstraint}${_prior97153}\n\nPRIVACY REMINDER: Do NOT include any diagnosis, diagnostic code, full name, date of birth, Medicaid number, or any PII. Use only the client pseudonym below.\n\n${ctx}PLAN ERROR FILTERING: If the plan contains prohibited terms, planned ignoring for aggression/SIB/elopement, DRL for dangerous behaviors, or non-evidence-based procedures — silently exclude them. Do not replicate plan errors.\n\nCLIENT PSEUDONYM: ${clientObj.name}\nDATE: ${dt}\n${!dur ? "DURATION: NOT PROVIDED — ABSOLUTE PROHIBITION: Do NOT write any duration, time span, length, or session time anywhere in the note. Do not write \"two-hour session,\" \"spanned X hours,\" \"X-hour session,\" or any time reference. The absence of this field means time must not appear in the note under any circumstance." : includeDuration!==false ? "DURATION: "+dur+" — state EXACTLY this duration explicitly in the note body. CRITICAL: Do NOT copy duration from any previous note." : "DURATION: "+dur+" — do NOT mention duration in the note body."}\nPLACE OF SERVICE: ${place}\n\nBehaviors to address this session (MINIMUM ${_min153} required): ${selMalStr}\nReplacement programs to implement: ${selRepStr}\n\nWRITE ABOUT ALL ${selMal.length} BEHAVIORS LISTED ABOVE — never fewer than ${_min153}.\n\nWrite a CPT-97153 Adaptive Behavior Treatment by Protocol note. Length must be determined by the clinical data provided — do not pad, invent, or elaborate beyond what was explicitly provided. The RBT implemented the behavior intervention plan. Write in fluid paragraphs only. Do NOT mention the BCBA, BCaBA, or any supervisor.

STRUCTURE — four-part clinical framework (woven into flowing prose, not as a table or headers):
For each intervention documented, the note must naturally reflect: (1) the specific EBP Intervention used; (2) the Skill or Behavior targeted; (3) what was observed — do NOT add any clinical rationale, purpose phrase, or "to remediate deficits in" language; (4) what the client did or did not do during THIS session — no evaluation of whether the intervention worked. Example: "the behavior was not observed during the final three work intervals" not "the intervention reduced the behavior."

OPENING — SETTING EVENTS:
NEVER write "Prior to the session, the RBT checked with the caregiver for any setting events." That phrase is not clinical content.
${settingEventsOpening97153}
Do NOT use comparative baseline language: "higher than typical," "elevated rate," "more than usual," "atypical for this client" — document only what was directly observed.

MEDICAID AUDIT-PROTECTION RULES — mandatory for every sentence:
1. AGGRESSION/SIB/ELOPEMENT: NEVER "withheld attention," "ignored," or planned-ignoring language for safety-risk behaviors. NEVER use response blocking language unless a CRISIS SITUATION is explicitly provided above. For routine aggression/SIB documentation use: "Escape extinction was implemented by maintaining task demands. Differential reinforcement was delivered contingent on the absence of the target behavior." Response blocking language is insurance-prohibited for routine sessions and must not appear in notes without a documented crisis.
2. FREQUENCY — STRICT RULE: Use exact counts ONLY when a count was explicitly provided in SESSION FREQUENCY DATA above. When NO count was provided for a behavior, do NOT write any quantifier — not "multiple occasions," not "several times," not "on multiple occasions," not "frequently," not "a number of times." Simply state that the behavior was documented during the session without any quantity. Example when no count provided: "Physical aggression was documented during demand contexts within the session." Example when count provided: "Physical aggression was documented on four occasions during the session."
3. OBSERVABLE LANGUAGE ONLY — FORBIDDEN: "calm response," "responded positively," "remained calm," "appeared engaged," "appeared unhappy," "he didn't want to," "fussy." USE INSTEAD: "absence of crying/screaming," "remained seated with hands down," "followed the instruction," "displayed tears and was crying," "engaged in task avoidance behaviors," "sat with hands on the table surface," "vocalized without engaging with materials." Do NOT use "latency decreased," "increased responses," or any phrasing that implies a within-session numerical comparison unless latency or count data was explicitly provided.
4. OBSERVABLE DATA ONLY: Report exact frequency counts, trial accuracy percentages, and prompt levels observed during THIS session only. Do not compare to prior sessions. Do not reference prior session data. Document only what was directly observed and measurable in this session.
5. TRIAL DATA FOR REPLACEMENTS: Include trial counts ONLY if provided in REPLACEMENT PROGRAM TRIAL DATA above. If no trial data was provided, do NOT include any trial counts, percentages, or numeric estimates — use qualitative description only.
6. RBT SCOPE CLOSING — ABSOLUTE LAST sentence. Choose ONE of the following variations and rotate across notes — never use the same variation in consecutive notes:
  V1: "The RBT will communicate any barriers to treatment progress to the analyst and will continue to implement the treatment strategies as outlined in the behavior intervention plan."
  V2: "Any identified barriers to treatment implementation will be communicated to the BCBA. The RBT will continue to implement the treatment strategies as outlined in the behavior intervention plan."
  V3: "The RBT will continue implementing the established treatment strategies and will report any barriers to progress to the analyst."
  V4: "Implementation of the behavior intervention plan will continue in subsequent sessions. Any barriers to treatment progress will be communicated to the lead analyst."
  V5: "The RBT will maintain implementation of the treatment strategies as outlined and will communicate any treatment barriers to the analyst."
  V6: "Barriers to treatment progress, if identified, will be reported to the BCBA. The RBT will proceed with implementation of the established behavior intervention plan."
Nothing may follow this sentence. Do NOT place the medical necessity statement, data statement, or any other content after the closing phrase. Do NOT reference STOs, goals, objectives, or mastery criteria in the closing.

STRUCTURAL VARIATION — MANDATORY:
Medicaid duplicate detection systems compare the textual form of notes — not just clinical content. Notes from the same RBT, BCaBA, or BCBA across clients and across days must not share the same structural phrases, even when the clinical content differs. Variation must be RANDOM and INDEPENDENT for each structural element — not predictable (not "Monday is always V1, Tuesday is always V2"). The STRUCTURAL VARIATION ASSIGNMENT above specifies randomly assigned variants for this specific note. Use EXACTLY those assignments. Do not default to the same phrasing you would use otherwise.

BEHAVIOR PARAGRAPH INTRO (vary per note):
  V1: "[Behavior] was documented during the session."
  V2: "[Behavior] was observed during the session."
  V3: "The RBT documented [behavior] during the session."
  V4: "[Behavior] occurred during the session."
  V5: "Documentation of [behavior] was recorded during the session."
  V6: "[Behavior] presented during the session."

ANTECEDENT INTRO (vary per behavior paragraph — cycle through within the same note):
  A1: "The antecedent consisted of..."
  A2: "The antecedent condition involved..."
  A3: "Antecedent conditions included..."
  A4: "The antecedent observed was..."
  A5: "The precipitating antecedent was..."

ANTECEDENT VS CONSEQUENCE INTERVENTION — CRITICAL (do not confuse the two):
An ANTECEDENT strategy acts BEFORE the behavior occurs and belongs in the antecedent/setup portion of the ABC sequence, NEVER in the position of the intervention applied AFTER the behavior. Antecedent strategies include: antecedent or environmental manipulation, reducing or dividing the demand, high-probability request sequence (behavioral momentum), Premack / if-then arrangements, offering choices, and non-contingent reinforcement (NCR). Do NOT name any of these as the consequence intervention for a behavior.
The CONSEQUENCE INTERVENTION is what the RBT implemented AFTER the behavior occurred, and it must be a true consequence procedure taken from THIS client's plan, matched to the behavior's documented function: extinction / escape extinction, DRA, DRI, DRO, FCT, or redirection. For each maladaptive behavior, name exactly one function-matched consequence procedure that followed the behavior — never substitute an antecedent strategy in that slot. If an antecedent strategy was used, document it as part of the antecedent, and still name the separate consequence procedure that followed the behavior.

REPLACEMENT PROGRAM INTRO (vary per note):
  V1: "Regarding replacement skill programming, the RBT addressed..."
  V2: "The following replacement programs were addressed during the session."
  V3: "Skill acquisition programming was implemented during the session."
  V4: "The RBT addressed the following skill acquisition programs during the session."
  V5: "Replacement behavior programs were implemented as follows."
  V6: "The RBT implemented the following skill acquisition programs during the session."

DATA MONITORING SENTENCE (vary per note):
  V1: "Behavior frequency and skill acquisition were monitored continuously throughout the session using established measurement systems and entered into the client's medical record."
  V2: "Behavior frequency and replacement skill performance were monitored throughout the session using established measurement systems and recorded in the client's medical record."
  V3: "Data on maladaptive behavior frequency and skill acquisition were collected continuously during the session using established measurement systems and entered into the client's medical record."
  V4: "Behavioral data and skill acquisition performance were recorded throughout the session using established measurement systems and entered into the client's medical record."
  V5: "Session data including behavior frequency and skill acquisition were continuously monitored and entered into the client's medical record using established measurement procedures."
  V6: "Maladaptive behavior frequency and replacement skill data were documented throughout the session using established measurement systems and entered into the client's medical record."

DOCUMENTATION QUALITY REQUIREMENTS — apply ALL of the following whenever the session data supports them (never invent content to satisfy them):

1. HEALTH AND SAFETY DECLARATION: Include one observable statement confirming the client's health and safety status during the session, woven naturally into the note (not as a header). Vary the phrasing across notes, for example: "The client's health and safety were maintained throughout the session." / "No health or safety concerns were observed during the session." / "The client remained physically safe throughout the delivery of services." If a crisis or medical concern WAS reported above, reflect that accurately instead of a clean declaration.

2. DETAILED OBSERVABLE TOPOGRAPHIES: For each maladaptive behavior, describe the specific physical form (topography) of what was observed, not a generic label. Instead of "engaged in aggression," write the observable form: "struck the table surface with an open hand," "threw materials onto the floor," "dropped to the floor and remained there." Describe only what was directly seen — movements, vocalizations, physical actions — never internal states or intentions.

3. REPLACEMENT PROGRAMS — INDEPENDENT VS GUIDED RESPONSES: When documenting replacement/skill acquisition programs, distinguish independent responses (performed without prompting) from guided/prompted responses (required prompting). For example: "The client completed [X] independently and required gestural prompting for [Y]." Make the prompt level for each replacement observable and explicit.

4. REINFORCEMENT — EXACT REINFORCERS: When reinforcement is documented, name the SPECIFIC reinforcer delivered. Two acceptable sources: (a) reinforcers from the client's reinforcer list in the clinical context above, and (b) standard/universal ABA reinforcers that apply across clients — verbal praise, social praise/social attention, high-fives, preferred toys, preferred objects, preferred activities, access to breaks, tangible items, edibles already noted as allowed. Instead of "reinforcement was provided," write "access to [specific reinforcer] was delivered contingent on [observable replacement response]" or "verbal praise was delivered contingent on [observable response]." Prefer the client's listed reinforcers when available, but you MAY use the universal reinforcers above when appropriate. Do NOT invent unusual or client-specific reinforcers (specific brand-name items, named foods, named characters) that are neither in the plan nor part of the standard universal set.

5. PROMPT DEPENDENCY: Where the session data supports it, identify which specific skills or responses required repeated prompting. For example: "The client required repeated [prompt type] prompting to [specific response]." Make explicit which skills needed repeated indications, in observable terms, without interpreting why.

6. REPLACE SUBJECTIVE LANGUAGE WITH OBSERVABLE DESCRIPTIONS: Never use unobservable or subjective descriptions. PROHIBITED examples: "constant effort," "tried hard," "was motivated," "put in effort," "engaged willingly," "showed interest," "enjoyed the activity," "was cooperative." Replace every such phrase with the observable behavior actually seen — what the client did, said, or physically performed. If you find yourself describing effort, attitude, or willingness, convert it to the concrete observed action.

CRITICAL AUDIT VIOLATIONS — SCAN YOUR OUTPUT AND DELETE ANY OF THESE BEFORE RESPONDING:
✗ "defined as any instance in which" — NEVER. Operational definitions do not belong in session notes.
✗ "meeting the operational definition of" — NEVER. Same rule.
✗ "Throughout the session, the RBT applied..." or any paragraph that re-lists all interventions used — NEVER. Each intervention is documented once in its behavior paragraph only.
✗ "ensuring that [reinforcer] was not delivered contingent on maladaptive behavior" — NEVER. Functional analysis language.
✗ "based on the continued documentation of" — NEVER. Analytical justification.
✗ "without allowing task escape" — NEVER. Causal reasoning.
✗ "reduce the presence of unstructured intervals" — NEVER. Clinical planning language.
✗ "aligned to the [function] function" — NEVER. Naming behavioral function is BCBA scope.
✗ "across multiple antecedent conditions" / "at points" / "during periods of the session" / "on various occasions" — NEVER. Vague quantifiers. State the antecedent context specifically or use "during the session."
✗ Any statement that a behavior "did not occur," "was not observed," or "was not displayed during this session" — NEVER. If behavior had no count, do not mention it.
✗ "remained in the area without displaying [behavior]" — NEVER. Zero-episode framing.
✗ "[behavior]-avoidance," "task-avoidance vocalizations," "attention-seeking behavior," "escape behavior" — NEVER. These attribute a behavioral function. Name the observable behavior only.
✗ "to reduce the likelihood of the behavior," "to build behavioral momentum" (as purpose phrase), "to strengthen maintenance and generalization," "to support generalization" — NEVER. Causal/purpose language.
✗ "the high rate of maladaptive behavior," "high frequency of," "elevated rate of" — NEVER. Characterizing rate is analytical, not observational.
✗ "behavior indicated reduced engagement," "behavior indicated," "suggested" — NEVER. Clinical inference.
✗ "several task intervals," "repeated verbal prompts," "across multiple trials" — NEVER without a count. Vague quantifiers.
✗ "Replacement skills were prompted and reinforced consistently across contexts to strengthen..." — NEVER. Summary sentence prohibited.
✗ Any statement of Medical Necessity (e.g., "Continued direct ABA intervention remains clinically indicated") — NEVER. Determining clinical necessity is outside the RBT scope of practice.
✗ "Prior to the session, the RBT checked with the caregiver for any setting events" — NEVER.
✗ "to reduce the motivating value" — NEVER. Causal reasoning.
✗ "break-related behaviors were observed" — NEVER. Inferential/functional.
✗ "within the parameters established in the behavior intervention plan" — NEVER. Plan reference prohibited.
✗ "several [opportunities/intervals/trials]" — NEVER without a number. Vague quantifier.
✗ "[client] reacted to" / "reacted to the demand" — NEVER. Mentalistic/causal.
✗ "Programs were rotated systematically across structured and naturally occurring activities" — NEVER. BCBA-scope planning language.
✗ "Opportunities to respond were embedded across structured and naturally occurring activities" — NEVER. BCBA-scope planning language.
✗ "prompting hierarchies were adjusted in real time" — NEVER. Clinical analysis.
✗ "Behavior reduction and skill acquisition protocols were applied continuously throughout the session" — NEVER. Prohibited summary statement.
✗ "in accordance with the established [timer-based/interval/program] criteria" — NEVER. Plan reference.
✗ "The reinforcement schedule remained at CRF" — NEVER. "Remained at" implies no comparison to any other session.
✗ "as independent responding was documented during this session" — NEVER. Analytical justification clause.
✗ "as recorded by the RBT" — NEVER. Redundant.
✗ "Positive reinforcement was delivered contingently to appropriate responses emitted" without specifying behavior, reinforcer, schedule — NEVER. Generic reinforcement statement prohibited.
✗ "the RBT implemented the behavior intervention plan across structured and naturally occurring opportunities" — NEVER. Plan reference + empty clinical content.
✗ "though additional prompting was required across the session" — NEVER. Analytical characterization.
✗ Prompt dependence mentioned more than once in the same note — NEVER. Document once only, in the closing.

WHAT NOT TO INCLUDE:
- STOs, long-term goals, or mastery criteria: never write "the client is approaching mastery," "STO X was addressed," "mastery criteria," or "acquisition target."
- Any assumption or prediction about progress trajectory or future performance.
- Any no comparison to any other sessions: never write "compared to the previous session," "fewer than last session," "more than prior session," "progress since last visit."
- Any analytical assessment or clinical interpretation.
- Effectiveness WORDS and causal claims: never write that a procedure "was effective," "was partially effective," or "successful," and never causally attribute change to the procedure ("the intervention reduced the behavior," "decreased occurrences"). This does NOT exempt you from the mandatory observable RESULT conclusion described in the First section: you must still close each behavior with the observed behavior outcome (the behavior ceased or continued/persisted following the intervention) and whether the client completed or did not complete the task — phrased observably, without the words effective/successful and without saying the procedure reduced or decreased anything.
- Causal reasoning or decision-making narrative: never write "these observations informed how the RBT," "based on the setting events, the RBT decided," "to maintain engagement," "to reduce the motivating operation," "to reduce the motivating value," "as a maintaining variable," "per the written plan," "as outlined in the plan," "within the parameters described in the behavior intervention plan," "in accordance with the established criteria," "in accordance with the established timer-based criteria," "without allowing task escape," "to reduce the likelihood of the behavior," "to build behavioral momentum" (when used as stated purpose), "to strengthen maintenance and generalization," "to support generalization across contexts," "to maintain task engagement," "to establish behavioral momentum," or any phrase stating why an action was taken.
- Behavioral function language: NEVER name or reference the function of a behavior.
- Operational definitions in session notes.
- Clinical purpose phrases: never write "to remediate deficits in [functional area]."
- Vague quantifiers without data: never write "multiple occasions," "several times," "a number of times," "on numerous occasions," "additional occasions," "on select steps," "on a subset of steps," "on one occasion," "on another occasion," "a second instance," "on at least one occasion," "a portion of the steps," "across multiple antecedent conditions," "at points," "during periods of the session," "on various occasions," "in some instances," "across various contexts," "several times," "several intervals," "several task intervals," "repeated prompts," "repeated verbal prompts," "repeated instances," "across multiple trials," or ANY quantity when no count was explicitly provided.
- Change-of-state language without data.
- Projections toward future sessions.
- Functional analysis justification.
- Any invented numeric values.
- Zero-episode statements: NEVER write "zero episodes were documented," "no occurrences were recorded," "the behavior did not occur," "was not observed during this session."
- Technician speculation, personal judgments, mentalism, explanatory fiction, circular reasoning, academic language, slang, condescending tone.

RBT KEYWORDS TO USE: implemented, used, communicated, investigated, directed, adjusted, modeled, showed, explained, instructed, prompted, supported, utilized.

BARRIERS TO TREATMENT (document if applicable — ONE mention only, in the closing medical necessity paragraph): inattentiveness, hyperactivity, scrolling responses, ratio strain, reinforcer dependence, high rate of maladaptive behavior, prompt dependence, high rate of self-stimulatory behavior, motivation weakened by response requirement, obsessive-compulsive behavior patterns.

PROHIBITED SUMMARY PARAGRAPH: Do NOT include a closing paragraph that repeats or summarizes all interventions used across the session.

${RBT_SEQUENCE_RULE}

${RBT_ANTECEDENT_RULE}

${KB_FRAME_RULE}

${KB_HIGH_P_RULE}

${KB_PROMPT_HIERARCHY_RULE}

${RBT_CLINICAL_DOC_RULE}

${SCHOOL_DEMAND_SOURCE_RULE}

${_placeCoherenceRule(place, (participantsList||[]).join(', '))}

${_activitySettingRule(place)}

${_activityFitsClientRule(pools, place)}

${OPERATOR_TEXT_LANGUAGE_RULE}

${(typeof _universalAnalystBlock === 'function') ? _universalAnalystBlock(clientObj && clientObj.id) : ''}${(typeof _recurringDefectsBlock === 'function') ? _recurringDefectsBlock(clientObj && clientObj.id) : ''}

${(typeof _retiredPromptBlock === 'function') ? _retiredPromptBlock(clientObj && clientObj.id) : ''}

${_docReqBlock}${_acBlock}

${NO_CROSS_SESSION_RULE}\n\n${OUTPUT_ONLY_NOTE_RULE}\n\n${SESSION_EVENT_SOURCING_RULE}\n\n${SCHOOL_DEMAND_SOURCE_RULE}\n\n${OPERATOR_TEXT_LANGUAGE_RULE}\n\n${(typeof _universalAnalystBlock === 'function') ? _universalAnalystBlock(clientObj && clientObj.id) : ''}${(typeof _recurringDefectsBlock === 'function') ? _recurringDefectsBlock(clientObj && clientObj.id) : ''}\n\n${(typeof _retiredPromptBlock === 'function') ? _retiredPromptBlock(clientObj && clientObj.id) : ''}

First section: Setting events paragraph. For each maladaptive behavior: full ABC sequence in the MANDATORY RBT SEQUENCE order above (antecedent → behavior → topography → interventions → client response); exact count ONLY if provided; intervention named by its exact ABA procedure name (a function-matched CONSEQUENCE procedure — never an antecedent strategy), IMMEDIATELY followed by the client's observable response/outcome to that specific intervention (e.g., "Following the intervention, the behavior ceased"). Then CLOSE each behavior with a brief observable RESULT conclusion covering two things: (1) whether the target behavior ceased or continued/persisted after the intervention, and (2) whether the client completed or did not complete the task or demand. Phrase it observably, e.g., "Following the intervention, the behavior ceased and the client completed the task" or "the behavior persisted and the client did not complete the task." Do NOT use the words effective, successful, or state that the procedure reduced or decreased the behavior — describe only the observed behavior state and task completion.

Second section: Replacement/skill acquisition programs — only those listed above. For EACH program (organization requirement — a program missing any of these makes the note non-conforming): EBP teaching method named; prompt type and fading; its OWN reinforcement schedule (e.g. CRF, FR1, FR2, VR) — required for every program, not just some; at least THREE reinforcers drawn from the client's documented reinforcers, of which at least TWO are distinct social reinforcers (not "verbal praise" alone — e.g. a high five, a thumbs up, applause, a smile, social interaction); at least TWO different documented activities used to work the skill; and the client's observable response described in QUALITATIVE terms (e.g., "engaged with prompting", "initiated the response with a verbal prompt", "required physical guidance"). 🚨 ABSOLUTE PROHIBITION — NO INVENTED NUMBERS: Do NOT write any trial count, "X out of Y", "X of Y trials/opportunities/occasions", percentage, accuracy figure, count of seconds, count of occasions, or interval duration (e.g. "every 10 minutes") unless that EXACT figure was explicitly provided in REPLACEMENT PROGRAM TRIAL DATA above. If no trial data was provided, describe the response ONLY in qualitative observable terms with NO numbers whatsoever. Phrases like "3 out of 5 opportunities", "maintained eye contact for up to 5 seconds", "requested independently on 6 occasions", "physical prompts for 4 out of 10 trials" are FABRICATED DATA and a Medicaid compliance violation when the numbers were not provided. ONLY if explicit trial data was provided above, include the exact figure.

Third section: Specific interventions used and how they were applied. Confirm each is a function-matched consequence procedure (not an antecedent strategy). Do NOT write that an intervention was "effective," "partially effective," or "successful," and do NOT claim it "reduced" the behavior. The required per-behavior observable result conclusion (behavior ceased/persisted + task completed or not) belongs in the First section as described above; do not restate it here.

Close with the RBT-scope phrase from rule 6 ONLY. Do NOT include any medical necessity statement (e.g., "Continued direct ABA intervention..."), as this is strictly BCBA scope. Nothing after the RBT closing phrase.

Plain paragraphs only. No bold, italic, headers, bullets. Always "the RBT." Florida Medicaid audit-ready.

After the closing phrase output EXACTLY this block (parsed separately):
---INTERVENTIONS---
[one line per intervention you actually used in this session, drawn ONLY from the client's plan — exact ABA procedure names, no inventions]
---END---`;
}
