import { useContext } from "react";
import { GuideContext } from "./GuideProvider";

export function useGuide() {
  const value = useContext(GuideContext);

  if (!value) {
    throw new Error("useGuide must be used inside GuideProvider.");
  }

  return value;
}