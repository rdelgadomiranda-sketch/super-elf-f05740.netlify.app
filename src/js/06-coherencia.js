/* Que clase de sitio es. Los nombres vienen de dos catalogos distintos — el de
   GENERATE trae el codigo de Place of Service entre parentesis y el de AbaMatrix
   no — asi que se reconoce por el texto, no por igualdad exacta. */
function _placeKind(place){
  var t = String(place || '').toLowerCase();
  if(!t) return 'unknown';
  if(/school|daycare|day\s*care|aftercare|after\s*school|summer\s*camp|camp\b|escuela|colegio|guarder/.test(t)) return 'school';
  if(/\bhome\b|casa|domicil/.test(t)) return 'home';
  return 'other';
}

/* Quita de la lista a quien no pinta nada en ese sitio.
   - En casa: fuera el personal docente, sin excepcion. No hay caso clinico en el
     que un maestro sea participante de una sesion en el domicilio; la tarea
     escolar en casa la presenta el cuidador.
   - En la escuela: NO se quita al cuidador. Si esta en la lista es porque se
     marco a mano, y eso es justamente "a menos que se indique". Lo que impide
     que aparezca sin marcarlo es la regla del prompt, no este filtro.        */
function _filterParticipantsByPlace(list, place){
  var arr = Array.isArray(list) ? list.slice() : [];
  var kind = _placeKind(place);
  if(kind !== 'home') return { kept: arr, removed: [], kind: kind };
  var removed = [];
  var kept = arr.filter(function(p){
    if(_PLACE_STAFF_RE.test(String(p))){ removed.push(p); return false; }
    return true;
  });
  return { kept: kept, removed: removed, kind: kind };
}

// Aviso en pantalla de lo que se quito: un filtro silencioso sobre quien estuvo
// en la sesion seria indistinguible de un fallo.
function _placeFilterNotice(res, place, msgId){
  if(!res || !res.removed.length) return '';
  var txt = 'Fuera de los participantes por ser una sesión en ' + (place || 'el domicilio') + ': "'
          + res.removed.join('", "') + '". El personal docente no puede figurar en una nota de casa; '
          + 'si la sesión fue en la escuela, cambia el lugar de servicio.';
  if(msgId && typeof showMsg === 'function'){ try{ showMsg(msgId, '\u26A0 ' + txt, 'err'); }catch(e){} }
  return txt;
}

/* Regla para el prompt. Se construye segun el sitio para no dar al modelo la
   prohibicion contraria a la que toca. */
function _placeCoherenceRule(place, participantsTxt){
  var kind = _placeKind(place);
  var head = 'PLACE AND PARTICIPANTS MUST AGREE (MANDATORY — ABSOLUTE):\n'
    + '1. The people listed as present are the ONLY people who may appear anywhere in this note, in any role. Never add a person who is not on that list, not even in passing, not even as the one who presented a task, made a comment or handed over a material.\n';
  if(kind === 'school'){
    return head
      + '2. THIS SESSION TOOK PLACE IN A SCHOOL-TYPE SETTING (' + place + '). Do NOT introduce a caregiver, parent, mother, father, grandparent or any family member unless they are explicitly named in the participant list above. If no family member is listed, none was there: write the note without one, and never mention their absence.\n'
      + '3. The natural adults of this setting are the teacher, the classroom assistant and other school staff — but only those actually listed as present. If the academic demand has no named adult, attribute it to the classroom teacher role, never to the therapist and never to a caregiver who is not listed.\n';
  }
  if(kind === 'home'){
    return head
      + '2. THIS SESSION TOOK PLACE AT THE CLIENT\'S HOME (' + place + '). NEVER mention a teacher, classroom assistant, teacher\'s aide, paraprofessional, instructor, school counselor, principal or any school staff, in ANY role. They were not there. This holds even when the activity is homework or a school-profile task: at home, that task is presented by the CAREGIVER, never by school staff and never by the therapist.\n'
      + '3. Do not write that anyone "sent", "assigned" or "provided" work from the school as if they were present. If the homework came from school, it is simply the homework: the person who presents it in the session is the caregiver.\n';
  }
  return head
    + '2. THIS SESSION TOOK PLACE AT: ' + place + '. Do not import the adults of another setting into this one: no school staff and no family member may appear unless they are explicitly listed as present above.\n';
}


