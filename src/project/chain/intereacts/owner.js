import { box } from "../../../engine/chain/connect";
import { invalidateReads } from "../../../engine/chain/cache";
import { normalize } from "../../../engine/chain/txError";
import { readHomeView, readOwnerView } from "../reads";
import { RebornContract } from "../../../generated/contracts/rebornmatrix";
import { readableRevert } from "../revertText";
import { t } from "../../lang";

/*
 * YOUR CODE (on-chain). What only the contract owner can do: free IDs for investors (before launch),
 * launch, add a package, pause or resume one. Every function checks first, then sends one transaction.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_FREE = 50;

/** Addresses from a text box (lines, commas or spaces), duplicates removed in order */
const parseAddresses = (text) => [ ...new Set(String(text ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) ];

/** "12.5" whole tokens → smallest unit (BigInt), or 0n when not a number */
const toUnits = (text, decimals) => {
    const clean = String(text ?? "").trim().replace(/,/g, "");
    if (!/^\d+(\.\d+)?$/.test(clean)) return 0n;
    const [ whole, frac = "" ] = clean.split(".");
    if (frac.length > decimals) return 0n;
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
};

const mustBeOwner = async (wallet) => {
    if (!wallet?.address || !wallet?.signer) throw new Error("Wallet is not connected.");
    const owner = await readOwnerView({ fresh: true });
    if (owner.owner.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("Only the contract owner can do this. Connect the owner wallet.");
    return owner;
};

/** Sends one owner transaction with the shared toast steps */
const send = async (wallet, onStep, fallback, call) => {
    onStep({ stage: "owner", index: 1, total: 1 });
    try {
        const tx = await call(box.createEtherContract(RebornContract, wallet.signer));
        onStep({ stage: "ownering", index: 1, total: 1 });
        const receipt = await tx.wait();
        invalidateReads();
        return receipt;
    } catch (error) {
        throw normalize(readableRevert(error), box.handleTxError(RebornContract, error), fallback);
    }
};

/**
 * Places free IDs for investors under the root of one package. Before launch only.
 *
 * @param {object} wallet  { address, signer } of the owner
 * @param {object} options  { text: addresses, pkg, onStep }
 */
export async function placeFree(wallet, { text, pkg, onStep = () => {} } = {}) {
    onStep({ stage: "checking" });
    const owner = await mustBeOwner(wallet);
    if (owner.launched) throw new Error("The plan is launched: free IDs can no longer be placed.");
    const list = parseAddresses(text);
    if (!list.length) throw new Error("Add at least one investor wallet.");
    if (list.length > MAX_FREE) throw new Error(t("Up to {max} wallets at a time. Split the list.", { max: MAX_FREE }));
    const wrong = list.find((a) => !ADDRESS.test(a));
    if (wrong) throw new Error(t("This is not a wallet address: {value}", { value: wrong }));
    const companies = owner.companies.map((w) => String(w).toLowerCase());
    if (list.some((a) => companies.includes(a.toLowerCase()))) throw new Error("A company wallet (product, marketing or treasury) cannot hold a member account.");
    const p = Number(pkg);
    if (!Number.isInteger(p) || p < 1 || p > owner.packageCount) throw new Error("That package does not exist.");
    const views = await Promise.all(list.map((a) => readHomeView(a, 0n, { fresh: true })));
    const already = list.find((_, i) => views[i].mine[p - 1]?.has);
    if (already) throw new Error(t("{wallet} already has this package.", { wallet: already }));
    return send(wallet, onStep, "The free IDs were not placed.", (c) => c.placeFree(list, BigInt(p)));
}

/** Opens the plan to everyone. One way: free placement closes for good. */
export async function launchPublic(wallet, { onStep = () => {} } = {}) {
    onStep({ stage: "checking" });
    const owner = await mustBeOwner(wallet);
    if (owner.launched) throw new Error("The plan is already launched.");
    return send(wallet, onStep, "The launch did not go through.", (c) => c.launchPublic());
}

/** Adds a package at the end of the upgrade path. `priceText` in whole tokens. */
export async function addPackage(wallet, { priceText, onStep = () => {} } = {}) {
    onStep({ stage: "checking" });
    const owner = await mustBeOwner(wallet);
    const home = await readHomeView(wallet.address, 0n, { fresh: true });
    if (owner.packageCount >= owner.maxPackages) throw new Error(t("The contract holds up to {max} packages.", { max: owner.maxPackages }));
    const price = toUnits(priceText, home.tokenDecimals);
    if (price <= 0n) throw new Error("Enter the price in whole tokens, for example 500.");
    return send(wallet, onStep, "The package was not added.", (c) => c.addPackage(price));
}

/** Pauses (isOpen = false) or resumes sales of one package */
export async function setPackageOpen(wallet, { pkg, isOpen, onStep = () => {} } = {}) {
    onStep({ stage: "checking" });
    await mustBeOwner(wallet);
    return send(wallet, onStep, "The package was not changed.", (c) => c.setPackageOpen(BigInt(pkg), Boolean(isOpen)));
}

export { parseAddresses, toUnits };
