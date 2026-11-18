# Capítulos 7 y 8 (Actualizados al 18 de noviembre de 2026, incluye Sección 7.6 faltante y Referencia [17])

> **Nota para pegar en Word:** Este archivo actualiza los capítulos 7 y 8 del Word (`TT (1).docx`), incorpora la **sección 7.6 (Documentación de operación y manuales por rol)** que estaba citada al final de `7.5` pero faltaba en el documento, actualiza el conteo real de **21 cuentas semilla**, documenta los scripts `scripts/backup.sh` y `scripts/restore.sh` y la sincronización con el proyecto remoto de Supabase (`clebescom`), y añade la referencia `[17]` de Boehm (1988).

---

## Capítulo 7. Despliegue y puesta en producción

### 7.1 Arquitectura de despliegue (entornos: desarrollo, pruebas y producción)

La plataforma de gestión de actividades de la ESCOM se construyó con Next.js 16 (interfaz y lógica de servidor mediante Server Components y Server Actions) y Supabase (autenticación, PostgreSQL 17 con RLS, almacenamiento de archivos en cuatro buckets y suscripciones en tiempo real). Al cierre del Trabajo Terminal se cuenta tanto con el entorno local completo de demostración como con el esquema sincronizado y verificado en un proyecto remoto de Supabase (`clebescom`), listo para vincularse con Vercel o con un servidor institucional.

**Entorno de desarrollo y demostración local.** Cada equipo ejecuta Docker Desktop (contenedores de Supabase local), Node.js 22.13 o superior, Supabase CLI y la aplicación Next.js. Los servicios locales incluyen la pasarela de API y Auth (`54321`), PostgreSQL (`54322`), Supabase Studio (`54323`), Mailpit para inspección de correos transaccionales (`54324`) y las 26 migraciones versionadas en `supabase/migrations/`. Las variables sensibles se almacenan en `.env.local` (generado automáticamente con `npm run env:local` más la clave opcional `GOOGLE_GENERATIVE_AI_API_KEY`); ningún secreto se incluye en el control de versiones.

**Entorno remoto de pruebas / preproducción (`clebescom`).** Se aprovisionó el proyecto remoto de Supabase `clebescom` (`qmqvqklvhnyjjipurgyv`), en el cual se aplicó la secuencia completa de migraciones SQL, los cuatro buckets de Storage (`public-media`, `club-documents`, `lost-evidence` y `guide-files`), las políticas RLS por oficina y sede, y los 21 perfiles de prueba con los 4 clubes semilla. La configuración de `next.config.ts`, `src/lib/db.ts` y `src/lib/mailer.ts` permite desplegar el frontend en Vercel apuntando a dicha instancia mediante variables de entorno.

**Entorno de producción institucional (objetivo).** Misma arquitectura lógica: frontend en Vercel o contenedor Node.js detrás de un proxy inverso institucional con HTTPS obligatorio (`RNF-07`), conectado a una instancia dedicada de Supabase sin datos semilla de demostración y con un servicio SMTP institucional del IPN para el envío de enlaces de confirmación, recuperación de contraseña, códigos de profesor asesor e invitaciones del padrón CSV.

### 7.2 Proceso de despliegue y CI/CD

**Arranque y despliegue local reproducible.** El repositorio incluye scripts automatizados para levantar o reconstruir la plataforma en un solo flujo:
1. Iniciar Docker Desktop.
2. Ejecutar `node scripts/iniciar.mjs` (o paso a paso: `npm run db:up`, `npm run db:reset` para aplicar las 26 migraciones, `npm run env:local` para sincronizar claves locales, `npm run db:seed` para poblar las 21 cuentas y datos iniciales, y `npm run dev`).
3. Verificar la recepción de correos locales (confirmación, recuperación, código de asesor e invitaciones CSV) en Mailpit (`http://127.0.0.1:54324`).
4. Validar tipos, estilo y reglas de negocio con `npx tsc --noEmit`, `npm run lint` y `node --test entrega-tt-2026-11-18/evidencia/reglas.mjs`, además de comprobar el empaquetado productivo con `npm run build`.

