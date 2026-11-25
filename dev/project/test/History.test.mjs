/*
 * YOUR CODE (on-chain tests). The history the contract keeps per member (getHistoryView):
 *   - every row decodes to what happened: owner-paid sign-ups, sign-ups, referral, each slot's cash and kept money, reborns
 *   - per member, referral rows add up to referralEarned, slot rows to boardEarned, new-ID rows to the IDs held
 *   - newest first, pages join up without gaps, the page size is capped, a stranger gets an empty view
 *   - the history follows the account through transferWallet
 */

import { ethers } from "ethers";
import { TX_GAS } from "../../engine/node.mjs";
import { deployReborn, withLaterPackages } from "../reborn.mjs";
import { newPerson } from "../seed.mjs";
import { planOf } from "../plan.mjs";

const NEW_ID = 0, REFERRAL = 1, SLOT = 2;
const SIGN_UP = 0, UPGRADE = 1, REBORN = 2;

/** Same layout as the comment above HistoryRow in RebornMatrix.sol (two words per row) */
const decode = (words) => {
    const rows = [];
    const bits = (v, from, size) => Number((v >> BigInt(from)) & ((1n << BigInt(size)) - 1n));
    for (let i = 0; i + 1 < words.length; i += 2) {
        const [ a, b ] = [ words[i], words[i + 1] ];
        rows.push({
            time: bits(a, 0, 40), block: bits(a, 40, 40), kind: bits(a, 80, 8), pkg: bits(a, 88, 8), slot: bits(a, 96, 8),
            idKind: bits(a, 104, 8), other: bits(a, 112, 64), index: bits(a, 176, 64),
            ref: bits(b, 0, 64), amount: (b >> 64n) & ((1n << 96n) - 1n), extra: b >> 160n,
        });
    }
    return rows;
};

