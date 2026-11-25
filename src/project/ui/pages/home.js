import { settings } from "../../../engine/settings";
import { t } from "../../lang";
import { money, moneyText, formatAmount, dateOf, percent, WRAP, blockHead, button, row, errorBox, loadingBox, escape } from "../componants/parts";
import { memberLabel, memberParam, positionLabel } from "../componants/ids";
import { ring, heroRing, packageName, fundBar } from "../componants/ring";

/*
 * YOUR CODE (off-chain). Home: visitors see the animated reborn ring and the join form; members see what they
 * earned, their invite link, and the package ladder (one rung per package, as many as the contract has).
 */

/** Referral share in basis points, from package 1 (the contract sends referralPay and price) */
const referralBps = (data) => {
    const first = data.packages[0];
    return first && first.price > 0n ? Number((first.referralPay * 10_000n) / first.price) : 0;
};

/* ------------------------------------ visitors */

const hero = (data) => {
    const first = data.packages[0];
    return /*html*/`
    <section class="${WRAP} grid items-center gap-8 pb-6 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
            <h1 class="font-display text-[2.3rem] font-semibold leading-[1.08] tracking-[-0.02em] text-bone sm:text-[3.3rem]">${t("Fill three slots.")}<br />${t("Rise again.")}</h1>
            <p class="mt-5 max-w-xl text-[16px] leading-relaxed text-cinder">
                ${t("Every ID you hold has three slots below it. Each slot pays you the moment it fills. When all three are full, the ID is reborn as a new one and starts filling again.")}
            </p>
            <div class="mt-7 flex flex-wrap gap-3">
                ${data.isMember ? button(t("Open my board"), "openBoard(1)", { full: false }) : button(first ? t("Join for {price}", { price: moneyText(data, first.price, 0) }) : t("Join"), "focusJoin()", { full: false })}
                ${button(t("How it pays"), "location.hash='#/plan'", { kind: "line", full: false })}
            </div>
        </div>
        <div class="hero-glow flex justify-center lg:justify-end">${heroRing()}</div>
    </section>
    `;
};

/** One line of live figures with hairlines between them */
const liveLine = (data) => {
    const items = [
        [ t("members"), data.memberCount.toLocaleString("en-US") ],
        [ t("paid to members"), moneyText(data, data.totalReferral + data.totalBoardPaid, 0) ],
        [ t("boards reborn"), data.packages.reduce((a, p) => a + p.completed, 0).toLocaleString("en-US") ],
    ];
    return /*html*/`
        <div class="${WRAP}">
            <dl class="live-line grid grid-cols-3 rounded-2xl border border-white/[0.07]">
                ${items.map(([ label, value ], i) => /*html*/`
                    <div class="min-w-0 px-2.5 py-4 sm:px-6 ${i ? "border-l border-seam" : ""}">
                        <dd class="figure whitespace-nowrap font-display text-[1rem] font-semibold text-bone sm:text-[1.8rem]">${escape(value)}</dd>
                        <dt class="mt-0.5 text-[12px] text-cinder sm:text-[13px]">${label}</dt>
                    </div>
                `).join("")}
            </dl>
        </div>
    `;
};

const notLaunched = /*html*/`
    <div class="plate plate-hot p-5 sm:p-6" role="status">
        <p class="font-display text-lg font-semibold text-bone">${t("Opening soon")}</p>
        <p class="mt-1 text-[14px] text-cinder">${t("Sign-ups open the moment the plan launches. Keep your invite link: it works from then on.")}</p>
    </div>
`;

const joinPanel = (data) => {
    const first = data.packages[0];
    const sponsor = data.refValid ? memberLabel(data.refId) : memberLabel(1);
    const canJoin = data.launched && first?.isOpen;
    return /*html*/`
    <div id="join" class="plate plate-hot grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_1fr]">
        <div>
            <h2 class="font-display text-2xl font-semibold text-bone">${t("Join {name}", { name: escape(settings.appName) })}</h2>
            <p class="mt-2 text-[14px] leading-relaxed text-cinder">${t("You start in {name}. Whoever invited you gets {percent} of every entry you make, now and at every Reborn.", { name: packageName(data, 1), percent: percent(referralBps(data)) })}</p>
            <dl class="mt-4 divide-y divide-seam border-t border-seam">
                ${row(t("Price"), first ? money(data, first.price) : "–")}
                ${data.isConnected ? row(t("In your wallet"), money(data, data.walletBalance), data.walletBalance < (first?.price ?? 0n) ? "text-loss" : "text-bone") : ""}
            </dl>
        </div>
        <div class="flex flex-col justify-end gap-3">
            <label class="text-[14px] text-cinder" for="sponsor">${t("Invited by")}</label>
            <input id="sponsor" data-sponsor-input type="text" value="${escape(sponsor)}" maxlength="12" autocomplete="off" spellcheck="false" class="field font-display text-lg uppercase" />
            ${!data.isConnected ? button(t("Connect wallet"), "openWallet()") : button(t("Approve and join"), "doRegister()", { isDisabled: !canJoin })}
            ${!data.launched ? `<p class="text-[13px] text-smolder">${t("Joining opens at launch.")}</p>` : ""}
        </div>
    </div>
    `;
};

