import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { draftFromText } = createJiti(import.meta.url)("../src/app/guias/document.ts");

test("un membrete con ruido OCR y un pie de página quedan fuera del recorrido", () => {
  const header = "IPN |\nESCOM\nINSTITUTO POLITÉCNICO NACIONAL\nSUBDIRECCIÓN ACADÉMICA";
  const draft = draftFromText([
    header, "Proceso para solicitar un grupo.", "La solicitud aplica cuando faltan lugares.", "Pasos:",
    "1.- Entregar la solicitud con los datos de contacto.",
    "2.- El área revisa las opciones de horario.",
    "3.- El área responde dentro de cinco días hábiles.",
    "3.- Inscribir a las personas que:", "● cumplen los requisitos", "● tienen horario disponible",
    "4.- Ofrecer los lugares restantes.", "\f", header, "Vigencia: periodo 2022",
  ].join("\n"));
  assert.equal(draft.title, "Proceso para solicitar un grupo");
  assert.match(draft.summary, /faltan lugares/);
  assert.match(draft.summary, /Vigencia: periodo 2022/);
  assert.deepEqual(draft.steps.map((s) => s.title), [
    "Entregar la solicitud con los datos de contacto", "El área revisa las opciones de horario",
    "El área responde dentro de cinco días hábiles", "Inscribir a las personas", "Ofrecer los lugares restantes",
  ]);
  assert.match(draft.steps[3].body, /● cumplen los requisitos\n● tienen horario disponible/);
  assert.doesNotMatch(draft.steps.at(-1).body, /IPN|ESCOM|Vigencia/);
});

test("la prosa sin membrete ni numeración conserva su primera acción", () => {
  const draft = draftFromText("Descarga el formato. Entrega el formato firmado.");
  assert.deepEqual(draft.steps.map((s) => s.body), ["Descarga el formato.", "Entrega el formato firmado."]);
});

test("las decisiones anteriores a un paso numerado siguen siendo parte del recorrido", () => {
  const draft = draftFromText("Guía de registro\nSi eres alumno: Presenta tu credencial.\nSi eres docente: Presenta tu gafete.\n1. Conserva tu folio.");
  assert.deepEqual(draft.steps[0].choices.map((c) => c.to), [2, 3]);
  assert.deepEqual(draft.steps.slice(1, 3).map((s) => s.choices[0].to), [4, 4]);
});

test("un archivo con solo membrete y vigencia no produce un trámite", () => {
  assert.throws(() => draftFromText("INSTITUTO POLITÉCNICO NACIONAL\nSUBDIRECCIÓN ACADÉMICA\nPasos:\nVigencia: periodo 2022"), /No pudimos leer instrucciones/);
});
