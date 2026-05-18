import { useRouter } from "next/router";
import DashboardLayout from "@/src/components/layout/DashboardLayout";
import PaperDetail from "@/src/screens/PaperDetail";

export default function PaperDetailPage() {
  const router = useRouter();
  const paperId = router.query.id;

  if (typeof paperId !== "string") return null;

  return (
    <DashboardLayout>
      <PaperDetail id={paperId} />
    </DashboardLayout>
  );
}
