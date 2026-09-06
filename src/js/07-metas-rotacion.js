/* ═══════════════════════════════════════════════════════════
   GOAL SELECTION
═══════════════════════════════════════════════════════════ */
function selectGoals(ntId) {
  const sup = (NOTE_TYPES.find(t=>t.id===ntId)||{}).supType;
  if (ntId === '97156') return { type:'97156', p156: one(GOALS_POOL.p156) };
  if (ntId === 'supervision') return { type:'supervision', tasks: pick(BACB_TASKS,5) };
  const g3pool = sup==='bcaba' ? GOALS_POOL.g3bcaba : GOALS_POOL.g3rbt;
  return {
    type: '97155',
    g1: one(GOALS_POOL.g1),
    g2: one(GOALS_POOL.g2),
    g3: sup==='direct' ? null : one(g3pool),
    g4: one(GOALS_POOL.g4)
  };
}

function goalsString(g, directSession) {
  if (!g) return '';
  /* EL TIPO MANDA SOBRE _custom. Las metas a mano de una 97156 se guardan en p156
     ({type:'97156', p156:[texto], _custom:true}), pero la rama _custom estaba
     ANTES y devolvia g.g1 — un campo que ese objeto no tiene. Resultado: en cuanto
     se escribian metas propias en una 97156, la cadena salia vacia, el bloque de
     Goals desaparecia de la pantalla Y las metas tampoco llegaban al prompt, asi
     que la nota se generaba sin ellas. La rama _custom es de las 97155, donde el
     texto si vive en g1: se conserva, pero despues del tipo. */
  if (g.type === '97156') {
    const p = g.p156;
    return Array.isArray(p) ? p.filter(Boolean).join('; ') : (p || '');
  }
  if (g._custom) return g.g1 || '';
  if (g.type === 'supervision') return '';
  // Direct sessions NEVER include g3 — no supervisee direction goals
  const fields = directSession ? [g.g1, g.g2, g.g4] : [g.g1, g.g2, g.g3, g.g4];
  return fields.filter(Boolean).join(', ');
}

