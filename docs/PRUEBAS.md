# Registro de pruebas — 2026-09-22

## Fuentes descargadas

Los repositorios de referencia están en `../vendor/`, fuera de este repositorio de producto.

| Fuente | Commit / SHA-256 |
| --- | --- |
| vorbei/figma-capture | `629ea9a1778766215f042586ca29c0d1410cf07f` |
| BuilderIO/figma-html | `2b244343ba3fcc1a2de50fa652e13833e78e36f9` |
| gildas-lormeau/SingleFile | `0bf5c08f262e53f9f92a6861dcb62dc7f0bd1997` |
| capture.js desde Figma | `7be9680d031d8df7dafe5e958ce8bfe17261806eb43a821574e89ee5032becda` |

`extension/capture.js` se versiona en Git desde la versión 0.3.2 para que la extensión funcione al clonar el repositorio sin pasos previos. `npm run setup` sigue disponible para volver a descargarlo y verificar el hash.

## Hallazgos de inspección

1. El Makefile de figma-capture expone `fn` como función interna para mostrar la barra del portapapeles. En el motor descargado la función correspondiente se llama `xm`. El parche original depende de nombres minificados y no es compatible con esta versión.
2. Esta prueba evita ese parche y llama a `window.figma.captureForDesign({ selector, extractSourceData: false })`, exportado por el motor descargado. Su compatibilidad futura tampoco está garantizada.
3. BuilderIO conserva un webpack.config.js que requiere archivos en `plugin/` y `lib/` ausentes del checkout. No se instalaron sus dependencias ni se presentó su build como funcional.
4. SingleFile se descargó como referencia. No se ejecutó, integró ni evaluó su fidelidad.

## Verificación disponible

`npm run check` comprueba sintaxis JavaScript, manifiesto, permisos mínimos, referencias a archivos y hash del motor. No abre navegadores ni ejecuta la conversión.

## Prueba visual

El usuario confirmó en la conversación que la captura y el pegado funcionaron bien. Es una confirmación del flujo por el usuario; no una medición automatizada de fidelidad ni una validación individual de todos los elementos.

La herramienta de navegador rechazó navegar al archivo `file://` por su política de URLs. Se pidió al usuario abrir el HTML manualmente. No se intentó sortear ese bloqueo con otro navegador o mecanismo de apertura.

- [ ] Captura de Resumen completada y formato del portapapeles reconocido.
- [ ] Pegado en Figma Design crea capas editables.
- [ ] Título editable y acentos conservados.
- [ ] Iconos SVG, fondos, bordes y sombras comparados.
- [ ] Captura de Configuración excluye la vista Resumen oculta.
- [ ] Extensión descomprimida cargada y probada en un HTML real del usuario.

No se ha medido tiempo de captura ni exactitud visual. El código está en GitHub (`Kilexmommm/html-to-Figma-ai`), pero la extensión no se ha publicado en la Chrome Web Store.

## PNG 2× — versión 0.2.0

- Nueva descarga del área visible mediante `chrome.tabs.captureVisibleTab`, con los permisos existentes.
- Nuevo botón **Copiar PNG 2×**, junto a la descarga. Reutiliza la misma captura 2× y coloca la imagen en el portapapeles con `navigator.clipboard.write` y un `ClipboardItem` de tipo `image/png`. No inicia ninguna descarga.
- La construcción del `ClipboardItem` y el aviso por falta de soporte viven en `extension/png.js` (`pngClipboardItem`, `copyPngToClipboard`), separados para poder probarlos sin navegador.
- Tamaño de salida calculado desde píxeles CSS: 2× de ancho y alto, sin multiplicar otra vez por el DPR de Retina.
- El panel distingue una captura con suficientes píxeles de otra ampliada por interpolación. El mensaje de copia menciona dimensiones y reescalado igual que el de descarga.
- Pruebas automatizadas con navegador e imagen simulados: Retina, 1×, 3×, límite de tamaño, cambio de pestaña, cambio de scroll, errores de captura/render, liberación del bitmap, el mismo blob/dimensiones al copiar, error cuando no hay portapapeles o `ClipboardItem` y ausencia de descarga al copiar.
- Prueba real completada en Chrome con `https://example.com`: archivo descargado `Example-Domain-2026-09-22T14-43-03-733Z-2x.png`, firma PNG válida, 187480 bytes y dimensiones 3526 × 1714 px verificadas desde la cabecera del archivo. Se inspeccionó la imagen visualmente: solo contenido web, sin interfaz del navegador ni popup.
- La captura nativa fue 1763 × 857 px: se verificó el aviso de reescalado. En esta configuración el resultado tiene dimensiones 2×, pero no detalle nativo 2×. El renderizado nativo a mayor densidad sigue siendo una mejora pendiente.
- Chrome tenía cargada `../extension` (la carpeta original). Se sincronizaron allí los archivos de la versión 0.2.0 y se recargó la extensión; el repositorio mantiene la misma versión.
- [ ] Prueba real en Chrome de **Copiar PNG 2×**: confirmar que la imagen queda en el portapapeles, que el pegador conserva las dimensiones 2×, que el aviso de reescalado coincide con la descarga y que funciona con el popup abierto sobre una página `https://` real. No realizada todavía.

