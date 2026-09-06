// Every per-client key the app writes. Deleting a client used to remove three of
// them and deleting a therapist another three, so the assessment, the notes, the
// history, the AbaMatrix configuration and every rotation history of a removed
// client stayed behind for ever - locally and, for the synced ones, in Supabase.
var ABA_CLIENT_KEY_PREFIXES = [
  'aba5_sum_','aba5_pools_','aba5_hist_','aba5_notes_','aba5_summary_',
  'aba5_assess_','aba5_assessx_','aba5_assessdate_','aba5_plan_','aba5_monthdata_',
  'aba5_notecnt_','aba5_opening_','aba5_closing_','aba5_bcabasup_',
  'aba5_abaevid_','aba5_abaroster_','aba5_abalocs_','aba5_abanext_',
  'aba5_abapart_','aba5_abapresent_','aba5_abaprompt_',
  'aba5_ababrhist_','aba5_abarephist_','aba5_abafnhist_','aba5_abagihist_',
  'aba5_abaschedhist_','aba5_abaactive_','aba5_abapickgoals_'
];

/* ── ABAMATRIX — UPON ARRIVAL (RBT 97153) ────────────────────────────────────
   Fills the AbaMatrix "Upon Arrival" template for a client, then Rolando copies
   the labelled output into AbaMatrix. Anti-invention lock: fields the SYSTEM
   fills are chosen ONLY from the closed lists below; if nothing fits, the field
   is left blank and flagged — the system never invents a value.
   Who fills what:
     • Start/End location — Rolando picks (as in every note).
     • Who was present — the client's own list (label "Caregiver(s):"), provided per client.
     • Parent/guardian present — DERIVED from the Start location (Home → Yes; else No + reason).
     • Field 1 (environment changes) — Rolando picks.
     • Field 2 (manipulations) — system PROPOSES from the 10 closed options, in
       correspondence with field 1 (so it waits until field 1 is set).
     • Field 5 (start prompt) — system SELECTS from the closed list using the reduced profile. */

const ABA_LOC = ['Home','School','Daycare','Center','Summer camp','Aftercare','Community'];
const ABA_LOC_REASON = {
  'School':'The services were provided at a school setting',
  'Daycare':'The services were provided at the Daycare',
  'Center':'The services were provided at the center',
  'Summer camp':'The services were provided at the summer camp setting',
  'Aftercare':'The services were provided in the aftercare',
  'Community':'The services were provided in the community'
};
// Manual-only reason (Home but caregiver absent) — Rolando selects this one himself.
const ABA_REASON_CAREGIVER_UNAVAILABLE = 'The caregiver was unavailable at the time of visit, other family member was present';

const ABA_ENV_CHANGES = `Change in Caregiver
Change in Therapist
Changes in Daily Routine
Changes in School Schedule
Client Attending a Special Event
Client Attending a Summer Camp
Client Engaging in New Recreational Activities
Client Experiencing Changes in Dietary Preferences
Client Experiencing Changes in Sleep Schedule
Client Experiencing Grief or Loss
Client Experiencing Medication Changes
Client Experiencing Sensory Overload
Client Experiencing Technological Changes (e.g., New Devices)
Client Facing Academic Challenges
Client Facing Bullying at School
Client Having Sleep Difficulties
Client Participating in Group Therapy
Client Participating in New Extracurricular Activities
Client Participating in a New Social Group
Client Showing Increased Independence
Client Starting a New School
Client Transitioning to a New Grade
Client has Moved to a New Home
Client is Sick
Client with a Broken Limb
Client’s Family Moving to a New City
Construction Noise Nearby
Family Vacation
Holiday Season
New Dietary Restrictions
New Pet in the Home
New Sibling in the Family
Parents Getting Divorced
Seasonal Allergies Affecting the Client
Significant Change in Family Routine
Weather Changes (e.g., Extreme Heat or Cold)`.split('\n').map(function(x){return x.trim();}).filter(Boolean);

const ABA_MANIPULATIONS = `Adjusted task/demands difficulty
Offered extra processing time
Provided clear session expectations
Provided clear, consistent rules
Provided visual supports
Reduced or simplified Instructions
Used additional prompting
Work around Reinforcement frequency and schedules
Worked around modeling techniques
Worked on functional or socially appropriate alternatives`.split('\n').map(function(x){return x.trim();}).filter(Boolean);

const ABA_START_PROMPTS = `Asked about something new the child learned this week
Asked about the child’s favorite holiday and why they like it
Asked about the child’s favorite snack
Asked about the most fun thing the child did today
Asked the child about their favorite superhero
Asked the child to describe their best friend
Asked the child to share the funniest thing that happened this week
Asked the child to show their favorite toy
Asked the child to tell about their pets
Asked what the child had for lunch today
Asked what the child’s favorite thing to do after school is
Asked why the child likes their favorite color
Discussed the best part of the child’s day
Discussed the child’s favorite game to play
Discussed the child’s favorite place to visit
Discussed the child’s favorite story or book
Discussed the child’s favorite subject in school
Discussed what the child likes to draw or paint
Discussed why the child likes their favorite cartoon or TV show
Found out about any adventures the child went on this week
Found out about any special talent or skill the child has
Found out about the coolest thing the child has built
Found out what games the child played today
Found out what the child wants to be when they grow up
Gestured or Signed “Go” in front of the child to cue the beginning of the task
Held Up a “Start” Card or relevant visual cue
Modeled the First Step (e.g., pointing to or manipulating an object) for the child to imitate
Placed Materials Directly in Front of the child to signal that it’s time to start
Pointed to the Visual Schedule and guided them to the first activity
Showed a Picture Icon representing the task (e.g., a puzzle icon for puzzle work)
Talked about any cool books the child has read lately
Talked about any good movies the child has seen recently
Talked about the child’s favorite animal
Talked about the child’s favorite song
Talked about the child’s favorite sport
Talked about the child’s favorite thing to do outside
Touched or Tapped the Child’s Shoulder to gain attention
Used Partial Physical Prompt (light hand-over-hand) to begin the initial movement.`.split('\n').map(function(x){return x.trim();}).filter(Boolean);

// Universal ABA reinforcers. Used by default when neither the reduced assessment
// nor the client's record specifies any: the note must never be left without
// reinforcers just because the analyst omitted them from the assessment.
const ABA_DEFAULT_REINFORCERS = ['verbal praise', 'social praise'];

// DISTINCT forms of social reinforcement. "Verbal praise" and "social praise" are the
// same type worded twice, which is precisely what agencies asking for several DISTINCT
// social reinforcers reject. These are delivery forms of social reinforcement that any
// RBT uses and that these agencies name themselves in their requirements — naming one
// is describing how the praise was delivered, not inventing an item the client lacks.
const ABA_SOCIAL_REINFORCER_TYPES = [
  'specific verbal recognition', 'a high five', 'a thumbs up', 'applause', 'a smile', 'brief social interaction'
];

const ABA_NEXT_VISIT = [
  'The RBT will formally report any obstacles to the lead analyst and continue implementing the prescribed intervention strategies',
  'The RBT will communicate any identified barriers to the BCBA and maintain adherence to the established behavior intervention plan',
  'The RBT will notify the lead analyst of any treatment challenge'
];

const ABA_GI_GOALS = ['Accept an alternative item or activity','Accept "No" as response.','Appropriate Manipulation of Toys and Materials','Appropriate activities alternative','Appropriate when near peers/siblings (ABLLS L-1)','Complete 10 consecutive, brief, previously acquired task','Compliance training','Differentiate appropriate and inappropriate social interaction with unfamiliar people','Explore toys in the environment (ABLLS K-1)','Focus on Task for Increasing Period','Follow instructions in routine situations','Follows Corrective Instructions Within 3 Seconds','Identifying signs and symbols to indicates danger','Make transitions from preferred items and activities to required tasks.','Moves from one location to another when directed to do so, while remaining next to an instructor, care provider, or parent, or while remaining in line','Playing skills (Sharing/taking turns).','Request Breaks','Request Help','Request attention. (ABLLS F-14)','Request for tangible /activities','Safety skills (Respond to stop)','Stay on task','Wait without touching stimuli (ABLLS A-8)','Waits appropriately if reinforces delivery is delayed (ABLLS A-17)'];
// AbaMatrix ships these activities, but these ones use terminology Rolando prohibits
// in clinical notes (sensory / conflict resolution). The system must never pick them.
const ABA_GI_BANNED = ['Build a sensory bin','Create sensory bags','Engage in sensory play with rice or sand','Play with tactile sensory balls','Engage in sandpaper art','Role-play conflict resolution scenarios'];
const ABA_GI_ACTIVITIES = ['Puzzle Completion','"Raise Your Hand" Role-Play activity','Accept alternative role play activity','Accepting task modification, Choice of task role play','Ask when available role play activity','Attention signal card activity','Baking or Pretend Cooking Task','Bin Search Game','Boundary Role-Play With Puppets or Peers','Break card practice','Break return practice role play activity','Build a fort with pillows and blankets','Build a sensory bin','Build with LEGO sets','Build with blocks','Can I play or join? Practice activity','Choice substitution role play activity','Chore Chart routine activity','Clean-Up Races or Sorting Challenges','Coloring or Paint-by-Number Art Project','Create DIY crafts','Create a family tree project','Create a photo album','Create a scrapbook','Create a vision board','Create a weather chart','Create and solve mazes','Create clay sculptures','Create finger puppets','Create musical instruments from household items','Create paper mache projects','Create sensory bags','Create sticker scenes','Create storyboards','Difficult task rehearsal activity','Discriminate Private vs. Public Body Parts Game','Do balloon volleyball','Do bubble wrap popping','Do color-by-number activities','Do finger painting','Do foam painting','Do gardening activities','Do guided drawing activities','Do interactive puzzles on tablets','Do lacing activities with beads','Do leaf rubbings','Do number and letter hunts','Do obstacle courses','Do origami','Do rhythmic clapping games','Do scavenger hunts with themes','Do stepping stone games','Draw or color in coloring books','Engage in flashcard activities','Engage in freeze dance','Engage in hula hoop games','Engage in mirror play for facial recognition','Engage in nature walks','Engage in parachute games','Engage in pretend play with dolls or action figures','Engage in puppet shows','Engage in role-play with kitchen sets','Engage in sandpaper art','Engage in sensory play with rice or sand','Engage in shadow play','Engage in water play with safe toys','Feedback Role-Play With Social Scripts','First/Then transition chart game','Follow a step-by-step recipe','Greeting practice activity','Help card practice','LEGO or Block Tower Challenge','Learn to tie shoelaces','Make collages with magazine cutouts','Make friendship bracelets','Make homemade slime','Make paper airplanes and fly them','Make sandcastles with kinetic sand','Memory Card Matching Game','Musical Freeze Game','Not Now, Choose Two role play','Obstacle Course or Movement Game','Organize scavenger hunts','Participate in egg-and-spoon races','Participate in singing activities','Participate in treasure hunts','Peer "Coach" Turn-Taking Game','Personal Space Bubble Game','Plant a small garden','Play \'Duck, Duck, Goose\'','Play \'Hot Potato\'','Play \'I Spy\' games','Play \'Mother May I?\'','Play \'Red Light, Green Light\'','Play \'Simon Says\'','Play catch with soft balls','Play dress-up','Play interactive whiteboard games','Play matching games','Play musical chairs','Play tic-tac-toe','Play tug-of-war with a soft rope','Play turn-taking games','Play with fidget toys','Play with interactive story apps','Play with tactile sensory balls','Play with toy cars and tracks','Play with wind-up toys','Playdough Creation','Practice handwashing routines','Practice sign language','Practicing walking in open areas or hallways to follow stop/go demands','Raise-hand game','Read interactive books','Red/green attention card activity','Respect space role-play activity','Role-play conflict resolution scenarios','Sing along to educational songs','Snack Request and Preparation Activity','Solve puzzles using a timer','Sticker or Token Store','Story Time with Role Play or Comprehension Prompts','Stranger/Danger Role-Play game','Tap-and-wait routine activity','Timer extension practice activity','Timer to trade-in activity and transition','Toilet task list completion','Token Now, Reward Later activity','Toy Store Pretend Play with Visual Menu','Transition with timer routine','Unavailable item practice','Use PECS (Picture Exchange Communication System)','Use playdough to create shapes and letters','Visual Discrimination Games (Tacting Safe vs. Unsafe)','Wait-and-Earn Game','Work-break-work routine activity','"Can I have it after?" practice activity','"Choice Board Communication Practice" Request/manding activity','"Choice With Denial" Activity','"Clean Up and Move" Transition Drill','"Clean-Up Game"','"Distraction and Back" Game','"First/Then With Denial" Game','"First/Then" Task with Non-Preferred and Preferred Activities','"Handwashing Song" Routine','"Hygiene Activity Token Challenge"','"I don\'t understand" practice','"Is It Okay to Touch?" Sorting Game','"Mand Mix-Up" Game','"Mirror Me" Perform actions game','"No for Now" Card Practice','"Opinion Jar" Social activity game','"Play Shift" Social activity','"Red/Green Talk Signal" wait to speak game','"Say NO and Go!" Practice Drills (Safety Skill to recognize stranger/danger)','"Talk About This" Social Prompt Game','"Time\'s Up" With Visual Timer','"Try Again" Game','"Visual Countdown Wait"','"Wait for the item" Drill','"Work-Pause-Return" Routine activity','"Would You Rather?" Asking questions game','"Yes/No" questions to Safety Sorting Activity'].filter(function(a){ return ABA_GI_BANNED.indexOf(a) === -1; });
const ABA_GI_REINF = ['candy','chips','chocolate','cookies','father','good boy','good job','good work','high five','ice cream','mother','park','tablet'];

const ABA_BR_BEHAVIORS = ['Breaking items','Climbing behaviors','Elopement','Hyperactivity','Off-task','Oppositional Defiant behavior','Physical aggression','Stereotype repetitive behavior','Temper tantrums','Tiptoe walking'];
const ABA_BR_FUNCTIONS = ['Attention','Escape','Tangibles'];
const ABA_BR_ANTE_INT = ['Environmental Manipulations','Functional Communication Training'];
const ABA_BR_CONS_INT = ['Differential Reinforcement of Alternate Behaviors (DRA)','Differential Reinforcement of Incompatible Behaviors (DRI)','Differential Reinforcement of Other Behaviors (DRO)','Environmental Manipulations','Functional Communication Training','Redirection','Response Interruption and Redirection (RIRD)'];
const ABA_BR_FOCUS = ['Reduce the frequency','Other'];

/* ═══════════════════════════════════════════════════════════
   HARD CLINICAL RULES — congruencia función↔intervención
   Impide selecciones incongruentes AUNQUE el plan/AbaMatrix las
   ofrezcan. Corrige y deja aviso (no oculta el problema de origen).
   - RIRD: solo si la función es automático/Sensory.
   - Planned Ignoring / Attention Extinction: nunca en conductas
     peligrosas o destructivas.
   - Reduce demand / Divide en pasos / Environmental & Antecedent
     Manipulation / NCR / High-p / Premack / Provide choices: son
     ANTECEDENTE, nunca consecuencia → se reubican.
   Devuelve { cInts, relocate, notices }.
═══════════════════════════════════════════════════════════ */
function _abaFnClass(fn){
  var f = String(fn||'').toLowerCase();
  if(/automatic|sensor/.test(f)) return 'automatic';
  if(/escape|avoid/.test(f))     return 'escape';
  if(/attention/.test(f))        return 'attention';
  if(/tangible/.test(f))         return 'tangible';
  return '';
}
function _abaIsDangerous(beh){
  return /aggress|elopement|eloping|breaking|property\s*destruction|tantrum|self[-\s]?injur|\bsib\b|climb/i.test(String(beh||''));
}
// Intervenciones que son ANTECEDENTE aunque el catálogo las liste como consecuencia.
var ABA_ANTECEDENT_ONLY = [
  /reduce\s*task/i, /divide.*step|divide.*complex|small\s*steps/i,
  /environmental\s*manipulation/i, /antecedent\s*manipulation/i,
  /non[-\s]?contingent|noncontingent|\bncr\b/i,
  /high[-\s]?probability|behavioral\s*momentum/i,
  /premack|if\/?then/i, /provide\s*choices/i, /schedule\s*rewards/i
];
// Preferencia de consecuencia congruente por función (se filtra a lo que la lista permita).
var ABA_CONS_BY_FN = {
  escape:   ['Differential Negative Reinforcement of Alternative behavior (DNRA)','Escape Extinction','Functional Communication Training','Differential Reinforcement of Alternate Behaviors (DRA)','Differential Reinforcement of Other Behaviors (DRO)','Redirection'],
  attention:['Functional Communication Training','Differential Reinforcement of Alternate Behaviors (DRA)','Attention Extinction / Planned Ignoring','Differential Reinforcement of Other Behaviors (DRO)','Redirection'],
  tangible: ['Functional Communication Training','Differential Reinforcement of Alternate Behaviors (DRA)','Token System','Differential Reinforcement of Other Behaviors (DRO)','Redirection'],
  automatic:['Response Interruption and Redirection (RIRD)','Differential Reinforcement of Incompatible Behaviors (DRI)','Differential Reinforcement of Alternate Behaviors (DRA)','Redirection']
};
function _abaEnforceRules(fn, beh, cInts, consAllowed, anteAllowed){
  var cls = _abaFnClass(fn);
  var danger = _abaIsDangerous(beh);
  var notices = [], relocate = [];
  var allowed = (consAllowed||[]).slice();
  var _norm = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
  var anteList = Array.isArray(anteAllowed) ? anteAllowed : null;      // null = destino texto libre (Formato A)
  var inAnte = function(t){ return !anteList || anteList.some(function(a){ return _norm(a) === _norm(t); }); };
  var inCons = function(t){ return !allowed.length || allowed.some(function(a){ return _norm(a) === _norm(t); }); };
  var kept = [];
  (cInts||[]).forEach(function(r){
    var t = String(r.type||'');
    // 1) Antecedente colado como consecuencia → reubicar SOLO si existe en la lista de antecedentes de AbaMatrix
    if(ABA_ANTECEDENT_ONLY.some(function(re){ return re.test(t); })){
      if(inAnte(t)){
        relocate.push(r);
        notices.push('"'+beh+'": "'+t+'" es antecedente → movido a Antecedent Interventions');
      } else {
        notices.push('"'+beh+'": "'+t+'" es antecedente y NO está en la lista de AbaMatrix → retirado (reclasificar/quitar en el plan)');
      }
      return;
    }
    // 2) RIRD fuera de automático → quitar
    if(/response\s*interruption|\brird\b/i.test(t) && cls !== 'automatic'){
      notices.push('"'+beh+'": RIRD retirado (la función es '+(cls||'social')+', no automático)');
      return;
    }
    // 3) Planned Ignoring / Attention Extinction en conducta peligrosa → quitar
    if(/planned\s*ignoring|attention\s*extinction/i.test(t) && danger){
      notices.push('"'+beh+'": Planned Ignoring/Attention Extinction retirado (conducta peligrosa/destructiva)');
      return;
    }
    kept.push(r);
  });
  // 4) Si quedó vacío, sustituir por la opción congruente MÁS FUERTE de la lista permitida (no se inventa)
  if(!kept.length){
    var norm = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
    var pref = (ABA_CONS_BY_FN[cls]||[]).filter(function(o){
      if(danger && /planned\s*ignoring|attention\s*extinction/i.test(o)) return false;
      return true;
    });
    var chosen = null;
    for(var i=0;i<pref.length && !chosen;i++){
      var m = allowed.find(function(a){ return norm(a) === norm(pref[i]); });
      if(m) chosen = m;
    }
    if(chosen){
      kept.push({ type: chosen, description: '' });
      notices.push('"'+beh+'": sin consecuencia válida tras el filtro → asignada "'+chosen+'" (congruente con '+(cls||'la función')+')');
    }
  }
  // 5) GARANTÍA DURA: nada fuera de la lista cerrada de consecuencias de AbaMatrix
  var before = kept.length;
  kept = kept.filter(function(r){ return inCons(r.type); });
  if(kept.length < before){
    notices.push('"'+beh+'": se retiraron consecuencias que no están en la lista cerrada de AbaMatrix');
  }
  return { cInts: kept, relocate: relocate, notices: notices };
}

const ABA_MEDICAL = ['Abdominal pain','Asthma attack','Back pain','Bacterial or viral infection','Broken bone','Burns','Chest pain','Choking','Constipation','Dehydration','Diarrhea','Difficulty breathing','Dizziness or fainting','Earache','Eye infection or irritation','High fever','Ingestion of a harmful substance','Injury with significant bleeding','Joint pain or swelling','Nosebleed','Persistent cough','Seizure','Severe allergic reaction','Severe headache','Severe rash or hives','Severe toothache','Sprains or strains','Swollen glands','Urinary tract infection','Vomiting'];

// Observable, this-session participation statements. RBT SCOPE: they describe only
// the prompting level required and the frequency of maladaptive behavior OBSERVED
// this session - never a trend, progress or capacity judgement ("improvement",
// "demonstrated independence", "no major decrease", "unable") which is analyst content.
const ABA_PARTICIPATION = [
  'The client engaged with skill acquisition targets while requiring moderate prompting, and maladaptive behaviors continued to occur during the session',
  'The client required maximum prompting to complete demands and engaged in maladaptive behaviors at a high frequency',
  'The client required prompting to work on skill acquisition programs and engaged with limited independence, while maladaptive behaviors continued to occur',
  'The client required significant prompting to engage in tasks, with maladaptive behaviors occurring frequently',
  'The client did not engage in tasks despite maximum prompting and engaged in frequent and severe maladaptive behaviors'
];

var _abaClientId = null;
var _abaState = { manipulation: '', startPrompt: '', participation: '', behaviorReduction: '', goalImplementation: '', closing: '' };

