/*
 * YOUR CODE (off-chain). The website in one place:
 *   1. which pages exist
 *   2. what each button does
 * Blockchain work comes from src/project/chain (imported, never written here).
 * Drawing, wallet changes and loading are handled by src/engine/ui/app.js. Settings live in settings/.env.
 */

import "./main.css";
import { t, setLang } from "../lang";
import { startApp, openWallet } from "../../engine/ui/app";
import { getHomeData, getPlanData, getBoardData, getTeamData, getHistoryData, getOwnerData, register, upgrade, processQueue, transferWallet, placeFree, registerFor, launchPublic, addPackage, setPackageOpen } from "../chain";
import { header } from "./componants/nav";
import { mountBackdrop } from "./componants/backdrop";
import { isMaintenance, showMaintenance } from "./componants/maintenance";
import { isDev, isMasked, toggleIdView, positionParam, parseMember, parsePosition } from "./componants/ids";
import { footer } from "./componants/footer";
import { notify } from "./componants/toast";
import { packageName } from "./componants/ring";
import { home, homeLoading, homeError } from "./pages/home";
import { plan, planLoading, planError } from "./pages/plan";
import { board, boardLoading, boardError } from "./pages/board";
import { team, teamLoading, teamError } from "./pages/team";
import { history, historyLoading, historyError } from "./pages/history";
import { ownerPage, ownerLoading, ownerError } from "./pages/owner";

/* ------------------------------------ link parameters (#/board?pkg=2&pos=<code>, ?ref=<code>; plain numbers in dev only) */

const REF_KEY = "reborn.ref";

/** Parameters after "?" in the hash */
const hashParams = () => Object.fromEntries(new URLSearchParams(window.location.hash.split("?")[1] ?? ""));

const DEFAULT_SPONSOR = "1";
const isMemberId = (value) => /^[1-9]\d*$/.test(String(value ?? "").trim());

/** Member number from a link or an input (a code, or a plain number in dev mode); null when not valid */
const memberFrom = (text) => {
    const id = parseMember(text);
    return id && id > 0 ? id : null;
};

/**
 * A referral link (?ref=<code>, or #/?ref=<code>) is remembered in this browser until another one is opened,
 * so closing the app or refreshing keeps the same sponsor. After it is saved, ?ref= is taken out of the address bar,
 * so a refresh never overwrites a sponsor the visitor typed in by hand.
 */
const captureRef = () => {
    const url = new URL(window.location.href);
    const fromLink = memberFrom(url.searchParams.get("ref") ?? hashParams().ref);
    if (!fromLink) return;
    try { localStorage.setItem(REF_KEY, String(fromLink)); } catch {}
    if (url.searchParams.has("ref")) {
        url.searchParams.delete("ref");
        history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
};

/** Sponsor id: the remembered referral link, else member #1 */
const sponsorRef = () => {
    try {
        const saved = localStorage.getItem(REF_KEY);
        if (isMemberId(saved)) return saved;
    } catch {}
    return DEFAULT_SPONSOR;
};

captureRef();
window.addEventListener("hashchange", captureRef);

/** Board link parameters with pos turned back into a number (an unknown code opens the viewer's newest ID) */
const boardParams = () => {
    const params = hashParams();
    const index = params.pos ? parsePosition(params.pkg ?? 1, params.pos) : null;
    return { ...params, pos: index === null ? "" : String(index) };
};

/* ------------------------------------ 1. pages (the first one opens by default; others at #/name) */

// Last dashboard data, for names in toasts
let homeData = null;

const pages = {
    home: { load: async (wallet) => { homeData = await getHomeData(wallet, { ref: sponsorRef() }); return homeData; }, view: home, loading: homeLoading, error: homeError },
    plan: { load: getPlanData, view: plan, loading: planLoading, error: planError },
    board: { load: (wallet) => getBoardData(wallet, boardParams()), view: board, loading: boardLoading, error: boardError },
    team: { load: (wallet) => getTeamData(wallet, hashParams()), view: team, loading: teamLoading, error: teamError },
    history: { load: (wallet) => getHistoryData(wallet, hashParams()), view: history, loading: historyLoading, error: historyError },
    owner: { load: getOwnerData, view: ownerPage, loading: ownerLoading, error: ownerError },
};

mountBackdrop();
// Maintenance (VITE_MAINTENANCE=on): one static screen, no wallet, no chain reads; the buttons below are never drawn
const isClosed = isMaintenance();
if (isClosed) showMaintenance();
const app = isClosed ? null : startApp({ pages, header, footer, notify });

/* ------------------------------------ dev mode: switch between real numbers and codes (VITE_APP_MODE=dev) */

if (isDev() && app) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "fixed bottom-[8.5rem] left-4 z-40 border border-ember/50 bg-void/90 px-3 py-1.5 text-[12px] font-semibold text-ember backdrop-blur hover:border-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember lg:bottom-[4.5rem] lg:left-[104px]";
    const label = () => { toggle.textContent = isMasked() ? t("IDs: codes (production view)") : t("IDs: real numbers (dev)"); };
    toggle.onclick = () => { toggleIdView(); label(); app.refresh({ quiet: true }); };
    label();
    document.body.appendChild(toggle);
}

/* ------------------------------------ 2. buttons (called from onclick="..." in the pages) */

window.openWallet = openWallet;

/** Language menu (componants/nav.js): switch, then redraw the page in place */
window.setLanguage = (code) => {
    setLang(code);
    if (app) app.refresh({ quiet: true });
    else if (isClosed) showMaintenance();
};

