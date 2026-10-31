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

## Cómo correrla en local

Hace falta Docker, Node.js y un archivo `.env.local` con `DATABASE_URL` apuntando al Postgres del compose.

```bash
docker compose up -d
npm install
npm run db:seed
npm run dev
```

La contraseña de las cuentas de demostración es `Escom2026!`. Esas cuentas están en `scripts/seed.mjs`.

El detalle del alcance, de los casos de uso y de lo que ya está construido está en `docs/proyecto.md`, `docs/casos-de-uso.md` y `docs/estado.md`.
