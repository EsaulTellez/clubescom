# Pendientes del proyecto

Estado al 2026-11-04, comparado con `docs/fuente/TT.docx` y las decisiones del propietario en `docs/decisiones-producto.md`. La app corre como demo local con Supabase y ya hay cuentas de prueba para los roles. La migración cubre el modelo y RLS; las pantallas todavía no consumen de forma uniforme el modelo nuevo.

## Lo siguiente para llegar a una demo funcional

1. Adaptar acciones/páginas que aún esperan el esquema anterior: moderación y apelaciones, clubes y propuestas, objetos y entrega QR, guía con archivos, espacios/eventos aprobados, preferencias y auditoría.
2. Recorrer y corregir cada flujo con cuentas por rol. El login se comprobó para alumno, profesor, moderador y administrador; el alta/OTP y la recuperación con Mailpit aún necesitan recorrido.
3. Integrar Google GenAI para borradores de formatos y extracción de guías en pasos editables, con confirmación humana. La clave de API se configurará localmente; aceptar archivos significa los tipos que soporte el procesador y con límite de tamaño, no cualquier archivo arbitrario.
4. Implementar Realtime/publicación programada de avisos, preguntas por paso y métricas de uso de guías.
5. Construir el flujo CU-33 de importación CSV con vista previa, validación, duplicados y reporte descargable. El documento solo enuncia este caso; el CSV de demostración no representa un padrón oficial del IPN.
6. Completar exportación de métricas/auditoría a CSV y PDF y validar resultados con datos representativos.
7. Cambiar el mapa ilustrativo por el plano real cuando el propietario lo comparta.

## Gaps por área

### Acceso, datos y permisos

- Supabase local ya provee Auth, Postgres y Storage; el código conecta Postgres bajo roles `anon`/`authenticated` para aplicar RLS. No hay proyecto Supabase alojado conectado.
- Los datos privados viven en el esquema `private` y se consultan por RPC. Conviene revisar por pantalla que no queden rutas al modelo anterior ni accesos sin sesión/área.
- El administrador general asigna roles. Los moderadores institucionales se limitan al área; el moderador alumno, a su club.
- Supabase Auth verifica correo y recupera contraseña. Los correos de avisos/notificaciones del producto y las alertas de preguntas a 24/48 horas se excluyen.
- Existe el modelo de sanciones (cada tres infracciones: 1, 3 y 6 meses; el siguiente bloque, permanente) y apelaciones. Falta interfaz completa para registrar, revisar y resolverlas. No quedó definido si las infracciones se acumulan para siempre o tienen ventana temporal; la migración actual las acumula históricamente.
- La baja de cuenta debe comprobar que borre archivos personales asociados además del usuario Auth.

### Avisos y guías

- El formato social ya llama Google GenAI en servidor si hay `GOOGLE_GENERATIVE_AI_API_KEY`; falta recorrerlo con una clave válida. La generación de formatos y extracción de guías requiere revisión humana.
- Avisos programados y feed en tiempo real requieren acciones/Realtime; las tablas ya existen pero el flujo no está verificado.
- Falta carga privada de fuentes, extracción de documentos soportados, edición humana de pasos, historial, preguntas/respuestas por paso, sugerencias y métricas de guía.
- La interfaz de preferencias aún contiene banderas `email_*` heredadas aunque no se enviarán correos de producto; debe quedar en preferencias de notificación dentro de la app.

### Foro y moderación

- El formulario ya muestra preguntas parecidas en la misma área y aplica la ventana de 20 minutos; falta recorrerlo con varios roles/áreas en el navegador.
- La respuesta oficial debe depender del moderador del área correspondiente; las áreas no deberían poder cruzarse desde formulario ni URL.
- La interfaz de infracciones, sanciones y apelaciones no está completa.

### Clubes

- El modelo de propuesta, interés, expediente, profesor asesor y cita está definido en Supabase. Varias acciones actuales conservan nombres/estados de la versión anterior y necesitan migración.
- Deben ser 20 personas distintas; después cada una carga credencial IPN, boleta, firma y vigencia de derechos IMSS.
- Falta recorrer el código de confirmación del asesor, el envío de formulario y la cita confirmada por Subdirección Académica/Sala 14.
- No se reservan salas; se publica un evento cuando los alumnos ya tienen autorización. El moderador de club solo gestiona su club.

### Objetos y espacios

- Las acciones ya usan RPCs privados, Supabase Storage, coincidencia de 80 %, reclamo, aprobación y código/QR de entrega. Falta recorrer manualmente el flujo completo con dos cuentas y verificar el escaneo desde un teléfono/cámara real.
- Espacios se usa para localizar profesores y publicar eventos autorizados. No implementa reservas. Las consultas anteriores de `bookings` deben migrar a `space_events`.
- El plano actual es ilustrativo hasta que llegue el real.

### Reportes e importación

- El panel global corresponde solo al admin general. Faltan las métricas acordadas para comunidad cercana a 3,000 personas, filtros y exportación CSV/PDF.
- La importación de padrón será CSV de demostración, con vista previa, validación de columnas/dominios, detección de duplicados y descarga de errores. Nunca asignará roles de moderador/admin ni contraseñas.

## Decisiones de alcance

- Mantener demo local. No desplegar ni conectar un Supabase alojado ahora.
- No Cloudflare R2; Supabase Storage para todo archivo que sí esté dentro del alcance.
- Fuera del producto: SAES, otras escuelas IPN, ejecutar legalmente trámites, validar presencialmente con prefecto, reservas de espacios, control del auditorio solo por dirección y clubes informales.
- No añadir entregables de diagramas ni automatización de pruebas; la prioridad es que los flujos de la demo funcionen.
