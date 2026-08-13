import { DEFAULT_DEVICE_ID } from "@printerhub/contracts";
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect(`/print/${DEFAULT_DEVICE_ID}`);
}
