import { box, formNumber } from "../../../engine/chain/connect";
import { approveIfNeeded } from "../../../engine/chain/erc20";
import { invalidateReads } from "../../../engine/chain/cache";
import { normalize } from "../../../engine/chain/txError";
import { readHomeView, readOwnerView } from "../reads";
import { RebornContract } from "../../../generated/contracts/rebornmatrix";
import { readableRevert } from "../revertText";
import { t } from "../../lang";

/*
 * YOUR CODE (on-chain). What only the contract owner can do: paid sign-ups for other wallets (any time),
 * launch, add a package, pause or resume one. Every function checks first, then sends one transaction.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_BATCH = 20;

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

/** New wallets from a text box: checked here so the owner never signs something that would fail */
const checkNewWallets = (list, owner) => {
    if (!list.length) throw new Error("Add at least one wallet.");
    if (list.length > MAX_BATCH) throw new Error(t("Up to {max} wallets at a time. Split the list.", { max: MAX_BATCH }));
    const wrong = list.find((a) => !ADDRESS.test(a));
    if (wrong) throw new Error(t("This is not a wallet address: {value}", { value: wrong }));
    const companies = owner.companies.map((w) => String(w).toLowerCase());
    if (list.some((a) => companies.includes(a.toLowerCase()))) throw new Error("A company wallet (product, marketing or treasury) cannot hold a member account.");
};

/**
 * Paid sign-ups for other wallets: each joins package 1 under `sponsorId`, and the owner wallet pays the
 * package 1 price for every one (approve, then one transaction). Before or after launch.
 * Steps: check → approve price x wallets (only when needed) → registerFor.
 *
 * @param {object} wallet  { address, signer } of the owner
 * @param {object} options  { text: wallets, sponsorId: member id (1 = root), onStep }
 * @returns {Promise<object>} receipt
 */
export async function registerFor(wallet, { text, sponsorId = 1, onStep = () => {} } = {}) {
    onStep({ stage: "checking" });
    const owner = await mustBeOwner(wallet);
    const list = parseAddresses(text);
    checkNewWallets(list, owner);
    const sponsor = BigInt(sponsorId || 0);
    const [ home, ...views ] = await Promise.all([ readHomeView(wallet.address, sponsor, { fresh: true }), ...list.map((a) => readHomeView(a, 0n, { fresh: true })) ]);
    if (!home.refValid) throw new Error("That sponsor does not exist.");
    const joined = list.find((_, i) => views[i].isMember);
    if (joined) throw new Error(t("{wallet} has already joined.", { wallet: joined }));
    const first = home.packages[0];
    if (!first?.isOpen) throw new Error("This package is paused for now.");
    const amount = first.price * BigInt(list.length);
    if (home.walletBalance < amount) throw new Error(t("This costs {price}. The owner wallet does not have enough.", { price: `${formNumber(amount, home.tokenDecimals, 2)} ${home.tokenSymbol}` }));

    const total = home.allowance < amount ? 2 : 1;
    await approveIfNeeded({ wallet, token: home.token, spender: RebornContract.address, amount, allowance: home.allowance, onStep, index: 1, total });

    onStep({ stage: "register", index: total, total });
    try {
        const tx = await box.createEtherContract(RebornContract, wallet.signer).registerFor(list, sponsor);
        onStep({ stage: "registering", index: total, total });
        const receipt = await tx.wait();
        invalidateReads();
        return receipt;
    } catch (error) {
        throw normalize(readableRevert(error), box.handleTxError(RebornContract, error), "The sign-ups did not go through.");
    }
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
