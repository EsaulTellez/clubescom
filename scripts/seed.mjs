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

const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
const databaseHost = new URL(dbUrl).hostname;
if (!loopbackHosts.includes(new URL(url).hostname) ||
    ![...loopbackHosts, "db", "postgres"].includes(databaseHost)) {
  throw new Error("Las cuentas de demostración solo pueden crearse en el entorno local.");
}

const auth = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const pool = new Pool({ connectionString: dbUrl });
const password = "Escom2026!";
const people = [
  ["daniel.alumno@alumno.ipn.mx", "Daniel Díaz Ramírez", "2023630001", "alumno", null],
  ["esaul.alumno@alumno.ipn.mx", "Esaul Téllez De La Cruz", "2023630002", "alumno", null],
  ["alumna.libre@alumno.ipn.mx", "Valeria Luna", "2023630010", "alumno", null],
  ["robotica.alumno@alumno.ipn.mx", "Iván Salas", "2023630011", "alumno", null],
  ["cine.alumna@alumno.ipn.mx", "Lucía Méndez", "2023630012", "alumno", null],
  ["futbol.alumno@alumno.ipn.mx", "Omar Ríos", "2023630013", "alumno", null],
  ["robotica.profesor@ipn.mx", "Arturo Pineda", "EMP-101", "profesor", null],
  ["cine.profesora@ipn.mx", "Ana Vidal", "EMP-102", "profesor", null],
  ["futbol.profesor@ipn.mx", "Pablo Lara", "EMP-103", "profesor", null],
  ["operacion@ipn.mx", "Operación ESCOM", "EMP-002", "admin", null],
  ["superadmin@ipn.mx", "Superadministración ESCOM", "EMP-003", "admin", null],
  ["profesor@ipn.mx", "Profesor Asesor", "EMP-100", "profesor", null],
  ["comunicacion@ipn.mx", "Elizabeth Moreno", "EMP-200", "moderador", "comunicacion"],
  ["gestion@ipn.mx", "Erick Fernández", "EMP-201", "moderador", "gestion_escolar"],
  ["clubes@ipn.mx", "María del Rosario Galeana", "EMP-202", "moderador", "clubes_academicos"],
  ["subdireccion@ipn.mx", "Subdirección Académica · Sala 14", "EMP-207", "moderador", "subdireccion_academica"],
  ["admin@ipn.mx", "Administración ESCOM", "EMP-001", "admin", null],
  ["becas@ipn.mx", "José Francisco Serrano", "EMP-203", "moderador", "becas"],
  ["catt@ipn.mx", "Comisión de TT", "EMP-204", "moderador", "catt"],
  ["prefectura@ipn.mx", "Prefectura ESCOM", "EMP-205", "moderador", "prefectura"],
  ["culturales@ipn.mx", "Martha Angélica Gasca", "EMP-206", "moderador", "clubes_culturales"],
  ["sseis@ipn.mx", "Titular SSEIS ESCOM", "EMP-208", "moderador", "sseis"],
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
    `update public.users set name = $2, role = $3::public.user_role, area = $4, is_superadmin = $5, can_switch_profile = $6 where id = $1`,
    [id, name, role, area, email === "superadmin@ipn.mx", email === "operacion@ipn.mx"],
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
const clubesMod = id("clubes@ipn.mx");
const culturalesMod = id("culturales@ipn.mx");
const becasMod = id("becas@ipn.mx");
const cattMod = id("catt@ipn.mx");
const adminId = id("admin@ipn.mx");

await pool.query(`
  insert into public.clubs (name, kind, description, schedule, leader_id, advisor_id, logo_url, contact_email, contact_info)
  select v.name, v.kind, v.description, v.schedule, $1, $2, v.logo_url, v.contact_email, v.contact_info
  from (values
    ('Club de Algoritmia', 'academico', 'Práctica de programación competitiva, estructuras de datos, entrenamiento para ICPC y acompañamiento para principiantes.', 'Martes y jueves · 16:00', '/demo/club-algoritmia.webp', 'algoritmia.escom@ipn.mx', 'Laboratorio 4, Edificio 1 · Atención presencial en horario de sesiones'),
    ('Club de Robótica', 'academico', 'Electrónica, diseño de PCB, prototipos autónomos y competencias nacionales para toda la comunidad.', 'Miércoles · 15:00', null, 'robotica.escom@ipn.mx', 'Taller de Electrónica, Edificio 2 · Cubículo 2112'),
    ('Club de Cine', 'cultural', 'Funciones semanales, análisis cinematográfico y conversación abierta en Sala 14.', 'Viernes · 17:00', null, 'cine.escom@ipn.mx', 'Sala 14, Edificio 1 · Viernes 17:00 hrs'),
    ('Club de Fútbol', 'deportivo', 'Entrenamiento táctico y torneos internos en las canchas de Zacatenco.', 'Lunes y jueves · 15:30', null, 'futbol.escom@ipn.mx', 'Canchas deportivas de ESCOM · Lunes y jueves 15:30 hrs')
  ) as v(name, kind, description, schedule, logo_url, contact_email, contact_info)
  where not exists (select 1 from public.clubs c where c.name = v.name)
`, [student, professor]);

await pool.query(`
  update public.clubs c
  set contact_email = coalesce(c.contact_email, v.contact_email),
      contact_info = coalesce(c.contact_info, v.contact_info)
  from (values
    ('Club de Algoritmia', 'algoritmia.escom@ipn.mx', 'Laboratorio 4, Edificio 1 · Atención presencial en horario de sesiones'),
    ('Club de Robótica', 'robotica.escom@ipn.mx', 'Taller de Electrónica, Edificio 2 · Cubículo 2112'),
    ('Club de Cine', 'cine.escom@ipn.mx', 'Sala 14, Edificio 1 · Viernes 17:00 hrs'),
    ('Club de Fútbol', 'futbol.escom@ipn.mx', 'Canchas deportivas de ESCOM · Lunes y jueves 15:30 hrs')
  ) as v(name, contact_email, contact_info)
  where c.name = v.name
`);

// Las instalaciones anteriores asignaban estos tres clubes a la misma pareja de demo.
const coordinators = [
  ["Club de Robótica", "robotica.alumno@alumno.ipn.mx", "robotica.profesor@ipn.mx"],
  ["Club de Cine", "cine.alumna@alumno.ipn.mx", "cine.profesora@ipn.mx"],
  ["Club de Fútbol", "futbol.alumno@alumno.ipn.mx", "futbol.profesor@ipn.mx"],
];
for (const [name, leader, advisor] of coordinators) {
  await pool.query(
    `update public.clubs set leader_id = $2, advisor_id = $3
     where name = $1 and leader_id = $4 and advisor_id = $5`,
    [name, id(leader), id(advisor), student, professor],
  );
}

const clubMemberships = [
  ["Club de Algoritmia", [student, secondStudent, professor]],
  ...coordinators.map(([name, leader, advisor]) => [name, [id(leader), id(advisor), secondStudent]]),
];
for (const [clubName, memberList] of clubMemberships) {
  for (const memberId of memberList) {
    if (!memberId) continue;
    await pool.query(
      `insert into public.memberships (club_id, user_id, status)
       select c.id, $2, 'aceptada' from public.clubs c where c.name = $1
       on conflict (club_id, user_id) do update set status = 'aceptada'`,
      [clubName, memberId],
    );
  }
}

if (process.argv.includes("--users-only")) {
  await pool.end();
  console.log(`Cuentas y clubes de demo listos: ${people.length} perfiles.`);
  process.exit(0);
}

await pool.query(`
  insert into public.avisos (author_id, title, body, category, featured, image_url, social_copy, publish_at)
  select $1, v.title, v.body, v.category, v.featured, v.image_url, v.social_copy, now() - (v.hours_ago || ' hours')::interval
  from (values
    ('Inicio de semestre 2026-B', 'Consulta aquí horarios, trámites de reinscripción, entrega de credenciales y actividades de bienvenida para toda la comunidad estudiantil y docente en ESCOM.', 'academico', true, '/demo/explanada-escom.webp', 'ESCOM informa: inicia el semestre 2026-B. Revisa trámites, horarios y actividades en el tablero.', 2),
    ('Amistoso Burros Blancos vs ESCOM', '¡Se arma el amistoso! Burros Blancos y ESCOM se enfrentan este viernes a las 17:00 hrs en el Campo Burros Blancos de Zacatenco. Entrada libre con credencial politécnica para apoyar a nuestra comunidad.', 'social', true, '/demo/amistoso-futbol.webp', 'Amistoso Burros Blancos vs ESCOM · Viernes 17:00 hrs · Campo Burros Blancos Zacatenco.', 5),
    ('Oportunidad | Capital One para estudiantes y recién egresados', 'Capital One compartió una sesión informativa para conocer sus programas de ingeniería Student & Grads. Dirigido a estudiantes de últimos semestres de ISC, IIA y LCD.', 'academico', true, '/demo/capital-one.webp', 'Sesión de vinculación Capital One para estudiantes y recién egresados de ESCOM.', 9),
    ('Reinscripciones: fechas importantes', 'Gestión Escolar publicó el calendario oficial de reinscripción. Verifica tu cita en SAES, revisa que no tengas adeudos en biblioteca o laboratorios y consulta la guía paso a paso antes de acudir a ventanilla.', 'tramites', true, '/demo/aviso-reinscripciones.svg', 'Calendario de reinscripciones disponible en Gestión Escolar ESCOM.', 14),
    ('Comunicado de condolencias | Cuauhtémoc Cárdenas Solórzano', 'El Instituto Politécnico Nacional lamenta el sensible fallecimiento del ingeniero Cuauhtémoc Cárdenas Solórzano y reconoce su trayectoria histórica y el orgullo politécnico que llevó consigo.', 'social', false, '/demo/comunicado-ipn.webp', 'Comunicado institucional del Instituto Politécnico Nacional.', 22),
    ('Noche de combate · cartel de archivo', 'Función especial de exhibición de combate escénico a las 17:00 hrs en el Auditorio Ing. Alejo Peralta del Centro Cultural Jaime Torres Bodet. Acceso gratuito para la comunidad politécnica.', 'social', false, '/demo/noche-combate.webp', 'Noche de combate escénico · 17:00 hrs · Auditorio Ing. Alejo Peralta.', 30),
    ('Becas institucionales: validación de expediente digital', 'El área de Becas recuerda a las y los solicitantes que la constancia de estudios y el comprobante de ingresos deben subirse en formato PDF legible antes del cierre de ventanilla digital.', 'tramites', false, '/demo/aviso-becas.svg', 'Aviso de Becas ESCOM: revisa y confirma tu expediente antes del cierre.', 38),
    ('Entrega de protocolos de Trabajo Terminal 2026-B', 'La CATT informa que la recepción de protocolos firmados por directores y sinodales estará abierta hasta el viernes a las 18:00 hrs. Verifica los formatos vigentes en la sección de Guías.', 'academico', false, '/demo/aviso-catt-tt.svg', 'CATT ESCOM: fechas límite para registro de protocolos de Trabajo Terminal.', 46),
    ('Semana de bienvenida ESCOM', 'Actividades culturales, torneos relámpago y módulos de clubes activos en la explanada principal y el domo durante toda la semana de bienvenida.', 'social', false, '/demo/explanada-escom.webp', 'Semana de bienvenida en la explanada y domo de ESCOM.', 54)
  ) as v(title, body, category, featured, image_url, social_copy, hours_ago)
  where not exists (select 1 from public.avisos a where a.title = v.title)
`, [comms]);

await pool.query(`
  update public.avisos
     set image_url = case title
       when 'Inicio de semestre 2026-B' then coalesce(image_url, '/demo/explanada-escom.webp')
       when 'Amistoso Burros Blancos vs ESCOM' then coalesce(image_url, '/demo/amistoso-futbol.webp')
       when 'Oportunidad | Capital One para estudiantes y recién egresados' then coalesce(image_url, '/demo/capital-one.webp')
       when 'Reinscripciones: fechas importantes' then coalesce(image_url, '/demo/aviso-reinscripciones.svg')
       when 'Comunicado de condolencias | Cuauhtémoc Cárdenas Solórzano' then coalesce(image_url, '/demo/comunicado-ipn.webp')
       when 'Noche de combate · cartel de archivo' then coalesce(image_url, '/demo/noche-combate.webp')
       when 'Becas institucionales: validación de expediente digital' then coalesce(image_url, '/demo/aviso-becas.svg')
       when 'Entrega de protocolos de Trabajo Terminal 2026-B' then coalesce(image_url, '/demo/aviso-catt-tt.svg')
       when 'Semana de bienvenida ESCOM' then coalesce(image_url, '/demo/explanada-escom.webp')
       else image_url
     end,
     published_triggered = true
`);

const clubPostsSeed = [
  ["Club de Algoritmia", "Entrenamiento de grafos: BFS, DFS y Dijkstra", "Esta semana resolveremos problemas tipo ICPC sobre caminos mínimos y árboles generadores en el laboratorio. No necesitas experiencia previa: tendremos un bloque introductorio y otro avanzado con retroalimentación en vivo.", 3, "/demo/post-grafos-icpc.svg"],
  ["Club de Robótica", "Armado de chasis y pruebas de sensores ultrasónicos", "El miércoles abrimos sesión de taller para calibrar motores y sensores del prototipo seguidor de línea. Trae tu multímetro si cuentas con uno; aquí prestamos cautines y placas de prueba.", 8, "/demo/post-robotica-chasis.svg"],
  ["Club de Algoritmia", "Resultados del contest interno de bienvenida", "Agradecemos a las 34 personas que participaron en el simulacro del sábado. Ya publicamos el editorial con las soluciones en C++ y Python para los 6 problemas.", 16, "/demo/post-contest-resultados.svg"],
  ["Club de Fútbol", "Convocatoria a visorías para el torneo interpolitécnico", "Este jueves a las 15:30 hrs realizaremos partidos de preparación en las canchas de fútbol. Lleva hidratación, espinilleras y credencial vigente.", 20, "/demo/post-futbol-visorias.svg"],
  ["Club de Cine", "Ciclo de ciencia ficción: proyección y debate en Sala 14", "Este viernes proyectaremos un clásico de ciencia ficción sobre inteligencia artificial. Al terminar abriremos micrófono para discutir fotografía y guion.", 27, "/demo/post-cine-scifi.svg"],
];
for (const [clubName, title, body, hoursAgo, imageUrl] of clubPostsSeed) {
  await pool.query(
    `insert into public.club_posts (club_id, author_id, title, body, image_url, created_at)
     select c.id, c.leader_id, $2, $3, $5, now() - ($4 || ' hours')::interval
     from public.clubs c
     where c.name = $1
       and not exists (select 1 from public.club_posts p where p.club_id = c.id and p.title = $2)`,
    [clubName, title, body, String(hoursAgo), imageUrl],
  );
  await pool.query(
    `update public.club_posts set image_url = coalesce(image_url, $2) where title = $1`,
    [title, imageUrl],
  );
}

const clubEventsSeed = [
  ["Club de Algoritmia", "Maratón relámpago de estructuras de datos", "Sesión práctica de 2 horas con problemas de árboles, colas de prioridad y programación dinámica.", "Sala 14 · Edificio 1", "1 day", "/demo/evento-maraton-estructuras.svg"],
  ["Club de Robótica", "Demostración de robots velocistas y sumo", "Pruebas abiertas en pista y asesoría para nuevos integrantes interesados en electrónica.", "El domo", "2 days", "/demo/evento-robots-sumo.svg"],
  ["Club de Fútbol", "Partido de preparación ESCOM Interclubes", "Encuentro amistoso de preparación previo al arranque de la liga politécnica.", "Canchas de fútbol", "3 days", "/demo/post-futbol-visorias.svg"],
  ["Club de Cine", "Función comentada: Cine y tecnología", "Proyección gratuita y mesa redonda abierta a toda la comunidad de ESCOM.", "Auditorio", "4 days", "/demo/post-cine-scifi.svg"],
];
for (const [clubName, title, description, location, intervalStr, imageUrl] of clubEventsSeed) {
  await pool.query(
    `insert into public.club_events (club_id, created_by, title, description, location, starts_at, approval_status, approved_by, image_url)
     select c.id, c.leader_id, $2, $3, $4, date_trunc('hour', now()) + $5::interval, 'aprobado', $6, $7
     from public.clubs c
     where c.name = $1
       and not exists (select 1 from public.club_events e where e.club_id = c.id and e.title = $2)`,
    [clubName, title, description, location, intervalStr, ["Club de Cine", "Club de Fútbol"].includes(clubName) ? culturalesMod : clubesMod, imageUrl],
  );
  await pool.query(
    `update public.club_events set image_url = coalesce(image_url, $2) where title = $1`,
    [title, imageUrl],
  );
}

const forumQuestionsSeed = [
  {
    authorId: student,
    area: "gestion_escolar",
    title: "¿La reinscripción se puede hacer solo en línea?",
    body: "El calendario menciona un día de ventanilla y no me queda claro cuándo se necesita acudir presencialmente a Gestión Escolar o si todo queda en SAES.",
    isPinned: true,
    answers: [
      {
        authorId: gestion,
        official: true,
        body: "Si eres alumno regular sin adeudos de biblioteca ni dictamen vigente, toda tu reinscripción se completa en línea desde tu cita en SAES. La atención presencial en ventanilla de Gestión Escolar (Planta baja de Gobierno, G002) solo aplica para casos con dictamen COSIE, carga menor a la mínima o traslape autorizado.",
        votes: [
          [student, 1],
          [secondStudent, 1],
          [professor, 1],
          [comms, 1],
          [becasMod, 1],
        ],
      },
      {
        authorId: secondStudent,
        official: false,
        body: "Confirmo: si ya pagaste la aportación voluntaria o tienes tu comprobante en orden, el día de tu cita solo entras a SAES y seleccionas grupos. Tip: ten a la mano 3 combinaciones de horarios porque los grupos de la mañana se llenan en los primeros 10 minutos.",
        votes: [
          [student, 1],
          [professor, 1],
          [cattMod, 1],
        ],
      },
      {
        authorId: professor,
        official: false,
        body: "Si alguna materia aparece sin profesor asignado aún, igual pueden inscribirla dentro de su carga; las academias publican la asignación definitiva durante la primera semana de clases.",
        votes: [[student, 1], [secondStudent, 1]],
      },
    ],
    questionVotes: [student, secondStudent, professor, comms, becasMod, cattMod],
  },
  {
    authorId: student,
    area: "becas",
    title: "¿Qué hago si mi constancia salió con otro promedio?",
    body: "Mi constancia de estudios no coincide con el semestre o promedio que aparece en mi kárdex y la convocatoria de SIBec pide subirla esta semana.",
    isPinned: false,
    answers: [
      {
        authorId: becasMod,
        official: true,
        body: "Primero solicita la corrección de historial en Gestión Escolar (ventanilla G002) llevando tu boleta global sellada o captura de SAES. En lo que sale la constancia corregida, puedes subir el comprobante de trámite en proceso junto con tu kárdex oficial en el portal de Becas (Piso 1 de Gobierno, G103) para que no pierdan tu folio en la validación.",
        votes: [
          [student, 1],
          [secondStudent, 1],
          [gestion, 1],
          [adminId, 1],
        ],
      },
      {
        authorId: secondStudent,
        official: false,
        body: "A mí me pasó el semestre pasado por un ETS que tardó en reflejarse en actas. En Gestión Escolar te reimprimen la constancia el mismo día si vas entre 9:00 y 12:00 hrs con tu credencial física.",
        votes: [[student, 1], [comms, 1]],
      },
    ],
    questionVotes: [student, secondStudent, gestion, adminId],
  },
  {
    authorId: student,
    area: "catt",
    title: "¿Cuándo se entrega el protocolo del trabajo terminal?",
    body: "Quiero confirmar la fecha límite, el número de copias y las firmas necesarias para registrar nuestro protocolo de TT1 este semestre.",
    isPinned: true,
    answers: [
      {
        authorId: cattMod,
        official: true,
        body: "La recepción de protocolos de Trabajo Terminal en la CATT (Piso 1 de Gobierno, G103) cierra el segundo viernes del semestre a las 18:00 hrs. Se entrega en formato PDF por el sistema interno más la carátula firmada por todos los integrantes, el director de TT y los dos sinodales asignados por la academia.",
        votes: [
          [student, 1],
          [secondStudent, 1],
          [professor, 1],
          [gestion, 1],
        ],
      },
      {
        authorId: professor,
        official: false,
        body: "Recuerden pedir la firma de sus directores al menos 3 días antes porque muchos profesores tienen junta de academia los miércoles y jueves.",
        votes: [[student, 1], [secondStudent, 1]],
      },
    ],
    questionVotes: [student, secondStudent, professor, comms, gestion],
  },
  {
    authorId: secondStudent,
    area: "gestion_escolar",
    title: "¿Cómo pido el dictamen ante el COSIE si reprobé una materia en ETS por tercera vez?",
    body: "Tengo dos materias fuera de tiempo y una ya agotó las oportunidades de ETS. ¿Cuándo abren las fechas del COSIE interno de ESCOM y qué documentos piden?",
    isPinned: false,
    answers: [
      {
        authorId: gestion,
        official: true,
        body: "Cuando una unidad de aprendizaje agota sus oportunidades ordinarias y de ETS, debes solicitar dictamen de reinscripción ante el COSIE durante las dos semanas previas al inicio del semestre. Acude a Gestión Escolar con tu solicitud por escrito dirigida al H. Consejo Técnico Consultivo Escolar, copia de kárdex actualizado y credencial vigente.",
        votes: [[secondStudent, 1], [student, 1], [professor, 1]],
      },
      {
        authorId: student,
        official: false,
        body: "Lleva impreso tu historial de SAES y explica en tu carta de exposición de motivos cuántas materias te faltan para egresar; si es tu primer dictamen casi siempre te dan chance de cursar en bloque de reinscripción.",
        votes: [[secondStudent, 1], [comms, 1], [becasMod, 1]],
      },
    ],
    questionVotes: [secondStudent, student, professor],
  },
  {
    authorId: secondStudent,
    area: "becas",
    title: "¿El comprobante de ingresos para la Beca Institucional puede ser carta bajo protesta de decir verdad?",
    body: "Mis papás trabajan por cuenta propia y no tienen recibos de nómina timbrados. ¿En ESCOM aceptan la carta bajo protesta firmada por ellos para validar el expediente?",
    isPinned: false,
    answers: [
      {
        authorId: student,
        official: false,
        body: "Sí la aceptan, pero debes descargar el formato oficial de carta de ingresos no comprobables desde el mismo SIBec y anexar copia legible de la INE de quien firma la carta por ambos lados.",
        votes: [[secondStudent, 1], [comms, 1], [gestion, 1], [cattMod, 1]],
      },
      {
        authorId: professor,
        official: false,
        body: "Asegúrense de que la fecha de la carta sea del mes en curso y que coincida exactamente el ingreso mensual declarado con lo que capturaron en el estudio socioeconómico.",
        votes: [[secondStudent, 1], [student, 1]],
      },
    ],
    questionVotes: [secondStudent, student, comms, gestion],
  },
  {
    authorId: student,
    area: "general",
    title: "¿Dónde sello mi carta de aceptación para liberar el Servicio Social si trabajo en empresa privada?",
    body: "Ya tengo mi carta de aceptación firmada por mi jefe directo en la empresa donde haré servicio social/prácticas, pero me piden validación de ESCOM antes de subirla al SISS.",
    isPinned: false,
    answers: [
      {
        authorId: adminId,
        official: true,
        body: "El departamento de Extensión y Apoyos Educativos (Piso 1 de Gobierno, G103, junto a Becas) valida que la empresa tenga convenio vigente con el IPN y sella tu carta de aceptación. Revisa primero en el SISS si el programa ya aparece activo para este periodo.",
        votes: [[student, 1], [secondStudent, 1], [becasMod, 1]],
      },
      {
        authorId: secondStudent,
        official: false,
        body: "El horario de ventanilla de Servicio Social es de 9:30 a 14:00 hrs y de 16:00 a 19:00 hrs. Lleva también tu constancia de créditos (mínimo 70%) porque a veces te la piden en físico para cotejar.",
        votes: [[student, 1], [professor, 1]],
      },
    ],
    questionVotes: [student, secondStudent, becasMod],
  },
  {
    authorId: secondStudent,
    area: "catt",
    title: "¿Cuántos directores externos acepta la CATT para el registro de TT1?",
    body: "Nuestro proyecto colabora con un investigador de CIC-IPN y un egresado en industria. ¿Ambos pueden figurar como directores o necesitamos obligatoriamente un director interno de ESCOM?",
    isPinned: false,
    answers: [
      {
        authorId: cattMod,
        official: true,
        body: "Todo Trabajo Terminal debe contar con al menos un director interno adscrito a la ESCOM. Se puede registrar un codirector externo (de otro centro IPN o industria) anexando su currículum resumido y carta compromiso, sujeto a aprobación de la CATT.",
        votes: [[secondStudent, 1], [student, 1], [professor, 1]],
      },
      {
        authorId: professor,
        official: false,
        body: "Cuando traen codirector del CIC o CINVESTAV, conviene entregar la solicitud 5 días antes del cierre porque el comité revisa primero el perfil del asesor externo.",
        votes: [[secondStudent, 1]],
      },
    ],
    questionVotes: [secondStudent, student],
  },
];

for (const qItem of forumQuestionsSeed) {
  let qRes = await pool.query(`select id from public.questions where title = $1`, [qItem.title]);
  let questionId = qRes.rows[0]?.id;
  if (!questionId) {
    const insQ = await pool.query(
      `insert into public.questions (author_id, area, title, body, is_pinned)
       values ($1, $2, $3, $4, $5) returning id`,
      [qItem.authorId, qItem.area, qItem.title, qItem.body, qItem.isPinned],
    );
    questionId = insQ.rows[0].id;
  } else {
    await pool.query(
      `update public.questions set body = $2, is_pinned = $3 where id = $1`,
      [questionId, qItem.body, qItem.isPinned],
    );
  }

  for (const voterId of qItem.questionVotes) {
    if (!voterId) continue;
    await pool.query(
      `insert into public.question_votes (question_id, user_id) values ($1, $2) on conflict do nothing`,
      [questionId, voterId],
    );
  }

  for (const ans of qItem.answers) {
    if (!ans.authorId) continue;
    let aRes = ans.official
      ? await pool.query(
          `select id from public.answers where question_id = $1 and author_id = $2 and official = true limit 1`,
          [questionId, ans.authorId],
        )
      : await pool.query(
          `select id from public.answers where question_id = $1 and author_id = $2 and left(body, 40) = left($3, 40) limit 1`,
          [questionId, ans.authorId, ans.body],
        );
    let answerId = aRes.rows[0]?.id;
    if (!answerId) {
      const insA = await pool.query(
        `insert into public.answers (question_id, author_id, body, official)
         values ($1, $2, $3, $4) returning id`,
        [questionId, ans.authorId, ans.body, ans.official],
      );
      answerId = insA.rows[0].id;
    } else if (ans.official) {
      await pool.query(`update public.answers set body = $2 where id = $1`, [answerId, ans.body]);
    }
    for (const [voterId, voteVal] of ans.votes) {
      if (!voterId) continue;
      await pool.query(
        `insert into public.answer_votes (answer_id, user_id, vote) values ($1, $2, $3) on conflict do nothing`,
        [answerId, voterId, voteVal],
      );
    }
  }
}

const guidesSeed = [
  {
    authorId: gestion,
    area: "gestion_escolar",
    legacyTitle: "Reinscripción",
    title: "Reinscripción semestral y carga de materias en SAES",
    summary: "Ruta completa para revisar tu cita en SAES, validar que no tengas adeudos y confirmar tu carga académica sin contratiempos.",
    steps: [
      {
        title: "Consulta tu cita de reinscripción y adeudos",
        body: "Ingresa a SAES (Alumnos → Reinscripción → Cita) 48 horas antes del periodo. Verifica en Biblioteca y Laboratorios que no tengas adeudos bloqueando tu matrícula.",
      },
      {
        title: "Arma tres combinaciones de horario",
        body: "Revisa el catálogo de horarios publicado por Subdirección Académica y prepara una opción principal y dos de respaldo por si algún grupo alcanza cupo máximo.",
      },
      {
        title: "Registra tus materias en la hora exacta de tu cita",
        body: "Accede a SAES desde 5 minutos antes. Selecciona primero las materias seriadas o con menor cantidad de grupos abiertos y guarda el movimiento antes de cerrar sesión.",
      },
      {
        title: "Solicita ajustes o carga especial (solo si aplica)",
        body: "Si necesitas cursar menos créditos de la carga mínima, levantar traslape o aplicar dictamen COSIE, acude a ventanilla de Gestión Escolar (Planta baja de Gobierno, G002).",
      },
      {
        title: "Descarga y resguarda tu comprobante de horario",
        body: "En SAES → Comprobante de Horario verifica que cada materia muestre grupo, salón y profesor asignado, y guarda una copia en PDF.",
      },
    ],
    faqs: [
      {
        q: "¿Puedo cambiar de grupo después de confirmar mi inscripción?",
        a: "Sí, únicamente durante el periodo oficial de altas, bajas y cambios en SAES y sujeto a disponibilidad de cupo en el grupo destino.",
      },
      {
        q: "¿Qué pasa si se me pasó mi hora de cita en SAES?",
        a: "El sistema mantiene una ventana abierta posterior al cierre de citas del mismo día; si el periodo ya terminó, debes acudir a Gestión Escolar.",
      },
      {
        q: "¿Cuántos créditos mínimos debo inscribir para mantener condición regular?",
        a: "Consulta el límite mínimo de créditos de tu plan vigente (ISC, IIA o LCD) antes de confirmar; bajar de la carga mínima requiere autorización previa.",
      },
    ],
  },
  {
    authorId: gestion,
    area: "gestion_escolar",
    title: "Trámite de Constancia de Estudios, Boleta Global y Kardex",
    summary: "Pasos y requisitos para obtener documentos oficiales escolares sellados para becas, servicio social, IMSS o trámites externos.",
    steps: [
      {
        title: "Identifica el documento correcto según tu trámite",
        body: "Constancia de estudios (acredita inscripción vigente y promedio), Boleta Global Certificada (calificaciones oficiales por periodo) o Kardex sellado (historial completo de créditos).",
      },
      {
        title: "Realiza la solicitud en línea o en ventanilla G002",
        body: "Presenta tu credencial vigente del IPN o identificación oficial junto con tu número de boleta en Gestión Escolar (Planta baja de Gobierno) de 9:00 a 14:00 hrs o de 16:00 a 19:30 hrs.",
      },
      {
        title: "Verifica tus datos antes del sellado",
        body: "Comprueba que tu nombre completo, CURP, carrera (ISC/IIA/LCD), semestre y promedio coincidan con tu historial en SAES antes de retirar el documento.",
      },
      {
        title: "Recoge tu documento con sello y firma oficial",
        body: "El tiempo de entrega habitual es de 1 a 2 días hábiles; en periodos de convocatoria de becas se habilita entrega rápida el mismo día.",
      },
    ],
    faqs: [
      {
        q: "¿La constancia digital descargada de SAES sirve para becas?",
        a: "Para trámites internos de SIBec suele requerirse la constancia con sello oficial de Gestión Escolar y firma vigente.",
      },
      {
        q: "¿Puede recoger mi constancia otra persona?",
        a: "Únicamente con carta poder simple firmada y copia de la credencial del alumno y de quien recoge.",
      },
    ],
  },
  {
    authorId: becasMod,
    area: "becas",
    title: "Solicitud y renovación de Becas Institucionales y SIBec",
    summary: "Guía paso a paso para integrar tu expediente digital, cumplir con el promedio mínimo y validar tus documentos en tiempo y forma.",
    steps: [
      {
        title: "Revisa la convocatoria vigente y requisitos de modalidad",
        body: "Verifica en el portal oficial del IPN y en la vitrina de Becas (Piso 1 de Gobierno, G103) si aplicas a Beca Institucional, Beca de Transporte, Excelencia o Manutención.",
      },
      {
        title: "Prepara tu expediente en PDF legible",
        body: "Escanea en formato PDF (menos de 2 MB por archivo): acuse de solicitud SIBec, constancia de estudios actualizada, comprobante de ingresos familiares y comprobante de domicilio.",
      },
      {
        title: "Captura el estudio socioeconómico en SIBec",
        body: "Llena todos los apartados sin dejar campos en blanco y verifica que el ingreso mensual declarado coincida exactamente con los comprobantes adjuntos.",
      },
      {
        title: "Sube los documentos y monitorea observaciones",
        body: "Después de enviar tu expediente, revisa el buzón de SIBec cada 48 horas por si el área de Becas solicita corregir algún archivo borroso o vencido.",
      },
      {
        title: "Registra tu cuenta bancaria CLABE (cuando resultes seleccionado)",
        body: "Una vez publicado el padrón de beneficiarios, captura la CLABE interbancaria a tu nombre dentro del plazo marcado para recibir los depósitos.",
      },
    ],
    faqs: [
      {
        q: "¿Puedo solicitar beca si debo una materia en recursamiento?",
        a: "Depende de la modalidad: la Beca Institucional exige situación académica regular, mientras que algunas becas de apoyo permiten hasta cierto número de adeudos.",
      },
      {
        q: "¿Qué hago si mi familia no tiene recibos de nómina?",
        a: "Descarga el formato de carta bajo protesta de decir verdad disponible en SIBec y adjunta copia legible de identificación oficial de quien firma.",
      },
      {
        q: "¿Dónde resuelvo un rechazo de documento en SIBec?",
        a: "Acude directamente a la oficina de Becas en el Piso 1 del Edificio de Gobierno (G103) con tu número de folio.",
      },
    ],
  },
  {
    authorId: cattMod,
    area: "catt",
    title: "Registro de Protocolo de Trabajo Terminal (TT1, TT2 y Titulación)",
    summary: "Procedimiento ante la Comisión de Apoyo a Trabajos Terminales para registrar equipo, directores, protocolo y avanzar hacia la titulación.",
    steps: [
      {
        title: "Integra tu equipo y elige tema de TT",
        body: "Forma un equipo de 1 a 4 integrantes (preferentemente del mismo plan de estudios) y define el problema de ingeniería, alcance y viabilidad técnica.",
      },
      {
        title: "Consigue director interno y presenta el anteproyecto",
        body: "Contacta a un profesor de ESCOM para dirigir el proyecto. Revisa el directorio de cubículos en el Mapa 3D del campus para localizar a tu asesor.",
      },
      {
        title: "Elabora el protocolo en el formato oficial de la CATT",
        body: "Redacta resumen, planteamiento, objetivos, estado del arte, metodología, cronograma y referencias respetando la plantilla vigente de la CATT.",
      },
      {
        title: "Recaba firmas de aprobación y entrega en G103",
        body: "Obtén la firma de cada integrante y de tus directores en la hoja de registro. Sube el PDF al sistema de la CATT y entrega la carátula antes de la fecha límite.",
      },
      {
        title: "Atiende observaciones de sinodales en la evaluación",
        body: "La CATT asignará tres sinodales revisores; integra las correcciones señaladas antes de la presentación oral de TT1 y TT2.",
      },
    ],
    faqs: [
      {
        q: "¿Puedo tener un director externo del CIC o de la industria?",
        a: "Sí, siempre y cuando cuentes al menos con un director interno adscrito a la ESCOM y entregues el currículum del codirector externo.",
      },
      {
        q: "¿Qué pasa si repruebo o abandono TT1?",
        a: "Debes dar aviso formal de baja o cambio de protocolo ante la CATT al inicio del siguiente periodo para no quedar bloqueado.",
      },
      {
        q: "¿Dónde está la ventanilla de atención de la CATT?",
        a: "En el Piso 1 del Edificio de Gobierno, sector oriente (oficina G103).",
      },
    ],
  },
  {
    authorId: gestion,
    area: "gestion_escolar",
    title: "Baja temporal, dictamen de COSIE y regularización académica",
    summary: "Qué hacer cuando necesitas pausar el semestre, solicitar prórroga por ETS agotados o recuperar tu calidad de alumno regular.",
    steps: [
      {
        title: "Evalúa tu situación académica antes del cierre de periodo",
        body: "Revisa tu Kardex en SAES para saber cuántas materias adeudas y cuántas oportunidades ordinarias o de ETS te quedan en cada unidad de aprendizaje.",
      },
      {
        title: "Solicita baja temporal si no podrás cursar el semestre",
        body: "Tramita la baja temporal en Gestión Escolar durante el primer mes del semestre para evitar que las materias cuenten como reprobadas en tu historial.",
      },
      {
        title: "Prepara expediente de dictamen COSIE si agotaste ETS",
        body: "Redacta tu carta de exposición de motivos dirigida al CTCE/COSIE, anexa tu kárdex impreso y copia de credencial vigente.",
      },
      {
        title: "Da seguimiento a la resolución y reinscríbete en tiempo",
        body: "Consulta el resultado del dictamen en Gestión Escolar para que te habiliten el bloque de inscripción autorizado en el siguiente periodo.",
      },
    ],
    faqs: [
      {
        q: "¿Cuántos semestres seguidos puedo pedir baja temporal?",
        a: "El reglamento contempla hasta dos periodos consecutivos justificados; consúltalo en ventanilla G002 según tu plan.",
      },
      {
        q: "¿Si meto baja temporal pierdo mi seguro facultativo del IMSS?",
        a: "Durante una baja temporal formal no estás inscrito en el periodo activo, por lo que la vigencia de derechos del IMSS se suspende hasta tu reinscripción.",
      },
    ],
  },
  {
    authorId: adminId,
    area: "general",
    title: "Liberación de Servicio Social y Prácticas Profesionales",
    summary: "Requisitos de créditos, registro en SISS, reportes mensuales y entrega final para obtener tu carta de liberación.",
    steps: [
      {
        title: "Verifica que cubres al menos el 70% de créditos",
        body: "Descarga tu constancia de avance de créditos en Gestión Escolar. Sin este porcentaje mínimo el SISS no habilita el registro de servicio social.",
      },
      {
        title: "Elige un programa activo en el SISS y tramita tu carta de aceptación",
        body: "Postúlate a una dependencia pública o proyecto interno del IPN con convenio vigente y solicita el sello de validación en Extensión y Apoyos Educativos (G103).",
      },
      {
        title: "Sube tus reportes mensuales y bitácoras sin atrasos",
        body: "Cada mes carga tu reporte firmado por el responsable directo dentro de los primeros 5 días hábiles para acumular las 480 horas reglamentarias.",
      },
      {
        title: "Entrega tu reporte global y carta de término",
        body: "Al concluir las 480 horas (mínimo 6 meses naturales), entrega tu carta de término y reporte global en G103 para recibir la carta de liberación oficial.",
      },
    ],
    faqs: [
      {
        q: "¿Puedo liberar el servicio social trabajando en una empresa privada?",
        a: "Las empresas privadas aplican normalmente para Prácticas Profesionales; el Servicio Social requiere dependencia gubernamental, asociación autorizada o proyecto IPN.",
      },
      {
        q: "¿En cuánto tiempo entregan la carta de liberación?",
        a: "Una vez validado el expediente completo en G103, el trámite ante la Dirección de Egresados y Servicio Social toma entre 15 y 25 días hábiles.",
      },
    ],
  },
];

for (const g of guidesSeed) {
  let existing = null;
  if (g.legacyTitle) {
    existing = await pool.query(`select id from public.guides where title in ($1, $2) limit 1`, [g.legacyTitle, g.title]);
  } else {
    existing = await pool.query(`select id from public.guides where title = $1 limit 1`, [g.title]);
  }
  if (existing.rows[0]) {
    await pool.query(
      `update public.guides
          set area = $2, title = $3, summary = $4, steps = $5::jsonb, faqs = $6::jsonb
        where id = $1`,
      [existing.rows[0].id, g.area, g.title, g.summary, JSON.stringify(g.steps), JSON.stringify(g.faqs)],
    );
  } else {
    const ins = await pool.query(
      `insert into public.guides (author_id, area, title, summary, steps, faqs)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb) returning id`,
      [g.authorId, g.area, g.title, g.summary, JSON.stringify(g.steps), JSON.stringify(g.faqs)],
    );
    await pool.query(
      `insert into public.guide_versions (guide_id, version, edited_by, title, summary, steps, faqs, change_note)
       select id, version, $2, title, summary, steps, faqs, 'Publicación inicial' from public.guides where id = $1
       on conflict (guide_id, version) do nothing`,
      [ins.rows[0].id, g.authorId],
    );
  }
}

const forumRequestsSeed = [
  {
    authorId: secondStudent,
    area: "gestion_escolar",
    requestKind: "actualizar_guia",
    title: "Solicitud de actualización: fechas límite en guía de Reinscripción",
    body: "El apartado de citas en SAES cambió de ruta este semestre; solicitamos actualizar el paso 1 de la guía de reinscripción con la ruta vigente.",
    guideTitle: "Reinscripción semestral y carga de materias en SAES",
  },
  {
    authorId: professor,
    area: "infraestructura",
    requestKind: "cambio_info",
    title: "Solicitud de cambio de cubículo asignado en el mapa (Edificio 2)",
    body: "Solicito actualizar mi asignación en el directorio del edificio del cubículo 2112 al cubículo 2114 en Edificio 2, piso 1.",
    guideTitle: null,
  },
];
for (const reqItem of forumRequestsSeed) {
  let targetGuideId = null;
  if (reqItem.guideTitle) {
    const gRow = await pool.query(`select id from public.guides where title = $1 limit 1`, [reqItem.guideTitle]);
    targetGuideId = gRow.rows[0]?.id ?? null;
  }
  const existingReq = await pool.query(`select id from public.questions where title = $1 limit 1`, [reqItem.title]);
  if (!existingReq.rows[0]) {
    await pool.query(
      `insert into public.questions (author_id, area, request_kind, target_guide_id, title, body, is_pinned)
       values ($1, $2, $3, $4, $5, $6, false)`,
      [reqItem.authorId, reqItem.area, reqItem.requestKind, targetGuideId, reqItem.title, reqItem.body],
    );
  }
}

await pool.query(`
  insert into public.lost_items (reporter_id, kind, title, description, place, photo_url, security_question)
  select $1, v.kind, v.title, v.description, v.place, v.photo, v.question
  from (values
    ('perdido', 'Mochila azul', 'Mochila azul marino con cierre rojo; contiene un cargador blanco.', 'Explanada', '/ejemplos/perdido.svg', null),
    ('encontrado', 'Calculadora científica', 'Se encontró sobre una mesa del laboratorio 3; contesta la pregunta de verificación para coordinar la entrega directa.', 'Laboratorio 3', '/ejemplos/encontrado.svg', '¿Qué marca aparece en la tapa?')
  ) v(kind, title, description, place, photo, question)
  where not exists (select 1 from public.lost_items i where i.title = v.title)
`, [student]);
const foundItem = await pool.query("select id from public.lost_items where title = 'Calculadora científica'");
if (foundItem.rows[0]) {
  const answerHash = createHash("sha256").update("casio").digest("hex");
  await pool.query(
    `insert into private.lost_item_secrets (lost_item_id, security_answer_hash, answer_text)
     values ($1, $2, 'casio')
     on conflict (lost_item_id) do update
       set security_answer_hash = excluded.security_answer_hash,
           answer_text = excluded.answer_text`,
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
    ('Sala 14', 'sala', 'Edificio 1', 'Sala de atención de propuestas de clubes.'),
    ('El domo', 'espacio', null, 'Actividades autorizadas en el domo.'),
    ('Canchas de fútbol', 'deportivo', null, 'Actividades autorizadas en las canchas de fútbol.'),
    ('Canchas de voleibol', 'deportivo', null, 'Actividades autorizadas en las canchas de voleibol.')
  ) v(name, kind, building, description)
  where not exists (select 1 from public.spaces s where s.name = v.name)
`);

const spaceEventsSeed = [
  ["Auditorio", "Conferencia Magistral: Inteligencia Artificial y Ciberseguridad en el IPN", "Ponencia inaugural del semestre con especialistas invitados e investigadores de posgrado. Entrada libre hasta completar aforo.", "18 hours", "20 hours", "/demo/evento-ia-ciberseguridad.svg", "Dra. Elena Vázquez · CIC-IPN"],
  ["El domo", "Feria de Clubes Académicos, Culturales y Deportivos 2026-B", "Stands demostrativos, registro de nuevos integrantes, exhibición de prototipos de robótica y partidas simultáneas.", "36 hours", "40 hours", "/demo/evento-feria-clubes.svg", null],
  ["Sala 14", "Taller de Preparación para Entrevistas Técnicas y CV", "Sesión práctica sobre algoritmos, revisión de currículum y simulacros de entrevista para estancias profesionales.", "60 hours", "62 hours", "/demo/evento-taller-cv.svg", "Ing. Marco Antonio Ríos · Egresado ESCOM"],
  ["Canchas de fútbol", "Torneo Relámpago de Bienvenida ESCOM", "Encuentros eliminatorios entre equipos representativos de todos los semestres.", "84 hours", "88 hours", "/demo/amistoso-futbol.webp", null],
];
for (const [spaceName, title, description, startInterval, endInterval, imageUrl, speaker] of spaceEventsSeed) {
  await pool.query(
    `insert into public.space_events (space_id, title, description, starts_at, ends_at, created_by, approval_status, authorized_by, image_url, speaker, is_public)
     select s.id, $2, $3, date_trunc('hour', now()) + $4::interval, date_trunc('hour', now()) + $5::interval, $6, 'aprobado', $6, $7, $8, true
     from public.spaces s
     where s.name = $1
       and not exists (select 1 from public.space_events e where e.space_id = s.id and e.title = $2)`,
    [spaceName, title, description, startInterval, endInterval, spaceName === "Auditorio" ? becasMod : spaceName === "Sala 14" ? id("subdireccion@ipn.mx") : adminId, imageUrl, speaker],
  );
  await pool.query(
    `update public.space_events set image_url = coalesce(image_url, $2), speaker = coalesce(speaker, $3) where title = $1`,
    [title, imageUrl, speaker],
  );
}

await pool.query(`
  create table if not exists public.event_attendees (
    event_kind text not null check (event_kind in ('space', 'club')),
    event_id uuid not null,
    user_id uuid not null references public.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (event_kind, event_id, user_id)
  );
  create index if not exists event_attendees_lookup on public.event_attendees (event_kind, event_id);
`);

const spaceAttendanceSeed = [
  ["Feria de Clubes Académicos, Culturales y Deportivos 2026-B", [student, secondStudent, professor, comms, gestion, clubesMod, culturalesMod, becasMod, cattMod, adminId]],
  ["Conferencia Magistral: Inteligencia Artificial y Ciberseguridad en el IPN", [student, secondStudent, professor, comms, gestion, cattMod, adminId]],
  ["Torneo Relámpago de Bienvenida ESCOM", [student, secondStudent, becasMod, culturalesMod, clubesMod]],
  ["Taller de Preparación para Entrevistas Técnicas y CV", [student, secondStudent, professor, cattMod]],
];
for (const [title, userList] of spaceAttendanceSeed) {
  for (const uid of userList) {
    if (!uid) continue;
    await pool.query(
      `insert into public.event_attendees (event_kind, event_id, user_id)
       select 'space', e.id, $2 from public.space_events e where e.title = $1
       on conflict do nothing`,
      [title, uid],
    );
  }
}

const clubAttendanceSeed = [
  ["Maratón relámpago de estructuras de datos", [student, secondStudent, professor, clubesMod, gestion, cattMod]],
  ["Demostración de robots velocistas y sumo", [student, secondStudent, professor, adminId]],
  ["Partido de preparación ESCOM Interclubes", [secondStudent, culturalesMod, becasMod]],
];
for (const [title, userList] of clubAttendanceSeed) {
  for (const uid of userList) {
    if (!uid) continue;
    await pool.query(
      `insert into public.event_attendees (event_kind, event_id, user_id)
       select 'club', e.id, $2 from public.club_events e where e.title = $1
       on conflict do nothing`,
      [title, uid],
    );
  }
}
await pool.query(`
  insert into public.cubicles (professor_id, label, building, floor, x, y, room_code)
  select $1, 'Cubículo 12', 'Edificio 2', '1', 48, 22, '2112'
  where not exists (select 1 from public.cubicles where label = 'Cubículo 12')
`, [professor]);
await pool.query(`update public.cubicles set room_code = '2112' where label = 'Cubículo 12' and room_code is null`);
await pool.query(`
  insert into public.badges (user_id, code, label) values ($1, 'pionero', 'Cuenta de demostración')
  on conflict (user_id, code) do nothing
`, [student]);
try {
  const sseisUser = ids.get("sseis@ipn.mx");
  if (sseisUser && culturalesMod) {
    await pool.query(
      `insert into public.club_area_delegates (user_id, assigned_by, scope, active, note)
       values ($1, $2, 'cultural_deportivo', true, 'Coordinación de clubes culturales y deportivos designada por SSEIS')
       on conflict (user_id, scope) do nothing`,
      [culturalesMod, sseisUser],
    );
  }
} catch {
  // La tabla club_area_delegates existe tras aplicar migración 20261122000100
}
await pool.end();
console.log(`Seed listo: ${people.length} cuentas · contraseña compartida: ${password}`);
