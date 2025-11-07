(function () {
  const tableBody = document.querySelector('#users_table tbody');
  const feedback = document.getElementById('users_feedback');
  const form = document.getElementById('user_form');
  const formTitle = document.getElementById('user_form_title');
  const newUserBtn = document.getElementById('new_user_btn');
  const cancelEditBtn = document.getElementById('cancel_edit');
  const userIdField = document.getElementById('user_id');
  const usernameField = document.getElementById('username');
  const passwordField = document.getElementById('password');
  const userTypeField = document.getElementById('user_type');
  const storesField = document.getElementById('user_stores');

  if (!tableBody || !form) {
    return;
  }

  const ROLE_LABELS = {
    2: 'Gerente',
    3: 'Auxiliar'
  };

  let allStores = [];
  let cachedUsers = [];
  let isEditing = false;

  const clearFeedback = () => {
    feedback.textContent = '';
    feedback.classList.remove('error');
  };

  const showFeedback = (message, type = 'success') => {
    feedback.textContent = message;
    feedback.classList.toggle('error', type === 'error');
  };

  const resetForm = () => {
    isEditing = false;
    form.reset();
    userIdField.value = '';
    formTitle.textContent = 'Crear usuario';
    passwordField.placeholder = '••••••••';
    clearFeedback();
    passwordField.required = true;
  };

  const populateStores = () => {
    storesField.innerHTML = '';
    allStores.forEach(store => {
      const option = document.createElement('option');
      option.value = store.id;
      option.textContent = store.name;
      storesField.appendChild(option);
    });
  };

  const renderEmptyRow = () => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'table-empty';
    cell.textContent = 'No hay usuarios registrados.';
    row.appendChild(cell);
    tableBody.appendChild(row);
  };

  const renderUsers = (users) => {
    if (!users.length) {
      renderEmptyRow();
      return;
    }

    tableBody.innerHTML = '';
    users.forEach(user => {
      const row = document.createElement('tr');
      const roleLabel = ROLE_LABELS[user.user_type] || `Tipo ${user.user_type}`;
      const storeNames = user.stores.map(store => store.name).join(', ') || 'Sin sucursales';

      row.innerHTML = `
        <td>${user.username}</td>
        <td>${roleLabel}</td>
        <td>${storeNames}</td>
        <td class="table-actions">
          <button type="button" class="btn-link" data-action="edit" data-id="${user.id}">Editar</button>
          <button type="button" class="btn-link danger" data-action="delete" data-id="${user.id}">Eliminar</button>
        </td>
      `;

      tableBody.appendChild(row);
    });
  };

  const loadData = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        throw new Error('No se pudo obtener la lista de usuarios.');
      }
      const data = await response.json();
      allStores = data.stores || [];
      cachedUsers = data.users || [];
      populateStores();
      renderUsers(cachedUsers);
    } catch (error) {
      showFeedback(error.message, 'error');
      renderEmptyRow();
    }
  };

  const getSelectedStores = () => Array.from(storesField.selectedOptions).map(option => Number(option.value));

  const handleEdit = (user) => {
    isEditing = true;
    formTitle.textContent = 'Editar usuario';
    userIdField.value = user.id;
    usernameField.value = user.username;
    userTypeField.value = String(user.user_type);
    passwordField.value = '';
    passwordField.required = false;

    const selectedIds = new Set(user.stores.map(store => store.id));
    Array.from(storesField.options).forEach(option => {
      option.selected = selectedIds.has(Number(option.value));
    });

    showFeedback('Editando usuario. Actualiza la información y guarda los cambios.');
  };

  const confirmDelete = async (userId) => {
    if (!window.confirm('¿Desea eliminar este usuario? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No fue posible eliminar el usuario.');
      }

      showFeedback(result.message || 'Usuario eliminado correctamente.');
      resetForm();
      await loadData();
    } catch (error) {
      showFeedback(error.message, 'error');
    }
  };

  tableBody.addEventListener('click', (event) => {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) return;

    const userId = Number(actionButton.dataset.id);
    const action = actionButton.dataset.action;

    if (action === 'edit') {
      const user = cachedUsers.find(item => item.id === userId);
      if (user) {
        handleEdit(user);
      } else {
        showFeedback('No se pudo obtener la información del usuario.', 'error');
      }
    } else if (action === 'delete') {
      confirmDelete(userId);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback();

    const username = usernameField.value.trim();
    const userType = Number(userTypeField.value);
    const selectedStores = getSelectedStores();
    const password = passwordField.value.trim();

    if (!username) {
      showFeedback('El nombre de usuario es obligatorio.', 'error');
      return;
    }

    if (!userType) {
      showFeedback('Selecciona un rol para el usuario.', 'error');
      return;
    }

    if (!selectedStores.length) {
      showFeedback('Debes asignar al menos una sucursal.', 'error');
      return;
    }

    if (!isEditing && !password) {
      showFeedback('La contraseña es obligatoria para nuevos usuarios.', 'error');
      return;
    }

    const payload = {
      username,
      user_type: userType,
      store_ids: selectedStores
    };

    if (!isEditing || password) {
      payload.password = password;
    }

    const url = isEditing ? `/api/users/${userIdField.value}` : '/api/users';
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No fue posible guardar la información del usuario.');
      }

      showFeedback(result.message || 'Usuario guardado correctamente.');
      await loadData();
      resetForm();
    } catch (error) {
      showFeedback(error.message, 'error');
    }
  });

  newUserBtn.addEventListener('click', () => {
    resetForm();
    showFeedback('Completa el formulario para crear un nuevo usuario.');
  });

  cancelEditBtn.addEventListener('click', () => {
    resetForm();
  });

  resetForm();
  loadData();
})();
