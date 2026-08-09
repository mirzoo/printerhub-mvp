"use client";

import { MAX_COPIES, MAX_FILE_SIZE, MAX_PAGES, DEVICE_ID } from "@printerhub/contracts";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PrinterStatus = { available: boolean; printMode: "dry-run" | "real" | null };

export default function HomePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [copies, setCopies] = useState(1);
  const [printer, setPrinter] = useState<PrinterStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/access", { cache: "no-store" })
      .then((response) => setAuthorized(response.ok))
      .catch(() => setAuthorized(false));
    const loadStatus = () => fetch(`/api/devices/${DEVICE_ID}/status`, { cache: "no-store" })
      .then((response) => response.json())
      .then(setPrinter)
      .catch(() => setPrinter({ available: false, printMode: null }));
    void loadStatus();
    const timer = window.setInterval(loadStatus, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const totalPages = useMemo(() => (pageCount ?? 0) * copies, [pageCount, copies]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) throw new Error("Неверный ПИН‑код или слишком много попыток");
      setAuthorized(true);
      setPin("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось проверить ПИН‑код");
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(selected: File | null) {
    setError("");
    setFile(null);
    setPageCount(null);
    if (!selected) return;
    if (selected.type !== "application/pdf" || !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Выберите документ в формате PDF");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError("Размер PDF не должен превышать 20 МБ");
      return;
    }
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(await selected.arrayBuffer(), { ignoreEncryption: false });
      const pages = pdf.getPageCount();
      if (pages < 1 || pages > MAX_PAGES) throw new Error("Документ должен содержать от 1 до 100 страниц");
      setFile(selected);
      setPageCount(pages);
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes("100") ? cause.message : "PDF повреждён или защищён паролем");
    }
  }

  async function submit() {
    if (!file || !pageCount || !printer?.available) return;
    setBusy(true);
    setError("");
    try {
      const intentResponse = await fetch("/api/uploads/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: DEVICE_ID, size: file.size }),
      });
      const intent = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intent.message ?? "Не удалось подготовить загрузку");

      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Не удалось безопасно загрузить PDF");

      const jobResponse = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: DEVICE_ID, pathname: intent.pathname, copies }),
      });
      const job = await jobResponse.json();
      if (!jobResponse.ok) throw new Error(job.message ?? "Не удалось создать задание");

      sessionStorage.setItem(`printerhub:file:${job.id}`, file.name);
      router.push(`/jobs/${job.id}#${job.statusToken}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить документ");
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <div className="brand"><span className="brand-mark">P</span> PrinterHub</div>
      <h1>Распечатать документ</h1>
      <p className="lead">Загрузите PDF с телефона — ближайший принтер выполнит задание автоматически</p>

      {authorized === null ? <div className="card"><div className="skeleton" /></div> : !authorized ? (
        <form className="card pin-form" onSubmit={unlock}>
          <div><div className="label">ПИН‑код точки печати</div><p className="hint">Код указан рядом с QR‑кодом на принтере</p></div>
          <input className="pin tabular" type="password" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={32} value={pin} onChange={(event) => setPin(event.target.value)} aria-label="ПИН-код точки печати" />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || pin.length < 6}>{busy ? "Проверяем…" : "Продолжить"}</button>
        </form>
      ) : (
        <div className="stack">
          <div className="printer"><span className={`dot ${printer?.available ? "online" : "offline"}`} />{printer?.available ? `Принтер готов${printer.printMode === "dry-run" ? " · тестовый режим" : ""}` : "Принтер временно недоступен"}</div>
          <section className="card stack">
            <label className="dropzone">
              <input type="file" accept="application/pdf,.pdf" onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
              <span className="upload-icon" aria-hidden="true">↑</span>
              <span className="file-name">{file?.name ?? "Выбрать PDF"}</span>
              <span className="hint">PDF · до 20 МБ · до 100 страниц</span>
            </label>

            {file && pageCount && <div className="details stack">
              <div className="row"><span className="label">Страниц</span><span className="value tabular">{pageCount}</span></div>
              <div className="row"><span className="label">Копий</span><div className="stepper"><button className="icon-button" type="button" disabled={copies <= 1} onClick={() => setCopies((value) => value - 1)} aria-label="Уменьшить количество копий">−</button><span className="value tabular">{copies}</span><button className="icon-button" type="button" disabled={copies >= MAX_COPIES} onClick={() => setCopies((value) => value + 1)} aria-label="Увеличить количество копий">+</button></div></div>
              <div className="row"><span className="label">Параметры</span><span className="value">A4 · Ч/Б · 1 сторона</span></div>
              <div className="summary"><div className="label">Всего будет напечатано</div><strong className="tabular">{totalPages} {pluralPages(totalPages)}</strong></div>
            </div>}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="button" onClick={submit} disabled={!file || !pageCount || !printer?.available || busy}>{busy ? "Отправляем…" : "Распечатать"}</button>
          </section>
        </div>
      )}
      <p className="privacy">Документ используется только для печати и автоматически удаляется после выполнения или ошибки</p>
    </main>
  );
}

function pluralPages(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return "страница";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "страницы";
  return "страниц";
}
