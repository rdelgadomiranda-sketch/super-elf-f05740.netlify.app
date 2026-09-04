/* ── Retirados de la rotacion: masterizado, en pausa o borrado ────────────────
   Un programa masterizado ya no se ensena; uno en pausa esta suspendido por
   decision clinica; uno borrado de la ficha ya no forma parte del plan.
   Documentar cualquiera de los tres describe un tratamiento que no se esta dando.

   El estado vive en la FICHA DEL CLIENTE, y es la unica autoridad. Ni el assessment
   reducido ni el JSON de la plataforma la tienen: los dos siguen listando el item
   mucho despues de retirarlo, porque son documentos historicos. De ahi que haya que
   filtrar contra la ficha en cada punto donde se elige que documentar, y ademas
   nombrar los excluidos en el prompt, porque el texto del reducido viaja entero
   dentro de la peticion y el modelo puede tomarlos de ahi.                       */
/* ── ¿QUE DICE EL REDUCIDO DE ESTE ITEM? ──────────────────────────────────────
   La ficha del cliente era la unica autoridad sobre el estado, y por eso se colaba
   lo masterizado: si nadie tocaba la ficha a mano, un programa que el reassessment
   ya daba por masterizado seguia figurando como activo y entraba en la nota.

   Esto lee el estado DIRECTAMENTE del texto del reducido, sin modelo, para poder
   contrastarlo con la ficha. Es deliberadamente estricto: la palabra de estado solo
   cuenta si esta en la MISMA linea del nombre o en un campo "Status:" del bloque de
   ese item. Una frase suelta ("los programas se retiran cuando se masterizan") no
   puede retirar nada.                                                            */
var _ASSESS_STATUS_PATTERNS = [
  { st: 'mastered', re: /\bmaster(?:ed|y)\b/ },
  { st: 'mastered', re: /\bcriteri(?:on|a)\s+met\b/ },
  { st: 'mastered', re: /\bmet\s+criteri(?:on|a)\b/ },
  { st: 'mastered', re: /\bfully\s+acquired\b/ },
  { st: 'onhold',   re: /\bon\s+hold\b/ },
  { st: 'onhold',   re: /\b(?:paused|suspended|on\s+pause)\b/ },
  { st: 'onhold',   re: /\bdiscontinued\b/ },
  { st: 'onhold',   re: /\bno\s+longer\s+(?:targeted|being\s+(?:targeted|taught|worked|addressed)|in\s+treatment)\b/ },
  { st: 'onhold',   re: /\bremoved\s+from\s+(?:the\s+)?(?:plan|program|treatment|rotation)\b/ }
];

// "not yet mastered", "working toward mastery", "mastery criterion of 80%" NO son
// un estado alcanzado. Sin esto, la frase que describe la META de un programa en
// curso lo retiraria del tratamiento.
function _assessStatusNegated(line, idx, matchText){
  var before = line.slice(Math.max(0, idx - 40), idx);
  var after  = line.slice(idx + matchText.length, idx + matchText.length + 24);
  if(/\b(?:not|never|no|non|toward|towards|approaching|pending|prior\s+to|before|until|once|when|if|nearing|close\s+to)\b[^.]{0,40}$/i.test(before)) return true;
  if(/^\s*(?:criteri|target|goal|level|percentage|threshold|of\b)/i.test(after)) return true;
  return false;
}

