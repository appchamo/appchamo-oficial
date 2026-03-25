import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  EDGE_SWIPE_BACK_ZONE_PX,
  isMainAppTabPath,
  persistAttrForTabPath,
} from "@/lib/mainAppTabs";
import { usePrevious } from "@/hooks/usePrevious";

const VERTICAL_RATIO = 1.25;
const LOCK_MIN_DX = 16;
const RUBBER_START_RATIO = 0.36;
const PIVOT_SMOOTH = 0.38;

function getRootEl(): HTMLElement | null {
  return document.getElementById("root");
}

function getSlideTarget(pathname: string): HTMLElement | null {
  const shell = document.getElementById("chamo-route-slide-shell");
  if (shell?.getAttribute("data-overlay") === "1") return shell;
  const attr = persistAttrForTabPath(pathname);
  if (attr) {
    return document.querySelector(`[data-chamo-tab-persist="${attr}"]`) as HTMLElement | null;
  }
  return getRootEl();
}

function clearPeek() {
  document.querySelectorAll("[data-chamo-tab-persist].chamo-swipe-peek").forEach((el) => {
    el.classList.remove("chamo-swipe-peek");
  });
}

function activatePeek(prevPathname: string | undefined) {
  clearPeek();
  if (!prevPathname) return;
  const attr = persistAttrForTabPath(prevPathname);
  if (!attr) return;
  document.querySelector(`[data-chamo-tab-persist="${attr}"]`)?.classList.add("chamo-swipe-peek");
}

function clearElementGestureStyles(el: HTMLElement) {
  el.style.transition = "";
  el.style.transform = "";
  el.style.filter = "";
  el.style.boxShadow = "";
  el.style.borderTopRightRadius = "";
  el.style.borderBottomRightRadius = "";
  el.style.willChange = "";
}