function _abaFillSelect(id, items, blankLabel){
  var el = document.getElementById(id);
  if(!el) return;
  var opts = '';
  if(blankLabel) opts += '<option value="">' + blankLabel + '</option>';
  items.forEach(function(it){ opts += '<option value="' + it.replace(/"/g,'&quot;') + '">' + it + '</option>'; });
  el.innerHTML = opts;
}

function _abaGetOtherLocs(clientId){
  var raw = LS.get('aba5_abalocs_' + clientId) || '';
  return raw.split(',').map(function(x){ return x.trim(); }).filter(Boolean);
}

// Grammar for custom (code 99) locations. "at" for named places/campuses,
// "in" for area-like words (community, aftercare, home-like settings).
function _abaCustomReason(loc){
  var l = String(loc||'').toLowerCase();
  var useIn = /(community|aftercare|care|home|neighborhood|area|program)$/.test(l.trim());
  var prep = useIn ? 'in' : 'at';
  return 'The services were provided ' + prep + ' the ' + loc;
}

function _abaSaveOtherLocs(){
  if(!_abaClientId) return;
  var raw = (document.getElementById('abaOtherLocs').value||'').trim();
  LS.set('aba5_abalocs_' + _abaClientId, raw);
  // Rebuild the location dropdowns keeping current picks where possible.
  var st = document.getElementById('abaStartLoc');
  var en = document.getElementById('abaEndLoc');
  var curS = st ? st.value : '', curE = en ? en.value : '';
  var all = ABA_LOC.concat(_abaGetOtherLocs(_abaClientId));
  _abaFillSelect('abaStartLoc', all, null);
  _abaFillSelect('abaEndLoc', all, null);
  if(st && all.indexOf(curS) !== -1) st.value = curS;
  if(en && all.indexOf(curE) !== -1) en.value = curE;
  _abaRenderOtherLocPreview();
  _abaUpdateParentPresent();
}

// Show the exact sentence each custom location will produce, so it can be checked.
function _abaRenderOtherLocPreview(){
  var el = document.getElementById('abaOtherLocPreview');
  if(!el) return;
  var locs = _abaClientId ? _abaGetOtherLocs(_abaClientId) : [];
  if(!locs.length){ el.textContent = ''; return; }
  el.innerHTML = locs.map(function(l){
    return '\u2192 <b>' + esc(l) + '</b> (99): "' + esc(_abaCustomReason(l)) + '"';
  }).join('<br>');
}

function _abaLoadUponArrival(clientId){
  _abaClientId = clientId;
  _abaState = { manipulation: '', startPrompt: '', participation: '' };
  var _allLocs = ABA_LOC.concat(_abaGetOtherLocs(clientId));
  _abaFillSelect('abaStartLoc', _allLocs, null);
  _abaFillSelect('abaEndLoc', _allLocs, null);
  var _ol = document.getElementById('abaOtherLocs'); if(_ol) _ol.value = LS.get('aba5_abalocs_' + clientId) || '';
  _abaRenderOtherLocPreview();
  _abaFillSelect('abaEnvChange', ABA_ENV_CHANGES, null);
  _abaFillSelect('abaMedSel', ABA_MEDICAL.concat(['Other']), '— select —');
  var _ev = document.getElementById('abaEvidRaw'); if(_ev) _ev.value = '';
  _abaRenderEvidInfo();
  _mfcRefreshEditor();
  _abaFillBrBehaviors();
  var _bo = document.getElementById('abaBrOut'); if(_bo) _bo.textContent = '';
  var _cfg = _abaCfg(clientId);
  _abaRenderQuota();
  _abaRenderWantNote();
  if(typeof _abaRenderSetup === 'function') _abaRenderSetup();
  _abaFillSelect('abaGiGoal', (_cfg && _cfg.goals) || [], '— que la IA elija —');
  _abaApplyFormat(_cfg);
  var _go = document.getElementById('abaGiOut'); if(_go) _go.textContent = '';
  var _co = document.getElementById('abaClosOut'); if(_co) _co.textContent = '';
  var _no = document.getElementById('abaNoteOut'); if(_no) _no.value = '';
  _abaCheckReady();
  var iy = document.getElementById('abaIncYesNo'); if(iy) iy.value = 'No';
  var my = document.getElementById('abaMedYesNo'); if(my) my.value = 'No';
  if(typeof _abaOnIncYesNo==='function') _abaOnIncYesNo();
  if(typeof _abaOnMedYesNo==='function') _abaOnMedYesNo();
  var yn = document.getElementById('abaEnvYesNo'); if(yn) yn.value = 'No';
  if(typeof _abaOnEnvYesNo==='function') _abaOnEnvYesNo();
  var rosterRaw = LS.get('aba5_abaroster_' + clientId) || '';
  var rf = document.getElementById('abaRoster'); if(rf) rf.value = rosterRaw;
  _abaRenderPresentBoxes();
  var mp = document.getElementById('abaManipOut'); if(mp) mp.textContent = '';
  var pt = document.getElementById('abaPartOut'); if(pt) pt.textContent = '';
  var sp = document.getElementById('abaPromptOut'); if(sp) sp.textContent = '';
  var ob = document.getElementById('abaOutput'); if(ob) ob.value = '';
  var mm = document.getElementById('abaMsg'); if(mm){ mm.textContent=''; mm.className='msg'; }
  _abaUpdateParentPresent();
}

function _abaUpdateParentPresent(){
  var sel = document.getElementById('abaStartLoc');
  var out = document.getElementById('abaParentOut');
  if(!sel || !out) return;
  var loc = sel.value;
  if(loc === 'Home'){
    out.textContent = 'Yes — parent/guardian present';
  } else {
    var reason = ABA_LOC_REASON[loc] || _abaCustomReason(loc);
    out.textContent = 'No — ' + reason;
  }
}

function _abaSaveRoster(){
  if(!_abaClientId) return;
  var raw = (document.getElementById('abaRoster').value||'').trim();
  LS.set('aba5_abaroster_' + _abaClientId, raw);
  _abaRenderPresentBoxes();
}

function _abaGetRoster(clientId){
  var raw = LS.get('aba5_abaroster_' + clientId) || '';
  return raw.split(',').map(function(x){ return x.trim(); }).filter(Boolean);
}

// "Who was present" is a required multi-select drawn from this client's roster.
function _abaRenderPresentBoxes(){
  var box = document.getElementById('abaPresentBoxes');
  if(!box) return;
  var roster = _abaClientId ? _abaGetRoster(_abaClientId) : [];
  if(!roster.length){
    box.innerHTML = '<span style="color:var(--text3)">Escribe arriba la lista de personas de este cliente (p. ej. Mother) para poder marcarlas.</span>';
    return;
  }
  var saved = (LS.get('aba5_abapresent_' + _abaClientId) || '').split(',').map(function(x){return x.trim();}).filter(Boolean);
  // Default: if nothing saved yet, preselect the first person (field is required).
  if(!saved.length) saved = [roster[0]];
  var html = '';
  roster.forEach(function(person, i){
    var checked = saved.indexOf(person) !== -1 ? ' checked' : '';
    html += '<label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="abaPresentChk" value="' + person.replace(/"/g,'&quot;') + '" onchange="_abaSavePresentSel();_abaCheckReady()"' + checked + '> ' + esc(person) + '</label>';
  });
  box.innerHTML = html;
  _abaSavePresentSel();
  if(typeof _abaCheckReady === 'function') _abaCheckReady();
}

function _abaGetPresentSel(){
  return Array.prototype.slice.call(document.querySelectorAll('.abaPresentChk'))
    .filter(function(c){ return c.checked; })
    .map(function(c){ return c.value; });
}

function _abaSavePresentSel(){
  if(!_abaClientId) return;
  LS.set('aba5_abapresent_' + _abaClientId, _abaGetPresentSel().join(', '));
}

// Ask the model to choose EXACTLY ONE item from a closed list; validate membership.
async function _abaPickFromList(instruction, list){
  if(!_abaClientId) return null;
  var prof = (LS.get('aba5_assess_' + _abaClientId) || '').trim();
  if(!prof) return { error: 'Este cliente no tiene assessment reducido guardado. Guárdalo primero para que el sistema pueda elegir según sus características.' };
  var listText = list.map(function(x, i){ return (i+1) + '. ' + x; }).join('\n');
  var prompt = instruction + '\n\nReturn ONLY the exact text of the single best-fitting option, copied verbatim from the CLOSED LIST. If none genuinely fits this client, return exactly the word NONE. Never invent, modify, combine, or explain.\n\nCLOSED LIST:\n' + listText + '\n\nCLIENT REDUCED PROFILE (source of truth):\n' + prof;
  var raw = (await callAPI(prompt, 'You select exactly one option from a fixed closed list, or NONE. Output only the exact option text (or NONE). Never invent.', null, _abaClientId, 2048, 0) || '').trim();
  if(/^none$/i.test(raw)) return { none: true };
  var norm = function(s){ return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var m = list.find(function(x){ return norm(x) === norm(raw); });
  if(!m) m = list.find(function(x){ return norm(raw).indexOf(norm(x)) === 0 || norm(x).indexOf(norm(raw)) === 0; });
  return m ? { value: m } : { none: true };
}

async function _abaProposeManipulation(){
  var envYes = document.getElementById('abaEnvYesNo') && document.getElementById('abaEnvYesNo').value === 'Yes';
  var envSel = document.getElementById('abaEnvChange');
  var env = envSel ? envSel.value : '';
  if(!envYes || !env){ showMsg('abaMsg','La manipulación solo aplica si el campo 1 es Yes y elegiste el cambio de entorno.','err'); return; }
  var btn = document.getElementById('abaManipBtn'); if(btn) btn.disabled = true;
  var outEl = document.getElementById('abaManipOut'); if(outEl) outEl.textContent = 'Proponiendo…';
  try{
    var res = await _abaPickFromList(
      'A barrier related to this environmental change occurred during the session: "' + env + '". Choose the single manipulation the RBT most likely made in response, appropriate to this client.',
      ABA_MANIPULATIONS);
    if(res && res.error){ _abaState.manipulation=''; if(outEl) outEl.textContent=''; showMsg('abaMsg', res.error, 'err'); return; }
    if(res && res.value){ _abaState.manipulation = res.value; if(outEl) outEl.textContent = res.value; showMsg('abaMsg','Manipulación propuesta (de la lista cerrada). Puedes dejarla o volver a proponer.','ok'); }
    else { _abaState.manipulation=''; if(outEl) outEl.textContent='(ninguna opción de la lista aplica — queda en blanco para que decidas)'; showMsg('abaMsg','El sistema no encontró una manipulación de la lista que aplique; queda en blanco.','err'); }
  } catch(err){ if(outEl) outEl.textContent=''; showMsg('abaMsg','Error al proponer: ' + (err.message||err), 'err'); }
  finally{ if(btn) btn.disabled = false; }
}

async function _abaProposeStartPrompt(){
  if(!_abaClientId) return;
  var btn = document.getElementById('abaPromptBtn'); if(btn) btn.disabled = true;
  var outEl = document.getElementById('abaPromptOut'); if(outEl) outEl.textContent = 'Seleccionando…';
  try{
    // Rotate across notes so the same opening prompt does not repeat.
    var recent = LS.get('aba5_abaprompt_' + _abaClientId) || [];
    if(!Array.isArray(recent)) recent = [];
    var pool = ABA_START_PROMPTS.filter(function(p){ return recent.indexOf(p) === -1; });
    if(!pool.length) pool = ABA_START_PROMPTS.slice();

    var res = await _abaPickFromList(
      'Choose the single start-of-session prompt that best fits this client\u2019s characteristics (age, communication level, interests, and behavioral profile). You MUST choose one - this field is required.',
      pool);

    var chosen = (res && res.value) ? res.value : '';
    // This field is required in AbaMatrix: never leave it blank. If the model
    // returned NONE or an unmatched value, take a plausible option from the list.
    if(!chosen){
      chosen = pool[Math.floor(Math.random() * pool.length)];
    }
    _abaState.startPrompt = chosen;
    if(outEl) outEl.textContent = chosen;
    recent.unshift(chosen);
    LS.set('aba5_abaprompt_' + _abaClientId, recent.slice(0, 5));
  } catch(err){
    // Even on error the field must not be left empty.
    var fb = ABA_START_PROMPTS[Math.floor(Math.random() * ABA_START_PROMPTS.length)];
    _abaState.startPrompt = fb;
    if(outEl) outEl.textContent = fb;
    console.warn('[aba] start prompt fallback:', err && err.message);
  }
  finally{ if(btn) btn.disabled = false; }
}

// ---- AbaMatrix per-client configuration (JSON) ----------------------------
// The JSON carries the full dependency chain for this client:
//   Behavior -> Evidenced By | Behavior -> Function | Function -> Interventions
// plus goals, teaching procedures and reinforcement schedules.
// Stored per client in Supabase (aba_evidenced_by).

// Dangerous behaviors: planned ignoring is NEVER used for these, even though
// AbaMatrix offers it in the intervention lists.
var ABA_DANGEROUS = /aggress|self.?injur|sib\b|elopement|breaking items|property destruction|tantrum|hand biting|biting/i;

// Whether this client's run should also write the prose 97153 note. AbaMatrix
// produces the narrative from the parameters, so the default is NO: skipping it
// removes the heaviest call of the whole run. Stored per client, because the choice
// belongs to the agency's workflow and not to the app.
function _abaWantNote(){
  if(!_abaClientId) return false;
  var pools = LS.get('aba5_pools_' + _abaClientId) || {};
  return !!pools.abaWantNote;
}
function _abaSaveWantNote(){
  if(!_abaClientId) return;
  var el = document.getElementById('abaWantNote');
  var pools = LS.get('aba5_pools_' + _abaClientId) || {};
  if(el && el.checked) pools.abaWantNote = true; else delete pools.abaWantNote;
  LS.set('aba5_pools_' + _abaClientId, pools);
  _abaRenderWantNote();
}
function _abaRenderWantNote(){
  var el = document.getElementById('abaWantNote');
  if(el) el.checked = _abaWantNote();
  var btn = document.getElementById('abaAllBtn');
  if(btn && !btn.disabled) btn.textContent = _abaWantNote() ? 'Generar forma + nota 97153' : 'Generar forma de AbaMatrix';
}

// Why the Behavior Reduction track stopped. Kept out of the DOM because the goal
// track now runs concurrently and its own message would overwrite the reason.
var _abaLastBrReason = '';

function _abaCfg(clientId){
  var c = LS.get('aba5_abaevid_' + clientId);
  return (c && typeof c === 'object') ? c : null;
}

/* ── Constancia de los dos JSON de AbaMatrix ─────────────────────────────────
   Cada cliente de AbaMatrix necesita DOS exports distintos, y hasta ahora no
   quedaba rastro de haberlos subido: el del Daily Log se reconocia por sus
   efectos y el clinico se fundia dentro de pools sin dejar ninguna huella, asi
   que a los pocos dias no habia forma de saber si faltaba uno. El sello se
   guarda dentro de pools, que existe siempre y viaja a Supabase.            */
var ABA_JSON_KINDS = {
  dailylog: 'JSON del Daily Log (campos y catálogos del formulario)',
  clinical: 'JSON clínico (Skills & Behaviors: funciones, topografías, estatus)'
};

function _abaStampImport(clientId, kind, file, detail){
  if(!clientId) return;
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var imp = (pools.imports && typeof pools.imports === 'object') ? pools.imports : {};
  imp[kind] = { at: Date.now(), file: String(file || ''), detail: String(detail || '') };
  pools.imports = imp;
  LS.set('aba5_pools_' + clientId, pools);
}

function _abaImportStamp(clientId, kind){
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var s = (pools.imports || {})[kind];
  return (s && s.at) ? s : null;
}

// Both stamp and evidence: an old client imported before the stamp existed still
// has the data, so fall back to what the import actually leaves behind. That way
// nobody is told to re-upload a JSON that is already in.
function _abaJsonState(clientId){
  var cfg = _abaCfg(clientId);
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var dlStamp = _abaImportStamp(clientId, 'dailylog');
  var clStamp = _abaImportStamp(clientId, 'clinical');
  var dlOk = !!(cfg && (cfg.behaviors || []).length);
  // The clinical export is the only source of per-item status, so a behavior or a
  // replacement carrying "mastered" is proof it was imported at some point.
  var arr = normalizeBehaviorArr(pools.mal || []).concat(normalizeBehaviorArr(pools.rep || []));
  var clEvidence = arr.some(function(x){ return x.status === 'mastered'; });
  return {
    dailylog: { ok: dlOk, stamp: dlStamp, inferred: dlOk && !dlStamp },
    clinical: { ok: !!(clStamp || clEvidence), stamp: clStamp, inferred: !clStamp && clEvidence }
  };
}

// Retag just the selected option after an import. Rebuilding the whole select would
// re-run _abaOnClientChange and reload the form, wiping what is already filled in.
function _abaRetagClientOption(clientId){
  var sel = document.getElementById('abaClientSel');
  if(!sel || !clientId) return;
  var opt = Array.prototype.slice.call(sel.options).find(function(o){ return o.value === clientId; });
  if(!opt) return;
  var st = _abaJsonState(clientId);
  var base = String(opt.textContent || '').split('  ')[0];
  opt.textContent = base + (st.dailylog.ok && st.clinical.ok ? '  ✓✓ los 2 JSON'
    : st.dailylog.ok ? '  ✓ Daily Log · FALTA el clínico'
    : st.clinical.ok ? '  ✓ clínico · FALTA el Daily Log'
    : '  ✗ sin JSON');
}

function _abaStampText(s){
  if(!s) return '';
  var d = new Date(s.at);
  var pad = function(n){ return (n < 10 ? '0' : '') + n; };
  return pad(d.getDate()) + '/' + pad(d.getMonth()+1) + '/' + d.getFullYear()
       + (s.file ? ' · ' + s.file : '') + (s.detail ? ' · ' + s.detail : '');
}

function _abaParseConfigJson(json){
  var secs = json.sections || {};
  // Collapse "same procedure, two spellings" inside every per-function list, so the
  // model is never offered both "Planned Ignore" and "Planned Ignoring".
  var _dedupeMap = function(m){
    var o = {};
    Object.keys(m||{}).forEach(function(k){ o[k] = _abaDedupeVariants(m[k]||[]).list; });
    return o;
  };

  // ── FORMAT B: "Behavior & Program" (behavior + replacement fused in one card).
  // Detected by the presence of a behavior_and_program section. Newer agency UI.
  if(secs.behavior_and_program){
    var bp = secs.behavior_and_program;
    var ua = secs.upon_arrival || {};
    var nv = secs.next_visit || {};
    var gi = bp.goal_implementation || {};
    var lower = function(o){ var r = {}; Object.keys(o||{}).forEach(function(k){ r[String(k).toLowerCase()] = o[k]; }); return r; };
    var opt = function(f){ return (f && f.options) || []; };

    return {
      format: 'behavior_program',
      behaviors:   opt(bp.behavior),
      evidenced:   (bp.evidenced_by || {}).options_by_parent || {},
      functions:   (bp.function || {}).options_by_parent || {},
      // In this format the antecedent suggestions mirror the behavior's Evidenced By list.
      antecedents: null,
      consequencesByFunction: _dedupeMap(lower((bp.consequence_interventions || {}).options_by_function || {})),
      // Antecedent interventions are FREE TEXT here (no catalog).
      interventionsByFunction: _dedupeMap(lower((bp.consequence_interventions || {}).options_by_function || {})),
      anteIntFreeText: true,
      replacements: opt(bp.replacement_program),
      goals:      opt(gi.goal) || opt(gi.goal_implementation) || [],
      teaching:   opt(gi.teaching_procedure),
      schedules:  opt(gi.reinforcement_schedule) || opt(gi.schedule),
      reinforcers: opt(gi.reinforcers),
      promptTypes: opt(gi.please_specify_prompt) || opt(gi.prompt),   // closed list of prompt types
      results:     opt(gi.result),                                    // closed list of result statements
      activities: opt(gi.activities),
      focus: [],                                  // no "main focus" field in this format
      roster:     opt(ua.who_was_present),
      envChanges: opt(ua.environmental_changes),
      nextLocations: opt(nv.location)
    };
  }

  // ── FORMAT A: separate "Behavior Reduction" + "Goal Implementation" sections.
  var br = (secs.behavior_reduction||{}).fields || [];
  var gi2 = (secs.goal_implementation||{}).fields || [];
  var find = function(arr, frag){
    return arr.find(function(f){ return String(f.label||'').toLowerCase().indexOf(frag) !== -1; }) || {};
  };
  // Exporters ship meta keys alongside the real functions (e.g. "_warning" carrying a
  // note about the list). They are not functions and must never be counted as a set
  // or reach a prompt, so drop every underscore-prefixed key and anything that is not
  // an array of options.
  var lower2 = function(obj){
    var out = {};
    Object.keys(obj||{}).forEach(function(k){
      if(String(k).charAt(0) === '_' || !Array.isArray(obj[k])) return;
      out[String(k).toLowerCase()] = obj[k];
    });
    return out;
  };
  // Some agencies filter the intervention list by Behavior AND Function, and expose
  // options_by_function only as the UNION across behaviors (their own export says so
  // in a "_warning" key). When the per-behavior map exists it is the effective list.
  var byBehFn = function(f){
    var src = (f && f.options_by_behavior_and_function) || {};
    var out = {};
    Object.keys(src).forEach(function(beh){ out[String(beh).trim().toLowerCase()] = lower2(src[beh]); });
    return out;
  };

  // The intervention catalogs live in the field that actually carries
  // options_by_function. Matching on the label alone picks the wrong field, because
  // two decoy fields repeat the same words and come FIRST in the field list:
  //   · the yes/no gate  "Once the antecedent was presented ... (Antecedent Interventions)"
  //   · the question header "After the behavior occurred ... (Consequence Interventions)"
  // and some agencies label the consequence list just "Interventions:", keeping the
  // "(Consequence Interventions)" wording in the field's `question` instead of its
  // label. Match on label + question and require a non-empty option map, so neither
  // the decoys nor the naming variant can win.
  var findOpt = function(arr, frag){
    return arr.find(function(f){
      var t = (String(f.label||'') + ' ' + String(f.question||'')).toLowerCase();
      return t.indexOf(frag) !== -1 && f.options_by_function && Object.keys(f.options_by_function).length;
    }) || {};
  };

  var fBeh   = find(br, 'behavior');
  var fEvid  = find(br, 'evidenced by');
  var fFunc  = find(br, 'function of the behavior');
  var fAnte  = find(br, 'antecedent');
  var fAInt  = findOpt(br, 'antecedent intervention');
  var fCInt  = findOpt(br, 'consequence intervention');
  var fFocus = find(br, 'main focus');
  var fGoal  = find(gi2, 'goal implementation');
  var fActs  = find(gi2, 'activities');
  var fTeach = find(gi2, 'teaching procedure');
  var fSched = find(gi2, 'schedule of reinforcement');

  if(fAnte === fAInt || (fAnte.label||'').toLowerCase().indexOf('intervention') !== -1){
    fAnte = br.find(function(f){
      var l = String(f.label||'').toLowerCase();
      return l.indexOf('antecedent') !== -1 && l.indexOf('intervention') === -1;
    }) || {};
  }

  return {
    format: 'behavior_reduction',
    behaviors:   fBeh.options || [],
    evidenced:   fEvid.options_by_parent || {},
    functions:   fFunc.options_by_parent || {},
    antecedents: _dedupeMap(lower2(fAnte.options_by_function || {})),
    interventionsByFunction: _dedupeMap(lower2(fAInt.options_by_function || {})),
    consequencesByFunction:  _dedupeMap(lower2(fCInt.options_by_function || {})),
    interventionsByBehFn:    byBehFn(fAInt),
    consequencesByBehFn:     byBehFn(fCInt),
    anteIntFreeText: false,
    replacements: [],
    focus:      fFocus.options || ['Reduce the frequency','Other'],
    goals:      fGoal.options || [],
    activities: fActs.options || [],
    teaching:   fTeach.options || [],
    schedules:  fSched.options || [],
    promptTypes: [], results: [], reinforcers: [],
    roster: [], envChanges: [], nextLocations: []
  };
}

function _abaLoadConfigFile(input){
  var f = input.files && input.files[0];
  if(!f) return;
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); input.value=''; return; }
  var r = new FileReader();
  r.onload = function(e){
    try{
      var json = JSON.parse(e.target.result);
      var cfg = _abaParseConfigJson(json);
      if(!cfg.behaviors.length){
        showMsg('abaMsg','El JSON no trae conductas reconocibles (ni en behavior_reduction ni en behavior_and_program).','err');
        return;
      }
      LS.set('aba5_abaevid_' + _abaClientId, cfg);
      _abaStampImport(_abaClientId, 'dailylog', f.name,
        cfg.behaviors.length + ' conductas · ' + (cfg.format === 'behavior_program' ? 'Behavior & Program' : 'Behavior Reduction'));
      _abaRetagClientOption(_abaClientId);
      _abaRenderEvidInfo();
      if(typeof _abaRenderSetup === 'function') _abaRenderSetup();
      if(typeof _abaRenderActive === 'function') _abaRenderActive();
      _abaFillBrBehaviors();
      _abaFillSelect('abaGiGoal', cfg.goals || [], '— que la IA elija —');
      if(typeof _abaApplyFormat === 'function') _abaApplyFormat(cfg);
      // Summary must not assume the format: fields differ between the two.
      var nAnte = cfg.antecedents ? Object.keys(cfg.antecedents).length : 0;
      var nInt  = cfg.consequencesByFunction ? Object.keys(cfg.consequencesByFunction).length : 0;
      var nAInt = cfg.interventionsByFunction ? Object.keys(cfg.interventionsByFunction).length : 0;
      var parts = [cfg.behaviors.length + ' conducta(s)'];
      if(nAnte) parts.push(nAnte + ' set(s) de antecedentes');
      if(nInt)  parts.push(nInt + ' set(s) de intervenciones');
      if((cfg.replacements||[]).length) parts.push((cfg.replacements||[]).length + ' replacement(s)');
      if((cfg.goals||[]).length) parts.push((cfg.goals||[]).length + ' meta(s)');
      if((cfg.activities||[]).length) parts.push((cfg.activities||[]).length + ' actividad(es)');
      var fmtLabel = cfg.format === 'behavior_program' ? 'Behavior & Program' : 'Behavior Reduction + Goal Implementation';
      // Defects the platform ships in its own closed lists. Reported, not hidden: the
      // analyst is flagging these as if they were ours, and the user needs the evidence.
      try{
        var _def = _abaCatalogDefects(cfg);
        var _dparts = [];
        if(_def.variants.length) _dparts.push(_def.variants.length + ' procedimiento(s) con dos redacciones');
        if(_def.terms.length)    _dparts.push(_def.terms.length + ' con terminologia incorrecta');
        if(_def.trailing.length) _dparts.push(_def.trailing.length + ' con espacios sobrantes');
        var _dbox = document.getElementById('abaDefects');
        if(_dbox){
          if(_dparts.length){
            var esc = function(x){ return String(x||'').replace(/[&<>]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]; }); };
            _dbox.innerHTML = '<b style="color:var(--text2)">Defectos en el catalogo de AbaMatrix de este cliente:</b> ' + esc(_dparts.join(' \u00B7 ')) + '.'
              + '<div style="margin-top:4px;color:var(--text3)">El sistema usa una sola redaccion en el formulario y el termino correcto en la prosa.</div>'
              + (_def.variants.length ? '<div style="margin-top:4px;font-family:var(--mono);font-size:10px">' + _def.variants.slice(0,6).map(esc).join('<br>') + '</div>' : '')
              + (_def.terms.length ? '<div style="margin-top:4px;font-family:var(--mono);font-size:10px">' + _def.terms.slice(0,6).map(esc).join('<br>') + '</div>' : '');
            _dbox.style.display = 'block';
          } else { _dbox.innerHTML = ''; _dbox.style.display = 'none'; }
        }
      }catch(e){}
      // An empty intervention catalog is the failure that matters: the form would be
      // filled with NO closed list and the model would improvise the procedures
      // instead of picking the ones the plan authorises for the function. It used to
      // pass silently because the summary only printed the counts it did find.
      var _missing = [];
      if(!nAInt) _missing.push('antecedentes');
      if(!nInt)  _missing.push('consecuentes');
      if(_missing.length && !cfg.anteIntFreeText){
        showMsg('abaMsg','Configuración cargada (formato: ' + fmtLabel + '): ' + parts.join(', ')
          + '. AVISO: el JSON no trae catálogo de intervenciones ' + _missing.join(' ni ')
          + '. Sin esa lista cerrada la nota se generaría con intervenciones improvisadas. Revisa el JSON del Daily Log.','err');
      } else {
        showMsg('abaMsg','Configuración cargada (formato: ' + fmtLabel + '): ' + parts.join(', ') + '.','ok');
      }
      _abaCheckReady();
    }catch(err){
      showMsg('abaMsg','JSON inválido: ' + (err.message||err),'err');
    }
    input.value = '';
  };
  r.readAsText(f);
}

// Adapts the tab to the client's AbaMatrix format:
//  · behavior_reduction  → separate Behavior Reduction + Goal Implementation
//  · behavior_program    → one fused "Behavior & Program" section (no separate goals)
// Roster and environmental-change lists come from the JSON when it provides them.
function _abaApplyFormat(cfg){
  var isBP = cfg && cfg.format === 'behavior_program';

  // Goal Implementation section: hidden in the fused format (goals live in the card).
  var giSec = document.getElementById('abaGiGoal');
  var giBlock = giSec ? giSec.closest('div[style*="border-top"]') : null;
  if(giBlock) giBlock.style.display = isBP ? 'none' : 'block';

  // Behavior section title reflects the format.
  var brTitle = document.querySelector('#tab-abamatrix div[style*="font-weight:600"]');
  // (title text is set per-section below via the known nodes)
  var titles = document.querySelectorAll('#tab-abamatrix div');
  titles.forEach(function(d){
    if(d.textContent === 'Behavior Reduction' || d.textContent === 'Behavior & Program'){
      d.textContent = isBP ? 'Behavior & Program' : 'Behavior Reduction';
    }
  });

  // Roster from the JSON (this agency ships the list of people).
  if(cfg && cfg.roster && cfg.roster.length){
    var cur = LS.get('aba5_abaroster_' + _abaClientId);
    if(!cur){
      LS.set('aba5_abaroster_' + _abaClientId, cfg.roster.join(', '));
      var rf = document.getElementById('abaRoster'); if(rf) rf.value = cfg.roster.join(', ');
      _abaRenderPresentBoxes();
    }
  }
  // Environmental-change list from the JSON when present.
  if(cfg && cfg.envChanges && cfg.envChanges.length){
    _abaFillSelect('abaEnvChange', cfg.envChanges, null);
  } else {
    _abaFillSelect('abaEnvChange', ABA_ENV_CHANGES, null);
  }
}

// Los dos JSON, uno debajo del otro, con la fecha en que se subio cada uno.
function _abaRenderJsonState(){
  var el = document.getElementById('abaJsonState');
  if(!el) return;
  if(!_abaClientId){ el.innerHTML = ''; return; }
  var st = _abaJsonState(_abaClientId);
  var esc = function(x){ return String(x||'').replace(/[&<>]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]; }); };
  var row = function(n, kind, s){
    var mark = s.ok ? '✓' : '✗';
    var col  = s.ok ? 'var(--green,#16a34a)' : 'var(--red,#c0392b)';
    var txt  = s.stamp ? 'subido el ' + _abaStampText(s.stamp)
             : (s.ok ? 'ya está cargado (se subió antes de que se registrara la fecha)'
                     : 'NO subido todavía');
    return '<div><span style="color:' + col + ';font-weight:700">' + mark + '</span> '
      + '<b style="color:var(--text2)">' + n + ' · ' + esc(ABA_JSON_KINDS[kind]) + '</b>'
      + '<br><span style="color:var(--text3);font-size:10px;margin-left:14px">' + esc(txt) + '</span></div>';
  };
  el.innerHTML = row(1, 'dailylog', st.dailylog) + row(2, 'clinical', st.clinical)
    + (st.dailylog.ok && st.clinical.ok
        ? '<div style="color:var(--green,#16a34a);font-size:10px;margin-top:4px">Los dos JSON de este cliente están subidos.</div>'
        : '<div style="color:var(--red,#c0392b);font-size:10px;margin-top:4px">Falta al menos uno de los dos JSON de este cliente.'
          + '<br><span style="color:var(--text3)">Si lo subiste antes de esta versión y aquí no aparece, vuelve a subirlo: la importación no borra nada, solo rellena lo que falta y respeta lo que ya tenga dato propio.</span></div>');
}

function _abaRenderEvidInfo(){
  _abaRenderJsonState();
  var el = document.getElementById('abaEvidInfo');
  if(!el) return;
  var cfg = _abaClientId ? _abaCfg(_abaClientId) : null;
  if(!cfg){ el.textContent = 'Este cliente aún no tiene configuración de AbaMatrix cargada.'; return; }
  // Only report what the client's format actually has — the two formats differ.
  var n = function(v){ return Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0); };
  var bits = [];
  bits.push(n(cfg.behaviors) + ' conductas');
  if(n(cfg.antecedents))            bits.push(n(cfg.antecedents) + ' sets de antecedentes');
  if(n(cfg.consequencesByFunction)) bits.push(n(cfg.consequencesByFunction) + ' sets de intervenciones');
  if(n(cfg.replacements))           bits.push(n(cfg.replacements) + ' replacements');
  if(n(cfg.goals))                  bits.push(n(cfg.goals) + ' metas');
  if(n(cfg.activities))             bits.push(n(cfg.activities) + ' actividades');
  if(n(cfg.teaching))               bits.push(n(cfg.teaching) + ' procedimientos');
  if(n(cfg.reinforcers))            bits.push(n(cfg.reinforcers) + ' reforzadores');
  if(n(cfg.promptTypes))            bits.push(n(cfg.promptTypes) + ' tipos de prompt');
  if(n(cfg.results))                bits.push(n(cfg.results) + ' resultados');
  if(n(cfg.roster))                 bits.push(n(cfg.roster) + ' personas');
  var fmt = cfg.format === 'behavior_program' ? 'Behavior & Program' : 'Behavior Reduction + Goal Implementation';
  el.textContent = 'Cargado (' + fmt + '): ' + bits.join(' · ') + '.';
  el.style.color = '';
  // A stored config with no intervention catalog cannot produce a Behavior Reduction
  // section. Say it HERE, next to the upload control, instead of letting the user
  // discover it as an empty section after a full generation run.
  if(cfg.format === 'behavior_reduction' && !cfg.anteIntFreeText
     && !n(cfg.interventionsByFunction) && !n(cfg.consequencesByFunction)){
    el.textContent += ' ⚠ SIN catálogo de intervenciones — vuelve a subir el JSON del Daily Log o la sección Behavior Reduction saldrá vacía.';
    el.style.color = 'var(--err, #c0392b)';
    // This block lives inside a collapsed <details>; a warning nobody can see is no
    // warning at all, so open it.
    var d = document.getElementById('abaCfgDetails'); if(d) d.open = true;
  }
}

function _abaFillBrBehaviors(){
  var cfg = _abaClientId ? _abaCfg(_abaClientId) : null;
  var list = cfg ? (cfg.behaviors||[]) : [];
  _abaFillSelect('abaBrBehavior', list, list.length ? '— select behavior —' : '— sube primero el JSON de este cliente —');
}

function _abaOnBrBehavior(){
  var out = document.getElementById('abaBrOut'); if(out) out.textContent = '';
}

