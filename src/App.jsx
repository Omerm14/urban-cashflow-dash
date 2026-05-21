import { useState, useRef, useCallback } from 'react';
import { useAuth }         from './contexts/AuthContext';
import { useInvoiceData }  from './hooks/useInvoiceData';
import LoginPage           from './pages/LoginPage';
import NavBar              from './components/NavBar';
import TodayView           from './components/TodayView';
import InvoicesView        from './components/InvoicesView';
import SourcesView         from './components/SourcesView';
import EditInvoiceModal    from './components/EditInvoiceModal';
import SuppliersModal      from './components/SuppliersModal';
import { processPdf, fileToBase64, extractInvoice, translateSupplierName } from './utils/image';
import { findDuplicates, parseCSV, isLatinOnly }                           from './utils/invoice';
import { calcDueDate, toYM, correctSwappedDate }                           from './utils/dates';
import { STATUS } from './constants';

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  const [view,          setView]          = useState('today');
  const [extracting,    setExtracting]    = useState(false);
  const [extractMsg,    setExtractMsg]    = useState(null);
  const [editInvoice,   setEditInvoice]   = useState(null);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [editSupplier,  setEditSupplier]  = useState(null);
  const fileRef = useRef();
  const csvRef  = useRef();

  const {
    suppliers, invoices, computed, dupeIds, allNames, color, kpis, loading,
    addInvoice, updateInvoice, deleteInvoice, bulkMarkPaid, bulkDelete,
    addSupplier, updateSupplier, deleteSupplier,
    getSupplier,
  } = useInvoiceData();

  const handleUpload = useCallback(async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setExtracting(true);
    setExtractMsg({ text: `Processing ${files.length} file${files.length > 1 ? 's' : ''}…`, ok: null });

    const existingFileNames = new Set(invoices.map(i => i.source_file).filter(Boolean).map(n => n.toLowerCase()));
    const [toExtract, fileSkipped] = files.reduce(([ok, skip], f) =>
      existingFileNames.has(f.name.toLowerCase()) ? [ok, [...skip, f]] : [[...ok, f], skip],
      [[], []]
    );

    const imageResults = await Promise.allSettled(
      toExtract.map(f => f.type === 'application/pdf' ? processPdf(f) : fileToBase64(f).then(img => [img]))
    );

    const pageUnits = [];
    imageResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        pageUnits.push({ file: toExtract[i], error: r.reason });
      } else {
        r.value.forEach(pageImage => pageUnits.push({ file: toExtract[i], pageImage }));
      }
    });

    const extractResults = await Promise.allSettled(
      pageUnits.map(unit => {
        if (unit.error) return Promise.reject(new Error(`${unit.file.name}: ${unit.error.message}`));
        return extractInvoice(unit.pageImage).then(ex => ({ file: unit.file, ex }));
      })
    );

    const candidateResults = await Promise.allSettled(
      extractResults.map(async (r, i) => {
        if (r.status === 'rejected') throw new Error(r.reason?.message || `${pageUnits[i].file.name}: failed`);
        const { file, ex } = r.value;
        const invoiceDate = correctSwappedDate(ex.invoiceDate) || ex.invoiceDate || '';
        let sup = getSupplier(ex.supplier);
        if (!sup && isLatinOnly(ex.supplier)) {
          const hebrew = await translateSupplierName(ex.supplier);
          if (hebrew) sup = getSupplier(hebrew) || null;
        }
        const due = calcDueDate(invoiceDate, sup);
        return {
          file,
          candidate: {
            supplier:     sup?.name || ex.supplier || '',
            invoice_no:   ex.invoiceNo   || '',
            invoice_date: invoiceDate,
            amount:       Number(ex.amount) || 0,
            due_date:     due ? due.toISOString().split('T')[0] : '',
            status:       STATUS.UNPAID,
            notes:        '',
            source_file:  file.name,
          },
        };
      })
    );

    const candidates = [], errors = [];
    candidateResults.forEach((r, i) => {
      if (r.status === 'rejected') { errors.push(r.reason?.message || `${pageUnits[i].file.name}: failed`); return; }
      candidates.push(r.value);
    });

    const computedForDedup = computed.map(inv => ({
      ...inv,
      supplier: getSupplier(inv.supplier)?.name || inv.supplier,
    }));
    const withTempIds = candidates.map((c, i) => ({
      ...c.candidate, id: `__new_${i}`,
      invoiceNo: c.candidate.invoice_no, invoiceDate: c.candidate.invoice_date,
    }));
    const dupeSet = findDuplicates([...computedForDedup, ...withTempIds]);
    const toAdd = candidates.filter((_, i) => !dupeSet.has(`__new_${i}`));
    const contentDupeCount = candidates.length - toAdd.length;

    let added = 0;
    await Promise.allSettled(
      toAdd.map(async ({ file, candidate }) => {
        try { await addInvoice(candidate); added++; }
        catch (err) { errors.push(`${file.name}: ${err.message}`); }
      })
    );

    setExtracting(false);
    const parts = [];
    if (added)               parts.push(`${added} added`);
    if (fileSkipped.length)  parts.push(`${fileSkipped.length} already uploaded`);
    if (contentDupeCount)    parts.push(`${contentDupeCount} already exist`);
    if (errors.length)       parts.push(`${errors.length} failed: ${errors[0]}`);
    const hasIssue = fileSkipped.length || contentDupeCount || errors.length;
    setExtractMsg({ text: (added && !hasIssue ? '✓ ' : '') + (parts.join(' · ') || 'nothing to add'), ok: !hasIssue && added > 0 });
    setTimeout(() => setExtractMsg(null), 6000);
    e.target.value = '';
  }, [invoices, suppliers, addInvoice, getSupplier, computed]);

  const handleCSV = useCallback(async e => {
    const file = e.target.files[0]; if (!file) return;
    const parsed = parseCSV(await file.text());
    if (parsed.length) {
      const results = await Promise.allSettled(parsed.map(s => addSupplier({ name: s.name, terms: s.terms || 'shotef', notes: s.notes || '' })));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) {
        setExtractMsg({ text: `${parsed.length - failed.length} added · ${failed.length} failed: ${failed[0].reason?.message || 'unknown error'}`, ok: false });
      } else {
        setExtractMsg({ text: `✓ ${parsed.length} suppliers loaded`, ok: true });
      }
    } else {
      setExtractMsg({ text: 'Could not parse CSV — expected columns: name, terms, notes', ok: false });
    }
    setTimeout(() => setExtractMsg(null), 6000);
    e.target.value = '';
  }, [addSupplier]);

  if (authLoading) return <Splash />;
  if (!user)       return <LoginPage />;
  if (loading)     return <Splash />;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      <NavBar
        view={view}
        setView={setView}
        user={user}
        onSignOut={signOut}
        restaurantName="Coppa Coffee"
        lastSync="synced 4m ago"
        suppliersCount={suppliers.length}
        onSuppliersClick={() => setShowSuppliers(true)}
      />

      {/* Upload toolbar — shown on Today and Invoices tabs */}
      {(view === 'today' || view === 'invoices') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 64px', borderBottom: '1px solid var(--line)',
          background: 'var(--bg)',
        }}>
          <button
            className="btn btn-primary"
            onClick={() => fileRef.current.click()}
            disabled={extracting || loading}
          >
            <span>+</span>
            <span>{extracting ? 'Extracting…' : loading ? 'Loading…' : 'Upload Invoices'}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleUpload} style={{ display: 'none' }} />

          <button className="btn" onClick={() => csvRef.current.click()}>
            <span>📋</span>
            <span>Load Supplier Sheet</span>
          </button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCSV} style={{ display: 'none' }} />

          {extractMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              background: extractMsg.ok === false ? 'var(--red-soft)' : extractMsg.ok ? 'var(--green-soft)' : 'var(--surface2)',
              border: `1px solid ${extractMsg.ok === false ? 'var(--red)' : extractMsg.ok ? 'var(--green)' : 'var(--line)'}`,
              color: extractMsg.ok === false ? 'var(--red)' : extractMsg.ok ? 'var(--green)' : 'var(--ink-soft)',
              animation: 'fadeIn 0.3s',
            }}>
              {extractMsg.text}
            </div>
          )}

          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
            {invoices.length} invoices
          </span>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {view === 'today' && (
          <TodayView
            kpis={kpis}
            invoices={computed}
            suppliers={suppliers}
            color={color}
          />
        )}
        {view === 'invoices' && (
          <InvoicesView
            computed={computed}
            dupeIds={dupeIds}
            updateInvoice={updateInvoice}
            deleteInvoice={deleteInvoice}
            bulkMarkPaid={bulkMarkPaid}
            bulkDelete={bulkDelete}
            setEditInvoice={setEditInvoice}
            color={color}
          />
        )}
        {view === 'sources' && <SourcesView invoiceCount={invoices.length} />}
      </div>

      {editInvoice && (
        <EditInvoiceModal
          editInvoice={editInvoice}
          setEditInvoice={setEditInvoice}
          suppliers={suppliers}
          addInvoice={addInvoice}
          updateInvoice={updateInvoice}
          getSupplier={getSupplier}
        />
      )}
      {showSuppliers && (
        <SuppliersModal
          suppliers={suppliers}
          addSupplier={addSupplier}
          updateSupplier={updateSupplier}
          deleteSupplier={deleteSupplier}
          editSupplier={editSupplier}
          setEditSupplier={setEditSupplier}
          onClose={() => setShowSuppliers(false)}
        />
      )}
    </div>
  );
}

function Splash() {
  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--bg)' }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Loading Cashflow…</span>
      </div>
    </div>
  );
}