export default async function (t) {
    const { provider, owner, contracts, deployed, check } = t;
    const token = deployed.tokens.USDT.contract;
    const s = t.settings.RebornMatrix;

    const root = ethers.Wallet.createRandom().address;
    const companies = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
    const { contract: matrix, address } = await deployReborn(owner, contracts, { owner: owner.address, token: deployed.tokens.USDT.address, root, companies, plan: withLaterPackages(planOf(s), deployed.tokens.USDT.decimals) });
    const price = async (pkg) => (await matrix.getPackage(pkg)).price;
    const bps = (v, b) => v * BigInt(b) / 10_000n;
    const plan = planOf(s);

    const historyOf = async (account) => {
        const first = await matrix.getHistoryView(account, 0, 100);
        let words = [ ...first.rows ];
        for (let offset = 100; offset < Number(first.total); offset += 100) words = words.concat([ ...(await matrix.getHistoryView(account, offset, 100)).rows ]);
        return { view: first, rows: decode(words) };
    };

    const pay = async (person, pkg) => {
        const p = await price(pkg);
        await (await token.connect(person).mint(person.address, p)).wait();
        await (await token.connect(person).approve(address, p)).wait();
        return matrix.connect(person);
    };
    const join = async (sponsorId) => {
        const wallet = await newPerson(provider);
        const receipt = await (await (await pay(wallet, 1)).register(sponsorId, { gasLimit: TX_GAS })).wait();
        return { wallet, receipt, id: Number(await matrix.idOf(wallet.address)) };
    };

    /* ------------------------------------ 1. before launch: the owner pays for 3 sign-ups under the root */

    const p1 = await price(1);
    const investors = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
    await (await token.connect(owner).mint(owner.address, p1 * 3n)).wait();
    await (await token.connect(owner).approve(address, p1 * 3n)).wait();
    await (await matrix.registerFor(investors, 1, { gasLimit: TX_GAS })).wait();
    const kept = plan.rebornBps.reduce((sum, b) => sum + bps(p1, b), 0n);
    const rebornPaid = kept >= p1 ? p1 : 0n;
    const inv = await historyOf(investors[0]);
    const invIds = inv.rows.filter((r) => r.kind === NEW_ID);
    check("history: an owner-paid sign-up is one new-ID row with the price", invIds.length === 1 && invIds[0].idKind === SIGN_UP && invIds[0].amount === p1 && invIds[0].pkg === 1);
    // The root's reborn takes slot 1 of the first wallet
    const invSlot = inv.rows.filter((r) => r.kind === SLOT);
    check("history: the first wallet sees the root's reborn take its slot 1", invSlot.length === 1 && invSlot[0].slot === 0 && invSlot[0].other === 1 && invSlot[0].idKind === REBORN && invSlot[0].amount === (rebornPaid ? bps(p1, plan.cashBps[0]) : 0n));
    const rootStart = (await historyOf(root)).rows;
    const rootSlots = rootStart.filter((r) => r.kind === SLOT).sort((x, y) => x.slot - y.slot);
    check("history: the root sees its 3 slots taken by the paid sign-ups, with cash and kept money", rootSlots.length === 3 && rootSlots.every((r, i) => r.idKind === SIGN_UP && r.amount === bps(p1, plan.cashBps[i]) && r.extra === bps(p1, plan.rebornBps[i])));
    check("history: the root gets a referral row for each of them", rootStart.filter((r) => r.kind === REFERRAL).length === 3);
    const rootReborn = rootStart.find((r) => r.kind === NEW_ID && r.idKind === REBORN);
    check("history: the root's reborn is a new-ID row from board 0, paid from the money kept", Boolean(rootReborn) && rootReborn.amount === rebornPaid && rootReborn.extra === 0n);

    /* ------------------------------------ 2. A joins, B C D fill A's board */

    await (await matrix.launchPublic()).wait();
    const A = await join(1);
    const aJoin = (await historyOf(A.wallet.address)).rows[0];
    const aPos = await matrix.getPosition(1, aJoin.index);
    const aboveOwner = Number((await matrix.getPosition(1, aJoin.ref)).member);
    check("history: a sign-up row shows the price, the ID above, its owner and the slot", aJoin.kind === NEW_ID && aJoin.idKind === SIGN_UP && aJoin.amount === p1 && aJoin.index === Number((await matrix.positionsOf(A.id, 1))[0]) && aJoin.ref === Number(aPos.parent) && aJoin.other === aboveOwner);
    const aBlock = A.receipt.blockNumber;
    const aBlockTime = (await provider.getBlock(aBlock)).timestamp;
    check("history: time and block are the transaction's", aJoin.block === aBlock && aJoin.time === aBlockTime);
    const rootRef = (await historyOf(root)).rows[0];
    check("history: the sponsor gets a referral row for that sign-up", rootRef.kind === REFERRAL && rootRef.other === A.id && rootRef.amount === bps(p1, plan.referralBps) && rootRef.idKind === SIGN_UP);

    const [ B, C, D ] = [ await join(A.id), await join(A.id), await join(A.id) ];
    const a = (await historyOf(A.wallet.address)).rows;
    const aBoard = Number((await matrix.positionsOf(A.id, 1))[0]);
    const slots = a.filter((r) => r.kind === SLOT && r.index === aBoard).sort((x, y) => x.slot - y.slot);
    const slotOk = slots.length === 3 && slots.every((r, i) => r.amount === bps(p1, plan.cashBps[i]) && r.extra === bps(p1, plan.rebornBps[i]) && r.other === [ B, C, D ][i].id);
    check("history: each slot row shows who took it, the cash and the money kept for Reborn", slotOk, slots.map((r) => `${r.slot}:${r.amount}/${r.extra}`).join(" "));
    const reborn = a.find((r) => r.kind === NEW_ID && r.idKind === REBORN);
    check("history: the full board's reborn row is paid one price by the money kept, from that board", Boolean(reborn) && reborn.amount === p1 && reborn.extra === BigInt(aBoard));
    check("history: newest first", a[0].kind === NEW_ID && a[0].idKind === REBORN && a.every((r, i) => i === 0 || a[i - 1].time >= r.time));
    check("history: referral rows for the 3 people A brought", a.filter((r) => r.kind === REFERRAL).map((r) => r.other).sort().join() === [ B.id, C.id, D.id ].sort().join());

    /* ------------------------------------ 3. many members: rows add up to the totals */

    const people = [ A, B, C, D ];
    for (let i = 0; i < 30; i++) {
        const sponsor = people[Math.floor(Math.random() * people.length)].id;
        const m = await join(sponsor);
        people.push(m);
        if (i % 3 === 0) await (await (await pay(m.wallet, 2)).upgrade(2, { gasLimit: TX_GAS })).wait();
    }
    const upgraded = people.find((p) => p !== A && p !== B && p !== C && p !== D);
    const up = (await historyOf(upgraded.wallet.address)).rows.find((r) => r.kind === NEW_ID && r.idKind === UPGRADE);
    check("history: an upgrade row shows package 2 and its price", Boolean(up) && up.pkg === 2 && up.amount === await price(2));

    const wrong = [];
    for (const who of [ { wallet: { address: root }, id: 1 }, ...people ]) {
        const { view, rows } = await historyOf(who.wallet.address);
        const referral = rows.filter((r) => r.kind === REFERRAL).reduce((x, r) => x + r.amount, 0n);
        const board = rows.filter((r) => r.kind === SLOT).reduce((x, r) => x + r.amount, 0n);
        const held = (await Promise.all([ 1, 2, 3 ].map((pkg) => matrix.positionsOf(who.id, pkg)))).flat().map(Number);
        const made = rows.filter((r) => r.kind === NEW_ID).map((r) => r.index);
        const isRoot = who.id === 1;
        // The root's first ID in each package comes with the contract, not with a row
        const expected = isRoot ? held.length - 3 : held.length;
        if (referral !== view.referralEarned) wrong.push(`#${who.id} referral`);
        if (board !== view.boardEarned) wrong.push(`#${who.id} board`);
        if (made.length !== expected) wrong.push(`#${who.id} IDs ${made.length}/${expected}`);
        if (Number(view.total) !== rows.length) wrong.push(`#${who.id} total`);
    }
    check(`history: for all ${people.length + 1} members, rows add up to referral earned, board earned and IDs held`, wrong.length === 0, wrong.slice(0, 5).join(", "));

    /* ------------------------------------ 4. pages, cap, strangers */

    const full = (await historyOf(root)).rows;
    const pageA = decode([ ...(await matrix.getHistoryView(root, 0, 5)).rows ]);
    const pageB = decode([ ...(await matrix.getHistoryView(root, 5, 5)).rows ]);
    check("history: pages join up with no gap", JSON.stringify([ ...pageA, ...pageB ], (k, v) => (typeof v === "bigint" ? String(v) : v)) === JSON.stringify(full.slice(0, 10), (k, v) => (typeof v === "bigint" ? String(v) : v)));
    const big = await matrix.getHistoryView(root, 0, 1000);
    check("history: one page holds at most 100 rows", big.rows.length === Math.min(100, full.length) * 2, `${full.length} rows`);
    const past = await matrix.getHistoryView(root, full.length + 5, 10);
    check("history: a page past the end is empty", past.rows.length === 0 && Number(past.total) === full.length);
    const stranger = await matrix.getHistoryView(ethers.Wallet.createRandom().address, 0, 10);
    check("history: a wallet that never joined has no rows", stranger.memberId === 0n && stranger.total === 0n && stranger.rows.length === 0);

    /* ------------------------------------ 5. moving the account */

    const mover = people[5];
    const before = await historyOf(mover.wallet.address);
    const newWallet = ethers.Wallet.createRandom().address;
    await (await matrix.connect(mover.wallet).transferWallet(newWallet, { gasLimit: TX_GAS })).wait();
    const after = await historyOf(newWallet);
    check("history: transferWallet keeps the history with the account", after.rows.length === before.rows.length && after.view.memberId === BigInt(mover.id) && (await matrix.getHistoryView(mover.wallet.address, 0, 10)).total === 0n);

    /* ------------------------------------ 6. cost */

    t.gas("register (with history rows)", (await join(A.id)).receipt);
    const gas = await provider.estimateGas({ to: address, data: matrix.interface.encodeFunctionData("getHistoryView", [ root, 0, 100 ]) });
    check("history: reading a full page stays light", gas < 3_000_000n, `${gas} gas for 100 rows`);
}