// FORMAT B — "Behavior & Program": behavior and its functionally equivalent
// replacement live in ONE card. AbaMatrix offers the replacements as a flat list,
// but the choice is NOT free: the REDUCED ASSESSMENT is what establishes which
// replacement is functionally equivalent to each behavior. The list constrains
// what may be selected; the assessment decides which one is correct.
async function _abaBuildOneProgram(beh, usedThisNote, recentReps, recentFns){
  // Same agency minimums as the Goal Implementation cards: the fused "Behavior &
  // Program" format documents the replacement inside the behavior card, so the
  // per-program quotas apply here too.
  var _minP = _programDocMinimums(LS.get('aba5_pools_' + _abaClientId) || {});
  var _nReinP = Math.max(2, _minP.reinforcers || 0);
  var cfg = _abaCfg(_abaClientId);
  var prof = _sliceProfileFor((LS.get('aba5_assess_' + _abaClientId) || '').trim(), beh);
  // Narrow Evidenced By to what this client's own topography supports: the platform
  // list is shared across behaviors and offers descriptors of other response classes.
  var _topoBeh = (function(){
    var pl = LS.get('aba5_pools_' + _abaClientId) || {};
    var row = normalizeBehaviorArr(pl.mal || []).find(function(x){
      return String(x.name||'').trim().toLowerCase() === String(beh).trim().toLowerCase(); });
    return row ? String(row.topo||'') : '';
  })();
  var _ev = _abaEvidForBehavior((cfg.evidenced||{})[beh] || [], _topoBeh, beh);
  var evidList = _ev.list;
  var funcList = (cfg.functions||{})[beh] || [];
  if(!evidList.length || !funcList.length){
    return { block:'', flags:['sin Evidenced By/función para "' + beh + '"'] };
  }
  try{
    var dangerous = ABA_DANGEROUS.test(beh);
    var consFor = function(fn){
      var list = (cfg.consequencesByFunction||{})[String(fn).toLowerCase()] || [];
      if(dangerous) list = list.filter(function(i){ return !/planned\s*ignoring/i.test(i); });
      return list;
    };
    var funcBlocks = funcList.map(function(fn){
      return 'IF THE FUNCTION IS "' + fn + '":\n  Allowed CONSEQUENCE INTERVENTIONS (verbatim):\n' +
             consFor(fn).map(function(x,i){ return '    ' + (i+1) + '. ' + x; }).join('\n');
    }).join('\n\n');

    var pools = LS.get('aba5_pools_' + _abaClientId) || {};
    // The fused format ships the client's OWN reinforcer catalog in the Daily Log
    // JSON (25 real ones for this client). Falling straight through to the generic
    // praise pair ignored them and reproduced the "always two reinforcers, always
    // verbal praise" defect. Order: what the client's record says, then the
    // platform catalog, and only then the universal fallback.
    var reinf = String(pools.reinforcers||'').trim()
             || (cfg.reinforcers||[]).join(', ')
             || _socialReinforcerFallback(Math.max(_nReinP, _minP.social || 0)).join(', ');

    var sys = 'You fill an AbaMatrix "Behavior & Program" card: one maladaptive behavior together with the functionally equivalent replacement program taught in its place. The free text guides the RBT in writing the session note.\n\n'
      + 'ABSOLUTE PROHIBITION - NO INVENTED NUMBERS: no seconds, minutes, counts, trials, "X out of Y", percentages, frequencies or durations. Qualitative, observable terms only.\n\n'
      + 'CLOSED LISTS: every dropdown value must be copied verbatim from the list given. Never invent, modify or combine options.\n\n'
      + 'CLINICAL PRIORITY - READ THIS BEFORE ANYTHING ELSE. The platform\u2019s closed lists are a VOCABULARY, not a clinical criterion. They contain many prefixed items that are naive, impractical or simply ineffective, and some apply to no real case. Selecting an item merely because it appears in the list is worse than useless. Follow this order of authority:\n'
      + '  1. THE ASSESSMENT COMES FIRST. The client\u2019s reduced assessment establishes the behaviors, their functions, the replacement programs, the prompt hierarchy and the reinforcers. Whatever it states prevails over anything the platform offers.\n'
      + '  2. THEN, ESTABLISHED CLINICAL PRACTICE. Use strategies that are proven and effective in real ABA practice - never invent anything, and never choose a token or superficial procedure just to fill the field.\n'
      + '  3. LAST, THE PLATFORM. From the closed list, select ONLY what genuinely applies to this client and this behavior and is actually useful. If several options exist, choose the one that is clinically strongest and functionally correct for the documented function - not the first one, not the easiest, not a generic one.\n'
      + 'If an option in the list is not clinically appropriate for this behavior and function, DO NOT use it. Choose a different one from the list that is. The list constrains the wording you may use; it never dictates the clinical decision.\n\n'      + 'THE REPLACEMENT IS A CLINICAL DECISION, NOT A FREE PICK: the platform lists several replacement programs, but you must choose the one the REDUCED ASSESSMENT establishes as functionally equivalent to THIS behavior and THIS function. The replacement must serve the same function as the maladaptive behavior (escape -> an appropriate way to request a break or help; attention -> an appropriate way to request attention; tangibles -> an appropriate request for the item; automatic reinforcement -> an appropriate alternative that produces comparable stimulation). A replacement that does not match the function is a clinical error.\n\n'
      + 'REPLACEMENT CONSISTENCY WITHIN THIS CARD: name ONE replacement for this behavior and keep it consistent throughout the card - the response prompted and taught at the antecedent MUST be the SAME response reinforced at the consequence and named in the result. Never prompt one replacement (e.g. "request help") and then reinforce a different one (e.g. "request a break").\n\n'
      + 'NO TRIUMPHALIST OR SUPERLATIVE LANGUAGE: never write "successfully", "effectively", "excellently" or similar. State plainly what was done and observed. Results are not always positive.\n\n'
      + 'REINFORCERS - DO NOT INVENT: name only the reinforcers configured for this client (given below).\n\n'
      + 'REINFORCER MUST MATCH THE FUNCTION - THIS IS THE CORE OF THE PROCEDURE: the reinforcer delivered for the replacement behavior must be the SAME reinforcer that maintained the maladaptive behavior. Otherwise the replacement is not functionally equivalent and the procedure does not work.\n'
      + '  - ESCAPE: the replacement (e.g. requesting a break/help) must be reinforced by ESCAPE ITSELF - the break is granted, the demand is briefly removed or reduced. Praise or food alone does NOT reinforce an escape-maintained response.\n'
      + '  - ATTENTION: the replacement (e.g. an appropriate bid for attention) must be reinforced by ATTENTION - the adult turns, makes eye contact, responds, interacts. Praise counts here because praise IS attention.\n'
      + '  - TANGIBLES: the replacement (e.g. an appropriate request) must be reinforced by ACCESS TO THE ITEM or activity requested. Praise alone is not sufficient.\n'
      + '  - AUTOMATIC REINFORCEMENT: the replacement must produce comparable stimulation itself (e.g. the alternative item the client manipulates); the reinforcement is largely built into the alternative response. Social praise may accompany it but is not the functional reinforcer.\n'
      + 'IMPORTANT - THE PLATFORM CATALOG LISTS ITEMS, NOT CONTINGENCIES: the reinforcer list contains objects and activities (snacks, toys, videos, praise). It usually contains NO escape reinforcer, because escape is not an object - it is a contingency (removing or pausing the demand). Therefore:\n'
      + '  - ESCAPE-maintained behavior: select from the catalog whatever the field requires, but the DESCRIPTION must state explicitly that the break was GRANTED and the demand briefly removed or reduced, contingent on the appropriate request. That is the functional reinforcer; without it the replacement is not functionally equivalent. Never present a snack or praise as the reinforcer for an escape-maintained response.\n'
      + '  - ATTENTION: the catalog entries \u201Cattention\u201D and \u201Cverbal praise\u201D ARE the functional reinforcer; state that the adult delivered attention.\n'
      + '  - TANGIBLES: choose the actual item/activity requested and state that access was granted.\n'
      + '  - AUTOMATIC REINFORCEMENT: choose the alternative item that produces comparable stimulation and state that the client engaged with it.\n'
      + 'A reinforcer that does not match the function is a clinical error.\n\n'
      + 'INTERVENTIONS - CHOOSE THE CLINICALLY STRONGEST, NOT THE MOST CONVENIENT: the intervention list contains options that are weak or inappropriate for many functions. Select the procedures that are actually indicated for this behavior\u2019s documented function and that are known to work in practice (e.g. for escape: escape extinction plus FCT teaching an appropriate break request; for attention: extinction of attention plus DRA reinforcing the appropriate bid; for tangibles: extinction plus FCT for an appropriate request; for automatic reinforcement: RIRD plus a functionally matched alternative). Never select a superficial or ineffective option just to populate the field.\n\n'      + 'HARD CLINICAL RULES: planned ignoring is NEVER used for aggression, self-injury, elopement, property destruction or tantrums. Response blocking, if used, lasts only a short period. Replacement behaviors are TAUGHT - they are not interventions for the maladaptive behavior.\n\n'
      + 'STRICT RBT SCOPE OF PRACTICE - CRITICAL: this is an RBT note (CPT 97153). The RBT IMPLEMENTS the protocol and DOCUMENTS what was observed. The RBT does NOT make clinical judgements, does NOT interpret, does NOT analyse trends, does NOT evaluate progress toward goals, and does NOT suggest or recommend changes to the plan, the protocol or the interventions. Those are the analyst\u2019s responsibility. An RBT writing clinical judgement is a scope-of-practice violation and an audit finding.\n\n'
      + 'PROHIBITED IN AN RBT NOTE (analyst-only language): progress, made progress, improvement, improved, growth, gains, development, advancement, mastery, mastered, learning, learned, understanding, comprehension, effective, effectiveness, successful, appeared to, seemed to, likely, suggests, indicates, demonstrates progress, is responding well, would benefit from, recommend, recommendation, should be adjusted, needs modification, requires a change to the protocol.\n\n'
      + 'CORRECT RBT LANGUAGE: describe only what was observed and done - \u201Cthe client engaged with the task\u201D, \u201Cthe client responded to the gestural prompt\u201D, \u201Cthe behavior occurred and was interrupted\u201D, \u201Cthe client did not respond to the instruction\u201D, \u201Cprompt dependence was documented during this session\u201D. Report the plain observable outcome, including when it was poor. Any clinical conclusion or plan change belongs to the analyst, not here.\n\n'      + 'PLATFORM WORDING vs NOTE WORDING - THEY ARE NOT THE SAME THING: the value you select for a closed-list FIELD must be the platform string, verbatim, because the field only accepts its own options. But the free-text DESCRIPTIONS and the ABC narrative are clinical prose, and there you name the procedure CORRECTLY and describe what was done. Never copy a malformed label into the prose. Specifically: \"Most to lead prompt fading\" is most-to-least prompt fading; \"Planned Ignore\" is planned ignoring; \"Alternate Behaviors (DRA)\" is differential reinforcement of ALTERNATIVE behavior; \"Response Interruption / Redirection (RIR)\" is response interruption and redirection (RIRD). Same procedure, said properly - never a DIFFERENT procedure from the one selected, which would contradict the form.\n\n'
      + 'NEVER DEFINE AN INTERVENTION IN THE DESCRIPTIONS: write what the RBT DID and what the client did in response, in the past tense. Do not explain what the procedure is, what it consists of or what it is for - no "X is defined as...", "X involves...", "X is a technique that...". A definition is padding and the analyst rejects it.\n\n'
      + 'PROHIBITED TERMINOLOGY: sensory, relaxation, calming, calm, deep breathing, self-regulation, coping, mindfulness, problem solving, conflict resolution, social stories, anger management, art therapy, frustration, stress, anxiety, upset, or any emotional/mentalist language. Third person singular. Output STRICT JSON only.';

    var prompt = ((typeof _analystCorrectionsBlock === 'function') ? _analystCorrectionsBlock(_abaClientId) : '')
      + ((typeof _universalAnalystBlock === 'function') ? _universalAnalystBlock(_abaClientId) : '')
      + ((typeof _recurringDefectsBlock === 'function') ? _recurringDefectsBlock(_abaClientId) : '')
      + ((typeof _retiredPromptBlock === 'function') ? _retiredPromptBlock(_abaClientId) : '')
      // The plan's own procedures for THIS behavior, when the assessment documents
      // them. The closed list supplies the wording; this supplies the clinical
      // decision, so the form reproduces the planned procedure instead of whatever
      // option happens to look plausible in the catalog.
      + (function(){
           var pl = LS.get('aba5_pools_' + _abaClientId) || {};
           var row = normalizeBehaviorArr((pl && pl.mal) || []).find(function(b){
             return b && String(b.name||'').trim().toLowerCase() === String(beh).trim().toLowerCase();
           });
           var doc = row && String(row.int||'').trim();
           if(!doc) return '';
           return 'INTERVENTIONS THE PLAN DOCUMENTS FOR THIS BEHAVIOR (highest authority — these are this client’s planned procedures):\n' + doc + '\n'
             + 'Choose from the closed lists above the options that CORRESPOND to these planned procedures, matching each to the function you selected. The closed list gives you the permitted wording; this line gives you the clinical decision. If a planned procedure has no equivalent in the closed list for the chosen function, pick the closest functionally correct option and describe the planned procedure in the description field. Do NOT pick a catalog option that contradicts the plan.\n\n';
         })()
      + 'Behavior worked on this session: "' + beh + '".\n\n'
      + 'CLOSED LIST - Evidenced By (choose exactly one, verbatim):\n' + evidList.map(function(x,i){ return (i+1)+'. '+x; }).join('\n') + '\n\n'
      + 'CLOSED LIST - Function allowed for THIS behavior (choose exactly one): ' + funcList.join(' | ') + '\n'
      + 'Choose the function documented for this behavior in the reduced assessment below.\n\n'
      + ((funcList.length > 1)
          ? 'FUNCTION ROTATION (multiply-maintained behaviors only): '
            + (((recentFns||[]).length)
                ? 'this behavior was documented under these functions in recent notes, MOST RECENT FIRST: ' + (recentFns||[]).slice(0,6).map(function(f){ return '"'+f+'"'; }).join(', ') + '. '
                : '')
            + 'If - AND ONLY IF - the reduced assessment establishes MORE THAN ONE function for this behavior (i.e. it is genuinely multiply-maintained), rotate among the established functions: prefer an established function that is NOT in the recent list above; if every established function already appears, choose the one LOWEST in that list (the least recently used). This rotates the documented function and its functionally equivalent replacement across notes. If the reduced assessment establishes a SINGLE function for this behavior, use that one function every time and DO NOT rotate - never document a function the assessment does not support just for variety.\n\n'
          : '')
      + 'ANTECEDENT: in this platform the antecedent suggestions mirror the Evidenced By list. Write the specific condition or demand that set the occasion for the behavior, observable and measurable.\n\n'
      + 'CONSEQUENCE INTERVENTIONS ALLOWED PER FUNCTION:\n' + funcBlocks + '\n\n'
      + 'ANTECEDENT INTERVENTIONS: free text in this platform - describe the proactive strategies applied before or upon the antecedent, consistent with the function.\n\n'
      + 'CLOSED LIST - Replacement program (choose exactly ONE, verbatim - the one that is functionally equivalent to this behavior per the assessment):\n'
      + (cfg.replacements||[]).map(function(x,i){ return (i+1)+'. '+x; }).join('\n') + '\n\n'
      + (cfg.teaching && cfg.teaching.length ? 'CLOSED LIST - Teaching procedure (choose one, verbatim): ' + cfg.teaching.join(' | ') + '\n\n' : '')
      + (cfg.promptTypes && cfg.promptTypes.length ? 'CLOSED LIST - Prompt used (choose one, verbatim, if prompts were used): ' + cfg.promptTypes.join(' | ') + '\n\n' : '')
      + (cfg.results && cfg.results.length ? 'CLOSED LIST - Result of the implemented interventions (choose exactly one, verbatim - do NOT write your own): \n' + cfg.results.map(function(x,i){ return (i+1)+'. '+x; }).join('\n') + '\n\n' : '')
      + (cfg.reinforcers && cfg.reinforcers.length ? 'CLOSED LIST - Reinforcers available in the platform (choose from these, verbatim): ' + cfg.reinforcers.join(' | ') + '\n\n' : '')
      + (cfg.schedules && cfg.schedules.length ? 'CLOSED LIST - Reinforcement schedule (choose one, verbatim): ' + cfg.schedules.join(' | ') + '\n\n' : '')
      + 'REINFORCERS OF THIS CLIENT (the ONLY ones you may name):\n' + reinf + '\n\n'
      + 'CLIENT REDUCED ASSESSMENT (source of truth - it establishes the function of each behavior and its functionally equivalent replacement):\n' + prof + '\n\n'
      + ((usedThisNote && usedThisNote.length)
          ? 'ALREADY DOCUMENTED IN THIS SAME NOTE (HARD CONSTRAINT ON VARIETY): the replacement program(s) listed below are ALREADY used by another behavior in THIS note. For the CURRENT behavior, pick a DIFFERENT replacement from the closed list that is ALSO functionally equivalent to this behavior and its function per the reduced assessment. For an escape function the list normally offers more than one equivalent option (e.g. requesting a break AND requesting help) - use one that is NOT already taken, so the note does not document the same replacement across several behaviors. Reuse an already-used replacement ONLY when it is genuinely the ONLY functionally equivalent option for this behavior. Also use a DIFFERENT antecedent:\n' + usedThisNote.map(function(u){ return '  - "' + u.beh + '": replacement "' + u.rep + '"'; }).join('\n') + '\n\n'
          : '')
      + ((function(){
            // Rotate replacements across sessions: avoid always selecting the same
            // functionally equivalent option. Clinical equivalence still wins - only
            // rotate among options the assessment allows for THIS behavior/function.
            var rr = (recentReps || []).filter(function(x){ return x && !(usedThisNote||[]).some(function(u){ return u.rep === x; }); });
            var seen = {}, uniq = [];
            rr.slice().reverse().forEach(function(x){ if(!seen[x]){ seen[x] = 1; uniq.push(x); } });
            if(!uniq.length) return '';
            return 'ROTATION ACROSS SESSIONS - these replacement programs were already documented in recent notes for this client, MOST RECENTLY USED FIRST:\n'
              + uniq.slice(0, 8).map(function(x){ return '  - "' + x + '"'; }).join('\n') + '\n'
              + 'If MORE THAN ONE replacement in the closed list above is functionally equivalent to THIS behavior and its documented function per the reduced assessment, choose one that is NOT in this recent list, so the note rotates instead of repeating the same replacements every session. If EVERY functionally equivalent option for this behavior already appears in the list, choose the one LOWEST in the list (the least recently used), so the replacement still rotates on a cycle. Only repeat the most recently used replacement when it is genuinely the ONLY functionally equivalent option for this behavior - never trade functional equivalence for variety.\n\n';
          })())
      + _mfcBehReinfLine(_abaClientId, beh)
      + '\n\nReturn STRICT JSON with exactly these keys:\n'
      + ((_minP.reinforcers || _minP.social)
          ? 'AGENCY MINIMUMS FOR THIS CLIENT - MANDATORY FOR THE REPLACEMENT PROGRAM IN THIS CARD:\n'
            + (_minP.reinforcers ? '  - at least ' + _minP.reinforcers + ' reinforcers documented for the program.\n' : '')
            + (_minP.social      ? '  - at least ' + _minP.social + ' DISTINCT types of SOCIAL reinforcement among them, each NAMED SPECIFICALLY (' + ABA_SOCIAL_REINFORCER_TYPES.join(', ') + '). The bare phrases "verbal praise", "social praise" and "praise" are NOT acceptable on their own; two wordings of praise are ONE type.\n' : '')
            + 'Draw them ONLY from the reinforcers this client actually has. A minimum never licenses inventing one.\n\n'
          : '')
      + '{"evidenced_by":"","function":"","antecedent":"","consequence_interventions":[{"type":"","description":""}],"antecedent_interventions":"","replacement_program":"","teaching_procedure":"","prompts_used":true,"prompt_used":"","reinforcers":[' + new Array(_nReinP).fill('""').join(',') + '],"reinforcement_schedule":"","result":""}';

    var raw = await callAPI(prompt, sys, null, _abaClientId, 8192, 0);
    var txt = String(raw||'').replace(/```json|```/g,'').trim();
    var data = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));

    var norm = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
    var pick = function(v, list){
      var m = list.find(function(o){ return norm(o) === norm(v); });
      if(m) return m;
      var w = norm(v);
      return w ? (list.find(function(o){ var n = norm(o); return n.indexOf(w) === 0 || w.indexOf(n) === 0; }) || '') : '';
    };
    var flags = [];
    var evid = pick(data.evidenced_by, evidList) || evidList[Math.floor(Math.random()*evidList.length)];
    var fn   = pick(data['function'], funcList); if(!fn){ fn = funcList[0]; flags.push('Function ajustada en "' + beh + '"'); }
    var consAllowed = consFor(fn);
    var cInts = (data.consequence_interventions||[]).map(function(r){
      return { type: pick(r.type, consAllowed), description: String(r.description||'').trim() };
    }).filter(function(r){ return r.type; });
    // HARD RULES: corrige selecciones incongruentes (RIRD/Planned Ignoring/antecedentes)
    var _enf = _abaEnforceRules(fn, beh, cInts, consAllowed, null);
    cInts = _enf.cInts;
    if(_enf.relocate.length){
      var _reloc = _enf.relocate.map(function(r){ return r.type + (r.description ? ': ' + r.description : ''); }).join('. ');
      data.antecedent_interventions = (String(data.antecedent_interventions||'').trim()
        ? String(data.antecedent_interventions).trim() + '. ' : '') + _reloc;
    }
    _enf.notices.forEach(function(n){ flags.push(n); });
    if(!cInts.length) flags.push('Consequence Intervention en "' + beh + '"');
    // The analyst asked twice to remove the intervention paragraphs and definitions.
    // They are born HERE, in each intervention's description field, so flag the two
    // shapes that produce them: a textbook definition, and an essay-length text.
    (function(){
      var defRe = /\b(is defined as|is a procedure|refers to|consists of|involves|is a technique|is an evidence-based|means that|se define como|que consiste en|consiste en|es un procedimiento|se refiere a)\b/i;
      cInts.concat([{ type:'Antecedent Interventions (texto libre)', description: String(data.antecedent_interventions||'') }]).forEach(function(r){
        var d = String(r.description||'').trim();
        if(!d) return;
        if(defRe.test(d)){
          _recordDefect(_abaClientId, 'definicion');
          flags.push('"' + beh + '": la descripción de "' + r.type + '" DEFINE el procedimiento en vez de decir qué se hizo');
        } else if(d.split(/\s+/).length > 90){
          flags.push('"' + beh + '": la descripción de "' + r.type + '" es un párrafo de ' + d.split(/\s+/).length + ' palabras — la analista pide documentar la acción, no explicarla');
        }
      });
    })();

    var rep = pick(data.replacement_program, cfg.replacements||[]);
    if(!rep) flags.push('Replacement program no válido en "' + beh + '"');
    // Replacement ↔ function: warn only on a CLEAR cross-function mismatch (the
    // replacement label distinctly implies a different function than the behavior's).
    // Ambiguous/generic labels imply nothing and are never flagged.
    // Multiply-maintained behaviors: only flag when the replacement matches NONE of
    // the behavior's documented functions.
    var _repFn = _repImpliedFnClass(rep), _behFns = _fnClassList(fn);
    if(rep && _repFn && _behFns.length && _behFns.indexOf(_repFn) === -1){
      flags.push('replacement "' + rep + '" sugiere función ' + _repFn + ' pero la conducta es ' + _behFns.join('+') + ' — verificar equivalencia funcional');
    }
    var proc = (cfg.teaching && cfg.teaching.length) ? pick(data.teaching_procedure, cfg.teaching) : String(data.teaching_procedure||'').trim();
    var sched = (cfg.schedules && cfg.schedules.length) ? pick(data.reinforcement_schedule, cfg.schedules) : String(data.reinforcement_schedule||'').trim();
    var rein = (data.reinforcers||[]).map(function(x){ return String(x||'').trim(); })
      .filter(function(x){ return x && !/^not specified$/i.test(x) && !/^\[.*\]$/.test(x); });
    if((cfg.reinforcers||[]).length){
      var reinPicked = rein.map(function(x){ return pick(x, cfg.reinforcers); }).filter(Boolean);
      if(reinPicked.length) rein = reinPicked;
    }
    if(!rein.length) rein = reinf.split(',').map(function(x){ return x.trim(); }).filter(Boolean).slice(0, _nReinP);
    // Prompt type and result are CLOSED LISTS in this format.
    var promptUsed = (cfg.promptTypes||[]).length ? pick(data.prompt_used, cfg.promptTypes) : String(data.prompt_used||'').trim();
    if(data.prompts_used && (cfg.promptTypes||[]).length && !promptUsed){
      promptUsed = cfg.promptTypes[Math.floor(Math.random()*cfg.promptTypes.length)];
      flags.push('Prompt ajustado en "' + beh + '"');
    }
    var resultPicked = (cfg.results||[]).length ? pick(data.result, cfg.results) : String(data.result||'').trim();
    if((cfg.results||[]).length && !resultPicked){
      flags.push('Result no coincide con la lista cerrada en "' + beh + '"');
      resultPicked = '';
    }

    // Platform option texts may carry the word "sensory" (e.g. in reinforcer names).
    // It must never reach our note: rewrite it out of the free text we produce.
    var _stripSensory = function(t){
      return String(t||'')
        .replace(/\bsensory\s+toys?\b/gi, 'manipulative items')
        .replace(/\bsensory\s+items?\b/gi, 'manipulative items')
        .replace(/\bsensory\b/gi, 'automatic-reinforcement');
    };
    data.antecedent_interventions = _stripSensory(data.antecedent_interventions);
    data.antecedent = _stripSensory(data.antecedent);
    (data.consequence_interventions||[]).forEach(function(r){ r.description = _stripSensory(r.description); });
    var freeText = [String(data.antecedent||''), String(data.antecedent_interventions||''), String(data.result||'')]
      .concat(cInts.map(function(r){ return r.description; })).join(' ');
    var _tri = ['successfully','effectively','excellently'].filter(function(w){ return new RegExp('\\b'+w+'\\b','i').test(freeText); });
    if(_tri.length) flags.push('lenguaje triunfalista en "' + beh + '"');
    // Catch ranges too ("1 to 3 seconds", "2-5 trials") — the previous pattern missed them.
    var _nums = (freeText.match(/\b\d+\s*(?:to|-|–)\s*\d+\s+(?:\w+\s+){0,2}(?:seconds?|minutes?|times?|occasions?|trials?|opportunities|steps?|prompts?)\b/gi) || [])
      .concat(freeText.match(/\b\d+\s+(?:\w+\s+){0,2}(?:seconds?|minutes?|times?|occasions?|trials?|opportunities|steps?|prompts?)\b/gi) || []);
    _nums = _dropBlockingRange([...new Set(_nums)], freeText);
    if(_nums.length) flags.push('cifras a verificar en "' + beh + '": "' + _nums.slice(0,2).join('", "') + '"');
    var _fnMismatch = _checkFunctionMatch(fn, freeText + ' ' + rein.join(' '));
    if(_fnMismatch) flags.push('"' + beh + '" — ' + _fnMismatch);
    if(!(cfg.results||[]).length && String(data.result||'').trim().split(/\s+/).length < 20){
      flags.push('Result demasiado breve en "' + beh + '"');
    }

    // Field order MUST mirror the AbaMatrix form exactly, so it can be transcribed
    // top to bottom. Note the antecedent interventions come LAST, after the result.
    var L = [];
    L.push('BEHAVIOR & PROGRAM');
    L.push('Behavior: ' + beh);
    L.push('Evidenced By: ' + evid);
    L.push('What was the function of the behavior? ' + fn);
    L.push('What prompted the behavior? (Antecedent): ' + (String(data.antecedent||'').trim() || '[completar]'));
    L.push('After the behavior occurred, what interventions did you implement? (Consequence Interventions)');
    L.push('  Interventions:');
    cInts.forEach(function(r){ L.push('    - ' + r.type + ': ' + r.description); });
    L.push('Which functionally equivalent replacement program did you implement: ' + (rep || '[no validado]'));
    L.push('Goal Implementation:');
    L.push('  What was the teaching procedure used? ' + (proc || '[completar]'));
    L.push('  Did you use any prompts? ' + (data.prompts_used ? 'Yes' : 'No'));
    if(data.prompts_used && promptUsed) L.push('    Please specify prompt used: ' + promptUsed);
    L.push('  What reinforcers were used? ' + rein.join('; '));
    if(sched) L.push('  Schedule of reinforcement used: ' + sched);
    L.push('What was the result of the implemented interventions? ' + (resultPicked || String(data.result||'').trim() || '[completar]'));
    L.push('To prevent the occurrence of the undesired behavior sustained by this function, the RBT implemented the strategies? (Antecedent Interventions)');
    L.push('  Antecedent Interventions: ' + (String(data.antecedent_interventions||'').trim() || '[completar]'));

    // En el formato fusionado la plataforma NO da catalogo de intervenciones
    // antecedentes: ese campo es TEXTO LIBRE, asi que aqui no existe ninguna lista
    // 'aInts'. Se informa como texto libre presente o ausente, no como un recuento
    // que no se puede medir.
    return { block: L.join('\n'), flags: flags,
             counts: { beh: beh, a: (String(data.antecedent_interventions||'').trim() ? 1 : 0), c: cInts.length, anteFree: true },
             used: { beh: beh, rep: rep, fn: fn, ante: String(data.antecedent||'') } };
  } catch(err){
    return { block:'', flags:['error en "' + beh + '": ' + (err.message||err)] };
  }
}

