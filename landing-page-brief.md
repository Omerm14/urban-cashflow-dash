# Landing Page Brief — Urban Cashflow Dash

Create a single self-contained `index.html` landing page for a SaaS product called **Urban Cashflow Dash**. The page should look modern, professional, and conversion-focused — targeting Israeli SMB owners and finance teams. Use inline CSS and vanilla JS only (no external frameworks). The design should be clean, dark-themed with electric blue / teal accents, and feel like a premium fintech product.

---

## Brand

- **Product name:** Urban Cashflow Dash
- **Tagline:** "כל החשבוניות שלך. מקום אחד. אוטומטי לגמרי." (All your invoices. One place. Fully automatic.)
- **Sub-tagline (English):** Stop chasing invoices. Start managing cash flow.
- **Target audience:** Israeli small-to-medium businesses and finance managers who receive invoices via email, WhatsApp, Google Drive, and Green Invoice.
- **Language:** Bilingual — English headings with Hebrew sub-text where appropriate. RTL support for Hebrew elements.

---

## Color Palette

- Background: `#0d0f14`
- Surface / Cards: `#13161e`
- Border: `#1e2330`
- Primary accent: `#3b82f6` (electric blue)
- Secondary accent: `#06b6d4` (cyan/teal)
- Success green: `#10b981`
- Alert red: `#ef4444`
- Text primary: `#f1f5f9`
- Text muted: `#64748b`

---

## Page Sections (in order)

### 1. Navigation Bar
- Logo: "💸 Urban Cashflow Dash" (left aligned)
- Nav links: Features · Integrations · Pricing · Contact
- CTA button: "Request Early Access" (blue, top-right)
- Sticky on scroll

### 2. Hero Section
- Large headline: **"Stop Chasing Invoices. Start Managing Cash Flow."**
- Sub-headline: "Urban Cashflow Dash automatically collects, reads, and organizes every invoice you receive — from Gmail, WhatsApp, Google Drive, and Green Invoice — so you always know what you owe and when."
- Two CTA buttons: "Request Early Access" (primary blue) · "See How It Works" (ghost/outline)
- Below buttons: trust line — "Trusted by Israeli businesses · Hebrew & English · GDPR-ready"
- Background: subtle animated gradient or particle mesh effect

### 3. Problem → Solution Banner
Three-column layout, each with an icon, short headline, and one-sentence description:
1. 🗂️ **Invoices everywhere** — "Emails, WhatsApp messages, Google Drive folders, and accountant portals. Nothing is in one place."
2. ⏰ **Due dates slip through** — "Without a single view of what's due, overdue invoices damage supplier relationships and your credit."
3. 💸 **No cash flow visibility** — "You never know next month's total payables until the last minute — and surprises hurt."

Then below: **"Urban Cashflow Dash solves all three — automatically."**

### 4. Features Section
Title: **"Everything You Need. Nothing You Don't."**

Display as a 2-column grid of feature cards (icon + title + 2-line description):

1. 🤖 **AI-Powered Invoice Extraction** — "Our Claude AI engine reads PDFs and images, extracts supplier, amount, date, and due date — even from Hebrew documents and rotated scans."
2. 📥 **Multi-Source Ingestion** — "Automatically pulls invoices from Gmail, Google Drive, WhatsApp Business, and Green Invoice (חשבונית ירוקה) on a schedule you control."
3. 📅 **Cash Flow Calendar** — "See every due payment on a calendar view. Know exactly what's due this week, this month, and next quarter."
4. 📊 **Live Dashboard KPIs** — "Outstanding balance, overdue alerts, next-month projection, and total paid — all updated in real time."
5. 🏢 **Supplier Payment Terms** — "Set payment terms per supplier (immediate, shotef +30/45/75, or custom) and let the system calculate due dates automatically."
6. ✅ **Bulk Payment Actions** — "Select a month, review all invoices, and mark them paid in one click. Built for speed."
7. 🔍 **Duplicate Detection** — "File hashing ensures the same invoice uploaded from two different sources is never counted twice."
8. 📋 **Full Audit Trail** — "Every auto-synced invoice logs its origin, timestamp, and outcome — so your accountant always has a clean paper trail."

### 5. Integrations Section
Title: **"Connects to the Tools You Already Use"**

