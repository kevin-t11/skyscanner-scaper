"use client";
// beui.dev/components/motion/morphing-modal

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { EASE_OUT, SPRING_PANEL } from "@/lib/ease";
import { cn } from "@/lib/utils";

const subscribeToClientRender = () => () => {};

function useIsClientRender() {
  return useSyncExternalStore(
    subscribeToClientRender,
    () => true,
    () => false,
  );
}

function handleModalKeyDown(
  event: KeyboardEvent,
  panel: HTMLDivElement | null,
  onClose: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = panel?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  );
  if (!focusable?.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export interface MorphingModalProps {
  /** Which view is currently shown. `null` closes the modal. */
  viewId: string | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Set when a dialog primitive already manages focus, Escape, and scroll locking. */
  managedFocus?: boolean;
}

export function MorphingModal({
  viewId,
  onClose,
  children,
  className,
  managedFocus = false,
}: MorphingModalProps) {
  const open = viewId !== null;
  const isClientRender = useIsClientRender();
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const enterY = reduce ? 0 : 20;
  const enterScale = reduce ? 1 : 0.97;
  const closeFromKeyboard = useEffectEvent(onClose);

  useEffect(() => {
    if (!open || managedFocus) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, managedFocus]);

  useEffect(() => {
    if (!open || managedFocus) return;

    const handleKeyDown = (event: KeyboardEvent) =>
      handleModalKeyDown(event, panelRef.current, closeFromKeyboard);

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, managedFocus]);

  const modal = (
    <div
      aria-hidden={!open}
      inert={!open}
      className={cn("fixed inset-0 z-80", open ? "pointer-events-auto" : "pointer-events-none")}
    >
      {/* A transparent backdrop still owns a full-screen filter layer. Remove
          it after exit instead of retaining that layer behind other popups. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.button
            key="backdrop"
            type="button"
            tabIndex={-1}
            aria-label="Close modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
            onClick={onClose}
            className="absolute inset-0 bg-background/5 [backdrop-filter:blur(14px)_saturate(140%)] [-webkit-backdrop-filter:blur(14px)_saturate(140%)]"
          />
        ) : null}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              ref={panelRef}
              data-modal-panel=""
              key="panel"
              layout
              initial={{ opacity: 0, y: enterY, scale: enterScale }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: enterY,
                scale: reduce ? 1 : 0.98,
                transition: { duration: 0.18, ease: EASE_OUT },
              }}
              transition={SPRING_PANEL}
              className={cn(
                "pointer-events-auto relative max-h-[calc(100dvh-2rem)] w-full max-w-[420px] overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card text-foreground shadow-raised will-change-transform",
                className,
              )}
            >
              <motion.div layout="position" className="p-5">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={viewId}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }}
                    animate={
                      reduce
                        ? {
                            opacity: 1,
                            transition: {
                              duration: 0.18,
                              ease: EASE_OUT,
                            },
                          }
                        : {
                            opacity: 1,
                            y: 0,
                            filter: "blur(0px)",
                            transition: {
                              duration: 0.24,
                              ease: EASE_OUT,
                            },
                          }
                    }
                    exit={
                      reduce
                        ? {
                            opacity: 0,
                            transition: {
                              duration: 0.14,
                              ease: EASE_OUT,
                            },
                          }
                        : {
                            opacity: 0,
                            y: -8,
                            filter: "blur(4px)",
                            transition: {
                              duration: 0.16,
                              ease: EASE_OUT,
                            },
                          }
                    }
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );

  return isClientRender ? createPortal(modal, document.body) : null;
}

export interface MorphingModalDialogProps extends Omit<ComponentProps<"dialog">, "open"> {
  children: ReactNode;
}

export function MorphingModalDialog({
  children,
  className,
  role = "dialog",
  ...props
}: MorphingModalDialogProps) {
  return (
    <dialog
      open
      role={role}
      aria-modal="true"
      className={cn(
        "relative m-0 w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-inherit",
        className,
      )}
      {...props}
    >
      {children}
    </dialog>
  );
}
