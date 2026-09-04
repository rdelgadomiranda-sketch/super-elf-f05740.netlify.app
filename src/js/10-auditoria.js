/* ═══════════════════════════════════════════════════════════
   MAPA FUNCIONAL DEL CLIENTE (MFC)
   Per-client, BCBA-validated table: behavior → function(s) →
   allowed replacements, reinforcers-by-function, interventions,
   plus traceability metadata (sourceDoc/validatedBy/validatedAt)
   and gaps. Stored nested in the client's pools jsonb (pools.mfc)
   so it syncs to Supabase with no schema change. The 97153
   generators must not run without a validated MFC.
   Canonical shape: see ESTRATEGIA_NOTAS_RBT.md §2.
═══════════════════════════════════════════════════════════ */

// Canonical function class → the reinforcer "currency" that matches it.
// The reinforcer delivered must be of the same currency as the function.
function _mfcFnClass(fn){
  var s = String(fn||'').toLowerCase();
  if(/escap|avoid|demand/.test(s)) return 'escape';
  if(/attention|social/.test(s))   return 'attention';
  if(/tangible|access|item/.test(s)) return 'tangible';
  if(/automat|sensor/.test(s))     return 'automatic';
  return 'other';
}

function _mfcGet(clientId){
  var pools = LS.get('aba5_pools_' + clientId);
  return (pools && pools.mfc && typeof pools.mfc === 'object') ? pools.mfc : null;
}
function _mfcSet(clientId, mfc){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  pools.mfc = mfc;
  LS.set('aba5_pools_' + clientId, pools);
}

// Compute the gaps for one behavior (documented state that the plan lacks).
// Descriptive Spanish strings for the analyst; drives the T5 warning too.
function _mfcComputeGaps(b){
  var gaps = [];
  var fns  = b.functions || [];
  var reps = (b.replacements || []).filter(function(x){ return String(x||'').trim(); });
  if(fns.length && !reps.length) gaps.push('función documentada sin reemplazo asociado');
  fns.forEach(function(fn){
    var list = (b.reinforcersByFunction || {})[fn] || [];
    if(!list.filter(function(x){ return String(x||'').trim(); }).length){
      gaps.push('función "' + fn + '" sin reforzador asignado');
    }
  });
  return gaps;
}

// Pre-fill a draft MFC from the existing AbaMatrix config + behavior/function
// pools. Convenience only: the BCBA edits and validates. Never invents
// replacements (leaves them empty so gaps surface honestly).
function _mfcDeriveFromConfig(clientId){
  var cfg   = _abaCfg(clientId) || {};
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var fnMap = getBehaviorFnMap(pools);
  var names = (cfg.behaviors && cfg.behaviors.length)
    ? cfg.behaviors.slice()
    : normalizeBehaviorArr(pools.mal || []).map(function(b){ return b.name; });
  var intByFn = cfg.interventionsByFunction || cfg.consequencesByFunction || {};
  var behaviors = names.map(function(name){
    var fns = (cfg.functions && cfg.functions[name]) ? cfg.functions[name].slice() : [];
    // The pool stores multiply-maintained behaviors as "escape+attention", so it has
    // to be split: looking up the joined string in the per-function catalog finds
    // nothing and the behavior ends up with no interventions at all.
    if(!fns.length && fnMap[name]) fns = _fnClassList(fnMap[name]);
    if(!fns.length && fnMap[name]) fns = [fnMap[name]];
    var reinforcersByFunction = {};
    var interventions = [];
    fns.forEach(function(fn){
      reinforcersByFunction[fn] = (_MFC_DEFAULT_REINF[_mfcFnClass(fn)] || []).slice();
      var got = intByFn[String(fn).toLowerCase()] || [];
      got.forEach(function(iv){ if(interventions.indexOf(iv) === -1) interventions.push(iv); });
    });
    var b = {
      name: name,
      functions: fns,
      replacements: [],            // never invented — filled by BCBA from the plan
      reinforcersByFunction: reinforcersByFunction,
      interventions: interventions,
      gaps: []
    };
    b.gaps = _mfcComputeGaps(b);
    return b;
  });
  return {
    clientId: clientId,
    sourceDoc: (cfg.sourceDoc || ''),
    validatedBy: '',
    validatedAt: '',
    behaviors: behaviors
  };
}

// Validate an MFC before saving. Recomputes gaps for every behavior.
// Returns { ok, errors:[], mfc }. sourceDoc + validatedBy are mandatory.
function _mfcValidate(mfc){
  var errors = [];
  mfc = mfc || {};
  if(!String(mfc.sourceDoc || '').trim())   errors.push('Falta sourceDoc (documento fuente / trazabilidad).');
  if(!String(mfc.validatedBy || '').trim()) errors.push('Falta validatedBy (BCBA que valida).');
  var behs = mfc.behaviors || [];
  if(!behs.length) errors.push('El MFC no tiene ninguna conducta.');
  behs.forEach(function(b){
    if(!String(b.name || '').trim()) errors.push('Hay una conducta sin nombre.');
    if(!(b.functions || []).length)  errors.push('La conducta "' + (b.name||'?') + '" no tiene función.');
    b.gaps = _mfcComputeGaps(b);
  });
  return { ok: errors.length === 0, errors: errors, mfc: mfc };
}

// True when the client has a saved MFC with the mandatory metadata and at
// least one behavior. Gate for T2 (blocks 97153 generation without it).
function _mfcReady(clientId){
  var mfc = _mfcGet(clientId);
  return !!(mfc && String(mfc.sourceDoc||'').trim() && String(mfc.validatedBy||'').trim() && (mfc.behaviors||[]).length);
}

// Return the saved MFC if it exists; otherwise derive one from the selected
// config (marked _derived:true). Used by the validator so the reinforcer-by-
// function net keeps running WITHOUT the analyst having to hand off an MFC.
// A derived MFC has empty replacements (never invented) — so the caller MUST
// suppress the "replacement absent" flag and gap notices for derived maps.
function _mfcGetOrDerive(clientId){
  var saved = _mfcGet(clientId);
  if(saved && (saved.behaviors||[]).length) return saved;
  var d = _mfcDeriveFromConfig(clientId);
  if(!d || !(d.behaviors||[]).length) return null;
  d._derived = true;
  return d;
}

// Build the closed-list prompt block for the session-selected behaviors,
// plus the mandatory §4 rule text. selectedNames may be null → all behaviors.
function _mfcPromptBlock(mfc, selectedNames){
  if(!mfc || !(mfc.behaviors||[]).length) return '';
  var want = (selectedNames && selectedNames.length)
    ? selectedNames.map(function(s){ return String(s).toLowerCase(); })
    : null;
  var rows = mfc.behaviors.filter(function(b){
    return !want || want.indexOf(String(b.name).toLowerCase()) !== -1;
  }).map(function(b){
    var fns  = (b.functions || []).join(', ') || '(unspecified)';
    var reps = (b.replacements || []).filter(function(x){ return String(x||'').trim(); });
    var repTxt = reps.length ? reps.join('; ') : '(no documented replacement — do not invent one)';
    var rbf = Object.keys(b.reinforcersByFunction || {}).map(function(fn){
      var l = (b.reinforcersByFunction[fn] || []).filter(function(x){ return String(x||'').trim(); });
      return fn + ' → ' + (l.length ? l.join(', ') : '(none)');
    }).join(' | ') || '(none)';
    var ints = (b.interventions || []).join('; ') || '(none listed)';
    return '- Behavior: ' + b.name +
      '\n    Function(s): ' + fns +
      '\n    Allowed replacement(s): ' + repTxt +
      '\n    Allowed reinforcer(s) by function: ' + rbf +
      '\n    Allowed intervention(s): ' + ints;
  });
  if(!rows.length) return '';
  var rule =
    'TECHNICIAN SCOPE (MANDATORY): describe only what was observed and executed. ' +
    'Do not state the maintaining function of any behavior; function determination belongs to the analyst. ' +
    'Do not claim an intervention was effective, that behavior decreased, or that there was progress or improvement, ' +
    'unless the corresponding numeric datum was provided for this session. The technician teaches, presents, ' +
    'demonstrates and reinforces; the replacement behavior is emitted by the client: never write that the technician ' +
    'executed the replacement program.\n' +
    'CLOSED LIST (MANDATORY): use exclusively the behaviors, functions, replacements, reinforcers and interventions ' +
    'from the functional map below. Do not substitute synonyms, do not complete with items from the platform\'s ' +
    'general catalog, and do not add any element not present in this map.';
  return '\n\nCLIENT FUNCTIONAL MAP (MFC) — closed list for this session:\n' +
    rows.join('\n') + '\n\n' + rule + '\n';
}

// Compact per-behavior reinforcer-by-function constraint for the AbaMatrix
// card builders (which otherwise only know a flat reinforcer list). Directly
// enforces the reinforcer-matches-function rule (strategy defect #1).
function _mfcBehReinfLine(clientId, behName){
  var mfc = _mfcGet(clientId); if(!mfc) return '';
  var b = (mfc.behaviors||[]).find(function(x){ return String(x.name).toLowerCase() === String(behName).toLowerCase(); });
  if(!b) return '';
  var rbf = Object.keys(b.reinforcersByFunction||{}).map(function(fn){
    var l = (b.reinforcersByFunction[fn]||[]).filter(function(x){ return String(x||'').trim(); });
    return '"' + fn + '": ' + (l.length ? l.join(', ') : '(none documented — do not invent)');
  });
  if(!rbf.length) return '';
  var reps = (b.replacements||[]).filter(function(x){ return String(x||'').trim(); });
  return '\n\nCLIENT FUNCTIONAL MAP (MFC) — BCBA-validated closed list for "' + b.name + '" (HARD CONSTRAINT):\n'
    + 'Allowed reinforcer(s) BY FUNCTION (deliver a reinforcer of the SAME currency as the documented function; use ONLY these): ' + rbf.join(' | ') + '\n'
    + (reps.length ? 'Allowed replacement(s) for this behavior (use only these; do not invent): ' + reps.join('; ') + '\n'
                   : 'No documented replacement for this behavior in the plan — do NOT invent one.\n')
    + 'Do not substitute synonyms and do not use any reinforcer or replacement not listed here.';
}

// ── MFC editor UI (operates on the AbaMatrix-selected client _abaClientId) ──
function _mfcEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function _mfcParseList(v){ return String(v||'').split(',').map(function(s){ return s.trim(); }).filter(Boolean); }

