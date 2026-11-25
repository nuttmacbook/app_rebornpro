/*
 * YOUR CODE (tests only). A plain JS copy of the RebornPro rules, used ONLY as the answer key in tests:
 * every placement and every token the contract moves is compared with what this model says should happen.
 * It finds open slots with a straightforward breadth-first search (not openDepth), so the two methods check each other.
 * The website never reads from this file.
 */

const SLOTS = 3;
const KIND = { SIGN_UP: 0, UPGRADE: 1, REBORN: 2, FREE: 3 };

class RebornModel {
    /**
     * @param {object} plan  { prices: bigint[], referralBps, companyBps, cashBps: bigint[3], rebornBps: bigint[3], stepsPerTx }
     * @param {string} root     root wallet
     * @param {string[]} companies  product, marketing, treasury wallets
     */
    constructor(plan, root, companies) {
        this.plan = { ...plan, prices: [ ...plan.prices ] };
        this.steps = Number(plan.stepsPerTx);
        this.companies = companies.map((w) => w.toLowerCase());
        this.members = [ null, { account: root.toLowerCase(), sponsor: 0, packages: new Set() } ];
        this.idOf = new Map([ [ root.toLowerCase(), 1 ] ]);
        this.boards = [ null ];          // boards[pkg] = [ { member, parent, kids: [], fund } ]
        this.mine = [ null, [ null ] ];  // mine[id][pkg] = [ index, ... ]
        this.cursor = new Map();         // MIXED: "id:pkg" -> position in mine[id][pkg]
        this.queue = [];
        this.paid = new Map();           // account -> tokens received from the contract
        this.held = 0n;
        this.totals = { in: 0n, referral: 0n, board: 0n, company: 0n };
        this.plan.prices.forEach((price) => this.addPackage(price, true));
    }

    addPackage(price, isInit = false) {
        if (!isInit) this.plan.prices.push(price);
        this.boards.push([ { member: 1, parent: 0, kids: [], fund: 0n } ]);
        this.mine.forEach((list, id) => list?.push(id === 1 ? [ 0 ] : []));
        this.members[1].packages.add(this.boards.length - 1);
    }

    price(pkg) { return this.plan.prices[pkg - 1]; }

    newMember(account, sponsor) {
        const id = this.members.length;
        this.members.push({ account: account.toLowerCase(), sponsor, packages: new Set() });
        this.mine.push(Array.from({ length: this.boards.length }, () => []));
        this.idOf.set(account.toLowerCase(), id);
        return id;
    }

    /** register(sponsorId) by `account` */
    register(account, sponsor) {
        const id = this.newMember(account, sponsor);
        this.buy(id, 1, KIND.SIGN_UP);
        this.process(this.steps);
        return id;
    }

    /** registerFor(accounts, sponsorId) by the owner: like register() for each wallet, one after another */
    registerFor(accounts, sponsor) {
        return accounts.map((account) => this.register(account, sponsor));
    }

    upgrade(account, pkg) {
        const id = this.idOf.get(account.toLowerCase());
        this.buy(id, pkg, KIND.UPGRADE);
        this.process(this.steps);
    }

    placeFree(accounts, pkg) {
        for (const account of accounts) {
            const id = this.idOf.get(account.toLowerCase()) ?? this.newMember(account, 1);
            this.members[id].packages.add(pkg);
            this.queue.push({ pkg, kind: KIND.FREE, isPaid: false, member: id, from: 0 });
        }
        this.process(this.steps);
    }

    buy(id, pkg, kind) {
        const price = this.price(pkg);
        this.held += price;
        this.totals.in += price;
        this.members[id].packages.add(pkg);
        this.queue.push({ pkg, kind, isPaid: true, member: id, from: 0 });
    }

    process(steps) {
        while (steps > 0 && this.queue.length) {
            this.place(this.queue.shift());
            steps -= 1;
        }
    }

    send(account, amount) {
        if (amount === 0n) return;
        this.held -= amount;
        this.paid.set(account, (this.paid.get(account) ?? 0n) + amount);
    }

