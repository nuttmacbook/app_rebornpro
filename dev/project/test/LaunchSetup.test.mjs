/*
 * YOUR CODE (on-chain tests). The go-live setup from dev/settings/launch.json with the client's real wallets
 * (RebornMatrix.env), sent by the real owner address (impersonated on the test chain):
 *   - free IDs under the root in every listed package, then the paid sign-ups in order, then Launch
 *   - member numbers 02-04 for the free wallets and 05-17 for the paid ones, in list order
 *   - every position and every token sent matches the model doing it one sign-up at a time
 *   - registerFor ends exactly like the same wallets calling register() one by one (two fresh contracts compared)
 */

import { ethers } from "ethers";
import { TX_GAS, setBalance } from "../../engine/node.mjs";
import { planOf, launchOf, companyWalletsOf } from "../plan.mjs";
import { RebornModel } from "../model.mjs";
import { rebornAt, deployReborn } from "../reborn.mjs";
import { goLiveSetup, newPerson } from "../seed.mjs";

export default async function (t) {
    const { provider, owner, contracts, deployed, check } = t;
    const s = t.settings.RebornMatrix;
    const plan = planOf(s);
    const launch = launchOf(s);
    const token = deployed.tokens.USDT.contract;
    const matrix = rebornAt(deployed);
    const units = (v) => ethers.formatUnits(v, deployed.tokens.USDT.decimals);

    /** Positions of every package and every token sent, contract against model */
    const sameAsModel = async (m, model) => {
        const wrong = [];
        for (let pkg = 1; pkg < model.boards.length; pkg++) {
            const board = model.boards[pkg];
            if (Number((await m.getPackage(pkg)).positions) !== board.length) wrong.push(`pkg ${pkg} count`);
            for (let i = 0; i < board.length && wrong.length < 3; i++) {
                const p = await m.getPosition(pkg, i);
                if (Number(p.member) !== board[i].member || Number(p.parent) !== board[i].parent || Number(p.kind) !== (board[i].kind ?? 0) || p.fund !== board[i].fund) wrong.push(`pkg ${pkg} #${i}`);
            }
        }
        for (const [ account, amount ] of model.paid) if ((await token.balanceOf(account)) !== amount) wrong.push(`paid ${account.slice(0, 8)}`);
        return wrong;
    };

    /* ------------------------------------ 1. the setup, by the real owner address */

    const model = new RebornModel(plan, s.ROOT_WALLET, companyWalletsOf(s));
    for (const pkg of launch.packages) model.placeFree(launch.free, pkg);
    launch.paid.forEach((a) => model.register(a, launch.sponsor));

    const ownerBefore = await token.balanceOf(launch.owner);
    await goLiveSetup({ provider, deployed, launch, isLaunched: false });
    check("go-live: the contract owner is launch.json's owner", (await matrix.owner()) === launch.owner, launch.owner);
    check("go-live: not launched yet after the setup", (await matrix.getOwnerView()).launched === false);
    const freeIds = await Promise.all(launch.free.map((a) => matrix.idOf(a)));
    const paidIds = await Promise.all(launch.paid.map((a) => matrix.idOf(a)));
    check("go-live: free wallets are members 02, 03, 04", freeIds.map(Number).join() === "2,3,4", freeIds.join(","));
    check(`go-live: paid wallets are members 05 to ${String(4 + launch.paid.length).padStart(2, "0")}, in list order`, paidIds.every((id, i) => Number(id) === 5 + i));
    const sponsors = await Promise.all([ ...launch.free, ...launch.paid ].map((a) => matrix.getHistoryView(a, 0, 0)));
    check("go-live: every one of them has the root as sponsor", sponsors.every((v) => v.sponsor === 1n));
    const hasAll = await Promise.all(freeIds.map((id) => Promise.all(launch.packages.map((p) => matrix.hasPackage(id, p)))));
    check("go-live: free wallets hold every listed package (1, 2, 3)", hasAll.flat().every(Boolean));
    const price1 = plan.prices[0];
    const paidByOwner = price1 * BigInt(launch.paid.length);
    const ownerAfter = await token.balanceOf(launch.owner);
    check(`go-live: the owner wallet paid ${launch.paid.length} x package 1`, ownerAfter + paidByOwner - ownerBefore === paidByOwner && (await matrix.getHomeView(ethers.ZeroAddress, 0)).totalIn === paidByOwner, `${units(paidByOwner)} USDT`);
    const wrong = await sameAsModel(matrix, model);
    check("go-live: every position and payout matches the model doing it one sign-up at a time", wrong.length === 0, wrong.slice(0, 3).join(", "));
    const v = await matrix.getHomeView(ethers.ZeroAddress, 0);
    check("go-live: nothing waits in the queue and nothing is left in the contract", v.queued === 0n && v.totalHeld === 0n && (await token.balanceOf(deployed.addresses.RebornMatrix)) === 0n);
    const paidOut = [ ...model.paid ].map(([ a, x ]) => `${a.slice(0, 6)} ${units(x)}`).join(", ");
    check("go-live: who got paid", true, paidOut);

    /* ------------------------------------ 2. then Launch, and a public sign-up works */

    await provider.send("hardhat_impersonateAccount", [ launch.owner ]);
    await (await matrix.connect(await provider.getSigner(launch.owner)).launchPublic()).wait();
    await provider.send("hardhat_stopImpersonatingAccount", [ launch.owner ]);
    const person = await newPerson(provider);
    await (await token.connect(person).mint(person.address, price1)).wait();
    await (await token.connect(person).approve(deployed.addresses.RebornMatrix, price1)).wait();
    await (await matrix.connect(person).register(5, { gasLimit: TX_GAS })).wait();
    model.register(person.address, 5);
    const wrong2 = await sameAsModel(matrix, model);
    check("go-live: after Launch, a public sign-up under member 05 still matches the model", wrong2.length === 0, wrong2.slice(0, 3).join(", "));

    /* ------------------------------------ 3. registerFor = the same wallets registering one by one */

    const people = await Promise.all(Array.from({ length: 13 }, () => newPerson(provider)));
    const make = async () => (await deployReborn(owner, contracts, { owner: owner.address, token: deployed.tokens.USDT.address, root: ethers.Wallet.createRandom().address, companies: [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address), plan })).contract;
    const a = await make();
    const b = await make();
    const free = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
    for (const c of [ a, b ]) for (const pkg of [ 1, 2, 3 ]) await (await c.placeFree(free, pkg, { gasLimit: TX_GAS })).wait();
    await (await token.mint(owner.address, price1 * 13n)).wait();
    await (await token.approve(await a.getAddress(), price1 * 13n)).wait();
    await (await a.registerFor(people.map((p) => p.address), 1, { gasLimit: 30_000_000n })).wait();
    await (await b.launchPublic()).wait();
    for (const p of people) {
        await (await token.connect(p).mint(p.address, price1)).wait();
        await (await token.connect(p).approve(await b.getAddress(), price1)).wait();
        await (await b.connect(p).register(1, { gasLimit: TX_GAS })).wait();
    }
    const diff = [];
    for (let pkg = 1; pkg <= 3; pkg++) {
        const n = Number((await a.getPackage(pkg)).positions);
        if (n !== Number((await b.getPackage(pkg)).positions)) diff.push(`pkg ${pkg} count`);
        for (let i = 0; i < n; i++) {
            const [ x, y ] = [ await a.getPosition(pkg, i), await b.getPosition(pkg, i) ];
            if (x.member !== y.member || x.parent !== y.parent || x.kind !== y.kind || x.fund !== y.fund || x.filled !== y.filled) diff.push(`pkg ${pkg} #${i}`);
        }
    }
    const [ ha, hb ] = [ await a.getHomeView(ethers.ZeroAddress, 0), await b.getHomeView(ethers.ZeroAddress, 0) ];
    if (ha.totalReferral !== hb.totalReferral || ha.totalBoardPaid !== hb.totalBoardPaid || ha.totalCompany !== hb.totalCompany) diff.push("totals");
    check("registerFor: 13 wallets in one transaction end exactly like 13 register() calls in a row", diff.length === 0, diff.slice(0, 3).join(", ") || `${Number((await a.getPackage(1)).positions)} IDs in package 1 on both`);
    await setBalance(provider, launch.owner, 0);
}
