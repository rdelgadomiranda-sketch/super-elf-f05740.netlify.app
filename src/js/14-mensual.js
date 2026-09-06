   // extracted text from the RBT monthly data PDF

// ── MONTHLY DATA REFERENCE (Phase 1: extraction + storage only, no alerts yet) ──
// Storage key: aba5_monthdata_<clientId> = { period: 'YYYY-MM', extractedAt, behaviors: [{name, episodes, hours, ratePerHour}] }

// Populate the month/period selector with the last 6 months
function _populateMonthDataPeriods(){
  const sel = document.getElementById('monthDataPeriod');
  if(!sel) return;
  const now = new Date();
  let opts = '';
  for(let i=1; i<=6; i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleString('en-US',{month:'long',year:'numeric'});
    opts += `<option value="${val}"${i===1?' selected':''}>${label}</option>`;
  }
  sel.innerHTML = opts;
}

function handleMonthlyDataFile(file){
  if(!file) return;
  const proc = document.getElementById('monthDataProcessing');
  if(proc) proc.textContent = 'Extracting text from PDF…';
  const r = new FileReader();
  r.onload = async e => {
    try {
      await ensurePdfWorker();
      const pdf = await pdfjsLib.getDocument({data:new Uint8Array(e.target.result)}).promise;
      let text = '';
      for(let i=1;i<=Math.min(pdf.numPages,40);i++){
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map(it=>it.str).join(' ')+'\n';
      }
      pendingMonthDataText = text.substring(0,50000);
      if(proc) proc.textContent = `PDF loaded (${pdf.numPages} pages). Select the month and click "Extract data".`;
    } catch(err){
      if(proc) proc.textContent = 'PDF error: '+err.message;
    }
  };
  r.readAsArrayBuffer(file);
}

