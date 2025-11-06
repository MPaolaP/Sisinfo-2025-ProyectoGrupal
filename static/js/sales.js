(function () {
    const endpoints = window.POS_ENDPOINTS || {};
    const toastEl = document.getElementById('pos_toast');
    const state = {
        cart: [],
        customers: [],
        session: null,
        customerHistory: {}
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
        scannerInput: document.getElementById('scanner_input'),
        productResults: document.getElementById('product_results'),
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
        refreshInvoicesBtn: document.getElementById('refresh_invoices_btn')
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
        if (!products.length) {
            elements.productResults.innerHTML = '<p class="placeholder">No se encontraron productos.</p>';
            return;
        }
        const fragment = document.createDocumentFragment();
        products.forEach((product) => {
            const item = document.createElement('div');
            item.className = 'result-item';
            const price = Number(product.price || 0).toFixed(2);
            const stock = product.stock != null ? `<span class="stock">Stock: ${product.stock}</span>` : '';
            item.innerHTML = `
        <div>
          <strong>${product.name}</strong>
          <span class="sku">SKU: ${product.sku || 'N/A'}</span>
          ${stock}
        </div>
        <button type="button" class="btn small" data-product='${JSON.stringify(product)}'>Agregar</button>
      `;
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
            elements.cartTable.innerHTML = '<tr class="empty-row"><td colspan="5">Agrega productos al carrito para iniciar la venta.</td></tr>';
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
            const lineTotal = Number(item.price) * item.quantity;
            totalAmount += lineTotal;
            totalItems += item.quantity;
            row.innerHTML = `
        <td>${item.name}</td>
        <td><input type="number" min="1" class="qty-input" data-id="${item.product_id}" value="${item.quantity}"></td>
        <td>$${Number(item.price).toFixed(2)}</td>
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
                stock: product.stock
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
                unit_price: item.price
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
            item.innerHTML = `
        <div>
          <strong>${invoice.invoice_number}</strong>
          <span>${invoice.customer}</span>
          <span>${invoice.created_at || ''}</span>
        </div>
        <div>
          <span>Total: $${invoice.total_amount.toFixed(2)}</span>
          <span>${invoice.payment_method || ''}</span>
          <small>${itemsDetail}</small>
        </div>
      `;
            fragment.appendChild(item);
        });
        elements.invoiceList.innerHTML = '';
        elements.invoiceList.appendChild(fragment);
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
            let debounceTimer;
            elements.productSearch.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                const query = elements.productSearch.value.trim();
                debounceTimer = setTimeout(() => {
                    if (!query) {
                        elements.productResults.innerHTML = '<p class="placeholder">Busca o escanea para ver resultados.</p>';
                        return;
                    }
                    searchProducts(query);
                }, 250);
            });
        }
        if (elements.scannerInput) {
            elements.scannerInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const value = elements.scannerInput.value.trim();
                    if (value) {
                        searchProducts(value);
                        elements.scannerInput.value = '';
                    }
                }
            });
        }
        if (elements.productResults) {
            elements.productResults.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-product]');
                if (!button) return;
                const product = JSON.parse(button.dataset.product);
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
    }

    async function searchProducts(query) {
        if (!endpoints.products) return;
        try {
            const url = `${endpoints.products}?query=${encodeURIComponent(query)}`;
            const data = await fetchJSON(url);
            renderProductResults(data.results || []);
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