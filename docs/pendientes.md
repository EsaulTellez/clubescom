# Pendientes del proyecto

Estado actualizado el 2026-11-11, comparado con `docs/fuente/TT.docx`, el plan de revisión externo y las decisiones del propietario en `docs/decisiones-producto.md`. La demo usa Supabase local y un seed de 12 cuentas. Las migraciones nuevas deben aplicarse antes de validar estos cambios. Las rutas principales ya conectan con el modelo nuevo; esta lista contiene brechas funcionales todavía abiertas y recorridos que falta validar. La existencia de código no equivale a un flujo verificado.

## Lo siguiente para llegar a una demo funcional

1. Recorrer los flujos con las cuentas demo: alta y OTP, recuperación, foro y respuestas oficiales por área, propuesta de club con expedientes/asesor/cita, reclamo y QR entre dos personas, apelación, baja de cuenta y avisos programados.
2. Completar CU-09: carga privada de archivos compatibles (al menos PDF/DOCX/TXT), extracción con Google GenAI y borrador de pasos editables con confirmación humana. La clave local aún no se ha probado.
3. Completar preguntas/analíticas de guías: notificar a moderación dentro de la app, editar FAQ y gestionar altas/reordenamiento de pasos sin perder sus vínculos, filtros de métricas y reconocimiento de colaboradores. Ya se pueden editar título, resumen y contenido de los pasos existentes con historial; existen Q&A, votos y métricas básicas.
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
- Falta carga y extracción de documentos para guías, editar FAQ y gestionar los pasos sin perder sus vínculos, aviso in-app al moderador de área, filtros de métricas y lista de colaboradores. Ya se editan título, resumen y contenido de pasos existentes con historial; las preguntas por paso, respuestas y votos de utilidad están conectadas.
- La interfaz de preferencias aún contiene banderas `email_*` heredadas aunque no se enviarán correos de producto; debe quedar en preferencias de notificación dentro de la app.

### Foro y moderación

- El formulario muestra preguntas parecidas en la misma área y aplica la ventana de 20 minutos; falta recorrerlo con varias cuentas/áreas.
- Las respuestas oficiales, fijado y moderación deben comprobarse en rutas/formularios con moderadores de área distinta.
- La interfaz de infracciones, historial y apelaciones ya existe; falta probar el ciclo y confirmar cómo se muestra una apelación resuelta a una cuenta sancionada.

### Clubes

- El modelo de propuesta, interés, expediente, profesor asesor y cita está implementado en Supabase/RPC; falta verificar los cambios de estado en recorrido real.
- El área de clubes puede registrar un club reconocido directamente sin votación; el alta exige alumno responsable y profesor asesor. Falta probar el alta completa en la interfaz y permitir cambiar responsables. Las propuestas iniciadas por profesores aún requieren definir cómo asignar a un alumno responsable al registrar el club.
- Solo el alumno responsable y el profesor asesor pueden crear publicaciones del club; una membresía aceptada permite leerlas. La base impide a la persona que revisa solicitudes cambiar su dueño o resolver una que no esté pendiente.
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

## Revisión de permisos por rol (2026-11-11)

- **Visitante:** lectura pública de avisos, guías, foro, directorio y mapa; no tiene permisos de escritura. Falta recorrer y comprobar todas las rutas anónimas y datos privados.
- **Alumno:** puede participar en los flujos comunitarios y solicitar ingreso; solo publica en un club si es su responsable asignado. No debe fijar preguntas, adjudicarse una membresía aceptada, crear clubes directamente ni registrar cubículos. Se comprobó el bloqueo de publicación como integrante, alta directa, fijado de preguntas y cubículo en la base; falta revisar otros accesos directos.
- **Profesor:** puede actualizar su cubículo y publicar en los clubes donde sea asesor asignado. Se comprobó publicación como asesor; faltan recorridos de cubículo y revisión de accesos entre clubes.
- **Responsable alumno de club:** publica y resuelve solicitudes pendientes únicamente en su club. Se comprobó la publicación y que no puede cambiar el dueño de una membresía; falta probar solicitudes entre clubes y usuarios suspendidos de extremo a extremo.
- **Moderación institucional:** Comunicación gestiona avisos y eventos autorizados; Gestión Escolar, Becas y CATT operan contenido de su área; Clubes Académicos registra clubes directamente y Clubes Culturales registra culturales/deportivos; Subdirección gestiona revisión y citas. Se comprobó que Gestión Escolar no crea clubes y que Clubes Culturales no crea académicos. Falta comprobar la matriz completa por área, incluidas acciones directas por API y datos privados.
- **Administración general:** puede gestionar roles y panel, y registrar clubes; sus acciones privilegiadas requieren controles adicionales en cada flujo. Falta verificar todas las acciones y exportaciones con cuentas demo.
- **Cuenta suspendida o vetada:** debe perder acceso a operaciones privadas, salvo el flujo de apelación. Se reforzó la lectura del feed privado de clubes; falta probar tokens existentes y todas las demás políticas.

La revisión detectó más límites pendientes: el enfriamiento del foro se verifica en la acción de aplicación y aún no está garantizado ante acceso directo a la base; deben auditarse los campos mutables y transiciones en el resto de tablas y funciones RPC. No se considera completada una auditoría integral de seguridad o de todos los roles.

