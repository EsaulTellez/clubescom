# Capítulo 5: Desarrollo e Implementación (Secciones completadas y ampliadas)

Este archivo contiene:
1. La tabla `5.1.1 Stack tecnológico utilizado` actualizada con las versiones reales de `package.json` y los paquetes de extracción documental.
2. La celda faltante `[Pendiente...]` de la **Tabla 5.4 (Ciclo 3)** en `5.2.4`.
3. La **Tabla 5.9 (Riesgos principales por ciclo)** de `5.2.5` con las siete filas de `Estado al cierre` ya redactadas (reemplazando los siete `[Completar]`).
4. La nueva sección **5.3 Implementación del sistema por capas y módulos**, para colocarla justo después de la Tabla 5.9 y antes del Capítulo 6.

---

## 1. Reemplazo para `5.1.1 Stack tecnológico utilizado`

| Tecnología | Versión declarada | Propósito |
| --- | --- | --- |
| Node.js | >=22.13.0 | Entorno de ejecución para el servidor Next.js, scripts de base de datos y pruebas locales. |
| npm | >=10 | Gestión de dependencias y ejecución de tareas del proyecto. |
| Next.js | 16.4.6 | Framework web con App Router, Server Components, Server Actions y rutas de API. |
| React / React DOM | 19.3.0 | Construcción de componentes de interfaz, estados de cliente y formularios interactivos. |
| TypeScript | ^5 | Verificación estática de tipos en modo estricto (`strict: true`). |
| Tailwind CSS | ^4 | Sistema de estilos y diseño responsivo para escritorio y móvil. |
| PostgreSQL | 17 | Motor relacional con esquemas `public` y `private`, triggers, funciones PL/pgSQL, `pg_trgm` y políticas RLS. |
| Supabase CLI | ^3.0.0 | Orquestación de contenedores locales (Auth, Postgres, Storage, Realtime, Studio y Mailpit) y migraciones SQL. |
| `@supabase/supabase-js` / `@supabase/ssr` | ^2.119.0 / ^0.12.7 | Cliente de autenticación, manejo de sesiones por cookies en servidor y suscripciones Realtime. |
| `pg` | ^8.23.1 | Pool de conexiones a PostgreSQL para consultas parametrizadas del servidor y bitácora de auditoría. |
| `@google/genai` | ^2.32.0 | Generación asistida de formatos de comunicados y estructuración opcional de borradores de guías. |
| `pdfjs-dist` / `@napi-rs/canvas` | ^6.5.438 / ^1.1.1 | Lectura de texto en archivos PDF y rasterización de páginas escaneadas en el servidor. |
| `tesseract.js` / `@tesseract.js-data/spa` | ^7.0.0 / ^1.0.0 | Reconocimiento óptico de caracteres (OCR) local en español para instructivos en imagen o PDF escaneado. |
| `fflate` / `saxes` | ^0.8.3 / ^6.0.0 | Descompresión en memoria y lectura XML de documentos Word (`.docx`) para generar guías de trámites. |
| `qrcode.react` | ^4.2.0 | Generación del código QR de verificación para la entrega de objetos perdidos. |
| ESLint | ^9 | Análisis estático de código bajo las reglas de Next.js Core Web Vitals y TypeScript. |

---

## 2. Reemplazo en `5.2.4 Tabla 5.4 Actividades del Ciclo 3` (Semana 13, fila Evaluación)

En la última fila de la **Tabla 5.4 Actividades del Ciclo 3**, sustituir `[Pendiente: definir la actividad de evaluación del ciclo]` por:

| Cuadrante | Actividad | Sem. |
| --- | --- | --- |
| Evaluación | Revisión de consistencia entre casos de uso, modelo relacional y mockups con la directora del Trabajo Terminal, depurando alcances de los módulos de clubes, espacios y objetos perdidos. | 13 |

---

## 3. Reemplazo en `5.2.5 Tabla 5.9 Enfoque del análisis de riesgos por ciclo`

Sustituir la **Tabla 5.9** (donde todas las celdas decían `[Completar]`) por la siguiente tabla terminada:

| Ciclo | Riesgo en el que se enfoca el cuadrante | Estado al cierre |
| --- | --- | --- |
| 1 | Comunicación escolar fragmentada y viabilidad de centralizar servicios | **Mitigado.** Se delimitaron siete módulos operativos y las exclusiones de alcance (sin SAES ni trámites legales), concentrando solo procesos propios de la vida escolar en la ESCOM. |
| 2 | Requerimientos ambiguos y conflictos en la integración de datos escolares | **Mitigado.** Se realizaron seis entrevistas con los titulares de Comunicación, Gestión Escolar, Becas, Subdirección Académica, Servicios Estudiantiles y Prefectura, acordando flujos que no duplicaran su carga de trabajo. |
| 3 | Fallos de diseño en los flujos de objetos perdidos, trámites, autenticación y foro | **Mitigado.** Se descartó el resguardo físico en Prefectura a favor de un modelo P2P con pregunta de seguridad y QR, se acotó el alta a dominios `@alumno.ipn.mx` y `@ipn.mx`, y se normalizó el esquema relacional. |
| 4 | Inconsistencias en la base de datos y observaciones pendientes del director | **Cerrado.** Se verificó la integridad referencial del esquema inicial, se corrigieron las tablas de casos de uso y se aprobó la memoria del primer semestre (TT1). |
| 5 | Fallos de seguridad en sesiones, permisos y vulnerabilidades en la base de datos | **Mitigado.** Se separaron los datos sensibles en el esquema `private`, se aplicaron políticas RLS por rol y área en todas las tablas, se implementó el cierre por inactividad a los 30 minutos y se restringió la asignación de roles a superadministración. |
| 6 | Integración frontend/backend y manejo de archivos subidos | **Mitigado.** Se unificó el almacenamiento en cuatro buckets de Supabase Storage con políticas por carpeta y participante, y se incorporó un procesador documental local (PDF, DOCX y OCR en español) para no depender de servicios externos. |
| 7 | Caídas del servidor, fallos en la demostración en vivo y control del tiempo de exposición | **Controlado.** Se preparó el entorno local reproducible con Docker y 21 cuentas semilla que cubren todos los roles y áreas, se sincronizó el esquema con el proyecto remoto de respaldo (`clebescom`) y se añadieron scripts de volcado y restauración (`backup.sh` y `restore.sh`). |

---

## 4. Nueva sección `5.3 Implementación del sistema por capas y módulos` (pegar después de la Tabla 5.9)

### 5.3 Implementación del sistema por capas y módulos

La construcción del sistema durante los ciclos 5, 6 y 7 se organizó sobre Next.js App Router y Supabase, manteniendo las reglas de autorización y las transiciones críticas dentro de PostgreSQL mediante 26 migraciones SQL secuenciales (`supabase/migrations/20261104000100_initial.sql` a `20261118000400_guide_routes.sql`).

#### 5.3.1 Esquema de base de datos, separación de datos sensibles y políticas RLS

Para evitar la exposición accidental de información personal o secretos de validación en consultas desde el cliente, la base de datos se dividió en dos esquemas:

1. **Esquema `public`:** contiene las tablas operativas consultables por la aplicación bajo políticas de Seguridad a Nivel de Fila (`ROW LEVEL SECURITY` activo en todas las tablas): `users`, `badges`, `privacy_requests`, `avisos`, `aviso_interactions`, `guides`, `guide_versions`, `guide_progress`, `guide_suggestions`, `guide_views`, `guide_step_events`, `guide_step_questions`, `guide_step_answers`, `guide_step_votes`, `questions`, `question_votes`, `answers`, `answer_votes`, `clubs`, `club_proposals`, `club_interests`, `club_proposal_files`, `club_appointments`, `memberships`, `club_posts`, `club_events`, `lost_items`, `lost_item_matches`, `lost_item_claims`, `lost_item_handoffs`, `spaces`, `space_events`, `event_attendees`, `cubicles`, `map_rooms`, `map_room_people`, `map_room_suggestions`, `map_room_suggestion_votes`, `notifications`, `notification_prefs`, `moderation_strikes`, `moderation_suspensions`, `moderation_appeals`, `audit_logs` y `system_settings`.
2. **Esquema `private`:** carece de permisos `SELECT` directos para los roles `anon` y `authenticated`. Resguarda la tabla `private.user_private` (correo institucional, boleta o número de empleado y estado interno de la cuenta), `private.lost_item_secrets` (hash SHA-256 de la respuesta de seguridad de cada objeto encontrado), `private.lost_item_claim_answers`, `private.lost_claim_attempts` (contador de máximo tres intentos por usuario y objeto), `private.lost_item_handoff_secrets` (código de entrega representado en el QR) y `private.club_proposal_advisor_codes` (código de confirmación enviado al profesor asesor). El acceso a estos registros ocurre exclusivamente a través de funciones RPC `SECURITY DEFINER` con `search_path = ''`.

