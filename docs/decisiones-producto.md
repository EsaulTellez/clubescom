# Decisiones de producto

Decisiones confirmadas por el propietario del proyecto el 2026-11-04. Aplican al demo del Trabajo Terminal y complementan `docs/proyecto.md` y `docs/casos-de-uso.md`. Si un caso del documento fuente contradice estas decisiones, se debe señalar y actualizar la documentación antes de implementar un comportamiento distinto.

## Alcance y entrega

- Objetivo: demo local funcional, con meta aproximada de 90 % de los requisitos implementables y preferencia por completar el 100 % cuando sea razonable.
- Fecha indicada: subir el archivo del proyecto dentro de dos semanas desde 2026-11-04. No se proporcionó una rúbrica adicional.
- No desplegar por ahora.
- Se pueden corregir requisitos contradictorios o incompletos del documento fuente; hacer visibles esas decisiones en la documentación.
- Se mantienen los límites ya registrados en `docs/proyecto.md`, incluida la exclusión de SAES, otras escuelas, ejecución legal de trámites, validación presencial con prefectura, control del auditorio exclusivo del director y clubes informales.

## Plataforma e infraestructura

- Usar Supabase para todo: Supabase Auth, PostgreSQL, Storage, Realtime y funciones de servidor/programadas que necesite la demo.
- No usar Cloudflare R2.
- Mantener el proyecto local durante esta etapa.
- Restringir los moderadores al contenido y a las acciones de su propia área.
- Solo el administrador general puede crear cuentas de moderador o administrador.
- Aceptar cuentas institucionales de alumno (`@alumno.ipn.mx`) y personal/profesor (`@ipn.mx`); verificar el correo durante el alta.
- Para generación de formatos y procesamiento de archivos se usará la API de Google con una clave local/configurada por ambiente y de bajo costo. La clave nunca se comitea.
- El correo se limita a autenticación. No enviar correos de avisos o notificaciones del producto por ahora.
- Cada usuario debe poder eliminar su cuenta. No se requiere conservar información personal por un periodo adicional definido por el propietario.

## Dirección visual

- Referencia de interacción: comunidad tipo Reddit, con una identidad de tablero escolar.
- Evitar pantallas genéricas, con apariencia de plantilla generada por IA, y diseños excesivamente minimalistas.
- Mantener la identidad ESCOM/IPN existente sin exigir apego rígido a un manual de marca.
- Diseñar para móvil y escritorio por igual.
- Prioridad visual inicial: inicio, clubes y foro.
- Aún no se proporcionaron capturas o sitios concretos de referencia; esta dirección escrita sirve como base hasta que el propietario comparta ejemplos.

## Reglas funcionales confirmadas

### Cuentas y moderación

- Al registrar: validar dominio institucional y verificar correo.
- Las acciones de moderación quedan restringidas al área correspondiente.
- Un usuario puede apelar una suspensión.
- Al acumular tres infracciones se suspende un mes; las siguientes tres, tres meses; las siguientes tres, seis meses; las siguientes tres, de forma permanente. Se ofrecerá apelación y se conservará el historial de infracciones y decisiones.

### Importación de padrón (CU-33)

- Diseñar un flujo de importación de CSV porque el documento solo nombra el caso y el propietario no cuenta aún con una plantilla institucional.
- Propuesta inicial: previsualizar filas, validar correo institucional y campos obligatorios, detectar duplicados, permitir descargar errores y confirmar la importación antes de crear o actualizar cuentas.
- Definir las columnas a partir del mínimo de datos que necesite una cuenta demo, sin inventar un formato oficial del IPN. Usar datos ficticios en el demo.

### Avisos y contenido asistido

- La generación de formatos de avisos usará la API de Google en nivel gratuito; deberá ofrecer edición humana antes de guardar/publicar.
- Las notificaciones por email de la plataforma quedan apagadas; las preferencias se conservan para canales soportados por la demo.
- No implementar la escalación del foro por preguntas sin respuesta a las 24/48 horas (CU-16); el propietario excluyó ese tramo del flujo.
- Usar Supabase Realtime para los flujos que requieren actualización en vivo, si se sostiene en el entorno local.

