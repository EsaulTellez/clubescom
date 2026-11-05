import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const { Pool } = pg;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!url || !secret || !dbUrl) {
  throw new Error("Faltan variables de Supabase. Ejecuta npm run env:local primero.");
}

const auth = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const pool = new Pool({ connectionString: dbUrl });
const password = "Escom2026!";
const people = [
  ["daniel.alumno@alumno.ipn.mx", "Daniel Díaz Ramírez", "2023630001", "alumno", null],
  ["esaul.alumno@alumno.ipn.mx", "Esaul Téllez De La Cruz", "2023630002", "alumno", null],
  ["profesor@ipn.mx", "Profesor Asesor", "EMP-100", "profesor", null],
  ["comunicacion@ipn.mx", "Elizabeth Moreno", "EMP-200", "moderador", "comunicacion"],
  ["gestion@ipn.mx", "Erick Fernández", "EMP-201", "moderador", "gestion_escolar"],
  ["clubes@ipn.mx", "María del Rosario Galeana", "EMP-202", "moderador", "clubes_academicos"],
  ["admin@ipn.mx", "Administración ESCOM", "EMP-001", "admin", null],
  ["becas@ipn.mx", "José Francisco Serrano", "EMP-203", "moderador", "becas"],
  ["catt@ipn.mx", "Comisión de TT", "EMP-204", "moderador", "catt"],
  ["prefectura@ipn.mx", "Prefectura ESCOM", "EMP-205", "moderador", "prefectura"],
  ["culturales@ipn.mx", "Martha Angélica Gasca", "EMP-206", "moderador", "clubes_culturales"],
];

async function findOrCreateUser(email, name, boleta) {
  let page = 1;
  while (true) {
    const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 1000) break;
    page += 1;
  }
  const { data, error } = await auth.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, boleta },
  });
  if (error) throw error;
  return data.user.id;
}

const ids = new Map();
for (const [email, name, boleta, role, area] of people) {
  const id = await findOrCreateUser(email, name, boleta);
  ids.set(email, id);
  await pool.query(
    `update public.users set name = $2, role = $3::public.user_role, area = $4, is_active = true, banned = false where id = $1`,
    [id, name, role, area],
  );
  await pool.query(
    `update private.user_private set email = $2, boleta = $3 where user_id = $1`,
    [id, email, boleta],
  );
}

const id = (email) => ids.get(email);
const student = id("daniel.alumno@alumno.ipn.mx");
const secondStudent = id("esaul.alumno@alumno.ipn.mx");
const professor = id("profesor@ipn.mx");
const comms = id("comunicacion@ipn.mx");
const gestion = id("gestion@ipn.mx");

await pool.query(`
  insert into public.avisos (author_id, title, body, category, featured)
  select $1, v.title, v.body, v.category, v.featured
  from (values
    ('Inicio de semestre 2026-B', 'Consulta aquí horarios, trámites y actividades de bienvenida de la comunidad.', 'academico', true),
    ('Reinscripciones: fechas importantes', 'Gestión Escolar publicó el calendario. Revisa los pasos antes de entrar al SAES.', 'tramites', false),
    ('Semana de bienvenida ESCOM', 'Actividades abiertas en la explanada durante esta semana.', 'social', false)
  ) as v(title, body, category, featured)
  where not exists (select 1 from public.avisos a where a.title = v.title)
`, [comms]);

await pool.query(`
  insert into public.clubs (name, kind, description, schedule, leader_id, advisor_id)
  select v.name, v.kind, v.description, v.schedule, $1, $2
  from (values
    ('Club de Algoritmia', 'academico', 'Práctica de programación competitiva, estructuras de datos y acompañamiento para principiantes.', 'Martes y jueves · 16:00'),
    ('Club de Robótica', 'academico', 'Electrónica, prototipos y competencias para toda la comunidad.', 'Miércoles · 15:00'),
    ('Club de Cine', 'cultural', 'Funciones y conversación sobre cine cada semana.', 'Viernes · 17:00'),
    ('Club de Fútbol', 'deportivo', 'Entrenamiento abierto en la cancha de Zacatenco.', 'Lunes y jueves · 15:30')
  ) as v(name, kind, description, schedule)
  where not exists (select 1 from public.clubs c where c.name = v.name)
`, [student, professor]);

await pool.query(`
  insert into public.memberships (club_id, user_id, status)
  select c.id, v.user_id, 'aceptada'
  from public.clubs c cross join (values ($1::uuid), ($2::uuid)) v(user_id)
  where c.name in ('Club de Algoritmia', 'Club de Robótica')
  on conflict (club_id, user_id) do update set status = 'aceptada'
`, [student, secondStudent]);

