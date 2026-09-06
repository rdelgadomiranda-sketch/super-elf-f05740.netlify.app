/* ═══════════════════════════════════════════════════════════
   DATA POOLS
═══════════════════════════════════════════════════════════ */
const GOALS_POOL = {
  p156:[
    "Training the recipient's family, caregiver(s), and other involved persons on the implementation of the behavior plan and intervention strategies",
    "Monitoring and assessing the progress towards goals in the behavior plan for family, caregiver(s), and other involved persons on the implementation of the behavior plan and intervention strategies",
    "Feedback and recommendations to gain in consistency out of therapy sessions"
  ],
  g1:[
    "Review/Adjustments to discriminative stimuli",
    "Review/Adjustments to antecedent manipulation",
    "Review/Adjustments to the observation process",
    "Review/Adjustments to measurements procedures",
    "Review/Adjustments to instructional materials and/or instructional activities",
    "Review/Adjustments to contextual variables",
    "Review/Adjustments to reinforcers and/or reinforcement delivery schedules",
    "Review/Adjustments to prompts and/or prompt fading",
    "Review/Adjustments to treatment targets and goals",
    "Review/Adjustments to observation and measurement"
  ],
  g2:[
    "Review/Adjustments to new or existing reinforcers",
    "Review/Adjustments to new or existing treatment goals",
    "Review/Adjustments to new or existing instructional materials",
    "Review/Adjustments to new or existing prompts",
    "Review/Adjustments to new or existing contextual variables",
    "Review/Adjustments to new or existing discriminative stimuli",
    "Review/Adjustments to new or existing instructions"
  ],
  g3rbt:[
    "Active direction of RBT during services to ensure correct implementation and fidelity of procedures",
    "Active direction of RBT to train the RBT to implement a modified protocol",
    "Active direction of RBT to training how to implement modified or new protocol",
    "Active direction of RBT during services to ensure implantation and fidelity of procedure"
  ],
  g3bcaba:[
    "Active direction of BCaBA during services to ensure correct implementation and fidelity of procedure",
    "Active direction of BCaBA to training how to implement a modified or new protocol"
  ],
  g4:[
    "Observations to determine if the protocol components are functioning effectively or require adjustments",
    "Testing a modified protocol with the recipient to determine effectiveness or if changes are needed",
    "Testing a modified protocol with the recipient to determine effectiveness and or changes",
    "Observation to determine if existing protocol components are functionally effective and/or required adjustments",
    "Observation to determine new protocol components"
  ]
};

const BACB_TASKS = [
  {code:"A-1",area:"Measurement",desc:"Prepare for data collection"},
  {code:"A-2",area:"Measurement",desc:"Implement continuous measurement procedures (frequency, duration)"},
  {code:"A-3",area:"Measurement",desc:"Implement discontinuous measurement procedures (partial/whole interval, momentary time sampling)"},
  {code:"A-5",area:"Measurement",desc:"Enter data and update graphs"},
  {code:"A-6",area:"Measurement",desc:"Describe behavior and environment in observable and measurable terms"},
  {code:"B-1",area:"Assessment",desc:"Conduct preference assessments"},
  {code:"C-3",area:"Skill Acquisition",desc:"Use contingencies of reinforcement"},
  {code:"C-4",area:"Skill Acquisition",desc:"Implement discrete-trial teaching procedures"},
  {code:"C-5",area:"Skill Acquisition",desc:"Implement naturalistic teaching procedures (incidental teaching)"},
  {code:"C-9",area:"Skill Acquisition",desc:"Implement prompt and prompt fading procedures"},
  {code:"C-10",area:"Skill Acquisition",desc:"Implement generalization and maintenance procedures"},
  {code:"D-3",area:"Behavior Reduction",desc:"Implement interventions based on modification of antecedents (motivating operations, discriminative stimuli)"},
  {code:"D-4",area:"Behavior Reduction",desc:"Implement differential reinforcement procedures (DRA, DRO)"},
  {code:"D-5",area:"Behavior Reduction",desc:"Implement extinction procedures"},
  {code:"E-4",area:"Documentation",desc:"Generate objective session notes for service verification"},
  {code:"F-2",area:"Professional",desc:"Respond appropriately to feedback and maintain or improve performance"},
  {code:"F-5",area:"Professional",desc:"Maintain client dignity"}
];

const MAL_DEFAULT = [
  "Task Refusal","Hyperactive Behavior","Physical Aggression","Disruptive Behavior",
  "Elopement","Off-task Behavior","Self-Injurious Behavior (SIB)","Property Destruction",
  "Outburst","Non-compliance","Verbal Aggression","Tantrum","Excessive Motor Activity",
  "Inattention Behavior","Inappropriate Social Interactions","Repetitive Behavior","Lying"
];

