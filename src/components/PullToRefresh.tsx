import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const THRESHOLD = 70;
const MAX_PULL = 100;

interface Props {
  onRefresh: () => void;
  isRefreshing: boolean;
  disabled: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, isRefreshing, disabled, className, children }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const wasPulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pull = useMotionValue(0);
  const rotate = useTransform(pull, [0, THRESHOLD], [0, 180]);
  const opacity = useTransform(pull, [0, 20], [0, 1]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    if ((scrollRef.current?.scrollTop ?? 0) > 0) {
      touchStartY.current = null;
      return;
    }
    touchStartY.current = e.touches[0].clientY;
    wasPulling.current = false;
  };

  const handleTouchEnd = () => {
    if (disabled || isRefreshing) return;
    if (wasPulling.current && pullDistance >= THRESHOLD) {
      onRefresh();
    }
    touchStartY.current = null;
    wasPulling.current = false;
    setPullDistance(0);
    pull.set(0);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (disabled || isRefreshing || touchStartY.current == null) return;
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta <= 0) return;
      wasPulling.current = true;
      e.preventDefault();
      const capped = Math.min(delta, MAX_PULL);
      setPullDistance(capped);
      pull.set(capped);
    };

    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  }, [disabled, isRefreshing, pull]);

  const showIndicator = isRefreshing || pullDistance > 0;

  return (
    <div
      ref={scrollRef}
      className={cn('relative', className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {showIndicator && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <motion.div
            className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center"
            style={{ opacity: isRefreshing ? 1 : opacity }}
          >
            <motion.div style={{ rotate: isRefreshing ? 0 : rotate }}>
              <RefreshCw className={cn('w-3.5 h-3.5 text-zinc-300', isRefreshing && 'animate-spin')} />
            </motion.div>
          </motion.div>
        </div>
      )}
      {children}
    </div>
  );
}
