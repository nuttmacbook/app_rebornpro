/*
 * YOUR CODE (on-chain tests). The whole plan on the contract from dev/settings (PLACEMENT as set there):
 * settings, free investor IDs before launch, many sign-ups and upgrades compared with the JS model after every
 * step, queue, new packages, money, views, payable, wallets and a proxy upgrade half way.
 */

import { ethers } from "ethers";
import { TX_GAS, deployContract } from "../../engine/node.mjs";
import { joiner, upgrader, newPerson, payFor } from "../seed.mjs";
import { planOf, companyWalletsOf } from "../plan.mjs";
import { RebornModel } from "../model.mjs";

export default async function (t) {
    const { provider, owner, stranger, contracts, deployed, check, doesRevert } = t;
    const matrix = deployed.at("RebornMatrix");
    const proxy = deployed.proxy("RebornMatrix");
    const token = deployed.tokens.USDT.contract;
    const decimals = deployed.tokens.USDT.decimals;
    const s = t.settings.RebornMatrix;
    const plan = planOf(s);
    const usdt = (v) => `${ethers.formatUnits(v, decimals)} USDT`;
    const companies = companyWalletsOf(s);
    const model = new RebornModel(plan, s.ROOT_WALLET, companies);

    /** Every position of every package and every token sent must match the model */
    const matchesModel = async (label) => {
        let wrong = [];
        for (let pkg = 1; pkg < model.boards.length; pkg++) {
            const board = model.boards[pkg];
            if (Number((await matrix.getPackage(pkg)).positions) !== board.length) wrong.push(`pkg ${pkg} count`);
            for (let i = 0; i < board.length && wrong.length < 3; i++) {
                const p = await matrix.getPosition(pkg, i);
                if (Number(p.member) !== board[i].member || Number(p.parent) !== board[i].parent || Number(p.filled) !== board[i].kids.length || p.fund !== board[i].fund) wrong.push(`pkg ${pkg} #${i}`);
            }
        }
        for (const [ account, amount ] of model.paid) {
            if ((await token.balanceOf(account)) !== amount) wrong.push(`balance ${account.slice(0, 8)}`);
        }
        if ((await matrix.getOwnerView()).queued !== BigInt(model.queue.length)) wrong.push("queue");
        const [ held, paidIn, referral, board, company ] = await matrix.getTotals();
        if (held !== model.held || paidIn !== model.totals.in || referral !== model.totals.referral || board !== model.totals.board || company !== model.totals.company) wrong.push("totals");
        check(`model: ${label}`, wrong.length === 0, wrong.slice(0, 3).join(", "));
    };

    /** joined = referral + board pay + company + held, held = token balance = money on boards + queued paid jobs */
    const moneyAddsUp = async (label) => {
        const [ held, paidIn, referral, board, company ] = await matrix.getTotals();
        const balance = await token.balanceOf(deployed.addresses.RebornMatrix);
        const { onBoards, queued } = model.heldParts();
        check(`money: ${label}`, paidIn === referral + board + company + held && held === balance && held === onBoards + queued, `in ${usdt(paidIn)}, held ${usdt(held)}`);
    };

    /* ------------------------------------ 1. set up from dev/settings */

    const settings = await matrix.getSettings();
    check("settings: token is the test token", (await matrix.token()) === deployed.tokens.USDT.address);
    check("settings: prices = PACKAGE_PRICES", (await matrix.getPlanView()).packages.map((p) => p.price).join() === plan.prices.join(), s.PACKAGE_PRICES);
    check("settings: split = the percents in the .env", settings.referralBps === plan.referralBps && settings.cashBps.join() === plan.cashBps.join() && settings.rebornBps.join() === plan.rebornBps.join());
    check("settings: placement mode = PLACEMENT", settings.placement === plan.placement, s.PLACEMENT);
    check("settings: root and the 3 company wallets (product, marketing, treasury)", (await matrix.getOwnerView()).root === ethers.getAddress(s.ROOT_WALLET) && (await matrix.getOwnerView()).companies.every((w, i) => w === ethers.getAddress(companies[i])));
    check("settings: company shares = PRODUCT / MARKETING / TREASURY_PERCENT", settings.companyBps.join() === plan.companyBps.join(), settings.companyBps.map((b) => `${Number(b) / 100}%`).join(" / "));
    check("proxy: owner() is the owner and the proxy admin", (await matrix.owner()) === owner.address && (await proxy.admin()) === owner.address);
    check("proxy: initialize cannot run twice", await doesRevert(() => matrix.initialize.staticCall(owner.address, deployed.tokens.USDT.address, stranger.address, companies, plan), "AlreadyInitialized"));
    check("proxy: a stranger cannot upgrade", await doesRevert(() => proxy.connect(stranger).upgradeTo.staticCall(deployed.addresses.RebornMatrixImplementation)));
    const selectorsOf = (abi) => new ethers.Interface(abi).fragments.filter((f) => f.type === "function").map((f) => f.selector);
    const proxySelectors = new Set(selectorsOf(contracts.BaseProxyUsed.abi));
    check("proxy: no function name clash with RebornMatrix", selectorsOf(contracts.RebornMatrix.abi).every((x) => !proxySelectors.has(x)));
    check("root: holds the top of every package", (await Promise.all([ 1, 2, 3 ].map((p) => matrix.positionsOf(1, p)))).every((l) => l.length === 1 && l[0] === 0n));

    /* ------------------------------------ 2. before launch: free IDs for investors */

    const early = await newPerson(provider);
    check("before launch: register is refused", await doesRevert(() => matrix.connect(early).register.staticCall(1), "NotLaunched"));
    check("before launch: a stranger cannot place free IDs", await doesRevert(() => matrix.connect(stranger).placeFree.staticCall([ early.address ], 1), "OnlyOwner"));
    check("placeFree: a company wallet is refused", await doesRevert(() => matrix.placeFree.staticCall([ companies[1] ], 1), "RootAndCompanyMustDiffer"));

    const investors = await Promise.all([ 1, 2, 3, 4, 5 ].map(() => newPerson(provider)));
    const freeAddresses = investors.map((w) => w.address);
    t.gas("placeFree 5 IDs", await (await matrix.placeFree(freeAddresses, 1, { gasLimit: TX_GAS })).wait());
    model.placeFree(freeAddresses, 1);
    await (await matrix.placeFree(freeAddresses.slice(0, 2), 3, { gasLimit: TX_GAS })).wait();
    model.placeFree(freeAddresses.slice(0, 2), 3);
    check("placeFree: same package twice is refused", await doesRevert(() => matrix.placeFree.staticCall([ freeAddresses[0] ], 1), "AlreadyHasPackage"));
    check("placeFree: package 3 without 1 and 2 is allowed for investors", await matrix.hasPackage(await matrix.idOf(freeAddresses[0]), 3));
    check("placeFree: investors have the root as sponsor", (await matrix.getHistoryView(freeAddresses[4], 0, 0)).sponsor === 1n);
    check("placeFree: no token moved", (await matrix.getTotals())[0] === 0n && (await Promise.all(companies.map((w) => token.balanceOf(w)))).every((b) => b === 0n));
    const rootBoard = await matrix.getPosition(1, 0);
    check("placeFree: 3 free IDs complete the root's board, the root is reborn for free", rootBoard.filled === 3n && (await matrix.positionsOf(1, 1)).length === 2);
    await matchesModel("free IDs placed like the model");

    check("launchPublic: a stranger cannot launch", await doesRevert(() => matrix.connect(stranger).launchPublic.staticCall(), "OnlyOwner"));
    await (await matrix.launchPublic()).wait();
    check("launchPublic: launched", await matrix.launched());
    check("launchPublic: cannot run twice", await doesRevert(() => matrix.launchPublic.staticCall(), "AlreadyLaunched"));
    check("after launch: free placement is closed for good", await doesRevert(() => matrix.placeFree.staticCall([ early.address ], 2), "AlreadyLaunched"));

    /* ------------------------------------ 3. things that must fail */

    const nobody = await newPerson(provider);
    check("register: unknown sponsor is refused", await doesRevert(() => matrix.connect(nobody).register.staticCall(999), "UnknownSponsor"));
    check("register: sponsor 0 is refused", await doesRevert(() => matrix.connect(nobody).register.staticCall(0), "UnknownSponsor"));
    check("register: without approve fails", await doesRevert(() => matrix.connect(nobody).register.staticCall(1)));
    check("upgrade: a non-member is refused", await doesRevert(() => matrix.connect(nobody).upgrade.staticCall(2), "NotAMember"));
    check("processQueue: empty queue is refused", await doesRevert(() => matrix.processQueue.staticCall(5), "QueueIsEmpty"));

    /* ------------------------------------ 4. many people join and upgrade, checked against the model */

    const people = [];
    const memberIds = () => [ 1, ...people.map((p) => p.id) ];
    let upgradedHalf = false;
    for (let i = 1; i <= t.args.count; i++) {
        // Some sponsors bring many people, so boards fill and reborn often
        const ids = memberIds();
        const sponsor = i % 4 === 0 ? ids[Math.floor(Math.random() * ids.length)] : ids[Math.max(0, ids.length - 1 - (i % 3))];
        const member = await joiner(provider, deployed, sponsor);
        t.gas("register", member.receipt);
        model.register(member.wallet.address, sponsor);
        people.push(member);

        if (i % 3 === 0) {
            t.gas("upgrade", await upgrader(deployed, member.wallet, 2));
            model.upgrade(member.wallet.address, 2);
        }
        if (i % 7 === 0) {
            const older = people[Math.floor(i / 2)];
            if (model.members[older.id].packages.has(2) && !model.members[older.id].packages.has(3)) {
                await upgrader(deployed, older.wallet, 3);
                model.upgrade(older.wallet.address, 3);
            }
        }
        if (i % 15 === 0) await matchesModel(`${i} members`);

        // Upgrade to a new copy of the logic half way: every board and balance must still be there
        if (!upgradedHalf && i === Math.floor(t.args.count / 2)) {
            upgradedHalf = true;
            const newLogic = await deployContract(owner, contracts.RebornMatrix);
            await (await proxy.upgradeTo(await newLogic.getAddress())).wait();
            await matchesModel("after a proxy upgrade half way");
        }
    }
    await matchesModel(`all ${t.args.count} members`);
    await moneyAddsUp(`after ${t.args.count} members`);

    const a = people[2]; // people[2] upgraded (every third)
    check("upgrade: the same package twice is refused", await doesRevert(() => matrix.connect(a.wallet).upgrade.staticCall(2), "AlreadyHasPackage"));
    const b = people.find((p) => !model.members[p.id].packages.has(2));
    check("upgrade: skipping a package is refused", await doesRevert(() => matrix.connect(b.wallet).upgrade.staticCall(3), "NeedsThePackageBefore"));
    check("register: twice is refused", await doesRevert(() => matrix.connect(a.wallet).register.staticCall(1), "AlreadyRegistered"));
    const cycles = await Promise.all(people.slice(0, 10).map((p) => matrix.getHistoryView(p.wallet.address, 0, 0)));
    check("reborn: members completed boards and got new IDs", cycles.some((m) => m.cycles > 0n), `${cycles.reduce((x, m) => x + Number(m.cycles), 0)} boards in the first 10`);

    /* ------------------------------------ 5. referral always goes to the sponsor from sign-up */

    const sponsorWallet = people[0];
    const kid = await joiner(provider, deployed, sponsorWallet.id);
    model.register(kid.wallet.address, sponsorWallet.id);
    const before = await token.balanceOf(sponsorWallet.wallet.address);
    const r = await upgrader(deployed, kid.wallet, 2);
    model.upgrade(kid.wallet.address, 2);
    const referralTo = r.logs.map((l) => { try { return matrix.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "ReferralPaid" && e.args.from === BigInt(kid.id));
    check("referral: an upgrade pays the sponsor from sign-up", referralTo?.args?.to === sponsorWallet.wallet.address && (await token.balanceOf(sponsorWallet.wallet.address)) >= before + plan.prices[1] * plan.referralBps / 10_000n);
    await matchesModel("after the referral check");

    /* ------------------------------------ 6. queue: a small stepsPerTx leaves work for processQueue */

    check("setStepsPerTx: a stranger cannot call it", await doesRevert(() => matrix.connect(stranger).setStepsPerTx.staticCall(1), "OnlyOwner"));
    await (await matrix.setStepsPerTx(1)).wait();
    model.steps = 1;
    for (let i = 0; i < 12; i++) {
        const m = await joiner(provider, deployed, people[0].id);
        model.register(m.wallet.address, people[0].id);
        people.push(m);
    }
    const waiting = (await matrix.getOwnerView()).queued;
    check("queue: placements wait when stepsPerTx is small", waiting > 0n && waiting === BigInt(model.queue.length), `${waiting} waiting`);
    await moneyAddsUp("with placements waiting (their price is held)");
    t.gas("processQueue (all waiting)", await (await matrix.connect(stranger).processQueue(waiting, { gasLimit: TX_GAS })).wait());
    model.process(Number(waiting));
    check("queue: anyone can place the waiting IDs", (await matrix.getOwnerView()).queued === BigInt(model.queue.length));
    await (await matrix.setStepsPerTx(plan.stepsPerTx)).wait();
    model.steps = Number(plan.stepsPerTx);
    await matchesModel("after processQueue");

    /* ------------------------------------ 7. new packages and paused sales */

    const newPrice = ethers.parseUnits("500", decimals);
    check("addPackage: a stranger cannot add one", await doesRevert(() => matrix.connect(stranger).addPackage.staticCall(newPrice), "OnlyOwner"));
    check("addPackage: price 0 is refused", await doesRevert(() => matrix.addPackage.staticCall(0), "ZeroPrice"));
    await (await matrix.addPackage(newPrice)).wait();
    model.addPackage(newPrice);
    const home = await matrix.getHomeView(ethers.ZeroAddress, 0);
    check("addPackage: the views list the new package", home.packages.length === 4 && home.packages[3].price === newPrice);
    check("addPackage: the root holds the top of the new board", (await matrix.positionsOf(1, 4))[0] === 0n);
    const climber = people.find((p) => model.members[p.id].packages.has(3) && !model.members[p.id].packages.has(4));
    if (climber) {
        await upgrader(deployed, climber.wallet, 4);
        model.upgrade(climber.wallet.address, 4);
        check("addPackage: members can upgrade into it", await matrix.hasPackage(climber.id, 4));
    }
    await (await matrix.setPackageOpen(2, false)).wait();
    const closed = people.find((p) => !model.members[p.id].packages.has(2));
    check("setPackageOpen: a paused package cannot be bought", await doesRevert(() => matrix.connect(closed.wallet).upgrade.staticCall(2), "PackageClosed"));
    await (await matrix.setPackageOpen(2, true)).wait();
    await matchesModel("after a new package");
    await moneyAddsUp("after a new package");

    /* ------------------------------------ 8. views match the small views */

    const viewer = people[1];
    const hv = await matrix.getHomeView(viewer.wallet.address, people[0].id);
    const m = await matrix.getHistoryView(viewer.wallet.address, 0, 0);
    check("view: home member fields", hv.isMember && hv.myId === BigInt(viewer.id) && hv.myCycles === BigInt(m.cycles) && hv.myBoardEarned === m.boardEarned && hv.myReferralEarned === m.referralEarned);
    check("view: home sponsor link", hv.refValid && hv.refAccount === people[0].wallet.address);
    const myList = await matrix.positionsOf(viewer.id, 1);
    check("view: newest ID per package", hv.mine[0].count === BigInt(myList.length) && hv.mine[0].latestIndex === myList[myList.length - 1]);
    const bv = await matrix.getBoardView(viewer.wallet.address, 1, ethers.MaxUint256, 0, 50);
    const focus = await matrix.getPosition(1, bv.focus);
    const kidsOk = bv.nodes.slice(1, 4).every((n, i) => (i < Number(focus.filled) ? n.exists && n.index === focus.kids[i] : !n.exists));
    check("view: board opens the viewer's newest ID with its 3 slots", bv.focus === myList[myList.length - 1] && kidsOk);
    const tv = await matrix.getTeamView(people[0].wallet.address, 0, 100);
    check("view: team lists the people sponsored", tv.directsTotal === BigInt(model.members.filter((x) => x?.sponsor === people[0].id).length));
    const ov = await matrix.getOwnerView();
    check("view: owner view", ov.launched && ov.packageCount === 4n && ov.totalFree === 7n);
    for (const [ name, args ] of [ [ "getHomeView", [ viewer.wallet.address, 1 ] ], [ "getBoardView", [ viewer.wallet.address, 1, 0, 0, 100 ] ], [ "getPlanView", [] ], [ "getTeamView", [ people[0].wallet.address, 0, 100 ] ] ]) {
        const gas = await provider.estimateGas({ to: deployed.addresses.RebornMatrix, data: matrix.interface.encodeFunctionData(name, args) });
        check(`view: ${name} gas is far below an RPC's limit`, gas < 5_000_000n, `${gas.toLocaleString()} gas`);
    }

    /* ------------------------------------ 9. payable + sendOutETH */

    const nonView = contracts.RebornMatrix.abi.filter((f) => f.type === "function" && ![ "view", "pure" ].includes(f.stateMutability));
    check("payable: every function that sends a transaction accepts BNB", nonView.every((f) => f.stateMutability === "payable"), `${nonView.length} functions`);
    const payer = await newPerson(provider);
    const payerMatrix = await payFor(deployed, payer, 1);
    await (await payerMatrix.register(1, { value: ethers.parseEther("0.03"), gasLimit: TX_GAS })).wait();
    model.register(payer.address, 1);
    check("payable: BNB sent with register stays in the contract", (await provider.getBalance(deployed.addresses.RebornMatrix)) === ethers.parseEther("0.03"));
    const [ r1, r2, r3 ] = [ 1, 2, 3 ].map(() => ethers.Wallet.createRandom().address);
    check("sendOutETH: a stranger cannot call it", await doesRevert(() => matrix.connect(stranger).sendOutETH.staticCall([ r1 ]), "OnlyOwner"));
    await (await matrix.sendOutETH([ r1, r2, r3 ])).wait();
    check("sendOutETH: BNB split equally, none left", (await provider.getBalance(r1)) === ethers.parseEther("0.01") && (await provider.getBalance(deployed.addresses.RebornMatrix)) === 0n);

    /* ------------------------------------ 10. wallets */

    const mover = people[5];
    const fresh = ethers.Wallet.createRandom().connect(provider);
    check("transferWallet: to a member is refused", await doesRevert(() => matrix.connect(mover.wallet).transferWallet.staticCall(people[6].wallet.address), "AlreadyAMember"));
    check("transferWallet: to a company wallet is refused", await doesRevert(() => matrix.connect(mover.wallet).transferWallet.staticCall(companies[2]), "RootAndCompanyMustDiffer"));
    await (await matrix.connect(mover.wallet).transferWallet(fresh.address)).wait();
    model.members[mover.id].account = fresh.address.toLowerCase();
    model.idOf.set(fresh.address.toLowerCase(), mover.id);
    check("transferWallet: the account moved, the old wallet is out", (await matrix.idOf(fresh.address)) === BigInt(mover.id) && (await matrix.idOf(mover.wallet.address)) === 0n);
    check("setCompanyWallet: the root wallet is refused", await doesRevert(() => matrix.setCompanyWallet.staticCall(0, s.ROOT_WALLET), "RootAndCompanyMustDiffer"));
    check("setCompanyWallet: only 0, 1, 2 (product, marketing, treasury)", await doesRevert(() => matrix.setCompanyWallet.staticCall(3, fresh.address), "CompanyWallets"));
    check("setCompanyWallet: a stranger cannot call it", await doesRevert(() => matrix.connect(stranger).setCompanyWallet.staticCall(1, fresh.address), "OnlyOwner"));
    const newMarketing = ethers.Wallet.createRandom().address;
    await (await matrix.setCompanyWallet(1, newMarketing)).wait();
    model.companies[1] = newMarketing.toLowerCase();
    companies[1] = newMarketing;
    check("setRootWallet: a stranger cannot call it", await doesRevert(() => matrix.connect(stranger).setRootWallet.staticCall(fresh.address), "OnlyOwner"));

    // More sign-ups so money flows to the moved account's new wallet
    for (let i = 0; i < 9; i++) {
        const j = await joiner(provider, deployed, mover.id);
        model.register(j.wallet.address, mover.id);
    }
    check("transferWallet: later pay goes to the new wallet", (await token.balanceOf(fresh.address)) > 0n, usdt(await token.balanceOf(fresh.address)));
    await matchesModel("at the end");
    await moneyAddsUp("at the end");
    check("money: the owner received nothing from the plan", (await token.balanceOf(owner.address)) === 0n);
    const [ , paidIn, referral, board, company ] = await matrix.getTotals();
    console.log(`      paid in ${usdt(paidIn)} = referral ${usdt(referral)} + board ${usdt(board)} + company ${usdt(company)} + held ${usdt((await matrix.getTotals())[0])}`);
    const [ product, marketing, treasury ] = await Promise.all(companies.map((w) => token.balanceOf(w)));
    console.log(`      root wallet ${usdt(await token.balanceOf(s.ROOT_WALLET))}, product ${usdt(product)}, marketing ${usdt(marketing)}, treasury ${usdt(treasury)}`);
    const oldMarketing = await token.balanceOf(companyWalletsOf(s)[1]);
    check("company: product gets twice the treasury, marketing (old + new wallet) the same as the treasury", treasury * 2n - product < 1000n && marketing + oldMarketing <= treasury && treasury - (marketing + oldMarketing) < 1000n, `${usdt(product)} / ${usdt(marketing + oldMarketing)} / ${usdt(treasury)}`);
}
