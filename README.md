# HTML a Figma — prueba local

Extensión de Chrome para capturar el estado actual de una página y copiarlo al portapapeles para pegarlo en Figma. No utiliza un servidor MCP ni un modelo de IA. El motor de captura se descarga desde Figma; la URL contiene `mcp`, pero en este flujo se usa únicamente su archivo JavaScript y el portapapeles, sin solicitudes de generación de diseños por MCP.

**Estado:** el usuario confirmó que la captura y el pegado en Figma funcionan. También pasan las comprobaciones estáticas. La fidelidad de cada tipo de elemento todavía requiere una revisión visual detallada.

## Preparar

Requiere Node.js 22 o superior. No tiene dependencias npm.

```sh
npm run check
npm test
```

`extension/capture.js` sí se incluye en Git, así que al clonar el repositorio la extensión funciona sin pasos extra. El script `npm run setup` es opcional: vuelve a descargar el motor desde Figma, comprueba que el hash coincide con la versión inspeccionada y falla si Figma la cambia. Es la forma de actualizarlo de forma controlada.

## Primera prueba, sin instalar la extensión

1. Abre `fixtures/prueba.html` en Chrome.
2. Pulsa **Copiar pantalla de prueba a Figma**.
3. Espera el aviso **Copied to clipboard** del motor.
4. Abre un archivo de Figma Design y pega con `⌘V` o `Ctrl+V`.
5. Comprueba que puedes seleccionar y editar el título, que los iconos SVG conservan su forma y que los bordes y sombras se parecen al HTML.
6. Vuelve al HTML, abre **Configuración** y repite la captura. La segunda vista debe excluir el resumen oculto.

La sección **Diagnóstico** del HTML permite pegar la captura y contar nodos y textos del formato `figh2d` localmente. No envía los datos a otro servidor. El recuento por sí solo no prueba la fidelidad del resultado en Figma.

## Cargar la extensión

1. Abre `chrome://extensions` y activa **Modo de desarrollador**.
2. Pulsa **Cargar descomprimida** y elige la carpeta `extension` de este repositorio.
3. Para abrir archivos `file://`, activa **Permitir acceso a URLs de archivo** en los detalles de esta extensión.
4. Abre tu HTML, pulsa la extensión y usa `body` para capturar la página completa o un selector como `#pantalla` para capturar una sección.
5. Pulsa **Copiar a Figma**, espera el aviso del motor y pega en Figma.

La extensión solicita `activeTab`, `scripting`, escritura en el portapapeles y `debugger`. Chrome muestra una advertencia amplia al conceder el permiso `debugger`; es necesario para la captura de página completa mediante DevTools Protocol. No solicita acceso permanente a todos los sitios.

## Solución de problemas

- **`Could not load file: 'capture.js'`** al pulsar **Copiar a Figma**: la carpeta que Chrome tiene cargada no incluye `extension/capture.js` o Chrome arrastra una carga antigua. Comprueba que cargaste la carpeta `extension` de este repositorio (el archivo viene en Git), abre `chrome://extensions` y pulsa **Recargar**. Si falta el archivo, recupera con `npm run setup`. La nueva versión del popup muestra ese mismo consejo en lugar del error crudo de Chrome.
- **No cargues dos copias de la extensión a la vez.** Si tienes otra carpeta antigua instalada además de la del repositorio, quita una de las dos desde `chrome://extensions`; Chrome puede ejecutar una versión diferente de la que esperas.
- La traducción del error a un mensaje accionable está en `extension/errors.js` y se prueba con tests de Node (`tests/errors.test.js`). No se ha reproducido el fallo con la extensión cargada en Chrome: la comprobación es automática sobre la función de traducción.

## Descargar o copiar una imagen PNG 1×/2×

En la versión actual (0.6.0) hay dos botones, **Descargar PNG** y **Copiar PNG**, un selector **Resolución** y ajustes de viewport para página completa. Después de actualizar los archivos, pulsa **Recargar** en la tarjeta de la extensión en `chrome://extensions`.

1. Abre la página. Deja desmarcada **Capturar página completa** para guardar solo el área visible; márcala para capturar el documento completo.
2. En página completa, elige **Viewport: Automático** para conservar el viewport/layout actual, o **Personalizado** para simular un viewport CSS con **Ancho CSS (px)** y **Alto CSS (px)**. Por ejemplo, 1900 × 3000 CSS configura ese viewport antes de medir y capturar el documento. El PNG refleja el ancho del viewport CSS seleccionado, pero su alto puede superar 3000 px CSS si el documento continúa más abajo; no se fija ni estira a una altura exacta.
3. Elige **1×** o **2×** en **Resolución**. **2×** es la opción predeterminada. Pulsa **Descargar PNG** para iniciar una descarga, o **Copiar PNG** para poner la imagen en el portapapeles.
4. Tras la descarga, el panel muestra las dimensiones y deja un enlace para guardarla de nuevo. Tras la copia, el panel indica las dimensiones y que la imagen quedó en el portapapeles; ya se puede pegar con `⌘V` o `Ctrl+V`.

