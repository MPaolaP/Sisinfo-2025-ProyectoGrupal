document.addEventListener('DOMContentLoaded', function () {
    // Variables globales
    let currentAlertId = null;

    // Elementos del DOM
    const fecha_inicio = document.getElementById('fecha_inicio');
    const fecha_fin = document.getElementById('fecha_fin');
    const apply_filter = document.getElementById('apply_filter');
    const detail_modal = document.getElementById('detail_modal');
    const alert_modal = document.getElementById('alert_modal');
    const modal_close = document.querySelector('.modal-close');
    const confirm_alert = document.getElementById('confirm_alert');
    const cancel_alert = document.getElementById('cancel_alert');

    // Inicializar fechas por defecto
    if (fecha_inicio && fecha_fin) {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        fecha_fin.value = today.toISOString().split('T')[0];
        fecha_inicio.value = firstDay.toISOString().split('T')[0];
    }

    // ===== CARGA DE DATOS =====
    function loadDashboardStats() {
        const params = new URLSearchParams();
        if (fecha_inicio && fecha_fin && window.USER_TYPE !== 3) {
            params.append('fecha_inicio', fecha_inicio.value);
            params.append('fecha_fin', fecha_fin.value);
        }
        fetch(`/api/dashboard/stats?${params}`)
            .then(r => r.json())
            .then(data => {
                if (window.USER_TYPE !== 3) {
                    document.getElementById('total_sales').textContent = '$' + formatNumber(data.total_sales);
                }
                document.getElementById('total_products').textContent = formatNumber(data.total_products);
                document.getElementById('stock_alerts').textContent = data.stock_alerts;
                document.getElementById('active_stores').textContent = data.active_stores;
            })
            .catch(() => showNotification('Error al cargar estadísticas', 'error'));
    }

    function loadTopProducts() {
        const params = new URLSearchParams();
        if (fecha_inicio && fecha_fin && window.USER_TYPE !== 3) {
            params.append('fecha_inicio', fecha_inicio.value);
            params.append('fecha_fin', fecha_fin.value);
        }
        fetch(`/api/dashboard/top-products?${params}`)
            .then(r => r.json())
            .then(data => {
                const container = document.getElementById('top_products');
                if (!data.length) {
                    container.innerHTML = '<p class="no-data">No hay productos para mostrar</p>';
                    return;
                }
                const colors = ['green', 'blue', 'purple', 'orange', 'pink'];
                container.innerHTML = data.map((product, i) => `
          <div class="product-item">
            <span class="product-name">${product.name}</span>
            <div class="product-sales ${colors[i % colors.length]}">
              <i class="fas fa-arrow-trend-up"></i>
              <span>${product.quantity} ventas</span>
            </div>
          </div>
        `).join('');
            })
            .catch(() => {
                document.getElementById('top_products').innerHTML =
                    '<p class="error-message">Error al cargar productos</p>';
            });
    }

    function loadStockAlerts() {
        fetch('/api/dashboard/stock-alerts')
            .then(r => r.json())
            .then(data => {
                const container = document.getElementById('notifications_products');
                if (!data.length) {
                    container.innerHTML = '<p class="no-data">No hay alertas activas</p>';
                    return;
                }
                container.innerHTML = data.map(alert => {
                    const alertClass = alert.alert_type === 'critical' ? 'danger' : 'warning';
                    return `
            <div class="alert-item ${alertClass}" data-alert-id="${alert.id}">
              <div class="alert-content">
                <p class="alert-title">${alert.message}</p>
                <p class="alert-text">${alert.store_name} - ${alert.quantity} unidades</p>
                <small class="alert-date">${alert.created_at}</small>
              </div>
              <button class="alert-dismiss" onclick="showAlertConfirmation(${alert.id})">
                <i class="fas fa-times"></i>
              </button>
            </div>
          `;
                }).join('');
            })
            .catch(() => {
                document.getElementById('notifications_products').innerHTML =
                    '<p class="error-message">Error al cargar alertas</p>';
            });
    }

    function loadSalesByStore() {
        if (window.USER_TYPE === 3) return;
        const params = new URLSearchParams();
        if (fecha_inicio && fecha_fin) {
            params.append('fecha_inicio', fecha_inicio.value);
            params.append('fecha_fin', fecha_fin.value);
        }
        fetch(`/api/dashboard/sales-by-store?${params}`)
            .then(r => r.json())
            .then(data => {
                const container = document.getElementById('store_summary');
                if (!data.length) {
                    container.innerHTML = '<p class="no-data">No hay ventas para mostrar</p>';
                    return;
                }
                container.innerHTML = data.map(store => `
          <div class="store-item" onclick="showStoreDetail(${store.store_id})">
            <span class="store-name">${store.store}</span>
            <div class="store-sales">
              <i class="fas fa-dollar-sign"></i>
              <span>$${formatNumber(store.total)}</span>
            </div>
          </div>
        `).join('');
            })
            .catch(() => {
                const container = document.getElementById('store_summary');
                if (container) container.innerHTML = '<p class="error-message">Error al cargar ventas</p>';
            });
    }

    // ===== DETALLES =====
    function showDetailModal(type) {
        const modal_title = document.getElementById('modal_title');
        const modal_body = document.getElementById('modal_body');

        modal_body.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
        detail_modal.style.display = 'block';

        switch (type) {
            case 'sales':
                modal_title.textContent = 'Detalle de Ventas';
                loadSalesDetail();
                break;
            case 'products':
                modal_title.textContent = 'Productos en Stock';
                loadProductsDetail();
                break;
            case 'alerts':
                modal_title.textContent = 'Alertas de Stock';
                loadAlertsDetail();
                break;
            case 'stores':
                modal_title.textContent = 'Sucursales Activas';
                loadStoresDetail();
                break;
        }
    }

    function loadSalesDetail() {
        const params = new URLSearchParams();
        if (fecha_inicio && fecha_fin) {
            params.append('fecha_inicio', fecha_inicio.value);
            params.append('fecha_fin', fecha_fin.value);
        }
        fetch(`/api/dashboard/sales-by-store?${params}`)
            .then(r => r.json())
            .then(data => {
                const modal_body = document.getElementById('modal_body');
                if (!data.length) {
                    modal_body.innerHTML = '<p class="no-data">No hay ventas para mostrar</p>';
                    return;
                }
                modal_body.innerHTML = `
          <div class="detail-list">
            ${data.map(store => `
              <div class="detail-item">
                <strong>${store.store}</strong>
                <span class="detail-value green">$${formatNumber(store.total)}</span>
              </div>`).join('')}
          </div>
        `;
            })
            .catch(() => {
                document.getElementById('modal_body').innerHTML =
                    '<p class="error-message">Error al cargar detalles</p>';
            });
    }

    function loadProductsDetail() {
        fetch('/api/dashboard/stats')
            .then(r => r.json())
            .then(data => {
                const modal_body = document.getElementById('modal_body');
                modal_body.innerHTML = `
          <div class="detail-summary">
            <div class="summary-card">
              <i class="fas fa-box fa-2x"></i>
              <div>
                <h4>Total de Productos</h4>
                <p class="big-number">${formatNumber(data.total_products)}</p>
              </div>
            </div>
          </div>
          <p class="detail-note">Para ver el inventario completo, visite la sección de Inventario.</p>
        `;
            });
    }

    function loadAlertsDetail() {
        fetch('/api/dashboard/stock-alerts')
            .then(r => r.json())
            .then(data => {
                const modal_body = document.getElementById('modal_body');
                if (!data.length) {
                    modal_body.innerHTML = '<p class="no-data">No hay alertas activas</p>';
                    return;
                }
                modal_body.innerHTML = `
          <div class="detail-list alerts-detail">
            ${data.map(alert => {
                    const alertClass = alert.alert_type === 'critical' ? 'danger' : 'warning';
                    return `
                <div class="detail-alert ${alertClass}">
                  <strong>${alert.product_name}</strong>
                  <p>${alert.store_name} - ${alert.quantity} unidades</p>
                  <small>${alert.created_at}</small>
                </div>`;
                }).join('')}
          </div>
        `;
            });
    }

    function loadStoresDetail() {
        fetch('/api/dashboard/stats')
            .then(r => r.json())
            .then(data => {
                const modal_body = document.getElementById('modal_body');
                modal_body.innerHTML = `
          <div class="detail-summary">
            <div class="summary-card">
              <i class="fas fa-store fa-2x"></i>
              <div>
                <h4>Sucursales Activas</h4>
                <p class="big-number">${data.active_stores}</p>
              </div>
            </div>
          </div>
          <p class="detail-note">Todas las sucursales están operando normalmente.</p>
        `;
            });
    }

    // ===== Detalle por tienda (NUEVO) =====
    window.showStoreDetail = function (storeId) {
        const params = new URLSearchParams();
        if (fecha_inicio && fecha_fin) {
            params.append('fecha_inicio', fecha_inicio.value);
            params.append('fecha_fin', fecha_fin.value);
        }
        fetch(`/api/dashboard/store-detail/${storeId}?${params}`)
            .then(r => r.json())
            .then(data => {
                document.getElementById('modal_title').textContent = `Detalle: ${data.store_name}`;
                document.getElementById('modal_body').innerHTML = `
          <div class="detail-summary">
            <div class="summary-card">
              <i class="fas fa-dollar-sign fa-2x"></i>
              <div>
                <h4>Ventas</h4>
                <p class="big-number">$${formatNumber(data.total_sales)}</p>
              </div>
            </div>
            <div class="summary-card">
              <i class="fas fa-box fa-2x"></i>
              <div>
                <h4>Productos</h4>
                <p class="big-number">${data.inventory.length}</p>
              </div>
            </div>
          </div>
          <div class="detail-list">
            ${data.inventory.map(i => `
              <div class="detail-item">
                <strong>${i.name}</strong>
                <span class="detail-value">${formatNumber(i.quantity)} u.</span>
              </div>`).join('')}
          </div>
        `;
                detail_modal.style.display = 'block';
            })
            .catch(() => showNotification('Error al cargar detalle de sucursal', 'error'));
    };

    // ===== ALERTAS =====
    window.showAlertConfirmation = function (alertId) {
        currentAlertId = alertId;
        alert_modal.style.display = 'block';
    };

    function dismissAlert(alertId) {
        fetch(`/api/alerts/${alertId}/dismiss`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    showNotification('Alerta eliminada correctamente', 'success');
                    loadStockAlerts();
                    loadDashboardStats();
                }
            })
            .catch(() => showNotification('Error al eliminar la alerta', 'error'));
    }

    // ===== AUX =====
    function formatNumber(num) {
        return new Intl.NumberFormat('es-CO').format(num);
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
      <span>${message}</span>
    `;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // ===== EVENTOS =====
    if (apply_filter) {
        apply_filter.addEventListener('click', function () {
            loadDashboardStats();
            loadTopProducts();
            if (window.USER_TYPE !== 3) loadSalesByStore();
            showNotification('Filtro aplicado correctamente', 'success');
        });
    }

    document.querySelectorAll('.stat-card.clickable').forEach(card => {
        card.addEventListener('click', function () {
            const detailType = this.dataset.detail;
            showDetailModal(detailType);
        });
    });

    if (modal_close) {
        modal_close.addEventListener('click', function () {
            detail_modal.style.display = 'none';
        });
    }

    window.addEventListener('click', function (event) {
        if (event.target === detail_modal) detail_modal.style.display = 'none';
        if (event.target === alert_modal) alert_modal.style.display = 'none';
    });

    if (confirm_alert) {
        confirm_alert.addEventListener('click', function () {
            if (currentAlertId) {
                dismissAlert(currentAlertId);
                alert_modal.style.display = 'none';
                currentAlertId = null;
            }
        });
    }
    if (cancel_alert) {
        cancel_alert.addEventListener('click', function () {
            alert_modal.style.display = 'none';
            currentAlertId = null;
        });
    }

    // ===== INICIALIZACIÓN =====
    loadDashboardStats();
    loadTopProducts();
    loadStockAlerts();
    if (window.USER_TYPE !== 3) loadSalesByStore();

    // Refresco cada 5 min
    setInterval(() => {
        loadDashboardStats();
        loadStockAlerts();
    }, 300000);
});
