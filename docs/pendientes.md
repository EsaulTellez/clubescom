# Pendientes del proyecto

Este archivo contrasta el demo actual con los requisitos del Trabajo Terminal y las decisiones confirmadas por el propietario en `docs/decisiones-producto.md`. Es una fotografía del estado inicial al 2026-11-04; actualizarlo junto con `docs/estado.md` cuando cambie un caso de uso.

## Arquitectura y seguridad

- El demo actual usa PostgreSQL local y consultas directas con `pg`, autenticación y sesiones propias, y archivos en `public/uploads`. Migrar a Supabase local para Auth, PostgreSQL, Storage y Realtime. No usar Cloudflare R2.
- Reemplazar el acceso a datos que omite RLS. Aplicar políticas por operación y reflejar los permisos por área en servidor y base de datos.
- Restringir moderadores a su área. El moderador alumno de un club solo administra ese club. Solo el admin general puede asignar roles institucionales.
- Usar verificación y recuperación por correo de Supabase Auth. No enviar por email avisos o notificaciones del producto.
- Añadir apelaciones y sanciones escalonadas por cada bloque de tres infracciones: un mes, tres meses, seis meses y luego suspensión permanente. El demo actual solo tiene un booleano de baneo.
- Resolver eliminación de cuentas y archivos personales relacionados sin conservar información del usuario que solicitó borrado.

## Avisos y guías

- La generación de formatos sociales actual es una plantilla. Integrar la API de Google con clave local por ambiente y edición humana previa a publicar.
- Los avisos programados no tienen un proceso que los publique a su hora ni actualización del feed en tiempo real.
- Las guías se redactan manualmente. Admitir archivos compatibles con el procesador y convertirlos a pasos editables con revisión humana; no prometer formatos literalmente ilimitados.
- Faltan preguntas por paso, analíticas útiles para una comunidad cercana a 3,000 personas, historial de versiones y flujo completo de sugerencias.

## Foro

- Faltan sugerencias de preguntas similares mientras se escribe y límite de 20 minutos entre publicaciones.
- La respuesta oficial no comprueba que el moderador corresponda al área de la pregunta.
- No construir alertas de preguntas desatendidas a las 24/48 horas (CU-16), por decisión del propietario.
- Implementar las infracciones del foro con apelación y escalamiento; el propietario definió sanción permanente después de cuatro bloques de tres infracciones.

## Clubes

- La propuesta actual permite simular el umbral de 20; quitar el atajo y requerir interés real de cuentas distintas.
- Tras alcanzar 20 interesados, cada uno debe subir credencial IPN, boleta y vigencia de derechos IMSS a almacenamiento privado.
- Falta la confirmación del profesor por código, el envío del formulario, la gestión de cita por Subdirección Académica/Sala 14 y los estados de revisión.
- El presidente debe ser un alumno moderador limitado a su club. Faltan comunidad privada y flujo completo de solicitudes de ingreso.

## Objetos perdidos

- Los archivos hoy se guardan localmente. Moverlos a Supabase Storage con acceso privado cuando sean sensibles.
- Cambiar el matching actual por comparación con umbral de 80 % y notificaciones internas.
- Completar el reclamo para que el QR verifique a la persona correcta durante la entrega; añadir confirmación e historial para ambas partes.

## Espacios y reportes

- Espacios no debe reservar ni autorizar salas. Los alumnos solo publican eventos ya autorizados y se confía en las publicaciones de moderadores institucionales.
- El propietario entregará el plano real del campus; hasta entonces, el mapa es ilustrativo.
- Completar métricas del panel, auditoría filtrable y reportes útiles con exportación CSV/PDF.

## Importación de padrón (CU-33)

El documento fuente solo nombra el caso, sin actor ni pasos. Para la demo se diseñará una importación CSV con vista previa, validación de campos y dominios institucionales, detección de duplicados, descarga de errores y confirmación antes de crear o invitar cuentas. El CSV no asignará roles de moderador/admin ni contendrá contraseñas; los usuarios crearán acceso con Supabase Auth. La plantilla será de ejemplo, no un formato oficial del IPN.

## Fuera del trabajo actual

- No desplegar ni conectar con un proyecto Supabase alojado en esta etapa.
- No conectar con SAES u otros sistemas externos del IPN.
- No enviar correos de avisos o notificaciones del producto.
- No implementar seguimiento 24/48 horas del foro, reservas de espacio ni aprobación exclusiva del director para el auditorio.
- No se requiere actualizar diagramas ni automatizar pruebas como entregables adicionales; la prioridad es que funcione el demo local y se puedan recorrer sus flujos.
