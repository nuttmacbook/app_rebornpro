import { txUrl, isUserReject, escapeHtml as escape } from "../../../engine/ui/helpers";
import { t } from "../../lang";

/*
 * YOUR CODE (off-chain). Transaction messages. One strip, in its own #toast element (a page repaint never removes it):
 * on phones just above the tab bar, on wide screens at the top, under the header.
 *   pending  a turning ring, the step ("Step 1 of 2": approve, then confirm), where we wait (your wallet or the chain), seconds
 *   success  a full ring, the transaction hash (copy, explorer), closes by itself (paused on hover)
 *   error    the reason in plain words; "Cancelled" when the wallet prompt was closed
 * API used by the engine: pending({ stage, index, total }), progress({ title, desc }), success({ title, desc, hash }), error(err)
 */

/** where: "wallet" = waiting for the person to confirm, "chain" = sent, waiting for the block */
const STAGES = {
    checking:     { title: "Checking", desc: "Reading the latest numbers from the contract.", where: "app" },
    approve:      { title: "Approve the amount", desc: "Confirm the approval in your wallet. It lets the contract take exactly this amount, nothing more.", where: "wallet" },
    approving:    { title: "Approving", desc: "Approval sent. Waiting for the chain.", where: "chain" },
    register:     { title: "Confirm joining", desc: "Confirm the sign-up in your wallet.", where: "wallet" },
    registering:  { title: "Joining", desc: "Sign-up sent. Your ID is placed in the same transaction.", where: "chain" },
    upgrade:      { title: "Confirm upgrade", desc: "Confirm in your wallet. You pay the full price of the next package.", where: "wallet" },
    upgrading:    { title: "Upgrading", desc: "Sent. Your new ID is placed in the same transaction when the queue allows.", where: "chain" },
    process:      { title: "Confirm placements", desc: "Confirm in your wallet to place the waiting IDs.", where: "wallet" },
    processing:   { title: "Placing", desc: "Sent. Waiting for the chain.", where: "chain" },
    transfer:     { title: "Confirm the move", desc: "Confirm in your wallet. Your whole account moves to the new wallet.", where: "wallet" },
    transferring: { title: "Moving your account", desc: "Sent. Waiting for the chain.", where: "chain" },
    owner:        { title: "Confirm in your wallet", desc: "This is an owner action on the contract.", where: "wallet" },
    ownering:     { title: "Sending", desc: "Sent. Waiting for the chain.", where: "chain" },
};

const WHERE = { app: "Preparing", wallet: "Waiting for your wallet", chain: "Confirming on BNB Chain" };
const CLOSE_AFTER = 7000;

let closeTimer;
let tickTimer;
let flowStart = 0;
let remaining = CLOSE_AFTER;
let closeAt = 0;

const root = () => {
    let el = document.getElementById("toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "toast";
        el.className = "pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-3 lg:bottom-auto lg:top-16 lg:pl-[88px]";
        el.setAttribute("aria-live", "polite");
        document.body.appendChild(el);
    }
    return el;
};

