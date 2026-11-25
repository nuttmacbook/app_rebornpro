import { t, locale } from "../../lang";
import { money, moneyText, address, dateOf, WRAP, pageHead, button, pager, errorBox, loadingBox, escape } from "../componants/parts";
import { memberLabel, positionLabel, positionParam } from "../componants/ids";
import { packageName } from "../componants/ring";

/*
 * YOUR CODE (off-chain). History of one wallet, newest first, exactly as the contract recorded it when it happened:
 * new IDs (sign-up, upgrade, Reborn), referral pay, and every slot taken below the member's IDs with its cash and
 * the money kept for Reborn. `data` comes from getHistoryData() in src/project/chain.
 * Link parameters: #/history?addr=0x…&page=2 (no addr = the connected wallet). Times are UTC.
 */

const SIGN_UP = 0, UPGRADE = 1, REBORN = 2, FREE = 3;

const timeOf = (seconds) => (seconds > 0 ? `${new Date(seconds * 1000).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })}` : "");

const idLink = (pkg, index) => /*html*/`<a href="#/board?pkg=${pkg}&pos=${positionParam(pkg, index)}" class="figure font-semibold text-bone underline decoration-ember/50 underline-offset-2 hover:text-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember">${positionLabel(pkg, index)}</a>`;

const whoName = (data, member) => (member === data.memberId ? (data.isOther ? t("this member") : t("you")) : t("member {member}", { member: memberLabel(member) }));

/** How someone's ID came in, for "member X signed up / upgraded / was reborn" */
const how = (idKind) => (idKind === UPGRADE ? t("upgraded") : idKind === REBORN ? t("was reborn") : t("signed up"));

