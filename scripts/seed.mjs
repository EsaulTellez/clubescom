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

const gestion = (await pool.query("select id from users where email = $1", ["gestion@ipn.mx"])).rows[0].id;
const adminId = (await pool.query("select id from users where email = $1", ["admin@ipn.mx"])).rows[0].id;

const questions = [
  ["gestion_escolar", "¿La reinscripción se puede hacer solo en línea?", "En el calendario dice que hay un día de ventanilla y no queda claro si el resto es en el SAES."],
  ["becas", "¿Qué hago si mi constancia salió con otro promedio?", "La guía pide el kardex, pero mi constancia de estudios no coincide con el semestre que estoy cursando."],
  ["catt", "¿Cuándo se entrega el protocolo del trabajo terminal?", "Quiero saber la fecha de este semestre y si el director tiene que firmar antes de subirlo."],
  ["general", "¿Dónde está la Sala 14?", "La encargada de clubes la menciona para juntas y en el mapa no aparece el piso."],
];
for (const [area, title, body] of questions) {
  await pool.query(
    `insert into questions (author_id, area, title, body)
     select $1, $2, $3, $4
     where not exists (select 1 from questions where title = $3)`,
    [daniel, area, title, body],
  );
}

const guideSteps = JSON.stringify([
  { title: "Revisa el calendario", body: "Confirma las fechas del semestre en Gestión Escolar antes de formar tu horario." },
  { title: "Arma tu selección", body: "Elige grupos con cupo. Si uno se cierra, deja una segunda opción del mismo turno." },
  { title: "Confirma en ventanilla solo si te lo piden", body: "Lleva identificación y boleta. Si el sistema ya muestra inscrito, no hace falta fila." },
]);
const guideFaqs = JSON.stringify([
  { q: "¿Puedo cambiar de grupo después?", a: "Solo en el periodo de ajustes y si el grupo destino tiene lugar." },
]);
await pool.query(
  `insert into guides (author_id, area, title, summary, steps, faqs)
   select $1, 'gestion_escolar', 'Reinscripción', 'Tres pasos para no llegar a ventanilla con la duda de siempre.', $2::jsonb, $3::jsonb
   where not exists (select 1 from guides where title = 'Reinscripción')`,
  [gestion, guideSteps, guideFaqs],
);
await pool.query(
  `insert into guides (author_id, area, title, summary, steps, faqs)
   select $1, 'becas', 'Expediente de beca', 'Qué documento sí piden y cuál sobra cuando el promedio ya está en el sistema.', $2::jsonb, '[]'::jsonb
   where not exists (select 1 from guides where title = 'Expediente de beca')`,
  [gestion, JSON.stringify([
    { title: "Descarga la constancia", body: "Tiene que decir el semestre en curso, no el anterior." },
    { title: "Sube el archivo en la guía", body: "PDF legible, una sola cara por hoja. El original se queda contigo." },
  ])],
);

const lost = [
  ["perdido", "Mochila azul con laptop", "Mochila azul marino, cierre rojo, en el bolsillo de enfrente hay un cargador blanco.", "Explanada, junto a las bancas", "¿De qué color es el cargador?", "blanco"],
  ["encontrado", "Credencial del IPN", "La encontré en el piso del laboratorio 3. El nombre empieza con D.", "Laboratorio 3", "¿Cuál es la boleta?", "2023630001"],
];
for (const [kind, title, description, place, question, answer] of lost) {
  const hash = (await import("node:crypto")).createHash("sha256").update(answer).digest("hex");
  await pool.query(
    `insert into lost_items (reporter_id, kind, title, description, place, security_question, security_answer_hash)
     select $1, $2, $3, $4, $5, $6, $7
     where not exists (select 1 from lost_items where title = $3)`,
    [daniel, kind, title, description, place, question, hash],
  );
}

const auditorio = await pool.query("select id from spaces where name = 'Auditorio'");
const sala = await pool.query("select id from spaces where name = 'Sala 14'");
if (auditorio.rows[0]) {
  await pool.query(
    `insert into bookings (space_id, title, starts_at, ends_at, is_public, created_by)
     select $1, 'Ceremonia de aniversario', now() + interval '3 days', now() + interval '3 days 2 hours', true, $2
     where not exists (select 1 from bookings where title = 'Ceremonia de aniversario')`,
    [auditorio.rows[0].id, adminId],
  );
}
if (sala.rows[0]) {
  await pool.query(
    `insert into bookings (space_id, title, starts_at, ends_at, is_public, created_by)
     select $1, 'Junta de clubes académicos', now() + interval '1 day', now() + interval '1 day 1 hour', true, $2
     where not exists (select 1 from bookings where title = 'Junta de clubes académicos')`,
    [sala.rows[0].id, adminId],
  );
}

await pool.query(
  `insert into club_proposals (proposer_id, name, kind, description, status)
   select $1, 'Club de Ajedrez', 'cultural', 'Partidas abiertas los viernes en la explanada. Buscamos asesor y veinte personas para formalizarlo.', 'abierta'
   where not exists (select 1 from club_proposals where name = 'Club de Ajedrez')`,
  [daniel],
);

const reinscripcion = await pool.query("select id from questions where title = $1", [
  "¿La reinscripción se puede hacer solo en línea?",
]);
if (reinscripcion.rows[0]) {
  await pool.query(
    `insert into answers (question_id, author_id, body, official)
     select $1, $2, $3, true
     where not exists (
       select 1 from answers where question_id = $1 and official = true
     )`,
    [
      reinscripcion.rows[0].id,
      gestion,
      "Sí. Si el SAES ya te muestra inscrito, no tienes que formarte. La ventanilla es solo para quien el sistema rechazó por cupo o por documento.",
    ],
  );
}

await pool.query(
  `insert into notifications (user_id, title, body, href)
   select $1, 'Bienvenida a la plataforma', 'Este aviso es de demostración. El correo real todavía no se envía.', '/avisos'
   where not exists (select 1 from notifications where title = 'Bienvenida a la plataforma' and user_id = $1)`,
  [adminId],
);

await pool.end();
console.log("Seed listo. Contraseña de todas las cuentas: Escom2026!");
