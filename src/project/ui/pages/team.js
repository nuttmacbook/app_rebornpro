import { t } from "../../lang";
import { dateOf, address, WRAP, pageHead, button, pager, errorBox, loadingBox } from "../componants/parts";
import { memberLabel } from "../componants/ids";

/*
 * YOUR CODE (off-chain). Who invited the viewer, and everyone the viewer invited (one page at a time).
 */

const people = (data) => /*html*/`
    <div class="overflow-x-auto border-y border-seam">
        <table class="w-full min-w-[34rem] text-left text-[14px]">
            <thead>
                <tr class="border-b border-seam text-[13px] text-cinder">
                    <th class="py-3 pr-4 font-medium">${t("Member")}</th>
                    <th class="py-3 pr-4 font-medium">${t("Wallet")}</th>
                    <th class="py-3 pr-4 font-medium">${t("Joined")}</th>
                    <th class="py-3 pr-4 text-right font-medium">${t("Packages")}</th>
                    <th class="py-3 pr-4 text-right font-medium">${t("IDs")}</th>
                    <th class="py-3 text-right font-medium">${t("Invited")}</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-seam">
                ${data.directs.map((d) => /*html*/`
                    <tr>
                        <td class="py-3 pr-4 font-display font-semibold text-bone">${memberLabel(d.id)}</td>
                        <td class="figure py-3 pr-4 text-cinder">${address(d.account)}</td>
                        <td class="py-3 pr-4 text-cinder">${dateOf(d.joinedAt)}</td>
                        <td class="figure py-3 pr-4 text-right text-bone">${d.packages}</td>
                        <td class="figure py-3 pr-4 text-right text-bone">${d.positions}</td>
                        <td class="figure py-3 text-right text-cinder">${d.directs}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
`;

const team = (data) => {
    if (!data.isConnected || !data.myId) {
        return /*html*/`
        <main class="${WRAP} flex flex-col gap-6 py-10 sm:py-14">
            ${pageHead(t("Team"), t("Everyone who joined with your invite link."))}
            <div class="plate max-w-xl p-6">
                <p class="text-[15px] text-cinder">${data.isConnected ? t("This wallet has not joined yet.") : t("Connect your wallet to see your team.")}</p>
                <div class="mt-4">${data.isConnected ? button(t("Join"), "location.hash='#/'", { full: false }) : button(t("Connect wallet"), "openWallet()", { full: false })}</div>
            </div>
        </main>`;
    }
    return /*html*/`
    <main class="${WRAP} flex flex-col gap-8 py-10 sm:py-14">
        ${pageHead(t("Team"), t("You get the referral share of every entry from the people listed here, including their upgrades and every Reborn."))}
        <dl class="grid grid-cols-3 border-y border-seam">
            ${[
                [ t("Your ID"), memberLabel(data.myId) ],
                [ t("Invited by"), data.sponsorId ? memberLabel(data.sponsorId) : t("Top") ],
                [ t("You invited"), String(data.directsTotal) ],
            ].map(([ k, v ], i) => `<div class="px-3 py-4 sm:px-6 ${i ? "border-l border-seam" : ""}"><dd class="truncate font-display text-[1.3rem] font-semibold text-bone sm:text-[1.7rem]">${v}</dd><dt class="text-[13px] text-cinder">${k}</dt></div>`).join("")}
        </dl>
        <section>
            <h2 class="font-display text-xl font-semibold text-bone">${t("People you invited")}</h2>
            <div class="mt-3">${data.directsTotal ? people(data) : `<p class="text-[14px] text-cinder">${t("Nobody yet. Copy your invite link on Home and send it.")}</p>`}</div>
            ${pager({ page: data.page, pageSize: data.pageSize, total: data.directsTotal, go: "teamPage" })}
        </section>
    </main>
    `;
};

const teamLoading = () => loadingBox;
const teamError = (error) => errorBox(error?.message ?? "Unknown error");

export { team, teamLoading, teamError };
