# Pendientes del proyecto

Estado actualizado el 2026-11-10, comparado con `docs/fuente/TT.docx` y las decisiones del propietario en `docs/decisiones-producto.md`. La demo usa Supabase local y un seed de 12 cuentas. Las migraciones nuevas deben aplicarse antes de validar estos cambios. Las rutas principales ya conectan con el modelo nuevo; esta lista contiene brechas funcionales todavía abiertas y recorridos que falta validar.

## Lo siguiente para llegar a una demo funcional

1. Recorrer los flujos con las cuentas demo: alta y OTP, recuperación, foro y respuestas oficiales por área, propuesta de club con expedientes/asesor/cita, reclamo y QR entre dos personas, apelación, baja de cuenta y avisos programados.
2. Completar CU-09: carga privada de archivos compatibles (al menos PDF/DOCX/TXT), extracción con Google GenAI y borrador de pasos editables con confirmación humana. La clave local aún no se ha probado.
3. Completar preguntas/analíticas de guías: notificar a moderación dentro de la app, versiones de guía, filtros de métricas y preguntas por paso; hoy existen Q&A, votos y métricas básicas de vistas/pasos completados.
4. Verificar CU-32/34/35 con datos: panel, filtros y CSV de auditoría, métricas básicas, reporte de impacto CSV e impresión/PDF ya están implementados; faltan recorridos reales, más indicadores y comprobar el documento impreso.
5. Verificar CU-33 con el ejemplo ficticio `public/ejemplo-padron-escom.csv`, errores y Mailpit. El flujo ya previsualiza, valida, detecta duplicados, deja descargar errores y envía invitaciones Auth de alumnos/profesores; no crea personal privilegiado desde el archivo.
6. Revisar preferencias de notificación: conservar solo canales in-app, sin correo para avisos del producto ni seguimiento automático 24/48 h del foro.
7. Cambiar el mapa ilustrativo por el plano real cuando el propietario lo comparta; mejorar selección/búsqueda y resalte sobre el plano.

## Gaps por área

### Acceso, datos y permisos

- Supabase local ya provee Auth, Postgres y Storage; el código conecta Postgres bajo roles `anon`/`authenticated` para aplicar RLS. No hay proyecto Supabase alojado conectado.
- Los datos privados viven en el esquema `private` y se consultan por RPC. Falta una revisión final por pantalla de rutas antiguas y accesos sin sesión/área.
- El administrador general asigna roles. Los moderadores institucionales se limitan al área; el moderador alumno, a su club.
- Supabase Auth verifica correo y recupera contraseña. Los correos de avisos/notificaciones del producto y las alertas de preguntas a 24/48 horas se excluyen.
- Registro de infracciones, escalera 1/3/6 meses y permanente, historial y apelación ya tienen pantalla y RPC. El demo interpreta el conteo como acumulado de por vida; falta recorrer la resolución con dos cuentas.
- La baja de cuenta intenta borrar archivos relacionados antes del usuario Auth; hay que comprobarlo con archivos y fallos reales; borrar permanentemente una cuenta no se prueba contra cuentas reales.

### Avisos y guías

- El formato social ya llama Google GenAI en servidor si hay `GOOGLE_GENERATIVE_AI_API_KEY`; falta recorrerlo con una clave válida. El borrador requiere edición humana antes de publicar.
- Inicio, foro y notificaciones reciben cambios Realtime de tablas configuradas; falta recorrerlo con dos sesiones. La publicación programada aún necesita un scheduler local.
- Falta carga y extracción de documentos para guías, versiones, aviso in-app al moderador de área, filtros de métricas y lista de colaboradores. Las preguntas por paso, respuestas y votos de utilidad ya están conectadas.
- La interfaz de preferencias aún contiene banderas `email_*` heredadas aunque no se enviarán correos de producto; debe quedar en preferencias de notificación dentro de la app.

### Foro y moderación

- El formulario muestra preguntas parecidas en la misma área y aplica la ventana de 20 minutos; falta recorrerlo con varias cuentas/áreas.
- Las respuestas oficiales, fijado y moderación deben comprobarse en rutas/formularios con moderadores de área distinta.
- La interfaz de infracciones, historial y apelaciones ya existe; falta probar el ciclo y confirmar cómo se muestra una apelación resuelta a una cuenta sancionada.

### Clubes

- El modelo de propuesta, interés, expediente, profesor asesor y cita está implementado en Supabase/RPC; falta verificar los cambios de estado en recorrido real.
- Deben ser 20 personas distintas; después cada una carga credencial IPN, boleta, firma y vigencia de derechos IMSS.
- Falta recorrer el código de confirmación del asesor, el envío de formulario y la cita confirmada por Subdirección Académica/Sala 14.
- No se reservan salas; se publica un evento cuando los alumnos ya tienen autorización. El moderador de club solo gestiona su club.

### Objetos y espacios

- Las acciones ya usan RPCs privados, Supabase Storage, coincidencia de 80 %, reclamo, aprobación y QR de entrega. Falta recorrer manualmente el flujo completo con dos cuentas y verificar el escaneo desde un teléfono/cámara real.
- Espacios permite localizar profesores y publicar actividades ya autorizadas; no implementa reservas.
- El plano actual es ilustrativo hasta que llegue el real.

### Reportes e importación

- El panel global corresponde solo al admin general. Hay métricas básicas, filtros, CSV e impresión/PDF; faltan validación con datos y métricas adicionales para la comunidad.
- La importación de padrón será CSV de demostración, con vista previa, validación de columnas/dominios, detección de duplicados y descarga de errores. Nunca asignará roles de moderador/admin ni contraseñas.

## Decisiones de alcance

- Mantener demo local. No desplegar ni conectar un Supabase alojado ahora.
- No Cloudflare R2; Supabase Storage para todo archivo que sí esté dentro del alcance.
- Fuera del producto: SAES, otras escuelas IPN, ejecutar legalmente trámites, validar presencialmente con prefecto, reservas de espacios, control del auditorio solo por dirección y clubes informales.
- No añadir entregables de diagramas ni automatización de pruebas; la prioridad es que los flujos de la demo funcionen.