Show 4 large integration cards in a row, each with a logo placeholder (colored icon), name, and one line:

1. **Gmail** — "Auto-scans labeled emails for invoice attachments"
2. **Google Drive** — "Monitors selected folders and imports new files"
3. **WhatsApp Business** — "Receives invoice images and PDFs via webhook"
4. **Green Invoice (חשבונית ירוקה)** — "Syncs directly with Israel's leading invoicing platform"

Below: "More integrations coming soon — including Bank Hapoalim, Leumi, and Mizrahi direct feeds."

### 6. How It Works Section
Title: **"Up and Running in Minutes"**

Three numbered steps, horizontal timeline layout:

1. **Connect Your Sources** — "Link your Gmail, Google Drive, WhatsApp Business, and Green Invoice accounts with one click each."
2. **We Do the Rest** — "Our AI reads every invoice, extracts the data, matches suppliers, and calculates due dates automatically."
3. **Manage Your Cash Flow** — "Use the dashboard, calendar, and grouped views to stay on top of every payable — and mark them paid as you go."

### 7. Social Proof / Stats Bar
Four stats in a horizontal strip (dark card):
- **4** Sources connected automatically
- **100%** Hebrew document support
- **< 10 sec** Average invoice extraction time
- **0** Manual data entry required

### 8. Pricing Section
Title: **"Simple, Transparent Pricing"**

Three cards:

**Starter** — Free
- Up to 50 invoices/month
- 1 integration source
- Manual upload + OCR
- Dashboard & calendar view
- CTA: "Get Started Free"

**Pro** — ₪199/month *(most popular badge)*
- Unlimited invoices
- All 4 integration sources
- Auto-sync scheduling
- Bulk operations & CSV import
- Audit trail & duplicate detection
- Priority support
- CTA: "Start Free Trial"

**Enterprise** — Contact Us
- Everything in Pro
- Custom integrations
- Dedicated onboarding
- SLA & compliance support
- White-label option
- CTA: "Talk to Us"

Highlight the Pro card with a glowing blue border and "Most Popular" badge.

### 9. FAQ Section
Title: **"Common Questions"**

Accordion-style (click to expand), 5 questions:

1. **Does it support Hebrew invoices?** — "Yes. Our AI extraction engine is specifically tuned for Israeli invoice formats, including Hebrew text, ח.פ./ע.מ. registration numbers, and DD/MM/YYYY date formats."
2. **Is my data secure?** — "All data is stored in isolated, per-user databases with row-level security. File attachments are stored on encrypted cloud storage. We never share your data."
3. **How does the WhatsApp integration work?** — "You forward invoice images or PDFs to a designated WhatsApp Business number. Our system receives them via webhook, extracts the data, and adds them to your dashboard automatically."
4. **Can I import existing invoices?** — "Yes. You can upload PDFs and images manually, or import a batch via CSV. Duplicate detection ensures clean data."
5. **Do I need a developer to set it up?** — "No. The entire setup — including Google OAuth, WhatsApp webhook, and Green Invoice API key — is done through a guided UI with no code required."

### 10. CTA Footer Banner
Large centered section:
- Headline: **"Ready to take control of your cash flow?"**
- Sub-text: "Join Israeli businesses already automating their invoice management."
- Button: "Request Early Access" (large, glowing blue)

### 11. Footer
- Left: "© 2026 Urban Cashflow Dash. All rights reserved."
- Center: Links — Privacy Policy · Terms of Service · Contact
- Right: "Built for Israeli businesses 🇮🇱"

---

## Technical Requirements

- Single `index.html` file, fully self-contained (no external CSS or JS files)
- Responsive — works on mobile and desktop
- Smooth scroll for nav links
- Sticky navigation bar that changes background opacity on scroll
- FAQ accordion with smooth open/close animation
- Subtle entrance animations on scroll (use IntersectionObserver)
- All Hebrew text should have `dir="rtl"` and appropriate font support (use Google Fonts: Heebo for Hebrew, Inter for English — embed via `<link>` tag in `<head>`)
- The page should render correctly without a server (open directly in browser)
- No placeholder lorem ipsum — use only the copy provided above

---

## Output

Return a single complete `index.html` file.