function _mfcField(label, cls, val, onch){
  return '<label style="font-size:10px;color:var(--text3)">' + label + '</label>' +
    '<input class="' + cls + '" ' + (onch ? ('onchange="' + onch + '"') : '') +
    ' value="' + _mfcEsc(val) + '" style="width:100%;box-sizing:border-box;font-size:11px;padding:5px;margin:2px 0 6px;border:1px solid var(--border2);border-radius:4px;background:var(--bg);color:var(--text)">';
}
function _mfcRbfHtml(b){
  var fns = b.functions || [], rbf = b.reinforcersByFunction || {};
  if(!fns.length) return '<div style="font-size:10px;color:var(--text3)">Define funciones para asignar reforzadores.</div>';
  return fns.map(function(fn){
    var val = (rbf[fn] || []).join(', ');
    return '<label style="font-size:10px;color:var(--text3)">Reforzadores permitidos para "' + _mfcEsc(fn) + '" (coma)</label>' +
      '<input class="mfc-rbf-in" data-fn="' + _mfcEsc(fn) + '" value="' + _mfcEsc(val) +
      '" style="width:100%;box-sizing:border-box;font-size:11px;padding:5px;margin:2px 0 6px;border:1px solid var(--border2);border-radius:4px;background:var(--bg);color:var(--text)">';
  }).join('');
}
function _mfcRowHtml(b){
  var gaps = b.gaps || [];
  var gapHtml = gaps.length ? '<div style="font-size:10px;color:#c0392b;margin-top:4px">Vac\u00EDos del plan: ' + _mfcEsc(gaps.join('; ')) + '</div>' : '';
  return '<div class="mfc-beh" data-name="' + _mfcEsc(b.name) + '" style="border:1px solid var(--border2);border-radius:5px;padding:8px;margin-bottom:8px">' +
    '<div style="font-weight:600;font-size:11px;margin-bottom:6px">' + _mfcEsc(b.name) + '</div>' +
    _mfcField('Funciones (separadas por coma)', 'mfc-fns', (b.functions||[]).join(', '), '_mfcSyncRow(this)') +
    _mfcField('Reemplazos permitidos (coma) \u2014 no inventar; d\u00E9jalo vac\u00EDo si el plan no lista ninguno', 'mfc-reps', (b.replacements||[]).join(', '), '') +
    '<div class="mfc-rbf">' + _mfcRbfHtml(b) + '</div>' +
    _mfcField('Intervenciones permitidas (coma)', 'mfc-ints', (b.interventions||[]).join(', '), '') +
    gapHtml + '</div>';
}
function _mfcRenderEditor(mfc){
  var host = document.getElementById('mfcEditor'); if(!host) return;
  var sd = document.getElementById('mfcSourceDoc'); if(sd) sd.value = (mfc && mfc.sourceDoc) || '';
  var vb = document.getElementById('mfcValidatedBy'); if(vb) vb.value = (mfc && mfc.validatedBy) || '';
  var behs = (mfc && mfc.behaviors) || [];
  if(!behs.length){ host.innerHTML = '<div style="font-size:10px;color:var(--text3)">No hay conductas. Usa \u201CDerivar del assessment/config\u201D para pre-cargar desde la configuraci\u00F3n de este cliente.</div>'; return; }
  host.innerHTML = behs.map(function(b){ return _mfcRowHtml(b); }).join('');
}
function _mfcSyncRow(el){
  var row = el.closest('.mfc-beh'); if(!row) return;
  var prev = {}; row.querySelectorAll('.mfc-rbf-in').forEach(function(inp){ prev[inp.getAttribute('data-fn')] = inp.value; });
  var fns = _mfcParseList(el.value), rbf = {};
  fns.forEach(function(fn){
    var seed = (prev[fn] !== undefined) ? prev[fn] : (_MFC_DEFAULT_REINF[_mfcFnClass(fn)] || []).join(', ');
    rbf[fn] = _mfcParseList(seed);
  });
  var box = row.querySelector('.mfc-rbf');
  if(box) box.innerHTML = _mfcRbfHtml({ functions: fns, reinforcersByFunction: rbf });
}
function _mfcCollectFromEditor(){
  var behs = [];
  document.querySelectorAll('#mfcEditor .mfc-beh').forEach(function(row){
    var name = row.getAttribute('data-name') || '';
    var functions = _mfcParseList((row.querySelector('.mfc-fns')||{}).value);
    var replacements = _mfcParseList((row.querySelector('.mfc-reps')||{}).value);
    var interventions = _mfcParseList((row.querySelector('.mfc-ints')||{}).value);
    var rbf = {};
    row.querySelectorAll('.mfc-rbf-in').forEach(function(inp){
      var fn = inp.getAttribute('data-fn');
      if(functions.indexOf(fn) !== -1) rbf[fn] = _mfcParseList(inp.value);
    });
    functions.forEach(function(fn){ if(!rbf[fn]) rbf[fn] = []; });
    var b = { name:name, functions:functions, replacements:replacements, reinforcersByFunction:rbf, interventions:interventions, gaps:[] };
    b.gaps = _mfcComputeGaps(b);
    behs.push(b);
  });
  return {
    clientId: _abaClientId,
    sourceDoc: (document.getElementById('mfcSourceDoc')||{}).value || '',
    validatedBy: (document.getElementById('mfcValidatedBy')||{}).value || '',
    validatedAt: '',
    behaviors: behs
  };
}
function _mfcRefreshEditor(){
  if(!document.getElementById('mfcEditor')) return;
  var mfc = _abaClientId ? _mfcGet(_abaClientId) : null;
  _mfcRenderEditor(mfc || { behaviors: [] });
}
function _mfcDerive(){
  if(!_abaClientId){ showMsg('mfcMsg','Selecciona un cliente primero.','err'); return; }
  var existing = _mfcGet(_abaClientId);
  var draft = _mfcDeriveFromConfig(_abaClientId);
  if(existing){
    draft.sourceDoc = existing.sourceDoc || draft.sourceDoc;
    draft.validatedBy = existing.validatedBy || '';
    var byName = {}; (existing.behaviors||[]).forEach(function(b){ byName[b.name] = b; });
    draft.behaviors.forEach(function(b){
      var e = byName[b.name]; if(!e) return;
      if((e.replacements||[]).length) b.replacements = e.replacements.slice();
      (b.functions||[]).forEach(function(fn){
        if(e.reinforcersByFunction && e.reinforcersByFunction[fn]) b.reinforcersByFunction[fn] = e.reinforcersByFunction[fn].slice();
      });
      if((e.interventions||[]).length) b.interventions = e.interventions.slice();
      b.gaps = _mfcComputeGaps(b);
    });
  }
  _mfcRenderEditor(draft);
  if(draft.behaviors.length) showMsg('mfcMsg','Borrador derivado. Revisa los reforzadores por funci\u00F3n, completa los reemplazos del plan y valida.','ok');
  else showMsg('mfcMsg','Este cliente no tiene conductas en su configuraci\u00F3n ni en sus pools. Sube el JSON o carga conductas primero.','err',0);
}
function _mfcSave(){
  if(!_abaClientId){ showMsg('mfcMsg','Selecciona un cliente primero.','err'); return; }
  var v = _mfcValidate(_mfcCollectFromEditor());
  if(!v.ok){ showMsg('mfcMsg','No se guard\u00F3 \u2014 ' + v.errors.join(' \u00B7 '),'err',0); return; }
  v.mfc.validatedAt = new Date().toISOString().slice(0,10);
  _mfcSet(_abaClientId, v.mfc);
  _mfcRenderEditor(v.mfc);
  var gapped = v.mfc.behaviors.filter(function(b){ return (b.gaps||[]).length; }).map(function(b){ return b.name; });
  if(gapped.length) showMsg('mfcMsg','MFC guardado. AVISO al analista \u2014 conductas con vac\u00EDos del plan: ' + gapped.join(', ') + '. La nota se generar\u00E1 sin inventar reemplazo.','ok',0);
  else showMsg('mfcMsg','MFC validado y guardado.','ok');
}

// Audits the generated note against the system's hard rules. Two layers:
// (1) deterministic checks (never miss a banned word or an invented figure),
// (2) an AI clinical review for the rules that need judgement.
function _abaDeterministicAudit(text, clientName){
  var issues = [];
  var banned = ['sensory','relaxation','relaxing','calming','calm','deep breathing','breathing technique','self-regulation','self-soothing','coping','mindfulness','meditation','yoga','problem solving','conflict resolution','social stories','social narratives','anger management','art therapy','frustration','frustrated','stress','anxiety','anxious','upset','empathy','de-escalation','desensitization','response cost','planned ignoring','overwhelm'];
  banned.forEach(function(w){
    var re = new RegExp('\\b' + w.replace(/[-\/]/g,'[-\\s/]?').replace(/\s+/g,'\\s+') + '\\b','i');
    if(re.test(text)) issues.push('Terminología prohibida: "' + w + '"');
  });
  ['effectively','successfully','excellently','remarkably','impressively','flawlessly'].forEach(function(w){
    if(new RegExp('\\b' + w + '\\b','i').test(text)) issues.push('Lenguaje triunfalista: "' + w + '"');
  });
  // RBT scope of practice: an RBT documents, it does not judge, interpret or recommend.
  var ANALYST_ONLY = ['progress','improvement','improved','growth','gains','mastery','mastered','learning','learned','understanding','comprehension','effectiveness','appeared to','seemed to','likely','suggests','indicates','would benefit','recommend','recommendation','should be adjusted','needs modification','responding well','demonstrates progress'];
  ANALYST_ONLY.forEach(function(w){
    if(new RegExp('\\b' + w.replace(/\s+/g,'\\s+') + '\\b','i').test(text)){
      issues.push('Fuera del alcance del RBT (lenguaje de analista): "' + w + '"');
    }
  });
  var nums = (text.match(/\b\d+\s*(?:to|-|–)\s*\d+\s+(?:\w+\s+){0,2}(?:seconds?|minutes?|times?|occasions?|trials?|opportunities|steps?|prompts?)\b/gi) || [])
    .concat(text.match(/\b\d+\s+(?:\w+\s+){0,2}(?:seconds?|minutes?|times?|occasions?|trials?|opportunities|steps?|prompts?)\b/gi) || []);
  var fab = (typeof scanPerfNumbers === 'function') ? scanPerfNumbers(text) : [];
  _dropBlockingRange([...new Set(nums.concat(fab))], text)
    .forEach(function(h){ issues.push('Cifra a verificar (posible fabricación): "' + h + '"'); });
  if(/\ba\s+(RBT|BCBA|BCaBA)\b|\ban\s+RBT\b/i.test(text)) issues.push('Uso de "a/an RBT/BCBA" — debe ser "the RBT", "the BCBA"');
  if(/\*\*|__|\*[^*\n]+\*/.test(text)) issues.push('Texto con negrita/cursiva — la nota debe ir en texto plano');
  if(/^\s*[-•*]\s+/m.test(text)) issues.push('Viñetas o listas — la nota debe ir en párrafos fluidos');
  return issues;
}