async function _abaBuildOneBehavior(beh, usedThisNote, recentFns){
  var cfg = _abaCfg(_abaClientId);
  // El catalogo "Evidenced By" de AbaMatrix no esta filtrado por conducta: ofrece
  // descriptores de otras clases de respuesta (uno VOCAL bajo Motor Stereotypy,
  // morder o golpearse bajo Off-task). Elegir uno de esos documenta una conducta que
  // no ocurrio. Se estrecha a lo que sustenta la topografia de ESTE cliente; todo lo
  // que queda sigue siendo un valor literal de la plataforma.
  var _topoBehB = (function(){
    var pl = LS.get('aba5_pools_' + _abaClientId) || {};
    var row = normalizeBehaviorArr(pl.mal || []).find(function(x){
      return String(x.name||'').trim().toLowerCase() === String(beh).trim().toLowerCase(); });
    return row ? String(row.topo||'') : '';
  })();
  var evidList = _abaEvidForBehavior((cfg.evidenced||{})[beh] || [], _topoBehB, beh).list;
  var funcList = (cfg.functions||{})[beh] || [];
  if(!evidList.length || !funcList.length){ return { block:'', flags:['sin Evidenced By/función para "' + beh + '"'] }; }
  var prof = (LS.get('aba5_assess_' + _abaClientId) || '').trim();
  prof = _sliceProfileFor(prof, beh);

  try{
    // Interventions depend on the FUNCTION. Build the allowed set for each of this
    // behavior's possible functions, applying the hard clinical veto.
    var dangerous = ABA_DANGEROUS.test(beh);
    // When the export provides a Behavior+Function map, that is the effective list for
    // THIS behavior; options_by_function is only the union across behaviors and would
    // offer procedures the plan does not authorise here. Fall back to the union when
    // the per-behavior map is absent.
    // NOTE: this helper must NOT be called "pick" — a different `pick(value, list)`
    // is declared later in this same function scope for matching the model's answer
    // against a closed list, and two `var pick` in one scope silently overwrite each
    // other, breaking whichever runs after the second assignment.
    var _behKey = String(beh).trim().toLowerCase();
    var _listFor = function(byBehFn, byFn, fn){
      var f = String(fn).toLowerCase();
      var perBeh = (byBehFn||{})[_behKey];
      var list = (perBeh && perBeh[f] && perBeh[f].length) ? perBeh[f] : ((byFn||{})[f] || []);
      if(!Array.isArray(list)) list = [];
      if(dangerous) list = list.filter(function(i){ return !/planned\s*ignoring/i.test(i); });
      return list;
    };
    var intsFor = function(fn){ return _listFor(cfg.interventionsByBehFn, cfg.interventionsByFunction, fn); };
    var consFor = function(fn){ return _listFor(cfg.consequencesByBehFn,  cfg.consequencesByFunction,  fn); };
    var antesFor = function(fn){ return (cfg.antecedents||{})[String(fn).toLowerCase()] || []; };
    var numbered = function(arr){ return arr.map(function(x,i){ return '    ' + (i+1) + '. ' + x; }).join('\n'); };
    var funcBlocks = funcList.map(function(fn){
      var a = antesFor(fn), iv = intsFor(fn), cv = consFor(fn);
      var head = 'IF THE FUNCTION IS "' + fn + '":\n' +
        '  Allowed ANTECEDENTS (choose exactly one, verbatim):\n' + numbered(a) + '\n';
      // When a DISTINCT consequence-intervention list exists (Format A: separate
      // antecedent-intervention and consequence-intervention fields), present the two
      // lists SEPARATELY so consequence interventions are never drawn from the
      // antecedent list. When both lists are the same (Format B, where antecedent
      // interventions are free text), fall back to the single combined list.
      if(cv.length && iv.join('|') !== cv.join('|')){
        return head +
          '  Allowed ANTECEDENT INTERVENTIONS (for the antecedent_interventions field ONLY, verbatim):\n' + numbered(iv) + '\n' +
          '  Allowed CONSEQUENCE INTERVENTIONS (for the consequence_interventions field ONLY \u2014 a SEPARATE list, verbatim):\n' + numbered(cv);
      }
      return head +
        '  Allowed INTERVENTIONS (antecedent and consequence come from this same list):\n' + numbered(iv);
    }).join('\n\n');

    var sys = 'You fill an AbaMatrix Behavior Reduction form for ONE behavior. The free text guides the RBT in writing the session note, so it must be clinically complete and usable.\n\n'
      + 'ABSOLUTE PROHIBITION - NO INVENTED NUMBERS, IN DIGITS OR IN WORDS (\"four out of five trials\", \"eighty percent accuracy\" and \"three occasions\" are the same fabrication as 4/5, 80% and 3 - spelling a figure out does not make it documented): never write a figure that was not provided - no seconds, minutes, counts, trials, "X out of Y", percentages, frequencies or durations. Describe qualitatively, observable and measurable, with NO numbers.\n\n'
      + 'CLOSED LISTS: choose every dropdown value ONLY from the closed list given for that field, copied verbatim. Never invent, modify or combine options.\n\n'
      + 'CLINICAL PRIORITY - READ THIS BEFORE ANYTHING ELSE. The platform\u2019s closed lists are a VOCABULARY, not a clinical criterion. They contain many prefixed items that are naive, impractical or simply ineffective, and some apply to no real case. Selecting an item merely because it appears in the list is worse than useless. Follow this order of authority:\n'
      + '  1. THE ASSESSMENT COMES FIRST. The client\u2019s reduced assessment establishes the behaviors, their functions, the replacement programs, the prompt hierarchy and the reinforcers. Whatever it states prevails over anything the platform offers.\n'
      + '  2. THEN, ESTABLISHED CLINICAL PRACTICE. Use strategies that are proven and effective in real ABA practice - never invent anything, and never choose a token or superficial procedure just to fill the field.\n'
      + '  3. LAST, THE PLATFORM. From the closed list, select ONLY what genuinely applies to this client and this behavior and is actually useful. If several options exist, choose the one that is clinically strongest and functionally correct for the documented function - not the first one, not the easiest, not a generic one.\n'
      + 'If an option in the list is not clinically appropriate for this behavior and function, DO NOT use it. Choose a different one from the list that is. The list constrains the wording you may use; it never dictates the clinical decision.\n\n'      + 'DEPENDENCY CHAIN: the function must be one of the functions allowed for THIS behavior, and the interventions must come from the list(s) allowed for the function you chose. When two SEPARATE lists are shown (Allowed ANTECEDENT INTERVENTIONS and Allowed CONSEQUENCE INTERVENTIONS), the antecedent_interventions field is drawn ONLY from the antecedent list and the consequence_interventions field ONLY from the consequence list \u2014 never cross them. Only when a single combined list is shown are both drawn from it.\n\n'
      + 'INTERVENTIONS - CHOOSE THE CLINICALLY STRONGEST, NOT THE MOST CONVENIENT: the intervention list contains options that are weak or inappropriate for many functions. Select the procedures that are actually indicated for this behavior\u2019s documented function and that are known to work in practice (e.g. for escape: escape extinction plus FCT teaching an appropriate break request; for attention: extinction of attention plus DRA reinforcing the appropriate bid; for tangibles: extinction plus FCT for an appropriate request; for automatic reinforcement: RIRD plus a functionally matched alternative). Never select a superficial or ineffective option just to populate the field.\n\n'      + 'HARD CLINICAL VETO: planned ignoring is NEVER used for aggression, self-injury, elopement, property destruction or TANTRUMS, even if the platform offers it, and this holds for EVERY function of those behaviors - tangible and escape included, not only attention. For a tantrum maintained by TANGIBLE the procedure is extinction of access PLUS teaching the client to REQUEST the item (FCT/mand) reinforced with access; for one maintained by ESCAPE it is escape extinction PLUS an appropriate break/help request reinforced with the break. DRL is never used for dangerous behaviors. Response blocking, if used, lasts only a short period (10-15 seconds).\n\n'
      + KB_FRAME_RULE + '\n\n'
      + KB_DIFFERENTIAL_RULE + '\n\n'
      + 'PLATFORM WORDING vs NOTE WORDING - THEY ARE NOT THE SAME THING: the value you select for a closed-list FIELD must be the platform string, verbatim, because the field only accepts its own options. But the free-text DESCRIPTIONS and the ABC narrative are clinical prose, and there you name the procedure CORRECTLY and describe what was done. Never copy a malformed label into the prose. Specifically: \"Most to lead prompt fading\" is most-to-least prompt fading; \"Planned Ignore\" is planned ignoring; \"Alternate Behaviors (DRA)\" is differential reinforcement of ALTERNATIVE behavior; \"Response Interruption / Redirection (RIR)\" is response interruption and redirection (RIRD). Same procedure, said properly - never a DIFFERENT procedure from the one selected, which would contradict the form.\n\n'
      + 'NEVER DEFINE AN INTERVENTION IN THE DESCRIPTIONS: write what the RBT DID and what the client did in response, in the past tense. Do not explain what the procedure is, what it consists of or what it is for - no "X is defined as...", "X involves...", "X is a technique that...". A definition is padding and the analyst rejects it.\n\n'
      + 'ANTECEDENT vs CONSEQUENCE - DO NOT CONFUSE THEM (most common error):\n'
      + '  ANTECEDENT INTERVENTIONS occur BEFORE the behavior. Proactive and PREVENTIVE: arranging the environment, offering the alternative item in advance, pre-teaching or prompting the replacement, offering choices, reducing the demand, visual schedules, non-contingent reinforcement, behavioral momentum, Premack. Giving the client a fidget BEFORE presenting the task is ANTECEDENT. Pausing the task and offering a preferred item to PREVENT the behavior is ANTECEDENT.\n'
      + '  CONSEQUENCE INTERVENTIONS occur AFTER the behavior has already happened. Reactive: extinction (withholding the maintaining reinforcer), response interruption and redirection, blocking, escape extinction, differential reinforcement delivered contingent on the replacement response. Redirecting the client AFTER the behavior started is CONSEQUENCE.\n'
      + '  NEVER put a preventive strategy in the consequence field, and never put a reactive procedure in the antecedent field.\n\n'
      + 'BALANCE BETWEEN ANTECEDENT AND CONSEQUENCE INTERVENTIONS - BOTH ARE MANDATORY:\n'
      + '  The platform marks the CONSEQUENCE interventions as required by default, so a behavior documented with a rich antecedent side and a thin consequence side is incomplete on the field the platform itself demands. The two sides are not ranked: the antecedent prevents the behavior, the consequence stops it reinforcing once it occurred, and a plan that only prevents leaves the RBT without a documented response when it happens anyway.\n'
      + '  · AT LEAST TWO antecedent interventions AND AT LEAST TWO consequence interventions, each from its own closed list, each with its own developed description. One alone on either side is insufficient documentation.\n'
      + '  · KEEP THEM BALANCED: the two counts must not differ by more than one. Three antecedents with a single consequence is not acceptable documentation - either the third antecedent is unnecessary or a consequence procedure is missing. Decide clinically and make them match.\n'
      + '  · Never pad one side to reach the number. If the function genuinely supports only two consequence procedures, document two of each - do not add a third antecedent just because the list offers more options.\n\n'
      + 'ABC COHERENCE: antecedent, behavior and consequence must read as one functional chain. The antecedent is the specific condition or demand that set the occasion. Each description must be a developed paragraph the RBT can follow, consistent with the function.\n\n'
      + 'NO TRIUMPHALIST OR SUPERLATIVE LANGUAGE: never write that something was done \u201Csuccessfully\u201D, \u201Ceffectively\u201D, \u201Cexcellently\u201D, \u201Cconsistently\u201D as praise, or similar. State plainly what the RBT did and what was observed. Results are not always positive and a partial or poor outcome must be reported as such. Write \u201Cthe RBT interrupted the hand biting\u201D - not \u201Cthe RBT successfully interrupted\u201D.\n\n'
      + 'REINFORCERS - DO NOT INVENT: in your descriptions you may ONLY name reinforcers that are actually configured for this client (listed in the user message). If they are verbal praise and social praise, then praise is what the RBT delivers - never invent snacks, edibles, tokens, stickers, toys or any other reinforcer the client does not have. Naming a reinforcer the client does not have is fabrication.\n\n'
      + 'REINFORCER MUST MATCH THE FUNCTION - THIS IS THE CORE OF THE PROCEDURE: the reinforcer delivered for the replacement behavior must be the SAME reinforcer that maintained the maladaptive behavior. Otherwise the replacement is not functionally equivalent and the procedure does not work.\n'
      + '  - ESCAPE: the replacement (e.g. requesting a break/help) must be reinforced by ESCAPE ITSELF - the break is granted, the demand is briefly removed or reduced. Praise or food alone does NOT reinforce an escape-maintained response.\n'
      + '  - ATTENTION: the replacement (e.g. an appropriate bid for attention) must be reinforced by ATTENTION - the adult turns, makes eye contact, responds, interacts. Praise counts here because praise IS attention.\n'
      + '  - TANGIBLES: the replacement (e.g. an appropriate request) must be reinforced by ACCESS TO THE ITEM or activity requested. Praise alone is not sufficient.\n'
      + '  - AUTOMATIC REINFORCEMENT: the replacement must produce comparable stimulation itself (e.g. the alternative item the client manipulates); the reinforcement is largely built into the alternative response. Social praise may accompany it but is not the functional reinforcer.\n'
      + 'IMPORTANT - THE PLATFORM CATALOG LISTS ITEMS, NOT CONTINGENCIES: the reinforcer list contains objects and activities (snacks, toys, videos, praise). It usually contains NO escape reinforcer, because escape is not an object - it is a contingency (removing or pausing the demand). Therefore:\n'
      + '  - ESCAPE-maintained behavior: select from the catalog whatever the field requires, but the DESCRIPTION must state explicitly that the break was GRANTED and the demand briefly removed or reduced, contingent on the appropriate request. That is the functional reinforcer; without it the replacement is not functionally equivalent. Never present a snack or praise as the reinforcer for an escape-maintained response.\n'
      + '  - ATTENTION: the catalog entries \u201Cattention\u201D and \u201Cverbal praise\u201D ARE the functional reinforcer; state that the adult delivered attention.\n'
      + '  - TANGIBLES: choose the actual item/activity requested and state that access was granted.\n'
      + '  - AUTOMATIC REINFORCEMENT: choose the alternative item that produces comparable stimulation and state that the client engaged with it.\n'
      + 'A reinforcer that does not match the function is a clinical error.\n\n'
      + 'PROHIBITED TERMINOLOGY in the free text: sensory, relaxation, calming, calm, deep breathing, self-regulation, coping, mindfulness, problem solving, conflict resolution, social stories, anger management, art therapy, frustration, stress, anxiety, upset, or any emotional/mentalist language.\n\n'
      + 'CRITICAL - THE WORD \u201CSENSORY\u201D: the platform forces \u201CSensory\u201D as a function value and inside its closed antecedent options, so those fields are selected as-is. But the word must NEVER appear in your free-text descriptions. Do not merely omit it - RESTATE it in stronger clinical terms: a Sensory function is behavior maintained by AUTOMATIC REINFORCEMENT; describe what the item actually provides and what the client actually does. Name the real item (e.g. a fidget toy) and the observable response (e.g. manipulating the item, remaining seated, remaining engaged with the task). Never write \u201Csensory items\u201D, \u201Csensory input\u201D, \u201Csensory breaks\u201D or \u201Ccalm body\u201D. Your descriptions must be clinically MORE precise than the platform wording, while remaining faithful to what happened.\n\n'
      + 'STRICT RBT SCOPE OF PRACTICE - CRITICAL: this is an RBT note (CPT 97153). The RBT IMPLEMENTS the protocol and DOCUMENTS what was observed. The RBT does NOT make clinical judgements, does NOT interpret, does NOT analyse trends, does NOT evaluate progress toward goals, and does NOT suggest or recommend changes to the plan, the protocol or the interventions. Those are the analyst\u2019s responsibility. An RBT writing clinical judgement is a scope-of-practice violation and an audit finding.\n\n'
      + 'PROHIBITED IN AN RBT NOTE (analyst-only language): progress, made progress, improvement, improved, growth, gains, development, advancement, mastery, mastered, learning, learned, understanding, comprehension, effective, effectiveness, successful, appeared to, seemed to, likely, suggests, indicates, demonstrates progress, is responding well, would benefit from, recommend, recommendation, should be adjusted, needs modification, requires a change to the protocol.\n\n'
      + 'CORRECT RBT LANGUAGE: describe only what was observed and done - \u201Cthe client engaged with the task\u201D, \u201Cthe client responded to the gestural prompt\u201D, \u201Cthe behavior occurred and was interrupted\u201D, \u201Cthe client did not respond to the instruction\u201D, \u201Cprompt dependence was documented during this session\u201D. Report the plain observable outcome, including when it was poor. Any clinical conclusion or plan change belongs to the analyst, not here.\n\n'      + 'Third person singular. Output STRICT JSON only.';

    var prompt = 'Behavior worked on this session: "' + beh + '".\n\n'
      + 'CLOSED LIST - Evidenced By (choose exactly one, verbatim):\n' + evidList.map(function(x,i){ return (i+1)+'. '+x; }).join('\n') + '\n\n'
      + 'CLOSED LIST - Function allowed by the platform for THIS behavior (choose exactly one): ' + funcList.join(' | ') + '\n\n'
      + 'HOW TO CHOOSE THE FUNCTION - THIS IS A CLINICAL DECISION, NOT A FREE PICK: the function of this behavior for THIS client is documented in the reduced assessment profile below. Read it and choose the option that matches the documented function. Only if the profile does not state a function for this behavior, choose the one that is clinically most plausible for the behavior as it is defined (e.g. property destruction and aggression are typically maintained by escape, tangibles or attention, rarely by automatic reinforcement; stereotypy and self-injury are commonly automatically maintained). Whatever you choose, the antecedent, the interventions and the replacement must all be coherent with THAT function - the whole chain must hold together clinically.\n\n'
      + ((funcList.length > 1)
          ? 'FUNCTION ROTATION (multiply-maintained behaviors only): '
            + (((recentFns||[]).length)
                ? 'this behavior was documented under these functions in recent notes, MOST RECENT FIRST: ' + (recentFns||[]).slice(0,6).map(function(f){ return '"'+f+'"'; }).join(', ') + '. '
                : '')
            + 'If - AND ONLY IF - the reduced assessment establishes MORE THAN ONE function for this behavior (i.e. it is genuinely multiply-maintained), rotate among the established functions: prefer an established function that is NOT in the recent list above; if every established function already appears, choose the one LOWEST in that list (the least recently used). This rotates the documented function and the whole chain across notes. If the reduced assessment establishes a SINGLE function for this behavior, use that one function every time and DO NOT rotate - never document a function the assessment does not support just for variety.\n\n'
          : '')
      + 'ANTECEDENTS AND INTERVENTIONS ALLOWED PER FUNCTION (use ONLY the sets matching the function you choose):\n' + funcBlocks + '\n\n'
      + 'CLOSED LIST - Main focus (choose exactly one): ' + (cfg.focus||['Reduce the frequency','Other']).join(' | ') + '\n\n'
      + ((usedThisNote && usedThisNote.length)
          ? 'ALREADY DOCUMENTED IN THIS SAME NOTE - choose a DIFFERENT antecedent than these, so each behavior reads as its own distinct episode of the session:\n' + usedThisNote.map(function(u){ return '  - "' + u.beh + '": antecedent "' + u.ante + '"'; }).join('\n') + '\n\n'
          : '')
      + 'CLIENT REDUCED PROFILE (source of truth):\n' + prof + '\n\n'
      + ((typeof _analystCorrectionsBlock === 'function') ? _analystCorrectionsBlock(_abaClientId) : '')
      + ((typeof _universalAnalystBlock === 'function') ? _universalAnalystBlock(_abaClientId) : '')
      + ((typeof _recurringDefectsBlock === 'function') ? _recurringDefectsBlock(_abaClientId) : '')
      + ((typeof _retiredPromptBlock === 'function') ? _retiredPromptBlock(_abaClientId) : '')
      // The plan's own procedures for THIS behavior, when the assessment documents
      // them. The closed list supplies the wording; this supplies the clinical
      // decision, so the form reproduces the planned procedure instead of whatever
      // option happens to look plausible in the catalog.
      + (function(){
           var pl = LS.get('aba5_pools_' + _abaClientId) || {};
           var row = normalizeBehaviorArr((pl && pl.mal) || []).find(function(b){
             return b && String(b.name||'').trim().toLowerCase() === String(beh).trim().toLowerCase();
           });
           var doc = row && String(row.int||'').trim();
           if(!doc) return '';
           return 'INTERVENTIONS THE PLAN DOCUMENTS FOR THIS BEHAVIOR (highest authority — these are this client’s planned procedures):\n' + doc + '\n'
             + 'Choose from the closed lists above the options that CORRESPOND to these planned procedures, matching each to the function you selected. The closed list gives you the permitted wording; this line gives you the clinical decision. If a planned procedure has no equivalent in the closed list for the chosen function, pick the closest functionally correct option and describe the planned procedure in the description field. Do NOT pick a catalog option that contradicts the plan.\n\n';
         })()
      + (function(){ var pl = LS.get('aba5_pools_' + _abaClientId) || {};
           var r = String(pl.reinforcers||'').trim() || ABA_DEFAULT_REINFORCERS.join(', ');
           return 'REINFORCERS OF THIS CLIENT (the ONLY ones you may name):\n' + r + '\n\n'; })()
      + '"antecedent" MUST be copied verbatim from the allowed antecedent list of the function you chose - it is a closed list, never free text, never invented.\n\n'
      + '"result" MUST BE SHORT - ONE OR TWO SENTENCES OF CONCLUSION ONLY. It is not a replay of the session: do NOT narrate the sequence step by step (that already lives in the intervention descriptions). State the observable outcome: whether the client completed the task, whether the behavior was interrupted, reduced or persisted, and whether the replacement response occurred. Qualitative, observable, no numbers, no triumphalist language - a poor or partial result is reported plainly as such.\n\n'
      + _mfcBehReinfLine(_abaClientId, beh)
      + '\n\nReturn STRICT JSON with exactly these keys:\n'
      + '{"evidenced_by":"","function":"","antecedent":"","antecedent_interventions":[{"type":"","description":""}],"consequence_interventions":[{"type":"","description":""}],"main_focus":"","result":""}';

    var raw = await callAPI(prompt, sys, null, _abaClientId, 8192, 0);
    var txt = String(raw||'').replace(/```json|```/g, '').trim();
    var data = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));

    var norm = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
    var pick = function(v, list){ return list.find(function(o){ return norm(o) === norm(v); }) || ''; };
    var flags = [];
    var evid = pick(data.evidenced_by, evidList);
    if(!evid){
      // Fuzzy fallback: match on the longest common wording before giving up. The
      // model sometimes returns the option with different punctuation or a
      // trailing period, which the strict comparison rejects.
      var want = norm(data.evidenced_by);
      if(want){
        evid = evidList.find(function(o){ var n = norm(o); return n.indexOf(want) === 0 || want.indexOf(n) === 0; }) || '';
      }
    }
    if(!evid){
      // This field is REQUIRED in AbaMatrix and must never be blank: take the
      // option from this behavior's own closed list.
      evid = evidList[Math.floor(Math.random() * evidList.length)];
      flags.push('Evidenced By ajustado automáticamente en "' + beh + '" (la IA no devolvió una opción válida)');
    }
    var fn = pick(data['function'], funcList); if(!fn) flags.push('Function');
    var allowed = fn ? intsFor(fn) : [];
    var anteAllowed = fn ? antesFor(fn) : [];
    var ante = pick(data.antecedent, anteAllowed);
    if(!ante) flags.push('Antecedent (no coincide con la lista cerrada de esta función)');
    // Deterministic guard: if this antecedent was already used by another behavior
    // in THIS note, swap it for an unused one from the same function's list.
    var usedAntes = (usedThisNote || []).map(function(u){ return u.ante; }).filter(Boolean);
    if(ante && usedAntes.indexOf(ante) !== -1){
      var free = anteAllowed.filter(function(a){ return usedAntes.indexOf(a) === -1; });
      if(free.length) ante = free[Math.floor(Math.random() * free.length)];
    }
    // Clinical plausibility check: property destruction / aggression maintained by
    // automatic reinforcement is unusual. The platform allows it, so we do not block
    // it - but the BCBA should see the flag and confirm it against the assessment.
    if(/^sensory$/i.test(fn) && /breaking items|aggress|property destruction|elopement/i.test(beh)){
      flags.push('función Sensory en "' + beh + '": clínicamente inusual para esta conducta \u2014 verifica contra el assessment');
    }
    var focus = pick(data.main_focus, cfg.focus||['Reduce the frequency','Other']); if(!focus) flags.push('Main focus');
    var aInts = (data.antecedent_interventions||[]).map(function(r){ return { type: pick(r.type, allowed), description: String(r.description||'').trim() }; }).filter(function(r){ return r.type; });
    // consFor() already resolves the Behavior+Function map, falls back to the union
    // and applies the dangerous-behavior veto, so the validation uses exactly the same
    // list that was shown to the model in the prompt.
    var consAllowed = (fn ? consFor(fn) : []);
    if(!consAllowed.length) consAllowed = allowed;
    var cInts = (data.consequence_interventions||[]).map(function(r){ return { type: pick(r.type, consAllowed), description: String(r.description||'').trim() }; }).filter(function(r){ return r.type; });
    // HARD RULES: corrige selecciones incongruentes (RIRD/Planned Ignoring/antecedentes)
    var _enf = _abaEnforceRules(fn, beh, cInts, consAllowed, allowed);
    cInts = _enf.cInts;
    if(_enf.relocate.length){
      var _seen = {}; aInts.forEach(function(r){ _seen[String(r.type||'').toLowerCase()] = 1; });
      _enf.relocate.forEach(function(r){ if(!_seen[String(r.type||'').toLowerCase()]) aInts.push(r); });
    }
    _enf.notices.forEach(function(n){ flags.push(n); });
    // BALANCE. El aviso solo saltaba con CERO consecuentes, asi que "3 antecedentes
    // y 1 consecuente" pasaba como valido. La plataforma marca las consecuentes por
    // defecto: son obligatorias, y el desequilibrio deja floja justamente la parte
    // que AbaMatrix exige. Se cuenta y se dice, con la conducta y las cifras.
    if(!cInts.length){
      flags.push('"' + beh + '": SIN intervención de consecuencia (AbaMatrix la marca como obligatoria)');
    } else if(cInts.length < 2 || aInts.length < 2 || Math.abs(aInts.length - cInts.length) > 1){
      _recordDefect(_abaClientId, 'balance');
      flags.push('"' + beh + '": desequilibrio antecedente/consecuencia — '
        + aInts.length + ' antecedente(s) y ' + cInts.length + ' consecuente(s); se piden 2 de cada una y que no difieran en más de una');
    }
    // Hard veto backstop
    var vetoed = aInts.concat(cInts).filter(function(r){ return dangerous && /planned\s*ignoring/i.test(r.type); });
    if(vetoed.length){
      aInts = aInts.filter(function(r){ return !/planned\s*ignoring/i.test(r.type); });
      cInts = cInts.filter(function(r){ return !/planned\s*ignoring/i.test(r.type); });
      flags.push('Planned Ignoring descartado (prohibido en conducta peligrosa)');
    }
    // The analyst asked twice to remove the intervention paragraphs and definitions.
    // They are born HERE, in each intervention's description field, so flag the two
    // shapes that produce them: a textbook definition, and an essay-length text.
    (function(){
      var defRe = /\b(is defined as|is a procedure|refers to|consists of|involves|is a technique|is an evidence-based|means that|se define como|que consiste en|consiste en|es un procedimiento|se refiere a)\b/i;
      aInts.concat(cInts).forEach(function(r){
        var d = String(r.description||'').trim();
        if(!d) return;
        if(defRe.test(d)){
          _recordDefect(_abaClientId, 'definicion');
          flags.push('"' + beh + '": la descripción de "' + r.type + '" DEFINE el procedimiento en vez de decir qué se hizo');
        } else if(d.split(/\s+/).length > 90){
          flags.push('"' + beh + '": la descripción de "' + r.type + '" es un párrafo de ' + d.split(/\s+/).length + ' palabras — la analista pide documentar la acción, no explicarla');
        }
      });
    })();
    // GARANTÍA FINAL: AbaMatrix es cerrado — nada fuera de sus listas cerradas
    (function(){
      var nz = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
      var okA = function(t){ return !allowed.length || allowed.some(function(a){ return nz(a)===nz(t); }); };
      var okC = function(t){ return !consAllowed.length || consAllowed.some(function(a){ return nz(a)===nz(t); }); };
      var a0 = aInts.length, c0 = cInts.length;
      aInts = aInts.filter(function(r){ return okA(r.type); });
      cInts = cInts.filter(function(r){ return okC(r.type); });
      if(aInts.length<a0 || cInts.length<c0) flags.push('"'+beh+'": se descartaron selecciones fuera de la lista cerrada de AbaMatrix');
    })();

    var L = [];
    L.push('BEHAVIOR REDUCTION');
    L.push('Behavior: ' + beh);
    L.push('Evidenced By: ' + (evid || '[no validado]'));
    L.push('Function of the behavior: ' + (fn || '[no validado]'));
    L.push('What prompted the behavior (Antecedent): ' + (ante || '[no validado \u2014 elige de la lista en AbaMatrix]'));
    L.push('Antecedent interventions implemented: ' + (aInts.length ? 'Yes' : 'No'));
    aInts.forEach(function(r){ L.push('  - ' + r.type + ': ' + r.description); });
    L.push('Consequence interventions:');
    cInts.forEach(function(r){ L.push('  - ' + r.type + ': ' + r.description); });
    L.push('Main focus of the applied interventions: ' + (focus || '[no validado]'));
    L.push('Result of the implemented interventions: ' + (String(data.result||'').trim() || '[completar]'));
    var block = L.join('\n');

    var freeText = [String(data.result||'')]
      .concat(aInts.map(function(r){ return r.description; }))
      .concat(cInts.map(function(r){ return r.description; })).join(' ');
    var _pools = LS.get('aba5_pools_' + _abaClientId) || {};
    var _known = (String(_pools.reinforcers||'') + ', ' + ABA_DEFAULT_REINFORCERS.join(', ')).toLowerCase();
    var _triumph = ['successfully','effectively','excellently','remarkably','impressively']
      .filter(function(w){ return new RegExp('\\b' + w + '\\b', 'i').test(freeText); });
    if(_triumph.length){ flags.push('lenguaje triunfalista en "' + beh + '": "' + _triumph.join('", "') + '"'); }
    var _inv = ['snack','edible','candy','cookie','chips','chocolate','token','sticker','juice','ice cream']
      .filter(function(w){ return new RegExp('\\b' + w, 'i').test(freeText) && _known.indexOf(w) === -1; });
    if(_inv.length){ flags.push('reforzador no configurado en "' + beh + '": "' + _inv.join('", "') + '"'); }
    if(String(data.result||'').trim().split(/\s+/).length < 20){
      flags.push('Result demasiado breve en "' + beh + '" (debe describir qué pasó tras las intervenciones)');
    }
    var _fnMis = _checkFunctionMatch(fn, freeText);
    if(_fnMis) flags.push('"' + beh + '" — ' + _fnMis);

    // Agency findings: at least two of each, and no preventive strategy filed as a consequence.
    if(aInts.length < 2) flags.push('"' + beh + '": solo ' + aInts.length + ' intervención(es) antecedente(s) — deben ser al menos 2');
    if(cInts.length < 2) flags.push('"' + beh + '": solo ' + cInts.length + ' intervención(es) consecuente(s) — deben ser al menos 2');
    var _preventive = /\b(before (presenting|the task|the demand)|prior to (presenting|the task|the demand)|proactively|in advance|to prevent|pre-?teach|non-?contingent|visual schedule was (used|provided) before)\b/i;
    var _consText = cInts.map(function(r){ return r.description; }).join(' ');
    if(_consText && _preventive.test(_consText)){
      flags.push('"' + beh + '": una intervención CONSECUENTE describe una estrategia preventiva (va en antecedentes)');
    }
    var _resWords = String(data.result||'').trim().split(/\s+/).length;
    if(_resWords > 60) flags.push('"' + beh + '": el Result es demasiado largo (' + _resWords + ' palabras) — debe ser 1-2 oraciones de conclusión');
    var fab = (typeof scanPerfNumbers === 'function') ? scanPerfNumbers(freeText) : [];
    var numHits = freeText.match(/\b\d+\s+(?:\w+\s+){0,2}(?:seconds?|minutes?|times?|occasions?|trials?|opportunities|steps?|prompts?)\b/gi) || [];
    if(fab.concat(numHits).length) flags.push('cifras a verificar: "' + fab.concat(numHits).slice(0,3).join('", "') + '"');

    return { block: block, flags: flags, counts: { beh: beh, a: aInts.length, c: cInts.length }, used: { beh: beh, fn: fn, ante: ante } };
  } catch(err){
    return { block: '', flags: ['error en "' + beh + '": ' + (err.message||err)] };
  }
}

