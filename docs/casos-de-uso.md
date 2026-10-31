# Casos de uso

Salen de las tablas 3.4 a 3.38 del índice de `docs/fuente/TT.docx` (35). El identificador `CU-01` … `CU-35` sigue ese orden. Entre paréntesis va el id que escribe el cuerpo (`CU-USR-…`, `CU-COM-…`, etc.).

El índice y el cuerpo no coinciden en dos puntos:

- El cuerpo especifica **Consulta y filtrado** (`CU-COM-04-01`) y **Colaboración y sugerencia** (`CU-GUA-02-01`) con flujo completo, y no les pone número de tabla. Van al final, fuera de los 35.
- La tabla 3.36 (importación de padrones) solo aparece en el índice. El cuerpo no trae ese caso. Un caso de los 35 no tiene pasos extraíbles.

Los dibujos no salen en la extracción de texto. Los pasos de abajo son solo los que el Word escribe en prosa.

Estados: `hecho` (el flujo pedido funciona en esta app local), `parcial` (hay pantalla o versión corta y falta una parte pedida), `pendiente` (no está).

## CU-01 · Registro y autenticación

- Tabla 3.4. Id del Word: `CU-USR-01-01`. Actor: alumno o profesor.
- Flujo: 1) correo institucional y contraseña. 2) el sistema valida el dominio y que no esté registrado. 3) genera un OTP de 6 dígitos y lo envía al correo. 4) el usuario lo ingresa antes de 15 minutos. 5) verifica el código, crea la cuenta y asigna alumno o profesor. Postcondición del Word: JWT.
- Estado: parcial.
- Evidencia: `src/lib/auth-actions.ts`, `src/app/registro/page.tsx`. El OTP se muestra en la página. La sesión es cookie, no JWT. La cuenta se inserta antes de verificar el código.

## CU-02 · Recuperación de credenciales

- Tabla 3.5. Id del Word: `CU-USR-01-03`. Actor: alumno o profesor.
- Flujo: 1) «¿Olvidaste tu contraseña?». 2) ingresa el correo. 3) el sistema envía un enlace con token. 4) el usuario abre el enlace y define otra contraseña. 5) se actualiza y se confirman. Postcondición: se invalidan las sesiones previas.
- Estado: parcial.
- Evidencia: `src/lib/auth-actions.ts`, `src/app/recuperar/page.tsx`. Hay código en pantalla, no un enlace por correo. No se borran las sesiones.

## CU-03 · Restricción de acceso (baneo)

- Tabla 3.6. Id del Word: `CU-USR-01-05`. Actor: administrador.
- Flujo: 1) busca al usuario. 2) «Banear usuario». 3) registra el motivo. 4) marca baneado. 5) corta la sesión activa. Luego el acceso responde 403.
- Estado: parcial.
- Evidencia: `src/app/admin/actions.ts`. El admin marca `banned`. El login y `getSession` lo rechazan. No hay campo de motivo ni borrado de `sessions`.

## CU-04 · Otorgamiento automático de insignias

- Tabla 3.7. Id del Word: `CU-USR-02`. Actor: el sistema (trigger).
- Flujo: 1) un trigger detecta el mérito. 2) elige el tipo (Fundador, Líder, Colaborador, etc.). 3) inserta la insignia. 4) se ve en el perfil. Si ya existe, no se duplica.
- Estado: parcial.
- Evidencia: `src/app/perfil/page.tsx`, `scripts/seed.mjs`. Hay una insignia «Cuenta de demostración» cargada a mano. No hay trigger que las otorgue.

## CU-05 · Gestión de contenido por área

- Tabla 3.8. Id del Word: `CU-USR-05-04`. Actor: moderador de área.
- Flujo: 1) abre la guía de su área. 2) RLS comprueba que el área de la guía sea la suya. 3) edita pasos o requisitos. 4) guarda y deja historial de versiones. Si el área no coincide, se niega.
- Estado: parcial.
- Evidencia: `src/app/guias/actions.ts`. Moderador o admin crean una guía de cualquier área. Aceptar una sugerencia agrega una nota al paso. No hay RLS por área ni historial de versiones.

## CU-06 · Generación inteligente de formatos

