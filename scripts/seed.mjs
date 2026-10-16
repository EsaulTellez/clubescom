import bcrypt from "bcryptjs";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const password = await bcrypt.hash("Escom2026!", 10);

const people = [
  ["daniel.alumno@alumno.ipn.mx", "Daniel Díaz Ramírez", "2023630001", "alumno", null],
  ["esaul.alumno@alumno.ipn.mx", "Esaul Téllez De La Cruz", "2023630002", "alumno", null],
  ["profesor@ipn.mx", "Profesor Asesor", "EMP-100", "profesor", null],
  ["comunicacion@ipn.mx", "Elizabeth Moreno", "EMP-200", "moderador", "comunicacion"],
  ["gestion@ipn.mx", "Erick Fernández", "EMP-201", "moderador", "gestion_escolar"],
  ["clubes@ipn.mx", "María del Rosario Galeana", "EMP-202", "moderador", "clubes_academicos"],
  ["admin@ipn.mx", "Administración ESCOM", "EMP-001", "admin", null],
];

for (const [email, name, boleta, role, area] of people) {
  await pool.query(
    `insert into users (email, password_hash, name, boleta, role, area, email_verified)
     values ($1, $2, $3, $4, $5, $6, true)
     on conflict (email) do nothing`,
    [email, password, name, boleta, role, area],
  );
}

const admin = await pool.query("select id from users where email = $1", ["comunicacion@ipn.mx"]);
const author = admin.rows[0].id;
const daniel = (await pool.query("select id from users where email = $1", ["daniel.alumno@alumno.ipn.mx"])).rows[0].id;
const profe = (await pool.query("select id from users where email = $1", ["profesor@ipn.mx"])).rows[0].id;

await pool.query(
  `insert into avisos (author_id, title, body, category, featured, social_copy)
   select $1, $2, $3, $4, true, $5
   where not exists (select 1 from avisos where title = $2)`,
  [author, "Inicio de semestre 2026-B", "Consulta horarios, trámites de inscripción y actividades de bienvenida en un solo feed.", "academico", "ESCOM informa: inicia el semestre 2026-B. Revisa trámites y horarios en la plataforma institucional."],
);

await pool.query(
  `insert into spaces (name, kind, building, description)
   select $1, $2, $3, $4
   where not exists (select 1 from spaces where name = $1)`,
  ["Auditorio", "auditorio", "Edificio principal", "Itinerario público. Lo registra la dirección."],
);
await pool.query(
  `insert into spaces (name, kind, building, description)
   select $1, $2, $3, $4
   where not exists (select 1 from spaces where name = $1)`,
  ["Sala 14", "sala", "Edificio 1", "Sala de reuniones de clubes académicos."],
);

await pool.query(
  `insert into cubicles (professor_id, label, building, floor, x, y)
   select $1, 'Cubículo 12', 'Edificio 2', '1', 30, 40
   where not exists (select 1 from cubicles where label = 'Cubículo 12')`,
  [profe],
);

await pool.query(
  `insert into badges (user_id, code, label)
   values ($1, 'pionero', 'Cuenta de demostración')
   on conflict (user_id, code) do nothing`,
  [daniel],
);

const moreNews = [
  ["academico", "Reinscripciones reiniciadas", "Gestión Escolar publicó el calendario de reinscripción y los documentos que sí se piden en ventanilla.", false],
  ["social", "ESCOM celebra 30 años", "Habrá actividades abiertas en explanada durante la semana del aniversario. El itinerario se consulta en Espacios.", true],
  ["social", "ESCOM vs ESIA", "Partido de exhibición este viernes a las 16:30 en la cancha 6 de Zacatenco. Entrada libre para la comunidad.", true],
  ["tramites", "Becas: confirma tu expediente", "Si tu solicitud quedó en revisión, sube la constancia antes del viernes. La guía del trámite ya está publicada.", false],
];

for (const [category, title, body, featured] of moreNews) {
  await pool.query(
    `insert into avisos (author_id, title, body, category, featured, social_copy)
     select $1, $2, $3, $4, $5, $6
     where not exists (select 1 from avisos where title = $2)`,
    [author, title, body, category, featured, `ESCOM | ${category}: ${title}. ${body}`],
  );
}

const clubRows = [
  ["Club de Algoritmia", "academico", "Entrenamiento para concursos de programación, sesiones de problemas y acompañamiento para quien va empezando.", "Martes y jueves · 16:00"],
  ["Club de Robótica", "academico", "Armado, electrónica y competencias. El taller está abierto a cualquier semestre.", "Miércoles · 15:00"],
];

for (const [name, kind, description, schedule] of clubRows) {
  await pool.query(
    `insert into clubs (name, kind, description, schedule, leader_id, advisor_id, active)
     select $1, $2, $3, $4, $5, $6, true
     where not exists (select 1 from clubs where name = $1)`,
    [name, kind, description, schedule, daniel, profe],
  );
}

await pool.end();
console.log("Seed listo. Contraseña de todas las cuentas: Escom2026!");
