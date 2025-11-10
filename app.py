from flask import (
    Flask,
    render_template,
    redirect,
    url_for,
    request,
    jsonify,
    abort,
    current_app,
    send_file,
)
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from Modelo.conexion import DevelopmentConfig
from datetime import datetime, timedelta, date
from collections import defaultdict
from sqlalchemy import func, or_, case, extract
from sqlalchemy.orm import aliased
from decimal import Decimal, InvalidOperation
from sqlalchemy.exc import IntegrityError
import csv
import io
import json
from sqlalchemy import cast, Date, func

db = SQLAlchemy()
login_manager = LoginManager()

# ======= MODELO DE DATOS =======
class User(UserMixin, db.Model):
    __tablename__ = 'user_account'
    id = db.Column('user_id', db.Integer, primary_key=True)
    username = db.Column('username', db.String(100), unique=True, nullable=False)
    password_hash = db.Column('password', db.String(255), nullable=False)
    user_type = db.Column('user_type', db.Integer, nullable=False)
    store_access = db.relationship('UserStoreAccess', back_populates='user', cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class UserStoreAccess(db.Model):
    __tablename__ = 'user_store_access'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user_account.user_id'), nullable=False)
    store_id = db.Column(db.Integer, db.ForeignKey('stores.store_id'), nullable=False)

    user = db.relationship('User', back_populates='store_access')
    store = db.relationship('Store', back_populates='user_access')

    __table_args__ = (db.UniqueConstraint('user_id', 'store_id', name='uq_user_store_access'),)


class Store(db.Model):
    __tablename__ = 'stores'
    id = db.Column('store_id', db.Integer, primary_key=True)
    name = db.Column('store_name', db.String(100), nullable=False)
    location = db.Column('location', db.String(200))
    active = db.Column('active', db.Boolean, default=True)
    user_access = db.relationship('UserStoreAccess', back_populates='store', cascade='all, delete-orphan')

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
    size = db.Column('size', db.String(50))
    color = db.Column('color', db.String(50))
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


class InventoryMovement(db.Model):
    __tablename__ = 'inventory_movements'
    id = db.Column('movement_id', db.Integer, primary_key=True)
    product_id = db.Column('product_id', db.Integer, db.ForeignKey('products.product_id'), nullable=False)
    store_id = db.Column('store_id', db.Integer, db.ForeignKey('stores.store_id'), nullable=False)
    quantity = db.Column('quantity', db.Integer, nullable=False)
    movement_type = db.Column('movement_type', db.String(20), nullable=False)  # entry, exit, transfer_in, transfer_out
    notes = db.Column('notes', db.String(255))
    performed_by = db.Column('performed_by', db.Integer, db.ForeignKey('user_account.user_id'))
    created_at = db.Column('created_at', db.DateTime, default=datetime.utcnow)

    product = db.relationship('Product')
    store = db.relationship('Store')
    user = db.relationship('User')


class TransferRequest(db.Model):
    __tablename__ = 'transfer_requests'
    id = db.Column('transfer_id', db.Integer, primary_key=True)
    product_id = db.Column('product_id', db.Integer, db.ForeignKey('products.product_id'), nullable=False)
    source_store_id = db.Column('source_store_id', db.Integer, db.ForeignKey('stores.store_id'), nullable=False)
    target_store_id = db.Column('target_store_id', db.Integer, db.ForeignKey('stores.store_id'), nullable=False)
    quantity = db.Column('quantity', db.Integer, nullable=False)
    status = db.Column('status', db.String(20), default='pending')
    requested_by = db.Column('requested_by', db.Integer, db.ForeignKey('user_account.user_id'))
    approved_by = db.Column('approved_by', db.Integer, db.ForeignKey('user_account.user_id'))
    confirmed_by = db.Column('confirmed_by', db.Integer, db.ForeignKey('user_account.user_id'))
    requested_at = db.Column('requested_at', db.DateTime, default=datetime.utcnow)
    approved_at = db.Column('approved_at', db.DateTime)
    confirmed_at = db.Column('confirmed_at', db.DateTime)
    notes = db.Column('notes', db.String(255))

    product = db.relationship('Product', foreign_keys=[product_id])
    source_store = db.relationship('Store', foreign_keys=[source_store_id])
    target_store = db.relationship('Store', foreign_keys=[target_store_id])
    requester = db.relationship('User', foreign_keys=[requested_by])
    approver = db.relationship('User', foreign_keys=[approved_by])
    confirmer = db.relationship('User', foreign_keys=[confirmed_by])

class Customer(db.Model):
    __tablename__ = 'customers'
    id = db.Column('customer_id', db.Integer, primary_key=True)
    name = db.Column('customer_name', db.String(150), nullable=False)
    email = db.Column('email', db.String(120))
    phone = db.Column('phone', db.String(50))
    created_at = db.Column('created_at', db.DateTime, default=datetime.utcnow)

    invoices = db.relationship('Invoice', backref='customer', lazy=True)

class POSSession(db.Model):
    __tablename__ = 'pos_sessions'
    id = db.Column('session_id', db.Integer, primary_key=True)
    user_id = db.Column('user_id', db.Integer, db.ForeignKey('user_account.user_id'), nullable=False)
    store_id = db.Column('store_id', db.Integer, db.ForeignKey('stores.store_id'), nullable=False)
    opened_at = db.Column('opened_at', db.DateTime, default=datetime.utcnow)
    closed_at = db.Column('closed_at', db.DateTime)
    opening_amount = db.Column('opening_amount', db.Numeric(10, 2), default=0)
    closing_amount = db.Column('closing_amount', db.Numeric(10, 2))
    status = db.Column('status', db.String(20), default='open')
    notes = db.Column('notes', db.String(255))

    store = db.relationship('Store', backref='pos_sessions')
    user = db.relationship('User', backref='pos_sessions')

class Invoice(db.Model):
    __tablename__ = 'invoices'
    id = db.Column('invoice_id', db.Integer, primary_key=True)
    invoice_number = db.Column('invoice_number', db.String(50), unique=True)
    customer_id = db.Column('customer_id', db.Integer, db.ForeignKey('customers.customer_id'))
    user_id = db.Column('user_id', db.Integer, db.ForeignKey('user_account.user_id'))
    store_id = db.Column('store_id', db.Integer, db.ForeignKey('stores.store_id'))
    session_id = db.Column('session_id', db.Integer, db.ForeignKey('pos_sessions.session_id'))
    total_amount = db.Column('total_amount', db.Numeric(10, 2), default=0)
    payment_method = db.Column('payment_method', db.String(50))
    status = db.Column('status', db.String(20), default='paid')
    created_at = db.Column('created_at', db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref='invoices')
    store = db.relationship('Store', backref='invoices')
    session = db.relationship('POSSession', backref='invoices')

class InvoiceItem(db.Model):
    __tablename__ = 'invoice_items'
    id = db.Column('invoice_item_id', db.Integer, primary_key=True)
    invoice_id = db.Column('invoice_id', db.Integer, db.ForeignKey('invoices.invoice_id'), nullable=False)
    product_id = db.Column('product_id', db.Integer, db.ForeignKey('products.product_id'), nullable=False)
    quantity = db.Column('quantity', db.Integer, nullable=False)
    unit_price = db.Column('unit_price', db.Numeric(10, 2), nullable=False)
    discount = db.Column('discount', db.Numeric(10, 2), default=0)
    line_total = db.Column('line_total', db.Numeric(10, 2), nullable=False)

    invoice = db.relationship('Invoice', backref='items')
    product = db.relationship('Product', backref='invoice_items')

class Sale(db.Model):
    __tablename__ = 'sales'
    id = db.Column('sale_id', db.Integer, primary_key=True)
    store_id = db.Column('store_id', db.Integer, db.ForeignKey('stores.store_id'))
    product_id = db.Column('product_id', db.Integer, db.ForeignKey('products.product_id'))
    quantity = db.Column('quantity', db.Integer, nullable=False)
    total_amount = db.Column('total_amount', db.Numeric(10, 2))
    sale_date = db.Column('sale_date', db.DateTime, default=datetime.utcnow)
    session_id = db.Column('session_id', db.Integer, db.ForeignKey('pos_sessions.session_id'))
    invoice_id = db.Column('invoice_id', db.Integer, db.ForeignKey('invoices.invoice_id'))

    store = db.relationship('Store', backref='sales')
    product = db.relationship('Product', backref='sales')
    session = db.relationship('POSSession', backref='sales')


class InvoiceAuditLog(db.Model):
    __tablename__ = 'invoice_audit_logs'
    id = db.Column('log_id', db.Integer, primary_key=True)
    invoice_id = db.Column('invoice_id', db.Integer, db.ForeignKey('invoices.invoice_id'), nullable=False)
    user_id = db.Column('user_id', db.Integer, db.ForeignKey('user_account.user_id'), nullable=False)
    action = db.Column('action', db.String(50), nullable=False)
    description = db.Column('description', db.String(255))
    metadatas = db.Column('metadata', db.JSON)
    created_at = db.Column('created_at', db.DateTime, default=datetime.utcnow)

    invoice = db.relationship('Invoice', backref='audit_logs')
    user = db.relationship('User')


PDF_PAGE_WIDTH = 612
PDF_PAGE_HEIGHT = 792
PDF_MARGIN = 72


def _pdf_escape(text):
    if text is None:
        return ''
    return str(text).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _build_pdf_page_streams(title, lines):
    if lines is None:
        lines = []
    start_y = PDF_PAGE_HEIGHT - PDF_MARGIN
    y = start_y
    commands = []
    pages = []

    if title:
        commands.extend([
            'BT',
            '/F1 18 Tf',
            f'72 {y:.2f} Td',
            f'({_pdf_escape(title)}) Tj',
            'ET'
        ])
        y -= 30

    for line in lines:
        if y < PDF_MARGIN:
            pages.append('\n'.join(commands))
            commands = []
            y = start_y
        commands.extend([
            'BT',
            '/F1 12 Tf',
            f'72 {y:.2f} Td',
            f'({_pdf_escape(line)}) Tj',
            'ET'
        ])
        y -= 16

    if not commands:
        commands = ['BT', '/F1 12 Tf', f'72 {start_y:.2f} Td', '( ) Tj', 'ET']

    pages.append('\n'.join(commands))
    return pages


def build_simple_pdf(title, lines):
    page_streams = _build_pdf_page_streams(title, lines)
    if not page_streams:
        page_streams = ['']

    total_pages = len(page_streams)
    font_obj_num = 3
    first_content_obj = 4

    buffer = io.BytesIO()
    buffer.write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')

    offsets = []

    def write_obj(obj_num, body_bytes):
        offsets.append(buffer.tell())
        buffer.write(f'{obj_num} 0 obj\n'.encode('ascii'))
        buffer.write(body_bytes)
        buffer.write(b'\nendobj\n')

    catalog_body = b'<< /Type /Catalog /Pages 2 0 R >>'
    write_obj(1, catalog_body)

    page_numbers = [first_content_obj + (index * 2) + 1 for index in range(total_pages)]
    kids = ' '.join(f'{num} 0 R' for num in page_numbers)
    pages_body = f'<< /Type /Pages /Kids [{kids}] /Count {total_pages} >>'.encode('ascii')
    write_obj(2, pages_body)

    font_body = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    write_obj(font_obj_num, font_body)

    current_obj = first_content_obj
    for index, stream in enumerate(page_streams):
        content_bytes = stream.encode('latin-1')
        content_body = (
            f'<< /Length {len(content_bytes)} >>\n'.encode('ascii') +
            b'stream\n' +
            content_bytes +
            b'\nendstream'
        )
        write_obj(current_obj, content_body)

        page_obj_num = current_obj + 1
        page_body = (
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PDF_PAGE_WIDTH} {PDF_PAGE_HEIGHT}] '
            f'/Resources << /Font << /F1 {font_obj_num} 0 R >> >> /Contents {current_obj} 0 R >>'
        ).encode('ascii')
        write_obj(page_obj_num, page_body)
        current_obj += 2

    xref_offset = buffer.tell()
    total_objects = 3 + (total_pages * 2)
    buffer.write(f'xref\n0 {total_objects + 1}\n'.encode('ascii'))
    buffer.write(b'0000000000 65535 f \n')
    for offset in offsets:
        buffer.write(f'{offset:010d} 00000 n \n'.encode('ascii'))
    buffer.write(f'trailer\n<< /Size {total_objects + 1} /Root 1 0 R >>\n'.encode('ascii'))
    buffer.write(f'startxref\n{xref_offset}\n%%EOF'.encode('ascii'))
    buffer.seek(0)
    return buffer

class StockAlert(db.Model):
    __tablename__ = 'stock_alerts'
    id = db.Column('alert_id', db.Integer, primary_key=True)
    inventory_id = db.Column('inventory_id', db.Integer, db.ForeignKey('inventory.inventory_id'))
    alert_type = db.Column('alert_type', db.String(50))
    message = db.Column('message', db.String(255))
    is_active = db.Column('is_active', db.Boolean, default=True)
    created_at = db.Column('created_at', db.DateTime, default=datetime.utcnow)

    inventory = db.relationship('Inventory', backref='alerts')


