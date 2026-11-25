/*
 * YOUR CODE (on-chain tests). Where IDs go, on fresh copies of the contract:
 *   - the example from the marketing picture
 *   - once ID 1's 3 + 9 slots are full, the sponsor's next people go below 1.1
 *   - an upgrade looks up the sponsor line for a place, while the referral stays with the sponsor from sign-up
 *   - the planned start: the owner pays for 3 sign-ups under the root; every board completes with one price kept
 *   - a 400-level deep line: gas per sign-up stays flat
 */

import { ethers } from "ethers";
import { TX_GAS } from "../../engine/node.mjs";
import { deployReborn, withLaterPackages } from "../reborn.mjs";
import { newPerson } from "../seed.mjs";
import { planOf } from "../plan.mjs";

/** Money totals [held, paidIn, referral, boardPaid, company] from the home view (same numbers the site shows) */
const totals = async (m) => {
    const v = await m.getHomeView("0x0000000000000000000000000000000000000000", 0);
    return [ v.totalHeld, v.totalIn, v.totalReferral, v.totalBoardPaid, v.totalCompany ];
};


export default async function (t) {
    const { provider, owner, contracts, deployed, check } = t;
    const token = deployed.tokens.USDT.contract;
    const s = t.settings.RebornMatrix;

    /** A fresh contract with the .env plan, new root/company wallets, launched or not */
    const fresh = async ({ launch = true } = {}) => {
        const root = ethers.Wallet.createRandom().address;
        const companies = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
        const { contract, address } = await deployReborn(owner, contracts, { owner: owner.address, token: deployed.tokens.USDT.address, root, companies, plan: withLaterPackages(planOf(s), deployed.tokens.USDT.decimals) });
        if (launch) await (await contract.launchPublic()).wait();
        return { matrix: contract, address, root, companies };
    };

    /** `sponsorId` brings a new member into package 1 */
    const join = async (c, sponsorId) => {
        const person = await newPerson(provider);
        const price = (await c.matrix.getPackage(1)).price;
        await (await token.connect(person).mint(person.address, price)).wait();
        await (await token.connect(person).approve(c.address, price)).wait();
        const receipt = await (await c.matrix.connect(person).register(sponsorId, { gasLimit: TX_GAS })).wait();
        return { wallet: person, id: Number(await c.matrix.idOf(person.address)), receipt };
    };

    const buy = async (c, person, pkg) => {
        const price = (await c.matrix.getPackage(pkg)).price;
        await (await token.connect(person).mint(person.address, price)).wait();
        await (await token.connect(person).approve(c.address, price)).wait();
        return (await c.matrix.connect(person).upgrade(pkg, { gasLimit: TX_GAS })).wait();
    };

    const parentOf = async (c, pkg, id, n = 0) => {
        const list = await c.matrix.positionsOf(id, pkg);
        return Number((await c.matrix.getPosition(pkg, list[n])).parent);
    };
    const idsOf = async (c, pkg, id) => (await c.matrix.positionsOf(id, pkg)).map(Number);

    /* ------------------------------------ 1. the picture: A brings B C D, B brings 2, C brings 3, A brings 3 more */

    const picture = async () => {
        const c = await fresh();
        const A = await join(c, 1);
        const [ B, C, D ] = [ await join(c, A.id), await join(c, A.id), await join(c, A.id) ];
        const a = await idsOf(c, 1, A.id);
        const b = (await idsOf(c, 1, B.id))[0];
        const cc = (await idsOf(c, 1, C.id))[0];
        const d = (await idsOf(c, 1, D.id))[0];
        const ok1 = (await parentOf(c, 1, B.id)) === a[0] && (await parentOf(c, 1, D.id)) === a[0];
        const ok2 = a.length === 2 && Number((await c.matrix.getPosition(1, a[1])).parent) === b;
        await join(c, B.id); await join(c, B.id);
        for (let i = 0; i < 3; i++) await join(c, C.id);
        const late = [ await join(c, A.id), await join(c, A.id), await join(c, A.id) ];
        const parents = await Promise.all(late.map((p) => parentOf(c, 1, p.id)));
        return { c, A, a, b, cc, d, ok1, ok2, parents };
    };

    const layered = await picture();
    check("picture: B, C, D take A's 3 slots", layered.ok1);
    check("picture: A's Reborn (1.1) goes below B, inside A's own team", layered.ok2);
    check("picture: A's next 3 people go below D, ID 1's 9 slots still had room", layered.parents.every((p) => p === layered.d), layered.parents.join(","));
    const level2 = async (c, top) => {
        const p = await c.matrix.getPosition(1, top);
        const kids = await Promise.all(p.kids.slice(0, Number(p.filled)).map((k) => c.matrix.getPosition(1, k)));
        return kids.reduce((n, k) => n + Number(k.filled), 0);
    };
    check("placement: ID 1 now has all 3 + 9 slots full", Number((await layered.c.matrix.getPosition(1, layered.a[0])).filled) === 3 && (await level2(layered.c, layered.a[0])) === 9);
    const next = [ await join(layered.c, layered.A.id), await join(layered.c, layered.A.id) ];
    const nextParents = await Promise.all(next.map((p) => parentOf(layered.c, 1, p.id)));
    check("placement: then A's next people go below A's 1.1", nextParents.every((p) => p === layered.a[1]), `parents ${nextParents.join(",")}, 1.1 = ${layered.a[1]}`);

    /* ------------------------------------ 2. upgrade: place near the sponsor line, referral to the sponsor from sign-up */

    const up = await fresh();
    const A = await join(up, 1);
    const X = await join(up, A.id);
    const r = await buy(up, X.wallet, 2);
    const referral = r.logs.map((l) => { try { return up.matrix.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "ReferralPaid");
    check("upgrade: sponsor without the package -> placed below the next sponsor up (root)", (await parentOf(up, 2, X.id)) === 0);
    check("upgrade: the referral still goes to the sponsor from sign-up", referral?.args?.to === A.wallet.address, ethers.formatUnits(referral?.args?.amount ?? 0n, deployed.tokens.USDT.decimals));
    await buy(up, A.wallet, 2);
    const Y = await join(up, A.id);
    await buy(up, Y.wallet, 2);
    const aTwo = await idsOf(up, 2, A.id);
    check("upgrade: once the sponsor has the package, the next one goes below the sponsor's ID in it", (await parentOf(up, 2, Y.id)) === aTwo[0]);

    // An upgrade uses the same walk over the sponsor's IDs in that package
    const upMixed = await fresh();
    const A2 = await join(upMixed, 1);
    await buy(upMixed, A2.wallet, 2);
    const kids = [];
    for (let i = 0; i < 4; i++) {
        const k = await join(upMixed, A2.id);
        await buy(upMixed, k.wallet, 2);
        kids.push(k);
    }
    const a2 = await idsOf(upMixed, 2, A2.id);
    const kidParents = await Promise.all(kids.map((k) => parentOf(upMixed, 2, k.id)));
    check("upgrade: 3 go below the sponsor's first ID in that package, then into its 9", kidParents.slice(0, 3).every((p) => p === a2[0]) && kidParents[3] !== a2[0], kidParents.join(","));

    /* ------------------------------------ 3. the planned start: the owner pays for 3 sign-ups under the root */

    const start = await fresh({ launch: false });
    const plan = planOf(s);
    const price = (await start.matrix.getPackage(1)).price;
    const investors = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
    await (await token.connect(owner).mint(owner.address, price * 3n)).wait();
    await (await token.connect(owner).approve(start.address, price * 3n)).wait();
    const setupBlock = await provider.getBlockNumber();
    await (await start.matrix.registerFor(investors, 1, { gasLimit: TX_GAS })).wait();
    const rootBefore = await start.matrix.positionsOf(1, 1);
    check("planned start: the 3 paid sign-ups complete the root's board, the root is reborn before launch", rootBefore.length === 2);
    const rebornSlot = await start.matrix.getPosition(1, rootBefore[1]);
    const inv1 = await start.matrix.idOf(investors[0]);
    check("planned start: the root's Reborn takes slot 1 of the first wallet", Number(rebornSlot.parent) === Number((await start.matrix.positionsOf(inv1, 1))[0]));
    const rootPaid = price * (plan.cashBps[0] + plan.cashBps[1] + plan.cashBps[2] + 3n * plan.referralBps) / 10_000n;
    check("planned start: the root got the cash of its 3 slots and 3 referrals", (await token.balanceOf(start.root)) >= rootPaid, ethers.formatUnits(await token.balanceOf(start.root), 18));
    const launchBlock = await provider.getBlockNumber();
    await (await start.matrix.launchPublic()).wait();
    const people = [];
    for (let i = 0; i < 45; i++) {
        const sponsor = people.length && i % 3 ? people[Math.floor(Math.random() * people.length)].id : 1 + (i % 4 === 0 ? 0 : Number(await start.matrix.idOf(investors[i % 3])) - 1);
        const p = await join(start, sponsor);
        people.push(p);
        if (i % 3 === 0) await buy(start, p.wallet, 2);
        if (i % 9 === 0) await buy(start, p.wallet, 3);
    }
    const completed = await start.matrix.queryFilter(start.matrix.filters.BoardCompleted(), setupBlock + 1);
    const short = completed.filter((e) => e.args.isPaid === false);
    check("planned start: every board completes with one price kept, no free reborn (all entries pay)", completed.length > 0 && short.length === 0, `${completed.length} boards completed, ${short.length} short`);
    const afterLaunch = completed.filter((e) => e.blockNumber > launchBlock);
    check("planned start: boards keep completing after launch", afterLaunch.length > 0, `${afterLaunch.length} after launch`);
    const [ startHeld ] = await totals(start.matrix);
    check("planned start: money still adds up (held = token balance)", startHeld === (await token.balanceOf(start.address)));

    /* ------------------------------------ 4. a 400-level deep line */

    const deep = await fresh();
    let sponsor = 1;
    const gas = [];
    for (let i = 0; i < 400; i++) {
        const m = await join(deep, sponsor);
        gas.push(Number(m.receipt.gasUsed));
        t.gas("register (400-level line)", m.receipt);
        sponsor = m.id;
    }
    const early = gas.slice(10, 50).reduce((a, b) => a + b, 0) / 40;
    const late = gas.slice(-40).reduce((a, b) => a + b, 0) / 40;
    check("deep line: gas per sign-up stays flat from level 10 to 400", late < early * 1.1, `${Math.round(early).toLocaleString()} -> ${Math.round(late).toLocaleString()}`);
}
