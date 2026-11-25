import { t } from "../../lang";
import { moneyText, WRAP, pageHead, button, pager, errorBox, loadingBox, escape } from "../componants/parts";
import { positionLabel, memberLabel, isMasked } from "../componants/ids";
import { KINDS, kindOf, packageName } from "../componants/ring";

/*
 * YOUR CODE (off-chain). One package's board: the chosen ID, its 3 slots and their 9 (getBoardView), every ID drawn
 * as a reborn ring whose arcs show its filled slots. A switch per package (as many as the contract has),
 * and the viewer's own IDs in that package.
 */

const W = 900;
const LEVEL_Y = [ 70, 220, 345 ];
const RADIUS = [ 52, 42, 26 ];
const ARC = 108;

const xOf = (k) => (k === 0 ? W / 2 : k <= 3 ? ((k - 1) * 3 + 1.5) * (W / 9) : ((k - 4) + 0.5) * (W / 9));
const levelOf = (k) => (k === 0 ? 0 : k <= 3 ? 1 : 2);
const upOf = (k) => (k - 1 - ((k - 1) % 3)) / 3;

const switcher = (data) => /*html*/`
    <nav class="flex overflow-x-auto rounded-xl border border-seam" aria-label="${t("Packages")}">
        ${Array.from({ length: data.packageCount }, (_, i) => {
            const pkg = i + 1;
            const isActive = pkg === data.pkg;
            const mine = data.myCounts[i] ?? 0;
            return /*html*/`
                <button type="button" onclick="openBoard(${pkg})" ${isActive ? `aria-current="page"` : ""}
                    class="relative min-w-[8.5rem] flex-1 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame ${i ? "border-l border-seam" : ""} ${isActive ? "bg-ash" : "hover:bg-ash/60"}">
                    ${isActive ? `<span class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-ember via-flame to-blood" aria-hidden="true"></span>` : ""}
                    <span class="block font-display text-[15px] font-semibold ${isActive ? "text-bone" : "text-cinder"}">${packageName(data, pkg)}</span>
                    <span class="block text-[12px] text-smolder">${mine ? t("{count} of yours", { count: mine }) : t("none of yours")}</span>
                </button>`;
        }).join("")}
    </nav>
`;

/** One node: a ring whose arcs are its filled slots; empty slots of a parent are drawn as dashed outlines */
const node = (data, n, k) => {
    const level = levelOf(k);
    const x = xOf(k);
    const y = LEVEL_Y[level];
    const r = RADIUS[level];
    if (!n.exists) {
        return `<circle cx="${x}" cy="${y}" r="${r * 0.7}" fill="none" stroke="#2a2a2f" stroke-dasharray="3 5" /><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="${level === 2 ? 10 : 12}" fill="#71717a">${t("Open")}</text>`;
    }
    const isMine = data.viewerId > 0 && n.member === data.viewerId;
    const width = level === 0 ? 9 : level === 1 ? 7 : 5;
    const arc = (i, stroke) => `<circle cx="${x}" cy="${y}" r="${r}" pathLength="360" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${ARC - 4} ${364 - ARC}" transform="rotate(${-88 + i * 120} ${x} ${y})" />`;
    const lit = [ 0, 1, 2 ].filter((i) => i < n.filled).map((i) => arc(i, "url(#fire-stroke)")).join("");
    const arcs = [ 0, 1, 2 ].filter((i) => i >= n.filled).map((i) => arc(i, "#26262b")).join("") + (lit ? `<g filter="url(#ring-glow)">${lit}</g>` : "");
    const label = escape(positionLabel(data.pkg, n.index, { short: level === 2 && isMasked() }));
    const size = level === 0 ? 17 : level === 1 ? 14 : isMasked() ? 11 : 12;
    const sub = level < 2 ? `<text x="${x}" y="${y + 17}" text-anchor="middle" font-size="10.5" fill="${n.index === 0 ? "#ff7a7a" : "#a1a1aa"}">${n.index === 0 ? t("Top") : t(kindOf(n.kind).label)}</text>` : "";
    return /*html*/`
        <g class="cursor-pointer" onclick="openBoard(${data.pkg}, ${n.index})" role="link" tabindex="0" aria-label="${t("Open ID {id}", { id: label })}">
            <circle cx="${x}" cy="${y}" r="${r - width}" fill="${isMine ? "rgb(255 122 122 / 0.1)" : "#0c0c0e"}" stroke="${isMine ? "#ff7a7a" : "none"}" stroke-dasharray="2 3" />
            ${arcs}
            <text x="${x}" y="${y + (level < 2 ? 1 : 4)}" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-size="${size}" font-weight="600" fill="#f5f5f5">${label}</text>
            ${sub}
        </g>`;
};

