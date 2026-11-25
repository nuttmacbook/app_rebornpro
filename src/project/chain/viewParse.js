/*
 * YOUR CODE (on-chain). Turns what the contract returns into plain objects for the pages.
 * Every field has a safe empty value, so a missing answer never breaks the page. Fields are read by name.
 */

const big = (value) => BigInt(value ?? 0);
const num = (value) => Number(value ?? 0);
const ZERO = "0x0000000000000000000000000000000000000000";
const listOf = (value) => (value && typeof value !== "string" && typeof value[Symbol.iterator] === "function" ? Array.from(value) : []);

/** One PackageInfo: price, sales open, board size, and what one board / one entry pays */
const toPackage = (p) => ({
    pkg: num(p?.pkg),
    price: big(p?.price),
    isOpen: Boolean(p?.isOpen),
    positions: num(p?.positions),
    completed: num(p?.completed),
    members: num(p?.members),
    cyclePay: big(p?.cyclePay),
    referralPay: big(p?.referralPay),
});

/** The viewer's side of one package */
const toMine = (m) => ({
    has: Boolean(m?.has),
    count: num(m?.count),
    latestIndex: num(m?.latestIndex),
    latestFilled: num(m?.latestFilled),
    latestFund: big(m?.latestFund),
    firstIndex: num(m?.firstIndex),
});

/** getHomeView(viewer, refId) */
const toHomeView = (v) => ({
    token: v?.token ?? ZERO,
    tokenSymbol: String(v?.tokenSymbol ?? ""),
    tokenDecimals: num(v?.tokenDecimals),
    launched: Boolean(v?.launched),
    memberCount: num(v?.memberCount),
    queued: num(v?.queued),
    totalIn: big(v?.totalIn),
    totalReferral: big(v?.totalReferral),
    totalBoardPaid: big(v?.totalBoardPaid),
    totalCompany: big(v?.totalCompany),
    totalHeld: big(v?.totalHeld),
    packages: listOf(v?.packages).map(toPackage),
    refId: num(v?.refId),
    refValid: Boolean(v?.refValid),
    refAccount: v?.refAccount ?? ZERO,
    isMember: Boolean(v?.isMember),
    isOwner: Boolean(v?.isOwner),
    myId: num(v?.myId),
    mySponsor: num(v?.mySponsor),
    myDirects: num(v?.myDirects),
    myPositions: num(v?.myPositions),
    myCycles: num(v?.myCycles),
    myReferralEarned: big(v?.myReferralEarned),
    myBoardEarned: big(v?.myBoardEarned),
    myJoinedAt: num(v?.myJoinedAt),
    walletBalance: big(v?.walletBalance),
    allowance: big(v?.allowance),
    mine: listOf(v?.mine).map(toMine),
});

/** getPlanView() */
const toPlanView = (v) => ({
    tokenSymbol: String(v?.tokenSymbol ?? ""),
    tokenDecimals: num(v?.tokenDecimals),
    referralBps: num(v?.referralBps),
    companyBps: listOf(v?.companyBps).map(num),    // product, marketing, treasury
    cashBps: listOf(v?.cashBps).map(num),
    rebornBps: listOf(v?.rebornBps).map(num),
    placement: num(v?.placement),
    memberCount: num(v?.memberCount),
    launched: Boolean(v?.launched),
    packages: listOf(v?.packages).map(toPackage),
});

const toNode = (n) => ({
    exists: Boolean(n?.exists),
    index: num(n?.index),
    member: num(n?.member),
    account: n?.account ?? ZERO,
    filled: num(n?.filled),
    kind: num(n?.kind),
    createdAt: num(n?.createdAt),
});