async function _abaAuditNote(opts){
  // opts permite reusar esta auditoría para la nota generada (por defecto) o para
  // una nota externa del RBT pegada en la sección "Revisar nota de RBT".
  opts = opts || {};
  var srcId   = opts.srcId   || 'abaNoteOut';
  var outId   = opts.outId   || 'abaAuditOut';
  var msgId   = opts.msgId   || 'abaMsg';
  var btnId   = opts.btnId   || 'abaAuditBtn';
  var emptyMsg= opts.emptyMsg|| 'Genera primero la nota.';
  // clientId indica contra QUÉ cliente se audita. Por defecto el de AbaMatrix;
  // la pestaña "Revisar nota" pasa su propio cliente seleccionado.
  var clientId = opts.clientId || _abaClientId;
  var ta = document.getElementById(srcId);
  var text = ta ? String(ta.value||'').trim() : '';
  if(!text){ showMsg(msgId, emptyMsg,'err'); return; }
  if(!clientId){ showMsg(msgId,'Selecciona un cliente.','err'); return; }
  var c = (clients||[]).find(function(x){ return x.id === clientId; });
  var prof = _sliceProfileFor((LS.get('aba5_assess_' + clientId) || '').trim(), null, { catalogsOnly: true });

  var btn = document.getElementById(btnId); if(btn) btn.disabled = true;
  var out = document.getElementById(outId);
  if(out) out.innerHTML = '<span style="color:var(--text3)">Auditando…</span>';
  try{
    var hard = _abaDeterministicAudit(text, c ? c.name : '');
    // T4 - validador determinista contra el MFC (7 defectos, cada uno con la frase
    // exacta citada). Modo estricto en auditor\u00EDa manual (providedNumbers indefinido).
    var mfcAudit = (typeof _mfcAuditNote==='function') ? _mfcAuditNote(text, clientId) : {findings:[],gapNotices:[]};

    var sys = 'You audit the TEXT OF A CPT 97153 ABA SESSION NOTE for Florida Medicaid compliance.\n\n'
      + 'SCOPE - CRITICAL: you audit ONLY the words written in the note below. You are NOT auditing the client\u2019s assessment, the behavior plan, the analyst\u2019s clinical decisions, or the AbaMatrix platform\u2019s option lists. Those are outside our control and are NOT findings. Never comment on what the assessment does or does not specify, never suggest changes to the behavior plan, and never flag an option that the platform offers. Only report defects present in the note text itself.\n\n'
      + 'PLATFORM-IMPOSED CONTENT - NEVER FLAG THESE (they are closed-list values the platform requires, not something we wrote):\n'
      + '  - Reinforcement schedule texts that are written in the future tense (e.g. \u201Cwill be delivered on a continuous schedule and gradually transitioned to an intermittent schedule\u201D). This is a fixed platform option, not a statement we chose.\n'
      + '  - Replacement program NAMES (e.g. \u201COral Motor Control\u201D, \u201CHands to Self\u201D, \u201CFunctional Vocal Behavior\u201D). These are the platform\u2019s program labels, not operational definitions, and must not be rewritten.\n'
      + '  - The Next Visit statement (e.g. \u201CThe RBT will notify the lead analyst of any treatment challenge\u201D). This field is by definition a forward-looking commitment and is selected from a closed list.\n'
      + '  - Evidenced By statements, antecedents, interventions and result statements copied verbatim from the platform\u2019s closed lists.\n'
      + '  - Response blocking described as lasting 10 to 15 seconds. That range is the documented clinical rule for this practice, NOT fabricated data. Do not flag it.\n'
      + 'Do NOT raise findings about future tense, about program labels not being operationally defined, or about closed-list wording. Focus exclusively on the free text WE wrote: the intervention descriptions, the antecedent interventions and the Relevant Information / Comments.\n\n'
      + 'Report ONLY real problems found in the note - do not invent issues, and do not flag correct practice. Check the note text for:\n'
      + '1. Fabricated data: any number, count, duration, percentage or ratio not supported by the session data.\n'
      + '2. Prohibited terminology: sensory, relaxation, calming, deep breathing, self-regulation, coping, mindfulness, problem solving, conflict resolution, social stories, anger management, art therapy, frustration, stress, anxiety, upset, empathy, or any emotional/mentalist language. Everything must be observable and measurable.\n'
      + '3. Clinical validity AS WRITTEN IN THE NOTE: does the note describe planned ignoring being applied to aggression, SIB, elopement or property destruction (never allowed)? DRL applied to a dangerous behavior? Response blocking described as lasting longer than a short period? A replacement behavior presented as an intervention for the maladaptive behavior? An intervention described that contradicts the behavior function stated in the note?\n'
      + '4. Documentation: caregivers described as collecting data (they never do); a personal name other than the client\'s; use of "a RBT"/"an RBT" instead of "the RBT".\n'
      + '5. Style: first/second person, triumphalist or superlative language, headers, bullet lists, explanatory fiction.\n'
      + '6. Medicaid 59G-4.125: is it clear what the RBT did, with which behavior/target, using which procedure, and what was observed?\n\n'
      + 'Return STRICT JSON: {"verdict":"PASS"|"REVIEW"|"FAIL","findings":[{"severity":"high"|"medium"|"low","issue":"","fix":""}]}. If the note is compliant, return PASS with an empty findings array.';
    var prompt = 'CLIENT NAME (the only personal name allowed): ' + ((c && c.name) || 'the client') + '\n\n'
      + 'NOTE TO AUDIT (this text, and ONLY this text, is what you audit):\n' + text;

    var raw = await callAPI(prompt, sys, null, clientId, 8192, 0);
    var txt = String(raw||'').replace(/```json|```/g,'').trim();
    var data = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    var findings = Array.isArray(data.findings) ? data.findings : [];

    var html = '';
    var mfcFindings = (mfcAudit && mfcAudit.findings) || [];
    var mfcGaps = (mfcAudit && mfcAudit.gapNotices) || [];
    var totalHigh = hard.length + mfcFindings.length + findings.filter(function(f){ return f.severity === 'high'; }).length;
    var verdict = totalHigh ? 'FAIL' : (findings.length ? 'REVIEW' : 'PASS');
    var color = verdict === 'PASS' ? 'var(--green)' : (verdict === 'REVIEW' ? '#b8860b' : 'var(--red)');
    html += '<div style="font-weight:600;color:' + color + ';margin-bottom:6px">Auditoría: ' + verdict +
            (verdict === 'PASS' ? ' — la nota cumple las reglas del sistema.' : '') + '</div>';
    if(hard.length){
      html += '<div style="color:var(--red);font-weight:600;margin-top:4px">Detectado automáticamente (obligatorio corregir):</div>';
      hard.forEach(function(i){ html += '<div style="color:var(--red)">• ' + esc(i) + '</div>'; });
    }
    if(mfcFindings.length){
      html += '<div style="color:var(--red);font-weight:600;margin-top:6px">Mapa Funcional del Cliente (MFC) — el sistema señala, tú decides:</div>';
      mfcFindings.forEach(function(f){
        html += '<div style="color:var(--red)">• [' + esc(f.rule) + '] <span style="color:var(--text3)">' + esc(f.phrase) + '</span></div>';
      });
    }
    if(mfcGaps.length){
      html += '<div style="font-weight:600;margin-top:6px;color:#b8860b">Aviso al analista (vacíos del plan):</div>';
      mfcGaps.forEach(function(g){ html += '<div style="color:#b8860b">• ' + esc(g) + '</div>'; });
    }
    if(findings.length){
      html += '<div style="font-weight:600;margin-top:6px">Revisión clínica:</div>';
      findings.forEach(function(f){
        var sc = f.severity === 'high' ? 'var(--red)' : (f.severity === 'medium' ? '#b8860b' : 'var(--text3)');
        html += '<div style="margin-top:3px;color:' + sc + '">• [' + esc(f.severity||'') + '] ' + esc(f.issue||'') +
                (f.fix ? '<br><span style="color:var(--text3);margin-left:10px">→ ' + esc(f.fix) + '</span>' : '') + '</div>';
      });
    }
    if(out) out.innerHTML = html;
    showMsg(msgId, verdict === 'PASS' ? 'Auditoría superada.' : 'Auditoría: revisa los hallazgos.', verdict === 'PASS' ? 'ok' : 'err');
  } catch(err){
    if(out) out.innerHTML = '';
    showMsg(msgId,'Error al auditar: ' + (err.message||err), 'err');
  } finally {
    if(btn) btn.disabled = false;
  }
}

function cycleFn(evt, type, val, clientId){
  evt.preventDefault(); evt.stopPropagation();
  if(!clientId || (type!=='mal' && type!=='rep')) return;
  const pools = LS.get('aba5_pools_'+clientId) || {};
  const arr = normalizeBehaviorArr(pools[type] || []);
  const item = arr.find(x=>x.name===val);
  if(!item) return;
  _closeFnPicker();

  const current = _fnClassList(item.fn);
  const box = document.createElement('div');
  box.id = 'fnPicker';
  const r = evt.target.getBoundingClientRect();
  box.style.cssText = 'position:fixed;z-index:100003;background:var(--surface);border:1px solid var(--border2);'
    + 'border-radius:7px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:9px 11px;font-size:12px;min-width:190px;'
    + 'top:' + Math.min(r.bottom + 6, window.innerHeight - 210) + 'px;left:' + Math.min(r.left, window.innerWidth - 210) + 'px';
  box.innerHTML = '<div style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-bottom:6px;letter-spacing:.04em">'
      + (type==='mal' ? 'FUNCIÓN DE LA CONDUCTA' : 'FUNCIÓN QUE SIRVE') + '</div>'
    + FN_CLASSES.map(function(f){
        return '<label style="display:flex;align-items:center;gap:7px;padding:3px 0;cursor:pointer;color:var(--text2)">'
          + '<input type="checkbox" class="fnPickOpt" value="' + f + '"' + (current.indexOf(f)>=0?' checked':'')
          + ' style="accent-color:var(--blue)"> ' + f + '</label>';
      }).join('')
    + '<div style="font-size:10px;color:var(--text3);margin-top:7px;line-height:1.45">'
      + 'Marca todas las que apliquen. Una conducta mantenida por más de una función se documenta con todas.</div>';

  document.body.appendChild(box);
  setTimeout(function(){ document.addEventListener('mousedown', _fnPickerOutside, true); }, 0);

  box.querySelectorAll('.fnPickOpt').forEach(function(cb){
    cb.addEventListener('change', function(){
      const picked = Array.prototype.slice.call(box.querySelectorAll('.fnPickOpt'))
        .filter(function(x){ return x.checked; }).map(function(x){ return x.value; });
      // Canonical order and separator, the same the importer writes, so both sources
      // produce identical strings and nothing downstream sees two spellings.
      item.fn = _fnClassList(picked.join('+')).join('+');
      // Edited by a person: it is no longer a guess made from the program name.
      if(item.fn) delete item.fnSrc; else delete item.fnSrc;
      const p = LS.get('aba5_pools_'+clientId) || {};
      p[type] = arr;
      LS.set('aba5_pools_'+clientId, p);
      renderChipPool(type==='mal'?'malPool':'repPool', arr, type, clientId);
    });
  });
}

function viewNoteModal(clientId, noteId){
  try {
    console.log('DEBUG viewNoteModal called:', {clientId, noteId});
    const history = loadNoteHistory(clientId) || [];
    console.log('DEBUG history loaded:', history.length, 'notes');
    
    const note = history.find(n=>n.id===noteId);
    if(!note) {
      alert('Note not found. ID: ' + noteId);
      return;
    }
    
    const modal = document.getElementById('noteViewerModal');
    if(!modal) {
      alert('Modal element not found. The page may not have loaded correctly.');
      return;
    }
    
    // Set title
    const titleEl = document.getElementById('noteViewerTitle');
    if(titleEl) {
      titleEl.textContent = (NOTE_TYPE_LABELS[note.type]||note.type) + ' — ' + note.date;
    }
    
    // Set content
    const box = document.getElementById('noteViewerBox');
    if(box) {
      const pools = LS.get('aba5_pools_'+clientId)||{};
      const client = clients.find(x=>x.id===clientId);
      box.innerHTML = highlightNoteText(note.text, client?.name||'', pools) || note.text;
    }
    
    // Set copy functionality
    const copyBtn = document.getElementById('noteViewerCopy');
    if(copyBtn) {
      copyBtn.onclick = ()=>{
        if(navigator.clipboard) {
          navigator.clipboard.writeText(note.text).then(()=>{
            copyBtn.textContent='✓ Copied';
            setTimeout(()=>copyBtn.textContent='📋 Copy',1500);
          }).catch(()=>{
            // Fallback for older browsers
            prompt('Copy this text:', note.text);
          });
        } else {
          prompt('Copy this text:', note.text);
        }
      };
    }
    
	// Set delete functionality
    const delBtn = document.getElementById('noteViewerDelete');
    if(delBtn) {
      delBtn.onclick = () => {
        if(confirm('Are you sure you want to delete this note? It will be removed from the AI memory.')) {
          deleteNoteFromHistory(clientId, noteId);
          closeNoteViewer();
        }
      };
    }
	
    // Show modal
    modal.style.display='flex';
    console.log('DEBUG: Modal shown successfully');
    
  } catch(error) {
    console.error('Error in viewNoteModal:', error);
    alert('Error opening note: ' + error.message);
  }
}

