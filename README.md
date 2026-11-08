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
| Moderador | Lo asigna un administrador, con un área | Publica y atiende el contenido de su área. |
| Administrador general | Lo asigna un administrador | Administra cuentas, roles y el panel general. |
| Visitante | Sin cuenta | Lee avisos, clubes, guías y el mapa. |

Las áreas que usa la plataforma son comunicación, clubes académicos, gestión escolar, becas, CATT, prefectura y clubes culturales.

## Qué no hace

La plataforma es solo para la ESCOM. No cubre otras escuelas del IPN.

Orienta sobre trámites. No los ejecuta en SAES ni en el Sistema de Becas, y no se conecta a calificaciones, padrones ni horarios institucionales.

No entrega un objeto en persona ni exige que un prefecto esté presente. Tampoco deja al director como único responsable del itinerario del auditorio, ni admite clubes informales. La documentación de un club (IMSS, credencial, firmas) no queda validada aquí: esa revisión sigue siendo física, a cargo de la encargada del área.

## Ejecutar el proyecto

### Requisitos

- [Node.js](https://nodejs.org/) 20.9 o superior y npm 10 o superior.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) abierto y en ejecución.
- La [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Puede instalarse globalmente con `npm install -g supabase` o ejecutarse con `npx supabase`.

Funciona en macOS, Linux y Windows. En Windows usa PowerShell o WSL y verifica que Docker Desktop esté iniciado antes de continuar.

### Primera ejecución

Desde la carpeta clonada del repositorio, ejecuta los siguientes comandos en orden:

```bash
npm ci
npm run db:up
npm run env:local
npm run db:seed
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Abre [http://127.0.0.1:3001](http://127.0.0.1:3001). El primer inicio de Supabase puede tardar porque Docker descarga las imágenes necesarias. Si `npm ci` no es posible porque modificaste las dependencias, usa `npm install` para regenerar el archivo de bloqueo.

El comando `db:up` inicia PostgreSQL, Auth, Storage, Realtime, Studio y Mailpit en tu equipo. `env:local` crea el archivo privado `.env.local` con las claves de esa instancia; no hay que copiar ni editar `.env.example` para el arranque normal.

### Cuentas de demostración

La contraseña de todas las cuentas de demostración es `Escom2026!`. Los correos y roles disponibles están definidos en `scripts/seed.mjs`.

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
