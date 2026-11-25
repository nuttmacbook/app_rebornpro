import { settings, addProblem } from "../../../engine/settings";
import { escape } from "./parts";
import { ring } from "./ring";
import { t } from "../../lang";

/*
 * YOUR CODE (off-chain). Maintenance switch for the website, set in settings/.env (and on Vercel):
 *   VITE_MAINTENANCE=on|off            on = every page shows the maintenance screen and reads nothing from the chain
 *   VITE_MAINTENANCE_MESSAGE=...       optional line shown on that screen (empty = the standard sentence)
 *   VITE_MAINTENANCE_BYPASS=...        optional word: opening the site with ?bypass=<word> shows the real site in that
 *                                      browser tab (to check things or use Owner tools). It sits in the public JavaScript,
 *                                      so it only hides the site from casual visitors; owner actions still need the owner wallet.
 * Vite reads these when the site is built: after changing them on Vercel, redeploy (about a minute).
 * Only the website stops: the smart contract keeps running. To stop sales too, pause packages on the Owner page.
 */

const env = import.meta.env;
const BYPASS_KEY = "reborn.maintenanceBypass";

const mode = String(env.VITE_MAINTENANCE ?? "").trim().toLowerCase();
if (mode !== "on" && mode !== "off") addProblem("VITE_MAINTENANCE is not set in settings/.env (on or off).");

/** True when the maintenance screen should show instead of the site */
function isMaintenance() {
    if (mode !== "on") return false;
    const word = String(env.VITE_MAINTENANCE_BYPASS ?? "").trim();
    if (!word) return true;
    try {
        const given = new URLSearchParams(window.location.search).get("bypass");
        if (given === word) sessionStorage.setItem(BYPASS_KEY, word);
        return sessionStorage.getItem(BYPASS_KEY) !== word;
    } catch {
        return true;
    }
}

/** The maintenance screen, drawn once into #app */
function showMaintenance() {
    const app = document.querySelector("#app");
    if (!app) return;
    const message = String(env.VITE_MAINTENANCE_MESSAGE ?? "").trim();
    document.title = `${settings.appName}: ${t("Maintenance")}`;
    app.innerHTML = /*html*/`
        <main class="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
            <img src="/brand-mark.png" alt="${escape(settings.appName)}" class="h-14 w-auto" />
            <div class="mt-8">${ring({ filled: 2, label: "", size: "size-28" })}</div>
            <h1 class="mt-8 font-display text-[2rem] font-semibold leading-tight text-bone sm:text-[2.4rem]">${t("We are updating {name}", { name: escape(settings.appName) })}</h1>
            <p class="mt-4 text-[16px] leading-relaxed text-cinder">${message ? escape(message) : t("The website is closed for a short update. Your IDs, boards and earnings are safe on BNB Smart Chain and nothing is lost. Please come back soon.")}</p>
        </main>
    `;
}

export { isMaintenance, showMaintenance };