- Tabla 3.9. Id del Word: `CU-COM-01-01`. Actor: moderador de avisos.
- Flujo: 1) abre el generador. 2) pega el texto. 3) el sistema llama a la API de Deepseek. 4) recibe versiones para Tweet y Facebook. 5) previsualiza y edita. 6) guarda los formatos ligados a la noticia.
- Estado: parcial.
- Evidencia: `src/app/avisos/aviso-form.tsx`, `src/app/avisos/shared.ts`. «Generar formato» arma una plantilla de texto. No hay modelo de lenguaje ni publicación en redes.

## CU-07 · Gestión de publicaciones y programación

- Tabla 3.10. Id del Word: `CU-COM-02-01`. Actor: moderador de avisos o un cron.
- Flujo: 1) título, descripción y categoría. 2) visibilidad e inmediata o programada. 3) si es inmediata, `published: true` y un WebSocket. 4) si es programada, un cron la activa a la hora. 5) aparece en el feed con el color de la categoría. Alterno: alerta si el auditorio ya está ocupado.
- Estado: parcial.
- Evidencia: `src/app/avisos/actions.ts`, `src/app/avisos/page.tsx`. Se guarda `publish_at` y el feed oculta la fecha futura cuando alguien abre la página. No hay cron, WebSocket ni cruce con el auditorio.

## CU-08 · Actualización del feed en tiempo real

- Tabla 3.11. Id del Word: `CU-COM-03-03`. Actor: sistema y usuario.
- Flujo: 1) un moderador publica. 2) el backend emite un WebSocket. 3) el cliente recibe el JSON. 4) el carrusel o el feed insertan la tarjeta al inicio, sin recargar.
- Estado: parcial.
- Evidencia: `src/app/page.tsx`, `src/components/story-carousel.tsx`. El inicio muestra un carrusel al cargar. No hay WebSocket.

## CU-09 · Generación de guía por parsing de documentos

- Tabla 3.12. Id del Word: `CU-GUA-01-01`. Actor: moderador de área y el sistema.
- Flujo: 1) carga un Word o PDF. 2) extrae texto y jerarquía (H1, viñetas). 3) devuelve JSON de pasos. 4) el moderador valida, pone imágenes y confirma. 5) la guía queda pública. Los archivos van a un bucket R2.
- Estado: parcial.
- Evidencia: `src/app/guias/nueva/guide-form.tsx`, `src/app/guias/actions.ts`. Los pasos se escriben a mano. No hay carga de PDF ni parsing.

## CU-10 · Recuperación ante búsqueda fallida

- Tabla 3.13. Id del Word: `CU-GUA-03-03`. Actor: alumno o público.
- Flujo: 1) busca en el catálogo de guías. 2) la búsqueda de texto no encuentra nada. 3) mensaje «Guía no encontrada». 4) enlace al foro del área. Alterno: antes muestra guías de nombre parecido.
- Estado: hecho.
- Evidencia: `src/app/guias/page.tsx`. El catálogo busca por título y resumen, propone hasta tres guías similares y enlaza al foro del área si no hay coincidencias.

## CU-11 · Gestión de dudas específicas (Q&A)

- Tabla 3.14. Id del Word: `CU-GUA-04-04`. Actor: alumno y moderador de área.
- Flujo: 1) el alumno pregunta ligada a un paso. 2) queda «Pendiente de respuesta». 3) el moderador escribe y marca la respuesta oficial. 4) otros votan si sirvió. Una respuesta de alumno se ve, sin sello oficial.
- Estado: pendiente.
- Evidencia: no hay. Las FAQ de una guía son texto del autor (`guides.faqs`). No hay pregunta por paso. El foro es otro caso.

## CU-12 · Análisis de impacto y uso

- Tabla 3.15. Id del Word: `CU-GUA-05-01`. Actor: moderador de área y el sistema.
- Flujo: 1) cada consulta de guía o paso se registra. 2) el moderador abre «Analíticas». 3) ve abandono y preguntas por paso. 4) decide qué actualizar. Si no hay datos, gráficos vacíos.
- Estado: pendiente.
- Evidencia: no hay.

## CU-13 · Publicación de dudas con sugerencias

