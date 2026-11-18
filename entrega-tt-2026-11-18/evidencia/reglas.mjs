import test from "node:test";
import assert from "node:assert/strict";
import { validateSteps, pathToStep } from "../../src/app/guias/shared.ts";
import { canManageAvisos, isCategory, parseExternalUrl } from "../../src/app/avisos/shared.ts";
import { findSimilarClubsOrProposals } from "../../src/app/clubes/similarity.ts";
import { canModerateForumQuestion, isArea, isRequestKind } from "../../src/app/foro/shared.ts";
import { canManageSpaceByName, clubEventVenueArea, officeEventSpace } from "../../src/app/espacios/shared.ts";
import { isStaffArea, officeModules, procedureOffice } from "../../src/lib/areas.ts";

const steps = [
  { id: 1, title: "Tipo de solicitud", body: "Elige el trámite.", choices: [{ label: "Renovación", to: 3 }, { label: "Alta", to: 2 }] },
  { id: 2, title: "Alta", body: "Revisa la lista de documentos.", choices: [] },
  { id: 3, title: "Renovación", body: "Consulta tu folio.", choices: [] }
];

test("La guía conserva las dos ramas del trámite", () => assert.deepEqual(validateSteps(steps).steps, steps));
test("Renovación conduce al paso 3", () => assert.deepEqual(pathToStep(steps, 3), [1, 3]));
test("Se rechaza un recorrido que vuelve al primer paso", () => assert.ok(validateSteps([steps[0], steps[1], { ...steps[2], choices: [{ label: "Volver", to: 1 }] }]).error));
test("Se rechaza un destino que desapareció", () => assert.ok(validateSteps(steps.slice(0, 2)).error));
test("Se identifican las tres categorías de avisos", () => assert.deepEqual(["academico", "social", "tramites", "otra"].map(isCategory), [true, true, true, false]));
test("Comunicación gestiona avisos y Becas carece de ese permiso", () => {
  assert.equal(canManageAvisos({ role: "moderador", area: "comunicacion" }), true);
  assert.equal(canManageAvisos({ role: "moderador", area: "becas" }), false);
});
test("Un enlace HTTPS se admite y un esquema ajeno se rechaza", () => {
  assert.equal(parseExternalUrl("https://example.org/aviso").url, "https://example.org/aviso");
  assert.ok(parseExternalUrl("ftp://example.org/doc").error);
});
test("Se detecta un nombre de club repetido aun sin acento", () => {
  const catalog = [{ id: "1", name: "Club de Robótica", kind: "academico", text: "Robots", type: "club", statusLabel: "Activo" }];
  assert.equal(findSimilarClubsOrProposals("robotica", "", catalog)[0]?.isBlocking, true);
});
test("Las oficinas de trámites y sedes solo ven sus módulos asignados", () => {
  assert.equal(procedureOffice({ role: "moderador", area: "gestion_escolar" }), "gestion_escolar");
  assert.deepEqual(officeModules({ role: "moderador", area: "gestion_escolar" }), ["/foro"]);
  assert.deepEqual(officeModules({ role: "moderador", area: "becas" }), ["/foro", "/eventos"]);
  assert.deepEqual(officeModules({ role: "moderador", area: "subdireccion_academica" }), ["/clubes", "/eventos"]);
  assert.equal(officeModules({ role: "alumno", area: null }), null);
  assert.equal(isStaffArea("subdireccion_academica"), true);
});
test("Moderación del foro respeta área y tipo de solicitud", () => {
  assert.equal(isArea("becas"), true);
  assert.equal(isRequestKind("actualizar_guia"), true);
  assert.equal(canModerateForumQuestion({ role: "moderador", area: "becas" }, "becas", "pregunta"), true);
  assert.equal(canModerateForumQuestion({ role: "moderador", area: "becas" }, "catt", "pregunta"), false);
  assert.equal(canModerateForumQuestion({ role: "moderador", area: "prefectura" }, "infraestructura", "cambio_info"), true);
});
test("Auditorio corresponde a Becas y Sala 14 a Subdirección Académica", () => {
  assert.equal(canManageSpaceByName({ role: "moderador", area: "becas" }, "Auditorio"), true);
  assert.equal(canManageSpaceByName({ role: "moderador", area: "becas" }, "Sala 14"), false);
  assert.equal(canManageSpaceByName({ role: "moderador", area: "subdireccion_academica" }, "Sala 14"), true);
  assert.equal(officeEventSpace({ role: "moderador", area: "becas" }), "Auditorio");
  assert.equal(clubEventVenueArea("Sala 14 · Edificio de Gobierno"), "subdireccion_academica");
});
