import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

type RouteTransitionProps = {
  children: ReactNode;
  routeKey?: string;
  className?: string;
};

export function RouteTransition({ children, routeKey, className }: RouteTransitionProps) {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const key = routeKey ?? location.pathname;

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        className={className}
        initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
        transition={{
          duration: 0.22,
          ease: [0.22, 1, 0.36, 1]
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