async function extractMonthlyData(){
  if(!activeClientId){ showMsg('monthDataMsg','Open a client first.','err'); return; }
  if(!pendingMonthDataText){ showMsg('monthDataMsg','Upload the monthly data PDF first.','err'); return; }
  const clientId = activeClientId;
  const c = clients.find(x=>x.id===clientId);
  const period = document.getElementById('monthDataPeriod').value;
  const btn = document.getElementById('monthDataGenBtn');
  const sp = document.getElementById('monthDataSpinner');
  btn.disabled = true; if(sp) sp.style.display='inline-block';
  const proc = document.getElementById('monthDataProcessing');
  if(proc) proc.textContent = 'Analyzing data with AI…';

  // List the client's known behaviors to help the model match names
  const pools = LS.get('aba5_pools_'+clientId) || {};
  const knownMal = normalizeBehaviorArr(pools.mal||[]).map(x=>x.name);
  const knownRep = normalizeBehaviorArr(pools.rep||[]).map(x=>x.name);

  const prompt = `You are an ABA data analyst. The text below is extracted from an RBT's monthly data report (OfficePuzzle format) for a single client. Each behavior occupies one or more pages and includes a "Monthly average" value, "Weekly total" values, "Daily total" values, a "Baselines" line, and one or more "Objective"/STO lines. Each page also has a "Client:" field with the client's name.

First, extract:
- clientName: the name shown in the "Client:" field of the report (e.g. "Maykelis Couto"). Take it exactly as written.

Then, for EACH behavior in the report, extract:
- name: the behavior name (clean it — remove leading dots/spaces, e.g. ". Property Destruction" becomes "Property Destruction").
- category: "maladaptive" or "replacement" based on the Category field.
- monthlyAverageWeekly: the value labeled "Monthly average" for that behavior (this is a per-week average). Number only.
- baseline: the most RECENT baseline value from the "Baselines" line (each baseline looks like "12/06/2025: 95/week" — take the number from the most recent date). Number only, or null if absent.
- sto: the text of the most recent/active STO objective (the "Objective:" line, e.g. "STO #2 ... reduce TR to 20% under BL average per week in one month"). Keep the full sentence.
- stoPercent: the percentage reduction stated in that most recent STO (e.g. 20 for "20% under BL average"). Number only, or null.

STRICT RULES:
- Use ONLY values explicitly present in the report. Never invent, estimate, or recompute totals yourself. The "Monthly average" is already calculated in the report — read it directly, do not derive it.
- If a behavior has multiple STOs with start dates, use the one with the most recent start date (the currently active STO).
- If a value is genuinely absent, use null.

Respond ONLY with valid JSON, no markdown, no backticks, in this exact format:
{"clientName":"...","behaviors":[{"name":"...","category":"maladaptive","monthlyAverageWeekly":0,"baseline":0,"sto":"...","stoPercent":0}]}

Report text:
${pendingMonthDataText}`;

  try {
    let behaviors = null;
    let extractedClientName = '';
    let lastErr = null;
    const MAX_PARSE_ATTEMPTS = 3;

    for(let attempt=1; attempt<=MAX_PARSE_ATTEMPTS; attempt++){
      if(proc) proc.textContent = attempt===1 ? 'Analyzing data with AI…' : `Re-trying extraction (attempt ${attempt} of ${MAX_PARSE_ATTEMPTS})…`;
      try {
        let raw = await callGeminiAPI(prompt, 4096, true);
        raw = raw.replace(/```json|```/g,'').trim();
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch(e){
          // Try to extract the JSON object, then repair common malformations
          const m = raw.match(/\{[\s\S]*\}/);
          const candidate = m ? m[0] : raw;
          try { parsed = JSON.parse(_repairJson(candidate)); }
          catch(e2){ throw new Error('Could not parse AI response.'); }
        }
        const mapped = (parsed.behaviors||[]).map(b=>{
          const weekly = (typeof b.monthlyAverageWeekly==='number') ? b.monthlyAverageWeekly : parseFloat(b.monthlyAverageWeekly)||null;
          const dailyAvg = (weekly!=null) ? +(weekly/7).toFixed(2) : null;
          const baseline = (b.baseline===null||b.baseline===undefined||b.baseline==='') ? null : (parseFloat(b.baseline)||null);
          const stoPercent = (b.stoPercent===null||b.stoPercent===undefined||b.stoPercent==='') ? null : (parseFloat(b.stoPercent)||null);
          return {
            name: (b.name||'').replace(/^[.\s]+/,'').trim(),
            category: b.category || 'maladaptive',
            monthlyAverageWeekly: weekly,
            dailyAvg,
            baseline,
            baselineUnit: 'week',
            sto: b.sto || '',
            stoPercent
          };
        }).filter(b=>b.name);

        if(mapped.length === 0) throw new Error('No behaviors found in the response.');
        behaviors = mapped;
        extractedClientName = (parsed.clientName||'').trim();
        break; // success
      } catch(parseErr){
        lastErr = parseErr;
        // Brief pause before retrying the whole extraction
        if(attempt < MAX_PARSE_ATTEMPTS) await new Promise(r=>setTimeout(r, 800));
      }
    }

    if(!behaviors) throw lastErr || new Error('Extraction failed.');

    // ── CLIENT IDENTITY CHECK — prevent uploading one client's data onto another ──
    if(extractedClientName && c && c.name){
      if(!_namesLikelyMatch(extractedClientName, c.name)){
        const proceed = confirm(
          '⚠ CLIENT NAME MISMATCH — please verify\n\n' +
          `The data report says the client is:\n    "${extractedClientName}"\n\n` +
          `But the client open in the app is:\n    "${c.name}"\n\n` +
          'These do not appear to match. Uploading this data here would attach one client\'s data to a different client.\n\n' +
          'Are you sure you want to save this report under "' + c.name + '"?'
        );
        if(!proceed){
          if(proc) proc.textContent = '';
          showMsg('monthDataMsg','Cancelled — client name did not match. No data was saved.','err',7000);
          btn.disabled=false; if(sp) sp.style.display='none';
          return;
        }
      }
    }

    const record = { period, extractedAt:new Date().toISOString(), reportClientName: extractedClientName||null, behaviors };
    LS.set('aba5_monthdata_'+clientId, record);
    pendingMonthDataText = null;
    if(proc) proc.textContent = '';
    _renderMonthlyDataTable(record);
    _updateMonthDataBadge(clientId);
    showMsg('monthDataMsg',`Extracted ${behaviors.length} behavior(s) for ${period}. Stored for ${c.name}.`,'ok',5000);
  } catch(err){
    if(proc) proc.textContent='';
    showMsg('monthDataMsg','Extraction error after several attempts: '+err.message+'. Please try again.','err',8000);
  } finally {
    btn.disabled=false; if(sp) sp.style.display='none';
  }
}

