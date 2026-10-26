import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

/** Exercise native controls and real React state; no component or handler mocks. */
export async function mountGuidedPanel(element: ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  function control(label: string, index = 0) {
    const candidates = [...container.querySelectorAll('label')]
      .filter(row => row.querySelector('.guided-field-label')?.textContent?.trim() === label)
      .map(row => row.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'));
    const field = candidates[index];
    if (!field) throw new Error(`Missing control ${label} #${index + 1}`);
    return field;
  }
  async function change(label: string, value: string, index = 0) {
    const field = control(label, index);
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error('Missing native value setter');
    await act(async () => {
      setter.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    });
  }
  async function click(label: string, index = 0) {
    const button = [...container.querySelectorAll('button')]
      .filter(row => row.getAttribute('aria-label') === label || row.textContent?.trim() === label)[index];
    if (!button) throw new Error(`Missing button ${label} #${index + 1}`);
    await act(async () => button.click());
  }
  async function expand(label: string) {
    const summary = [...container.querySelectorAll('summary')]
      .find(row => row.textContent?.trim() === label);
    if (!summary) throw new Error(`Missing disclosure ${label}`);
    await act(async () => summary.click());
    const details = summary.parentElement;
    if (!(details instanceof HTMLDetailsElement) || !details.open) throw new Error(`Disclosure ${label} did not open`);
  }
  return {
    container, control, change, click, expand,
    render: async (next: ReactNode) => { await act(async () => root.render(next)); },
    dispose: async () => { await act(async () => root.unmount()); container.remove(); },
  };
}
