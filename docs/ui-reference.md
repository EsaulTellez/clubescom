# Referencia de UI y UX

Esta guía es la referencia persistente para cambios de interfaz de ESCOM. Leerla antes de diseñar o modificar pantallas. Su fuente es la dirección confirmada por el propietario el 2026-11-04; capturas y sitios que entregue después se incorporan aquí como referencias explícitas.

## Dirección

- Interacción de comunidad inspirada en Reddit: feed legible, votos, comentarios, filtros, actividad y jerarquía clara entre publicaciones.
- Identidad de tablero escolar: avisos fijados, señales institucionales, áreas, horarios y lenguaje cercano a la comunidad ESCOM.
- Conservar elementos de identidad ESCOM/IPN que ya tiene el producto. El logotipo y escudo existentes se usan cuando corresponda.
- Evitar apariencia genérica de plantilla, estética que parezca generada por IA y minimalismo excesivo.
- Priorizar inicio, clubes y foro. Diseñar móvil y escritorio con el mismo cuidado.

## Patrones de interacción

- **Altas en diálogo (confirmado 2026-11-18)**: «Nueva publicación» de Foro y Guías, «Publicar evento» de Eventos y «Reportar objeto» de Perdidos y encontrados abren el formulario en un diálogo sobre el listado actual. Usar papel claro, azul institucional, cierre visible, Escape, foco contenido y desplazamiento interno en pantallas pequeñas.

- **Cero texto redundante o auto-descriptivo de la UI/UX (confirmado 2026-11-16)**: Si la interfaz necesita explicar qué es un componente con subtítulos, párrafos descriptivos, cintas o etiquetas («Resumen visual con...», «Feed inteligente», «Clasificación según...», «Lectura directa completa»), la UX está mal. Nunca agregar textos explicativos sobre cómo funciona la propia interfaz.
- **Datos estrictamente reales en tarjetas (confirmado 2026-11-16)**: No rellenar las tarjetas con metadatos inventados, códigos de referencia artificiales, sellos de verificación falsos ni tablas de atributos que no existen en el registro. Mostrar únicamente los campos que el elemento tiene en la base de datos; si un campo opcional no existe, no se renderiza nada.
- **Carrusel de Comunicados en inicio (confirmado 2026-11-16)**: Destinado a comunicados oficiales compactados de redes de la ESCOM. Sin etiquetas ni chips encima de las tarjetas; el contenedor de cada tarjeta toma la proporción natural de la imagen subida (horizontal o vertical) con un límite máximo, lleva título y descripción dentro sobre un gradiente vertical oscuro de abajo hacia arriba, y al hacer clic abre un popup con el comunicado completo.
- **Feed unificado y diferenciado por módulo (confirmado 2026-11-16)**: El feed no lleva título ni textos descriptivos; inicia directamente con los filtros y las tarjetas con buen espaciado entre sí (`gap-6`). No se muestran etiquetas de «Fijado» en las tarjetas del feed. Se mezclan publicaciones de clubes, avisos, preguntas del foro y eventos con carga progresiva al deslizar, donde cada tarjeta tiene un diseño visual propio según el módulo del que proviene.
- **Costado en inicio y asistencia a eventos (confirmado 2026-11-16)**: En inicio solo se muestran **Clubes populares** y **Eventos en tendencia** sin textos introductorios. Los eventos incluyen el botón **«Asistiré»** para que la comunidad confirme asistencia y ese conteo ordene los eventos en tendencia.
- **Cartelera de Eventos (`/eventos`, confirmado 2026-11-16)**: Diseñada como cartelera universitaria de cine y gaceta escolar (marquesina superior con pestañas por sala/espacio, evento destacado en gran formato y rejilla de fichas tipo póster con corte de boleto perforado, horario, ubicación, ponente o club organizador y botón **«Asistiré»** en cada evento), dejando el calendario mensual como un almanaque compacto secundario a la derecha.
- **Vocabulario de Eventos (confirmado 2026-11-18)**. La pantalla se titula «Eventos ESCOM». Usar «evento» y «eventos» en fechas, filtros y conteos. Conservar el afiche, la sede, la asistencia y el calendario.
- **Tarjetas de eventos (confirmado 2026-11-17)**: Conservar el acomodo de la cartelera de cine. Darle protagonismo al afiche y reunir horario y sede en la ficha, con menos recuadros y etiquetas repetidas.
- **Módulo de Comunicados (`/avisos`, confirmado 2026-11-16)**: Presenta únicamente los comunicados de la comunidad a ancho completo (sin barras laterales de trámites, guías ni foro), con buscador interactivo (`⌘K`), filtros directos por categoría con conteos (**Trámites**, **Académico**, **Social**), filtro por carteles y filtro por enlaces, vitrina de destacados y mural jerárquico. Al hacer clic en cualquier comunicado se abre una ventana flotante (popup) animada con navegación entre comunicados, cartel, enlace externo de interés (si existe) y síntesis para difusión sin cambiar de página; publicar o editar un comunicado también abre una ventana flotante sin salir de `/avisos`. Exclusivamente para el rol de Comunicación (y administración) se muestra el panel de **KPIs de Comunicación** con aperturas, clics en enlaces externos, CTR y desglose por comunicado.
- **Aprovechamiento del ancho de pantalla (confirmado 2026-11-16)**: Como la navegación principal está arriba y no en una barra lateral, todas las pantallas deben aprovechar un contenedor amplio (`max-w-[1780px]`).
- **Mapa 3D e inspector paralelo (`/mapa`, confirmado 2026-11-16)**: En escritorio el mapa ocupa una columna más corta (`lg:col-span-7`) para mostrar paralelamente a su derecha (`lg:col-span-5`) el buscador y la ficha detallada del cubículo o espacio seleccionado. Todos los controles de capas/pisos, giro, inclinación, desplazamiento y zoom van integrados como HUD interactivo dentro del propio visor del mapa. En las fichas de espacio se distingue entre ubicaciones confirmadas por el propio profesor (verdad oficial) y sugerencias de alumnos sujetas a votación comunitaria (`Sí está aquí` / `No está`).
- **Clubes y Propuestas (`/clubes`, confirmado 2026-11-17)**: La pantalla principal presenta una barra de búsqueda en tiempo real, pestañas para alternar entre **Clubes activos** y **Propuestas** (más **Panel del área** para moderación de clubes) y el botón **«+ Nuevo club»**, que abre un overlay solicitando únicamente nombre, tipo y objetivo con detección en vivo de clubes o propuestas similares para evitar duplicados. En la pestaña **Propuestas** cada tarjeta muestra su estado real (votos `X/20`, llenado de expedientes individuales por alumno, o espera de envío del registro formal) y habilita el botón **«Tomar el mando y continuar registro»** tras 5 días sin actividad del responsable mediante un overlay de aceptación del rol de alumno moderador.
- **Foro y Guías unificados (`/foro`, confirmado 2026-11-16)**: Foro y Guías comparten una sola ruta y entrada en la navegación (`Foro y Guías`), con estética de mesa de trámites / gaceta escolar sin textos descriptivos de interfaz (sin `"Elige el pizarrón por tema"`). Incluye buscador instantáneo (`⌘K`), filtros por área y tipo, manuales de trámites desplegables en línea con pasos y preguntas frecuentes, dudas cuyos títulos no navegan a otra página y muestran la respuesta oficial de primera mano, además de un historial desplegable estilo Reddit donde cada respuesta puede votarse (`+1` / `-1`) y responderse en línea para que los alumnos se ayuden entre sí.
- El feed es el centro de la comunidad; los avisos oficiales deben distinguirse de las publicaciones de alumnos.
- Cada tarjeta debe mostrar con rapidez autor, área o club, fecha, estado y acciones disponibles.
- En foros, dejar claro si la pregunta está abierta o cuenta con respuesta oficial; hacer visibles búsqueda, filtros y acción de publicar.
- En propuestas de clubes, mostrar el progreso a 20 interesados y los siguientes pasos de documentos, asesoría y cita.
- En móvil, usar navegación y objetivos táctiles legibles; no ocultar secciones principales tras iconos pequeños o interacción exclusiva con hover.
- Mantener foco visible, navegación por teclado y respeto por `prefers-reduced-motion`.

