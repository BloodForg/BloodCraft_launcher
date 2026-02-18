import { AnimatePresence, motion } from 'framer-motion';
import { useLauncherStore } from '../store/useLauncherStore';

export const ToastViewport = () => {
  const toasts = useLauncherStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[340px] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="panel border border-[#2be11d2e] px-4 py-3 text-sm"
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