const REP_DEFAULT = [
  "Taking Turns During Games, Conversations and Group Activities",
  "Transitioning Training",
  "Accepting and Choosing Alternatives to Tangibles, Activities, and Persons",
  "Safety Awareness Training for Elopement",
  "Remaining Time Focused on Task",
  "Accepting Delays of Reinforcers",
  "Functional Communication Training (FCT)",
  "Accept the Removal of Access to an Item/Activity",
  "Comprehensive Compliance Training",
  "Requesting Assistance to Complete a Challenging Task",
  "Participating in Cooperative Playing",
  "Following Sequences of Instructions of Two Steps",
  "Sharing and Taking Turns",
  "Comply with Rules of Games and Activities",
  "Express Disagreement or Discomfort Appropriately",
  "Request for Attention","Request for Break","Request Help",
  "Responding Verbally to Greetings and Farewells",
  "Waiting for Preferred Items or Activities",
  "Accept Transition from Preferred to Non-Preferred Task"
];

const NOTE_TYPES = [
  {id:"97155-rbt",   code:"97155", label:"97155 — RBT (BCBA supervises)",  supType:"rbt",    hint:"BCBA directed, modeled, corrected, and supervised RBT"},
  {id:"97155-bcaba", code:"97155", label:"97155 — RBT (BCaBA supervises)", supType:"bcaba",  hint:"BCBA directed BCaBA who supervised RBT implementation"},
  {id:"97155-direct",code:"97155", label:"97155 — BCBA direct",            supType:"direct", hint:"BCBA provided direct treatment with client"},
  {id:"97156",       code:"97156", label:"97156 — Caregiver Training",      supType:"none",   hint:"BCBA trained caregiver in behavior intervention strategies"},
  {id:"supervision", code:"SUP",   label:"Supervision Note",               supType:"rbt",    hint:"BACB RBT Task List 2nd ed. supervision documentation"}
];

// Desde esta duracion una sesion de RBT deja de documentarse con el minimo corto.
// Cinco horas de tratamiento directo con solo tres conductas se lee como una sesion
// infradocumentada; a partir de aqui el minimo pasa de 3+3 a 4+4.
var RBT_LONG_SESSION_HOURS = 5;
var RBT_MIN_ITEMS = 3, RBT_MIN_ITEMS_LONG = 4;

// Minimo exigible a una nota de RBT segun la duracion de ESA sesion.
function _rbtMinItems(durLabel){
  var h = (typeof _durationToHours === 'function') ? _durationToHours(durLabel) : null;
  return (h !== null && h >= RBT_LONG_SESSION_HOURS) ? RBT_MIN_ITEMS_LONG : RBT_MIN_ITEMS;
}

const BCABA_SUP_COMPONENTS = [
  'Observation of supervisee working with the individual',
  'Observation of supervisee working with caregiver/other provider',
  'Specific recipient discussed',
  'Recipient privacy discussed',
  'Supervisory discussion and feedback',
  'Required documentation reviewed',
  'BACB Task List skills covered'
];

const BCABA_TASK_LIST = [
  'A. Philosophical Underpinnings',
  'B. Concepts and Principles',
  'C. Measurement, Data Display, and Interpretation',
  'D. Experimental Design',
  'E. Ethics (Professional and Ethical Compliance Code for Behavior Analysts)',
  'F. Behavior Assessment',
  'G. Behavior-Change Procedures',
  'H. Selecting and Implementing Interventions',
  'I. Personnel Supervision and Management'
];

const BCABA_EVALUATION = [
  'A. Behaviorism and Philosophical Foundations',
  'B. Concepts and Principles',
  'C. Measurement, Data Display, and Interpretation',
  'D. Experimental Design',
  'E. Ethical and Professional Issues',
  'F. Behavior Assessment',
  'G. Behavior-Change Procedures',
  'H. Intervention Development and Monitoring',
  'I. Supervisory Relationships'
];

// ── ANALYST CLOSING SENTENCE POOL ────────────────────────────────────────────
// 8 semantically equivalent closing sentences that rotate per client to prevent
// identical phrasing across consecutive notes.
const AN_CLOSING = [
  'Session data will be reviewed by the analyst to determine whether protocol modifications are indicated.',
  'The lead analyst will review the session data documented above to assess whether adjustments to the current treatment protocol are warranted.',
  'Documented session data will be evaluated by the analyst to determine whether modifications to the existing protocol are clinically indicated for subsequent sessions.',
  'The analyst will review data from this session prior to the next clinical contact to evaluate the need for any protocol adjustments.',
  'Session documentation will be reviewed by the BCBA to determine the clinical basis for any modifications to current protocol components.',
  'The lead analyst will use the session data recorded above to evaluate whether treatment protocol modifications are warranted at this time.',
  'Data collected during this session will inform the analyst\'s determination of whether protocol changes are indicated for the upcoming sessions.',
  'The analyst will review the session data documented herein to assess the clinical appropriateness of current protocol components prior to the next contact.'
];
