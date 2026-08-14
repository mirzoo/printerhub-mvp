"use client";

import type { JobStatus, PublicJob } from "@printerhub/contracts";
import { terminalStatuses } from "@printerhub/contracts";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const stages: Array<{ status: JobStatus; label: string }> = [
  { status: "queued", label: "Задание создано" },
  { status: "claimed", label: "Принтер получил документ" },
  { status: "printing", label: "Отправлено на печать" },
  { status: "completed", label: "Готово" },
];

const rank: Record<JobStatus, number> = { queued: 0, claimed: 1, printing: 2, completed: 3, failed: -1, expired: -1 };
const errorText: Record<string, string> = {
  DOWNLOAD_FAILED: "Не удалось получить документ. Попробуйте ещё раз",
  INVALID_PDF: "Документ не прошёл проверку PDF",
  PDFINFO_UNAVAILABLE: "Проверка PDF не запущена. Обратитесь к оператору",
  PAGE_COUNT_MISMATCH: "Количество страниц документа изменилось при проверке",
  PRINTER_UNAVAILABLE: "Принтер сейчас недоступен",
  PRINT_COMMAND_FAILED: "Принтер не принял задание",
  PRINT_TIMEOUT: "Принтер не подтвердил завершение вовремя",
  PRINT_STATUS_UNKNOWN: "Не удалось подтвердить результат печати",
  INTERNAL_ERROR: "Внутренняя ошибка. Попробуйте позже",
};

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [name, setName] = useState("Документ PDF");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const nameTimer = window.setTimeout(() => setName(sessionStorage.getItem(`printerhub:file:${id}`) ?? "Документ PDF"), 0);
    const token = window.location.hash.slice(1);
    if (!token) { window.setTimeout(() => setLoadError("Ссылка на задание неполная"), 0); return () => window.clearTimeout(nameTimer); }
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${id}`, { headers: { "x-job-token": token }, cache: "no-store" });
        if (!response.ok) throw new Error("Не удалось получить статус задания");
        const nextJob: PublicJob = await response.json();
        if (!stopped) setJob(nextJob);
        if (!terminalStatuses.has(nextJob.status) && !stopped) window.setTimeout(poll, 2_000);
      } catch (cause) {
        if (!stopped) setLoadError(cause instanceof Error ? cause.message : "Не удалось получить статус");
      }
    };
    void poll();
    return () => { stopped = true; window.clearTimeout(nameTimer); };
  }, [id]);

  const failed = job?.status === "failed" || job?.status === "expired";
  const multipleDocuments = /^\d+ документ/.test(name);
  return <main className="shell">
    <div className="brand"><span className="brand-mark">P</span> PrinterHub</div>
    <h1>{failed ? "Не удалось распечатать" : job?.status === "completed" ? multipleDocuments ? "Документы готовы" : "Документ готов" : multipleDocuments ? "Печатаем документы" : "Печатаем документ"}</h1>
    <p className="lead file-name">{name}</p>
    <section className="card stack status-card">
      {loadError ? <p className="error" role="alert">{loadError}</p> : !job ? <div className="skeleton" /> : failed ? <>
        <div className="status-error" aria-hidden="true">!</div>
        <strong>{job.status === "expired" ? "Время ожидания задания истекло" : "Задание завершилось с ошибкой"}</strong>
        <p className="hint">{errorText[job.errorCode ?? ""] ?? "Попробуйте отправить документ ещё раз"}</p>
      </> : <>
        <div className="timeline">
          {stages.map((stage, index) => {
            const done = rank[job.status] >= index;
            const active = rank[job.status] === index && job.status !== "completed";
            return <div className={`timeline-row ${done ? "done" : ""} ${active ? "active" : ""}`} key={stage.status}><span className="timeline-dot">{done ? "✓" : ""}</span><span>{stage.label}</span></div>;
          })}
        </div>
        <div className="summary"><div className="label">Задание</div><strong className="tabular">{job.pageCount} × {job.copies} = {job.totalPages}</strong><div className="hint">страниц · A4 · Ч/Б</div></div>
      </>}
    </section>
    <p className="privacy">Файл удаляется автоматически после завершения задания</p>
  </main>;
}