const tree = (data) => {
    const nodes = data.nodes;
    const lines = nodes.map((n, k) => {
        if (k === 0 || !nodes[upOf(k)]?.exists) return "";
        const up = upOf(k);
        return `<line x1="${xOf(up)}" y1="${LEVEL_Y[levelOf(up)] + RADIUS[levelOf(up)]}" x2="${xOf(k)}" y2="${LEVEL_Y[levelOf(k)] - RADIUS[levelOf(k)] * (n.exists ? 1 : 0.7)}" stroke="${n.exists ? "rgb(232 32 46 / 0.5)" : "#2a2a2f"}" stroke-width="1.2" />`;
    }).join("");
    const drawn = nodes.map((n, k) => (k > 0 && !nodes[upOf(k)]?.exists ? "" : node(data, n, k))).join("");
    return `<svg viewBox="0 0 ${W} 390" class="w-full" role="img" aria-label="${t("The board below the chosen ID")}">${lines}${drawn}</svg>`;
};

const side = (data) => {
    const top = data.nodes[0];
    const facts = top?.exists ? [
        [ t("ID"), positionLabel(data.pkg, top.index) ],
        [ t("Member"), memberLabel(top.member) ],
        [ t("Came from"), top.index === 0 ? t("Top of the board") : t(kindOf(top.kind).label) ],
        [ t("Slots filled"), `${top.filled} of 3` ],
    ] : [];
    return /*html*/`
        <div class="flex min-w-0 flex-col gap-5">
            <dl class="divide-y divide-seam border-y border-seam">
                ${facts.map(([ k, v ]) => `<div class="flex items-baseline justify-between gap-3 py-2.5"><dt class="text-[13px] text-cinder">${k}</dt><dd class="font-display text-[15px] font-semibold text-bone">${escape(v)}</dd></div>`).join("")}
            </dl>
            <div class="grid grid-cols-3 gap-2">
                ${button(t("Top"), `openBoard(${data.pkg}, 0)`, { kind: "line", size: "sm", isDisabled: data.focus === 0 })}
                ${button(t("Up"), `openBoard(${data.pkg}, ${data.parent ?? 0})`, { kind: "line", size: "sm", isDisabled: data.parent === null })}
                ${button(t("Mine"), `openBoard(${data.pkg})`, { kind: "line", size: "sm", isDisabled: !data.myTotal })}
            </div>
            <form class="flex gap-2" onsubmit="event.preventDefault(); openBoard(${data.pkg}, this.goto.value)">
                <label class="sr-only" for="goto">${t("Go to an ID")}</label>
                <input id="goto" name="goto" type="text" placeholder="${t("Go to an ID")}" maxlength="9" autocomplete="off" spellcheck="false" class="field min-w-0 flex-1 font-display uppercase" />
                ${button(t("Go"), "", { full: false, size: "sm", type: "submit" })}
            </form>
            <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-cinder">
                ${KINDS.map((k) => `<span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full ${k.dot}"></span>${t(k.label)}</span>`).join("")}
                <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full border border-ember"></span>${t("Yours")}</span>
            </div>
        </div>
    `;
};

const myIds = (data) => {
    if (!data.isConnected) return `<p class="text-[14px] text-cinder">${t("Connect your wallet to see your own IDs in this package.")}</p>`;
    if (!data.myTotal) return `<p class="text-[14px] text-cinder">${t("You have no ID in {name} yet.", { name: packageName(data, data.pkg) })}</p>`;
    return /*html*/`
        <div class="flex flex-wrap gap-2">
            ${data.myIndices.map((index, i) => /*html*/`
                <button type="button" onclick="openBoard(${data.pkg}, ${index})"
                    class="btn inline-flex items-center gap-2 px-3 py-2 font-display text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame ${index === data.focus ? "btn-fire" : "btn-line"}">
                    <span class="size-1.5 rounded-full ${kindOf(data.myKinds[i]).dot}" aria-hidden="true"></span>${positionLabel(data.pkg, index)}
                </button>`).join("")}
        </div>
        ${pager({ page: data.page, pageSize: data.pageSize, total: data.myTotal, go: "myIdsPage" })}
    `;
};

const board = (data) => /*html*/`
    <main class="${WRAP} flex flex-col gap-6 py-10 sm:py-14">
        ${pageHead(t("Board"), t("Pick any ID to see the slots below it. {name} has {count} IDs, priced {price} each.", { name: packageName(data, data.pkg), count: data.positionCount.toLocaleString("en-US"), price: moneyText(data, data.price, 0) }))}
        ${switcher(data)}
        <section class="grid gap-6 lg:grid-cols-[260px_1fr]">
            ${side(data)}
            <div class="plate min-w-0 p-3 sm:p-5"><div class="overflow-x-auto"><div class="min-w-[580px]">${tree(data)}</div></div></div>
        </section>
        <section class="flex flex-col gap-3">
            <h2 class="font-display text-xl font-semibold text-bone">${t("Your IDs in {name}", { name: packageName(data, data.pkg) })}${data.myTotal ? ` <span class="text-cinder">(${data.myTotal})</span>` : ""}</h2>
            ${myIds(data)}
        </section>
    </main>
`;

const boardLoading = () => loadingBox;
const boardError = (error) => errorBox(error?.message ?? "Unknown error");

export { board, boardLoading, boardError };