function highlightNoteText(text, clientName, pools){
  if(!text) return '';

  const mal = getActiveBehaviors(pools,'mal') || [];
  const rep = getActiveBehaviors(pools,'rep') || [];

  // Build separate term sets per category
  function buildTerms(list){
    const set = new Set();
    list.forEach(t => {
      if(!t || !t.trim()) return;
      const clean = t.trim();
      set.add(clean);
      // Also add first 2 significant words (strips articles: a, an, the, for, and, or, of, to)
      const significant = clean.split(/\s+/).filter(w => !['a','an','the','for','and','or','of','to','with','in','on','at','by'].includes(w.toLowerCase()));
      if(significant.length >= 2) set.add(significant.slice(0,2).join(' '));
      // Also add first 3 words verbatim for longer terms
      const words = clean.split(/\s+/);
      if(words.length > 3) set.add(words.slice(0,3).join(' '));
      // Add first word if it's distinctive (5+ chars)
      if(words[0] && words[0].length >= 5) set.add(words[0]);
    });
    return set;
  }

  const malTerms = buildTerms(mal);
  const repTerms = buildTerms(rep);
  // Client name gets its own color
  const nameTerms = clientName && clientName.trim() ? new Set([clientName.trim()]) : new Set();

  // Merge into one regex but track which set each term belongs to
  // Build combined sorted term list: longest first
  const allEntries = [
    ...[...nameTerms].map(t=>({t, cat:'name'})),
    ...[...malTerms].map(t=>({t, cat:'mal'})),
    ...[...repTerms].map(t=>({t, cat:'rep'})),
  ].sort((a,b)=>b.t.length-a.t.length);

  if(!allEntries.length) return _markNumbersHtml(esc(text));

  // De-duplicate: if a term already covered by a longer mal term appears in rep, skip
  const seen = new Set();
  const deduped = allEntries.filter(e => {
    const key = e.t.toLowerCase();
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const escaped = deduped.map(e=>e.t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const rx = new RegExp(`(${escaped.join('|')})`, 'gi');

  // Build a lookup: lowercased term → category
  const catMap = {};
  deduped.forEach(e => { catMap[e.t.toLowerCase()] = e.cat; });

  const COLORS = {
    name: 'color:#7c3aed;font-weight:700',          // purple — client name
    mal:  'color:#dc2626;font-weight:600',           // red — maladaptive behaviors
    rep:  'color:#059669;font-weight:600',           // green — replacement behaviors
  };

  return text.split('\n').map(line=>{
    if(!line.trim()) return '';
    const parts = line.split(rx);
    return parts.map((p,i)=>{
      if(i%2===1){
        const cat = catMap[p.toLowerCase()] || 'mal';
        return `<span style="${COLORS[cat]}">${esc(p)}</span>`;
      }
      return _markNumbersHtml(esc(p));
    }).join('');
  }).join('\n');
}

// Most treatment plans state the function of a MALADAPTIVE behavior and state none
// for the replacement programs, so the extraction comes back with empty fn for every
// replacement and the 1:1 function pairing has nothing to work with. But a replacement
// program's name almost always declares the function it serves — "Manding for
// Attention" is attention, "Manding for Break" is escape — so derive it instead of
// leaving it blank. Order matters: the more specific patterns are tested first.
// Returns '' when the name genuinely does not imply a function, so nothing is invented.
function _inferReplacementFn(name){
  var t = ' ' + String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() + ' ';
  if(!t.trim()) return '';
  // Verbal-behavior and perceptual ACQUISITION programs are not tied to a single
  // function: they teach a repertoire, not a replacement for a maladaptive behavior.
  // They must be excluded BEFORE the keyword rules, because their names contain words
  // that would otherwise trigger one ("Tac common items" is not a tangible program).
  if(/\b(tac|tact|tacting|echoic|intraverbal|imitat\w*|matching|listener responding|visual perception|receptive labeling|expressive labeling)\b/.test(t)) return '';
  var R = [
    // Sensory / automatic
    [/sensor|stereotyp|self stimulat|stimming|calm body|fidget|regulat/, 'automatic'],
    // Attention
    [/attention|greet|social interaction|social skill|social situation|socially|interact(?:ing)? with (?:others|peers)|conversation|peer interact|share|sharing|turn taking|taking turns|wait for attention|join|permission to speak|initiat\w* (?:and maintain|social|interaction)/, 'attention'],
    // Escape
    [/break|help|escape|time on task|on task|off task|follow (?:directions|instructions)|following (?:directions|instructions)|complian|transition|demand|task|work|persist|tolerat|remain\w* (?:on|in|seated|engaged)|stay\w* (?:on|in|seated|engaged)|assigned activity|designated period|for a designated|sustained (?:attention|engagement)|duration of the activity/, 'escape'],
    // Tangible
    // "wait" only implies tangible when what is being waited FOR is an item or access.
    // Plain "Wait for attention" is an attention program, not a tangible one.
    [/tangible|item|preferred|access|deni|accept\w*\s+(?:the\s+)?no|no as a response|request(?:ing)? (?:the )?item|mand for (?:a )?(?:toy|item|snack)|wait(?:ing)?\s+(?:for\s+)?(?:the\s+)?(?:preferred|item|tangible|toy|snack|turn)/, 'tangible']
  ];
  var hits = [];
  R.forEach(function(r){ if(r[0].test(t) && hits.indexOf(r[1]) === -1) hits.push(r[1]); });
  // A few names legitimately serve two functions; keep both rather than pick one.
  if(/transition/.test(t) && hits.indexOf('escape') !== -1 && hits.indexOf('tangible') === -1) hits.push('tangible');
  if(/accept\w*\s+(?:the\s+)?no|no as a response/.test(t) && hits.indexOf('escape') === -1) hits.push('escape');
  return hits.join('+');
}

// Lo aprendido, a la vista. Sin esto el usuario no sabe que el sistema esta
// corrigiendo lo mismo una y otra vez, ni puede llevarselo a su analista.
function _renderDefects(){
  var box = document.getElementById('defectBox');
  if(!box) return;
  if(!activeClientId){ box.innerHTML = ''; return; }
  var list = _defectList(activeClientId);
  if(!list.length){
    box.innerHTML = '<span style="color:var(--text3);font-size:10px">Sin defectos registrados en este cliente todavía.</span>';
    return;
  }
  var esc = function(x){ return String(x||'').replace(/[&<>]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]; }); };
  box.innerHTML = '<div style="font-size:10px;color:var(--text3);margin-bottom:5px;line-height:1.5">Lo que el sistema ha tenido que corregir aquí. Lo que va 2 veces o más ya se avisa en el prompt de las próximas notas de ESTE cliente. Al confirmarlo como clínicamente correcto pasa a aplicarse en <b>todos</b> los clientes del sistema: lo que es correcto lo es para todos.</div>'
    + list.map(function(x){
        var rec = x.n >= 2;
        var st = x.state || '';
        var col = st === 'ok' ? 'var(--green,#16a34a)' : (rec ? 'var(--amber,#b86c00)' : 'var(--text3)');
        var etiqueta = st === 'ok' ? ' — confirmado: se aplica a TODOS los clientes'
                     : (rec ? ' — ya se avisa aquí; sin confirmar no sale de este cliente' : '');
        var btn = function(v, txt, title){
          var on = st === v;
          return '<button onclick="_setDefectState(activeClientId,\'' + x.kind + '\',\'' + (on ? '' : v) + '\')" title="' + title + '"'
            + ' style="margin-left:5px;padding:1px 7px;font-size:9px;border-radius:3px;cursor:pointer;border:1px solid '
            + (on ? 'var(--blue)' : 'var(--border2)') + ';background:' + (on ? 'rgba(37,99,235,.12)' : 'var(--surface)')
            + ';color:' + (on ? 'var(--blue)' : 'var(--text3)') + '">' + txt + '</button>';
        };
        return '<div style="display:flex;gap:6px;align-items:baseline;font-size:11px;color:' + col + ';padding:2px 0">'
          + '<span style="font-family:var(--mono);font-weight:700;min-width:26px">' + x.n + '×</span>'
          + '<span>' + esc(DEFECT_LABELS[x.kind].es) + etiqueta
          + btn('ok', '✓ correcto', 'El señalamiento es clínicamente correcto: aplícalo a todos los clientes')
          + btn('no', '✕ falso aviso', 'El detector se equivocó: deja de avisar y deja de contarlo')
          + '</span></div>';
      }).join('')
    + (function(){
        // Criterio clinico ya validado en cualquier cliente: aplica aqui tambien.
        var gl = _validatedDefects().filter(function(x){
          return !list.some(function(y){ return y.kind === x.kind; });
        });
        if(!gl.length) return '';
        return '<div style="margin-top:8px;padding-top:7px;border-top:1px dashed var(--border2)">'
          + '<div style="font-size:10px;color:var(--text3);margin-bottom:3px">Criterios clínicos ya validados en otros clientes — se aplican también en las notas de éste:</div>'
          + gl.map(function(x){
              return '<div style="font-size:11px;color:var(--green,#16a34a)">✓ ' + esc(DEFECT_LABELS[x.kind].es)
                + ' <span style="color:var(--text3)">(confirmado en ' + x.clients + ' cliente' + (x.clients===1?'':'s') + ')</span></div>';
            }).join('') + '</div>';
      })()
    + (function(){
        // Concentracion por terapeuta: ya no decide la propagacion, dice a QUIEN
        // hay que hablarle cuando un mismo defecto se acumula en su carga de casos.
        var th = _therapistDefects(_therapistOf(activeClientId));
        if(!th.length) return '';
        var t = (therapists || []).find(function(x){ return x && x.id === _therapistOf(activeClientId); });
        return '<div style="margin-top:8px;padding-top:7px;border-top:1px dashed var(--border2)">'
          + '<div style="font-size:10px;color:var(--text3);margin-bottom:3px">Concentrado en varios clientes de '
          + esc((t && t.name) || 'este terapista') + ' — conviene hablarlo con quien redacta:</div>'
          + th.map(function(x){
              return '<div style="font-size:11px;color:var(--red,#c0392b)">· ' + esc(DEFECT_LABELS[x.kind].es)
                + ' <span style="color:var(--text3)">(' + x.clients + ' clientes, ' + x.total + ' veces)</span></div>';
            }).join('') + '</div>';
      })()
    + '<button class="btn btn-outline" style="padding:3px 10px;font-size:10px;margin-top:6px" onclick="_clearDefects(activeClientId)">Borrar esta memoria</button>';
}

function _renderRedFlags(){
  var box = document.getElementById('redFlagBox');
  if(!box) return;
  var all = _redFlags();
  var pend = all.filter(function(f){ return !f.resolved; });
  if(!all.length){ box.style.display = 'none'; box.innerHTML = ''; return; }
  var esc = function(x){ return String(x||'').replace(/[&<>]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]; }); };
  box.style.display = 'block';
  box.innerHTML = '<div style="font-size:12px;font-weight:700;color:var(--red,#c0392b);margin-bottom:5px">🚩 '
      + pend.length + ' indicación(es) de analista contraindicada(s)'
      + (all.length > pend.length ? ' · ' + (all.length - pend.length) + ' ya habladas' : '') + '</div>'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:7px;line-height:1.5">Que lo pida un analista no lo hace clínicamente correcto. Estas indicaciones NO se aplican a ningún cliente y no entran en la memoria del sistema. Revísalas: llevan el principio que incumplen y la alternativa correcta para lo que el analista quería conseguir.</div>'
    + all.map(function(f){
        return '<div style="border-left:3px solid ' + (f.resolved ? 'var(--border2)' : 'var(--red,#c0392b)')
          + ';padding:5px 9px;margin-bottom:7px;background:' + (f.resolved ? 'var(--bg)' : 'rgba(192,57,43,.06)')
          + ';border-radius:0 4px 4px 0;opacity:' + (f.resolved ? '.6' : '1') + '">'
          + '<div style="font-size:10px;color:var(--text3);font-family:var(--mono)">' + esc(f.client)
            + (f.rbt ? ' · RBT ' + esc(f.rbt) : '') + (f.date ? ' · ' + esc(f.date) : '') + '</div>'
          + '<div style="font-size:11px;color:var(--text2);margin-top:2px">Pidió: “' + esc(f.text) + '”</div>'
          + '<div style="font-size:11px;color:var(--red,#c0392b);margin-top:3px">Conflicto: ' + esc(f.conflict) + '</div>'
          + (f.principle ? '<div style="font-size:10px;color:var(--text3);margin-top:2px">Principio: ' + esc(f.principle) + '</div>' : '')
          + (f.alternative ? '<div style="font-size:11px;color:var(--green,#16a34a);margin-top:3px">Alternativa correcta: ' + esc(f.alternative) + '</div>' : '')
          + '<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">'
          + (f.alternative && !f.resolved ? '<button class="btn btn-outline" style="padding:2px 9px;font-size:10px" onclick="_adoptAlternative(\'' + f.clientId + '\',\'' + f.id + '\')">Adoptar la alternativa</button>' : '')
          + '<button class="btn btn-outline" style="padding:2px 9px;font-size:10px" onclick="_resolveFlag(\'' + f.clientId + '\',\'' + f.id + '\')">'
          + (f.resolved ? 'Reabrir' : 'Ya lo hablé con la analista') + '</button>'
          + '</div></div>';
      }).join('');
}