- Tabla 3.16. Id del Word: `CU-FOR-01-01`. Actor: alumno y el sistema.
- Flujo: 1) empieza el título. 2) búsqueda con debounce y muestra 3 hilos parecidos ya resueltos. 3) si sigue, elige área. 4) cooldown de 20 minutos. 5) publica en «Sin responder» y avisa a los moderadores del área.
- Estado: parcial.
- Evidencia: `src/app/foro/actions.ts`, `src/app/foro/page.tsx`. Se publica por área. Al enviar, si el título se parece mucho a otro, se rechaza. No hay tres sugerencias mientras escribe, ni cooldown, ni aviso al moderador.

## CU-14 · Validación y oficialización de respuestas

- Tabla 3.17. Id del Word: `CU-FOR-02-01`. Actor: moderador de área.
- Flujo: 1) revisa dudas de su área. 2) redacta o elige una respuesta. 3) pone «Respuesta oficial». 4) el hilo pasa a «Respondida» y la respuesta queda fija arriba. 5) se avisa al autor. Alterno: fijar el hilo.
- Estado: parcial.
- Evidencia: `src/app/foro/actions.ts`, `src/app/foro/[id]/page.tsx`. Cualquier moderador o admin marca su respuesta como oficial. Hay aviso in-app al autor. No se elige una respuesta ya escrita, no hay estado del hilo ni fijar el hilo, y no se exige que el área del moderador coincida.

## CU-15 · Control de integridad y moderación automática

- Tabla 3.18. Id del Word: `CU-FOR-04-01`. Actor: moderador y el sistema.
- Flujo: 1) marca spam. 2) `is_spam: true`. 3) se oculta. 4) suma `spam_strikes`. 5) a los 3 strikes, el usuario queda en moderación previa.
- Estado: pendiente.
- Evidencia: no hay.

## CU-16 · Seguimiento de dudas desatendidas

- Tabla 3.19. Id del Word: `CU-FOR-05-03`. Actor: cron y moderador.
- Flujo: 1) cada 6 horas revisa la base. 2) hilos sin respuesta oficial con más de 24 horas. 3) los agrupa por área. 4) notificación de alta prioridad al moderador. 5) el enlace abre esas dudas. Alterno: a las 48 horas, avisar al admin.
- Estado: pendiente.
- Evidencia: no hay.

## CU-17 · Propuesta y validación social de clubes

- Tabla 3.20. Id del Word: `CU-CLB-01-01`. Actor: alumno y el sistema.
- Flujo: 1) nombre, justificación y tipo. 2) estado «En votación». 3) otros marcan «Estoy interesado». 4) votos únicos por boleta. 5) a los 20, pasa a «En validación» y avisa al proponente para el trámite formal. Alterno: a los 7 días, otro interesado puede reclamar la propuesta.
- Estado: parcial.
- Evidencia: `src/app/clubes/actions.ts`, `src/app/clubes/propuestas/[id]/page.tsx`. Hay propuesta, interés por usuario y, a los 20, estado `en_seguimiento` más aviso al proponente. También se puede simular el umbral. No hay reclamo a los 7 días ni el trámite con documentos.

## CU-18 · Asignación y protocolo con el profesor

- Tabla 3.21. Id del Word: `CU-CLB-02-02`. Actor: alumno proponente y profesor.
- Flujo: 1) el alumno escribe el correo del profesor. 2) el sistema manda un código a ese `@ipn.mx`. 3) el profesor lo ingresa. 4) queda vinculado y se habilita la carga de documentos.
- Estado: parcial.
- Evidencia: `src/app/clubes/actions.ts`. El código se genera en la app y se avisa al proponente. El profesor lo escribe en la propuesta. No se envía por correo ni se piden documentos.

## CU-19 · Auditoría y registro oficial por la encargada

- Tabla 3.22. Id del Word: `CU-CLB-03-01`. Actor: moderador de clubes.
- Flujo: 1) revisa documentos (objetivos, cronograma, impacto, etc.). 2) si falta algo, «Incompleta». 3) si está bien, agenda cita con proponente y profesor. 4) después de la cita, aprueba. 5) la propuesta pasa a club activo y se avisa a los interesados. Alterno: «Rechazada».
- Estado: parcial.
- Evidencia: `src/app/clubes/actions.ts`. Con asesor asignado, admin o `clubes_academicos` crean el club. No hay documentos, cita, estado incompleto ni aviso a los interesados.

## CU-20 · Gestión de ingreso y membresía

