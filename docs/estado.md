# Estado de los casos de uso

Cualquier agente que implemente, cambie o cierre un caso de uso actualiza este archivo en el mismo cambio. Anota el estado (`hecho`, `parcial` o `pendiente`), la fecha y una línea de qué cambió.

Pase inicial: 2026-10-29. Se contrastó `docs/fuente/TT.docx` con esta app local. No se tocó el código.

Conteos del índice (tablas 3.4 a 3.38, 35 casos): **hecho 1**, **parcial 28**, **pendiente 6**.

El cuerpo trae 2 casos más, sin número de tabla. Los dos están en parcial. Tablero completo: **hecho 1**, **parcial 30**, **pendiente 6**.

Un caso del índice no trae pasos en el texto extraído: CU-33.

| id | nombre | estado | evidencia |
| --- | --- | --- | --- |
| CU-01 | Registro y autenticación | parcial | `src/lib/auth-actions.ts`, `supabase/migrations/20261104000100_initial.sql` |
| CU-02 | Recuperación de credenciales | parcial | `src/app/recuperar/page.tsx`, `src/app/auth/callback/route.ts` |
| CU-03 | Restricción de acceso (baneo) | parcial | `src/app/admin/actions.ts`, `supabase/migrations/20261104000100_initial.sql` |
| CU-04 | Otorgamiento automático de insignias | parcial | `src/app/perfil/page.tsx` |
| CU-05 | Gestión de contenido por área | parcial | `src/app/guias/actions.ts` |
| CU-06 | Generación inteligente de formatos | parcial | `src/app/avisos/actions.ts`, `src/app/avisos/aviso-form.tsx` |
| CU-07 | Gestión de publicaciones y programación | parcial | `src/app/avisos/actions.ts` |
| CU-08 | Actualización del feed en tiempo real | parcial | `src/app/page.tsx` |
| CU-09 | Generación de guía por parsing | parcial | `src/app/guias/nueva/guide-form.tsx` |
| CU-10 | Recuperación ante búsqueda fallida | hecho | `src/app/guias/page.tsx` |
| CU-11 | Dudas específicas en un paso de guía | parcial | `src/app/guias/[id]/step-qa.tsx`, `src/app/guias/actions.ts` |
| CU-12 | Análisis de impacto y uso | parcial | `src/app/guias/[id]/page.tsx`, `src/app/guias/actions.ts` |
| CU-13 | Publicación de dudas con sugerencias | parcial | `src/app/foro/actions.ts`, `src/app/foro/question-form.tsx` |
| CU-14 | Oficialización de respuestas | parcial | `src/app/foro/[id]/page.tsx` |
| CU-15 | Moderación automática y strikes | parcial | `src/app/moderacion/actions.ts`, `supabase/migrations/20261104000100_initial.sql` |
| CU-16 | Alertas de dudas desatendidas | pendiente | no hay |
| CU-17 | Propuesta y validación social de clubes | parcial | `src/app/clubes/actions.ts` |
| CU-18 | Código de profesor asesor | parcial | `src/app/clubes/actions.ts` |
| CU-19 | Registro oficial por la encargada | parcial | `src/app/clubes/actions.ts` |
| CU-20 | Ingreso y membresía | parcial | `src/app/clubes/[id]/page.tsx` |
| CU-21 | Reporte de objeto | parcial | `src/app/objetos/actions.ts`, `supabase/migrations/20261104000100_initial.sql` |
| CU-22 | Matching por similitud de texto | parcial | `src/app/objetos/actions.ts`, `supabase/migrations/20261104000100_initial.sql` |
| CU-23 | Reclamo y código de entrega | parcial | `src/app/objetos/[id]/page.tsx`, `src/app/objetos/actions.ts` |
| CU-24 | Cierre del reporte | parcial | `src/app/objetos/actions.ts`, `src/app/objetos/page.tsx` |
| CU-25 | Mapa del campus | parcial | `src/app/espacios/spaces-tabs.tsx`, `src/components/campus-map.tsx` |
| CU-26 | Localización de profesores | parcial | `src/app/espacios/spaces-tabs.tsx` |
| CU-27 | Actualización de cubículo | parcial | `src/app/espacios/actions.ts`, `src/app/espacios/forms.tsx` |
| CU-28 | Itinerario de espacios | parcial | `src/app/espacios/page.tsx`, `src/app/espacios/actions.ts` |
| CU-29 | Centro de notificaciones | parcial | `src/app/notificaciones/page.tsx` |
| CU-30 | Alertas por correo | parcial | `src/app/notificaciones/actions.ts` |
| CU-31 | Aviso masivo al llegar a 20 | parcial | `src/app/clubes/actions.ts` |
| CU-32 | Panel de conteos y roles | parcial | `src/app/admin/page.tsx` |
| CU-33 | Importación masiva de padrones | parcial | `src/app/admin/roster-import.tsx`, `src/app/admin/actions.ts` |
| CU-34 | Auditoría de acciones | parcial | `src/app/admin/page.tsx` |
| CU-35 | Reportes de impacto académico | pendiente | no hay |
| CU-COM-04-01 | Consulta y filtrado de avisos | parcial | `src/app/avisos/page.tsx` |
| CU-GUA-02-01 | Sugerencia de mejora en una guía | parcial | `src/app/guias/actions.ts` |