async function _abaBuildOneGoal(chosen, usedThisNote, recentScheds){
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); return; }
  var cfg = _abaCfg(_abaClientId);
  if(!cfg || !(cfg.goals||[]).length){ showMsg('abaMsg','Sube primero el JSON de configuración de este cliente.','err'); return; }
  var prof = (LS.get('aba5_assess_' + _abaClientId) || '').trim();
  // Use the goal chosen by the rotation (passed in as `chosen`). Only fall back to
  // the UI dropdown when this function is invoked standalone with no goal argument.
  // BUG FIX: this line used to UNCONDITIONALLY overwrite `chosen` with the dropdown
  // value (empty by default), discarding the rotated goal and letting the model pick
  // freely - which is why the same ~6 salient goals always appeared out of the 24.
  chosen = chosen || (document.getElementById('abaGiGoal')||{}).value || '';
  // Agency minimums PER PROGRAM for THIS client. The form has to collect them; the
  // narrative writer downstream cannot document a third reinforcer that was never
  // captured here. 0 means this client's agency declares no such minimum.
  prof = _sliceProfileFor(prof, chosen);
  var _poolsG = LS.get('aba5_pools_' + _abaClientId) || {};
  var _min = _programDocMinimums(_poolsG);
  var _nAct  = Math.max(2, _min.activities || 0);
  var _nRein = Math.max(2, _min.reinforcers || 0);
  // When the agency defines the activities allowed FOR THIS PROGRAM, that list is the
  // closed list — not the platform's generic catalog, which is shared by every goal
  // and produces activities the agency does not accept.
  var _pa = _matchProgramActs(_poolsG.progActs, chosen);

  try{
    // Activities: drop the ones whose wording uses prohibited terminology.
    var acts = (cfg.activities||[]).filter(function(a){
      return !/sensory|conflict resolution|art therapy|mindful/i.test(a);
    });
    // …y las que no caben en el sitio donde ocurrio la sesion.
    var _actLoc = (document.getElementById('abaStartLoc')||{}).value || '';
    var _actFilt = _filterActivitiesByPlace(acts, _actLoc);
    if(_actFilt.removed.length){
      console.info('[entorno] actividades fuera del catalogo por no caber en ' + _actLoc + ': ' + _actFilt.removed.join(', '));
    }
    acts = _actFilt.kept;
    // …y se marca —sin quitarla— la que exige habla vocal cuando el reducido de
    // este cliente documenta otra modalidad. Aqui se anota y no se filtra: la
    // actividad que exige la habilidad suele ser la que la ensena.
    var _actAnn = _annotateActsForClient(acts, _poolsG);
    if(_actAnn.flagged.length){
      console.info('[cliente] actividades marcadas por exigir habla vocal: ' + _actAnn.flagged.join(', '));
    }
    if(_actAnn.gendered && _actAnn.gendered.length){
      console.info('[cliente] actividades marcadas por estereotipo sin respaldo en las preferencias documentadas: ' + _actAnn.gendered.join(', '));
    }
    if(_actAnn.check && _actAnn.check.cautious){
      console.info('[cliente] nivel no establecido (' + _actAnn.check.verdict + '): se elige anclado a las actividades documentadas, sin subir ni bajar.');
    }
    acts = _actAnn.list;
    var teach = cfg.teaching || [];
    var scheds = cfg.schedules || [];

    var sys = 'You fill an AbaMatrix Goal Implementation form for ONE acquisition goal. The free text guides the RBT in writing the session note.\n\n'
      + 'ABSOLUTE PROHIBITION - NO INVENTED NUMBERS: no seconds, minutes, counts, trials, "X out of Y", percentages, frequencies or durations. Qualitative observable terms only.\n\n'
      + 'CLOSED LISTS: choose every dropdown value ONLY from the closed list given, copied verbatim. Never invent, modify or combine options.\n\n'
      + 'CLINICAL PRIORITY - READ THIS BEFORE ANYTHING ELSE. The platform\u2019s closed lists are a VOCABULARY, not a clinical criterion. They contain many prefixed items that are naive, impractical or simply ineffective, and some apply to no real case. Selecting an item merely because it appears in the list is worse than useless. Follow this order of authority:\n'
      + '  1. THE ASSESSMENT COMES FIRST. The client\u2019s reduced assessment establishes the behaviors, their functions, the replacement programs, the prompt hierarchy and the reinforcers. Whatever it states prevails over anything the platform offers.\n'
      + '  2. THEN, ESTABLISHED CLINICAL PRACTICE. Use strategies that are proven and effective in real ABA practice - never invent anything, and never choose a token or superficial procedure just to fill the field.\n'
      + '  3. LAST, THE PLATFORM. From the closed list, select ONLY what genuinely applies to this client and this behavior and is actually useful. If several options exist, choose the one that is clinically strongest and functionally correct for the documented function - not the first one, not the easiest, not a generic one.\n'
      + 'If an option in the list is not clinically appropriate for this behavior and function, DO NOT use it. Choose a different one from the list that is. The list constrains the wording you may use; it never dictates the clinical decision.\n\n'      + 'PROHIBITED TERMINOLOGY (never use): sensory, relaxation, calming, deep breathing, self-regulation, self-soothing, coping, mindfulness, meditation, yoga, problem solving, conflict resolution, social stories, anger management, art therapy, frustration, stress, anxiety, upset, or any emotional/mentalist language.\n\n'
      + 'NO TRIUMPHALIST OR SUPERLATIVE LANGUAGE: never write \u201Csuccessfully\u201D, \u201Ceffectively\u201D, \u201Cexcellently\u201D or similar. State plainly what was done and what was observed.\n\n'
      + 'FIELD "prompt_used": if prompts were used you MUST name the specific prompt actually used in this session (e.g. verbal prompt, gestural prompt, model prompt, partial physical prompt, full physical prompt), consistent with the prompt hierarchy in the reduced assessment. Never answer Yes without naming the prompt.\n\n'
      + 'FIELD "reinforcement_schedule": take it from the reduced assessment. Do NOT invent a schedule. If the assessment does not state one, DO NOT fall back to continuous reinforcement: that is the single most repeated error in these notes. Continuous reinforcement is the schedule of INITIAL ACQUISITION - it is used while the response is being established and while the RBT is still learning to run the program. Once the response is being emitted it is THINNED, and a program documented on continuous reinforcement note after note describes a program frozen on its first rung. With no schedule stated, infer it from the stage the profile describes for THIS program (prompt level, independence, whether it is being faded) and choose the ratio or interval schedule that stage supports.\n\n'
      + 'FIELD "teaching_procedure": write ONLY the NAME of the teaching method used - e.g. Discrete Trial Training (DTT), Natural Environment Teaching (NET), Functional Communication Training (FCT), Shaping, Chaining, Behavior Skills Training (BST), Task Analysis, Differential Reinforcement of Alternate Behaviors (DRA), Prompting, Modeling, Errorless Learning. It is a short label, NOT a paragraph. Never restate the goal definition or describe the client\u2019s deficits here - the goal is already stated in its own field.\n\n'
      + 'CLINICAL COHERENCE: the activity must be a plausible vehicle for teaching THIS goal, and the teaching procedure must be the method actually suited to it. In "how_taught", explain how the opportunities were arranged, how the target response was taught, and - if prompts were used - the prompt type and how it was faded. Reinforcement must be tied to the target response, never to a maladaptive behavior. Third person singular, no triumphalist language. Output STRICT JSON only.';

    var prompt = (chosen ? 'The goal worked on this session is: "' + chosen + '".\n\n'
                         : 'Choose the goal worked on this session from the CLOSED LIST, matching the acquisition targets in the reduced profile.\n\n')
      + 'CLOSED LIST - Goals:\n' + (cfg.goals||[]).map(function(x,i){ return (i+1)+'. '+x; }).join('\n') + '\n\n'
      + 'ACTIVITIES - CHOOSE ONLY WHAT IS CLINICALLY USEFUL: this catalog contains many generic or naive activities that do not teach anything meaningful for a given goal. Do NOT pick an activity merely because it is on the list or because its name sounds related. Choose activities that are a genuine, practical teaching vehicle for THIS goal and appropriate for THIS client\u2019s age, communication level and behavioral profile as described in the assessment. If most of the catalog is unsuitable, pick the two that actually work and ignore the rest.\n\n'
      + (_pa
          ? 'CLOSED LIST - Activities AUTHORISED BY THE AGENCY FOR THIS PROGRAM (choose EXACTLY ' + _nAct + ', verbatim and all DIFFERENT). This list REPLACES the platform catalog: an activity outside it is not accepted for this client, however sensible it may sound.\n'
            + _pa.acts.map(function(x,i){ return (i+1)+'. '+x; }).join('\n') + '\n\n'
            + (_pa.prompt ? 'PROMPT DOCUMENTED BY THE AGENCY FOR THIS PROGRAM: ' + _pa.prompt + '. Use it unless the session actually required a different level.\n\n' : '')
          : 'CLOSED LIST - Activities (choose EXACTLY ' + _nAct + ', verbatim and all DIFFERENT - one activity is not enough; this program must be worked through ' + _nAct + ' distinct activities):\n' + acts.map(function(x,i){ return (i+1)+'. '+x; }).join('\n') + '\n'
            + (_actAnn.flagged.length ? 'Text inside square brackets after an activity is a CAUTION ADDRESSED TO YOU about this client, not part of the activity name. Copy only the name that precedes the bracket, never the bracket or its content.\n' : '') + '\n')
      + ((usedThisNote && usedThisNote.length)
          ? 'ALREADY DOCUMENTED IN THIS SAME NOTE - do NOT repeat these goals or their activities; this must be a DIFFERENT goal worked on in the same session:\n' + usedThisNote.map(function(u){ return '  - goal: "' + u.goal + '" (activity: ' + u.acts + ', schedule: ' + (u.sched || 'n/a') + ')'; }).join('\n') + '\n'
            + 'Programs at different stages of their ladders do not share one schedule. If the schedules above already fit those programs, do not simply copy one of them for this one - choose what THIS program\u2019s own stage calls for.\n\n'
          : '')
      + 'CLOSED LIST - Teaching procedure (choose exactly one, verbatim): ' + teach.join(' | ') + '\n\n'
      + 'CLOSED LIST - Schedule of reinforcement (choose exactly one, verbatim): ' + scheds.join(' | ') + '\n\n'
      + ((recentScheds && recentScheds.length)
          ? 'SCHEDULES DOCUMENTED FOR THIS SAME PROGRAM IN RECENT NOTES, MOST RECENT FIRST: ' + recentScheds.slice(0,6).map(function(x){ return '"' + x + '"'; }).join(', ') + '.\n'
            + 'A program does not sit on the same schedule forever: as it advances the schedule thins. Repeating the same value note after note is only correct if the program genuinely has not moved. If it has, document the next step of the thinning, not a copy of the last note.\n\n'
          : '')
      + 'HOW TO CHOOSE THE SCHEDULE - IT IS A CLINICAL DECISION, NOT A DEFAULT: the schedule must reflect where THIS program actually is in its ladder, which the reduced profile documents (steps met, current percentage target, whether the program is new).\n'
      + '  - CONTINUOUS REINFORCEMENT belongs to INITIAL ACQUISITION only: a program just introduced, still errorless, still on full prompts, at the first step of its ladder. It is the schedule a program spends the LEAST time on. Do NOT select it for a program that has already met steps or whose prompts are being faded.\n'
      + '  - Once the response is being emitted and prompts are fading, the schedule is THINNED: fixed ratio (FR2, FR3...), then variable ratio, or an interval schedule (FI/VI) when the target is time-based such as staying on task or waiting.\n'
      + '  - A replacement/alternative behavior program is usually reinforced on a DIFFERENTIAL schedule: DRA for an alternative response, DRI for an incompatible one, DRO for the absence of the behavior over an interval.\n'
      + '  - Time-based or waiting targets (time on task, waiting for attention, tolerating delay) fit interval or time schedules (FI, VI, FT, VT) better than ratio ones.\n'
      + 'If the profile states a thinning plan, follow it. Selecting Continuous Reinforcement for every program is a documentation error: pick what this program\u2019s stage actually calls for.\n\n'
      // Criterios generales destilados: solo resuelven lo que el plan del cliente
      // no resuelve. Van DESPUES del perfil por eso mismo.
      + _activitySettingRule((document.getElementById('abaStartLoc')||{}).value || '') + '\n\n'
      + _activityFitsClientRule(_poolsG, (document.getElementById('abaStartLoc')||{}).value || '') + '\n\n'
      + KB_FRAME_RULE + '\n\n'
      + KB_SCHEDULE_STAGE_RULE + '\n\n'
      + KB_PROMPT_HIERARCHY_RULE + '\n\n'
      + KB_REINFORCER_RULE + '\n\n'
      + 'CLIENT REDUCED PROFILE (source of truth - acquisition targets, teaching methods, prompt hierarchy, reinforcers):\n' + prof + '\n\n'
      + ((typeof _analystCorrectionsBlock === 'function') ? _analystCorrectionsBlock(_abaClientId) : '')
      + ((typeof _universalAnalystBlock === 'function') ? _universalAnalystBlock(_abaClientId) : '')
      + ((typeof _recurringDefectsBlock === 'function') ? _recurringDefectsBlock(_abaClientId) : '')
      + ((typeof _retiredPromptBlock === 'function') ? _retiredPromptBlock(_abaClientId) : '')
      + (function(){ var pl = LS.get('aba5_pools_' + _abaClientId) || {}; var r = String(pl.reinforcers||'').trim();
           return r ? 'REINFORCERS CONFIGURED FOR THIS CLIENT (use these):\n' + r + '\n\n' : ''; })()
      + 'REINFORCERS: this field is free text in AbaMatrix. Fill "reinforcers" with the ACTUAL reinforcers of this client, taken from the reduced profile or from the reinforcers configured for the client. If neither states any, use "verbal praise" and "social praise" - they are universal ABA reinforcers and always applicable. NEVER write placeholder text such as "Not specified", never leave it empty, and never write an instruction - write the reinforcers themselves.\n\n'
      + 'INTERNAL COHERENCE - PROMPTS: if the teaching procedure you choose IS a prompting procedure (Prompting, Errorless Learning, most-to-least, least-to-most) or your description mentions prompting the client, then "prompts_used" MUST be true and "prompt_used" MUST name the level. Choosing "Prompting" and answering that no prompts were used is a contradiction the analyst rejects. If the program genuinely ran without prompts, choose a teaching procedure that is not prompt-based.\n\n'
      + ((_min.reinforcers || _min.activities || _min.social)
          ? 'AGENCY MINIMUMS FOR THIS CLIENT - EVERY ONE IS MANDATORY FOR THIS PROGRAM (this client\u2019s organisation requires them; a program missing any of them makes the note non-conforming):\n'
            + (_min.activities  ? '  - at least ' + _min.activities + ' DIFFERENT activities used to work this skill.\n' : '')
            + (_min.reinforcers ? '  - at least ' + _min.reinforcers + ' reinforcers documented for this program.\n' : '')
            + (_min.social      ? '  - at least ' + _min.social + ' DISTINCT types of SOCIAL reinforcement among them, each NAMED SPECIFICALLY. The bare phrases "verbal praise", "social praise" and "praise" are NOT acceptable on their own: name the form delivered - ' + ABA_SOCIAL_REINFORCER_TYPES.join(', ') + '. Two wordings of praise are ONE type, not two.\n' : '')
            + 'Draw them ONLY from what this client actually has (the reinforcers configured for the client and the closed activity list). Meeting a minimum NEVER licenses inventing a reinforcer or an activity.\n\n'
          : '')
      + 'Return STRICT JSON with exactly these keys (values only, never instructions):\n'
      + '{"goal":"","activities":[' + new Array(_nAct).fill('""').join(',') + '],"teaching_procedure":"","how_taught":"","prompts_used":true,"prompt_used":"","reinforcers":[' + new Array(_nRein).fill('""').join(',') + '],"reinforcement_schedule":""}';

    var raw = await callAPI(prompt, sys, null, _abaClientId, 8192, 0);
    var txt = String(raw||'').replace(/```json|```/g, '').trim();
    var data = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));

    var norm = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
    var pick = function(v, list){ return list.find(function(o){ return norm(o) === norm(v); }) || ''; };
    var flags = [];
    var goal = chosen || pick(data.goal, cfg.goals||[]); if(!goal) flags.push('Goal');
    var _actPool = _pa ? _pa.acts : acts;
    var pickedActs = (data.activities||[]).map(function(a){ return pick(a, _actPool); }).filter(Boolean);
    // Keep only distinct ones: repeating an activity does not satisfy "N different".
    pickedActs = pickedActs.filter(function(v, i){ return pickedActs.indexOf(v) === i; });
    if(!pickedActs.length) flags.push('Activities');
    if(_pa && (data.activities||[]).length > pickedActs.length){
      flags.push('"' + (chosen||'programa') + '": se descartaron actividades fuera de la lista de la agencia para este programa');
    }
    // Teaching procedure is FREE TEXT in AbaMatrix (confirmed in the client's JSON):
    // only validate it against a closed list if the platform actually provides one.
    var proc = teach.length ? pick(data.teaching_procedure, teach) : String(data.teaching_procedure||'').trim();
    if(teach.length && !proc) flags.push('Teaching procedure');
    // The field is a method LABEL. If the model wrote a definition/paragraph, try to
    // recover the actual method name; otherwise flag it rather than print an essay.
    if(proc && proc.split(/\s+/).length > 12){
      var METHODS = ['Discrete Trial Training (DTT)','Natural Environment Teaching (NET)','Functional Communication Training (FCT)','Behavior Skills Training (BST)','Differential Reinforcement of Alternate Behaviors (DRA)','Differential Reinforcement of Incompatible Behaviors (DRI)','Differential Reinforcement of Other Behaviors (DRO)','Task Analysis','Errorless Learning','Incidental Teaching','Mand Training','Modeling','Prompting','Shaping','Chaining','Token Economy','Visual Supports','Role play','Activity Schedules'];
      var hit = METHODS.find(function(m){ return proc.toLowerCase().indexOf(m.toLowerCase()) !== -1; })
             || METHODS.find(function(m){ var k = m.replace(/\s*\(.*\)/,''); return proc.toLowerCase().indexOf(k.toLowerCase()) !== -1; });
      if(hit){ proc = hit; }
      else { flags.push('Teaching procedure: la IA escribió una definición en vez del método'); proc = ''; }
    }
    var sched = pick(data.reinforcement_schedule, scheds); if(!sched) flags.push('Schedule');
    /* CONTINUOUS REINFORCEMENT: se corrige, no se pide.

       Esto ya se habia senalado y se resolvio solo con reglas de prompt; siguio
       ocurriendo. El refuerzo continuo pertenece a la ADQUISICION INICIAL: se usa al
       introducir el programa, mientras se ensena al cliente y al propio RBT. Una vez
       la respuesta se emite, el esquema se DENSIFICA A RAZON o INTERVALO. Repetirlo
       nota tras nota describe un programa congelado en su primer escalon y es un
       hallazgo de auditoria.

       El guard solo respeta el CRF cuando el perfil del programa dice que esta en
       adquisicion inicial. En cualquier otro caso, si el programa ya llevaba CRF en
       su nota anterior, se sustituye por la opcion NO continua menos usada
       recientemente. La sustitucion sale siempre en los avisos: nunca es silenciosa. */
    var _isCRF = function(x){ return /continuous\s*reinforcement|\bCRF\b|\bFR\s*-?\s*1\b/i.test(String(x||'')); };
    if(sched && _isCRF(sched)){
      var _initialAcq = /initial acquisition|newly introduced|new program|recently introduced|baseline|errorless|acquisition phase|just introduced|en adquisici|programa nuevo|reci[eé]n introducid/i.test(String(prof||''));
      // No basta con mirar la nota anterior: comprobar solo eso deja el patron
      // CRF -> FR -> CRF -> VR, que sigue documentando refuerzo continuo un dia si y
      // otro no. La adquisicion inicial es, por definicion, el comienzo: si este
      // programa YA se documento antes, no se esta introduciendo. Solo el perfil,
      // diciendo que sigue en adquisicion, mantiene el CRF.
      var _yaDocumentado = (recentScheds||[]).length > 0;
      if(!_initialAcq && _yaDocumentado){
        // Menos usada recientemente entre las NO continuas de la lista cerrada.
        var _alt = (scheds||[]).filter(function(x){ return !_isCRF(x); });
        if(_alt.length){
          var _rank = function(x){
            var i = (recentScheds||[]).findIndex(function(r){ return String(r).toLowerCase() === String(x).toLowerCase(); });
            return i === -1 ? 999 : (recentScheds.length - i);   // no usada -> la mejor
          };
          _alt.sort(function(x, y){ return _rank(y) - _rank(x); });
          var _new = _alt[0];
          _recordDefect(_abaClientId, 'crf');
          flags.push('"' + (chosen || 'programa') + '": esquema cambiado de "' + sched + '" a "' + _new
            + '" — el refuerzo continuo ya se documentó en la nota anterior y este programa no consta en adquisición inicial');
          sched = _new;
        } else {
          flags.push('"' + (chosen || 'programa') + '": repite refuerzo continuo y el catálogo del cliente no ofrece ninguna alternativa — revisa el JSON del Daily Log');
        }
      }
    }
    var rein = (data.reinforcers||[]).map(function(x){ return String(x||'').trim(); })
      .filter(function(x){
        // Reject placeholders and any instruction text the model may have echoed.
        return x && !/^not specified$/i.test(x) && !/^\[.*\]$/.test(x)
               && !/take them from|free text here|source of truth|profile/i.test(x);
      });
    if(!rein.length){
      var _pl = LS.get('aba5_pools_' + _abaClientId) || {};
      var _pr = String(_pl.reinforcers||'').split(',').map(function(x){ return x.trim(); }).filter(Boolean);
      if(_pr.length){
        rein = _pr.slice(0, _nRein);
      } else {
        // NORM: when the assessment omits reinforcers (an analyst error we cannot
        // fix), the note still needs them. Social reinforcement is universal in ABA
        // and always applicable — but it must be named in DISTINCT forms, never as
        // "verbal praise" twice, which satisfies no agency asking for variety.
        rein = _socialReinforcerFallback(Math.max(_nRein, _min.social || 0));
      }
    }
    var how = String(data.how_taught||'').trim();
    var prompts = data.prompts_used ? 'Yes' : 'No';

    var free = how;
    var nums = free.match(/\b\d+\s+(?:\w+\s+){0,2}(?:seconds?|minutes?|times?|occasions?|trials?|opportunities|steps?|prompts?)\b/gi) || [];
    var fab = (typeof scanPerfNumbers === 'function') ? scanPerfNumbers(free) : [];
    if(nums.concat(fab).length) flags.push('cifras a verificar: "' + nums.concat(fab).slice(0,3).join('", "') + '"');
    var badWords = ['sensory','relaxation','calming','calm body','deep breathing','self-regulation','coping','mindfulness','conflict resolution','social stories','anger management','art therapy','frustration','stress','anxiety','upset'];
    var found = badWords.filter(function(w){ return new RegExp('\\b' + w.replace(/[-\/]/g,'[-\\s/]?') + '\\b','i').test(free); });
    if(found.length) flags.push('terminología prohibida: "' + found.join('", "') + '"');

    var L = [];
    L.push('GOAL IMPLEMENTATION');
    // Agency findings: two activities per replacement; the prompt must be named.
    if(pickedActs.length < 2){
      flags.push('"' + (goal||chosen) + '": solo ' + pickedActs.length + ' actividad(es) — deben ser 2 por replacement');
    }
    var promptSpec = String(data.prompt_used||'').trim();
    // A teaching procedure that IS prompting cannot coexist with "no prompts used" —
    // the analyst flagged exactly this contradiction. Resolve it deterministically:
    // the procedure is the stronger statement, so prompts become Yes, and the level
    // comes from the agency's documented prompt for this program when it was left
    // blank. Errorless learning and the fading hierarchies are prompt-based too.
    var _procIsPrompting = /prompt|errorless|most.?to.?least|least.?to.?most/i.test(String(proc||'') + ' ' + String(how||''));
    if(_procIsPrompting && prompts === 'No'){
      prompts = 'Yes';
      if(!promptSpec && _pa && _pa.prompt) promptSpec = _pa.prompt;
      flags.push('"' + (goal||chosen) + '": el procedimiento era de prompting y venía marcado "No prompts used" — corregido a "Yes"' + (promptSpec ? ' (' + promptSpec + ')' : ', falta especificar cuál'));
    }
    if(prompts === 'Yes' && !promptSpec && _pa && _pa.prompt) promptSpec = _pa.prompt;
    if(prompts === 'Yes' && !promptSpec){
      flags.push('"' + (goal||chosen) + '": se marcó "Yes" en prompts pero no se especificó cuál');
    }
    L.push('Goal Implementation: ' + (goal || '[no validado]'));
    L.push('Activities used for implementation: ' + (pickedActs.length ? pickedActs.join('; ') : '[no validado]'));
    L.push('Teaching procedure used: ' + ((proc || how) ? (proc ? proc + (how ? ' — ' + how : '') : how) : '[completar]'));
    L.push('Did you use any prompts: ' + prompts + (prompts === 'Yes' && promptSpec ? ' — ' + promptSpec : (prompts === 'Yes' ? ' — [especificar el prompt]' : '')));
    if(prompts === 'No' && /prompt/i.test(String(how||''))){
      flags.push('"' + (goal||chosen) + '": la descripción menciona prompts pero el campo quedó en "No"');
    }
    L.push('Reinforcers used: ' + (rein.length ? rein.join('; ') : '[completar]'));
    L.push('Schedule of reinforcement used: ' + (sched || '[no validado]'));
    // Deterministic check of this client's agency minimums. The prompt asks for them;
    // this verifies what actually came back, so a shortfall is visible instead of
    // silently shipping a non-conforming program.
    (function(){
      var g = goal || chosen || 'programa';
      if(_min.activities && pickedActs.length < _min.activities){
        flags.push('"' + g + '": ' + pickedActs.length + ' actividad(es), la agencia exige ' + _min.activities);
      }
      if(_min.reinforcers && rein.length < _min.reinforcers){
        flags.push('"' + g + '": ' + rein.length + ' reforzador(es), la agencia exige ' + _min.reinforcers);
      }
      if(_min.social){
        // Count DISTINCT social types, not distinct wordings: several phrasings of
        // praise are one type, which is exactly what the requirement forbids.
        var TYPES = [
          { k:'praise',    re:/praise|recognition|reconocimiento|elogio|good job|well done/i },
          { k:'highfive',  re:/high\s*-?\s*five|choca|chocar/i },
          { k:'thumbsup',  re:/thumbs?\s*-?\s*up|pulgar/i },
          { k:'applause',  re:/applause|clap|aplauso|palmada/i },
          { k:'smile',     re:/smile|sonris/i },
          { k:'social',    re:/social interaction|interacci[oó]n social|hug|abrazo|tickle|cosquilla/i }
        ];
        var joined = rein.join(' | ');
        var hits = TYPES.filter(function(t){ return t.re.test(joined); }).length;
        if(hits < _min.social){
          flags.push('"' + g + '": ' + hits + ' tipo(s) de reforzador social, la agencia exige ' + _min.social + ' distintos (no basta con variar la redacción de "praise")');
        }
      }
      if(_min.schedule && !sched){
        flags.push('"' + g + '": sin esquema de reforzamiento, y la agencia lo exige en TODOS los programas');
      }
    })();
    return { block: L.join('\n'), flags: flags, used: { goal: goal || chosen, acts: pickedActs.join('; '), sched: sched } };
  } catch(err){
    return { block: '', flags: ['error en "' + chosen + '": ' + (err.message||err)] };
  }
}


// ---- 4 behaviors + 4 goals per note, rotated across notes ------------------
// Uses the same recency-weighted soft rotation as the rest of the system:
// recently used items are less likely, never impossible, and the exact set is
// never repeated from one note to the next.
// RANDOM ROTATION with strong turnover. Rewritten to be simple and predictable:
//  - returns EXACTLY n items whenever the pool holds at least n (a note always
//    documents the requested 4);
//  - the order is fully randomized every note (Fisher-Yates shuffle);
//  - the items used in the immediately-prior note are held back FIRST, so nothing
//    repeats back-to-back while fresh candidates remain. When the pool is smaller
//    than 2n a few must recur (a mathematical floor: 2n - pool of them), but WHICH
//    ones recur is randomized each note and the fresh items always lead.
function _abaRotatePick(pool, usage, n){
  if(!pool || !pool.length) return [];
  n = Math.min(n, pool.length);
  usage = Array.isArray(usage) ? usage : [];
  var shuffle = function(a){
    a = a.slice();
    for(var i = a.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  var lastNote = usage.slice(-n);
  var fresh  = shuffle(pool.filter(function(x){ return lastNote.indexOf(x) < 0; }));
  var recent = shuffle(pool.filter(function(x){ return lastNote.indexOf(x) >= 0; }));
  return fresh.concat(recent).slice(0, n);
}

// Select N behaviors ROTATED BY FUNCTION so the note's replacements rotate too.
// Behaviors are grouped by function class; each note spreads across the different
// functions (round-robin) and, within a function, picks the least-recently-used
// behavior first. Across sessions this rotates both which behaviors appear and,
// with them, the functionally equivalent replacements they carry. Falls back to
// returning all behaviors when the client has N or fewer usable behaviors (no
// subset to rotate — in that case only per-behavior function rotation applies).
// Behavior selection now uses the SAME random rotation as the goals (4 and 4,
// randomized, with strong turnover against the immediately-prior note). The
// previous function-class round-robin kept landing on the same behaviors; a plain
// randomized rotation spreads them and never repeats back-to-back while the pool
// allows. Each behavior still carries its own function-matched intervention when
// the note is written, so this function no longer needs the client config (cfg).
/* ── Validacion explicita de lo que esta en curso ─────────────────────────────
   El filtro automatico compara el nombre de la ficha con el del JSON de AbaMatrix,
   y esos dos nombres no siempre son el mismo texto: la plataforma escribe "Off Task
   Behavior" donde el reducido dice "Off-task". Cuando no casan, o el filtro deja
   pasar algo retirado, o descarta algo que si se trabaja. Ninguna de las dos es
   aceptable, y ninguna se ve hasta leer la nota.

   Por eso la ultima palabra es del usuario: aqui se marca, sobre los nombres REALES
   del JSON, que se esta trabajando. El sistema solo elige de entre lo marcado. La
   propuesta inicial sale del estado de la ficha, asi que en el caso normal no hay
   nada que hacer; y la decision se guarda por cliente.                            */
function _abaActiveKey(clientId){ return 'aba5_abaactive_' + clientId; }

function _abaActiveSaved(clientId){
  var v = LS.get(_abaActiveKey(clientId));
  return (v && typeof v === 'object') ? v : null;
}

// Propuesta desde la ficha: activo o nuevo -> marcado; masterizado, en pausa o
// ausente de la ficha -> desmarcado, con el motivo a la vista.
function _abaProposeActive(clientId, cfg){
  var out = { beh: {}, goal: {}, why: {} };
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var idx = function(type){
    var m = {};
    normalizeBehaviorArr(pools[type] || []).forEach(function(x){
      if(x && x.name) m[String(x.name).trim().toLowerCase()] = (x.status || 'active');
    });
    return m;
  };
  var mal = idx('mal'), rep = idx('rep');
  var decide = function(name, map, hayFicha){
    var st = map[String(name).trim().toLowerCase()];
    if(st === 'active' || st === 'new') return { on: true, why: '' };
    if(st === 'mastered') return { on: false, why: 'masterizado en la ficha' };
    if(st === 'onhold')   return { on: false, why: 'en pausa en la ficha' };
    if(!hayFicha)         return { on: true,  why: 'la ficha no tiene nada registrado de este tipo' };
    return { on: false, why: 'no está en la ficha (retirado o con otro nombre)' };
  };
  var hayMal = Object.keys(mal).length > 0, hayRep = Object.keys(rep).length > 0;
  (cfg.behaviors || []).forEach(function(b){
    var d = decide(b, mal, hayMal); out.beh[b] = d.on; if(d.why) out.why['b:' + b] = d.why;
  });
  (cfg.goals || []).forEach(function(g){
    var d = decide(g, rep, hayRep); out.goal[g] = d.on; if(d.why) out.why['g:' + g] = d.why;
  });
  return out;
}

// Estado efectivo: lo guardado por el usuario, completado con la propuesta para
// cualquier item que el JSON haya traido despues de la ultima confirmacion.
function _abaActiveState(clientId){
  var cfg = _abaCfg(clientId);
  if(!cfg) return null;
  var prop = _abaProposeActive(clientId, cfg);
  var saved = _abaActiveSaved(clientId);
  if(!saved) return prop;
  var out = { beh: {}, goal: {}, why: prop.why };
  (cfg.behaviors || []).forEach(function(b){ out.beh[b] = (b in (saved.beh||{})) ? !!saved.beh[b] : prop.beh[b]; });
  (cfg.goals || []).forEach(function(g){ out.goal[g] = (g in (saved.goal||{})) ? !!saved.goal[g] : prop.goal[g]; });
  return out;
}

function _abaActiveList(clientId, kind){
  var st = _abaActiveState(clientId);
  if(!st) return null;
  var src = kind === 'goal' ? st.goal : st.beh;
  var on = Object.keys(src).filter(function(k){ return src[k]; });
  return on;
}

function _abaActiveSave(){
  if(!_abaClientId) return;
  var st = { beh: {}, goal: {} };
  Array.prototype.slice.call(document.querySelectorAll('.abaActBeh')).forEach(function(c){ st.beh[c.value] = c.checked; });
  Array.prototype.slice.call(document.querySelectorAll('.abaActGoal')).forEach(function(c){ st.goal[c.value] = c.checked; });
  LS.set(_abaActiveKey(_abaClientId), st);
  _abaRenderActive();
}

function _abaActiveFromCard(){
  if(!_abaClientId) return;
  LS.del(_abaActiveKey(_abaClientId));
  _abaRenderActive();
}

function _abaActiveSetAll(on){
  Array.prototype.slice.call(document.querySelectorAll('.abaActBeh,.abaActGoal')).forEach(function(c){ c.checked = !!on; });
  _abaActiveSave();
}

function _abaRenderActive(){
  var box = document.getElementById('abaActiveBox');
  var cnt = document.getElementById('abaActiveCount');
  if(!box) return;
  if(!_abaClientId){ box.innerHTML = '<span style="color:var(--text3)">Selecciona un cliente.</span>'; if(cnt) cnt.textContent=''; return; }
  var cfg = _abaCfg(_abaClientId);
  if(!cfg){ box.innerHTML = '<span style="color:var(--text3)">Sube primero el JSON del Daily Log de este cliente.</span>'; if(cnt) cnt.textContent=''; return; }
  var st = _abaActiveState(_abaClientId);
  var esc = function(x){ return String(x||'').replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); };
  var row = function(name, on, why, cls){
    return '<label style="display:flex;gap:7px;align-items:flex-start;padding:2px 0;cursor:pointer;color:' + (on ? 'var(--text2)' : 'var(--text3)') + '">'
      + '<input type="checkbox" class="' + cls + '" value="' + esc(name) + '"' + (on ? ' checked' : '')
      + ' onchange="_abaActiveSave()" style="accent-color:var(--blue);margin-top:3px;flex-shrink:0">'
      + '<span>' + esc(name) + (why ? ' <span style="color:var(--amber,#b86c00);font-size:10px">— ' + esc(why) + '</span>' : '') + '</span></label>';
  };
  var behs = (cfg.behaviors || []), goals = (cfg.goals || []);
  var h = '';
  if(behs.length){
    h += '<div style="font-size:10px;font-family:var(--mono);color:var(--text3);letter-spacing:.04em;margin-top:2px">CONDUCTAS</div>'
      + behs.map(function(b){ return row(b, st.beh[b], st.why['b:' + b], 'abaActBeh'); }).join('');
  }
  if(goals.length){
    h += '<div style="font-size:10px;font-family:var(--mono);color:var(--text3);letter-spacing:.04em;margin-top:8px">PROGRAMAS / METAS</div>'
      + goals.map(function(g){ return row(g, st.goal[g], st.why['g:' + g], 'abaActGoal'); }).join('');
  }
  box.innerHTML = h || '<span style="color:var(--text3)">El JSON no trae conductas ni metas.</span>';
  var nB = behs.filter(function(b){ return st.beh[b]; }).length;
  var nG = goals.filter(function(g){ return st.goal[g]; }).length;
  if(cnt) cnt.textContent = nB + '/' + behs.length + ' conductas · ' + nG + '/' + goals.length + ' metas en curso';
}

/* Elegir a mano las metas de ESTA sesion. Hasta ahora solo se podia fijar cuantas y
   el sistema rotaba; cuando el RBT sabe exactamente que trabajo ese dia, no habia
   forma de decirlo y tocaba aceptar la rotacion o regenerar hasta que saliera.
   La eleccion se guarda por cliente para que sobreviva a una recarga, y se vacia con
   un boton para volver a la rotacion automatica.                                  */
function _abaPickedGoals(clientId){
  var v = LS.get('aba5_abapickgoals_' + clientId);
  return Array.isArray(v) ? v : [];
}

function _abaSavePickedGoals(){
  if(!_abaClientId) return;
  var sel = Array.prototype.slice.call(document.querySelectorAll('.abaPickGoal:checked')).map(function(c){ return c.value; });
  LS.set('aba5_abapickgoals_' + _abaClientId, sel);
  _abaRenderPickGoals();
}

function _abaClearPickedGoals(){
  if(!_abaClientId) return;
  LS.del('aba5_abapickgoals_' + _abaClientId);
  _abaRenderPickGoals();
}

function _abaTogglePickGoals(){
  var box = document.getElementById('abaPickGoalsBox');
  if(!box) return;
  var open = box.style.display !== 'none';
  box.style.display = open ? 'none' : 'block';
  if(!open) _abaRenderPickGoals();
}

function _abaRenderPickGoals(){
  var box = document.getElementById('abaPickGoalsBox');
  var info = document.getElementById('abaPickGoalsInfo');
  if(!box) return;
  if(!_abaClientId){ box.innerHTML = '<span style="color:var(--text3)">Selecciona un cliente.</span>'; if(info) info.textContent=''; return; }
  var cfg = _abaCfg(_abaClientId);
  if(!cfg){ box.innerHTML = '<span style="color:var(--text3)">Sube primero el JSON del Daily Log.</span>'; if(info) info.textContent=''; return; }
  // Solo entre las que estan EN CURSO: elegir a mano no puede saltarse lo
  // masterizado ni lo retirado.
  var enCurso = _abaActiveList(_abaClientId, 'goal') || (cfg.goals || []);
  var picked = _abaPickedGoals(_abaClientId);
  var quota = _abaCardQuota(_abaClientId).goal;
  var esc = function(x){ return String(x||'').replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); };
  if(!enCurso.length){
    box.innerHTML = '<span style="color:var(--text3)">Este cliente no tiene metas marcadas como en curso.</span>';
    if(info) info.textContent = '';
    return;
  }
  box.innerHTML = '<div style="font-size:10px;color:var(--text3);margin-bottom:5px">Marca las metas que se trabajaron hoy. Si no marcas ninguna, el sistema rota entre las que están en curso, como hasta ahora.</div>'
    + enCurso.map(function(g){
        return '<label style="display:flex;gap:7px;align-items:flex-start;padding:2px 0;cursor:pointer;color:var(--text2)">'
          + '<input type="checkbox" class="abaPickGoal" value="' + esc(g) + '"' + (picked.indexOf(g) !== -1 ? ' checked' : '')
          + ' onchange="_abaSavePickedGoals()" style="accent-color:var(--blue);margin-top:3px;flex-shrink:0">'
          + '<span>' + esc(g) + '</span></label>';
      }).join('')
    + '<button class="btn btn-outline" style="padding:3px 10px;font-size:10px;margin-top:6px" onclick="_abaClearPickedGoals()">Volver a la rotación automática</button>';
  if(info){
    if(!picked.length){ info.textContent = 'rotación automática · ' + quota + ' por nota'; info.style.color = 'var(--text3)'; }
    else {
      info.textContent = picked.length + ' elegida(s) a mano' + (picked.length !== quota ? ' (la casilla dice ' + quota + ' — manda tu elección)' : '');
      info.style.color = 'var(--blue)';
    }
  }
}

function _abaSelectBehaviorsByFunction(usable, usage, n){
  return _abaRotatePick(usable, usage, n);
}

