import os
import sqlite3
import numpy as np
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_url_path='')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'database', 'zeta.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    os.makedirs(os.path.join(BASE_DIR, 'database'), exist_ok=True)
    conn = get_db()
    with open(os.path.join(BASE_DIR, 'database', 'schema.sql')) as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    return send_from_directory(os.path.join(BASE_DIR, 'templates'), 'index.html')

@app.route('/api/airfoils')
def get_airfoils():
    conn = get_db()
    airfoils = conn.execute('SELECT id, name, code, max_camber, max_camber_position, max_thickness, description FROM airfoils').fetchall()
    conn.close()
    return jsonify([dict(a) for a in airfoils])

@app.route('/api/airfoil/<int:airfoil_id>')
def get_airfoil(airfoil_id):
    conn = get_db()
    airfoil = conn.execute('SELECT * FROM airfoils WHERE id=?', (airfoil_id,)).fetchone()
    coords = conn.execute('SELECT x, y_upper, y_lower FROM airfoil_coordinates WHERE airfoil_id=? ORDER BY x', (airfoil_id,)).fetchall()
    conn.close()
    if not airfoil:
        return jsonify({'error': 'Airfoil not found'}), 404
    result = dict(airfoil)
    result['coordinates'] = [dict(c) for c in coords]
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
