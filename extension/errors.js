export const MISSING_CAPTURE_ERROR = 'Falta el motor de captura (capture.js). Ejecuta «npm run setup» en la carpeta del repositorio y pulsa Recargar en chrome://extensions.';
export const FILE_ACCESS_HINT = ' Si es un archivo local, habilita el acceso a URLs de archivo en los detalles de la extensión.';

export function describeCaptureError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/could not load file/i.test(message) || message.includes('capture.js')) return MISSING_CAPTURE_ERROR;
  if (message.includes('access') && !message.includes(FILE_ACCESS_HINT)) return message + FILE_ACCESS_HINT;
  return message;
}