function _renderMonthlyDataTable(record){
  const host = document.getElementById('monthDataTable');
  if(!host) return;
  if(!record || !record.behaviors || !record.behaviors.length){ host.innerHTML=''; return; }
  const rows = record.behaviors.map(b=>`
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 8px;font-size:11px">${esc(b.name)}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:right">${b.monthlyAverageWeekly==null?'—':b.monthlyAverageWeekly+'/wk'}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:right;font-weight:600;color:var(--blue)">${b.dailyAvg==null?'—':b.dailyAvg+'/day'}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:right">${b.baseline==null?'—':b.baseline+'/wk'}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:right">${b.stoPercent==null?'—':b.stoPercent+'%'}</td>
    </tr>`).join('');
  host.innerHTML = `
    <div style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-bottom:3px">DATA FOR ${esc(record.period)}${record.reportClientName?' · '+esc(record.reportClientName):''} · extracted ${new Date(record.extractedAt).toLocaleDateString()}</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:6px;overflow:hidden">
      <thead><tr style="background:var(--surface2)">
        <th style="padding:5px 8px;font-size:10px;text-align:left;color:var(--text3)">BEHAVIOR</th>
        <th style="padding:5px 8px;font-size:10px;text-align:right;color:var(--text3)">MONTHLY AVG</th>
        <th style="padding:5px 8px;font-size:10px;text-align:right;color:var(--text3)">DAILY AVG</th>
        <th style="padding:5px 8px;font-size:10px;text-align:right;color:var(--text3)">BASELINE</th>
        <th style="padding:5px 8px;font-size:10px;text-align:right;color:var(--text3)">STO %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="font-size:10px;color:var(--text3);margin-top:4px;line-height:1.5">Daily avg (blue) = monthly weekly average ÷ 7 — this is the reference used for congruence checks against your shorter analyst sessions.</div>`;
}

function viewMonthlyData(){
  if(!activeClientId){ showMsg('monthDataMsg','Open a client first.','err'); return; }
  const record = LS.get('aba5_monthdata_'+activeClientId);
  if(!record){ showMsg('monthDataMsg','No monthly data stored for this client yet.','err'); return; }
  _renderMonthlyDataTable(record);
}

function _updateMonthDataBadge(clientId){
  const badge = document.getElementById('monthDataBadge');
  if(!badge) return;
  const record = LS.get('aba5_monthdata_'+(clientId||activeClientId));
  badge.innerHTML = record
    ? `<span class="client-tag tag-green">Data: ${record.period}</span>`
    : `<span class="client-tag tag-amber">No data</span>`;
}

