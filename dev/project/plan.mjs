/*
 * YOUR CODE (on-chain). Turns dev/settings/contracts/RebornMatrix.env into the PlanInput struct initialize() takes.
 * Stops with the setting's name when a value is wrong, before anything is sent.
 */

import { ethers } from "ethers";

const fail = (key, why) => { throw new Error(`dev/settings/contracts/RebornMatrix.env: ${key} ${why}`); };

const list = (s, key) => String(s[key] ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Percent text ("30" or "2.5") to basis points */
const bps = (key, text) => {
    if (!/^\d+(\.\d{1,2})?$/.test(text)) fail(key, `has "${text}", expected a percent like 30 or 2.5.`);
    return Math.round(Number(text) * 100);
};

// The company share is split between these wallets, in this order (the contract's order too)
const COMPANY_KEYS = [ "PRODUCT", "MARKETING", "TREASURY" ];

/** The three company wallets from settings: product, marketing, treasury */
const companyWalletsOf = (s) => COMPANY_KEYS.map((name) => String(s[`${name}_WALLET`] ?? ""));

/** @returns {object} PlanInput for RebornMatrix.initialize */
function planOf(s) {
    const decimals = Number(s.TOKEN_DECIMALS);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) fail("TOKEN_DECIMALS", "must be a whole number.");

    const prices = list(s, "PACKAGE_PRICES").map((p) => {
        if (!/^\d+(\.\d+)?$/.test(p) || Number(p) <= 0) fail("PACKAGE_PRICES", `has "${p}", expected prices above 0.`);
        return ethers.parseUnits(p, decimals);
    });
    if (!prices.length) fail("PACKAGE_PRICES", "is empty.");

    const cash = list(s, "SLOT_CASH_PERCENT").map((p) => bps("SLOT_CASH_PERCENT", p));
    const reborn = list(s, "SLOT_REBORN_PERCENT").map((p) => bps("SLOT_REBORN_PERCENT", p));
    if (cash.length !== 3) fail("SLOT_CASH_PERCENT", "needs 3 values (slot 1, 2, 3).");
    if (reborn.length !== 3) fail("SLOT_REBORN_PERCENT", "needs 3 values (slot 1, 2, 3).");
    const referral = bps("REFERRAL_PERCENT", String(s.REFERRAL_PERCENT));
    const companies = COMPANY_KEYS.map((name) => bps(`${name}_PERCENT`, String(s[`${name}_PERCENT`])));
    const company = companies.reduce((a, b) => a + b, 0);
    if (company === 0) fail("PRODUCT_PERCENT", "and MARKETING_PERCENT, TREASURY_PERCENT cannot all be 0.");
    cash.forEach((c, i) => {
        if (referral + company + c + reborn[i] !== 10_000) fail("SLOT_CASH_PERCENT", `slot ${i + 1}: referral + company + cash + reborn must be 100.`);
    });
    if (reborn.reduce((a, b) => a + b, 0) !== 10_000) fail("SLOT_REBORN_PERCENT", "must add up to 100.");

    const steps = Number(s.STEPS_PER_TX);
    if (!Number.isInteger(steps) || steps < 1) fail("STEPS_PER_TX", "must be a whole number above 0.");

    if (companyWalletsOf(s).some((w) => w.toLowerCase() === String(s.ROOT_WALLET).toLowerCase())) fail("ROOT_WALLET", "must differ from PRODUCT_WALLET, MARKETING_WALLET and TREASURY_WALLET.");

    return {
        prices,
        referralBps: BigInt(referral),
        companyBps: companies.map(BigInt),
        cashBps: cash.map(BigInt),
        rebornBps: reborn.map(BigInt),
        stepsPerTx: BigInt(steps),
    };
}

export { planOf, COMPANY_KEYS, companyWalletsOf };
