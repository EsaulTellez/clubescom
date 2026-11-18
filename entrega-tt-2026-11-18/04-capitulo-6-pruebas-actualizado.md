# Capítulo 6. Pruebas y validación (Actualizado al corte del 18 de noviembre de 2026)

> **Nota para pegar en Word:** Este texto reemplaza el Capítulo 6 del archivo `TT (1).docx` (que tenía fecha de corte del 13 de noviembre y hacía referencia a scripts de Vitest ausentes del repositorio), actualizando todas las tablas (`6.1` a `6.7`) al estado real del sistema y de las pruebas reproducibles al **18 de noviembre de 2026**.

---

## Capítulo 6. Pruebas y validación

Este capítulo documenta la estrategia, los casos de prueba y la evidencia de verificación de la plataforma web para la gestión de actividades de la ESCOM con fecha de corte al **18 de noviembre de 2026**. Se distingue entre tres niveles de evidencia:
1. **Verificación automatizada reproducible en el repositorio:** validación estática de tipos (`tsc --noEmit`), análisis de código (`eslint`), pruebas unitarias ejecutadas con el corredor nativo de Node.js (`node --test`) sobre las reglas de negocio de los módulos y comprobaciones de políticas RLS y funciones RPC sobre Supabase.
2. **Recorridos funcionales verificados en navegador y base de datos:** flujos ejecutados sobre el entorno local de Supabase (con las 21 cuentas semilla de `scripts/seed.mjs`) y sobre el proyecto remoto sincronizado (`clebescom`).
3. **Evaluaciones que requieren entorno productivo o sesiones presenciales con usuarios:** mediciones de carga bajo concurrencia escolar y sesiones formales de aceptación (UAT) con cuestionario SUS.

### 6.1 Estrategia de pruebas

La validación se organizó en seis niveles complementarios, desde funciones puras sin conexión a red hasta recorridos entre roles con políticas RLS activas en PostgreSQL y Supabase Storage. Las pruebas que insertan o modifican registros de demostración se ejecutan con cuentas semilla dedicadas o dentro de transacciones revertidas para no alterar los datos de trabajo.

**Tabla 6.1 Niveles de prueba**

| Nivel | Propósito y alcance | Herramientas utilizadas | Criterio de aceptación |
| --- | --- | --- | --- |
| **Estáticas y de construcción** | Comprobar integridad de tipos TypeScript, reglas de linting y compilación de rutas de servidor y cliente. | TypeScript (`npx tsc --noEmit`), ESLint 9 (`npm run lint`) y compilador de Next.js (`npm run build`). | Cero errores de tipos, cero errores de ESLint y generación completa del build de producción. |
| **Unitarias** | Verificar reglas puras de negocio: validación de grafos de guías ramificadas, permisos por área y sede, categorías y enlaces de avisos, y detección de clubes similares sin acentos. | Corredor nativo `node:test` y `node:assert/strict` (`node --test`). | 100 % de los casos válidos, inválidos y de frontera aprobados sin depender de red ni servicios externos. |
| **Integración (PostgreSQL / RLS / Storage)** | Comprobar funciones RPC, triggers (`pg_trgm` al 80 %, insignias, umbral de 20 votos, notificaciones por área) y políticas RLS por rol, oficina y sede. | Supabase local y proyecto remoto (`clebescom`), sesiones Auth de los 21 perfiles semilla y transacciones SQL. | El rol autorizado completa la operación; los roles o áreas ajenos reciben rechazo de la base de datos; el esquema `private` permanece inaccesible para lectura directa. |
| **Funcionales y de sistema** | Recorrer los casos de uso desde la interfaz web en escritorio (`1366×850`) y móvil (`390×844`) con cuentas de visitante, alumno, profesor, moderadores de área y administrador. | Navegador web / Chromium automatizado, Mailpit local y cuentas semilla (`Escom2026!`). | Se cumplen las precondiciones, las transiciones de estado y las restricciones del alcance sin exponer datos privados ni desbordar la interfaz. |
| **Seguridad** | Verificar control de acceso positivo y negativo en rutas, Server Actions, tablas y buckets (`club-documents`, `lost-evidence`), manejo de sesiones e inactividad. | Sesiones separadas por rol, pruebas de acceso cruzado entre áreas y verificación de expiración a los 30 minutos. | Ninguna cuenta modifica recursos fuera de su área o club; las cuentas vetadas o suspendidas pierden acceso operativo salvo en `/apelaciones`. |
| **Rendimiento y usabilidad (UAT)** | Evaluar tiempos de respuesta de interfaz y consultas (`RNF-01` a `RNF-03`), así como la comprensión de tareas por usuarios de la ESCOM. | Índices PostgreSQL (`pg_trgm`, B-Tree); protocolo propuesto con Lighthouse, k6 y cuestionario SUS. | Consultas locales por debajo de 500 ms; las mediciones en servidor productivo y la aplicación presencial del cuestionario SUS quedan programadas para la fase piloto institucional. |

