/*
 * SETTINGS: what gets deployed, in order. The same list runs on the local test chain (npm run dev, npm test)
 * and on a real chain (npm run deploy:live). Values come from dev/settings/contracts/RebornMatrix.env.
 *
 * ctx = { owner, deployer, addresses, settings, encode(contract, fn, args), at(contract, address) }
 */

import { ethers } from "ethers";
import { proxied, plain } from "../engine/deploy-steps.mjs";
import { planOf, companyWalletsOf } from "../project/plan.mjs";

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export default {
    // Contracts that must already exist on the target chain before deploying
    requiredCode: (settings) => ({
        "RebornMatrix token (TOKEN_ADDRESS)": settings.RebornMatrix.TOKEN_ADDRESS,
    }),

    contracts: [
        // Read-only half of RebornMatrix (page views); RebornMatrix runs it on its own storage
        plain({ name: "RebornViews" }),

        ...proxied({
            name: "RebornMatrix",
            init: (ctx) => {
                const s = ctx.settings.RebornMatrix;
                return [ ctx.owner, s.TOKEN_ADDRESS, s.ROOT_WALLET, companyWalletsOf(s), ctx.addresses.RebornViews, planOf(s) ];
            },
            readBack: async (contract, ctx) => {
                // Reads go to the proxy with RebornViews' ABI (the proxy's fallback runs them)
                const reads = ctx.at("RebornViews", contract.target);
                const plan = await reads.getPlanView();
                const settings = await reads.getSettings();
                const owner = await reads.getOwnerView();
                return {
                    owner: await contract.owner(),
                    token: await contract.token(),
                    views: await contract.views(),
                    root: owner.root,
                    companies: [ ...owner.companies ],
                    tokenDecimals: Number(plan.tokenDecimals),
                    prices: plan.packages.map((p) => String(p.price)),
                    referralBps: Number(settings.referralBps),
                };
            },
            check: (state, ctx) => {
                const s = ctx.settings.RebornMatrix;
                const plan = planOf(s);
                if (!same(state.owner, ctx.owner)) return `RebornMatrix owner is ${state.owner}, expected ${ctx.owner}.`;
                if (!same(state.token, s.TOKEN_ADDRESS)) return "RebornMatrix token differs from TOKEN_ADDRESS.";
                if (!same(state.root, s.ROOT_WALLET)) return "Root wallet differs from ROOT_WALLET.";
                const wallets = companyWalletsOf(s);
                if (!wallets.every((w, i) => same(state.companies[i], w))) return "Company wallets differ from PRODUCT_WALLET, MARKETING_WALLET, TREASURY_WALLET.";
                if (state.tokenDecimals !== Number(s.TOKEN_DECIMALS)) return `The token has ${state.tokenDecimals} decimals but TOKEN_DECIMALS is ${s.TOKEN_DECIMALS}.`;
                if (state.prices.join(",") !== plan.prices.map(String).join(",")) return "Package prices differ from PACKAGE_PRICES.";
                if (state.referralBps !== Number(plan.referralBps)) return "Referral share differs from REFERRAL_PERCENT.";
                if (!same(state.views, ctx.addresses.RebornViews)) return "RebornMatrix does not point at the RebornViews just deployed.";
                return true;
            },
        }),
    ],
};
