/**
 * ObligaX Safe DOM & Sanitization Utilities
 * Prevents Cross-Site Scripting (XSS) by enforcing safe DOM manipulation.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createElement(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value);
    } else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role') {
      element.setAttribute(key, value);
    } else {
      element[key] = value;
    }
  }

  for (const child of children) {
    if (child === null || child === undefined) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      element.appendChild(child);
    } else if (Array.isArray(child)) {
      for (const subChild of child) {
        if (subChild instanceof Node) {
          element.appendChild(subChild);
        } else if (subChild !== null && subChild !== undefined) {
          element.appendChild(document.createTextNode(String(subChild)));
        }
      }
    }
  }

  return element;
}

export function clearChildren(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Focus trapping utility for accessible modals and drawers
 */
export function trapFocus(containerElement) {
  if (!containerElement) return () => {};
  const focusableElements = containerElement.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusableElements.length) return () => {};

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  function handleKeyDown(e) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  }

  containerElement.addEventListener('keydown', handleKeyDown);
  firstElement.focus();

  return () => {
    containerElement.removeEventListener('keydown', handleKeyDown);
  };
}