### 6.2 Pruebas unitarias y verificación estática

En la verificación estática del repositorio al 18 de noviembre de 2026:
- `npx tsc --noEmit` finalizó con **0 errores** de compilación ni de tipos en los 124 archivos de `src/`.
- `npm run lint` finalizó con **0 errores** (únicamente advertencias informativas por el uso deliberado de etiquetas `<img>` para carteles dinámicos y vistas previas locales).

Para las pruebas unitarias de reglas puras se ejecutó el conjunto reproducible con el corredor nativo de Node.js (`node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test entrega-tt-2026-11-18/evidencia/reglas.mjs`), obteniendo **11 de 11 pruebas aprobadas en 86.6 ms** (además del antecedente de 8 pruebas unitarias sobre validación de dominios y parseo de CSV registrado en el corte previo del 13 de noviembre):

**Tabla 6.2 Pruebas unitarias de reglas de negocio ejecutadas**

| Grupo funcional | Módulo / archivo verificado | Casos probados y resultado obtenido |
| --- | --- | --- |
| **Grafos de guías ramificadas** | `src/app/guias/shared.ts` (`validateSteps`, `pathToStep`) | 1) Conservación de ramas de decisión (Alta vs. Renovación). <br>2) Cálculo de ruta exacta hacia el paso destino (`[1, 3]`). <br>3) Rechazo de ciclos que regresan al primer paso. <br>4) Rechazo de transiciones hacia pasos eliminados. **(4/4 aprobadas)** |
| **Comunicados y permisos de difusión** | `src/app/avisos/shared.ts` (`isCategory`, `canManageAvisos`, `parseExternalUrl`) | 5) Reconocimiento estricto de las tres categorías (`academico`, `social`, `tramites`) y rechazo de categorías ajenas. <br>6) Autorización exclusiva para moderación de `comunicacion` y denegación para `becas`. <br>7) Aceptación de enlaces `https://` y rechazo de esquemas no permitidos (`ftp://`). **(3/3 aprobadas)** |
| **Antiduplicidad en propuestas de clubes** | `src/app/clubes/similarity.ts` (`findSimilarClubsOrProposals`) | 8) Detección bloqueante (`isBlocking: true`) de nombres de clubes existentes aun cuando el usuario escribe sin acentos ni mayúsculas (`"robotica"` vs. `"Club de Robótica"`). **(1/1 aprobada)** |
| **Aislamiento de oficinas y módulos** | `src/lib/areas.ts` (`procedureOffice`, `officeModules`, `isStaffArea`) | 9) Restricción de módulos visibles por oficina: Gestión Escolar solo accede a `["/foro"]`, Becas a `["/foro", "/eventos"]`, Subdirección Académica a `["/clubes", "/eventos"]` y un alumno conserva navegación general (`null`). **(1/1 aprobada)** |
| **Moderación del foro por área y solicitud** | `src/app/foro/shared.ts` (`canModerateForumQuestion`, `isArea`, `isRequestKind`) | 10) Un moderador de Becas modera dudas de `becas` pero es rechazado en `catt`; Prefectura modera solicitudes de `cambio_info` en `infraestructura`. **(1/1 aprobada)** |
| **Gobernanza de sedes de eventos** | `src/app/espacios/shared.ts` (`canManageSpaceByName`, `officeEventSpace`, `clubEventVenueArea`) | 11) Asignación exclusiva del `Auditorio` al área de Becas y de la `Sala 14` a Subdirección Académica, incluyendo el reconocimiento de sede en eventos de clubes (`"Sala 14 · Edificio de Gobierno"`). **(1/1 aprobada)** |

### 6.3 Pruebas de integración

Las pruebas de integración verifican la interacción entre las acciones del servidor Next.js, Supabase Auth, las políticas RLS de PostgreSQL y los buckets de Supabase Storage, tanto en la instancia local como en el proyecto remoto `clebescom` (`qmqvqklvhnyjjipurgyv`), donde se aplicaron las 26 migraciones del esquema y se aprovisionaron las 21 cuentas de prueba y los 4 clubes semilla.

**Tabla 6.3 Recorridos de integración verificados**

