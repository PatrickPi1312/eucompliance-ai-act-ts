/* Prueft die Einklinkstelle fuers Vercel AI SDK - ohne das SDK zu installieren.
   Genau das ist der Sinn: Die Middleware darf keine Fassung voraussetzen. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { euComplianceMiddleware } from "../dist/middleware.js";

const modell = { modelId: "gpt-5" };

test("die Antwort geht unveraendert durch", async () => {
  const mw = euComplianceMiddleware({ deployer: "Testbetrieb GmbH" });
  const ergebnis = await mw.wrapGenerate({
    doGenerate: async () => ({ content: [{ type: "text", text: "Hallo Welt" }], finishReason: "stop" }),
    model: modell,
  });
  assert.equal(ergebnis.content[0].text, "Hallo Welt");
  assert.equal(ergebnis.finishReason, "stop");
});

test("mit await liegt der Nachweis in providerMetadata", async () => {
  const mw = euComplianceMiddleware({ deployer: "Testbetrieb GmbH", await: true });
  const ergebnis = await mw.wrapGenerate({
    doGenerate: async () => ({ content: [{ type: "text", text: "Eine Modellausgabe." }] }),
    model: modell,
  });
  const e = ergebnis.providerMetadata?.eucompliance;
  assert.ok(e, "providerMetadata.eucompliance fehlt");
  assert.match(e.disclosure, /künstlich|artificial/i);
  assert.match(e.contentSha256, /^[0-9a-f]{64}$/);
});

test("der Inhalt selbst wird nicht mitgeschickt", async () => {
  const geheim = "STRENG-VERTRAULICH-4711";
  const mw = euComplianceMiddleware({ deployer: "Testbetrieb GmbH", await: true });
  const ergebnis = await mw.wrapGenerate({
    doGenerate: async () => ({ content: [{ type: "text", text: geheim }] }),
    model: modell,
  });
  const roh = JSON.stringify(ergebnis.providerMetadata.eucompliance.record ?? {});
  assert.ok(!roh.includes(geheim), "Klartext im Nachweis gefunden");
});

test("ein Ausfall bei uns bricht den Aufruf nicht ab", async () => {
  const mw = euComplianceMiddleware({
    deployer: "Testbetrieb GmbH", await: true,
    endpoint: "https://127.0.0.1:1/gibt-es-nicht", timeout: 1000,
  });
  const ergebnis = await mw.wrapGenerate({
    doGenerate: async () => ({ content: [{ type: "text", text: "Trotzdem da" }] }),
    model: modell,
  });
  assert.equal(ergebnis.content[0].text, "Trotzdem da");
});

test("ohne await wird der Aufruf nicht aufgehalten", async () => {
  const mw = euComplianceMiddleware({ deployer: "Testbetrieb GmbH" });
  const start = Date.now();
  await mw.wrapGenerate({
    doGenerate: async () => ({ content: [{ type: "text", text: "Schnell" }] }),
    model: modell,
  });
  assert.ok(Date.now() - start < 150, "die Middleware hat gewartet");
});

test("Datenstrom kommt vollstaendig und in der richtigen Reihenfolge an", async () => {
  const mw = euComplianceMiddleware({ deployer: "Testbetrieb GmbH" });
  const teile = [
    { type: "text-delta", delta: "Hallo " },
    { type: "text-delta", delta: "Welt" },
    { type: "finish", finishReason: "stop" },
  ];
  const quelle = new ReadableStream({
    start(c) { teile.forEach((t) => c.enqueue(t)); c.close(); },
  });
  const ergebnis = await mw.wrapStream({ doStream: async () => ({ stream: quelle }), model: modell });

  const gelesen = [];
  for await (const t of ergebnis.stream) gelesen.push(t);
  assert.equal(gelesen.length, 3);
  assert.equal(gelesen[0].delta, "Hallo ");
  assert.equal(gelesen[2].type, "finish");
});

test("leere Ausgabe erzeugt keinen Nachweis", async () => {
  let gerufen = 0;
  const mw = euComplianceMiddleware({
    deployer: "Testbetrieb GmbH", await: true, onDisclosure: () => { gerufen++; },
  });
  await mw.wrapGenerate({ doGenerate: async () => ({ content: [] }), model: modell });
  assert.equal(gerufen, 0);
});