/* ── LA ACTIVIDAD TIENE QUE CABER EN EL ENTORNO ─────────────────────────────
   Lo reporto Sara Sofia: salian actividades que solo se hacen en casa dentro de
   notas de escuela, y al reves. Es la misma familia que los participantes por
   lugar y que quien presenta la demanda academica — el sistema sabe DONDE fue la
   sesion y no lo estaba usando para decidir QUE se documenta.

   Los marcadores son deliberadamente cortos: solo cuenta lo que nombra un LUGAR
   U OBJETO QUE NO EXISTE en el otro entorno. Medido sobre el catalogo real de
   AbaMatrix, 10 de 163 actividades quedan atadas a un entorno y 153 son neutras
   — que es lo correcto: la mayoria se hacen igual en los dos sitios. Clasificar
   de mas quitaria actividades validas, que es peor que el problema.
   Quedan fuera a proposito "kitchen" (las cocinas de juguete son material de
   aula), "baking/cooking" (la plataforma los ofrece juntos y el segundo si se
   hace en clase) y "educational songs" (tambien se cantan en casa).           */
var ACT_HOME_RE = /\b(bedtime|bath(?:time|ing|room routine)?|shower|pajama|backyard|garden(?:ing)?|household|laundry|bedroom|chore chart|living room|couch|sofa|at home|fort with pillows|home routine)\b/i;
var ACT_SCHOOL_RE = /\b(classroom|circle time|lin(?:e|ing) up|raise[- ]?(?:your )?hand|whiteboard|hallway|recess|cafeteria|school bus|peers?|classmates?|teacher|homework|worksheet|group instruction)\b/i;

function _activitySetting(name){
  var t = String(name||'');
  var h = ACT_HOME_RE.test(t), s = ACT_SCHOOL_RE.test(t);
  if(h && !s) return 'home';
  if(s && !h) return 'school';
  return 'any';
}

/* Quita del catalogo lo que no cabe en este sitio. Nunca deja la lista vacia:
   si filtrar la vaciara, se devuelve entera — un catalogo vacio no produce una
   nota mejor, produce ninguna. */
function _filterActivitiesByPlace(list, place){
  var arr = (list || []).slice();
  var kind = (typeof _placeKind === 'function') ? _placeKind(place) : 'unknown';
  if(kind !== 'home' && kind !== 'school') return { kept: arr, removed: [] };
  var removed = [];
  var kept = arr.filter(function(a){
    var st = _activitySetting(a);
    if(st !== 'any' && st !== kind){ removed.push(a); return false; }
    return true;
  });
  if(!kept.length) return { kept: arr, removed: [] };
  return { kept: kept, removed: removed };
}

/* La regla para la prosa. El filtro solo alcanza al catalogo cerrado; la mayoria
   de las actividades que acaban en una nota vienen del texto libre del reducido
   o las compone el modelo, y ahi solo llega una regla. */
function _activitySettingRule(place){
  var kind = (typeof _placeKind === 'function') ? _placeKind(place) : 'unknown';
  var head = 'ACTIVITIES MUST FIT THE SETTING (MANDATORY): every activity, routine, material and task named in this note has to be one that could actually happen where this session took place (' + (place || 'the documented place of service') + ').\n';
  if(kind === 'home'){
    return head
      + '- This session was at the client\'s home. Never document classroom routines or school-only arrangements: circle time, lining up, raising a hand to be called on, working at a school desk, hallway transitions, recess, the cafeteria, group instruction with classmates, or an activity that needs a teacher or peers who were not there.\n'
      + '- If the client\'s plan documents a program whose usual activity belongs to the classroom, do NOT import the classroom routine into the home. Document the program taught through a routine that exists in this home — the same target, a setting-appropriate vehicle — or document a different program.\n';
  }
  if(kind === 'school'){
    return head
      + '- This session was in a school-type setting. Never document home routines: bedtime, bathing or showering, pajamas, the family bedroom or living room, laundry, household chores, gardening or the backyard, or any activity that needs the family home.\n'
      + '- If the client\'s plan documents a program whose usual activity belongs to the home, do NOT import the home routine into the school. Document the program taught through a routine that exists in this setting — the same target, a setting-appropriate vehicle — or document a different program.\n';
  }
  return head
    + '- Do not import the routines of another setting into this one. An activity that needs a home, or one that needs a classroom, is only documented where that place is the place of service.\n';
}

