import assert from "node:assert/strict";
import test from "node:test";

import { disclose, hashContent, verify, wrap } from "../dist/index.js";

const TEXT = "Sehr geehrte Damen und Herren, anbei unser Angebot.";

// Die Freistufe erlaubt fuenf Aufrufe je Tag und Adresse. Die Tests machen
// deshalb GENAU EINEN echten Aufruf und verwenden dessen Ergebnis weiter -
// sonst schlaegt der Durchlauf ab dem sechsten Test fehl, ohne dass am Paket
// etwas kaputt waere. Alles Uebrige laeuft gegen einen toten Endpunkt oder
// lokal.
let echt = null;

async function einmalEcht() {
  if (!echt) {
    echt = await disclose(TEXT, {
      model: "claude-opus-5",
      modelProvider: "Anthropic",
      deployer: "Muster GmbH",
      language: "de",
    });
  }
  return echt;
}

test("Hash laeuft lokal und ist aenderungsempfindlich", async () => {
  const h = await hashContent(TEXT);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await hashContent(TEXT));
  assert.notEqual(h, await hashContent(TEXT + "."));
});

test("Kennzeichnung gegen den echten Dienst", async () => {
  const d = await einmalEcht();
  assert.equal(d.offline, false, "Dienst nicht erreichbar: " + d.error);
  assert.ok(d.text.length > 10, "Hinweistext fehlt");
  assert.equal(d.contentSha256, await hashContent(TEXT));
  assert.ok(d.signed, "Nachweis nicht signiert");
  assert.ok(d.obligations.length >= 2, "Pflichten fehlen");
  // Der eigentliche Punkt: der Klartext taucht nirgends in der Antwort auf
  assert.ok(!JSON.stringify(d.record).includes(TEXT), "Klartext uebertragen!");
});

test("Pruefung erkennt Veraenderung", async () => {
  const d = await einmalEcht();
  const gut = await verify(d.record, TEXT);
  assert.equal(gut.valid, true, "Nachweis nicht gueltig");
  assert.equal(gut.content_matches, true);
  const schlecht = await verify(d.record, TEXT + " geaendert");
  assert.equal(schlecht.content_matches, false);
});

test("Ausfall blockiert nicht", async () => {
  const d = await disclose(TEXT, {
    deployer: "X",
    endpoint: "http://127.0.0.1:1/weg",
    timeoutMs: 800,
  });
  assert.ok(d.text.length > 10, "kein Notfalltext");
  assert.equal(d.offline, true);
  assert.ok(d.error);
});

test("Notfalltexte in beiden Sprachen und allen Arten", async () => {
  const tot = { endpoint: "http://127.0.0.1:1/weg", timeoutMs: 400, deployer: "X" };
  const en = await disclose(TEXT, { ...tot, language: "en" });
  assert.match(en.text.toLowerCase(), /artificial intelligence/);
  const dp = await disclose(TEXT, { ...tot, kind: "deepfake", language: "de" });
  assert.match(dp.text, /künstlich/);
  const ia = await disclose(TEXT, { ...tot, kind: "interaktion", language: "de" });
  assert.match(ia.text, /KI-System/);
});

function fakeClient() {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "Erzeugter Text aus dem Modell." } }],
        }),
      },
    },
  };
}

test("Der Einzeiler haengt sich ein", async () => {
  // gegen einen toten Endpunkt - geprueft wird das Einhaengen, nicht der Dienst
  const c = wrap(fakeClient(), {
    deployer: "Muster GmbH",
    endpoint: "http://127.0.0.1:1/weg",
    timeoutMs: 400,
  });
  const a = await c.chat.completions.create({ model: "gpt-5" });
  assert.match(a.choices[0].message.content, /^Erzeugter/, "Antwort veraendert");
  assert.ok(a.disclosure, "Kennzeichnung fehlt");
  assert.ok(a.disclosure.text.length > 10);
  assert.equal(
    a.disclosure.contentSha256,
    await hashContent("Erzeugter Text aus dem Modell."),
  );
});

test("doppeltes Einhaengen wird verhindert", () => {
  const c = wrap(fakeClient(), { deployer: "X" });
  assert.equal(wrap(c, { deployer: "X" }), c);
});

test("ein Fehler bei uns bricht den Kunden nicht", async () => {
  const c = wrap(fakeClient(), {
    deployer: "X",
    endpoint: "http://127.0.0.1:1/weg",
    timeoutMs: 400,
  });
  const a = await c.chat.completions.create({ model: "x" });
  assert.match(a.choices[0].message.content, /^Erzeugter/);
});

test("unbekannter Client wird klar abgewiesen", () => {
  assert.throws(() => wrap({ irgendwas: 1 }), TypeError);
});
