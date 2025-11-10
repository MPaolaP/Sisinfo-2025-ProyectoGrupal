(function () {
  const contextElement = document.getElementById('reports_context_payload');
  const contextData = contextElement ? JSON.parse(contextElement.textContent) : { stores: [], categories: [] };

  const currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  });

  const numberFormatter = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0
  });

  const percentageFormatter = new Intl.NumberFormat('es-CO', {
    style: 'percent',
    maximumFractionDigits: 1
  });

  const formatCurrency = (value) => currencyFormatter.format(value || 0);
  const formatNumber = (value) => numberFormatter.format(value || 0);
  const formatPercentage = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

  class ReportsDashboard {
    constructor(context) {
      this.context = context || { stores: [], categories: [] };
      this.dom = {};
      this.charts = {};
      this.sparklineCharts = {};
      this.state = {
        filters: {
          period: 'today',
          startDate: '',
          endDate: '',
          storeId: '',
          categoryId: ''
        },
        metric: 'units',
        inventoryView: 'both',
        autoRefresh: true,
        refreshTimer: null,
        refreshCountdown: null,
        previousKpis: {},
        inventoryData: [],
        productData: []
      };
      this.chartIds = {
        inventory: 'reports_inventory_chart',
        inventoryDetail: 'reports_inventory_detail',
        topProducts: 'reports_top_products_chart',
        topProductsDistribution: 'reports_top_products_distribution',
        productHistory: 'reports_product_history_chart',
        salesHeatmap: 'reports_sales_heatmap',
        categoryTreemap: 'reports_category_treemap',
        categoryRotation: 'reports_category_rotation',
        categorySeasonality: 'reports_category_seasonality'
      };
    }

    init() {
      this.cacheDom();
      if (!this.dom.module) {
        return;
      }
      this.bindEvents();
      this.initializeCharts();
      this.toggleCustomDates();
      this.loadData();
      this.startAutoRefresh();
    }

    cacheDom() {
      this.dom.module = document.getElementById('reports_module');
      this.dom.lastUpdate = document.getElementById('reports_last_update');
      this.dom.refreshNow = document.getElementById('reports_refresh_now');
      this.dom.autoRefresh = document.getElementById('reports_auto_refresh');
      this.dom.refreshStatus = document.getElementById('reports_refresh_status');
      this.dom.filterPeriod = document.getElementById('reports_filter_period');
      this.dom.filterStart = document.getElementById('reports_start_date');
      this.dom.filterEnd = document.getElementById('reports_end_date');
      this.dom.filterStore = document.getElementById('reports_filter_store');
      this.dom.filterCategory = document.getElementById('reports_filter_category');
      this.dom.filterApply = document.getElementById('reports_apply_filters');
      this.dom.filterReset = document.getElementById('reports_reset_filters');
      this.dom.customDates = document.getElementById('reports_custom_dates');
      this.dom.kpiGrid = document.getElementById('reports_kpi_grid');
      this.dom.inventoryTable = document.querySelector('#inventory_table_wrapper tbody');
      this.dom.inventoryDetail = {
        panel: document.getElementById('inventory_detail_panel'),
        title: document.getElementById('inventory_detail_title'),
        tableBody: document.querySelector('#inventory_detail_panel tbody'),
        close: document.getElementById('inventory_detail_close')
      };
      this.dom.inventoryTotals = {
        units: document.getElementById('inventory_total_units'),
        alerts: document.getElementById('inventory_total_alerts'),
        alertRate: document.querySelector('#inventory_alert_rate strong')
      };
      this.dom.productsTable = document.querySelector('#products_table_wrapper tbody');
      this.dom.productHistoryPanel = document.getElementById('product_history_panel');
      this.dom.productHistoryTitle = document.getElementById('product_history_title');
      this.dom.financialTable = document.querySelector('#financial_table_wrapper tbody');
      this.dom.customerBreakdown = document.getElementById('customer_breakdown_panel');
      this.dom.heatmapTable = document.querySelector('#heatmap_table_wrapper tbody');
      this.dom.heatmapPeaks = document.getElementById('heatmap_peaks');
      this.dom.categoryTable = document.querySelector('#category_table_wrapper tbody');
      this.dom.toastContainer = document.getElementById('reports_toasts');
    }

    bindEvents() {
      if (this.dom.refreshNow) {
        this.dom.refreshNow.addEventListener('click', () => this.loadData());
      }
      if (this.dom.autoRefresh) {
        this.dom.autoRefresh.addEventListener('change', (event) => {
          this.state.autoRefresh = event.target.checked;
          if (this.state.autoRefresh) {
            this.showToast('Actualización automática activada.', 'info');
            this.startAutoRefresh();
          } else {
            this.showToast('Actualización automática desactivada.', 'warning');
            this.stopAutoRefresh();
          }
        });
      }
      if (this.dom.filterPeriod) {
        this.dom.filterPeriod.addEventListener('change', () => {
          this.toggleCustomDates();
        });
      }
      if (this.dom.filterApply) {
        this.dom.filterApply.addEventListener('click', () => {
          this.updateFilters();
          this.loadData();
        });
      }
      if (this.dom.filterReset) {
        this.dom.filterReset.addEventListener('click', () => {
          this.resetFilters();
          this.loadData();
        });
      }
      if (this.dom.inventoryDetail.close) {
        this.dom.inventoryDetail.close.addEventListener('click', () => {
          this.dom.inventoryDetail.panel.setAttribute('hidden', '');
        });
      }

      this.dom.module.querySelectorAll('[data-action="toggle-table"]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-target');
          this.toggleTable(target, button);
        });
      });

      this.dom.module.querySelectorAll('[data-action="export"]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-target');
          this.exportChart(target);
        });
      });

      this.dom.module.querySelectorAll('#inventory_insights_panel .toggle-group .toggle').forEach((button) => {
        button.addEventListener('click', () => {
          this.dom.module.querySelectorAll('#inventory_insights_panel .toggle-group .toggle').forEach((item) => item.classList.remove('active'));
          button.classList.add('active');
          this.state.inventoryView = button.getAttribute('data-view');
          this.updateInventoryChart();
        });
      });

      this.dom.module.querySelectorAll('#top_products_panel .toggle-group .toggle').forEach((button) => {
        button.addEventListener('click', () => {
          this.dom.module.querySelectorAll('#top_products_panel .toggle-group .toggle').forEach((item) => item.classList.remove('active'));
          button.classList.add('active');
          this.state.metric = button.getAttribute('data-metric');
          this.loadTopProducts();
        });
      });

      if (this.dom.inventoryTable) {
        this.dom.inventoryTable.addEventListener('click', (event) => {
          const row = event.target.closest('tr[data-store]');
          if (!row) {
            return;
          }
          const storeId = Number.parseInt(row.getAttribute('data-store'), 10);
          const store = this.state.inventoryData.find((item) => item.store_id === storeId);
          if (store) {
            this.renderInventoryDetail(store);
          }
        });
      }

      if (this.dom.productsTable) {
        this.dom.productsTable.addEventListener('click', (event) => {
          const row = event.target.closest('tr[data-product]');
          if (!row) {
            return;
          }
          const productId = Number.parseInt(row.getAttribute('data-product'), 10);
          const product = this.state.productData.find((item) => item.product_id === productId);
          if (product) {
            this.renderProductHistory(product);
          }
        });
      }
    }

    toggleCustomDates() {
      if (!this.dom.filterPeriod || !this.dom.customDates) {
        return;
      }
      if (this.dom.filterPeriod.value === 'custom') {
        this.dom.customDates.removeAttribute('hidden');
      } else {
        this.dom.customDates.setAttribute('hidden', '');
      }
    }

    updateFilters() {
      this.state.filters.period = this.dom.filterPeriod ? this.dom.filterPeriod.value : 'today';
      this.state.filters.startDate = this.dom.filterStart ? this.dom.filterStart.value : '';
      this.state.filters.endDate = this.dom.filterEnd ? this.dom.filterEnd.value : '';
      this.state.filters.storeId = this.dom.filterStore ? this.dom.filterStore.value : '';
      this.state.filters.categoryId = this.dom.filterCategory ? this.dom.filterCategory.value : '';
    }

    resetFilters() {
      if (this.dom.filterPeriod) {
        this.dom.filterPeriod.value = 'today';
      }
      if (this.dom.filterStart) {
        this.dom.filterStart.value = '';
      }
      if (this.dom.filterEnd) {
        this.dom.filterEnd.value = '';
      }
      if (this.dom.filterStore) {
        this.dom.filterStore.value = '';
      }
      if (this.dom.filterCategory) {
        this.dom.filterCategory.value = '';
      }
      this.toggleCustomDates();
      this.updateFilters();
    }

    initializeCharts() {
      const chartElements = {
        [this.chartIds.inventory]: '#inventory_chart',
        [this.chartIds.topProducts]: '#top_products_chart',
        [this.chartIds.topProductsDistribution]: '#top_products_distribution',
        [this.chartIds.productHistory]: '#product_history_chart',
        [this.chartIds.salesHeatmap]: '#sales_heatmap_chart',
        [this.chartIds.categoryTreemap]: '#category_treemap',
        [this.chartIds.categoryRotation]: '#category_rotation_chart',
        [this.chartIds.categorySeasonality]: '#category_seasonality_chart'
      };

      Object.entries(chartElements).forEach(([chartId, selector]) => {
        const element = document.querySelector(selector);
        if (element) {
          this.charts[chartId] = new ApexCharts(element, {
            chart: {
              id: chartId,
              type: 'line',
              height: 320,
              animations: {
                easing: 'easeinout',
                speed: 600
              },
              toolbar: {
                show: false
              },
              foreColor: '#e2e8f0'
            },
            grid: {
              borderColor: 'rgba(148, 163, 184, 0.2)'
            },
            theme: {
              mode: 'dark'
            },
            series: []
          });
          this.charts[chartId].render();
        }
      });
    }

    async loadData(isAutoRefresh = false) {
      try {
        this.updateFilters();
        this.setLoadingState(true);
        const params = this.buildQueryParams();
        const requests = [
          this.fetchEndpoint('/api/reports/dashboard-overview', params),
          this.fetchEndpoint('/api/reports/inventory-insights', params),
          this.fetchEndpoint('/api/reports/top-products-insights', {
            ...params,
            metric: this.state.metric
          }),
          this.fetchEndpoint('/api/reports/financial-advanced', params),
          this.fetchEndpoint('/api/reports/sales-heatmap', params),
          this.fetchEndpoint('/api/reports/category-analysis', params)
        ];

        const [kpiData, inventoryData, topProductsData, financialData, heatmapData, categoryData] = await Promise.all(requests);
        this.updateKPIs(kpiData, isAutoRefresh);
        this.updateInventory(inventoryData);
        this.updateTopProducts(topProductsData);
        this.updateFinancial(financialData);
        this.updateHeatmap(heatmapData);
        this.updateCategory(categoryData);
        if (this.dom.lastUpdate && kpiData.last_updated) {
          this.dom.lastUpdate.textContent = kpiData.last_updated;
        }
        this.updateRefreshStatus('Actualizado');
      } catch (error) {
        console.error('Error cargando reportes', error);
        this.showToast('No fue posible actualizar los reportes. Intenta nuevamente.', 'error');
        this.updateRefreshStatus('Error al actualizar');
      } finally {
        this.setLoadingState(false);
      }
    }

    async loadTopProducts() {
      try {
        const params = this.buildQueryParams();
        const topProductsData = await this.fetchEndpoint('/api/reports/top-products-insights', {
          ...params,
          metric: this.state.metric
        });
        this.updateTopProducts(topProductsData);
      } catch (error) {
        console.error('Error al cargar top productos', error);
        this.showToast('No fue posible actualizar el ranking de productos.', 'error');
      }
    }

    buildQueryParams() {
      const params = {
        period: this.state.filters.period || 'today'
      };
      if (this.state.filters.startDate) {
        params.start_date = this.state.filters.startDate;
      }
      if (this.state.filters.endDate) {
        params.end_date = this.state.filters.endDate;
      }
      if (this.state.filters.storeId) {
        params.store_id = this.state.filters.storeId;
      }
      if (this.state.filters.categoryId) {
        params.category_id = this.state.filters.categoryId;
      }
      return params;
    }

    async fetchEndpoint(endpoint, params = {}) {
      const url = new URL(endpoint, window.location.origin);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, value);
        }
      });
      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`Error solicitando ${endpoint}`);
      }
      return response.json();
    }

    updateKPIs(data, isAutoRefresh = false) {
      if (!data || !Array.isArray(data.kpis)) {
        return;
      }
      data.kpis.forEach((kpi) => {
        const card = this.dom.kpiGrid.querySelector(`.kpi-card[data-kpi="${kpi.key}"]`);
        if (!card) {
          return;
        }
        const valueElement = card.querySelector('.kpi-value');
        const trendElement = card.querySelector('.kpi-trend');
        const infoButton = card.querySelector('.kpi-info');
        valueElement.textContent = formatCurrency(kpi.value);
        if (trendElement) {
          trendElement.textContent = `${kpi.trend.direction === 'up' ? '▲' : kpi.trend.direction === 'down' ? '▼' : '—'} ${formatPercentage(kpi.trend.percentage)}`;
          trendElement.classList.remove('up', 'down', 'flat');
          trendElement.classList.add(kpi.trend.direction);
        }
        if (infoButton) {
          infoButton.setAttribute('data-tooltip', kpi.tooltip);
          infoButton.setAttribute('title', kpi.tooltip);
        }

        const previousValue = this.state.previousKpis[kpi.key];
        if (previousValue !== undefined && !isAutoRefresh) {
          const change = kpi.value - previousValue;
          if (Math.abs(change) >= previousValue * 0.15) {
            const direction = change > 0 ? 'incrementó' : 'disminuyó';
            this.showToast(`${kpi.label} ${direction} ${(Math.abs(change) / (previousValue || 1) * 100).toFixed(1)}%`, change > 0 ? 'success' : 'warning');
          }
        }
        this.state.previousKpis[kpi.key] = kpi.value;
      });
    }

    updateInventory(data) {
      if (!data || !Array.isArray(data.stores)) {
        return;
      }
      this.state.inventoryData = data.stores;
      if (this.dom.inventoryTotals.units) {
        this.dom.inventoryTotals.units.textContent = formatNumber(data.totals?.units || 0);
      }
      if (this.dom.inventoryTotals.alerts) {
        this.dom.inventoryTotals.alerts.textContent = formatNumber(data.totals?.alerts || 0);
      }
      if (this.dom.inventoryTotals.alertRate) {
        this.dom.inventoryTotals.alertRate.textContent = `${(data.totals?.alert_rate || 0).toFixed(2)}%`;
      }

      if (this.dom.inventoryTable) {
        if (!data.stores.length) {
          this.dom.inventoryTable.innerHTML = '<tr><td colspan="4">No se encontraron datos de inventario.</td></tr>';
        } else {
          this.dom.inventoryTable.innerHTML = data.stores.map((store) => `
            <tr data-store="${store.store_id}">
              <td>${store.store_name}</td>
              <td>${formatNumber(store.units)}</td>
              <td>${formatNumber(store.alerts)}</td>
              <td>${store.alert_rate.toFixed(2)}%</td>
            </tr>
          `).join('');
        }
      }

      this.updateInventoryChart();
    }

    updateInventoryChart() {
      const chart = this.charts[this.chartIds.inventory];
      if (!chart) {
        return;
      }
      const stores = this.state.inventoryData || [];
      const categories = stores.map((store) => store.store_name);
      const unitsSeries = {
        name: 'Unidades',
        data: stores.map((store) => store.units || 0)
      };
      const alertsSeries = {
        name: 'Alertas',
        data: stores.map((store) => store.alerts || 0)
      };

      let series = [];
      if (this.state.inventoryView === 'units') {
        series = [unitsSeries];
      } else if (this.state.inventoryView === 'alerts') {
        series = [alertsSeries];
      } else {
        series = [unitsSeries, alertsSeries];
      }

      chart.updateOptions({
        chart: {
          type: 'bar',
          height: 360,
          stacked: this.state.inventoryView === 'both'
        },
        series,
        xaxis: {
          categories,
          labels: {
            rotate: -35
          }
        },
        plotOptions: {
          bar: {
            columnWidth: '55%',
            horizontal: false,
            dataLabels: {
              position: 'top'
            }
          }
        },
        dataLabels: {
          enabled: true,
          formatter: (value) => formatNumber(value)
        },
        tooltip: {
          shared: true,
          intersect: false,
          y: {
            formatter: (val) => formatNumber(val)
          }
        }
      }, true, true);

      chart.updateOptions({
        events: {
          dataPointSelection: (event, chartContext, config) => {
            const store = stores[config.dataPointIndex];
            if (store) {
              this.renderInventoryDetail(store);
            }
          }
        }
      });
    }

    renderInventoryDetail(store) {
      if (!store || !Array.isArray(store.products)) {
        return;
      }
      this.dom.inventoryDetail.title.textContent = `Inventario detallado - ${store.store_name}`;
      this.dom.inventoryDetail.tableBody.innerHTML = store.products.map((product) => `
        <tr>
          <td>${product.product_name}</td>
          <td>${product.sku || '—'}</td>
          <td>${product.category_name}</td>
          <td class="${product.is_alert ? 'text-alert' : ''}">${formatNumber(product.quantity)}</td>
          <td>${formatNumber(product.min_stock)}</td>
        </tr>
      `).join('');
      this.dom.inventoryDetail.panel.removeAttribute('hidden');
    }

    updateTopProducts(data) {
      if (!data || !Array.isArray(data.products)) {
        return;
      }
      this.state.productData = data.products;
      if (this.dom.productsTable) {
        if (!data.products.length) {
          this.dom.productsTable.innerHTML = '<tr><td colspan="4">No se encontraron ventas en el periodo.</td></tr>';
        } else {
          this.dom.productsTable.innerHTML = data.products.map((product) => `
            <tr data-product="${product.product_id}">
              <td>${product.product_name}</td>
              <td>${formatNumber(product.units)}</td>
              <td>${formatCurrency(product.revenue)}</td>
              <td>${formatPercentage(product.trend_percentage)}</td>
            </tr>
          `).join('');
        }
      }

      const chart = this.charts[this.chartIds.topProducts];
      if (chart) {
        chart.updateOptions({
          chart: {
            type: 'bar',
            height: 360
          },
          plotOptions: {
            bar: {
              horizontal: true,
              barHeight: '60%'
            }
          },
          dataLabels: {
            enabled: true,
            formatter: (value) => formatNumber(value)
          },
          xaxis: {
            categories: data.products.map((product) => product.product_name)
          },
          tooltip: {
            y: {
              formatter: (value) => this.state.metric === 'revenue' ? formatCurrency(value) : formatNumber(value)
            }
          },
          series: [
            {
              name: this.state.metric === 'revenue' ? 'Ingresos' : 'Unidades',
              data: data.products.map((product) => this.state.metric === 'revenue' ? product.revenue : product.units)
            }
          ]
        }, true, true);

        chart.updateOptions({
          events: {
            dataPointSelection: (event, chartContext, config) => {
              const product = data.products[config.dataPointIndex];
              if (product) {
                this.renderProductHistory(product);
              }
            }
          }
        });
      }

      const distributionChart = this.charts[this.chartIds.topProductsDistribution];
      if (distributionChart) {
        distributionChart.updateOptions({
          chart: {
            type: 'donut',
            height: 340
          },
          labels: data.distribution.labels,
          series: data.distribution.values,
          dataLabels: {
            enabled: true,
            formatter: (val, opts) => `${val.toFixed(1)}%`
          },
          tooltip: {
            y: {
              formatter: (value) => formatCurrency(value)
            }
          },
          legend: {
            position: 'bottom'
          }
        }, true, true);
      }

      if (data.products.length) {
        this.renderProductHistory(data.products[0]);
      } else if (this.dom.productHistoryPanel) {
        this.dom.productHistoryPanel.setAttribute('hidden', '');
      }
    }

    renderProductHistory(product) {
      if (!product || !Array.isArray(product.history) || !product.history.length) {
        if (this.dom.productHistoryPanel) {
          this.dom.productHistoryPanel.setAttribute('hidden', '');
        }
        return;
      }
      if (this.dom.productHistoryPanel) {
        this.dom.productHistoryPanel.removeAttribute('hidden');
      }
      if (this.dom.productHistoryTitle) {
        this.dom.productHistoryTitle.textContent = `Histórico - ${product.product_name}`;
      }
      const historyChart = this.charts[this.chartIds.productHistory];
      if (!historyChart) {
        return;
      }
      historyChart.updateOptions({
        chart: {
          type: 'line',
          height: 280
        },
        stroke: {
          curve: 'smooth'
        },
        xaxis: {
          categories: product.history.map((entry) => entry.date)
        },
        series: [
          {
            name: 'Unidades',
            data: product.history.map((entry) => entry.units)
          },
          {
            name: 'Ingresos',
            data: product.history.map((entry) => entry.revenue)
          }
        ],
        tooltip: {
          y: {
            formatter: (value, opts) => opts.seriesIndex === 0 ? formatNumber(value) : formatCurrency(value)
          }
        }
      }, true, true);
    }

    updateFinancial(data) {
      if (!data) {
        return;
      }
      const container = document.getElementById('financial_indicator_cards');
      if (container) {
        container.innerHTML = '';
        data.indicators.forEach((indicator, index) => {
          const card = document.createElement('div');
          card.className = `financial-card status-${indicator.status}`;
          card.innerHTML = `
            <div class="financial-card-header">
              <span>${indicator.label}</span>
              <span class="badge ${indicator.status}">${formatPercentage(indicator.change_percentage)}</span>
            </div>
            <strong>${formatCurrency(indicator.value)}</strong>
            <div class="sparkline" id="financial_sparkline_${index}"></div>
          `;
          container.appendChild(card);

          const sparklineElement = card.querySelector(`#financial_sparkline_${index}`);
          const sparklineId = `financial_sparkline_${index}`;
          const sparklineData = indicator.sparkline || [];
          if (sparklineElement) {
            if (this.sparklineCharts[sparklineId]) {
              this.sparklineCharts[sparklineId].updateOptions({
                chart: {
                  type: 'area',
                  height: 80,
                  sparkline: {
                    enabled: true
                  }
                },
                series: [
                  {
                    name: indicator.label,
                    data: sparklineData.map((point) => point.value)
                  }
                ],
                xaxis: {
                  categories: sparklineData.map((point) => point.label)
                }
              }, true, true);
            } else {
              this.sparklineCharts[sparklineId] = new ApexCharts(sparklineElement, {
                chart: {
                  id: sparklineId,
                  type: 'area',
                  height: 80,
                  sparkline: {
                    enabled: true
                  },
                  animations: {
                    enabled: true,
                    speed: 400
                  }
                },
                stroke: {
                  width: 2
                },
                fill: {
                  opacity: 0.3
                },
                series: [
                  {
                    name: indicator.label,
                    data: sparklineData.map((point) => point.value)
                  }
                ],
                xaxis: {
                  categories: sparklineData.map((point) => point.label)
                },
                tooltip: {
                  y: {
                    formatter: (value) => formatCurrency(value)
                  }
                }
              });
              this.sparklineCharts[sparklineId].render();
            }
          }
        });
      }

      if (this.dom.customerBreakdown) {
        const newValue = this.dom.customerBreakdown.querySelector('[data-type="new"]');
        const recurringValue = this.dom.customerBreakdown.querySelector('[data-type="recurring"]');
        const revenueValue = this.dom.customerBreakdown.querySelector('[data-type="revenue"]');
        const newMeta = this.dom.customerBreakdown.querySelector('.breakdown-meta[data-type="new"]');
        const recurringMeta = this.dom.customerBreakdown.querySelector('.breakdown-meta[data-type="recurring"]');
        if (newValue) {
          newValue.textContent = `${formatNumber(data.customers?.new?.count || 0)} clientes`;
        }
        if (recurringValue) {
          recurringValue.textContent = `${formatNumber(data.customers?.recurring?.count || 0)} clientes`;
        }
        if (revenueValue) {
          revenueValue.textContent = formatCurrency(data.customers?.recurring?.revenue + data.customers?.new?.revenue || 0);
        }
        if (newMeta) {
          newMeta.textContent = `${(data.customers?.new?.percentage || 0).toFixed(1)}%`;
        }
        if (recurringMeta) {
          recurringMeta.textContent = `${(data.customers?.recurring?.percentage || 0).toFixed(1)}%`;
        }
      }

      if (this.dom.financialTable) {
        const rows = data.indicators.map((indicator) => `
          <tr>
            <td>${indicator.label}</td>
            <td>${formatCurrency(indicator.value)}</td>
            <td>${formatPercentage(indicator.change_percentage)}</td>
          </tr>
        `);
        this.dom.financialTable.innerHTML = rows.join('');
      }
    }

    updateHeatmap(data) {
      if (!data) {
        return;
      }
      const aggregated = data.series ? this.aggregateHeatmap(data.series, data.hours, data.days) : { series: [], peaks: [] };
      const chart = this.charts[this.chartIds.salesHeatmap];
      if (chart) {
        chart.updateOptions({
          chart: {
            type: 'heatmap',
            height: 360
          },
          dataLabels: {
            enabled: false
          },
          colors: ['#0ea5e9'],
          plotOptions: {
            heatmap: {
              shadeIntensity: 0.5,
              radius: 4,
              colorScale: {
                ranges: [
                  { from: 0, to: 10000, color: '#1d4ed8' },
                  { from: 10000, to: 30000, color: '#2563eb' },
                  { from: 30000, to: 60000, color: '#60a5fa' },
                  { from: 60000, to: Number.MAX_SAFE_INTEGER, color: '#93c5fd' }
                ]
              }
            }
          },
          xaxis: {
            type: 'category'
          },
          yaxis: {
            labels: {
              style: {
                fontSize: '12px'
              }
            }
          },
          tooltip: {
            y: {
              formatter: (value) => formatCurrency(value)
            }
          },
          series: aggregated.series
        }, true, true);
      }

      if (this.dom.heatmapTable) {
        if (!data.store_totals?.length) {
          this.dom.heatmapTable.innerHTML = '<tr><td colspan="3">No se registran ventas en el periodo.</td></tr>';
        } else {
          this.dom.heatmapTable.innerHTML = data.store_totals.map((item) => `
            <tr>
              <td>${item.store_name}</td>
              <td>—</td>
              <td>${formatCurrency(item.amount)}</td>
            </tr>
          `).join('');
        }
      }

      if (this.dom.heatmapPeaks) {
        if (!data.peaks?.length) {
          this.dom.heatmapPeaks.innerHTML = '<p>No se encontraron horarios pico destacados.</p>';
        } else {
          this.dom.heatmapPeaks.innerHTML = `
            <h4>Top horarios pico</h4>
            <ul>
              ${data.peaks.map((peak) => `<li><strong>${peak.day} ${peak.hour}</strong> · ${formatCurrency(peak.amount)} (${this.lookupStoreName(peak.store_id)})</li>`).join('')}
            </ul>
          `;
        }
      }
    }

    aggregateHeatmap(series, hours, days) {
      const matrix = Array.from({ length: days.length }, () => Array(hours.length).fill(0));
      series.forEach((storeEntry) => {
        (storeEntry.series || []).forEach((dayEntry, dayIndex) => {
          dayEntry.data.forEach((point) => {
            const hourIndex = hours.indexOf(point.x);
            if (hourIndex >= 0) {
              matrix[dayIndex][hourIndex] += point.y;
            }
          });
        });
      });
      return {
        series: days.map((dayLabel, index) => ({
          name: dayLabel,
          data: matrix[index].map((value, hourIndex) => ({ x: hours[hourIndex], y: Math.round(value) }))
        }))
      };
    }

    lookupStoreName(storeId) {
      const store = this.context.stores.find((item) => item.id === storeId);
      if (store) {
        return store.name;
      }
      const inventoryStore = this.state.inventoryData.find((item) => item.store_id === storeId);
      return inventoryStore ? inventoryStore.store_name : 'Sucursal';
    }

    updateCategory(data) {
      if (!data) {
        return;
      }
      const treemap = this.charts[this.chartIds.categoryTreemap];
      if (treemap) {
        treemap.updateOptions({
          chart: {
            type: 'treemap',
            height: 360
          },
          series: [
            {
              data: data.composition || []
            }
          ],
          tooltip: {
            y: {
              formatter: (value) => formatCurrency(value)
            }
          }
        }, true, true);
      }

      const rotationChart = this.charts[this.chartIds.categoryRotation];
      if (rotationChart) {
        rotationChart.updateOptions({
          chart: {
            type: 'bar',
            height: 340
          },
          plotOptions: {
            bar: {
              horizontal: true
            }
          },
          series: [
            {
              name: 'Rotación',
              data: (data.rotation || []).map((item) => item.turnover)
            }
          ],
          xaxis: {
            categories: (data.rotation || []).map((item) => item.category_name)
          },
          tooltip: {
            y: {
              formatter: (value) => `${value}x`
            }
          }
        }, true, true);
      }

      const seasonalityChart = this.charts[this.chartIds.categorySeasonality];
      if (seasonalityChart) {
        seasonalityChart.updateOptions({
          chart: {
            type: 'area',
            height: 360
          },
          stroke: {
            curve: 'smooth'
          },
          series: data.seasonality?.series || [],
          xaxis: {
            categories: data.seasonality?.labels || []
          },
          tooltip: {
            y: {
              formatter: (value) => formatCurrency(value)
            }
          }
        }, true, true);
      }

      if (this.dom.categoryTable) {
        if (!data.rotation?.length) {
          this.dom.categoryTable.innerHTML = '<tr><td colspan="5">No hay datos suficientes para mostrar el análisis por categoría.</td></tr>';
        } else {
          const marginMap = new Map((data.margins || []).map((item) => [item.category_id || 0, item.margin]));
          const revenueMap = new Map((data.composition || []).map((item) => [item.x, item.y]));
          this.dom.categoryTable.innerHTML = data.rotation.map((item) => {
            const revenue = revenueMap.get(item.category_name) || 0;
            const margin = marginMap.get(item.category_id || 0) || 0;
            return `
              <tr>
                <td>${item.category_name}</td>
                <td>${formatCurrency(revenue)}</td>
                <td>${formatNumber(item.units_sold)}</td>
                <td>${item.turnover}</td>
                <td>${formatCurrency(margin)}</td>
              </tr>
            `;
          }).join('');
        }
      }
    }

    toggleTable(targetId, button) {
      const wrapper = document.getElementById(targetId);
      if (!wrapper) {
        return;
      }
      if (wrapper.hasAttribute('hidden')) {
        wrapper.removeAttribute('hidden');
        if (button) {
          button.classList.add('active');
        }
      } else {
        wrapper.setAttribute('hidden', '');
        if (button) {
          button.classList.remove('active');
        }
      }
    }

    exportChart(targetId) {
      const chartId = Object.values(this.chartIds).find((id) => id.includes(targetId));
      if (!chartId) {
        this.showToast('No se encontró la gráfica a exportar.', 'warning');
        return;
      }
      ApexCharts.exec(chartId, 'dataURI').then(({ imgURI }) => {
        const link = document.createElement('a');
        link.href = imgURI;
        link.download = `${chartId}.png`;
        link.click();
        this.showToast('Gráfica exportada en formato PNG.', 'success');
      }).catch(() => {
        this.showToast('No fue posible exportar la gráfica.', 'error');
      });
    }

    setLoadingState(isLoading) {
      if (!this.dom.module) {
        return;
      }
      this.dom.module.classList.toggle('is-loading', isLoading);
    }

    showToast(message, variant = 'info') {
      if (!this.dom.toastContainer) {
        return;
      }
      const toast = document.createElement('div');
      toast.className = `toast toast-${variant}`;
      toast.textContent = message;
      this.dom.toastContainer.appendChild(toast);
      setTimeout(() => {
        toast.classList.add('visible');
      }, 50);
      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
      }, 4500);
    }

    startAutoRefresh() {
      this.stopAutoRefresh();
      if (!this.state.autoRefresh) {
        return;
      }
      this.state.refreshTimer = setInterval(() => this.loadData(true), 300000);
      this.updateRefreshStatus('Actualización automática cada 5 min');
    }

    stopAutoRefresh() {
      if (this.state.refreshTimer) {
        clearInterval(this.state.refreshTimer);
        this.state.refreshTimer = null;
      }
    }

    updateRefreshStatus(text) {
      if (this.dom.refreshStatus) {
        this.dom.refreshStatus.textContent = text;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new ReportsDashboard(contextData);
    dashboard.init();
  });
})();
