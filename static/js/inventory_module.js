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
  const movementProductSelect = document.getElementById('movement_product');
  const movementStoreSelect = document.getElementById('movement_store');
  const movementTypeSelect = document.getElementById('movement_type');
  const movementProductSearch = document.getElementById('movement_product_search');
  const newProductToggle = document.getElementById('new_product_toggle');
  const newProductFields = document.getElementById('new_product_fields');
  const productDetailsCard = document.getElementById('movement_product_details');
  const existingProductFields = movementForm
    ? Array.from(movementForm.querySelectorAll('[data-existing-product-field]'))
    : [];
  const productDetailFields = productDetailsCard
    ? {
        sku: productDetailsCard.querySelector('[data-detail="sku"]'),
        category: productDetailsCard.querySelector('[data-detail="category"]'),
        size: productDetailsCard.querySelector('[data-detail="size"]'),
        color: productDetailsCard.querySelector('[data-detail="color"]'),
        stock: productDetailsCard.querySelector('[data-detail="stock"]'),
        min_stock: productDetailsCard.querySelector('[data-detail="min_stock"]')
      }
    : {};
  const newProductInputs = {
    name: document.getElementById('new_product_name'),
    sku: document.getElementById('new_product_sku'),
    category: document.getElementById('new_product_category'),
    size: document.getElementById('new_product_size'),
    color: document.getElementById('new_product_color'),
    min_stock: document.getElementById('new_product_min_stock'),
    price: document.getElementById('new_product_price')
  };
  const transferForm = document.getElementById('transfer_form');
  const openProductModalButton = document.getElementById('open_product_modal');
  const productModal = document.getElementById('product_edit_modal');
  const productModalForm = document.getElementById('product_edit_form');
  const productModalSelect = document.getElementById('product_edit_select');
  const productModalSku = document.getElementById('product_edit_sku');
  const productModalName = document.getElementById('product_edit_name');
  const productModalMinStock = document.getElementById('product_edit_min_stock');
  const productModalSize = document.getElementById('product_edit_size');
  const productModalColor = document.getElementById('product_edit_color');
  const productModalCategory = document.getElementById('product_edit_category');
  const productModalPrice = document.getElementById('product_edit_price');
  const modalCloseTriggers = productModal
    ? Array.from(productModal.querySelectorAll('[data-modal-action="close"]'))
    : [];

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
    stores: [],
    classifiers: {
      sizes: [],
      colors: [],
      categories: []
    }
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

  function updateDatalist(datalistId, values) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;
    datalist.innerHTML = '';
    values
      .filter((value) => value !== null && value !== undefined && value !== '')
      .forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        datalist.appendChild(option);
      });
  }

  function formatProductLabel(product) {
    const sku = product.sku ? product.sku : 'SKU sin asignar';
    return `${product.name} (${sku})`;
  }

  function filterProductsByTerm(term) {
    const normalized = term ? term.trim().toLowerCase() : '';
    if (!normalized) {
      return state.products;
    }

    return state.products.filter((product) => {
      const fields = [product.name, product.sku, product.size, product.color, product.category];
      return fields
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(normalized));
    });
  }

  function refreshMovementProductOptions(searchTerm = '') {
    if (!movementProductSelect) return;
    const products = filterProductsByTerm(searchTerm);
    fillSelect(
      movementProductSelect,
      products.map((product) => ({ value: product.id, label: formatProductLabel(product) })),
      'Seleccione un producto'
    );
  }

  function populateFilters(data) {
    if (!data) return;
    const classifiers = data.classifiers || { sizes: [], colors: [], categories: [] };
    state.classifiers = {
      sizes: classifiers.sizes || [],
      colors: classifiers.colors || [],
      categories: classifiers.categories || []
    };

    fillSelect(filters.size, state.classifiers.sizes.map((size) => ({ value: size, label: size })), 'Todas');
    fillSelect(filters.color, state.classifiers.colors.map((color) => ({ value: color, label: color })), 'Todos');
    fillSelect(filters.category, state.classifiers.categories.map((cat) => ({ value: cat, label: cat })), 'Todas');
    fillSelect(filters.store, (data.stores || []).map((store) => ({ value: store.id, label: store.name })), 'Todas');

    updateDatalist('inventory_size_options', state.classifiers.sizes);
    updateDatalist('inventory_color_options', state.classifiers.colors);
    updateDatalist('inventory_category_options', state.classifiers.categories);

    state.products = data.products || [];
    state.stores = data.stores || [];

    if (movementForm) {
      refreshMovementProductOptions(movementProductSearch ? movementProductSearch.value : '');
      fillSelect(
        movementStoreSelect,
        state.stores.map((store) => ({ value: store.id, label: store.name })),
        'Seleccione una sucursal'
      );
    }

    if (productModalSelect) {
      fillSelect(
        productModalSelect,
        state.products.map((product) => ({ value: product.id, label: formatProductLabel(product) })),
        'Seleccione un producto'
      );
    }

    if (transferForm) {
      fillSelect(
        document.getElementById('transfer_product'),
        state.products.map((product) => ({ value: product.id, label: formatProductLabel(product) })),
        'Seleccione un producto'
      );
      fillSelect(
        document.getElementById('transfer_source'),
        state.stores.map((store) => ({ value: store.id, label: `${store.name} - ${store.location || 'Sin ubicación'}` })),
        'Seleccione origen'
      );
      fillSelect(
        document.getElementById('transfer_target'),
        state.stores.map((store) => ({ value: store.id, label: `${store.name} - ${store.location || 'Sin ubicación'}` })),
        'Seleccione destino'
      );
    }

    updateMovementProductDetails();
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

  function findInventoryItem(productId, storeId) {
    if (!productId) return null;
    const productIdStr = String(productId);
    if (storeId) {
      const storeIdStr = String(storeId);
      return (
        state.items.find(
          (item) => String(item.product_id) === productIdStr && String(item.store_id) === storeIdStr
        ) || null
      );
    }
    return state.items.find((item) => String(item.product_id) === productIdStr) || null;
  }

  function clearProductDetails() {
    if (!productDetailsCard) return;
    Object.values(productDetailFields).forEach((field) => {
      if (field) {
        field.textContent = '—';
      }
    });
    productDetailsCard.hidden = true;
  }

  function updateMovementProductDetails() {
    if (!productDetailsCard || !movementProductSelect || !movementStoreSelect) return;
    if (newProductToggle && newProductToggle.checked) {
      clearProductDetails();
      return;
    }
    const productId = movementProductSelect.value;
    if (!productId) {
      clearProductDetails();
      return;
    }

    const product = state.products.find((item) => String(item.id) === String(productId));
    if (!product) {
      clearProductDetails();
      return;
    }

    const storeId = movementStoreSelect.value;
    const inventoryItem = findInventoryItem(productId, storeId || null);

    if (productDetailFields.sku) {
      productDetailFields.sku.textContent = product.sku || '—';
    }
    if (productDetailFields.category) {
      productDetailFields.category.textContent = product.category || 'Sin categoría';
    }
    if (productDetailFields.size) {
      productDetailFields.size.textContent = product.size || '—';
    }
    if (productDetailFields.color) {
      productDetailFields.color.textContent = product.color || '—';
    }
    if (productDetailFields.stock) {
      const quantity = inventoryItem ? Number(inventoryItem.quantity || 0) : 0;
      productDetailFields.stock.textContent = quantity.toLocaleString('es-CO');
    }
    if (productDetailFields.min_stock) {
      let minStockValue = null;
      if (inventoryItem && inventoryItem.min_stock !== undefined) {
        minStockValue = Number(inventoryItem.min_stock || 0);
      } else if (product.min_stock !== undefined && product.min_stock !== null) {
        minStockValue = Number(product.min_stock);
      }
      productDetailFields.min_stock.textContent =
        minStockValue !== null ? minStockValue.toLocaleString('es-CO') : '—';
    }

    productDetailsCard.hidden = false;
  }

  function clearNewProductInputs() {
    Object.values(newProductInputs).forEach((input) => {
      if (input) {
        input.value = '';
      }
    });
  }

  function toggleNewProductFields(forceValue) {
    if (!newProductToggle) return;
    if (forceValue !== undefined) {
      newProductToggle.checked = Boolean(forceValue);
    }
    const isEnabled = newProductToggle.checked;

    if (newProductFields) {
      newProductFields.hidden = !isEnabled;
    }

    ['name', 'sku', 'min_stock'].forEach((key) => {
      if (newProductInputs[key]) {
        if (isEnabled) {
          newProductInputs[key].setAttribute('required', 'required');
        } else {
          newProductInputs[key].removeAttribute('required');
        }
      }
    });

    if (!isEnabled) {
      clearNewProductInputs();
    }

    if (movementProductSelect) {
      movementProductSelect.required = !isEnabled;
      movementProductSelect.disabled = isEnabled;
      if (isEnabled) {
        movementProductSelect.value = '';
      }
    }

    if (movementProductSearch) {
      if (isEnabled) {
        movementProductSearch.value = '';
      }
      movementProductSearch.disabled = isEnabled;
    }

    if (!isEnabled && movementProductSelect) {
      refreshMovementProductOptions(movementProductSearch ? movementProductSearch.value : '');
    }

    existingProductFields.forEach((field) => {
      field.hidden = isEnabled;
      field.classList.toggle('is-disabled', isEnabled);
    });

    if (movementTypeSelect) {
      if (isEnabled) {
        movementTypeSelect.value = 'entry';
        movementTypeSelect.disabled = true;
      } else {
        movementTypeSelect.disabled = false;
      }
    }

    if (productDetailsCard) {
      productDetailsCard.hidden = isEnabled || !movementProductSelect || !movementProductSelect.value;
      if (isEnabled) {
        clearProductDetails();
      }
    }
  }

  function resetMovementForm() {
    if (!movementForm) return;
    movementForm.reset();
    toggleNewProductFields(false);

    if (movementProductSelect) {
      movementProductSelect.disabled = false;
      movementProductSelect.required = true;
    }

    if (movementProductSearch) {
      movementProductSearch.disabled = false;
      movementProductSearch.value = '';
    }

    if (movementTypeSelect) {
      movementTypeSelect.disabled = false;
      movementTypeSelect.value = 'entry';
    }

    updateMovementProductDetails();
  }

  function populateProductModalFields(productId) {
    if (!productModalForm) return;
    if (!productId) {
      productModalSku.value = '';
      productModalName.value = '';
      productModalMinStock.value = '';
      productModalSize.value = '';
      productModalColor.value = '';
      productModalCategory.value = '';
      productModalPrice.value = '';
      return;
    }

    const product = state.products.find((item) => String(item.id) === String(productId));
    if (!product) return;

    productModalSku.value = product.sku || '';
    productModalName.value = product.name || '';
    const inventoryItem = findInventoryItem(productId, null);
    const minStockValue =
      inventoryItem && inventoryItem.min_stock !== undefined && inventoryItem.min_stock !== null
        ? Number(inventoryItem.min_stock)
        : product.min_stock !== undefined && product.min_stock !== null
          ? Number(product.min_stock)
          : 0;
    productModalMinStock.value = Number.isNaN(minStockValue) ? 0 : minStockValue;
    productModalSize.value = product.size || '';
    productModalColor.value = product.color || '';
    productModalCategory.value = product.category || '';
    productModalPrice.value =
      product.price !== undefined && product.price !== null ? Number(product.price).toString() : '';
  }

  function openProductModal() {
    if (!productModal) return;
    productModal.setAttribute('aria-hidden', 'false');
    if (productModalSelect) {
      if (!productModalSelect.value && productModalSelect.options.length > 1) {
        productModalSelect.selectedIndex = 1;
      }
      populateProductModalFields(productModalSelect.value);
      setTimeout(() => {
        productModalSelect.focus();
      }, 50);
    }
  }

  function closeProductModal() {
    if (!productModal) return;
    productModal.setAttribute('aria-hidden', 'true');
    if (productModalForm) {
      productModalForm.reset();
    }
  }

  async function submitProductModal(event) {
    event.preventDefault();
    if (!productModalForm || !productModalSelect) return;
    const productId = productModalSelect.value;
    if (!productId) {
      showFeedback('Seleccione un producto para actualizar.', 'error');
      return;
    }

    const payload = {
      sku: productModalSku.value.trim(),
      name: productModalName.value.trim(),
      min_stock: productModalMinStock.value,
      size: productModalSize.value.trim(),
      color: productModalColor.value.trim(),
      category: productModalCategory.value.trim(),
      price: productModalPrice.value
    };

    if (!payload.name || !payload.sku) {
      showFeedback('El nombre y el SKU son obligatorios.', 'error');
      return;
    }

    setLoading(productModalForm, true);
    try {
      await fetchJSON(`/api/inventory/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showFeedback('Producto actualizado correctamente.');
      closeProductModal();
      await Promise.all([loadOverview(), loadAlerts()]);
      updateMovementProductDetails();
    } catch (error) {
      showFeedback(error.message, 'error');
    } finally {
      setLoading(productModalForm, false);
    }
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
      updateMovementProductDetails();
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
    const isNewProduct = Boolean(newProductToggle && newProductToggle.checked);
    const storeId = movementStoreSelect ? movementStoreSelect.value : payload.movement_store;
    let movementTypeValue = movementTypeSelect ? movementTypeSelect.value : payload.movement_type;
    const quantityValue = payload.movement_quantity;
    const productIdValue = movementProductSelect ? movementProductSelect.value : payload.movement_product;
    const notesValue = (payload.movement_notes || '').trim();

    if (!storeId) {
      showFeedback('Seleccione una sucursal para registrar el movimiento.', 'error');
      return;
    }

    if (!quantityValue || Number(quantityValue) <= 0) {
      showFeedback('Ingrese una cantidad válida mayor a cero.', 'error');
      return;
    }

    if (!movementTypeValue) {
      movementTypeValue = 'entry';
    }

    movementTypeValue = movementTypeValue.toLowerCase();

    const requestBody = {
      store_id: storeId,
      movement_type: movementTypeValue,
      quantity: quantityValue,
      notes: notesValue || undefined
    };

    if (isNewProduct) {
      const newProductData = {
        name: (newProductInputs.name?.value || '').trim(),
        sku: (newProductInputs.sku?.value || '').trim(),
        category: (newProductInputs.category?.value || '').trim(),
        size: (newProductInputs.size?.value || '').trim(),
        color: (newProductInputs.color?.value || '').trim(),
        min_stock: newProductInputs.min_stock?.value,
        price: newProductInputs.price?.value
      };

      if (!newProductData.name || !newProductData.sku) {
        showFeedback('El nombre y el SKU del nuevo producto son obligatorios.', 'error');
        return;
      }

      if (newProductData.min_stock === '' || newProductData.min_stock === undefined) {
        showFeedback('Defina un stock mínimo para el nuevo producto.', 'error');
        return;
      }

      if (Number(newProductData.min_stock) < 0) {
        showFeedback('El stock mínimo debe ser un número igual o mayor a cero.', 'error');
        return;
      }

      if (newProductData.price === '') {
        delete newProductData.price;
      }

      movementTypeValue = 'entry';
      requestBody.movement_type = movementTypeValue;
      requestBody.new_product = newProductData;
    } else {
      if (!productIdValue) {
        showFeedback('Seleccione un producto existente para el movimiento.', 'error');
        return;
      }

      requestBody.product_id = productIdValue;

      if (movementTypeValue === 'exit') {
        const inventoryItem = findInventoryItem(productIdValue, storeId);
        const availableQuantity = inventoryItem ? Number(inventoryItem.quantity || 0) : 0;
        if (!inventoryItem || availableQuantity <= 0) {
          showFeedback('El producto seleccionado no cuenta con existencias en la sucursal elegida.', 'error');
          return;
        }
      }
    }

    setLoading(movementForm, true);
    try {
      await fetchJSON('/api/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      resetMovementForm();
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
      if (movementProductSelect) {
        movementProductSelect.addEventListener('change', updateMovementProductDetails);
      }
      if (movementStoreSelect) {
        movementStoreSelect.addEventListener('change', updateMovementProductDetails);
      }
      if (movementProductSearch) {
        const handleProductSearch = (event) => {
          refreshMovementProductOptions(event.target.value);
          updateMovementProductDetails();
        };
        movementProductSearch.addEventListener('input', handleProductSearch);
        movementProductSearch.addEventListener('search', handleProductSearch);
      }
      if (newProductToggle) {
        newProductToggle.addEventListener('change', () => {
          toggleNewProductFields();
          updateMovementProductDetails();
        });
        toggleNewProductFields(false);
      }
      loadMovements();
    }

    if (transferForm) {
      transferForm.addEventListener('submit', submitTransfer);
    }

    if (transfersList) {
      transfersList.addEventListener('click', handleTransferAction);
    }

    if (openProductModalButton) {
      openProductModalButton.addEventListener('click', openProductModal);
    }

    modalCloseTriggers.forEach((trigger) => {
      trigger.addEventListener('click', closeProductModal);
    });

    if (productModalSelect) {
      productModalSelect.addEventListener('change', (event) => {
        populateProductModalFields(event.target.value);
      });
    }

    if (productModalForm) {
      productModalForm.addEventListener('submit', submitProductModal);
    }

    if (productModal) {
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && productModal.getAttribute('aria-hidden') === 'false') {
          closeProductModal();
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