function handleSumFile(file) {
  if (!file) return;
  document.getElementById('sumFilename').textContent = pendingDocNames.length ? (pendingDocNames.join(', ') + ', ' + file.name) : file.name;
  document.getElementById('sumProcessing').textContent = 'Extracting text…';
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt') {
    const r = new FileReader();
    r.onload = e => { _appendPendingDoc(e.target.result, file.name); };
    r.readAsText(file);
  } else if (ext === 'pdf') {
    const r = new FileReader();
    r.onload = async e => {
      try {
        await ensurePdfWorker();
        const pdf = await pdfjsLib.getDocument({data:new Uint8Array(e.target.result)}).promise;
        let text = '';
        for (let i=1; i<=Math.min(pdf.numPages,30); i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          text += tc.items.map(it=>it.str).join(' ') + '\n';
        }
        _appendPendingDoc(text, file.name);
      } catch(err) {
        document.getElementById('sumProcessing').textContent = 'PDF error: '+err.message;
      }
    };
    r.readAsArrayBuffer(file);
  } else if (ext === 'docx') {
    const r = new FileReader();
    r.onload = async e => {
      try {
        if (typeof mammoth === 'undefined') { document.getElementById('sumProcessing').textContent='DOCX library not loaded.'; return; }
        const result = await mammoth.extractRawText({arrayBuffer:e.target.result});
        _appendPendingDoc(result.value, file.name);
      } catch(err) {
        document.getElementById('sumProcessing').textContent = 'DOCX error: '+err.message;
      }
    };
    r.readAsArrayBuffer(file);
  } else {
    document.getElementById('sumProcessing').textContent = 'Unsupported file type.';
  }
}



/* ═══════════════════════════════════════════════════════════════
   OFFICEPUZZLE WORKFLOW HELPERS
═══════════════════════════════════════════════════════════════ */


/* ─── MONTHLY FILE UPLOAD HANDLERS ─────────────────────────────────────────── */
let _mthFiles = { 'notes': [], 'data': [], 'rbt': [] };

function mthHandleFile(input, type) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  _mthFiles[type] = files;
  const suffix = type === 'data' ? 'Data' : type === 'rbt' ? 'Rbt' : 'Notes';
  const nameEl = document.getElementById('mthFile' + suffix + 'Name');
  if (nameEl) { nameEl.textContent = files.length === 1 ? files[0].name : files.length + ' files'; nameEl.style.display = 'block'; }
  const ta = document.getElementById(type === 'rbt' ? 'mthRbtSituations' : 'mthDocText');
  Promise.all(files.map(f => mthReadFile(f))).then(texts => {
    const label = type === 'notes' ? '=== SESSION NOTES THIS MONTH (97155 / 97156) ===' : type === 'rbt' ? '=== RBT SITUATIONS / OBSERVATIONS THIS MONTH ===' : '=== MONTHLY DATA REPORT ===';
    const block = '\n\n' + label + '\n' + texts.join('\n\n--- next note ---\n\n');
    ta.value = ta.value.trimEnd() + block;
  });
}

function mthReadFile(file) {
  return new Promise((resolve) => {
    if (file.type === 'application/pdf') {
      if (typeof pdfjsLib !== 'undefined') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const tc = await page.getTextContent();
              text += tc.items.map(item => item.str).join(' ') + '\n';
            }
            resolve(text.trim() || '[PDF: could not extract text — paste content manually]');
          } catch { resolve('[PDF: could not extract text — paste content manually]'); }
        };
        reader.readAsArrayBuffer(file);
      } else {
        resolve('[PDF: ' + file.name + ' — paste the text content manually below]');
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result || '');
      reader.onerror = () => resolve('[Could not read: ' + file.name + ']');
      reader.readAsText(file);
    }
  });
}

