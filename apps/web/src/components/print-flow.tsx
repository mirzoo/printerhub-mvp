"use client";

import { MAX_COPIES, MAX_DOCUMENTS, MAX_FILE_SIZE, MAX_PAGES, type Quote } from "@printerhub/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PrinterStatus = { deviceId: string; available: boolean; printMode: "dry-run" | "real" | null };
type UploadedDocument = { id: string; pathname: string; name: string; pageCount: number; selectedPages: number[]; previewUrl: string };

export function PrintFlow({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [copies, setCopies] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [printer, setPrinter] = useState<PrinterStatus | null>(null);
  const [printerMissing, setPrinterMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/access", { cache: "no-store" }).then((response) => setAuthorized(response.ok)).catch(() => setAuthorized(false));
    const loadStatus = () => fetch(`/api/devices/${encodeURIComponent(deviceId)}/status`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404 || response.status === 400) { setPrinterMissing(true); return null; }
        if (!response.ok) throw new Error("status unavailable");
        setPrinterMissing(false);
        return response.json() as Promise<PrinterStatus>;
      })
      .then((status) => status && setPrinter(status))
      .catch(() => setPrinter({ deviceId, available: false, printMode: null }));
    void loadStatus();
    const timer = window.setInterval(loadStatus, 15_000);
    return () => window.clearInterval(timer);
  }, [deviceId]);

  const selectedPageCount = useMemo(() => documents.reduce((total, document) => total + document.selectedPages.length, 0), [documents]);
  const everyDocumentHasPages = documents.every((document) => document.selectedPages.length > 0);
  const currentQuote = quote?.selectedPages === selectedPageCount && quote.copies === copies ? quote : null;

  useEffect(() => {
    if (selectedPageCount < 1 || selectedPageCount > MAX_PAGES) return;
    let active = true;
    const timer = window.setTimeout(() => {
      fetch("/api/quotes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ selectedPages: selectedPageCount, copies }) })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.message ?? "Не удалось рассчитать стоимость");
          if (active) setQuote(result as Quote);
        })
        .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Не удалось рассчитать стоимость"));
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [selectedPageCount, copies]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
      const result = await response.json().catch(() => null) as { message?: unknown } | null;
      if (!response.ok) throw new Error(typeof result?.message === "string" ? result.message : "Не удалось проверить ПИН‑код. Попробуйте снова");
      setAuthorized(true); setPin("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось проверить ПИН‑код"); }
    finally { setBusy(false); }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const availableSlots = MAX_DOCUMENTS - documents.length;
    const selected = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) setError(`Можно добавить не более ${MAX_DOCUMENTS} документов`);
    setUploading(true);
    try {
      for (const file of selected) {
        const document = await uploadFile(file);
        setDocuments((current) => [...current, document]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось добавить документ. Попробуйте снова");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function uploadFile(file: File): Promise<UploadedDocument> {
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Добавляйте документы только в формате PDF");
    if (file.size > MAX_FILE_SIZE) throw new Error("Размер одного PDF не должен превышать 20 МБ");
    const bytes = await file.arrayBuffer();
    let pageCount: number;
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
      pageCount = pdf.getPageCount();
      if (pageCount < 1 || pageCount > MAX_PAGES) throw new Error("INVALID_PAGE_COUNT");
    } catch { throw new Error("PDF повреждён, защищён паролем или содержит больше 100 страниц"); }
    const intentResponse = await fetch("/api/uploads/intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, size: file.size }) });
    const intent = await intentResponse.json();
    if (!intentResponse.ok) throw new Error(intent.message ?? "Не удалось подготовить загрузку");
    const uploadResponse = await fetch(intent.uploadUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: file });
    if (!uploadResponse.ok) throw new Error("Не удалось безопасно загрузить PDF");
    return { id: crypto.randomUUID(), pathname: intent.pathname, name: file.name, pageCount, selectedPages: Array.from({ length: pageCount }, (_, index) => index + 1), previewUrl: URL.createObjectURL(file) };
  }

  async function removeDocument(document: UploadedDocument) {
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    URL.revokeObjectURL(document.previewUrl);
    await fetch(`/api/uploads/${document.pathname}`, { method: "DELETE" }).catch(() => undefined);
  }

  function togglePage(documentId: string, page: number) {
    setDocuments((current) => current.map((document) => document.id !== documentId ? document : {
      ...document,
      selectedPages: document.selectedPages.includes(page) ? document.selectedPages.filter((value) => value !== page) : [...document.selectedPages, page].sort((a, b) => a - b),
    }));
  }

  function toggleAll(documentId: string) {
    setDocuments((current) => current.map((document) => document.id !== documentId ? document : {
      ...document,
      selectedPages: document.selectedPages.length === document.pageCount ? [] : Array.from({ length: document.pageCount }, (_, index) => index + 1),
    }));
  }

  async function openCheckout() {
    if (!documents.length || !currentQuote || !printer?.available) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, documents: documents.map((document) => ({ pathname: document.pathname, selectedPages: document.selectedPages })), copies, colorMode: "bw", duplex: false, paperSize: "A4" }),
      });
      const order = await response.json();
      if (!response.ok) throw new Error(order.message ?? "Не удалось создать заказ");
      sessionStorage.setItem(`printerhub:order:${order.id}`, JSON.stringify(documents.map((document) => document.name)));
      router.push(`/checkout/${order.id}#${order.statusToken}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось перейти к оплате"); setBusy(false); }
  }

  if (printerMissing) return <MissingPrinter />;
  return (
    <main className="shell print-shell">
      <div className="brand"><span className="brand-mark">P</span> PrinterHub <span className="device-badge">{deviceId}</span></div>
      <h1>Документы для печати</h1>
      <p className="lead">Добавьте до {MAX_DOCUMENTS} PDF, проверьте страницы и перейдите к оплате</p>

      {authorized === null ? <div className="card"><div className="skeleton" /></div> : !authorized ? (
        <form className="card pin-form" onSubmit={unlock}>
          <div><div className="label">ПИН‑код точки печати</div><p className="hint">Код указан рядом с QR‑кодом на аппарате</p></div>
          <input className="pin tabular" type="password" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={32} value={pin} onChange={(event) => setPin(event.target.value)} aria-label="ПИН-код точки печати" />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || pin.length < 6}>{busy ? "Проверяем…" : "Продолжить"}</button>
        </form>
      ) : (
        <div className="stack print-flow-stack">
          <div className="printer"><span className={`dot ${printer?.available ? "online" : "offline"}`} />{printer?.available ? `Аппарат готов${printer.printMode === "dry-run" ? " · тестовый режим" : ""}` : "Аппарат временно недоступен"}</div>
          <section className="card stack documents-card">
            <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => void addFiles(event.target.files)} />
            {documents.length === 0 ? (
              <button className="dropzone dropzone-button" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
                <span className="upload-icon" aria-hidden="true">＋</span>
                <span className="file-name">{uploading ? "Загружаем…" : "Добавить документы"}</span>
                <span className="hint">До {MAX_DOCUMENTS} PDF · каждый до 20 МБ</span>
              </button>
            ) : <>
              <div className="documents-heading"><div><strong>{documents.length} {pluralDocuments(documents.length)}</strong><p className="hint">Выберите страницы в каждом PDF</p></div><button className="secondary compact-button" type="button" onClick={() => inputRef.current?.click()} disabled={uploading || documents.length >= MAX_DOCUMENTS}>{uploading ? "Добавляем…" : "Добавить ещё"}</button></div>
              <div className="document-list">
                {documents.map((document) => <article className="document-card" key={document.id}>
                  <div className="document-top"><span className="pdf-mark">PDF</span><div className="document-title"><strong className="file-name">{document.name}</strong><span className="hint">{document.pageCount} {pluralPages(document.pageCount)} · выбрано {document.selectedPages.length}</span></div><button className="remove-button" type="button" onClick={() => void removeDocument(document)} aria-label={`Удалить ${document.name}`}>×</button></div>
                  <details className="preview-details"><summary>Предпросмотр</summary><iframe className="document-preview" src={`${document.previewUrl}#view=FitH`} title={`Предпросмотр ${document.name}`} /></details>
                  <div className="page-picker-header"><span className="label">Страницы</span><button className="text-button" type="button" onClick={() => toggleAll(document.id)}>{document.selectedPages.length === document.pageCount ? "Снять выбор" : "Выбрать все"}</button></div>
                  <div className="page-grid">{Array.from({ length: document.pageCount }, (_, index) => index + 1).map((page) => <button key={page} type="button" className={`page-chip tabular ${document.selectedPages.includes(page) ? "selected" : ""}`} onClick={() => togglePage(document.id, page)} aria-pressed={document.selectedPages.includes(page)}>{page}</button>)}</div>
                </article>)}
              </div>
            </>}

            {documents.length > 0 && <div className="settings-block">
              <div className="row"><span className="label">Копий</span><div className="stepper"><button className="icon-button" type="button" disabled={copies <= 1} onClick={() => setCopies((value) => value - 1)} aria-label="Уменьшить количество копий">−</button><span className="value tabular">{copies}</span><button className="icon-button" type="button" disabled={copies >= MAX_COPIES} onClick={() => setCopies((value) => value + 1)} aria-label="Увеличить количество копий">+</button></div></div>
              <div className="row"><span className="label">Печать</span><span className="value">A4 · Ч/Б · 1 сторона</span></div>
              <div className="summary checkout-summary"><div><div className="label">{selectedPageCount} {pluralPages(selectedPageCount)} × {copies} {pluralCopies(copies)}</div><strong className="tabular">{currentQuote ? formatPrice(currentQuote.totalPriceMinor) : "Считаем…"}</strong></div><span className="hint">Стоимость рассчитана сервером</span></div>
            </div>}
            {selectedPageCount > MAX_PAGES && <p className="error" role="alert">Для одного заказа можно выбрать не более 100 страниц</p>}
            {documents.length > 0 && !everyDocumentHasPages && <p className="error" role="alert">Выберите хотя бы 1 страницу в каждом документе</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="button" onClick={openCheckout} disabled={!documents.length || !everyDocumentHasPages || !selectedPageCount || selectedPageCount > MAX_PAGES || !currentQuote || !printer?.available || busy || uploading}>{busy ? "Готовим заказ…" : "Перейти к оплате"}</button>
          </section>
        </div>
      )}
      <p className="privacy">Документы удаляются автоматически после печати, ошибки или истечения времени заказа</p>
    </main>
  );
}

function MissingPrinter() { return <main className="shell compact-shell"><div className="brand"><span className="brand-mark">P</span> PrinterHub</div><section className="card empty-state"><span className="status-error" aria-hidden="true">×</span><h1 className="state-title">Аппарат не найден</h1><p className="lead state-copy">Отсканируйте QR‑код на экране аппарата ещё раз</p></section></main>; }
function pluralPages(value: number) { const mod10 = value % 10; const mod100 = value % 100; if (mod10 === 1 && mod100 !== 11) return "страница"; if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "страницы"; return "страниц"; }
function pluralDocuments(value: number) { return value === 1 ? "документ" : value >= 2 && value <= 4 ? "документа" : "документов"; }
function pluralCopies(value: number) { return value === 1 ? "копия" : value >= 2 && value <= 4 ? "копии" : "копий"; }
function formatPrice(minor: number) { return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} сомони`; }