El aislamiento entre áreas administrativas se refuerza en tres niveles:
- **Enrutamiento y sesión (`src/proxy.ts` y `src/lib/areas.ts`):** renueva la sesión de Supabase Auth y redirige a las cuentas de oficina hacia sus módulos asignados (Gestión Escolar y CATT trabajan en `/foro`; Becas en `/foro` y `/eventos` para el Auditorio; Subdirección Académica en `/clubes` y `/eventos` para la Sala 14).
- **Políticas RLS restrictivas (`AS RESTRICTIVE`):** las políticas `questions_office_scope`, `guides_office_scope` y `answers_office_scope` (`20261118000100_area_roles.sql`) garantizan a nivel de motor SQL que un moderador de trámites solo pueda modificar guías o oficializar respuestas cuya columna `area` coincida con la suya.
- **Almacenamiento en Supabase Storage:** se configuraron cuatro buckets con políticas sobre `storage.objects`: `public-media` (carteles de avisos, eventos, fotos de objetos y PDFs descargables de trámites), `club-documents` (privado; solo participantes de una propuesta con 20+ votos, el proponente y el área revisora leen o cargan expedientes), `lost-evidence` (privado; solo el reclamante que sube la evidencia, quien encontró el objeto y administración pueden consultarla) y `guide-files` (privado para documentos fuente de guías).

#### 5.3.2 Identidad, derechos ARCO, insignias y moderación (`CU-01` a `CU-04`, `CU-15`)

El registro (`/registro`) valida que el correo pertenezca a `@alumno.ipn.mx` o `@ipn.mx` y exige la aceptación expresa del aviso de privacidad (`/aviso-privacidad`). Supabase Auth envía el enlace de confirmación al correo institucional; la ruta `/auth/callback` intercambia el código o `token_hash` y redirige a `/auth/confirmado`. El rol inicial (`alumno` o `profesor`) se asigna en el trigger de alta a partir del dominio del correo. La asignación de roles de `moderador` (con área institucional obligatoria) o `admin` está reservada a cuentas con el atributo `is_superadmin` mediante el RPC `admin_set_user_role`.

En `/perfil`, el usuario actualiza su nombre y boleta (`update_my_profile`), descarga una copia completa de sus datos personales en formato JSON o CSV (`/api/me/export`), registra solicitudes de rectificación, oposición, cancelación o incidentes de privacidad (`public.privacy_requests`) y puede eliminar su cuenta limpiando previamente sus archivos en Storage. El componente `AppShell` vigila la actividad del usuario y cierra la sesión automáticamente tras 30 minutos de inactividad (`RNF-05`).

El otorgamiento de insignias (`CU-04`) se ejecuta mediante triggers en PostgreSQL (`private.award_badge`) con restricción de unicidad `(user_id, code)`: se conceden automáticamente al publicar la primera duda en el foro, al responder por primera vez, al alcanzar cinco respuestas comunitarias, al recibir validación oficial en una respuesta, al aprobarse una sugerencia en una guía, al completar la devolución de un objeto perdido y al ser registrado como alumno líder o profesor asesor de un club.

Para el control de integridad (`CU-03` y `CU-15`), el módulo `/moderacion` permite registrar infracciones (`register_moderation_strike`) que activan suspensiones escalonadas por bloques de tres strikes (1 mes, 3 meses, 6 meses y suspensión permanente), mientras que el veto administrativo en `/admin` exige motivo obligatorio, revoca la sesión activa en Supabase Auth y deja habilitada la ruta `/apelaciones` para que la persona sancionada presente su descargo.

#### 5.3.3 Comunicación institucional, feed en tiempo real y cartelera de eventos (`CU-06` a `CU-08`, `CU-28`, `CU-COM-04-01`)