async function analyzeNote(id){
  const noteEl = document.getElementById('box-'+id);
  const noteText = noteEl ? noteEl.textContent.trim() : '';
  if(!noteText){ return; }

  const panelEl = document.getElementById('analysis-'+id);
  if(!panelEl) return;


  // Get client info and prior notes
  const clientId = (id==='an97155' ? document.getElementById('anClientSel')?.value : document.getElementById('genClientSel')?.value) || '';
  const client = clients.find(c=>c.id===clientId);
  const clientName = client?.name || 'el cliente';
  const noteHistory = loadNoteHistory(clientId);

  // Up to 2 previous notes of the same type for comparison (EXCLUYENDO LA DE HOY)
  const currentNoteDate = id==='an97155' ? today() : (document.getElementById('genDate').value || new Date().toISOString().split('T')[0]);
  const noteTypeKey = id === '97153' ? '97153' : id === '97156' ? '97156' : '97155';
  
  const priorNotes = noteHistory
    .filter(n => n.text && n.text.length > 50 && (n.type||'').includes(noteTypeKey) && n.date !== currentNoteDate)
    .slice(0, 2)
    .map((n,i) => `--- NOTA ANTERIOR ${i+1} (${n.date||'fecha desconocida'}) ---\n${n.text.slice(0,1200)}`);

  panelEl.style.display = 'block';
  panelEl.innerHTML = '<div style="padding:14px 16px;font-size:12px;color:var(--text3);font-family:var(--mono);border-top:1px solid var(--border)">'
    + '<span class="spinner spinner-dark" style="display:inline-block;margin-right:6px;width:10px;height:10px;border-width:1.5px"></span>'
    + 'Analizando nota...</div>';
  panelEl.scrollIntoView({behavior:'smooth',block:'nearest'});

  const codeType = id==='97153' ? 'CPT-97153 (tratamiento directo por RBT)' :
                   id==='97156' ? 'CPT-97156 (entrenamiento a padres)' :
                   'CPT-97155 (modificación de protocolo por analista)';

  const priorBlock = priorNotes.length
    ? '\n\nNOTAS ANTERIORES DEL MISMO TIPO PARA COMPARACIÓN:\n' + priorNotes.join('\n\n')
    : '\n\n(No hay notas anteriores disponibles para comparación de similitud.)';

  const prompt = `Eres un experto en documentación clínica ABA, auditoría de Medicaid de Florida y estándares CASP (Council of Autism Service Providers). Analiza la siguiente nota clínica y genera un reporte detallado EN ESPAÑOL.

TIPO DE NOTA: ${codeType}
CLIENTE: ${clientName}

NOTA A ANALIZAR:
${noteText}
${priorBlock}

Genera el siguiente análisis estructurado EN ESPAÑOL. Usa solo los datos disponibles — no inventes información.

═══════════════════════════════════════
ANÁLISIS DE NOTA CLÍNICA ABA
═══════════════════════════════════════

1. SIMILITUD CON NOTAS ANTERIORES
${priorNotes.length ? 'Calcula el porcentaje de similitud textual y estructural con cada nota anterior. Indica si hay frases repetidas, estructura idéntica, o si el contenido varía suficientemente. Un porcentaje mayor a 40% es riesgo de duplicación para auditoría.' : 'No hay notas anteriores disponibles para comparación. Indica N/A.'}

2. CUMPLIMIENTO MEDICAID FLORIDA — PROBABILIDAD DE PASAR AUDITORÍA
Evalúa del 1 al 100% la probabilidad de que esta nota pase una auditoría de Medicaid de Florida. Considera:
- ¿Incluye todos los elementos requeridos? (antecedente, conducta, consecuencia/intervención, respuesta del cliente, lugar y participantes)
- ¿Hay datos inventados o vagas estimaciones numéricas sin fuente?
- ¿Se menciona la función de la conducta (lo cual es territorio del BCBA, no del RBT)?
- ¿Hay lenguaje clínico inapropiado o fuera del scope del firmante?
- ¿Cumple con el nivel de detalle requerido para justificar el nivel de atención?
Indica elementos presentes ✓ y elementos faltantes o en riesgo ✗.

3. CUMPLIMIENTO CASP
Evalúa del 1 al 100% el cumplimiento con los estándares CASP para documentación de servicios ABA. Considera estructura, contenido clínico, lenguaje observable, documentación de intervenciones con evidencia, y documentación de respuesta del cliente.

4. ALERTAS Y TÉRMINOS PROHIBIDOS
Identifica si la nota contiene alguno de los siguientes elementos problemáticos:
- Términos prohibidos: "frustración", "ansiedad", "estrés", "calma", "calmante", "relajación", "estrategias de afrontamiento", "historias sociales", "mindfulness", "respiración profunda"
- Lenguaje inferencial o mentalismos ("parece que estaba frustrado", "quería llamar la atención")
- Ficción explicativa (atribuir causas internas no observables)
- Comparaciones con sesiones anteriores sin datos explícitos
- Uso del término "ignorar" o "ignoring" en contextos de agresión/SIB/elopement
- Afirmaciones de efectividad de la intervención ("la intervención fue efectiva")
- Números o porcentajes sin fuente explícita

5. SEGUIMIENTO CLÍNICO
${priorNotes.length ? 'Evalúa si la nota actual da seguimiento al plan documentado en la nota anterior (párrafo "For the next session..."). Indica si hay continuidad clínica documentada.' : 'Sin notas anteriores disponibles — N/A.'}

6. VOCABULARIO Y SCOPE OF PRACTICE
Evalúa si el vocabulario utilizado es apropiado para el tipo de nota (${codeType}). Identifica cualquier lenguaje que corresponda a un nivel de credencial diferente.

7. RECOMENDACIONES
Lista de 3 a 5 recomendaciones concretas para mejorar esta nota o las futuras notas del mismo tipo.

Sé específico, directo y clínico en el análisis. No uses lenguaje elogioso ni peyorativo.`;

  try {
    const strictPrompt = prompt + "\n\nREGLAS ESTRICTAS DE FORMATO:\n1. NO uses markdown. NO uses asteriscos (**).\n2. Los títulos deben empezar exactamente con el número (ej. '1. SIMILITUD...').\n3. Usa exactamente los símbolos ✓ y ✗ para que la aplicación pueda colorearlos.\n4. Escribe en texto plano estrictamente.";

    const analysis = await callGeminiAPI(strictPrompt, 8192);

    // Render with formatting
    const html = analysis
      .split('\n')
      .map(line => {
        if(line.startsWith('═')) return '<div style="border-top:1px solid var(--border);margin:10px 0"></div>';
        if(/^\d+\.\s/.test(line)) return '<div style="font-weight:700;color:var(--text);margin:12px 0 4px;font-size:13px">'+esc(line)+'</div>';
        if(line.includes('✓')) return '<div style="color:var(--green);font-size:12px;line-height:1.6;padding-left:8px">'+esc(line)+'</div>';
        if(line.includes('✗') || line.includes('⚠')) return '<div style="color:var(--red);font-size:12px;line-height:1.6;padding-left:8px">'+esc(line)+'</div>';
        if(line.trim().startsWith('-')) return '<div style="font-size:12px;line-height:1.6;color:var(--text2);padding-left:12px">'+esc(line)+'</div>';
        if(!line.trim()) return '<div style="height:4px"></div>';
        return '<div style="font-size:12px;line-height:1.7;color:var(--text)">'+esc(line)+'</div>';
      }).join('');

    panelEl.innerHTML = '<div style="padding:16px 18px;border-top:2px solid #7c3aed;background:linear-gradient(135deg,rgba(124,58,237,.03),rgba(139,92,246,.01))">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      + '<span style="font-family:var(--mono);font-size:10px;font-weight:700;color:#7c3aed;letter-spacing:.1em">ANÁLISIS CLÍNICO</span>'
      + '<button class="btn btn-outline" onclick="document.getElementById(\'analysis-'+id+'\').style.display=\'none\'" style="font-size:10px;padding:3px 10px;color:var(--text3)">Cerrar</button>'
      + '</div>' + html + '</div>';
  } catch(err) {
    panelEl.innerHTML = '<div style="padding:12px;color:var(--red);font-size:12px;border-top:1px solid var(--border)">Error en análisis: '+esc(err.message)+'</div>';
  }
}

// Checks that the consequence delivered for the replacement matches the behavior's
// function. A reinforcer that does not match the function means the replacement is
// not functionally equivalent — the procedure would not work.
// Multiply-maintained behaviors are the norm, not the exception (e.g. "Attention +
// Automatic Reinforcement"). The note is correct when the currency of AT LEAST ONE
// documented function was delivered; warn only when NONE of them was. Without this,
// the old single-branch if/else evaluated just the first class and produced false
// warnings on dual-function behaviors.
function _checkFunctionMatch(fn, text){
  var classes = (typeof _fnClassList === 'function') ? _fnClassList(fn) : [];
  if(classes.length > 1){
    var msgs = [];
    for(var i = 0; i < classes.length; i++){
      var one = _checkFunctionMatchOne(classes[i], text);
      if(!one) return null;               // one matched currency is enough
      msgs.push(one);
    }
    return msgs.join(' · ');              // none matched → report every gap
  }
  return _checkFunctionMatchOne(fn, text);
}
function _checkFunctionMatchOne(fn, text){
  var t = String(text||'').toLowerCase();
  var f = String(fn||'').toLowerCase();
  if(/escape/.test(f)){
    // The break must be GRANTED as the consequence. The classic error is
    // "praise was delivered for requesting a break": praise does not reinforce an
    // escape-maintained response — the reinforcer for escape is escape itself.
    // So we require an explicit statement that the break/escape was given, and we
    // reject sentences where the only thing delivered is praise or an edible.
    var t2 = t.replace(/\bfor\s+requesting\s+a?\s*break\b/g, ' ')   // "praise for requesting a break"
              .replace(/\brequest(ing|ed|s)?\s+a?\s*break\b/g, ' '); // "the client requested a break"
    var granted = /(granted|provided|delivered|allowed|given|permitted)[^.]{0,30}\b(a\s+)?break\b/.test(t2)
      || /\bbreak\b[^.]{0,25}\b(was|were)\s+(granted|provided|delivered|allowed|given)/.test(t2)
      || /(demand|task)[^.]{0,35}\b(removed|withdrawn|reduced|paused|terminated|discontinued)\b/.test(t2)
      || /(allowed|permitted)\s+to\s+(stop|leave|step away|move away|take a break)/.test(t2)
      || /(access to escape|escape was (delivered|provided|granted))/.test(t2)
      || /\btook a break\b|\bbrief break\b[^.]{0,20}(was|were)?\s*(given|provided|granted|allowed)/.test(t2);
    if(!granted){
      return 'función Escape: no se documenta que el descanso/escape fuera ENTREGADO como consecuencia de la respuesta de reemplazo. Reforzar con elogio o comida no es funcionalmente equivalente — el reforzador del escape es el escape mismo';
    }
    } else if(/attention/.test(f)){
    if(!/(attention|praise|eye contact|turned to|responded to|interact|acknowledg)/.test(t)){
      return 'función Attention: no se documenta que se entregara atención por la respuesta de reemplazo';
    }
  } else if(/tangible/.test(f)){
    if(!/(access to|the item|the toy|delivered the|provided the requested|granted access|obtained the)/.test(t)){
      return 'función Tangibles: no se documenta que se entregara el objeto/actividad solicitado por la respuesta de reemplazo';
    }
  } else if(/automatic|sensory/.test(f)){
    if(!/(alternative item|manipulat|fidget|engaged with the|comparable|alternative response)/.test(t)){
      return 'función de reforzamiento automático: no se documenta una alternativa que produzca estimulación comparable';
    }
  }
  return null;
}

function _scrub97153Numbers(text, authData){
  if(!text) return { text: text, removed: [] };
  var auth = {};
  String(authData||'').replace(/\d+/g, function(n){ auth[String(parseInt(n,10))] = 1; return n; });
  var removed = [];
  // Los datos autorizados llegan en cifras; el fragmento puede venir en letras.
  var allAuth = function(frag){ var ns = _numTokens(frag); return ns.length > 0 && ns.every(function(n){ return auth[String(n)]; }); };
  var apply = function(re, rep){ text = text.replace(re, function(m){ if(allAuth(m)) return m; removed.push(m.trim()); return m.replace(re, rep); }); };
  // COUNTS: the note states that it happened — never how many times. No vague
  // quantifiers ("multiple times", "several") either: the quantity simply goes away.
  apply(new RegExp('\\b' + NUM_SRC + '\\s*(?:out of|of)\\s*' + NUM_SRC + '\\s+(trials?|opportunities|occasions?|responses|intervals|steps|prompts|directives)\\b', 'gi'), 'the $1 presented');
  apply(new RegExp('\\b' + NUM_SRC + '\\s*(?:out of|of)\\s*' + NUM_SRC + '\\s+times\\b', 'gi'), '');
  apply(new RegExp('\\b' + NUM_SRC + '\\s*(?:out of|of)\\s*' + NUM_SRC + '\\b', 'gi'), 'the opportunities presented');
  apply(new RegExp('\\b(?:on|in|across|over|during|for)\\s+' + NUM_SRC + '\\s+(?:occasions?|trials?|opportunities|responses|intervals)\\b', 'gi'), '');
  apply(new RegExp('\\b' + NUM_SRC + '\\s+times\\b', 'gi'), '');
  apply(new RegExp('\\b' + NUM_SRC + '\\s+(trials?|opportunities|occasions?|responses|steps|prompts)\\b', 'gi'), 'the $1 presented');
  // DURATIONS ARE VALID AND PRESERVED: "for up to 5 seconds", "10-15 seconds" state
  // the brief time something was applied or occurred — clinically legitimate, not a
  // fabricated performance count. They are intentionally NOT stripped.
  apply(new RegExp('\\brang(?:e|ed|es|ing)\\s+from\\s+' + NUM_SRC + PCT_SRC + '(?:to|through|and|-|–)\\s*' + NUM_SRC + PCT_SRC, 'gi'), 'was documented');
  apply(new RegExp('\\b' + NUM_SRC + PCT_SRC + '(?:to|through|and|-|–)\\s*' + NUM_SRC + PCT_SRC, 'gi'), '');
  apply(new RegExp('\\branging from\\s+' + NUM_SRC + '\\s*(?:%|percent)', 'gi'), '');
  apply(new RegExp('\\b(fidelity|integrity|adherence|compliance|accuracy|independence)\\s+(?:was|is|of|at|reached|measured\\s+at)\\s+' + NUM_SRC + '\\s*(?:%|percent)', 'gi'), '$1 was documented');
  apply(new RegExp('\\b' + NUM_SRC + PCT_SRC + '(accuracy|independent\\w*|correct\\w*|success\\w*|accurate\\w*)\\b', 'gi'), '$1');
  apply(new RegExp('\\b' + NUM_SRC + PCT_SRC + 'of the time\\b', 'gi'), '');
  apply(new RegExp('\\b' + NUM_SRC + PCT_SRC + 'of\\s+(opportunities|trials|intervals|responses)\\b', 'gi'), 'of the $1');
  apply(new RegExp('\\b' + NUM_SRC + PCT_SRC + '(fidelity|integrity|adherence|compliance)\\b', 'gi'), '$1');
  apply(new RegExp('\\b' + NUM_SRC + PCT_SRC + '(reduction|decrease|increase|improvement)\\b', 'gi'), '$1');
  apply(new RegExp('\\b(reduction|decrease|increase|improvement|reduced|decreased|increased)\\s+(?:of|by|to)\\s+' + NUM_SRC + '\\s*(?:%|percent)', 'gi'), '$1');
  apply(new RegExp('\\b' + NUM_SRC + '\\s*(?:%|percent\\b)', 'gi'), '');
  // Cross-session comparisons: the other session's data is never available, so any
  // such clause is fabricated. Removed outright (the prompts also forbid it).
  apply(/,?\s*(?:when |where )?compared (?:to|with) (?:the )?(?:prior|previous|last)[^.;]*/gi, '');
  apply(/\bCompared (?:to|with) (?:the )?(?:prior|previous|last)[^.;]*[.;]?/g, '');
  apply(/,?\s*(?:which is |this is )?(?:a )?(?:lower|higher|reduced|increased|fewer|greater)\s+(?:rate|number|frequency)[^.;]*than[^.;]*/gi, '');
  text = text.replace(/\b(was|were|is|are|of|at|to|by|with|reached|around|approximately|about|a|an)\s+([.,;])/gi, '$2');
  text = text.replace(/\b(a|an)\s+(a|an)\b/gi, '$2');
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').replace(/[ \t]+$/gm, '');
  // Tidy up what removal leaves behind: orphan punctuation and empty sentences.
  text = text.replace(/(^|\n)\s*[.,;]+\s*(?=\n|$)/g, '$1');
  text = text.replace(/\.\s*\./g, '.').replace(/,\s*\./g, '.').replace(/\(\s*\)/g, '');
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { text: text, removed: removed };
}