/* ── COHERENCIA DE LA ACTIVIDAD CON EL CLIENTE ─────────────────────────────
   Segunda dimension del mismo problema del entorno. Una actividad puede caber
   en el sitio y aun asi no caber en el cliente: por su repertorio hay cosas que
   todavia no puede hacer, y documentarlas describe una sesion que no ocurrio.

   DOS DECISIONES DE DISENO, deliberadas:

   1. EL REDUCIDO ES LA UNICA AUTORIDAD. Nada aqui se deduce del diagnostico ni
      de la edad. Solo cuenta lo que el background del assessment reducido dice
      con todas las letras. Si el reducido no declara una limitacion, para el
      sistema esa limitacion no existe.

   2. AQUI SE ANOTA, NO SE QUITA — al reves que con el entorno. Con el entorno el
      corte es limpio: una cama no existe en un aula. Con el repertorio no lo es,
      porque la actividad que exige una habilidad que el cliente no tiene es
      muchas veces la actividad que ENSENA esa habilidad — un programa de mandas
      para un cliente no vocal se corre con PECS o AAC, no se cancela. Filtrar
      quitaria justo los programas de adquisicion. Se marca la exigencia y se
      deja la decision, que es lo que un catalogo cerrado permite. */

/* Actividades del catalogo cuyo NUCLEO es habla vocal. La lista es corta a
   proposito: 9 de las 163 del catalogo real de AbaMatrix. Como solo anota,
   pasarse un poco cuesta poco; quedarse corto deja pasar el error. */
var ACT_VOCAL_RE = /(\btalk about\b|\bwait to speak\b|\basking questions\b|\bconversation\b|\bopinion\b|\brecite\b|\bsing(?:ing|\s+along)?\b|\bsay\b|social scripts?|\bscripted\b|comprehension prompts?)/i;

/* Marcadores de una restriccion de repertorio DECLARADA. No son diagnosticos:
   son las formas en que un reducido escribe "esto todavia no". */
var CAP_DECL_RE = /(non[-\s]?vocal|non[-\s]?verbal|pre[-\s]?verbal|minimally\s+(?:vocal|verbal)|limited\s+vocal|no\s+vocal\s+(?:speech|language|repertoire)|\bAAC\b|augmentative|\bPECS\b|picture\s+exchange|speech[-\s]generating|sign\s+language|gestural\s+communication|communicat(?:es|ion)\s+(?:is\s+)?(?:through|via|using|primarily|level|modality)|pre[-\s]?literate|pre[-\s]?academic|does\s+not\s+(?:yet\s+)?(?:read|write|speak|use|tolerate|engage|respond|imitate)|is\s+not\s+(?:yet\s+)?(?:able|reading|writing|imitating)|not\s+yet\b|unable\s+to|barrier(?:s)?\s+to\s+learning|requires\s+(?:full|partial|hand[-\s]over[-\s]hand|constant)|fine\s+motor|gross\s+motor|motor\s+limitation|emerging)/i;

/* Una frase que declara la AUSENCIA de una limitacion no es una limitacion. Sin
   esto, "no barriers to learning are documented" entraba en la lista de
   restricciones y decia lo contrario de lo que dice el reducido. */
var CAP_NEG_RE = /\b(?:no|none|without|not)\s+(?:\w+\s+){0,2}(?:barrier|limitation|restriction|concern|deficit)s?\b|\bnone\s+(?:are\s+)?(?:documented|reported|noted|identified)\b|\bno\s+(?:known|reported|documented)\b/ig;

/* Marcador de una restriccion de MODALIDAD VOCAL en concreto — el unico caso en
   que se puede senalar una actividad del catalogo pieza por pieza. */
var CAP_NONVOCAL_RE = /(non[-\s]?vocal|non[-\s]?verbal|pre[-\s]?verbal|minimally\s+(?:vocal|verbal)|limited\s+vocal|no\s+vocal\s+(?:speech|language|repertoire)|\bAAC\b|augmentative|\bPECS\b|picture\s+exchange|speech[-\s]generating|sign\s+language|gestural\s+communication)/i;