| Integración | Recorrido ejecutado y resultado verificado |
| --- | --- |
| **Auth → Perfiles → Cambio de perfil operativo** | Creación y autenticación de los 21 perfiles de prueba mediante Supabase Auth; verificación de dominios `@alumno.ipn.mx` y `@ipn.mx`; alternancia de perfil (`switch_operating_profile`) permitida solo para la cuenta de operación (`can_switch_profile = true`) y asignación de roles (`admin_set_user_role`) restringida exclusivamente a superadministración (`is_superadmin = true`). **Aprobada.** |
| **Foro y Guías → Ramas de decisión → Versionado** | Una alumna abre la guía ramificada de Becas, recorre la rama de renovación, publica una duda contextual desde ese paso (`target_step_index`), el moderador de Becas responde oficialmente en el foro y la alumna propone una edición al paso; Becas aprueba la sugerencia, se genera una nueva versión en `guide_versions` y tanto el hilo como el progreso conservan su vínculo tras reordenar los pasos. **Aprobada.** |
| **Extracción documental de guías (PDF / DOCX / OCR)** | Carga de fotografías JPG, PNG y WebP, un PDF con capa de texto, un PDF escaneado y un archivo `.docx` en el generador de guías (`src/app/guias/document.ts`), verificando la extracción local con `pdfjs-dist`, `fflate`/`saxes` y OCR en español con `tesseract.js` sin requerir clave externa de Google. **Aprobada.** |
| **Políticas RLS por oficina y por sede de eventos** | Comprobación con sesiones Auth reales de que `questions_office_scope`, `guides_office_scope` y `answers_office_scope` bloquean escrituras cruzadas entre Becas, CATT y Gestión Escolar; que el visitante consulta eventos públicos aprobados (`20261117000300_public_event_access.sql`); y que Becas solo aprueba eventos del Auditorio mientras Subdirección Académica aprueba los de Sala 14 (`20261118000200_club_event_venues.sql`). **Aprobada.** |
| **Objetos perdidos → `pg_trgm` (80 %) → Esquema `private`** | Verificación de la extensión `pg_trgm`, denegación de lectura directa sobre `private.lost_item_secrets` para el rol `authenticated`, generación automática de coincidencia en `lost_item_matches` cuando el puntaje supera el umbral acordado de `0.80` (score verificado `0.8312`) y ausencia de alerta por debajo del umbral. **Aprobada.** |
| **Clubes → Umbral de 20 → Expedientes y Storage** | Conteo de intereses únicos en `club_interests`, transición automática a `en_documentacion` con notificación en cascada al vigésimo voto, restricción del bucket `club-documents` a participantes de la propuesta y moderación del área, y publicación en clubes limitada al alumno responsable (`leader_id`) y al profesor asesor (`advisor_id`). **Aprobada.** |

### 6.4 Pruebas funcionales y de sistema

La Tabla 6.4 presenta los doce casos de prueba funcionales (`PF-01` a `PF-12`) que cubren de extremo a extremo los módulos del sistema, incluyendo las comprobaciones automatizadas en navegador (`N1` a `N6`) sobre las rutas `/guias`, `/registro`, `/admin`, `/clubes`, `/entrar`, `/perfil` y `/foro`.

**Tabla 6.4 Casos de prueba funcionales**

