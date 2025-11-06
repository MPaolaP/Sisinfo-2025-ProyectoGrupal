from flask import Flask, render_template, redirect, url_for, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from Modelo.conexion import DevelopmentConfig
from datetime import datetime, timedelta, date
from sqlalchemy import func

db = SQLAlchemy()
login_manager = LoginManager()

# ======= MODELO DE DATOS =======
class User(UserMixin, db.Model):
    __tablename__ = 'user_account'
    id = db.Column('user_id', db.Integer, primary_key=True)
    username = db.Column('username', db.String(100), unique=True, nullable=False)
    password_hash = db.Column('password', db.String(255), nullable=False)
    user_type = db.Column('user_type', db.Integer, nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Store(db.Model):
    __tablename__ = 'stores'
    id = db.Column('store_id', db.Integer, primary_key=True)
    name = db.Column('store_name', db.String(100), nullable=False)
    location = db.Column('location', db.String(200))
    active = db.Column('active', db.Boolean, default=True)

class Category(db.Model):
    __tablename__ = 'categories'
    id = db.Column('category_id', db.Integer, primary_key=True)
    name = db.Column('category_name', db.String(100), nullable=False)
    description = db.Column('description', db.String(255))
    products = db.relationship('Product', backref='category', lazy=True)

class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column('product_id', db.Integer, primary_key=True)
    name = db.Column('product_name', db.String(200), nullable=False)
    sku = db.Column('sku', db.String(50), unique=True)
    price = db.Column('price', db.Numeric(10, 2))
    category_id = db.Column('category_id', db.Integer, db.ForeignKey('categories.category_id'))

class Inventory(db.Model):
    __tablename__ = 'inventory'
    id = db.Column('inventory_id', db.Integer, primary_key=True)
    product_id = db.Column('product_id', db.Integer, db.ForeignKey('products.product_id'))
    store_id = db.Column('store_id', db.Integer, db.ForeignKey('stores.store_id'))
    quantity = db.Column('quantity', db.Integer, default=0)
    min_stock = db.Column('min_stock', db.Integer, default=10)

    product = db.relationship('Product', backref='inventory_items')
    store = db.relationship('Store', backref='inventory_items')

class Sale(db.Model):
    __tablename__ = 'sales'
    id = db.Column('sale_id', db.Integer, primary_key=True)
    store_id = db.Column('store_id', db.Integer, db.ForeignKey('stores.store_id'))
    product_id = db.Column('product_id', db.Integer, db.ForeignKey('products.product_id'))
    quantity = db.Column('quantity', db.Integer, nullable=False)
    total_amount = db.Column('total_amount', db.Numeric(10, 2))
    sale_date = db.Column('sale_date', db.DateTime, default=datetime.utcnow)

    store = db.relationship('Store', backref='sales')
    product = db.relationship('Product', backref='sales')

class StockAlert(db.Model):
    __tablename__ = 'stock_alerts'
    id = db.Column('alert_id', db.Integer, primary_key=True)
    inventory_id = db.Column('inventory_id', db.Integer, db.ForeignKey('inventory.inventory_id'))
    alert_type = db.Column('alert_type', db.String(50))
    message = db.Column('message', db.String(255))
    is_active = db.Column('is_active', db.Boolean, default=True)
    created_at = db.Column('created_at', db.DateTime, default=datetime.utcnow)

    inventory = db.relationship('Inventory', backref='alerts')

# ======= FECHAS =======
def get_date_range_filter(fecha_inicio_str, fecha_fin_str):
    """
    Convierte las strings de fecha a objetos datetime.
    Establece la fecha de hoy como default si no se proveen.
    Asegura que la fecha de fin incluya todo el día.
    """
    today_str = date.today().strftime('%Y-%m-%d')
    fecha_inicio_str = fecha_inicio_str if fecha_inicio_str else today_str
    fecha_fin_str = fecha_fin_str if fecha_fin_str else today_str

    try:
        fecha_inicio = datetime.strptime(fecha_inicio_str, '%Y-%m-%d')
        fecha_fin = datetime.strptime(fecha_fin_str, '%Y-%m-%d') + timedelta(days=1) - timedelta(seconds=1)
        return fecha_inicio, fecha_fin
    except ValueError:
        return datetime.combine(date.today(), datetime.min.time()), datetime.combine(date.today(), datetime.max.time())

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

def page_not_found(error):
    return render_template('404.html'), 404

# ======= FÁBRICA =======
def create_app(config_class=DevelopmentConfig):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'login'

    app.register_error_handler(404, page_not_found)

    # ======= RUTAS =======
    @app.route('/')
    def index():
        if current_user.is_authenticated:
            return redirect(url_for('dashboard'))
        return redirect(url_for('login'))

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if current_user.is_authenticated:
            return redirect(url_for('dashboard'))

        error = None
        if request.method == 'POST':
            username = request.form.get('username')
            password = request.form.get('password')
            user = db.session.execute(db.select(User).filter_by(username=username)).scalar_one_or_none()

            if user and user.check_password(password):
                login_user(user)
                next_page = request.args.get('next')
                return redirect(next_page or url_for('dashboard'))
            else:
                error = 'Nombre de usuario o contraseña incorrectos.'

        title_container = "Distrito"
        title2_container = "5"
        subtitle_container = "Urbana y deportiva"
        user_lbl = "Usuario"
        password_lbl = "Contraseña"
        button_login = "Iniciar sesión"
        create_account = "Crear una cuenta"

        return render_template(
            'login.html',
            title='Distrito5 - Login',
            titlecontainer=title_container,
            title2_container=title2_container,
            subtitle_container=subtitle_container,
            user=user_lbl,
            password=password_lbl,
            button_login=button_login,
            create_account=create_account,
            error=error
        )

    @app.route('/inventory')
    @login_required
    def inventory():
        return render_template('inventory.html', username=current_user.username)

    @app.route('/sales')
    @login_required
    def sales():
        return render_template('dashboard.html', username=current_user.username)

    @app.route('/reports')
    @login_required
    def reports():
        return render_template('dashboard.html', username=current_user.username)

    @app.route('/manage_users')
    @login_required
    def manage_users():
        return render_template('dashboard.html', username=current_user.username)

    @app.route('/products_clients')
    @login_required
    def products_clients():
        return render_template('dashboard.html', username=current_user.username)

    @app.route('/logout')
    @login_required
    def logout():
        logout_user()
        return redirect(url_for('login'))

    @app.route('/dashboard')
    @login_required
    def dashboard():
        return render_template('dashboard.html',
                               username=current_user.username,
                               user_type=current_user.user_type)

    # ======= API =======
    @app.route('/api/dashboard/stats', methods=['GET'])
    @login_required
    def get_dashboard_stats():
        fecha_inicio_str = request.args.get('fecha_inicio')
        fecha_fin_str = request.args.get('fecha_fin')
        fecha_inicio, fecha_fin = get_date_range_filter(fecha_inicio_str, fecha_fin_str)

        # filtro por fechas sólo para user_type 1 y 2
        query_filter = []
        if current_user.user_type in [1, 2]:
            query_filter.append(Sale.sale_date.between(fecha_inicio, fecha_fin))

        total_sales = 0
        if current_user.user_type in [1, 2]:
            sales_query = db.session.query(func.sum(Sale.total_amount))
            if query_filter:
                sales_query = sales_query.filter(*query_filter)
            total_sales = sales_query.scalar() or 0

        total_products = db.session.query(func.sum(Inventory.quantity)).scalar() or 0
        stock_alerts = StockAlert.query.filter_by(is_active=True).count()
        active_stores = Store.query.filter_by(active=True).count()

        return jsonify({
            'total_sales': float(total_sales),
            'total_products': int(total_products),
            'stock_alerts': stock_alerts,
            'active_stores': active_stores
        })

    @app.route('/api/dashboard/sales-by-store', methods=['GET'])
    @login_required
    def get_sales_by_store():
        if current_user.user_type not in [1, 2]:
            return jsonify({'error': 'No autorizado'}), 403

        fecha_inicio_str = request.args.get('fecha_inicio')
        fecha_fin_str = request.args.get('fecha_fin')
        fecha_inicio, fecha_fin = get_date_range_filter(fecha_inicio_str, fecha_fin_str)

        query = db.session.query(
            Store.id.label('store_id'),
            Store.name,
            func.sum(Sale.total_amount).label('total')
        ).join(Sale, Sale.store_id == Store.id).group_by(Store.id, Store.name)

        if fecha_inicio and fecha_fin:
            query = query.filter(Sale.sale_date.between(fecha_inicio, fecha_fin))

        results = query.all()
        return jsonify([{
            'store_id': r.store_id,
            'store': r.name,
            'total': float(r.total or 0)
        } for r in results])

    @app.route('/api/dashboard/top-products', methods=['GET'])
    @login_required
    def get_top_products():
        fecha_inicio_str = request.args.get('fecha_inicio')
        fecha_fin_str = request.args.get('fecha_fin')
        fecha_inicio, fecha_fin = get_date_range_filter(fecha_inicio_str, fecha_fin_str)

        query = db.session.query(
            Product.name,
            func.sum(Sale.quantity).label('total_quantity')
        ).join(Sale, Sale.product_id == Product.id) \
         .group_by(Product.id, Product.name) \
         .order_by(func.sum(Sale.quantity).desc()) \
         .limit(5)

        if current_user.user_type in [1, 2]:
            query = query.filter(Sale.sale_date.between(fecha_inicio, fecha_fin))

        results = query.all()
        return jsonify([{
            'name': r.name,
            'quantity': int(r.total_quantity or 0)
        } for r in results])

    @app.route('/api/dashboard/stock-alerts', methods=['GET'])
    @login_required
    def get_stock_alerts():
        rows = db.session.query(
            StockAlert,
            Product.name.label('product_name'),
            Store.name.label('store_name'),
            Inventory.quantity.label('qty')
        ).join(
            Inventory, StockAlert.inventory_id == Inventory.id
        ).join(
            Product, Inventory.product_id == Product.id
        ).join(
            Store, Inventory.store_id == Store.id
        ).filter(
            StockAlert.is_active.is_(True)
        ).all()

        return jsonify([{
            'id': row.StockAlert.id,
            'product_name': row.product_name,
            'store_name': row.store_name,
            'quantity': row.qty,
            'message': row.StockAlert.message,
            'alert_type': row.StockAlert.alert_type,
            'created_at': row.StockAlert.created_at.strftime('%Y-%m-%d %H:%M')
        } for row in rows])

    @app.route('/api/alerts/<int:alert_id>/dismiss', methods=['POST'])
    @login_required
    def dismiss_alert(alert_id):
        alert = StockAlert.query.get_or_404(alert_id)
        alert.is_active = False
        db.session.commit()
        return jsonify({'success': True, 'message': 'Alerta eliminada'})

    @app.route('/api/dashboard/store-detail/<int:store_id>', methods=['GET'])
    @login_required
    def get_store_detail(store_id):
        if current_user.user_type not in [1, 2]:
            return jsonify({'error': 'No autorizado'}), 403

        fecha_inicio_str = request.args.get('fecha_inicio')
        fecha_fin_str = request.args.get('fecha_fin')
        fecha_inicio, fecha_fin = get_date_range_filter(fecha_inicio_str, fecha_fin_str)

        store = Store.query.get_or_404(store_id)

        sales_query = db.session.query(func.sum(Sale.total_amount)).filter(
            Sale.store_id == store_id
        )
        if fecha_inicio and fecha_fin:
            sales_query = sales_query.filter(Sale.sale_date.between(fecha_inicio, fecha_fin))
        total_sales = sales_query.scalar() or 0

        inventory_items = db.session.query(
            Product.name,
            Inventory.quantity
        ).join(Inventory, Product.id == Inventory.product_id) \
         .filter(Inventory.store_id == store_id).all()

        return jsonify({
            'store_name': store.name,
            'location': store.location,
            'total_sales': float(total_sales),
            'inventory': [{'name': n, 'quantity': q} for (n, q) in inventory_items]
        })

    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=True)
