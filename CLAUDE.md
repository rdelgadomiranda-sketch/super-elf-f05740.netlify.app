# Reglas del proyecto — Sistema de Notas Clínicas ABA

Este archivo contiene las reglas que Claude debe seguir SIEMPRE al trabajar en este
proyecto. Léelas antes de cualquier cambio. El objetivo es que cada nota clínica
pase una auditoría de Florida Medicaid.

## Idioma
- Conversación conmigo: español.
- Todo el contenido clínico (notas, prompts, texto que ve el modelo): inglés.

## Cómo trabajar en el código (muy importante)
- Ediciones QUIRÚRGICAS en el HTML: cambia solo lo necesario, no reescribas archivos enteros.
- En el backend Flask: entrega archivos completos (no parches línea por línea).
- Valida SIEMPRE el JavaScript con `node --check` antes de entregar. NO uses conteo de llaves.
- Para lógica compleja, verifica por EJECUCIÓN: extrae la función y córrela en Node con datos de prueba. No te quedes en inspección del código.
- NO despliegas. El deploy a Netlify lo hago yo, a mano.
- Antes de rediagnosticar, asume que las correcciones ya aplicadas (función-por-función, veto de términos, rotación de aperturas por-analista) YA ESTÁN en el código.

## Reglas clínicas de las notas (rulebook ABA)

### Estilo
- Tercera persona singular. Párrafos fluidos, SIN encabezados de sección. Texto plano.
- Nada de negritas ni cursivas.
- Nada de lenguaje triunfalista, inclusivo ni superlativos. Los resultados no siempre son positivos.
- Usa "the BCBA", "the BCaBA", "the RBT", "the caregiver", "the client", "the analyst". NUNCA "a BCBA", "a RBT", etc.
- El BCBA (o el analista) supervisa: guía, sugiere, indica, modela, instruye. Igual cuando el BCaBA supervisa al RBT.
- Varía el inicio y el final de cada nota. Similitud entre notas por debajo del 50%.
- La anti-repetición es POR ANALISTA en TODOS sus clientes: las aperturas y los cierres no deben repetirse entre notas del mismo analista, ni siquiera entre clientes distintos.

### Cero fabricación (absoluto)
- Nunca inventes números: ni segundos, minutos, conteos, ensayos, porcentajes, frecuencias, duraciones, ni "X de Y".
- Si el dato no fue provisto, descríbelo de forma cualitativa y observable, sin números.
- Inventar números es riesgo de fraude Medicaid.

### Terminología PROHIBIDA (nunca en la prosa que genera el sistema)
sensory, sensory stimulation/activities/tools/strategies, relaxation, relax, relaxation training,
calming, calm, calmly, staying calm, remains calm, counting/calm count, deep breathing,
breathing techniques, self-regulation, self-soothing, coping, mindfulness, meditation, yoga,
problem solving, conflict resolution, social stories, social narratives, social skills curriculum (Superflex),
anger management, anger control, self-de-escalation, coping strategies, gradual/systematic exposure,
diaphragmatic breathing, systematic desensitization, dealing with feelings, empathy, art therapy,
frustration, frustrated, stress, anxiety, anxious, upset, overwhelm/overwhelmed, confusion,
response cost, simple correction, exercise (background/schedule), explanatory fiction,
y cualquier lenguaje emocional o mentalista (understanding, comprehension, awareness, improved, mastery, etc.).
- Tampoco uses "due to confusion or overwhelm".

### Regla de dos capas (términos que vienen del assessment)
- El veto de arriba aplica a la PROSA que escribe el sistema.
- Si un término prohibido es parte del NOMBRE EXACTO de un programa o conducta documentado en el assessment, ese nombre se puede citar textual (es una lista cerrada, exenta), pero la prosa alrededor NUNCA usa el término ni construye una descripción mentalista.

### Cadena funcional (obligatoria)
- Relaciona siempre: conducta maladaptativa → intervención → reemplazo → prompt → reforzador.
- REFORZADOR POR FUNCIÓN: el reforzador se entrega en la moneda de la función.
  - Atención → se refuerza con atención. El NCR de atención entrega ATENCIÓN no contingente en esquema temporal, nunca tangibles ni comestibles.
  - Escape → se refuerza con un break / quitar la demanda.
  - Tangible → se refuerza con acceso al ítem.
  - Automática → estimulación comparable, emparejada.
  - Nunca emparejes atención o escape con un reforzador tangible o comestible.
- REEMPLAZO EMPAREJADO (obligatorio): cada conducta maladaptativa lleva un reemplazo que produce el mismo resultado funcional (atención→pedir atención; escape→pedir un break o pedir ayuda; tangible→pedir el ítem; automática→alternativa emparejada). Toma el reemplazo del assessment; si no hay ninguno documentado, no lo inventes: decláralo como faltante.

### Intervenciones
- Usa SOLO las intervenciones provistas en la información y las que aparecen en el assessment/reassessment. No agregues nada que no se haya provisto.
- Varía las intervenciones entre notas; no repitas siempre las mismas. La progresión es progresiva.
- El documento más importante y guía principal es el assessment o reassessment.

### Reglas de seguridad clínica
- En agresión física, SIB, elopement o destrucción de propiedad: NUNCA planned ignoring.
- DRL nunca para conductas peligrosas o severamente disruptivas (tantrums intensos, agresión, SIB, elopement, destrucción). Para esas: EXT, DRA, DRI, DRO, FCT.
- DRL solo para conductas NO peligrosas que ocurren a frecuencia no funcional.
- Response blocking: solo si hay una crisis descrita para esa sesión, y por 10–15 segundos máximo.

### Cuidadores
- Los cuidadores NO recogen datos. Sus tres roles: (1) manipulaciones antecedentes/ambientales, (2) apoyo a metas de reemplazo/adquisición, (3) uso del reforzamiento.
- En notas 97156, el "dato" se refiere a la fidelidad/desempeño del cuidador (recogido por el analista), no a datos conductuales del cliente.

### Verbos permitidos (97155 y 97156)
Coached, Directed, Educated, Guided, Instructed, Modeled, Practiced, Provided feedback, Supported,
trained, explained, reviewed, discussed.

### Modificación de protocolo
- Nunca omitas lo relacionado con la modificación y revisión de protocolo en las notas de analista.
- No documentes cambios al método de medición en la nota. Para la meta "Review/Adjustment to Measurement Procedure", cuando aplique, documenta que el BCBA y el RBT hicieron IOA de la conducta indicada, que el IOA fue mayor a 90%, y que se seguirá haciendo en futuras sesiones.

### Verificación de cliente
- Antes de generar, verifica que el nombre del cliente en la información coincida con la sesión. Si no, transfiere la información a la sesión correcta.

## Estándares regulatorios de referencia
- Florida Medicaid §59G-4.125
- CASP ABA Practice Guidelines 3rd Ed. y CASP/APBA ASD Assessment Guidelines (marzo 2026)
- BACB Ethics Code 2020
- CPT: 97153 (RBT), 97155 (supervisión BCBA), 97156 (entrenamiento a cuidador). HN = BCaBA.
