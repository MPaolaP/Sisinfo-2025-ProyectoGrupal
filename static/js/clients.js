(function () {
  const moduleContainer = document.getElementById('clients_module');
  if (!moduleContainer) {
    return;
  }

  const endpoints = window.CLIENTS_ENDPOINTS || {};
  const resultsContainer = document.getElementById('clients_results');
  const detailContainer = document.getElementById('client_detail');
  const searchForm = document.getElementById('client_search_form');
  const searchInput = document.getElementById('client_search');
  let activeCard = null;
  let debounceTimer = null;

  const currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  });

  const numberFormatter = new Intl.NumberFormat('es-CO');

  const formatCurrency = (value) => currencyFormatter.format(value || 0);
  const formatNumber = (value) => numberFormatter.format(value || 0);

  function setPlaceholder(container, message) {
    if (container) {
      container.innerHTML = `<p class="placeholder">${message}</p>`;
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Ocurrió un error al obtener los datos.');
    }

    return response.json();
  }

  function buildClientCard(client) {
    const card = document.createElement('article');
    card.className = 'client-card';
    card.dataset.clientId = client.id;
    card.innerHTML = `
      <strong>${client.name}</strong>
      <span>${client.email || 'Sin correo registrado'}</span>
      <div class="client-meta">
        ${client.phone ? `<span><i class="fas fa-phone"></i> ${client.phone}</span>` : ''}
        <span><i class="fas fa-calendar-alt"></i> Desde ${client.created_at || '--'}</span>
      </div>
    `;
    return card;
  }

  function renderClientList(clients) {
    if (!resultsContainer) {
      return;
    }

    if (!clients.length) {
      setPlaceholder(resultsContainer, 'No se encontraron clientes con los filtros ingresados.');
      return;
    }

    resultsContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    clients.forEach((client) => {
      const card = buildClientCard(client);
      card.addEventListener('click', () => {
        if (activeCard) {
          activeCard.classList.remove('active');
        }
        card.classList.add('active');
        activeCard = card;
        loadClientDetail(client.id);
      });
      fragment.appendChild(card);
    });

    resultsContainer.appendChild(fragment);

    const firstCard = resultsContainer.querySelector('.client-card');
    if (firstCard) {
      firstCard.click();
    }
  }

  function renderClientDetail(data) {
    if (!detailContainer) {
      return;
    }

    const { customer, history } = data;

    if (!customer) {
      setPlaceholder(detailContainer, 'No fue posible obtener la información del cliente.');
      return;
    }

    const stats = document.createElement('div');
    stats.className = 'client-stat-grid';
    stats.innerHTML = `
      <div class="client-stat">
        <span>Compras registradas</span>
        <strong>${formatNumber(customer.invoice_count || 0)}</strong>
      </div>
      <div class="client-stat">
        <span>Facturación acumulada</span>
        <strong>${formatCurrency(customer.total_spent || 0)}</strong>
      </div>
      <div class="client-stat">
        <span>Última compra</span>
        <strong>${customer.last_purchase || 'Sin registro'}</strong>
      </div>
    `;

    const header = document.createElement('div');
    header.className = 'client-detail-header';
    header.innerHTML = `
      <div>
        <h3>${customer.name}</h3>
        <div class="client-meta">
          ${customer.email ? `<span><i class="fas fa-envelope"></i> ${customer.email}</span>` : ''}
          ${customer.phone ? `<span><i class="fas fa-phone"></i> ${customer.phone}</span>` : ''}
          ${customer.created_at ? `<span><i class="fas fa-id-card"></i> Cliente desde ${customer.created_at}</span>` : ''}
        </div>
      </div>
    `;

    const historyContainer = document.createElement('div');
    historyContainer.className = 'client-history';

    if (!history || !history.length) {
      historyContainer.innerHTML = '<p class="placeholder">El cliente aún no registra facturas.</p>';
    } else {
      history.forEach((invoice) => {
        const item = document.createElement('div');
        item.className = 'client-history-item';
        item.innerHTML = `
          <div>
            <span>Factura ${invoice.invoice_number || invoice.id}</span>
            <small>${invoice.created_at || ''}</small>
            <small>${invoice.payment_method ? `Método: ${invoice.payment_method}` : ''}</small>
          </div>
          <div class="amount">${formatCurrency(invoice.total_amount || 0)}</div>
        `;
        historyContainer.appendChild(item);
      });
    }

    detailContainer.innerHTML = '';
    detailContainer.appendChild(header);
    detailContainer.appendChild(stats);
    const historyTitle = document.createElement('h4');
    historyTitle.textContent = 'Historial de facturación';
    detailContainer.appendChild(historyTitle);
    detailContainer.appendChild(historyContainer);
  }

  async function loadClients(query = '') {
    if (!endpoints.list) {
      return;
    }

    try {
      const url = new URL(endpoints.list, window.location.origin);
      if (query) {
        url.searchParams.set('query', query);
      }
      setPlaceholder(resultsContainer, 'Buscando clientes...');
      const clients = await fetchJson(url.toString());
      renderClientList(clients);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      setPlaceholder(resultsContainer, 'No fue posible cargar los clientes.');
    }
  }

  async function loadClientDetail(clientId) {
    if (!endpoints.history) {
      return;
    }

    try {
      setPlaceholder(detailContainer, 'Consultando historial del cliente...');
      const url = endpoints.history.replace('{customer_id}', clientId);
      const detail = await fetchJson(url);
      renderClientDetail(detail);
    } catch (error) {
      console.error('Error al cargar el detalle del cliente:', error);
      setPlaceholder(detailContainer, 'No fue posible obtener el detalle del cliente.');
    }
  }

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = searchInput.value.trim();
      loadClients(query);
    });

    searchInput.addEventListener('input', () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        const query = searchInput.value.trim();
        loadClients(query);
      }, 350);
    });
  }

  loadClients();
})();
