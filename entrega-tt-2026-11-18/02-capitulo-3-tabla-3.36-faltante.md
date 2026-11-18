# Textos faltantes de los Capítulos 1 y 3

## 1. Capítulo 1 · Sección 1.6.2 (Tabla 1.1 Presupuesto de Desarrollo)

En la **Tabla 1.1 Presupuesto de Desarrollo** (página 21), la última fila (`Total Inversión Laboral`) tiene vacía la celda de la columna `Total (MXN)`. Debe completarse así:

| Concepto | Cantidad | Costo Mensual (MXN) | Duración | Total (MXN) |
| --- | --- | --- | --- | --- |
| Desarrolladores Full-stack | 2 | $30,000.00 | 9 meses | $540,000.00 |
| Licencias de Software | - | $0.00 (Open Source) | - | $0.00 |
| **Total Inversión Laboral** | **2** | **$30,000.00** | **9 meses** | **$540,000.00** |

---

## 2. Capítulo 3 · Sección 3.7.9 (Tabla 3.36 faltante en el cuerpo)

**Dónde pegarla en el Word:** En la sección `3.7.9 Especificaciones de casos de uso modulo 9`, justo debajo del título `Tabla 3.35 Especificación de casos de uso de Dashboard de Control Centralizado` y antes de `Figura 3.42 Diagrama de especificación de casos de uso de Auditoría de Acciones del Sistema (Logs)`.

Al insertar esta tabla con su título de tabla (`Insertar título` → `Tabla`), Word volverá a numerar automáticamente esta como **Tabla 3.36**, la de Auditoría como **Tabla 3.37** y la de Reportes de Impacto como **Tabla 3.38**, quedando alineadas con la Lista de Tablas del inicio del documento.

### Tabla lista para copiar y pegar:

| Campo | Contenido |
| --- | --- |
| **Caso de Uso** | **CU-ADM-02-01: Importación Masiva de Padrones de Usuarios** |
| **Actor(es)** | Administrador General / Sistema (Supabase Auth) |
| **Descripción** | Permite dar de alta por lotes a alumnos y profesores a partir de un archivo CSV institucional, validando dominios, formato y duplicados antes de emitir las invitaciones de acceso. |
| **Precondiciones** | El usuario debe tener sesión activa con el rol `admin` y contar con un archivo CSV con encabezados `nombre` y `correo` que no supere 200 registros ni 2 MB. |
| **Flujo Principal** | 1. El administrador accede al módulo de importación de padrón dentro del panel de administración. <br>2. El administrador selecciona el archivo CSV desde su equipo. <br>3. El sistema analiza el archivo en el navegador, detecta el delimitador y valida que cada fila contenga un nombre válido y un correo con dominio `@alumno.ipn.mx` o `@ipn.mx`, sin repeticiones dentro del lote. <br>4. El sistema presenta una vista previa dividida en registros válidos e incidencias detectadas. <br>5. El administrador confirma la importación del lote válido. <br>6. El sistema registra o invita a cada usuario mediante Supabase Auth asignando únicamente el rol ordinario derivado de su dominio (`alumno` o `profesor`), sin conceder permisos de moderación ni administración desde el archivo, y guarda el evento en la bitácora de auditoría. |
| **Flujos Alternos** | **A1: Filas con error o correos duplicados:** El sistema separa las filas inválidas en la vista previa y habilita la descarga del archivo `errores-padron-escom.csv` con el número de fila, correo y motivo del rechazo para su corrección. <br>**A2: Correo ya registrado en la plataforma:** El sistema omite la creación duplicada, conserva intacta la cuenta existente y lo informa en el resumen final del lote. |
| **Postcondiciones** | Las cuentas nuevas quedan aprovisionadas con su rol institucional ordinario, se envían las invitaciones de acceso al correo correspondiente y la operación queda registrada en `audit_logs`. |

**Pie de tabla:** `Tabla 3.36 Especificación de casos de uso de Importación Masiva de Padrones de Usuarios`