function mthClearFiles() {
  _mthFiles = { 'notes': [], 'data': [], 'rbt': [] };
  ['mthFileNotes','mthFileData','mthFileRbt'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  ['mthFileNotesName','mthFileDataName','mthFileRbtName'].forEach(id => { const el=document.getElementById(id); if(el){el.textContent='';el.style.display='none';} });
  document.getElementById('mthDocText').value = '';
  const _rbt = document.getElementById('mthRbtSituations'); if(_rbt) _rbt.value = '';
}

/* ═══════════════════════════════════════════════════════════
   MONTHLY SUMMARY MODULE
═══════════════════════════════════════════════════════════ */

let _mthMalCount = 0;
let _mthRepCount = 0;

async function generateMonthlySummary(){
  const clientId = document.getElementById('mthClientSel').value;
  const period = document.getElementById('mthPeriod').value;
  const cred = document.getElementById('mthCred').value;
  const docText = (document.getElementById('mthDocText')?.value||'').trim();
  const notes = (document.getElementById('mthNotes')?.value||'').trim();
  const clinicalNotes = (document.getElementById('mthClinicalNotes')?.value||'').trim();
  const rbtSituations = (document.getElementById('mthRbtSituations')?.value||'').trim();

  if(!clientId){ showMsg('mthMsg','Select a client.','err'); return; }
  if(!period){ showMsg('mthMsg','Select a month and year.','err'); return; }
  if(!docText){ showMsg('mthMsg','Paste the OfficePuzzle monthly report first.','err'); return; }

  const c = clients.find(x=>x.id===clientId);
  if(!c){ showMsg('mthMsg','Client not found.','err'); return; }

  const pools = LS.get('aba5_pools_'+clientId)||{};
  const clinicalSummary = _effectiveContext(clientId, LS.get('aba5_sum_'+clientId)||'');

  const [yr,mo] = period.split('-');
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const periodLabel = monthNames[parseInt(mo)-1]+' '+yr;

  const prompt =
`You are generating a Monthly Clinical Progress Summary for a Florida Medicaid ABA therapy client. This document will be placed in the client's medical record and must be Medicaid audit-ready.

CLIENT PSEUDONYM: ${c.name}
REPORTING PERIOD: ${periodLabel}
SUPERVISOR CREDENTIAL: ${cred}
${clinicalSummary ? 'CLINICAL CONTEXT (from assessment):\n'+clinicalSummary+'\n' : ''}
${notes ? 'ADDITIONAL INFORMATION FROM SUPERVISOR:\n'+notes+'\n' : ''}
${clinicalNotes ? 'CLINICAL NOTES FOR THE SUMMARY (supervisor instructions for writing this summary — follow them, but never fabricate data to satisfy them):\n'+clinicalNotes+'\n' : ''}
${rbtSituations ? 'RBT-REPORTED SITUATIONS THIS MONTH (environmental changes / important events reported by the RBT; situational context only — NOT a source of clinical data or treatment goals):\n'+rbtSituations+'\n' : ''}

════════════════════════════════════════
MONTHLY DATA DOCUMENT (source: OfficePuzzle or compiled report):
${docText}
════════════════════════════════════════

TASK: Analyze ALL the documentation provided above and generate a formal Monthly Clinical Progress Summary for ${c.name} covering ${periodLabel}.

WRITING RULES — MANDATORY:
- Write in fluid professional paragraphs only. No headers, bullets, bold, or markdown.
- OPERATOR-ENTERED FREE TEXT IS ALWAYS RENDERED IN CLINICAL ENGLISH: the supervisor information, the clinical notes for the summary and the RBT-reported situations above may be written in SPANISH. This summary is written in ENGLISH, always. Never copy that text verbatim and never leave a Spanish word or fragment anywhere in the summary; do not translate word by word either — read what was described and re-express it as clinical English in the register of the rest of the document, observable and in the third person, keeping the content exactly as given without adding or dropping detail.
- Use "the ${cred}" for the supervisor. Use "${c.name}" for the client. Never use proper names of staff.
- Observable and measurable language only.
- ABSOLUTE PROHIBITION - NO INVENTED NUMBERS OR COMPARISONS: The ONLY numbers allowed in this summary are figures that appear EXPLICITLY in the documents above. NEVER write "X out of Y", trial or opportunity ratios, counts of occasions, percentages, accuracy figures, averages, baselines, or interval/second/minute durations unless that exact figure appears in the documentation provided. NEVER convert a qualitative statement from a note into a number. NEVER construct a before/after comparison ("an immediate shift from X to Y", "up from X previously", "compared to a baseline of X") unless that comparison itself is stated in the documents - combining numbers taken from different notes into a new comparative claim is data fabrication and a Medicaid fraud risk. When no numeric data was provided for something, describe it in qualitative observable terms with NO numbers at all.
- NO-DATA RULE: Behaviors or programs with NO recorded data in the provided documentation for this period must be OMITTED from the summary entirely - do not mention them. Sole exception: if the documentation explicitly states a goal or behavior is on hold, report only that on-hold status, with no data and no invented explanation.
- Do NOT invent any number, date, or clinical fact not present in the documents.
- Do NOT state the number of notes reviewed, sessions counted, or documents analyzed.
- Do NOT include operational definitions.
- Do NOT mention specific dates or days.
- Eliminate all redundant information.
- Keep the summary concise — up to 600 words.
- Florida Medicaid audit-ready.

REQUIRED CONTENT — weave into concise flowing paragraphs:
1. Reporting period and authorized services delivered (do not list CPT codes or session counts). Reference the types of services provided: analyst treatment sessions, RBT direct treatment sessions, and caregiver training sessions as applicable.
2. Maladaptive behavior summary: name each behavior and report frequency data if provided.
3. Replacement program summary: accuracy and prompt level if provided.
${KB_GENERALIZATION_RULE}

3b. OBJECTIVE PROGRESSION ANALYSIS — CONDITIONAL. Apply this point ONLY if the documentation above explicitly contains objective (STO/LTO) status information (statuses such as "Mastered", "In progress", "Not started", with or without dates). If no objective status information appears anywhere in the documentation, OMIT this point entirely and write nothing about objectives. When objective information IS present, weave into the narrative a brief, aggregated progression analysis: identify which targets and replacement programs advanced to a subsequent objective during the period (an objective marked Mastered within the period with the next objective initiated) and which remain in the same objective. Name the behaviors and programs in each group; do not reproduce the objective wording, criteria, percentages, or dates — statuses only. For targets that advanced, one sentence stating the advancement is sufficient; do not elaborate. For targets that remain in the same objective, add one or two sentences of procedural recommendation drawn ONLY from the interventions, prompts, reinforcers, and teaching procedures documented in the clinical context or the documentation above — for example, increasing structured practice opportunities, adjusting the prompting sequence with systematic fading, conducting a preference assessment to identify reinforcers of higher value, densifying the reinforcement schedule during acquisition, or coordinating the target with its function-matched replacement program. Every recommendation must be consistent with the documented function of the behavior. Never recommend a procedure that does not appear in the provided documentation or clinical context, never propose changing objective criteria, and never frame the analysis as failure: state the current status and the procedural adjustment in neutral observable terms. Do not use the words "expected", "behind", "delay", "underperforming", or any language implying the client or the team fell short.
4. Protocol modifications: describe what was changed and what occurred.
4b. Clinical plan continuity: if 'For the next session' plans appear in the notes, briefly document the progression.
4c. CAREGIVER TRAINING (CPT 97156) — ITS OWN DEDICATED PARAGRAPH, NOT A PASSING MENTION. This is a section a Medicaid auditor looks for specifically, and a monthly summary that only names caregiver training among the services delivered does not document it. Whenever the documentation contains ANY caregiver/parent training content, write a distinct paragraph covering, with only what the documents support: the caregiver goals or targets addressed during the period; the training procedures the ${cred} used (behavioral skills training components actually documented — instruction, modeling, rehearsal, feedback — never assumed); what the caregiver DID when implementing the protocol, in observable terms (implemented the procedure with the prompting level documented, delivered reinforcement as written, collected data); the level of support the caregiver still required; any documented barrier to implementation (attendance, competing demands, inconsistency across caregivers); and the training focus stated for the coming period. Never write internal-state or progress language about the caregiver ("understood", "is now aware", "improved") — describe the observable performance and the support level documented. If the documentation contains no caregiver training content at all for this period, omit this paragraph entirely rather than asserting anything about it.
5. New behaviors or plan changes.
6. IOA: if documented, include method, result, criterion (90–95%), and behaviors assessed. If not documented, state it is scheduled per the supervision plan.
6b. RBT-reported situations: if provided, weave the relevant environmental changes or important events into the flowing narrative where clinically pertinent (e.g., relating an environmental change to a behavioral variation), using observable language. Never treat them as a source of clinical data or treatment goals, and do not invent connections not supported by the documentation.
7. Medical necessity: one concise paragraph supporting continued services based on the data reported.
8. Closing sentence ONLY: "The ${cred} will continue to review behavioral data, adjust protocols as clinically indicated, and maintain supervisory oversight in accordance with the active behavior intervention plan."`;

  const btn = document.getElementById('mthGenBtn');
  const sp = document.getElementById('mthSpinner');
  btn.disabled=true; sp.style.display='inline-block';
  showMsg('mthMsg','Analyzing report and generating summary...','warn',0);

  try {
    // Monthly summaries can be long; start at a generous budget and retry at max if truncated.
    let text = await callAPI(prompt, SYS, null, clientId, 32768, NOTE_THINKING_BUDGET);
    if(_lastTruncated){
      console.warn('[Monthly] Summary truncated — retrying with maximum token budget.');
      _showRetryStatus && _showRetryStatus('El resumen mensual se cortó; reintentando con más espacio…');
      const text2 = await callAPI(prompt, SYS, null, clientId, 65536, NOTE_THINKING_BUDGET);
      _clearRetryStatus && _clearRetryStatus();
      if(text2){
        if(!_lastTruncated){ text = text2; }
        else if(text2.length >= text.length){ text = text2; }
      }
      if(_lastTruncated){
        showMsg('mthMsg','⚠ El resumen mensual quedó muy extenso y pudo truncarse incluso con el máximo de tokens. Revisa el final: si corta a media frase, reduce el contenido pegado (por ejemplo, quita notas repetidas) y vuelve a generar.','err');
      }
    }
    document.getElementById('mthResult').textContent = text;
    document.getElementById('mthOutput').style.display = 'block';
    document.getElementById('mthOutput').scrollIntoView({behavior:'smooth',block:'start'});

    // Caregiver training is one of the sections an auditor looks for by name, and its
    // absence is silent: the summary reads complete without it. Compare what the
    // pasted documentation contains against what came out, and say which of the two
    // failed — there is nothing in the text itself that reveals the difference.
    var _cgRe = /caregiver|parent training|97156|guardian|padre|madre|cuidador/i;
    var _cgInSource = _cgRe.test(docText) || _cgRe.test(notes) || _cgRe.test(clinicalNotes);
    var _cgInText   = /caregiver|parent|guardian/i.test(text);
    if(_cgInSource && !_cgInText){
      showMsg('mthMsg','⚠ La documentación que pegaste SÍ trae contenido de caregiver training, pero el resumen salió sin esa sección. Vuelve a generar; si se repite, revisa que las notas 97156 estén completas en el texto pegado.','err',0);
    } else if(!_cgInSource){
      showMsg('mthMsg','Resumen mensual generado. Aviso: en la documentación pegada no hay ninguna nota de caregiver training (97156) de este período, así que el resumen no lleva esa sección. Si hubo sesiones de entrenamiento a los padres, añade esas notas y vuelve a generar.','err',0);
    } else {
      showMsg('mthMsg','Monthly summary generated (incluye la sección de caregiver training).','ok');
    }
    _warnUngrounded(text,'mthMsg');
  } catch(err){
    showMsg('mthMsg','Error: '+err.message,'err');
  }
  btn.disabled=false; sp.style.display='none';
}