Ambos botones respetan el modo y la resolución seleccionados y generan un solo PNG, que se descarga o se copia según el botón pulsado. **Área visible** captura el viewport actual, sin interfaz del navegador y sin usar debugger ni viewport personalizado. **Página completa** usa una sola captura mediante Chrome DevTools Protocol: consulta `Page.getLayoutMetrics` y ejecuta `Page.captureScreenshot` con `captureBeyondViewport: true`, `fromSurface: true` y un clip documental. No desplaza la página ni ensambla capturas de varios scrolls. **Automático** conserva el viewport/layout actual. **Personalizado** aplica un viewport CSS emulado antes de medir y capturar; el sitio puede cambiar su layout responsive, breakpoints o unidades `vh`, por lo que esta opción sirve para simular y no garantiza el layout original. El override se limpia y la página se restaura al completar o fallar la captura. La escala elegida aplica a ambos modos y a descargar y copiar: 1× produce tamaño CSS y usa DPR 1; 2× duplica ancho/alto de salida y usa DPR 2. La selección, escala y valores del viewport se guardan en `localStorage` del popup y permanecen al cerrar/abrir o recargar la extensión en el mismo origen/carpeta. No se solicita permiso `storage`.

**2×** sigue siendo la opción predeterminada. **1×** entrega dimensiones CSS y no inventa detalle: puede reducir una captura de alta densidad o seguir dependiendo de los píxeles que Chrome entrega según la pantalla y el zoom. El panel indica las dimensiones y si la imagen final se amplió desde una captura con menos píxeles; puedes comparar ambas escalas y elegir la que te convenga.

La captura de página completa se rechaza si la salida excede los límites PNG de 16384 px por lado o 40 megapíxeles. Las dimensiones personalizadas aceptan enteros de 200 a 16384 CSS px. Antes de capturar se mide el documento y se comprueba que las dimensiones sigan estables después de la captura; también se verifica que siga activa la misma pestaña. Si DevTools u otra sesión ya mantiene conectado el destino debugger, cierra esa sesión y vuelve a intentar. Los límites de PNG aplican al resultado seleccionado, tanto 1× como 2×.

En automático, la resolución original depende de la pantalla y del zoom de Chrome. En viewport personalizado, DPR 1/2 se elige para la escala y solicita esa densidad a Chrome. Si la captura nativa es menor, el PNG se reescala y el panel lo indica: aumentar dimensiones no inventa detalle. El modo visible no utiliza depuración; página completa sí requiere el permiso `debugger` y muestra la advertencia de Chrome.

La copia usa `navigator.clipboard.write` con un `ClipboardItem` de tipo `image/png`. Si el navegador no ofrece esa API, el panel muestra un error claro y sugiere usar la descarga; el popup no se bloquea. En Chrome, escribir en el portapapeles requiere una ventana enfocada, así que la copia debe pulsarse con el popup abierto y la página activa.

La descarga del modo **Área visible** se probó previamente en Chrome sobre `https://example.com`: descargó un PNG válido de 3526 × 1714 px a partir de una captura de 1763 × 857 px y se inspeccionó visualmente. Las pruebas de Node verifican comandos CDP simulados, parámetros de captura, dimensiones 1×/2×, viewport personalizado, persistencia, validación, errores y cleanup; no abren Chrome ni prueban el render real del protocolo. La prueba real en Chrome de **Página completa** en automático y personalizado, incluidos layout responsive/`vh`, dimensiones, restauración y ambos destinos, está pendiente.

## Versión 0.3.0 — icono y tema

Esta versión no cambia la funcionalidad: **Copiar a Figma**, **Descargar PNG 2×** y **Copiar PNG 2×** siguen funcionando igual.

- Icono nuevo **h. naranja**, generado con `node scripts/make-icons.mjs`. Escribe `extension/icons/icon16.png`, `icon32.png`, `icon48.png` y `icon128.png` sin dependencias npm, sin fuentes del sistema y sin canvas: dibuja la letra y el punto con geometría y codifica el PNG con `node:zlib`. El script y los PNG se versionan.
- El manifiesto declara los cuatro iconos en `icons` y en `action.default_icon`. No se añaden permisos.
- Interfaz del popup con estética estilo OpenAI: fondo claro, superficies blancas, bordes grises finos y botón principal negro. Se eliminó el morado de la versión anterior.
- La versión del manifiesto y de `package.json` sube a 0.3.0.

No se ha hecho todavía una prueba real en navegador con el icono ni con el tema. Las comprobaciones de iconos son estáticas (firma y dimensiones de la cabecera PNG) y el tema se revisó solo por inspección del CSS.

## Alcance de esta primera versión

- Captura el estado renderizado actual de la página o el elemento seleccionado por CSS.
- No añade algoritmos propios de Auto Layout, sustitución de fuentes o simplificación de capas. Figma decide cómo importar el resultado.
- En **Copiar a Figma**, `body` incluye el contenido de la página fuera del viewport; el recorte propio de la exportación PNG se explica arriba.
- La navegación sigue ejecutándose en el HTML. Cada vista debe capturarse por separado.
- No implementa todavía descarga de páginas arbitrarias. Para los HTML generados, se conserva el archivo fuente original con su navegación.
- Las fuentes, imágenes externas, canvas, iframes y estilos complejos requieren pruebas específicas.
- La página puede necesitar cargar imágenes y fuentes desde sus URLs durante la captura. No se promete funcionamiento completamente sin conexión.

## Referencias

- [vorbei/figma-capture](https://github.com/vorbei/figma-capture): referencia para el flujo de portapapeles. El prototipo usa su propio envoltorio y no aplica el parche a funciones internas del repositorio.
- [BuilderIO/figma-html](https://github.com/BuilderIO/figma-html): referencia histórica; el checkout actual no incluye las carpetas `lib` y `plugin` que su build requiere.
- [SingleFile](https://github.com/gildas-lormeau/SingleFile): candidato separado para guardar páginas en HTML. No integrado; su licencia es AGPL-3.0-or-later.

Consulta `docs/PRUEBAS.md` para ver qué está comprobado y qué falta.
