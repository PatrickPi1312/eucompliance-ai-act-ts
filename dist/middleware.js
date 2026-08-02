/**
 * Einklinkstelle fuer das Vercel AI SDK.
 *
 *     import { wrapLanguageModel } from "ai";
 *     import { euComplianceMiddleware } from "eucompliance-ai-act/middleware";
 *
 *     const model = wrapLanguageModel({
 *       model: openai("gpt-5"),
 *       middleware: euComplianceMiddleware({ deployer: "Muster GmbH" }),
 *     });
 *
 * Danach traegt jede Antwort ihren Artikel-50-Nachweis in
 * `providerMetadata.eucompliance`.
 *
 * Drei Eigenschaften sind hier wichtiger als Funktionsumfang, weil ein
 * Compliance-Zusatz, der Produktion stoert, nach dem ersten Zwischenfall
 * entfernt wird:
 *
 * - Der Modellaufruf wartet nie auf uns (ausser man verlangt es ausdruecklich).
 * - Faellt hier etwas aus, laeuft die Anwendung unveraendert weiter.
 * - Der Inhalt verlaesst das System nicht: gehasht wird lokal, uebertragen
 *   wird nur der Hash.
 *
 * Bewusst KEIN Import aus "ai": Das Paket bleibt damit ohne Abhaengigkeit auf
 * das SDK, und die Middleware passt auf jede Fassung, die `wrapGenerate` und
 * `wrapStream` kennt.
 */
import { disclose } from "./index.js";
/** Holt den erzeugten Text aus dem, was das SDK zurueckgibt, ohne dessen
 *  innere Form vorauszusetzen - die hat sich zwischen Fassungen geaendert. */
function textAus(ergebnis) {
    if (!ergebnis)
        return "";
    if (typeof ergebnis.text === "string")
        return ergebnis.text;
    const teile = ergebnis.content;
    if (Array.isArray(teile)) {
        return teile
            .filter((t) => t && (t.type === "text" || typeof t.text === "string"))
            .map((t) => t.text || "")
            .join("");
    }
    return "";
}
function melden(o, text, modell) {
    if (!text)
        return Promise.resolve(null);
    return disclose(text, { ...o, model: o.model || modell })
        .then((d) => {
        try {
            o.onDisclosure?.(d);
        }
        catch { /* Protokoll des Kunden darf nie stoeren */ }
        return d;
    })
        .catch(() => null);
}
/**
 * Middleware fuer `wrapLanguageModel`.
 *
 * Rueckgabe absichtlich `any`: So passt sie auf LanguageModelV2 wie V3, ohne
 * dass dieses Paket eine Fassung des SDK vorschreibt.
 */
export function euComplianceMiddleware(options = {}) {
    return {
        async wrapGenerate({ doGenerate, model }) {
            const ergebnis = await doGenerate();
            try {
                const modell = model?.modelId || options.model;
                const versprechen = melden(options, textAus(ergebnis), modell);
                if (options.await) {
                    const d = await versprechen;
                    if (d) {
                        return {
                            ...ergebnis,
                            providerMetadata: {
                                ...(ergebnis.providerMetadata || {}),
                                eucompliance: {
                                    disclosure: d.text,
                                    contentSha256: d.contentSha256,
                                    record: d.record,
                                    signed: d.signed,
                                    offline: d.offline,
                                },
                            },
                        };
                    }
                }
            }
            catch {
                /* Kennzeichnung ist Beiwerk - die Antwort geht in jedem Fall raus. */
            }
            return ergebnis;
        },
        async wrapStream({ doStream, model }) {
            const ergebnis = await doStream();
            try {
                const modell = model?.modelId || options.model;
                let gesammelt = "";
                const durchreichen = new TransformStream({
                    transform(teil, steuerung) {
                        try {
                            if (teil?.type === "text-delta" && typeof teil.delta === "string") {
                                gesammelt += teil.delta;
                            }
                            else if (teil?.type === "text-delta" && typeof teil.textDelta === "string") {
                                gesammelt += teil.textDelta; // aeltere Fassungen des SDK
                            }
                        }
                        catch { /* niemals den Datenstrom des Kunden aufhalten */ }
                        steuerung.enqueue(teil);
                    },
                    flush() {
                        void melden(options, gesammelt, modell);
                    },
                });
                return { ...ergebnis, stream: ergebnis.stream.pipeThrough(durchreichen) };
            }
            catch {
                return ergebnis;
            }
        },
    };
}
export default euComplianceMiddleware;