## Sistema visual

- **Identidad compartida (confirmada el 2026-11-17)**. La cartelera de Eventos reserva la serif para sus títulos, por la referencia al teatro y al auditorio. El resto de la interfaz, incluidos los titulares, las tarjetas y la navegación compartida, usa la misma sans serif del texto de lectura. El papel claro y los filetes de tinta dan continuidad entre módulos. Inicio funciona como portada, Avisos como mural, Clubes como directorio, Mapa como plano del plantel y Foro y Guías como espacio de consulta. Los buscadores, pestañas y botones comparten estilo y estados de foco.

- Usar el azul institucional y los activos ESCOM/IPN existentes como base. Evitar acentos morados desconectados de la identidad.
- Dar personalidad con color, textura y señalética de tablero de forma moderada; mantener contraste y lectura antes que decoración.
- Evitar depender de gradientes repetidos, transparencias tipo vidrio, tarjetas idénticas con esquinas muy redondeadas y adornos abstractos para dar personalidad.
- Mantener tipografía, espaciado, botones, etiquetas, estados y superficies consistentes entre páginas.
- Preferencia de tema oscuro/animaciones: no definida; conservar funcionalidad y accesibilidad actuales hasta confirmar una preferencia.

## Referencias pendientes

Todavía no se han entregado capturas o URLs concretas. Cuando el propietario comparta ejemplos, registrar: pantalla/fuente, elementos que quiere replicar, elementos que no quiere, y cómo se traducen a patrones propios de ESCOM.