function clearAllSlideTransforms() {
  const shell = document.getElementById("chamo-route-slide-shell");
  if (shell) clearElementGestureStyles(shell);
  document.querySelectorAll("[data-chamo-tab-persist]").forEach((node) => {
    clearElementGestureStyles(node as HTMLElement);
  });
  const root = getRootEl();
  if (root) clearElementGestureStyles(root);
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function rubberizeDx(rawPx: number, vw: number): number {
  const maxRubber = vw * RUBBER_START_RATIO;
  const px = Math.max(0, rawPx);
  let x = px;
  if (x > maxRubber) {
    x = maxRubber + (x - maxRubber) * 0.26;
  }
  return Math.min(x, vw * 0.94);
}

function applyClothTransform(
  el: HTMLElement,
  rawDx: number,
  vw: number,
  fingerClientY: number,
  smoothPivotY: { value: number } | null
): number {
  const rect = el.getBoundingClientRect();
  const h = Math.max(rect.height, 1);
  let targetPy = fingerClientY - rect.top;
  targetPy = Math.max(20, Math.min(h - 20, targetPy));

  let py = targetPy;
  if (smoothPivotY !== null) {
    py = smoothPivotY.value + (targetPy - smoothPivotY.value) * PIVOT_SMOOTH;
    smoothPivotY.value = py;
  }

  const x = rubberizeDx(rawDx, vw);
  const pull = Math.min(x / (vw * 0.42), 1);

  const verticalBias = (py / h - 0.5) * 2;
  const rz = -(x / vw) * (5.5 + Math.abs(verticalBias) * 2.2);
  const sy = verticalBias * (x / vw) * 2.0;
  const ry = (x / vw) * 3.8;

  el.style.transition = "none";
  el.style.willChange = "transform";

  const transform = [
    `perspective(${980 + pull * 220}px)`,
    `translate3d(0,${py}px,0)`,
    `rotateZ(${rz}deg)`,
    `skewY(${Math.max(-2.4, Math.min(2.4, sy))}deg)`,
    `translate3d(0,${-py}px,0)`,
    `translate3d(${x}px,0,0)`,
    `rotateY(${-ry}deg)`,
  ].join(" ");

  el.style.transform = transform;

  const shadowA = 0.04 + pull * 0.09;
  el.style.boxShadow = `-8px 0 28px rgba(0,0,0,${shadowA})`;
  const radius = 5 + pull * 11;
  el.style.borderTopRightRadius = `${radius}px`;
  el.style.borderBottomRightRadius = `${radius}px`;

  return py;
}

function applySimpleTransform(el: HTMLElement, rawDx: number, vw: number) {
  const x = rubberizeDx(rawDx, vw);
  const pull = Math.min(x / (vw * 0.45), 1);
  const radius = 6 + pull * 10;
  el.style.transition = "none";
  el.style.willChange = "transform";
  el.style.transformOrigin = "";
  el.style.transform = `translate3d(${x}px,0,0)`;
  el.style.boxShadow = `-8px 0 24px rgba(0,0,0,${0.05 + pull * 0.08})`;
  el.style.borderTopRightRadius = `${radius}px`;
  el.style.borderBottomRightRadius = `${radius}px`;
}

function buildExitTransform(vw: number, pivotY: number, h: number): string {
  const x = vw;
  const pull = 1;
  const py = Math.max(20, Math.min(h - 20, pivotY));
  const verticalBias = (py / Math.max(h, 1) - 0.5) * 2;
  const rz = -(x / vw) * (6 + Math.abs(verticalBias) * 2.5);
  const sy = verticalBias * 2.2;
  const ry = 4.5;
  return [
    `perspective(${980 + pull * 220}px)`,
    `translate3d(0,${py}px,0)`,
    `rotateZ(${rz}deg)`,
    `skewY(${Math.max(-2.6, Math.min(2.6, sy))}deg)`,
    `translate3d(0,${-py}px,0)`,
    `translate3d(${x}px,0,0)`,
    `rotateY(${-ry}deg)`,
  ].join(" ");
}

function springBack(el: HTMLElement) {
  clearPeek();
  el.style.transition =
    "transform 0.42s cubic-bezier(0.32, 1.18, 0.45, 1), box-shadow 0.34s ease, border-radius 0.34s ease";
  el.style.transform = "";
  el.style.boxShadow = "";
  el.style.borderTopRightRadius = "";
  el.style.borderBottomRightRadius = "";
  const onEnd = (ev: TransitionEvent) => {
    if (ev.propertyName !== "transform") return;
    el.removeEventListener("transitionend", onEnd);
    el.style.transition = "";
    el.style.willChange = "";
  };
  el.addEventListener("transitionend", onEnd);
}

export default function EdgeSwipeBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingEnterRef = useRef(false);
  const prevPathname = usePrevious(location.pathname);

  useLayoutEffect(() => {
    if (!pendingEnterRef.current) return;
    pendingEnterRef.current = false;
    if (isMainAppTabPath(location.pathname)) {
      return;
    }

    const root = getRootEl();
    if (!root) return;

    if (prefersReducedMotion()) {
      clearElementGestureStyles(root);
      return;
    }

    root.style.transition = "none";
    root.style.willChange = "transform, filter";
    root.style.transform = "translate3d(-14px,0,0)";
    root.style.filter = "brightness(0.988)";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.style.transition =
          "transform 0.46s cubic-bezier(0.18, 0.9, 0.22, 1), filter 0.4s cubic-bezier(0.2, 0.88, 0.2, 1)";
        root.style.transform = "";
        root.style.filter = "";
        const done = (ev: TransitionEvent) => {
          if (ev.propertyName !== "transform") return;
          root.removeEventListener("transitionend", done);
          root.style.transition = "";
          root.style.willChange = "";
        };
        root.addEventListener("transitionend", done);
      });
    });
  }, [location.key, location.pathname]);

  useEffect(() => {
    const moveOpts: AddEventListenerOptions = { passive: false, capture: true };
    const pathname = location.pathname;

    let start: { x: number; y: number; id: number } | null = null;
    let locked = false;
    const pivotSmooth = { value: 0 };
    let pivotInitialized = false;
    let lastPivotY = 0;

    const disarmMove = () => {
      document.removeEventListener("touchmove", onMove, moveOpts);
      document.removeEventListener("touchend", onEnd, { capture: true } as AddEventListenerOptions);
      document.removeEventListener("touchcancel", onCancel, { capture: true } as AddEventListenerOptions);
    };

    const armMove = () => {
      document.addEventListener("touchmove", onMove, moveOpts);
      document.addEventListener("touchend", onEnd, { passive: true, capture: true });
      document.addEventListener("touchcancel", onCancel, { passive: true, capture: true });
    };

    const abortGesture = () => {
      disarmMove();
      clearPeek();
      start = null;
      locked = false;
      pivotInitialized = false;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || t.clientX > EDGE_SWIPE_BACK_ZONE_PX) return;
      if (pathname === "/home") return;

      const el = e.target as HTMLElement | null;
      if (!el?.closest) return;
      if (el.closest("[data-edge-swipe-back-ignore]")) return;
      if (el.closest("[data-tab-swipe-ignore]")) return;
      if (el.closest('[role="dialog"]')) return;
      if (el.closest("[data-radix-dialog-content]")) return;
      if (el.closest("[data-radix-sheet-content]")) return;

      start = { x: t.clientX, y: t.clientY, id: t.identifier };
      locked = false;
      pivotInitialized = false;
      armMove();
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = Array.from(e.touches).find((x) => x.identifier === start.id);
      if (!t) return;

      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;

      if (!locked) {
        if (Math.abs(dy) > Math.abs(dx) * VERTICAL_RATIO && Math.abs(dy) > 20) {
          abortGesture();
          return;
        }
        if (dx < LOCK_MIN_DX) return;
        if (Math.abs(dx) <= Math.abs(dy) * VERTICAL_RATIO) return;
        locked = true;
        activatePeek(prevPathname);
        const slideEl = getSlideTarget(pathname);
        if (slideEl) {
          const rect = slideEl.getBoundingClientRect();
          const h = Math.max(rect.height, 1);
          const ty = t.clientY - rect.top;
          pivotSmooth.value = Math.max(20, Math.min(h - 20, ty));
          pivotInitialized = true;
        }
      }

      if (locked) {
        e.preventDefault();
        const slideEl = getSlideTarget(pathname);
        if (!slideEl) return;
        const vw = window.innerWidth;
        if (prefersReducedMotion()) {
          applySimpleTransform(slideEl, dx, vw);
        } else {
          const sm = pivotInitialized ? pivotSmooth : null;
          lastPivotY = applyClothTransform(slideEl, dx, vw, t.clientY, sm);
        }
      }
    };

    const completeSwipe = (slideEl: HTMLElement, vw: number) => {
      const reduced = prefersReducedMotion();
      if (reduced) {
        clearPeek();
        clearElementGestureStyles(slideEl);
        pendingEnterRef.current = true;
        navigate(-1);
        return;
      }

      let finished = false;
      let fallbackTimer = 0;

      const runNavigate = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(fallbackTimer);
        slideEl.removeEventListener("transitionend", onTrans);
        clearPeek();
        clearAllSlideTransforms();
        pendingEnterRef.current = true;
        navigate(-1);
      };

      const onTrans = (ev: TransitionEvent) => {
        if (ev.propertyName !== "transform") return;
        runNavigate();
      };

      const h = Math.max(slideEl.getBoundingClientRect().height, 1);
      const exitTf = buildExitTransform(vw, lastPivotY, h);

      slideEl.style.transition =
        "transform 0.38s cubic-bezier(0.18, 0.85, 0.22, 1), box-shadow 0.32s ease, border-radius 0.32s ease";
      slideEl.style.transform = exitTf;
      slideEl.addEventListener("transitionend", onTrans);
      fallbackTimer = window.setTimeout(runNavigate, 520);
    };

    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = Array.from(e.changedTouches).find((x) => x.identifier === start.id);
      if (!t) {
        abortGesture();
        return;
      }

      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const wasLocked = locked;
      disarmMove();
      start = null;
      locked = false;
      pivotInitialized = false;

      const slideEl = getSlideTarget(pathname);
      if (!wasLocked) return;

      if (Math.abs(dy) * VERTICAL_RATIO > Math.abs(dx)) {
        if (slideEl) springBack(slideEl);
        else clearPeek();
        return;
      }

      const vw = window.innerWidth;
      const commitThreshold = Math.max(96, vw * 0.24);

      if (dx < commitThreshold) {
        if (slideEl) springBack(slideEl);
        else clearPeek();
        return;
      }

      if (!slideEl) {
        clearPeek();
        pendingEnterRef.current = true;
        navigate(-1);
        return;
      }

      if (!prefersReducedMotion()) {
        const rect = slideEl.getBoundingClientRect();
        const h = Math.max(rect.height, 1);
        lastPivotY = Math.max(20, Math.min(h - 20, t.clientY - rect.top));
      }

      completeSwipe(slideEl, vw);
    };

    const onCancel = () => {
      if (!start) return;
      const wasLocked = locked;
      disarmMove();
      start = null;
      locked = false;
      pivotInitialized = false;
      if (wasLocked) {
        const slideEl = getSlideTarget(pathname);
        if (slideEl) springBack(slideEl);
        else clearPeek();
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true, capture: true });

    return () => {
      document.removeEventListener("touchstart", onStart, { capture: true } as AddEventListenerOptions);
      disarmMove();
      clearPeek();
      clearAllSlideTransforms();
    };
  }, [navigate, location.pathname, prevPathname]);

  return null;
}