El módulo de Comunicados (`/avisos`) restringe la creación, edición y baja al área de `comunicacion` y a `admin`. El formulario modal incluye el asistente de redacción (`generateAvisoFromRawText` en `src/app/avisos/actions.ts`), que transforma un texto libre mediante Google Gemini (`@google/genai`) —o una plantilla estructurada local cuando no se configura clave externa— en tres salidas editables: el comunicado para la plataforma ESCOM, la versión recortada para Twitter/X (`social_twitter`) y el texto para Facebook (`social_facebook`).

Los avisos admiten imagen en Storage, visibilidad pública o exclusiva para comunidad autenticada (`is_public`), enlace externo opcional con registro de aperturas y clics (`/api/avisos/track`) y fecha de publicación programada (`publish_at`). La función `public.trigger_scheduled_avisos()`, programada cada minuto con `pg_cron` e invocada al consultar el listado, activa los comunicados cuando llega su hora.

La portada (`/`) y la Cartelera ESCOM (`/eventos`) integran en tiempo real (`supabase_realtime` en `src/components/realtime-refresh.tsx`) comunicados, publicaciones de clubes, dudas destacadas y eventos aprobados. En `/eventos`, la administración de espacios respeta la organización real del plantel: Becas publica y autoriza eventos del Auditorio, Subdirección Académica gestiona los de la Sala 14 y las áreas de clubes administran los de espacios deportivos o culturales, verificando colisiones de horario sobre la misma sede y permitiendo a la comunidad confirmar asistencia («Asistiré» en `event_attendees`).

#### 5.3.4 Foro y Guías interactivas ramificadas con extracción documental (`CU-05`, `CU-09` a `CU-14`, `CU-GUA-02-01`)

Los módulos de orientación se unificaron en la vista **Foro y Guías** (`/foro`, con rutas directas desde `/guias`). Cada guía modela sus pasos como un grafo dirigido acíclico (`validateSteps` y `pathToStep` en `src/app/guias/shared.ts`), lo que permite representar trámites con decisiones ramificadas (por ejemplo, caminos distintos para alta inicial o renovación de beca) conservando un identificador estable por paso para el progreso del alumno (`guide_progress`), las preguntas contextuales (`target_step_index`) y las analíticas de abandono.

Para evitar que las oficinas capturen instructivos desde cero (`CU-09`), el módulo `src/app/guias/document.ts` procesa archivos PDF, documentos Word (`.docx`), imágenes JPG/PNG/WebP y texto plano:
- En archivos `.docx`, descomprime `word/document.xml` con `fflate` y extrae los párrafos con `saxes`.
- En archivos PDF, extrae el texto página por página con `pdfjs-dist`; si detecta una página escaneada sin capa de texto, la rasteriza con `@napi-rs/canvas` y ejecuta reconocimiento óptico de caracteres (OCR) en español con `tesseract.js`.
- Con el texto obtenido, genera un borrador de pasos, ramificaciones y preguntas frecuentes (asistido por Google Gemini si la clave está presente o mediante el analizador heurístico local `draftFromText`), que el moderador del área revisa, edita y aprueba antes de publicar, pudiendo adjuntar además el PDF oficial descargable del trámite (`RF-12`).

Cuando una búsqueda en el catálogo no arroja coincidencias (`CU-10`), la interfaz sugiere trámites cercanos y ofrece un botón que abre el diálogo de nueva pregunta en el área filtrada. Al redactar una duda (`CU-13`), el formulario busca con debounce hilos similares ya resueltos, verifica el enfriamiento de 20 minutos (`forum_cooldown_minutes`) y notifica a los moderadores del área. Los alumnos pueden proponer mejoras en cualquier paso de una guía (`CU-GUA-02-01`); al aceptarlas, el moderador genera una nueva versión en `guide_versions` y acredita al autor en la lista de colaboradores.

#### 5.3.5 Gestión de clubes y validación de propuestas (`CU-17` a `CU-20`, `CU-31`)