Referencia de la API: https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab

## Icono y tema — versión 0.3.0

- Iconos nuevos `extension/icons/icon16.png`, `icon32.png`, `icon48.png` y `icon128.png`, generados con `scripts/make-icons.mjs`.
- El generador dibuja la "h" con dos rectángulos (tallo y asta) y un arco, y el punto con un círculo; renderiza a alta resolución y reduce por muestreo de caja para suavizar bordes. Codifica el PNG con `node:zlib` y construye IHDR/IDAT/IEND a mano. No usa fuentes ni canvas.
- `npm run check` verifica que los cuatro PNG existen, tienen firma PNG válida y que `icons` y `action.default_icon` del manifiesto los declaran.
- `tests/icons.test.js` valida la firma y la cabecera, y la presencia de píxeles naranjas en la h y el punto, sin dependencias npm.
- Tema del popup estilo OpenAI (fondo claro, superficies blancas, bordes grises y botón principal negro). Sin cambios en la lógica de captura.
- [x] Revisión visual de los iconos y el tema (2026-09-22), renderizando `extension/popup.html` directamente en Chrome headless desde `file://` e inspeccionando los 4 iconos. Comando: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=350,780 --screenshot="$PWD/artifacts/popup-headless.png" "file://$PWD/extension/popup.html"`.
  - Captura válida de 700 × 1560 px (2× de 350 × 780). Colores muestreados del render: fondo `#f7f7f8`, superficies `#ffffff`, bordes `#d9d9e3`, texto atenuado `#6e6e80`, botón principal `#0d0d0d` con texto blanco. No aparece morado.
  - `sips -g pixelWidth -g pixelHeight -g hasAlpha` confirma 16/32/48/128 px con canal alfa; el naranja dominante es `rgb(255,106,0)`. En la primera iteración, `icon16` tenía solo 11 píxeles naranjas opacos y la "h." se veía borrosa: el trazo fijo de 0.065 px por unidad daba ~1 px real a 16 px.
  - Corrección aplicada: `scripts/make-icons.mjs` ahora usa geometría dependiente del tamaño. El trazo es `max(0.075, 2/size)` en unidades normalizadas (≈2 px reales a 16 px) y el punto crece a `max(0.065, 1.8/size)` de radio (≈3.6 px de diámetro a 16 px), con separación `max(0.045, 1.6/size)` entre la h y el punto. A 32/48/128 se conserva el trazo fino y homogéneo.
  - Evidencia de la corrección: `icon16.png` pasó de 11 a **42 píxeles naranjas opacos** (de 52 a 83 con algún alfa), inspeccionado con la herramienta de lectura de imágenes: la "h" y el punto se distinguen. La columna 9 del icono de 16 px tiene alfa 0 entre la h y el punto, así que no se fusionan. `icon128` mantiene la "h." geométrica limpia.
  - `--pack-extension` sobre una copia temporal terminó con exit 0 y generó `extension.crx` (124271 bytes) y `extension.pem`; el manifiesto y los iconos se aceptan.
  - NO comprobado y por tanto no marcado como hecho: no se cargó la extensión descomprimida en Chrome (la versión de marca 153 responde `--load-extension is not allowed in Google Chrome, ignoring`), así que no se verificó el popup anclado a la barra de herramientas, ni el click real del botón, ni la recarga de la extensión. El render headless usa el mismo `popup.html`/CSS, pero no el contexto de extensión.
- `npm run check` y `npm test` (21/21) pasan tras la revisión y la corrección del icono. `tests/icons.test.js` añade dos comprobaciones: que el icono de 16 px supera los 30 píxeles naranjas opacos y que las columnas entre la h y el punto tienen cobertura tenue (≤128) para detectar fusión.

## Mensaje accionable cuando falta capture.js

- `extension/popup.js` aísla la inyección de `capture.js` y traduce el fallo con `describeCaptureError` (`extension/errors.js`). Si el mensaje de Chrome es `Could not load file: 'capture.js'` o menciona `capture.js`, el popup muestra: «Falta el motor de captura (capture.js). Ejecuta «npm run setup» en la carpeta del repositorio y pulsa Recargar en chrome://extensions.».
- La misma función conserva el consejo de acceso a URLs de archivo cuando el error contiene `access`, y deja intactos los demás mensajes.
- `scripts/check.mjs` comprueba la presencia de `extension/capture.js` antes de validar la sintaxis y el hash; si falta, falla con el aviso de ejecutar `npm run setup` en vez de un ENOENT crudo.
- `tests/errors.test.js` prueba la traducción sin navegador: capture.js ausente, propagación sin cambios de otros errores y conservación del consejo para `access`. Los 21 tests previos siguen pasando.
- No comprobado: no se reprodujo el error con la extensión cargada en Chrome. La verificación es automática sobre la función pura.
