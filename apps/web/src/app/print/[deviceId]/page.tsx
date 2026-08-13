import { deviceIdSchema } from "@printerhub/contracts";
import { PrintFlow } from "@/components/print-flow";

export default async function PrinterPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId: rawDeviceId } = await params;
  const parsed = deviceIdSchema.safeParse(rawDeviceId.toLowerCase());

  if (!parsed.success) {
    return (
      <main className="shell compact-shell">
        <div className="brand"><span className="brand-mark">P</span> PrinterHub</div>
        <section className="card empty-state">
          <span className="status-error" aria-hidden="true">×</span>
          <h1 className="state-title">Неверная ссылка</h1>
          <p className="lead state-copy">Отсканируйте QR‑код на экране аппарата ещё раз</p>
        </section>
      </main>
    );
  }

  return <PrintFlow deviceId={parsed.data} />;
}
