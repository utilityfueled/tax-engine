"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep native scroll/focus targets below the rendered sticky navigation. */
export function NavigationScrollBoundary({ children }: { children: ReactNode }) {
  const navigation = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const node = navigation.current;
    if (!node) return;

    const style = document.documentElement.style;
    const property = "--site-nav-height";
    const previous = style.getPropertyValue(property);
    const priority = style.getPropertyPriority(property);
    let ownedValue = "";
    let measuredHeight: number | undefined;
    let active = true;
    const measure = () => {
      if (!active) return;
      const height = Math.ceil(node.getBoundingClientRect().height);
      const previousHeight = measuredHeight;
      measuredHeight = height;
      ownedValue = `${height}px`;
      if (style.getPropertyValue(property) !== ownedValue) {
        style.setProperty(property, ownedValue);
      }
      // A native scroll may have used the old inset before resize delivery.
      // Retain the content's position below the header when its height changes.
      if (previousHeight !== undefined && previousHeight !== height && window.scrollY > 0) {
        window.scrollBy({ top: previousHeight - height, behavior: "instant" });
      }
    };
    measure();
    // Viewport changes can precede the next ResizeObserver delivery.
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", measure);
      if (style.getPropertyValue(property) === ownedValue && !style.getPropertyPriority(property)) {
        if (previous) style.setProperty(property, previous, priority);
        else style.removeProperty(property);
      }
    };
  }, []);

  return <nav ref={navigation} className="site-nav" aria-label="Main navigation">{children}</nav>;
}
