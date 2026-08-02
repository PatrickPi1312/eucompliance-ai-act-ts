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
import { type DiscloseOptions, type Disclosure } from "./index.js";
export interface MiddlewareOptions extends DiscloseOptions {
    /** Auf den Nachweis warten, bevor die Antwort zurueckgeht. Standard: nein.
     *  Nur einschalten, wenn der Nachweis synchron im selben Aufruf vorliegen
     *  muss - es kostet Wartezeit bei jedem Modellaufruf. */
    await?: boolean;
    /** Wird nach jedem Nachweis aufgerufen - zum Wegschreiben in Ihr Protokoll. */
    onDisclosure?: (d: Disclosure) => void;
}
/**
 * Middleware fuer `wrapLanguageModel`.
 *
 * Rueckgabe absichtlich `any`: So passt sie auf LanguageModelV2 wie V3, ohne
 * dass dieses Paket eine Fassung des SDK vorschreibt.
 */
export declare function euComplianceMiddleware(options?: MiddlewareOptions): any;
export default euComplianceMiddleware;
