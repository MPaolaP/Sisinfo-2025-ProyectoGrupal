(function () {
  const currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  });

  const numberFormatter = new Intl.NumberFormat('es-CO');

  const formatCurrency = (value) => currencyFormatter.format(value || 0);
  const formatNumber = (value) => numberFormatter.format(value || 0);

  const inventoryTableBody = document.querySelector('#inventory_overview_table tbody');
  const topProductsList = document.getElementById('top_products_list');
  const financialIndicators = document.getElementById('financial_indicators');
  const powerBIContainer = document.getElementById('power_bi_embed');
  const lastUpdate = document.getElementById('reports_last_update');
  const totalUnitsEl = document.getElementById('inventory_total_units');
  const totalAlertsEl = document.getElementById('inventory_total_alerts');
  const kpiContainer = document.getElementById('sales_kpis');

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'No se pudo obtener la información.');
    }

    return response.json();
  }

  function renderInventoryOverview(data) {
    if (!inventoryTableBody) {
      return;
    }

    if (!data.stores || !data.stores.length) {
      inventoryTableBody.innerHTML = '<tr><td colspan="3" class="table-empty">No se encontraron registros de inventario.</td></tr>';
    } else {
      const rows = data.stores.map((store) => `
        <tr>
          <td>${store.store_name}</td>
          <td>${formatNumber(store.units)}</td>
          <td>${formatNumber(store.alerts)}</td>
        </tr>
      `).join('');
      inventoryTableBody.innerHTML = rows;
    }

    if (totalUnitsEl) {
      totalUnitsEl.textContent = formatNumber(data.total_units || 0);
    }

    if (totalAlertsEl) {
      totalAlertsEl.textContent = formatNumber(data.total_alerts || 0);
    }

    if (lastUpdate && data.last_updated) {
      lastUpdate.textContent = data.last_updated;
    }
  }

  function renderTopProducts(data) {
    if (!topProductsList) {
      return;
    }

    const products = data.products || [];

    if (!products.length) {
      topProductsList.innerHTML = '<li class="placeholder">Aún no hay ventas registradas.</li>';
      return;
    }

    topProductsList.innerHTML = products.map((product) => `
      <li class="top-product-item">
        <div>
          <strong>${product.product_name}</strong>
          <span>${formatNumber(product.units_sold)} unidades vendidas</span>
        </div>
        <div>
          <span>${formatCurrency(product.total_amount)}</span>
        </div>
      </li>
    `).join('');
  }

  function renderSalesKpis(data) {
    if (!kpiContainer) {
      return;
    }

    const mapping = {
      daily: 'Facturación diaria',
      weekly: 'Facturación semanal',
      monthly: 'Facturación mensual',
      avg_ticket: 'Ticket promedio'
    };

    kpiContainer.querySelectorAll('[data-kpi]').forEach((element) => {
      const key = element.getAttribute('data-kpi');
      const value = data[key] || 0;
      element.textContent = formatCurrency(value);
      const label = element.previousElementSibling;
      if (label && mapping[key]) {
        label.textContent = mapping[key];
      }
    });
  }

  function renderFinancialIndicators(data) {
    if (!financialIndicators) {
      return;
    }

    const indicators = data.indicators || [];

    if (!indicators.length) {
      financialIndicators.innerHTML = '<div class="placeholder">No hay indicadores disponibles.</div>';
      return;
    }

    const content = indicators.map((indicator) => {
      const value = indicator.type === 'currency' ? formatCurrency(indicator.value) : formatNumber(indicator.value);
      return `
        <div class="indicator-card">
          <span>${indicator.label}</span>
          <strong>${value}</strong>
        </div>
      `;
    }).join('');

    financialIndicators.innerHTML = content;
  }

  function renderPowerBIIntegration(data) {
    if (!powerBIContainer) {
      return;
    }

    const { status, embed_url: embedUrl, description } = data;
    const statusLabel = status === 'connected' ? 'Integración activa' : 'Conexión pendiente';

    const parts = [
      `<p>${description || ''}</p>`,
      `<span class="client-meta">Estado: ${statusLabel}</span>`
    ];

    if (embedUrl) {
      parts.push(`
        <a class="powerbi-link" href="${embedUrl}" target="_blank" rel="noopener">
          <i class="fas fa-external-link-alt"></i>
          Abrir tablero en Power BI
        </a>
      `);
    }

    powerBIContainer.innerHTML = parts.join('');
  }

  async function initializeReports() {
    try {
      const [inventoryData, topProductsData, salesKpisData, financialData, powerBiData] = await Promise.all([
        fetchJson('/api/reports/inventory-overview'),
        fetchJson('/api/reports/top-products'),
        fetchJson('/api/reports/sales-kpis'),
        fetchJson('/api/reports/financial-indicators'),
        fetchJson('/api/reports/power-bi')
      ]);

      renderInventoryOverview(inventoryData);
      renderTopProducts(topProductsData);
      renderSalesKpis(salesKpisData);
      renderFinancialIndicators(financialData);
      renderPowerBIIntegration(powerBiData);
    } catch (error) {
      console.error('Error al cargar los reportes:', error);
      if (inventoryTableBody) {
        inventoryTableBody.innerHTML = '<tr><td colspan="3" class="table-empty">No fue posible cargar la información.</td></tr>';
      }
      if (topProductsList) {
        topProductsList.innerHTML = '<li class="placeholder">No fue posible cargar la información.</li>';
      }
      if (financialIndicators) {
        financialIndicators.innerHTML = '<div class="placeholder">No fue posible cargar la información.</div>';
      }
      if (powerBIContainer) {
        powerBIContainer.innerHTML = '<div class="placeholder">No fue posible cargar la información.</div>';
      }
    }
  }

  if (document.getElementById('reports_module')) {
    initializeReports();
  }
})();
