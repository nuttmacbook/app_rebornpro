/*
 * YOUR CODE (on-chain, local only). Sample data for the local test chain, plus helpers the tests reuse.
 * The contract itself is deployed by the engine from dev/settings/deploy.config.mjs (same as the real deploy).
 *
 * goLiveSetup() replays dev/settings/launch.json (owner wallet, paid sign-ups) like the owner will on the real chain.
 *
 * deployed (from dev/engine/local-chain.mjs):
 *   rebornAt(deployed)   the contract at its proxy address
 *   deployed.tokens.USDT          test token from dev/settings/test-tokens.json ({ contract, address, decimals })
 */

import { ethers } from "ethers";
import { TX_GAS, setBalance } from "../engine/node.mjs";
import { rebornAt } from "./reborn.mjs";
import { launchOf } from "./plan.mjs";

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
 * Called by npm run dev when LOCAL_SEED > 0. First the go-live setup from dev/settings/launch.json, exactly as the
 * owner will do it on the real chain (README section 12):
 *   1. the contract's owner becomes launch.json's owner wallet (this local chain lets us send as it without its key)
 *   2. paid sign-ups of launch.json's wallets into package 1 (the owner wallet pays), in order
 * LOCAL_SEED = 1 stops there, not launched: the state on the day before Launch. Above 1: launch, then LOCAL_SEED - 1
 * random people join under earlier members (every third upgrades, when package 2 has been added).
 */
async function seed({ provider, deployed, count, onProgress = () => {} }) {
    const matrix = rebornAt(deployed);
    const launch = launchOf(deployed.settings.RebornMatrix);
    await goLiveSetup({ provider, deployed, launch, isLaunched: count > 1 });
    onProgress(1);

    const people = [];
    for (let i = 2; i <= count; i++) {
        const sponsor = people.length ? people[Math.floor(Math.random() * people.length)].id : 1;
        const member = await joiner(provider, deployed, sponsor);
        people.push(member);
        const packages = Number(await matrix.packageCount());
        if (i % 3 === 0 && packages >= 2) await upgrader(deployed, member.wallet, 2);
        if (i % 9 === 0 && packages >= 3) await upgrader(deployed, member.wallet, 3);
        onProgress(i);
    }
    return matrix;
}

/** Steps 1 and 2 above, sent as launch.owner (impersonated on the local chain), then Launch when asked */
async function goLiveSetup({ provider, deployed, launch, isLaunched = false }) {
    const matrix = rebornAt(deployed);
    if ((await matrix.owner()).toLowerCase() !== launch.owner.toLowerCase()) await (await matrix.transferOwnership(launch.owner)).wait();
    await setBalance(provider, launch.owner, 10);
    await provider.send("hardhat_impersonateAccount", [ launch.owner ]);
    try {
        // Not provider.getSigner(): hardhat node does not list impersonated accounts in eth_accounts ("invalid account")
        const owner = new ethers.JsonRpcSigner(provider, launch.owner);
        const asOwner = matrix.connect(owner);
        if (launch.paid.length) {
            const total = (await matrix.getPackage(1)).price * BigInt(launch.paid.length);
            const token = deployed.tokens.USDT.contract.connect(owner);
            await (await token.mint(launch.owner, total)).wait();
            await (await token.approve(deployed.addresses.RebornMatrix, total)).wait();
            await (await asOwner.registerFor(launch.paid, launch.sponsor, { gasLimit: 30_000_000n })).wait();
        }
        if (isLaunched) await (await asOwner.launchPublic()).wait();
    } finally {
        await provider.send("hardhat_stopImpersonatingAccount", [ launch.owner ]);
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

export { newPerson, payFor, joiner, upgrader, seed, goLiveSetup, summary };