## Brechas adicionales detectadas al revisar el plan del TT (2026-11-11)

Estas tareas complementan los recorridos anteriores. Se separa lo que se observa en el código de lo que aún requiere comprobación; los cuadros vacíos del plan externo no son evidencia de ausencia.

### Funcionalidad y datos

- [ ] **CU-04 / RF-04:** definir el catálogo y criterios de insignias y completar su otorgamiento automático sin duplicados. El perfil ya muestra insignias, pero mostrar una no prueba su asignación automática.
- [ ] **CU-07 / RF-07:** asegurar que un aviso programado aparezca a la hora prevista también en una sesión ya abierta; verificar activación, zona horaria y actualización en vivo. Hoy se filtra por fecha al consultar y falta el mecanismo programado señalado arriba.
- [ ] **CU-09 / RF-12:** además de generar borradores desde archivos, definir y completar la carga y descarga de PDF asociados a trámites; comprobar permisos y enlaces. Las FAQ ya pueden capturarse como texto.
- [ ] **CU-17 / RF-18:** permitir adjuntar el plan de trabajo de la propuesta; el formulario actual ofrece un enlace opcional, no un archivo adjunto. Completar y verificar el reclamo de propuesta por otro interesado tras siete días, conforme a la decisión del propietario.
- [ ] **CU-20:** modelar y verificar la asignación explícita del presidente por club y sus permisos; `leader_id` es la representación actual. Comprobar solicitudes, integrantes y acceso a la comunidad con cuentas distintas.
- [ ] **CU-23–24:** completar el historial de entrega para ambas personas y verificar contacto, cierre por reporte falso y QR con dos cuentas y un dispositivo real; no dar por probado el escaneo solo porque el QR se genera.
- [ ] **CU-34 / RF-35 / RNF-10:** revisar cobertura de auditoría de altas, cambios y eliminaciones administrativas, filtros y exportación. El esquema actual guarda actor, acción, entidad, detalle y fecha; contrastar la falta de valores anterior/nuevo e IP con el flujo del Word. Existe CSV; el Word menciona PDF/Excel.
- [ ] **CU-01 / privacidad:** revisar alcance de exportación y rectificación de datos: la ruta actual exporta perfil, insignias y preferencias; verificar qué otros datos personales corresponden y cómo se solicitan o corrigen. Probar la baja y limpieza de archivos.
- [ ] **CU-06:** probar el generador con una clave Google válida, el fallback manual y el guardado de formatos; el Word menciona tres versiones pero solo identifica dos, por lo que queda por definir la tercera si se requiere.

### Calidad y operación de la demo

- [ ] Medir carga principal (<3 s) y búsquedas (<500 ms) en condiciones documentadas; revisar que matching y operaciones masivas no bloqueen la interfaz (RNF-01–03). No se ha acreditado el cumplimiento con esta revisión.
- [ ] Comprobar vencimiento por inactividad, validación de entradas y permisos/RLS de datos y Storage por rol y área, incluidas operaciones críticas y transacciones (RNF-05–06, 08–09). Hacer recorridos manuales con cuentas distintas, incluida la cuenta suspendida.
- [ ] Revisar responsividad, teclado, contraste, etiquetas ARIA, texto alternativo y estados de carga/error en los flujos principales (RNF-12–14 y accesibilidad descrita en el Word). No se afirma conformidad WCAG sin evaluarla.
- [ ] Documentar arquitectura y esquema de datos actuales, y comprobar estándares de código (RNF-15–17). No implica crear diagramas adicionales en esta etapa, según la decisión vigente.
- [ ] Preparar y probar un respaldo y restauración local sin afectar datos de trabajo; el Word plantea respaldos periódicos (RNF-11), cuya programación y alcance para la demo siguen por definir. HTTPS (RNF-07) se verificará si se acuerda un entorno publicado; la demo actual es local.

### Puntos a aclarar, no requisitos nuevos aprobados

- Precisar criterios de insignias, la tercera salida del generador, formatos y límites de archivos, y si la ubicación del profesor significa cubículo o ubicación actual; el Word usa ambas expresiones.
- Revisar con la dirección del TT qué entregables de memoria, manuales, capacitación y presentación corresponden a esta etapa. El Word los contempla, pero el propietario priorizó la demo funcional y no pidió diagramas ni pruebas automatizadas como entregables adicionales.
- Revisar las referencias legales y obligaciones de privacidad con la fuente normativa y responsables institucionales antes de afirmar cumplimiento; el plan externo contiene citas y plazos que no se han validado. No asumir que la exportación parcial equivale a un módulo ARCO completo.
- El plan externo propone hosting, proveedor de correo, servicios concretos, costos, Jest, estructura de tablas y procesos de producción; son propuestas o trabajo futuro, no decisiones aprobadas para esta demo. Tampoco sustituye las exclusiones acordadas: correo de producto, alertas 24/48 h, reservas y control exclusivo del auditorio. El proveedor de IA acordado es Google y el umbral de similitud es 80 %, no Deepseek ni 70 %.
- El índice del Word contiene 35 casos; hay dos especificaciones adicionales en el cuerpo y una de las 35 carece de pasos extraíbles. El total documentado aquí es 37, no los 38 afirmados por el plan externo.
