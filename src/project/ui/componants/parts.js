import { formNumber, shortAddress, escapeHtml as escape } from "../../../engine/ui/helpers";
import { t, locale } from "../../lang";

/*
 * YOUR CODE (off-chain). Small pieces every page shares: amounts, buttons, headings, paging.
 * Each one returns HTML. Nothing here talks to a contract.
 */

/** "10.00 USDT"; symbol and decimals come from the contract */
const money = (data, value, digits = 2) => `<span class="figure">${formNumber(value ?? 0n, data?.tokenDecimals ?? 0, digits)}</span><span class="ml-1 text-[0.6em] font-medium text-cinder">${escape(data?.tokenSymbol ?? "")}</span>`;
const formatAmount = (data, value, digits = 2) => formNumber(value ?? 0n, data?.tokenDecimals ?? 0, digits);
const moneyText = (data, value, digits = 2) => `${formNumber(value ?? 0n, data?.tokenDecimals ?? 0, digits)} ${data?.tokenSymbol ?? ""}`;
/** Dates are always UTC (the chain's clock), never the visitor's time zone */
const dateOf = (seconds) => (seconds > 0 ? `${new Date(seconds * 1000).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} UTC` : "–");
const address = (value) => (value ? shortAddress(value) : "–");
const percent = (bps) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** Width shared by every page */
const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-8";

/** Page title: big, left, in the display face; the lead says what the page is for */
const pageHead = (title, lead = "") => /*html*/`
    <div class="max-w-3xl">
        <h1 class="font-display text-[2rem] font-semibold leading-[1.1] tracking-[-0.02em] text-bone sm:text-[2.6rem]">${title}</h1>
        ${lead ? /*html*/`<p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-cinder">${lead}</p>` : ""}
    </div>
`;

/** Heading inside a section, with an optional note on the right */
const blockHead = (title, aside = "") => /*html*/`
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 class="font-display text-xl font-semibold text-bone">${title}</h2>
        ${aside ? /*html*/`<div class="text-[13px] text-cinder">${aside}</div>` : ""}
    </div>
`;

/** A button that calls a window function; kind: fire (main action) or line */
const button = (label, onclick, { isDisabled = false, kind = "fire", full = true, size = "md", type = "button" } = {}) => {
    const pad = size === "sm" ? "px-4 py-2 text-[13px]" : "px-6 py-3 text-[15px]";
    return /*html*/`
        <button type="${type}" ${onclick ? `onclick="${onclick}"` : ""} ${isDisabled ? "disabled" : ""}
            class="btn ${kind === "fire" ? "btn-fire" : "btn-line"} ${full ? "w-full" : ""} inline-flex items-center justify-center font-display font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember disabled:cursor-not-allowed ${pad}">
            ${label}
        </button>
    `;
};

/** A label / value row */
const row = (label, value, valueClass = "text-bone") => /*html*/`
    <div class="flex items-baseline justify-between gap-4 py-3">
        <dt class="text-[14px] text-cinder">${label}</dt>
        <dd class="text-right text-[15px] font-medium ${valueClass}">${value}</dd>
    </div>
`;

/** Previous / next page; `go` is a window function name taking the page number */
const pager = ({ page, pageSize, total, go }) => {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages <= 1) return "";
    return /*html*/`
        <nav class="flex items-center justify-between gap-3 pt-4 text-[13px] text-cinder" aria-label="${t("Pages")}">
            <span>${t("Page {page} of {pages}", { page: page + 1, pages })}</span>
            <div class="flex gap-2">
                ${button(t("Previous"), `${go}(${page - 1})`, { kind: "line", full: false, size: "sm", isDisabled: page <= 0 })}
                ${button(t("Next"), `${go}(${page + 1})`, { kind: "line", full: false, size: "sm", isDisabled: page + 1 >= pages })}
            </div>
        </nav>
    `;
};

const errorBox = (message) => /*html*/`
    <main class="${WRAP} py-16">
        <div class="plate max-w-xl p-6" role="alert">
            <p class="font-display text-lg font-semibold text-bone">${t("This page could not load its data.")}</p>
            <p class="mt-1 text-sm text-cinder">${escape(t(message))}</p>
            <div class="mt-4">${button(t("Try again"), "refreshPage()", { kind: "line", full: false, size: "sm" })}</div>
        </div>
    </main>
`;

const loadingBox = /*html*/`
    <main class="${WRAP} flex flex-col gap-5 py-14" aria-busy="true">
        <div class="skeleton h-12 w-[26rem] max-w-full"></div>
        <div class="skeleton h-5 w-[20rem] max-w-full"></div>
        <div class="skeleton mt-6 h-72"></div>
    </main>
`;

export { money, moneyText, formatAmount, dateOf, address, percent, WRAP, pageHead, blockHead, button, row, pager, errorBox, loadingBox, escape };
