"use client";

import { MAX_COPIES, MAX_COPY_PAGES } from "@printerhub/contracts";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type CopyPage = { id: string; position: number; status: "queued" | "scanning" | "ready" | "failed"; errorCode: string | null; hasPreview: boolean };
type CopyState = { id: string; deviceId: string; status: string; orderId: string | null; expiresAt: string; pages: CopyPage[] };

const scanErrorText: Record<string, string> = {
  SCANNER_UNAVAILABLE: "Сканер не отвечает. Проверьте аппарат и повторите",
  SCANNER_BUSY: "Сканер занят. Подождите и повторите",
  SCAN_TIMEOUT: "Сканирование заняло слишком много времени. Повторите",
  SCAN_FAILED: "Не получилось отсканировать лист. Проверьте его положение и повторите",
  INVALID_SCAN: "Скан не удалось обработать. Повторите сканирование",
};

export function CopyFlow({ sessionId, token, onExit }: { sessionId: string; token: string; onExit: () => void }) {
  const router = useRouter();
  const [copy, setCopy] = useState<CopyState | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = useRef(previews);
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { previewsRef.current = previews; }, [previews]);
  useEffect(() => () => { Object.values(previewsRef.current).forEach(URL.revokeObjectURL); }, []);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await copyFetch(`/api/copies/${sessionId}`, token);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "Не удалось обновить состояние");
        if (!stopped) {
          const next = result as CopyState;
          setCopy(next);
          setError("");
          for (const page of next.pages) if (page.status === "ready" && !previewsRef.current[page.id]) void loadPreview(page.id);
        }
      } catch (cause) { if (!stopped) setError(cause instanceof Error ? cause.message : "Не удалось обновить состояние"); }
      if (!stopped) timer = window.setTimeout(poll, 1_500);
    };
    const loadPreview = async (pageId: string) => {
      try {
        const response = await copyFetch(`/api/copies/${sessionId}/pages/${pageId}/preview`, token);
        if (!response.ok) return;
        const url = URL.createObjectURL(await response.blob());
        if (stopped) URL.revokeObjectURL(url);
        else setPreviews((current) => ({ ...current, [pageId]: url }));
      } catch { /* polling retries the preview */ }
    };
    void poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [sessionId, token]);

  const activePage = copy?.pages.find((page) => page.status === "queued" || page.status === "scanning");
  const readyPages = useMemo(() => copy?.pages.filter((page) => page.status === "ready") ?? [], [copy]);
  const failedPages = copy?.pages.filter((page) => page.status === "failed") ?? [];

  async function scan() {
    setBusy(true); setError("");
    try {
      const response = await copyFetch(`/api/copies/${sessionId}/pages`, token, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Не удалось начать сканирование");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось начать сканирование"); }
    finally { setBusy(false); }
  }

  async function changePage(pageId: string, action: "retry" | "delete") {
    setBusy(true); setError("");
    try {
      const response = await copyFetch(`/api/copies/${sessionId}/pages/${pageId}`, token, { method: action === "retry" ? "POST" : "DELETE" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message ?? "Не получилось изменить страницу"); }
      if (previews[pageId]) { URL.revokeObjectURL(previews[pageId]); setPreviews((current) => { const next = { ...current }; delete next[pageId]; return next; }); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не получилось изменить страницу"); }
    finally { setBusy(false); }
  }

  async function checkout() {
    setBusy(true); setError("");
    try {
      const response = await copyFetch(`/api/copies/${sessionId}/checkout`, token, { method: "POST", headers: { "content-type": "application/json", "x-copy-token": token }, body: JSON.stringify({ copies }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Не удалось подготовить заказ");
      sessionStorage.setItem(`printerhub:order:${result.id}`, JSON.stringify([`${readyPages.length} ${pluralPages(readyPages.length)}`]));
      sessionStorage.setItem(`printerhub:copy-order:${result.id}`, token);
      router.push(`/checkout/${result.id}#${result.statusToken}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось подготовить заказ"); setBusy(false); }
  }

  async function exit() {
    await copyFetch(`/api/copies/${sessionId}`, token, { method: "DELETE" }).catch(() => undefined);
    onExit();
  }

  return <section className="kiosk-content copy-flow" aria-labelledby="copy-title">
    <button className="back-button" type="button" onClick={() => void exit()}><span aria-hidden="true">←</span> Выйти</button>
    {!copy ? <div className="copy-loading"><span className="scan-pulse" aria-hidden="true" /><h1 id="copy-title" className="kiosk-title">Подключаем сканер</h1><p className="kiosk-lead">Подождите несколько секунд</p></div>
      : activePage ? <div className="copy-loading"><span className="scan-pulse scanning" aria-hidden="true"><ScanIcon /></span><p className="eyebrow">Страница {activePage.position + 1}</p><h1 id="copy-title" className="kiosk-title">Сканируем лист</h1><p className="kiosk-lead">Не поднимайте крышку до завершения сканирования</p></div>
      : !copy.pages.length ? <div className="copy-start"><div className="copy-instruction-icon" aria-hidden="true"><ScanIcon /></div><p className="eyebrow">Копирование</p><h1 id="copy-title" className="kiosk-title">Положите лист на стекло</h1><p className="kiosk-lead">Выровняйте документ по метке и закройте крышку</p><button className="primary kiosk-primary copy-main-action" type="button" onClick={() => void scan()} disabled={busy}>Сканировать</button></div>
      : <div className="copy-review">
        <div className="copy-review-header"><div><p className="eyebrow">Предпросмотр</p><h1 id="copy-title" className="kiosk-title">Проверьте страницы</h1><p className="kiosk-lead">Если всё верно, добавьте листы или перейдите к оплате</p></div><div className="copy-count tabular"><strong>{copy.pages.length}</strong><span>{pluralPages(copy.pages.length)}</span></div></div>
        <div className="copy-pages">
          {copy.pages.map((page) => <article className={`copy-page ${page.status === "failed" ? "failed" : ""}`} key={page.id}>
            <div className="copy-preview">{previews[page.id] ? <Image src={previews[page.id]} alt={`Предпросмотр страницы ${page.position + 1}`} fill unoptimized sizes="(max-width: 760px) 100vw, 300px" /> : page.status === "failed" ? <span className="preview-error" aria-hidden="true">!</span> : <span className="preview-loading" />}</div>
            <div className="copy-page-meta"><strong>Страница {page.position + 1}</strong>{page.status === "failed" && <small>{scanErrorText[page.errorCode ?? ""] ?? "Не получилось отсканировать лист"}</small>}</div>
            <div className="copy-page-actions"><button type="button" className="secondary compact-button" disabled={busy} onClick={() => void changePage(page.id, "retry")}>Пересканировать</button><button type="button" className="remove-page-button" disabled={busy} onClick={() => void changePage(page.id, "delete")} aria-label={`Удалить страницу ${page.position + 1}`}>×</button></div>
          </article>)}
        </div>
        {error && <p className="error copy-error" role="alert">{error}</p>}
        <div className="copy-footer">
          <button className="secondary copy-add" type="button" onClick={() => void scan()} disabled={busy || copy.pages.length >= MAX_COPY_PAGES || Boolean(activePage)}>+ Добавить страницу</button>
          <div className="copy-checkout-card"><div className="row"><span className="label">Копий</span><div className="stepper"><button className="icon-button" type="button" disabled={copies <= 1 || busy} onClick={() => setCopies((value) => value - 1)}>−</button><span className="value tabular">{copies}</span><button className="icon-button" type="button" disabled={copies >= MAX_COPIES || busy} onClick={() => setCopies((value) => value + 1)}>+</button></div></div><button className="primary" type="button" onClick={() => void checkout()} disabled={busy || !readyPages.length || Boolean(failedPages.length)}>Перейти к оплате</button></div>
        </div>
      </div>}
    {error && (!copy || activePage || !copy.pages.length) && <p className="error copy-error" role="alert">{error}</p>}
  </section>;
}

function copyFetch(url: string, token: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), "x-copy-token": token }, cache: "no-store" });
}

function pluralPages(value: number) {
  const mod10 = value % 10, mod100 = value % 100;
  return mod10 === 1 && mod100 !== 11 ? "страница" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "страницы" : "страниц";
}

function ScanIcon() {
  return <svg viewBox="0 0 24 24" fill="none"><path d="M5 4.5h14v10H5z" stroke="currentColor" strokeWidth="1.7"/><path d="M3 15.5h18v4H3zM7 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