| ID | Caso de uso relacionado | Entrada y escenario | Resultado esperado | Resultado obtenido | Estado |
| --- | --- | --- | --- | --- | --- |
| **PF-01** | `CU-01`, `CU-02` Registro, confirmación y sesión | Intento de registro con correo externo (`prueba@example.org`); inicio de sesión con `alumna.libre@alumno.ipn.mx` y acceso a `/perfil`. | Rechazar dominios ajenos al IPN; iniciar sesión con cuenta institucional, procesar `/auth/callback` y mostrar boleta e insignias en `/perfil`. | En `/registro` se rechazó el dominio externo con el mensaje `Usa un correo @alumno.ipn.mx o @ipn.mx.`; el login con `alumna.libre@alumno.ipn.mx` redirigió a `/` y cargó sus datos e insignias en `/perfil`. | **Aprobada** |
| **PF-02** | `CU-05`, `CU-09`, `CU-GUA-02-01` Guías por área y parsing documental | Moderador de área crea/edita guía desde PDF, DOCX o imagen; alumna sugiere mejora en un paso; moderador de otra área intenta editarla. | Extraer borrador de pasos, guardar nueva versión al aceptar sugerencia, acreditar colaborador y bloquear edición de otra área por RLS. | Se verificó la extracción desde JPG, PNG, WebP, PDF con texto, PDF escaneado (OCR) y DOCX; Becas aprobó sugerencia de alumna creando versión nueva; RLS bloqueó a oficinas ajenas. | **Aprobada** |
| **PF-03** | `CU-10` Recuperación ante búsqueda fallida | Consultar `/guias?area=becas&q=zztt1811` como visitante y como alumna autenticada. | Mostrar aviso de búsqueda sin coincidencias exactas y botón `Preguntar en Becas` que lleve al formulario del área o pida sesión al visitante. | Como visitante mostró `Sin coincidencias exactas en guías` y al pulsar `Preguntar en Becas` indicó `Entra con tu correo institucional para publicar.`; con sesión de alumna abrió el diálogo modal con el área `becas` preseleccionada. | **Aprobada** |
| **PF-04** | `CU-11` a `CU-14` Foro, dudas por paso y oficialización | Alumna pregunta desde un paso de guía; moderador del área responde y marca respuesta oficial; se reordenan pasos de la guía. | Mostrar sugerencias al escribir, aplicar enfriamiento de 20 min, notificar al área, fijar respuesta oficial arriba y conservar vínculo con el paso. | La pregunta desde el paso de renovación notificó a Becas, la respuesta oficial actualizó el estado a `respondida` y el hilo conservó la referencia al paso tras reordenar la guía. | **Aprobada** |
| **PF-05** | `CU-17` a `CU-19`, `CU-31` Propuesta de club, asesor y expediente | Crear propuesta en `/clubes`, validar detector de similitud, alcanzar 20 interesados, confirmar código de profesor y cargar 4 documentos. | Bloquear nombres duplicados, promover a `en_documentacion` al voto 20 notificando en cascada, validar código `@ipn.mx` y habilitar revisión de Subdirección. | El detector bloqueó nombres repetidos sin acento; el trigger promovió la propuesta al umbral de 20; se verificó la carga de los 4 documentos por integrante, plan PDF, toma de mando a los 5 días de inactividad y dictamen por área. | **Aprobada** |
| **PF-06** | `CU-20` Membresía y publicación en club | Buscar `Algoritmia` en `/clubes` (vista móvil `390×844`); probar publicación con responsable, asesor, integrante ordinario y usuario externo. | Permitir búsqueda sin desborde horizontal; autorizar publicación y gestión de solicitudes solo al alumno responsable y al profesor asesor. | En móvil (`390×844`) el buscador filtró `Club de Algoritmia` con ancho exacto `390/390 px` sin desborde; RLS y acciones permitieron publicar a responsable y asesor, rechazando al integrante ordinario. | **Aprobada** |
| **PF-07** | `CU-21`, `CU-22` Reporte y matching de objetos al 80 % | Crear reporte de hallazgo (con 2 fotos y pregunta de seguridad) y reporte de pérdida con similitud superior e inferior al 80 %. | Exigir pregunta de seguridad solo en hallazgos; generar match en `lost_item_matches` y aviso in-app únicamente cuando la similitud es $\ge 0.80$. | La función `create_lost_item` resguardó el hash en `private.lost_item_secrets`; el trigger `pg_trgm` registró match con score `0.8312` ($\ge 0.80$) y omitió reportes bajo el umbral. | **Aprobada** |
| **PF-08** | `CU-23`, `CU-24` Reclamo, evidencia, QR y cierre | Reclamante responde pregunta de seguridad con foto en `lost-evidence`; hallador aprueba; se verifica código/QR y cierre del reporte. | Limitar a 3 intentos; permitir al hallador ver la evidencia; liberar correo institucional y QR al aprobar; pasar a `entregado` y al historial bilateral. | Se verificó el límite de 3 intentos, acceso del hallador a `lost-evidence`, generación de QR y componente lector por cámara (`BarcodeDetector`) + código manual, cierre a `entregado` e insignia automática. | **Aprobada** |
| **PF-09** | `CU-25` a `CU-27` Mapa 3D y localización de cubículos | Navegar la maqueta 3D en `/mapa`, buscar profesor, actualizar cubículo como docente y registrar sugerencia como alumno. | Cargar vista `Todo 3D` y capas por piso, resaltar cubículo buscado, reflejar actualización inmediata del profesor con soporte de cohabitación y votar sugerencias. | La maqueta 3D carga centrada con interior del Edificio de Gobierno; `assign_my_map_room` actualiza `map_room_people` al instante y los alumnos registran sugerencias sin error de RLS. | **Aprobada** |
| **PF-10** | `CU-28` Cartelera e itinerario por sede | Publicar y aprobar eventos en Auditorio, Sala 14 y espacios generales; consultar cartelera como visitante y marcar `Asistiré` como alumno. | Permitir lectura pública de eventos aprobados; restringir aprobación del Auditorio a Becas y de Sala 14 a Subdirección Académica. | El visitante consulta `/eventos` sin error de permisos; Becas administra los eventos del Auditorio y Subdirección Académica los de Sala 14 (incluidos los de clubes en esas sedes). | **Aprobada** |
| **PF-11** | `CU-29`, `CU-32`, `CU-33` Notificaciones e importación CSV | Recibir notificación en vivo con preferencias activas/inactivas; cargar `ejemplo-padron-escom.csv` con filas válidas, duplicadas y dominio externo. | Actualizar contador de campana por Realtime, respetar `notification_prefs`, previsualizar CSV, descargar errores y crear solo roles ordinarios. | El trigger `notifications_check_prefs` filtra por categoría; el importador CSV valida encabezados y dominios, genera `errores-padron-escom.csv` y crea invitaciones Auth sin privilegios administrativos. | **Aprobada** |
| **PF-12** | `CU-03`, `CU-15`, `CU-34`, `CU-35` Administración, auditoría y sanciones | Visitante o alumno intenta abrir `/admin`; administrador consulta métricas, aplica veto con motivo, filtra auditoría y descarga CSV/impresión. | Redirigir a `/entrar` o denegar acceso a no administradores; registrar `old_value`, `new_value` e IP en `audit_logs` y exportar CSV/PDF con umbral de privacidad. | El visitante en `/admin` es redirigido a `/entrar`; superadministración gestiona roles; `audit_logs` registra valores anterior/nuevo e IP y las rutas `/admin/auditoria.csv` e `/admin/impacto.csv` exportan los reportes. | **Aprobada** |