// How many cards a note carries. This is an AGENCY rule and differs per client, so
// there are three sources, in order of authority:
//   1. what the user set in the boxes for THIS client (pools.quota) — always wins;
//   2. the quota the agency declares in the client's reduced assessment (docreq);
//   3. AbaMatrix's own default of 4.
// Nothing here is global: a client that sets or declares nothing keeps its 4.
function _abaCardQuota(clientId){
  var out = { mal: 4, goal: 4, declared: false, source: 'default' };
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var q = pools.quota || {};
  var okN = function(v){ v = parseInt(v, 10); return (v >= 1 && v <= 8) ? v : 0; };
  if(okN(q.mal) || okN(q.goal)){
    if(okN(q.mal))  out.mal  = okN(q.mal);
    if(okN(q.goal)) out.goal = okN(q.goal);
    out.declared = true;
    out.source = 'manual';
    return out;
  }
  var t = String(pools.docreq || '').toLowerCase();
  if(!t) return out;
  var words = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8,
                uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8 };
  var num = function(s){ s = String(s).trim(); return words[s] !== undefined ? words[s] : parseInt(s, 10); };
  var N = '(\\d+|one|two|three|four|five|six|seven|eight|uno|dos|tres|cuatro|cinco|seis|siete|ocho)';
  var mB = t.match(new RegExp(N + '\\s+(?:target\\s+|maladaptive\\s+|problem\\s+)?(?:behaviors?|conductas?)'));
  if(mB){ var v = num(mB[1]); if(v >= 1 && v <= 8){ out.mal = v; out.declared = true; out.source = 'assessment'; } }
  var mG = t.match(new RegExp(N + '\\s+(?:replacement|goal|program|reemplazo|meta)\\w*'));
  if(mG){ var w = num(mG[1]); if(w >= 1 && w <= 8){ out.goal = w; out.declared = true; out.source = 'assessment'; } }
  return out;
}

// Persist the quota the user typed for THIS client. It lives inside `pools` because
// that record already syncs per client to Supabase; a separate key would need its own
// column. Writing it here makes the boxes authoritative from the next note onwards.
function _abaSaveQuota(){
  if(!_abaClientId) return;
  var g = function(id){ var e = document.getElementById(id); return e ? parseInt(e.value, 10) : NaN; };
  var clamp = function(v){ return (v >= 1 && v <= 8) ? v : 0; };
  var mal = clamp(g('abaQuotaMal')), goal = clamp(g('abaQuotaGoal'));
  var pools = LS.get('aba5_pools_' + _abaClientId) || {};
  if(!mal && !goal){ delete pools.quota; }
  else {
    pools.quota = pools.quota || {};
    if(mal)  pools.quota.mal  = mal;  else delete pools.quota.mal;
    if(goal) pools.quota.goal = goal; else delete pools.quota.goal;
  }
  LS.set('aba5_pools_' + _abaClientId, pools);
  _abaRenderQuota();
}

// Fill the boxes for the selected client and say where each number comes from, so a
// value inherited from the assessment is never mistaken for one the user chose.
function _abaRenderQuota(){
  if(!_abaClientId) return;
  var q = _abaCardQuota(_abaClientId);
  var m = document.getElementById('abaQuotaMal'); if(m) m.value = q.mal;
  var g = document.getElementById('abaQuotaGoal'); if(g) g.value = q.goal;
  var label = q.source === 'manual' ? 'fijado para este cliente'
            : q.source === 'assessment' ? 'tomado del assessment de este cliente'
            : 'valor por defecto de AbaMatrix';
  var sm = document.getElementById('abaQuotaMalSrc');  if(sm) sm.textContent = '(' + label + ')';
  var sg = document.getElementById('abaQuotaGoalSrc'); if(sg) sg.textContent = '(' + label + ')';
}

async function _abaBuildBehaviorReduction(){
  var _fail = function(m){ _abaLastBrReason = m; showMsg('abaMsg', m, 'err'); return false; };
  _abaLastBrReason = '';
  if(!_abaClientId) return _fail('Selecciona un cliente primero.');
  var cfg = _abaCfg(_abaClientId);
  if(!cfg) return _fail('Sube primero el JSON de configuración de este cliente.');
  if(!(LS.get('aba5_assess_' + _abaClientId) || '').trim()) return _fail('Este cliente no tiene assessment reducido guardado.');
  // La ficha manda sobre el JSON de la plataforma: lo masterizado, en pausa o
  // borrado de la ficha no se documenta aunque el JSON lo siga trayendo.
  // Autoridad: lo CONFIRMADO en el panel "Confirma qué está en curso". Cae al filtro
  // por ficha solo si ese panel no se ha usado nunca para este cliente.
  var _conf = _abaActiveList(_abaClientId, 'beh');
  var _okMal = _allowedNames(_abaClientId, 'mal');
  var usable = (cfg.behaviors||[]).filter(function(b){
    if(!(((cfg.evidenced||{})[b]||[]).length && ((cfg.functions||{})[b]||[]).length)) return false;
    if(_conf) return _conf.indexOf(b) !== -1;
    return !_okMal || _okMal[String(b).trim().toLowerCase()];
  });
  // Lo excluido se NOMBRA. La ficha manda, pero una conducta que desaparece de la
  // nota sin explicacion es indistinguible de un fallo: hay que poder ver que se
  // quito por estado y no por error.
  var _excluidas = (cfg.behaviors||[]).filter(function(b){
    if(!(((cfg.evidenced||{})[b]||[]).length && ((cfg.functions||{})[b]||[]).length)) return false;
    return usable.indexOf(b) === -1;
  });
  var _excMsg = _excluidas.length
    ? ' No documentada(s) por no estar marcada(s) como en curso: "' + _excluidas.slice(0,4).join('", "') + '"'
      + (_excluidas.length > 4 ? ' y ' + (_excluidas.length-4) + ' más' : '') + '.'
    : '';
  if(!usable.length) return _fail('El JSON no trae conductas con Evidenced By y función.');
  // The parsed config is cached in localStorage, so a client configured before the
  // intervention-catalog fix still carries the empty maps. Without a closed list the
  // model would improvise the procedures, which is exactly what must never happen —
  // stop and ask for the JSON again instead of producing an unusable note.
  if(cfg.format === 'behavior_reduction' && !cfg.anteIntFreeText
     && !Object.keys(cfg.interventionsByFunction||{}).length
     && !Object.keys(cfg.consequencesByFunction||{}).length){
    return _fail('La configuración guardada de este cliente no tiene catálogo de intervenciones. Vuelve a subir el JSON del Daily Log para regenerarla; sin esa lista cerrada la nota saldría con intervenciones improvisadas.');
  }

  var usage = LS.get('aba5_ababrhist_' + _abaClientId) || [];
  // Rotate the behaviors BY FUNCTION: group by function class and spread each note
  // across the different functions, rotating members within each group. Because the
  // replacement is chosen by functional equivalence, rotating which functions the
  // note covers is what makes the replacements rotate too.
  var _quota = _abaCardQuota(_abaClientId).mal;
  var picked = _abaSelectBehaviorsByFunction(usable, usage, _quota);
  // Diagnostic: a note can only document as many maladaptive behaviors as the client
  // actually has WITH both Evidenced By and a documented function. If fewer than the
  // quota are usable, say WHY (fabricating one is prohibited) so the user knows to
  // complete the client's ficha.
  var _totalBeh = (cfg.behaviors||[]).length;
  var _poolShortMsg = (usable.length < _quota)
    ? ' Solo ' + usable.length + ' de ' + _totalBeh + ' conducta(s) del JSON traen Evidenced By + función, por eso no llega a ' + _quota + '; completa esos campos en la ficha.'
    : '';

  // Cross-session replacement rotation: even within the picked behaviors, each
  // behavior's functionally equivalent replacement was being re-chosen identically
  // every note. We feed the recently used replacements to the card builder so it
  // prefers a DIFFERENT (still functionally equivalent) option when the assessment
  // allows more than one.
  var repUsage = LS.get('aba5_abarephist_' + _abaClientId) || [];
  if(!Array.isArray(repUsage)) repUsage = [];
  // Per-behavior function history ("<behavior> :: <function>" entries). Lets a
  // multiply-maintained behavior rotate WHICH established function it is documented
  // under from note to note, which in turn rotates its equivalent replacement.
  var fnUsage = LS.get('aba5_abafnhist_' + _abaClientId) || [];
  if(!Array.isArray(fnUsage)) fnUsage = [];

  var btn = document.getElementById('abaBrBtn'); if(btn) btn.disabled = true;
  var prog = document.getElementById('abaBrProg');
  var out = document.getElementById('abaBrOut'); if(out) out.textContent = '';
  var blocks = [], allFlags = [], balance = [];
  try{
    var usedThisNote = [];
    for(var i = 0; i < picked.length; i++){
      if(prog) prog.textContent = 'Desarrollando conducta ' + (i+1) + ' de ' + picked.length + ': ' + picked[i] + '…';
      // Functions this behavior was documented under in recent notes, ordered
      // MOST RECENT FIRST and de-duplicated, so a multiply-maintained behavior can
      // rotate to the function it used least recently. fnUsage is chronological
      // (oldest first), hence the reverse.
      var recentFnsForBeh = (function(){
        var seen = {}, out = [];
        fnUsage.filter(function(e){ return e && e.indexOf(picked[i] + ' :: ') === 0; })
               .map(function(e){ return e.split(' :: ')[1]; })
               .reverse()
               .forEach(function(f){ if(f && !seen[f]){ seen[f] = 1; out.push(f); } });
        return out;
      })();
      var r = (cfg.format === 'behavior_program')
        ? await _abaBuildOneProgram(picked[i], usedThisNote, repUsage, recentFnsForBeh)
        : await _abaBuildOneBehavior(picked[i], usedThisNote, recentFnsForBeh);
      if(r.block) blocks.push(r.block);
      if(r.used) usedThisNote.push(r.used);
      if(r.counts) balance.push(r.counts);
      if(r.flags && r.flags.length) allFlags = allFlags.concat(r.flags);
    }
    _abaState.behaviorReduction = blocks.join('\n\n');
    if(out) out.textContent = _abaState.behaviorReduction;
    LS.set('aba5_ababrhist_' + _abaClientId, (Array.isArray(usage) ? usage : []).concat(picked).slice(-12));
    // Record the replacements actually used this note so future notes rotate away
    // from them (only meaningful for the behavior_program format, which fuses a
    // replacement into each card; behavior_reduction cards carry no replacement).
    var pickedReps = usedThisNote.map(function(u){ return u && u.rep; }).filter(Boolean);
    if(pickedReps.length) LS.set('aba5_abarephist_' + _abaClientId, repUsage.concat(pickedReps).slice(-12));
    // Record the function documented for each behavior this note (keep ~6 notes).
    var pickedFns = usedThisNote.map(function(u){ return (u && u.beh && u.fn) ? (u.beh + ' :: ' + u.fn) : null; }).filter(Boolean);
    if(pickedFns.length) LS.set('aba5_abafnhist_' + _abaClientId, fnUsage.concat(pickedFns).slice(-24));
    // Equilibrio antecedente/consecuencia de cada conducta, a la vista: es lo que
    // AbaMatrix exige y lo que antes solo se sabia abriendo la nota.
    var _balTxt = balance.length
      ? ' Antecedente/consecuencia por conducta: ' + balance.map(function(b){
          // El formato fusionado no ofrece catalogo de antecedentes: es texto libre.
          return b.anteFree
            ? b.beh + ' ' + (b.a ? 'texto libre' : 'SIN texto') + '/' + b.c
            : b.beh + ' ' + b.a + '/' + b.c;
        }).join(' · ') + '.'
      : '';
    if(allFlags.length) showMsg('abaMsg','\u26A0 ' + blocks.length + ' de ' + _quota + ' conducta(s) desarrollada(s). Revisar: ' + allFlags.slice(0,4).join(' · ') + '.' + _balTxt + _excMsg + _poolShortMsg,'err');
    else showMsg('abaMsg', blocks.length + ' de ' + _quota + ' conductas desarrolladas (cadena conducta → función → intervención validada).' + _balTxt + _excMsg + _poolShortMsg, _poolShortMsg ? 'err' : 'ok');
    return blocks.length > 0;
  } finally {
    if(btn) btn.disabled = false;
    if(prog) prog.textContent = '';
  }
}

async function _abaBuildGoalImplementation(){
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); return; }
  var cfg = _abaCfg(_abaClientId);
  if(!cfg || !(cfg.goals||[]).length){ showMsg('abaMsg','Sube primero el JSON de configuración de este cliente.','err'); return; }
  if(!(LS.get('aba5_assess_' + _abaClientId) || '').trim()){ showMsg('abaMsg','Este cliente no tiene assessment reducido guardado.','err'); return; }

  var usage = LS.get('aba5_abagihist_' + _abaClientId) || [];
  var _goalQuota = _abaCardQuota(_abaClientId).goal;
  // Mismo criterio para las metas: un programa masterizado o en pausa en la ficha
  // sale de la rotacion aunque el catalogo de la plataforma lo siga ofreciendo.
  var _confG = _abaActiveList(_abaClientId, 'goal');
  var _okRep = _allowedNames(_abaClientId, 'rep');
  var _goalPool = (cfg.goals || []).filter(function(g){
    if(_confG) return _confG.indexOf(g) !== -1;
    return !_okRep || _okRep[String(g).trim().toLowerCase()];
  });
  var _goalExc = (cfg.goals || []).filter(function(g){ return _goalPool.indexOf(g) === -1; });
  var _goalExcMsg = '';
  if(!_goalPool.length){
    // La ficha no coincide con NINGUNA meta del catalogo: filtrar dejaria la nota sin
    // metas, asi que no se filtra y se avisa, en vez de entregar una nota vacia.
    _goalPool = cfg.goals || [];
    _goalExcMsg = ' ⚠ Ninguna meta del catálogo coincide con los reemplazos activos de la ficha, así que no se filtró por estado. Revisa que los nombres de la ficha coincidan con los del JSON.';
  } else if(_goalExc.length){
    _goalExcMsg = ' No documentada(s) por no estar marcada(s) como en curso: "' + _goalExc.slice(0,4).join('", "') + '"'
      + (_goalExc.length > 4 ? ' y ' + (_goalExc.length-4) + ' más' : '') + '.';
  }
  // Eleccion manual por encima de la rotacion: si el RBT dice que metas trabajo, no
  // hay nada que rotar. Se filtran contra lo que sigue en curso por si algo cambio
  // de estado despues de elegirlo.
  var _manual = _abaPickedGoals(_abaClientId).filter(function(g){ return _goalPool.indexOf(g) !== -1; });
  var picked = _manual.length ? _manual : _abaRotatePick(_goalPool, usage, _goalQuota);
  var _manualMsg = _manual.length
    ? ' Metas elegidas a mano para esta sesión (' + _manual.length + ').'
    : '';
  // Per-goal schedule history ("<goal> :: <schedule>"). Without it every note
  // re-derived the schedule from scratch and settled on Continuous Reinforcement,
  // which is the schedule a program should spend the least time on.
  var schedUsage = LS.get('aba5_abaschedhist_' + _abaClientId) || [];
  if(!Array.isArray(schedUsage)) schedUsage = [];

  var btn = document.getElementById('abaGiBtn'); if(btn) btn.disabled = true;
  var prog = document.getElementById('abaGiProg');
  var out = document.getElementById('abaGiOut'); if(out) out.textContent = '';
  var blocks = [], allFlags = [];
  try{
    var usedThisNote = [];
    for(var i = 0; i < picked.length; i++){
      if(prog) prog.textContent = 'Desarrollando meta ' + (i+1) + ' de ' + picked.length + ': ' + picked[i] + '…';
      var _recentSched = (function(){
        var seen = {}, out = [];
        schedUsage.filter(function(x){ return x && x.indexOf(picked[i] + ' :: ') === 0; })
                  .map(function(x){ return x.split(' :: ')[1]; })
                  .reverse()
                  .forEach(function(v){ if(v && !seen[v]){ seen[v] = 1; out.push(v); } });
        return out;
      })();
      var r = await _abaBuildOneGoal(picked[i], usedThisNote, _recentSched);
      if(r.block) blocks.push(r.block);
      if(r.used) usedThisNote.push(r.used);
      if(r.flags && r.flags.length) allFlags = allFlags.concat(r.flags);
    }
    // Deterministic check on the symptom the prompt is meant to prevent: every
    // program in the note carrying the same schedule, and Continuous Reinforcement in
    // particular, which belongs to initial acquisition only.
    (function(){
      var ss = usedThisNote.map(function(u){ return u && u.sched; }).filter(Boolean);
      if(ss.length < 2) return;
      var uniq = ss.filter(function(v, i){ return ss.indexOf(v) === i; });
      if(uniq.length === 1){
        allFlags.push('las ' + ss.length + ' metas comparten el mismo esquema de reforzamiento ("' + uniq[0] + '") — verifica que corresponda a la etapa de cada programa');
      }
      var crf = ss.filter(function(v){ return /continuous/i.test(v); }).length;
      if(crf === ss.length){
        allFlags.push('todas las metas quedaron en Continuous Reinforcement, que es propio de la adquisición inicial — revisa si algún programa ya debería estar en esquema intermitente');
      }
    })();
    _abaState.goalImplementation = blocks.join('\n\n');
    if(out) out.textContent = _abaState.goalImplementation;
    LS.set('aba5_abagihist_' + _abaClientId, (Array.isArray(usage) ? usage : []).concat(picked).slice(-12));
    var pickedScheds = usedThisNote.map(function(u){ return (u && u.goal && u.sched) ? (u.goal + ' :: ' + u.sched) : null; }).filter(Boolean);
    if(pickedScheds.length) LS.set('aba5_abaschedhist_' + _abaClientId, schedUsage.concat(pickedScheds).slice(-36));
    if(allFlags.length) showMsg('abaMsg','\u26A0 ' + blocks.length + ' meta(s) desarrollada(s). Revisar: ' + allFlags.slice(0,4).join(' · ') + '.' + _manualMsg + _goalExcMsg,'err');
    else showMsg('abaMsg', blocks.length + ' de ' + _goalQuota + ' metas desarrolladas (validadas contra las listas de este cliente).' + _manualMsg + _goalExcMsg, _goalExcMsg.indexOf('⚠') >= 0 ? 'err' : 'ok');
  } finally {
    if(btn) btn.disabled = false;
    if(prog) prog.textContent = '';
  }
}

async function _abaBuildClosing(){
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); return; }
  var prof = _sliceProfileFor((LS.get('aba5_assess_' + _abaClientId) || '').trim(), null, { catalogsOnly: true });
  if(!prof){ showMsg('abaMsg','Este cliente no tiene assessment reducido guardado.','err'); return; }
  var btn = document.getElementById('abaClosBtn'); if(btn) btn.disabled = true;
  var prog = document.getElementById('abaClosProg'); if(prog) prog.textContent = 'Desarrollando…';
  var out = document.getElementById('abaClosOut'); if(out) out.textContent = '';
  try{
    var recent = LS.get('aba5_abanext_' + _abaClientId) || [];
    if(!Array.isArray(recent)) recent = [];

    // Context from what was already built this session, so the comments are coherent.
    var ctxParts = [];
    if(_abaState.behaviorReduction) ctxParts.push(_abaState.behaviorReduction);
    if(_abaState.goalImplementation) ctxParts.push(_abaState.goalImplementation);
    if(_abaState.participation) ctxParts.push('Participation: ' + _abaState.participation);
    var sessionCtx = ctxParts.join('\n\n');

    var sys = 'You write the closing of an AbaMatrix RBT session note.\n\n'
      + 'ABSOLUTE PROHIBITION - NO INVENTED NUMBERS: no seconds, minutes, counts, trials, "X out of Y", percentages, frequencies or durations. Qualitative observable terms only.\n\n'
      + 'PROHIBITED TERMINOLOGY (never use): sensory, relaxation, calming, calm, deep breathing, self-regulation, self-soothing, coping, mindfulness, meditation, yoga, problem solving, conflict resolution, social stories, anger management, art therapy, frustration, stress, anxiety, upset, or any emotional/mentalist language.\n\n'
      + 'CRITICAL - RBT SCOPE IN THE CLOSING PROSE: some AbaMatrix option texts themselves contain analyst-only wording (e.g. a reinforcement schedule option that says \u201Cas the client shows improvement in the skill acquisition program\u201D). Those texts stay in the platform. In YOUR prose never write progress, improvement, growth, mastery, learning, effectiveness, treatment integrity, appeared to, seemed to, suggests, indicates, would benefit, or any recommendation - the RBT documents what was observed and done, and does not judge, interpret or propose changes. State plainly what occurred, including when the outcome was poor.\n\n'
      + 'CRITICAL - DO NOT ECHO PLATFORM WORDING: the session data contains AbaMatrix dropdown values that may include the word \u201Csensory\u201D. Those values stay in the platform; the word must NOT appear anywhere in your prose. Do not simply delete it - RESTATE the item in stronger, observable clinical terms so the note is clinically more robust: a Sensory function is written as maintained by automatic reinforcement; \u201Cwithout sensory breaks\u201D becomes without an intervening break from the demand; \u201Cstop a sensory activity they initiated\u201D becomes terminate an activity he had initiated that produced automatic reinforcement; \u201Csensory items\u201D becomes the actual item named (e.g. a fidget toy). Stay faithful to what happened.\n\n'
      + 'STYLE: third person singular, flowing prose, clinical and precise, no headers, no bold/italic. NO TRIUMPHALIST OR SUPERLATIVE LANGUAGE: never write that something was done \u201Ceffectively\u201D, \u201Csuccessfully\u201D, \u201Cexcellently\u201D or similar - state plainly what was done and what was observed (results are not always positive). Refer to roles as "the RBT", "the client", "the BCBA", "the lead analyst" - never "a RBT". The client name may be used.\n\n'
      + 'CONTENT: "relevant_information" is a short developed paragraph with information relevant to this session that is not already captured in the other fields - for example how the client responded to the interventions and to the teaching procedure overall, or any barrier encountered. Base it strictly on the session content given; never invent events.\n\n'
      + 'CAREGIVER SCOPE (CPT 97153 - CRITICAL): this is an RBT direct-treatment note. NEVER document caregiver fidelity, treatment integrity, a caregiver performance rating, a caregiver "understanding", or any fidelity/percentage figure for the caregiver - caregiver fidelity is the analyst\u2019s 97156 content, not this note. If you mention the caregiver at all, limit it to what was observed of their three non-data roles (antecedent/environmental manipulations, support of replacement/acquisition goals, delivery of reinforcement) with NO numbers, NO percentage, NO fidelity or performance judgement.\n\n'
      + 'For "next_visit" choose EXACTLY ONE option copied verbatim from the CLOSED LIST. Never invent or modify it. Output STRICT JSON only.';

    var prompt = 'CLOSED LIST - Next Visit (choose exactly one, verbatim):\n'
      + ABA_NEXT_VISIT.map(function(x,i){ return (i+1)+'. '+x; }).join('\n') + '\n\n'
      + (recent.length ? 'For variation across notes, avoid repeating these recently used options: ' + recent.map(function(r){ return '"'+r+'"'; }).join('; ') + '\n\n' : '')
      + (sessionCtx ? 'WHAT WAS DOCUMENTED IN THIS SESSION (base the comments on this):\n' + sessionCtx + '\n\n' : '')
      + 'CLIENT REDUCED PROFILE (source of truth):\n' + prof + '\n\n'
      + 'Return STRICT JSON with exactly these keys:\n{"relevant_information":"","next_visit":""}';

    var raw = await callAPI(prompt, sys, null, _abaClientId, 4096, 0);
    var txt = String(raw||'').replace(/```json|```/g, '').trim();
    var data = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));

    var norm = function(x){ return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
    var nv = ABA_NEXT_VISIT.find(function(o){ return norm(o) === norm(data.next_visit); }) || '';
    var info = String(data.relevant_information||'').trim()
      .replace(/\bsensory\s+toys?\b/gi, 'manipulative items')
      .replace(/\bsensory\b/gi, 'automatic-reinforcement');
    var flags = [];
    if(!nv) flags.push('Next Visit');

    var nums = info.match(/\b\d+\s+(?:\w+\s+){0,2}(?:seconds?|minutes?|times?|occasions?|trials?|opportunities|steps?|prompts?)\b/gi) || [];
    var fab = (typeof scanPerfNumbers === 'function') ? scanPerfNumbers(info) : [];
    if(nums.length || fab.length) flags.push('cifras a verificar: "' + nums.concat(fab).slice(0,3).join('", "') + '"');
    var badWords = ['sensory','relaxation','calming','deep breathing','self-regulation','self-soothing','coping','mindfulness','meditation','yoga','problem solving','conflict resolution','social stories','anger management','art therapy','frustration','stress','anxiety','upset'];
    var found = badWords.filter(function(w){ return new RegExp('\\b' + w.replace(/[-\/]/g,'[-\\s/]?') + '\\b','i').test(info); });
    if(found.length) flags.push('terminología prohibida: "' + found.join('", "') + '"');
    var _analyst = ['progress','improvement','improved','growth','mastery','learning','effectiveness','treatment integrity','appeared to','seemed to','suggests','indicates','would benefit','recommend']
      .filter(function(w){ return new RegExp('\\b' + w.replace(/\s+/g,'\\s+') + '\\b','i').test(info); });
    if(_analyst.length) flags.push('fuera del alcance del RBT: "' + _analyst.join('", "') + '"');

    var L = [];
    L.push('RELEVANT INFORMATION / COMMENTS');
    L.push(info || '[completar]');
    L.push('');
    L.push('NEXT VISIT');
    L.push(nv || '[no validado - elige en AbaMatrix]');
    _abaState.closing = L.join('\n');
    if(out) out.textContent = _abaState.closing;

    if(nv){ recent.unshift(nv); LS.set('aba5_abanext_' + _abaClientId, recent.slice(0,2)); }
    if(flags.length) showMsg('abaMsg','\u26A0 Revisar: ' + flags.join(' · ') + '.','err');
    else showMsg('abaMsg','Cierre desarrollado (Next Visit validado contra la lista cerrada).','ok');
  } catch(err){
    showMsg('abaMsg','Error al desarrollar: ' + (err.message||err), 'err');
  } finally {
    if(btn) btn.disabled = false;
    if(prog) prog.textContent = '';
  }
}

