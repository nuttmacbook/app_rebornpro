import { formNumber } from "../../../engine/ui/helpers";
import { t } from "../../lang";

/*
 * YOUR CODE (off-chain). The reborn ring: one ID drawn as a ring of 3 arcs, one per slot. A filled slot burns in the
 * fire gradient (defined once in componants/backdrop.js). Used by the hero (animated), packages and the board.
 * Also the small package facts every page shares. Nothing here talks to a contract.
 */

const SLOTS = 3;
const ARC = 108;   // degrees of each slot's arc (120 minus the gap)

/** One arc per slot: empty ones as a dark track, filled ones in the fire gradient with a soft glow */
const arcs = (filled, { r = 50, width = 7, cx = 60, cy = 60, cls = "" } = {}) => {
    const arc = (i, stroke) => `<circle ${cls ? `class="ring-slot"` : ""} cx="${cx}" cy="${cy}" r="${r}" pathLength="360" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${ARC - 4} ${364 - ARC}" transform="rotate(${-88 + i * 120} ${cx} ${cy})" />`;
    // Animated (hero): no SVG filter, it would be recomputed on every frame; a wide faint copy below makes the glow
    if (cls) {
        const lit = [ 0, 1, 2 ].map((i) => arc(i, "url(#fire-stroke)")).join("");
        return `<g opacity="0.2">${lit.replaceAll(`stroke-width="${width}"`, `stroke-width="${width * 2.2}"`).replaceAll(`stroke-linecap="round"`, `stroke-linecap="butt"`)}</g><g>${lit}</g>`;
    }
    const track = [ 0, 1, 2 ].filter((i) => i >= filled).map((i) => arc(i, "#26262b")).join("");
    const lit = [ 0, 1, 2 ].filter((i) => i < filled).map((i) => arc(i, "url(#fire-stroke)")).join("");
    return `${track}${lit ? `<g filter="url(#ring-glow)">${lit}</g>` : ""}`;
};

/**
 * A ring with a label in the middle.
 * @param {object} o  filled (0..3), label, sub (small line under the label), size (css class), isMine, title (tooltip)
 */
const ring = ({ filled = 0, label = "", sub = "", size = "size-24", isMine = false, title = "" } = {}) => /*html*/`
    <svg viewBox="0 0 120 120" class="${size} shrink-0" role="img" aria-label="${title || t("{filled} of 3 slots filled", { filled })}">
        <circle cx="60" cy="60" r="40" fill="${isMine ? "rgb(232 32 46 / 0.12)" : "rgb(255 255 255 / 0.02)"}" stroke="${isMine ? "#ff7a7a" : "none"}" stroke-width="1" stroke-dasharray="${isMine ? "2 4" : "0"}" />
        <g>${arcs(filled)}</g>
        <text x="60" y="${sub ? 60 : 66}" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="${label.length > 5 ? 15 : 19}" font-weight="600" fill="#f5f5f5">${label}</text>
        ${sub ? `<text x="60" y="78" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="10.5" fill="#a1a1aa">${sub}</text>` : ""}
    </svg>
`;

/** The hero: an ID whose 3 slots fill one by one, flares, and gives birth to its Reborn ID; then it starts over */
const heroRing = () => /*html*/`
    <svg viewBox="0 0 260 200" class="ring-cycle w-full max-w-[440px]" role="img" aria-label="${t("An ID fills its three slots and is reborn as a new ID")}">
        <circle class="ring-flare" cx="96" cy="100" r="86" fill="none" stroke="url(#fire-stroke)" stroke-width="1" opacity="0" />
        <circle class="ring-flare" cx="96" cy="100" r="72" fill="rgb(232 32 46 / 0.08)" opacity="0" />
        <g>${arcs(0, { r: 72, width: 10, cx: 96, cy: 100 })}</g>
        <g>${arcs(0, { r: 72, width: 10, cx: 96, cy: 100, cls: "animated" })}</g>
        <text x="96" y="96" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="30" font-weight="600" fill="#f5f5f5">ID 1</text>
        <text x="96" y="120" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="12" fill="#a1a1aa">${t("3 slots")}</text>
        <g class="ring-child">
            <path d="M172 100 L196 100" stroke="#e8202e" stroke-width="1.5" stroke-dasharray="3 3" />
            <circle cx="224" cy="100" r="26" fill="rgb(232 32 46 / 0.1)" stroke="#2a2a2f" stroke-width="5" />
            <text x="224" y="99" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="14" font-weight="600" fill="#ff7a7a">1.1</text>
            <text x="224" y="113" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="8.5" fill="#a1a1aa">${t("Reborn")}</text>
        </g>
    </svg>
`;

/**
 * How an ID came to be (Position.kind in the contract: 0 sign-up, 1 upgrade, 2 reborn).
 */
const KINDS = [
    { label: "Sign-up", dot: "bg-bone" },
    { label: "Upgrade", dot: "bg-ember" },
    { label: "Reborn", dot: "bg-flame" },
];
const kindOf = (kind) => KINDS[kind] ?? KINDS[0];

/** "Package 10" from the package price (whole tokens; decimals only when the price has them) */
const packageName = (data, pkg) => {
    const price = data?.packages?.[pkg - 1]?.price ?? data?.prices?.[pkg - 1] ?? 0n;
    return t("Package {price}", { price: formNumber(price, data?.tokenDecimals ?? 0, 2).replace(/\.00$/, "") });
};

/** Reborn money kept on a board, as a thin bar towards one price */
const fundBar = (fund, price) => {
    const pct = price > 0n ? Math.min(100, Number((fund * 10_000n) / price) / 100) : 0;
    return /*html*/`
        <div class="h-1 w-full bg-seam" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <div class="h-full bg-gradient-to-r from-ember to-flame" style="width:${pct}%"></div>
        </div>
    `;
};

export { SLOTS, ring, heroRing, KINDS, kindOf, packageName, fundBar };
