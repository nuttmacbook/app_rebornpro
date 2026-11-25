// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/*
 * YOUR CODE. REBORN PRO: a 1-to-3 board per package that re-buys itself (Reborn), paid in one token (USDT).
 *
 *   register(sponsorId)     join package 1 under a sponsor's link (approve the price first)
 *   upgrade(pkg)            buy the next package (needs the package before it); placed near the sponsor
 *   processQueue(steps)     anyone can push waiting placements forward (register and upgrade already do)
 *   transferWallet(to)      moves the caller's whole account to a new wallet
 *
 * Owner:
 *   placeFree(accounts, pkg) free IDs for the project's investors, under the root, only before launchPublic()
 *   launchPublic()          opens sign-ups for everyone; free placement is closed for good
 *   addPackage(price)       a new package at the end of the upgrade path (its board starts with the root)
 *   setPackageOpen(pkg, on) pause or resume sales of one package
 *
 * Where a new ID goes: the shallowest open slot, left to right (openDepth), below an ID of one member, the same
 * way for every kind of entry: that member's IDs in order (1, 1.1, 1.2 ...), each taking new IDs until its first two
 * levels (3 + 9 slots) are full, then the next ID takes over.
 * Whose IDs:
 *   - sign-up            the sponsor's (package 1)
 *   - upgrade            the nearest sponsor up the line who holds this package (only to find a place:
 *                        the referral share still goes to the member's own sponsor)
 *   - reborn             the member's own, so it stays inside the member's team
 *   - free (investors)   the root's
 *
 * Money of every paid entry (new, upgrade or reborn), split by which slot it takes on the board above:
 *   referral share  -> the member's sponsor from sign-up, always (the root has none: company wallets)
 *   company shares  -> three company wallets: product, marketing, treasury (5% / 2.5% / 2.5% in settings)
 *   cash share      -> owner of the board above (slot 1: 60%, slots 2 and 3: 10%)
 *   reborn share    -> kept on the board above (slots 2 and 3: 50% each); at 3 filled slots it is exactly one
 *                      price and pays that member's next ID (Reborn), placed through the queue
 * Free entries move no money. A board completed with less than one price kept is reborn for free, and what
 * it did keep goes to the company wallets.
 * Anything else for the company (the root's own referral share, money a board kept but did not use, rounding) is split
 * between the three company wallets in the same proportion as their shares; rounding dust goes to the treasury.
 *
 * Two contracts, one storage: RebornMatrix (behind the proxy) does everything that writes; every read the website uses
 * lives in RebornViews, which RebornMatrix runs on its own storage (delegatecall from fallback). Both inherit
 * RebornStorage, so the layout is the same by construction. Splitting keeps RebornMatrix under the 24,576 byte limit,
 * and the owner can swap RebornViews (setViews) without upgrading the proxy.
 *
 * No settings are written in this file: token, wallets, prices and percentages come from
 * dev/settings/contracts/RebornMatrix.env and are passed to initialize() when the contract is deployed.
 *
 * Money rule: the contract only holds the reborn money kept on boards and the price of waiting paid
 * placements, and totalHeld always equals the token balance of this contract (the tests check both).
 */

interface IRebornToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

contract RebornConstant {
    uint256 constant VERSION = 1000;
    address constant ZERO = address(0);
    uint256 constant BPS = 10_000;
    uint256 constant SLOTS = 3;
    uint256 constant COMPANY_WALLETS = 3;   // 0 product, 1 marketing, 2 treasury

    // Bounds of the code itself, so every loop and every view has a provable size
    uint256 constant MAX_PACKAGES = 32;
    uint256 constant TREE_NODES = 13;          // nodes returned by getBoardView: 3 levels (1 + 3 + 9)
    uint256 constant MAX_PAGE = 100;           // rows per page in list views
    uint256 constant MAX_FREE = 50;            // accounts one placeFree() may take
    uint256 constant AUTO = type(uint256).max; // "pick for me" in getBoardView

    // Kind of an ID (Position.kind, Job.kind)
    uint8 constant SIGN_UP = 0;
    uint8 constant UPGRADE = 1;
    uint8 constant REBORN = 2;
    uint8 constant FREE = 3;

    // History rows (HistoryRow.kind). A new ID of the member, a referral share, or a slot below one of the member's IDs.
    uint8 constant H_NEW_ID = 0;
    uint8 constant H_REFERRAL = 1;
    uint8 constant H_SLOT = 2;

    /* ------------------------------------ errors (custom errors keep the contract small; the name says why) */

    error OnlyOwner(); // "Only Owner"
    error AlreadyInitialized(); // "Already Initialized"
    error ZeroAddress(); // "Zero Address"
    error RootAndCompanyMustDiffer(); // "Root And Company Must Differ"
    error TokenIsNotAContract(); // "Token Is Not A Contract"
    error PackageCount(); // "Package Count"
    error ZeroPrice(); // "Zero Price"
    error SlotSplitMustBe100(); // "Slot Split Must Be 100"
    error RebornMustAddTo100(); // "Reborn Must Add To 100"
    error CompanyWallets(); // "Company Wallets"
    error StepsPerTx(); // "Steps Per Tx"
    error NotLaunched(); // "Not Launched"
    error AlreadyLaunched(); // "Already Launched"
    error AlreadyRegistered(); // "Already Registered"
    error UnknownSponsor(); // "Unknown Sponsor"
    error PaymentFailed(); // "Payment Failed"
    error NotAMember(); // "Not A Member"
    error UnknownPackage(); // "Unknown Package"
    error PackageClosed(); // "Package Closed"
    error AlreadyHasPackage(); // "Already Has Package"
    error NeedsThePackageBefore(); // "Needs The Package Before"
    error QueueIsEmpty(); // "Queue Is Empty"
    error ZeroSteps(); // "Zero Steps"
    error AlreadyAMember(); // "Already A Member"
    error FreeCount(); // "Free Count"
    error NoRecipients(); // "No Recipients"
    error NothingToSend(); // "Nothing To Send"
    error ZeroRecipient(); // "Zero Recipient"
    error TransferFailed(); // "Transfer Failed"
    error UnknownPosition(); // "Unknown Position"
    error ViewsIsNotAContract(); // "Views Is Not A Contract"
}

contract RebornStorage is RebornConstant {
    struct Package {
        uint256 price;
        bool isOpen;            // the owner can pause sales; boards keep running
        uint256 positions;      // IDs ever placed (including the root's)
        uint256 completed;      // boards that filled all 3 slots
        uint256 members;        // members who hold this package
    }

    struct Member {
        address account;
        uint64 sponsor;         // member id of the sponsor from sign-up (0 for the root)
        uint64 joinedAt;
        uint32 directs;
        uint32 positions;       // IDs across all packages
        uint32 cycles;          // boards completed across all packages
        uint256 referralEarned;
        uint256 boardEarned;
    }

    struct Position {
        uint64 member;
        uint64 createdAt;
        uint64 parent;          // index of the ID above (the root points at itself)
        uint8 filled;           // 0..3 slots below are taken
        uint8 openDepth;        // levels down to the nearest open slot (0 = this ID has one)
        uint8 kind;             // SIGN_UP, UPGRADE, REBORN or FREE
        uint64[3] kids;         // index in each slot (valid below `filled`)
        uint256 fund;           // reborn money kept on this board
    }

    /*
     * History: each row is two words, written when it happens (two storage slots per row).
     *   word 0: time (40 bits) | block (40) | kind (8) | pkg (8) | slot (8) | idKind (8) | other (64) | index (64)
     *   word 1: ref (64) | amount (96) | extra (96)
     * H_NEW_ID   index = the new ID, ref = ID above it, slot = slot it took, other = owner of the ID above,
     *            amount = price paid (sign-up/upgrade from the wallet, reborn from the money kept, 0 when free),
     *            extra = board that completed (reborn only). idKind = SIGN_UP, UPGRADE, REBORN or FREE.
     * H_REFERRAL other = the person invited, index = their new ID, amount = referral paid, idKind = kind of that ID.
     * H_SLOT     index = the member's ID, slot = slot filled, other/ref = who and which ID took it, amount = cash paid,
     *            extra = kept for Reborn, idKind = kind of the ID that took it (free and unfunded reborn pay nothing).
     * Packed by hand: the same rows as structs made the contract too big for the 24,576 byte limit.
     */

    struct Job {
        uint8 pkg;
        uint8 kind;
        bool isPaid;            // false for free IDs and unfunded reborns
        uint64 member;
        uint256 from;           // board that completed (reborn only)
    }

    // What initialize() receives from dev/settings/contracts/RebornMatrix.env
    struct PlanInput {
        uint256[] prices;
        uint256 referralBps;
        uint256[] companyBps;   // per company wallet: product, marketing, treasury
        uint256[] cashBps;      // per slot
        uint256[] rebornBps;    // per slot, must add up to 100%
        uint256 stepsPerTx;
    }

    address _owner;
    bool _initialized;
    bool _launched;

    IRebornToken _token;
    address[3] _companies;      // product, marketing, treasury

    uint16 _referralBps;
    uint16 _companyBps;         // the three shares together
    uint16[3] _companyShareBps;
    uint16[3] _cashBps;
    uint16[3] _rebornBps;
    uint16 _stepsPerTx;

    uint8 _packageCount;
    mapping (uint8 => Package) _packages;

    uint64 _memberCount;
    mapping (address => uint64) _idOf;
    mapping (uint64 => Member) _members;
    mapping (uint64 => uint64[]) _directs;
    mapping (uint64 => mapping (uint8 => bool)) _hasPackage;

    mapping (uint8 => mapping (uint256 => Position)) _positions;
    mapping (uint64 => mapping (uint8 => uint256[])) _memberPositions;

    // Placements waiting their turn (FIFO); the money of paid ones is already in the contract
    mapping (uint256 => Job) _jobs;
    uint256 _jobHead;
    uint256 _jobTail;

    uint256 _totalHeld;         // = token balance of this contract
    uint256 _totalIn;           // every register() and upgrade() payment
    uint256 _totalReferral;
    uint256 _totalBoardPaid;
    uint256 _totalCompany;
    uint256 _totalFree;         // free IDs placed

    // Per member and package: the position in _memberPositions of the ID now taking new IDs.
    // It only moves forward: once an ID's first two levels are full they stay full.
    mapping (uint64 => mapping (uint8 => uint256)) _cursor;

    // Each member's history, oldest first, two words per row (it follows the member id, so transferWallet keeps it)
    mapping (uint64 => uint256[]) _history;

    // RebornViews: where fallback() sends every read this contract does not have itself
    address _views;
}

contract RebornMatrix is RebornStorage {
    /* ------------------------------------ events */

    event Registered(uint256 indexed id, address indexed account, uint256 indexed sponsor);
    event PackageBought(uint256 indexed member, uint256 indexed pkg, uint256 price, uint256 kind);
    event Placed(uint256 indexed pkg, uint256 indexed index, uint256 indexed member, uint256 parent, uint256 slot, uint256 kind);
    event ReferralPaid(uint256 indexed sponsor, uint256 indexed from, address to, uint256 amount);
    event BoardPaid(uint256 indexed member, uint256 indexed pkg, uint256 index, uint256 amount);
    event BoardCompleted(uint256 indexed member, uint256 indexed pkg, uint256 index, bool isPaid);
    event CompanyPaid(uint256 indexed pkg, address indexed company, uint256 amount);
    event PackageAdded(uint256 indexed pkg, uint256 price);
    event PackageOpenChanged(uint256 indexed pkg, bool isOpen);
    event Launched(uint256 timestamp);
    event StepsPerTxChanged(uint256 previousSteps, uint256 newSteps);
    event CompanyWalletChanged(uint256 indexed which, address indexed previousWallet, address indexed newWallet);
    event WalletTransferred(uint256 indexed member, address indexed previousWallet, address indexed newWallet);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SentOutETH(address indexed by, uint256 recipients, uint256 share, uint256 total);
    event ViewsChanged(address indexed previousViews, address indexed newViews);

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() private view {
        if (_owner != msg.sender) revert OnlyOwner();
    }

    /** Runs once, inside the proxy's constructor. plan_.prices[i] is package i + 1. */
    /** companies_ = product, marketing, treasury wallets (3, none of them the root); views_ = RebornViews */
    function initialize(address owner_, address token_, address root_, address[] calldata companies_, address views_, PlanInput calldata plan_) public payable {
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == ZERO || root_ == ZERO) revert ZeroAddress();
        if (companies_.length != COMPANY_WALLETS) revert CompanyWallets();
        for (uint256 i; i < COMPANY_WALLETS; i++) {
            if (companies_[i] == ZERO) revert ZeroAddress();
            if (companies_[i] == root_) revert RootAndCompanyMustDiffer();
            _companies[i] = companies_[i];
        }
        if (token_.code.length == 0) revert TokenIsNotAContract();
        uint256 count = plan_.prices.length;
        if (count == 0 || count > MAX_PACKAGES) revert PackageCount();
        if (plan_.stepsPerTx == 0 || plan_.stepsPerTx > type(uint16).max) revert StepsPerTx();

        _initialized = true;
        _owner = owner_;
        _token = IRebornToken(token_);
        _setViews(views_);
        _stepsPerTx = uint16(plan_.stepsPerTx);
        _setSplit(plan_);

        uint64 id = ++_memberCount;
        _idOf[root_] = id;
        _members[id].account = root_;
        _members[id].joinedAt = uint64(block.timestamp);
        emit Registered(id, root_, 0);

        for (uint256 i; i < count; i++) _addPackage(plan_.prices[i]);
    }

    /** Every slot hands out exactly what it takes in, and the reborn shares add up to one price */
    function _setSplit(PlanInput calldata plan_) private {
        if (plan_.cashBps.length != SLOTS || plan_.rebornBps.length != SLOTS) revert SlotSplitMustBe100();
        if (plan_.companyBps.length != COMPANY_WALLETS) revert CompanyWallets();
        uint256 company;
        for (uint256 i; i < COMPANY_WALLETS; i++) {
            _companyShareBps[i] = uint16(plan_.companyBps[i]);
            company += plan_.companyBps[i];
        }
        // Money for the company that is not a share (root referral, unused board money) is split by these shares
        if (company == 0) revert CompanyWallets();
        uint256 reborn;
        for (uint256 s; s < SLOTS; s++) {
            if (plan_.referralBps + company + plan_.cashBps[s] + plan_.rebornBps[s] != BPS) revert SlotSplitMustBe100();
            _cashBps[s] = uint16(plan_.cashBps[s]);
            _rebornBps[s] = uint16(plan_.rebornBps[s]);
            reborn += plan_.rebornBps[s];
        }
        if (reborn != BPS) revert RebornMustAddTo100();
        _referralBps = uint16(plan_.referralBps);
        _companyBps = uint16(company);
    }

    receive() external payable { }

    /** Reads this contract does not have (page views, small getters) run in RebornViews on this storage */
    fallback() external payable {
        address target = _views;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    /* ------------------------------------ what members do */

    /** Joins package 1 under `sponsorId`. Pays the package 1 price (approve it first). */
    function register(uint256 sponsorId) public payable {
        if (!_launched) revert NotLaunched();
        _signUp(msg.sender, sponsorId);
        _process(_stepsPerTx);
    }

    /** A paid sign-up of `account` into package 1 under `sponsorId`; the caller pays the price */
    function _signUp(address account, uint256 sponsorId) private {
        if (account == ZERO) revert ZeroAddress();
        if (_isCompany(account)) revert RootAndCompanyMustDiffer();
        if (_idOf[account] != 0) revert AlreadyRegistered();
        if (sponsorId == 0 || sponsorId > _memberCount) revert UnknownSponsor();
        if (!_packages[1].isOpen) revert PackageClosed();
        _buy(_newMember(account, uint64(sponsorId)), 1, SIGN_UP);
    }

    /** Buys package `pkg` with the wallet (approve its price first). Needs package pkg - 1. */
    function upgrade(uint256 pkg) public payable {
        if (!_launched) revert NotLaunched();
        uint64 id = _idOf[msg.sender];
        if (id == 0) revert NotAMember();
        if (pkg < 2 || pkg > _packageCount) revert UnknownPackage();
        uint8 p = uint8(pkg);
        if (!_packages[p].isOpen) revert PackageClosed();
        if (_hasPackage[id][p]) revert AlreadyHasPackage();
        if (!_hasPackage[id][p - 1]) revert NeedsThePackageBefore();

        _buy(id, p, UPGRADE);
        _process(_stepsPerTx);
    }

    /** Places up to `steps` waiting IDs. Anyone may call it; the money for them is already in the contract. */
    function processQueue(uint256 steps) public payable {
        if (_jobHead >= _jobTail) revert QueueIsEmpty();
        if (steps == 0) revert ZeroSteps();
        _process(steps);
    }

    /** Moves the caller's whole account to `newWallet` (it must not be a member yet) */
    function transferWallet(address newWallet) public payable {
        uint64 id = _idOf[msg.sender];
        if (id == 0) revert NotAMember();
        _moveWallet(id, newWallet);
    }

    function _newMember(address account, uint64 sponsor) private returns (uint64 id) {
        id = ++_memberCount;
        _idOf[account] = id;
        Member storage m = _members[id];
        m.account = account;
        m.sponsor = sponsor;
        m.joinedAt = uint64(block.timestamp);
        _members[sponsor].directs += 1;
        _directs[sponsor].push(id);
        emit Registered(id, account, sponsor);
    }

    function _buy(uint64 id, uint8 pkg, uint8 kind) private {
        uint256 price = _packages[pkg].price;
        if (!_token.transferFrom(msg.sender, address(this), price)) revert PaymentFailed();
        _totalHeld += price;
        _totalIn += price;
        _hasPackage[id][pkg] = true;
        _packages[pkg].members += 1;
        emit PackageBought(id, pkg, price, kind);
        _pushJob(pkg, kind, true, id, 0);
    }

    function _moveWallet(uint64 id, address to) private {
        if (to == ZERO) revert ZeroAddress();
        if (_isCompany(to)) revert RootAndCompanyMustDiffer();
        if (_idOf[to] != 0) revert AlreadyAMember();
        address previous = _members[id].account;
        _idOf[previous] = 0;
        _idOf[to] = id;
        _members[id].account = to;
        emit WalletTransferred(id, previous, to);
    }

    /* ------------------------------------ what the owner does */

    /**
     * Free IDs for investors, under the root of package `pkg`, before launch only. New accounts become members
     * with the root as sponsor. Each account gets the package once (like buying it).
     */
    function placeFree(address[] calldata accounts, uint256 pkg) public payable onlyOwner {
        if (_launched) revert AlreadyLaunched();
        if (pkg == 0 || pkg > _packageCount) revert UnknownPackage();
        uint256 count = accounts.length;
        if (count == 0 || count > MAX_FREE) revert FreeCount();
        uint8 p = uint8(pkg);
        for (uint256 i; i < count; i++) {
            address account = accounts[i];
            if (account == ZERO) revert ZeroAddress();
            if (_isCompany(account)) revert RootAndCompanyMustDiffer();
            uint64 id = _idOf[account];
            if (id == 0) id = _newMember(account, 1);
            if (_hasPackage[id][p]) revert AlreadyHasPackage();
            _hasPackage[id][p] = true;
            _packages[p].members += 1;
            _totalFree += 1;
            emit PackageBought(id, p, 0, FREE);
            _pushJob(p, FREE, false, id, 0);
        }
        _process(_stepsPerTx);
    }

    /**
     * Paid sign-ups made by the owner for `accounts` (new wallets), package 1 under `sponsorId`, before or after
     * launch. The owner wallet pays package 1's price for each (approve price x count first); the money is split
     * exactly like a member's own sign-up, and the sponsor gets the referral share of every later entry.
     * Each wallet is placed (with any Reborn it causes) before the next one signs up, so the boards end up exactly
     * as if the wallets had called register() one after another, in list order.
     */
    function registerFor(address[] calldata accounts, uint256 sponsorId) public payable onlyOwner {
        uint256 count = accounts.length;
        if (count == 0 || count > MAX_FREE) revert FreeCount();
        for (uint256 i; i < count; i++) {
            _signUp(accounts[i], sponsorId);
            _process(_stepsPerTx);
        }
    }

    /** Opens sign-ups to everyone. One way: free placement is closed for good. */
    function launchPublic() public payable onlyOwner {
        if (_launched) revert AlreadyLaunched();
        _launched = true;
        emit Launched(block.timestamp);
    }

    /** A new package at the end of the upgrade path; the root takes the top of its board */
    function addPackage(uint256 price) public payable onlyOwner {
        if (_packageCount >= MAX_PACKAGES) revert PackageCount();
        _addPackage(price);
    }

    function _addPackage(uint256 price) private {
        if (price == 0) revert ZeroPrice();
        uint8 pkg = ++_packageCount;
        Package storage p = _packages[pkg];
        p.price = price;
        p.isOpen = true;
        p.positions = 1;
        p.members = 1;
        _hasPackage[1][pkg] = true;
        Position storage top = _positions[pkg][0];
        top.member = 1;
        top.createdAt = uint64(block.timestamp);
        _memberPositions[1][pkg].push(0);
        _members[1].positions += 1;
        emit PackageAdded(pkg, price);
        emit Placed(pkg, 0, 1, 0, 0, SIGN_UP);
    }

    function setPackageOpen(uint256 pkg, bool isOpen) public payable onlyOwner {
        if (pkg == 0 || pkg > _packageCount) revert UnknownPackage();
        _packages[uint8(pkg)].isOpen = isOpen;
        emit PackageOpenChanged(pkg, isOpen);
    }

    function setStepsPerTx(uint256 steps) public payable onlyOwner {
        if (steps == 0 || steps > type(uint16).max) revert StepsPerTx();
        emit StepsPerTxChanged(_stepsPerTx, steps);
        _stepsPerTx = uint16(steps);
    }

    /** which: 0 product, 1 marketing, 2 treasury */
    function setCompanyWallet(uint256 which, address wallet_) public payable onlyOwner {
        if (which >= COMPANY_WALLETS) revert CompanyWallets();
        if (wallet_ == ZERO) revert ZeroAddress();
        if (wallet_ == _members[1].account) revert RootAndCompanyMustDiffer();
        emit CompanyWalletChanged(which, _companies[which], wallet_);
        _companies[which] = wallet_;
    }

    /** Wallet of member #1 (the root): its board pay and referral share go here from now on */
    function setRootWallet(address root_) public payable onlyOwner {
        _moveWallet(1, root_);
    }

    /** Swaps the read-only RebornViews (it must share RebornStorage: deploy it from this same file) */
    function setViews(address views_) public payable onlyOwner {
        _setViews(views_);
    }

    function _setViews(address views_) private {
        if (views_.code.length == 0) revert ViewsIsNotAContract();
        emit ViewsChanged(_views, views_);
        _views = views_;
    }

    function transferOwnership(address newOwner) public payable onlyOwner {
        if (newOwner == ZERO) revert ZeroAddress();
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }

    /** Every function is payable, so BNB can end up in here. This sends all of it out, split equally. */
    function sendOutETH(address[] calldata recipients) external payable onlyOwner {
        uint256 count = recipients.length;
        if (count == 0) revert NoRecipients();
        uint256 share = address(this).balance / count;
        if (share == 0) revert NothingToSend();
        for (uint256 i; i < count; i++) {
            if (recipients[i] == ZERO) revert ZeroRecipient();
            (bool success, ) = recipients[i].call{ value: share }("");
            if (!success) revert TransferFailed();
        }
        emit SentOutETH(msg.sender, count, share, share * count);
    }

    /* ------------------------------------ the board */

    function _pushJob(uint8 pkg, uint8 kind, bool isPaid, uint64 member, uint256 from) private {
        _jobs[_jobTail++] = Job({ pkg: pkg, kind: kind, isPaid: isPaid, member: member, from: from });
    }

    /** Places waiting IDs in arrival order. Reborns created on the way join the end of the same queue. */
    function _process(uint256 steps) private {
        while (steps > 0 && _jobHead < _jobTail) {
            uint256 job = _jobHead++;
            Job memory item = _jobs[job];
            delete _jobs[job];
            _place(item);
            steps -= 1;
        }
    }

    /** One ID enters a board: it takes its slot, splits its price, and may complete the board above */
    function _place(Job memory job) private {
        uint8 pkg = job.pkg;
        uint256 above = _openSlotUnder(pkg, _entryPoint(job));
        uint256 index = _packages[pkg].positions++;

        Position storage me = _positions[pkg][index];
        me.member = job.member;
        me.createdAt = uint64(block.timestamp);
        me.parent = uint64(above);
        me.kind = job.kind;
        _memberPositions[job.member][pkg].push(index);
        _members[job.member].positions += 1;

        Position storage board = _positions[pkg][above];
        uint256 slot = board.filled;
        board.kids[slot] = uint64(index);
        board.filled = uint8(slot + 1);
        _refreshOpenDepth(pkg, above);
        emit Placed(pkg, index, job.member, above, slot, job.kind);

        _settle(job, above, slot, index);
        if (slot + 1 == SLOTS) _complete(pkg, above);
    }

    /** Pays a placed entry (when paid) and writes its rows: the new ID for its owner, the slot for the owner above */
    function _settle(Job memory job, uint256 above, uint256 slot, uint256 index) private {
        uint8 pkg = job.pkg;
        uint64 boardOwner = _positions[pkg][above].member;
        _log(job.member, _head(H_NEW_ID, pkg, slot, job.kind, boardOwner, index), above, job.isPaid ? _packages[pkg].price : 0, job.from);
        (uint256 cash, uint256 kept) = job.isPaid ? _split(pkg, above, slot, job.member, index, job.kind) : (0, 0);
        _log(boardOwner, _head(H_SLOT, pkg, slot, job.kind, job.member, above), index, cash, kept);
    }

    /** Everything in word 0 of a history row except the time and block */
    function _head(uint8 kind, uint8 pkg, uint256 slot, uint8 idKind, uint64 other, uint256 index) private pure returns (uint256) {
        return uint256(kind) | uint256(pkg) << 8 | slot << 16 | uint256(idKind) << 24 | uint256(other) << 32 | index << 96;
    }

    /** Stores one history row with the time and block (amounts are far below 2^96 for any real token supply) */
    function _log(uint64 member, uint256 head, uint256 ref, uint256 amount, uint256 extra) private {
        uint256[] storage list = _history[member];
        list.push(block.timestamp | block.number << 40 | head << 80);
        list.push(ref | amount << 64 | extra << 160);
    }

    /** Splits one paid entry by the slot it took */
    function _split(uint8 pkg, uint256 above, uint256 slot, uint64 member, uint256 index, uint8 kind) private returns (uint256 cash, uint256 kept) {
        uint256 price = _packages[pkg].price;
        Position storage board = _positions[pkg][above];
        uint64 boardOwner = board.member;

        _payReferral(pkg, member, price * _referralBps / BPS, index, kind);

        cash = price * _cashBps[slot] / BPS;
        if (cash > 0) {
            _members[boardOwner].boardEarned += cash;
            _totalBoardPaid += cash;
            _send(_members[boardOwner].account, cash);
            emit BoardPaid(boardOwner, pkg, above, cash);
        }
        kept = price * _rebornBps[slot] / BPS;
        board.fund += kept;

        // What rounding leaves (and the company share) goes to the company, so the slot hands out exactly the price
        _payCompany(pkg, price - price * _referralBps / BPS - cash - kept);
    }

    /** All 3 slots taken: the owner is reborn, paid by the money kept on this board when it reaches one price */
    function _complete(uint8 pkg, uint256 index) private {
        Position storage board = _positions[pkg][index];
        uint64 owner_ = board.member;
        uint256 price = _packages[pkg].price;
        uint256 fund = board.fund;
        bool isPaid = fund >= price;
        board.fund = 0;
        if (isPaid) {
            if (fund > price) _payCompany(pkg, fund - price);
        } else if (fund > 0) {
            _payCompany(pkg, fund);
        }
        _members[owner_].cycles += 1;
        _packages[pkg].completed += 1;
        emit BoardCompleted(owner_, pkg, index, isPaid);
        _pushJob(pkg, REBORN, isPaid, owner_, index);
    }

    /**
     * The ID a new one goes below: one of whose IDs (the sponsor's, the nearest sponsor's up the line who holds the
     * package, the member's own, or the root's), then which of them (_entryOf).
     */
    function _entryPoint(Job memory job) private returns (uint256) {
        if (job.kind == REBORN) return _entryOf(job.member, job.pkg);
        if (job.kind == FREE) return _entryOf(1, job.pkg);
        uint64 sponsor = _members[job.member].sponsor;
        if (job.kind == UPGRADE) {
            while (sponsor != 0 && _memberPositions[sponsor][job.pkg].length == 0) sponsor = _members[sponsor].sponsor;
        }
        return _entryOf(sponsor == 0 ? 1 : sponsor, job.pkg);
    }

    /**
     * Which of `member`'s IDs in `pkg`: the first ID, in order, that still has an open slot within two levels
     * (openDepth 0 or 1, so 3 + 9 slots); the newest when none has.
     * The cursor only moves forward, so over the life of the contract each ID is stepped past once.
     * Jobs run in order, so the member's first ID is always placed already; the top of the board is a safe fallback.
     */
    function _entryOf(uint64 member, uint8 pkg) private returns (uint256) {
        uint256[] storage list = _memberPositions[member][pkg];
        uint256 count = list.length;
        if (count == 0) return 0;
        mapping (uint256 => Position) storage tree = _positions[pkg];
        uint256 idx = _cursor[member][pkg];
        uint256 start = idx;
        while (idx + 1 < count && tree[list[idx]].openDepth > 1) idx += 1;
        if (idx != start) _cursor[member][pkg] = idx;
        return list[idx];
    }

    /**
     * Shallowest open slot below `node`, left to right. Each step goes one level down towards the smallest
     * openDepth (leftmost on a tie), and openDepth is 0 exactly when a slot is open, so it ends within openDepth steps.
     */
    function _openSlotUnder(uint8 pkg, uint256 node) private view returns (uint256) {
        mapping (uint256 => Position) storage tree = _positions[pkg];
        while (tree[node].filled == SLOTS) {
            uint64[3] storage kids = tree[node].kids;
            uint256 best = kids[0];
            if (tree[kids[1]].openDepth < tree[best].openDepth) best = kids[1];
            if (tree[kids[2]].openDepth < tree[best].openDepth) best = kids[2];
            node = best;
        }
        return node;
    }

    /** After `node` got a child: recompute openDepth upwards, stopping as soon as a value does not change */
    function _refreshOpenDepth(uint8 pkg, uint256 node) private {
        mapping (uint256 => Position) storage tree = _positions[pkg];
        while (true) {
            Position storage p = tree[node];
            uint8 depth = 0;
            if (p.filled == SLOTS) {
                uint8 low = tree[p.kids[0]].openDepth;
                uint8 b = tree[p.kids[1]].openDepth;
                uint8 c = tree[p.kids[2]].openDepth;
                if (b < low) low = b;
                if (c < low) low = c;
                depth = low + 1;
            }
            if (depth == p.openDepth) return;
            p.openDepth = depth;
            if (node == 0) return;
            node = p.parent;
        }
    }

    /** The sponsor from sign-up gets the referral share; the root has no sponsor, so its share goes to the company wallets */
    function _payReferral(uint8 pkg, uint64 member, uint256 amount, uint256 index, uint8 kind) private {
        if (amount == 0) return;
        uint64 sponsor = _members[member].sponsor;
        _totalReferral += amount;
        if (sponsor == 0) {
            _toCompanies(pkg, amount);
            emit ReferralPaid(0, member, ZERO, amount);
            return;
        }
        address to = _members[sponsor].account;
        _members[sponsor].referralEarned += amount;
        _send(to, amount);
        emit ReferralPaid(sponsor, member, to, amount);
        _log(sponsor, _head(H_REFERRAL, pkg, 0, kind, member, index), 0, amount, 0);
    }

    function _payCompany(uint8 pkg, uint256 amount) private {
        if (amount == 0) return;
        _totalCompany += amount;
        _toCompanies(pkg, amount);
    }

    /** Splits `amount` between product, marketing and treasury by their shares; the treasury takes the rounding */
    function _toCompanies(uint8 pkg, uint256 amount) private {
        uint256 left = amount;
        for (uint256 i; i < COMPANY_WALLETS; i++) {
            uint256 part = i + 1 == COMPANY_WALLETS ? left : amount * _companyShareBps[i] / _companyBps;
            if (part == 0) continue;
            left -= part;
            _send(_companies[i], part);
            emit CompanyPaid(pkg, _companies[i], part);
        }
    }

    function _isCompany(address account) private view returns (bool) {
        return account == _companies[0] || account == _companies[1] || account == _companies[2];
    }

    /** Every token leaving the contract goes through here, so totalHeld always matches the balance */
    function _send(address to, uint256 amount) private {
        _totalHeld -= amount;
        if (!_token.transfer(to, amount)) revert TransferFailed();
    }

    /* ------------------------------------ reading (the rest is in RebornViews) */

    function owner() public view returns (address) { return _owner; }
    function token() public view returns (address) { return address(_token); }
    function views() public view returns (address) { return _views; }
}

/**
 * Every read of RebornMatrix that the website uses, run by RebornMatrix's fallback with delegatecall, so it reads the
 * proxy's storage (address(this) is the proxy too). Called directly it only sees its own empty storage. It has no
 * function that writes; anything added here must stay read-only.
 */
contract RebornViews is RebornStorage {
    /* ------------------------------------ one struct per page */

    struct PackageInfo {
        uint256 pkg;
        uint256 price;
        bool isOpen;
        uint256 positions;
        uint256 completed;
        uint256 members;
        uint256 cyclePay;       // cash one completed board pays its owner
        uint256 referralPay;    // referral one entry pays the sponsor
    }

    struct MyPackage {
        bool has;
        uint256 count;          // IDs the viewer holds
        uint256 latestIndex;
        uint256 latestFilled;
        uint256 latestFund;
        uint256 firstIndex;
    }

    struct HomeView {
        address token;
        string tokenSymbol;
        uint8 tokenDecimals;
        bool launched;
        uint256 memberCount;
        uint256 queued;
        uint256 totalIn;
        uint256 totalReferral;
        uint256 totalBoardPaid;
        uint256 totalCompany;
        uint256 totalHeld;
        PackageInfo[] packages;
        uint256 refId;
        bool refValid;
        address refAccount;
        bool isMember;
        bool isOwner;
        uint256 myId;
        uint256 mySponsor;
        uint256 myDirects;
        uint256 myPositions;
        uint256 myCycles;
        uint256 myReferralEarned;
        uint256 myBoardEarned;
        uint256 myJoinedAt;
        uint256 walletBalance;
        uint256 allowance;
        MyPackage[] mine;
    }

    struct PlanView {
        string tokenSymbol;
        uint8 tokenDecimals;
        uint256 referralBps;
        uint256[] companyBps;
        uint256[] cashBps;
        uint256[] rebornBps;
        uint256 memberCount;
        bool launched;
        PackageInfo[] packages;
    }

    struct Node {
        bool exists;
        uint256 index;
        uint256 member;
        address account;
        uint256 filled;
        uint256 kind;
        uint256 createdAt;
    }

    struct BoardView {
        string tokenSymbol;
        uint8 tokenDecimals;
        uint256 packageCount;
        uint256 pkg;
        uint256 price;
        uint256 positionCount;
        uint256 focus;
        uint256 parent;         // AUTO when the focus is the root
        Node[] nodes;           // level order: node k has its children at 3k+1, 3k+2, 3k+3
        uint256 viewerId;
        uint256 myTotal;
        uint256[] myIndices;
        uint256[] myKinds;
        uint256[] myCounts;     // viewer's IDs in each package
        uint256[] prices;
    }

    struct Direct {
        uint256 id;
        address account;
        uint256 joinedAt;
        uint256 directs;
        uint256 positions;
        uint256 packages;       // how many packages this person holds
    }

    struct TeamView {
        uint256 myId;
        uint256 sponsorId;
        address sponsorAccount;
        uint256 directsTotal;
        Direct[] directs;
    }

    struct HistoryView {
        string tokenSymbol;
        uint8 tokenDecimals;
        uint256 memberId;
        address account;
        uint256 sponsor;
        uint256 joinedAt;
        uint256 referralEarned;
        uint256 boardEarned;
        uint256 cycles;
        uint256[] prices;       // price of each package (names on the page)
        uint256 total;          // rows stored for this member
        uint256[] rows;         // two words per row, newest row first, starting `offset` rows from the newest
    }

    struct OwnerView {
        address owner;
        address[3] companies;   // product, marketing, treasury
        address root;
        bool launched;
        uint256 stepsPerTx;
        uint256 queued;
        uint256 totalFree;
        uint256 packageCount;
        uint256 maxPackages;
        uint256 lastPrice;
        uint256 bnbHeld;
    }

    /* ------------------------------------ reading: small views */

    function launched() public view returns (bool) { return _launched; }
    function idOf(address account) public view returns (uint256) { return _idOf[account]; }
    function memberCount() public view returns (uint256) { return _memberCount; }
    function packageCount() public view returns (uint256) { return _packageCount; }
    function hasPackage(uint256 id, uint256 pkg) public view returns (bool) { return _hasPackage[uint64(id)][uint8(pkg)]; }
    function getPackage(uint256 pkg) public view returns (Package memory) { return _packages[uint8(pkg)]; }
    function getPosition(uint256 pkg, uint256 index) public view returns (Position memory) { return _positions[uint8(pkg)][index]; }
    function positionsOf(uint256 id, uint256 pkg) public view returns (uint256[] memory) { return _memberPositions[uint64(id)][uint8(pkg)]; }

    /** companyBps: product, marketing, treasury */
    function getSettings() public view returns (uint256 referralBps, uint256[] memory companyBps, uint256[] memory cashBps, uint256[] memory rebornBps, uint256 stepsPerTx) {
        companyBps = new uint256[](COMPANY_WALLETS);
        for (uint256 i; i < COMPANY_WALLETS; i++) companyBps[i] = _companyShareBps[i];
        cashBps = new uint256[](SLOTS);
        rebornBps = new uint256[](SLOTS);
        for (uint256 s; s < SLOTS; s++) {
            cashBps[s] = _cashBps[s];
            rebornBps[s] = _rebornBps[s];
        }
        return (_referralBps, companyBps, cashBps, rebornBps, _stepsPerTx);
    }


    /* ------------------------------------ reading: page views */

    /** Dashboard and sign-up page. `refId` = sponsor id from the link (0 = none). */
    function getHomeView(address viewer, uint256 refId) public view returns (HomeView memory v) {
        v.token = address(_token);
        v.tokenSymbol = _token.symbol();
        v.tokenDecimals = _token.decimals();
        v.launched = _launched;
        v.memberCount = _memberCount;
        v.queued = _jobTail - _jobHead;
        v.totalIn = _totalIn;
        v.totalReferral = _totalReferral;
        v.totalBoardPaid = _totalBoardPaid;
        v.totalCompany = _totalCompany;
        v.totalHeld = _totalHeld;
        v.packages = _packageInfos();
        v.refId = refId;
        v.refValid = refId > 0 && refId <= _memberCount;
        if (v.refValid) v.refAccount = _members[uint64(refId)].account;
        v.mine = new MyPackage[](_packageCount);
        if (viewer == ZERO) return v;
        v.isOwner = viewer == _owner;
        v.walletBalance = _token.balanceOf(viewer);
        v.allowance = _token.allowance(viewer, address(this));
        uint64 id = _idOf[viewer];
        if (id != 0) _fillMember(v, id);
    }

    function _fillMember(HomeView memory v, uint64 id) private view {
        Member storage m = _members[id];
        v.isMember = true;
        v.myId = id;
        v.mySponsor = m.sponsor;
        v.myDirects = m.directs;
        v.myPositions = m.positions;
        v.myCycles = m.cycles;
        v.myReferralEarned = m.referralEarned;
        v.myBoardEarned = m.boardEarned;
        v.myJoinedAt = m.joinedAt;
        uint256 count = _packageCount;
        for (uint256 i; i < count; i++) {
            uint8 pkg = uint8(i + 1);
            uint256[] storage list = _memberPositions[id][pkg];
            MyPackage memory mp = v.mine[i];
            mp.has = _hasPackage[id][pkg];
            mp.count = list.length;
            if (list.length == 0) continue;
            mp.firstIndex = list[0];
            mp.latestIndex = list[list.length - 1];
            Position storage p = _positions[pkg][mp.latestIndex];
            mp.latestFilled = p.filled;
            mp.latestFund = p.fund;
        }
    }

    function _packageInfos() private view returns (PackageInfo[] memory list) {
        uint256 count = _packageCount;
        list = new PackageInfo[](count);
        for (uint256 i; i < count; i++) {
            uint8 pkg = uint8(i + 1);
            Package storage p = _packages[pkg];
            uint256 cash = uint256(_cashBps[0]) + _cashBps[1] + _cashBps[2];
            list[i] = PackageInfo({
                pkg: pkg,
                price: p.price,
                isOpen: p.isOpen,
                positions: p.positions,
                completed: p.completed,
                members: p.members,
                cyclePay: p.price * cash / BPS,
                referralPay: p.price * _referralBps / BPS
            });
        }
    }

    /** Marketing plan page: every rule read from the contract, so the page always matches */
    function getPlanView() public view returns (PlanView memory v) {
        v.tokenSymbol = _token.symbol();
        v.tokenDecimals = _token.decimals();
        (v.referralBps, v.companyBps, v.cashBps, v.rebornBps, ) = getSettings();
        v.memberCount = _memberCount;
        v.launched = _launched;
        v.packages = _packageInfos();
    }

    /**
     * Board page: 3 levels of one package's board below `index`, plus a page of the viewer's IDs in it.
     * index = AUTO opens the viewer's newest ID in that package (or the root).
     */
    function getBoardView(address viewer, uint256 pkg, uint256 index, uint256 offset, uint256 limit) public view returns (BoardView memory v) {
        if (pkg == 0 || pkg > _packageCount) revert UnknownPackage();
        uint8 p = uint8(pkg);
        v.tokenSymbol = _token.symbol();
        v.tokenDecimals = _token.decimals();
        v.packageCount = _packageCount;
        v.pkg = p;
        v.price = _packages[p].price;
        v.positionCount = _packages[p].positions;

        uint64 id = _idOf[viewer];
        v.viewerId = id;
        v.myCounts = new uint256[](_packageCount);
        v.prices = new uint256[](_packageCount);
        for (uint256 i; i < _packageCount; i++) {
            v.prices[i] = _packages[uint8(i + 1)].price;
            if (id != 0) v.myCounts[i] = _memberPositions[id][uint8(i + 1)].length;
        }
        uint256[] storage mine = _memberPositions[id][p];
        v.myTotal = id == 0 ? 0 : mine.length;
        v.myIndices = _page(mine, v.myTotal, offset, limit);
        v.myKinds = new uint256[](v.myIndices.length);
        for (uint256 i; i < v.myIndices.length; i++) v.myKinds[i] = _positions[p][v.myIndices[i]].kind;

        if (index == AUTO) index = v.myTotal > 0 ? mine[mine.length - 1] : 0;
        if (index >= v.positionCount) revert UnknownPosition();
        v.focus = index;
        v.parent = index == 0 ? AUTO : _positions[p][index].parent;
        v.nodes = _subtree(p, index);
    }

    /** Rows of a page: `limit` (at most MAX_PAGE) from `offset`, fewer at the end of the list */
    function _pageSize(uint256 total, uint256 offset, uint256 limit) private pure returns (uint256) {
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        if (offset >= total) return 0;
        return total - offset < limit ? total - offset : limit;
    }

    function _page(uint256[] storage list, uint256 total, uint256 offset, uint256 limit) private view returns (uint256[] memory out) {
        uint256 size = _pageSize(total, offset, limit);
        out = new uint256[](size);
        for (uint256 i; i < size; i++) out[i] = list[offset + i];
    }

    /** Level order below `top`: node k has its children at 3k+1, 3k+2, 3k+3 */
    function _subtree(uint8 pkg, uint256 top) private view returns (Node[] memory nodes) {
        mapping (uint256 => Position) storage tree = _positions[pkg];
        nodes = new Node[](TREE_NODES);
        for (uint256 k; k < TREE_NODES; k++) {
            uint256 index = top;
            if (k > 0) {
                Node memory up = nodes[(k - 1) / SLOTS];
                uint256 slot = (k - 1) % SLOTS;
                if (!up.exists || up.filled <= slot) continue;
                index = tree[up.index].kids[slot];
            }
            Position storage p = tree[index];
            nodes[k] = Node({ exists: true, index: index, member: p.member, account: _members[p.member].account, filled: p.filled, kind: p.kind, createdAt: p.createdAt });
        }
    }

    /** Team page: the viewer's sponsor and one page of the people the viewer sponsored */
    function getTeamView(address viewer, uint256 offset, uint256 limit) public view returns (TeamView memory v) {
        uint64 id = _idOf[viewer];
        v.myId = id;
        if (id == 0) return v;
        uint64 sponsor = _members[id].sponsor;
        v.sponsorId = sponsor;
        v.sponsorAccount = _members[sponsor].account;
        uint64[] storage all = _directs[id];
        v.directsTotal = all.length;
        uint256 size = _pageSize(all.length, offset, limit);
        v.directs = new Direct[](size);
        for (uint256 i; i < size; i++) {
            uint64 d = all[offset + i];
            Member storage m = _members[d];
            uint256 held;
            for (uint256 k = 1; k <= _packageCount; k++) if (_hasPackage[d][uint8(k)]) held += 1;
            v.directs[i] = Direct({ id: d, account: m.account, joinedAt: m.joinedAt, directs: m.directs, positions: m.positions, packages: held });
        }
    }

    /**
     * History page of `account` (any wallet, not only the viewer's): newest first, `limit` rows (at most MAX_PAGE)
     * starting `offset` rows from the newest.
     */
    function getHistoryView(address account, uint256 offset, uint256 limit) public view returns (HistoryView memory v) {
        v.tokenSymbol = _token.symbol();
        v.tokenDecimals = _token.decimals();
        v.prices = new uint256[](_packageCount);
        for (uint256 i; i < _packageCount; i++) v.prices[i] = _packages[uint8(i + 1)].price;
        uint64 id = _idOf[account];
        v.memberId = id;
        v.account = account;
        if (id == 0) return v;
        Member storage m = _members[id];
        v.sponsor = m.sponsor;
        v.joinedAt = m.joinedAt;
        v.referralEarned = m.referralEarned;
        v.boardEarned = m.boardEarned;
        v.cycles = m.cycles;
        uint256[] storage all = _history[id];
        uint256 total = all.length / 2;
        v.total = total;
        uint256 size = _pageSize(total, offset, limit);
        v.rows = new uint256[](size * 2);
        for (uint256 i; i < size; i++) {
            uint256 row = (total - 1 - offset - i) * 2;
            v.rows[i * 2] = all[row];
            v.rows[i * 2 + 1] = all[row + 1];
        }
    }

    /** Owner page: wallets, launch state, queue and package count */
    function getOwnerView() public view returns (OwnerView memory v) {
        v.owner = _owner;
        v.companies = _companies;
        v.root = _members[1].account;
        v.launched = _launched;
        v.stepsPerTx = _stepsPerTx;
        v.queued = _jobTail - _jobHead;
        v.totalFree = _totalFree;
        v.packageCount = _packageCount;
        v.maxPackages = MAX_PACKAGES;
        v.lastPrice = _packages[_packageCount].price;
        v.bnbHeld = address(this).balance;
    }
}