El módulo `/clubes` contempla tanto el directorio de clubes activos como el flujo de propuestas estudiantiles y el panel del área revisora:
1. **Propuesta y detector de similitud (`CU-17`):** al proponer un club, `findSimilarClubsOrProposals` (`src/app/clubes/similarity.ts`) normaliza nombres sin acentos y bloquea duplicados frente a clubes o propuestas existentes.
2. **Umbral de 20 interesados y notificación en cascada (`CU-17`, `CU-31`):** cada alumno autenticado puede registrar un voto único en `club_interests`. Al alcanzar el umbral de 20 personas (`promote_club_proposal_at_threshold`), el estado cambia automáticamente a `en_documentacion` y se insertan notificaciones para el proponente y para todos los interesados. Si el proponente deja inactiva la propuesta durante 5 días (`club_claim_inactivity_days`), otro interesado puede asumir la coordinación (`claim_inactive_club_proposal`).
3. **Expedientes individuales y código del profesor asesor (`CU-18`, `CU-19`):** cada interesado carga en `club-documents` sus cuatro documentos requeridos (credencial IPN, horario/boleta, constancia de vigencia IMSS y formato firmado). Paralelamente, el proponente registra el correo `@ipn.mx` del profesor coordinador, quien recibe un código por correo electrónico (`sendAdvisorCodeEmail`) y lo confirma en la plataforma (`confirm_club_proposal_advisor`), además de adjuntarse el proyecto ejecutivo con objetivos, cronograma, impacto y PDF del plan de trabajo.
4. **Dictamen, cita y operación del club (`CU-19`, `CU-20`):** Subdirección Académica (para clubes académicos) o Clubes Culturales y Deportivos (para culturales y deportivos) revisan los expedientes, agendan la cita o marcan observaciones (`incompleta` / `rechazada`) y aprueban el registro oficial, o bien dan de alta directa clubes ya reconocidos asignando alumno responsable (`leader_id`) y profesor asesor (`advisor_id`). En `/clubes/[id]`, ambos responsables administran publicaciones, eventos del club y solicitudes de ingreso (`memberships`).

#### 5.3.6 Objetos perdidos P2P, Mapa 3D del campus y Panel de administración (`CU-21` a `CU-27`, `CU-29` a `CU-35`)

El módulo de Objetos Perdidos (`/objetos`) implementa el flujo P2P completo:
- **Reporte y coincidencia al 80 % (`CU-21`, `CU-22`):** `create_lost_item` registra pérdidas y hallazgos con hasta dos fotos; en hallazgos exige pregunta y respuesta de seguridad (cuyo hash SHA-256 pasa a `private.lost_item_secrets`). Al insertar el reporte, el trigger `private.match_lost_item()` calcula la similitud con `pg_trgm` frente a reportes opuestos abiertos y, cuando el puntaje es $\ge 0.80$, registra la coincidencia en `lost_item_matches` y notifica a ambos usuarios.
- **Reclamo, evidencia y entrega con QR (`CU-23`, `CU-24`):** `submit_lost_item_claim` limita a tres los intentos de respuesta por usuario y permite adjuntar evidencia en `lost-evidence`. Cuando quien encontró el objeto aprueba el reclamo (`approve_lost_item_claim`), se crea la orden de entrega en `lost_item_handoffs`, se habilita el contacto institucional entre ambos y se muestra el código QR de 8 caracteres. Durante la entrega física, cualquiera de las partes escanea el QR con la cámara (`BarcodeDetector` en `src/app/objetos/[id]/qr-scanner.tsx`) o introduce el código (`confirm_lost_item_handoff`), pasando el objeto a `entregado` y moviéndolo al historial personal de ambos participantes.

En `/mapa` (`CU-25` a `CU-27`), el componente `CampusMap` (`src/components/campus-map.tsx`) construye una maqueta 3D interactiva de la ESCOM con selección por piso, vista interior de la planta baja del Edificio de Gobierno (Biblioteca, Gestión Escolar, acceso al Auditorio, consultorios, escaleras centrales y cajero), tooltips al pasar el cursor y buscador de docentes y salones. Los profesores actualizan directamente su cubículo (`assign_my_map_room`), con aviso y soporte de cohabitación cuando comparten oficina, mientras que los alumnos pueden enviar sugerencias de ubicación votadas por la comunidad (`map_room_suggestions`).

Finalmente, el panel `/admin` (`CU-32` a `CU-35`), exclusivo para administración general, concentra los indicadores de participación (`admin_dashboard_metrics`), el importador de padrón CSV con previsualización y descarga de errores (`src/app/admin/roster-import.tsx`), la gestión de roles y vetos, los parámetros del sistema (`system_settings`), la bitácora de auditoría con valores anterior/nuevo e IP exportable a CSV (`/admin/auditoria.csv`) y los reportes de impacto académico en CSV (`/admin/impacto.csv`) y vista de impresión/PDF.
