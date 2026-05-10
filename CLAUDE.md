# Urban Cashflow Dash — Project Memory

## Stack
- **Frontend**: React 18 + Vite, plain inline styles (no CSS framework)
- **Backend**: Express (dev) / Vercel serverless (`api/index.js`) on port 3001
- **Database & Auth**: Supabase (anon key client-side, service-role key server-side)
- **AI**: Anthropic SDK — `claude-haiku-4-5-20251001` for invoice image extraction
- **Dev command**: `npm run dev` runs Vite + Express concurrently; Vite proxies `/api` → `localhost:3001`

## Repo
- GitHub: `omerm14/urban-cashflow-dash`
- Active PR: #5 — branch `claude/fix-upload-functionality-FQ8Fx`

## Architecture

### Data flow — Invoice upload
1. User picks image/PDF files → `handleUpload` in `src/App.jsx`
2. PDFs converted via pdf.js CDN (`pdfToBase64`), images via FileReader (`fileToBase64`)
3. `extractInvoice` in `src/utils/image.js` POSTs base64 to `/api/extract` with Bearer token
4. Express auth middleware (`server/middleware/auth.js`) validates token via `supabase.auth.getUser(token)`
5. `server/routes/extract.js` calls Claude vision API, returns `{ supplier, invoiceNo, invoiceDate, amount }`
6. Dedup runs against `computed` invoices, then non-dupes inserted via `addInvoice` → Supabase

### Data flow — Supplier CSV upload
1. User picks `.csv` file → `handleCSV` in `src/App.jsx`
2. `parseCSV` parses columns: `name`, `terms`, `notes` (also accepts `supplier name`, `payment terms`)
3. Each row inserted via `addSupplier` → Supabase `suppliers` table

### Key files
| File | Purpose |
|---|---|
| `src/App.jsx` | Upload handlers (`handleUpload`, `handleCSV`), main layout |
| `src/hooks/useInvoiceData.js` | All Supabase CRUD + derived state (computed, dupeIds, kpis, etc.) |
| `src/utils/image.js` | `pdfToBase64`, `fileToBase64`, `extractInvoice` |
| `src/utils/invoice.js` | `findDuplicates`, `matchSupplier`, `parseCSV` |
| `src/utils/dates.js` | `calcDueDate`, `toYM` |
| `src/contexts/AuthContext.jsx` | Supabase session, `useAuth()` hook |
| `src/lib/supabase.js` | Supabase client (anon key, singleton) |
| `server/routes/extract.js` | POST /api/extract — Claude vision + usage logging |
| `server/routes/admin.js` | GET /api/admin/usage — per-user token stats |
| `server/middleware/auth.js` | Bearer token validation via `supabase.auth.getUser` |
| `server/lib/supabase.js` | Supabase admin client (service-role key) |
| `api/index.js` | Vercel serverless entry point |

## Supabase Schema Notes
- Tables: `invoices`, `suppliers`, `api_calls`
- **Both `invoices` and `suppliers` have RLS enabled**
- Required policies (all four: SELECT / INSERT / UPDATE / DELETE) must use `auth.uid() = user_id`
- `user_id UUID REFERENCES auth.users(id)` column must exist on both tables
- All client-side inserts must include `user_id: user.id` — the code now handles this in `useInvoiceData.js`
- Initial SELECT queries are scoped to `.eq('user_id', user.id)` for multi-tenancy

## Payment Terms (suppliers)
- `shotef` — end of following month
- `shotef_plus(N)` — end of following month + N days
- `immediate` — same day
- `custom` — manual due date

## Invoice deduplication logic (`findDuplicates`)
- **exactMatch**: same supplier (normalised) + same non-empty `invoiceNo`
- **fuzzyMatch**: same supplier (normalised) + same `amount` + same `invoiceDate`
- Supplier normalisation: lowercase, strip trailing punctuation/whitespace (`normSup`)
- When building upload candidates, use `sup?.name` (canonical DB name) not raw Claude output
- Before dedup comparison, also normalise supplier names on existing `computed` invoices

## Bugs fixed in this session (PR #5)
1. **Dead dedup code** (`App.jsx`): `toAdd` array was built but never used — upload loop iterated `candidates` directly, inserting all invoices including duplicates.
2. **Field name mismatch** (`App.jsx` + `invoice.js`): candidates stored `invoice_no`/`invoice_date` (snake_case) but `findDuplicates` checked `invoiceNo`/`invoiceDate` (camelCase). Added camelCase aliases on temp objects.
3. **Null session crash** (`image.js`): `session.access_token` thrown TypeError when session was null. Added explicit guard.
4. **Supabase RLS — inserts missing `user_id`** (`useInvoiceData.js`): `addInvoice` and `addSupplier` didn't include `user_id`, violating RLS policies. Fixed + scoped SELECT queries to current user.
5. **Raw Anthropic error JSON exposed to UI** (`server/routes/extract.js`): `err.message` contained full HTTP response body. Now surfaces `err.error.error.message` for clean user-facing error.
6. **Dedup supplier mismatch** (`App.jsx` + `invoice.js`): raw extracted supplier name stored instead of canonical DB name; old invoices not normalised before comparison; strict string equality broke on trailing punctuation.

## Environment
- `.env.local` required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Anthropic API key must belong to the same workspace where credits are purchased
