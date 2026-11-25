# RebornPro — ผัง 1 แตก 3 รีบอนอัตโนมัติ บน BNB Smart Chain

แผนการตลาดแบบแพ็กเกจ ทุกแพ็กเกจเป็นผังแยกกัน ทุกไอดีมี 3 ช่อง ครบ 3 ช่องแล้ว Reborn เป็นไอดีใหม่เองตลอด
Vite + JavaScript ธรรมดา + Tailwind v4 + kitbox, contract เขียนด้วย Solidity 0.8.37 อยู่หลัง proxy (`BaseProxyUsed`) อัปเกรดได้
โครงสร้างเหมือนโปรเจกต์ APEX CAPITAL (template `web3-prod-kit`)

---

## 1. แผนที่ contract ทำ

| เรื่อง | กติกา |
| --- | --- |
| สมัคร | ผ่านลิงก์ `?ref=` เข้าแพ็กเกจแรกเท่านั้น ผู้แนะนำล็อกถาวร |
| แพ็กเกจ | เริ่ม 10 / 50 / 100 USDT ซื้อเรียงลำดับ แพ็กเกจละ 1 ครั้ง (ไอดีเพิ่มจาก Reborn เท่านั้น) owner เพิ่มแพ็กเกจได้ภายหลัง |
| วางผัง | ทุกแบบ (สมัคร / อัปเกรด / Reborn / ไอดีฟรี) ใช้กติกาเดียวกัน: หาช่องตื้นสุด ซ้ายก่อน (วิธี `openDepth` แบบ APEX) ใต้ไอดีของเจ้าของตามลำดับ 1 → 1.1 → 1.2 แต่ละไอดีรับจนเต็ม 2 ชั้น (3 + 9 = 12 ช่อง) แล้วจึงไปไอดีถัดไป (แบบที่ลูกค้าเลือก; โหมด CURRENT/FIRST ตัดออกแล้ว) |
| ไอดีของใคร: สมัครผ่านลิงก์ | ของผู้แนะนำ |
| ไอดีของใคร: อัปเกรด | ของผู้แนะนำในผังนั้น ถ้ายังไม่มีแพ็กเกจนั้น ไล่ขึ้นสายแนะนำจนเจอ (Root มีทุกแพ็กเกจ) |
| ไอดีของใคร: Reborn | ของตัวเอง (ลงในทีมตัวเอง) |
| ไอดีของใคร: ไอดีฟรี | ของ Root |
| เงิน 1 ก้อนต่อช่อง | ค่าแนะนำ 30% → ผู้แนะนำจากตอนสมัครเสมอ / ช่อง 1: 60% เงินสด / ช่อง 2–3: 10% เงินสด + 50% เก็บไว้ Reborn / บริษัท 10% แยก 3 กระเป๋า: product 5% / marketing 2.5% / treasury 2.5% |
| Reborn | ครบ 3 ช่อง = เงินสด 80% + เงินเก็บครบ 100% → ไอดีใหม่เข้าคิวอัตโนมัติ (ถอนไม่ได้) |
| จุดฟรี (นักลงทุน) | owner วางได้ทุกแพ็กเกจ ในทีม Root ไม่จ่ายเงิน ผู้แนะนำ = Root, **เฉพาะก่อน `launchPublic()`** |
| คิว | ไอดีที่ต้องวางเข้า FIFO, 1 tx วางได้ `STEPS_PER_TX` ตัว ที่เหลือใครก็กด `processQueue` ได้ |

เงินทุกก้อนโอนเข้ากระเป๋าทันที contract ถือเฉพาะเงิน Reborn ที่เก็บบนผังและราคาของไอดีที่รอคิว (`totalHeld` = ยอด token ใน contract เสมอ)
บอร์ดที่มีจุดฟรีแล้วครบด้วยไอดีที่จ่ายเงิน (เงินเก็บไม่ถึง 1 ราคา) → Reborn ฟรี และเงินที่เก็บไว้ไปกระเป๋าบริษัท
เงินเข้าบริษัททุกก้อน (ส่วนแบ่ง 10%, ค่าแนะนำของ Root เอง, เงินเก็บที่ไม่ได้ใช้, เศษปัดเศษ) แบ่ง 3 กระเป๋าตามสัดส่วน 5 : 2.5 : 2.5 เศษที่หารไม่ลงตัวเข้า treasury