// A language menu closes when you click anywhere else
document.addEventListener("click", (e) => {
    document.querySelectorAll("[data-lang-menu][open]").forEach((menu) => { if (!menu.contains(e.target)) menu.removeAttribute("open"); });
});
window.refreshPage = () => app.refresh({ fresh: true });

const badSponsor = () => notify.error(new Error(isMasked() ? "That sponsor code is not valid. Check it with the person who invited you." : "Enter the member ID of the person who invited you."));

window.doRegister = () => {
    const typed = document.querySelector("[data-sponsor-input]")?.value?.trim();
    const id = typed ? memberFrom(typed) : Number(sponsorRef());
    if (!id) return badSponsor();
    try { localStorage.setItem(REF_KEY, String(id)); } catch {}
    app.runTx((wallet, options) => register(wallet, { ...options, sponsorId: String(id) }), { title: "Welcome aboard", desc: "You are a member now. Your first ID is on the board." });
};

/** Scrolls to the sign-up form and puts the cursor in the sponsor field */
window.focusJoin = () => {
    const join = document.getElementById("join");
    if (!join) {
        window.location.hash = "#/";
        return;
    }
    join.scrollIntoView({ behavior: "smooth", block: "center" });
    document.querySelector("[data-sponsor-input]")?.focus({ preventScroll: true });
};

window.doUpgrade = (pkg) => {
    const name = homeData ? packageName(homeData, pkg) : t("the next package");
    app.runTx((wallet, options) => upgrade(wallet, { ...options, pkg }), { title: t("Upgraded to {name}", { name }), desc: "Your new ID is on its board. Open the board to see it." });
};

window.doProcessQueue = () => app.runTx(processQueue, { title: "Placed", desc: "The waiting IDs are on their boards." });

window.copyRefLink = async () => {
    const link = document.querySelector("[data-ref-link]")?.textContent?.trim() ?? "";
    try {
        await navigator.clipboard.writeText(link);
        notify.success({ title: "Link copied", desc: "Send it to the people you invite." });
    } catch (err) {
        console.error(err);
        notify.error(new Error("Could not copy. Select the link and copy it by hand."));
    }
};

/** Opens a package's board with `pos` at the top: a number from a page, or what was typed in "Go to ID" (empty = the viewer's newest) */
window.openBoard = (pkg, pos = "", page = "") => {
    const query = new URLSearchParams({ pkg: String(pkg) });
    const typed = String(pos).trim();
    if (typed !== "") {
        const index = typeof pos === "number" ? pos : parsePosition(pkg, typed);
        if (index === null) return notify.error(new Error(isMasked() ? "That ID code is not valid in this package." : "Enter an ID number."));
        query.set("pos", positionParam(pkg, index));
    }
    if (String(page) !== "") query.set("page", String(page));
    window.location.hash = `#/board?${query}`;
};

window.myIdsPage = (page) => window.openBoard(hashParams().pkg ?? 1, "", Math.max(0, page));
window.teamPage = (page) => { window.location.hash = `#/team?page=${Math.max(0, page)}`; };

/** History page: another wallet (empty = the connected one), and its pages */
const historyHash = (addr, page = 0) => {
    const query = new URLSearchParams();
    if (String(addr ?? "").trim()) query.set("addr", String(addr).trim());
    if (page > 0) query.set("page", String(page));
    return `#/history${query.size ? `?${query}` : ""}`;
};
window.historyLookup = (addr) => { window.location.hash = historyHash(addr); };
window.historyPage = (page) => { window.location.hash = historyHash(hashParams().addr, Math.max(0, page)); };

window.doTransferWallet = () => {
    const newWallet = document.querySelector("[data-new-wallet]")?.value ?? "";
    const confirm = document.querySelector("[data-new-wallet-again]")?.value ?? "";
    app.runTx((wallet, options) => transferWallet(wallet, { ...options, newWallet, confirm }), { title: "Account moved", desc: "Your account now belongs to the new wallet. Connect that wallet to keep using it." });
};

/* ------------------------------------ owner */

window.doPlaceFree = () => {
    const text = document.querySelector("[data-free-wallets]")?.value ?? "";
    const pkg = Number(document.querySelector("[data-free-package]")?.value ?? 1);
    app.runTx((wallet, options) => placeFree(wallet, { ...options, text, pkg }), { title: "Free IDs placed", desc: "The investors' IDs are on the board below the root." });
};

window.doRegisterFor = () => {
    const text = document.querySelector("[data-paid-wallets]")?.value ?? "";
    const typed = String(document.querySelector("[data-paid-sponsor]")?.value ?? "").trim();
    const sponsorId = typed ? parseMember(typed) : 1;
    if (!sponsorId) return notify.error(new Error("That sponsor does not exist."));
    app.runTx((wallet, options) => registerFor(wallet, { ...options, text, sponsorId }), { title: "Signed up", desc: "The new members are on the board below their sponsor." });
};

window.doLaunch = () => {
    if (!document.querySelector("[data-launch-sure]")?.checked) return notify.error(new Error("Tick the box first: launching closes free placement for good."));
    app.runTx(launchPublic, { title: "Launched", desc: "Sign-ups are open to everyone." });
};

window.doAddPackage = () => {
    const priceText = document.querySelector("[data-new-price]")?.value ?? "";
    app.runTx((wallet, options) => addPackage(wallet, { ...options, priceText }), { title: "Package added", desc: "It is on the website now, at the end of the upgrade path." });
};

window.doSetPackageOpen = (pkg, isOpen) => app.runTx((wallet, options) => setPackageOpen(wallet, { ...options, pkg, isOpen }), { title: isOpen ? "Sales resumed" : "Sales paused", desc: "The package is updated." });

