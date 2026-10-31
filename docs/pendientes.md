El tablero de casos de uso está en `docs/estado.md`. El detalle de cada caso está en `docs/casos-de-uso.md`. Quien implemente, cambie o cierre un caso actualiza `docs/estado.md` en el mismo cambio.

# Lo que el frente ya muestra y el sistema todavía no cierra

La interfaz de demostración corre en local con Postgres. Estas piezas se ven en pantalla, pero no están listas para la escuela.

## Correo y acceso

- El código de registro y de recuperación se muestra en la página. No hay servidor de correo ni plantillas institucionales.
- No hay caducidad de sesión por inactividad más allá de las 8 horas de la cookie.
- El alta de moderadores y administradores se hace a mano en la base. No hay importación de padrones.

## Archivos y avisos

- Las fotos de objetos se guardan en `public/uploads` de esta máquina. No hay Cloudflare R2.
- El formato para redes es una plantilla de texto. No se publica en Facebook ni en X.
- Un aviso con fecha futura se oculta hasta esa hora, pero no hay un proceso que lo despierte si nadie abre la página.

## Datos y seguridad

- Las políticas de fila están declaradas en el esquema. La aplicación entra como dueña de la base, así que esas reglas no se aplican.
- Las contraseñas usan bcrypt. Las respuestas de objetos usan un hash simple, no un secreto aparte.
- La descarga de datos del perfil existe. No hay un flujo formal de derechos ARCO con plazos ni un responsable designado.
- No hay bitácora de incidentes de privacidad.

## Recorridos que la pantalla ya enseña

- Una propuesta de club muestra cuatro pasos: interés, umbral, asesor y registro. El botón de simular el umbral no junta a veinte alumnos ni les pide documentos.
- Un objeto muestra reporte, coincidencia, reclamo y entrega. La coincidencia solo corre al publicar y compara texto, no la foto.
- Una guía se lee como una línea de pasos. Aceptar una sugerencia no reescribe el paso oficial ni avisa al autor por correo.
- Una pregunta puede tener respuesta oficial. El distintivo sale del rol de quien escribe, no de una asignación del área dueña del trámite.

## Módulos que se ven completos y no lo están

- Objetos: la coincidencia es por similitud de texto. No hay foto comparada ni código QR, solo un código de 8 caracteres.
- Clubes: el umbral de 20 interesados se puede simular. No se piden los documentos oficiales ni se agenda la cita con la encargada.
- Guías: los pasos son texto. No hay PDF adjunto ni generación automática a partir de un documento.
- Espacios: el mapa dibuja edificios fijos. Las posiciones de cubículos son números, no un plano real de la ESCOM.
- Notificaciones: se guardan dentro de la app. Las casillas de correo solo se almacenan; no sale ningún mensaje.
- Insignias: hay una de demostración. No se otorgan solas por participar.
- Panel: cuenta registros y permite vetar o cambiar rol. No hay reportes de impacto ni exportación institucional.

## Fuera de este entorno

- No está desplegado. No hay HTTPS de producción, respaldos programados ni pruebas automáticas.
- No hay conexión con SAES ni con el sitio oficial de la ESCOM.
