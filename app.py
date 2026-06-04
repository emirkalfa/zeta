import os, sys, sqlite3, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flask import Flask, jsonify, request, send_from_directory
from backend.geometry import calculate_geometry
from backend.airfoil import get_airfoil_properties
from backend.analysis import calculate_polars
from backend.stability import flight_test

app = Flask(__name__, static_url_path='')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'database', 'zeta.db')


def _read_version():
    version_path = os.path.join(BASE_DIR, 'VERSION')
    try:
        with open(version_path, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return '0.0.0'


APP_VERSION = _read_version()


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

    if not conn.execute('SELECT COUNT(*) as c FROM airfoils').fetchone()['c']:
        import database.seed as seed_module
        seed_module.seed()

    conn.close()

init_db()

@app.route('/')
def index():
    return send_from_directory(os.path.join(BASE_DIR, 'templates'), 'index.html')

@app.route('/api/airfoils')
def get_airfoils():
    conn = get_db()
    airfoils = conn.execute(
        'SELECT id, name, code, max_camber, max_camber_position, max_thickness, description FROM airfoils'
    ).fetchall()
    conn.close()
    return jsonify([dict(a) for a in airfoils])

@app.route('/api/airfoil/<int:airfoil_id>')
def get_airfoil(airfoil_id):
    conn = get_db()
    airfoil = conn.execute('SELECT * FROM airfoils WHERE id=?', (airfoil_id,)).fetchone()
    coords = conn.execute(
        'SELECT x, y_upper, y_lower FROM airfoil_coordinates WHERE airfoil_id=? ORDER BY rowid',
        (airfoil_id,)
    ).fetchall()
    conn.close()
    if not airfoil:
        return jsonify({'error': 'Airfoil not found'}), 404
    result = dict(airfoil)
    result['coordinates'] = [dict(c) for c in coords]
    return jsonify(result)

@app.route('/api/calculate', methods=['POST'])
def api_calculate():
    data = request.get_json()
    wingspan = float(data.get('wingspan', 1.5))
    weight = float(data.get('weight', 2.5))
    airfoil_code = data.get('airfoil_code', '2412')
    wing_position = data.get('wing_position', 'mid')
    tail_type = data.get('tail_type', 'conventional')
    wing_junction = data.get('wing_junction', 'through')

    geom = calculate_geometry(wingspan, weight, airfoil_code,
                              wing_position, tail_type, wing_junction,
                              manual_mode=data.get('manual_mode', False),
                              wing_shape=data.get('wing_shape', 'tapered'),
                              man_root_chord=data.get('man_root_chord'),
                              man_tip_chord=data.get('man_tip_chord'),
                              man_sweep=data.get('man_sweep'),
                              man_dihedral=data.get('man_dihedral'),
                              man_htail_span=data.get('man_htail_span'),
                              man_htail_root=data.get('man_htail_root'),
                              man_htail_tip=data.get('man_htail_tip'),
                              man_htail_sweep=data.get('man_htail_sweep'),
                              man_vtail_span=data.get('man_vtail_span'),
                              man_vtail_root=data.get('man_vtail_root'),
                              man_vtail_tip=data.get('man_vtail_tip'),
                               fuse_type='conventional')
    return jsonify(geom)

@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    data = request.get_json()
    geom = data.get('geometry', {})
    airfoil_code = data.get('airfoil_code', '2412')
    props = get_airfoil_properties(airfoil_code)
    polars = calculate_polars(geom, props)
    return jsonify(polars)

@app.route('/api/stability', methods=['POST'])
def api_stability():
    data = request.get_json()
    geom = data.get('geometry', {})
    airfoil_code = data.get('airfoil_code', '2412')
    tail_airfoil_code = data.get('tail_airfoil_code', '0012')
    props = get_airfoil_properties(airfoil_code)
    tail_props = get_airfoil_properties(tail_airfoil_code)
    result = flight_test(geom, props, tail_props)
    return jsonify(result)

@app.route('/api/airfoil_props/<code>')
def api_airfoil_props(code):
    props = get_airfoil_properties(code)
    return jsonify(props)

@app.route('/api/version')
def api_version():
    import time
    return jsonify({
        'version': APP_VERSION,
        'name': 'zeta-aircraft-designer',
    })


@app.route('/healthz')
def healthz():
    return 'ok', 200

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory(os.path.join(BASE_DIR, 'static'), path)

if __name__ == '__main__':
    import os
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(debug=debug, host='0.0.0.0', port=5000)
