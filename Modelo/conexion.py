from urllib.parse import quote_plus
import os

class conexion:
    SECRET_KEY = 'ya_casi_es_navidad'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    LOGIN_DISABLED = False

    @staticmethod
    def get_connection_string():
        # Para desarrollo local
        if os.getenv('DB_USE_MANAGED_IDENTITY', 'true').lower() == 'false':
            server = os.getenv('DB_SERVER', 'sisinfoservidor.database.windows.net')
            database = os.getenv('DB_NAME', 'DB_Paola')
            username = os.getenv('DB_USERNAME')
            password = os.getenv('DB_PASSWORD')
            driver = '{ODBC Driver 18 for SQL Server}'
            
            odbc_str = (
                f"DRIVER={driver};"
                f"SERVER={server};"
                f"DATABASE={database};"
                f"UID={username};"
                f"PWD={password};"
                "Encrypt=yes;"
                "TrustServerCertificate=no;"
                "Connection Timeout=30;"
            )
            return "mssql+pyodbc:///?odbc_connect=" + quote_plus(odbc_str)
        else:
            # Para producción con Managed Identity
            server = 'sisinfoservidor.database.windows.net'
            database = 'DB_Paola'
            driver = '{ODBC Driver 18 for SQL Server}'
            
            odbc_str = (
                f"DRIVER={driver};"
                f"SERVER={server};"
                f"DATABASE={database};"
                "Encrypt=yes;"
                "TrustServerCertificate=no;"
                "Connection Timeout=30;"
                "Authentication=ActiveDirectoryMSI;"
            )
            return "mssql+pyodbc:///?odbc_connect=" + quote_plus(odbc_str)

    SQLALCHEMY_DATABASE_URI = get_connection_string()

class DevelopmentConfig(conexion):
    DEBUG = True

class ProductionConfig(conexion):
    DEBUG = False