const ICON = {
    join: `<path d="M12 5v14M5 12h14"/>`,
    up: `<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>`,
    reborn: `<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>`,
    referral: `<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M18 8v6M15 11h6"/>`,
    slot: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>`,
};
const icon = (name, look) => /*html*/`
    <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${look}" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>
    </span>
`;

const plus = (data, value, look = "text-ember") => `<b class="figure font-semibold ${look}">+${moneyText(data, value)}</b>`;

/** One row: title and time, what happened, and the money */
const shell = (data, r, { iconHtml, title, lines = [], amounts = [] }) => {
    const link = data.blockUrl(r.block);
    return /*html*/`
        <li class="flex gap-3 px-4 py-4 sm:px-5">
            ${iconHtml}
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p class="text-[15px] font-medium text-bone">${title}</p>
                    <span class="figure text-[12px] text-smolder">${timeOf(r.time)} UTC</span>
                </div>
                ${lines.map((l) => `<p class="mt-0.5 text-[13px] leading-relaxed text-cinder">${l}</p>`).join("")}
                ${amounts.length ? `<div class="mt-1.5 flex flex-wrap gap-x-5 gap-y-0.5 text-[13px] text-cinder">${amounts.join("")}</div>` : ""}
                <p class="mt-1 flex flex-wrap gap-x-3 text-[11px] text-smolder">
                    <span>${escape(packageName(data, r.pkg))}</span>
                    ${link ? `<a href="${link}" target="_blank" rel="noopener" class="underline decoration-seam underline-offset-2 hover:text-cinder">${t("Block {block}", { block: r.block.toLocaleString("en-US") })}</a>` : `<span>${t("Block {block}", { block: r.block.toLocaleString("en-US") })}</span>`}
                </p>
            </div>
        </li>
    `;
};

const newIdRow = (data, r) => {
    const where = t("ID {id}, slot {slot} below ID {above}", { id: idLink(r.pkg, r.index), slot: r.slot + 1, above: idLink(r.pkg, r.ref) });
    if (r.idKind === REBORN) {
        return shell(data, r, {
            iconHtml: icon("reborn", "bg-flame/15 text-flame"),
            title: t("Reborn in {name}", { name: escape(packageName(data, r.pkg)) }),
            lines: [ where, t("Board {id} filled all 3 slots.", { id: idLink(r.pkg, Number(r.extra)) }) ],
            amounts: [ r.amount > 0n
                ? `<span>${t("Paid from the money kept")} <b class="figure font-semibold text-bone">${moneyText(data, r.amount)}</b></span>`
                : `<span>${t("No cost to you")}</span>` ],
        });
    }
    const isUpgrade = r.idKind === UPGRADE;
    return shell(data, r, {
        iconHtml: icon(isUpgrade ? "up" : "join", "border border-seam text-bone"),
        title: isUpgrade ? t("Bought {name}", { name: escape(packageName(data, r.pkg)) }) : t("Joined {name}", { name: escape(packageName(data, r.pkg)) }),
        lines: [ where ],
        amounts: r.idKind === FREE ? [] : [ `<span>${t("Paid from the wallet")} <b class="figure font-semibold text-bone">${moneyText(data, r.amount)}</b></span>` ],
    });
};

const referralRow = (data, r) => shell(data, r, {
    iconHtml: icon("referral", "bg-ember/10 text-ember"),
    title: t("Referral pay"),
    lines: [ t("{who} {how} with ID {id}.", { who: escape(whoName(data, r.other)), how: how(r.idKind), id: idLink(r.pkg, r.index) }).replace(/^./, (c) => c.toUpperCase()) ],
    amounts: [ `<span>${t("To the wallet")} ${plus(data, r.amount)}</span>` ],
});

const slotRow = (data, r) => {
    const isFull = r.slot === 2;
    const amounts = [];
    if (r.amount > 0n) amounts.push(`<span>${t("To the wallet")} ${plus(data, r.amount)}</span>`);
    if (r.extra > 0n) amounts.push(`<span>${t("Kept for Reborn")} ${plus(data, r.extra, "text-bone")}</span>`);
    if (!amounts.length) amounts.push(`<span>${t("This entry paid nothing")}</span>`);
    return shell(data, r, {
        iconHtml: icon("slot", isFull ? "bg-flame/15 text-flame" : "bg-white/[0.05] text-cinder"),
        title: t("Slot {slot} of ID {id} filled", { slot: r.slot + 1, id: idLink(r.pkg, r.index) }),
        lines: [
            t("By {who}, ID {ref}.", { who: escape(whoName(data, r.other)), ref: idLink(r.pkg, r.ref) }),
            ...(isFull ? [ t("All 3 slots are full: this board is reborn.") ] : []),
        ],
        amounts,
    });
};

const rowHtml = (data, r) => (r.kind === "referral" ? referralRow(data, r) : r.kind === "slot" ? slotRow(data, r) : newIdRow(data, r));

/** Rows grouped by UTC day */
const timeline = (data) => {
    if (!data.rows.length) return `<p class="border-y border-seam py-6 text-[14px] text-cinder">${t("Nothing has happened here yet.")}</p>`;
    const days = [];
    for (const r of data.rows) {
        const day = dateOf(r.time);
        if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
        days.at(-1).rows.push(r);
    }
    return days.map((d) => /*html*/`
        <section>
            <h3 class="mb-2 text-[13px] font-medium text-smolder">${d.day}</h3>
            <ul class="plate divide-y divide-seam overflow-hidden p-0">${d.rows.map((r) => rowHtml(data, r)).join("")}</ul>
        </section>
    `).join("");
};

const lookup = (data) => /*html*/`
    <form class="flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end" onsubmit="event.preventDefault(); historyLookup(this.addr.value)">
        <div class="min-w-0 flex-1">
            <label for="history-addr" class="mb-1.5 block text-[13px] text-cinder">${t("Wallet address")}</label>
            <input id="history-addr" name="addr" type="text" autocomplete="off" spellcheck="false" placeholder="0x…"
                value="${escape(data.typed)}" class="field figure w-full" />
        </div>
        <div class="flex gap-2">
            ${button(t("View"), "", { kind: "line", full: false, type: "submit" })}
            ${data.typed && data.isConnected ? button(t("My wallet"), "historyLookup('')", { kind: "line", full: false }) : ""}
        </div>
    </form>
    ${data.badAddress ? `<p class="-mt-4 text-[13px] text-ember" role="alert">${t("This is not a wallet address: {value}", { value: escape(data.typed) })}</p>` : ""}
`;

const empty = (data) => /*html*/`
    <div class="plate max-w-xl p-6">
        <p class="text-[15px] text-cinder">${!data.isConnected && !data.typed ? t("Connect your wallet to see your history.") : t("This wallet has not joined yet.")}</p>
        <p class="mt-1 text-[13px] text-smolder">${t("Or type any member's wallet address above.")}</p>
        ${!data.isConnected && !data.typed ? `<div class="mt-4">${button(t("Connect wallet"), "openWallet()", { full: false })}</div>` : ""}
    </div>
`;

const history = (data) => /*html*/`
    <main class="${WRAP} flex flex-col gap-8 py-10 sm:py-14">
        ${pageHead(t("History"), t("Every new ID, referral pay and slot below your IDs, recorded by the contract when it happened. Times are UTC."))}
        ${lookup(data)}
        ${!data.memberId || data.badAddress ? empty(data) : /*html*/`
            <p class="-mt-4 text-[13px] text-cinder">${t("Member {member}", { member: memberLabel(data.memberId) })} · <span class="figure">${escape(address(data.account))}</span></p>
            <dl class="grid grid-cols-2 border-y border-seam lg:grid-cols-4">
                ${[
                    [ t("Referral pay"), money(data, data.referralEarned) ],
                    [ t("Board pay"), money(data, data.boardEarned) ],
                    [ t("Boards reborn"), String(data.cycles) ],
                    [ t("Records"), data.total.toLocaleString("en-US") ],
                ].map(([ k, v ], i) => `<div class="min-w-0 px-3 py-4 sm:px-6 ${i % 2 ? "border-l border-seam" : ""} ${i > 1 ? "border-t border-seam lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}"><dd class="truncate font-display text-[1.3rem] font-semibold text-bone sm:text-[1.6rem]">${v}</dd><dt class="text-[13px] text-cinder">${k}</dt></div>`).join("")}
            </dl>
            <div class="flex flex-col gap-5">${timeline(data)}</div>
            ${pager({ page: data.page, pageSize: data.pageSize, total: data.total, go: "historyPage" })}
        `}
    </main>
`;

const historyLoading = () => loadingBox;
const historyError = (error) => errorBox(error?.message ?? "Unknown error");

export { history, historyLoading, historyError };
