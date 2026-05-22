import { Button } from "../components/Button";
import { useGuide } from "./useGuide";

export function GuideButton({ guideId, label, className, size = "md" }: { guideId: string; label: string; className?: string; size?: "sm" | "md" | "lg" | "icon" }) {
  const { registry, startGuide } = useGuide();

  if (!registry[guideId]) {
    return null;
  }

  return <Button className={className} size={size} variant="secondary" onClick={() => startGuide(guideId)}>{label}</Button>;
}