import { deviceIdSchema } from "@printerhub/contracts";
import { KioskScreen } from "@/components/kiosk-screen";

export default async function KioskPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId: rawDeviceId } = await params;
  const parsed = deviceIdSchema.safeParse(rawDeviceId.toLowerCase());

  if (!parsed.success) {
    return (
      <main className="kiosk-shell invalid-kiosk">
        <section className="card empty-state">
          <span className="status-error" aria-hidden="true">×</span>
          <h1 className="state-title">Неверный номер аппарата</h1>
          <p className="lead state-copy">Проверьте адрес kiosk‑экрана в настройках</p>
        </section>
      </main>
    );
  }

  return <KioskScreen deviceId={parsed.data} />;
}