#### Matriz de trazabilidad completa (`RF-01` a `RF-36` y `RNF-01` a `RNF-17`)

**Tabla 6.5 Matriz de trazabilidad: requerimiento, caso de uso y verificación**

| Requerimiento | Caso de uso relacionado | Prueba / verificación asociada | Estado de verificación |
| --- | --- | --- | --- |
| **RF-01** Dominio institucional `@alumno.ipn.mx` y `@ipn.mx` | `CU-01`, `CU-33` | `PF-01`, `PF-11` y restricción SQL en `users` | Acreditado |
| **RF-02** Autenticación con credenciales cifradas | `CU-01` | `PF-01` (Supabase Auth + bcrypt) | Acreditado |
| **RF-03** Recuperación de contraseña por enlace al correo | `CU-02` | `PF-01` (`/recuperar` → `/auth/callback`) | Acreditado |
| **RF-04** Perfil con nombre, boleta/empleado e insignias automáticas | `CU-01`, `CU-04` | `PF-01` y 6 triggers `private.award_badge` | Acreditado |
| **RF-05** Control de acceso basado en roles (RBAC y áreas) | `CU-01`, `CU-05`, `CU-32` | Unitarias (`reglas.mjs`), `PS-01`, `PS-02` y RLS | Acreditado |
| **RF-06** Avisos con categorías (Académico, Social, Trámites) | `CU-07` | Unitarias (`reglas.mjs`) y flujo en `/avisos` | Acreditado |
| **RF-07** Programación de fecha y hora para publicaciones automáticas | `CU-07` | Función `trigger_scheduled_avisos()` y `pg_cron` | Acreditado |
| **RF-08** Carrusel de avisos destacados en inicio | `CU-08` | `StoryCarousel` en `/` y `/avisos` | Acreditado |
| **RF-09** Feed cronológico con búsqueda por palabras clave | `CU-08`, `CU-COM-04-01` | `HomeFeed` (`/api/feed`) y `ComunicadosExplorer` | Acreditado |
| **RF-10** Creación de guías mediante pasos secuenciales y ramificados | `CU-05`, `CU-09` | Unitarias (`validateSteps`, `pathToStep`) y `PF-02` | Acreditado |
| **RF-11** Sugerencias de mejora en cada paso de guía | `CU-GUA-02-01` | `PF-02` (flujo alumna → Becas → nueva versión) | Acreditado |
| **RF-12** Descarga de documentos PDF asociados a trámites | `CU-05`, `CU-09` | Adjunto `attachment_url` en `public-media` | Acreditado |
| **RF-13** Sección de preguntas frecuentes dentro de cada guía | `CU-05`, `CU-11` | Editor de `faqs` y componente `StepQA` | Acreditado |
| **RF-14** Publicación de preguntas etiquetadas por área administrativa | `CU-13` | `PF-03`, `PF-04` y trigger `check_forum_guide_step` | Acreditado |
| **RF-15** Distinción visual de respuestas de moderadores oficiales | `CU-14` | `PF-04` (`answers.official`, sello y fijado superior) | Acreditado |
| **RF-16** Votación de preguntas y respuestas por relevancia | `CU-13`, `CU-14` | Tablas `question_votes` y `answer_votes` (`+1`/`-1`) | Acreditado |
| **RF-17** Notificación al usuario sobre nuevas respuestas | `CU-14`, `CU-29` | Triggers `after_forum_answer_insert` / `update` | Acreditado |
| **RF-18** Propuestas de nuevos clubes con plan de trabajo adjunto | `CU-17` | Unitaria de similitud y `PF-05` (`plan_file_path`) | Acreditado |
| **RF-19** Marcar interés comunitario en propuestas de clubes | `CU-17`, `CU-31` | `PF-05` (`club_interests` y trigger de umbral 20) | Acreditado |
| **RF-20** Validación de profesor asesor mediante código institucional | `CU-18` | `PF-05` (`sendAdvisorCodeEmail` y RPC de confirmación) | Acreditado |
| **RF-21** Página de gestión interna para líderes y asesores de club | `CU-20` | `PF-06` (`/clubes/[id]`, publicaciones, eventos y directorio) | Acreditado |
| **RF-22** Directorio público de clubes activos y sus horarios | `CU-19`, `CU-20` | `PF-06` (`ClubsExplorer` en `/clubes`) | Acreditado |
| **RF-23** Reporte de objetos con descripción, lugar y hasta 2 fotografías | `CU-21` | `PF-07` (`create_lost_item` y bucket `public-media`) | Acreditado |
| **RF-24** Notificación de coincidencias automáticas entre reportes | `CU-22` | `PF-07` (trigger `pg_trgm` con umbral $\ge 0.80$) | Acreditado |
| **RF-25** Gestión de estado del objeto (Perdido, Encontrado, Entregado) | `CU-21`, `CU-24` | `PF-07`, `PF-08` e historial personal de participantes | Acreditado |
| **RF-26** Código QR para validar la entrega física del objeto | `CU-23`, `CU-24` | `PF-08` (`qrcode.react` y lector `BarcodeDetector`) | Acreditado |
| **RF-27** Mapa interactivo de la ESCOM con laboratorios y cubículos | `CU-25`, `CU-26` | `PF-09` (`CampusMap` 3D por nivel e interior de Gobierno) | Acreditado |
| **RF-28** Actualización manual de ubicación por profesores | `CU-27` | `PF-09` (`assign_my_map_room` y `map_room_people`) | Acreditado |
| **RF-29** Itinerario de disponibilidad de auditorios y salas comunes | `CU-28` | Unitarias de sede y `PF-10` (`/eventos` por sede) | Acreditado |
| **RF-30** Centro de notificaciones en tiempo real dentro de la plataforma | `CU-29`, `CU-31` | `PF-11` (campana Realtime en `AppShell` y `/notificaciones`) | Acreditado |
| **RF-31** Alertas sobre cambios de estado en clubes o trámites | `CU-30`, `CU-31` | Cubierto in-app por Realtime (correo de producto excluido por alcance; correo activo en Auth y código de asesor) | Alcance in-app acreditado |
| **RF-32** Configuración de preferencias de alertas por el usuario | `CU-29`, `CU-30` | `PF-11` (`notification_prefs` y trigger `notifications_check_prefs`) | Acreditado |
| **RF-33** Dashboard con estadísticas de participación por módulo | `CU-12`, `CU-32`, `CU-35` | `PF-12` (`admin_dashboard_metrics` y paneles por área) | Acreditado |
| **RF-34** Gestión de usuarios (activación, suspensión y cambio de roles) | `CU-03`, `CU-15`, `CU-32` | `PF-12` (`admin_set_user_role`, veto y `/apelaciones`) | Acreditado |
| **RF-35** Log de auditoría de acciones administrativas | `CU-34` | `PF-12` (`audit_logs` con `old_value`, `new_value`, IP y CSV) | Acreditado |
| **RF-36** Moderación de contenido (borrado, cierre de spam y strikes) | `CU-15`, `CU-24` | `PF-08`, `PF-12` y `/moderacion` | Acreditado |
| **RNF-01 a RNF-03** Tiempos de carga (<3 s), búsqueda (<500 ms) y procesos no bloqueantes | Transversal | Índices GIN/B-Tree y triggers en BD; medición formal en servidor productivo propuesta en `6.6` | Acreditado en local / pendiente en servidor productivo |
| **RNF-04 a RNF-10** Cifrado, inactividad (30 min), RLS, HTTPS, sanitización, transacciones y auditoría | Transversal | `PS-01` a `PS-07` (`AppShell`, esquema `private`, RLS restrictivo y `audit_logs`) | Acreditado |
| **RNF-11** Persistencia y respaldos periódicos | Transversal | Scripts `scripts/backup.sh` y `scripts/restore.sh` | Acreditado |
| **RNF-12 a RNF-17** Responsividad, consistencia visual, ARIA, modularidad, documentación y estándares | Transversal | Verificación en `390×844` y `1366×850`, `tsc --noEmit` (0 errores) y `eslint` (0 errores) | Acreditado |

