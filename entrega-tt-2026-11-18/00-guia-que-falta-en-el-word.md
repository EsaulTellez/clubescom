# Guía rápida: qué le falta o está desactualizado en `TT (1).docx`

Al revisar el archivo `/Users/estrixq/Downloads/TT (1).docx` frente al repositorio actual (corte al **18 de noviembre de 2026**), el documento **ya incluye los capítulos 5, 6, 7 y 8**, pero tiene huecos literales por rellenar, una tabla omitida desde el capítulo 3 y secciones redactadas con fecha de corte del 13 de noviembre (antes de que se terminaran los flujos del 16 al 18 de noviembre).

En esta carpeta (`entrega-tt-2026-11-18/`) están todos los textos y tablas listos para copiar y pegar en Word.

---

## 1. Huecos literales y secciones faltantes en el Word

1. **Índices automáticos al inicio del documento (páginas 3 a 8)**
   - La **Tabla de Contenido** salta del apartado `4.4.2 Diagramas de actividades` directamente a `Referencias`; no muestra los capítulos 5, 6, 7 ni 8 porque no se ha actualizado el campo `TOC` en Word.
   - La **Lista de Tablas** y la **Lista de Figuras** tampoco listan las tablas de los capítulos 5, 6 y 8 ni la Figura 5.1.
   - *Cómo resolverlo en Word:* clic derecho sobre cada índice → **Actualizar campos** → **Actualizar toda la tabla** (después de pegar los textos de esta carpeta).

2. **Capítulo 1 · Tabla 1.1 Presupuesto de Desarrollo (sección 1.6.2)**
   - La última fila (`Total Inversión Laboral`) tiene la celda del monto vacía. Debe decir **`$540,000.00`**.

3. **Capítulo 3 · Falta la Tabla 3.36 en el cuerpo (sección 3.7.9)**
   - En la Lista de Tablas aparece `Tabla 3.36 Especificación de casos de uso de Importación Masiva de Padrones de Usuarios`, pero en la sección `3.7.9` del cuerpo se dejó un espacio en blanco entre la Tabla 3.35 (`CU-ADM-01-01`) y la de Auditoría (`CU-ADM-03-01`). Por eso Word recorrió la numeración de las dos últimas tablas a `3.36` y `3.37`.
   - *Archivo listo para pegar:* `02-capitulo-3-tabla-3.36-faltante.md`.

4. **Capítulo 5 · Marcadores `[Pendiente]` y `[Completar]`, stack desactualizado y falta de sección de implementación (secciones 5.1, 5.2 y 5.3)**
   - **5.1.1 Stack tecnológico:** declara `Node.js >=20.9.0` y `Next.js 16.4.2`, cuando `package.json` usa `Node.js >=22.13.0` y `Next.js 16.4.6`, y omite las librerías que procesan documentos y OCR local en guías (`pdfjs-dist`, `tesseract.js`, `@napi-rs/canvas`, `fflate`, `saxes`).
   - **5.2.4 Tabla 5.4 (Ciclo 3, semana 13, cuadrante Evaluación):** tiene el marcador literal `[Pendiente: definir la actividad de evaluación del ciclo]`.
   - **5.2.5 Tabla 5.9 (Riesgos principales por ciclo):** las 7 filas de la columna `Estado al cierre` dicen literalmente `[Completar]`.
   - **Falta la sección 5.3 (Implementación del sistema por capas y módulos):** el capítulo se llama *Desarrollo e Implementación*, pero termina en la tabla de riesgos del espiral sin describir la implementación real de la base de datos (`public` y `private`), las políticas RLS, los buckets de Storage ni los módulos construidos.
   - *Archivo listo para pegar:* `03-capitulo-5-completado.md`.

5. **Capítulo 6 · Discrepancia con scripts de prueba y corte desactualizado del 13 de noviembre**
   - El texto actual del capítulo 6 afirma que al 13 de noviembre se ejecutó `Vitest (npm test)` sobre `auth.test.ts` y `roster-csv.test.ts`, además de `npm run test:integracion`. Esos archivos y scripts no forman parte de esta copia del repositorio.
   - Además, las Tablas **6.4 (Casos de prueba funcionales PF-01 a PF-12)** y **6.5 (Matriz de trazabilidad)** marcan como "pendientes" o "no implementados" módulos que **sí quedaron implementados entre el 16 y el 18 de noviembre**: triggers de insignias (`RF-04`), programación de avisos con `trigger_scheduled_avisos` y `pg_cron` (`RF-07`), generación de guías desde PDF/DOCX/imágenes con OCR y adjuntos PDF descargables (`CU-09`, `RF-12`), adjunto PDF del plan de trabajo y toma de propuesta por inactividad (`CU-17`, `RF-18`), preguntas y analíticas por paso en guías (`CU-11`, `CU-12`), segunda foto, evidencia de reclamo, lector QR y cierre administrativo en objetos (`CU-21` a `CU-24`), mapa 3D con buscador de cubículos y sugerencias (`CU-25` a `CU-27`), auditoría con valor anterior/nuevo e IP (`CU-34`, `RF-35`) y scripts de respaldo (`scripts/backup.sh` y `scripts/restore.sh`, `RNF-11`).
   - *Archivo listo para pegar:* `04-capitulo-6-pruebas-actualizado.md` (respaldado por la corrida real en `evidencia/reglas.mjs` y `evidencia/reglas.txt`).

6. **Capítulo 7 · Falta la sección `7.6` citada en el propio texto y datos desactualizados en `7.3` y `7.4`**
   - Al final de `7.5 Monitoreo y mantenimiento`, el Word dice: *"Los manuales de operación se proponen como anexos (véase 7.6)"*, pero inmediatamente después empieza el Capítulo 8; **la sección 7.6 nunca se incluyó**.
   - En `7.3` dice que `scripts/seed.mjs` crea 12 cuentas (actualmente aprovisiona **21 cuentas** con todos los roles, áreas institucionales, 4 clubes con parejas distintas de alumno responsable y profesor asesor, integrantes y alumna libre).
   - En `7.4` no menciona los scripts `scripts/backup.sh` y `scripts/restore.sh` ya incluidos en el repositorio, ni la sincronización de esquema con el proyecto remoto de Supabase (`clebescom`).
   - *Archivo listo para pegar:* `05-capitulos-7-y-8-actualizados.md`.

7. **Capítulo 8 y Referencias · Resumen con corte antiguo y cita de Boehm (1988)**
   - El capítulo 8 sigue reportando como trabajo futuro funciones que ya se construyeron en el repositorio (como `CU-09` con extracción desde PDF/DOCX, programación de avisos, edición y reordenamiento de pasos en guías, historial bilateral de objetos y respaldos).
   - En la sección `5.2.1` se cita a `Boehm (1988)` para el modelo en espiral, pero en la sección `Referencias` solo hay 16 entradas y no aparece la referencia de Boehm.
   - *Archivo listo para pegar:* `05-capitulos-7-y-8-actualizados.md`.