/** getBoardView(viewer, pkg, index, offset, limit); `parent` is null at the root */
const toBoardView = (v) => {
    const parent = big(v?.parent);
    return {
        tokenSymbol: String(v?.tokenSymbol ?? ""),
        tokenDecimals: num(v?.tokenDecimals),
        packageCount: num(v?.packageCount),
        pkg: num(v?.pkg),
        price: big(v?.price),
        positionCount: num(v?.positionCount),
        focus: num(v?.focus),
        parent: parent === (1n << 256n) - 1n ? null : Number(parent),
        nodes: listOf(v?.nodes).map(toNode),
        viewerId: num(v?.viewerId),
        myTotal: num(v?.myTotal),
        myIndices: listOf(v?.myIndices).map(num),
        myKinds: listOf(v?.myKinds).map(num),
        myCounts: listOf(v?.myCounts).map(num),
        prices: listOf(v?.prices).map(big),
    };
};

/** getTeamView(viewer, offset, limit) */
const toTeamView = (v) => ({
    myId: num(v?.myId),
    sponsorId: num(v?.sponsorId),
    sponsorAccount: v?.sponsorAccount ?? ZERO,
    directsTotal: num(v?.directsTotal),
    directs: listOf(v?.directs).map((d) => ({
        id: num(d?.id),
        account: d?.account ?? ZERO,
        joinedAt: num(d?.joinedAt),
        directs: num(d?.directs),
        positions: num(d?.positions),
        packages: num(d?.packages),
    })),
});

/** getOwnerView() */
const toOwnerView = (v) => ({
    owner: v?.owner ?? ZERO,
    companies: listOf(v?.companies),                // product, marketing, treasury
    root: v?.root ?? ZERO,
    launched: Boolean(v?.launched),
    stepsPerTx: num(v?.stepsPerTx),
    queued: num(v?.queued),
    totalFree: num(v?.totalFree),
    packageCount: num(v?.packageCount),
    maxPackages: num(v?.maxPackages),
    lastPrice: big(v?.lastPrice),
    bnbHeld: big(v?.bnbHeld),
});

/*
 * getHistoryView: rows come as two words each (layout in RebornMatrix.sol, above HistoryRow). Kinds:
 *   newId     a new ID of this member (idKind: 0 sign-up, 1 upgrade, 2 reborn, 3 free)
 *   referral  referral share from someone this member invited
 *   slot      a slot below one of this member's IDs was taken
 */
const ROW_KINDS = [ "newId", "referral", "slot" ];
const bitsOf = (v, from, size) => Number((v >> BigInt(from)) & ((1n << BigInt(size)) - 1n));

const toHistoryRows = (words) => {
    const list = listOf(words).map(big);
    const rows = [];
    for (let i = 0; i + 1 < list.length; i += 2) {
        const [ a, b ] = [ list[i], list[i + 1] ];
        rows.push({
            time: bitsOf(a, 0, 40),
            block: bitsOf(a, 40, 40),
            kind: ROW_KINDS[bitsOf(a, 80, 8)] ?? "newId",
            pkg: bitsOf(a, 88, 8),
            slot: bitsOf(a, 96, 8),
            idKind: bitsOf(a, 104, 8),
            other: bitsOf(a, 112, 64),
            index: bitsOf(a, 176, 64),
            ref: bitsOf(b, 0, 64),
            amount: (b >> 64n) & ((1n << 96n) - 1n),
            extra: b >> 160n,
        });
    }
    return rows;
};

/** getHistoryView(account, offset, limit) */
const toHistoryView = (v) => ({
    tokenSymbol: String(v?.tokenSymbol ?? ""),
    tokenDecimals: num(v?.tokenDecimals),
    memberId: num(v?.memberId),
    account: v?.account ?? ZERO,
    sponsor: num(v?.sponsor),
    joinedAt: num(v?.joinedAt),
    referralEarned: big(v?.referralEarned),
    boardEarned: big(v?.boardEarned),
    cycles: num(v?.cycles),
    prices: listOf(v?.prices).map(big),
    total: num(v?.total),
    rows: toHistoryRows(v?.rows),
});

export { toHomeView, toPlanView, toBoardView, toTeamView, toOwnerView, toHistoryView };