# ======= HELPERS INVENTARIO =======
def get_or_create_inventory(product_id, store_id, default_min_stock=None):
    inventory = Inventory.query.filter_by(product_id=product_id, store_id=store_id).first()
    if not inventory:
        inventory = Inventory(product_id=product_id, store_id=store_id, quantity=0)
        if default_min_stock is not None:
            inventory.min_stock = default_min_stock
        db.session.add(inventory)
        db.session.flush()
    return inventory


def update_stock_alerts(inventory):
    active_alert = StockAlert.query.filter_by(inventory_id=inventory.id, is_active=True).first()
    min_stock = inventory.min_stock or 0
    if inventory.quantity <= min_stock:
        message = f"Stock bajo para {inventory.product.name} en {inventory.store.name}"
        if active_alert:
            active_alert.message = message
            active_alert.alert_type = 'LOW_STOCK'
        else:
            alert = StockAlert(
                inventory_id=inventory.id,
                alert_type='LOW_STOCK',
                message=message,
                is_active=True
            )
            db.session.add(alert)
    elif active_alert:
        active_alert.is_active = False


def record_inventory_movement(product_id, store_id, quantity, movement_type, user_id=None, notes=None):
    movement = InventoryMovement(
        product_id=product_id,
        store_id=store_id,
        quantity=quantity,
        movement_type=movement_type,
        performed_by=user_id,
        notes=notes
    )
    db.session.add(movement)
    return movement


def adjust_inventory(
    product_id,
    store_id,
    quantity_delta,
    movement_type,
    user_id=None,
    notes=None,
    default_min_stock=None,
):
    inventory = get_or_create_inventory(product_id, store_id, default_min_stock=default_min_stock)
    new_quantity = (inventory.quantity or 0) + quantity_delta
    if new_quantity < 0:
        raise ValueError('El stock no puede ser negativo')

    inventory.quantity = new_quantity
    record_inventory_movement(
        product_id=product_id,
        store_id=store_id,
        quantity=quantity_delta,
        movement_type=movement_type,
        user_id=user_id,
        notes=notes
    )
    update_stock_alerts(inventory)
    return inventory