// Generates the narrative 97153 note from everything assembled in this tab.
// Nothing new is invented: it is the prose rendering of what was already
// documented and validated against AbaMatrix's closed lists.
async function _abaGenerate97153(){
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); return; }
  var c = (clients||[]).find(function(x){ return x.id === _abaClientId; });
  var prof = _sliceProfileFor((LS.get('aba5_assess_' + _abaClientId) || '').trim(), null, { catalogsOnly: true });
  if(!prof){ showMsg('abaMsg','Este cliente no tiene assessment reducido guardado.','err'); return; }
  if(!_abaState.behaviorReduction && !_abaState.goalImplementation){
    showMsg('abaMsg','Arma primero Behavior Reduction y/o Goal Implementation: la nota se redacta a partir de esa información.','err');
    return;
  }
  // Sin bloqueo por MFC: la nota se genera con la información seleccionada. El mapa
  // funcional se deriva de la config para inyección/validación cuando no hay uno
  // guardado; los guardarraíles de reforzador-por-función siguen corriendo.

  var btn = document.getElementById('abaNoteBtn'); if(btn) btn.disabled = true;
  var prog = document.getElementById('abaNoteProg'); if(prog) prog.textContent = 'Generando la nota…';
  try{
    // Everything documented in this session, as the single source for the note.
    var parts = [];
    var start = (document.getElementById('abaStartLoc')||{}).value || '';
    var end = (document.getElementById('abaEndLoc')||{}).value || '';
    /* El roster de AbaMatrix trae personas con su rol real ("Mother", "Teacher"),
       y esta linea las anunciaba TODAS como "Caregiver(s) present". Un maestro
       entraba al prompt etiquetado de cuidador: contaminacion en el origen.
       Ahora se nombran sin asignarles rol, y en una sesion en casa el personal
       docente ni siquiera llega hasta aqui. */
    var _presArr = (typeof _abaGetPresentSel === 'function') ? _abaGetPresentSel() : [];
    var _presFilt = _filterParticipantsByPlace(_presArr, start);
    if(_presFilt.removed.length){ try{ _placeFilterNotice(_presFilt, start, 'abaMsg'); }catch(e){} }
    var present = _presFilt.kept.join(', ');
    parts.push('SESSION SETTING: started at ' + start + (end && end !== start ? ', ended at ' + end : '') + (present ? '. Present during the session: ' + present : ''));
    var envYes = (document.getElementById('abaEnvYesNo')||{}).value === 'Yes';
    if(envYes){
      var env = (document.getElementById('abaEnvChange')||{}).value || '';
      if(env) parts.push('ENVIRONMENTAL CHANGE: ' + env + (_abaState.manipulation ? '. Manipulation made: ' + _abaState.manipulation : ''));
    }
    if(_abaState.startPrompt) parts.push('PROMPT AT START OF SERVICE: ' + _abaState.startPrompt);
    var incYes = (document.getElementById('abaIncYesNo')||{}).value === 'Yes';
    var incTxt = ((document.getElementById('abaIncText')||{}).value || '').trim();
    if(incYes && incTxt) parts.push('INCIDENT: ' + incTxt);
    var medVal = (typeof _abaMedValue === 'function') ? _abaMedValue() : '';
    if(medVal) parts.push('MEDICAL CONCERN: ' + medVal);
    if(_abaState.behaviorReduction) parts.push(_abaState.behaviorReduction);
    if(_abaState.goalImplementation) parts.push(_abaState.goalImplementation);
    if(_abaState.participation) parts.push('CLIENT PARTICIPATION: ' + _abaState.participation);
    if(_abaState.closing) parts.push(_abaState.closing);
    var sessionData = parts.join('\n\n');

    // COUNT FIDELITY: when rewriting the structured cards into flowing prose the model
    // tends to silently merge or drop one card (e.g. 4 acquisition goals were built but
    // only 3 got written). Count the cards actually documented in the session data and
    // force the note to render every one of them - never merge, omit or add.
    var _countOf = function(s, re){ return (String(s||'').match(re) || []).length; };
    var _behN = _countOf(_abaState.behaviorReduction, /^BEHAVIOR (?:& PROGRAM|REDUCTION)/gm);
    var _goalN = _countOf(_abaState.goalImplementation, /^GOAL IMPLEMENTATION/gm);
    var _countLine = (_behN || _goalN)
      ? 'COUNT FIDELITY - HARD CONSTRAINT: the session data documents EXACTLY ' + _behN + ' maladaptive behavior' + (_behN === 1 ? '' : 's') + ' and EXACTLY ' + _goalN + ' acquisition goal' + (_goalN === 1 ? '' : 's') + '. The note MUST document every single one of them: a distinct treatment for each behavior and a distinct passage for each acquisition goal. Do NOT merge two behaviors or two goals into one, do NOT omit or skip any, and do NOT add any that are not in the session data. Two behaviors (or two goals) that share the same function or the same replacement are still SEPARATE items and each must appear individually. Before finishing, verify the note covers all ' + _behN + ' behavior(s) and all ' + _goalN + ' goal(s).\n\n'
      : '';

    var sys = 'You write a CPT 97153 session note (RBT direct treatment) that must pass a Florida Medicaid audit.\n\n'
      + RBT_SEQUENCE_RULE + '\n\n'
      + RBT_ANTECEDENT_RULE + '\n\n'
      + RBT_CLINICAL_DOC_RULE + '\n\n'
      + 'PLATFORM WORDING vs NOTE WORDING - THEY ARE NOT THE SAME THING: the value you select for a closed-list FIELD must be the platform string, verbatim, because the field only accepts its own options. But the free-text DESCRIPTIONS and the ABC narrative are clinical prose, and there you name the procedure CORRECTLY and describe what was done. Never copy a malformed label into the prose. Specifically: \"Most to lead prompt fading\" is most-to-least prompt fading; \"Planned Ignore\" is planned ignoring; \"Alternate Behaviors (DRA)\" is differential reinforcement of ALTERNATIVE behavior; \"Response Interruption / Redirection (RIR)\" is response interruption and redirection (RIRD). Same procedure, said properly - never a DIFFERENT procedure from the one selected, which would contradict the form.\n\n'
      + ((typeof _analystCorrectionsBlock === 'function') ? _analystCorrectionsBlock(_abaClientId) : '')
      + ((typeof _universalAnalystBlock === 'function') ? _universalAnalystBlock(_abaClientId) : '')
      + ((typeof _recurringDefectsBlock === 'function') ? _recurringDefectsBlock(_abaClientId) : '')
      + ((typeof _retiredPromptBlock === 'function') ? _retiredPromptBlock(_abaClientId) : '')
      + (function(){ var _p = LS.get('aba5_pools_' + _abaClientId) || {};
           var _d = (typeof _clientDocRequirements === 'function') ? _clientDocRequirements(_p) : { text:'', wantsProgramDoc:false };
           if(!_d.text) return '';
           return 'CLIENT / AGENCY DOCUMENTATION REQUIREMENTS (declared in this client\'s plan - MANDATORY for this client only, additive; they never license inventing data):\n' + _d.text + '\n\n'
                  + (_d.wantsProgramDoc ? RBT_REPLACEMENT_DOC_RULE + '\n\n' : '');
         })()
      + NO_CROSS_SESSION_RULE + '\n\n'
      + OUTPUT_ONLY_NOTE_RULE + '\n\n'
      + SESSION_EVENT_SOURCING_RULE + '\n\n'
      + SCHOOL_DEMAND_SOURCE_RULE + '\n\n'
      + _placeCoherenceRule((document.getElementById('abaStartLoc')||{}).value || '', present) + '\n\n'
      + OPERATOR_TEXT_LANGUAGE_RULE + '\n\n'
      + 'SOURCE OF TRUTH: write ONLY from the SESSION DATA provided. Every behavior, intervention, activity, prompt and reinforcer in the note must already appear there. Never add an element that is not in the session data, and never invent events.\n\n'
      + 'ABSOLUTE PROHIBITION - NO INVENTED NUMBERS: no counts, no "X out of Y", no occasions, no seconds or minutes, no percentages, no averages, no trial ratios, unless the exact figure appears in the session data. If there is no figure, describe qualitatively with NO numbers.\n\n'
      + 'STYLE: third person singular. Flowing paragraphs - no headers, no bullet lists, no bold, no italic. Clinical, precise, professional language. No inclusive or triumphalist language, no superlatives, no exaggerated praise (results are not always positive). Vary the opening and the closing.\n\n'
      + 'ROLES: always "the RBT", "the client", "the BCBA", "the caregiver", "the mother" - never "a RBT" or "an RBT". The client name is the only personal name allowed; caregivers are referred to by role only.\n\n'
      + 'PROHIBITED TERMINOLOGY (never use, in any form): sensory, relaxation, calming, calm, deep breathing, self-regulation, self-soothing, coping, mindfulness, meditation, yoga, problem solving, conflict resolution, social stories, anger management, art therapy, frustration, stress, anxiety, upset, empathy, explanatory fiction, or any emotional/mentalist language. Everything must be observable and measurable.\n\n'
      + 'CRITICAL - THE WORD \u201CSENSORY\u201D AND PLATFORM WORDING: AbaMatrix forces \u201CSensory\u201D as a function value and includes it inside its closed antecedent options (e.g. \u201Cdirected to stay engaged in a task without sensory breaks\u201D, \u201Crequired to stop a sensory activity they initiated\u201D). Those values are selected in the platform; that is a platform constraint and it stays there. In YOUR note the word sensory must NEVER appear, in any form.\n\n'
      + 'Do not merely delete the word - RESTATE the item in stronger, more precise clinical terms, so the note is clinically MORE robust than the platform wording:\n'
      + '  - Function: write it as maintained by automatic reinforcement (not \u201Csensory function\u201D).\n'
      + '  - \u201Cdirected to stay engaged in a task without sensory breaks\u201D -> the client was required to remain engaged in the task without an intervening break from the demand.\n'
      + '  - \u201Crequired to stop a sensory activity they initiated\u201D -> the client was required to terminate an activity he had initiated and that produced automatic reinforcement.\n'
      + '  - \u201Csensory items\u201D / \u201Csensory input\u201D -> name the actual item and the observable response (e.g. a fidget toy; manipulating the item; remaining seated and engaged with the task).\n'
      + '  - Never write \u201Ccalm body\u201D or any emotional/mentalist paraphrase: describe the observable response instead.\n'
      + 'The restatement must stay faithful to what actually happened - it sharpens the wording, it never changes the clinical facts.\n\n'
      + 'CLINICAL RULES: planned ignoring is never used for aggression, SIB, elopement or property destruction. DRL is never used for dangerous behaviors. Response blocking, if used, lasts only a short period (10-15 seconds). Replacement behaviors are TAUGHT (they are not interventions for the maladaptive behavior). Caregivers do NOT collect data.\n\n'
      + 'CAREGIVER SCOPE (CRITICAL): this is an RBT note. NEVER document caregiver fidelity, treatment integrity, a caregiver performance rating, the caregiver\u2019s \u201Cunderstanding\u201D, or any fidelity/percentage figure for the caregiver - that is the analyst\u2019s 97156 content. If the session data or profile contains a caregiver fidelity figure or percentage, DO NOT reproduce it. Mention the caregiver only as observed in their three non-data roles (antecedent/environmental manipulations, support of replacement/acquisition goals, delivery of reinforcement), with no numbers and no judgement.\n\n'
      + 'NO PERCENTAGES OR FIDELITY FIGURES: never write any percentage (e.g. \u201C45%\u201D, \u201C45% to 55%\u201D, \u201Cranging from 45 to 55 percent\u201D), any fidelity/accuracy/integrity figure, any average or range of figures - not for the client and not for the caregiver. If the source contains one, describe it qualitatively with NO number, or omit it.\n\n'
      + 'REINFORCERS: if the session data or the profile does not name specific reinforcers, refer to verbal praise and social praise - universal ABA reinforcers, always applicable. Never state that reinforcers were not specified.\n\n'
      + 'STRICT RBT SCOPE OF PRACTICE - CRITICAL: this is an RBT note (CPT 97153). The RBT IMPLEMENTS the protocol and DOCUMENTS what was observed. The RBT does NOT make clinical judgements, does NOT interpret, does NOT analyse trends, does NOT evaluate progress toward goals, and does NOT suggest or recommend changes to the plan, the protocol or the interventions. Those are the analyst\u2019s responsibility. An RBT writing clinical judgement is a scope-of-practice violation and an audit finding.\n\n'
      + 'PROHIBITED IN AN RBT NOTE (analyst-only language): progress, made progress, improvement, improved, growth, gains, development, advancement, mastery, mastered, learning, learned, understanding, comprehension, effective, effectiveness, successful, appeared to, seemed to, likely, suggests, indicates, demonstrates progress, is responding well, would benefit from, recommend, recommendation, should be adjusted, needs modification, requires a change to the protocol.\n\n'
      + 'CORRECT RBT LANGUAGE: describe only what was observed and done - \u201Cthe client engaged with the task\u201D, \u201Cthe client responded to the gestural prompt\u201D, \u201Cthe behavior occurred and was interrupted\u201D, \u201Cthe client did not respond to the instruction\u201D, \u201Cprompt dependence was documented during this session\u201D. Report the plain observable outcome, including when it was poor. Any clinical conclusion or plan change belongs to the analyst, not here.\n\n'      + 'CLINICAL LINKAGE: relate the elements as a functional chain - connect the antecedent to the maladaptive behavior and its function, the intervention applied to it, the replacement/acquisition target taught in its place, the teaching method and the prompt used with its fading, and the reinforcer and schedule that strengthened the target response.\n\n'
      + 'Write the note as continuous prose. Output the note text only - no preamble, no headings, no commentary.';

    // MFC closed list (T3): only the behaviors documented in THIS session's data.
    var _mfcObj = _mfcGet(_abaClientId);
    var _mfcSel = _mfcObj ? (_mfcObj.behaviors||[]).map(function(b){ return b.name; })
      .filter(function(n){ return sessionData.toLowerCase().indexOf(String(n).toLowerCase()) !== -1; }) : [];
    var mfcBlockAba = _mfcPromptBlock(_mfcObj, _mfcSel.length ? _mfcSel : null);

    var prompt = 'CLIENT NAME (use exactly this name, and no other personal name): ' + ((c && c.name) || 'the client') + '\n\n'
      + 'SESSION DATA DOCUMENTED IN ABAMATRIX (the only source for this note):\n' + sessionData + '\n\n'
      + 'CLIENT REDUCED ASSESSMENT PROFILE (clinical context - operational definitions, functions, prompt hierarchy, reinforcers):\n' + prof + '\n\n'
      + _countLine + mfcBlockAba
      + 'Write the CPT 97153 session note now.';

    var text = await callAPI(prompt, sys, '97153', _abaClientId, 32768, NOTE_THINKING_BUDGET);
    if(_lastTruncated){
      var text2 = await callAPI(prompt, sys, '97153', _abaClientId, 65536, NOTE_THINKING_BUDGET);
      if(text2 && (!_lastTruncated || text2.length >= (text||'').length)) text = text2;
    }
    text = String(text||'').trim();
    if(!text){ showMsg('abaMsg','La IA no devolvió texto. Intenta de nuevo.','err'); return; }

    // HARD guard: AbaMatrix provides no numeric session data, so any performance number
    // in the note is invented — strip it deterministically before showing the note.
    var _saAba = (typeof _stripSelfAudit==='function') ? _stripSelfAudit(text) : null;
    if(_saAba && _saAba.cut) text = _saAba.text;
    var _scrubA = (typeof _scrub97153Numbers==='function') ? _scrub97153Numbers(text, '') : null;
    if(_scrubA) text = _scrubA.text;
    var _polA = (typeof _polishNoteText==='function') ? _polishNoteText(text) : null;
    if(_polA) text = _polA.text;
    var ta = document.getElementById('abaNoteOut'); if(ta) ta.value = text;
    // Same guards used across the system.
    if(typeof _postNoteChecks === 'function') _postNoteChecks(text, _abaClientId, 'abaMsg');
    else showMsg('abaMsg','Nota 97153 generada.','ok');
    // Prohibited terminology + RBT-scope language: shared 97153 guard (full lists),
    // so AbaMatrix and the Generador completo warn identically. Prevention plus
    // safety net - the model ignores weak prohibitions, so this catches what slips
    // past the prompt (e.g. "overwhelmed", "calm", "understanding", "effective").
    _warn97153Language(text, 'abaMsg');
    // T4/T5 - validador contra el MFC (reforzador-por-funci\u00F3n, reemplazo ausente,
    // atribuci\u00F3n de funci\u00F3n/rol, efectividad sin dato, terminolog\u00EDa) + avisos de vac\u00EDo.
    if(typeof _warnMfcAudit==='function') _warnMfcAudit(text, _abaClientId, 'abaMsg');
    if(_scrubA && _scrubA.removed.length){ try{ console.warn('[97153 aba scrub] removed:', _scrubA.removed); }catch(e){} showMsg('abaMsg','🧹 97153 — se eliminaron cifras no documentadas y se reemplazaron por lenguaje cualitativo: "'+_scrubA.removed.slice(0,6).join('", "')+'". Verifica que la redacción quede bien.','err',0); }
  } catch(err){
    showMsg('abaMsg','Error al generar la nota: ' + (err.message||err), 'err');
  } finally {
    if(btn) btn.disabled = false;
    if(prog) prog.textContent = '';
  }
}

async function _abaRewriteNote(opts){
  // opts permite reusar la reescritura para la nota de AbaMatrix (por defecto) o
  // para una nota externa del RBT en la pestaña "Revisar nota", corrigiendo los
  // errores contra la info de ESE cliente.
  opts = opts || {};
  var srcId    = opts.srcId    || 'abaRewriteIn';
  var outId    = opts.outId    || 'abaRewriteOut';
  var btnId    = opts.btnId    || 'abaRewriteBtn';
  var progId   = opts.progId   || 'abaRewriteProg';
  var flagsId  = opts.flagsId  || 'abaRewriteFlags';
  var msgId    = opts.msgId    || 'abaMsg';
  var emptyMsg = opts.emptyMsg || 'Pega primero la nota de AbaMatrix a reescribir.';
  var clientId = opts.clientId || _abaClientId;
  if(!clientId){ showMsg(msgId,'Selecciona un cliente primero.','err'); return; }
  var raw = ((document.getElementById(srcId)||{}).value || '').trim();
  if(!raw){ showMsg(msgId, emptyMsg,'err'); return; }
  var cfg = _abaCfg(clientId) || {};
  var prof = _sliceProfileFor((LS.get('aba5_assess_' + clientId) || '').trim(), null, { catalogsOnly: true });
  if(!prof){ showMsg(msgId,'Este cliente no tiene assessment reducido guardado.','err'); return; }

  var btn = document.getElementById(btnId); if(btn) btn.disabled = true;
  var prog = document.getElementById(progId); if(prog) prog.textContent = 'Reescribiendo…';
  var flagsEl = document.getElementById(flagsId); if(flagsEl) flagsEl.textContent = '';
  try{
    // Vocabulario cerrado de ESTE cliente (lo único permitido)
    var uniq = function(a){ var s={},o=[]; (a||[]).forEach(function(x){ x=String(x||'').trim(); if(x && !s[x.toLowerCase()]){ s[x.toLowerCase()]=1; o.push(x);} }); return o; };
    var consUnion = [];
    var cbf = cfg.consequencesByFunction || {};
    Object.keys(cbf).forEach(function(k){ consUnion = consUnion.concat(cbf[k]||[]); });
    consUnion = uniq(consUnion);
    var pools = LS.get('aba5_pools_' + clientId) || {};
    var reinf = String(pools.reinforcers||'').trim() || (cfg.reinforcers||[]).join(', ');

    var lists = '';
    if(consUnion.length)                lists += 'CONSEQUENCE INTERVENTIONS (verbatim, closed): ' + consUnion.join(' | ') + '\n';
    if((cfg.replacements||[]).length)   lists += 'REPLACEMENT PROGRAMS (verbatim, closed): ' + cfg.replacements.join(' | ') + '\n';
    if((cfg.teaching||[]).length)       lists += 'TEACHING PROCEDURES (verbatim, closed): ' + cfg.teaching.join(' | ') + '\n';
    if((cfg.promptTypes||[]).length)    lists += 'PROMPTS (verbatim, closed): ' + cfg.promptTypes.join(' | ') + '\n';
    if((cfg.results||[]).length)        lists += 'RESULTS (verbatim, closed): ' + cfg.results.join(' | ') + '\n';
    if((cfg.schedules||[]).length)      lists += 'REINFORCEMENT SCHEDULES (verbatim, closed): ' + cfg.schedules.join(' | ') + '\n';
    if(reinf)                           lists += 'REINFORCERS (the ONLY ones you may name): ' + reinf + '\n';
    // Funciones documentadas por conducta
    var fmap = cfg.functions || {};
    var fnLines = Object.keys(fmap).map(function(b){ return '  - ' + b + ': ' + (fmap[b]||[]).join(', '); }).join('\n');

    var sys = 'You REWRITE an existing AbaMatrix RBT session note (CPT 97153) so it is clinically coherent and audit-ready. You do NOT create new content: you keep what actually happened in the pasted note and only correct incongruent selections, ABC mismatches, terminology and scope.\n\n'
      + 'CLOSED ENVIRONMENT — THE MOST IMPORTANT RULE: AbaMatrix is a closed environment. Every intervention, replacement, teaching procedure, prompt, result, schedule and reinforcer you use MUST come, VERBATIM, from the closed lists below for THIS client. If the pasted note used a term that is NOT in these lists, replace it with the closest valid in-list term for the documented function, or remove it. NEVER introduce anything outside the lists. NEVER invent.\n\n'
      + RBT_SEQUENCE_RULE + '\n\n'
      + RBT_ANTECEDENT_RULE + '\n\n'
      + NO_CROSS_SESSION_RULE + '\n\n'
      + OUTPUT_ONLY_NOTE_RULE + '\n\n'
      + SESSION_EVENT_SOURCING_RULE + '\n\n'
      + SCHOOL_DEMAND_SOURCE_RULE + '\n\n'
      + _placeCoherenceRule((document.getElementById('abaStartLoc')||{}).value || '', '') + '\n\n'
      + OPERATOR_TEXT_LANGUAGE_RULE + '\n\n'
      + 'ABC CORRESPONDENCE IS THE CORE OF A 97153 NOTE: antecedent → behavior → consequence must be coherent.\n'
      + '  - The ANTECEDENT is what set the occasion (a demand, a denied item, a transition, a bid for attention). Antecedent strategies (environmental/antecedent manipulation, reduce/di­vide demand, high-p, premack, choices, NCR) belong BEFORE the behavior, never as the consequence.\n'
      + '  - The CONSEQUENCE INTERVENTION must match the FUNCTION documented in the assessment for that behavior.\n'
      + '  - The REPLACEMENT must be functionally equivalent to the behavior (escape → request break/help, with the break granted; attention → request attention; tangible → request the item, access granted; automatic → an alternative giving comparable stimulation).\n'
      + '  - The REINFORCER delivered for the replacement must be the SAME reinforcer that maintained the behavior. A reinforcer or replacement that does not match the function is a clinical error to be corrected.\n\n'
      + 'HARD CLINICAL RULES (apply even if the pasted note or the platform violated them):\n'
      + '  - RIRD (Response Interruption and Redirection) is ONLY for automatic/sensory function. If the behavior is escape, attention or tangible, remove RIRD and use a function-matched option from the list.\n'
      + '  - Planned Ignoring / Attention Extinction is NEVER used for aggression, self-injury, elopement, property destruction (breaking items), tantrums or climbing.\n'
      + '  - Response blocking, if mentioned, is only brief.\n'
      + '  - Caregivers do NOT collect data.\n\n'
      + 'RBT SCOPE (CPT 97153): describe only what was implemented and observed. NO clinical judgement, NO progress/effectiveness claims, NO recommendations, NO plan changes. Prohibited words include: progress, improvement, mastery, effective, successful, appeared/seemed to, suggests, indicates, recommend, should be adjusted.\n\n'
      + 'NO INVENTED NUMBERS: no seconds, minutes, counts, trials, "X of Y", percentages, frequencies or durations unless they are literally present in the pasted note.\n'
      + 'NO TRIUMPHALIST/SUPERLATIVE LANGUAGE. Third person singular. Fluid paragraphs, plain text (no headings, bullets, bold or italics).\n'
      + 'PROHIBITED TERMINOLOGY: sensory, relaxation, calming, calm, deep breathing, self-regulation, coping, mindfulness, problem solving, conflict resolution, social stories, anger management, art therapy, frustration, stress, anxiety, upset, or any emotional/mentalist language. Use "the RBT", "the BCBA", "the client" — never "a RBT".\n\n'
      + 'OUTPUT: return ONLY the rewritten note as plain prose. After the note, on a new line, add "---CAMBIOS---" followed by a brief bullet-free list (one per line, prefixed "· ") of the substantive corrections you made. Nothing else.';

    var prompt = 'CLOSED LISTS FOR THIS CLIENT (the only vocabulary you may use):\n' + (lists||'(no lists configured)') + '\n'
      + 'DOCUMENTED FUNCTION PER BEHAVIOR (source: assessment):\n' + (fnLines || '(not provided)') + '\n\n'
      + 'CLIENT REDUCED ASSESSMENT (source of truth for function, replacement and reinforcer):\n' + prof + '\n\n'
      + 'ABAMATRIX NOTE TO REWRITE (correct it in place; keep what actually happened):\n"""\n' + raw + '\n"""';

    var out = await callAPI(prompt, sys, null, clientId, 8192, 0);
    var txt = String(out||'').trim();
    var note = txt, changes = '';
    var mk = txt.indexOf('---CAMBIOS---');
    if(mk >= 0){ note = txt.slice(0, mk).trim(); changes = txt.slice(mk + 13).trim(); }

    var outEl = document.getElementById(outId); if(outEl) outEl.value = note;
    // Validación local: marca términos que pudieran haber quedado fuera de las listas cerradas
    var localFlags = [];
    var lowNote = ' ' + note.toLowerCase() + ' ';
    [['sensory','término de plataforma prohibido: "sensory"'],
     ['planned ignoring','revisa: "planned ignoring" no debe usarse en conductas peligrosas'],
     ['response interruption','revisa: RIRD solo aplica a función automática']
    ].forEach(function(p){ if(lowNote.indexOf(p[0]) >= 0) localFlags.push(p[1]); });
    if(/\b\d+(\.\d+)?\s*(%|percent|seconds?|minutes?|trials?|times|out of)\b/i.test(note)) localFlags.push('revisa: aparecen cifras/tiempos — confirma que estaban en la nota original');

    if(flagsEl){
      var body = '';
      if(changes) body += 'Cambios aplicados por el sistema:\n' + changes + '\n';
      if(localFlags.length) body += (body?'\n':'') + 'Avisos de validación local:\n' + localFlags.map(function(x){ return '⚠ ' + x; }).join('\n');
      flagsEl.textContent = body || 'Sin avisos.';
    }
    showMsg(msgId,'Nota reescrita.','ok');
  }catch(e){
    showMsg(msgId,'Error al reescribir: ' + (e && e.message ? e.message : e),'err');
  }finally{
    if(btn) btn.disabled = false;
    if(prog) prog.textContent = '';
  }
}

function _abaReviewRbtNote(){
  return _abaAuditNote({
    srcId:'reviewNoteIn', outId:'reviewNoteOut', msgId:'reviewMsg',
    btnId:'reviewBtn', clientId:_reviewClientId,
    emptyMsg:'Pega la nota del RBT a revisar.'
  });
}

// One button: generates every AI-driven field, assembles the AbaMatrix form in
// the platform's own section order, and writes the note. Prevents fields being
// left unmarked because the user forgot to press an individual button.
// Enables the master button only when everything the USER must decide is set.
// The AI-generated fields (start prompt, manipulation, behaviors, goals,
// participation, closing) are NOT requirements — the button produces them.
function _abaCheckReady(){
  var btn = document.getElementById('abaAllBtn');
  var info = document.getElementById('abaAllReq');
  if(!btn) return;
  var missing = [];

  if(!_abaClientId){
    missing.push('selecciona terapeuta y cliente');
  } else {
    if(!_abaCfg(_abaClientId)) missing.push('sube el JSON de configuración del cliente');
    if(!(LS.get('aba5_assess_' + _abaClientId) || '').trim()) missing.push('guarda el assessment reducido del cliente');
    if(!((document.getElementById('abaStartLoc')||{}).value)) missing.push('Start location');
    if(!((document.getElementById('abaEndLoc')||{}).value)) missing.push('End location');
    var pres = (typeof _abaGetPresentSel === 'function') ? _abaGetPresentSel() : [];
    if(!pres.length) missing.push('marca quién estuvo presente');
    if((document.getElementById('abaEnvYesNo')||{}).value === 'Yes' && !((document.getElementById('abaEnvChange')||{}).value)) missing.push('elige el cambio de entorno');
    if((document.getElementById('abaIncYesNo')||{}).value === 'Yes' && !((document.getElementById('abaIncText')||{}).value||'').trim()) missing.push('describe el incidente');
    if((document.getElementById('abaMedYesNo')||{}).value === 'Yes' && !(typeof _abaMedValue === 'function' ? _abaMedValue() : '')) missing.push('selecciona la preocupación médica');
  }

  btn.disabled = missing.length > 0;
  btn.style.opacity = missing.length ? '0.5' : '';
  btn.style.cursor = missing.length ? 'not-allowed' : '';
  if(!btn.disabled && typeof _abaWantNote === 'function'){
    btn.textContent = _abaWantNote() ? 'Generar forma + nota 97153' : 'Generar forma de AbaMatrix';
  }
  if(info){
    if(missing.length){
      info.style.color = 'var(--text3)';
      info.textContent = 'Falta para poder generar: ' + missing.join(' · ');
    } else {
      info.style.color = 'var(--green)';
      info.textContent = '\u2713 Todo lo tuyo está listo — puedes generar.';
    }
  }
}

async function _abaGenerateAll(){
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); return; }
  var cfg = _abaCfg(_abaClientId);
  if(!cfg){ showMsg('abaMsg','Sube primero el JSON de configuración de este cliente.','err'); return; }
  if(!(LS.get('aba5_assess_' + _abaClientId) || '').trim()){ showMsg('abaMsg','Este cliente no tiene assessment reducido guardado.','err'); return; }
  var presentArr = (typeof _abaGetPresentSel === 'function') ? _abaGetPresentSel() : [];
  if(!presentArr.length){ showMsg('abaMsg','Marca al menos una persona en "Who was present" antes de generar.','err'); return; }

  if(typeof _apiResetStats === 'function') _apiResetStats();
  var _runT0 = Date.now();
  var btn = document.getElementById('abaAllBtn'); if(btn){ btn.disabled = true; btn.textContent = 'Generando…'; }
  var prog = document.getElementById('abaAllProg');
  var step = function(t){ if(prog) prog.textContent = t; };
  try{
    step('1/5 · Prompt de inicio…');
    await _abaProposeStartPrompt();

    var envYes = (document.getElementById('abaEnvYesNo')||{}).value === 'Yes';
    if(envYes){ step('2/5 · Manipulación por barreras…'); await _abaProposeManipulation(); }

    var _q = _abaCardQuota(_abaClientId);
    var _fmtNow = _abaCfg(_abaClientId);
    var _hasGoals = !_fmtNow || _fmtNow.format !== 'behavior_program';
    // Behaviors and goals are independent of each other, so the two tracks run
    // CONCURRENTLY. Each track stays sequential inside itself, because a card needs
    // to know which antecedents and activities the previous cards of its own track
    // already used. This halves the slowest phase without weakening that de-duplication.
    step('3/5 · Behavior Reduction (' + _q.mal + ' conductas)' + (_hasGoals ? ' + Goal Implementation (' + _q.goal + ' metas)' : '') + '…');
    var _tracks = await Promise.all([
      _abaBuildBehaviorReduction(),
      _hasGoals ? _abaBuildGoalImplementation() : Promise.resolve(null)
    ]);
    var _brOk = _tracks[0];

    // A 97153 note without maladaptive behaviors is not a valid note. Previously the
    // run carried on and the final green message overwrote whatever red warning this
    // step had shown, so the section came out as "[FALTA]" with no explanation left
    // on screen. Stop here and keep the reason visible.
    if(_brOk === false || !String(_abaState.behaviorReduction||'').trim()){
      step('');
      var _prev = String(_abaLastBrReason||'').trim();
      showMsg('abaMsg','No se generó ninguna conducta, así que la nota se detuvo aquí (una nota 97153 sin conductas no es válida). '
        + (_prev ? 'Motivo: ' + _prev : 'Revisa la configuración de AbaMatrix de este cliente.'),'err');
      return;
    }

    if(!_hasGoals){
      _abaState.goalImplementation = '';   // goals are inside the Behavior & Program cards
    }

    step('4/5 · Participación del cliente…');
    await _abaProposeParticipation();

    step('5/5 · Cierre…');
    await _abaBuildClosing();

    // Required fields must not end up blank — regenerate the ones that did.
    if(!_abaState.startPrompt){ step('Reintentando prompt de inicio…'); await _abaProposeStartPrompt(); }
    if(!_abaState.participation){ step('Reintentando participación…'); await _abaProposeParticipation(); }

    _abaBuildUponArrival();          // assembles the structured form

    // AbaMatrix writes the narrative itself once the parameters are selected, so the
    // prose note is OFF by default: it is the single most expensive call of the run
    // (32k output tokens plus reasoning, retried at 65k when it truncates) and for an
    // AbaMatrix client it is redundant work.
    if(_abaWantNote()){
      step('7/7 · Redactando la nota 97153…');
      await _abaGenerate97153();
    }

    step('');
    // Show the run's real cost next to the result, so "va lentísimo" becomes a number
    // instead of an impression: total time, and how much of it was waiting on retries.
    var _secs = Math.round((Date.now() - _runT0)/1000);
    var _rt = (typeof _apiStats === 'object') ? _apiStats.retries : 0;
    var _q429 = (typeof _apiStats === 'object' && _apiStats.byStatus) ? (_apiStats.byStatus[429]||0) : 0;
    var _perf = ' · ' + _secs + ' s, ' + ((typeof _apiStats==='object') ? _apiStats.calls : 0) + ' llamadas'
      + (_rt ? ', ' + _rt + ' reintento(s)' + (_q429 ? ' (' + _q429 + ' por límite de tu clave de Gemini)' : '') : '');
    if(_q429) showMsg('abaMsg','Generado en ' + _secs + ' s, pero tu clave de Gemini alcanzó su límite ' + _q429 + ' vez/veces y el sistema tuvo que esperar. Eso es cuota de la clave, no la conexión ni el país. Revisa el plan de esa clave en Google AI Studio.','err');
    else showMsg('abaMsg', (_abaWantNote()
      ? 'Forma de AbaMatrix y nota generadas. Revisa la forma campo por campo antes de pasarla a AbaMatrix.'
      : 'Forma de AbaMatrix generada. Revísala campo por campo y pásala a AbaMatrix, que redacta la nota. Si necesitas el texto en prosa, marca la casilla o usa "Generar nota 97153".') + _perf, 'ok');
  } catch(err){
    showMsg('abaMsg','Error al generar: ' + (err.message||err),'err');
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = _abaWantNote() ? 'Generar forma + nota 97153' : 'Generar forma de AbaMatrix'; }
    step('');
  }
}

function _abaCopyNote(){
  var ta = document.getElementById('abaNoteOut');
  if(!ta || !ta.value){ showMsg('abaMsg','Genera primero la nota.','err'); return; }
  ta.select();
  try{ document.execCommand('copy'); showMsg('abaMsg','Nota copiada.','ok'); }
  catch(e){ if(navigator.clipboard) navigator.clipboard.writeText(ta.value); showMsg('abaMsg','Nota copiada.','ok'); }
}

function _abaOnIncYesNo(){
  var yes = document.getElementById('abaIncYesNo').value === 'Yes';
  var w = document.getElementById('abaIncWrap');
  if(w) w.style.display = yes ? 'block' : 'none';
  if(!yes){ var t = document.getElementById('abaIncText'); if(t) t.value = ''; }
}

function _abaOnMedYesNo(){
  var yes = document.getElementById('abaMedYesNo').value === 'Yes';
  var w = document.getElementById('abaMedWrap');
  if(w) w.style.display = yes ? 'block' : 'none';
  if(!yes){
    var sel = document.getElementById('abaMedSel'); if(sel) sel.value = '';
    var ow = document.getElementById('abaMedOtherWrap'); if(ow) ow.style.display = 'none';
    var o = document.getElementById('abaMedOther'); if(o) o.value = '';
  }
}

function _abaOnMedSel(){
  var v = document.getElementById('abaMedSel').value;
  var ow = document.getElementById('abaMedOtherWrap');
  if(ow) ow.style.display = (v === 'Other') ? 'block' : 'none';
}

// Resolved medical concern: the list item, or the free-text "Other" value.
function _abaMedValue(){
  if(!document.getElementById('abaMedYesNo') || document.getElementById('abaMedYesNo').value !== 'Yes') return '';
  var v = (document.getElementById('abaMedSel')||{}).value || '';
  if(v === 'Other') return ((document.getElementById('abaMedOther')||{}).value || '').trim();
  return v;
}

async function _abaProposeParticipation(){
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); return; }
  var btn = document.getElementById('abaPartBtn'); if(btn) btn.disabled = true;
  var outEl = document.getElementById('abaPartOut'); if(outEl) outEl.textContent = 'Seleccionando\u2026';
  try{
    var envYes = document.getElementById('abaEnvYesNo') && document.getElementById('abaEnvYesNo').value === 'Yes';
    var env = envYes ? (document.getElementById('abaEnvChange')||{}).value : '';
    var recent = LS.get('aba5_abapart_' + _abaClientId) || [];
    if(!Array.isArray(recent)) recent = [];
    var ctx = 'Choose how the client participated during this service.';
    if(env) ctx += ' Session context: an environmental change was documented \u2014 "' + env + '" \u2014 which plausibly affected participation.';
    if(recent.length) ctx += ' For variation across notes, avoid repeating these recently used options unless the clinical picture clearly calls for one of them: ' + recent.map(function(r){ return '"' + r + '"'; }).join('; ') + '.';
    ctx += ' The option must remain clinically plausible for this client\u2019s current level (prompting needs and maladaptive behavior frequency in the profile). Do not jump to an extreme option without clinical justification.';
    var res = await _abaPickFromList(ctx, ABA_PARTICIPATION);
    if(res && res.error){ _abaState.participation=''; if(outEl) outEl.textContent=''; showMsg('abaMsg', res.error, 'err'); return; }
    // Required field in AbaMatrix: never leave it blank.
    var chosenPart = (res && res.value) ? res.value : '';
    if(!chosenPart){
      var poolPart = ABA_PARTICIPATION.filter(function(x){ return recent.indexOf(x) === -1; });
      if(!poolPart.length) poolPart = ABA_PARTICIPATION.slice();
      chosenPart = poolPart[Math.floor(Math.random() * poolPart.length)];
    }
    _abaState.participation = chosenPart;
    if(outEl) outEl.textContent = chosenPart;
    recent.unshift(chosenPart);
    LS.set('aba5_abapart_' + _abaClientId, recent.slice(0, 3));
  } catch(err){ if(outEl) outEl.textContent=''; showMsg('abaMsg','Error al seleccionar: ' + (err.message||err), 'err'); }
  finally{ if(btn) btn.disabled = false; }
}

