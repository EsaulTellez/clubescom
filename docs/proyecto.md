# Proyecto

Trabajo Terminal 2026-B155. Aplicación web para la gestión de actividades de la ESCOM. Autores: Díaz Ramírez Daniel y Téllez De La Cruz Esaul. Directora: Dra. Mónica Rivera De La Rosa. Fuente: `docs/fuente/TT.docx`.

## Qué es

La ESCOM tiene avisos, trámites, clubes, espacios y objetos perdidos repartidos en redes, ventanillas y la memoria del personal. El objetivo general es una plataforma web que centralice esa información, la gestión de actividades estudiantiles y la orientación administrativa, con ayuda de las unidades administrativas.

## Actores y roles

La sección 3.3 nombra cinco actores. En `db/schema.sql` el enum `user_role` solo tiene cuatro valores. El visitante no tiene fila: es quien entra sin cookie de sesión.

| Actor del Word | Rol en la base | Cómo entra |
| --- | --- | --- |
| Alumno | `alumno` | Correo `@alumno.ipn.mx`. `roleFromEmail` en `src/lib/auth.ts`. |
| Profesor | `profesor` | Correo `@ipn.mx`. |
| Moderador | `moderador` | Lo asigna un admin. El área va en `users.area` (texto libre). |
| Administrador general | `admin` | Lo asigna un admin o el seed. |
| Usuario anónimo | sin rol | Lee avisos públicos, clubes, guías y el mapa. No publica. |

Áreas que el seed y el código usan de verdad (`scripts/seed.mjs`):

- `comunicacion`: publica avisos (`canManageAvisos` en `src/app/avisos/shared.ts`).
- `clubes_academicos`: registra una propuesta que ya tiene asesor (`canModerate` en `src/app/clubes/actions.ts`).
- `gestion_escolar`, `becas`, `catt`: etiquetas de guías y del foro (`src/app/guias/shared.ts`, `src/app/foro/shared.ts`). El moderador de esa área no queda atado por código al editar solo lo suyo.
- `prefectura`, `clubes_culturales`: cuentas de demostración. Ninguna pantalla les da un permiso distinto.
- `general`: etiqueta de pregunta o guía, no un área de usuario.

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

## Stack

El documento (secciones 1.2.1, 1.6.1 y 4.1) pide Next.js, Supabase (PostgreSQL, autenticación y RLS), Cloudflare R2, Tailwind y disparadores SQL.

Este repositorio hoy:

- Next.js y PostgreSQL en Docker. La app conecta con `DATABASE_URL` como dueña de la base (`src/lib/db.ts`).
- Sesión propia: cookie `escom_session` y bcrypt. No hay Supabase ni JWT.
- RLS está declarado en `db/schema.sql`. No se aplica, porque la conexión no es un rol limitado por esas políticas.
- Fotos en `public/uploads`. No hay Cloudflare R2.
- El OTP de registro y de recuperación se muestra en la página. No hay correo.
- No está desplegado. No hay HTTPS de producción ni respaldos programados.
