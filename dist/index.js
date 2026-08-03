/**
 * Artikel 50 KI-Verordnung - Kennzeichnung in einer Zeile.
 *
 * Seit dem 2. August 2026 gilt Artikel 50 der KI-Verordnung. Wer ein fremdes
 * Modell in sein Produkt einbaut, ist Betreiber und schuldet die Offenlegung -
 * nicht der Modellanbieter. Bussgeld bis 15 Mio. EUR oder 3 % des weltweiten
 * Jahresumsatzes.
 *
 *     import { wrap } from "eucompliance-ai-act";
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
export const VERSION = "0.2.1";
const FREI = "https://api.eucompliance.tools/free/ai-disclosure";
const PRUEFEN = "https://api.eucompliance.tools/verify";
/** Fallback, falls der Dienst nicht erreichbar ist. Die Pflicht besteht auch
 *  dann - ein Ausfall bei uns darf nicht dazu fuehren, dass beim Kunden gar
 *  kein Hinweis erscheint. Wortlaut identisch mit dem des Dienstes. */
const NOTFALL = {
    de: {
        text: "Dieser Inhalt wurde mit künstlicher Intelligenz erzeugt.",
        bearbeitet: "Dieser Inhalt wurde mit künstlicher Intelligenz erzeugt und anschließend redaktionell bearbeitet.",
        deepfake: "Dieses Bild- oder Tonmaterial wurde künstlich erzeugt oder verändert.",
        interaktion: "Sie sprechen mit einem KI-System, nicht mit einem Menschen.",
    },
    en: {
        text: "This content was generated using artificial intelligence.",
        bearbeitet: "This content was generated using artificial intelligence and subsequently edited.",
        deepfake: "This image or audio material has been artificially generated or manipulated.",
        interaktion: "You are interacting with an AI system, not a human.",
    },
};
/** SHA-256 des Inhalts. Laeuft lokal, nichts wird uebertragen. */
export async function hashContent(content) {
    const roh = typeof content === "string" ? new TextEncoder().encode(content) : content;
    // Eigener Puffer: neuere TypeScript-Fassungen lassen SharedArrayBuffer hier
    // nicht zu, und ein kopierter Bereich ist ohnehin die sichere Variante.
    const daten = new Uint8Array(roh.length);
    daten.set(roh);
    const puffer = await crypto.subtle.digest("SHA-256", daten);
    return Array.from(new Uint8Array(puffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
/** Kennzeichnet eine KI-Ausgabe nach Artikel 50. */
export async function disclose(content, options = {}) {
    const kind = options.kind ?? "text";
    const language = options.language ?? "de";
    const hash = await hashContent(content);
    const laenge = typeof content === "string"
        ? new TextEncoder().encode(content).length
        : content.length;
    const koerper = {
        content_sha256: hash,
        content_length: laenge,
        model: options.model,
        model_provider: options.modelProvider,
        deployer: options.deployer,
        kind,
        language,
        purpose: options.purpose,
        deployer_in_eu: options.deployerInEu ?? true,
        eu_users: options.euUsers ?? true,
    };
    const ziel = options.endpoint ?? FREI;
    const kopf = {
        "Content-Type": "application/json",
        "User-Agent": `eucompliance-ai-act/${VERSION}`,
    };
    if (options.apiKey)
        kopf["X-API-Key"] = options.apiKey;
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), options.timeoutMs ?? 6000);
    try {
        const antwort = await fetch(ziel, {
            method: "POST",
            headers: kopf,
            body: JSON.stringify(koerper),
            signal: abbruch.signal,
        });
        if (!antwort.ok)
            throw new Error(`HTTP ${antwort.status}`);
        const d = (await antwort.json());
        return {
            text: d?.disclosure?.text ?? NOTFALL[language][kind],
            language: d?.disclosure?.language ?? language,
            contentSha256: hash,
            record: d,
            obligations: d?.obligations ?? [],
            signed: Boolean(d?.extensions?.["delivery-receipt"] ?? d?.receipt),
            offline: false,
        };
    }
    catch (e) {
        // Ausfall darf nicht blockieren - die Pflicht besteht trotzdem.
        return {
            text: NOTFALL[language][kind],
            language,
            contentSha256: hash,
            record: {
                content_sha256: hash,
                synthetic: true,
                kind,
                model: options.model,
                deployer: options.deployer,
                unsigned: true,
            },
            obligations: [],
            signed: false,
            offline: true,
            error: e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120),
        };
    }
    finally {
        clearTimeout(uhr);
    }
}
/** Prueft einen Nachweis. Kostenlos, ohne Konto. */
export async function verify(record, content, timeoutMs = 6000) {
    let ergebnis = {};
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), timeoutMs);
    try {
        const antwort = await fetch(PRUEFEN, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record),
            signal: abbruch.signal,
        });
        ergebnis = (await antwort.json());
    }
    catch (e) {
        ergebnis = {
            valid: null,
            error: e instanceof Error ? e.message.slice(0, 120) : String(e),
        };
    }
    finally {
        clearTimeout(uhr);
    }
    if (content !== undefined) {
        const soll = record?.provenance?.content_sha256;
        ergebnis.content_matches = soll ? soll === (await hashContent(content)) : null;
    }
    return ergebnis;
}
/**
 * Haengt die Kennzeichnung in einen bestehenden Client ein.
 *
 *     const client = wrap(new OpenAI(), { deployer: "Muster GmbH" });
 *
 * Danach traegt jede Antwort ein Feld `disclosure`. Alles andere bleibt, wie
 * es war - dieselben Aufrufe, dieselben Rueckgaben, dieselben Fehler.
 */
export function wrap(client, options = {}) {
    const ziel = findeAufruf(client);
    if (!ziel) {
        throw new TypeError("client shape not recognised - expected .chat.completions.create or " +
            ".messages.create. Use disclose() directly instead.");
    }
    const [halter, name] = ziel;
    const original = halter[name];
    if (original.__eucomplianceWrapped)
        return client;
    const gewickelt = async function (...args) {
        const antwort = await original.apply(this, args);
        try {
            const text = textAus(antwort);
            if (text) {
                const d = await disclose(text, {
                    ...options,
                    model: options.model ?? args?.[0]?.model,
                });
                try {
                    antwort.disclosure = d;
                }
                catch {
                    /* eingefrorene Antwort - dann eben ohne Anhang */
                }
            }
        }
        catch {
            // Eine Kennzeichnung darf niemals den Aufruf des Kunden brechen.
        }
        return antwort;
    };
    gewickelt.__eucomplianceWrapped = true;
    halter[name] = gewickelt;
    return client;
}
function findeAufruf(client) {
    const pfade = [
        ["chat", "completions", "create"],
        ["messages", "create"],
        ["responses", "create"],
    ];
    for (const pfad of pfade) {
        let o = client;
        let ok = true;
        for (const teil of pfad.slice(0, -1)) {
            o = o?.[teil];
            if (!o) {
                ok = false;
                break;
            }
        }
        const letzter = pfad[pfad.length - 1];
        if (ok && typeof o?.[letzter] === "function")
            return [o, letzter];
    }
    return null;
}
function textAus(antwort) {
    const chat = antwort?.choices?.[0]?.message?.content;
    if (typeof chat === "string" && chat)
        return chat;
    if (Array.isArray(antwort?.content)) {
        const teile = antwort.content
            .map((b) => b?.text)
            .filter((t) => typeof t === "string");
        if (teile.length)
            return teile.join("");
    }
    if (typeof antwort?.output_text === "string" && antwort.output_text) {
        return antwort.output_text;
    }
    if (typeof antwort === "string")
        return antwort;
    return null;
}