## Cambios

- 2026-11-04. CU-01 sigue parcial: Supabase Auth administra registro, login y perfiles; las cuentas demo ya inician sesión en local como alumno, profesor, moderador y admin. Registro con OTP y baja de cuenta siguen pendientes de recorrido en navegador.
- 2026-11-04. CU-02 sigue parcial: la recuperación usa el enlace de Supabase Auth y callback local; falta recorrer el correo de recuperación y cambio de contraseña con Mailpit.
- 2026-11-04. CU-03 sigue parcial: RLS y el esquema local incluyen suspensiones graduadas y apelaciones; falta completar y recorrer toda la interfaz de infracciones y apelaciones.
- 2026-11-04. CU-06 sigue parcial: el formato para redes se puede generar con Google GenAI usando una API key local y requiere edición humana; falta probarlo con una clave válida.
- 2026-11-04. CU-13 sigue parcial: muestra preguntas parecidas en la misma área mientras se escribe y limita a una pregunta cada 20 minutos; falta recorrer el flujo con otras áreas/roles.
- 2026-11-04. CU-32 sigue parcial: el admin consulta directorio, conteos y auditoría; los moderadores quedan limitados a su área y no ven los conteos globales. Faltan importación CSV y reportes descargables.
- 2026-11-04. CU-32 sigue parcial: cambios de rol y veto del admin pasan por RPC de Supabase y no por escritura directa de columnas protegidas; falta probar acciones de modificación y exportación.
- 2026-11-05. CU-17 a CU-19 siguen parciales: Clubes cuenta intereses únicos y avanza por trigger a los 20; cada interesado puede cargar y volver a subir documentos solicitados en Supabase Storage; el profesor asesor confirma por código; Subdirección revisa, solicita correcciones y gestiona cita; Clubes registra el resultado. Falta recorrer el expediente completo con las cuentas demo y modelar al presidente moderador como asignación explícita por club (hoy se apoya en `leader_id`).
- 2026-11-04. CU-20 sigue parcial: se conserva membresía y feed del club; la cartelera pública ahora filtra solo eventos aprobados. La migración no modela un rol de moderador asignado por club, así que el responsable alumno se representa con `clubs.leader_id`.
- 2026-11-04. CU-21 a CU-24 siguen parciales: reportes y fotos usan RPC/Storage; respuestas y códigos se mantienen en tablas privadas; matching usa 80 %, el dueño revisa reclamos y se muestra un QR de entrega. Falta recorrer el escaneo real con dos cuentas/dispositivos y completar la vista de historial de ambas personas.
- 2026-11-04. CU-25 a CU-28 siguen parciales: Espacios consulta `space_events` autorizados y cubículos en Supabase, ofrece búsqueda de personal por nombre/edificio/cubículo y permite a un profesor guardar su ubicación. Moderación de Comunicación/Clubes académicos y el admin pueden publicar actividades ya autorizadas; la app no reserva espacios. Falta el plano real y el mapa no resalta ubicaciones dentro del dibujo.

