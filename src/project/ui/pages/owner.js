import { t } from "../../lang";
import { money, moneyText, address, WRAP, pageHead, blockHead, button, row, errorBox, loadingBox } from "../componants/parts";
import { packageName } from "../componants/ring";

/*
 * YOUR CODE (off-chain). Owner tools: paid sign-ups for others, launch, new packages,
 * pausing a package. Anyone can open the page; only the owner wallet can send these transactions.
 */

const status = (data) => /*html*/`
    <div class="plate p-5 sm:p-6">
        ${blockHead(t("Contract"), data.owner.launched ? `<span class="text-ember">${t("Launched")}</span>` : `<span class="text-flame">${t("Not launched yet")}</span>`)}
        <dl class="mt-3 divide-y divide-seam">
            ${row(t("Owner"), `<span class="figure">${address(data.owner.owner)}</span>`)}
            ${row(t("Root wallet, member 1"), `<span class="figure">${address(data.owner.root)}</span>`)}
            ${[ t("Product wallet"), t("Marketing wallet"), t("Treasury wallet") ].map((label, i) => row(label, `<span class="figure">${address(data.owner.companies[i])}</span>`)).join("")}
            ${row(t("Waiting to be placed"), String(data.owner.queued))}
            ${row(t("Placements per transaction"), String(data.owner.stepsPerTx))}
            ${row(t("Kept for reborns"), money(data, data.totalHeld))}
        </dl>
    </div>
`;

const paidForm = (data) => /*html*/`
    <div class="plate p-5 sm:p-6">
        ${blockHead(t("Sign up others, paid"), t("{price} each", { price: moneyText(data, data.packages[0]?.price ?? 0n) }))}
        <p class="mt-2 text-[14px] text-cinder">${t("New wallets join package 1 under the sponsor you choose, like a normal sign-up: the owner wallet pays the price for each, and the money is split the same way. The sponsor gets the referral pay of every later entry. Up to 20 at a time.")}</p>
        <label class="sr-only" for="paid-wallets">${t("Wallets to sign up")}</label>
        <textarea id="paid-wallets" data-paid-wallets rows="4" wrap="off" placeholder="0x…" spellcheck="false" class="field mt-4 text-[14px]"></textarea>
        <div class="mt-3 flex flex-col gap-3 sm:flex-row">
            <label class="sr-only" for="paid-sponsor">${t("Sponsor ID")}</label>
            <input id="paid-sponsor" data-paid-sponsor type="text" autocomplete="off" spellcheck="false" placeholder="${t("Sponsor ID (empty = root)")}" class="field min-w-0 sm:flex-1" />
            ${button(t("Sign up and pay"), "doRegisterFor()", { full: false })}
        </div>
    </div>
`;

const launchCard = /*html*/`
    <div class="plate p-5 sm:p-6">
        ${blockHead(t("Launch to everyone"), t("Cannot be undone"))}
        <p class="mt-2 text-[14px] text-cinder">${t("Opens joining and upgrades to everyone. It cannot be undone.")}</p>
        <label class="mt-4 flex items-center gap-3 text-[14px] text-cinder"><input data-launch-sure type="checkbox" class="size-4 accent-[#e8202e]" /> ${t("The sign-ups the owner pays for are done.")}</label>
        <div class="mt-4">${button(t("Launch"), "doLaunch()", { full: false })}</div>
    </div>
`;

const packagesCard = (data) => /*html*/`
    <div class="plate p-5 sm:p-6">
        ${blockHead(t("Packages"), t("{count} of {max}", { count: data.owner.packageCount, max: data.owner.maxPackages }))}
        <div class="mt-3 divide-y divide-seam">
            ${data.packages.map((p) => /*html*/`
                <div class="flex items-center justify-between gap-3 py-3">
                    <div class="min-w-0">
                        <p class="font-display text-[16px] font-semibold text-bone">${packageName(data, p.pkg)}</p>
                        <p class="text-[13px] text-smolder">${t("{members} members, {positions} IDs", { members: p.members, positions: p.positions })}</p>
                    </div>
                    ${button(p.isOpen ? t("Pause sales") : t("Resume sales"), `doSetPackageOpen(${p.pkg}, ${!p.isOpen})`, { full: false, kind: "line", size: "sm" })}
                </div>
            `).join("")}
        </div>
        <div class="mt-4 border-t border-seam pt-4">
            <p class="text-[14px] text-cinder">${t("A new package goes at the end of the upgrade path, and the site shows it at once. Its price cannot change later.")}</p>
            <div class="mt-3 flex flex-col gap-3 sm:flex-row">
                <label class="sr-only" for="new-price">${t("Price")}</label>
                <input id="new-price" data-new-price type="text" inputmode="decimal" placeholder="${t("Price in {token}, for example 500", { token: data.tokenSymbol })}" class="field sm:w-72" />
                ${button(t("Add package"), "doAddPackage()", { full: false })}
            </div>
        </div>
    </div>
`;

const ownerPage = (data) => /*html*/`
    <main class="${WRAP} flex flex-col gap-6 py-10 sm:py-14">
        ${pageHead(t("Owner tools"), data.isOwner ? t("You are connected with the owner wallet.") : t("Only the owner wallet can use these. Connect it to continue."))}
        <div class="grid gap-6 lg:grid-cols-2">
            <div class="flex flex-col gap-6">${paidForm(data)}${packagesCard(data)}</div>
            <div class="flex flex-col gap-6">${status(data)}${data.owner.launched ? "" : launchCard}</div>
        </div>
    </main>
`;

const ownerLoading = () => loadingBox;
const ownerError = (error) => errorBox(error?.message ?? "Unknown error");

export { ownerPage, ownerLoading, ownerError };
