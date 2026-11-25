/*
 * SETTINGS: what gets deployed, in order. The same list runs on the local test chain (npm run dev, npm test)
 * and on a real chain (npm run deploy:live). Values come from dev/settings/contracts/RebornMatrix.env.
 *
 * ctx = { owner, deployer, addresses, settings, encode(contract, fn, args), at(contract, address) }
 */

import { ethers } from "ethers";
import { proxied } from "../engine/deploy-steps.mjs";
import { planOf, companyWalletsOf } from "../project/plan.mjs";

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export default {
    // Contracts that must already exist on the target chain before deploying
    requiredCode: (settings) => ({
        "RebornMatrix token (TOKEN_ADDRESS)": settings.RebornMatrix.TOKEN_ADDRESS,
    }),

    contracts: [
        ...proxied({
            name: "RebornMatrix",
            init: (ctx) => {
                const s = ctx.settings.RebornMatrix;
                return [ ctx.owner, s.TOKEN_ADDRESS, s.ROOT_WALLET, companyWalletsOf(s), planOf(s) ];
            },
            readBack: async (contract) => {
                const plan = await contract.getPlanView();
                const settings = await contract.getSettings();
                return {
                    owner: await contract.owner(),
                    token: await contract.token(),
                    root: (await contract.getOwnerView()).root,
                    companies: [ ...(await contract.getOwnerView()).companies ],
                    tokenDecimals: Number(plan.tokenDecimals),
                    prices: plan.packages.map((p) => String(p.price)),
                    referralBps: Number(settings.referralBps),
                    placement: Number(settings.placement),
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
                if (state.placement !== Number(plan.placement)) return "Placement mode differs from PLACEMENT.";
                return true;
            },
        }),
    ],
};
