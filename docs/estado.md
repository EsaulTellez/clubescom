# Estado de los casos de uso

Cualquier agente que implemente, cambie o cierre un caso de uso actualiza este archivo en el mismo cambio. Anota el estado (`hecho`, `parcial` o `pendiente`), la fecha y una línea de qué cambió.

Pase inicial: 2026-10-29. Se contrastó `docs/fuente/TT.docx` con esta app local. No se tocó el código.

Conteos del índice (tablas 3.4 a 3.38, 35 casos): **hecho 1**, **parcial 28**, **pendiente 6**.

El cuerpo trae 2 casos más, sin número de tabla. Los dos están en parcial. Tablero completo: **hecho 1**, **parcial 30**, **pendiente 6**.

Un caso del índice no trae pasos en el texto extraído: CU-33.

| id | nombre | estado | evidencia |
| --- | --- | --- | --- |
| CU-01 | Registro y autenticación | parcial | `src/lib/auth-actions.ts` |
| CU-02 | Recuperación de credenciales | parcial | `src/app/recuperar/page.tsx` |
| CU-03 | Restricción de acceso (baneo) | parcial | `src/app/admin/actions.ts` |
| CU-04 | Otorgamiento automático de insignias | parcial | `src/app/perfil/page.tsx` |
| CU-05 | Gestión de contenido por área | parcial | `src/app/guias/actions.ts` |
| CU-06 | Generación inteligente de formatos | parcial | `src/app/avisos/aviso-form.tsx` |
| CU-07 | Gestión de publicaciones y programación | parcial | `src/app/avisos/actions.ts` |
| CU-08 | Actualización del feed en tiempo real | parcial | `src/app/page.tsx` |
| CU-09 | Generación de guía por parsing | parcial | `src/app/guias/nueva/guide-form.tsx` |
| CU-10 | Recuperación ante búsqueda fallida | hecho | `src/app/guias/page.tsx` |
| CU-11 | Dudas específicas en un paso de guía | pendiente | no hay |
| CU-12 | Análisis de impacto y uso | pendiente | no hay |
| CU-13 | Publicación de dudas con sugerencias | parcial | `src/app/foro/actions.ts` |
| CU-14 | Oficialización de respuestas | parcial | `src/app/foro/[id]/page.tsx` |
| CU-15 | Moderación automática y strikes | pendiente | no hay |
| CU-16 | Alertas de dudas desatendidas | pendiente | no hay |
| CU-17 | Propuesta y validación social de clubes | parcial | `src/app/clubes/actions.ts` |
| CU-18 | Código de profesor asesor | parcial | `src/app/clubes/actions.ts` |
| CU-19 | Registro oficial por la encargada | parcial | `src/app/clubes/actions.ts` |
| CU-20 | Ingreso y membresía | parcial | `src/app/clubes/[id]/page.tsx` |
| CU-21 | Reporte de objeto | parcial | `src/app/objetos/actions.ts` |
| CU-22 | Matching por similitud de texto | parcial | `src/app/objetos/actions.ts` |
| CU-23 | Reclamo y código de entrega | parcial | `src/app/objetos/[id]/claim-form.tsx` |
| CU-24 | Cierre del reporte | parcial | `src/app/objetos/page.tsx` |
| CU-25 | Mapa del campus | parcial | `src/app/espacios/page.tsx` |
| CU-26 | Localización de profesores | parcial | `src/app/espacios/page.tsx` |
| CU-27 | Actualización de cubículo | parcial | `src/app/espacios/actions.ts` |
| CU-28 | Itinerario de espacios | parcial | `src/app/espacios/page.tsx` |
| CU-29 | Centro de notificaciones | parcial | `src/app/notificaciones/page.tsx` |
| CU-30 | Alertas por correo | parcial | `src/app/notificaciones/actions.ts` |
| CU-31 | Aviso masivo al llegar a 20 | parcial | `src/app/clubes/actions.ts` |
| CU-32 | Panel de conteos y roles | parcial | `src/app/admin/page.tsx` |
| CU-33 | Importación masiva de padrones | pendiente | no hay |
| CU-34 | Auditoría de acciones | parcial | `src/app/admin/page.tsx` |
| CU-35 | Reportes de impacto académico | pendiente | no hay |
| CU-COM-04-01 | Consulta y filtrado de avisos | parcial | `src/app/avisos/page.tsx` |
| CU-GUA-02-01 | Sugerencia de mejora en una guía | parcial | `src/app/guias/actions.ts` |

## Cambios

- 2026-10-29. CU-10 hecho: el catálogo busca título y resumen, sugiere hasta tres guías similares y ofrece ir al foro del área cuando no encuentra una coincidencia.
- 2026-10-29. CU-08 sigue parcial: el inicio presenta avisos en una portada tipo feed y usa tipografías DM Sans y Plus Jakarta Sans; cuatro publicaciones de demo muestran los carteles compartidos. No hay actualización en tiempo real por WebSocket.
- 2026-10-29. CU-25 sigue parcial: se añadió una vista isométrica ilustrativa reconstruida a partir del croquis de ESCOM y alternancia al plano original; faltan mapas por nivel y búsqueda de aulas.
- 2026-10-29. CU-17 sigue parcial: el directorio del Club de Algoritmia muestra su logo compartido; no cambia el flujo de propuestas y registro.
- 2026-10-29. CU-20 sigue parcial: la comunidad del club muestra publicaciones, eventos, integrantes y membresía; falta completar aprobaciones y reglas administrativas del caso.
- 2026-10-29. CU-28 sigue parcial: Espacios agrega cartelera mensual con navegación por mes y filtro por día sobre reservas públicas; no calcula rutas ni conflictos entre espacios.
- 2026-10-29. CU-29 sigue parcial: al abrir una notificación, ahora se marca como leída y redirige al recurso; no hay contador en tiempo real.
- 2026-10-29. Pase inicial. Estados de arriba, tomados del código local frente al Word. Ningún caso queda en `hecho`: cada flujo pedido todavía omite una parte (correo, QR, parsing, RLS efectivo, reportes, etc.).
