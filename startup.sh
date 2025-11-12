#!/bin/bash

# Instalar dependencias del sistema para pyodbc
apt-get update
apt-get install -y unixodbc-dev unixodbc g++

# Instalar las dependencias de Python
pip install -r requirements.txt

# Iniciar la aplicación
gunicorn --bind=0.0.0.0 --timeout 600 app:app