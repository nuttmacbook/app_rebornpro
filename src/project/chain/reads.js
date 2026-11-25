/*
 * YOUR CODE (on-chain). Reading the contract: one function per page, one contract call per page
 * (the owner page reads two: the home view for the wallet and the owner view).
 * Results are cached for a few seconds (src/engine/chain/cache.js), so moving between pages is free.
 */

import { box, readRpc, NETWORK, IS_LOCAL } from "../../engine/chain/connect";
import { cachedRead } from "../../engine/chain/cache";
import { metered } from "../../engine/chain/rpcMeter";
import { toHomeView, toPlanView, toBoardView, toTeamView, toOwnerView, toHistoryView } from "./viewParse";
import { RebornContract } from "../../generated/contracts/rebornmatrix";

// getBoardView: "open the viewer's newest ID in this package (or the root)"
const AUTO_POSITION = (1n << 256n) - 1n;
const BOARD_PAGE = 24n;
const TEAM_PAGE = 20n;
const HISTORY_PAGE = 50n;

const matrix = () => metered(box.createWeb3Contract(RebornContract, readRpc()), "RebornMatrix");
const whoOf = (account) => (account ?? box.ZERO).toLowerCase();
/** Whole number ≥ 0 from a link parameter, or the fallback */
const wholeOr = (value, fallback) => (/^\d+$/.test(String(value ?? "")) ? BigInt(value) : fallback);

/** Dashboard view; `fresh: true` skips the cache (used right before a transaction) */
const readHomeView = async (account, refId = 0n, { fresh = false } = {}) => {
    const who = whoOf(account);
    const raw = await cachedRead(`home:${who}:${refId}`, () => matrix().methods.getHomeView(who, refId).call(), { fresh });
    return toHomeView(raw);
};

const readOwnerView = async ({ fresh = false } = {}) => toOwnerView(await cachedRead("owner", () => matrix().methods.getOwnerView().call(), { fresh }));

/**
 * Dashboard and sign-up.
 *
 * @param {object} wallet  connected wallet ({ address, signer }) or null
 * @param {object} options
 * @param {string} options.ref  sponsor id from the link (?ref=)
 * @returns {Promise<object>}
 */
export async function getHomeData(wallet, { ref = "" } = {}) {
    const view = await readHomeView(wallet?.address, wholeOr(ref, 0n));
    return { wallet, isConnected: Boolean(wallet?.address), ...view };
}

/** Marketing plan: every package and every percent, as the contract has it */
export async function getPlanData(wallet) {
    const raw = await cachedRead("plan", () => matrix().methods.getPlanView().call(), { ttl: 60_000 });
    return { wallet, isConnected: Boolean(wallet?.address), ...toPlanView(raw) };
}

/**
 * Board page: three levels of one package below a position, plus a page of the viewer's IDs in it.
 *
 * @param {object} wallet
 * @param {object} options  pkg (1..), pos (position index or "" for the viewer's newest), page (0..)
 */
export async function getBoardData(wallet, { pkg = "1", pos = "", page = "0" } = {}) {
    const who = whoOf(wallet?.address);
    const p = wholeOr(pkg, 1n) || 1n;
    const index = wholeOr(pos, AUTO_POSITION);
    const offset = wholeOr(page, 0n) * BOARD_PAGE;
    const raw = await cachedRead(`board:${who}:${p}:${index}:${offset}`, () => matrix().methods.getBoardView(who, p, index, offset, BOARD_PAGE).call());
    return { wallet, isConnected: Boolean(wallet?.address), page: Number(offset / BOARD_PAGE), pageSize: Number(BOARD_PAGE), ...toBoardView(raw) };
}

/** Team page: the viewer's sponsor and one page of the people they sponsored */
export async function getTeamData(wallet, { page = "0" } = {}) {
    const who = whoOf(wallet?.address);
    const offset = wholeOr(page, 0n) * TEAM_PAGE;
    const raw = await cachedRead(`team:${who}:${offset}`, () => matrix().methods.getTeamView(who, offset, TEAM_PAGE).call());
    return { wallet, isConnected: Boolean(wallet?.address), page: Number(offset / TEAM_PAGE), pageSize: Number(TEAM_PAGE), ...toTeamView(raw) };
}

/** "0x…" with 40 hex digits (any letter case) */
const isAddress = (text) => /^0x[0-9a-fA-F]{40}$/.test(String(text ?? "").trim());

/**
 * History page: one page of a member's rows, newest first, as the contract recorded them.
 *
 * @param {object} wallet
 * @param {object} options  addr (any wallet; empty = the connected one), page (0..)
 * @returns {Promise<object>} the view, plus isOther (looking at someone else), badAddress and blockUrl
 */
export async function getHistoryData(wallet, { addr = "", page = "0" } = {}) {
    const typed = String(addr ?? "").trim();
    const badAddress = typed !== "" && !isAddress(typed);
    const who = !badAddress && typed ? typed.toLowerCase() : whoOf(wallet?.address);
    const offset = wholeOr(page, 0n) * HISTORY_PAGE;
    const raw = await cachedRead(`history:${who}:${offset}`, () => matrix().methods.getHistoryView(who, offset, HISTORY_PAGE).call());
    const explorer = IS_LOCAL ? "" : (NETWORK?.blockExplorers?.default?.url ?? "");
    return {
        wallet,
        isConnected: Boolean(wallet?.address),
        isOther: Boolean(typed) && !badAddress && typed.toLowerCase() !== whoOf(wallet?.address),
        typed,
        badAddress,
        page: Number(offset / HISTORY_PAGE),
        pageSize: Number(HISTORY_PAGE),
        blockUrl: (block) => (explorer && block ? `${explorer}/block/${block}` : ""),
        ...toHistoryView(raw),
    };
}

/** Owner page: wallets, launch, queue, packages (and the home view for prices and the viewer) */
export async function getOwnerData(wallet) {
    const [ owner, home ] = await Promise.all([ readOwnerView(), readHomeView(wallet?.address, 0n) ]);
    return { wallet, isConnected: Boolean(wallet?.address), ...home, owner };
}

export { readHomeView, readOwnerView, AUTO_POSITION };
