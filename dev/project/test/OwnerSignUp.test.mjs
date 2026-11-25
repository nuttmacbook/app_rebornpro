/*
 * YOUR CODE (on-chain tests). registerFor: paid sign-ups the owner makes for other wallets.
 *   - only the owner; the owner wallet pays package 1's price for each wallet
 *   - before and after launch; under any sponsor; the money is split like a normal sign-up (checked with the model)
 *   - every wrong input reverts with its own error, and nothing is half done
 */

import { ethers } from "ethers";
import { TX_GAS } from "../../engine/node.mjs";
import { deployReborn } from "../reborn.mjs";
import { newPerson } from "../seed.mjs";
import { planOf } from "../plan.mjs";
import { RebornModel } from "../model.mjs";

export default async function (t) {
    const { provider, owner, stranger, contracts, deployed, check, doesRevert } = t;
    const token = deployed.tokens.USDT.contract;
    const s = t.settings.RebornMatrix;
    const plan = planOf(s);

    const root = ethers.Wallet.createRandom().address;
    const companies = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
    const { contract: matrix, address } = await deployReborn(owner, contracts, { owner: owner.address, token: deployed.tokens.USDT.address, root, companies, plan });
    const model = new RebornModel(plan, root, companies);
    const price1 = plan.prices[0];

    const totals = async () => {
        const v = await matrix.getHomeView(ethers.ZeroAddress, 0);
        return { held: v.totalHeld, paidIn: v.totalIn, referral: v.totalReferral, board: v.totalBoardPaid, company: v.totalCompany };
    };
    const matchesModel = async (label) => {
        const wrong = [];
        for (let pkg = 1; pkg < model.boards.length; pkg++) {
            const board = model.boards[pkg];
            if (Number((await matrix.getPackage(pkg)).positions) !== board.length) wrong.push(`pkg ${pkg} count`);
            for (let i = 0; i < board.length && wrong.length < 3; i++) {
                const p = await matrix.getPosition(pkg, i);
                if (Number(p.member) !== board[i].member || Number(p.parent) !== board[i].parent || p.fund !== board[i].fund) wrong.push(`pkg ${pkg} #${i}`);
            }
        }
        for (const [ account, amount ] of model.paid) if ((await token.balanceOf(account)) !== amount) wrong.push(`balance ${account.slice(0, 8)}`);
        const sum = await totals();
        if (sum.held !== model.held || sum.paidIn !== model.totals.in || sum.referral !== model.totals.referral || sum.board !== model.totals.board || sum.company !== model.totals.company) wrong.push("totals");
        const balance = await token.balanceOf(address);
        if (sum.paidIn !== sum.referral + sum.board + sum.company + sum.held || sum.held !== balance) wrong.push("money");
        check(`registerFor model: ${label}`, wrong.length === 0, wrong.slice(0, 3).join(", "));
    };
    const fundOwner = async (amount) => {
        await (await token.connect(owner).mint(owner.address, amount)).wait();
        await (await token.connect(owner).approve(address, amount)).wait();
    };
    const fresh = (n) => Array.from({ length: n }, () => ethers.Wallet.createRandom().address);

    /* ------------------------------------ 1. who may call it */

    await fundOwner(price1 * 3n);
    check("registerFor: a stranger cannot use it", await doesRevert(() => matrix.connect(stranger).registerFor.staticCall(fresh(1), 1), "OnlyOwner"));

    /* ------------------------------------ 2. before launch, under the root */

    const ownerBefore = await token.balanceOf(owner.address);
    const first = fresh(3);
    const r1 = await (await matrix.registerFor(first, 1, { gasLimit: TX_GAS })).wait();
    model.registerFor(first, 1);
    t.gas("registerFor 3 wallets", r1);
    check("registerFor: works before launch", !(await matrix.getOwnerView()).launched && (await Promise.all(first.map((a) => matrix.idOf(a)))).every((id) => id > 0n));
    check("registerFor: the owner wallet paid 3 x the package 1 price", ownerBefore - (await token.balanceOf(owner.address)) === price1 * 3n);
    const h0 = await matrix.getHistoryView(first[0], 0, 5);
    check("registerFor: members are invited by the sponsor given (root)", h0.sponsor === 1n);
    check("registerFor: counted as paid sign-ups, not free IDs", (await matrix.getOwnerView()).totalFree === 0n && (await totals()).paidIn === price1 * 3n);
    await matchesModel("3 paid sign-ups under the root before launch");
    check("registerFor: the public register stays closed before launch", await doesRevert(async () => {
        const w = await newPerson(provider);
        await (await token.connect(w).mint(w.address, price1)).wait();
        await (await token.connect(w).approve(address, price1)).wait();
        return matrix.connect(w).register.staticCall(1);
    }, "NotLaunched"));

    /* ------------------------------------ 3. after launch, under a member */

    await (await matrix.launchPublic()).wait();
    const sponsorId = await matrix.idOf(first[1]);
    const next = fresh(5);
    await fundOwner(price1 * 5n);
    await (await matrix.registerFor(next, sponsorId, { gasLimit: TX_GAS })).wait();
    model.registerFor(next, Number(sponsorId));
    check("registerFor: works after launch under a member's ID", (await Promise.all(next.map((a) => matrix.getHistoryView(a, 0, 1)))).every((v) => v.sponsor === sponsorId));
    const ref = await matrix.getHistoryView(first[1], 0, 50);
    const words = [ ...ref.rows ];
    const signUpFrom = [];
    for (let i = 0; i < words.length; i += 2) {
        const kind = Number((words[i] >> 80n) & 0xffn), idKind = Number((words[i] >> 104n) & 0xffn);
        if (kind === 1 && idKind === 0) signUpFrom.push(Number((words[i] >> 112n) & 0xffffffffffffffffn));
    }
    const nextIds = (await Promise.all(next.map((a) => matrix.idOf(a)))).map(Number);
    check("registerFor: the sponsor gets a sign-up referral row from each of the 5 wallets", signUpFrom.sort().join() === nextIds.sort().join(), signUpFrom.join(","));
    await matchesModel("5 paid sign-ups under a member after launch");

    // a member joined by the owner can then upgrade on their own like anyone
    const self = await newPerson(provider);
    await fundOwner(price1);
    await (await matrix.registerFor([ self.address ], sponsorId, { gasLimit: TX_GAS })).wait();
    model.registerFor([ self.address ], Number(sponsorId));
    const p2 = plan.prices[1];
    await (await token.connect(self).mint(self.address, p2)).wait();
    await (await token.connect(self).approve(address, p2)).wait();
    await (await matrix.connect(self).upgrade(2, { gasLimit: TX_GAS })).wait();
    model.upgrade(self.address, 2);
    await matchesModel("a member the owner signed up upgrades by themselves");

    /* ------------------------------------ 4. wrong inputs */

    await fundOwner(price1 * 60n);
    const before = await totals();
    check("registerFor: empty list", await doesRevert(() => matrix.registerFor.staticCall([], 1), "FreeCount"));
    check("registerFor: more than 50 wallets", await doesRevert(() => matrix.registerFor.staticCall(fresh(51), 1), "FreeCount"));
    check("registerFor: sponsor 0", await doesRevert(() => matrix.registerFor.staticCall(fresh(1), 0), "UnknownSponsor"));
    check("registerFor: sponsor that does not exist", await doesRevert(() => matrix.registerFor.staticCall(fresh(1), 9999), "UnknownSponsor"));
    check("registerFor: a wallet that already joined (whole batch stops)", await doesRevert(() => matrix.registerFor.staticCall([ ...fresh(2), next[0] ], 1), "AlreadyRegistered"));
    check("registerFor: the same wallet twice in one list", await doesRevert(() => { const w = fresh(1)[0]; return matrix.registerFor.staticCall([ w, w ], 1); }, "AlreadyRegistered"));
    check("registerFor: a company wallet", await doesRevert(() => matrix.registerFor.staticCall([ companies[0] ], 1), "RootAndCompanyMustDiffer"));
    check("registerFor: the zero address", await doesRevert(() => matrix.registerFor.staticCall([ ethers.ZeroAddress ], 1), "ZeroAddress"));
    await (await matrix.setPackageOpen(1, false)).wait();
    check("registerFor: package 1 paused", await doesRevert(() => matrix.registerFor.staticCall(fresh(1), 1), "PackageClosed"));
    await (await matrix.setPackageOpen(1, true)).wait();
    await (await token.connect(owner).approve(address, price1 - 1n)).wait();
    check("registerFor: approval below the total", await doesRevert(() => matrix.registerFor.staticCall(fresh(1), 1)));
    const after = await totals();
    check("registerFor: failed calls changed nothing", after.paidIn === before.paidIn && after.held === before.held);

    /* ------------------------------------ 5. a full batch */

    await fundOwner(price1 * 50n);
    const r50 = await (await matrix.registerFor(fresh(50), 1, { gasLimit: 30_000_000n })).wait();
    t.gas("registerFor 50 wallets", r50);
    check("registerFor: 50 wallets in one transaction fit in a block", r50.gasUsed < 30_000_000n, `${r50.gasUsed} gas, queue ${(await matrix.getOwnerView()).queued}`);
}