- 2026-10-29. CU-10 hecho: el catálogo busca título y resumen, sugiere hasta tres guías similares y ofrece ir al foro del área cuando no encuentra una coincidencia.
- 2026-10-29. CU-08 sigue parcial: el inicio presenta avisos en una portada tipo feed y usa tipografías DM Sans y Plus Jakarta Sans; cuatro publicaciones de demo muestran los carteles compartidos. No hay actualización en tiempo real por WebSocket.
- 2026-10-29. CU-25 sigue parcial: se añadió una vista isométrica ilustrativa reconstruida a partir del croquis de ESCOM y alternancia al plano original; faltan mapas por nivel y búsqueda de aulas.
- 2026-10-29. CU-17 sigue parcial: el directorio del Club de Algoritmia muestra su logo compartido; no cambia el flujo de propuestas y registro.
- 2026-10-29. CU-20 sigue parcial: la comunidad del club muestra publicaciones, eventos, integrantes y membresía; falta completar aprobaciones y reglas administrativas del caso.
- 2026-10-29. CU-28 sigue parcial: Espacios agrega cartelera mensual con navegación por mes y filtro por día sobre reservas públicas; no calcula rutas ni conflictos entre espacios.
- 2026-10-29. CU-29 sigue parcial: al abrir una notificación, ahora se marca como leída y redirige al recurso; no hay contador en tiempo real.
- 2026-11-04. CU-08, CU-17, CU-20, CU-13 y CU-14 siguen con el mismo estado funcional; inicio, clubes y foro adoptan patrones de tablero ESCOM con feed más legible, propuestas con avance y navegación visible en móvil y escritorio.
- 2026-10-29. Pase inicial. Estados comparan el código local con el Word; CU-10 sí queda `hecho`, mientras los demás casos aún omiten partes de su flujo.
- 2026-11-04. Decisiones del propietario registradas en `docs/decisiones-producto.md`: Supabase para Auth, base, Storage y Realtime; no R2. CU-16 (alertas 24/48 h) y CU-30 (correo de notificaciones del producto) quedan fuera del alcance acordado; el correo de autenticación sí se conserva. Cambian los requisitos de CU-20, CU-22 y CU-28; no se marca ningún caso como completado solo por estas decisiones.
- 2026-11-04. CU-01 sigue parcial: registro, verificación por código de correo y contraseña usan Supabase Auth; consulta de rol y estado toma los datos del perfil y suspensiones, y la baja elimina la cuenta de Auth. Falta integrar y verificar los flujos con el esquema final y las cuentas de demo.
- 2026-11-04. CU-02 sigue parcial: recuperación envía un enlace de Supabase Auth por correo y permite cambiar contraseña desde la sesión de recuperación; falta verificar entrega y callback con Mailpit en el entorno local.
- 2026-11-05. CU-01 sigue parcial: las cuentas de prueba vuelven a iniciar sesión con el esquema final; la lectura del estado activo/veto propio ahora usa un RPC que no expone columnas protegidas. El inicio muestra las 12 cuentas demo, incluida Subdirección/Sala 14; faltan recorridos de alta, OTP, recuperación y baja.
- 2026-11-05. CU-03 sigue parcial: el veto manual se distingue de suspensiones por infracciones; usuarios sancionados pueden entrar a la ruta acotada de apelaciones y administración general resuelve apelaciones levantando la sanción correspondiente. Falta recorrer sanción y apelación extremo a extremo.
- 2026-11-05. CU-11 y CU-12 siguen parciales: cada paso de guía admite preguntas, respuestas comunitarias/oficiales y voto de utilidad; se registran vistas y pasos completados para moderación de esa área y se ocultan cortes por paso con menos de cinco personas. Falta recorrido con alumno y moderador, aviso in-app al área y métricas más completas.
- 2026-11-05. CU-15 sigue parcial: moderación registra infracciones solo en su área, la base activa suspensiones en la escalera 1/3/6 meses y permanente, y se añadieron pantallas de historial y apelación. El acumulado se interpreta de por vida porque no se definió ventana; falta recorrido completo.
- 2026-11-05. CU-32 y CU-33 siguen parciales: el panel y sus acciones privilegiadas son solo para administración general; hay importador CSV con previsualización, dominios, duplicados, reporte descargable y confirmación de invitaciones Supabase Auth sin roles ni contraseñas en el archivo. Faltan probar importación con archivo en Mailpit, filtros y exportación de auditoría y reportes.