    /** Whose IDs a new one goes below: reborn -> own, free -> root, upgrade -> nearest sponsor holding the package */
    entryPoint(job) {
        if (job.kind === KIND.REBORN) return this.entryOf(job.member, job.pkg);
        if (job.kind === KIND.FREE) return this.entryOf(1, job.pkg);
        let sponsor = this.members[job.member].sponsor;
        if (job.kind === KIND.UPGRADE) {
            while (sponsor !== 0 && !this.mine[sponsor][job.pkg].length) sponsor = this.members[sponsor].sponsor;
        }
        return this.entryOf(sponsor === 0 ? 1 : sponsor, job.pkg);
    }

    /** Which of `member`'s IDs: in order, each until its first two levels are full (like the contract) */
    /** Company money split by the product / marketing / treasury shares; the treasury takes the rounding */
    toCompanies(amount) {
        const shares = this.plan.companyBps;
        const total = shares.reduce((a, b) => a + b, 0n);
        let left = amount;
        shares.forEach((bps, i) => {
            const part = i === shares.length - 1 ? left : amount * bps / total;
            left -= part;
            this.send(this.companies[i], part);
        });
    }

    entryOf(member, pkg) {
        const list = this.mine[member][pkg];
        if (!list.length) return 0;
        // MIXED: first ID in order with an open slot within two levels (checked by walking, not openDepth)
        const key = `${member}:${pkg}`;
        let at = this.cursor.get(key) ?? 0;
        while (at + 1 < list.length && !this.hasRoomWithin(pkg, list[at], 2)) at += 1;
        this.cursor.set(key, at);
        return list[at];
    }

    /** Is there an open slot at `node` or within `levels - 1` levels below it? (levels = 2: its 3 + 9 slots) */
    hasRoomWithin(pkg, node, levels) {
        const board = this.boards[pkg];
        let layer = [ node ];
        for (let d = 0; d < levels; d++) {
            if (layer.some((i) => board[i].kids.length < SLOTS)) return true;
            layer = layer.flatMap((i) => board[i].kids);
        }
        return false;
    }

    /** Breadth-first: the first ID in level order (left to right) below `start` with an open slot */
    openSlotUnder(pkg, start) {
        const board = this.boards[pkg];
        const todo = [ start ];
        while (todo.length) {
            const index = todo.shift();
            if (board[index].kids.length < SLOTS) return index;
            todo.push(...board[index].kids);
        }
        throw new Error("no open slot");
    }

    place(job) {
        const { pkg, member } = job;
        const board = this.boards[pkg];
        const above = this.openSlotUnder(pkg, this.entryPoint(job));
        const index = board.length;
        board.push({ member, parent: above, kids: [], fund: 0n, kind: job.kind });
        this.mine[member][pkg].push(index);
        const top = board[above];
        const slot = top.kids.length;
        top.kids.push(index);

        if (job.isPaid) {
            const price = this.price(pkg);
            const referral = price * this.plan.referralBps / 10_000n;
            const cash = price * this.plan.cashBps[slot] / 10_000n;
            const reborn = price * this.plan.rebornBps[slot] / 10_000n;
            const sponsor = this.members[member].sponsor;
            if (sponsor === 0) this.toCompanies(referral);
            else this.send(this.members[sponsor].account, referral);
            this.totals.referral += referral;
            this.send(this.members[top.member].account, cash);
            this.totals.board += cash;
            top.fund += reborn;
            const rest = price - referral - cash - reborn;
            this.toCompanies(rest);
            this.totals.company += rest;
        }

        if (top.kids.length === SLOTS) {
            const price = this.price(pkg);
            const isPaid = top.fund >= price;
            const extra = isPaid ? top.fund - price : top.fund;
            this.toCompanies(extra);
            this.totals.company += extra;
            top.fund = 0n;
            this.queue.push({ pkg, kind: KIND.REBORN, isPaid, member: top.member, from: above });
        }
    }

    /** Money the contract should hold: reborn money on boards + price of paid jobs still queued */
    heldParts() {
        let onBoards = 0n;
        this.boards.slice(1).forEach((b) => b.forEach((p) => { onBoards += p.fund; }));
        const queued = this.queue.filter((j) => j.isPaid).reduce((sum, j) => sum + this.price(j.pkg), 0n);
        return { onBoards, queued };
    }
}

export { RebornModel, KIND, SLOTS };
