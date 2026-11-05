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
    const measure = () => {
      ownedValue = `${Math.ceil(node.getBoundingClientRect().height)}px`;
      if (style.getPropertyValue(property) !== ownedValue) {
        style.setProperty(property, ownedValue);
      }
    };
    measure();
    // Viewport changes can precede the next ResizeObserver delivery.
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
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