/* ── DOBLE CHEQUEO DEL NIVEL DEL CLIENTE ───────────────────────────────────
   El estado que faltaba es el TERCERO. Hasta aqui solo habia "hay restriccion
   declarada" y "no hay nada", y ese "no hay nada" se comportaba como si el
   cliente no tuviera limite alguno — que es justo donde se cometen los dos
   errores: elegir una actividad muy por encima de sus aptitudes, y elegirla muy
   por debajo, que tampoco describe la sesion que ocurrio.

   Se cruzan DOS fuentes independientes, y ninguna es una inferencia mia:
     A — el reducido, en prosa (pools.background).
     B — las etiquetas que el sistema YA tiene: los nombres de los replacements,
         las actividades documentadas para cada uno y las que autoriza la
         agencia. No es prosa; es la lista cerrada del plan, y dice el nivel del
         cliente sin que nadie tenga que describirlo.

   Cuatro resultados, y el valor esta en los dos ultimos:
     clear     — las dos fuentes hablan y coinciden.
     declared  — solo habla el reducido. Sigue mandando: es el plan, no una
                 deduccion.
     labels    — solo hablan las etiquetas. Idem.
     conflict  — las dos hablan y se contradicen. Eso es un defecto del reducido
                 o de la lista de actividades: no se usa ninguna como
                 restriccion, se avisa en el panel y se pasa al modo prudente.
     unclear   — no habla ninguna. Modo prudente.

   MODO PRUDENTE: no se adivina el nivel. Se ancla a las actividades que el
   propio plan de este cliente ya documenta, que es la calibracion mas segura
   disponible y no exige ninguna suposicion sobre su condicion. */

/* Modalidad ALTERNATIVA leida en las etiquetas del sistema. */
var LVL_ALT_RE = /(\bPECS\b|picture\s+exchange|\bAAC\b|augmentative|speech[-\s]generating|communication\s+(?:board|book|device|binder)|picture\s+card|visual\s+card|break\s+card|help\s+card|choice\s+board|icon\s+exchange|\bsign(?:s|ing|\s+language)\b|gestural|point(?:s|ing)?\s+to)/i;

/* Repertorio VOCAL leido en las etiquetas del sistema. Deliberadamente NO
   incluye "ask" ni "request": pedir se hace igual con PECS, y tomarlo por habla
   convertiria a casi todos los clientes en vocales. */
var LVL_VOC_RE = /(full\s+sentence|complete\s+sentence|verbal(?:ly)?\b|vocal(?:ly)?\b|\bsays?\b|\btells?\b|conversation|talk\s+about|wait\s+to\s+speak|opinion|recite|\bsing(?:ing|\s+along)?\b|social\s+scripts?)/i;

/* Junta el texto de las etiquetas del sistema para este cliente. */
function _clientLabelText(pools){
  var out = [];
  (typeof normalizeBehaviorArr === 'function' ? normalizeBehaviorArr((pools && pools.rep) || []) : []).forEach(function(b){
    if(!b) return;
    if(b.name) out.push(String(b.name));
    if(b.act)  out.push(String(b.act));
  });
  var pa = (pools && pools.progActs) || {};
  Object.keys(pa).forEach(function(k){
    out.push(String(k));
    var v = pa[k];
    if(v && v.acts) out.push([].concat(v.acts).join(' ; '));
  });
  return out.join(' ; ');
}

/* Las actividades que el propio plan documenta, sin repetir. Son el ancla del
   modo prudente: el nivel del cliente medido en su propio plan. */
function _clientAnchorActs(pools){
  var out = [], seen = {};
  var push = function(s){
    String(s || '').split(/;|\n/).forEach(function(x){
      var t = x.replace(/\s+/g,' ').trim();
      if(t.length < 4 || t.length > 120) return;
      var k = t.toLowerCase();
      if(seen[k]) return;
      seen[k] = 1; out.push(t);
    });
  };
  (typeof normalizeBehaviorArr === 'function' ? normalizeBehaviorArr((pools && pools.rep) || []) : []).forEach(function(b){ if(b && b.act) push(b.act); });
  var pa = (pools && pools.progActs) || {};
  Object.keys(pa).forEach(function(k){ var v = pa[k]; if(v && v.acts) [].concat(v.acts).forEach(push); });
  return out.slice(0, 10);
}

function _clientLevelCheck(pools){
  var bg  = String((pools && pools.background) || '');
  var lbl = _clientLabelText(pools);

  // Fuente A. Una declaracion de modalidad alternativa pesa mas que una mencion
  // de habla en la misma prosa: el reducido de un cliente con PECS habla de voz
  // constantemente, porque la voz es la META.
  var aAlt = CAP_NONVOCAL_RE.test(bg);
  var a = aAlt ? 'alternative' : (LVL_VOC_RE.test(bg) ? 'vocal' : '');

  // Fuente B. Las dos senales a la vez no son contradiccion: un cliente puede
  // tener mandas con PECS y objetivos vocales. Eso no confirma ni desmiente — no
  // es senal.
  var bAlt = LVL_ALT_RE.test(lbl), bVoc = LVL_VOC_RE.test(lbl);
  var b = (bAlt && bVoc) ? '' : (bAlt ? 'alternative' : (bVoc ? 'vocal' : ''));

  var verdict, modality;
  if(a && b){ if(a === b){ verdict = 'clear'; modality = a; } else { verdict = 'conflict'; modality = ''; } }
  else if(a){ verdict = 'declared'; modality = a; }
  else if(b){ verdict = 'labels';   modality = b; }
  else      { verdict = 'unclear';  modality = ''; }

  return {
    verdict: verdict,
    modality: modality,
    cautious: (verdict === 'conflict' || verdict === 'unclear'),
    fromAssessment: a,
    fromLabels: b,
    declared: _clientCapLines(pools),
    anchor: _clientAnchorActs(pools)
  };
}