// Mechanical defects that survive any prompt rule, cleaned deterministically.
// None of these change clinical content: they remove text that is not clinical
// content at all, or fix agreement the model got wrong. Returns {text, fixed[]}.
function _polishNoteText(text){
  var fixed = [];
  if(!text) return { text: text, fixed: fixed };
  var t = String(text);
  var mark = function(label, before){ if(before !== t) fixed.push(label); };
  var b;

  /* 0. VOCABULARIO DEL FORMULARIO DE SUPERVISION. Los componentes del BACB se
        llaman "Observation of supervisee working with the individual",
        "Specific recipient discussed"… y el modelo arrastraba esas palabras a la
        prosa. "Supervisee" y "the individual" son lenguaje de formulario: el
        reglamento exige nombrar el rol real y "the client".
        El rol se deduce del propio texto — si la nota habla del BCaBA, el
        dirigido es el BCaBA; si habla del RBT, es el RBT — asi que no hace
        falta pasarle contexto y funciona en las cuatro rutas que llaman aqui. */
  b = t;
  /* Sin distinguir mayusculas: la mencion suele abrir frase ("The BCaBA led…")
     y con la version sensible a mayusculas no se detectaba el rol, asi que TODO
     caia en el respaldo generico y una nota de BCaBA acababa diciendo "the
     technician" — degradando al analista asistente a tecnico.
     Si aparecen los dos, el dirigido es el BCaBA: en esa configuracion el BCBA
     supervisa al BCaBA y el RBT es quien implementa con el cliente. */
  var _role = /\bthe\s+BCaBA\b/i.test(t) ? 'the BCaBA'
            : /\bthe\s+RBT\b/i.test(t)   ? 'the RBT'
            : /\bthe\s+technician\b/i.test(t) ? 'the technician' : '';
  if(_role){
    t = t.replace(/\bthe supervisee\b/g, _role)
         .replace(/\bThe supervisee\b/g, _role.charAt(0).toUpperCase() + _role.slice(1));
  }
  // Sin rol identificable no se inventa uno: se neutraliza a "the technician",
  // que es la unica lectura segura, y queda anotado en el informe de arreglos.
  else {
    t = t.replace(/\bthe supervisee\b/g, 'the technician')
         .replace(/\bThe supervisee\b/g, 'The technician');
  }
  mark('"supervisee" sustituido por el rol real', b);

  b = t;
  t = t.replace(/\bthe specific recipient\b/gi, 'the client')
       .replace(/\bthe recipient\b/gi, 'the client')
       .replace(/\bthe individual\b/gi, 'the client');
  // "The" al principio de frase conserva su mayuscula.
  t = t.replace(/(^|[.!?]\s+)the client\b/g, function(m, p1){ return p1 + 'The client'; });
  mark('lenguaje de formulario ("the individual", "the recipient") sustituido por "the client"', b);

  // 1. Internal variant selectors leaking into the note. The prompt assigns a
  //    structural variant per note ("use V5"), and the model sometimes writes the
  //    LABEL instead of just applying it: "V5: The RBT addressed target behaviors".
  //    Only V1-V6 and A1-A5 are ever assigned, so the pattern stays tight enough
  //    that no clinical sentence can match it.
  b = t;
  t = t.replace(/(^|\n)[ \t]*(?:\*{0,2})(V[1-6]|A[1-5])(?:\*{0,2})[ \t]*:[ \t]*/g, '$1');
  t = t.replace(/(^|[.!?]\s+)(V[1-6]|A[1-5])[ \t]*:[ \t]*(?=[A-Z])/g, '$1');
  mark('marcador de variante interna (V#/A#)', b);

  // 2. Stray punctuation opening the note or a paragraph (";Clinical oversight...").
  b = t;
  t = t.replace(/^[\s;:,.–—-]+/, '');
  t = t.replace(/\n[ \t]*[;:,][ \t]*(?=[A-Za-z])/g, '\n');
  mark('puntuación suelta al inicio', b);

  // 3. Doubled function words across a line break or a rewrite ("the the BCBA").
  //    Restricted to closed-class words that can never legitimately repeat. "that
  //    that" is deliberately NOT here: "the protocol that that therapist used" is
  //    correct English, and collapsing it would change the sentence.
  b = t;
  t = t.replace(/\b(the|a|an|of|to|and|in|on|at|for|with|is|was|were|by)\s+\1\b/gi,
                function(m, w){ return w; });
  mark('palabra duplicada', b);

  // 4. "the 3 hours session" -> "the 3-hour session". The duration is passed in as
  //    "3 hours" and gets dropped in front of a noun without adjusting the number.
  b = t;
  t = t.replace(/\b(\d+(?:\.\d+)?)\s+hours?\s+(session|observation|appointment|visit)\b/gi, '$1-hour $2');
  t = t.replace(/\b(\d+)\s+minutes?\s+(session|observation|appointment|visit)\b/gi, '$1-minute $2');
  mark('concordancia de la duración', b);

  // 5. Bracketed labels copied straight out of the prompt: "For [Instructional
  //    procedures], ..." The brackets are prompt syntax, never note content, and a
  //    bracketed label reads as an unfilled template. The label itself is kept —
  //    removing it would delete clinical content — but unbracketed and lowercased,
  //    which turns the placeholder back into an ordinary sentence.
  b = t;
  t = t.replace(/\[([A-Z][^\[\]\n]{2,80})\]/g, function(m, inner){
    return inner.charAt(0).toUpperCase() + inner.slice(1);
  });
  // A label that opens a clause reads better in lower case: "For Instructional
  // procedures," -> "For instructional procedures,".
  t = t.replace(/\b(For|Regarding|Under|In)\s+([A-Z])([a-z]+(?:\s+[a-z]+){0,6}),/g, function(m, lead, c1, rest){
    return lead + ' ' + c1.toLowerCase() + rest + ',';
  });
  mark('etiqueta entre corchetes', b);

  // 6. Behavior and replacement names collected in CAPS. The stored name keeps the
  //    spelling the plan or the platform uses, but shouting it inside a clinical
  //    sentence is a transcription artefact. Sentence case in the prose only.
  //    Acronyms of four or more letters are protected by name; those of three or
  //    fewer (RBT, ABA, DRA, DRO, NCR, NET, ABC, SIB, IOA, CPT, BST…) are never
  //    touched because the rule only fires from four letters up.
  b = t;
  // El sufijo opcional cubre las variantes reales de estos instrumentos y
  // credenciales: ABLLS-R, BCBA-D, DSM-5.
  var KEEP_CAPS = /^(BCBA|BCABA|BCaBA|RIRD|ABLLS|VBMAPP|VB-MAPP|PECS|ADHD|HIPAA|MAND|DSM|ASHA|BACB|EFL|PEAK)(-[A-Z0-9]+)?$/;
  // El apóstrofo NO entra en el patrón. Estaba dentro y contaba como carácter, así
  // que un acrónimo de tres letras en posesivo — "RBT's" — llegaba a cuatro y se
  // minusculizaba: "rbt's". La longitud se mide sobre las LETRAS, no sobre el texto
  // coincidente, para que el posesivo y el guion no alteren el conteo.
  t = t.replace(/\b[A-Z][A-Z-]{2,}\b(?!\d)/g, function(w){
    var letters = w.replace(/[^A-Z]/g, '');
    if(letters.length < 4) return w;        // RBT, DRA, DRO, NCR, CPT, SIB, ABC…
    return KEEP_CAPS.test(w) ? w : w.toLowerCase();
  });
  // Recapitalise whatever now opens a sentence.
  t = t.replace(/(^|[.!?]\s+|\n)([a-z])/g, function(m, pre, c){ return pre + c.toUpperCase(); });
  mark('nombre en mayúsculas a Sentence case', b);

  /* 6b. ENCABEZADOS DE SECCION AL INICIO DE PARRAFO. El reglamento pide prosa
         corrida sin encabezados, pero tres system prompts pedian "concluir con
         un parrafo Plan for Next Session" — con el nombre entrecomillado, que el
         modelo leia como un titulo que hay que escribir. Se reformularon esos
         prompts; esto quita la etiqueta si aun asi aparece.
         Lista cerrada a proposito: solo los rotulos que el propio sistema pudo
         inducir. Nada que se parezca a una frase clinica se toca. */
  b = t;
  var _HEADINGS = ['plan for next session','plan for the next session','plan for next sessions',
                   'next session plan','future planning','future plan','plan for follow-up',
                   'session plan','plan'];
  _HEADINGS.forEach(function(h){
    // Los dos puntos pueden ir dentro o fuera de la negrita — "**Plan:**" y
    // "**Plan**:" son ambos rotulos — asi que se admiten marcadores en las tres
    // posiciones y se exigen los dos puntos, que son lo que hace de esto un rotulo.
    var _bold = '(?:\\*\\*|__)?[ \\t]*';
    var re = new RegExp('(^|\\n)[ \\t]*' + _bold + h.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&') + '[ \\t]*' + _bold + ':[ \\t]*' + _bold, 'gi');
    t = t.replace(re, '$1');
  });
  // La frase que quedaba detras del rotulo empieza ahora el parrafo: mayuscula.
  t = t.replace(/(^|\n)([a-z])/g, function(m, p1, p2){ return p1 + p2.toUpperCase(); });
  mark('encabezado de sección eliminado ("Plan for Next Session:")', b);

  /* 6c. AVISOS INTERNOS QUE SE COLARON EN LA NOTA. Al catalogo de actividades se
         le pega entre corchetes una advertencia dirigida al modelo — que la
         actividad no cabe en este sitio, o que exige habla vocal en un cliente
         que usa otra modalidad. El prompt dice que no se copien; esto es el
         seguro por si se copian igual. Lista cerrada: solo los avisos que
         escribe el propio sistema. */
  b = t;
  t = t.replace(/[ \t]*\[\s*(?:NOT USABLE AT THIS PLACE OF SERVICE|REQUIRES VOCAL SPEECH|STEREOTYPED ACTIVITY)\b[^\]]*\]/gi, '');
  mark('aviso interno del catálogo eliminado de la nota', b);

  // 7. Leftovers from the substitutions above.
  b = t;
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.,;:])/g, '$1').replace(/[ \t]+$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  mark('espaciado', b);

  return { text: t, fixed: fixed };
}

