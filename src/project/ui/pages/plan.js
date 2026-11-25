import { t } from "../../lang";
import { moneyText, percent, WRAP, pageHead, blockHead, errorBox, loadingBox } from "../componants/parts";
import { packageName } from "../componants/ring";

/*
 * YOUR CODE (off-chain). The plan, drawn from getPlanView: every percent and every package comes from the contract,
 * so this page cannot disagree with it, and a package added later appears by itself.
 */

/** The three slots around one ID, each labelled with what it pays (percents from the contract) */
const slotDiagram = (data) => {
    const seg = (i) => `<circle cx="160" cy="150" r="92" pathLength="360" fill="none" stroke="url(#fire-stroke)" stroke-width="16" stroke-dasharray="108 252" transform="rotate(${-90 + i * 120 + 6} 160 150)" opacity="${1 - i * 0.18}" />`;
    const label = (x, y, anchor, title, lines) => /*html*/`
        <text x="${x}" y="${y}" text-anchor="${anchor}" font-family="IBM Plex Sans Thai, sans-serif" font-size="17" font-weight="600" fill="#f5f5f5">${title}</text>
        ${lines.map((l, k) => `<text x="${x}" y="${y + 20 + k * 18}" text-anchor="${anchor}" font-family="IBM Plex Sans Thai, sans-serif" font-size="13.5" fill="${k === 0 ? "#ff7a7a" : "#a1a1aa"}">${l}</text>`).join("")}
    `;
    const slot = (i) => {
        const cash = percent(data.cashBps[i] ?? 0);
        const kept = data.rebornBps[i] ?? 0;
        return [ t("{p} to you in cash", { p: cash }), ...(kept ? [ t("{p} kept for your Reborn", { p: percent(kept) }) ] : []) ];
    };
    return /*html*/`
        <svg viewBox="0 0 640 300" class="w-full max-w-[640px]" role="img" aria-label="${t("What each of the three slots pays")}">
            ${[ 0, 1, 2 ].map(seg).join("")}
            <text x="160" y="146" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="24" font-weight="600" fill="#f5f5f5">${t("Your ID")}</text>
            <text x="160" y="168" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="13" fill="#a1a1aa">${t("3 slots")}</text>
            <path d="M232 92 H300" stroke="#2a2a2f" /><path d="M246 214 H300" stroke="#2a2a2f" /><path d="M86 214 H40" stroke="#2a2a2f" opacity="0" />
            ${label(310, 70, "start", t("Slot 1"), slot(0))}
            ${label(310, 196, "start", t("Slots 2 and 3"), slot(1))}
        </svg>
    `;
};

/** Package plates in the style of the client's art: price on the badge, then what an ID and an invite pay */
const plates = (data) => /*html*/`
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${data.packages.map((p) => /*html*/`
            <article class="plate p-5 sm:p-6">
                <div class="flex items-baseline justify-between gap-3">
                    <h3 class="font-display text-2xl font-semibold text-bone">${packageName(data, p.pkg)}</h3>
                    ${p.isOpen ? "" : `<span class="text-[13px] text-smolder">${t("Sales paused")}</span>`}
                </div>
                <dl class="mt-5 grid grid-cols-2 gap-4">
                    <div>
                        <dt class="min-h-[2.6em] text-[13px] leading-snug text-cinder">${t("Your ID, each full board")}</dt>
                        <dd class="fire-text mt-1 whitespace-nowrap font-display text-[1.45rem] font-semibold leading-none">+${moneyText(data, p.cyclePay, 0)}</dd>
                    </div>
                    <div class="border-l border-seam pl-4">
                        <dt class="min-h-[2.6em] text-[13px] leading-snug text-cinder">${t("Someone you invited, each entry")}</dt>
                        <dd class="fire-text mt-1 whitespace-nowrap font-display text-[1.45rem] font-semibold leading-none">+${moneyText(data, p.referralPay, 0)}</dd>
                    </div>
                </dl>
                <p class="mt-5 border-t border-seam pt-3 text-[13px] text-smolder">${t("Price {price}. {count} boards reborn so far.", { price: moneyText(data, p.price, 0), count: p.completed.toLocaleString("en-US") })}</p>
            </article>
        `).join("")}
    </div>
`;

/** How a new ID finds its place (the contract's one placement rule) */
const placementText = () => t("It goes below that person's IDs in order: ID 1 takes people until its 3 + 9 slots are full, then 1.1, then 1.2 and so on, left first.");

const steps = (data) => [
    [ t("Join through a link"), `${t("You go on the board of the person who invited you.")} ${placementText()}` ],
    [ t("Slots fill and pay"), t("Every slot that fills below your ID pays you at once, straight to your wallet.") ],
    [ t("The board is reborn"), t("At three filled slots, the money kept from slots 2 and 3 is exactly one price. It buys your next ID inside your own team, placed the same way.") ],
    [ t("Move up a package"), t("Each package is its own board. Buy the next one once you hold the one before. Your new ID goes on the board of the nearest person above you who has that package, placed the same way.") ],
];

const plan = (data) => /*html*/`
    <main class="${WRAP} flex flex-col gap-12 py-10 sm:py-14">
        ${pageHead(t("How it pays"), t("Every number here is read live from the smart contract on BNB Smart Chain."))}

        <section class="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div>${slotDiagram(data)}</div>
            <div class="text-[15px] leading-relaxed text-cinder">
                <p>${t("Every paid entry, whether someone joins, upgrades or is reborn, is split the same way.")}</p>
                <dl class="mt-4 divide-y divide-seam border-y border-seam">
                    <div class="flex justify-between gap-4 py-3"><dt>${t("To whoever invited that person")}</dt><dd class="figure font-display font-semibold text-bone">${percent(data.referralBps)}</dd></div>
                    <div class="flex justify-between gap-4 py-3"><dt>${t("To the ID above, by slot")}</dt><dd class="figure font-display font-semibold text-bone">${data.cashBps.map(percent).join(" / ")}</dd></div>
                    <div class="flex justify-between gap-4 py-3"><dt>${t("Kept for that ID's Reborn")}</dt><dd class="figure font-display font-semibold text-bone">${data.rebornBps.map((b) => (b ? percent(b) : "0")).join(" / ")}</dd></div>
                    ${[ t("To the company: products"), t("To the company: marketing"), t("To the company: treasury") ].map((label, i) => `<div class="flex justify-between gap-4 py-3"><dt>${label}</dt><dd class="figure font-display font-semibold text-bone">${percent(data.companyBps[i] ?? 0)}</dd></div>`).join("")}
                </dl>
            </div>
        </section>

        <section>
            ${blockHead(t("Packages"), t("{count} members", { count: data.memberCount.toLocaleString("en-US") }))}
            <div class="mt-4">${plates(data)}</div>
            <p class="mt-3 max-w-3xl text-[13px] text-smolder">${t("These are amounts for one full board and one entry. How many boards fill depends on new IDs coming in.")}</p>
        </section>

        <section>
            ${blockHead(t("The cycle"))}
            <ol class="mt-4 grid gap-px bg-seam sm:grid-cols-2 lg:grid-cols-4">
                ${steps(data).map(([ title, text ], i) => /*html*/`
                    <li class="bg-void p-5">
                        <span class="font-display text-[2rem] font-semibold leading-none text-seam">${i + 1}</span>
                        <h3 class="mt-3 font-display text-lg font-semibold text-bone">${title}</h3>
                        <p class="mt-2 text-[14px] leading-relaxed text-cinder">${text}</p>
                    </li>
                `).join("")}
            </ol>
        </section>
    </main>
`;

const planLoading = () => loadingBox;
const planError = (error) => errorBox(error?.message ?? "Unknown error");

export { plan, planLoading, planError };
