# POS Make-to-Order (BOM) — User Manual & Test Guide

Make a finished product from raw materials at the point of sale. At checkout, the
system checks finished-goods stock first; if short, it prompts the cashier to
**make** the shortfall — which knocks off the raw-material components and adds the
finished good — then completes the sale. (Example: a **hot dog** = 1 bun + 1 sausage.)

---

## 1. Concept (how it works)

- Each finished item can have a **recipe (BOM)**: a list of component items and the
  quantity of each **per one finished unit**.
- Finished-goods and raw-materials on-hand are tracked in the same POS stock ledger
  (`PosStockMovement`), per shop location.
- At checkout the app runs a **production plan**:
  - Finished stock is enough → sells normally, no prompt.
  - Finished stock short **and** a recipe exists **and** components are available →
    cashier is prompted **"Make N × item now?"**.
  - Cashier confirms → posts `consume-out` for each component and `produce-in` for
    the finished good, then the normal `sale` movement sells it.
- If components are short, production is **blocked** with a clear message (which
  component and how much is missing). If the item has **no recipe**, it behaves as
  today (normal "insufficient stock").

---

## 2. Prerequisites

- Role: **admin / POS manager** to define recipes; **cashier (POS role)** to sell.
- A **shop/terminal with a Location Code** mapped (Admin → Setup → POS Setup → Shops).
- The **component (raw material) items exist** in the POS catalogue and have on-hand
  stock at that location (see step 4).
- Run migrations once so the recipe tables exist:
  `node src/db/migrate.js <companies>` → creates `PosBom` / `PosBomLine`.

---

## 3. Define a recipe (BOM)

- Go to **Admin → Setup → "POS Recipes (Make-to-Order)"**.
- Click **New recipe** (the **+**).
- **Finished item** — pick from the **dropdown** (searchable list of the POS item
  catalogue), e.g. `HOTDOG`. Both the finished item and every component must exist
  in the main POS item list.
- Add a **component** row per raw material:
  - **Component** — pick from the same item **dropdown** (e.g. `BUN`); the description
    auto-fills. Set **Qty/unit** (e.g. `1`) and **UoM** (e.g. `PC`).
  - Click **Add component** for more (e.g. `SAUSAGE` × 1).
- Leave **Active** ticked. Click **Save recipe**.
- The recipe appears in the list with its component count. Edit/delete anytime.
- Rules enforced: at least one component with a positive qty; an item cannot be its
  own component; one recipe per finished item.

---

## 4. Give the raw materials some stock (so there's something to consume)

Pick any existing method to put component stock on-hand at the shop's location:
- **Stock request** → approve → complete (posts `transfer-in`), or
- **Stock take / adjustment** (positive adjustment), or
- **Reset/Load from BC** if the components exist in BC on-hand.

> Tip for a quick test: give the components plenty (e.g. 20 each) and keep the
> finished item at **0** so checkout is forced to make it.

---

## 5. Test the happy path (make-to-order at checkout)

- Open the **POS terminal**, select the shop.
- Add the **finished item** (e.g. `HOTDOG`) to the cart with a quantity **greater than
  its finished on-hand** (0 → any qty triggers production).
- Click **Pay** (single tender) or **Split payment** (multi-tender).
- A prompt appears: **"Some items are short of finished stock and will be made to
  order: • Make N × HOTDOG … Make now and knock off raw materials?"**
- Click **OK**:
  - Components are consumed (`consume-out`), the finished good is produced (`produce-in`).
  - A success toast **"Made to order"** shows.
  - Payment proceeds and the sale completes as normal.
- Click **Cancel** on the prompt → checkout aborts, nothing is produced or sold.

---

## 6. Verify the stock movements

- Go to **POS → Reports → Stock position** (or Daily movements) for the shop.
- Confirm, after selling N hot dogs made to order:
  - Finished good: `produce-in +N`, then `sale −N` (net change from production = 0
    if you made exactly the shortfall).
  - Each component: `consume-out −(QtyPer × N)`.
- Movement types to look for: **`produce-in`**, **`consume-out`**, **`sale`**.

---

## 7. Edge cases to test

- **Enough finished stock** → no prompt, sells straight through.
- **Partial finished stock** (e.g. 2 on hand, order 5) → prompt to make **3** only.
- **Component short** (e.g. no buns) → **blocked** with: *"HOTDOG: short of BUN (need
  X, have Y)"*; checkout does not proceed until you replenish the component.
- **No recipe** on a short item → normal **"Insufficient stock"** message (unchanged).
- **Multiple finished items** in one cart → each is planned/made independently.
- **Split tender** (multiple payment methods) → same prompt runs before payment.
- **Deactivate a recipe** (untick Active) → that item stops being made to order.

---

## 8. Notes & limits

- Production posts to the **POS stock ledger only** (app DB). It does not post a BC
  production order — that BC fireback is a separate, pending piece.
- Component quantities are **per one finished unit**; producing N multiplies by N.
- The negative-stock guard still applies to components — you can never consume below
  zero, which is why a component shortage blocks the make.
- Endpoints (for reference / scripted testing):
  - `GET/POST/DELETE /api/pos/boms[/:itemNo]` — recipe CRUD (manager).
  - `POST /api/pos/production-plan` `{ orderId }` — what must be made + availability.
  - `POST /api/pos/produce` `{ orderId, items:[{ itemNo, qty }] }` — make it.