**Flujo de integración y despliegue continuo (CI/CD) hacia Vercel / producción.**
1. En cada confirmación o *pull request*: instalar dependencias (`npm ci`), ejecutar `npm run lint`, `npx tsc --noEmit`, las pruebas unitarias (`node --test`) y `npm run build`.
2. Al fusionar en la rama principal: aplicar nuevas migraciones sobre la base remota (`npx supabase db push`) y desplegar la compilación de Next.js en Vercel con las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` y `GOOGLE_GENERATIVE_AI_API_KEY`.

### 7.3 Migración y carga inicial de datos

**Migraciones de esquema.** El modelo de datos (`public` y `private`), las políticas RLS, los cuatro buckets de Storage, los triggers de insignias, el matching `pg_trgm` con umbral de 0.80 y las funciones RPC viven en 26 archivos SQL numerados cronológicamente en `supabase/migrations/`.

**Datos semilla de demostración (`scripts/seed.mjs`).** El script `npm run db:seed` aprovisiona **21 cuentas institucionales de prueba** (con la contraseña de demostración `Escom2026!`) que cubren la totalidad de los actores del sistema:
- Superadministración (`admin@ipn.mx`) y cuenta de operación con cambio dinámico de perfil entre administrador, profesor y alumno (`operacion@ipn.mx`).
- Moderadores de las ocho áreas institucionales: Gestión Escolar, Becas, CATT, Comunicación Social, Subdirección Académica (Sala 14), Clubes Académicos, Clubes Culturales y Deportivos, y Prefectura.
- Cuatro clubes activos (Algoritmia, Robótica, Ciberseguridad y Teatro/Cultura) con parejas distintas de alumno responsable (`leader_id`) y profesor asesor (`advisor_id`), cuentas de alumnos integrantes y una cuenta de alumna sin club (`alumna.libre@alumno.ipn.mx`), además de comunicados, 6 guías ramificadas, dudas del foro con respuestas oficiales, eventos en cartelera, objetos perdidos y espacios del mapa 3D.

**Importación masiva de padrones (`CU-33`).** Para la carga real de la comunidad escolar sin usar cuentas semilla, el administrador general utiliza el importador CSV en `/admin` (`src/app/admin/roster-import.tsx`). El sistema exige las columnas `nombre` y `correo`, admite lotes de hasta 200 filas (2 MB), valida dominios `@alumno.ipn.mx` e `@ipn.mx`, detecta duplicados, permite descargar `errores-padron-escom.csv` y emite las invitaciones en Supabase Auth asignando exclusivamente el rol ordinario derivado del dominio (`alumno` o `profesor`).

### 7.4 Respaldo y recuperación

Para cumplir con el requerimiento de persistencia y respaldo (`RNF-11`), el repositorio incorpora dos scripts operativos en la carpeta `scripts/`:
- **Generación de respaldo (`bash scripts/backup.sh`):** carga la cadena de conexión desde `.env.local` (o usa la instancia local en el puerto `54322`) y genera un volcado SQL completo con marca de tiempo en `backups/escom-backup-YYYYMMDD-HHMMSS.sql` utilizando `pg_dump --clean --if-exists --no-owner --no-privileges` (o `npx supabase db dump` como alternativa).
- **Restauración (`bash scripts/restore.sh backups/escom-backup-YYYYMMDD-HHMMSS.sql`):** verifica la existencia del archivo de respaldo y restaura el estado de la base de datos mediante `psql`.

En el entorno remoto de Supabase, estos scripts se complementan con las copias de seguridad diarias automatizadas del proveedor de base de datos y la replicación de los buckets de Storage.

### 7.5 Monitoreo y mantenimiento

**Monitoreo funcional y auditoría.** Todas las operaciones administrativas y de moderación (cambios de rol, vetos, resolución de apelaciones, alta o cierre de clubes, publicación de comunicados, cierre de reportes de objetos e importación de padrones) quedan registradas de forma inmutable en `public.audit_logs` con identificador de actor, acción, entidad afectada, valor anterior (`old_value`), valor nuevo (`new_value`), dirección IP (`ip_address`) y marca de tiempo, consultables y exportables a CSV e impresión desde `/admin` (`CU-34`). Asimismo, el módulo `/avisos` registra aperturas y clics en enlaces externos (`aviso_interactions`), y `/foro` junto con `/admin` contabilizan vistas, progreso por paso y abandono en guías (`CU-12`, `CU-35`).

**Mantenimiento técnico y parametrización.** Los parámetros operativos clave —como el umbral de votos para promover una propuesta de club (`club_interest_threshold = 20`), los días de inactividad antes de permitir que otro interesado retome una propuesta (`club_claim_inactivity_days = 5`) y los minutos de enfriamiento entre preguntas del foro (`forum_cooldown_minutes = 20`)— se almacenan en la tabla `public.system_settings` y pueden ajustarse desde `/admin` sin modificar ni redesplegar el código fuente.

### 7.6 Documentación de operación y manuales por rol

Para facilitar la adopción por la comunidad de la ESCOM y la transferencia operativa al personal de las áreas administrativas, la operación de la plataforma se divide en cinco guías rápidas por perfil de usuario:

1. **Guía para Alumnos y Visitantes (`/`, `/avisos`, `/foro`, `/clubes`, `/eventos`, `/mapa`, `/objetos`):**
   - *Sin iniciar sesión:* consulta libre de la portada, comunicados públicos, cartelera de eventos aprobados, directorio de clubes, catálogo de guías paso a paso y maqueta 3D del campus con buscador de cubículos.
   - *Con cuenta `@alumno.ipn.mx`:* confirmación de asistencia (`Asistiré`) a eventos, avance guardado en cada paso de guía, publicación de dudas o sugerencias de mejora por paso, votación e impulso de propuestas de clubes (con carga de los 4 documentos del expediente individual en propuestas con 20+ votos), solicitud de ingreso a clubes activos, reporte y reclamo de objetos perdidos mediante pregunta de seguridad y escaneo de QR, y descarga de datos personales o ejercicio de derechos ARCO desde `/perfil`.
2. **Guía para Profesores (`/mapa`, `/clubes`, `/foro`):**
   - *Con cuenta `@ipn.mx`:* autogestión inmediata de su cubículo en `/mapa` (seleccionando piso y espacio en la maqueta 3D, con soporte de cohabitación si comparte oficina), orientación comunitaria en el foro de dudas, confirmación de participación como profesor asesor de una propuesta de club ingresando el código recibido por correo electrónico (`CU-18`) y cogestión de los clubes a su cargo en `/clubes/[id]`.
3. **Guía para Oficinas de Trámites: Gestión Escolar, Becas y CATT (`/foro` y `/eventos`):**
   - Al iniciar sesión, la plataforma dirige automáticamente al personal a su módulo de trabajo.
   - En `/foro`, cada oficina gestiona exclusivamente las guías y dudas de su área: puede crear guías nuevas subiendo un instructivo en PDF, Word (`.docx`) o fotografía para que el sistema extraiga el borrador de pasos ramificados, adjuntar el PDF descargable del trámite, revisar sugerencias de alumnos (generando nuevas versiones), fijar dudas frecuentes y emitir o validar respuestas oficiales.
   - Adicionalmente, el área de **Becas** administra en `/eventos` la publicación y aprobación de actividades programadas en el **Auditorio**.
4. **Guía para Subdirección Académica, Servicios Estudiantiles (Clubes) y Comunicación (`/clubes`, `/eventos`, `/avisos`):**
   - **Comunicación Social (`/avisos`):** redacta comunicados oficiales, utiliza el generador inteligente para obtener los textos de plataforma, Twitter/X y Facebook, programa publicaciones futuras (`publish_at`) y consulta las métricas de alcance y clics.
   - **Subdirección Académica (`/clubes` y `/eventos`):** revisa las propuestas de clubes académicos que cumplieron los 20 interesados, el código del profesor asesor y los expedientes documentales; agenda la cita de validación, dictamina la aprobación o correcciones, da de alta directa clubes reconocidos y administra los eventos de la **Sala 14**.
   - **Clubes Culturales y Deportivos (`/clubes` y `/eventos`):** realiza el mismo proceso de revisión, alta directa y seguimiento de indicadores para las agrupaciones culturales y deportivas y sus eventos en espacios comunes.
5. **Guía para Administración General y Superadministración (`/admin`, `/moderacion`, `/apelaciones`):**
   - Supervisión de indicadores globales del plantel, asignación de roles y áreas institucionales (exclusivo de superadministración), importación de lotes de padrón mediante archivo CSV con descarga de incidencias, ajuste de parámetros en `system_settings`, revisión y resolución de apelaciones de usuarios sancionados, exportación de reportes de auditoría e impacto académico en CSV/PDF y ejecución de respaldos con `scripts/backup.sh`.

---

## Capítulo 8. Resultados, conclusiones y trabajo a futuro

### 8.1 Resultados obtenidos

El objetivo general del Trabajo Terminal 2026-B155 consistió en desarrollar una plataforma web integral para la ESCOM que centralizara la información institucional, la gestión de actividades estudiantiles y la orientación administrativa mediante la automatización de procesos y la colaboración de las unidades académicas y administrativas.

**Resultados alcanzados al cierre de la implementación:**
1. **Centralización operativa en siete módulos interconectados:** Se construyó y verificó una aplicación web completa que integra en un solo punto de acceso la portada y feed en tiempo real (`/`), el módulo de comunicados con generador de formatos para redes y publicación programada (`/avisos`), la vista unificada de Foro y Guías interactivas ramificadas con extracción documental desde PDF, DOCX e imágenes por OCR (`/foro` y `/guias`), el directorio y sistema de validación de clubes estudiantiles (`/clubes`), la cartelera e itinerario de eventos por sede (`/eventos`), la maqueta 3D interactiva del campus con buscador y autogestión de cubículos (`/mapa`), el sistema P2P de objetos perdidos con coincidencia por trigramas al 80 % y entrega verificada con código QR (`/objetos`), el centro de notificaciones en tiempo real (`/notificaciones`) y los paneles de moderación, apelaciones y administración general (`/moderacion`, `/apelaciones` y `/admin`).
2. **Seguridad a nivel de datos y apego a la organización real de la ESCOM:** A través de Supabase Auth y 26 migraciones en PostgreSQL, se implementó un modelo RBAC con políticas RLS restrictivas que aíslan los datos sensibles en el esquema `private`, limitan a cada oficina de trámites (Gestión Escolar, Becas y CATT) a su propio ámbito de competencia, asignan la gobernanza del Auditorio a Becas y la de la Sala 14 a Subdirección Académica, e integran un módulo de autoservicio para derechos ARCO (exportación JSON/CSV, solicitudes de privacidad y baja con limpieza de archivos).
3. **Verificación técnica y reproducibilidad:** El repositorio compila sin errores de tipos ni de estilo (`tsc --noEmit` y `eslint` con 0 errores), cuenta con pruebas unitarias automatizadas sobre sus reglas de negocio (`11/11` aprobadas en `reglas.mjs`), 12 casos de prueba funcionales verificados (`PF-01` a `PF-12`), scripts de respaldo y restauración (`backup.sh` y `restore.sh`), un conjunto semilla de 21 cuentas que permite recorrer todos los roles en local y un proyecto remoto en Supabase (`clebescom`) sincronizado con el esquema final.

### 8.2 Cumplimiento de objetivos y requerimientos

La Tabla 8.1 resume el grado de cumplimiento de los objetivos específicos y de los bloques de requerimientos funcionales y no funcionales al corte del 18 de noviembre de 2026.

**Tabla 8.1 Cumplimiento de objetivos y requerimientos del proyecto**

| Objetivo / bloque de requerimientos | Cumplimiento | Evidencia y comentario técnico |
| --- | --- | --- |
| Centralizar la información institucional y comunitaria en una plataforma web única | **Cumplido (100 %)** | Siete módulos integrados con diseño de gaceta escolar, navegación responsiva y lectura pública sin sesión para contenidos abiertos. |
| Actores y control de acceso por rol, oficina y sede (`RF-01` a `RF-05`, `RNF-04` a `RNF-06`) | **Cumplido (100 %)** | 21 perfiles de prueba, validación `@alumno.ipn.mx` / `@ipn.mx`, cierre por inactividad a los 30 min, esquema `private` y políticas RLS restrictivas por área. |
| Comunicación institucional, formatos asistidos y programación (`RF-06` a `RF-09`, `CU-06` a `CU-08`) | **Cumplido (100 %)** | Generador con Google Gemini y respaldo local (salidas para ESCOM, Twitter/X y Facebook), programación con `pg_cron` y actualización Realtime. |
| Guías interactivas ramificadas, extracción documental y foro por área (`RF-10` a `RF-17`, `CU-05`, `CU-09` a `CU-14`) | **Cumplido (98 %)** | Grafos de pasos con decisiones, parser local de PDF/DOCX y OCR en español, PDF descargable, dudas y sugerencias por paso con versionado. *(Solo se omitió adjuntar una imagen distinta por cada paso individual).* |
| Clubes estudiantiles: propuestas, umbral de 20, asesor y membresías (`RF-18` a `RF-22`, `CU-17` a `CU-20`, `CU-31`) | **Cumplido (100 %)** | Detector de similitud, trigger de 20 votos con aviso en cascada, código de profesor por correo, carga de 4 documentos por integrante, toma por inactividad a 5 días y alta directa. |
| Objetos perdidos P2P: reporte, matching al 80 %, reclamo y QR (`RF-23` a `RF-26`, `CU-21` a `CU-24`) | **Cumplido (100 %)** | Hasta 2 fotos, hash SHA-256 en `private.lost_item_secrets`, trigger `pg_trgm` $\ge 0.80$, evidencia en `lost-evidence`, liberación de contacto y lector QR por cámara (`BarcodeDetector`). |
| Mapa 3D del campus, cubículos y cartelera de espacios (`RF-27` a `RF-29`, `CU-25` a `CU-28`) | **Cumplido (100 %)** | Maqueta 3D por nivel con interior de Gobierno, buscador de docentes, autogestión de cubículo con cohabitación y cartelera de eventos por sede (Auditorio/Becas, Sala 14/Subdirección). |
| Notificaciones en tiempo real y preferencias (`RF-30` a `RF-32`, `CU-29`, `CU-30`) | **Cumplido según alcance** | Campana Realtime y filtro por categoría en `notification_prefs`. El correo se emplea en Auth, código de asesor e invitaciones CSV; los avisos ordinarios operan in-app por decisión de alcance. |
| Administración, padrón CSV, moderación, auditoría y reportes (`RF-33` a `RF-36`, `CU-32` a `CU-35`, `RNF-10`, `RNF-11`) | **Cumplido (100 %)** | KPIs con preguntas >24 h, importador CSV con reporte de errores, escalera de strikes y `/apelaciones`, auditoría con `old_value`/`new_value`/IP, exportación CSV/PDF y scripts `backup.sh`/`restore.sh`. |
| Rendimiento bajo carga productiva y sesiones UAT presenciales (`RNF-01` a `RNF-03`) | **Verificado en local / protocolo listo para producción** | Índices GIN/B-Tree activos y tiempos locales $< 500\text{ ms}$; las corridas de Lighthouse/k6 en servidor institucional y encuestas SUS quedan definidas en las secciones `6.6` y `6.7`. |
| Respeto a las limitaciones de alcance de la sección 1.5 (SAES, otras escuelas, trámites legales, prefectura, reservas libres) | **Cumplido por diseño** | El sistema no invade sistemas centrales del IPN ni compromete a Prefectura en el resguardo físico de bienes. |

### 8.3 Conclusiones

1. **Solución directa a la fragmentación informativa de la ESCOM:** El proyecto demostró que es factible sustituir la dispersión de avisos en redes informales, las consultas repetitivas en ventanilla, las libretas manuales de clubes y la dependencia de la memoria empírica para ubicar cubículos mediante una plataforma web unificada que respeta las atribuciones reales de cada departamento de la escuela.
2. **Ventaja arquitectónica de concentrar reglas y seguridad en PostgreSQL (RLS + RPC):** Delegar el control de acceso, las transiciones de estado (como la promoción de propuestas de clubes a los 20 votos o la escalera de suspensiones por infracciones) y el emparejamiento por similitud (`pg_trgm`) directamente a triggers y políticas RLS en Supabase evitó duplicar un backend monolítico separado y garantizó que ninguna acción pueda burlarse invocando la API fuera de la interfaz gráfica.
3. **Automatización con control humano y autonomía local:** La incorporación de herramientas asistidas —como la extracción de pasos de trámites desde archivos PDF escaneados (mediante OCR local en español) o documentos Word y la generación de formatos para redes sociales— redujo la fricción operativa para los encargados de área sin quitarles la revisión y aprobación final antes de publicar.
4. **Viabilidad técnica y económica para la institución:** Al apoyarse en software libre y servicios con planes institucionales de bajo costo (Next.js y PostgreSQL/Supabase, sin requerir licencias propietarias de plataformas comerciales como CampusGroups), la ESCOM obtiene una base tecnológica mantenible, auditable y alineada con la normativa de protección de datos personales (LGPDPPSO).

### 8.4 Trabajo a futuro

1. **Despliegue en dominio institucional y pruebas piloto (corto plazo):** Publicar el frontend en un subdominio oficial de la escuela conectado al proyecto remoto de Supabase y a un servidor SMTP institucional; ejecutar sobre ese entorno las mediciones de carga (`PR-01` a `PR-04` con Lighthouse y `k6`) y realizar las sesiones moderadas de usabilidad (`UAT` con cuestionario SUS) con alumnos, docentes y personal administrativo.
2. **Afinación geométrica del mapa 3D con planos arquitectónicos oficiales:** Sustituir las proporciones ilustrativas de los edificios 1 a 4 por las cotas exactas de los planos oficiales de planta de la Subdirección Administrativa cuando sean liberados, conservando el motor interactivo 3D y las fichas de espacios ya construidas.
3. **Enriquecimiento multimedia en pasos de guías e integración con calendarios:** Añadir soporte opcional para adjuntar imágenes ilustrativas individuales en cada paso de una guía ramificada y ofrecer exportación en formato `iCal` (`.ics`) en la Cartelera de Eventos para que los alumnos sincronicen actividades del Auditorio o de la Sala 14 con sus calendarios personales.
4. **Interoperabilidad institucional sujeta a autorización central (largo plazo):** En caso de que la Dirección y la Coordinación de Servicios Informáticos del IPN autoricen pasarelas oficiales de consulta, vincular la validación de inscripción o el directorio docente mediante servicios web de solo lectura, manteniendo siempre la separación entre la vida comunitaria del plantel y la ejecución legal de trámites en el SAES.

---

## Referencia adicional para la sección `Referencias` (al final del Word)

Agregar al final de la lista de referencias (después de `[16]`) la cita de Boehm empleada en el Capítulo 5 (`5.2.1`):

- `[17] B. W. Boehm, "A spiral model of software development and enhancement," Computer, vol. 21, no. 5, pp. 61–72, May 1988.`
