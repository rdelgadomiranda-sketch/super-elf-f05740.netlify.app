# src — el código fuente del generador

El generador se despliega en Netlify como **un solo archivo**, y eso no ha cambiado.
Esta carpeta existe para poder **trabajar** en piezas y seguir **entregando** una sola.

```
node build.js            regenera ../ABA_Notes_Generator_reglas_duras__fix_funcion.html
node build.js --check    avisa si el HTML del repo se quedó desfasado de src/ (no escribe)
```

Lo que subes a Netlify sigue siendo ese HTML de la raíz.

## Qué hay aquí

| archivo | contenido |
|---|---|
| `index.html` | El marcado. Lleva `/*@CSS@*/` y `/*@JS@*/`, que es donde el build inyecta lo demás. |
| `styles.css` | Los estilos. |
| `js/NN-*.js` | Los 19 módulos. Se concatenan **en orden alfabético**, que es el orden en que están numerados. |

| módulo | de qué se ocupa |
|---|---|
| `00-estado-y-utiles` | Estado global de la sesión y utilidades cortas. |
| `01-catalogos` | Listas cerradas: tipos de nota, tareas BACB, metas por defecto. |
| `02-almacenamiento` | LZString, `LS`, el espejo local e IndexedDB. |
| `03-supabase` | Configuración, `_sb()`, autenticación e hidratación. |
| `04-modelo` | Clientes, terapistas, pools de conductas, historial. |
| `05-reglas` | Los bloques de regla clínica que se inyectan en los prompts (`KB_*`, `*_RULE`, `SYS`). |
| `06-coherencia` | Lugar, participantes, actividad, cliente y preferencias. |
| `07-metas-rotacion` | Selección y rotación de metas. |
| `08-prompts` | `buildUserPrompt`, `build97153Prompt` y los bloques que los alimentan. |
| `09-generar` | Generación de la nota y llamada al modelo. |
| `10-auditoria` | Pulido, comprobaciones posteriores y revisión de la nota. |
| `11-analista` | Modo ANALYST y registro de supervisión. |
| `12-abamatrix` | Toda la pestaña AbaMatrix. |
| `13-assessment` | Extracción y contraste del assessment reducido. |
| `14-mensual` | Resumen mensual. |
| `15-archivos-export` | Lectura de archivos subidos, DOCX, copias de seguridad, Drive. |
| `16-interfaz` | Renderizado, pestañas, paneles y manejadores. |
| `17-auxiliares` | Funciones sueltas que no encajan limpiamente en ninguna de las anteriores. |
| `99-arranque` | El `init()` final. Va el último a propósito. |

## Lo único delicado: el orden

Todo el JavaScript comparte un mismo ámbito, así que el orden importa —pero menos de
lo que parece. Las **funciones** se elevan (hoisting), de modo que da igual en qué
módulo estén. Lo que sí fija el orden son las pocas sentencias que **se ejecutan al
cargar** y dependen de una variable declarada antes. Al partir el archivo se
comprobaron una a una: son doce, y estos tres grupos no se pueden separar:

- `ABA_GI_BANNED` → `ABA_GI_ACTIVITIES`
- `FN_INTERVENTION_RULE` → `SYS`, `SYS_DIRECT`
- `NUM_WORDS` → `NUM_CARDINALS` → `NUM_SRC`

Y `99-arranque.js` va el último porque `init()` toca el DOM y usa lo anterior.

Si mueves una constante de módulo, comprueba que nada que se ejecute al cargar
dependa de ella. La forma rápida de verificarlo es abrir el HTML construido en el
navegador: si el orden se rompió, la consola lo dice al arrancar.