function _assessStatusInLine(line){
  var low = String(line || '').toLowerCase();
  for(var i = 0; i < _ASSESS_STATUS_PATTERNS.length; i++){
    var p  = _ASSESS_STATUS_PATTERNS[i];
    var re = new RegExp(p.re.source, 'g');
    var m;
    while((m = re.exec(low)) !== null){
      if(!_assessStatusNegated(low, m.index, m[0])) return p.st;
      if(m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return '';
}

function _assessNorm(s){
  return String(s || '').toLowerCase()
    .replace(/[‐-―]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* Un reducido pasa de 50 KB y esto se consulta una vez por cada item de la ficha,
   varias veces por nota. Partir y normalizar el texto en cada consulta era el coste
   real; se hace una vez por documento. */
var _ASSESS_LINE_CACHE = { key: '', raw: [], norm: [] };
function _assessLines(prof){
  var p = String(prof || '');
  var key = p.length + '|' + p.slice(0, 120);
  if(_ASSESS_LINE_CACHE.key !== key){
    var raw = p.split(/\r?\n/);
    _ASSESS_LINE_CACHE = { key: key, raw: raw, norm: raw.map(_assessNorm) };
  }
  return _ASSESS_LINE_CACHE;
}

// Lineas del reducido donde aparece este item. Primero coincidencia literal; si no,
// por tokens largos (>=4 letras), exigiendo al menos dos, para que "Request Break"
// no case con cualquier linea que diga "break".
function _assessLinesFor(prof, name){
  var L = _assessLines(prof);
  var target = _assessNorm(name);
  if(!target) return [];
  var hits = [];
  L.norm.forEach(function(n, i){ if(n.indexOf(target) !== -1) hits.push(i); });
  if(hits.length) return hits;
  var toks = target.split(' ').filter(function(t){ return t.length >= 4; });
  if(toks.length < 2) return [];
  L.norm.forEach(function(n, i){
    var got = toks.filter(function(t){ return n.indexOf(t) !== -1; }).length;
    if(got === toks.length) hits.push(i);
  });
  return hits;
}

/* Estado que el reducido le da al item:
     'mastered' | 'onhold' | 'listed'  (aparece, sin estado de retirada)
     'absent'                          (el reducido no lo menciona)          */
function _assessNameStatus(prof, name){
  var lines = _assessLines(prof).raw;
  var hits = _assessLinesFor(prof, name);
  if(!hits.length) return 'absent';
  var found = '';
  hits.forEach(function(i){
    var st = _assessStatusInLine(lines[i]);          // misma linea que el nombre
    if(st){ found = found || st; return; }
    /* Campo "Status:" del bloque de ESTE item. Se corta en la linea en blanco, al
       primer campo de estado y en cuanto empieza otro item: sin ese ultimo corte,
       un programa activo se llevaba el "Mastered" del programa siguiente, que es
       exactamente la clase de error que esto viene a evitar. */
    for(var j = i + 1; j < Math.min(lines.length, i + 6); j++){
      var raw = String(lines[j]);
      if(!raw.trim()) break;
      if(/^\s*(?:section\b|behavior\s+\d|behavior\s*\[|replacement\b|target\s+behavior\b)/i.test(raw)) break;
      if(/^\s*(?:current\s+)?status\b\s*[:\-]/i.test(raw)){
        var st2 = _assessStatusInLine(raw);
        if(st2) found = found || st2;
        break;
      }
    }
  });
  return found || 'listed';
}

/* ── CONTRASTE FICHA vs REDUCIDO ─────────────────────────────────────────────
   Devuelve, para cada item ACTIVO de la ficha, lo que el reducido dice de el.
     retire : el reducido lo da por masterizado / en pausa / retirado
     absent : el reducido NO lo menciona (ya no esta en el reassessment)
   Los dos casos son motivo para no documentarlo, pero se tratan distinto: el
   primero es evidencia positiva y se aplica solo; el segundo puede ser un fallo
   de coincidencia de nombre, asi que se avisa y se saca de la seleccion
   automatica, pero nunca deja la nota sin nada que documentar.                 */
function _assessAudit(clientId){
  var out = { retire: [], absent: [], hasProf: false };
  if(!clientId) return out;
  var prof = String(LS.get('aba5_assess_' + clientId) || '').trim();
  if(!prof) return out;
  out.hasProf = true;
  var pools = LS.get('aba5_pools_' + clientId) || {};
  ['mal','rep'].forEach(function(kind){
    normalizeBehaviorArr(pools[kind] || []).forEach(function(x){
      if(!x || !x.name) return;
      var st = x.status || 'active';
      if(st !== 'active' && st !== 'new') return;          // ya esta fuera de rotacion
      var says = _assessNameStatus(prof, x.name);
      if(says === 'mastered' || says === 'onhold') out.retire.push({ name: x.name, kind: kind, st: says });
      else if(says === 'absent') out.absent.push({ name: x.name, kind: kind });
    });
  });
  return out;
}

/* Aplica a la ficha lo que el reducido afirma. Solo retira: nunca reactiva algo
   que una persona haya puesto en pausa o masterizado a mano, porque esa decision
   clinica no la puede revertir un documento. Idempotente. */
/* Aplica a la ficha lo que el reducido afirma, con DOS frenos, porque esto escribe
   solo en los datos clinicos del cliente:

   1. NUNCA deja un pool sin nada activo. Un reducido que retira TODAS las conductas
      o TODOS los reemplazos no es un hecho clinico: es que el texto no se esta
      leyendo bien (una linea que lista varios programas junto a la palabra
      "mastered" los retira todos de golpe). En ese caso no se toca nada y se avisa.
   2. Todo lo que cambia queda marcado y es REVERSIBLE: se guarda el estado anterior
      y quien lo cambio, para poder deshacerlo de un clic desde la ficha.          */
function _noAutoRetireKey(clientId){ return 'aba5_noautoretire_' + clientId; }


/* ── LIMPIAR LO QUE EL REASSESSMENT NUEVO YA NO LISTA ────────────────────────
   "Rellenar behaviors / replacements" es ADITIVO por diseno: anade lo que trae el
   reducido y no borra nada. Eso protege lo que se haya configurado a mano, pero
   tiene un efecto acumulativo que nadie ve venir: cada reassessment deja en la
   ficha los programas del anterior. Tras dos o tres, el cliente arrastra una lista
   de reemplazos que ya no estan en su plan. No es filtracion entre clientes: es
   sedimentacion dentro del mismo cliente, y se parece mucho desde fuera.

   Esto los pone EN PAUSA (no los borra: son historia clinica) y queda marcado como
   automatico, asi que se deshace con el mismo boton que el resto.               */
function _retireAbsentFromAssessment(clientId){
  var a = _assessAudit(clientId);
  if(!a.hasProf) return 0;
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var n = 0;
  ['mal','rep'].forEach(function(kind){
    var arr = normalizeBehaviorArr(pools[kind] || []);
    var mine = a.absent.filter(function(x){ return x.kind === kind; });
    var live = arr.filter(function(x){ return x.status === 'active' || x.status === 'new'; }).length;
    // Mismo freno que el resto: no dejar el pool sin nada activo.
    if(!mine.length || mine.length >= live) return;
    mine.forEach(function(m){
      var it = arr.find(function(x){ return String(x.name).trim().toLowerCase() === String(m.name).trim().toLowerCase(); });
      if(!it) return;
      it.prevStatus = it.status || 'active';
      it.autoRetired = 'ausente-del-reducido';
      it.status = 'onhold';
      n++;
    });
    pools[kind] = arr;
  });
  if(n) LS.set('aba5_pools_' + clientId, pools);
  if(typeof renderChipPool === 'function'){
    var _p = LS.get('aba5_pools_' + clientId) || {};
    renderChipPool('malPool', _p.mal || [], 'mal', clientId);
    renderChipPool('repPool', _p.rep || [], 'rep', clientId);
  }
  if(typeof renderCoveragePanel === 'function') renderCoveragePanel(clientId);
  if(typeof _renderAssessQuality === 'function') _renderAssessQuality(clientId);
  if(typeof showMsg === 'function') showMsg('assessMsg', n
    ? 'Puestos EN PAUSA ' + n + ' item(s) que este reassessment ya no lista. No se borran: siguen en la ficha y se pueden reactivar. Si te pasaste, usa "Deshacer" en el panel de coverage.'
    : 'No hay nada que quitar: todo lo activo de la ficha aparece en el reducido (o quitarlo dejaría el pool vacío).', 'ok');
  return n;
}

function _syncStatusFromAssessment(clientId){
  var a = _assessAudit(clientId);
  a.blocked = [];
  if(!a.retire.length) return a;
  if(LS.get(_noAutoRetireKey(clientId))){ a.retire = []; a.off = true; return a; }
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var applied = [];
  ['mal','rep'].forEach(function(kind){
    var arr = normalizeBehaviorArr(pools[kind] || []);
    var mine = a.retire.filter(function(r){ return r.kind === kind; });
    if(!mine.length){ pools[kind] = arr; return; }
    var live = arr.filter(function(x){ return x.status === 'active' || x.status === 'new'; }).length;
    if(live && mine.length >= live){
      // Retirar esto dejaria el pool vacio: no se aplica NADA de este pool.
      a.blocked.push({ kind: kind, n: mine.length, of: live });
      pools[kind] = arr;
      return;
    }
    mine.forEach(function(r){
      var it = arr.find(function(x){ return String(x.name).trim().toLowerCase() === String(r.name).trim().toLowerCase(); });
      if(!it || it.status === r.st) return;
      it.prevStatus = it.status || 'active';
      it.autoRetired = 'reducido';
      it.status = r.st;
      applied.push(r);
    });
    pools[kind] = arr;
  });
  a.retire = applied;
  if(applied.length || a.blocked.length) LS.set('aba5_pools_' + clientId, pools);
  return a;
}

// Deshace TODO lo que el contraste con el reducido retiro solo, y lo desactiva para
// este cliente para que no se vuelva a aplicar en la siguiente pantalla.
function _undoAssessRetire(clientId){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var n = 0;
  ['mal','rep'].forEach(function(kind){
    var arr = normalizeBehaviorArr(pools[kind] || []);
    arr.forEach(function(x){
      if(!x || !x.autoRetired) return;
      x.status = x.prevStatus || 'active';
      delete x.prevStatus; delete x.autoRetired;
      n++;
    });
    pools[kind] = arr;
  });
  LS.set('aba5_pools_' + clientId, pools);
  LS.set(_noAutoRetireKey(clientId), 1);          // no volver a aplicarlo solo
  if(typeof renderChipPool === 'function'){
    renderChipPool('malPool', pools.mal || [], 'mal', clientId);
    renderChipPool('repPool', pools.rep || [], 'rep', clientId);
  }
  if(typeof renderCoveragePanel === 'function') renderCoveragePanel(clientId);
  if(typeof _renderAssessQuality === 'function') _renderAssessQuality(clientId);
  if(typeof showMsg === 'function') showMsg('assessMsg', n
    ? 'Restaurado(s) ' + n + ' item(s) que el contraste con el reducido habia retirado. El automatismo queda DESACTIVADO para este cliente: a partir de ahora el estado lo decides tú en la ficha.'
    : 'No había nada retirado automáticamente en este cliente. El automatismo queda desactivado igualmente.', 'ok');
  return n;
}

// Vuelve a permitir el contraste automatico en este cliente.
function _redoAssessRetire(clientId){
  LS.del(_noAutoRetireKey(clientId));
  var a = _syncStatusFromAssessment(clientId);
  if(typeof renderCoveragePanel === 'function') renderCoveragePanel(clientId);
  if(typeof _renderAssessQuality === 'function') _renderAssessQuality(clientId);
  return a;
}

// Nombres que el reducido NO menciona. Se calcula una vez por cliente y por
// llamada: es texto plano y el reducido puede pasar de 50 KB.
function _absentFromAssessment(clientId, kind){
  var a = _assessAudit(clientId);
  if(!a.hasProf) return {};
  var m = {};
  a.absent.forEach(function(x){ if(!kind || x.kind === kind) m[String(x.name).trim().toLowerCase()] = 1; });
  return m;
}

function _retiredItems(clientId){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var out = { mal: [], rep: [], all: [] };
  ['mal','rep'].forEach(function(t){
    normalizeBehaviorArr(pools[t] || []).forEach(function(x){
      if(!x || !x.name) return;
      var st = x.status || 'active';
      if(st === 'mastered' || st === 'onhold'){
        out[t].push({ name: x.name, status: st });
        out.all.push({ name: x.name, status: st, kind: t });
      }
    });
  });
  return out;
}

// The 9-section profile is filled across a few small calls so no single response
// is huge (a 60+ page assessment otherwise returns 100k+ chars and gets cut off).
const _ASSESS_BLOCKS = [
`SECTION 1 — CLIENT INFORMATION (DE-IDENTIFIED: age only, NO name, NO day/month of birth)
Age:
Diagnosis:
Date of current behavior plan:

SECTION 1B — BACKGROUND INFORMATION (DE-IDENTIFIED: no family names, no address, no specific school name)
Household / who the client lives with:
Usual service setting(s) (home / school / community / clinic):
Predominant language:
Schooling situation:
Caregiver involvement:
Relevant medical conditions:
Relevant behavioral history:

SECTION 2 — TARGET MALADAPTIVE BEHAVIORS (one block per behavior, verbatim)
For each target behavior found:
Behavior [n] — label:
  Behavioral function:
  Current status:
  Operational definition / topography:
  Intervention(s) applied:
  Measurement method:

HOW TO FILL "Current status" — IT DECIDES WHETHER THE BEHAVIOR IS DOCUMENTED AT ALL:
Write exactly one of: Active / On hold / Mastered / Discontinued, taken from what the document states for THIS behavior (mastery dates, "criterion met", "no longer targeted", "on hold", "discontinued", a status column in a progress table). Write "Active" only when the document treats it as currently targeted. If the document says nothing about the status, write "Active — status not stated in the document". Never write a mastery CRITERION here (e.g. "80% across three sessions") — that is the goal, not the status; it goes in the measurement method.

HOW TO FILL "Intervention(s) applied" — THIS FIELD IS THE POINT OF THE SECTION AND IT IS THE ONE MOST OFTEN LEFT EMPTY:
A behavior support plan almost never puts the procedures next to the operational definition. The definitions sit in one table and the procedures in a different section — "Behavior Intervention Plan", "Intervention Strategies", "Antecedent Strategies", "Consequence Procedures", "Reduction Procedures", "Treatment Protocol" or similar. You must READ THE WHOLE DOCUMENT and bring back, for THIS behavior, every procedure the plan assigns to it, wherever it appears.
  · Match by the behavior's own name and by its synonyms as the plan writes them (a plan may define "Off-task behavior" and then legislate procedures under "off task" or "task refusal").
  · Copy each procedure VERBATIM as the plan words it, separated by semicolons, and mark which side it belongs to when the plan makes it explicit: "antecedent: visual schedule; antecedent: high-probability request sequence; consequence: escape extinction; consequence: DRA".
  · A plan-wide list of procedures does NOT replace this field. Section 2.1 collects the global catalogue; this field records which of them THIS behavior actually uses. If the plan states the procedures for a behavior anywhere in the document, this field must NOT be "Not specified".
  · Only write "Not specified" when the document genuinely never ties any procedure to this behavior. Never guess a procedure from the function, and never copy another behavior's procedures.

SECTION 2.1 — LIST OF INTERVENTIONS TO APPLY (verbatim labels)

BEFORE CLOSING THIS BLOCK: every behavior in Section 2 must carry its own operational definition / topography AND its own "Intervention(s) applied". Those two fields are what stops the note from being generic, and both are usually written far from the behavior's own paragraph. Sweep the document for them once more; only write "Not specified" if it truly says nothing.`,

`SECTION 3 — REPLACEMENT / COMPENSATORY BEHAVIORS (verbatim, with literal ABLLS/reference codes; these are NOT interventions; one per target behavior)
For each replacement:
Replacement behavior (— for Behavior [n]):
  Current status:
  Teaching method:
  Activities used to teach it:
  Implementation description:

HOW TO FILL "Activities used to teach it" — SAME PROBLEM AS THE INTERVENTIONS, SAME SOLUTION:
The activities almost never sit next to the program's name. They live in an activity list, a session plan, a materials column, a task-analysis, an "instructional activities" or "teaching arrangement" section, or inside the implementation description itself. READ THE WHOLE DOCUMENT and bring back, for THIS program, every activity, task, game, routine or material the plan uses to teach it.
  · Copy each one VERBATIM as the document words it, separated by semicolons ("snack preparation; clean-up routine with toys; turn-taking board game").
  · A plan-wide list of activities does NOT replace this field: record which of them THIS program actually uses.
  · These are ACTIVITIES (what the session does), not procedures (DRA, FCT, prompting) and not reinforcers. A procedure goes in the teaching method; a reinforcer goes in Section 4.
  · Only write "Not specified" when the document genuinely ties no activity to this program. Never invent an activity, and never copy another program's activities.

"Current status" follows the same rule as in Section 2: Active / On hold / Mastered / Discontinued, as the document states it for THIS program. A mastered acquisition target is still listed here — it is part of the clinical history — but it must carry its status, because a mastered program is no longer taught.

SECTION 4 — REINFORCEMENT PROGRAMS
Primary reinforcers:
Secondary / social reinforcers:
Reinforcement schedule:
Current thinning plan:

SECTION 5 — PROMPT HIERARCHY
Prompts in use (most to least intrusive):
Prompt fading strategy:
Error correction procedure:

BEFORE CLOSING THIS BLOCK: every replacement in Section 3 must carry its own "Activities used to teach it". It is the field most often left empty, because activities live in a separate list or session plan rather than beside the program. Sweep the document for them once more; only write "Not specified" if it truly ties no activity to that program.`,

`SECTION 6 — ANTECEDENT STRATEGIES & ENVIRONMENTAL MODIFICATIONS
Antecedent modifications in place:

SECTION 7 — GENERALIZATION TARGETS
Settings:
People:
Materials / stimuli generalization:

SECTION 8 — CURRENT PROTOCOL MODIFICATION TOPICS
Current modification topics:

SECTION 9 — ADDITIONAL CLINICAL NOTES
Any other information relevant to note generation (medical considerations, medication changes, caregiver involvement, session format changes):
`
];

function _assessReadFile(file){
  return new Promise(function(resolve){
    var name = (file.name||'').toLowerCase();
    if(file.type === 'application/pdf' || name.endsWith('.pdf')){
      if(typeof pdfjsLib === 'undefined'){ resolve('[PDF: paste text manually]'); return; }
      var r = new FileReader();
      r.onload = async function(e){
        try{
          var pdf = await pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
          var t = '';
          for(var i=1;i<=pdf.numPages;i++){ var pg = await pdf.getPage(i); var tc = await pg.getTextContent(); t += tc.items.map(function(x){return x.str;}).join(' ') + '\n'; }
          resolve(t.trim() || '[PDF: could not extract text]');
        }catch(err){ resolve('[PDF: could not extract text]'); }
      };
      r.readAsArrayBuffer(file);
    } else if(name.endsWith('.docx')){
      if(typeof mammoth === 'undefined'){ resolve('[DOCX: paste text manually]'); return; }
      var r2 = new FileReader();
      r2.onload = async function(e){
        try{ var res = await mammoth.extractRawText({ arrayBuffer: e.target.result }); resolve((res.value||'').trim() || '[DOCX: empty]'); }
        catch(err){ resolve('[DOCX: could not extract text]'); }
      };
      r2.readAsArrayBuffer(file);
    } else {
      var r3 = new FileReader();
      r3.onload = function(e){ resolve(e.target.result || ''); };
      r3.onerror = function(){ resolve('[Could not read file]'); };
      r3.readAsText(file);
    }
  });
}

async function _assessOnFile(input){
  var f = input.files && input.files[0];
  if(!f) return;
  document.getElementById('assessFileName').textContent = f.name + ' — leyendo…';
  var text = await _assessReadFile(f);
  document.getElementById('assessFull').value = text;
  document.getElementById('assessFileName').textContent = f.name + ' ✓';
}

// Safety check: the assessment being uploaded must belong to the client selected
// in the app. Loading another client's assessment would poison the clinical source
// of truth for that client and every note generated from it. Blocking, not advisory.

/* ── LA REDUCCION PENDIENTE ──────────────────────────────────────────────────
   Guarda de quien es la ultima reduccion generada, para dos cosas: recuperarla en
   la ficha correcta si se cambio de cliente mientras corria, e impedir que se
   guarde bajo otro cliente. Vive en memoria: es un puente entre dos pantallas de
   la misma sesion, no un dato del cliente.                                      */
var _assessProposedFor = null, _assessProposedText = '';

/* Ultimo cerrojo, en el momento de escribir en disco: el texto del cuadro no puede
   ser el de otro cliente. Cubre los dos caminos por los que llega ahi — la
   reduccion que se genero para otro, y un texto pegado a mano que lleva el nombre
   de otro cliente registrado. */
function _assessBelongsElsewhere(core, clientId){
  var txt = String(core||'').trim();
  if(!txt) return null;
  if(_assessProposedText && _assessProposedFor && _assessProposedFor !== clientId
     && txt === String(_assessProposedText).trim()){
    var c1 = (clients||[]).find(function(x){ return x.id === _assessProposedFor; });
    return { who: (c1 && c1.name) || 'otro cliente', why: 'esta reducci\u00f3n se gener\u00f3 para \u00e9l' };
  }
  var norm = function(x){
    return String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  };
  var nTxt = norm(txt), hit = null;
  (clients||[]).forEach(function(c){
    if(hit || !c || c.id === clientId) return;
    var parts = norm(c.name).split(' ').filter(function(w){ return w.length >= 4; });
    if(!parts.length) return;
    var found = parts.filter(function(w){ return new RegExp('\\b' + w + '\\b').test(nTxt); });
    if(found.length === parts.length) hit = { who: c.name, why: 'su nombre aparece en el texto' };
  });
  return hit;
}

function _assessNameCheck(fullText, clientName){
  var txt = String(fullText||'');
  var name = String(clientName||'').trim();
  if(!txt || !name) return { ok:false, reason:'sin texto o sin cliente seleccionado' };

  var norm = function(x){
    return String(x||'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')   // strip accents
      .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  };
  var nTxt = norm(txt);
  var parts = norm(name).split(' ').filter(function(w){ return w.length >= 3; });
  if(!parts.length) return { ok:true, matched:[], note:'nombre demasiado corto para verificar' };

  var found = parts.filter(function(w){ return new RegExp('\\b' + w + '\\b').test(nTxt); });

  // Full name present, or at least the first name plus one more part.
  var ok = found.length === parts.length || (found.length >= 2) ||
           (parts.length === 1 && found.length === 1);

  // Detect OTHER client names present in the document — a strong signal of a mix-up.
  var others = [];
  (clients||[]).forEach(function(c){
    if(!c || c.id === _assessCurrentClientId) return;
    var op = norm(c.name).split(' ').filter(function(w){ return w.length >= 4; });
    if(!op.length) return;
    var hits = op.filter(function(w){ return new RegExp('\\b' + w + '\\b').test(nTxt); });
    // require the other client's FULL name (all parts) to avoid false alarms on common names
    if(hits.length === op.length && op.length >= 2) others.push(c.name);
  });

  return { ok: ok, matched: found, missing: parts.filter(function(w){ return found.indexOf(w) === -1; }), others: others };
}

async function assessPropose(){
  var clientId = _assessCurrentClientId;
  if(!clientId){ showMsg('assessMsg','Selecciona un cliente primero.','err'); return; }
  var full = (document.getElementById('assessFull').value||'').trim();
  if(!full){ showMsg('assessMsg','Sube o pega el assessment completo primero.','err'); return; }

  // BLOCK if the document does not belong to the selected client.
  var _c = (clients||[]).find(function(x){ return x.id === clientId; });
  var chk = _assessNameCheck(full, _c ? _c.name : '');
  if(chk.others && chk.others.length){
    showMsg('assessMsg','\u26D4 NO se procesó. Este documento contiene el nombre de OTRO cliente: "' + chk.others.join('", "') + '". Est\u00e1s en la ficha de "' + ((_c&&_c.name)||'') + '". Verifica que subiste el assessment correcto.','err');
    return;
  }
  if(!chk.ok){
    showMsg('assessMsg','\u26D4 NO se procesó. El nombre del cliente seleccionado ("' + ((_c&&_c.name)||'') + '") no aparece en el documento. Si es el assessment correcto pero usa otro nombre o abreviatura, corrige el nombre del cliente en el sistema o a\u00f1\u00e1delo al documento antes de continuar.','err');
    return;
  }
  var btn = document.getElementById('assessProposeBtn');
  var prog = document.getElementById('assessProg');
  var coreEl = document.getElementById('assessCore');
  var _btnLabel = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '\u23F3 Reduciendo\u2026'; btn.style.opacity = '0.6'; btn.style.cursor = 'progress'; }
  if(coreEl){ coreEl.style.opacity = '0.5'; }
  // Visible animated progress: elapsed seconds + dots, so it is never silent.
  var _t0 = Date.now();
  var _dots = 0;
  var _tick = setInterval(function(){
    _dots = (_dots + 1) % 4;
    var secs = Math.round((Date.now() - _t0) / 1000);
    if(prog){
      prog.style.color = 'var(--blue)';
      prog.style.fontWeight = '600';
      prog.textContent = '\u23F3 La IA est\u00e1 reduciendo el assessment' + '.'.repeat(_dots) + '   (' + secs + 's)';
    }
  }, 400);
  showMsg('assessMsg','Generando la reducci\u00f3n con la IA\u2026 esto puede tardar segundos en un assessment largo. No cierres el panel.','ok');
  try{
    // Extract the profile in small blocks so no single response is huge.
    // thinkingBudget: 0 — mechanical extraction; keeps the whole budget for output.
    var pieces = [];
    for(var bi=0; bi<_ASSESS_BLOCKS.length; bi++){
      if(prog) prog.textContent = '\u23F3 Extrayendo secci\u00f3n ' + (bi+1) + ' de ' + _ASSESS_BLOCKS.length + '\u2026 (' + Math.round((Date.now()-_t0)/1000) + 's)';
      var bp = 'From the FULL assessment below, fill ONLY the following template section(s), verbatim and de-identified (age only, no name, no day/month of birth). Output ONLY the filled template.\n\n=== TEMPLATE TO FILL ===\n' + _ASSESS_BLOCKS[bi] + '\n\n=== FULL ASSESSMENT ===\n' + full;
      var piece = await callAPI(bp, ASSESS_SYS, null, clientId, 8192, 0);
      if(_lastTruncated){
        var piece2 = await callAPI(bp, ASSESS_SYS, null, clientId, 16384, 0);
        if(piece2 && piece2.length >= (piece||'').length) piece = piece2;
      }
      pieces.push((piece||'').trim());
    }
    var out = pieces.filter(function(x){ return x; }).join('\n\n');
    if(!out){
      showMsg('assessMsg','\u26A0 La IA no devolvi\u00f3 texto en ninguna secci\u00f3n. Puede ser un filtro de contenido o un problema del servidor. Intenta de nuevo; si persiste, edita el perfil a mano.','err');
      return;
    }
    // Deterministic de-identification: strip the client name the model may have left in.
    var _cObj = clients.find(function(x){ return x.id === clientId; });
    if(_cObj && _cObj.name) out = _deidentifyName(out, _cObj.name);
    /* La reduccion tarda y el panel es UNO SOLO para todos los clientes. Si mientras
       corria se cambio de cliente, volcar el resultado en el cuadro escribe el perfil
       de A en la pantalla de B, y al Guardar queda el reducido de A bajo B. Es
       exactamente asi como se mezclan dos clientes, sin que ningun paso falle. La
       reduccion se queda esperando, nombrada, en vez de pintarse donde no toca. */
    _assessProposedFor  = clientId;
    _assessProposedText = out;
    var _secs = Math.round((Date.now() - _t0) / 1000);
    if(_assessCurrentClientId !== clientId){
      var _nm = (_cObj && _cObj.name) || 'otro cliente';
      showMsg('assessMsg','\u26D4 La reducci\u00f3n termin\u00f3 pero YA NO est\u00e1s en la ficha de "' + _nm + '", que es de quien es este documento. NO se peg\u00f3 nada aqu\u00ed para no mezclar dos clientes. Vuelve a la ficha de "' + _nm + '" y pulsa "Recuperar la reducci\u00f3n pendiente".','err');
      if(typeof _renderPendingProposal === 'function') _renderPendingProposal();
      return;
    }
    if(coreEl) coreEl.value = out;
    showMsg('assessMsg','\u2713 Perfil extra\u00eddo y des-identificado en ' + _secs + 's ('+out.length+' caracteres). Rev\u00edsalo y edita lo que haga falta. Luego Guardar.','ok');
  }catch(err){
    showMsg('assessMsg','Error al proponer la reducci\u00f3n: ' + (err.message||err),'err');
  }finally{
    clearInterval(_tick);
    if(btn){ btn.disabled = false; btn.textContent = _btnLabel; btn.style.opacity = ''; btn.style.cursor = ''; }
    if(coreEl){ coreEl.style.opacity = ''; }
    if(prog){ prog.textContent = ''; prog.style.fontWeight = ''; }
  }
}

// Extracts Maladaptive Behaviors, Replacement/Acquisition Targets and Preferred
// Reinforcers from the saved reduced profile and fills the client's pools, so
// they no longer have to be entered by hand. Items are added as 'new' (visible
// chips the user can remove); nothing already present is duplicated or deleted.
async function assessFillPools(){
  var clientId = _assessCurrentClientId;
  if(!clientId){ showMsg('assessMsg','Selecciona un cliente primero.','err'); return; }
  var prof = (LS.get('aba5_assess_' + clientId) || '').trim();
  if(!prof){ showMsg('assessMsg','Guarda primero el assessment reducido de este cliente.','err'); return; }
  var btn = document.getElementById('assessPoolsBtn'); if(btn) btn.disabled = true;
  showMsg('assessMsg','Extrayendo conductas, replacements y reforzadores del reducido…','ok');
  try{
    var sys = 'You extract STRUCTURED clinical data from a reduced ABA assessment profile. Copy each item VERBATIM as written in the profile - never paraphrase, group or invent. Keep literal reference codes (e.g. "Request attention (ABLLS F-14)"). Replacement/acquisition targets are NOT interventions: never list an intervention (DRA, DRO, FCT, extinction, etc.) as a replacement.\n\n'
      + 'ONE ITEM PER ENTRY - CRITICAL: each object is exactly ONE behavior or ONE replacement program. NEVER put several programs inside a single "name". If the profile lists them together in a row, a cell or a sentence separated by commas or semicolons (e.g. "Request Break, Request for tangibles, Request attention"), SPLIT them into separate objects - one per program. A "name" that contains a list of programs is a failure. Do not merge, do not summarise, do not add a trailing period. Keep a program\'s own internal commas (e.g. "Use functional communication (verbal approximations, visual supports, AAC, or gestures) to request help, clarification, or more time") - that is ONE program, not several.\n\n'
      + 'DO NOT emit fragments: never output a stray word or truncated token ("tan", "de", "or more time") as a name. If a fragment cannot be read as a complete program label, omit it.\n\n'
      + 'OUTPUT SHAPE - CRITICAL: "mal" and "rep" are arrays of OBJECTS, never arrays of plain strings. Each maladaptive behavior is {"name","fn","topo","int"} and each replacement is {"name","fn"}. Returning a bare string instead of an object loses the behavioral function and is a failure.\n\n'
      + 'FUNCTIONS: profiles very often state the function in a table or after the behavior label (e.g. "Function: Escape", "Escape + Automatic Reinforcement", "AR", "Sensory", "Attention/Tangibles"). READ IT and put it in "fn". Map Automatic Reinforcement / AR / sensory -> automatic. When more than one function is documented for the same behavior, return them all joined with "+" (e.g. "escape+automatic"). Leave "fn" empty ONLY when the profile truly states no function for that behavior.\n\n'
      + 'Output STRICT JSON only, no preamble.';
    var prompt = 'From the reduced profile below, extract:\n'
      + '- "mal": the maladaptive/target behaviors. For EACH one return an object with:\n'
      + '    "name": the label, verbatim.\n'
      + '    "fn": its behavioral function(s), drawn from escape, attention, tangible, automatic (map "Automatic Reinforcement"/"AR"/"sensory" to automatic). MULTIPLY-MAINTAINED behaviors are common: if the profile documents more than one function (e.g. "Escape + Automatic Reinforcement", "Attention + Tangibles"), return EVERY documented function joined with "+" (e.g. "escape+automatic"). Empty string if the profile states none.\n'
      + '    "topo": its topography / operational definition, verbatim as written (include onset, offset and exclusion criteria when present). Empty string if not stated.\n'
      + '    "status": what the profile says about whether this behavior is CURRENTLY targeted. Return exactly one of: "active", "onhold", "mastered". Read it from the profile\'s "Current status" field for this behavior, or from any statement tied to it ("mastered", "criterion met", "no longer targeted", "discontinued", "on hold", "paused"). A mastery CRITERION that has not been met ("80% across three sessions") is NOT a status: that behavior is "active". Return "active" when the profile states nothing.\n'
      + '    "int": the behavior-reduction interventions the profile documents FOR THIS BEHAVIOR, as a single semicolon-separated string, VERBATIM as the profile words them. Take them from that behavior\'s "Intervention(s) applied" field, and also from any procedure the profile assigns to this behavior elsewhere. Keep the antecedent/consequence marking when the profile carries it (e.g. "antecedent: visual schedule; consequence: escape extinction; consequence: DRA"), since the two sides are documented separately in the note. Do NOT copy the plan-wide catalogue of procedures here — only what belongs to THIS behavior. Empty string only if the profile ties no procedure to it.\n'
      + '- "rep": the replacement / acquisition targets. For EACH one return an object with:\n'
      + '    "name": the label, verbatim, with its literal codes.\n'
      + '    "act": the ACTIVITIES the profile documents for teaching THIS program, as a single semicolon-separated string, VERBATIM as the profile words them. Take them from that program\'s "Activities used to teach it" field, and also from any activity, task, game, routine or material the profile ties to this program elsewhere (activity lists, session plans, materials columns, the implementation description). Activities are what the session DOES ("snack preparation; clean-up routine with toys"); they are not procedures (DRA, FCT, prompting) and not reinforcers. Do NOT copy the plan-wide activity list here — only what belongs to THIS program. Empty string only if the profile ties no activity to it.\n'
      + '    "status": "active", "onhold" or "mastered", by the same rule as for the behaviors: what the profile says about whether this program is still being taught. A mastered program must come back as "mastered" — it is listed in the profile as clinical history, but it is no longer taught.\n'
      + '    "fn": the function THIS REPLACEMENT SERVES — the function of the behavior it replaces (requesting a break/help -> escape; an appropriate bid for attention -> attention; requesting the item -> tangible; a competing/alternative response producing comparable stimulation -> automatic). Join several with "+". Empty string ONLY if the profile gives no basis at all.\n'
      + '      WHERE TO READ IT — profiles state this in three different notations and you must handle all three:\n'
      + '        (a) An arrow to a FUNCTION: "Functional Communication for Delayed Access (-> Escape)" -> fn = "escape".\n'
      + '        (b) An arrow to a BEHAVIOR NAME: "Oral Motor Control (-> Bruxism)", "Hands to Self (-> Hand-to-mouth)", "Visual Attention to Task (-> Gazing Stereotypy)". This is NOT a function: look up that behavior in the maladaptive list of this same profile and copy ITS documented function. Bruxism is automatic, so Oral Motor Control is automatic. If the arrow names several behaviors, join the functions of all of them.\n'
      + '        (c) A summary map at the end of the profile, such as "Quick Function -> Replacement Map" or "Function key", listing which replacements serve each function. It is authoritative: follow it.\n'
      + '      IGNORE THE "for Behavior N" NUMBERING. Profiles often label replacements "(— for Behavior 1)", "(— for Behavior 2)" and so on, but that numbering is the position in the list, NOT a pairing: it frequently runs past the number of behaviors that exist, and taking it literally pairs, for example, an automatically maintained behavior with an escape program. Never derive a function from it.\n'
      + '- "reinforcers": the reinforcers (primary and secondary), as a single comma-separated string\n'
      + '- "docreq": any DOCUMENTATION REQUIREMENTS the profile states for this client\'s notes - the rules the supervising analyst or the agency demands (e.g. every replacement program must state its reinforcement schedule, minimum number of reinforcers or activities per program, past tense, required social reinforcers, mandatory sections). Copy them VERBATIM as a short list, one per line. These are AGENCY-SPECIFIC and apply only to this client. Empty string if the profile states none.\n'
      + '- "background": the client\'s SITUATIONAL background from the profile, as one compact paragraph — communication level and modality (vocal, gestural, device), language and skill repertoires, strengths and emerging skills, preferences and high-interest activities, barriers to learning, prompt hierarchy in use, and any relevant medical, sensory-motor, school/home or contextual consideration. This is what makes a note situationally rich. Copy only what the profile states; never invent. Empty string if the profile has none. No diagnoses, no PII.\n\n'
      + 'If a list is not present in the profile, return it empty. Never invent items, functions, topographies, interventions or background — leave the field empty instead.\n\n'
      + 'REDUCED PROFILE:\n' + prof + '\n\n'
      + 'Return STRICT JSON: {"mal":[{"name":"","fn":"","topo":"","int":"","status":""}],"rep":[{"name":"","fn":"","act":"","status":""}],"reinforcers":"","background":"","docreq":""}';
    var raw = await callAPI(prompt, sys, null, clientId, 8192, 0);
    // A large assessment (many behaviors) produces a long JSON that overflows the
    // 8192-token budget; Gemini then truncates mid-array (finishReason MAX_TOKENS)
    // and the slice below ends without its closing ']' -> "Expected ',' or ']'
    // after array element" (a truncation _repairJson cannot fix). Retry with a
    // bigger budget, keeping the longest result — same pattern as the reduction.
    if(_lastTruncated){
      var raw2 = await callAPI(prompt, sys, null, clientId, 32768, 0);
      if(raw2 && (!_lastTruncated || String(raw2).length >= String(raw||'').length)) raw = raw2;
    }
    if(_lastTruncated){
      var raw3 = await callAPI(prompt, sys, null, clientId, 65536, 0);
      if(raw3 && String(raw3).length >= String(raw||'').length) raw = raw3;
    }
    var txt = String(raw||'').replace(/```json|```/g,'').trim();
    var _slice = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1);
    var data;
    try { data = JSON.parse(_slice); }
    catch(e){
      // The model occasionally drops a comma between array items or leaves a
      // trailing comma; repair common malformations before giving up (same
      // fallback used elsewhere for AI JSON). Keep the original error if repair fails.
      try { data = JSON.parse(_repairJson(_slice)); }
      catch(e2){ throw e; }
    }

    var pools = LS.get('aba5_pools_' + clientId) || {};
    var mal = normalizeBehaviorArr(pools.mal || []);
    var rep = normalizeBehaviorArr(pools.rep || []);
    var have = function(arr, n){ return arr.some(function(x){ return String(x.name||'').trim().toLowerCase() === String(n).trim().toLowerCase(); }); };
    var addedM = 0, addedR = 0;
    // Accept both the object form {name, fn, topo} and the legacy plain-string form.
    // Clean each extracted label: drop the trailing period the model tends to add and
    // reject fragments ("tan", "de") that are not real program names.
    var cleanName = function(v){
      return String(v||'').trim().replace(/\s+/g,' ').replace(/[.,;]+$/,'').trim();
    };
    var looksLikeFragment = function(nm){
      return nm.length < 4 || !/[a-zA-Z]{3}/.test(nm);
    };
    // Heuristic: a name holding SEVERAL programs (a comma list outside parentheses).
    // We never auto-split -- a single program may legitimately contain commas -- but
    // we flag it so the user can fix that entry instead of it silently polluting notes.
    var looksLikeList = function(nm){
      // Concatenated program labels start with a capital after the comma
      // ("..., Request Break, Request for tangibles"), whereas a single program's
      // internal commas continue in lower case ("... to request help, clarification,
      // or more time"). Counting only capitalised segments avoids false positives.
      var outside = nm.replace(/\([^)]*\)/g,'');
      return (outside.match(/,\s+[A-Z]/g)||[]).length >= 2;
    };
    var _suspect = [];
    // El estado que trae el reducido. Solo se acepta lo que RETIRA (masterizado o
    // en pausa): "active" no puede reactivar lo que una persona dejo fuera a mano.
    var asStatus = function(v){
      var t = String(v||'').trim().toLowerCase();
      if(/master/.test(t)) return 'mastered';
      if(/hold|pause|discontinu|suspend/.test(t)) return 'onhold';
      return '';
    };
    var asItem = function(x){
      if(x && typeof x === 'object') return { name: cleanName(x.name), fn: _fnClassList(x.fn).join('+'), topo: String(x.topo||'').trim(), int: String(x.int||'').trim(), act: String(x.act||'').trim(), st: asStatus(x.status) };
      return { name: cleanName(x), fn: '', topo: '', int: '', act: '', st: '' };
    };
    var _retired = [];
    var findIn = function(arr, n){ return arr.find(function(x){ return String(x.name||'').trim().toLowerCase() === String(n).trim().toLowerCase(); }); };
    (data.mal||[]).map(asItem).forEach(function(it){
      if(!it.name || looksLikeFragment(it.name)) return;
      if(looksLikeList(it.name)) _suspect.push(it.name);
      var ex = findIn(mal, it.name);
      if(!ex){ mal.push({name:it.name, status: it.st || 'new', fn:it.fn, topo:it.topo, int:it.int}); addedM++; if(it.st) _retired.push(it.name); }
      else {
        if(it.fn && !ex.fn) ex.fn = it.fn; if(it.topo && !ex.topo) ex.topo = it.topo; if(it.int && !ex.int) ex.int = it.int;  // backfill
        if(it.st && ex.status !== it.st && (ex.status === 'active' || ex.status === 'new')){ ex.status = it.st; _retired.push(it.name); }
      }
    });
    (data.rep||[]).map(asItem).forEach(function(it){
      if(!it.name || looksLikeFragment(it.name)) return;
      if(looksLikeList(it.name)) _suspect.push(it.name);
      var ex = findIn(rep, it.name);
      if(!ex){
        var _f = it.fn, _src = '';
        if(!_f){ _f = _inferReplacementFn(it.name); if(_f) _src = 'inferred'; }
        rep.push({name:it.name, status: it.st || 'new', fn:_f, fnSrc:_src, act: it.act});
        addedR++;
        if(it.st) _retired.push(it.name);
      }
      else {
        if(it.st && ex.status !== it.st && (ex.status === 'active' || ex.status === 'new')){ ex.status = it.st; _retired.push(it.name); }
        if(it.fn){
          // The reduced assessment is clinical truth: it overrides a function this app
          // had merely deduced from the program's name, and fills an empty one.
          if(!ex.fn || ex.fnSrc === 'inferred'){ ex.fn = it.fn; delete ex.fnSrc; }
        } else if(!ex.fn){
          var _inf = _inferReplacementFn(ex.name);
          if(_inf){ ex.fn = _inf; ex.fnSrc = 'inferred'; }
        }
        // Las actividades se rellenan siempre que falten, pase lo que pase con la
        // funcion o el estado: es un campo aparte y encadenarlo a los otros era lo
        // que dejaba el programa sin actividades sin que nadie lo dijera.
        if(it.act && !String(ex.act||'').trim()) ex.act = it.act;
      }
    });
    pools.mal = mal;
    pools.rep = rep;
    var newReinf = String(data.reinforcers||'').trim();
    if(newReinf){
      var cur = String(pools.reinforcers||'').trim();
      pools.reinforcers = cur ? (cur + (cur.endsWith(',') ? ' ' : ', ') + newReinf) : newReinf;
    }
    // Situational background: what makes a note contextually rich (communication
    // level, repertoires, preferences, barriers, prompt hierarchy, context). Stored
    // once per client and injected into every note prompt.
    var newBg = String(data.background||'').trim();
    if(newBg && !String(pools.background||'').trim()) pools.background = newBg;
    // Requisitos de documentacion propios de la agencia de ESTE cliente.
    var newDq = String(data.docreq||'').trim();
    if(newDq && !String(pools.docreq||'').trim()) pools.docreq = newDq;
    LS.set('aba5_pools_' + clientId, pools);
    // El reducido acaba de poblar la ficha: aplicar de inmediato lo que el propio
    // reducido da por masterizado o en pausa, para que no entre como activo.
    try{ _syncStatusFromAssessment(clientId); pools = LS.get('aba5_pools_' + clientId) || pools; }catch(e){}
    // Derive the function of EVERY replacement still missing one, not just the ones the
    // model returned this time. When the reduced profile yields no replacements the
    // loop above never runs, and the programs already in the pool would keep their
    // empty fn — which is exactly what left 0/11 with function.
    var _bf = (typeof _backfillRepFunctions === 'function') ? _backfillRepFunctions(clientId) : { filled: 0, unresolved: [] };
    pools = LS.get('aba5_pools_' + clientId) || pools;
    rep = normalizeBehaviorArr(pools.rep || []);
    if(_assessCurrentClientId !== clientId){
      showMsg('assessMsg','\u26A0 Los pools se guardaron en la ficha correcta, pero cambiaste de cliente mientras se extra\u00edan: no se pinta nada aqu\u00ed para no mezclar. Vuelve a esa ficha para verlos.','err');
      return;
    }
    if(typeof renderChipPool === 'function'){
      renderChipPool('malPool', pools.mal || [], 'mal', clientId);
      renderChipPool('repPool', pools.rep || [], 'rep', clientId);
    }
    var rf = document.getElementById('cReinf'); if(rf) rf.value = pools.reinforcers || '';
    var dqf = document.getElementById('cDocreq'); if(dqf) dqf.value = pools.docreq || '';
    if(typeof _renderDocreqRead === 'function') _renderDocreqRead();
    // Explicit feedback on the clinical fields: a silent "0 con función" tells the
    // user the profile has no functions (or they were not recognised) instead of
    // leaving them to discover empty fn? badges later.
    var _withFn   = mal.filter(function(x){ return x && x.fn; }).length;
    var _withTopo = mal.filter(function(x){ return x && x.topo; }).length;
    var _withInt  = mal.filter(function(x){ return x && String(x.int||'').trim(); }).length;
    var _repWithFn= rep.filter(function(x){ return x && x.fn; }).length;
    var _repWithAct = rep.filter(function(x){ return x && String(x.act||'').trim(); }).length;
    // Las intervenciones POR CONDUCTA son las que hacen que la nota use el
    // procedimiento del plan y no una opcion plausible del catalogo. Quedaban vacias
    // sin que nadie lo dijera, porque en un BSP los procedimientos viven en una
    // seccion distinta de la definicion de la conducta.
    var _noInt = mal.filter(function(x){ return x && !String(x.int||'').trim(); })
                    .map(function(x){ return x.name; });
    var _intNote = '';
    if(mal.length){
      if(!_withInt){
        _intNote = ' ⚠ NINGUNA conducta trae sus intervenciones: la nota tendrá que elegirlas del catálogo por función en vez de usar las del plan. Revisa que el reducido llene "Intervention(s) applied" en cada conducta (los procedimientos suelen estar en la sección del plan de intervención, no junto a la definición).';
      } else if(_noInt.length){
        _intNote = ' ⚠ Sin intervenciones propias: "' + _noInt.slice(0,3).join('", "') + '"'
          + (_noInt.length > 3 ? ' y ' + (_noInt.length-3) + ' más' : '')
          + ' — si el assessment sí las documenta, vuelve a generar el reducido.';
      }
    }
    var _retNote = _retired.length
      ? ' ✓ Fuera de la rotación por decirlo el reducido: "' + _retired.slice(0,4).join('", "') + '"'
        + (_retired.length > 4 ? ' y ' + (_retired.length-4) + ' más' : '') + '.'
      : '';
    var _warnList = _suspect.length ? ' ⚠ ' + _suspect.length + ' entrada(s) parecen contener VARIOS programas en un solo nombre — edítalas o bórralas: "' + _suspect.slice(0,2).map(function(x){ return x.slice(0,60) + '…'; }).join('", "') + '".' : '';
    // Say WHERE each replacement function came from, and flag the case that matters:
    // the reduced profile listed no replacement at all, so the pool kept the ones it
    // already had. That is a profile problem, not an extraction one.
    var _bfNote = _bf.filled ? ' (' + _bf.filled + ' deducida(s) del nombre del programa)' : '';
    var _noRepInProfile = (!(data.rep||[]).length && rep.length)
      ? ' ⚠ El reducido no listaba NINGÚN replacement: se conservaron los ' + rep.length + ' que ya tenía el cliente. Revisa que el reducido incluya sus programas de reemplazo.'
      : '';
    var _unres = _bf.unresolved.length
      ? ' Sin función y sin poder deducirla: "' + _bf.unresolved.slice(0,3).join('", "') + '"' + (_bf.unresolved.length > 3 ? ' y ' + (_bf.unresolved.length-3) + ' más' : '') + '.'
      : '';
    try{ _renderAssessQuality(clientId); }catch(e){}
    var _detail = ' — ' + _withFn + '/' + mal.length + ' conducta(s) con función, '
                + _withTopo + ' con topografía, ' + _withInt + '/' + mal.length + ' con intervenciones propias, '
                + _repWithFn + '/' + rep.length + ' replacement(s) con función' + _bfNote
                + ', ' + _repWithAct + '/' + rep.length + ' con actividades propias'
                + (String(pools.background||'').trim() ? ', background cargado' : '') + (String(pools.docreq||'').trim() ? ', requisitos de documentación cargados' : '') + _noRepInProfile + _unres + _intNote + _retNote + _warnList;
    showMsg('assessMsg','Pools actualizados desde el reducido: ' + addedM + ' conducta(s), ' + addedR + ' replacement(s)' + (newReinf ? ', reforzadores añadidos' : '') + '.' + _detail + '. Revísalos arriba y quita lo que no aplique.', ((_withFn === 0 && mal.length) || (_repWithFn === 0 && rep.length) || _noRepInProfile || _intNote || _suspect.length) ? 'err' : 'ok');
  } catch(err){
    showMsg('assessMsg','Error al extraer los pools: ' + (err.message||err), 'err');
  } finally {
    if(btn) btn.disabled = false;
  }
}

function assessSave(){
  var clientId = _assessCurrentClientId;
  if(!clientId){ showMsg('assessMsg','Selecciona un cliente primero.','err'); return; }
  var core = (document.getElementById('assessCore').value||'').trim();
  var excl = (document.getElementById('assessExcl').value||'').trim();
  var c = clients.find(function(x){ return x.id === clientId; });
  // Auto-clean the client's name, then VERIFY: if any name part still remains
  // after cleaning, do NOT save — stop and ask the user to fix it (Opción 3).
  if(c && c.name && core){
    var scrubbed = _deidentifyName(core, c.name);
    if(scrubbed !== core){
      core = scrubbed;
      if(document.getElementById('assessCore')) document.getElementById('assessCore').value = core;
    }
    var leftover = _nameRemnant(core, c.name);
    if(leftover){
      showMsg('assessMsg','\u26A0 NO se guard\u00f3: tras la limpieza autom\u00e1tica todav\u00eda aparece parte del nombre del cliente ("'+leftover+'") en el texto. Qu\u00edtalo a mano (usa "the client") y vuelve a Guardar — el reducido debe ir des-identificado.','err');
      return;
    }
  }
  var _wrong = _assessBelongsElsewhere(core, clientId);
  if(_wrong){
    showMsg('assessMsg','\u26D4 NO se guard\u00f3: este reducido parece ser de "' + _wrong.who + '" (' + _wrong.why + '), no de la ficha abierta. Gu\u00e1rdalo en su ficha. Si de verdad es de este cliente, quita del texto lo que pertenezca al otro y vuelve a Guardar.','err');
    return;
  }
  LS.set('aba5_assess_'+clientId, core);
  LS.set('aba5_assessx_'+clientId, excl);
  try{ if(typeof _sb!=='undefined') _sb().from('clients').update({assessment_updated_at: new Date().toISOString()}).eq('id', clientId); }catch(e){}
  _assessUpdateBadge(core);
  // Un reassessment nuevo cambia lo que esta en curso. Contrastarlo con la ficha
  // AQUI es lo que evita que un programa ya masterizado siga entrando en las notas.
  var _aud = null;
  try{ _aud = _syncStatusFromAssessment(clientId); }catch(e){}
  var _syncMsg = '';
  if(_aud && _aud.retire.length){
    _syncMsg += ' Retirado(s) de la rotación por decirlo el reducido: '
      + _aud.retire.slice(0,5).map(function(x){ return '"' + x.name + '" (' + (x.st==='mastered'?'masterizado':'en pausa') + ')'; }).join(', ')
      + (_aud.retire.length > 5 ? ' y ' + (_aud.retire.length-5) + ' más' : '') + '.';
    if(typeof renderChipPool === 'function'){
      var _p = LS.get('aba5_pools_' + clientId) || {};
      renderChipPool('malPool', _p.mal || [], 'mal', clientId);
      renderChipPool('repPool', _p.rep || [], 'rep', clientId);
    }
  }
  if(_aud && _aud.absent.length){
    _syncMsg += ' ⚠ ' + _aud.absent.length + ' item(s) de la ficha NO aparecen en este reducido: "'
      + _aud.absent.slice(0,4).map(function(x){ return x.name; }).join('", "') + '"'
      + (_aud.absent.length > 4 ? ' y ' + (_aud.absent.length-4) + ' más' : '')
      + ' — quedan fuera de la selección automática. Bórralos si ya no están en el plan.';
  }
  try{ _renderAssessQuality(clientId); }catch(e){}
  showMsg('assessMsg','Assessment reducido guardado para este cliente.' + _syncMsg, _syncMsg ? 'err' : 'ok');
}

function _assessSaveDate(){
  if(!_assessCurrentClientId) return;
  var v = (document.getElementById('assessDate')||{}).value || '';
  LS.set('aba5_assessdate_' + _assessCurrentClientId, v);
  _assessRenderExpiry();
}

// Assessments must be reviewed every 6 months from their date.
function _assessExpiryInfo(clientId){
  var d = LS.get('aba5_assessdate_' + clientId) || '';
  if(!d) return null;
  var from = new Date(d + 'T00:00:00');
  if(isNaN(from)) return null;
  var due = new Date(from); due.setMonth(due.getMonth() + 6);
  var days = Math.round((due - new Date()) / 86400000);
  return { date: d, due: due, days: days, expired: days < 0, soon: days >= 0 && days <= 30 };
}

function _assessRenderExpiry(){
  var el = document.getElementById('assessExpiry');
  if(!el) return;
  var info = _assessCurrentClientId ? _assessExpiryInfo(_assessCurrentClientId) : null;
  if(!info){ el.textContent = ''; return; }
  var due = info.due.toLocaleDateString();
  if(info.expired){
    el.innerHTML = '<span style="color:var(--red);font-weight:600">\u26A0 Vencido: la revisión de 6 meses era el ' + due + ' (' + Math.abs(info.days) + ' días de retraso)</span>';
  } else if(info.soon){
    el.innerHTML = '<span style="color:#b8860b;font-weight:600">\u26A0 Revisión en ' + info.days + ' días (vence el ' + due + ')</span>';
  } else {
    el.innerHTML = '<span style="color:var(--green)">Vigente hasta el ' + due + '</span>';
  }
}


/* ── CALIDAD DEL REDUCIDO ────────────────────────────────────────────────────
   Los tres campos que las notas consumen de verdad: topografia por conducta,
   intervenciones por conducta y actividades por replacement. Se miden por cliente
   y se dicen en voz alta, porque hasta ahora se descubrian tarde: la nota salia
   generica y no habia forma de saber que el hueco estaba en el reducido.

   No es un error tenerlos vacios. Son OBLIGATORIOS en los clientes de AbaMatrix,
   porque la plataforma pide esos campos uno a uno; en el resto son opcionales y
   solo mejoran la nota. Por eso esto informa y no bloquea nada.                 */
function _assessQuality(clientId){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var live = function(a){ return normalizeBehaviorArr(a || []).filter(function(x){ return x && (x.status === 'active' || x.status === 'new'); }); };
  var mal = live(pools.mal), rep = live(pools.rep);
  var has = function(arr, k){ return arr.filter(function(x){ return String(x[k]||'').trim(); }).length; };
  return {
    mal: mal.length, rep: rep.length,
    topo: has(mal, 'topo'), int: has(mal, 'int'), act: has(rep, 'act'),
    missTopo: mal.filter(function(x){ return !String(x.topo||'').trim(); }).map(function(x){ return x.name; }),
    missInt:  mal.filter(function(x){ return !String(x.int ||'').trim(); }).map(function(x){ return x.name; }),
    missAct:  rep.filter(function(x){ return !String(x.act ||'').trim(); }).map(function(x){ return x.name; })
  };
}

function _renderAssessQuality(clientId){
  var box = document.getElementById('assessQuality');
  if(!box) return;
  if(!clientId){ box.style.display = 'none'; return; }
  var q = _assessQuality(clientId);
  if(!q.mal && !q.rep){ box.style.display = 'none'; return; }
  var isAba = false;
  try{ isAba = !!(typeof _abaCfg === 'function' && _abaCfg(clientId)); }catch(e){}
  var row = function(label, got, total, miss, where){
    var ok = total > 0 && got === total;
    var col = ok ? 'var(--green,#16a34a)' : (got ? '#8a6d1f' : 'var(--text3)');
    return '<div style="margin-top:5px;line-height:1.55">'
      + '<span style="color:' + col + ';font-weight:700">' + (ok ? '✓' : '·') + '</span> '
      + '<b style="color:var(--text2)">' + label + '</b>: ' + got + ' de ' + total
      + (miss.length ? '<div style="font-size:10px;color:var(--text3);margin-left:14px">faltan: "' + miss.slice(0,4).join('", "') + '"'
          + (miss.length > 4 ? ' y ' + (miss.length-4) + ' más' : '') + ' — ' + where + '</div>' : '')
      + '</div>';
  };
  box.style.display = 'block';
  box.style.borderLeftColor = isAba ? 'var(--amber,#b86c00)' : 'var(--blue)';
  var _ab = [];
  try{ _ab = (_assessAudit(clientId).absent || []); }catch(e){}
  var _abBlock = _ab.length
    ? '<div style="margin-top:8px;padding:7px 10px;border:1px solid #b45309;border-radius:5px;background:#fffbeb;color:#7c2d12;line-height:1.5">'
      + '<b>' + _ab.length + ' item(s) activo(s) de la ficha NO aparecen en este reducido</b>: "'
      + _ab.slice(0,5).map(function(x){ return esc(x.name); }).join('", "') + '"' + (_ab.length > 5 ? ' y ' + (_ab.length-5) + ' más' : '') + '. '
      + 'Suelen ser los del reassessment anterior: rellenar la ficha añade, no quita. '
      + '<span style="text-decoration:underline;cursor:pointer;font-weight:700" onclick="_retireAbsentFromAssessment(\'' + clientId + '\')">Ponerlos en pausa</span>'
      + '</div>'
    : '';
  box.innerHTML = '<div style="font-size:11px;font-weight:700;color:var(--text2)">Calidad del reducido de este cliente'
    + (isAba ? ' <span style="font-weight:500;color:var(--amber,#b86c00)">· cliente de AbaMatrix: aquí sí hacen falta los tres</span>'
             : ' <span style="font-weight:500;color:var(--text3)">· no es de AbaMatrix: son opcionales, pero mejoran la nota</span>')
    + '</div>'
    + '<div style="font-size:11px;color:var(--text2)">'
    + row('Conductas con topografía', q.topo, q.mal, q.missTopo, 'la definición operacional va en el reducido')
    + row('Conductas con intervenciones propias', q.int, q.mal, q.missInt, 'qué procedimiento usa CADA conducta, no el catálogo por función')
    + row('Replacements con actividades', q.act, q.rep, q.missAct, 'en qué actividad se enseña CADA programa')
    + '</div>'
    + _abBlock
    + '<div style="font-size:10px;color:var(--text3);margin-top:6px;line-height:1.5">Se rellenan volviendo a generar el reducido y pulsando "Rellenar behaviors / replacements / reinforcers". Si el assessment de origen no los documenta, quedarán vacíos: eso no es un fallo del sistema, es lo que dice el documento.</div>';
}

function _assessUpdateBadge(core){
  var b = document.getElementById('assessBadge');
  if(b) b.innerHTML = core ? '<span class="client-tag tag-green">Assessment ✓</span>' : '<span class="client-tag tag-amber">None</span>';
}

var _assessCurrentClientId = null;
function _assessLoad(clientId){
  _assessCurrentClientId = clientId;
  var core = LS.get('aba5_assess_'+clientId) || '';
  var excl = LS.get('aba5_assessx_'+clientId) || '';
  var elCore = document.getElementById('assessCore'); if(elCore) elCore.value = core;
  var elExcl = document.getElementById('assessExcl'); if(elExcl) elExcl.value = excl;
  var elDate = document.getElementById('assessDate'); if(elDate) elDate.value = LS.get('aba5_assessdate_' + clientId) || '';
  _assessRenderExpiry();
  var elFull = document.getElementById('assessFull'); if(elFull) elFull.value = '';
  var elName = document.getElementById('assessFileName'); if(elName) elName.textContent = '';
  var elMsg = document.getElementById('assessMsg'); if(elMsg){ elMsg.textContent=''; elMsg.className='msg'; }
  _assessUpdateBadge(core);
  try{ _renderAssessQuality(clientId); }catch(e){}
  try{ _renderPendingProposal(); }catch(e){}
}

// Warns in Generate when the client has no reduced assessment (so the note still
// falls back to the old summary), and when the assessment is due for its 6-month review.
// Migration overview: which clients still run on the old summary, and which
// assessments are past their 6-month review.
function assessOverview(){
  var rows = (clients||[]).map(function(c){
    var core = (LS.get('aba5_assess_' + c.id) || '').trim();
    var info = _assessExpiryInfo(c.id);
    return { name: c.name, has: !!core, info: info };
  });
  var missing = rows.filter(function(r){ return !r.has; });
  var expired = rows.filter(function(r){ return r.has && r.info && r.info.expired; });
  var soon    = rows.filter(function(r){ return r.has && r.info && r.info.soon; });
  var noDate  = rows.filter(function(r){ return r.has && !r.info; });

  var h = '<div style="font-size:12px;line-height:1.7">';
  h += '<b>' + (rows.length - missing.length) + ' de ' + rows.length + ' clientes ya tienen assessment reducido.</b><br><br>';
  if(missing.length){
    h += '<span style="color:#8a6d1f;font-weight:600">Sin reducido (' + missing.length + ') — siguen usando el summary antiguo:</span><br>';
    h += missing.map(function(r){ return '&nbsp;&nbsp;· ' + esc(r.name); }).join('<br>') + '<br><br>';
  }
  if(expired.length){
    h += '<span style="color:var(--red);font-weight:600">Assessment vencido (' + expired.length + ') — pasaron los 6 meses:</span><br>';
    h += expired.map(function(r){ return '&nbsp;&nbsp;· ' + esc(r.name) + ' — venció el ' + r.info.due.toLocaleDateString(); }).join('<br>') + '<br><br>';
  }
  if(soon.length){
    h += '<span style="color:#b8860b;font-weight:600">Vencen pronto (' + soon.length + '):</span><br>';
    h += soon.map(function(r){ return '&nbsp;&nbsp;· ' + esc(r.name) + ' — en ' + r.info.days + ' días'; }).join('<br>') + '<br><br>';
  }
  if(noDate.length){
    h += '<span style="color:var(--text3)">Con reducido pero sin fecha de assessment (' + noDate.length + '): ' + noDate.map(function(r){ return esc(r.name); }).join(', ') + '</span><br>';
  }
  h += '</div>';
  var box = document.getElementById('assessOverviewOut');
  if(box){ box.innerHTML = h; box.style.display = 'block'; }
}

function _genAssessWarning(clientId){
  var el = document.getElementById('genAssessWarn');
  if(!el) return;
  if(!clientId){ el.style.display = 'none'; return; }
  var core = (LS.get('aba5_assess_' + clientId) || '').trim();
  var info = (typeof _assessExpiryInfo === 'function') ? _assessExpiryInfo(clientId) : null;
  var msgs = [];
  if(!core){
    msgs.push({ color:'#8a6d1f', bg:'#fdf6e3', text:'\u26A0 Este cliente NO tiene assessment reducido. La nota se generará con el summary antiguo, que es menos fiel. Crea su reducido en la ficha del cliente.' });
  }
  if(info && info.expired){
    msgs.push({ color:'#8b1a1a', bg:'#fdecea', text:'\u26A0 El assessment de este cliente venció su revisión de 6 meses el ' + info.due.toLocaleDateString() + '. Solicita el reassessment al analista.' });
  } else if(info && info.soon){
    msgs.push({ color:'#8a6d1f', bg:'#fdf6e3', text:'\u26A0 El assessment cumple 6 meses en ' + info.days + ' días (' + info.due.toLocaleDateString() + ').' });
  } else if(core && !info){
    msgs.push({ color:'#5a6270', bg:'var(--bg)', text:'Este cliente tiene reducido, pero sin fecha de assessment. Añádela en la ficha para el aviso de revisión a los 6 meses.' });
  }
  // Contraste con el reducido: lo que el reassessment da por masterizado se retira
  // de la ficha aqui mismo, y lo que ya no aparece en el reassessment se nombra.
  if(core){
    var _aud = null;
    try{ _aud = _syncStatusFromAssessment(clientId); }catch(e){}
    if(_aud && _aud.retire.length){
      var _lab = function(x){ return '"' + x.name + '" (' + (x.st === 'mastered' ? 'masterizado' : 'en pausa') + ')'; };
      msgs.push({ color:'#065f46', bg:'#f0fdf4', text:'\u2713 Retirado(s) de la rotación porque el reducido lo dice: ' + _aud.retire.map(_lab).join(', ') + '. Ya no entran en ninguna nota.' });
    }
    if(_aud && _aud.absent.length){
      msgs.push({ color:'#8a6d1f', bg:'#fdf6e3', text:'\u26A0 ' + _aud.absent.length + ' item(s) activo(s) en la ficha NO aparecen en el reducido del reassessment: "'
        + _aud.absent.slice(0,4).map(function(x){ return x.name; }).join('", "') + '"'
        + (_aud.absent.length > 4 ? ' y ' + (_aud.absent.length-4) + ' más' : '')
        + '. No se seleccionan solos. Si ya no están en el plan, bórralos de la ficha; si es que el nombre cambió, ajústalo para que coincida con el reducido.' });
    }
  }
  if(!msgs.length){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.background = msgs[0].bg;
  el.style.color = msgs[0].color;
  el.style.border = '1px solid ' + msgs[0].color;
  el.innerHTML = msgs.map(function(m){ return m.text; }).join('<br>');
}

// The reduced assessment is the source of truth, but a CARD only needs the part that
// concerns ITS behavior or ITS program. Sending the whole document on every call made
// each AbaMatrix note cost ~11 sequential requests of 18-22k input tokens, which is
// what turned generation slow and pushed long notes into truncation. Worse, the
// document repeats the platform catalogs (antecedents, interventions, activities,
// evidenced-by) that are ALREADY sent as closed lists in the same prompt.
// This keeps: the blocks that name the target, plus the global rule blocks; and drops
// the catalog blocks and the blocks about other behaviors/programs.
function _sliceProfileFor(prof, name, opts){
  var txt = String(prof||'');
  opts = opts || {};
  if(!txt.trim()) return txt;
  if(!name && !opts.catalogsOnly) return txt;
  // Below this size slicing buys nothing and risks dropping context.
  if(txt.length < 6000) return txt;
  var blocks = txt.split(/\n\s*\n/);
  var nz = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); };
  var target = nz(name);
  var words = target.split(' ').filter(function(w){ return w.length > 3; });
  // Catalogs already supplied as closed lists elsewhere in the same prompt.
  var DROP = /^(ANTECEDENTS AVAILABLE|INTERVENTIONS AUTHORISED|ACTIVITIES AVAILABLE|EVIDENCED BY|SCHEDULES OF REINFORCEMENT AVAILABLE|TEACHING PROCEDURES AVAILABLE|PROMPTS AVAILABLE|OTHER DAILY LOG FIELDS)/i;
  // Blocks that must travel with every card whatever it is about.
  var KEEP = /^(RULES THAT APPLY|DOCUMENTATION REQUIREMENTS|REINFORCEMENT\b|PROMPT HIERARCHY|CHOOSING THE SCHEDULE|BACKGROUND|CLIENT PROFILE|MANDATORY 1:1|FORBIDDEN PAIRS|TWO FUNCTION MISMATCHES|NAME DIFFERENCES|IMPORTANT|THE "FOR BEHAVIOR|CAREGIVER TRAINING)/i;
  var kept = [], dropped = 0;
  blocks.forEach(function(b){
    var head = b.trim().split('\n')[0] || '';
    if(DROP.test(head.trim())){ dropped++; return; }
    // catalogsOnly: drop the duplicated platform catalogs and keep everything else.
    // Used by the whole-note calls, which need every behavior and every program.
    if(opts.catalogsOnly){ kept.push(b); return; }
    if(KEEP.test(head.trim())){ kept.push(b); return; }
    var t = nz(b);
    var hit = target && t.indexOf(target) !== -1;
    if(!hit && words.length){
      // Loose match: most of the distinctive words of the name appear in the block.
      var n = words.filter(function(w){ return t.indexOf(w) !== -1; }).length;
      hit = n >= Math.max(1, Math.ceil(words.length * 0.6));
    }
    if(hit) kept.push(b); else dropped++;
  });
  if(!kept.length) return txt;              // never send an empty profile
  var out = kept.join('\n\n');
  if(opts.catalogsOnly){
    return (dropped ? out + '\n\n[Catálogos cerrados de la plataforma omitidos aquí: van aparte en este mismo prompt.]' : txt);
  }
  // If slicing barely helped, keep the original rather than risk losing context.
  if(out.length > txt.length * 0.85) return txt;
  return out + '\n\n[Perfil recortado a lo relevante para "' + name + '". Los catálogos cerrados de la plataforma van aparte en este mismo prompt.]';
}

/* Migracion unica: notas escritas antes de que esto viajara a la nube quedaron
   en localStorage de ese equipo. Se suben al registro del terapista la primera
   vez que se abre la app, sin pisar nada que ya venga de la nube. */
function _migrateCaseGuides(){
  if(typeof therapists === 'undefined' || !therapists.length) return;
  var moved = 0;
  therapists.forEach(function(t){
    if(!t || (t.caseGuide || '').trim()) return;
    var old = '';
    try{ old = LS.get(_caseGuideKey(t.id)) || ''; }catch(e){}
    if(String(old).trim()){ t.caseGuide = old; moved++; }
  });
  if(moved){
    LS.set('aba5_therapists', therapists);
    console.info('[caseguide] ' + moved + ' nota(s) local(es) migrada(s) a la nube');
  }
}