### Guías

- Aceptar archivos para que un asistente extraiga contenido y lo convierta en pasos editables.
- Mantener aprobación humana antes de publicar la guía generada.
- Registrar preguntas por paso, sugerencias, historial de versiones y colaboración reconocida.
- Las métricas pueden incluir volumen de vistas, consultas por paso, tiempo/abandono, búsqueda sin resultados, dudas y utilidad de respuesta, sugerencias y cambios por área. No mostrar resultados de grupos pequeños que identifiquen alumnos.

### Clubes

- La propuesta necesita 20 votos/interesados para avanzar.
- Decisión del propietario del 2026-11-11: el área de clubes puede registrar directamente un club reconocido sin la votación. En el alta directa se asignan un alumno responsable y un profesor asesor; la moderación cultural registra clubes culturales o deportivos. La administración general también puede hacerlo.
- Solo el alumno responsable asignado y el profesor asesor asignado pueden crear publicaciones del club; pertenecer al club permite consultar sus publicaciones, no crearlas.
- Cada persona interesada deberá cargar credencial del IPN, boleta y vigencia de derechos del IMSS.
- La propuesta también necesita un profesor asesor que confirme su participación mediante un código.
- Con los documentos y el asesor confirmados, la persona responsable de Subdirección Académica/Sala 14 revisa y agenda/valida la cita con el grupo proponente.
- El presidente de un club será un alumno con rol de moderador asignado al club; podrá revisar solicitudes de ingreso y administrar la comunidad del club según su alcance.
- Conservar el periodo de siete días documentado para que otro interesado reclame una propuesta sin responsable.

### Objetos perdidos

- Comparar reportes con umbral de similitud de 80 %.
- El QR sirve para verificar que quien entrega el objeto es la persona correcta, no sustituye la revisión de identidad/entrega descrita en el flujo.
- Mantener la validación final del reclamo en el canal digital. No incorporar una validación presencial obligatoria con prefectura.

### Espacios, avisos y reportes

- Los alumnos solo publican eventos/reservas que ya estén autorizados; la plataforma no decide ni reserva un espacio.
- Se acepta como autoridad la publicación de un moderador institucional.
- No construir aprobación exclusiva del director para el auditorio, conforme a las limitaciones de alcance existentes.
- El propietario proporcionará un plano real para detallar el mapa; hasta recibirlo, usar el mapa ilustrativo existente.
- Los reportes administrativos deben cubrir los indicadores útiles para una comunidad de aproximadamente 3,000 personas y permitir exportar CSV y PDF.
- Las notificaciones de producto respetarán las preferencias del usuario; no enviarán correo en esta etapa.

## Preguntas abiertas de especificación

- Columnas oficiales del CSV de padrón y si la importación crea cuentas, actualiza datos existentes o hace ambas cosas. Propuesta de demo: crear cuentas solamente; no asignar roles privilegiados desde CSV.
- Formatos y límites concretos de archivos. “Todos los formatos” no es seguro ni implementable literalmente; preparar una lista extensible de formatos compatibles con el procesador elegido y mostrar errores claros para los demás.
- Ventana temporal para contar las infracciones: el propietario indicó bloques de tres pero no definió si expiran con el tiempo. Propuesta para el demo: contar infracciones confirmadas durante la vida de la cuenta; el admin general resuelve apelaciones y una apelación pendiente no suspende la sanción automáticamente.
- Cuenta demo para el área: `subdireccion@ipn.mx`, rol moderador y área `subdireccion_academica`; se usa para revisar citas de Sala 14.
- Plano real del campus pendiente de entrega.
- Evidencia y diagramas finales del Trabajo Terminal: el propietario indicó que por ahora la prioridad es que el sistema funcione y no requiere pruebas automatizadas ni actualizar diagramas como entregable adicional.
