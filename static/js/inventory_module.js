(function () {
  const feedbackEl = document.getElementById('inventory_feedback');
  const summaryCards = document.querySelectorAll('#inventory_summary .summary-card');
  const tableBody = document.querySelector('#inventory_table tbody');
  const alertsList = document.getElementById('inventory_alerts_list');
  const movementsList = document.getElementById('movements_list');
  const transfersList = document.getElementById('transfers_list');

  const filters = {
    size: document.getElementById('size_filter'),
    color: document.getElementById('color_filter'),
    category: document.getElementById('category_filter'),
    store: document.getElementById('store_filter'),
    search: document.getElementById('inventory_search')
  };

  const movementForm = document.getElementById('movement_form');
  const transferForm = document.getElementById('transfer_form');

  const state = {
    items: [],
    filters: {
      size: '',
      color: '',
      category: '',
      store: '',
      search: ''
    },
    products: [],
    stores: []
  };

  function showFeedback(message, type = 'success') {
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.className = `inventory-feedback ${type}`;
    if (message) {
      setTimeout(() => {
        feedbackEl.textContent = '';
        feedbackEl.className = 'inventory-feedback';
      }, 5000);
    }
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function updateSummary(summary) {
    if (!summaryCards || !summary) return;
    summaryCards.forEach((card) => {
      const key = card.getAttribute('data-summary');
      const valueEl = card.querySelector('.summary-value');
      if (!valueEl) return;
      switch (key) {
        case 'units':
          valueEl.textContent = toNumber(summary.total_units).toLocaleString('es-CO');
          break;
        case 'items':
          valueEl.textContent = toNumber(summary.total_items).toLocaleString('es-CO');
          break;
        case 'low_stock':
          valueEl.textContent = toNumber(summary.low_stock).toLocaleString('es-CO');
          break;
        case 'transfers':
          valueEl.textContent = toNumber(summary.pending_transfers).toLocaleString('es-CO');
          break;
        default:
          break;
      }
    });
  }

  function fillSelect(select, values, placeholder) {
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '';
    if (placeholder) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = placeholder;
      select.appendChild(option);
    }
    values.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(item.value ?? item.id ?? item);
      option.textContent = item.label ?? item.name ?? item;
      select.appendChild(option);
    });
    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
      select.value = currentValue;
    }
  }

  function populateFilters(data) {
    if (!data) return;
    fillSelect(filters.size, data.classifiers.sizes.map((size) => ({ value: size, label: size })), 'Todas');
    fillSelect(filters.color, data.classifiers.colors.map((color) => ({ value: color, label: color })), 'Todos');
    fillSelect(filters.category, data.classifiers.categories.map((cat) => ({ value: cat, label: cat })), 'Todas');
    fillSelect(filters.store, data.stores.map((store) => ({ value: store.id, label: store.name })), 'Todas');

    state.products = data.products;
    state.stores = data.stores;

    if (movementForm) {
      fillSelect(
        document.getElementById('movement_product'),
        data.products.map((product) => ({ value: product.id, label: `${product.name} (${product.sku || 'SKU sin asignar'})` })),
        'Seleccione un producto'
      );
      fillSelect(
        document.getElementById('movement_store'),
        data.stores.map((store) => ({ value: store.id, label: store.name })),
        'Seleccione una sucursal'
      );
    }

    if (transferForm) {
      fillSelect(
        document.getElementById('transfer_product'),
        data.products.map((product) => ({ value: product.id, label: `${product.name} (${product.sku || 'SKU sin asignar'})` })),
        'Seleccione un producto'
      );
      fillSelect(
        document.getElementById('transfer_source'),
        data.stores.map((store) => ({ value: store.id, label: `${store.name} - ${store.location || 'Sin ubicación'}` })),
        'Seleccione origen'
      );
      fillSelect(
        document.getElementById('transfer_target'),
        data.stores.map((store) => ({ value: store.id, label: `${store.name} - ${store.location || 'Sin ubicación'}` })),
        'Seleccione destino'
      );
    }
  }

  function applyFilters() {
    return state.items.filter((item) => {
      const sizeMatch = !state.filters.size || item.size === state.filters.size;
      const colorMatch = !state.filters.color || item.color === state.filters.color;
      const categoryMatch = !state.filters.category || item.category === state.filters.category;
      const storeMatch = !state.filters.store || String(item.store_id) === String(state.filters.store);
      const term = state.filters.search.trim().toLowerCase();
      const searchMatch =
        !term ||
        [
          item.product_name,
          item.sku,
          item.store_name,
          item.location,
          item.size,
          item.color,
          item.category
        ]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(term));

      return sizeMatch && colorMatch && categoryMatch && storeMatch && searchMatch;
    });
  }

  function renderInventoryTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    const rows = applyFilters();

    if (!rows.length) {
      const emptyRow = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 9;
      cell.className = 'table-empty';
      cell.textContent = 'No se encontraron registros para los filtros seleccionados.';
      emptyRow.appendChild(cell);
      tableBody.appendChild(emptyRow);
      return;
    }

    rows.forEach((item) => {
      const row = document.createElement('tr');
      row.className = item.low_stock ? 'low-stock' : '';
      row.innerHTML = `
        <td>
          <span class="cell-title">${item.product_name}</span>
          <span class="cell-subtitle">${item.location || ''}</span>
        </td>
        <td>${item.sku || '—'}</td>
        <td>${item.size || '—'}</td>
        <td>${item.color || '—'}</td>
        <td>${item.category || 'Sin categoría'}</td>
        <td>${item.store_name}</td>
        <td>${item.quantity.toLocaleString('es-CO')}</td>
        <td>${item.min_stock.toLocaleString('es-CO')}</td>
        <td><span class="status-pill ${item.low_stock ? 'status-alert' : 'status-ok'}">${item.low_stock ? 'Bajo stock' : 'Disponible'}</span></td>
      `;
      tableBody.appendChild(row);
    });
  }

  function renderAlerts(alerts) {
    if (!alertsList) return;
    alertsList.innerHTML = '';
    if (!alerts.length) {
      alertsList.innerHTML = '<p class="empty-message">Sin alertas activas en este momento.</p>';
      return;
    }

    alerts.forEach((alert) => {
      const card = document.createElement('article');
      card.className = 'alert-card';
      card.innerHTML = `
        <div class="alert-header">
          <span class="alert-product">${alert.product_name} <small>${alert.sku || ''}</small></span>
          <span class="alert-date">${alert.created_at}</span>
        </div>
        <p class="alert-message">${alert.message}</p>
        <div class="alert-meta">
          <span>${alert.store_name}</span>
          <span>Stock: ${alert.quantity} / Min: ${alert.min_stock}</span>
        </div>
      `;
      alertsList.appendChild(card);
    });
  }

  function renderMovements(movements) {
    if (!movementsList) return;
    movementsList.innerHTML = '';

    if (!movements.length) {
      movementsList.innerHTML = '<p class="empty-message">Sin movimientos recientes.</p>';
      return;
    }

    movements.forEach((movement) => {
      const item = document.createElement('article');
      item.className = `movement-card movement-${movement.movement_type}`;
      item.innerHTML = `
        <div class="movement-header">
          <span class="movement-product">${movement.product_name}</span>
          <span class="movement-date">${movement.created_at}</span>
        </div>
        <div class="movement-body">
          <span class="movement-store">${movement.store_name}</span>
          <span class="movement-quantity">${movement.movement_type === 'entry' || movement.movement_type === 'transfer_in' ? '+' : '-'}${movement.quantity}</span>
        </div>
        <div class="movement-footer">
          <span class="movement-user">${movement.performed_by || 'Sistema'}</span>
          <span class="movement-notes">${movement.notes || 'Sin observaciones'}</span>
        </div>
      `;
      movementsList.appendChild(item);
    });
  }

  function renderTransfers(transfers) {
    if (!transfersList) return;
    transfersList.innerHTML = '';

    if (!transfers.length) {
      transfersList.innerHTML = '<p class="empty-message">Sin solicitudes de transferencia registradas.</p>';
      return;
    }

    transfers.forEach((transfer) => {
      const card = document.createElement('article');
      card.className = 'transfer-card';
      card.dataset.id = transfer.id;
      card.innerHTML = `
        <header class="transfer-header">
          <div>
            <span class="transfer-product">${transfer.product_name}</span>
            <small class="transfer-sku">${transfer.sku || ''}</small>
          </div>
          <span class="status-pill ${transfer.status}">${transfer.status_label}</span>
        </header>
        <div class="transfer-body">
          <div>
            <span class="label">Origen</span>
            <span>${transfer.source_store}</span>
            <small>${transfer.source_location || ''}</small>
          </div>
          <div>
            <span class="label">Destino</span>
            <span>${transfer.target_store}</span>
            <small>${transfer.target_location || ''}</small>
          </div>
          <div>
            <span class="label">Cantidad</span>
            <span>${transfer.quantity}</span>
          </div>
        </div>
        <footer class="transfer-footer">
          <div class="transfer-meta">
            <span>Solicitado por: ${transfer.requested_by || '—'}</span>
            <span>Fecha: ${transfer.requested_at}</span>
          </div>
          <div class="transfer-actions">
            ${transfer.can_approve ? '<button class="btn-secondary" data-action="approve">Aprobar</button>' : ''}
            ${transfer.can_confirm ? '<button class="btn-confirm" data-action="confirm">Confirmar recepción</button>' : ''}
          </div>
        </footer>
      `;
      transfersList.appendChild(card);
    });
  }

  async function fetchJSON(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || 'No se pudo completar la solicitud.';
      throw new Error(errorMessage);
    }
    return response.json();
  }

  async function loadOverview() {
    try {
      const data = await fetchJSON('/api/inventory/overview');
      state.items = data.items || [];
      updateSummary(data.summary);
      populateFilters(data);
      renderInventoryTable();
    } catch (error) {
      console.error(error);
      showFeedback(error.message, 'error');
    }
  }

  async function loadAlerts() {
    try {
      const alerts = await fetchJSON('/api/inventory/alerts');
      renderAlerts(alerts);
    } catch (error) {
      console.error(error);
      showFeedback(error.message, 'error');
    }
  }

  async function loadMovements() {
    if (!movementsList) return;
    try {
      const movements = await fetchJSON('/api/inventory/movements');
      renderMovements(movements);
    } catch (error) {
      console.error(error);
      showFeedback(error.message, 'error');
    }
  }

  async function loadTransfers() {
    if (!transfersList) return;
    try {
      const transfers = await fetchJSON('/api/inventory/transfers');
      renderTransfers(transfers);
    } catch (error) {
      console.error(error);
      showFeedback(error.message, 'error');
    }
  }

  function bindFilters() {
    Object.entries(filters).forEach(([key, element]) => {
      if (!element) return;
      element.addEventListener('input', (event) => {
        state.filters[key] = event.target.value;
        renderInventoryTable();
      });
    });
  }

  function serializeForm(form) {
    const formData = new FormData(form);
    return Array.from(formData.entries()).reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  function setLoading(form, isLoading) {
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }
      button.disabled = isLoading;
      button.classList.toggle('is-loading', isLoading);
      button.textContent = isLoading ? 'Procesando...' : button.dataset.originalText;
    }
  }

  async function submitMovement(event) {
    event.preventDefault();
    if (!movementForm) return;
    const payload = serializeForm(movementForm);
    setLoading(movementForm, true);
    try {
      await fetchJSON('/api/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: payload.movement_product,
          store_id: payload.movement_store,
          movement_type: payload.movement_type,
          quantity: payload.movement_quantity,
          notes: payload.movement_notes
        })
      });
      movementForm.reset();
      showFeedback('Movimiento registrado correctamente.');
      await Promise.all([loadOverview(), loadAlerts(), loadMovements()]);
    } catch (error) {
      showFeedback(error.message, 'error');
    } finally {
      setLoading(movementForm, false);
    }
  }

  async function submitTransfer(event) {
    event.preventDefault();
    if (!transferForm) return;
    const payload = serializeForm(transferForm);
    setLoading(transferForm, true);
    try {
      await fetchJSON('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: payload.transfer_product,
          source_store_id: payload.transfer_source,
          target_store_id: payload.transfer_target,
          quantity: payload.transfer_quantity,
          notes: payload.transfer_notes
        })
      });
      transferForm.reset();
      showFeedback('Solicitud enviada exitosamente.');
      await Promise.all([loadOverview(), loadTransfers()]);
    } catch (error) {
      showFeedback(error.message, 'error');
    } finally {
      setLoading(transferForm, false);
    }
  }

  async function handleTransferAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !transfersList) return;
    const action = button.dataset.action;
    const card = button.closest('.transfer-card');
    if (!card) return;
    const transferId = card.dataset.id;
    if (!transferId) return;

    const endpoints = {
      approve: `/api/inventory/transfers/${transferId}/approve`,
      confirm: `/api/inventory/transfers/${transferId}/confirm`
    };

    if (!endpoints[action]) return;
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      await fetchJSON(endpoints[action], { method: 'POST' });
      showFeedback('Estado de la transferencia actualizado correctamente.');
      await Promise.all([loadOverview(), loadTransfers(), loadAlerts(), loadMovements()]);
    } catch (error) {
      showFeedback(error.message, 'error');
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }

  function init() {
    loadOverview();
    loadAlerts();
    loadTransfers();
    bindFilters();

    if (movementForm) {
      movementForm.addEventListener('submit', submitMovement);
      loadMovements();
    }

    if (transferForm) {
      transferForm.addEventListener('submit', submitTransfer);
    }

    if (transfersList) {
      transfersList.addEventListener('click', handleTransferAction);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