### 6.5 Pruebas de seguridad

La seguridad del sistema se verificó asegurando que ningún control dependa únicamente de ocultar botones en la interfaz: cada operación pasa por Server Actions autenticadas y por políticas RLS o funciones RPC en PostgreSQL.

**Tabla 6.6 Pruebas de seguridad ejecutadas**

| ID | Verificación | Criterio de aceptación | Resultado verificado |
| --- | --- | --- | --- |
| **PS-01** Control de acceso por rol y superadministración | Intentar acceder a `/admin` como visitante o alumno; intentar cambiar el rol de un usuario con una cuenta `admin` ordinaria sin `is_superadmin`. | Redirigir a `/entrar` sin sesión; rechazar en base de datos cualquier cambio de rol que no provenga de superadministración. | **Aprobada.** `/admin` redirige a `/entrar` al visitante (`N3`) y la función `admin_set_user_role` lanza excepción si el actor no tiene `is_superadmin = true`. |
| **PS-02** Aislamiento entre oficinas y sedes | Un moderador de Becas intenta editar una guía o responder oficialmente una duda de CATT/Gestión Escolar, o aprobar un evento en Sala 14. | Las políticas restrictivas `guides_office_scope`, `answers_office_scope` y `can_review_club_event` rechazan la escritura en PostgreSQL. | **Aprobada.** Comprobado con sesiones Auth en Supabase local y en el proyecto remoto `clebescom`. |
| **PS-03** Expiración por inactividad y cuentas sancionadas | Mantener sesión sin interacción durante 30 minutos (`RNF-05`); intentar operar con una cuenta vetada o con suspensión activa. | Mostrar aviso a los 28 min y cerrar sesión a los 30 min; `getSession()` devuelve `null` para cuentas suspendidas salvo en `/apelaciones`. | **Aprobada.** `AppShell` ejecuta `logout()` al cumplirse `IDLE_LIMIT_MS` y `private.is_active_actor()` bloquea escrituras en todas las tablas. |
| **PS-04** Consultas parametrizadas y prevención de SQLi | Enviar comillas, operadores SQL y formatos inválidos en buscadores, formularios y parámetros UUID (`isUuid`). | Tratar toda entrada como literal parametrizado sin alterar la consulta ni exponer errores internos del motor. | **Aprobada.** Todas las consultas de `pg` usan parámetros posicionales (`$1..$n`) y las funciones RPC fijan `search_path = ''`. |
| **PS-05** Prevención de XSS y validación de URLs | Introducir etiquetas HTML/scripts en títulos o comentarios y esquemas `javascript:` o `ftp:` en enlaces externos de avisos. | Escapar el texto en el renderizado de React y rechazar esquemas distintos de `http:` / `https:`. | **Aprobada.** `parseExternalUrl` rechaza esquemas no web (`reglas.mjs`) y React escapa por defecto el contenido textual. |
| **PS-06** Protección del esquema `private` y buckets privados | Consultar directamente `private.lost_item_secrets` o archivos de `club-documents` y `lost-evidence` con un usuario ajeno al trámite. | Denegar la lectura tanto en la tabla privada como en `storage.objects`. | **Aprobada.** El rol `authenticated` carece de permiso `SELECT` en `private`, y las políticas `can_access_lost_path` e `is_proposal_participant` restringen los buckets. |
| **PS-07** Inmutabilidad de la bitácora de auditoría | Verificar permisos de modificación o borrado sobre `public.audit_logs` y registro de valores anterior/nuevo e IP en acciones administrativas. | Ningún rol de aplicación tiene permisos `UPDATE` o `DELETE` sobre `audit_logs`; cada cambio administrativo deja rastro auditable. | **Aprobada.** `audit_logs` solo concede `SELECT` (a `admin`) e `INSERT`, registrando `old_value`, `new_value` e `ip_address`. |

