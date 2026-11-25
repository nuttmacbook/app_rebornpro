import { box, formNumber } from "../../../engine/chain/connect";
import { invalidateReads } from "../../../engine/chain/cache";
import { normalize } from "../../../engine/chain/txError";
import { approveIfNeeded } from "../../../engine/chain/erc20";
import { readHomeView } from "../reads";
import { RebornContract } from "../../../generated/contracts/rebornmatrix";
import { readableRevert } from "../revertText";
import { t } from "../../lang";

/**
 * YOUR CODE (on-chain). Buys the next package with the wallet.
 * Steps: check (member, launched, open, has the one before, not bought yet, balance) → approve the price → upgrade.
 *
 * @param {object} wallet  { address, signer }
 * @param {object} options
 * @param {number} options.pkg  package number (2 and up)
 * @param {Function} options.onStep  called at each step, to update the toast
 * @returns {Promise<object>} receipt
 */
export async function upgrade(wallet, { pkg, onStep = () => {} } = {}) {
    if (!wallet?.address || !wallet?.signer) throw new Error("Wallet is not connected.");
    const p = Number(pkg);

    onStep({ stage: "checking" });
    const view = await readHomeView(wallet.address, 0n, { fresh: true });
    if (!view.launched) throw new Error("The plan is not open yet.");
    if (!view.isMember) throw new Error("Join first, then you can upgrade.");
    const target = view.packages[p - 1];
    if (!Number.isInteger(p) || p < 2 || !target) throw new Error("That package does not exist.");
    if (!target.isOpen) throw new Error("This package is paused for now.");
    if (view.mine[p - 1]?.has) throw new Error("You already have this package.");
    if (!view.mine[p - 2]?.has) throw new Error("Get the package before this one first.");
    const amount = target.price;
    if (view.walletBalance < amount) throw new Error(t("This package costs {price}. Your wallet does not have enough.", { price: `${formNumber(amount, view.tokenDecimals, 2)} ${view.tokenSymbol}` }));

    const total = view.allowance < amount ? 2 : 1;
    await approveIfNeeded({ wallet, token: view.token, spender: RebornContract.address, amount, allowance: view.allowance, onStep, index: 1, total });

    onStep({ stage: "upgrade", index: total, total });
    try {
        const tx = await box.createEtherContract(RebornContract, wallet.signer).upgrade(BigInt(p));
        onStep({ stage: "upgrading", index: total, total });
        const receipt = await tx.wait();
        invalidateReads();
        return receipt;
    } catch (error) {
        throw normalize(readableRevert(error), box.handleTxError(RebornContract, error), "The upgrade did not go through.");
    }
}
