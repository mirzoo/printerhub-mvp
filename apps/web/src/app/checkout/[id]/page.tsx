"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PublicOrder = {
  id: string; deviceId: string; status: string; paymentStatus: "pending" | "paid" | "failed"; documentCount: number;
  selectedPageCount: number; copies: number; totalSheets: number; totalPriceMinor: number; currency: "TJS";
  colorMode: "bw"; duplex: false; paperSize: "A4"; printJobId: string | null; expiresAt: string;
};

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [token, setToken] = useState("");
  const [copyToken, setCopyToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const nextToken = window.location.hash.slice(1);
    const timer = window.setTimeout(() => {
      setToken(nextToken);
      setCopyToken(sessionStorage.getItem(`printerhub:copy-order:${id}`) ?? "");
      try { setNames(JSON.parse(sessionStorage.getItem(`printerhub:order:${id}`) ?? "[]") as string[]); } catch { setNames([]); }
    }, 0);
    if (!nextToken) { window.setTimeout(() => setError("Ссылка на заказ неполная"), 0); return () => window.clearTimeout(timer); }
    fetch(`/api/orders/${id}`, { headers: { "x-order-token": nextToken }, cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message ?? "Не удалось открыть заказ"); setOrder(result as PublicOrder); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось открыть заказ"));
    return () => window.clearTimeout(timer);
  }, [id]);

  async function pay(outcome: "success" | "failed") {
    if (!token) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/orders/${id}/pay`, { method: "POST", headers: { "content-type": "application/json", "x-order-token": token, ...(copyToken ? { "x-copy-token": copyToken } : {}) }, body: JSON.stringify({ outcome }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Оплата не прошла");
      sessionStorage.setItem(`printerhub:file:${result.jobId}`, names.length > 1 ? `${names.length} документа` : names[0] ?? "Документ PDF");
      router.push(`/jobs/${result.jobId}#${result.jobToken}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Оплата не прошла. Попробуйте снова"); setBusy(false); }
  }

  return <main className="shell checkout-shell">
    <div className="brand"><span className="brand-mark">P</span> PrinterHub {order && <span className="device-badge">{order.deviceId}</span>}</div>
    <p className="eyebrow checkout-eyebrow">Проверка заказа</p>
    <h1>Всё верно?</h1>
    <p className="lead">Проверьте документы и стоимость перед оплатой</p>
    <section className="card stack checkout-card">
      {!order && !error ? <div className="skeleton" /> : order && <>
        <div className="checkout-documents">
          <div className="label">Документы</div>
          {(names.length ? names : Array.from({ length: order.documentCount }, (_, index) => `Документ ${index + 1}`)).map((name, index) => <div className="checkout-document" key={`${name}-${index}`}><span className="pdf-mark small">PDF</span><span className="file-name">{name}</span></div>)}
        </div>
        <div className="checkout-lines">
          <div className="row"><span className="label">Страницы</span><span className="value tabular">{order.selectedPageCount} × {order.copies} = {order.totalSheets}</span></div>
          <div className="row"><span className="label">Параметры</span><span className="value">A4 · Ч/Б · 1 сторона</span></div>
        </div>
        <div className="checkout-total"><span>К оплате</span><strong className="tabular">{formatPrice(order.totalPriceMinor)}</strong></div>
        <div className="demo-note"><strong>Демо‑оплата</strong><span>Деньги не списываются</span></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="button" onClick={() => void pay("success")} disabled={busy || order.status === "expired"}>{busy ? "Подтверждаем…" : `Оплатить ${formatPrice(order.totalPriceMinor)}`}</button>
        <button className="text-button failure-test" type="button" onClick={() => void pay("failed")} disabled={busy}>Проверить отказ оплаты</button>
      </>}
      {!order && error && <p className="error" role="alert">{error}</p>}
    </section>
    <p className="privacy">Задание попадёт в очередь только после подтверждённой оплаты</p>
  </main>;
}

function formatPrice(minor: number) { return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} сомони`; }
