# Plataforma de gestión de actividades de la ESCOM

Trabajo Terminal 2026-B155.

Autores: Díaz Ramírez Daniel y Téllez De La Cruz Esaul.  
Directora: Dra. Mónica Rivera De La Rosa.

## De qué trata

La ESCOM reparte avisos, trámites, clubes, espacios y objetos perdidos entre redes, ventanillas y la memoria del personal. Esta aplicación web concentra esa información en un solo lugar: la gestión de las actividades estudiantiles y la orientación administrativa, con la participación de las unidades de la escuela.

Quien entra sin cuenta puede leer lo público. Quien se registra con correo institucional puede proponer un club, reportar un objeto, preguntar por un trámite o consultar una guía. El personal de cada área publica y responde lo que le corresponde.

## Módulos

- **Identidad y roles.** Alta con correo institucional, sesión, perfil e insignias. El visitante lee el contenido público y no publica.
- **Comunicación institucional.** Avisos con categoría, formato para redes, carrusel y feed.
- **Clubes.** Directorio, propuesta, umbral de veinte interesados, profesor asesor y membresías. Solo clubes reconocidos por la ESCOM.
- **Objetos perdidos.** Reporte, coincidencia, pregunta de seguridad y cierre del caso. La validación del reclamo es digital.
- **Foro de trámites.** Preguntas por área, respuesta del personal y votos.
- **Guías.** Pasos de un trámite, preguntas frecuentes y sugerencias de mejora.
- **Infraestructura.** Mapa de cubículos e itinerario de espacios, entre ellos la Sala 14 y el auditorio.
- **Notificaciones y administración.** Avisos dentro de la plataforma y panel para conteos, roles y auditoría.

## Quién la usa

| Actor | Cómo entra | Qué hace |
| --- | --- | --- |
| Alumno | Correo `@alumno.ipn.mx` | Consulta, propone clubes, reporta objetos y pregunta en el foro. |
| Profesor | Correo `@ipn.mx` | Participa como asesor y actualiza la información de su cubículo. |
| Moderador | Lo asigna el superadministrador, con un área | Publica y atiende el contenido de su área. |
| Administración | Rol `admin` | Gestiona los módulos y el panel general. La cuenta de operación también puede activar el perfil de alumno o profesor. |
| Superadministración | Atributo protegido de una cuenta de administración | Administra el sistema y asigna roles y áreas. |
| Visitante | Sin cuenta | Lee avisos, clubes, guías y el mapa. |

Las áreas que usa la plataforma son comunicación, clubes académicos, gestión escolar, becas, CATT, prefectura, clubes culturales y Subdirección Académica.

## Qué no hace

La plataforma es solo para la ESCOM. No cubre otras escuelas del IPN.

Orienta sobre trámites. No los ejecuta en SAES ni en el Sistema de Becas, y no se conecta a calificaciones, padrones ni horarios institucionales.

No entrega un objeto en persona ni exige que un prefecto esté presente. Tampoco deja al director como único responsable del itinerario del auditorio, ni admite clubes informales. La documentación de un club (IMSS, credencial, firmas) no queda validada aquí: esa revisión sigue siendo física, a cargo de la encargada del área.

## Ejecutar el proyecto

### Producción en Vercel

Importa la rama `main` desde la raíz del repositorio. Selecciona **Next.js**, Node.js **24.x** y el comando de compilación `npm run build`. Conserva el directorio de salida automático. Para reproducir el servidor de producción en tu equipo, ejecuta `npm run build` y después `npm start`. El comando `npm run dev` sirve para desarrollo local.

