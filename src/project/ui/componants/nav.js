import { shortAddress } from "../../../engine/ui/helpers";
import { settings } from "../../../engine/settings";
import { t, lang, LANGUAGES } from "../../lang";

/*
 * YOUR CODE (off-chain). Navigation: a narrow rail on the left from 1024px (mark, pages, wallet),
 * and on phones a top strip (mark + wallet) with a tab bar along the bottom, where the thumb is.
 * The engine draws it with every page as `header`.
 */

const icon = {
    home: `<path d="M12 3c2.5 3 5 5.2 5 9a5 5 0 0 1-10 0c0-2 .8-3.3 2-4.5.2 1.6 1 2.5 2 2.5 0-2.5.2-4.6 1-7z" />`,
    plan: `<path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 12l8 4 8-4" /><path d="M4 17l8 4 8-4" />`,
    board: `<circle cx="12" cy="5" r="2.2" /><circle cx="5" cy="18" r="2.2" /><circle cx="12" cy="18" r="2.2" /><circle cx="19" cy="18" r="2.2" /><path d="M12 7.2v8.6M11 7l-5 9M13 7l5 9" />`,
    history: `<circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />`,
    team: `<circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 19" />`,
};

const LINKS = [
    { page: "home", label: "Home", href: "#/" },
    { page: "board", label: "Board", href: "#/board" },
    { page: "plan", label: "Plan", href: "#/plan" },
    { page: "team", label: "Team", href: "#/team" },
    { page: "history", label: "History", href: "#/history" },
];

const currentPage = () => (typeof window === "undefined" ? "home" : window.location.hash.replace(/^#\/?/, "").split("?")[0] || "home");

const glyph = (name) => `<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon[name]}</svg>`;

const walletButton = (data, extra = "") => {
    const address = data?.wallet?.address;
    return /*html*/`
        <button type="button" onclick="openWallet()" class="btn ${address ? "btn-line" : "btn-fire"} ${extra} px-3 py-2 font-display text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame"
            aria-label="${address ? t("Wallet menu") : t("Connect wallet")}">
            ${address ? `<span class="figure">${shortAddress(address)}</span>${data?.wallet?.isDemo ? ` <span class="text-smolder">demo</span>` : ""}` : t("Connect")}
        </button>
    `;
};

/** Language menu: the current language, opening a list of both (setLanguage is in ui/main.js) */
const langMenu = (place) => {
    const now = LANGUAGES.find((l) => l.code === lang()) ?? LANGUAGES[0];
    const isRail = place === "rail";
    return /*html*/`
        <details class="relative ${isRail ? "w-full" : ""}" data-lang-menu>
            <summary class="flex cursor-pointer list-none items-center justify-center gap-1 rounded-lg px-2 py-2 text-[12px] font-semibold text-cinder hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame [&::-webkit-details-marker]:hidden" aria-label="${t("Language")}">
                <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
                <span>${now.short}</span>
            </summary>
            <div class="absolute z-40 min-w-[9rem] overflow-hidden rounded-xl border border-white/10 bg-[#121214] py-1 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.9)] ${isRail ? "bottom-0 left-full ml-2" : "right-0 top-full mt-2"}" role="menu">
                ${LANGUAGES.map((l) => /*html*/`
                    <button type="button" role="menuitemradio" aria-checked="${l.code === now.code}" onclick="setLanguage('${l.code}')"
                        class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none ${l.code === now.code ? "text-bone" : "text-cinder"}">
                        <span lang="${l.code}">${l.label}</span>${l.code === now.code ? `<span class="size-1.5 rounded-full bg-flame"></span>` : ""}
                    </button>`).join("")}
            </div>
        </details>
    `;
};

const header = (data) => {
    const page = currentPage();
    const rail = LINKS.map((l) => {
        const isActive = l.page === page;
        return /*html*/`
            <a href="${l.href}" ${isActive ? `aria-current="page"` : ""}
                class="group relative flex flex-col items-center gap-1 py-3 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame ${isActive ? "text-bone" : "text-smolder hover:text-cinder"}">
                ${isActive ? `<span class="absolute left-0 top-2 bottom-2 w-[3px] bg-gradient-to-b from-ember to-blood" aria-hidden="true"></span>` : ""}
                <span class="${isActive ? "text-flame" : ""}">${glyph(l.page)}</span>${t(l.label)}
            </a>`;
    }).join("");
    const tabs = LINKS.map((l) => {
        const isActive = l.page === page;
        return /*html*/`
            <a href="${l.href}" ${isActive ? `aria-current="page"` : ""} class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? "text-bone" : "text-smolder"}">
                <span class="${isActive ? "text-flame" : ""}">${glyph(l.page)}</span>${t(l.label)}
            </a>`;
    }).join("");

    return /*html*/`
    <aside class="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center border-r border-seam bg-void/60 py-5 lg:flex" aria-label="${t("Pages")}">
        <a href="#/" class="mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame" aria-label="${settings.appName}"><img src="/brand-mark.png" alt="" class="h-9 w-auto" /></a>
        <nav class="flex w-full flex-col">${rail}</nav>
    </aside>

    <header class="sticky top-0 z-20 border-b border-seam bg-void/90">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
            <a href="#/" class="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame">
                <img src="/brand-mark.png" alt="" class="h-7 w-auto lg:hidden" />
                <span class="font-display text-[17px] font-semibold tracking-tight text-bone">${settings.appName}</span>
            </a>
            <div class="flex items-center gap-2">
                ${langMenu("top")}
                ${walletButton(data)}
            </div>
        </div>
    </header>

    <nav class="fixed inset-x-0 bottom-0 z-30 flex border-t border-seam bg-void/95 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="${t("Pages")}">${tabs}</nav>
    `;
};

export { header };