/* ── ACTIVIDADES CON CARGA DE GENERO ───────────────────────────────────────
   Reportado por las analistas: aparecian autos de juguete en las notas de
   ninas. El sistema no sabe el sexo del cliente, no lo tiene en la ficha y no
   debe deducirlo — pero tampoco lo necesita, porque la respuesta clinicamente
   correcta no es repartir actividades por sexo.

   En ABA la actividad y el reforzador se eligen por PREFERENCIA EVALUADA, no
   por categoria demografica. Poner munecas a las ninas es el mismo defecto que
   poner autos: sigue siendo elegir por estereotipo en vez de por el cliente.

   Asi que el criterio es: si el reducido documenta la preferencia, esa manda y
   la actividad deja de estar marcada — el respaldo la libera. Si el reducido no
   dice nada, se elige una actividad neutra, que es lo que el sistema hacia mal:
   ante el silencio caia en el estereotipo por defecto.

   Cinco de las 163 del catalogo real arrastran estereotipo. Puppets, slime,
   cuentas, castillos de arena y voleibol con globo quedan fuera a proposito:
   no estan marcados, y marcarlos de mas quitaria actividades validas. */
var ACT_GENDERED_RE = /(\btoy cars?\b|cars?\s+and\s+tracks|action\s+figures?|\bdolls?\b|\bdress[-\s]?up\b|friendship\s+bracelets?|\btea\s+party\b|kitchen\s+sets?|\bprincess\b|\bsuperhero(?:es)?\b|\bmakeup\b|\btiaras?\b|\bwrestl\w*)/i;

/* Las preferencias que el reducido documenta. Son la unica fuente legitima para
   elegir una actividad marcada: si el plan dice que a este cliente le gustan los
   autos, los autos son correctos, tenga el sexo que tenga. */
var PREF_DECL_RE = /(prefer(?:s|red|ence)?|high[-\s]interest|highly\s+motivating|enjoys?|likes?|favou?rite|motivated\s+by|reinforc(?:er|ing)\s+items?|interested\s+in)/i;

/* Introduce la lista: "Preferred activities include", "The client enjoys"… Se
   corta para quedarse con los OBJETOS, que es lo que hay que clasificar. */
var PREF_LEAD_RE = /^.*?(?:prefer(?:s|red|ence[sd]?)?(?:\s+(?:activities|items?|toys?|reinforcers?))?|high[-\s]interest(?:\s+\w+)?|highly\s+motivating(?:\s+\w+)?|enjoys?|likes?|favou?rites?|motivated\s+by|reinforc(?:er|ing)\s+items?|interested\s+in)\s*(?:are|is|include[sd]?|:)?\s*/i;

/* Las preferencias documentadas, DESGLOSADAS EN OBJETOS y no en frases.
   Una frase puede mezclar objetos de entornos distintos —"toy cars, bubbles,
   and building a fort with pillows in the bedroom"— y clasificarla entera
   mandaba los autos al saco de "no disponible en la escuela" por culpa del
   fort. Partida en objetos, cada uno se clasifica solo. */
function _clientPrefLines(pools){
  var bg = String((pools && pools.background) || '').trim();
  var rf = String((pools && pools.reinforcers) || '').trim();
  var out = [], seen = {};
  var push = function(t){
    t = String(t || '').replace(/\s+/g,' ').replace(/^(?:and|or|,)\s+/i,'').replace(/[.,;]+$/,'').trim();
    if(t.length < 3 || t.length > 120) return;
    var k = t.toLowerCase();
    if(seen[k]) return;
    seen[k] = 1; out.push(t);
  };
  // Del background: solo las frases que declaran preferencia, y de cada una solo
  // la parte que enumera, partida por comas y por "and"/"or".
  String(bg).split(/[.;\n]+/).forEach(function(s){
    var t = s.replace(/\s+/g,' ').trim();
    if(t.length < 6 || t.length > 240) return;
    if(!PREF_DECL_RE.test(t)) return;
    var items = t.replace(PREF_LEAD_RE, '');
    if(!items || items.length === t.length){ push(t); return; }   // no era una lista: entra la frase
    items.split(/\s*,\s*|\s+and\s+|\s+or\s+/i).forEach(push);
  });
  // Los reforzadores configurados ya son una lista: entran directos.
  if(rf) rf.split(/[,;\n]+/).forEach(push);
  return out.slice(0, 10);
}