/* ------------------------------------ members */

const earnings = (data) => /*html*/`
    <section class="${WRAP} pt-10">
        <p class="text-[14px] text-cinder">${t("Your ID")} <span class="font-display font-semibold text-bone">${memberLabel(data.myId)}</span>, ${t("joined {date}", { date: dateOf(data.myJoinedAt) })}</p>
        <div class="mt-4 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
            ${[
                [ t("Board pay"), money(data, data.myBoardEarned), t("{count} boards reborn", { count: data.myCycles }) ],
                [ t("Referral pay"), money(data, data.myReferralEarned), t("{count} people invited", { count: data.myDirects }) ],
                [ t("Total earned"), money(data, data.myBoardEarned + data.myReferralEarned), t("Paid straight to your wallet") ],
                [ t("IDs"), `<span class="figure">${data.myPositions}</span>`, t("Across all packages") ],
            ].map(([ label, value, note ], i) => /*html*/`
                <div class="min-w-0 ${i ? "sm:border-l sm:border-seam sm:pl-6" : ""}">
                    <p class="text-[13px] text-cinder">${label}</p>
                    <p class="figure mt-1 truncate font-display text-[1.7rem] font-semibold leading-none text-bone sm:text-[2.1rem]">${value}</p>
                    <p class="mt-2 truncate text-[12px] text-smolder">${note}</p>
                </div>
            `).join("")}
        </div>
    </section>
`;

const inviteLink = (data) => {
    const link = `${window.location.origin}${window.location.pathname}?ref=${memberParam(data.myId)}`;
    return /*html*/`
    <div class="plate p-5 sm:p-6">
        ${blockHead(t("Your invite link"), t("You were invited by {id}", { id: memberLabel(data.mySponsor) || "–" }))}
        <p class="mt-2 text-[14px] text-cinder">${t("People who join with it go on your board, left slot first. You get {percent} of every entry they make: joining, upgrades and every Reborn.", { percent: percent(referralBps(data)) })}</p>
        <div class="mt-4 flex flex-col gap-2 sm:flex-row">
            <code data-ref-link class="field min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[14px]">${escape(link)}</code>
            ${button(t("Copy link"), "copyRefLink()", { full: false, kind: "line" })}
        </div>
    </div>
    `;
};