// Assembles the AbaMatrix form in the platform's own section order, field by
// field, so it can be transcribed into AbaMatrix without guessing. Missing
// fields are shown explicitly as [FALTA] rather than silently omitted.
function _abaBuildUponArrival(){
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); return; }
  var L = [];
  var miss = [];
  var need = function(v, label){ if(!v){ miss.push(label); return '[FALTA — ' + label + ']'; } return v; };

  var start = (document.getElementById('abaStartLoc')||{}).value || '';
  var end = (document.getElementById('abaEndLoc')||{}).value || '';
  var presentArr = (typeof _abaGetPresentSel === 'function') ? _abaGetPresentSel() : [];
  var envYes = (document.getElementById('abaEnvYesNo')||{}).value === 'Yes';
  var env = envYes ? ((document.getElementById('abaEnvChange')||{}).value || '') : '';
  var incYes = (document.getElementById('abaIncYesNo')||{}).value === 'Yes';
  var incTxt = ((document.getElementById('abaIncText')||{}).value || '').trim();
  var medYes = (document.getElementById('abaMedYesNo')||{}).value === 'Yes';
  var medVal = (typeof _abaMedValue === 'function') ? _abaMedValue() : '';

  L.push('═══ UPON ARRIVAL ═══');
  L.push('Start location: ' + need(start, 'Start location'));
  L.push('End location: ' + need(end, 'End location'));
  // El campo lo etiqueta AbaMatrix como "Caregiver(s)", asi que con mas razon no
  // puede llevar personal docente en una sesion de casa.
  var _upFilt = _filterParticipantsByPlace(presentArr, start);
  if(_upFilt.removed.length){ try{ _placeFilterNotice(_upFilt, start, 'abaMsg'); }catch(e){} }
  L.push('Who was present during the service? Caregiver(s): ' + need(_upFilt.kept.join(', '), 'Who was present'));
  if(start === 'Home'){
    L.push('Was the parent or guardian present? Yes');
  } else if(start) {
    var reason = (typeof ABA_LOC_REASON !== 'undefined' && ABA_LOC_REASON[start]) || _abaCustomReason(start);
    L.push('Was the parent or guardian present? No');
    L.push('  Reason: ' + reason);
  } else {
    L.push('Was the parent or guardian present? [FALTA — depende del Start location]');
  }
  L.push('Were there any significant changes to the client\u2019s environment? ' + (envYes ? 'Yes' : 'No'));
  if(envYes){
    L.push('  Change: ' + need(env, 'Environmental change'));
    L.push('Were there any manipulations made due to the barriers encountered? Yes');
    L.push('  Manipulation: ' + need(_abaState.manipulation, 'Manipulación (pulsa Generar todo)'));
  } else {
    L.push('Were there any manipulations made due to the barriers encountered? No');
  }
  L.push('Did you use any prompt at the start of the service? ' + (_abaState.startPrompt ? 'Yes' : '[FALTA]'));
  L.push('  Prompt: ' + need(_abaState.startPrompt, 'Prompt de inicio (pulsa Generar todo)'));

  L.push('');
  L.push('═══ CLIENT PARTICIPATION ═══');
  L.push('How was the client\u2019s participation during service?');
  L.push('  ' + need(_abaState.participation, 'Participación (pulsa Generar todo)'));

  L.push('');
  L.push('═══ INCIDENTS & MEDICAL CONCERNS ═══');
  L.push('Were there any incidents during the service? ' + (incYes ? 'Yes' : 'No'));
  if(incYes) L.push('  Incident: ' + need(incTxt, 'Descripción del incidente'));
  L.push('Were there any medical concerns? ' + (medYes ? 'Yes' : 'No'));
  if(medYes) L.push('  Medical concern: ' + need(medVal, 'Preocupación médica'));

  L.push('');
  L.push(( _abaCfg(_abaClientId) && _abaCfg(_abaClientId).format === 'behavior_program')
    ? '═══ BEHAVIOR & PROGRAM ═══' : '═══ BEHAVIOR REDUCTION ═══');
  L.push(_abaState.behaviorReduction || '[FALTA — pulsa Generar todo]');
  if(!_abaState.behaviorReduction) miss.push('Behavior Reduction');

  // In the fused "Behavior & Program" format the goals live inside each card,
  // so there is no separate Goal Implementation section to print.
  var _cfgF = _abaCfg(_abaClientId);
  if(!_cfgF || _cfgF.format !== 'behavior_program'){
    L.push('');
    L.push('═══ GOAL IMPLEMENTATION ═══');
    L.push(_abaState.goalImplementation || '[FALTA — pulsa Generar todo]');
    if(!_abaState.goalImplementation) miss.push('Goal Implementation');
  }

  L.push('');
  L.push(_abaState.closing || '═══ RELEVANT INFORMATION / COMMENTS ═══\n[FALTA — pulsa Generar todo]\n\n═══ NEXT VISIT ═══\n[FALTA]');
  if(!_abaState.closing) miss.push('Relevant Information / Next Visit');

  var out = L.join('\n');
  var ob = document.getElementById('abaOutput'); if(ob) ob.value = out;
  if(miss.length) showMsg('abaMsg','\u26A0 Forma armada con campos sin completar: ' + miss.join(', ') + '.','err');
  else showMsg('abaMsg','Forma de AbaMatrix completa. Transcríbela campo por campo.','ok');
}

function _abaCopyOutput(){
  var ob = document.getElementById('abaOutput');
  if(!ob || !ob.value){ showMsg('abaMsg','Primero pulsa "Armar Upon Arrival".','err'); return; }
  ob.select();
  try{ document.execCommand('copy'); showMsg('abaMsg','Copiado. Pégalo en AbaMatrix.','ok'); }
  catch(e){ if(navigator.clipboard) navigator.clipboard.writeText(ob.value); showMsg('abaMsg','Copiado.','ok'); }
}

function _abaRefreshClientSelect(){
  var sel = document.getElementById('abaClientSel');
  if(!sel) return;
  var cur = sel.value;
  var therapistId = (document.getElementById('abaTherapistSel') || {}).value || '';
  // Clients are selected by therapist first, like the other tabs.
  var filtered = therapistId
    ? (clients||[]).filter(function(c){ return c.therapistId === therapistId; })
                   .sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); })
    : [];
  var opts = '<option value="">— select client —</option>';
  filtered.forEach(function(c){
    // Which of the two AbaMatrix exports this client already has, right in the list:
    // the question "did I upload both JSONs for this one?" has to be answerable
    // without opening the client one by one.
    var st = (typeof _abaJsonState === 'function') ? _abaJsonState(c.id) : null;
    var tag = '';
    if(st){
      if(st.dailylog.ok && st.clinical.ok) tag = '  ✓✓ los 2 JSON';
      else if(st.dailylog.ok)              tag = '  ✓ Daily Log · FALTA el clínico';
      else if(st.clinical.ok)              tag = '  ✓ clínico · FALTA el Daily Log';
      else                                 tag = '  ✗ sin JSON';
    }
    opts += '<option value="' + c.id + '">' + esc(c.name||c.id) + esc(tag) + '</option>';
  });
  sel.innerHTML = opts;
  if(cur && filtered.find(function(c){ return c.id === cur; })) sel.value = cur;
  else { _abaClientId = null; }
  _abaOnClientChange();
}

function _abaOnClientChange(){
  var id = document.getElementById('abaClientSel').value;
  if(_clientSwitchBlocked(id)){ _refuseClientSwitch('abaClientSel'); return; }
  if(id){ _abaLoadUponArrival(id); }
  else { _abaClientId = null; }
}

function _abaOnEnvYesNo(){
  var yes = document.getElementById('abaEnvYesNo').value === 'Yes';
  var wrap = document.getElementById('abaEnvChangeWrap');
  var manip = document.getElementById('abaManipRow');
  if(wrap) wrap.style.display = yes ? 'block' : 'none';
  if(manip) manip.style.display = yes ? 'block' : 'none';
  if(!yes){ _abaState.manipulation = ''; var mo = document.getElementById('abaManipOut'); if(mo) mo.textContent = ''; }
}

// ---- Calidad de redaccion frente a los defectos del catalogo de AbaMatrix ---
// La plataforma obliga a elegir de listas cerradas cuya redaccion trae erratas,
// duplicados y terminologia incorrecta, y los auditores senalan esos errores como
// si fueran nuestros. El valor del campo tiene que ser el literal de la plataforma
// -es una lista cerrada-, pero la PROSA es nuestra y ahi no hay ninguna obligacion
// de repetir una etiqueta malformada.

// Etiqueta de la plataforma -> termino clinico correcto, SOLO para la prosa.
// Nunca cambia el valor que se selecciona en el formulario.
var ABA_TERM_CANON = [
  [/^most to lead prompt fading$/i,            'most-to-least prompt fading'],
  [/^planned ignore$/i,                        'planned ignoring'],
  [/alternate behaviors?\s*\(dra\)/i,          'differential reinforcement of alternative behavior (DRA)'],
  [/^redirection to an? alternative response$/i,'redirection to an alternative response'],
  [/^interrupt behavior with physical guidance$/i, 'interruption of the behavior with physical guidance'],
  [/^response interruption\s*\/\s*redirection \(rir\)$/i, 'response interruption and redirection (RIRD)'],
  [/^instructed to compete instructions/i,     'instructed to complete the instructions']
];
function _abaCanonTerm(label){
  var t = String(label||'').trim();
  for(var i=0;i<ABA_TERM_CANON.length;i++){
    if(ABA_TERM_CANON[i][0].test(t)) return ABA_TERM_CANON[i][1];
  }
  return t;
}

// Two entries that are the same procedure spelled differently make consecutive notes
// of the same client look inconsistent to an auditor. Collapse them to ONE spelling,
// always the same, choosing the better-formed variant. Both are valid platform values,
// so this never puts an unselectable string in the form.
function _abaDedupeVariants(list){
  var seen = {}, out = [], dropped = [];
  var key = function(x){
    return String(x||'').toLowerCase().replace(/[^a-z]/g,'')
      .replace(/alternate|alternative/,'alt').replace(/behaviou?rs?/,'beh')
      .replace(/ignore|ignoring/,'ign').replace(/toan?/,'to');
  };
  var better = function(a, b){
    // Prefer correct spelling, then the longer label (usually the fuller wording).
    var score = function(x){
      var n = 0;
      if(/alternative/i.test(x)) n += 2;
      if(/alternate/i.test(x))   n -= 2;
      if(/ignoring/i.test(x))    n += 2;
      if(/\bignore\b/i.test(x))  n -= 2;
      return n + Math.min(x.length, 60) / 100;
    };
    return score(a) >= score(b) ? a : b;
  };
  (list||[]).forEach(function(x){
    var v = String(x||'').trim();
    if(!v) return;
    var k = key(v);
    if(seen[k] === undefined){ seen[k] = out.length; out.push(v); return; }
    var cur = out[seen[k]];
    var win = better(cur, v);
    if(win !== cur){ dropped.push(cur); out[seen[k]] = win; } else { dropped.push(v); }
  });
  return { list: out, dropped: dropped };
}

// The Evidenced By catalog is not filtered per behavior: it offers descriptors that
// belong to other response classes entirely (a VOCAL descriptor under Motor
// Stereotypy; head banging or biting under Off-task). Picking one of those documents
// a behavior that did not occur. Narrow the closed list to the descriptors this
// client's own topography actually supports. Everything kept is still a literal
// platform value, so the form stays valid.
function _abaEvidForBehavior(evidList, topo, behName){
  var all = (evidList||[]).slice();
  var t = String(topo||'').toLowerCase();
  if(!t) return { list: all, filtered: [] };
  // A topography ends by listing what does NOT count ("Exclusions: ... Does not
  // include: refusal ..."). Those words describe OTHER behaviors, so leaving them in
  // makes an excluded descriptor look supported - exactly the confusion the analysts
  // report. Cut the definition at the exclusions before weighing the descriptors.
  var _cut = t.search(/\bexclusions?\b|\bdoes not include\b|\bnon-?examples?\b|\bdistinct from\b/);
  if(_cut > 40) t = t.slice(0, _cut);
  var STOP = /^(the|and|for|with|that|this|from|when|any|are|his|her|not|into|out|off|has|have|been|such|other|than|over|more|less|instance|behavior|behaviour|client|onset|offset|seconds|second|minutes|minute|episode|recorded|begins|ends|least|consecutive|without|during|including|example|examples)$/;
  var words = t.replace(/[^a-z\s]/g,' ').split(/\s+/).filter(function(w){ return w.length > 3 && !STOP.test(w); });
  var stem = function(w){ return w.replace(/(ing|ed|es|s)$/,''); };
  var bag = {}; words.forEach(function(w){ bag[stem(w)] = 1; });
  var supported = [], foreign = [];
  all.forEach(function(d){
    var dw = String(d).toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/)
      .filter(function(w){ return w.length > 3 && !STOP.test(w); });
    var hit = dw.some(function(w){ return bag[stem(w)]; });
    (hit ? supported : foreign).push(d);
  });
  // Only narrow when enough descriptors survive; otherwise the client's topography is
  // too terse to judge and the full list is safer than an arbitrary cut.
  if(supported.length >= 2) return { list: supported, filtered: foreign };
  return { list: all, filtered: [] };
}

// Defects found in THIS client's catalogs. Shown after import so the user can raise
// them with the platform and, if an auditor asks, explain why the note reads better
// than the dropdown it came from.
function _abaCatalogDefects(cfg){
  var out = { dupes: [], variants: [], terms: [], trailing: [] };
  if(!cfg) return out;
  var pools = [];
  [cfg.interventionsByFunction, cfg.consequencesByFunction, cfg.antecedents].forEach(function(m){
    Object.keys(m||{}).forEach(function(k){ pools = pools.concat(m[k]||[]); });
  });
  pools = pools.concat(cfg.reinforcers||[], cfg.teaching||[], cfg.activities||[]);
  var seenExact = {};
  pools.forEach(function(x){
    var v = String(x||'');
    if(!v) return;
    if(v !== v.trim() && out.trailing.indexOf(v) === -1) out.trailing.push(v);
    var k = v.trim().toLowerCase();
    if(seenExact[k]) { if(out.dupes.indexOf(v.trim()) === -1) out.dupes.push(v.trim()); }
    else seenExact[k] = 1;
    var canon = _abaCanonTerm(v.trim());
    if(canon.toLowerCase() !== v.trim().toLowerCase()){
      var pair = v.trim() + '  ->  ' + canon;
      if(out.terms.indexOf(pair) === -1) out.terms.push(pair);
    }
  });
  var uniq = Object.keys(seenExact);
  var d = _abaDedupeVariants(uniq.map(function(k){ return k; }));
  // Variant pairs: same normalised key, different literal text.
  var byKey = {};
  uniq.forEach(function(k){
    var kk = k.replace(/[^a-z]/g,'').replace(/alternate|alternative/,'alt')
              .replace(/behaviou?rs?/,'beh').replace(/ignore|ignoring/,'ign').replace(/toan?/,'to');
    (byKey[kk] = byKey[kk] || []).push(k);
  });
  Object.keys(byKey).forEach(function(k){ if(byKey[k].length > 1) out.variants.push(byKey[k].join('  ||  ')); });
  return out;
}

// ---- Importador del export clinico de AbaMatrix ----------------------------
// Complementa al JSON del Daily Log: aquel trae las listas cerradas que la
// plataforma ofrece, y este la sustancia clinica (funciones, topografia y el
// catalogo de intervenciones con su funcion). Acepta las DOS formas de export que
// hemos visto y filtra por si mismo los Mastered, de modo que da igual si el export
// los excluyo en origen o no.
function _abaReadClinicalJson(json){
  var sb = (json && json.skills_and_behaviors) || {};
  var arr = function(v){
    if(Array.isArray(v)) return v;                       // forma A: array directo
    if(v && Array.isArray(v.items)) return v.items;      // forma B: {count, items}
    return [];
  };
  var firstActive = function(list, key){
    if(!Array.isArray(list)) return null;
    var a = list.find(function(x){ return x && x.active === true; }) || list[0] || null;
    return a ? (key ? a[key] : a) : null;
  };
  var status = function(b){
    var s = b.current_status;
    if(s && typeof s === 'object') s = s.status;
    if(!s) s = firstActive(b.status || b.statuses, 'status');
    return String(s || '').trim();
  };
  var funcs = function(b){
    if(Array.isArray(b.current_functions) && b.current_functions.length) return b.current_functions.slice();
    var f = firstActive(b.functions);
    if(f && Array.isArray(f.functions)) return f.functions.slice();
    if(Array.isArray(b.functions) && typeof b.functions[0] === 'string') return b.functions.slice();
    return [];
  };
  var topo = function(b){
    return String(b.current_topography_text
      || (b.info && b.info.topography_text)
      || firstActive(b.topography, 'text') || '').trim();
  };
  // Names can carry invisible control characters (one export ships a U+0002 inside
  // "Self Injurious behavior"); the app must store the clean name.
  var norm = function(x){
    return String(x||'').replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g,' ').replace(/\s+/g,' ').trim();
  };
  var take = function(list, wantFn){
    return arr(list).map(function(b){
      var st = status(b);
      return {
        name: norm(b.name),
        fn: wantFn ? _fnClassList(funcs(b).join('+')).join('+') : '',
        topo: wantFn ? topo(b) : '',
        mastered: /^mastered$/i.test(st),
        status: st
      };
    }).filter(function(x){ return x.name; });
  };
  var ivs = arr(json && json.interventions).map(function(i){
    return {
      name: norm(i.name),
      fns: (i.functions || i.related_functions || []).slice(),
      // These flags are booleans despite the _text suffix used in the export.
      ante: i.antecedent_text === true || i.antecedent === true,
      cons: i.consequence_text === true || i.consequence === true
    };
  }).filter(function(i){ return i.name; });
  return { mal: take(sb.maladaptive_behaviors, true), rep: take(sb.replacement_behaviors, false), interventions: ivs };
}

// Applies the parsed export to the client. NON-DESTRUCTIVE by design: it never
// overwrites a function, topography or status that a person or the reduced
// assessment already established. It only fills gaps and reports what it did.
function _abaApplyClinicalJson(parsed, clientId){
  var out = { malNew:0, malFilled:0, repNew:0, repFilled:0, mastered:0, catAnte:0, catCons:0, kept:[] };
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var mal = normalizeBehaviorArr(pools.mal || []);
  var rep = normalizeBehaviorArr(pools.rep || []);
  var nz = function(x){ return String(x||'').trim().toLowerCase(); };
  var merge = function(target, incoming, isMal){
    incoming.forEach(function(it){
      if(it.mastered) out.mastered++;
      var ex = target.find(function(x){ return nz(x.name) === nz(it.name); });
      if(!ex){
        var row = { name: it.name, status: it.mastered ? 'mastered' : 'active' };
        if(isMal){ if(it.fn) row.fn = it.fn; if(it.topo) row.topo = it.topo; }
        target.push(row);
        if(isMal) out.malNew++; else out.repNew++;
        return;
      }
      var filled = false;
      // The export is authoritative for the STATUS: it is what says whether the
      // program is still being taught. Everything else only fills a gap.
      if(it.mastered && ex.status !== 'mastered'){ ex.status = 'mastered'; filled = true; }
      if(isMal){
        if(it.fn && !ex.fn){ ex.fn = it.fn; filled = true; }
        if(it.topo && !String(ex.topo||'').trim()){ ex.topo = it.topo; filled = true; }
      }
      if(filled){ if(isMal) out.malFilled++; else out.repFilled++; }
      else out.kept.push(it.name);
    });
  };
  merge(mal, parsed.mal, true);
  merge(rep, parsed.rep, false);
  pools.mal = mal; pools.rep = rep;
  LS.set('aba5_pools_' + clientId, pools);

  // The interventions carry their function AND whether each is antecedent or
  // consequence. Use them to fill a catalog the Daily Log does not provide: in the
  // fused format the antecedent field is free text with no options at all.
  var cfg = _abaCfg(clientId);
  if(cfg && parsed.interventions.length){
    var byFn = function(pick){
      var m = {};
      parsed.interventions.forEach(function(i){
        if(!pick(i)) return;
        (i.fns||[]).forEach(function(f){
          var k = String(f).toLowerCase();
          m[k] = m[k] || [];
          if(m[k].indexOf(i.name) === -1) m[k].push(i.name);
        });
      });
      return m;
    };
    var a = byFn(function(i){ return i.ante; });
    var c = byFn(function(i){ return i.cons; });
    // anteIntFreeText means the platform offers NO antecedent catalog at all: the
    // parser fills that slot with a copy of the consequence list as a stopgap. So the
    // slot being non-empty does not mean there is a real catalog — check the flag.
    if((cfg.anteIntFreeText || !Object.keys(cfg.interventionsByFunction||{}).length) && Object.keys(a).length){
      cfg.interventionsByFunction = a; cfg.anteIntFreeText = false; out.catAnte = Object.keys(a).length;
    }
    if(!Object.keys(cfg.consequencesByFunction||{}).length && Object.keys(c).length){
      cfg.consequencesByFunction = c; out.catCons = Object.keys(c).length;
    }
    if(out.catAnte || out.catCons) LS.set('aba5_abaevid_' + clientId, cfg);
  }
  return out;
}

function _abaLoadClinicalFile(input){
  var f = input.files && input.files[0];
  if(!f) return;
  if(!_abaClientId){ showMsg('abaMsg','Selecciona un cliente primero.','err'); input.value=''; return; }
  var r = new FileReader();
  r.onload = function(e){
    try{
      var json = JSON.parse(e.target.result);
      var parsed = _abaReadClinicalJson(json);
      if(!parsed.mal.length && !parsed.rep.length){
        showMsg('abaMsg','Ese JSON no trae conductas ni reemplazos reconocibles. Comprueba que sea el export clinico de Skills & Behaviors.','err');
        return;
      }
      var res = _abaApplyClinicalJson(parsed, _abaClientId);
      // Stamped AFTER applying: _abaApplyClinicalJson rewrites pools, so a stamp
      // written before it would be overwritten by the stale copy it holds.
      _abaStampImport(_abaClientId, 'clinical', f.name,
        parsed.mal.length + ' conductas · ' + parsed.rep.length + ' reemplazos'
        + (res.mastered ? ' · ' + res.mastered + ' mastered' : ''));
      _abaRetagClientOption(_abaClientId);
      if(typeof _backfillRepFunctions === 'function') _backfillRepFunctions(_abaClientId);
      if(typeof renderBehaviorChips === 'function') renderBehaviorChips(_abaClientId);
      if(typeof _abaRenderSetup === 'function') _abaRenderSetup();
      if(typeof _abaRenderActive === 'function') _abaRenderActive();
      if(typeof _abaRenderEvidInfo === 'function') _abaRenderEvidInfo();
      var parts = [parsed.mal.length + ' conducta(s) y ' + parsed.rep.length + ' reemplazo(s) leidos'];
      if(res.mastered) parts.push(res.mastered + ' marcados Mastered (fuera de la rotacion)');
      if(res.malNew || res.repNew) parts.push((res.malNew + res.repNew) + ' nuevos');
      if(res.malFilled || res.repFilled) parts.push((res.malFilled + res.repFilled) + ' completados');
      if(res.catAnte) parts.push('catalogo de intervenciones ANTECEDENTES creado (' + res.catAnte + ' funciones)');
      if(res.catCons) parts.push('catalogo de CONSECUENTES creado (' + res.catCons + ' funciones)');
      if(res.kept.length) parts.push(res.kept.length + ' sin tocar (ya tenian dato propio)');
      showMsg('abaMsg','Export clinico importado: ' + parts.join(' · ') + '.','ok');
    }catch(err){
      showMsg('abaMsg','JSON invalido: ' + (err.message||err),'err');
    }
    input.value = '';
  };
  r.readAsText(f);
}

// ---- Preparacion de un cliente de AbaMatrix --------------------------------
// Configurar un cliente son varios pasos en pantallas distintas, y saltarse uno no
// da error: da una nota peor sin decir por que. Ha pasado con dos clientes. Esto
// inspecciona lo que hay guardado y dice, paso a paso, que falta y donde hacerlo.
function _abaSetupChecklist(clientId){
  var out = [];
  if(!clientId) return out;
  var pools = LS.get('aba5_pools_' + clientId) || {};
  var cfg   = _abaCfg(clientId);
  var prof  = String(LS.get('aba5_assess_' + clientId) || '').trim();
  var mal   = normalizeBehaviorArr(pools.mal || []);
  var rep   = normalizeBehaviorArr(pools.rep || []);
  var act   = function(a){ return a.filter(function(x){ return x.status !== 'mastered' && x.status !== 'onhold'; }); };
  var malA = act(mal), repA = act(rep);
  var add = function(ok, label, detail, where){ out.push({ ok: ok, label: label, detail: detail || '', where: where || '' }); };

  add(!!prof, '1. Assessment reducido guardado',
      prof ? Math.round(prof.length/1000) + ' KB' : 'Sin él no se genera nada.',
      'Pestaña Assessment: sube el documento y guarda el reducido.');

  var malFn = malA.filter(function(x){ return x.fn; }).length;
  add(malA.length > 0 && malFn === malA.length, '2. Conductas con función',
      malA.length ? malFn + ' de ' + malA.length + ' activas' + (mal.length > malA.length ? ' (' + (mal.length-malA.length) + ' mastered/en pausa)' : '') : 'ninguna',
      'Pestaña Assessment: "Extraer del reducido".');

  var malTopo = malA.filter(function(x){ return x.topo; }).length;
  add(malA.length > 0 && malTopo === malA.length, '3. Conductas con topografía',
      malA.length ? malTopo + ' de ' + malA.length : 'ninguna',
      'Va en el reducido: cada conducta con su definición operacional.');

  var malInt = malA.filter(function(x){ return x.int; }).length;
  add(malA.length > 0 && malInt === malA.length, '4. Intervenciones por conducta',
      malA.length ? malInt + ' de ' + malA.length : 'ninguna',
      'El reducido debe decir qué intervenciones usa CADA conducta, no solo el catálogo por función.');

  var repFn = repA.filter(function(x){ return x.fn; }).length;
  var repInf = repA.filter(function(x){ return x.fn && x.fnSrc === 'inferred'; }).length;
  add(repA.length > 0 && repFn === repA.length, '5. Reemplazos con función',
      repA.length ? repFn + ' de ' + repA.length + ' activos' + (repInf ? ' · ' + repInf + ' deducida(s) del nombre, verifícalas' : '') : 'ninguno',
      'Sin función no se puede emparejar 1:1 conducta↔reemplazo.');

  var repAct = repA.filter(function(x){ return String(x.act||'').trim(); }).length;
  add(repA.length > 0 && repAct === repA.length, '5b. Reemplazos con actividades',
      repA.length ? repAct + ' de ' + repA.length : 'ninguno',
      'El reducido debe decir en qué actividad se enseña CADA programa. Sin ellas la nota describe la enseñanza sin actividad.');

  var reinf = String(pools.reinforcers||'').trim() || (cfg && (cfg.reinforcers||[]).join(', '));
  add(!!reinf, '6. Reforzadores del cliente',
      reinf ? String(reinf).split(',').length + ' registrados' : 'ninguno: la nota usaría un respaldo genérico',
      'Ficha del cliente, campo "Preferred Reinforcers", o vienen en el JSON del Daily Log.');

  // Los dos JSON van en dos lineas separadas: son dos exports distintos de
  // AbaMatrix y una sola linea no dejaba ver cual de los dos faltaba.
  var st = _abaJsonState(clientId);
  var hasCfg = !!cfg;
  var hasCat = hasCfg && (cfg.anteIntFreeText
      || Object.keys(cfg.consequencesByFunction||{}).length
      || Object.keys(cfg.interventionsByFunction||{}).length);
  add(hasCfg && hasCat, '7. JSON del Daily Log subido',
      !hasCfg ? 'NO subido'
        : (!hasCat ? 'subido pero SIN catálogo de intervenciones: vuelve a subirlo'
          : (st.dailylog.stamp ? 'subido el ' + _abaStampText(st.dailylog.stamp)
             : (cfg.behaviors||[]).length + ' conductas · ' + (cfg.format === 'behavior_program' ? 'Behavior & Program' : 'Behavior Reduction') + ' (subido antes de que se registrara la fecha)')),
      'Pestaña ABAMATRIX → "Configuración AbaMatrix de este cliente" → primer botón de subir JSON.');

  add(st.clinical.ok, '8. JSON clínico (Skills & Behaviors) subido',
      !st.clinical.ok ? 'NO subido: sin él faltan funciones, topografías y el estatus Mastered'
        : (st.clinical.stamp ? 'subido el ' + _abaStampText(st.clinical.stamp)
           : 'ya aplicado (subido antes de que se registrara la fecha)'),
      'Pestaña ABAMATRIX → mismo bloque → botón del export clínico. Son DOS JSON distintos por cliente.');

  var dq = String(pools.docreq||'').trim();
  var q  = (typeof _abaCardQuota === 'function') ? _abaCardQuota(clientId) : null;
  add(true, '9. Requisitos de la agencia', dq ? 'declarados' : 'ninguno: solo se aplica la base clínica global',
      'Ficha del cliente. Opcional, pero si la agencia exige mínimos hay que escribirlos aquí.');
  add(true, '10. Cuántas conductas y metas por nota',
      q ? q.mal + ' conductas + ' + q.goal + ' metas (' + (q.source === 'manual' ? 'fijado a mano' : q.source === 'assessment' ? 'del assessment' : 'por defecto') + ')' : '',
      'Casillas de esta pestaña.');

  var min = (typeof _programDocMinimums === 'function') ? _programDocMinimums(pools) : null;
  if(min && min.activities){
    var pa = Object.keys(pools.progActs||{}).length;
    add(pa > 0, '11. Actividades por programa',
        pa ? pa + ' programas con lista cerrada' : 'faltan, y esta agencia exige ' + min.activities + ' por programa',
        'Ficha del cliente: pega el documento de actividades de la agencia.');
  }
  return out;
}

function _abaRenderSetup(){
  var box = document.getElementById('abaSetupList');
  var score = document.getElementById('abaSetupScore');
  if(!box) return;
  if(!_abaClientId){ box.innerHTML = '<span style="color:var(--text3)">Selecciona un cliente.</span>'; if(score) score.textContent=''; return; }
  if(typeof _abaRenderActive === 'function') _abaRenderActive();
  if(typeof _abaRenderPickGoals === 'function') _abaRenderPickGoals();
  var items = _abaSetupChecklist(_abaClientId);
  var pend = items.filter(function(i){ return !i.ok; });
  if(score){
    score.textContent = pend.length ? pend.length + ' paso(s) pendiente(s)' : 'todo listo ✓';
    score.style.color = pend.length ? 'var(--err, #c0392b)' : 'var(--green, #16a34a)';
  }
  var esc = function(x){ return String(x||'').replace(/[&<>]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]; }); };
  box.innerHTML = items.map(function(i){
    return '<div style="display:flex;gap:6px;align-items:flex-start">'
      + '<span style="flex-shrink:0;color:' + (i.ok ? 'var(--green,#16a34a)' : 'var(--err,#c0392b)') + '">' + (i.ok ? '✓' : '✗') + '</span>'
      + '<span><b style="font-weight:600;color:var(--text2)">' + esc(i.label) + '</b>'
      + (i.detail ? ' <span style="color:var(--text3)">— ' + esc(i.detail) + '</span>' : '')
      + (!i.ok && i.where ? '<br><span style="color:var(--text3);font-size:10px">→ ' + esc(i.where) + '</span>' : '')
      + '</span></div>';
  }).join('');
}
