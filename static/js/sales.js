(function () {
    const endpoints = window.POS_ENDPOINTS || {};
    const toastEl = document.getElementById('pos_toast');
    const state = {
        cart: [],
        customers: [],
        session: null,
        customerHistory: {},
        searchResults: [],
        userType: Number(document.querySelector('.module-wrapper')?.dataset.userType || 0),
        invoiceEditor: {
            active: false,
            invoiceId: null,
            items: [],
            paymentMethod: 'Efectivo',
            meta: {
                invoice_number: '',
                customer: '',
                status: ''
            }
        },
        closingReport: null
    };

    const elements = {
        sessionStatus: document.getElementById('session_status'),
        sessionStatusTag: document.getElementById('session_status_tag'),
        sessionStore: document.getElementById('session_store'),
        openingAmount: document.getElementById('opening_amount'),
        sessionNotes: document.getElementById('session_notes'),
        openSessionBtn: document.getElementById('open_session_btn'),
        closeSessionBtn: document.getElementById('close_session_btn'),
        sessionInfo: document.getElementById('pos_session_info'),
        productSearch: document.getElementById('product_search'),
        productResults: document.getElementById('product_results'),
        productSuggestions: document.getElementById('product_suggestions'),
        cartTable: document.getElementById('cart_items'),
        clearCartBtn: document.getElementById('clear_cart_btn'),
        checkoutBtn: document.getElementById('checkout_btn'),
        paymentMethod: document.getElementById('payment_method'),
        selectedCustomer: document.getElementById('selected_customer'),
        cartTotalItems: document.getElementById('cart_total_items'),
        cartTotalAmount: document.getElementById('cart_total_amount'),
        customerForm: document.getElementById('customer_form'),
        customerId: document.getElementById('customer_id'),
        customerName: document.getElementById('customer_name'),
        customerEmail: document.getElementById('customer_email'),
        customerPhone: document.getElementById('customer_phone'),
        resetCustomerForm: document.getElementById('reset_customer_form'),
        customersList: document.getElementById('customers_list'),
        customerHistory: document.getElementById('customer_history'),
        invoiceList: document.getElementById('invoice_list'),
        refreshInvoicesBtn: document.getElementById('refresh_invoices_btn'),
        invoiceEditor: document.getElementById('invoice_editor'),
        closeInvoiceEditorBtn: document.getElementById('close_invoice_editor'),
        invoiceEditorMeta: document.getElementById('invoice_editor_meta'),
        invoiceEditorItems: document.getElementById('invoice_editor_items'),
        invoiceEditorSummary: document.getElementById('invoice_editor_summary'),
        invoiceEditorPayment: document.getElementById('invoice_editor_payment'),
        invoiceEditorSearch: document.getElementById('invoice_editor_search'),
        invoiceEditorSuggestions: document.getElementById('invoice_editor_suggestions'),
        invoiceEditorSaveBtn: document.getElementById('invoice_editor_save_btn'),
        invoiceEditorVoidBtn: document.getElementById('invoice_editor_void_btn'),
        invoiceEditorLogsBtn: document.getElementById('invoice_editor_logs_btn'),
        invoiceEditorLogs: document.getElementById('invoice_editor_logs'),
        invoiceLogsContainer: document.getElementById('invoice_logs_container'),
        generateClosingBtn: document.getElementById('generate_closing_btn'),
        closingDate: document.getElementById('closing_date'),
        closingStore: document.getElementById('closing_store'),
        closingSummary: document.getElementById('closing_summary'),
        downloadClosingPdf: document.getElementById('download_closing_pdf'),
        downloadClosingCsv: document.getElementById('download_closing_csv')
    };

    function showToast(message, type = 'info') {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.className = `toast visible ${type}`;
        setTimeout(() => {
            toastEl.classList.remove('visible');
        }, 3000);
    }

    async function fetchJSON(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin',
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Error al procesar la solicitud');
        }
        return data;
    }

    function formatCurrency(value) {
        const number = Number(value || 0);
        return `$${number.toFixed(2)}`;
    }

    function updateProductSuggestions(products) {
        if (!elements.productSuggestions) return;
        elements.productSuggestions.innerHTML = '';
        products.slice(0, 10).forEach((product) => {
            const option = document.createElement('option');
            option.value = product.sku || product.name;
            option.label = `${product.name}${product.sku ? ` (${product.sku})` : ''}`;
            elements.productSuggestions.appendChild(option);
        });
    }

    async function fetchProductByTerm(term) {
        if (!endpoints.products) return null;
        const value = String(term || '').trim();
        if (!value) return null;
        try {
            let url = `${endpoints.products}?code=${encodeURIComponent(value)}`;
            let data = await fetchJSON(url);
            if (data.results && data.results.length) {
                return data.results[0];
            }
            url = `${endpoints.products}?query=${encodeURIComponent(value)}`;
            data = await fetchJSON(url);
            if (data.results && data.results.length) {
                return data.results[0];
            }
            return null;
        } catch (error) {
            showToast(error.message, 'error');
            return null;
        }
    }

    function setSessionStatus(text, status = 'empty') {
        if (elements.sessionStatus) {
            elements.sessionStatus.textContent = text;
        }
        if (elements.sessionStatusTag) {
            elements.sessionStatusTag.textContent = status === 'open' ? 'Caja abierta' : 'Sin sesión';
            elements.sessionStatusTag.className = `status-tag ${status}`;
        }
        if (elements.sessionInfo) {
            elements.sessionInfo.textContent = status === 'open' ? 'Caja operativa' : 'Caja no iniciada';
        }
    }

    function updateSessionUI(session) {
        state.session = session;
        if (!session) {
            setSessionStatus('No hay una caja abierta actualmente.', 'empty');
            if (elements.openSessionBtn) elements.openSessionBtn.disabled = false;
            if (elements.closeSessionBtn) elements.closeSessionBtn.disabled = true;
            if (elements.sessionStore) elements.sessionStore.disabled = false;
            if (elements.openingAmount) elements.openingAmount.value = '';
            return;
        }

        const openedAt = session.opened_at || '';
        const openingAmount = session.opening_amount != null ? Number(session.opening_amount).toFixed(2) : '0.00';
        const description = `Caja abierta en ${session.store || 'Sucursal'} desde ${openedAt}. Monto inicial: $${openingAmount}`;
        setSessionStatus(description, 'open');
        if (elements.openSessionBtn) elements.openSessionBtn.disabled = true;
        if (elements.closeSessionBtn) elements.closeSessionBtn.disabled = false;
        if (elements.sessionStore) {
            elements.sessionStore.value = session.store_id || '';
            elements.sessionStore.disabled = true;
        }
        if (elements.openingAmount) {
            elements.openingAmount.value = openingAmount;
            elements.openingAmount.disabled = true;
        }
    }

    async function loadCurrentSession() {
        if (!endpoints.currentSession) return;
        try {
            const data = await fetchJSON(endpoints.currentSession);
            updateSessionUI(data.session);
            if (data.session) {
                elements.sessionInfo.textContent = `Caja abierta en ${data.session.store || 'Sucursal'}`;
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function openSession() {
        if (!endpoints.openSession) return;
        const storeId = elements.sessionStore.value;
        const openingAmount = elements.openingAmount.value || '0';
        const notes = elements.sessionNotes.value;
        try {
            const payload = {
                store_id: storeId ? Number(storeId) : null,
                opening_amount: openingAmount,
                notes
            };
            const data = await fetchJSON(endpoints.openSession, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast(data.message, 'success');
            updateSessionUI(data.session);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function closeSession() {
        if (!state.session || !endpoints.closeSession) return;
        const closingAmount = window.prompt('Monto de cierre de caja', state.session.opening_amount || '0');
        if (closingAmount === null) return;
        const url = endpoints.closeSession.replace('{session_id}', state.session.id);
        try {
            const data = await fetchJSON(url, {
                method: 'POST',
                body: JSON.stringify({ closing_amount: closingAmount })
            });
            showToast(data.message, 'success');
            updateSessionUI(null);
            elements.sessionStore.value = '';
            if (elements.openingAmount) {
                elements.openingAmount.value = '';
                elements.openingAmount.disabled = false;
            }
            elements.sessionStore.disabled = false;
            elements.sessionInfo.textContent = 'Caja no iniciada';
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function renderProductResults(products) {
        if (!elements.productResults) return;
        state.searchResults = products;
        updateProductSuggestions(products);
        if (!products.length) {
            elements.productResults.innerHTML = '<p class="placeholder">No se encontraron productos.</p>';
            return;
        }
        const fragment = document.createDocumentFragment();
        products.forEach((product) => {
            const item = document.createElement('div');
            item.className = 'result-item';

            const details = document.createElement('div');
            const nameEl = document.createElement('strong');
            nameEl.textContent = product.name;
            details.appendChild(nameEl);

            const skuEl = document.createElement('span');
            skuEl.className = 'sku';
            skuEl.textContent = `SKU: ${product.sku || 'N/A'}`;
            details.appendChild(skuEl);

            if (product.stock != null) {
                const stockEl = document.createElement('span');
                stockEl.className = 'stock';
                stockEl.textContent = `Stock: ${product.stock}`;
                details.appendChild(stockEl);
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn small';
            if (product.id != null) {
                button.dataset.productId = product.id;
            }
            try {
                button.dataset.product = JSON.stringify(product);
            } catch (error) {
                // Ignorar errores de serialización, la búsqueda por ID será suficiente.
            }
            button.textContent = 'Agregar';

            item.appendChild(details);
            item.appendChild(button);
            fragment.appendChild(item);
        });
        elements.productResults.innerHTML = '';
        elements.productResults.appendChild(fragment);
    }

    function findCartItem(productId) {
        return state.cart.find((item) => item.product_id === productId);
    }

    function updateCartUI() {
        if (!elements.cartTable) return;
        if (!state.cart.length) {
            elements.cartTable.innerHTML = '<tr class="empty-row"><td colspan="6">Agrega productos al carrito para iniciar la venta.</td></tr>';
            elements.checkoutBtn.disabled = true;
            elements.cartTotalAmount.textContent = '$0.00';
            elements.cartTotalItems.textContent = '0';
            return;
        }

        const fragment = document.createDocumentFragment();
        let totalAmount = 0;
        let totalItems = 0;

        state.cart.forEach((item) => {
            const row = document.createElement('tr');
            const price = Number(item.price || 0);
            const discount = Math.min(Number(item.discount || 0), price);
            const effectivePrice = Math.max(price - discount, 0);
            const lineTotal = effectivePrice * item.quantity;
            totalAmount += lineTotal;
            totalItems += item.quantity;
            row.innerHTML = `
        <td>${item.name}</td>
        <td><input type="number" min="1" class="qty-input" data-id="${item.product_id}" value="${item.quantity}"></td>
        <td><input type="number" min="0" step="0.01" class="discount-input" data-id="${item.product_id}" value="${discount.toFixed(2)}"></td>
        <td>$${price.toFixed(2)}</td>
        <td>$${lineTotal.toFixed(2)}</td>
        <td><button type="button" class="btn icon" data-remove="${item.product_id}"><i class="fas fa-times"></i></button></td>
      `;
            fragment.appendChild(row);
        });

        elements.cartTable.innerHTML = '';
        elements.cartTable.appendChild(fragment);
        elements.checkoutBtn.disabled = false;
        elements.cartTotalAmount.textContent = `$${totalAmount.toFixed(2)}`;
        elements.cartTotalItems.textContent = totalItems.toString();
    }

    function addProductToCart(product) {
        if (!product || !product.id) return;
        const existing = findCartItem(product.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            state.cart.push({
                product_id: product.id,
                name: product.name,
                price: Number(product.price || 0),
                quantity: 1,
                discount: 0,
                stock: product.stock,
                sku: product.sku || null
            });
        }
        updateCartUI();
    }

    function removeProductFromCart(productId) {
        state.cart = state.cart.filter((item) => item.product_id !== productId);
        updateCartUI();
    }

    function updateQuantity(productId, quantity) {
        const item = findCartItem(productId);
        if (!item) return;
        const qty = Number(quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
            return;
        }
        if (item.stock != null && qty > item.stock) {
            showToast('No hay stock suficiente para este producto.', 'warning');
            return;
        }
        item.quantity = qty;
        updateCartUI();
    }

    function updateDiscount(productId, discountValue) {
        const item = findCartItem(productId);
        if (!item) return;
        const discount = Number(discountValue);
        if (!Number.isFinite(discount) || discount < 0) {
            return;
        }
        const price = Number(item.price || 0);
        item.discount = Math.min(discount, price);
        updateCartUI();
    }

    function clearCart() {
        state.cart = [];
        updateCartUI();
    }

    async function checkout() {
        if (!state.cart.length) return;
        if (!state.session) {
            showToast('Debes abrir una caja antes de facturar.', 'warning');
            return;
        }
        const customerId = elements.selectedCustomer.value;
        const payload = {
            items: state.cart.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.price,
                discount: item.discount || 0
            })),
            customer_id: customerId ? Number(customerId) : null,
            payment_method: elements.paymentMethod.value
        };

        try {
            const data = await fetchJSON(endpoints.checkout, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast(data.message, 'success');
            clearCart();
            loadInvoices();
            if (payload.customer_id) {
                loadCustomerHistory(payload.customer_id);
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function loadCustomers() {
        if (!endpoints.customers) return;
        try {
            const data = await fetchJSON(endpoints.customers);
            state.customers = data;
            renderCustomers();
            populateCustomerSelect();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function populateCustomerSelect() {
        if (!elements.selectedCustomer) return;
        const select = elements.selectedCustomer;
        const currentValue = select.value;
        select.innerHTML = '<option value="">Consumidor final</option>';
        state.customers.forEach((customer) => {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = customer.name;
            select.appendChild(option);
        });
        if (currentValue) {
            select.value = currentValue;
        }
    }

    function renderCustomers() {
        if (!elements.customersList) return;
        if (!state.customers.length) {
            elements.customersList.innerHTML = '<p class="placeholder">No hay clientes registrados.</p>';
            return;
        }
        const fragment = document.createDocumentFragment();
        state.customers.forEach((customer) => {
            const card = document.createElement('div');
            card.className = 'customer-item';
            card.innerHTML = `
        <div class="customer-data">
          <strong>${customer.name}</strong>
          <span>${customer.email || 'Sin correo'}</span>
          <span>${customer.phone || 'Sin teléfono'}</span>
        </div>
        <div class="customer-actions">
          <button type="button" class="btn small ghost" data-history="${customer.id}">Historial</button>
          <button type="button" class="btn small" data-edit="${customer.id}">Editar</button>
        </div>
      `;
            fragment.appendChild(card);
        });
        elements.customersList.innerHTML = '';
        elements.customersList.appendChild(fragment);
    }

    async function loadCustomerHistory(customerId) {
        if (!customerId || !endpoints.customerDetail) return;
        const url = endpoints.customerDetail.replace('{customer_id}', customerId);
        try {
            const data = await fetchJSON(url);
            state.customerHistory[customerId] = data.history;
            renderCustomerHistory(data.customer, data.history);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function renderCustomerHistory(customer, history) {
        if (!elements.customerHistory) return;
        if (!history.length) {
            elements.customerHistory.innerHTML = `
        <h3>Historial de compras</h3>
        <p class="placeholder">${customer.name} aún no registra facturas.</p>
      `;
            return;
        }
        const fragment = document.createDocumentFragment();
        const title = document.createElement('h3');
        title.textContent = `Historial de ${customer.name}`;
        fragment.appendChild(title);
        history.forEach((invoice) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            const lines = invoice.items.map((line) => `${line.quantity} x ${line.product} ($${line.line_total.toFixed(2)})`).join(', ');
            item.innerHTML = `
        <div>
          <strong>${invoice.invoice_number}</strong>
          <span>${invoice.created_at || ''}</span>
        </div>
        <div>
          <span>Total: $${invoice.total_amount.toFixed(2)}</span>
          <span>${invoice.payment_method || ''}</span>
          <small>${lines}</small>
        </div>
      `;
            fragment.appendChild(item);
        });
        elements.customerHistory.innerHTML = '';
        elements.customerHistory.appendChild(fragment);
    }

    async function loadInvoices() {
        if (!endpoints.invoices) return;
        try {
            const data = await fetchJSON(endpoints.invoices);
            renderInvoices(data.invoices || []);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function renderInvoices(invoices) {
        if (!elements.invoiceList) return;
        if (!invoices.length) {
            elements.invoiceList.innerHTML = '<p class="placeholder">Aún no se registran facturas.</p>';
            return;
        }
        const fragment = document.createDocumentFragment();
        invoices.forEach((invoice) => {
            const item = document.createElement('div');
            item.className = 'invoice-item';
            const itemsDetail = invoice.items.map((line) => `${line.quantity}x ${line.product}`).join(', ');
            const statusBadge = invoice.status && invoice.status !== 'paid' ? `<span class="status-tag small">${invoice.status}</span>` : '';
            const actions = [
                `<button type="button" class="btn small ghost" data-download="${invoice.id}">PDF</button>`
            ];
            if (state.userType === 1) {
                actions.push(`<button type="button" class="btn small" data-edit="${invoice.id}">Editar</button>`);
                actions.push(`<button type="button" class="btn small danger" data-void="${invoice.id}">Anular</button>`);
            }
            item.innerHTML = `
        <div class="invoice-info">
          <div>
            <strong>${invoice.invoice_number}</strong>
            ${statusBadge}
          </div>
          <span>${invoice.customer}</span>
          <span>${invoice.created_at || ''}</span>
        </div>
        <div class="invoice-summary">
          <span>Total: $${invoice.total_amount.toFixed(2)}</span>
          <span>${invoice.payment_method || ''}</span>
          <small>${itemsDetail}</small>
        </div>
        <div class="invoice-actions">
          ${actions.join('')}
        </div>
      `;
            fragment.appendChild(item);
        });
        elements.invoiceList.innerHTML = '';
        elements.invoiceList.appendChild(fragment);
    }

    function closeInvoiceEditor() {
        state.invoiceEditor = {
            active: false,
            invoiceId: null,
            items: [],
            paymentMethod: 'Efectivo',
            meta: {
                invoice_number: '',
                customer: '',
                status: ''
            }
        };
        if (elements.invoiceEditor) {
            elements.invoiceEditor.setAttribute('hidden', 'hidden');
        }
        if (elements.invoiceEditorItems) {
            elements.invoiceEditorItems.innerHTML = '';
        }
        if (elements.invoiceEditorSummary) {
            elements.invoiceEditorSummary.innerHTML = '';
        }
        if (elements.invoiceEditorMeta) {
            elements.invoiceEditorMeta.innerHTML = '';
        }
        if (elements.invoiceEditorLogs) {
            elements.invoiceEditorLogs.setAttribute('hidden', 'hidden');
        }
        if (elements.invoiceLogsContainer) {
            elements.invoiceLogsContainer.innerHTML = '';
        }
        if (elements.invoiceEditorPayment) {
            elements.invoiceEditorPayment.value = 'Efectivo';
        }
        if (elements.invoiceEditorSearch) {
            elements.invoiceEditorSearch.value = '';
        }
        if (elements.invoiceEditorSuggestions) {
            elements.invoiceEditorSuggestions.innerHTML = '';
        }
    }

    function updateInvoiceEditorSummary() {
        if (!elements.invoiceEditorSummary) return;
        const totals = state.invoiceEditor.items.reduce((acc, item) => {
            const price = Number(item.unit_price || 0);
            const discount = Math.min(Number(item.discount || 0), price);
            const lineTotal = Math.max(price - discount, 0) * item.quantity;
            acc.total += lineTotal;
            acc.items += item.quantity;
            acc.discounts += discount * item.quantity;
            return acc;
        }, { total: 0, items: 0, discounts: 0 });

        elements.invoiceEditorSummary.innerHTML = `
      <div><strong>Artículos:</strong> ${totals.items}</div>
      <div><strong>Descuentos:</strong> ${formatCurrency(totals.discounts)}</div>
      <div><strong>Total:</strong> ${formatCurrency(totals.total)}</div>
    `;
    }

    function renderInvoiceEditor(invoice) {
        if (!elements.invoiceEditor) return;
        elements.invoiceEditor.removeAttribute('hidden');
        state.invoiceEditor.active = true;
        state.invoiceEditor.meta = {
            invoice_number: invoice.invoice_number,
            customer: invoice.customer,
            status: invoice.status
        };
        elements.invoiceEditorMeta.innerHTML = `
      <div><strong>Factura:</strong> ${invoice.invoice_number}</div>
      <div><strong>Cliente:</strong> ${invoice.customer}</div>
      <div><strong>Estado:</strong> ${invoice.status}</div>
    `;
        state.invoiceEditor.items = invoice.items.map((item) => ({
            invoice_item_id: item.invoice_item_id,
            product_id: item.product_id,
            name: item.product,
            sku: item.product_sku,
            quantity: item.quantity,
            unit_price: Number(item.unit_price || 0),
            discount: Number(item.discount || 0)
        }));
        state.invoiceEditor.invoiceId = invoice.id;
        state.invoiceEditor.paymentMethod = invoice.payment_method || 'Efectivo';

        if (elements.invoiceEditorPayment) {
            elements.invoiceEditorPayment.value = state.invoiceEditor.paymentMethod;
        }

        refreshInvoiceEditorItems();
    }

    function refreshInvoiceEditorItems() {
        if (!elements.invoiceEditorItems) return;
        const fragment = document.createDocumentFragment();
        state.invoiceEditor.items.forEach((item, index) => {
            const row = document.createElement('tr');
            const price = Number(item.unit_price || 0);
            const discount = Math.min(Number(item.discount || 0), price);
            const lineTotal = Math.max(price - discount, 0) * item.quantity;
            row.innerHTML = `
        <td>
          <div class="editor-item-name">${item.name}</div>
          <small>${item.sku ? `SKU: ${item.sku}` : ''}</small>
        </td>
        <td><input type="number" min="1" class="editor-qty" data-index="${index}" value="${item.quantity}"></td>
        <td><input type="number" min="0" step="0.01" class="editor-price" data-index="${index}" value="${price.toFixed(2)}"></td>
        <td><input type="number" min="0" step="0.01" class="editor-discount" data-index="${index}" value="${discount.toFixed(2)}"></td>
        <td>${formatCurrency(lineTotal)}</td>
        <td><button type="button" class="btn icon" data-remove-item="${index}"><i class="fas fa-times"></i></button></td>
      `;
            fragment.appendChild(row);
        });
        elements.invoiceEditorItems.innerHTML = '';
        elements.invoiceEditorItems.appendChild(fragment);
        updateInvoiceEditorSummary();
    }

    async function openInvoiceEditor(invoiceId) {
        if (!endpoints.invoiceDetail) return;
        try {
            const url = endpoints.invoiceDetail.replace('{invoice_id}', invoiceId);
            const data = await fetchJSON(url);
            renderInvoiceEditor(data.invoice);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function removeInvoiceEditorItem(index) {
        state.invoiceEditor.items.splice(index, 1);
        refreshInvoiceEditorItems();
    }

    function updateInvoiceEditorItem(index, field, value) {
        const item = state.invoiceEditor.items[index];
        if (!item) return;
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue) || numberValue < 0) {
            return;
        }
        if (field === 'quantity') {
            item.quantity = Math.max(1, Math.round(numberValue));
        } else if (field === 'unit_price') {
            item.unit_price = numberValue;
        } else if (field === 'discount') {
            item.discount = Math.min(numberValue, item.unit_price);
        }
        refreshInvoiceEditorItems();
    }

    async function saveInvoiceEditorChanges() {
        if (!endpoints.invoiceUpdate || !state.invoiceEditor.invoiceId) return;
        if (!state.invoiceEditor.items.length) {
            showToast('La factura debe tener al menos un producto.', 'warning');
            return;
        }
        const payload = {
            items: state.invoiceEditor.items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                discount: item.discount
            })),
            payment_method: elements.invoiceEditorPayment.value
        };
        try {
            const url = endpoints.invoiceUpdate.replace('{invoice_id}', state.invoiceEditor.invoiceId);
            const data = await fetchJSON(url, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast(data.message, 'success');
            renderInvoiceEditor(data.invoice);
            loadInvoices();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function voidInvoiceDirect(invoiceId, closeEditorAfter = false) {
        if (!endpoints.invoiceVoid || !invoiceId) return;
        if (!window.confirm('¿Seguro que deseas anular esta factura?')) {
            return;
        }
        try {
            const url = endpoints.invoiceVoid.replace('{invoice_id}', invoiceId);
            const data = await fetchJSON(url, { method: 'POST' });
            showToast(data.message, 'success');
            if (closeEditorAfter) {
                closeInvoiceEditor();
            }
            loadInvoices();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function voidInvoiceFromEditor() {
        if (!state.invoiceEditor.invoiceId) return;
        await voidInvoiceDirect(state.invoiceEditor.invoiceId, true);
    }

    async function loadInvoiceLogs(invoiceId) {
        if (!endpoints.invoiceLogs) return;
        try {
            const url = endpoints.invoiceLogs.replace('{invoice_id}', invoiceId);
            const data = await fetchJSON(url);
            if (elements.invoiceLogsContainer) {
                if (!data.logs.length) {
                    elements.invoiceLogsContainer.innerHTML = '<p class="placeholder">No hay registros de auditoría.</p>';
                } else {
                    const fragment = document.createDocumentFragment();
                    data.logs.forEach((log) => {
                        const entry = document.createElement('div');
                        entry.className = 'log-entry';
                        entry.innerHTML = `
              <div><strong>${log.action}</strong> por ${log.user || 'Sistema'}</div>
              <div>${log.description || ''}</div>
              <small>${log.created_at || ''}</small>
            `;
                        fragment.appendChild(entry);
                    });
                    elements.invoiceLogsContainer.innerHTML = '';
                    elements.invoiceLogsContainer.appendChild(fragment);
                }
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function toggleInvoiceLogs() {
        if (!elements.invoiceEditorLogs || !state.invoiceEditor.invoiceId) return;
        const isHidden = elements.invoiceEditorLogs.hasAttribute('hidden');
        if (isHidden) {
            elements.invoiceEditorLogs.removeAttribute('hidden');
            loadInvoiceLogs(state.invoiceEditor.invoiceId);
        } else {
            elements.invoiceEditorLogs.setAttribute('hidden', 'hidden');
        }
    }

    async function addProductToEditor(product) {
        state.invoiceEditor.items.push({
            invoice_item_id: null,
            product_id: product.id,
            name: product.name,
            sku: product.sku || null,
            quantity: 1,
            unit_price: Number(product.price || 0),
            discount: 0
        });
        refreshInvoiceEditorItems();
    }

    async function handleInvoiceEditorSearch(term) {
        const product = await fetchProductByTerm(term);
        if (!product) {
            showToast('No se encontró un producto con ese término.', 'warning');
            return;
        }
        addProductToEditor(product);
        showToast(`Producto agregado: ${product.name}`, 'success');
        if (elements.invoiceEditorSearch) {
            elements.invoiceEditorSearch.value = '';
        }
        if (elements.invoiceEditorSuggestions) {
            elements.invoiceEditorSuggestions.innerHTML = '';
        }
    }

    async function generateClosingReport() {
        if (!endpoints.closingReport) return;
        if (elements.downloadClosingPdf) {
            elements.downloadClosingPdf.disabled = true;
        }
        if (elements.downloadClosingCsv) {
            elements.downloadClosingCsv.disabled = true;
        }
        const params = new URLSearchParams();
        if (elements.closingDate && elements.closingDate.value) {
            params.set('date', elements.closingDate.value);
        }
        if (elements.closingStore && elements.closingStore.value) {
            params.set('store_id', elements.closingStore.value);
        }
        const queryString = params.toString();
        const url = queryString ? `${endpoints.closingReport}?${queryString}` : endpoints.closingReport;
        try {
            const data = await fetchJSON(url);
            state.closingReport = data.report;
            renderClosingReport(data.report);
            if (elements.downloadClosingPdf) {
                elements.downloadClosingPdf.disabled = false;
            }
            if (elements.downloadClosingCsv) {
                elements.downloadClosingCsv.disabled = false;
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function renderClosingReport(report) {
        if (!elements.closingSummary) return;
        if (!report) {
            elements.closingSummary.innerHTML = '<p class="placeholder">Selecciona una fecha y sucursal para ver el resumen del día.</p>';
            return;
        }
        const fragment = document.createDocumentFragment();
        const header = document.createElement('div');
        header.className = 'closing-header';
        header.innerHTML = `
      <div><strong>Fecha:</strong> ${report.date}</div>
      <div><strong>Sucursal:</strong> ${report.store_name || 'Todas'}</div>
    `;
        fragment.appendChild(header);

        const totals = document.createElement('div');
        totals.className = 'closing-totals';
        totals.innerHTML = `
      <div><strong>Total ventas:</strong> ${formatCurrency(report.total_sales)}</div>
      <div><strong>Transacciones:</strong> ${report.transactions}</div>
      <div><strong>Impuestos:</strong> ${formatCurrency(report.taxes_collected)} (${(report.tax_rate * 100).toFixed(2)}%)</div>
      <div><strong>Descuentos aplicados:</strong> ${formatCurrency(report.discounts_applied)}</div>
    `;
        fragment.appendChild(totals);

        const payments = document.createElement('div');
        payments.className = 'closing-payments';
        payments.innerHTML = '<h4>Desglose por método de pago</h4>';
        if (!report.payment_breakdown.length) {
            payments.innerHTML += '<p class="placeholder">No hay ventas registradas.</p>';
        } else {
            const list = document.createElement('ul');
            report.payment_breakdown.forEach((payment) => {
                const item = document.createElement('li');
                item.textContent = `${payment.method}: ${formatCurrency(payment.total)} (${payment.transactions} transacciones)`;
                list.appendChild(item);
            });
            payments.appendChild(list);
        }
        fragment.appendChild(payments);

        const products = document.createElement('div');
        products.className = 'closing-products';
        products.innerHTML = '<h4>Productos vendidos</h4>';
        if (!report.products_sold.length) {
            products.innerHTML += '<p class="placeholder">No hay registros de productos vendidos.</p>';
        } else {
            const table = document.createElement('table');
            table.innerHTML = `
        <thead>
          <tr>
            <th>Producto</th>
            <th>Unidades</th>
            <th>Total</th>
          </tr>
        </thead>
      `;
            const tbody = document.createElement('tbody');
            report.products_sold.forEach((product) => {
                const row = document.createElement('tr');
                row.innerHTML = `
          <td>${product.product_name}</td>
          <td>${product.quantity}</td>
          <td>${formatCurrency(product.total_amount)}</td>
        `;
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            products.appendChild(table);
        }
        fragment.appendChild(products);

        elements.closingSummary.innerHTML = '';
        elements.closingSummary.appendChild(fragment);
    }

    function downloadClosing(format) {
        if (!state.closingReport) {
            showToast('Genera primero un reporte de cierre.', 'warning');
            return;
        }
        const params = new URLSearchParams();
        if (elements.closingDate && elements.closingDate.value) {
            params.set('date', elements.closingDate.value);
        }
        if (elements.closingStore && elements.closingStore.value) {
            params.set('store_id', elements.closingStore.value);
        }
        const queryString = params.toString();
        let url = '';
        if (format === 'pdf' && endpoints.closingReportPdf) {
            url = queryString ? `${endpoints.closingReportPdf}?${queryString}` : endpoints.closingReportPdf;
        } else if (format === 'csv' && endpoints.closingReportCsv) {
            url = queryString ? `${endpoints.closingReportCsv}?${queryString}` : endpoints.closingReportCsv;
        }
        if (url) {
            window.open(url, '_blank');
        }
    }

    function handleInvoiceListActions(event) {
        const downloadBtn = event.target.closest('button[data-download]');
        if (downloadBtn && endpoints.invoicePdf) {
            const invoiceId = downloadBtn.dataset.download;
            const url = endpoints.invoicePdf.replace('{invoice_id}', invoiceId);
            window.open(url, '_blank');
            return;
        }
        const editBtn = event.target.closest('button[data-edit]');
        if (editBtn) {
            const invoiceId = editBtn.dataset.edit;
            openInvoiceEditor(invoiceId);
            return;
        }
        const voidBtn = event.target.closest('button[data-void]');
        if (voidBtn) {
            const invoiceId = voidBtn.dataset.void;
            voidInvoiceDirect(invoiceId, false);
        }
    }


    async function saveCustomer(event) {
        event.preventDefault();
        if (!endpoints.customers) return;
        const id = elements.customerId.value;
        const payload = {
            name: elements.customerName.value,
            email: elements.customerEmail.value,
            phone: elements.customerPhone.value
        };
        const options = {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
        };
        const url = id ? `${endpoints.customers}/${id}` : endpoints.customers;
        try {
            const data = await fetchJSON(url, options);
            showToast(data.message, 'success');
            elements.customerForm.reset();
            elements.customerId.value = '';
            loadCustomers();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function resetCustomerForm() {
        elements.customerForm.reset();
        elements.customerId.value = '';
    }

    function attachEvents() {
        if (elements.openSessionBtn) {
            elements.openSessionBtn.addEventListener('click', openSession);
        }
        if (elements.closeSessionBtn) {
            elements.closeSessionBtn.addEventListener('click', closeSession);
        }
        if (elements.productSearch) {
            elements.productSearch.addEventListener('input', handleProductSearchInput);
            elements.productSearch.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const term = elements.productSearch.value.trim();
                    if (term) {
                        attemptAddProductFromSearch(term);
                        elements.productSearch.value = '';
                    }
                }
            });
        }
        if (elements.productResults) {
            elements.productResults.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-product-id], button[data-product]');
                if (!button) return;
                let product = null;

                const idValue = button.dataset.productId;
                if (idValue) {
                    const productId = Number(idValue);
                    if (Number.isFinite(productId)) {
                        product = state.searchResults.find((entry) => Number(entry.id) === productId) || null;
                    }
                }

                if (!product && button.dataset.product) {
                    try {
                        product = JSON.parse(button.dataset.product);
                    } catch (error) {
                        product = null;
                    }
                }

                if (!product) {
                    showToast('No se pudo cargar la información del producto seleccionado.', 'error');
                    return;
                }

                addProductToCart(product);
            });
        }
        if (elements.cartTable) {
            elements.cartTable.addEventListener('change', (event) => {
                const input = event.target.closest('input.qty-input');
                if (!input) return;
                const productId = Number(input.dataset.id);
                updateQuantity(productId, input.value);
            });
            elements.cartTable.addEventListener('input', (event) => {
                const discountInput = event.target.closest('input.discount-input');
                if (!discountInput) return;
                const productId = Number(discountInput.dataset.id);
                updateDiscount(productId, discountInput.value);
            });
            elements.cartTable.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-remove]');
                if (!button) return;
                const productId = Number(button.dataset.remove);
                removeProductFromCart(productId);
            });
        }
        if (elements.clearCartBtn) {
            elements.clearCartBtn.addEventListener('click', clearCart);
        }
        if (elements.checkoutBtn) {
            elements.checkoutBtn.addEventListener('click', checkout);
        }
        if (elements.customerForm) {
            elements.customerForm.addEventListener('submit', saveCustomer);
        }
        if (elements.resetCustomerForm) {
            elements.resetCustomerForm.addEventListener('click', resetCustomerForm);
        }
        if (elements.customersList) {
            elements.customersList.addEventListener('click', (event) => {
                const historyBtn = event.target.closest('button[data-history]');
                if (historyBtn) {
                    const customerId = historyBtn.dataset.history;
                    loadCustomerHistory(customerId);
                }
                const editBtn = event.target.closest('button[data-edit]');
                if (editBtn) {
                    const customerId = Number(editBtn.dataset.edit);
                    const customer = state.customers.find((c) => c.id === customerId);
                    if (customer) {
                        elements.customerId.value = customer.id;
                        elements.customerName.value = customer.name || '';
                        elements.customerEmail.value = customer.email || '';
                        elements.customerPhone.value = customer.phone || '';
                    }
                }
            });
        }
        if (elements.refreshInvoicesBtn) {
            elements.refreshInvoicesBtn.addEventListener('click', loadInvoices);
        }
        if (elements.invoiceList) {
            elements.invoiceList.addEventListener('click', handleInvoiceListActions);
        }
        if (elements.closeInvoiceEditorBtn) {
            elements.closeInvoiceEditorBtn.addEventListener('click', closeInvoiceEditor);
        }
        if (elements.invoiceEditorItems) {
            elements.invoiceEditorItems.addEventListener('input', (event) => {
                const qtyInput = event.target.closest('.editor-qty');
                if (qtyInput) {
                    updateInvoiceEditorItem(Number(qtyInput.dataset.index), 'quantity', qtyInput.value);
                    return;
                }
                const priceInput = event.target.closest('.editor-price');
                if (priceInput) {
                    updateInvoiceEditorItem(Number(priceInput.dataset.index), 'unit_price', priceInput.value);
                    return;
                }
                const discountInput = event.target.closest('.editor-discount');
                if (discountInput) {
                    updateInvoiceEditorItem(Number(discountInput.dataset.index), 'discount', discountInput.value);
                }
            });
            elements.invoiceEditorItems.addEventListener('click', (event) => {
                const removeBtn = event.target.closest('button[data-remove-item]');
                if (removeBtn) {
                    removeInvoiceEditorItem(Number(removeBtn.dataset.removeItem));
                }
            });
        }
        if (elements.invoiceEditorPayment) {
            elements.invoiceEditorPayment.addEventListener('change', () => {
                state.invoiceEditor.paymentMethod = elements.invoiceEditorPayment.value;
            });
        }
        if (elements.invoiceEditorSaveBtn) {
            elements.invoiceEditorSaveBtn.addEventListener('click', saveInvoiceEditorChanges);
        }
        if (elements.invoiceEditorVoidBtn) {
            elements.invoiceEditorVoidBtn.addEventListener('click', voidInvoiceFromEditor);
        }
        if (elements.invoiceEditorLogsBtn) {
            elements.invoiceEditorLogsBtn.addEventListener('click', toggleInvoiceLogs);
        }
        if (elements.invoiceEditorSearch) {
            elements.invoiceEditorSearch.addEventListener('input', handleInvoiceEditorSearchInput);
            elements.invoiceEditorSearch.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const term = elements.invoiceEditorSearch.value.trim();
                    if (term) {
                        handleInvoiceEditorSearch(term);
                    }
                }
            });
        }
        if (elements.generateClosingBtn) {
            elements.generateClosingBtn.addEventListener('click', generateClosingReport);
        }
        if (elements.downloadClosingPdf) {
            elements.downloadClosingPdf.addEventListener('click', () => downloadClosing('pdf'));
        }
        if (elements.downloadClosingCsv) {
            elements.downloadClosingCsv.addEventListener('click', () => downloadClosing('csv'));
        }
    }

    async function searchProducts(query) {
        if (!endpoints.products) return;
        const value = String(query || '').trim();
        if (!value) {
            state.searchResults = [];
            updateProductSuggestions([]);
            if (elements.productResults) {
                elements.productResults.innerHTML = '<p class="placeholder">Escribe para buscar productos o presiona Enter para agregarlos rápidamente.</p>';
            }
            return;
        }
        try {
            const url = `${endpoints.products}?query=${encodeURIComponent(value)}`;
            const data = await fetchJSON(url);
            renderProductResults(data.results || []);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    let searchDebounceTimer;

    function handleProductSearchInput(event) {
        const query = event.target.value;
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            searchProducts(query);
        }, 200);
    }

    async function attemptAddProductFromSearch(term) {
        const product = await fetchProductByTerm(term);
        if (!product) {
            showToast('No se encontró un producto con ese término.', 'warning');
            return;
        }
        addProductToCart(product);
        showToast(`Producto agregado: ${product.name}`, 'success');
        renderProductResults([]);
    }

    let editorSearchDebounce;

    function handleInvoiceEditorSearchInput(event) {
        const query = event.target.value;
        clearTimeout(editorSearchDebounce);
        editorSearchDebounce = setTimeout(() => {
            loadInvoiceEditorSuggestions(query);
        }, 200);
    }

    async function loadInvoiceEditorSuggestions(query) {
        if (!endpoints.products || !elements.invoiceEditorSuggestions) return;
        const value = String(query || '').trim();
        if (!value) {
            elements.invoiceEditorSuggestions.innerHTML = '';
            return;
        }
        try {
            const url = `${endpoints.products}?query=${encodeURIComponent(value)}`;
            const data = await fetchJSON(url);
            elements.invoiceEditorSuggestions.innerHTML = '';
            (data.results || []).slice(0, 10).forEach((product) => {
                const option = document.createElement('option');
                option.value = product.sku || product.name;
                option.label = `${product.name}${product.sku ? ` (${product.sku})` : ''}`;
                elements.invoiceEditorSuggestions.appendChild(option);
            });
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function init() {
        attachEvents();
        loadCurrentSession();
        loadCustomers();
        loadInvoices();
    }

    document.addEventListener('DOMContentLoaded', init);
})();