function scanPerfNumbers(noteText){
  const out=[]; if(!noteText) return out; const seen={};
  const add=f=>{const k=f.toLowerCase().replace(/\s+/g,' ').trim(); if(!seen[k]){seen[k]=1;out.push(f.trim());}};
  const pats=[
    new RegExp('\\b' + NUM_SRC + '\\s*(?:out of|of)\\s*' + NUM_SRC + '(?:\\s+[A-Za-z]+){0,3}\\b', 'gi'),
    new RegExp('\\bon\\s+' + NUM_SRC + '\\s+occasions?\\b', 'gi'),
    new RegExp('\\bfor up to\\s+' + NUM_SRC + '\\s*(?:seconds?|minutes?)\\b', 'gi'),
    new RegExp('\\b' + NUM_SRC + PCT_SRC + '(?:accuracy|of\\s+(?:opportunities|trials|intervals|responses))', 'gi'),
    // Percentage RANGE (e.g. "45% to 55%", "45-55%") and fidelity/integrity figures.
    // These are invented performance data; the RBT note must never contain them.
    // "IOA > 90%" style single figures in analyst notes are intentionally not matched.
    new RegExp('\\b' + NUM_SRC + PCT_SRC + '(?:to|through|and|-|–)\\s*' + NUM_SRC + PCT_SRC, 'gi'),
    new RegExp('\\branging from\\s+' + NUM_SRC + '\\s*(?:%|percent)', 'gi'),
    new RegExp('\\b' + NUM_SRC + PCT_SRC + '(?:fidelity|integrity|adherence|compliance)\\b', 'gi'),
    new RegExp('\\bfidelity[^.\\n]{0,40}?' + NUM_SRC + '\\s*(?:%|percent)', 'gi'),
    // Single-number counts of trials/occasions/steps/prompts/times (e.g. "5 times",
    // "4 trials", "6 opportunities") — fabricated frequency data when not provided.
    new RegExp('\\b' + NUM_SRC + '\\s+(?:times|trials?|opportunities|occasions?|responses|steps|prompts)\\b', 'gi'),
    // Performance percentages with a clear performance context. Kept specific so the
    // IOA criterion "90-95%" (no such word after it) and provided figures are NOT hit.
    new RegExp('\\b' + NUM_SRC + PCT_SRC + '(?:independent\\w*|correct\\w*|success\\w*|accurate\\w*|mastery|of the time)\\b', 'gi'),
    // Comparative/percentage-change claims ("40% reduction", "improvement of 30%").
    new RegExp('\\b' + NUM_SRC + PCT_SRC + '(?:reduction|decrease|increase|improvement)\\b', 'gi'),
    new RegExp('\\b(?:reduction|decrease|increase|improvement|reduced|decreased|increased)\\s+(?:of|by|to)\\s+' + NUM_SRC + PCT_SRC, 'gi')
  ];
  pats.forEach(re=>{let m;while((m=re.exec(noteText))){add(m[0]);}});
  return out;
}

function _postNoteChecks(noteText, clientId, msgId){
  try{
    const warns = [];
    // (a) fabricated performance numbers
    const fab = (typeof scanPerfNumbers==='function') ? scanPerfNumbers(noteText) : [];
    if(fab.length) warns.push('cifra(s) de desempe\u00F1o a verificar: "'+fab.slice(0,4).join('", "')+'"');
    // (a1) Spanish left inside an English note
    const esLeft = (typeof scanSpanishLeftover==='function') ? scanSpanishLeftover(noteText) : [];
    if(esLeft.length){
      _recordDefect(clientId, 'espanol');
      warns.push('la nota trae texto en ESPAÑOL (' + esLeft.slice(0,4).join(', ')
        + '…) — lo que escribes en los campos libres debe salir redactado en inglés clínico; regenera');
    }
    // (a2) academic demand attributed to the therapist
    const acad = (typeof scanTherapistAcademicDemand==='function') ? scanTherapistAcademicDemand(noteText) : [];
    if(acad.length){
      _recordDefect(clientId, 'academico');
      warns.push('el terapeuta aparece presentando una tarea acad\u00E9mica \u2014 debe presentarla el maestro, el asistente de aula o el cuidador: "'
        + acad.slice(0,3).join('", "') + '"');
    }
    // (b) cross-note similarity for THIS client (warning only; also stores the note for future comparison)
    if(clientId && typeof ANTI_SIMILARITY_ENGINE!=='undefined'){
      const res = ANTI_SIMILARITY_ENGINE.postGenerationAnalysis(clientId, noteText, clientId);
      const sim = res && res.similarityRisk;
      if(sim && sim.isRisky){
        warns.push('similitud alta con una nota reciente de este cliente ('+Math.round(sim.similarity*100)+'%, umbral 50%): var\u00EDa apertura, cierre e intervenciones y regenera');
      }
    }
    // (b2) cross-client similarity for the SAME analyst: two of this analyst's notes
    // (across ANY of their clients) must never exceed 70% word overlap. The threshold is
    // higher than the per-client 50% because different clients' notes legitimately share
    // clinical vocabulary; 70% catches only genuine near-duplicates. Global storage key.
    if(typeof ANTI_SIMILARITY_ENGINE!=='undefined' && typeof ANTI_SIMILARITY_ENGINE.checkSimilarityRisk==='function'){
      try{
        const _crossKey = '_analyst_all';
        const crossRisk = ANTI_SIMILARITY_ENGINE.checkSimilarityRisk(_crossKey, noteText, 0.70);
        ANTI_SIMILARITY_ENGINE.storeNoteForSimilarityTracking(_crossKey, noteText, { clientId: clientId || '' });
        if(crossRisk && crossRisk.isRisky){
          warns.push('similitud alta con otra nota reciente de este analista ('+Math.round(crossRisk.similarity*100)+'%, umbral 70% entre clientes): var\u00EDa apertura, cierre e intervenciones y regenera');
        }
      }catch(e){/* never break generation */}
    }
    // (c) reinforcer \u2194 function currency (the same deterministic check AbaMatrix runs
    // per card). For each maladaptive behavior that (i) has a documented function and
    // (ii) is actually named in this note, verify the note documents the reinforcer in
    // the currency of that function; warn if it does not. De-duplicated per function so
    // a multi-behavior note flags each function at most once.
    if(clientId && typeof _checkFunctionMatch==='function' && typeof getBehaviorFnMap==='function'){
      try{
        const fnMap = getBehaviorFnMap(LS.get('aba5_pools_'+clientId) || {});
        const lower = String(noteText||'').toLowerCase();
        const seenFn = {};
        Object.keys(fnMap).forEach(name=>{
          const fn = fnMap[name];
          if(!fn || seenFn[fn]) return;
          if(lower.indexOf(String(name||'').toLowerCase()) === -1) return; // behavior not in this note
          seenFn[fn] = 1;
          const mis = _checkFunctionMatch(fn, noteText);
          if(mis) warns.push('reforzador/funci\u00F3n \u2014 '+mis);
        });
      }catch(e){/* never break generation */}
    }
    // (c3) evento ambiental/medico no reportado para esta sesion
    if(typeof scanUnreportedEvents==='function'){
      try{
        var _ue = scanUnreportedEvents(noteText, !!(window._lastEnvChanges||''), !!(window._lastMedConcerns||''));
        if(_ue.length) warns.push('la nota menciona un evento que NO se indic\u00F3 para esta sesi\u00F3n \u2014 ' + _ue.slice(0,2).join(' \u00B7 ') + ': b\u00F3rralo o rec\u00F3gelo en el campo correspondiente');
      }catch(e){}
    }
    // (c2) fecha o periodo ajeno a esta sesion: evento historico re-fechado a hoy
    if(typeof scanForeignDates==='function'){
      try{
        var _fd = scanForeignDates(noteText, (typeof _lastNoteDate!=='undefined' ? _lastNoteDate : ''));
        if(_fd.length) warns.push('fecha/periodo ajeno a esta sesi\u00F3n: "'+_fd.slice(0,3).join('", "')+'" \u2014 verifica que no sea un evento pasado documentado como actual');
      }catch(e){}
    }
    // (d) intervention \u2194 function red lines (the same hard vetoes AbaMatrix enforces
    // deterministically via _abaEnforceRules, here as review warnings for the smart
    // flows' free prose). Only fires on specific, low-false-positive patterns.
    if(clientId && typeof getBehaviorFnMap==='function'){
      try{
        const fnMap = getBehaviorFnMap(LS.get('aba5_pools_'+clientId) || {});
        const lower = String(noteText||'').toLowerCase();
        let anyAutomatic=false, dangerousPresent=false, anyWithFn=false;
        Object.keys(fnMap).forEach(name=>{
          if(lower.indexOf(String(name||'').toLowerCase())===-1) return; // only behaviors named in this note
          anyWithFn=true;
          if(_fnClassList(fnMap[name]).indexOf('automatic')>=0) anyAutomatic=true;
          if(typeof _abaIsDangerous==='function' && _abaIsDangerous(name)) dangerousPresent=true;
        });
        // RIRD/DRI are automatic-function procedures. Suppress if the note itself hints
        // at an automatic function (behavior may be named differently than the pool).
        const noteHintsAutomatic = /automatic reinforcement|self-stimulat|stereotyp/i.test(noteText);
        if(anyWithFn && !anyAutomatic && !noteHintsAutomatic && /response interruption|\brird\b|differential reinforcement of incompatible/i.test(noteText)){
          warns.push('intervenci\u00F3n/funci\u00F3n \u2014 la nota documenta RIRD/DRI (procedimiento de funci\u00F3n autom\u00E1tica) pero ninguna conducta de la nota es de funci\u00F3n autom\u00E1tica');
        }
        if(dangerousPresent && /planned ignoring|attention extinction/i.test(noteText)){
          warns.push('intervenci\u00F3n/funci\u00F3n \u2014 planned ignoring/attention extinction con una conducta peligrosa presente: verificar que NO se aplique a ella');
        }
        // Precise version of the same red line: planned ignoring named in the SAME
        // paragraph as a behavior it is vetoed for. The analyst reported this twice
        // for tantrums (escape and tangible), so the warning has to point at the
        // paragraph instead of asking the reader to hunt for it.
        try{
          String(noteText||'').split(/\n\s*\n|(?=\bBEHAVIOR REDUCTION\b)/).forEach(function(par){
            if(!/planned ignoring/i.test(par)) return;
            var hit = Object.keys(fnMap).find(function(nm){
              return nm && par.toLowerCase().indexOf(String(nm).toLowerCase()) !== -1
                     && typeof _abaIsDangerous === 'function' && _abaIsDangerous(nm);
            });
            if(!hit && /tantrum|rabieta/i.test(par)) hit = 'tantrum';
            if(hit){
              warns.push('planned ignoring documentado en el mismo p\u00E1rrafo que "' + hit + '": est\u00E1 vetado para esa conducta en cualquier funci\u00F3n \u2014 en funci\u00F3n tangible se ense\u00F1a a PEDIR el \u00EDtem (FCT/mand) con extinci\u00F3n del acceso, y en escape se usa extinci\u00F3n del escape con petici\u00F3n de descanso');
            }
          });
        }catch(e){}
        // B) intervention definitions / textbook paragraphs
        try{
          var _defRe = /\b(planned ignoring|ignorar planificado|extinction|extinci[oó]n|escape extinction|differential reinforcement[^.,;]{0,40}|reforzamiento diferencial|dra|dro|dri|fct|functional communication training|entrenamiento en comunicaci[oó]n funcional|behavioral momentum|premack|non-?contingent reinforcement|ncr|response block(?:ing)?|bloqueo de respuesta|redirection|redirecci[oó]n|prompting|token economy|econom[ií]a de fichas)\b[^.]{0,30}\b(is defined as|is a procedure|refers to|consists of|involves|is a technique|is an evidence-based|means that|se define como|que consiste en|consiste en|es un procedimiento|es una t[eé]cnica|se refiere a)\b/i;
          var _dm = String(noteText||'').match(_defRe);
          if(_dm) warns.push('la nota DEFINE una intervenci\u00F3n ("' + _dm[0].replace(/\s+/g,' ').trim().slice(0,70) + '\u2026"): la analista pide documentar lo que se hizo, no explicar qu\u00E9 es el procedimiento');
        }catch(e){}
      }catch(e){/* never break generation */}
    }
    if(warns.length && typeof showMsg==='function'){
      showMsg(msgId, '\u26A0 REVISAR \u2014 '+warns.join(' \u00B7 ')+'.', 'err', 0);
    }
  }catch(e){/* guard must never break generation */}
}

