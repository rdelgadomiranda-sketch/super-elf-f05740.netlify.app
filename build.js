#!/usr/bin/env node
/* Construye ABA_Notes_Generator_reglas_duras__fix_funcion.html a partir de src/.
 *
 * El generador se despliega a mano en Netlify como UN archivo, y eso no cambia:
 * este script existe para poder TRABAJAR en piezas y seguir ENTREGANDO una sola.
 * src/index.html lleva dos marcadores, /*@CSS@* / y /*@JS@* /, donde se inyectan
 * los estilos y la concatenacion de src/js/*.js en orden alfabetico — que es el
 * orden en que estan numerados.
 *
 *   node build.js            construye
 *   node build.js --check    construye en memoria y avisa si el archivo del repo
 *                            no coincide, sin escribir nada
 */
const fs = require('fs'), path = require('path');

const ROOT   = __dirname;
const SRC    = path.join(ROOT, 'src');
const SALIDA = path.join(ROOT, 'ABA_Notes_Generator_reglas_duras__fix_funcion.html');

function construir(){
  const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8').trim();

  const dir = path.join(SRC, 'js');
  const partes = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  if (!partes.length) throw new Error('src/js/ no tiene ningun .js');

  const js = partes.map(f => {
    const cuerpo = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+$/, '');
    return `/* ═══ ${f} ${'═'.repeat(Math.max(0, 62 - f.length))} */\n${cuerpo}`;
  }).join('\n\n');

  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  for (const [marca, contenido] of [['/*@CSS@*/', css], ['/*@JS@*/', js]]) {
    if (!html.includes(marca)) throw new Error(`falta el marcador ${marca} en src/index.html`);
    html = html.replace(marca, () => contenido);
  }
  return { html, partes };
}

const { html, partes } = construir();

if (process.argv.includes('--check')) {
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8') : '';
  if (actual === html) { console.log('OK: el HTML del repo coincide con src/.'); process.exit(0); }
  console.error('DESFASE: el HTML del repo no coincide con src/. Ejecuta «node build.js».');
  process.exit(1);
}

fs.writeFileSync(SALIDA, html);
console.log(`${path.basename(SALIDA)} construido desde ${partes.length} modulos · ${html.length.toLocaleString()} bytes`);
partes.forEach(p => console.log(`   ${p}`));
