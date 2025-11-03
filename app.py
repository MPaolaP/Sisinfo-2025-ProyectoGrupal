from flask import Flask, render_template, redirect, url_for, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from Modelo.conexion import DevelopmentConfig 

db = SQLAlchemy()
login_manager = LoginManager()

# ======= MODELO DE DATOS =======
class User(UserMixin, db.Model):
    __tablename__ = 'user_account' # Nombre de la tabla en la base de datos
    id = db.Column('user_id', db.Integer, primary_key=True) 
    username = db.Column('username', db.String(100), unique=True, nullable=False)
    password_hash = db.Column('password', db.String(255), nullable=False)
    user_type = db.Column('user_type', db.Integer, nullable=False) 

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

def page_not_found(error):
    return render_template('404.html'), 404

# ======= FÁBRICA DE APLICACIONES =======
def create_app(config_class=DevelopmentConfig):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'login' 
    
    app.register_error_handler(404, page_not_found)

    # ======= RUTAS PRINCIPALES ======

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
            # Busca el usuario en la base de datos por el nombre de usuario
            user = db.session.execute(
                db.select(User).filter_by(username=username)
            ).scalar_one_or_none()

            if user and user.check_password(password):
                # Si las credenciales son correctas, inicia la sesión del usuario
                login_user(user)
                next_page = request.args.get('next')
                return redirect(next_page or url_for('dashboard'))
            else:
                # Si el usuario no existe o la contraseña es incorrecta
                error = 'Nombre de usuario o contraseña incorrectos.'


        title_container = "Distrito"
        title2_container = "5"
        subtitle_container = "Urbana y deportiva"
        user = "Usuario"
        password = "Contraseña"
        button_login = "Iniciar sesión"
        create_account = "Crear una cuenta" # Esto se usará para tu futura ruta de registro

        return render_template('login.html',
                            title='Distrito5 - Login',
                            titlecontainer=title_container,
                            title2_container=title2_container,
                            subtitle_container=subtitle_container,
                            user=user,
                            password=password,
                            button_login=button_login,
                            create_account=create_account, error=error)


    @app.route('/inventory')
    @login_required 
    def inventory():
        return render_template('dashboard.html', username=current_user.username)
    

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
        return render_template('dashboard.html', username=current_user.username)
    
    return app


if __name__ == '__main__':
    app = create_app()
    # Se añade la inicialización condicional de la BD para evitar recrear las tablas si ya existen.
    with app.app_context():
        db.create_all() 
        
    app.run(debug=True)