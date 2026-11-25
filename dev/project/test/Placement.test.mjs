/*
 * YOUR CODE (on-chain tests). Where IDs go, on fresh copies of the contract:
 *   - the example from the marketing picture, in all PLACEMENT modes (MIXED, CURRENT, FIRST)
 *   - MIXED: once ID 1's 3 + 9 slots are full, the sponsor's next people go below 1.1
 *   - an upgrade looks up the sponsor line for a place, while the referral stays with the sponsor from sign-up
 *   - a board with free IDs completed by a paid one (reborn for free, kept money to the company)
 *   - a 400-level deep line: gas per sign-up stays flat
 */

import { ethers } from "ethers";
import { TX_GAS, deployProxied } from "../../engine/node.mjs";
import { newPerson } from "../seed.mjs";
import { planOf, PLACE } from "../plan.mjs";

export default async function (t) {
    const { provider, owner, contracts, deployed, check } = t;
    const token = deployed.tokens.USDT.contract;
    const s = t.settings.RebornMatrix;

    /** A fresh contract with the .env plan, a given link mode, new root/company wallets, launched or not */
    const fresh = async ({ link, launch = true }) => {
        const root = ethers.Wallet.createRandom().address;
        const companies = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
        const plan = { ...planOf(s), placement: BigInt(link) };
        const { contract, address } = await deployProxied(owner, contracts, "RebornMatrix", "initialize", owner.address, deployed.tokens.USDT.address, root, companies, plan);
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

    const picture = async (link) => {
        const c = await fresh({ link });
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

    const first = await picture(PLACE.FIRST);
    check("picture: B, C, D take A's 3 slots", first.ok1);
    check("picture: A's Reborn (1.1) goes below B, inside A's own team", first.ok2);
    check("FIRST mode: A's next 3 people go below D, as in the picture", first.parents.every((p) => p === first.d), first.parents.join(","));

    const current = await picture(PLACE.CURRENT);
    const aNow = await idsOf(current.c, 1, current.A.id);
    check("CURRENT mode: same start (B, C, D, then 1.1 below B)", current.ok1 && current.ok2);
    check("CURRENT mode: A's next people go below A's newest ID (1.1, then 1.2)", current.parents[0] === aNow[1] && current.parents.every((p) => aNow.slice(1).includes(p)), `parents ${current.parents.join(",")}, A's IDs ${aNow.join(",")}`);

    const layered = await picture(PLACE.MIXED);
    check("MIXED mode: same start (B, C, D, then 1.1 below B)", layered.ok1 && layered.ok2);
    check("MIXED mode: A's next 3 people go below D, ID 1's 9 slots still had room", layered.parents.every((p) => p === layered.d), layered.parents.join(","));
    const level2 = async (c, top) => {
        const p = await c.matrix.getPosition(1, top);
        const kids = await Promise.all(p.kids.slice(0, Number(p.filled)).map((k) => c.matrix.getPosition(1, k)));
        return kids.reduce((n, k) => n + Number(k.filled), 0);
    };
    check("MIXED mode: ID 1 now has all 3 + 9 slots full", Number((await layered.c.matrix.getPosition(1, layered.a[0])).filled) === 3 && (await level2(layered.c, layered.a[0])) === 9);
    const next = [ await join(layered.c, layered.A.id), await join(layered.c, layered.A.id) ];
    const nextParents = await Promise.all(next.map((p) => parentOf(layered.c, 1, p.id)));
    check("MIXED mode: then A's next people go below A's 1.1", nextParents.every((p) => p === layered.a[1]), `parents ${nextParents.join(",")}, 1.1 = ${layered.a[1]}`);

    /* ------------------------------------ 2. upgrade: place near the sponsor line, referral to the sponsor from sign-up */

    const up = await fresh({ link: PLACE.CURRENT });
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
    check("upgrade: once the sponsor has the package, the next one goes below the sponsor's newest ID", (await parentOf(up, 2, Y.id)) === aTwo[aTwo.length - 1]);

    // MIXED: an upgrade uses the same walk over the sponsor's IDs in that package
    const upMixed = await fresh({ link: PLACE.MIXED });
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
    check("MIXED upgrade: 3 go below the sponsor's first ID in that package, then into its 9", kidParents.slice(0, 3).every((p) => p === a2[0]) && kidParents[3] !== a2[0], kidParents.join(","));

    /* ------------------------------------ 3. free IDs then a paid one complete the root's board */

    const mixed = await fresh({ link: PLACE.CURRENT, launch: false });
    await (await mixed.matrix.placeFree([ ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address ], 1)).wait();
    await (await mixed.matrix.launchPublic()).wait();
    const M = await join(mixed, 1);
    const done = M.receipt.logs.map((l) => { try { return mixed.matrix.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "BoardCompleted");
    const price = (await mixed.matrix.getPackage(1)).price;
    const plan = planOf(s);
    const companyTotal = plan.companyBps.reduce((a, b) => a + b, 0n);
    const expectCompany = price * companyTotal / 10_000n + price * plan.rebornBps[2] / 10_000n;
    check("mixed board: completed by a paid ID is reborn for free", done && done.args.isPaid === false);
    const got = await Promise.all(mixed.companies.map((w) => token.balanceOf(w)));
    check("mixed board: the money it kept goes to the company wallets", got.reduce((a, b) => a + b, 0n) === expectCompany, got.map((g) => ethers.formatUnits(g, 18)).join(" / "));
    check("mixed board: split 50 / 25 / 25 between product, marketing, treasury", got[0] === expectCompany / 2n && got[1] === expectCompany / 4n && got[2] === expectCompany - got[0] - got[1]);
    check("mixed board: the root still got its cash and the referral", (await token.balanceOf(mixed.root)) === price * (plan.cashBps[2] + plan.referralBps) / 10_000n);
    const [ held ] = await mixed.matrix.getTotals();
    check("mixed board: nothing left in the contract", held === 0n && (await token.balanceOf(mixed.address)) === 0n);

    /* ------------------------------------ 3b. the planned start: 3 free IDs under the root in every package */

    const start = await fresh({ link: PLACE.MIXED, launch: false });
    const investors = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
    for (let pkg = 1; pkg <= 3; pkg++) await (await start.matrix.placeFree(investors, pkg)).wait();
    const rootBefore = await Promise.all([ 1, 2, 3 ].map((pkg) => start.matrix.positionsOf(1, pkg)));
    check("planned start: the root's board in every package is reborn (for free) before launch", rootBefore.every((l) => l.length === 2));
    const rebornSlot = await start.matrix.getPosition(1, rootBefore[0][1]);
    const inv1 = await start.matrix.idOf(investors[0]);
    check("planned start: the root's free Reborn takes slot 1 of investor 1 (slot 1 keeps nothing for Reborn)", Number(rebornSlot.parent) === Number((await start.matrix.positionsOf(inv1, 1))[0]));
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
    const completed = await start.matrix.queryFilter(start.matrix.filters.BoardCompleted(), launchBlock + 1);
    const short = completed.filter((e) => e.args.isPaid === false);
    check("planned start: after launch every board completes with exactly one price kept (none short)", completed.length > 0 && short.length === 0, `${completed.length} boards completed, ${short.length} short`);
    const freeAfter = (await start.matrix.queryFilter(start.matrix.filters.Placed(), launchBlock + 1)).filter((e) => Number(e.args.kind) === 3);
    check("planned start: no free ID is placed after launch", freeAfter.length === 0);
    const [ startHeld ] = await start.matrix.getTotals();
    check("planned start: money still adds up (held = token balance)", startHeld === (await token.balanceOf(start.address)));

    /* ------------------------------------ 4. a 400-level deep line */

    const deep = await fresh({ link: PLACE.CURRENT });
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
