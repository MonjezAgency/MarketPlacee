'use client';

import React, { useRef, useEffect } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  useAnimationFrame,
  wrap,
  useMotionValue
} from "framer-motion";

interface MarqueeProps {
  children: React.ReactNode;
  baseVelocity: number;
}

export function Marquee({ children, baseVelocity = 100 }: MarqueeProps) {
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, {
    damping: 50,
    stiffness: 400
  });
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], {
    clamp: false
  });

  const x = useTransform(baseX, (v) => `${wrap(-25, 0, v)}%`);

  const directionFactor = useRef<number>(1);
  useAnimationFrame((t, delta) => {
    let moveBy = directionFactor.current * baseVelocity * (delta / 1000);

    if (velocityFactor.get() < 0) {
      directionFactor.current = -1;
    } else if (velocityFactor.get() > 0) {
      directionFactor.current = 1;
    }

    moveBy += directionFactor.current * moveBy * velocityFactor.get();

    baseX.set(baseX.get() + moveBy);
  });

  return (
    <div className="overflow-hidden whitespace-nowrap flex flex-nowrap w-full">
      <motion.div className="flex whitespace-nowrap flex-nowrap min-w-max" style={{ x }}>
        <div className="flex flex-nowrap shrink-0">{children}</div>
        <div className="flex flex-nowrap shrink-0">{children}</div>
        <div className="flex flex-nowrap shrink-0">{children}</div>
        <div className="flex flex-nowrap shrink-0">{children}</div>
      </motion.div>
    </div>
  );
}