---

## 2. โครงสร้าง

| โฟลเดอร์ | คืออะไร | ใครแก้ |
| --- | --- | --- |
| ⚙️ `settings/` | ค่าตั้ง (`.env`, `.json`) | คุณ — แก้ค่า |
| ✏️ `project/` | โค้ดของโปรเจกต์นี้ | คุณ — เขียนโค้ด |
| 🔧 `engine/` | ระบบ เหมือนกันทุกโปรเจกต์ | ไม่ต้องแก้ |
| 🤖 `generated/` | ไฟล์ที่ compile / deploy สร้างให้ | ห้ามแก้ด้วยมือ |

```
reborn-pro/
├── settings/.env(.example)          ⚙️  เว็บ: project id, network, ชื่อแอป, โหมด production/dev, VITE_ID_KEY
├── src/project/chain/               ✏️  on-chain: reads.js, viewParse.js, revertText.js, intereacts/ (register, upgrade, processQueue, transferWallet, owner)
├── src/project/ui/                  ✏️  off-chain: main.js, pages/ (home, plan, board, team, owner), componants/, main.css (ธีมดำ-แดง, ฟอนต์ IBM Plex Sans Thai)
├── dev/settings/contracts/RebornMatrix.env  ⚙️  token, ROOT_WALLET, PRODUCT / MARKETING / TREASURY_WALLET, ราคา, เปอร์เซ็นต์, STEPS_PER_TX
├── dev/project/contracts/RebornMatrix.sol   ✏️  2 contract ในไฟล์เดียว: RebornMatrix (ทุกอย่างที่เขียน/ย้ายเงิน, หลัง proxy) + RebornViews (ฟังก์ชันอ่านทั้งหมด)
├── dev/project/reborn.mjs           ✏️  รวม ABI ของ 2 contract ให้สคริปต์/เทสเรียกที่ address เดียว, deploy ชุดใหม่ในเทส
├── dev/project/plan.mjs             ✏️  แปลง .env → PlanInput (หยุดพร้อมชื่อ key ถ้าค่าผิด)
├── dev/project/model.mjs            ✏️  โมเดล JS ใช้เป็นเฉลยในเทสเท่านั้น
├── dev/project/test/                ✏️  RebornMatrix.test.mjs (ทั้งแผน), Placement.test.mjs (ตำแหน่ง), History.test.mjs, OwnerSignUp.test.mjs
└── dev/project/seed.mjs, devActions.js  ✏️  ข้อมูลตัวอย่าง + ปุ่มในแผงทดสอบ
```

---

## 3. เริ่มใช้งานในเครื่อง

```bash
npm install                 # ที่ root (เว็บ)
cd dev && npm install       # contract + เครื่องมือ
cp ../settings/.env.example ../settings/.env
npm run dev                 # เชนในเครื่อง + deploy contract ใหม่ (มีแค่ Root, ยังไม่ launch, ไม่มีสมาชิก) + เปิดเว็บ
npm run dev -- --seed 40    # ถ้าอยากได้ข้อมูลตัวอย่าง: จุดฟรี 3 นักลงทุนทุกแพ็กเกจ + launch + 40 คน
```

ค่าเริ่มต้น `LOCAL_SEED=0` ใน `dev/settings/local.env` = เริ่มจากศูนย์ ลองเป็น owner เอง:
1. แผงทดสอบ (มุมซ้ายล่าง) → **Demo wallet: off** ให้เป็น on → **+1 BNB (gas)**
2. **Make me the contract owner** (ใช้ได้เฉพาะเชนในเครื่อง)
3. **Copy 3 investor addresses** → ไปหน้า Owner tools (ลิงก์ท้ายหน้า) → วางในช่อง Free IDs → **Place free IDs**
4. ติ๊กยืนยัน → **Launch** → ใช้ "3 / 12 people join under me" สร้างสมาชิกต่อ

