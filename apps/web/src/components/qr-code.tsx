"use client";

import QRCode from "qrcode";
import Image from "next/image";
import { useEffect, useState } from "react";

export function QrCode({ value, label }: { value: string; label: string }) {
  const [result, setResult] = useState<{ value: string; source: string; failed: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: 360,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#18201d", light: "#ffffff" },
    })
      .then((url) => active && setResult({ value, source: url, failed: false }))
      .catch(() => active && setResult({ value, source: "", failed: true }));
    return () => { active = false; };
  }, [value]);

  if (result?.value === value && result.failed) return <p className="kiosk-error" role="alert">Не удалось показать QR‑код. Вернитесь назад и попробуйте снова</p>;
  if (result?.value !== value || !result.source) return <div className="qr-skeleton" aria-label="Создаём QR-код" />;

  return <Image className="qr-image" src={result.source} alt={label} width={360} height={360} unoptimized />;
}