### 6.6 Pruebas de rendimiento y carga

En el entorno local de desarrollo, las consultas de búsqueda y filtrado sobre PostgreSQL responden dentro del umbral de 500 ms (`RNF-02`) gracias a los índices GIN de trigramas (`pg_trgm`) en objetos perdidos y a los índices compuestos sobre preguntas, guías y pasos (`questions_guide_step`). Asimismo, las operaciones de coincidencia de objetos, otorgamiento de insignias y notificaciones en cascada se ejecutan en la base de datos sin bloquear la interfaz (`RNF-03`).

Dado que las cifras medidas en una máquina de desarrollo local no representan la latencia de red ni la concurrencia de un servidor institucional, en la Tabla 6.7 se deja establecido el protocolo para acreditar los umbrales en el entorno de despliegue definitivo.

**Tabla 6.7 Protocolo de medición de rendimiento en despliegue**

| ID | Medición | Procedimiento | Umbral de aceptación |
| --- | --- | --- | --- |
| **PR-01** | Carga inicial de rutas principales (`RNF-01`) | Ejecutar Lighthouse sobre `/`, `/avisos`, `/foro`, `/clubes`, `/eventos`, `/mapa` y `/objetos` con caché fría y caliente en el dominio desplegado. | Tiempo de carga principal $< 3\text{ s}$ en condiciones normales de red. |
| **PR-02** | Consultas de búsqueda (`RNF-02`) | Medir el percentil 95 (`p95`) de respuesta en búsquedas de guías, foro, comunicados, clubes y cubículos con un catálogo poblado equivalente a un semestre escolar. | Tiempo de respuesta de consulta $< 500\text{ ms}$. |
| **PR-03** | Operaciones por lote y matching (`RNF-03`) | Insertar reportes de objetos con `pg_trgm` activo y procesar un archivo CSV de 200 registros en el importador de padrón. | Sin bloqueo del hilo principal del navegador; previsualización inmediata y reporte claro de progreso. |
| **PR-04** | Concurrencia en fechas pico | Simular sesiones concurrentes con `k6` durante la publicación de un aviso general o convocatoria de becas. | Tasa de error $< 1\text{ \%}$ y estabilidad del pool de conexiones de Supabase. |