def get_or_create_category_by_name(name):
    if not name:
        return None
    normalized = name.strip()
    if not normalized:
        return None
    category = Category.query.filter(func.lower(Category.name) == normalized.lower()).first()
    if not category:
        category = Category(name=normalized)
        db.session.add(category)
        db.session.flush()
    return category


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
    app.config.setdefault('SALES_TAX_RATE', '0.19')

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'login'

    app.register_error_handler(404, page_not_found)

    def ensure_admin_access():
        if current_user.user_type != 1:
            abort(403)

    def ensure_management_access():
        if current_user.user_type not in [1, 2]:
            abort(403)

    def ensure_invoice_edit_permission():
        if current_user.user_type != 1:
            abort(403)

    def get_accessible_store_ids(user=None):
        user = user or current_user
        if not getattr(user, 'is_authenticated', False):
            return []
        if user.user_type == 1:
            return None
        return [access.store_id for access in user.store_access]

    def apply_store_filter(query, column):
        store_ids = get_accessible_store_ids()
        if store_ids is None:
            return query
        if not store_ids:
            return query.filter(column.in_([-1]))
        return query.filter(column.in_(store_ids))

    def apply_store_selection_filter(query, column):
        query = apply_store_filter(query, column)
        store_id = request.args.get('store_id', type=int)
        if store_id:
            ensure_store_permission(store_id)
            query = query.filter(column == store_id)
        return query

    def apply_category_filter(query, column):
        category_id = request.args.get('category_id', type=int)
        if category_id:
            query = query.filter(column == category_id)
        return query

    def resolve_period_range(default_days=0):
        period = request.args.get('period', 'today')
        custom_start = request.args.get('start_date')
        custom_end = request.args.get('end_date')

        today = date.today()
        now = datetime.utcnow()

        def normalize_day_range(target_date):
            return (
                datetime.combine(target_date, datetime.min.time()),
                datetime.combine(target_date, datetime.max.time()),
            )

        if period == 'week':
            end_date = datetime.combine(today, datetime.max.time())
            start_date = end_date - timedelta(days=6)
            prev_end = start_date - timedelta(seconds=1)
            prev_start = prev_end - timedelta(days=6)
        elif period == 'month':
            end_date = datetime.combine(today, datetime.max.time())
            start_date = end_date - timedelta(days=29)
            prev_end = start_date - timedelta(seconds=1)
            prev_start = prev_end - timedelta(days=29)
        elif period == 'quarter':
            end_date = datetime.combine(today, datetime.max.time())
            start_date = end_date - timedelta(days=89)
            prev_end = start_date - timedelta(seconds=1)
            prev_start = prev_end - timedelta(days=89)
        elif period == 'custom' and custom_start and custom_end:
            try:
                start_date = datetime.strptime(custom_start, '%Y-%m-%d')
                start_date = datetime.combine(start_date.date(), datetime.min.time())
                end_date = datetime.strptime(custom_end, '%Y-%m-%d')
                end_date = datetime.combine(end_date.date(), datetime.max.time())
                duration = max((end_date - start_date).days, 1)
                prev_end = start_date - timedelta(seconds=1)
                prev_start = prev_end - timedelta(days=duration)
            except ValueError:
                start_date, end_date = normalize_day_range(today)
                prev_start, prev_end = normalize_day_range(today - timedelta(days=1))
        else:
            reference_date = today if period == 'today' else now.date()
            start_date, end_date = normalize_day_range(reference_date)
            prev_start, prev_end = normalize_day_range(reference_date - timedelta(days=1))

        return start_date, end_date, prev_start, prev_end

    def clamp_range_to_period(start_date, end_date, target_days):
        if target_days <= 0:
            return start_date, end_date
        adjusted_start = end_date - timedelta(days=target_days - 1)
        if adjusted_start < start_date:
            adjusted_start = start_date
        return adjusted_start, end_date

    def apply_date_range_filter(query, column, start_date, end_date):
        return query.filter(column >= start_date, column <= end_date)

    def decimal_to_float(value):
        if value is None:
            return 0.0
        if isinstance(value, Decimal):
            return float(value)
        return float(value)

    def ensure_store_permission(store_id):
        store_ids = get_accessible_store_ids()
        if store_ids is None:
            return
        if store_id not in store_ids:
            abort(403)

    def get_sales_tax_rate():
        value = app.config.get('SALES_TAX_RATE', '0')
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError):
            return Decimal('0')

    def record_invoice_audit(invoice, action, description, metadatas=None):
        metadata_payload = metadatas if metadatas is None else json.loads(json.dumps(metadatas))
        log_entry = InvoiceAuditLog(
            invoice_id=invoice.id,
            user_id=current_user.id,
            action=action,
            description=description[:255] if description else None,
            metadatas=metadata_payload
        )
        db.session.add(log_entry)

    def serialize_audit_log(entry):
        return {
            'id': entry.id,
            'action': entry.action,
            'description': entry.description,
            'metadatas': entry.metadatas,
            'user': entry.user.username if entry.user else None,
            'created_at': entry.created_at.strftime('%Y-%m-%d %H:%M') if entry.created_at else None
        }

    def compute_closing_report(target_date, store_id=None):
        if store_id:
            ensure_store_permission(store_id)
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        common_filters = [
            Invoice.created_at >= start,
            Invoice.created_at <= end,
            Invoice.status != 'void'
        ]

        def base_invoice_query():
            query = Invoice.query.filter(*common_filters)
            query = apply_store_filter(query, Invoice.store_id)
            if store_id:
                query = query.filter(Invoice.store_id == store_id)
            return query

        total_result = base_invoice_query().with_entities(
            func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.total_amount), 0)
        ).one()

        transaction_count = int(total_result[0] or 0)
        total_sales = Decimal(total_result[1] or 0)

        payment_rows = base_invoice_query().with_entities(
            Invoice.payment_method,
            func.coalesce(func.sum(Invoice.total_amount), 0),
            func.count(Invoice.id)
        ).group_by(Invoice.payment_method).all()

        payment_breakdown = [
            {
                'method': row[0] or 'Sin especificar',
                'total': float(row[1] or 0),
                'transactions': int(row[2] or 0)
            }
            for row in payment_rows
        ]

        products_query = db.session.query(
            Product.id,
            Product.name,
            func.coalesce(func.sum(InvoiceItem.quantity), 0),
            func.coalesce(func.sum(InvoiceItem.line_total), 0)
        ).join(InvoiceItem, Product.id == InvoiceItem.product_id) \
         .join(Invoice, Invoice.id == InvoiceItem.invoice_id) \
         .filter(*common_filters)

        products_query = apply_store_filter(products_query, Invoice.store_id)
        if store_id:
            products_query = products_query.filter(Invoice.store_id == store_id)

        products_rows = products_query.group_by(Product.id, Product.name).order_by(Product.name.asc()).all()

        products_sold = [
            {
                'product_id': row[0],
                'product_name': row[1],
                'quantity': int(row[2] or 0),
                'total_amount': float(row[3] or 0)
            }
            for row in products_rows
        ]

        discount_total_query = db.session.query(
            func.coalesce(func.sum(InvoiceItem.discount * InvoiceItem.quantity), 0)
        ).join(Invoice, Invoice.id == InvoiceItem.invoice_id).filter(*common_filters)
        discount_total_query = apply_store_filter(discount_total_query, Invoice.store_id)
        if store_id:
            discount_total_query = discount_total_query.filter(Invoice.store_id == store_id)
        discount_total = Decimal(discount_total_query.scalar() or 0)

        tax_rate = get_sales_tax_rate()
        taxes_collected = (total_sales * tax_rate) if total_sales else Decimal('0')

        store_name = None
        if store_id:
            store = Store.query.get(store_id)
            store_name = store.name if store else None

        return {
            'date': target_date.strftime('%Y-%m-%d'),
            'store_id': store_id,
            'store_name': store_name,
            'total_sales': float(total_sales),
            'transactions': transaction_count,
            'payment_breakdown': payment_breakdown,
            'products_sold': products_sold,
            'tax_rate': float(tax_rate),
            'taxes_collected': float(taxes_collected),
            'discounts_applied': float(discount_total)
        }

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
        ensure_management_access()
        return render_template('inventory.html', username=current_user.username)

    @app.route('/sales')
    @login_required
    def sales():
        ensure_management_access()
        stores_query = Store.query.filter_by(active=True)
        store_ids = get_accessible_store_ids()
        if store_ids is not None:
            stores_query = stores_query.filter(Store.id.in_(store_ids))
        stores = stores_query.order_by(Store.name).all()
        return render_template('sales.html',
                               username=current_user.username,
                               user_type=current_user.user_type,
                               stores=stores,
                               date=date.today().strftime('%Y-%m-%d'))
    @app.route('/reports')
    @login_required
    def reports():
        ensure_management_access()
        stores_query = Store.query.filter_by(active=True)
        store_ids = get_accessible_store_ids()
        if store_ids is not None:
            stores_query = stores_query.filter(Store.id.in_(store_ids))
        stores = stores_query.order_by(Store.name).all()
        categories = Category.query.order_by(Category.name).all()
        return render_template(
            'reports.html',
            username=current_user.username,
            user_type=current_user.user_type,
            stores=stores,
            categories=categories
        )

    @app.route('/manage_users')
    @login_required
    def manage_users():
        ensure_admin_access()
        return render_template('manage_users.html',
                               username=current_user.username,
                               user_type=current_user.user_type)

    def serialize_user_account(user):
        return {
            'id': user.id,
            'username': user.username,
            'user_type': user.user_type,
            'stores': [
                {
                    'id': access.store.id,
                    'name': access.store.name
                }
                for access in user.store_access if access.store
            ]
        }

    @app.route('/api/users', methods=['GET', 'POST'])
    @login_required
    def manage_users_api():
        ensure_admin_access()
        if request.method == 'GET':
            users = User.query.filter(User.user_type.in_([2, 3])).order_by(User.username).all()
            stores = Store.query.filter_by(active=True).order_by(Store.name).all()
            return jsonify({
                'users': [serialize_user_account(user) for user in users],
                'stores': [{'id': store.id, 'name': store.name} for store in stores]
            })

        data = request.get_json(force=True)
        username = (data.get('username') or '').strip()
        password = (data.get('password') or '').strip()
        user_type = data.get('user_type')
        store_ids = data.get('store_ids') or []

        if not username or not password:
            return jsonify({'error': 'El nombre de usuario y la contraseña son obligatorios.'}), 400

        if user_type not in [2, 3]:
            return jsonify({'error': 'Solo se pueden crear usuarios de tipo gerente o auxiliar.'}), 400

        existing = User.query.filter(func.lower(User.username) == username.lower()).first()
        if existing:
            return jsonify({'error': 'El nombre de usuario ya está en uso.'}), 400

        if not isinstance(store_ids, list) or not store_ids:
            return jsonify({'error': 'Debe asignar al menos una sucursal al usuario.'}), 400

        try:
            store_ids = [int(store_id) for store_id in store_ids]
        except (TypeError, ValueError):
            return jsonify({'error': 'Las sucursales proporcionadas no son válidas.'}), 400
        stores = Store.query.filter(Store.id.in_(store_ids)).all()
        if len(stores) != len(set(store_ids)):
            return jsonify({'error': 'Alguna de las sucursales seleccionadas no existe.'}), 400

        user = User(username=username, user_type=user_type)
        user.set_password(password)
        user.store_access = [UserStoreAccess(store=store) for store in stores]

        db.session.add(user)
        db.session.commit()

        return jsonify({'message': 'Usuario creado correctamente.', 'user': serialize_user_account(user)}), 201

    @app.route('/api/users/<int:user_id>', methods=['PUT', 'DELETE'])
    @login_required
    def update_user(user_id):
        ensure_admin_access()
        user = User.query.get_or_404(user_id)

        if user.user_type == 1:
            return jsonify({'error': 'No es posible modificar este usuario.'}), 400

        if request.method == 'DELETE':
            db.session.delete(user)
            db.session.commit()
            return jsonify({'message': 'Usuario eliminado correctamente.'})

        data = request.get_json(force=True)

        username = data.get('username')
        if username is not None:
            username = username.strip()
            if not username:
                return jsonify({'error': 'El nombre de usuario no puede estar vacío.'}), 400
            existing = User.query.filter(func.lower(User.username) == username.lower(), User.id != user.id).first()
            if existing:
                return jsonify({'error': 'El nombre de usuario ya está en uso.'}), 400
            user.username = username

        if 'user_type' in data:
            new_type = data.get('user_type')
            if new_type not in [2, 3]:
                return jsonify({'error': 'Solo se permiten usuarios tipo gerente o auxiliar.'}), 400
            user.user_type = new_type

        password = data.get('password')
        if password:
            user.set_password(password.strip())

        if 'store_ids' in data:
            raw_store_ids = data.get('store_ids') or []
            if not isinstance(raw_store_ids, list) or (user.user_type in [2, 3] and not raw_store_ids):
                return jsonify({'error': 'Debe asignar al menos una sucursal al usuario.'}), 400
            try:
                store_ids = [int(store_id) for store_id in raw_store_ids]
            except (TypeError, ValueError):
                return jsonify({'error': 'Las sucursales proporcionadas no son válidas.'}), 400
            stores = Store.query.filter(Store.id.in_(store_ids)).all()
            if len(stores) != len(set(store_ids)):
                return jsonify({'error': 'Alguna de las sucursales seleccionadas no existe.'}), 400
            user.store_access = [UserStoreAccess(store=store) for store in stores]

        db.session.commit()

        return jsonify({'message': 'Usuario actualizado correctamente.', 'user': serialize_user_account(user)})

    @app.route('/products_clients')
    @login_required
    def products_clients():
        ensure_management_access()
        return render_template(
            'clients.html',
            username=current_user.username,
            user_type=current_user.user_type
        )

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

    # ======= API REPORTES =======
    @app.route('/api/reports/dashboard-overview', methods=['GET'])
    @login_required
    def reports_dashboard_overview():
        ensure_management_access()

        period_start, period_end, prev_period_start, prev_period_end = resolve_period_range()
        category_id = request.args.get('category_id', type=int)

        def sales_total(range_start, range_end):
            query = db.session.query(func.coalesce(func.sum(Sale.total_amount), 0)).select_from(Sale)
            query = query.join(Product, Sale.product_id == Product.id)
            query = apply_store_selection_filter(query, Sale.store_id)
            query = apply_date_range_filter(query, Sale.sale_date, range_start, range_end)
            if category_id:
                query = query.filter(Product.category_id == category_id)
            return query.scalar() or Decimal('0')

        def invoice_totals(range_start, range_end):
            query = db.session.query(
                func.count(func.distinct(Invoice.id)).label('invoice_count'),
                func.coalesce(func.sum(InvoiceItem.line_total), 0).label('amount')
            ).select_from(Invoice) \
             .join(InvoiceItem, InvoiceItem.invoice_id == Invoice.id) \
             .join(Product, InvoiceItem.product_id == Product.id)
            query = apply_store_selection_filter(query, Invoice.store_id)
            query = apply_date_range_filter(query, Invoice.created_at, range_start, range_end)
            if category_id:
                query = query.filter(Product.category_id == category_id)
            result = query.one()
            invoice_count = result.invoice_count or 0
            amount = result.amount or Decimal('0')
            return invoice_count, amount

        daily_start = datetime.combine(period_end.date(), datetime.min.time())
        daily_end = datetime.combine(period_end.date(), datetime.max.time())
        if daily_start < period_start:
            daily_start = period_start
        if daily_end > period_end:
            daily_end = period_end
        prev_daily_start = daily_start - timedelta(days=1)
        prev_daily_end = daily_end - timedelta(days=1)

        weekly_start, weekly_end = clamp_range_to_period(period_start, period_end, 7)
        prev_week_end = weekly_start - timedelta(seconds=1)
        prev_week_start = prev_week_end - timedelta(days=6)

        monthly_start, monthly_end = clamp_range_to_period(period_start, period_end, 30)
        prev_month_end = monthly_start - timedelta(seconds=1)
        prev_month_start = prev_month_end - timedelta(days=29)

        daily_total = sales_total(daily_start, daily_end)
        prev_daily_total = sales_total(prev_daily_start, prev_daily_end)

        weekly_total = sales_total(weekly_start, weekly_end)
        prev_weekly_total = sales_total(prev_week_start, prev_week_end)

        monthly_total = sales_total(monthly_start, monthly_end)
        prev_monthly_total = sales_total(prev_month_start, prev_month_end)

        invoice_count, invoice_amount = invoice_totals(period_start, period_end)
        prev_invoice_count, prev_invoice_amount = invoice_totals(prev_period_start, prev_period_end)

        avg_ticket = (invoice_amount / invoice_count) if invoice_count else Decimal('0')
        prev_avg_ticket = (prev_invoice_amount / prev_invoice_count) if prev_invoice_count else Decimal('0')

        def compute_trend(current_value, previous_value):
            current_float = decimal_to_float(current_value)
            previous_float = decimal_to_float(previous_value)
            if previous_float == 0:
                if current_float == 0:
                    return {'direction': 'flat', 'percentage': 0.0}
                return {'direction': 'up', 'percentage': 100.0}
            change = ((current_float - previous_float) / previous_float) * 100
            direction = 'up' if change > 1 else 'down' if change < -1 else 'flat'
            return {'direction': direction, 'percentage': round(change, 2)}

        kpis = [
            {
                'key': 'daily_revenue',
                'label': 'Facturación diaria',
                'icon': 'fa-cash-register',
                'value': decimal_to_float(daily_total),
                'trend': compute_trend(daily_total, prev_daily_total),
                'tooltip': 'Valor total de ventas registradas durante el último día dentro del periodo seleccionado.'
            },
            {
                'key': 'weekly_revenue',
                'label': 'Facturación semanal',
                'icon': 'fa-calendar-week',
                'value': decimal_to_float(weekly_total),
                'trend': compute_trend(weekly_total, prev_weekly_total),
                'tooltip': 'Ingresos acumulados en los últimos 7 días, ajustados al filtro aplicado.'
            },
            {
                'key': 'monthly_revenue',
                'label': 'Facturación mensual',
                'icon': 'fa-chart-line',
                'value': decimal_to_float(monthly_total),
                'trend': compute_trend(monthly_total, prev_monthly_total),
                'tooltip': 'Ingresos consolidados de los últimos 30 días dentro del rango analizado.'
            },
            {
                'key': 'avg_ticket',
                'label': 'Ticket promedio',
                'icon': 'fa-receipt',
                'value': decimal_to_float(avg_ticket),
                'trend': compute_trend(avg_ticket, prev_avg_ticket),
                'tooltip': 'Valor promedio facturado por comprobante emitido en el periodo.'
            }
        ]

        response = {
            'last_updated': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
            'auto_refresh_interval': 300,
            'period': {
                'start': period_start.isoformat(),
                'end': period_end.isoformat(),
                'previous_start': prev_period_start.isoformat(),
                'previous_end': prev_period_end.isoformat()
            },
            'kpis': kpis
        }

        return jsonify(response)

    @app.route('/api/reports/inventory-insights', methods=['GET'])
    @login_required
    def reports_inventory_insights():
        ensure_management_access()

        category_id = request.args.get('category_id', type=int)

        alert_case = case((func.coalesce(Inventory.quantity, 0) <= func.coalesce(Inventory.min_stock, 0), 1), else_=0)
        base_query = db.session.query(
            Store.id.label('store_id'),
            Store.name.label('store_name'),
            func.coalesce(func.sum(Inventory.quantity), 0).label('units'),
            func.coalesce(func.sum(alert_case), 0).label('alerts')
        ).select_from(Store) \
         .outerjoin(Inventory, Inventory.store_id == Store.id) \
         .outerjoin(Product, Inventory.product_id == Product.id) \
         .outerjoin(Category, Product.category_id == Category.id)

        base_query = apply_store_selection_filter(base_query, Store.id)
        if category_id:
            base_query = base_query.filter(Category.id == category_id)

        base_query = base_query.group_by(Store.id, Store.name).order_by(Store.name)
        store_rows = base_query.all()

        total_units = sum(int(row.units or 0) for row in store_rows)
        total_alerts = sum(int(row.alerts or 0) for row in store_rows)

        detail_query = db.session.query(
            Store.id.label('store_id'),
            Product.id.label('product_id'),
            Product.name.label('product_name'),
            Product.sku.label('sku'),
            Product.color.label('color'),
            Product.size.label('size'),
            Category.name.label('category_name'),
            func.coalesce(Inventory.quantity, 0).label('quantity'),
            func.coalesce(Inventory.min_stock, 0).label('min_stock')
        ).select_from(Inventory) \
         .join(Store, Inventory.store_id == Store.id) \
         .join(Product, Inventory.product_id == Product.id) \
         .outerjoin(Category, Product.category_id == Category.id)

        detail_query = apply_store_selection_filter(detail_query, Inventory.store_id)
        if category_id:
            detail_query = detail_query.filter(Category.id == category_id)

        detail_rows = detail_query.order_by(Store.name, func.lower(Product.name)).all()

        store_details = defaultdict(list)
        for row in detail_rows:
            store_details[row.store_id].append({
                'product_id': row.product_id,
                'product_name': row.product_name,
                'sku': row.sku,
                'color': row.color,
                'size': row.size,
                'category_name': row.category_name or 'Sin categoría',
                'quantity': int(row.quantity or 0),
                'min_stock': int(row.min_stock or 0),
                'is_alert': int(row.quantity or 0) <= int(row.min_stock or 0)
            })

        response = {
            'last_updated': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
            'totals': {
                'units': total_units,
                'alerts': total_alerts,
                'alert_rate': round((total_alerts / total_units) * 100, 2) if total_units else 0
            },
            'stores': [
                {
                    'store_id': row.store_id,
                    'store_name': row.store_name,
                    'units': int(row.units or 0),
                    'alerts': int(row.alerts or 0),
                    'alert_rate': round((int(row.alerts or 0) / int(row.units or 1)) * 100, 2) if int(row.units or 0) else 0,
                    'products': store_details.get(row.store_id, [])
                }
                for row in store_rows
            ]
        }

        return jsonify(response)

    @app.route('/api/reports/top-products-insights', methods=['GET'])
    @login_required
    def reports_top_products_insights():
        ensure_management_access()

        metric = request.args.get('metric', 'units')
        period_start, period_end, prev_start, prev_end = resolve_period_range()
        category_id = request.args.get('category_id', type=int)

        def build_sales_query(range_start, range_end):
            query = db.session.query(
                Product.id.label('product_id'),
                Product.name.label('product_name'),
                func.coalesce(func.sum(Sale.quantity), 0).label('units'),
                func.coalesce(func.sum(Sale.total_amount), 0).label('revenue')
            ).select_from(Sale) \
             .join(Product, Sale.product_id == Product.id)
            query = apply_store_selection_filter(query, Sale.store_id)
            query = apply_date_range_filter(query, Sale.sale_date, range_start, range_end)
            if category_id:
                query = query.filter(Product.category_id == category_id)
            return query.group_by(Product.id, Product.name)

        current_rows = build_sales_query(period_start, period_end).all()
        previous_rows = build_sales_query(prev_start, prev_end).all()

        previous_map = {row.product_id: row for row in previous_rows}

        if metric not in {'units', 'revenue'}:
            metric = 'units'

        sorted_rows = sorted(
            current_rows,
            key=lambda row: (row.revenue if metric == 'revenue' else row.units),
            reverse=True
        )

        top_rows = sorted_rows[:10]
        total_units = sum(int(row.units or 0) for row in current_rows)
        total_revenue = sum(decimal_to_float(row.revenue or 0) for row in current_rows)

        sale_day = cast(Sale.sale_date, Date).label('sale_day')
        history_query = db.session.query(
            Sale.product_id,
            sale_day,
            func.coalesce(func.sum(Sale.quantity), 0).label('units'),
            func.coalesce(func.sum(Sale.total_amount), 0).label('revenue')
        ).select_from(Sale) \
         .join(Product, Sale.product_id == Product.id)
        history_query = apply_store_selection_filter(history_query, Sale.store_id)
        history_query = apply_date_range_filter(history_query, Sale.sale_date, period_start, period_end)
        if category_id:
            history_query = history_query.filter(Product.category_id == category_id)
        history_query = history_query.group_by(Sale.product_id, sale_day)
        history_rows = history_query.all()

        history_map = defaultdict(list)
        for row in history_rows:
            day_value = row.sale_day
            day_label = day_value.isoformat() if hasattr(day_value, 'isoformat') else str(day_value)
            history_map[row.product_id].append({
                'date': day_label,
                'units': int(row.units or 0),
                'revenue': decimal_to_float(row.revenue or 0)
            })

        response = {
            'metric': metric,
            'totals': {
                'units': total_units,
                'revenue': total_revenue
            },
            'products': [],
            'distribution': {
                'labels': [],
                'values': []
            }
        }

        for row in top_rows:
            previous_row = previous_map.get(row.product_id)
            previous_metric_value = 0
            current_metric_value = decimal_to_float(row.revenue) if metric == 'revenue' else int(row.units or 0)
            if previous_row:
                previous_metric_value = decimal_to_float(previous_row.revenue) if metric == 'revenue' else int(previous_row.units or 0)
            trend = 0.0
            if previous_metric_value:
                trend = round(((current_metric_value - previous_metric_value) / previous_metric_value) * 100, 2)
            elif current_metric_value:
                trend = 100.0

            response['products'].append({
                'product_id': row.product_id,
                'product_name': row.product_name,
                'units': int(row.units or 0),
                'revenue': decimal_to_float(row.revenue or 0),
                'history': history_map.get(row.product_id, []),
                'trend_percentage': trend
            })
            response['distribution']['labels'].append(row.product_name)
            response['distribution']['values'].append(decimal_to_float(row.revenue or 0))

        return jsonify(response)

    @app.route('/api/reports/financial-advanced', methods=['GET'])
    @login_required
    def reports_financial_advanced():
        ensure_management_access()

        period_start, period_end, prev_start, prev_end = resolve_period_range()
        category_id = request.args.get('category_id', type=int)
        margin_ratio = Decimal('0.35')

        base_invoice_query = db.session.query(
            Invoice.id.label('invoice_id'),
            Invoice.customer_id.label('customer_id'),
            Invoice.created_at.label('created_at'),
            func.coalesce(func.sum(InvoiceItem.line_total), 0).label('amount')
        ).select_from(Invoice) \
         .join(InvoiceItem, InvoiceItem.invoice_id == Invoice.id) \
         .join(Product, InvoiceItem.product_id == Product.id)

        base_invoice_query = apply_store_selection_filter(base_invoice_query, Invoice.store_id)
        if category_id:
            base_invoice_query = base_invoice_query.filter(Product.category_id == category_id)

        current_invoices = base_invoice_query \
            .filter(Invoice.created_at >= period_start, Invoice.created_at <= period_end) \
            .group_by(Invoice.id, Invoice.customer_id, Invoice.created_at) \
            .all()

        previous_invoices = base_invoice_query \
            .filter(Invoice.created_at >= prev_start, Invoice.created_at <= prev_end) \
            .group_by(Invoice.id, Invoice.customer_id, Invoice.created_at) \
            .all()

        def aggregate_invoices(rows):
            total_amount = Decimal('0')
            unique_customers = set()
            invoices_per_customer = defaultdict(list)
            daily_totals = defaultdict(lambda: Decimal('0'))
            for row in rows:
                total_amount += row.amount or Decimal('0')
                if row.customer_id:
                    unique_customers.add(row.customer_id)
                    invoices_per_customer[row.customer_id].append(row)
                day = row.created_at.date()
                daily_totals[day] += row.amount or Decimal('0')
            return total_amount, unique_customers, invoices_per_customer, daily_totals

        current_total, current_customers, current_invoices_map, current_daily = aggregate_invoices(current_invoices)
        previous_total, _, _, _ = aggregate_invoices(previous_invoices)

        avg_ticket = (current_total / len(current_invoices)) if current_invoices else Decimal('0')
        prev_avg_ticket = (previous_total / len(previous_invoices)) if previous_invoices else Decimal('0')

        margin_current = current_total * margin_ratio
        margin_previous = previous_total * margin_ratio

        customer_history_query = base_invoice_query \
            .group_by(Invoice.id, Invoice.customer_id, Invoice.created_at)
        customer_history_rows = customer_history_query.all()

        customer_first_purchase = {}
        for row in customer_history_rows:
            if row.customer_id is None:
                continue
            first_purchase = customer_first_purchase.get(row.customer_id)
            if not first_purchase or row.created_at < first_purchase:
                customer_first_purchase[row.customer_id] = row.created_at

        new_customers = 0
        recurring_customers = 0
        new_revenue = Decimal('0')
        recurring_revenue = Decimal('0')

        for customer_id, invoices in current_invoices_map.items():
            first_purchase = customer_first_purchase.get(customer_id)
            customer_amount = sum((invoice.amount or Decimal('0')) for invoice in invoices)
            if first_purchase and first_purchase >= period_start:
                new_customers += 1
                new_revenue += customer_amount
            else:
                recurring_customers += 1
                recurring_revenue += customer_amount

        def compute_change(current_value, previous_value):
            current_float = decimal_to_float(current_value)
            previous_float = decimal_to_float(previous_value)
            if previous_float == 0:
                if current_float == 0:
                    return 0.0
                return 100.0
            return round(((current_float - previous_float) / previous_float) * 100, 2)

        def resolve_status(change):
            if change >= 5:
                return 'success'
            if change <= -5:
                return 'danger'
            return 'warning'

        def build_sparkline(daily_map):
            monthly_totals = defaultdict(lambda: Decimal('0'))
            for day, value in daily_map.items():
                month_key = day.replace(day=1)
                monthly_totals[month_key] += value
            series = []
            for month in sorted(monthly_totals.keys()):
                label = month.strftime('%b %Y')
                series.append({'label': label, 'value': decimal_to_float(monthly_totals[month])})
            return series[-12:]

        revenue_change = compute_change(current_total, previous_total)
        margin_change = compute_change(margin_current, margin_previous)
        ticket_change = compute_change(avg_ticket, prev_avg_ticket)

        indicators = [
            {
                'label': 'Ingresos netos',
                'value': decimal_to_float(current_total),
                'change_percentage': revenue_change,
                'status': resolve_status(revenue_change),
                'sparkline': build_sparkline(current_daily)
            },
            {
                'label': 'Margen estimado',
                'value': decimal_to_float(margin_current),
                'change_percentage': margin_change,
                'status': resolve_status(margin_change),
                'sparkline': build_sparkline({day: amount * margin_ratio for day, amount in current_daily.items()})
            },
            {
                'label': 'Ticket promedio',
                'value': decimal_to_float(avg_ticket),
                'change_percentage': ticket_change,
                'status': resolve_status(ticket_change),
                'sparkline': build_sparkline(current_daily)
            }
        ]

        total_customers = len(current_customers)
        breakdown_total = max(total_customers, 1)

        response = {
            'indicators': indicators,
            'customers': {
                'new': {
                    'count': new_customers,
                    'revenue': decimal_to_float(new_revenue),
                    'percentage': round((new_customers / breakdown_total) * 100, 2)
                },
                'recurring': {
                    'count': recurring_customers,
                    'revenue': decimal_to_float(recurring_revenue),
                    'percentage': round((recurring_customers / breakdown_total) * 100, 2)
                }
            },
            'totals': {
                'invoices': len(current_invoices),
                'customers': total_customers,
                'revenue': decimal_to_float(current_total)
            }
        }

        return jsonify(response)

    @app.route('/api/reports/sales-heatmap', methods=['GET'])
    @login_required
    def reports_sales_heatmap():
        ensure_management_access()

        period_start, period_end, _, _ = resolve_period_range()
        category_id = request.args.get('category_id', type=int)

        sales_query = db.session.query(
            Sale.store_id,
            Sale.sale_date,
            func.coalesce(Sale.total_amount, 0).label('amount')
        ).select_from(Sale) \
         .join(Product, Sale.product_id == Product.id)

        sales_query = apply_store_selection_filter(sales_query, Sale.store_id)
        sales_query = apply_date_range_filter(sales_query, Sale.sale_date, period_start, period_end)
        if category_id:
            sales_query = sales_query.filter(Product.category_id == category_id)

        sales_rows = sales_query.all()

        heatmap = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
        totals_per_store = defaultdict(float)

        for row in sales_rows:
            sale_date = row.sale_date
            if not sale_date:
                continue
            weekday = sale_date.weekday()
            hour = sale_date.hour
            amount = decimal_to_float(row.amount or 0)
            heatmap[row.store_id][weekday][hour] += amount
            totals_per_store[row.store_id] += amount

        day_labels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
        hour_labels = [f'{str(hour).zfill(2)}:00' for hour in range(24)]

        series = []
        peak_windows = []

        for store_id, days in heatmap.items():
            store_series = []
            for day_index, day_label in enumerate(day_labels):
                data_points = []
                for hour_index in range(24):
                    amount = round(days.get(day_index, {}).get(hour_index, 0.0), 2)
                    data_points.append({'x': hour_labels[hour_index], 'y': amount})
                    if amount:
                        peak_windows.append({
                            'store_id': store_id,
                            'day': day_label,
                            'hour': hour_labels[hour_index],
                            'amount': amount
                        })
                store_series.append({
                    'name': day_label,
                    'data': data_points
                })
            series.append({
                'store_id': store_id,
                'series': store_series
            })

        peak_windows = sorted(peak_windows, key=lambda item: item['amount'], reverse=True)[:10]

        store_ids = list(heatmap.keys())
        stores_info = {}
        if store_ids:
            stores = Store.query.filter(Store.id.in_(store_ids)).all()
            stores_info = {store.id: store.name for store in stores}

        response = {
            'days': day_labels,
            'hours': hour_labels,
            'series': series,
            'peaks': peak_windows,
            'store_totals': [
                {
                    'store_id': store_id,
                    'store_name': stores_info.get(store_id, 'Sucursal'),
                    'amount': round(total, 2)
                }
                for store_id, total in totals_per_store.items()
            ]
        }

        return jsonify(response)

    @app.route('/api/reports/category-analysis', methods=['GET'])
    @login_required
    def reports_category_analysis():
        ensure_management_access()

        period_start, period_end, _, _ = resolve_period_range()
        category_id = request.args.get('category_id', type=int)

        sales_query = db.session.query(
            Category.id.label('category_id'),
            Category.name.label('category_name'),
            func.coalesce(func.sum(Sale.quantity), 0).label('units'),
            func.coalesce(func.sum(Sale.total_amount), 0).label('revenue')
        ).select_from(Sale) \
         .join(Product, Sale.product_id == Product.id) \
         .outerjoin(Category, Product.category_id == Category.id)

        sales_query = apply_store_selection_filter(sales_query, Sale.store_id)
        sales_query = apply_date_range_filter(sales_query, Sale.sale_date, period_start, period_end)
        if category_id:
            sales_query = sales_query.filter(Category.id == category_id)

        sales_query = sales_query.group_by(Category.id, Category.name)
        sales_rows = sales_query.all()

        inventory_query = db.session.query(
            Category.id.label('category_id'),
            func.coalesce(func.sum(Inventory.quantity), 0).label('inventory_units'),
            func.coalesce(func.sum(Inventory.min_stock), 0).label('inventory_min')
        ).select_from(Inventory) \
         .join(Product, Inventory.product_id == Product.id) \
         .outerjoin(Category, Product.category_id == Category.id)

        inventory_query = apply_store_selection_filter(inventory_query, Inventory.store_id)
        if category_id:
            inventory_query = inventory_query.filter(Category.id == category_id)
        inventory_query = inventory_query.group_by(Category.id)
        inventory_rows = inventory_query.all()
        inventory_map = {row.category_id: row for row in inventory_rows}

        margin_ratio = Decimal('0.35')

        composition = []
        rotation = []
        margins = []

        total_revenue = 0.0
        total_units = 0

        for row in sales_rows:
            category_key = row.category_id or 0
            category_name = row.category_name or 'Sin categoría'
            revenue = decimal_to_float(row.revenue or 0)
            units = int(row.units or 0)
            total_revenue += revenue
            total_units += units

            inventory_row = inventory_map.get(row.category_id)
            inventory_units = int(inventory_row.inventory_units or 0) if inventory_row else 0
            inventory_min = int(inventory_row.inventory_min or 0) if inventory_row else 0
            turnover = round(units / inventory_units, 2) if inventory_units else 0
            margin_value = round(revenue * float(margin_ratio), 2)

            composition.append({
                'x': category_name,
                'y': round(revenue, 2)
            })
            rotation.append({
                'category_id': category_key,
                'category_name': category_name,
                'units_sold': units,
                'inventory_units': inventory_units,
                'turnover': turnover,
                'min_stock': inventory_min
            })
            margins.append({
                'category_id': category_key,
                'category_name': category_name,
                'margin': margin_value
            })

        sale_day = cast(Sale.sale_date, Date).label('sale_day')
        seasonality_query = db.session.query(
            Category.id.label('category_id'),
            sale_day,
            func.coalesce(func.sum(Sale.total_amount), 0).label('revenue')
        ).select_from(Sale) \
         .join(Product, Sale.product_id == Product.id) \
         .outerjoin(Category, Product.category_id == Category.id)

        seasonality_query = seasonality_query.group_by(Category.id, sale_day)
        seasonality_query = apply_date_range_filter(seasonality_query, Sale.sale_date, period_start - timedelta(days=365), period_end)
        if category_id:
            seasonality_query = seasonality_query.filter(Category.id == category_id)
        seasonality_query = seasonality_query.group_by(Category.id, sale_day)
        seasonality_rows = seasonality_query.all()

        seasonality_map = defaultdict(lambda: defaultdict(float))
        for row in seasonality_rows:
            cat_key = row.category_id or 0
            day_value = row.sale_day
            if hasattr(day_value, 'strftime'):
                month_key = datetime(day_value.year, day_value.month, 1)
            else:
                parsed = datetime.strptime(str(day_value), '%Y-%m-%d')
                month_key = datetime(parsed.year, parsed.month, 1)
            seasonality_map[cat_key][month_key] += decimal_to_float(row.revenue or 0)

        seasonality_series = []
        all_months = set()
        for month_dict in seasonality_map.values():
            all_months.update(month_dict.keys())

        month_axis = sorted(all_months)
        month_labels = [month.strftime('%b %Y') for month in month_axis]

        for row in sales_rows:
            category_key = row.category_id or 0
            category_name = row.category_name or 'Sin categoría'
            category_months = seasonality_map.get(category_key, {})
            series_data = [round(category_months.get(month, 0.0), 2) for month in month_axis]
            seasonality_series.append({
                'name': category_name,
                'data': series_data
            })

        response = {
            'composition': composition,
            'rotation': rotation,
            'margins': margins,
            'seasonality': {
                'labels': month_labels[-12:],
                'series': [
                    {
                        'name': item['name'],
                        'data': item['data'][-12:]
                    }
                    for item in seasonality_series
                ]
            },
            'totals': {
                'revenue': round(total_revenue, 2),
                'units': total_units
            }
        }

        return jsonify(response)

    # ======= API INVENTARIO =======
    @app.route('/api/inventory/overview', methods=['GET'])
    @login_required
    def inventory_overview():
        inventory_query = db.session.query(
            Inventory.id.label('inventory_id'),
            Inventory.quantity,
            Inventory.min_stock,
            Product.id.label('product_id'),
            Product.name.label('product_name'),
            Product.sku,
            Product.size,
            Product.color,
            Product.price,
            Category.name.label('category_name'),
            Store.id.label('store_id'),
            Store.name.label('store_name'),
            Store.location
        ).join(Product, Inventory.product_id == Product.id) \
         .join(Store, Inventory.store_id == Store.id) \
         .outerjoin(Category, Product.category_id == Category.id) \
         .order_by(Store.name, Product.name)

        inventory_query = apply_store_filter(inventory_query, Store.id)
        inventory_rows = inventory_query.all()

        items = []
        total_units = 0
        low_stock_count = 0
        sizes = set()
        colors = set()
        categories = set()

        product_min_stock = {}

        for row in inventory_rows:
            total_units += int(row.quantity or 0)
            min_stock = row.min_stock or 0
            is_low = (row.quantity or 0) <= min_stock
            if is_low:
                low_stock_count += 1

            if row.product_id not in product_min_stock:
                product_min_stock[row.product_id] = int(min_stock)
            else:
                product_min_stock[row.product_id] = min(product_min_stock[row.product_id], int(min_stock))

            if row.size:
                sizes.add(row.size)
            if row.color:
                colors.add(row.color)
            if row.category_name:
                categories.add(row.category_name)

            items.append({
                'inventory_id': row.inventory_id,
                'product_id': row.product_id,
                'product_name': row.product_name,
                'sku': row.sku,
                'size': row.size,
                'color': row.color,
                'category': row.category_name,
                'store_id': row.store_id,
                'store_name': row.store_name,
                'location': row.location,
                'quantity': int(row.quantity or 0),
                'min_stock': int(row.min_stock or 0),
                'low_stock': is_low
            })

        active_alerts_query = db.session.query(func.count(StockAlert.id)).join(
            Inventory, StockAlert.inventory_id == Inventory.id
        ).filter(StockAlert.is_active ==True)
        active_alerts_query = apply_store_filter(active_alerts_query, Inventory.store_id)
        active_alerts = active_alerts_query.scalar() or 0

        transfers_query = db.session.query(func.count(TransferRequest.id)).filter(
            TransferRequest.status.in_(['pending', 'approved'])
        )
        store_ids = get_accessible_store_ids()
        if store_ids is not None:
            transfers_query = transfers_query.filter(
                or_(
                    TransferRequest.source_store_id.in_(store_ids),
                    TransferRequest.target_store_id.in_(store_ids)
                )
            )
        pending_transfers = transfers_query.scalar() or 0

        stores_query = Store.query.filter_by(active=True)
        if store_ids is not None:
            stores_query = stores_query.filter(Store.id.in_(store_ids))
        stores = stores_query.order_by(Store.name).all()
        products = Product.query.order_by(Product.name).all()

        return jsonify({
            'summary': {
                'total_items': len(items),
                'total_units': total_units,
                'low_stock': low_stock_count,
                'pending_transfers': pending_transfers,
                'active_alerts': active_alerts
            },
            'classifiers': {
                'sizes': sorted(sizes),
                'colors': sorted(colors),
                'categories': sorted(categories)
            },
            'items': items,
            'stores': [
                {'id': store.id, 'name': store.name, 'location': store.location}
                for store in stores
            ],
            'products': [
                {
                    'id': product.id,
                    'name': product.name,
                    'sku': product.sku,
                    'size': product.size,
                    'color': product.color,
                    'category': product.category.name if product.category else None,
                    'price': float(product.price) if product.price is not None else None,
                    'min_stock': product_min_stock.get(product.id)
                }
                for product in products
            ]
        })

    @app.route('/api/inventory/alerts', methods=['GET'])
    @login_required
    def inventory_alerts():
        alerts_query = db.session.query(
            StockAlert,
            Inventory.quantity,
            Inventory.min_stock,
            Product.name.label('product_name'),
            Product.sku,
            Store.name.label('store_name')
        ).join(Inventory, StockAlert.inventory_id == Inventory.id) \
         .join(Product, Inventory.product_id == Product.id) \
         .join(Store, Inventory.store_id == Store.id) \
         .filter(StockAlert.is_active == True) \
         .order_by(StockAlert.created_at.desc())

        alerts_query = apply_store_filter(alerts_query, Store.id)
        alerts = alerts_query.all()

        return jsonify([
            {
                'id': alert.StockAlert.id,
                'product_name': alert.product_name,
                'sku': alert.sku,
                'store_name': alert.store_name,
                'quantity': int(alert.quantity or 0),
                'min_stock': int(alert.min_stock or 0),
                'message': alert.StockAlert.message,
                'alert_type': alert.StockAlert.alert_type,
                'created_at': alert.StockAlert.created_at.strftime('%Y-%m-%d %H:%M')
            }
            for alert in alerts
        ])

    @app.route('/api/inventory/movements', methods=['GET', 'POST'])
    @login_required
    def inventory_movements():
        if request.method == 'GET':
            movements_query = db.session.query(
                InventoryMovement,
                Product.name.label('product_name'),
                Store.name.label('store_name'),
                User.username.label('user_name')
            ).join(Product, InventoryMovement.product_id == Product.id) \
             .join(Store, InventoryMovement.store_id == Store.id) \
             .outerjoin(User, InventoryMovement.performed_by == User.id) \
             .order_by(InventoryMovement.created_at.desc())

            movements_query = apply_store_filter(movements_query, InventoryMovement.store_id)
            movements = movements_query.limit(50).all()

            return jsonify([
                {
                    'id': movement.InventoryMovement.id,
                    'product_name': movement.product_name,
                    'store_name': movement.store_name,
                    'quantity': abs(int(movement.InventoryMovement.quantity)),
                    'movement_type': movement.InventoryMovement.movement_type,
                    'notes': movement.InventoryMovement.notes,
                    'performed_by': movement.user_name,
                    'created_at': movement.InventoryMovement.created_at.strftime('%Y-%m-%d %H:%M')
                }
                for movement in movements
            ])

        if current_user.user_type not in [1, 2]:
            return jsonify({'error': 'No autorizado'}), 403

        data = request.get_json() or {}
        product_id = data.get('product_id')
        store_id = data.get('store_id')
        quantity = data.get('quantity')
        movement_type = data.get('movement_type')
        notes = data.get('notes')
        new_product_payload = data.get('new_product') if isinstance(data.get('new_product'), dict) else None

        is_new_product = bool(new_product_payload)

        if not store_id or not quantity or not movement_type:
            return jsonify({'error': 'Información incompleta para registrar el movimiento'}), 400

        if not is_new_product and not product_id:
            return jsonify({'error': 'Debe seleccionar un producto existente'}), 400

        if is_new_product:
            new_product_payload = {key: (value or '').strip() if isinstance(value, str) else value for key, value in new_product_payload.items()}
            new_product_name = new_product_payload.get('name', '')
            new_product_sku = new_product_payload.get('sku', '')
            if not new_product_name or not new_product_sku:
                return jsonify({'error': 'El nombre y el SKU del nuevo producto son obligatorios'}), 400

        try:
            store_id = int(store_id)
            quantity = int(quantity)
        except (TypeError, ValueError):
            return jsonify({'error': 'La cantidad debe ser un número entero'}), 400

        ensure_store_permission(store_id)

        if quantity <= 0:
            return jsonify({'error': 'La cantidad debe ser mayor a cero'}), 400

        movement_type = movement_type.lower()
        if movement_type not in ['entry', 'exit']:
            return jsonify({'error': 'Tipo de movimiento no soportado'}), 400

        if is_new_product and movement_type != 'entry':
            return jsonify({'error': 'Los nuevos productos solo pueden registrarse como entradas'}), 400

        new_product_min_stock = None
        if is_new_product:
            try:
                new_product_min_stock = new_product_payload.get('min_stock')
                if new_product_min_stock in (None, ''):
                    return jsonify({'error': 'Debe definir un stock mínimo para el nuevo producto'}), 400
                new_product_min_stock = int(new_product_min_stock)
                if new_product_min_stock < 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({'error': 'El stock mínimo del nuevo producto debe ser un número entero mayor o igual a cero'}), 400

            price_value = new_product_payload.get('price')
            product_price = None
            if price_value not in (None, ''):
                try:
                    product_price = Decimal(str(price_value))
                    if product_price < 0:
                        raise InvalidOperation
                except (InvalidOperation, ValueError):
                    return jsonify({'error': 'El precio debe ser un número positivo'}), 400

            category = get_or_create_category_by_name(new_product_payload.get('category'))

            product = Product(
                name=new_product_payload.get('name'),
                sku=new_product_payload.get('sku'),
                size=new_product_payload.get('size') or None,
                color=new_product_payload.get('color') or None,
                price=product_price,
                category=category,
            )
            db.session.add(product)
            try:
                db.session.flush()
            except IntegrityError:
                db.session.rollback()
                return jsonify({'error': 'El SKU proporcionado ya está registrado en otro producto'}), 400

            product_id = product.id

        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'El producto seleccionado no existe'}), 404

        quantity_delta = quantity if movement_type == 'entry' else -quantity

        if movement_type == 'exit':
            inventory_check = Inventory.query.filter_by(product_id=product_id, store_id=store_id).first()
            if not inventory_check:
                return jsonify({'error': 'El producto no tiene existencias registradas en la sucursal seleccionada'}), 400

        try:
            inventory = adjust_inventory(
                product_id=product_id,
                store_id=store_id,
                quantity_delta=quantity_delta,
                movement_type='entry' if quantity_delta > 0 else 'exit',
                user_id=current_user.id,
                notes=notes,
                default_min_stock=new_product_min_stock
            )
            db.session.commit()
        except ValueError as exc:
            db.session.rollback()
            return jsonify({'error': str(exc)}), 400
        except IntegrityError as exc:
            current_app.logger.exception("Error al ajustar inventario: %s", exc)
            db.session.rollback()
            return jsonify({'error': 'No fue posible registrar el movimiento'}), 400

        return jsonify({
            'success': True,
            'inventory': {
                'inventory_id': inventory.id,
                'quantity': int(inventory.quantity),
                'min_stock': int(inventory.min_stock or 0)
            },
            'product_id': product_id
        })

    @app.route('/api/inventory/products/<int:product_id>', methods=['PUT'])
    @login_required
    def update_inventory_product(product_id):
        ensure_admin_access()
        data = request.get_json() or {}

        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Producto no encontrado'}), 404

        name = (data.get('name') or '').strip()
        sku = (data.get('sku') or '').strip()
        size = (data.get('size') or '').strip()
        color = (data.get('color') or '').strip()
        category_name = (data.get('category') or '').strip()
        price_value = data.get('price')
        min_stock_value = data.get('min_stock')

        if not name or not sku:
            return jsonify({'error': 'El nombre y el SKU son obligatorios'}), 400

        if price_value not in (None, ''):
            try:
                price_decimal = Decimal(str(price_value))
                if price_decimal < 0:
                    raise InvalidOperation
            except (InvalidOperation, ValueError):
                return jsonify({'error': 'El precio debe ser un número positivo'}), 400
        else:
            price_decimal = None

        if min_stock_value not in (None, ''):
            try:
                min_stock_int = int(min_stock_value)
                if min_stock_int < 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({'error': 'El stock mínimo debe ser un número entero mayor o igual a cero'}), 400
        else:
            min_stock_int = None

        existing_sku = (
            Product.query.filter(Product.sku == sku, Product.id != product.id)
            .with_entities(Product.id)
            .first()
        )
        if existing_sku:
            return jsonify({'error': 'El SKU ingresado ya está asociado a otro producto'}), 400

        category = get_or_create_category_by_name(category_name)

        product.name = name
        product.sku = sku
        product.size = size or None
        product.color = color or None
        product.price = price_decimal
        product.category = category

        try:
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            return jsonify({'error': 'No fue posible actualizar el producto'}), 400

        inventories_updated = []
        if min_stock_int is not None:
            inventory_items = Inventory.query.filter_by(product_id=product.id).all()
            for inventory_item in inventory_items:
                inventory_item.min_stock = min_stock_int
                update_stock_alerts(inventory_item)
                inventories_updated.append(
                    {
                        'inventory_id': inventory_item.id,
                        'store_id': inventory_item.store_id,
                        'min_stock': int(inventory_item.min_stock or 0)
                    }
                )

        db.session.commit()

        return jsonify({
            'success': True,
            'product': {
                'id': product.id,
                'name': product.name,
                'sku': product.sku,
                'size': product.size,
                'color': product.color,
                'category': product.category.name if product.category else None,
                'price': float(product.price) if product.price is not None else None
            },
            'inventories': inventories_updated,
            'min_stock': min_stock_int
        })

    @app.route('/api/inventory/transfers', methods=['GET', 'POST'])
    @login_required
    def inventory_transfers():
        if request.method == 'GET':
            target_store = aliased(Store)
            approver_user = aliased(User)
            confirmer_user = aliased(User)

            transfers_query = db.session.query(
                TransferRequest,
                Product.name.label('product_name'),
                Product.sku,
                Store.name.label('source_store'),
                Store.location.label('source_location'),
                target_store.name.label('target_store'),
                target_store.location.label('target_location'),
                User.username.label('requester_name'),
                approver_user.username.label('approver_name'),
                confirmer_user.username.label('confirmer_name')
            ).join(Product, TransferRequest.product_id == Product.id) \
             .join(Store, TransferRequest.source_store_id == Store.id) \
             .join(target_store, TransferRequest.target_store_id == target_store.id) \
             .outerjoin(User, TransferRequest.requested_by == User.id) \
             .outerjoin(approver_user, TransferRequest.approved_by == approver_user.id) \
             .outerjoin(confirmer_user, TransferRequest.confirmed_by == confirmer_user.id) \
             .order_by(TransferRequest.requested_at.desc())

            store_ids = get_accessible_store_ids()
            if store_ids is not None:
                transfers_query = transfers_query.filter(
                    or_(
                        TransferRequest.source_store_id.in_(store_ids),
                        TransferRequest.target_store_id.in_(store_ids)
                    )
                )

            transfers = transfers_query.all()

            status_labels = {
                'pending': 'Pendiente de aprobación',
                'approved': 'Aprobada / En tránsito',
                'completed': 'Recibida',
                'rejected': 'Rechazada'
            }

            accessible_ids = None if store_ids is None else set(store_ids)

            return jsonify([
                {
                    'id': transfer.TransferRequest.id,
                    'product_name': transfer.product_name,
                    'sku': transfer.sku,
                    'quantity': int(transfer.TransferRequest.quantity),
                    'status': transfer.TransferRequest.status,
                    'status_label': status_labels.get(transfer.TransferRequest.status, transfer.TransferRequest.status.title()),
                    'source_store': transfer.source_store,
                    'source_location': transfer.source_location,
                    'target_store': transfer.target_store,
                    'target_location': transfer.target_location,
                    'requested_at': transfer.TransferRequest.requested_at.strftime('%Y-%m-%d %H:%M'),
                    'approved_at': transfer.TransferRequest.approved_at.strftime('%Y-%m-%d %H:%M') if transfer.TransferRequest.approved_at else None,
                    'confirmed_at': transfer.TransferRequest.confirmed_at.strftime('%Y-%m-%d %H:%M') if transfer.TransferRequest.confirmed_at else None,
                    'requested_by': transfer.requester_name,
                    'approved_by': transfer.approver_name,
                    'confirmed_by': transfer.confirmer_name,
                    'notes': transfer.TransferRequest.notes,
                    'can_approve': (
                        current_user.user_type in [1, 2]
                        and transfer.TransferRequest.status == 'pending'
                        and (accessible_ids is None or transfer.TransferRequest.source_store_id in accessible_ids)
                    ),
                    'can_confirm': (
                        current_user.user_type in [1, 2]
                        and transfer.TransferRequest.status == 'approved'
                        and (accessible_ids is None or transfer.TransferRequest.target_store_id in accessible_ids)
                    )
                }
                for transfer in transfers
            ])

        data = request.get_json() or {}
        product_id = data.get('product_id')
        source_store_id = data.get('source_store_id')
        target_store_id = data.get('target_store_id')
        quantity = data.get('quantity')
        notes = data.get('notes')

        if not all([product_id, source_store_id, target_store_id, quantity]):
            return jsonify({'error': 'Debe completar todos los campos obligatorios'}), 400

        try:
            product_id = int(product_id)
            source_store_id = int(source_store_id)
            target_store_id = int(target_store_id)
            quantity = int(quantity)
        except (TypeError, ValueError):
            return jsonify({'error': 'Los identificadores y la cantidad deben ser números enteros válidos'}), 400

        if source_store_id == target_store_id:
            return jsonify({'error': 'La sucursal de origen y destino deben ser diferentes'}), 400

        if quantity <= 0:
            return jsonify({'error': 'La cantidad debe ser mayor a cero'}), 400

        ensure_store_permission(source_store_id)
        ensure_store_permission(target_store_id)

        transfer = TransferRequest(
            product_id=product_id,
            source_store_id=source_store_id,
            target_store_id=target_store_id,
            quantity=quantity,
            notes=notes,
            requested_by=current_user.id,
            status='pending'
        )
        db.session.add(transfer)
        db.session.commit()

        return jsonify({'success': True, 'transfer_id': transfer.id, 'status': transfer.status})

    @app.route('/api/inventory/transfers/<int:transfer_id>/approve', methods=['POST'])
    @login_required
    def approve_transfer(transfer_id):
        if current_user.user_type not in [1, 2]:
            return jsonify({'error': 'No autorizado'}), 403

        transfer = TransferRequest.query.get_or_404(transfer_id)
        if transfer.status != 'pending':
            return jsonify({'error': 'Solo se pueden aprobar transferencias pendientes'}), 400

        ensure_store_permission(transfer.source_store_id)

        try:
            adjust_inventory(
                product_id=transfer.product_id,
                store_id=transfer.source_store_id,
                quantity_delta=-transfer.quantity,
                movement_type='transfer_out',
                user_id=current_user.id,
                notes=f'Salida por transferencia #{transfer.id}'
            )
            transfer.status = 'approved'
            transfer.approved_by = current_user.id
            transfer.approved_at = datetime.utcnow()
            db.session.commit()
        except ValueError as exc:
            db.session.rollback()
            return jsonify({'error': str(exc)}), 400

        return jsonify({'success': True, 'status': transfer.status})

    @app.route('/api/inventory/transfers/<int:transfer_id>/confirm', methods=['POST'])
    @login_required
    def confirm_transfer(transfer_id):
        if current_user.user_type not in [1, 2]:
            return jsonify({'error': 'No autorizado'}), 403

        transfer = TransferRequest.query.get_or_404(transfer_id)
        if transfer.status != 'approved':
            return jsonify({'error': 'Solo se pueden confirmar transferencias aprobadas'}), 400

        ensure_store_permission(transfer.target_store_id)

        try:
            adjust_inventory(
                product_id=transfer.product_id,
                store_id=transfer.target_store_id,
                quantity_delta=transfer.quantity,
                movement_type='transfer_in',
                user_id=current_user.id,
                notes=f'Entrada por transferencia #{transfer.id}'
            )
            transfer.status = 'completed'
            transfer.confirmed_by = current_user.id
            transfer.confirmed_at = datetime.utcnow()
            db.session.commit()
        except ValueError as exc:
            db.session.rollback()
            return jsonify({'error': str(exc)}), 400

        return jsonify({'success': True, 'status': transfer.status})
    @app.route('/api/dashboard/stats', methods=['GET'])
    @login_required
    def get_dashboard_stats():
        fecha_inicio_str = request.args.get('fecha_inicio')
        fecha_fin_str = request.args.get('fecha_fin')
        fecha_inicio, fecha_fin = get_date_range_filter(fecha_inicio_str, fecha_fin_str)

        store_ids = get_accessible_store_ids()
        # filtro por fechas sólo para user_type 1 y 2
        query_filter = []
        if current_user.user_type in [1, 2]:
            query_filter.append(Sale.sale_date.between(fecha_inicio, fecha_fin))

        total_sales = 0
        if current_user.user_type in [1, 2]:
            sales_query = db.session.query(func.sum(Sale.total_amount))
            if query_filter:
                sales_query = sales_query.filter(*query_filter)
            sales_query = apply_store_filter(sales_query, Sale.store_id)
            total_sales = sales_query.scalar() or 0

        inventory_total_query = db.session.query(func.sum(Inventory.quantity))
        inventory_total_query = apply_store_filter(inventory_total_query, Inventory.store_id)
        total_products = inventory_total_query.scalar() or 0

        stock_alerts_query = db.session.query(func.count(StockAlert.id)).join(
            Inventory, StockAlert.inventory_id == Inventory.id
        ).filter(StockAlert.is_active == True)
        stock_alerts_query = apply_store_filter(stock_alerts_query, Inventory.store_id)
        stock_alerts = stock_alerts_query.scalar() or 0

        active_stores_query = Store.query.filter_by(active=True)
        if store_ids is not None:
            active_stores_query = active_stores_query.filter(Store.id.in_(store_ids))
        active_stores = active_stores_query.count()

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

        query = apply_store_filter(query, Store.id)

        results = query.all()
        return jsonify([{
            'store_id': r.store_id,
            'store': r.name,
            'total': float(r.total or 0)
        } for r in results])

    @app.route('/api/dashboard/top-products', methods=['GET'])
    @login_required
    def get_top_products():
        try:
            fecha_inicio_str = request.args.get('fecha_inicio')
            fecha_fin_str = request.args.get('fecha_fin')
            fecha_inicio, fecha_fin = get_date_range_filter(fecha_inicio_str, fecha_fin_str)

            # Construye la query SIN limit todavía
            q = db.session.query(
                Product.id.label('product_id'),
                Product.name.label('product_name'),
                func.coalesce(func.sum(Sale.quantity), 0).label('units_sold'),
                func.coalesce(func.sum(Sale.total_amount), 0).label('total_amount')
            ).join(Sale, Sale.product_id == Product.id) \
            .group_by(Product.id, Product.name)

            # Filtros SIEMPRE antes del limit
            if current_user.user_type in [1, 2]:
                q = q.filter(Sale.sale_date >= fecha_inicio, Sale.sale_date <= fecha_fin)

            q = apply_store_filter(q, Sale.store_id)

            # Ordena y ahora sí limita
            q = q.order_by(func.sum(Sale.quantity).desc()).limit(5)

            rows = q.all()

            return jsonify([
                {
                    'name': r.product_name,
                    'quantity': int(r.units_sold or 0)
                } for r in rows
            ])

        except Exception as exc:
            current_app.logger.exception("Error en /api/dashboard/top-products: %s", exc)
            return jsonify({'error': 'No fue posible obtener Top Productos'}), 500



    @app.route('/api/dashboard/stock-alerts', methods=['GET'])
    @login_required
    def get_stock_alerts():
        rows_query = db.session.query(
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
            StockAlert.is_active == True
        )

        rows_query = apply_store_filter(rows_query, Store.id)
        rows = rows_query.all()

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
        if alert.inventory:
            ensure_store_permission(alert.inventory.store_id)
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

        ensure_store_permission(store_id)
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
    def serialize_customer(customer, include_metrics=False):
        data = {
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'created_at': customer.created_at.strftime('%Y-%m-%d %H:%M') if customer.created_at else None
        }

        if include_metrics:
            metrics_query = db.session.query(
                func.count(Invoice.id),
                func.coalesce(func.sum(Invoice.total_amount), 0),
                func.max(Invoice.created_at)
            ).filter(Invoice.customer_id == customer.id)

            metrics_query = apply_store_filter(metrics_query, Invoice.store_id)
            invoice_count, invoice_total, last_purchase = metrics_query.one()

            data.update({
                'invoice_count': int(invoice_count or 0),
                'total_spent': float(invoice_total or 0),
                'last_purchase': last_purchase.strftime('%Y-%m-%d %H:%M') if last_purchase else None
            })

        return data

    def serialize_invoice(invoice, detailed=False):
        items = []
        for item in invoice.items:
            entry = {
                'invoice_item_id': item.id,
                'product': item.product.name if item.product else 'Producto',
                'product_id': item.product_id,
                'product_sku': item.product.sku if item.product else None,
                'quantity': item.quantity,
                'unit_price': float(item.unit_price or 0),
                'discount': float(item.discount or 0),
                'line_total': float(item.line_total or 0)
            }
            items.append(entry)

        data = {
            'id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'customer': invoice.customer.name if invoice.customer else 'Consumidor final',
            'customer_id': invoice.customer_id,
            'total_amount': float(invoice.total_amount or 0),
            'payment_method': invoice.payment_method,
            'created_at': invoice.created_at.strftime('%Y-%m-%d %H:%M') if invoice.created_at else None,
            'status': invoice.status,
            'items': items
        }

        if detailed:
            data.update({
                'store_id': invoice.store_id,
                'store': invoice.store.name if invoice.store else None,
                'session_id': invoice.session_id,
                'user_id': invoice.user_id,
                'user': invoice.user.username if invoice.user else None
            })

        return data

    @app.route('/api/customers', methods=['GET', 'POST'])
    @login_required
    def manage_customers_api():
        ensure_management_access()
        if request.method == 'GET':
            query_value = (request.args.get('query') or '').strip()
            base_query = Customer.query

            if query_value:
                like_value = f"%{query_value}%"
                base_query = base_query.filter(
                    or_(
                        Customer.name.ilike(like_value),
                        Customer.email.ilike(like_value),
                        Customer.phone.ilike(like_value)
                    )
                )

            customers = base_query.order_by(Customer.name.asc()).limit(100).all()
            return jsonify([serialize_customer(customer) for customer in customers])

        data = request.get_json(force=True)
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'El nombre del cliente es obligatorio.'}), 400

        customer = Customer(
            name=name,
            email=(data.get('email') or '').strip() or None,
            phone=(data.get('phone') or '').strip() or None
        )
        db.session.add(customer)
        db.session.commit()
        return jsonify({'message': 'Cliente registrado correctamente.', 'customer': serialize_customer(customer)}), 201

    @app.route('/api/customers/<int:customer_id>', methods=['PUT'])
    @login_required
    def update_customer(customer_id):
        ensure_management_access()
        customer = Customer.query.get_or_404(customer_id)
        data = request.get_json(force=True)
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'El nombre del cliente es obligatorio.'}), 400

        customer.name = name
        customer.email = (data.get('email') or '').strip() or None
        customer.phone = (data.get('phone') or '').strip() or None
        db.session.commit()
        return jsonify({'message': 'Cliente actualizado correctamente.', 'customer': serialize_customer(customer)})

    @app.route('/api/customers/<int:customer_id>/history', methods=['GET'])
    @login_required
    def get_customer_history(customer_id):
        ensure_management_access()
        customer = Customer.query.get_or_404(customer_id)
        invoices_query = Invoice.query.filter_by(customer_id=customer.id)
        invoices_query = apply_store_filter(invoices_query, Invoice.store_id)
        invoices = invoices_query.order_by(Invoice.created_at.desc()).limit(25).all()
        return jsonify({
            'customer': serialize_customer(customer, include_metrics=True),
            'history': [serialize_invoice(invoice) for invoice in invoices]
        })

    @app.route('/api/pos/products', methods=['GET'])
    @login_required
    def search_products_for_pos():
        ensure_management_access()
        code = (request.args.get('code') or '').strip()
        query = (request.args.get('query') or '').strip()

        results = []

        if code:
            product = Product.query.filter(func.lower(Product.sku) == code.lower()).first()
            if product:
                inventory_item = None
                if current_user.user_type in [1, 2]:
                    inventory_query = Inventory.query.filter(Inventory.product_id == product.id)
                    inventory_query = apply_store_filter(inventory_query, Inventory.store_id)
                    inventory_item = inventory_query.first()
                results.append({
                    'id': product.id,
                    'name': product.name,
                    'sku': product.sku,
                    'price': float(product.price or 0),
                    'stock': inventory_item.quantity if inventory_item else None
                })
            return jsonify({'results': results})

        if not query:
            return jsonify({'results': []})

        like_query = f"%{query}%"
        products = Product.query.filter(
            or_(
                Product.name.ilike(like_query),
                Product.sku.ilike(like_query)
            )
        ).limit(15).all()

        for product in products:
            inventory_item = None
            if current_user.user_type in [1, 2]:
                inventory_query = Inventory.query.filter(Inventory.product_id == product.id)
                inventory_query = apply_store_filter(inventory_query, Inventory.store_id)
                inventory_item = inventory_query.first()
            results.append({
                'id': product.id,
                'name': product.name,
                'sku': product.sku,
                'price': float(product.price or 0),
                'stock': inventory_item.quantity if inventory_item else None
            })

        return jsonify({'results': results})

    @app.route('/api/pos/session/current', methods=['GET'])
    @login_required
    def get_current_session():
        ensure_management_access()
        current_session = POSSession.query.filter_by(user_id=current_user.id, status='open').order_by(POSSession.opened_at.desc()).first()
        if not current_session:
            return jsonify({'session': None})

        ensure_store_permission(current_session.store_id)

        total_sales = db.session.query(func.sum(Sale.total_amount)).filter(Sale.session_id == current_session.id).scalar() or Decimal('0')
        return jsonify({
            'session': {
                'id': current_session.id,
                'store_id': current_session.store_id,
                'store': current_session.store.name if current_session.store else None,
                'opened_at': current_session.opened_at.strftime('%Y-%m-%d %H:%M'),
                'opening_amount': float(current_session.opening_amount or 0),
                'total_sales': float(total_sales)
            }
        })

    @app.route('/api/pos/session/open', methods=['POST'])
    @login_required
    def open_pos_session():
        ensure_management_access()
        data = request.get_json(force=True)
        store_id = data.get('store_id')
        opening_amount = Decimal(str(data.get('opening_amount', '0') or '0'))
        notes = (data.get('notes') or '').strip() or None

        if not store_id:
            return jsonify({'error': 'Debe seleccionar una tienda para abrir la caja.'}), 400

        try:
            store_id = int(store_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'La tienda seleccionada no es válida.'}), 400

        ensure_store_permission(store_id)

        existing = POSSession.query.filter_by(user_id=current_user.id, status='open').first()
        if existing:
            return jsonify({'error': 'Ya tienes una caja abierta. Debes cerrarla antes de abrir una nueva.'}), 400

        pos_session = POSSession(
            user_id=current_user.id,
            store_id=store_id,
            opening_amount=opening_amount,
            notes=notes
        )
        db.session.add(pos_session)
        db.session.commit()
        return jsonify({'message': 'Caja abierta correctamente.', 'session': {
            'id': pos_session.id,
            'store_id': pos_session.store_id,
            'store': pos_session.store.name if pos_session.store else None,
            'opened_at': pos_session.opened_at.strftime('%Y-%m-%d %H:%M'),
            'opening_amount': float(pos_session.opening_amount or 0)
        }}), 201

    @app.route('/api/pos/session/<int:session_id>/close', methods=['POST'])
    @login_required
    def close_pos_session(session_id):
        ensure_management_access()
        pos_session = POSSession.query.get_or_404(session_id)
        ensure_store_permission(pos_session.store_id)
        if pos_session.user_id != current_user.id:
            return jsonify({'error': 'Solo el usuario que abrió la caja puede cerrarla.'}), 403
        if pos_session.status != 'open':
            return jsonify({'error': 'La caja ya se encuentra cerrada.'}), 400

        data = request.get_json(force=True)
        closing_amount = Decimal(str(data.get('closing_amount', '0') or '0'))

        total_sales = db.session.query(func.sum(Sale.total_amount)).filter(Sale.session_id == pos_session.id).scalar() or Decimal('0')

        pos_session.status = 'closed'
        pos_session.closed_at = datetime.utcnow()
        pos_session.closing_amount = closing_amount
        db.session.commit()

        return jsonify({
            'message': 'Caja cerrada correctamente.',
            'session': {
                'id': pos_session.id,
                'closed_at': pos_session.closed_at.strftime('%Y-%m-%d %H:%M'),
                'closing_amount': float(pos_session.closing_amount or 0),
                'total_sales': float(total_sales)
            }
        })

    @app.route('/api/pos/checkout', methods=['POST'])
    @login_required
    def pos_checkout():
        ensure_management_access()
        data = request.get_json(force=True)
        items = data.get('items') or []
        customer_id = data.get('customer_id')
        payment_method = (data.get('payment_method') or 'Efectivo').strip()

        if not items:
            return jsonify({'error': 'Debes agregar productos antes de facturar.'}), 400

        current_session = POSSession.query.filter_by(user_id=current_user.id, status='open').first()
        if not current_session:
            return jsonify({'error': 'No hay una caja abierta. Abre una sesión de caja antes de registrar ventas.'}), 400

        ensure_store_permission(current_session.store_id)

        # Validar inventario
        inventory_map = {}
        for item in items:
            product_id = item.get('product_id')
            quantity = int(item.get('quantity', 0))
            if quantity <= 0:
                return jsonify({'error': 'La cantidad debe ser mayor que cero.'}), 400
            inventory_item = Inventory.query.filter_by(product_id=product_id, store_id=current_session.store_id).with_for_update().first()
            if not inventory_item or inventory_item.quantity < quantity:
                return jsonify({'error': f'Stock insuficiente para el producto {product_id}.'}), 400
            inventory_map[product_id] = inventory_item

        invoice = Invoice(
            customer_id=customer_id,
            user_id=current_user.id,
            store_id=current_session.store_id,
            session_id=current_session.id,
            payment_method=payment_method
        )
        db.session.add(invoice)
        db.session.flush()

        total_amount = Decimal('0')
        processed_items = []
        for item in items:
            product = Product.query.get(item.get('product_id'))
            if not product:
                db.session.rollback()
                return jsonify({'error': 'Producto no encontrado.'}), 404
            quantity = int(item.get('quantity', 0))
            try:
                unit_price = Decimal(str(item.get('unit_price'))) if item.get('unit_price') is not None else Decimal(str(product.price or 0))
            except (InvalidOperation, TypeError):
                db.session.rollback()
                return jsonify({'error': 'El precio unitario proporcionado no es válido.'}), 400
            try:
                discount = Decimal(str(item.get('discount', '0') or '0'))
            except (InvalidOperation, TypeError):
                db.session.rollback()
                return jsonify({'error': 'El descuento proporcionado no es válido.'}), 400
            if discount < 0:
                db.session.rollback()
                return jsonify({'error': 'El descuento no puede ser negativo.'}), 400
            if discount > unit_price:
                db.session.rollback()
                return jsonify({'error': 'El descuento no puede ser mayor que el precio unitario.'}), 400
            effective_price = unit_price - discount
            line_total = effective_price * quantity
            total_amount += line_total

            invoice_item = InvoiceItem(
                invoice_id=invoice.id,
                product_id=product.id,
                quantity=quantity,
                unit_price=unit_price,
                discount=discount,
                line_total=line_total
            )
            db.session.add(invoice_item)

            inventory_map[product.id].quantity -= quantity

            sale = Sale(
                store_id=current_session.store_id,
                product_id=product.id,
                quantity=quantity,
                total_amount=line_total,
                sale_date=datetime.utcnow(),
                session_id=current_session.id,
                invoice_id=invoice.id
            )
            db.session.add(sale)
            processed_items.append({
                'product_id': product.id,
                'name': product.name,
                'quantity': quantity,
                'unit_price': float(unit_price),
                'discount': float(discount),
                'line_total': float(line_total)
            })

        invoice.total_amount = total_amount
        invoice.invoice_number = f"INV-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{invoice.id}"

        record_invoice_audit(
            invoice,
            'create',
            'Factura generada desde el punto de venta.',
            {
                'items': processed_items,
                'total_amount': float(total_amount),
                'payment_method': payment_method
            }
        )

        db.session.commit()

        return jsonify({
            'message': 'Venta registrada correctamente.',
            'invoice': serialize_invoice(invoice)
        }), 201

    @app.route('/api/invoices/recent', methods=['GET'])
    @login_required
    def recent_invoices():
        ensure_management_access()
        invoices_query = Invoice.query
        invoices_query = apply_store_filter(invoices_query, Invoice.store_id)
        today = date.today()
        start = datetime.combine(today, datetime.min.time())
        end = datetime.combine(today, datetime.max.time())
        invoices_query = invoices_query.filter(
            Invoice.created_at >= start,
            Invoice.created_at <= end,
            Invoice.status != 'void'
        )
        invoices = invoices_query.order_by(Invoice.created_at.desc()).limit(20).all()
        return jsonify({'invoices': [serialize_invoice(invoice) for invoice in invoices]})

    @app.route('/api/invoices/<int:invoice_id>', methods=['GET', 'PUT'])
    @login_required
    def manage_invoice(invoice_id):
        ensure_management_access()
        invoice = Invoice.query.get_or_404(invoice_id)
        ensure_store_permission(invoice.store_id)

        if request.method == 'GET':
            return jsonify({'invoice': serialize_invoice(invoice, detailed=True)})

        ensure_invoice_edit_permission()
        data = request.get_json(force=True)
        items_payload = data.get('items') or []
        if not isinstance(items_payload, list) or not items_payload:
            return jsonify({'error': 'Debe proporcionar los productos de la factura.'}), 400

        try:
            payment_method = (data.get('payment_method') or invoice.payment_method or 'Efectivo').strip()
        except AttributeError:
            payment_method = invoice.payment_method or 'Efectivo'

        new_items = []
        new_counts = {}
        product_cache = {}

        for entry in items_payload:
            product_id = entry.get('product_id')
            quantity = entry.get('quantity')
            if not product_id:
                return jsonify({'error': 'Cada item debe incluir un producto válido.'}), 400
            try:
                product_id = int(product_id)
            except (TypeError, ValueError):
                return jsonify({'error': 'El identificador del producto no es válido.'}), 400
            try:
                quantity = int(quantity)
            except (TypeError, ValueError):
                return jsonify({'error': 'Las cantidades deben ser números enteros.'}), 400
            if quantity <= 0:
                return jsonify({'error': 'Las cantidades deben ser mayores que cero.'}), 400

            product = product_cache.get(product_id)
            if not product:
                product = Product.query.get(product_id)
                if not product:
                    return jsonify({'error': f'Producto {product_id} no encontrado.'}), 404
                product_cache[product_id] = product

            try:
                unit_price = Decimal(str(entry.get('unit_price') if entry.get('unit_price') is not None else product.price or 0))
            except (InvalidOperation, TypeError):
                return jsonify({'error': 'Alguno de los precios es inválido.'}), 400
            try:
                discount = Decimal(str(entry.get('discount', '0') or '0'))
            except (InvalidOperation, TypeError):
                return jsonify({'error': 'Alguno de los descuentos es inválido.'}), 400
            if discount < 0:
                return jsonify({'error': 'Los descuentos no pueden ser negativos.'}), 400
            if discount > unit_price:
                return jsonify({'error': 'El descuento no puede superar el precio unitario.'}), 400

            effective_price = unit_price - discount
            line_total = effective_price * quantity

            new_items.append({
                'product_id': product_id,
                'product_name': product.name,
                'quantity': quantity,
                'unit_price': unit_price,
                'discount': discount,
                'line_total': line_total
            })
            new_counts[product_id] = new_counts.get(product_id, 0) + quantity

        old_items = list(invoice.items)
        old_counts = {}
        for item in old_items:
            old_counts[item.product_id] = old_counts.get(item.product_id, 0) + item.quantity

        all_product_ids = set(old_counts) | set(new_counts)

        inventory_records = {}
        if all_product_ids:
            inventories = Inventory.query.filter(
                Inventory.store_id == invoice.store_id,
                Inventory.product_id.in_(all_product_ids)
            ).with_for_update().all()
            inventory_records = {inventory.product_id: inventory for inventory in inventories}

        for product_id in all_product_ids:
            inventory = inventory_records.get(product_id)
            if not inventory:
                inventory = Inventory(product_id=product_id, store_id=invoice.store_id, quantity=0)
                db.session.add(inventory)
                inventory_records[product_id] = inventory
            available = int(inventory.quantity or 0) + old_counts.get(product_id, 0)
            required = new_counts.get(product_id, 0)
            if available < required:
                return jsonify({'error': f'Stock insuficiente para el producto {product_id}.'}), 400

        try:
            new_total = Decimal('0')

            Sale.query.filter_by(invoice_id=invoice.id).delete(synchronize_session=False)

            for item in old_items:
                db.session.delete(item)

            for product_id, inventory in inventory_records.items():
                available = int(inventory.quantity or 0) + old_counts.get(product_id, 0)
                required = new_counts.get(product_id, 0)
                inventory.quantity = available - required

            for entry in new_items:
                invoice_item = InvoiceItem(
                    invoice_id=invoice.id,
                    product_id=entry['product_id'],
                    quantity=entry['quantity'],
                    unit_price=entry['unit_price'],
                    discount=entry['discount'],
                    line_total=entry['line_total']
                )
                db.session.add(invoice_item)

                sale = Sale(
                    store_id=invoice.store_id,
                    product_id=entry['product_id'],
                    quantity=entry['quantity'],
                    total_amount=entry['line_total'],
                    sale_date=datetime.utcnow(),
                    session_id=invoice.session_id,
                    invoice_id=invoice.id
                )
                db.session.add(sale)

                new_total += entry['line_total']

            invoice.total_amount = new_total
            invoice.payment_method = payment_method

            record_invoice_audit(
                invoice,
                'update',
                'Factura modificada por administrador.',
                {
                    'items': [
                        {
                            'product_id': entry['product_id'],
                            'product_name': entry['product_name'],
                            'quantity': entry['quantity'],
                            'unit_price': float(entry['unit_price']),
                            'discount': float(entry['discount']),
                            'line_total': float(entry['line_total'])
                        }
                        for entry in new_items
                    ],
                    'total_amount': float(new_total),
                    'payment_method': payment_method
                }
            )

            db.session.commit()
        except Exception:
            db.session.rollback()
            return jsonify({'error': 'No se pudo actualizar la factura. Revisa los datos ingresados.'}), 500

        return jsonify({'message': 'Factura actualizada correctamente.', 'invoice': serialize_invoice(invoice, detailed=True)})

    @app.route('/api/invoices/<int:invoice_id>/void', methods=['POST'])
    @login_required
    def void_invoice(invoice_id):
        ensure_invoice_edit_permission()
        invoice = Invoice.query.get_or_404(invoice_id)
        ensure_store_permission(invoice.store_id)

        if invoice.status == 'void':
            return jsonify({'error': 'La factura ya está anulada.'}), 400

        for item in invoice.items:
            inventory = Inventory.query.filter_by(product_id=item.product_id, store_id=invoice.store_id).with_for_update().first()
            if not inventory:
                inventory = Inventory(product_id=item.product_id, store_id=invoice.store_id, quantity=0)
                db.session.add(inventory)
            inventory.quantity = int(inventory.quantity or 0) + item.quantity

        Sale.query.filter_by(invoice_id=invoice.id).delete(synchronize_session=False)

        invoice.status = 'void'

        record_invoice_audit(invoice, 'void', 'Factura anulada por administrador.')

        db.session.commit()
        return jsonify({'message': 'Factura anulada correctamente.', 'invoice': serialize_invoice(invoice, detailed=True)})

    @app.route('/api/invoices/<int:invoice_id>/logs', methods=['GET'])
    @login_required
    def invoice_logs(invoice_id):
        ensure_invoice_edit_permission()
        invoice = Invoice.query.get_or_404(invoice_id)
        ensure_store_permission(invoice.store_id)
        logs = InvoiceAuditLog.query.filter_by(invoice_id=invoice.id).order_by(InvoiceAuditLog.created_at.desc()).all()
        return jsonify({'logs': [serialize_audit_log(entry) for entry in logs]})

    @app.route('/invoices/<int:invoice_id>/pdf', methods=['GET'])
    @login_required
    def download_invoice_pdf(invoice_id):
        ensure_management_access()
        invoice = Invoice.query.get_or_404(invoice_id)
        ensure_store_permission(invoice.store_id)

        lines = [
            f'Fecha: {invoice.created_at.strftime("%Y-%m-%d %H:%M") if invoice.created_at else "N/A"}',
            f'Sucursal: {invoice.store.name if invoice.store else "General"}',
            f'Cliente: {invoice.customer.name if invoice.customer else "Consumidor final"}',
            f'Vendedor: {invoice.user.username if invoice.user else "N/A"}',
            f'Método de pago: {invoice.payment_method or "N/A"}',
            f'Estado: {invoice.status}'
        ]

        total_discount = Decimal('0')
        lines.append('')
        lines.append('Detalle de productos:')
        for item in invoice.items:
            discount = Decimal(item.discount or 0)
            total_discount += discount * item.quantity
            lines.append(f'- {item.quantity} x {item.product.name if item.product else "Producto"}')
            item_line = f'  Precio: ${Decimal(item.unit_price or 0):.2f}'
            if discount:
                item_line += f' | Descuento: ${discount:.2f} | Neto: ${(Decimal(item.unit_price or 0) - discount):.2f}'
            lines.append(item_line)
            lines.append(f'  Total línea: ${Decimal(item.line_total or 0):.2f}')

        lines.append('')
        lines.append(f'Descuentos aplicados: ${total_discount:.2f}')
        lines.append(f'Total factura: ${Decimal(invoice.total_amount or 0):.2f}')

        pdf_buffer = build_simple_pdf(f'Factura {invoice.invoice_number}', lines)
        filename = f'Factura_{invoice.invoice_number}.pdf'
        return send_file(pdf_buffer, as_attachment=True, download_name=filename, mimetype='application/pdf')

    @app.route('/api/pos/closing-report', methods=['GET'])
    @login_required
    def closing_report():
        ensure_management_access()
        date_param = request.args.get('date')
        store_param = request.args.get('store_id')

        try:
            target_date = datetime.strptime(date_param, '%Y-%m-%d').date() if date_param else date.today()
        except ValueError:
            return jsonify({'error': 'La fecha proporcionada no es válida.'}), 400

        store_id = None
        if store_param:
            try:
                store_id = int(store_param)
            except (TypeError, ValueError):
                return jsonify({'error': 'La sucursal seleccionada no es válida.'}), 400

        report = compute_closing_report(target_date, store_id)
        return jsonify({'report': report})

    @app.route('/api/pos/closing-report/pdf', methods=['GET'])
    @login_required
    def closing_report_pdf():
        ensure_management_access()
        date_param = request.args.get('date')
        store_param = request.args.get('store_id')

        try:
            target_date = datetime.strptime(date_param, '%Y-%m-%d').date() if date_param else date.today()
        except ValueError:
            abort(400)

        store_id = None
        if store_param:
            try:
                store_id = int(store_param)
            except (TypeError, ValueError):
                abort(400)

        report = compute_closing_report(target_date, store_id)

        lines = [
            f'Fecha: {report["date"]}',
            f'Sucursal: {report["store_name"] or "Todas"}',
            f'Total ventas: ${report["total_sales"]:.2f}',
            f'Transacciones: {report["transactions"]}',
            f'Impuestos ({report["tax_rate"] * 100:.2f}%): ${report["taxes_collected"]:.2f}',
            f'Descuentos aplicados: ${report["discounts_applied"]:.2f}',
            ''
        ]

        lines.append('Desglose por método de pago:')
        for payment in report['payment_breakdown']:
            lines.append(f'- {payment["method"]}: ${payment["total"]:.2f} ({payment["transactions"]} transacciones)')

        lines.append('')
        lines.append('Productos vendidos:')
        if not report['products_sold']:
            lines.append('No hay registros de productos vendidos en este periodo.')
        else:
            for product in report['products_sold']:
                lines.append(f'- {product["product_name"]}: {product["quantity"]} unidades por ${product["total_amount"]:.2f}')

        pdf_buffer = build_simple_pdf(f'Cierre de caja {report["date"]}', lines)
        filename = f'cierre_{report["date"]}.pdf'
        return send_file(pdf_buffer, as_attachment=True, download_name=filename, mimetype='application/pdf')

    @app.route('/api/pos/closing-report/export', methods=['GET'])
    @login_required
    def closing_report_export():
        ensure_management_access()
        date_param = request.args.get('date')
        store_param = request.args.get('store_id')

        try:
            target_date = datetime.strptime(date_param, '%Y-%m-%d').date() if date_param else date.today()
        except ValueError:
            abort(400)

        store_id = None
        if store_param:
            try:
                store_id = int(store_param)
            except (TypeError, ValueError):
                abort(400)

        report = compute_closing_report(target_date, store_id)

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Fecha', report['date']])
        writer.writerow(['Sucursal', report['store_name'] or 'Todas'])
        writer.writerow(['Total ventas', f"${report['total_sales']:.2f}"])
        writer.writerow(['Transacciones', report['transactions']])
        writer.writerow(['Impuestos', f"${report['taxes_collected']:.2f}"])
        writer.writerow(['Tasa de impuestos', f"{report['tax_rate'] * 100:.2f}%"])
        writer.writerow(['Descuentos aplicados', f"${report['discounts_applied']:.2f}"])
        writer.writerow([])
        writer.writerow(['Método de pago', 'Total', 'Transacciones'])
        for payment in report['payment_breakdown']:
            writer.writerow([payment['method'], f"${payment['total']:.2f}", payment['transactions']])
        writer.writerow([])
        writer.writerow(['Producto', 'Unidades', 'Total'])
        for product in report['products_sold']:
            writer.writerow([product['product_name'], product['quantity'], f"${product['total_amount']:.2f}"])

        csv_bytes = io.BytesIO(output.getvalue().encode('utf-8'))
        filename = f'cierre_{report["date"]}.csv'
        return send_file(csv_bytes, as_attachment=True, download_name=filename, mimetype='text/csv')

    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=True)
