import { TH } from "./th";

/*
 * YOUR CODE (off-chain text). Two languages: English (the text written in the code) and Thai.
 * t("English text", { name }) returns the text in the chosen language; {name} is filled in after translating.
 * A text a dictionary does not have stays in English, so nothing ever shows a raw key.
 * The choice is kept in this browser; the first visit is always English.
 */

const KEY = "reborn.lang";

// Order of the language menu. label = how the language names itself
const LANGUAGES = [
    { code: "en", label: "English", short: "EN", dict: null, locale: "en-GB" },
    { code: "th", label: "ไทย", short: "TH", dict: TH, locale: "th-TH-u-ca-gregory" },
];
const byCode = Object.fromEntries(LANGUAGES.map((l) => [ l.code, l ]));

const firstChoice = () => {
    try {
        const saved = localStorage.getItem(KEY);
        if (byCode[saved]) return saved;
    } catch {}
    return "en";
};

let current = firstChoice();
if (typeof document !== "undefined") document.documentElement.lang = current;

/** "en" or "th" */
const lang = () => current;

/** Switches the language (the caller redraws the page) */
const setLang = (next) => {
    if (!byCode[next]) return;
    current = next;
    try { localStorage.setItem(KEY, next); } catch {}
    if (typeof document !== "undefined") document.documentElement.lang = next;
};

/** Text in the chosen language, with {placeholders} filled from `vars` */
const t = (text, vars = null) => {
    const out = byCode[current]?.dict?.[text] ?? text;
    return vars ? out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : out;
};

/** Locale for dates written out in words (Gregorian years in Thai) */
const locale = () => byCode[current]?.locale ?? "en-GB";

export { t, lang, setLang, locale, LANGUAGES };
