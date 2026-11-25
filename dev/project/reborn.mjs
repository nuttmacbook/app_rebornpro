/*
 * YOUR CODE (on-chain helpers for scripts and tests). RebornMatrix answers its page views and small getters through
 * RebornViews (same storage, called by its fallback), so scripts talk to one address with both ABIs merged.
 */

import { ethers } from "ethers";
import { deployContract, deployProxied } from "../engine/node.mjs";

const fragmentsOf = (x) => (x?.interface ? x.interface.fragments : (x?.abi ?? x ?? []));

/** Both ABIs in one list, each function, event and error once */
const mergeAbi = (...parts) => {
    const seen = new Set();
    const out = [];
    for (const raw of parts.flatMap(fragmentsOf)) {
        const f = ethers.Fragment.from(raw);
        const key = `${f.type}:${typeof f.format === "function" ? f.format("sighash") : ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(f);
    }
    return out;
};

/**
 * `main` (RebornMatrix at the proxy) with RebornViews' reads added, same address and signer.
 * `views` = the compiled RebornViews, its contract object, or its ABI.
 */
const withViews = (main, views) => new ethers.Contract(main.target, mergeAbi(main, views), main.runner);

/**
 * A fresh RebornViews + RebornMatrix behind a proxy, initialized with these arguments (the views address is added).
 * @returns {{ contract, proxy, address, views }} contract = merged ABI at the proxy
 */
async function deployReborn(signer, contracts, { owner, token, root, companies, plan }) {
    const views = await deployContract(signer, contracts.RebornViews);
    const viewsAddress = await views.getAddress();
    const made = await deployProxied(signer, contracts, "RebornMatrix", "initialize", owner, token, root, companies, viewsAddress, plan);
    return { ...made, contract: withViews(made.contract, contracts.RebornViews), views: viewsAddress };
}

/** RebornMatrix from a local deploy (seed, devActions-like scripts), merged with RebornViews */
const rebornAt = (deployed, signer = undefined) => withViews(deployed.at("RebornMatrix", signer), deployed.at("RebornViews"));

/**
 * Tests only: the packages the owner adds after go-live (Owner page, Add package), in whole tokens.
 * The deploy has package 10 only (PACKAGE_PRICES); tests that need an upgrade path add these.
 */
const LATER_PRICES = [ "50", "100" ];
const laterPrices = (decimals) => LATER_PRICES.map((p) => ethers.parseUnits(p, decimals));

/** `plan` with the later packages already in it (for a fresh test contract) */
const withLaterPackages = (plan, decimals) => ({ ...plan, prices: [ ...plan.prices, ...laterPrices(decimals) ] });

export { mergeAbi, withViews, deployReborn, rebornAt, laterPrices, withLaterPackages };