/* Una actividad marcada esta RESPALDADA si la preferencia documentada la nombra.
   Se compara por palabras de contenido de la propia actividad, no por la frase
   entera: "Preferred activities include toy cars and bubbles" respalda "Play
   with toy cars and tracks". */
function _prefBacksActivity(name, prefLines){
  var t = String(name || '').toLowerCase();
  var m = t.match(ACT_GENDERED_RE);
  if(!m) return true;
  var token = String(m[0]).toLowerCase().replace(/s$/,'');
  if(token.length < 3) return false;
  return (prefLines || []).some(function(l){
    return String(l).toLowerCase().indexOf(token) !== -1;
  });
}

/* Devuelve las frases del reducido que declaran una restriccion, tal cual las
   escribio el analista. Se devuelve el texto original y no una etiqueta mia:
   el modelo tiene que leer el reducido, no mi interpretacion del reducido. */
function _clientCapLines(pools){
  var bg = String((pools && pools.background) || '').trim();
  if(!bg) return [];
  var out = [], seen = {};
  bg.split(/[.;\n]+/).forEach(function(s){
    var t = s.replace(/\s+/g,' ').trim();
    if(t.length < 12 || t.length > 240) return;
    // Se prueba sobre la frase SIN sus fragmentos negados: asi una frase que solo
    // dice "no hay barreras" cae, y una que declara una restriccion real y de paso
    // niega otra se conserva entera.
    if(!CAP_DECL_RE.test(t.replace(CAP_NEG_RE, ' '))) return;
    var k = t.toLowerCase();
    if(seen[k]) return;
    seen[k] = 1; out.push(t);
  });
  return out.slice(0, 6);
}

/* Marca en el catalogo cerrado lo que exige habla vocal cuando el doble chequeo
   concluye que este cliente usa otra modalidad. NUNCA quita nada: devuelve la
   misma lista, con la exigencia visible al lado.
   En conflicto no se marca: la marca afirmaria como cierto lo que justamente
   esta en disputa. Ese caso lo resuelve la regla de prosa, en modo prudente. */
function _annotateActsForClient(list, pools){
  var arr = (list || []).slice();
  var chk = _clientLevelCheck(pools);
  var prefs = _clientPrefLines(pools);
  var flagged = [], gendered = [];
  var out = arr.map(function(a){
    var s = String(a || ''), note = '';
    if(chk.modality === 'alternative' && ACT_VOCAL_RE.test(s)){
      flagged.push(a);
      note += '   [REQUIRES VOCAL SPEECH — this client’s documentation shows a different communication modality; use it only if the response can be emitted in THAT modality]';
    }
    /* La marca de genero desaparece en cuanto la preferencia documentada la
       respalda: el respaldo la libera, y eso es lo que evita el error simetrico
       de retirar una actividad que a este cliente si le gusta. */
    if(ACT_GENDERED_RE.test(s) && !_prefBacksActivity(s, prefs)){
      gendered.push(a);
      note += '   [STEREOTYPED ACTIVITY, NOT BACKED BY THIS CLIENT’S DOCUMENTED PREFERENCES — do not select it by default; choose one the documented preferences support, or a neutral one]';
    }
    return note ? s + note : a;
  });
  return { list: out, flagged: flagged, gendered: gendered, check: chk, prefs: prefs };
}

/* Separa las preferencias documentadas por si el objeto existe donde ocurrio la
   sesion. Un objeto preferido que solo hay en casa no sirve en la escuela, y era
   la mitad que faltaba: la preferencia sola no basta, tiene que estar
   DISPONIBLE aqui. Reutiliza el mismo clasificador de entorno que las
   actividades — no hay dos criterios de lugar en el sistema, hay uno. */
function _prefsByPlace(prefLines, place){
  var kind = (typeof _placeKind === 'function') ? _placeKind(place) : 'unknown';
  var here = [], elsewhere = [];
  (prefLines || []).forEach(function(l){
    var st = _activitySetting(l);
    if((kind === 'home' || kind === 'school') && st !== 'any' && st !== kind) elsewhere.push(l);
    else here.push(l);
  });
  return { here: here, elsewhere: elsewhere };
}