await pool.query(`
  insert into public.questions (author_id, area, title, body)
  select $1, v.area, v.title, v.body from (values
    ('gestion_escolar', '¿La reinscripción se puede hacer solo en línea?', 'El calendario menciona un día de ventanilla y no me queda claro cuándo se necesita.'),
    ('becas', '¿Qué hago si mi constancia salió con otro promedio?', 'Mi constancia no coincide con el semestre que curso.'),
    ('catt', '¿Cuándo se entrega el protocolo del trabajo terminal?', 'Quiero confirmar la fecha y las firmas necesarias.')
  ) v(area, title, body) where not exists (select 1 from public.questions q where q.title = v.title)
`, [student]);
await pool.query(`
  insert into public.answers (question_id, author_id, body, official)
  select q.id, $1, 'Consulta el calendario vigente de Gestión Escolar; la atención presencial solo aplica cuando el sistema lo indique.', true
  from public.questions q where q.title = '¿La reinscripción se puede hacer solo en línea?'
  and not exists (select 1 from public.answers a where a.question_id = q.id)
`, [gestion]);

await pool.query(`
  insert into public.guides (author_id, area, title, summary, steps, faqs)
  select $1, 'gestion_escolar', 'Reinscripción', 'Una guía comunitaria revisada por el área.',
    '[{"title":"Revisa el calendario","body":"Confirma las fechas del semestre."},{"title":"Prepara tus opciones","body":"Elige grupos y una alternativa de horario."},{"title":"Verifica el resultado","body":"Confirma tu inscripción en el sistema institucional."}]'::jsonb,
    '[{"q":"¿Puedo cambiar de grupo?","a":"Durante el periodo de ajustes y sujeto a disponibilidad."}]'::jsonb
  where not exists (select 1 from public.guides where title = 'Reinscripción')
`, [gestion]);

await pool.query(`
  insert into public.lost_items (reporter_id, kind, title, description, place, photo_url, security_question)
  select $1, v.kind, v.title, v.description, v.place, v.photo, v.question
  from (values
    ('perdido', 'Mochila azul', 'Mochila azul marino con cierre rojo; contiene un cargador blanco.', 'Explanada', '/ejemplos/perdido.svg', null),
    ('encontrado', 'Calculadora científica', 'Se encontró en el laboratorio y está resguardada en Prefectura.', 'Laboratorio 3', '/ejemplos/encontrado.svg', '¿Qué marca aparece en la tapa?')
  ) v(kind, title, description, place, photo, question)
  where not exists (select 1 from public.lost_items i where i.title = v.title)
`, [student]);
const foundItem = await pool.query("select id from public.lost_items where title = 'Calculadora científica'");
if (foundItem.rows[0]) {
  const answerHash = createHash("sha256").update("casio").digest("hex");
  await pool.query(
    `insert into private.lost_item_secrets (lost_item_id, security_answer_hash)
     values ($1, $2) on conflict (lost_item_id) do update set security_answer_hash = excluded.security_answer_hash`,
    [foundItem.rows[0].id, answerHash],
  );
}

await pool.query(`
  insert into public.club_proposals (proposer_id, name, kind, description)
  select $1, 'Club de Ajedrez', 'cultural', 'Partidas abiertas para la comunidad. Buscamos asesor y veinte personas para formalizarlo.'
  where not exists (select 1 from public.club_proposals where name = 'Club de Ajedrez')
`, [student]);
await pool.query(`
  insert into public.spaces (name, kind, building, description)
  select v.name, v.kind, v.building, v.description from (values
    ('Auditorio', 'auditorio', 'Edificio principal', 'Agenda informativa de actividades autorizadas.'),
    ('Sala 14', 'sala', 'Edificio 1', 'Sala de atención de propuestas de clubes.')
  ) v(name, kind, building, description)
  where not exists (select 1 from public.spaces s where s.name = v.name)
`);
await pool.query(`
  insert into public.cubicles (professor_id, label, building, floor, x, y)
  select $1, 'Cubículo 12', 'Edificio 2', '1', 48, 22
  where not exists (select 1 from public.cubicles where label = 'Cubículo 12')
`, [professor]);
await pool.query(`
  insert into public.badges (user_id, code, label) values ($1, 'pionero', 'Cuenta de demostración')
  on conflict (user_id, code) do nothing
`, [student]);
await pool.end();
console.log(`Seed listo: ${people.length} cuentas · contraseña compartida: ${password}`);