/** Ring icon: turning (pending), full (success), or a cut ring with a mark (error) */
const icon = (tone) => {
    const seg = (i, color) => `<circle cx="20" cy="20" r="15" pathLength="360" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="108 252" transform="rotate(${-84 + i * 120} 20 20)" />`;
    if (tone === "pending") return `<svg viewBox="0 0 40 40" class="size-9 shrink-0" aria-hidden="true"><g class="toast-turn">${seg(0, "url(#fire-stroke)")}${seg(1, "#2a2a2f")}${seg(2, "#2a2a2f")}</g></svg>`;
    if (tone === "success") return `<svg viewBox="0 0 40 40" class="size-9 shrink-0" aria-hidden="true">${[ 0, 1, 2 ].map((i) => seg(i, "url(#fire-stroke)")).join("")}<path d="M13.5 20.5l4.5 4.5 8.5-9" fill="none" stroke="#ff7a7a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
    return `<svg viewBox="0 0 40 40" class="size-9 shrink-0" aria-hidden="true">${[ 0, 1, 2 ].map((i) => seg(i, "#4a1d22")).join("")}<path d="M20 13v9M20 27h.01" stroke="#ffb3b3" stroke-width="2.6" stroke-linecap="round" /></svg>`;
};

const shortHash = (hash) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

const hashRow = (hash) => {
    if (!hash) return "";
    const link = txUrl(hash);
    return /*html*/`
        <div class="mt-3 flex items-center gap-3 border-t border-seam pt-2.5 text-[12px]">
            <span class="figure min-w-0 flex-1 truncate text-cinder">${t("Transaction")} ${escape(shortHash(hash))}</span>
            <button type="button" onclick="copyToastHash('${escape(hash)}', this)" class="font-semibold text-cinder hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame">${t("Copy")}</button>
            ${link ? `<a href="${link}" target="_blank" rel="noopener" class="font-semibold text-ember hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame">${t("View on BscScan")}</a>` : ""}
        </div>
    `;
};

const stopTimers = () => {
    clearTimeout(closeTimer);
    clearInterval(tickTimer);
};

const close = () => {
    stopTimers();
    const card = root().firstElementChild;
    if (!card) return;
    card.classList.add("toast-out");
    setTimeout(() => { if (card.isConnected) card.remove(); }, 200);
};

const scheduleClose = (ms) => {
    clearTimeout(closeTimer);
    remaining = ms;
    closeAt = Date.now() + ms;
    closeTimer = setTimeout(close, ms);
};

const show = ({ tone, title, desc, step = null, where = "", hash = "", isSticky = false }) => {
    stopTimers();
    const isNew = !root().firstElementChild;
    const edge = { pending: "bg-gradient-to-b from-ember to-flame", success: "bg-gradient-to-b from-ember to-blood", error: "bg-loss" }[tone];
    root().innerHTML = /*html*/`
        <div class="${isNew ? "toast-in" : ""} plate plate-sm pointer-events-auto relative w-full max-w-[460px] bg-[#0c0c0e] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)]"
            role="${tone === "error" ? "alert" : "status"}" onmouseenter="holdToast(true)" onmouseleave="holdToast(false)">
            <span class="absolute inset-y-0 left-0 w-[3px] ${edge}" aria-hidden="true"></span>
            <div class="flex items-start gap-3 py-3.5 pl-5 pr-3">
                ${icon(tone)}
                <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                        <p class="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-bone">${escape(t(title))}</p>
                        ${step ? `<span class="shrink-0 text-[12px] text-ember">${t("Step {index} of {total}", { index: step.index, total: step.total })}</span>` : ""}
                    </div>
                    <p class="mt-0.5 break-words text-[13px] leading-relaxed text-cinder">${escape(t(desc))}</p>
                    ${tone === "pending" && where ? /*html*/`
                        <p class="mt-2 flex items-center gap-2 text-[12px] text-smolder">
                            <span>${escape(t(WHERE[where] ?? where))}</span>
                            <span class="figure ml-auto" data-toast-clock>${Math.max(0, Math.round((Date.now() - flowStart) / 1000))}s</span>
                        </p>` : ""}
                    ${hashRow(hash)}
                </div>
                <button type="button" onclick="closeToast()" class="grid size-7 shrink-0 place-items-center text-smolder hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame" aria-label="${t("Close")}">
                    <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
            </div>
            ${isSticky ? "" : `<div class="h-[2px] bg-seam"><div class="toast-countdown h-full ${tone === "error" ? "bg-loss" : "bg-flame"}" style="animation-duration:${CLOSE_AFTER}ms"></div></div>`}
        </div>
    `;

    if (tone === "pending") {
        tickTimer = setInterval(() => {
            const clock = root().querySelector("[data-toast-clock]");
            if (clock) clock.textContent = `${Math.round((Date.now() - flowStart) / 1000)}s`;
        }, 1000);
    }
    if (!isSticky) scheduleClose(CLOSE_AFTER);
};

const notify = {
    /** Step of a transaction: { stage, index, total } */
    pending: ({ stage, index = 0, total = 0 } = {}) => {
        if (stage === "checking" || !flowStart) flowStart = Date.now();
        const s = STAGES[stage] ?? STAGES.checking;
        show({ tone: "pending", ...s, step: index && total > 1 ? { index, total } : null, isSticky: true });
    },
    /** Free-form progress, used by the test panel */
    progress: ({ title, desc } = {}) => {
        if (!root().firstElementChild) flowStart = Date.now();
        show({ tone: "pending", title, desc, where: "app", isSticky: true });
    },
    success: ({ title = "Done", desc = "The transaction is confirmed.", hash } = {}) => {
        const seconds = flowStart ? Math.round((Date.now() - flowStart) / 1000) : 0;
        flowStart = 0;
        show({ tone: "success", title, desc: hash && seconds ? `${t(desc)} ${t("Confirmed in {seconds}s.", { seconds })}` : desc, hash: hash ?? "" });
    },
    error: (error) => {
        flowStart = 0;
        const isReject = isUserReject(error);
        show({
            tone: "error",
            title: isReject ? "Cancelled" : "That did not go through",
            desc: isReject ? "You closed the wallet prompt. Nothing was sent." : error?.message ?? "Try again.",
        });
    },
};

if (typeof window !== "undefined") {
    window.closeToast = close;

    /** Hovering pauses the countdown; leaving resumes with the time that was left */
    window.holdToast = (isHeld) => {
        const bar = root().querySelector(".toast-countdown");
        if (!bar) return;
        if (isHeld) {
            clearTimeout(closeTimer);
            remaining = Math.max(800, closeAt - Date.now());
            bar.style.animationPlayState = "paused";
        } else {
            bar.style.animationPlayState = "running";
            scheduleClose(remaining);
        }
    };

    window.copyToastHash = async (hash, button) => {
        try {
            await navigator.clipboard.writeText(hash);
            if (button) button.textContent = t("Copied");
        } catch {
            if (button) button.textContent = t("Select it");
        }
    };
}

export { notify };
