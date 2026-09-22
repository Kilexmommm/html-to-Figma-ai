# Registro de pruebas — 2026-09-22

## Fuentes descargadas

Los repositorios de referencia están en `../vendor/`, fuera de este repositorio de producto.

| Fuente | Commit / SHA-256 |
| --- | --- |
| vorbei/figma-capture | `629ea9a1778766215f042586ca29c0d1410cf07f` |
| BuilderIO/figma-html | `2b244343ba3fcc1a2de50fa652e13833e78e36f9` |
| gildas-lormeau/SingleFile | `0bf5c08f262e53f9f92a6861dcb62dc7f0bd1997` |
| capture.js desde Figma | `7be9680d031d8df7dafe5e958ce8bfe17261806eb43a821574e89ee5032becda` |

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