/** One rung per package: the viewer's newest ID as a ring, or what it takes to get there */
const rung = (data, p, i) => {
    const mine = data.mine[i] ?? {};
    const pkg = i + 1;
    const hasBefore = pkg === 1 || data.mine[i - 1]?.has;
    let detail;
    let action = "";
    let ringHtml;
    // Packages you cannot buy yet step back a little
    const isQuiet = mine.count === 0 && !mine.has && pkg > 1 && !(data.isMember && data.launched && p.isOpen && hasBefore);

    if (mine.count > 0) {
        ringHtml = ring({ filled: mine.latestFilled, label: positionLabel(pkg, mine.latestIndex, { short: true }), size: "size-20 sm:size-24", isMine: true });
        detail = /*html*/`
            <p class="text-[13px] text-cinder">${t("Newest ID {id} has {filled} of 3 slots filled", { id: positionLabel(pkg, mine.latestIndex), filled: mine.latestFilled })}</p>
            <div class="mt-3 max-w-xs">${fundBar(mine.latestFund, p.price)}</div>
            <p class="mt-1.5 text-[12px] text-smolder">${t("Kept for its Reborn: {have} of {need}", { have: formatAmount(data, mine.latestFund, 0), need: moneyText(data, p.price, 0) })}. ${t("{count} IDs in this package.", { count: mine.count })}</p>`;
        action = button(t("Open board"), `openBoard(${pkg})`, { full: false, kind: "line", size: "sm" });
    } else {
        ringHtml = ring({ filled: 0, label: "", size: "size-20 sm:size-24" });
        if (mine.has) {
            detail = `<p class="text-[14px] text-cinder">${t("Bought. Your ID is waiting in the queue to be placed.")}</p>`;
        } else if (pkg === 1) {
            detail = `<p class="text-[14px] text-cinder">${data.launched ? t("Join to get your first ID here.") : t("Opens at launch.")}</p>`;
            action = button(t("Join"), "focusJoin()", { full: false, size: "sm", isDisabled: !data.launched });
        } else {
            const canBuy = data.isMember && data.launched && p.isOpen && hasBefore;
            const why = !data.launched ? t("Opens at launch.") : !data.isMember ? t("Join first, then upgrade one package at a time.") : !p.isOpen ? t("Sales are paused.") : !hasBefore ? t("Get {name} first.", { name: packageName(data, pkg - 1) }) : t("Pay {price} from your wallet to get an ID here.", { price: moneyText(data, p.price) });
            detail = `<p class="text-[14px] text-cinder">${why}</p>`;
            action = data.isMember ? button(t("Upgrade"), `doUpgrade(${pkg})`, { full: false, size: "sm", isDisabled: !canBuy }) : "";
        }
    }

    return /*html*/`
        <li class="plate ${mine.count > 0 ? "plate-hot" : isQuiet ? "plate-quiet" : ""} grid grid-cols-[auto_1fr] items-center gap-4 p-4 sm:grid-cols-[auto_1fr_auto] sm:gap-6 sm:p-5">
            ${ringHtml}
            <div class="min-w-0">
                <div class="flex flex-wrap items-baseline gap-x-3">
                    <h3 class="font-display text-xl font-semibold text-bone">${packageName(data, pkg)}</h3>
                    <p class="text-[13px] text-cinder">${t("a full board pays")} <span class="fire-text font-display text-[15px] font-semibold">${moneyText(data, p.cyclePay, 0)}</span></p>
                </div>
                <div class="mt-2">${detail}</div>
            </div>
            ${action ? `<div class="col-span-2 sm:col-span-1">${action}</div>` : ""}
        </li>
    `;
};

const ladder = (data) => /*html*/`
    <section>
        ${blockHead(t("Packages"), t("Upgrade in order, one ID each. Reborn adds more IDs by itself."))}
        <ol class="ladder mt-4 flex flex-col gap-3">${data.packages.map((p, i) => rung(data, p, i)).join("")}</ol>
    </section>
`;

const queueNote = (data) => (data.queued > 0 ? /*html*/`
    <div class="plate flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-[14px] text-cinder">${t("{count} IDs are waiting to be placed. Each sign-up places some of them, or place them now for the network fee.", { count: data.queued })}</p>
        ${button(t("Place them now"), "doProcessQueue()", { full: false, kind: "line", size: "sm" })}
    </div>
` : "");

const moveAccount = /*html*/`
    <details class="plate p-5 sm:p-6">
        <summary class="cursor-pointer font-display text-base font-semibold text-bone">${t("Move your account to another wallet")}</summary>
        <p class="mt-3 text-[14px] text-cinder">${t("Your member ID, IDs, team and future pay move to the new wallet. This cannot be undone, and the new wallet must never have joined.")}</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <input data-new-wallet type="text" wrap="off" placeholder="0x…" autocomplete="off" spellcheck="false" class="field text-[14px]" />
            <input data-new-wallet-again type="text" wrap="off" placeholder="${t("The same address again")}" autocomplete="off" spellcheck="false" class="field text-[14px]" />
        </div>
        <div class="mt-4">${button(t("Move my account"), "doTransferWallet()", { full: false, kind: "line" })}</div>
    </details>
`;

const home = (data) => /*html*/`
    ${data.isMember ? earnings(data) : hero(data)}
    ${data.isMember ? "" : liveLine(data)}
    <main class="${WRAP} flex flex-col gap-6 pt-8">
        ${data.launched ? "" : notLaunched}
        ${data.isMember ? inviteLink(data) : joinPanel(data)}
        ${queueNote(data)}
        ${ladder(data)}
        ${data.isMember ? moveAccount : ""}
    </main>
`;

const homeLoading = () => loadingBox;
const homeError = (error) => errorBox(error?.message ?? "Unknown error");

export { home, homeLoading, homeError };
