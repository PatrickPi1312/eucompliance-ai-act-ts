/**
 * Artikel 50 KI-Verordnung - Kennzeichnung in einer Zeile.
 *
 * Seit dem 2. August 2026 gilt Artikel 50 der KI-Verordnung. Wer ein fremdes
 * Modell in sein Produkt einbaut, ist Betreiber und schuldet die Offenlegung -
 * nicht der Modellanbieter. Bussgeld bis 15 Mio. EUR oder 3 % des weltweiten
 * Jahresumsatzes.
 *
 *     import { wrap } from "@eucompliance/ai-act";
 *     const client = wrap(new OpenAI(), { deployer: "Muster GmbH" });
 *
 * Danach traegt jede Antwort ihren Nachweis und ihren Hinweistext. Sonst
 * aendert sich nichts.
 *
 * DATENSCHUTZ: Der Inhalt verlaesst Ihr System nicht. Der SHA-256 wird lokal
 * berechnet, uebertragen wird nur der Hash. Wir bezeugen etwas, das wir nicht
 * zurueckrechnen koennen.
 *
 * GRENZE: Bezeugt wird Herkunft - dass genau dieser Inhalt zu diesem Zeitpunkt
 * als KI-erzeugt gekennzeichnet wurde und unveraendert ist. NICHT bezeugt wird,
 * dass Inhalt ohne Nachweis menschlich ist. Zuverlaessige Erkennung von
 * KI-Text existiert nicht.
 */
export declare const VERSION = "0.2.0";
export type Kind = "text" | "bearbeitet" | "deepfake" | "interaktion";
export type Language = "de" | "en";
export interface DiscloseOptions {
    model?: string;
    modelProvider?: string;
    deployer?: string;
    kind?: Kind;
    language?: Language;
    purpose?: string;
    deployerInEu?: boolean;
    euUsers?: boolean;
    timeoutMs?: number;
    endpoint?: string;
    apiKey?: string;
}
export interface Disclosure {
    /** Der Text, den Sie Ihren Nutzern anzeigen muessen. */
    text: string;
    language: string;
    contentSha256: string;
    /** Der vollstaendige, signierte Nachweis - fuer Ihre Unterlagen. */
    record: Record<string, unknown>;
    obligations: unknown[];
    signed: boolean;
    /** true, wenn der Dienst nicht erreichbar war und der Notfalltext griff. */
    offline: boolean;
    error?: string;
}
/** SHA-256 des Inhalts. Laeuft lokal, nichts wird uebertragen. */
export declare function hashContent(content: string | Uint8Array): Promise<string>;
/** Kennzeichnet eine KI-Ausgabe nach Artikel 50. */
export declare function disclose(content: string | Uint8Array, options?: DiscloseOptions): Promise<Disclosure>;
/** Prueft einen Nachweis. Kostenlos, ohne Konto. */
export declare function verify(record: Record<string, unknown>, content?: string | Uint8Array, timeoutMs?: number): Promise<Record<string, unknown>>;
/**
 * Haengt die Kennzeichnung in einen bestehenden Client ein.
 *
 *     const client = wrap(new OpenAI(), { deployer: "Muster GmbH" });
 *
 * Danach traegt jede Antwort ein Feld `disclosure`. Alles andere bleibt, wie
 * es war - dieselben Aufrufe, dieselben Rueckgaben, dieselben Fehler.
 */
export declare function wrap<T extends object>(client: T, options?: DiscloseOptions): T;
