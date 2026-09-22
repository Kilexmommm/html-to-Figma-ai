# HTML a Figma — prueba local

Extensión de Chrome para capturar el estado actual de una página y copiarlo al portapapeles para pegarlo en Figma. No utiliza un servidor MCP ni un modelo de IA. El motor de captura se descarga desde Figma; la URL contiene `mcp`, pero en este flujo se usa únicamente su archivo JavaScript y el portapapeles, sin solicitudes de generación de diseños por MCP.

**Estado:** el usuario confirmó que la captura y el pegado en Figma funcionan. También pasan las comprobaciones estáticas. La fidelidad de cada tipo de elemento todavía requiere una revisión visual detallada.

## Preparar

Requiere Node.js 22 o superior. No tiene dependencias npm.

```sh
npm run setup
npm run check
npm test
```

En esta copia local ya está descargado `extension/capture.js`. No se incluye en Git: el script de Figma tiene condiciones propias y no se considera cubierto por las licencias de los repositorios de referencia. El descargador comprueba el hash de la versión inspeccionada y falla si Figma la cambia.

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

La extensión solicita `activeTab`, `scripting` y escritura en el portapapeles. No solicita acceso permanente a todos los sitios.

## Descargar o copiar una imagen PNG 2×

En la versión 0.2.0 hay dos botones, **Descargar PNG 2×** y **Copiar PNG 2×**. Después de actualizar los archivos, pulsa **Recargar** en la tarjeta de la extensión en `chrome://extensions`.

1. Abre la página y desplázate hasta el área que quieras guardar.
2. Abre la extensión y pulsa **Descargar PNG 2×** para iniciar una descarga, o **Copiar PNG 2×** para poner la imagen en el portapapeles.
3. Tras la descarga, el panel muestra las dimensiones y deja un enlace para guardarla de nuevo. Tras la copia, el panel indica las dimensiones y que la imagen quedó en el portapapeles; ya se puede pegar con `⌘V` o `Ctrl+V`.

Ambos botones capturan exactamente el mismo PNG 2×. Captura exclusivamente el área visible de la pestaña, sin la interfaz del navegador. No usa el selector de la captura editable de Figma. Un viewport de 1440 × 900 píxeles CSS genera una imagen de 2880 × 1800 píxeles.

La resolución original depende de la pantalla y del zoom de Chrome. En Retina 2×, si Chrome entrega suficientes píxeles, se conserva ese detalle. Si la captura nativa es menor, el PNG se reescala y el panel lo indica: aumentar dimensiones no inventa detalle. No se utiliza depuración del navegador ni se solicitan permisos nuevos.

La copia usa `navigator.clipboard.write` con un `ClipboardItem` de tipo `image/png`. Si el navegador no ofrece esa API, el panel muestra un error claro y sugiere usar la descarga; el popup no se bloquea. En Chrome, escribir en el portapapeles requiere una ventana enfocada, así que la copia debe pulsarse con el popup abierto y la página activa.

El botón de descarga se probó en Chrome sobre `https://example.com`: descargó un PNG válido de 3526 × 1714 px a partir de una captura de 1763 × 857 px. El panel indicó correctamente que hubo reescalado. También se inspeccionó visualmente la imagen descargada. Las pruebas automatizadas cubren dimensiones, cambios de pestaña/vista, propagación de errores, liberación del bitmap, la construcción del `ClipboardItem`, el aviso cuando el portapapeles no está disponible y que copiar no dispara ninguna descarga, usando un navegador simulado. La copia real en el portapapeles de Chrome todavía no se ha probado en navegador.

## Alcance de esta primera versión

- Captura el estado renderizado actual de la página o el elemento seleccionado por CSS.
- No añade algoritmos propios de Auto Layout, sustitución de fuentes o simplificación de capas. Figma decide cómo importar el resultado.
- `body` incluye la página completa, también contenido fuera del viewport. El recorte exacto al área visible queda pendiente.
- La navegación sigue ejecutándose en el HTML. Cada vista debe capturarse por separado.
- No implementa todavía descarga de páginas arbitrarias. Para los HTML generados, se conserva el archivo fuente original con su navegación.
- Las fuentes, imágenes externas, canvas, iframes y estilos complejos requieren pruebas específicas.
- La página puede necesitar cargar imágenes y fuentes desde sus URLs durante la captura. No se promete funcionamiento completamente sin conexión.

## Referencias

- [vorbei/figma-capture](https://github.com/vorbei/figma-capture): referencia para el flujo de portapapeles. El prototipo usa su propio envoltorio y no aplica el parche a funciones internas del repositorio.
- [BuilderIO/figma-html](https://github.com/BuilderIO/figma-html): referencia histórica; el checkout actual no incluye las carpetas `lib` y `plugin` que su build requiere.
- [SingleFile](https://github.com/gildas-lormeau/SingleFile): candidato separado para guardar páginas en HTML. No integrado; su licencia es AGPL-3.0-or-later.

Consulta `docs/PRUEBAS.md` para ver qué está comprobado y qué falta.
