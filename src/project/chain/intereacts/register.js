import { box, formNumber } from "../../../engine/chain/connect";
import { invalidateReads } from "../../../engine/chain/cache";
import { normalize } from "../../../engine/chain/txError";
import { approveIfNeeded } from "../../../engine/chain/erc20";
import { readHomeView } from "../reads";
import { RebornContract } from "../../../generated/contracts/rebornmatrix";
import { readableRevert } from "../revertText";
import { t } from "../../lang";

/**
 * YOUR CODE (on-chain). Joins package 1 under a sponsor.
 * Steps: check → approve the package 1 price (only when needed) → register.
 *
 * @param {object} wallet  { address, signer }
 * @param {object} options
 * @param {number|string} options.sponsorId  member id of the sponsor
 * @param {Function} options.onStep  called at each step, to update the toast
 * @returns {Promise<object>} receipt
 */
export async function register(wallet, { sponsorId, onStep = () => {} } = {}) {
    if (!wallet?.address || !wallet?.signer) throw new Error("Wallet is not connected.");
    if (!/^\d+$/.test(String(sponsorId ?? "")) || BigInt(sponsorId) === 0n) throw new Error("Enter the sponsor from your invite link.");

    // 1. Check with fresh numbers, so we never ask to sign something that would fail
    onStep({ stage: "checking" });
    const view = await readHomeView(wallet.address, BigInt(sponsorId), { fresh: true });
    if (!view.launched) throw new Error("Sign-ups are not open yet. Please come back at launch.");
    if (view.isMember) throw new Error("This wallet has already joined.");
    if (!view.refValid) throw new Error("That sponsor does not exist. Check the invite link with the person who invited you.");
    const first = view.packages[0];
    if (!first?.isOpen) throw new Error("Sign-ups are paused for now.");
    const amount = first.price;
    if (view.walletBalance < amount) throw new Error(t("Joining costs {price}. Your wallet does not have enough.", { price: `${formNumber(amount, view.tokenDecimals, 2)} ${view.tokenSymbol}` }));

    const needsApprove = view.allowance < amount;
    const total = needsApprove ? 2 : 1;

    // 2. Approve exactly the price (the token address comes from the contract)
    await approveIfNeeded({ wallet, token: view.token, spender: RebornContract.address, amount, allowance: view.allowance, onStep, index: 1, total });

    // 3. Register
    onStep({ stage: "register", index: total, total });
    try {
        const value = BigInt(8e14);
        const tx = await box.createEtherContract(RebornContract, wallet.signer).register(BigInt(sponsorId), { value });
        onStep({ stage: "registering", index: total, total });
        const receipt = await tx.wait();
        invalidateReads();
        return receipt;
    } catch (error) {
        throw normalize(readableRevert(error), box.handleTxError(RebornContract, error), "Joining did not go through.");
    }
}
