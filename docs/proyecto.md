# Proyecto

Trabajo Terminal 2026-B155. Aplicación web para la gestión de actividades de la ESCOM. Autores: Díaz Ramírez Daniel y Téllez De La Cruz Esaul. Directora: Dra. Mónica Rivera De La Rosa. Fuente: `docs/fuente/TT.docx`.

## Qué es

La ESCOM tiene avisos, trámites, clubes, espacios y objetos perdidos repartidos en redes, ventanillas y la memoria del personal. El objetivo general es una plataforma web que centralice esa información, la gestión de actividades estudiantiles y la orientación administrativa, con ayuda de las unidades administrativas.

## Actores y roles

El visitante consulta las publicaciones públicas sin crear cuenta. Los alumnos pueden estar fuera de un club, pertenecer como integrantes o moderar el club que los tiene como responsable. El profesor asesor también modera su club. Las designaciones se guardan en `clubs.leader_id` y `clubs.advisor_id`; las afiliaciones están en `memberships`.

El superadministrador asigna los roles de alumno, profesor, moderador y administrador desde el panel. Los moderadores institucionales tienen un área en `users.area`. Becas, CATT y Gestión Escolar atienden sus propios trámites y guías. Becas también gestiona eventos del Auditorio. Subdirección Académica gestiona clubes académicos y eventos de Sala 14. Comunicación publica avisos. Se conservan las áreas de Clubes Académicos, Clubes Culturales y Deportivos, y Prefectura.

La cuenta de operación tiene acceso administrativo a los módulos y puede activar su propio perfil de alumno o profesor. La superadministración y el cambio de perfil requieren atributos concedidos en el servidor para una cuenta concreta. La creación de una cuenta institucional ordinaria asigna alumno o profesor por dominio.

## Módulos en alcance (sección 1.4)

- Identidad y roles: alta, sesión, perfiles e insignias. Lectura pública de contenido público.
- Comunicación institucional: avisos con categoría, formato para redes, carrusel y feed.
- Clubes: directorio, propuesta, umbral de 20, asesor, membresías.
- Objetos perdidos: reporte, coincidencia, pregunta de seguridad y cierre.
- Foro de trámites: preguntas por área, respuesta de personal, votos.
- Guías: pasos, preguntas frecuentes, sugerencias.
- Infraestructura: mapa de cubículos e itinerario de espacios (Sala 14, auditorio y otros).

Los casos de las tablas 3.32 a 3.38 agregan notificaciones y el panel de administración. Están especificados en el capítulo 3, fuera de la lista corta de la sección 1.4.

## No construir (sección 1.5)

- Otras escuelas o institutos del IPN. Solo ESCOM.
- Ejecución técnica o legal de trámites en SAES o en el Sistema de Becas. La plataforma orienta; el trámite real sigue en ventanilla.
- Integración con sistemas del IPN (calificaciones, padrones, horarios del SAES).
- Entrega física de un objeto con un prefecto presente. La validación del reclamo es solo digital.
- Que el director sea el único que modifica el itinerario del auditorio. El Word lo deja como restricción institucional, no como función de esta app.
- Clubes informales o no reconocidos por la ESCOM.
- Dar por válida la documentación de un club (IMSS, credencial, firmas) sin la revisión física de la encargada.
- Garantizar que un objeto reportado existe, o que las guías están al día si el área no las carga.
- Dependencia de que el usuario tenga internet y de que el servidor esté arriba. No es un módulo.

## Stack y decisiones vigentes

La plataforma se desarrollará con Next.js y Supabase para autenticación, PostgreSQL, políticas RLS, almacenamiento de archivos y tiempo real. **No se usará Cloudflare R2.** La demo se ejecuta localmente y el despliegue de producción usa Vercel con Supabase remoto. La lógica programada o de servidor que requieran los flujos deberá integrarse con Supabase y quedar disponible en el entorno local.

La demo usa Supabase local para Auth, PostgreSQL, Storage y Realtime. Las consultas PostgreSQL de la aplicación se ejecutan con el contexto de la sesión y las políticas RLS; todavía faltan recorridos y revisión de permisos de extremo a extremo. El estado real y las decisiones detalladas están en `docs/estado.md`, `docs/pendientes.md` y `docs/decisiones-producto.md`.

Los correos de autenticación (registro/verificación y recuperación) sí forman parte del demo. Los correos de avisos y notificaciones de producto quedan fuera por ahora. La generación de texto y el procesamiento de documentos usarán la API de Google con una clave local y configurable; nunca se guardará la clave en el repositorio.