// Returns items sorted so least-recently-used come first, then picks first n.
// RECENCY-AWARE: balancing total counts alone is not enough — with a long, balanced
// history every behavior has a similar count, so tie-breaking becomes random and
// consecutive sessions can repeat behaviors ~46% of the time by chance. To fix this,
// behaviors used in the MOST RECENT session(s) receive a heavy penalty so the next
// note actively rotates AWAY from them. usageArr is chronological (oldest first).
function rotatingPick(pool, usageArr, n, opts){
  // HARD TURNOVER (same strategy already validated for the AbaMatrix path): items
  // used in the IMMEDIATELY PREVIOUS note are held back and only reused when the
  // pool is too small to fill the note. The previous soft weighting made recent
  // items "less likely but never impossible", which is why the same behaviors could
  // appear in two consecutive notes. Order is randomised every note.
  if(!pool || !pool.length) return [];
  n = Math.min(n, pool.length);
  usageArr = Array.isArray(usageArr) ? usageArr : [];
  var shuffle = function(a){
    a = a.slice();
    for(var i = a.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  var lastNote = usageArr.slice(-n);
  var fresh  = shuffle(pool.filter(function(x){ return lastNote.indexOf(x) < 0; }));
  var recent = shuffle(pool.filter(function(x){ return lastNote.indexOf(x) >= 0; }));
  return fresh.concat(recent).slice(0, n);
}

function rotatingOne(pool, usageArr){
  const picked = rotatingPick(pool, usageArr, 1);
  return picked[0] || (pool.length ? pool[Math.floor(Math.random()*pool.length)] : null);
}

// Smart goal selector using rotation history
function getCaspDerivedGoals(supLabel){
  // Build goals string directly from what was marked in CASP — no random selection
  const casp = getCaspSections();
  if(!casp) return null;

  const goals = [];

  // Section A
  if(casp.A){
    if(casp.Aresult === 'adj'){
      goals.push('Review and adjustment to observation of protocol components — session observations indicated that adjustments were clinically indicated');
    } else {
      goals.push('Review of protocol components through face-to-face observation — session observations indicated that the protocol components were functioning effectively and no adjustments were clinically indicated');
    }
  }

  // Section B — list the specific components selected
  if(casp.B && casp.Bitems && casp.Bitems.length){
    goals.push('Adjustments to selected protocol components: ' + casp.Bitems.join(', '));
  } else if(casp.B){
    goals.push('Adjustments to selected components of the protocol');
  }

  // Section C — list specific direction activities (only applies when a supervisee is present)
  if(casp.C && casp.Citems && casp.Citems.length && supLabel !== null){
    const techLabel = supLabel === 'BCaBA' ? 'BCaBA' : 'RBT';
    // Summarize direction activities concisely
    const actSummary = casp.Citems.map(item => {
      if(item.toLowerCase().includes('implementing the protocol')) return 'implementing the protocol with the client while the '+techLabel+' observed, then having the '+techLabel+' implement while the QHP observed';
      if(item.toLowerCase().includes('correcting errors')) return 'correcting errors made during implementation of adaptive behavior protocols';
      if(item.toLowerCase().includes('modeling')) return 'modeling of correct protocol implementation';
      if(item.toLowerCase().includes('training of the')) return 'training the '+techLabel+' to implement a modified protocol';
      if(item.toLowerCase().includes('feedback')) return 'providing feedback and instruction on implementation fidelity';
      if(item.toLowerCase().includes('observing and recording')) return 'interobserver agreement (IOA) — observing and recording target behaviors independently to check IOA and identify retraining needs';
      if(item.toLowerCase().includes('other')) return 'other direct supervisory activities';
      return item.toLowerCase();
    });
    goals.push('Active face-to-face direction to the '+techLabel+': '+actSummary.join('; '));
  } else if(casp.C){
    goals.push('Active face-to-face direction to the technician to ensure procedural fidelity');
  }

  // Section D
  if(casp.D && casp.Ditems && casp.Ditems.length){
    goals.push('QHP direct implementation with the client: '+casp.Ditems.join('; ').toLowerCase());
  } else if(casp.D){
    goals.push('QHP direct implementation of the protocol with the client');
  }

  if(!goals.length) return null;
  return { type:'97155', g1: goals.join(' | '), g2: null, g3: null, g4: null, _casp_derived: true };
}

function selectGoalsSmart(ntId, clientId){
  const h = getHistory(clientId);
  const sup = (NOTE_TYPES.find(t=>t.id===ntId)||{}).supType;

  if(ntId==='97156'){
    // Pick 2–3 rotating goals for parent training (each covers a different training objective)
    const picked = rotatingPick(GOALS_POOL.p156, h.p156, 2 + Math.floor(Math.random()*2));
    return { type:'97156', p156: picked };
  }
  if(ntId==='supervision'||ntId==='supervision-bcaba'){
    // No longer use pre-selected random RBT codes - evaluate based on actual session content
    return { type:'supervision', tasks: [], _session_based: true };
  }
  const g3pool = sup==='bcaba' ? GOALS_POOL.g3bcaba : GOALS_POOL.g3rbt;
  return {
    type:'97155',
    g1: rotatingOne(GOALS_POOL.g1, h.g1),
    g2: rotatingOne(GOALS_POOL.g2, h.g2),
    g3: sup==='direct' ? null : rotatingOne(g3pool, h.g3),
    g4: rotatingOne(GOALS_POOL.g4, h.g4)
  };
}

function getCustomGoals97155(){
  const val = document.getElementById('customGoals97155')?.value.trim()||'';
  if(!val) return null;
  // Normalize: split by newline or comma, trim, filter empty
  return val.split(/[\n]+/).map(s=>s.trim()).filter(Boolean).join('; ');
}

function getCustomGoals156(){
  const val = document.getElementById('customGoals156')?.value.trim()||'';
  if(!val) return null;
  // Return as single text block for 97156 training objectives
  return val;
}
