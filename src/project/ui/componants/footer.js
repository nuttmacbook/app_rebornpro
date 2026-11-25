import { settings } from "../../../engine/settings";
import { t } from "../../lang";

/*
 * YOUR CODE (off-chain). A quiet line under every page: what the contract is, and the owner tools link.
 * An object whose toString() builds the HTML, so each repaint uses the current text.
 */

const footerHtml = () => /*html*/`
    <footer class="mx-auto mt-16 max-w-6xl border-t border-seam px-4 py-8 sm:px-8">
        <div class="flex flex-col gap-4 text-[13px] leading-relaxed text-smolder md:flex-row md:justify-between">
            <p class="max-w-2xl">${t("{name} pays through a public smart contract on BNB Smart Chain. Every entry and every payout is a transaction anyone can check. Pay depends on new IDs filling slots; the numbers here are what one slot or one board pays, not a forecast.", { name: settings.appName })}</p>
            <a href="#/owner" class="shrink-0 text-cinder underline-offset-4 hover:text-bone hover:underline">${t("Owner tools")}</a>
        </div>
    </footer>
`;

const footer = { toString: footerHtml };

export { footer };