- Tabla 3.23. Id del Word: `CU-CLB-09-01`. Actor: alumno y presidente del club.
- Flujo: 1) «Solicitar ingreso». 2) si hay formulario externo de requisitos, se muestra. 3) la solicitud llega al presidente. 4) aprueba. 5) membresía y acceso a avisos privados del club. El alumno ve a sus compañeros.
- Estado: parcial.
- Evidencia: `src/app/clubes/actions.ts`, `src/app/clubes/[id]/page.tsx`. Hay solicitud y aceptación o rechazo por responsable o asesor. No hay formulario de requisitos, avisos privados ni lista de integrantes.

## CU-21 · Reporte de hallazgo o pérdida

- Tabla 3.24. Id del Word: `CU-OBJ-01-01`. Actor: alumno o profesor.
- Flujo: 1) nuevo reporte, encontrado o perdido. 2) descripción, lugar y hasta 2 fotos en R2. 3) si es encontrado, pregunta de seguridad obligatoria. 4) se publica. Si es pérdida, el Word no pide pregunta de seguridad.
- Estado: parcial.
- Evidencia: `src/app/objetos/actions.ts`, `src/app/objetos/nuevo/form.tsx`. Una foto va a `public/uploads`. La pregunta de seguridad se pide también en «perdido».

## CU-22 · Matching automático por similitud

- Tabla 3.25. Id del Word: `CU-OBJ-02-01`. Actor: el sistema.
- Flujo: 1) al insertar, compara texto. 2) `pg_trgm`. 3) si la similitud supera 70 %, inserta en `objeto_matches`. 4) aviso in-app y por correo. Bajo 70 % no avisa.
- Estado: parcial.
- Evidencia: `src/app/objetos/actions.ts`. Al publicar compara título y descripción y, si la suma pasa 0.35, guarda `matched_id` y avisa in-app a las dos personas. No hay correo ni tabla `objeto_matches`. No compara fotos.

## CU-23 · Protocolo de reclamo y validación de identidad

- Tabla 3.26. Id del Word: `CU-OBJ-03-01`. Actor: quien reclama y quien encontró.
- Flujo: 1) «Este objeto es mío». 2) responde la pregunta de seguridad. 3) quien encontró revisa la respuesta (puede ir una foto). 4) si acepta, confirma. 5) el sistema genera un QR y muestra datos de contacto.
- Estado: parcial.
- Evidencia: `src/app/objetos/actions.ts`, `src/app/objetos/[id]/claim-form.tsx`. El sistema compara la respuesta con un hash. Si coincide, muestra un código de 8 caracteres. No hay revisión de la otra persona, ni QR, ni contacto.

## CU-24 · Finalización y cierre del reporte

- Tabla 3.27. Id del Word: `CU-OBJ-04-01`. Actor: alumno o administrador.
- Flujo: 1) tras la entrega, «Marcar como entregado». 2) confirmación. 3) estado entregado y se oculta del feed. 4) pasa al historial de ambos. Alterno: el admin cierra un reporte falso.
- Estado: parcial.
- Evidencia: `src/app/objetos/actions.ts`, `src/app/objetos/page.tsx`. Quien reportó confirma con el código y el estado pasa a `entregado`. El listado solo muestra `abierto`. No hay historial personal ni cierre forzado por admin.

## CU-25 · Navegación en mapa interactivo (SVG)

- Tabla 3.28. Id del Word: `CU-MAP-01-01`. Actor: cualquier usuario.
- Flujo: 1) entra a «Mapa». 2) carga el plano del primer piso. 3) cambia de nivel. 4) al pasar el cursor, resalta el aula y muestra el nombre. 5) un clic abre horarios o contacto.
- Estado: parcial.
- Evidencia: `src/app/espacios/page.tsx`. Hay un esquema fijo y puntos con coordenadas numéricas. No hay SVG por piso, hover de aulas ni ficha del espacio.

## CU-26 · Localización de personal académico

- Tabla 3.29. Id del Word: `CU-MAP-02-01`. Actor: alumno o profesor.
- Flujo: 1) busca el nombre. 2) sugerencias con cubículo y piso. 3) elige al profesor. 4) el plano de ese piso resalta el cubículo. Si no hay ubicación: «Ubicación no disponible».
- Estado: parcial.
- Evidencia: `src/app/espacios/page.tsx`. Lista cubículo, profesor, edificio y piso. No hay buscador ni resaltado en el plano.

## CU-27 · Actualización colaborativa de espacios