ไอดีฟรีแสดงในเว็บเหมือนไอดีที่สมัครปกติ (Sign-up) มีแค่หน้า Owner ที่นับจำนวนไอดีฟรี

ทดสอบ contract: `cd dev && npm test` (ทุกไฟล์), `npm test -- --only Placement`

---

## 4. ค่าที่ต้องตั้งก่อนขึ้นเชนจริง

| ค่า | ไฟล์ | หมายเหตุ |
| --- | --- | --- |
| `ROOT_WALLET`, `PRODUCT_WALLET`, `MARKETING_WALLET`, `TREASURY_WALLET` | `dev/settings/contracts/RebornMatrix.env` | **ต้องเปลี่ยน** ตอนนี้เป็นแอดเดรสทดสอบสาธารณะของ hardhat; Root ต้องไม่ซ้ำกับ 3 กระเป๋าบริษัท |
| `TOKEN_ADDRESS` | เดียวกัน | USDT บน BSC (ตั้งไว้แล้ว) |
| `PACKAGE_PRICES`, `*_PERCENT` | เดียวกัน | แต่ละช่อง แนะนำ + product + marketing + treasury + เงินสด + Reborn ต้องรวม 100 และ Reborn 3 ช่องรวม 100 |
| `VITE_PROJECT_ID` | `settings/.env` + Vercel | ตอนนี้เป็น id ทดสอบ |
| `VITE_SITE_URL` | `settings/.env` + Vercel | โดเมนจริง |
| `VITE_ID_KEY` | `settings/.env` + Vercel | **ห้ามเปลี่ยนหลังเปิดใช้** โค้ดสมาชิกและลิงก์ทั้งหมดจะเปลี่ยน |

deploy / upgrade / verify: ดู `dev/README.md` (`npm run deploy:live`, `--send`, `--upgrade RebornMatrix`, `npm run verify`)

---

## 5. ขั้นตอนของ owner (หน้า `#/owner`)

1. deploy → ผังทุกแพ็กเกจมี Root อยู่บนสุด ยังสมัครไม่ได้
2. **Free IDs for investors** วางแอดเดรสนักลงทุน (สูงสุด 50 ต่อครั้ง) เลือกแพ็กเกจ
3. **Launch public** (ย้อนกลับไม่ได้) → เปิดสมัคร, ปิดการวางจุดฟรีถาวร
4. ภายหลัง: **Add package** (ราคาแก้ไม่ได้หลังเพิ่ม, เว็บแสดงเอง), **Pause / Resume sales** รายแพ็กเกจ

---

## 6. ข้อควรรู้

- เงินที่เก็บรอ Reborn ค้างอยู่ใน contract ถาวรถ้าไม่มีคนเข้ามาเติมช่อง และ USDT ที่มีคนโอนตรงเข้า contract ไม่มีทางออก
- owner = proxy admin (`adminCall` ทำได้ทุกอย่างในนาม contract) ควรเป็น hardware wallet หรือ multisig
- โหมด `MIXED`: คนที่ Root แนะนำจะเติม 3 + 9 ช่องใต้ไอดีแรกของ Root ก่อน จึงกระจายลงใต้นักลงทุนชั้นบนทั้ง 3 คน แล้วค่อยไปไอดี Reborn ของ Root ที่อยู่ลึกลงไป

---

## 7. ปิดเว็บชั่วคราว (หน้า maintenance)

ตั้งใน `settings/.env` และใน Vercel → Environment Variables แล้ว **Redeploy** (Vite อ่านค่าตอน build ใช้เวลาราว 1 นาที)

