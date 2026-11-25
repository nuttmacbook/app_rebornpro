/*
 * YOUR CODE (on-chain, local only). Sample data for the local test chain, plus helpers the tests reuse.
 * The contract itself is deployed by the engine from dev/settings/deploy.config.mjs (same as the real deploy).
 *
 * deployed (from dev/engine/local-chain.mjs):
 *   rebornAt(deployed)   the contract at its proxy address
 *   deployed.tokens.USDT          test token from dev/settings/test-tokens.json ({ contract, address, decimals })
 */

import { ethers } from "ethers";
import { TX_GAS, setBalance } from "../engine/node.mjs";
import { rebornAt } from "./reborn.mjs";

/** Money totals [held, paidIn, referral, boardPaid, company] from the home view (same numbers the site shows) */
const totals = async (m) => {
    const v = await m.getHomeView("0x0000000000000000000000000000000000000000", 0);
    return [ v.totalHeld, v.totalIn, v.totalReferral, v.totalBoardPaid, v.totalCompany ];
};


/** A new wallet with BNB for gas */
async function newPerson(provider) {
    const person = ethers.Wallet.createRandom().connect(provider);
    await setBalance(provider, person.address, 1);
    return person;
}

/** Mints the price of `pkg` to `person` and approves exactly that */
async function payFor(deployed, person, pkg) {
    const matrix = rebornAt(deployed, person);
    const token = deployed.tokens.USDT.contract.connect(person);
    const price = (await matrix.getPackage(pkg)).price;
    await (await token.mint(person.address, price)).wait();
    await (await token.approve(deployed.addresses.RebornMatrix, price)).wait();
    return matrix;
}

/** A new member who joins package 1 under `sponsorId`, with real transactions */
async function joiner(provider, deployed, sponsorId, person = null) {
    const wallet = person ?? await newPerson(provider);
    const matrix = await payFor(deployed, wallet, 1);
    const receipt = await (await matrix.register(sponsorId, { gasLimit: TX_GAS })).wait();
    return { wallet, receipt, id: Number(await matrix.idOf(wallet.address)) };
}

/** `person` buys package `pkg` */
async function upgrader(deployed, person, pkg) {
    const matrix = await payFor(deployed, person, pkg);
    return (await matrix.upgrade(pkg, { gasLimit: TX_GAS })).wait();
}

/**
 * Called by npm run dev: 3 investors placed free in every package, launch, then `count` people
 * (LOCAL_SEED in dev/settings/local.env) join under earlier members; every third one upgrades.
 */
async function seed({ provider, deployed, count, onProgress = () => {} }) {
    const matrix = rebornAt(deployed);
    const investors = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
    const packages = Number(await matrix.packageCount());
    for (let pkg = 1; pkg <= packages; pkg++) await (await matrix.placeFree(investors, pkg, { gasLimit: TX_GAS })).wait();
    await (await matrix.launchPublic()).wait();

    const people = [];
    for (let i = 1; i <= count; i++) {
        const sponsor = people.length ? people[Math.floor(Math.random() * people.length)].id : 1;
        const member = await joiner(provider, deployed, sponsor);
        people.push(member);
        if (i % 3 === 0) await upgrader(deployed, member.wallet, 2);
        if (i % 9 === 0) await upgrader(deployed, member.wallet, 3);
        onProgress(i);
    }
}

/** Extra lines printed when npm run dev is ready */
async function summary(deployed) {
    const matrix = rebornAt(deployed);
    const [ held, paidIn ] = await totals(matrix);
    const units = (v) => ethers.formatUnits(v, deployed.tokens.USDT.decimals);
    return [
        `  Members ${await matrix.memberCount()}, waiting placements ${(await matrix.getOwnerView()).queued}`,
        `  Paid in ${units(paidIn)} USDT (test), held for reborns ${units(held)} USDT`,
    ];
}

export { newPerson, payFor, joiner, upgrader, seed, summary };
