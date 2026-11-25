/*
 * YOUR CODE (on-chain, local only). Test panel buttons for THIS project only, shown under "This project".
 * Tools every project needs (gas, test tokens, demo wallet, time) are already in the panel: dev/engine/web.
 *
 * Each button: { label, run(tools, progress) }
 *   tools     tools.wallet (active wallet), newWallet(), fundGas(address), fundToken(address, symbol, amount),
 *             tokenAs(symbol, signer), contractAs(contract, signer), skipTime(seconds), etherjs
 *   progress  (text) => shows text in the toast while it runs
 */

import { RebornContract } from "../../src/generated/contracts/rebornmatrix";
import { RebornViewsContract } from "../../src/generated/contracts/rebornviews";

// RebornMatrix's address with both ABIs: its reads run in RebornViews (through RebornMatrix's fallback)
const seen = new Set();
const Reborn = {
    address: RebornContract.address,
    abi: [ ...RebornContract.abi, ...RebornViewsContract.abi ].filter((f) => {
        const key = `${f.type}:${f.name ?? ""}:${(f.inputs ?? []).map((i) => i.type).join(",")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }),
};

/** Sponsor for new people: the active wallet when it has joined, else member #1 (the root) */
const sponsorOf = async (matrix, wallet) => {
    if (!wallet?.address) return 1n;
    const view = await matrix.getHomeView(wallet.address, 0);
    return view.isMember ? view.myId : 1n;
};

/** `count` new people join package 1 under the active wallet (or the root) */
const join = (count) => async ({ wallet, newWallet, fundGas, fundToken, tokenAs, contractAs }, progress) => {
    const reader = contractAs(Reborn, newWallet());
    if (!(await reader.getHomeView(wallet?.address ?? "0x0000000000000000000000000000000000000000", 0)).launched) throw new Error("Launch first (Owner page), then people can join.");
    const sponsor = await sponsorOf(reader, wallet);
    for (let i = 1; i <= count; i++) {
        const person = newWallet();
        const matrix = contractAs(Reborn, person);
        const price = (await matrix.getHomeView(person.address, 0)).packages[0].price;
        await fundGas(person.address);
        await fundToken(person.address, "USDT", price);
        await (await tokenAs("USDT", person).approve(RebornContract.address, price)).wait();
        await (await matrix.register(sponsor)).wait();
        progress(`${i} of ${count} joined…`);
    }
};

/** `count` new people join under the active wallet, then each buys package 2 */
const joinAndUpgrade = (count) => async (tools, progress) => {
    const { wallet, newWallet, fundGas, fundToken, tokenAs, contractAs } = tools;
    const reader = contractAs(Reborn, newWallet());
    const sponsor = await sponsorOf(reader, wallet);
    for (let i = 1; i <= count; i++) {
        const person = newWallet();
        const matrix = contractAs(Reborn, person);
        const [ first, second ] = (await matrix.getHomeView(person.address, 0)).packages;
        await fundGas(person.address);
        await fundToken(person.address, "USDT", first.price + second.price);
        await (await tokenAs("USDT", person).approve(RebornContract.address, first.price + second.price)).wait();
        await (await matrix.register(sponsor)).wait();
        await (await matrix.upgrade(2)).wait();
        progress(`${i} of ${count} joined and upgraded…`);
    }
};

/**
 * Makes the active (demo) wallet the contract owner, so the Owner page works in this browser.
 * The local chain lets us send as the deploy owner without its key (hardhat_impersonateAccount); local only.
 */
const becomeOwner = async ({ wallet, contractAs, newWallet, etherjs }, progress) => {
    if (!wallet?.address) throw new Error("Turn on the demo wallet (or connect one) first.");
    const { owner } = await contractAs(Reborn, newWallet()).getOwnerView();
    if (owner.toLowerCase() === wallet.address.toLowerCase()) return progress("This wallet is already the owner.");
    const rpc = new etherjs.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
    await rpc.send("hardhat_impersonateAccount", [ owner ]);
    try {
        const asOwner = new etherjs.Contract(RebornContract.address, [ "function transferOwnership(address newOwner) payable" ], await rpc.getSigner(owner));
        await (await asOwner.transferOwnership(wallet.address)).wait();
    } finally {
        await rpc.send("hardhat_stopImpersonatingAccount", [ owner ]);
    }
    progress("Done: this wallet is the owner. Open Owner tools in the footer.");
};

/** Three brand-new wallet addresses to paste into "Free IDs for investors" (copied to the clipboard) */
const investorAddresses = async ({ newWallet }, progress) => {
    const list = [ newWallet(), newWallet(), newWallet() ].map((w) => w.address).join("\n");
    try { await navigator.clipboard.writeText(list); } catch {}
    console.log(list);
    progress("3 new addresses copied. Paste them on the Owner page.");
};

const devActions = [
    { label: "Make me the contract owner", run: becomeOwner },
    { label: "Copy 3 investor addresses", run: investorAddresses },
    { label: "3 people join under me", run: join(3) },
    { label: "12 people join under me", run: join(12) },
    { label: "3 join under me + buy package 2", run: joinAndUpgrade(3) },
];

export { devActions };
