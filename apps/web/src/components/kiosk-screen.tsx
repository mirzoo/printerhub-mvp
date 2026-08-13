"use client";

import { useEffect, useMemo, useState } from "react";
import { QrCode } from "./qr-code";

type Method = "web" | "telegram";
type PrinterStatus = { available: boolean; printMode: "dry-run" | "real" | null };

export function KioskScreen({ deviceId }: { deviceId: string }) {
  const [method, setMethod] = useState<Method | null>(null);
  const [origin, setOrigin] = useState("");
  const [printer, setPrinter] = useState<PrinterStatus | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setOrigin(window.location.origin), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const loadStatus = () => fetch(`/api/devices/${encodeURIComponent(deviceId)}/status`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<PrinterStatus> : Promise.reject())
      .then(setPrinter)
      .catch(() => setPrinter({ available: false, printMode: null }));
    void loadStatus();
    const timer = window.setInterval(loadStatus, 15_000);
    return () => window.clearInterval(timer);
  }, [deviceId]);

  const webUrl = origin ? `${origin}/print/${encodeURIComponent(deviceId)}` : "";
  const telegramUrl = useMemo(() => createTelegramUrl(deviceId), [deviceId]);

  return (
    <main className="kiosk-shell">
      <header className="kiosk-header">
        <div className="brand kiosk-brand"><span className="brand-mark">P</span> PrinterHub</div>
        <div className="kiosk-meta">
          <span className="device-badge">{deviceId}</span>
          <span className="printer kiosk-printer"><span className={`dot ${printer?.available ? "online" : "offline"}`} />{printer?.available ? "Аппарат готов" : printer === null ? "Проверяем аппарат…" : "Аппарат не в сети"}</span>
        </div>
      </header>

      {method === null ? (
        <section className="kiosk-content" aria-labelledby="kiosk-title">
          <div className="kiosk-intro">
            <p className="eyebrow">Печать документов</p>
            <h1 id="kiosk-title" className="kiosk-title">Как отправить документ?</h1>
            <p className="kiosk-lead">Выберите удобный способ и продолжите на телефоне</p>
          </div>
          <div className="method-grid">
            <button className="method-card method-card-primary" type="button" onClick={() => setMethod("web")}>
              <span className="method-icon" aria-hidden="true"><PhoneIcon /></span>
              <span className="method-copy"><strong>Через сайт</strong><small>Загрузить PDF в браузере</small></span>
              <span className="method-arrow" aria-hidden="true">→</span>
            </button>
            <button className="method-card" type="button" onClick={() => setMethod("telegram")}>
              <span className="method-icon" aria-hidden="true"><TelegramIcon /></span>
              <span className="method-copy"><strong>Через Telegram</strong><small>{telegramUrl ? "Отправить файл боту" : "Скоро появится"}</small></span>
              <span className="method-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      ) : (
        <section className="kiosk-content kiosk-qr-view" aria-labelledby="qr-title">
          <button className="back-button" type="button" onClick={() => setMethod(null)}><span aria-hidden="true">←</span> Назад</button>
          {method === "web" ? (
            <div className="qr-layout">
              <div className="qr-copy">
                <p className="eyebrow">Через сайт</p>
                <h1 id="qr-title" className="kiosk-title">Отсканируйте QR‑код</h1>
                <p className="kiosk-lead">Наведите камеру телефона. Откроется страница загрузки для этого аппарата</p>
                <p className="pairing-code">Аппарат <strong className="tabular">{deviceId}</strong></p>
              </div>
              <div className="qr-card">{webUrl && <QrCode value={webUrl} label={`QR-код аппарата ${deviceId}`} />}</div>
            </div>
          ) : telegramUrl ? (
            <div className="qr-layout">
              <div className="qr-copy">
                <p className="eyebrow">Через Telegram</p>
                <h1 id="qr-title" className="kiosk-title">Откройте бота</h1>
                <p className="kiosk-lead">Отсканируйте QR‑код. Бот получит номер этого аппарата автоматически</p>
                <p className="pairing-code">Код аппарата <strong className="tabular">{deviceId}</strong></p>
              </div>
              <div className="qr-card"><QrCode value={telegramUrl} label={`QR-код Telegram для аппарата ${deviceId}`} /></div>
            </div>
          ) : (
            <div className="coming-soon">
              <span className="method-icon coming-soon-icon" aria-hidden="true"><TelegramIcon /></span>
              <h1 id="qr-title" className="kiosk-title">Telegram скоро появится</h1>
              <p className="kiosk-lead">Сейчас отправьте документ через сайт</p>
              <button className="primary kiosk-primary" type="button" onClick={() => setMethod("web")}>Перейти к QR‑коду</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function createTelegramUrl(deviceId: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim();
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:") return null;
    url.searchParams.set("start", deviceId);
    return url.toString();
  } catch {
    return null;
  }
}

function PhoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8"/><path d="M10 18.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function TelegramIcon() {
  return <svg viewBox="0 0 24 24" fill="none"><path d="m20.2 4.2-3 15.1c-.2 1-1 1.2-1.8.7l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L5.3 13.2.8 11.8c-1-.3-1-1 .2-1.5L18.6 3.5c.8-.3 1.5.2 1.6.7Z" fill="currentColor"/></svg>;
}