- Tabla 3.30. Id del Word: `CU-MAP-03-01`. Actor: profesor.
- Flujo: 1) entra a su perfil. 2) «Actualizar ubicación de cubículo». 3) elige piso y un espacio de la lista. 4) confirma. 5) el mapa cambia al momento. Alterno: avisa si otro docente ya ocupa ese cubículo.
- Estado: parcial.
- Evidencia: `src/app/espacios/actions.ts`, `src/app/espacios/forms.tsx`. El profesor escribe etiqueta, edificio, piso y coordenadas X/Y. No hay lista de espacios ni aviso de cubículo ocupado.

## CU-28 · Itinerarios y disponibilidad de espacios

- Tabla 3.31. Id del Word: `CU-MAP-05-01`. Actor: moderador de avisos o de clubes, y el público.
- Flujo: 1) registra un evento en un espacio. 2) rechaza si el horario choca. 3) se publica en el calendario. 4) cualquiera ve los próximos 7 días. Alterno: sugiere horarios libres.
- Estado: parcial.
- Evidencia: `src/app/espacios/actions.ts`, `src/app/espacios/page.tsx`. Admin o cualquier moderador agregan una reserva. El itinerario público se lista. No hay detección de choque ni ventana de 7 días. El Word, en la sección 1.5, deja el control final del auditorio al director: eso no se construye.

## CU-29 · Centro de notificaciones in-app

- Tabla 3.32. Id del Word: `CU-NOT-01-01`. Actor: usuario autenticado.
- Flujo: 1) clic en la campana. 2) lee `notificaciones` de ese usuario. 3) orden cronológico y resalta no leídas. 4) el clic lleva al recurso. 5) marca `read: true`. Vacío: «Todo al día». El contador se actualiza en tiempo real.
- Estado: parcial.
- Evidencia: `src/app/notificaciones/page.tsx`, `src/app/notificaciones/actions.ts`. Hay lista, no leídas y «Marcar como leída». El enlace «Ver» no marca leída. No hay campana ni contador en vivo. En el header el enlace dice «Avisos» y en móvil no se muestra.

## CU-30 · Despacho de alertas por correo

- Tabla 3.33. Id del Word: `CU-NOT-02-01`. Actor: servicio de mensajería.
- Flujo: 1) detecta una notificación `priority: high`. 2) revisa si el usuario quiere correo. 3) arma HTML. 4) envía con SendGrid o Resend. 5) registra el envío. Si rebota, apaga el canal.
- Estado: parcial.
- Evidencia: `src/app/notificaciones/forms.tsx`, `src/app/notificaciones/actions.ts`. Se guardan tres casillas (`email_clubs`, `email_forum`, `email_lost`). No sale ningún correo.

## CU-31 · Notificaciones masivas en cascada

- Tabla 3.34. Id del Word: `CU-NOT-03-01`. Actor: el sistema.
- Flujo: 1) la propuesta cambia de estado al llegar al requisito (20). 2) obtiene a quienes marcaron interés. 3) inserta una notificación para cada uno. 4) la ven al entrar. Si son muchos, las encola.
- Estado: parcial.
- Evidencia: `src/app/clubes/actions.ts`. Al llegar a 20 (o al simular) solo se avisa al proponente. No hay inserción masiva a los interesados.

## CU-32 · Dashboard de control centralizado

- Tabla 3.35. Id del Word: `CU-ADM-01-01`. Actor: administrador general.
- Flujo: 1) abre el panel. 2) agrega usuarios, clubes, foro y objetos. 3) tarjetas: usuarios activos hoy, preguntas sin respuesta (>24 h), objetos por entregar. 4) gráficas de uso de guías.
- Estado: parcial.
- Evidencia: `src/app/admin/page.tsx`. Cuenta usuarios, avisos, clubes, objetos y preguntas. Admin puede vetar y cambiar rol. No hay activos de hoy, preguntas vencidas, objetos por entregar ni gráficas.

## CU-33 · Importación masiva de padrones

- Tabla 3.36. El índice la nombra «Importación Masiva de Padrones de Usuarios». El cuerpo no trae id, actor ni flujo.
- Flujo: el Word solo nombra el caso; no trae pasos en el texto extraído.
- Estado: pendiente.
- Evidencia: no hay. Las cuentas de moderador y admin se insertan en `scripts/seed.mjs`.