| ค่า | ใช้ทำอะไร |
| --- | --- |
| `VITE_MAINTENANCE` | `on` = ทุกหน้าขึ้น "We are updating" และไม่อ่าน chain เลย / `off` = เว็บปกติ (ต้องมีค่านี้เสมอ ถ้าไม่มีเว็บจะขึ้น Setup is not finished) |
| `VITE_MAINTENANCE_MESSAGE` | ข้อความเพิ่ม เช่น "Back at 18:00 Bangkok time." (ว่าง = ข้อความมาตรฐาน) |
| `VITE_MAINTENANCE_BYPASS` | คำผ่าน: เปิด `https://โดเมน/?bypass=คำผ่าน` จะเห็นเว็บจริงในแท็บนั้น (ไว้เช็กงานหรือใช้ Owner tools) คำนี้อยู่ใน JavaScript สาธารณะ จึงแค่กันคนทั่วไป ไม่ใช่ความลับ |

ปิดแค่หน้าเว็บ **contract ยังทำงาน** ใครเรียก contract ตรง (เช่นผ่าน BscScan) ยังสมัครหรืออัปเกรดได้ ถ้าต้องหยุดขายจริงให้กด **Pause sales** ทุกแพ็กเกจในหน้า Owner tools (ใช้ bypass เข้าไป)

## 8. ภาษาและเวลา

- เว็บมี 2 ภาษา: English (ค่าตั้งต้น) และไทย — ปุ่มลูกโลกมุมขวาบน ระบบจำภาษาที่เลือกไว้ในเบราว์เซอร์นั้น
- ข้อความภาษาอังกฤษคือข้อความที่เขียนในโค้ด `t("...")`; คำแปลไทยอยู่ที่ `src/project/lang/th.js` ข้อความไหนไม่มีคำแปลจะแสดงเป็นภาษาอังกฤษ
- เพิ่มข้อความใหม่ในหน้าเว็บ → เพิ่มคำแปลใน `th.js` ด้วย
- เพิ่มภาษาในอนาคต: เพิ่ม 1 แถวใน `LANGUAGES` ของ `src/project/lang/index.js` + ไฟล์คำแปล 1 ไฟล์ (ภาษาที่มีตัวอักษรของตัวเองต้องเพิ่มฟอนต์ด้วย)
- วันที่ทุกจุดแสดงเป็นเวลา UTC เสมอ (มีคำว่า UTC ต่อท้าย) ไม่ขึ้นกับโซนเวลาของผู้ใช้

## 9. หน้าประวัติ (History)

- สัญญาบันทึกประวัติของสมาชิกแต่ละคนไว้บนเชนทันทีที่เกิดขึ้น หน้า `#/history` อ่านจาก `getHistoryView` (1 call ต่อหน้า, หน้าละ 50 รายการ, ใหม่สุดก่อน)
- บันทึก 3 แบบ: ไอดีใหม่ (สมัคร / อัปเกรด / Reborn / ไอดีฟรี พร้อมยอดที่จ่าย), ค่าแนะนำที่ได้รับ, และทุกช่องที่มีคนลงใต้ไอดี (เงินสดที่ได้ + เงินที่เก็บไว้ Reborn)
- ทุกรายการมีเวลา (UTC) และเลขบล็อก ลิงก์ไปดูบล็อกบน BscScan ได้
- ดูประวัติของกระเป๋าไหนก็ได้: พิมพ์แอดเดรสในช่องด้านบน หรือเปิด `#/history?addr=0x…`
- ประวัติผูกกับเลขสมาชิก ย้ายกระเป๋า (transferWallet) แล้วประวัติตามไปด้วย
- เงินที่ส่งเข้ากระเป๋าบริษัทไม่ได้อยู่ในประวัติสมาชิก (ดูได้จาก event `CompanyPaid` บน BscScan)
- ค่าแก๊สเพิ่มจากการบันทึก: สมัครประมาณ 650,000 gas (เดิม ~490,000), อัปเกรด ~540,000 (เดิม ~390,000)

## 10. owner สมัครให้คนอื่นแบบจ่ายเงิน