Configura las variables del entorno **Production** antes de compilar. Las variables `NEXT_PUBLIC_*` se integran al build. Si cambian, genera un despliegue nuevo.

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` corresponden a la URL HTTPS y la clave pública del mismo proyecto Supabase.
- `SUPABASE_SECRET_KEY` es la clave privada de administración. `DATABASE_URL` es la cadena privada del **Session pooler** de ese proyecto en el puerto **5432**. Algunas operaciones conservan el rol de PostgreSQL durante toda una conexión. La aplicación verifica TLS con la CA pública de Supabase incluida en `db/supabase-prod-ca-2021.crt`.
- `NEXT_PUBLIC_SITE_URL` es el origen HTTPS definitivo de la plataforma. Puedes omitirla para usar el dominio de producción que Vercel proporciona al build. Si usas un dominio personalizado, escribe la URL completa.
- `GOOGLE_GENERATIVE_AI_API_KEY` habilita la generación de comunicados y el procesamiento de documentos. Para el correo de coordinación de clubes por Resend, configura `RESEND_API_KEY` y `MAIL_FROM_EMAIL` con un remitente verificado.

En **Supabase Auth**, configura el mismo dominio en **Site URL**, permite el callback `/auth/callback` con sus parámetros de recuperación y activa la confirmación de correo. Configura SMTP para entregar mensajes a las cuentas institucionales. El formulario espera un OTP de seis dígitos con vigencia de 900 segundos. Las plantillas de confirmación y recuperación están en `supabase/templates/`.

La base necesita el esquema de `supabase/migrations/`, incluidos permisos, buckets de Storage y publicación Realtime. Para una base nueva, aplica las migraciones una vez antes del primer despliegue. El proyecto remoto existente tiene un historial agrupado. Compara su esquema antes de aplicar cambios. Reserva `npm run db:seed` y Docker Compose para la demo local.

Los adjuntos que pasan por Server Actions están sujetos al máximo de **4.5 MB por petición completa** de Vercel. Los límites por archivo de algunas pantallas son mayores. Para admitir esos tamaños en Vercel hace falta subir los archivos directamente a Storage. [Límites de Vercel Functions](https://vercel.com/docs/functions/limitations#request-body-size)

### Con Docker Compose

Instala y abre [Docker Desktop](https://www.docker.com/products/docker-desktop/) (o Docker Engine con el complemento Compose). En la carpeta del repositorio ejecuta:

```bash
docker compose up -d
```

La primera ejecución descarga las imágenes y construye la aplicación. Compose inicia PostgreSQL, Auth, Storage, Realtime y Mailpit, aplica las migraciones y carga las cuentas de demostración en una base vacía. Abre [http://127.0.0.1:3001](http://127.0.0.1:3001); los mensajes de prueba están en [Mailpit](http://127.0.0.1:54324). La contraseña de las cuentas demo es `Escom2026!`.

Los servicios usan los puertos locales 3001, 54321 y 54324. Si ya ejecutas Supabase con su CLI, detén esa instalación o libera los puertos antes de iniciar Compose. Los datos y archivos de Compose se guardan en volúmenes separados de la instalación con la CLI.

Para detener los contenedores sin borrar los datos, ejecuta `docker compose down`. Para reconstruir tras cambios en el código, ejecuta `docker compose up -d --build`. `docker compose down -v` elimina también la base y los archivos de Compose.

Esta configuración es exclusivamente para una demo local: usa credenciales públicas de prueba y solo expone los servicios a la propia computadora. La clave opcional de IA se puede pasar como `GOOGLE_GENERATIVE_AI_API_KEY` en el entorno de Compose.

### Alternativa: Node y Supabase CLI

### Requisitos

- [Node.js](https://nodejs.org/) 22 o superior y npm 10 o superior.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) abierto y en ejecución.
- La [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Puede instalarse globalmente con `npm install -g supabase` o ejecutarse con `npx supabase`.

Funciona en macOS, Linux y Windows. En Windows usa PowerShell o WSL y verifica que Docker Desktop esté iniciado antes de continuar.

### Primera ejecución

Con Docker Desktop abierto, desde la carpeta clonada ejecuta un solo comando:

```bash
node scripts/iniciar.mjs
```

Abre [http://127.0.0.1:3001](http://127.0.0.1:3001). El primer inicio de Supabase puede tardar porque Docker descarga las imágenes necesarias. Si `npm ci` no es posible porque modificaste las dependencias, usa `npm install` para regenerar el archivo de bloqueo.

El comando instala las dependencias si faltan, inicia los contenedores de Supabase, aplica migraciones pendientes, prepara `.env.local` e inicia la aplicación. Carga las cuentas de demostración únicamente si la base no contiene usuarios; no reinicia ni sustituye los datos existentes. Supabase CLI administra los contenedores de PostgreSQL, Auth, Storage, Realtime, Studio y Mailpit; el antiguo Compose de PostgreSQL independiente no era compatible con estos servicios.

### Cuentas de demostración

La contraseña de todas las cuentas de demostración es `Escom2026!`. Los correos y roles disponibles están definidos en `scripts/seed.mjs`.

- `superadmin@ipn.mx` abre el panel de administración y asigna moderadores por área.
- `operacion@ipn.mx` gestiona todos los módulos. En **Perfil → Perfil de operación** puede pasar a alumno o profesor y volver a administración con la misma identidad.
- `alumna.libre@alumno.ipn.mx` empieza sin club. `esaul.alumno@alumno.ipn.mx` es integrante. `daniel.alumno@alumno.ipn.mx` y `profesor@ipn.mx` moderan Algoritmia como responsable y asesor. Robótica, Cine y Fútbol tienen otras parejas.
- `becas@ipn.mx` atiende Becas y Auditorio. `subdireccion@ipn.mx` gestiona clubes académicos y Sala 14. `catt@ipn.mx` y `gestion@ipn.mx` atienden sus propios trámites y guías.

Para actualizar las cuentas y relaciones de la demo existente, ejecuta `supabase migration up --local` y después `npm run db:seed -- --users-only`. Para el proyecto remoto, usa el [prompt de aprovisionamiento con Supabase](docs/prompt-supabase.md).

Para abrir los mensajes de confirmación y recuperación de cuenta, usa Mailpit en [http://127.0.0.1:54324](http://127.0.0.1:54324).

### Configuración opcional de IA

Las funciones que usan IA requieren una clave de Google. Después de ejecutar `npm run env:local`, agrega esta línea a `.env.local`:

```env
GOOGLE_GENERATIVE_AI_API_KEY=tu_clave
```

Sin esa variable, el resto de la plataforma y los datos de demostración siguen funcionando.

### Detener o reiniciar los servicios

```bash
# Detiene la base de datos y los servicios locales
npm run db:down

# Borra y recrea la base de datos local con las migraciones y datos semilla
npm run db:reset
```

Después de `db:reset`, ejecuta de nuevo `npm run env:local` y `npm run db:seed` antes de iniciar la aplicación.

### Problemas frecuentes

- **Docker no responde:** abre Docker Desktop y espera a que indique que el motor está listo.
- **Un puerto está ocupado:** los servicios usan los puertos 3001, 54321, 54322, 54323 y 54324. Libera el puerto indicado o detén el proceso que lo ocupa.
- **Variables locales desactualizadas:** ejecuta `npm run env:local` con Supabase activo.
- **Base de datos en estado inconsistente:** usa `npm run db:reset`, luego `npm run env:local` y `npm run db:seed`.

El detalle del alcance, de los casos de uso y de lo que ya está construido está en `docs/proyecto.md`, `docs/casos-de-uso.md` y `docs/estado.md`.
