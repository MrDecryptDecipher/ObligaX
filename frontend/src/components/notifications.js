/**
 * ObligaX Toast Notifications Stack Component
 * Non-blocking, accessible alerts replacing browser alert()
 */

import { store } from '../state/store.js';
import { createElement } from '../utils/dom.js';
import { createSvgIcon } from '../utils/icons.js';

export function renderNotifications(container) {
  const state = store.getState();

  const toasts = state.notifications.map(n => {
    let iconName = 'info';
    if (n.type === 'success') iconName = 'check';
    if (n.type === 'error') iconName = 'alertTriangle';
    if (n.type === 'warning') iconName = 'alertTriangle';

    return createElement('div', {
      className: `toast toast-${n.type}`,
      role: 'alert',
      'aria-live': 'assertive'
    },
      createSvgIcon(iconName, 16),
      createElement('div', { className: 'toast-content' },
        createElement('div', { className: 'toast-title' }, n.title),
        createElement('div', { className: 'toast-message' }, n.message)
      ),
      createElement('button', {
        className: 'toast-close-btn',
        title: 'Dismiss alert',
        onClick: () => store.dismissNotification(n.id)
      },
        createSvgIcon('x', 14)
      )
    );
  });

  const toastContainer = createElement('div', { className: 'toast-container' }, ...toasts);

  container.innerHTML = '';
  container.appendChild(toastContainer);
}