- หน้า Owner tools → การ์ด "Sign up others, paid": ใส่กระเป๋าใหม่ (ครั้งละไม่เกิน 50) และไอดีผู้แนะนำ (ว่าง = Root) แล้วกด "Sign up and pay"
- กระเป๋า owner จ่ายราคาแพ็กเกจ 1 แทนทุกกระเป๋า (เว็บขอ approve ยอดรวมก่อน แล้วส่ง `registerFor` 1 ธุรกรรม)
- เงินแบ่งเหมือนการสมัครปกติทุกอย่าง: ผู้แนะนำได้ 30% และได้ค่าแนะนำจากทุกการเข้าครั้งต่อไปของคนนั้น, ช่องจ่ายตามปกติ, บริษัท 10%
- ใช้ได้ทั้งก่อนและหลัง Launch; ต่างจากไอดีฟรีที่ไม่มีเงินเข้า และใช้ได้เฉพาะก่อน Launch
- สมัครให้ได้เฉพาะแพ็กเกจ 1 สมาชิกอัปเกรดเองตามปกติ
- ถ้ามีกระเป๋าไหนสมัครแล้ว เป็นกระเป๋าบริษัท หรือผู้แนะนำไม่มีอยู่ ทั้งรายการจะไม่ถูกส่ง (เว็บบอกว่ากระเป๋าไหน)
- ค่าแก๊ส: 3 กระเป๋า ~1.9M gas, 50 กระเป๋า ~14.3M gas (พอดีบล็อก ID ที่เหลือรอคิวให้วางต่อ)

## 11. สัญญา 2 ตัว: RebornMatrix + RebornViews

- สัญญาเดียวเกินขนาด 24,576 bytes จึงแยกเป็น 2 ตัวที่ใช้ข้อมูลชุดเดียวกัน:
  - **RebornMatrix** (หลัง proxy, 12,834 bytes): สมัคร, อัปเกรด, วางผัง, จ่ายเงิน, Reborn, คิว, ประวัติ, เครื่องมือ owner
  - **RebornViews** (11,834 bytes): ฟังก์ชันอ่านทั้งหมด (`getHomeView`, `getPlanView`, `getBoardView`, `getTeamView`, `getHistoryView`, `getOwnerView`, `getSettings`, `getPosition` ฯลฯ)
- ทุกคน (เว็บ, BscScan, สคริปต์) เรียกที่ address ของ **RebornMatrix** เท่านั้น ฟังก์ชันที่ RebornMatrix ไม่มี จะถูกส่งต่อ (`fallback` + `delegatecall`) ไปรันใน RebornViews บนข้อมูลของ RebornMatrix — เว็บยังอ่าน 1 call ต่อหน้า
- RebornViews มีแต่ฟังก์ชันอ่าน (เทสเช็กแล้ว) เรียกตรงที่ address ของมันเองจะเห็นแต่ข้อมูลว่าง
- เหลือที่ว่างใน RebornMatrix ~11,700 bytes สำหรับฟีเจอร์ในอนาคต
- **deploy**: `npm run deploy:live -- --send` deploy 3 ตัวตามลำดับ RebornViews → RebornMatrixImplementation → RebornMatrix (proxy) และเช็กว่า proxy ชี้ RebornViews ถูกตัว
- **verify บน BscScan**: verify ทั้ง RebornViews, RebornMatrixImplementation และ proxy (`npm run verify` พิมพ์ข้อมูลให้ครบ); บน BscScan หน้า RebornMatrix จะเห็นปุ่มอ่านเฉพาะของ RebornMatrix ส่วนฟังก์ชันอ่านของหน้าเว็บให้ดูที่หน้า RebornViews (อ่านค่าจริงผ่านเว็บ)
- **แก้ฟังก์ชันอ่านทีหลัง** (ไม่ต้อง upgrade proxy): แก้ RebornViews → `npm run deploy:live -- --send --redeploy RebornViews` → owner เรียก `setViews(<address ใหม่>)` (BscScan → Write as Proxy) → รัน `deploy:live` อีกครั้งให้บันทึกตรง
- **ห้าม** ใส่ฟังก์ชันที่เขียนข้อมูลใน RebornViews และตัวแปรใหม่ใส่ท้าย `RebornStorage` เท่านั้น (สองสัญญาใช้ storage ชุดเดียวกัน)