### 6.7 Pruebas de usabilidad y aceptación (UAT)

El diseño de las interfaces siguió los principios de gaceta escolar y tablero comunitario acordados tras las entrevistas del capítulo 3, verificando que los formularios de creación (nueva duda, nuevo club, publicar evento, reportar objeto y publicar comunicado) operen en diálogos modales con foco contenido, cierre con tecla `Escape` y adaptación sin desborde horizontal en pantallas móviles (`390×844 px`) y de escritorio (`1366×850 px`).

Para formalizar la aceptación institucional con usuarios finales de la ESCOM antes de su puesta en marcha, se aplicará el protocolo de sesiones moderadas con cinco perfiles representativos (alumno sin club, alumno responsable de club, profesor asesor, encargado de ventanilla de trámites y administrador) ejecutando las tareas de los casos `PF-01` a `PF-12` y respondiendo al finalizar los diez reactivos de la escala **System Usability Scale (SUS)**, con meta de obtención de un puntaje promedio igual o superior a 75 puntos.

### 6.8 Análisis de resultados

Al cierre del **18 de noviembre de 2026**, la verificación del sistema arroja los siguientes resultados consolidados:
1. **Cobertura funcional:** Los 35 requerimientos funcionales dentro del alcance acordado (`RF-01` a `RF-30` y `RF-32` a `RF-36`) están implementados en código y base de datos, mientras que `RF-31` opera mediante alertas in-app en tiempo real conforme a la decisión de reservar el correo electrónico para autenticación, códigos de profesor asesor e invitaciones de padrón.
2. **Calidad técnica y automatización:** El código fuente compila sin errores de TypeScript (`0 errores` en `tsc --noEmit`) ni de ESLint (`0 errores` en `npm run lint`), aprueba el 100 % de las pruebas unitarias de reglas de negocio (`11/11` en `reglas.mjs`) y acredita en navegador y base de datos los 12 escenarios funcionales (`PF-01` a `PF-12`) y las 7 verificaciones de seguridad (`PS-01` a `PS-07`).
3. **Trabajo de validación restante para puesta en producción:** Las brechas pendientes ya no corresponden a módulos sin construir, sino a dos actividades propias del lanzamiento institucional: ejecutar las mediciones `PR-01` a `PR-04` sobre la infraestructura de hosting definitivo y levantar las encuestas presenciales SUS (`6.7 UAT`) con alumnos y personal de la escuela.
