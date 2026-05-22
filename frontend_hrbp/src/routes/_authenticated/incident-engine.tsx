import { createFileRoute } from "@tanstack/react-router";
import IncidentEngine from "@/pages/hrbp/IncidentEngine";

export const Route = createFileRoute("/_authenticated/incident-engine")({
  component: IncidentEngine,
});