/* La regla de prosa. Es la palanca principal, igual que con el entorno: el
   catalogo cerrado solo alcanza a la seccion de AbaMatrix, y la mayoria de las
   actividades de una nota vienen del texto libre del reducido o las compone el
   modelo. */
function _activityFitsClientRule(pools, place){
  var chk = _clientLevelCheck(pools);
  var out = 'ACTIVITIES MUST FIT THIS CLIENT (MANDATORY): an activity that fits the setting can still be one this client cannot perform. Every activity, material and task named in this note has to be one this client could actually carry out with the repertoire and the communication modality this client’s documentation shows.\n'
    + '- THE REDUCED ASSESSMENT IS THE ONLY AUTHORITY on what this client can and cannot yet do. Never infer a limitation from a diagnosis, from an age, or from a general assumption about the population: if the documentation does not state it, it is not a limitation for this note. And never contradict what it does state.\n'
    + '- WHEN A PROGRAM’S USUAL ACTIVITY DEMANDS A REPERTOIRE THIS CLIENT DOES NOT YET HAVE, do not drop the program and do not document the client performing it. Document the SAME target taught through a vehicle the client’s documented modality supports — a mand taught through the picture-exchange or device the documentation names rather than through speech, a matching target run with objects rather than with printed words, a motor task at the level of assistance documented.\n'
    + '- AN ACQUISITION PROGRAM IS ALLOWED TO TARGET A SKILL THE CLIENT DOES NOT YET HAVE — that is what teaching is. The error is documenting the client ALREADY DOING, unaided, something the documentation says is not in their repertoire. Teaching it with the documented prompt level is correct; asserting it as an independent performance is not.\n'
    + '- NEVER WRITE ABOUT WHAT THE CLIENT CANNOT DO. This rule governs which activity gets selected, never the wording of the note. Do not write deficits, inabilities, levels of functioning, or any characterisation of the client. Document the activity that was run and the observable response.\n'
    + '- THE ACTIVITY COMES FROM THIS CLIENT’S DOCUMENTED PREFERENCES, NEVER FROM A DEMOGRAPHIC ASSUMPTION. In this discipline the activity and the reinforcer are selected by assessed preference, not by category. Do not select a stereotyped activity — toy cars, tracks, action figures, dolls, dress-up, kitchen sets, friendship bracelets, tea parties — unless this client’s documented preferences or reinforcers actually name it. Assigning dolls because the client is a girl is the same error as assigning toy cars: both select by stereotype instead of by the client. When the documentation names a preference, use it. When it names none, choose an activity that presupposes no such category at all.\n';

  /* En conflicto se retiran del bloque SOLO las frases que hablan de modalidad,
     que son las que estan en disputa. Las demas — motricidad, atencion, lo que
     sea — no lo estan y siguen mandando. Entregar la frase en disputa como
     "restriccion" y decir tres lineas mas abajo que no se use es contradecirse
     dentro del mismo prompt. */
  var _decl = chk.verdict === 'conflict'
    ? chk.declared.filter(function(l){ return !CAP_NONVOCAL_RE.test(l) && !LVL_VOC_RE.test(l); })
    : chk.declared;
  if(_decl.length){
    out += '- WHAT THIS CLIENT’S REDUCED ASSESSMENT STATES (verbatim; treat it as the constraint on activity selection, and do not reproduce these sentences in the note):\n'
        + _decl.map(function(l){ return '    • ' + l; }).join('\n') + '\n';
  }

  /* Las preferencias documentadas. Son lo que sustituye al estereotipo: sin
     ellas la regla solo prohibe, y prohibir sin dar de donde elegir es
     exactamente lo que empuja al modelo al defecto de siempre. */
  var _prefs = _clientPrefLines(pools);
  var _split = _prefsByPlace(_prefs, place);
  if(_prefs.length){
    out += '- THIS CLIENT’S DOCUMENTED PREFERENCES AND REINFORCERS — the activity is built around one of these:\n'
        + _split.here.map(function(l){ return '    • ' + l; }).join('\n') + '\n';
    if(_split.elsewhere.length){
      out += '  NOT AVAILABLE AT THIS PLACE OF SERVICE — documented for this client but tied to another setting, so it cannot be the object used in this session:\n'
          + _split.elsewhere.map(function(l){ return '    • ' + l; }).join('\n') + '\n';
    }
  } else {
    out += '- THIS CLIENT’S DOCUMENTATION RECORDS NO PREFERENCES. Then choose the activity from the programs and materials the plan already names, and keep it neutral: no toys or themes that carry a gender assumption. Do not fill the gap with a default.\n';
  }

  /* Lo que el analista hacia a mano y el sistema no sabia hacer: el objeto
     preferido, pero el que cabe AQUI y en el papel que le toca en ESTE momento
     de la sesion. La preferencia sola produce el mismo juguete usado igual de
     principio a fin, que no es como se corre una sesion. */
  out += '- CHOOSE THE PREFERRED OBJECT THAT FITS THIS PLACE AND THIS MOMENT. A documented preference is not a single fixed prop for the whole note. The same preferred item plays different parts at different points of a session: delivered without demands during pairing at the start, used as the vehicle the program is taught through while trials are running, delivered after the response when it is the programmed reinforcer, and used at a transition or at the close. Document the part it actually played at the point of the session where it appears, and do not write the same object doing the same thing from beginning to end.\n'
    + '- THE OBJECT MUST BE ONE THAT EXISTS WHERE THE SESSION HAPPENED. A preferred item that belongs to another setting is not the object of this session; pick another documented preference that is available here, or teach the program through the materials the setting itself provides.\n'
    + '- THIS DOES NOT OVERRIDE THE FUNCTION-MATCHED REINFORCEMENT RULE ABOVE. A preferred toy or object may be the vehicle of the activity in any session, but it is delivered AS THE REINFORCER only when the behavior’s documented function admits it. Attention-maintained and escape-maintained behavior are never reinforced with a tangible or an edible, however preferred the item is.\n';

  /* El ancla. En conflicto sirve para el NIVEL DE EXIGENCIA pero no para la
     modalidad: parte de esta misma lista es lo que contradice al reducido, asi
     que tomarla como modelo de modalidad seria elegir un bando. */
  if(chk.anchor.length){
    out += (chk.verdict === 'conflict'
      ? '- THE ACTIVITIES THIS CLIENT’S OWN PLAN DOCUMENTS. Read them for the LEVEL OF DEMAND this client works at, and for nothing else: part of this same list is what disagrees with the assessment, so it does not establish which communication modality to use:\n'
      : '- THE ACTIVITIES THIS CLIENT’S OWN PLAN ALREADY DOCUMENTS — use them as the CALIBRATION of what this client works at. An activity of roughly this demand is safe; one clearly beyond it, or clearly more basic than it, is not:\n')
        + chk.anchor.map(function(l){ return '    • ' + l; }).join('\n') + '\n';
  }

  if(chk.verdict === 'conflict'){
    out += '- THE TWO SOURCES OF INFORMATION ABOUT THIS CLIENT DISAGREE ON THE COMMUNICATION MODALITY: the written assessment points to one and the client’s documented programs and activities point to the other. NEITHER is used as a constraint here and you must not resolve the disagreement yourself — picking a side is what produces the wrong note.\n'
        + '- SELECT THE ACTIVITY THAT WORKS EITHER WAY. Do not choose one whose core IS the contested modality — not an activity built on speaking (conversation, asking questions, telling, an opinion, reciting), and not one built on exchanging a picture, card or device. Choose a vehicle whose target can be emitted in either modality, and describe the response by what was observed, without naming the modality at all.\n';
  }

  if(chk.cautious){
    out += '- THE DOCUMENTATION DOES NOT ESTABLISH THIS CLIENT’S LEVEL, so do not guess it — in EITHER direction. Do not select an activity that presupposes a repertoire nothing in this client’s documentation shows (extended conversation, reading or writing connected text, independent multi-step work, group games with rules). And do not select one clearly below the level of the programs this client is actually running: an activity more basic than the documented ones is as wrong as one above them, and it describes a session that did not happen.\n'
        + (chk.verdict === 'conflict'
            ? '- IN THIS SITUATION THE SAFE CHOICE IS THE PLAINEST ONE: the vehicle that carries the target and presupposes nothing — the materials and the routine themselves, at the prompt level the plan documents. Never fill the gap with an assumption about the client.\n'
            : '- IN THIS SITUATION THE SAFE CHOICE IS THE DOCUMENTED ONE. Prefer an activity the plan already names for this program' + (chk.anchor.length ? ' — the list above' : '') + '. If none fits the session, choose the plainest vehicle that carries the target and presupposes nothing: the materials and the routine themselves, at the prompt level the plan documents. Never fill the gap with an assumption about the client.\n');
  }

  return out;
}