## CU-34 · Auditoría de acciones

- Tabla 3.37 en el índice. En el cuerpo el pie dice «Tabla 3.366». Id del Word: `CU-ADM-03-01`. Actor: administrador general.
- Flujo: 1) abre «Auditoría». 2) filtra por usuario, tabla o fechas. 3) ve quién, valor anterior y nuevo, e IP. 4) descarga PDF o Excel.
- Estado: parcial.
- Evidencia: `src/lib/auth.ts`, `src/app/admin/page.tsx`. Se guardan actor, acción, entidad y un texto. El panel lista los últimos 50. No hay filtros, valor anterior, IP ni descarga.

## CU-35 · Reportes de impacto académico

- Tabla 3.38 en el índice. En el cuerpo el pie dice «Tabla 3.37». Id del Word: `CU-ADM-04-01`. Actor: administrador general.
- Flujo: 1) elige el reporte (ejemplo: top 10 de guías). 2) gráficas. 3) señala trámites con más dudas. 4) eso sirve para Gestión Escolar o Becas. Alterno: archivo imprimible.
- Estado: pendiente.
- Evidencia: no hay.

## Casos en el cuerpo sin número de tabla

No están en las 35 del índice. Sí tienen flujo en el texto extraído.

### Consulta y filtrado de contenido

- Id del Word: `CU-COM-04-01`. Actor: alumno, profesor o visitante. Queda en el cuerpo entre las tablas 3.11 y 3.12.
- Flujo: 1) entra al feed. 2) carga las últimas 20 con scroll infinito. 3) filtra por tipo (evento/aviso) o área (Gestión/Becas). 4) búsqueda de texto completo. 5) ordena por relevancia o fecha. Sin resultados, sugiere el foro.
- Estado: parcial.
- Evidencia: `src/app/avisos/page.tsx`. Hay búsqueda por título o cuerpo (`ilike`) y filtro por categoría académico, social o trámites. El feed público no pide sesión. No hay scroll infinito, ni filtro por área, ni salto al foro.

### Colaboración y sugerencia de mejoras

- Id del Word: `CU-GUA-02-01`. Actor: alumno y moderador de área. Queda en el cuerpo entre las tablas 3.12 y 3.13.
- Flujo: 1) el alumno ve un paso a aclarar. 2) «Sugerir mejora» y redacta. 3) el moderador recibe aviso y la revisa. 4) si vale, aplica el cambio. 5) nueva versión de la guía. Si la rechaza, puede avisar el motivo. El alumno queda en «Colaboradores».
- Estado: parcial.
- Evidencia: `src/app/guias/actions.ts`, `src/app/guias/[id]/page.tsx`. El alumno sugiere sobre un paso. Moderador o admin aceptan (se agrega la nota al paso) o rechazan. No hay aviso al moderador, versión, motivo ni lista de colaboradores.

## Flujos de secuencia y actividad

Las figuras 4.11 a 4.20 están dibujadas en `docs/fuente/TT.docx`. `textutil` solo devolvió el título. No hay pasos de mensaje ni de actividad en el texto extraído. No se inventan.

En el cuerpo los mismos títulos se repiten como figuras 4.0.5 a 4.0.14, otra vez sin pasos.

| Índice | Título en el índice | Pie en el cuerpo |
| --- | --- | --- |
| 4.11 | Diagrama de secuencia del módulo de reporte de objetos perdidos | 4.0.5 |
| 4.12 | Diagrama de secuencia del módulo de autenticación de cuenta | 4.0.6 |
| 4.13 | Diagrama de secuencia del módulo de publicación en foro | 4.0.7 |
| 4.14 | Diagrama de secuencia del módulo de propuesta de club | 4.0.8 |
| 4.15 | Diagrama de secuencia del módulo de publicación de avisos | 4.0.9 |
| 4.16 | Diagrama de secuencia del módulo de consulta de roadmaps | 4.0.10 |
| 4.17 | Diagrama de actividades del módulo de propuesta de club | 4.0.11 |
| 4.18 | Diagrama de actividades del módulo de registro de perfil | 4.0.12 |
| 4.19 | Diagrama de actividades del módulo de reporte de objetos perdidos | 4.0.13 |
| 4.20 | Diagrama de actividades del módulo de generación automática de formato de avisos | 4.0.14 |