// T4 - Validador posterior a la generaci\u00F3n para 97153 (RBT), contra el MFC.
// Determinista. Devuelve { findings:[{rule, phrase}], gapNotices:[String] }.
// SE\u00D1ALA, no reescribe: por la orden de trabajo el sistema marca y el humano
// decide. Cada hallazgo lleva la frase exacta citada y la regla infringida.
// providedNumbers: array (o booleano) que indica si la sesi\u00F3n aport\u00F3 cifras;
// si es indefinido se asume SIN datos (modo estricto: se marca todo para revisi\u00F3n).
function _mfcAuditNote(text, clientId, providedNumbers){
  var out = { findings: [], gapNotices: [] };
  try{
    var t = String(text||'');
    var lower = t.toLowerCase();
    var hasData;
    if(Array.isArray(providedNumbers)) hasData = providedNumbers.length>0;
    else if(typeof providedNumbers==='boolean') hasData = providedNumbers;
    else hasData = !!providedNumbers;
    var mfc = (typeof _mfcGetOrDerive==='function') ? _mfcGetOrDerive(clientId) : ((typeof _mfcGet==='function') ? _mfcGet(clientId) : null);
    var behs = (mfc && mfc.behaviors) ? mfc.behaviors : [];
    // MFC derivado de la config (sin validar por el BCBA): tiene replacements
    // vac\u00EDos por dise\u00F1o, as\u00ED que NO se marca "reemplazo ausente" ni se emiten
    // gapNotices (ser\u00EDa ruido por cada conducta). Los guardarra\u00EDles de
    // reforzador-por-funci\u00F3n (defecto #1) s\u00ED corren sobre el MFC derivado.
    var mfcDerived = !!(mfc && mfc._derived);
    function add(rule, phrase){ if(phrase) out.findings.push({rule:rule, phrase:String(phrase).trim()}); }
    function snip(idx, len){ var s=Math.max(0, idx-25), e=Math.min(t.length, idx+len+35); return (s>0?'\u2026':'')+t.slice(s,e).replace(/\s+/g,' ').trim()+(e<t.length?'\u2026':''); }
    function flagRe(rule, re){ var m, seen={}; re.lastIndex=0; while((m=re.exec(t))!==null){ var ph=snip(m.index, m[0].length); if(!seen[ph]){seen[ph]=1; add(rule, ph);} if(!re.global){break;} if(m.index===re.lastIndex){re.lastIndex++;} } }
    // Segmento de texto que corresponde a UNA conducta: desde su nombre hasta el
    // nombre de la siguiente conducta del MFC (o el final). Acota la b\u00FAsqueda de
    // reforzadores a la tarjeta de esa conducta en notas con varias conductas.
    function _behSeg(nm){ var i=lower.indexOf(String(nm).toLowerCase()); if(i===-1) return {txt:'',start:0}; var end=t.length; behs.forEach(function(ob){ var on=String(ob.name||'').trim(); if(!on || on.toLowerCase()===String(nm).toLowerCase()) return; var j=lower.indexOf(on.toLowerCase(), i+1); if(j!==-1 && j<end) end=j; }); return {txt:t.slice(i,end), start:i}; }
    // Aisla el REFORZADOR entregado dentro del segmento: primero el campo estructurado
    // "What reinforcers were used? ..."; si no existe (prosa), solo las frases donde
    // algo fue ENTREGADO. Evita confundir un tangible del ANTECEDENTE ("preferred item
    // during play") con el reforzador real.
    function _reinfOf(seg){ var rm=/reinforcers?\s+(?:were\s+)?used\??\s*:?\s*([^\n]*)/i.exec(seg); if(rm && String(rm[1]).trim()) return rm[1]; var deliv=seg.match(/[^.\n]*\b(provided|delivered|gave|offered|granted|earned|received|reinforced with)\b[^.\n]*/gi); return deliv?deliv.join(' '):''; }

    // Defecto 3 - Atribuci\u00F3n de funci\u00F3n mantenedora (fuera de alcance RBT).
    flagRe('Atribuci\u00F3n de funci\u00F3n (fuera de alcance RBT)', /\b(maintained by|serving (?:a|an|the)[^.]{0,40}function|due to[^.]{0,40}reinforcement|the function of (?:this|the|his|her)[^.]{0,20}behavior|functions? to (?:obtain|escape|access|avoid))/gi);

    // Defecto 4 - Afirmaci\u00F3n de efectividad. EFFECT_ALWAYS: siempre se marca.
    flagRe('Afirmaci\u00F3n de efectividad sin dato', /\b(was effective|were effective|proved effective|demonstrated progress|showed progress|made progress|as a result of the intervention|resulted in|effectively (?:reduced|decreased|increased))/gi);
    // EFFECT_IF_NO_DATA: solo se marca si la sesi\u00F3n no aport\u00F3 cifra.
    if(!hasData){
      flagRe('Afirmaci\u00F3n de efectividad sin dato (sin cifra provista)', /\b(decreased|increased|reduced|improved|declined|diminished)\b/gi);
    }

    // Defecto 6 - N\u00FAmeros no provistos (reutiliza el detector compartido).
    if(typeof scanPerfNumbers==='function' && !hasData){
      scanPerfNumbers(t).forEach(function(n){ add('N\u00FAmero no provisto (posible fabricaci\u00F3n)', n); });
    }

    // Defecto 7 - Terminolog\u00EDa prohibida en prosa, con la excepci\u00F3n de dos capas:
    // si el t\u00E9rmino forma parte del nombre EXACTO de un programa/reforzador/conducta
    // del MFC, se cita literal y NO se marca.
    if(typeof _scan97153Language==='function'){
      var lang = _scan97153Language(t);
      var mfcNames = '';
      behs.forEach(function(b){
        mfcNames += ' '+(b.name||'');
        (b.replacements||[]).forEach(function(r){ mfcNames+=' '+r; });
        (b.interventions||[]).forEach(function(iv){ mfcNames+=' '+iv; });
        Object.keys(b.reinforcersByFunction||{}).forEach(function(fn){ (b.reinforcersByFunction[fn]||[]).forEach(function(r){ mfcNames+=' '+r; }); });
      });
      var mfcLower = mfcNames.toLowerCase();
      lang.banned.concat(lang.scope).forEach(function(w){
        if(mfcLower.indexOf(String(w).toLowerCase())!==-1) return; // exenci\u00F3n de dos capas
        var re = new RegExp('\\b'+String(w).replace(/[-\/]/g,'[-\\s/]?').replace(/\s+/g,'\\s+')+'\\w*','i');
        var m = re.exec(t);
        add('Terminolog\u00EDa prohibida en prosa', m ? snip(m.index, m[0].length) : w);
      });
    }

    // Defectos 1 y 2 + avisos de vac\u00EDo (T5), por conducta del MFC mencionada.
    behs.forEach(function(b){
      var name = String(b.name||'').trim();
      if(!name || lower.indexOf(name.toLowerCase())===-1) return; // no mencionada
      var gapped = (b.gaps||[]).length>0;
      var reps = (b.replacements||[]).filter(function(x){return String(x||'').trim();});
      // Defecto 2 - Reemplazo ausente. Se OMITE en conductas con gaps (territorio T5)
      // y en MFC derivado (replacements vac\u00EDos por dise\u00F1o, no son ausencias reales).
      if(!mfcDerived && !gapped && reps.length){
        var found = reps.some(function(r){ return lower.indexOf(String(r).toLowerCase())!==-1; });
        if(!found) add('Reemplazo ausente', 'La conducta \u00AB'+name+'\u00BB se menciona sin su reemplazo del MFC ('+reps.join('; ')+')');
      }
      // T5 - aviso al analista cuando la conducta carece de reemplazo documentado.
      // Solo con MFC validado: un MFC derivado tiene replacements vac\u00EDos por dise\u00F1o
      // y generar\u00EDa un aviso por cada conducta (ruido, no informaci\u00F3n).
      if(!mfcDerived && gapped){
        out.gapNotices.push('La conducta \u00AB'+name+'\u00BB carece de reemplazo documentado en el plan ('+(b.gaps||[]).join('; ')+'): la nota describe la intervenci\u00F3n aplicada sin inventar un reemplazo.');
      }
      // Defecto 1 - Reforzador fuera de funci\u00F3n (moneda por funci\u00F3n). Acotado al
      // segmento y al campo de reforzadores de ESTA conducta. Casos:
      //  - escape reforzado con atenci\u00F3n/elogio o con tangible/comestible, sin break
      //    ENTREGADO (el reforzador del escape es el escape mismo);
      //  - atenci\u00F3n reforzada con tangible/comestible, o con un break/escape.
      var fnClass = (b.functions||[]).map(function(f){ return (typeof _mfcFnClass==='function')?_mfcFnClass(f):''; });
      var isEscape = fnClass.indexOf('escape')!==-1;
      var isAttention = fnClass.indexOf('attention')!==-1;
      var isTangible = fnClass.indexOf('tangible')!==-1;
      if((isEscape || isAttention) && !isTangible){
        var _sg = _behSeg(name);
        var reinf = _reinfOf(_sg.txt);
        var tangRe = /\b(candy|snack|edible|a piece of food|preferred (?:item|toy|food)|tangible (?:item|reinforcer)|access to (?:a |the |his |her )?(?:toy|item|food|snack))\b/i;
        var attnRe = /\b(verbal praise|social praise|social attention|praise|high[- ]?five|thumbs up)\b/i;
        var breakGiven = /(granted|provided|delivered|allowed|given|permitted)[^.]{0,30}\bbreak\b/i.test(_sg.txt)
          || /\bbreak\b[^.]{0,25}(?:was|were)\s+(?:granted|provided|delivered|allowed|given)/i.test(_sg.txt)
          || /(?:demand|task)[^.]{0,35}\b(?:removed|withdrawn|reduced|paused|terminated|discontinued)\b/i.test(_sg.txt)
          || /(?:allowed|permitted)\s+to\s+(?:stop|leave|step away|take a break)/i.test(_sg.txt);
        var mTang = tangRe.exec(reinf);
        var mAttn = attnRe.exec(reinf);
        if(isEscape){
          if(!breakGiven && (mAttn || mTang)){
            add('Reforzador fuera de funci\u00F3n', 'La conducta \u00AB'+name+'\u00BB (funci\u00F3n escape) se refuerza con '+(mAttn?'atenci\u00F3n/elogio (\u00AB'+mAttn[0]+'\u00BB)':'un tangible/comestible (\u00AB'+mTang[0]+'\u00BB)')+' en vez de un break/retirar la demanda.');
          }
        } else { // atenci\u00F3n
          var mBrk = /\b(a break|removal of (?:the )?demand|escape (?:from|the))\b/i.exec(reinf);
          if(mTang) add('Reforzador fuera de funci\u00F3n', 'La conducta \u00AB'+name+'\u00BB (funci\u00F3n atenci\u00F3n) aparece con reforzador tangible/comestible (\u00AB'+mTang[0]+'\u00BB), no con atenci\u00F3n social.');
          else if(mBrk) add('Reforzador fuera de funci\u00F3n', 'La conducta \u00AB'+name+'\u00BB (funci\u00F3n atenci\u00F3n) aparece reforzada con un break/escape (\u00AB'+mBrk[0]+'\u00BB), no con atenci\u00F3n social.');
        }
      }
    });

    // Defecto 5 - Atribuci\u00F3n de rol: el t\u00E9cnico ejecuta la conducta que emite el cliente.
    flagRe('Atribuci\u00F3n de rol (el t\u00E9cnico ejecuta conducta del cliente)', /\bthe (?:technician|rbt) (?:followed|complied|tolerated|manded|emitted|engaged in|used the replacement|initiated the replacement|requested a break)\b/gi);
    // Patr\u00F3n B: el t\u00E9cnico "implement\u00F3/ejecut\u00F3" un programa de reemplazo del MFC.
    behs.forEach(function(b){
      (b.replacements||[]).forEach(function(r){
        r = String(r||'').trim(); if(!r) return;
        var re = new RegExp('\\bthe (?:technician|rbt) (?:implemented|executed|performed|carried out)\\b[^.]{0,60}'+r.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
        var m = re.exec(t);
        if(m) add('Atribuci\u00F3n de rol (el t\u00E9cnico ejecuta el programa de reemplazo)', snip(m.index, m[0].length));
      });
    });
  }catch(e){/* el validador nunca debe romper la generaci\u00F3n */}
  return out;
}
