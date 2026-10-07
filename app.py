import os, sys, sqlite3, threading, time
from contextlib import contextmanager

# Paketlenmiş uygulamada (PyInstaller) kaynak dosyalar geçici bir dizine açılır
FROZEN = getattr(sys, 'frozen', False)
BASE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

# Konsolsuz (pencereli) derlemede stdout/stderr yoktur; yazma denemeleri çökmesin
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')
# Windows konsolu (cp1252 vb.) Türkçe karakterleri kodlayamayınca print çökmesin
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(errors='replace')

from flask import Flask, jsonify, request, send_from_directory, Response
from backend.geometry import calculate_geometry
from backend.airfoil import get_airfoil_properties
from backend.analysis import calculate_polars
from backend.stability import flight_test
from backend.mission import mission_performance

APP_NAME = 'zeta-aircraft-designer'
app = Flask(__name__, static_url_path='')


def _data_dir():
    """Veritabanının yazılacağı dizin. Kaynak koddan çalışırken depo içindeki database/,
    paketlenmiş uygulamada kullanıcıya ait veri dizini (paket salt okunur olabilir)."""
    override = os.environ.get('ZETA_DATA_DIR')
    if override:
        return override
    if not FROZEN:
        return os.path.join(BASE_DIR, 'database')
    home = os.path.expanduser('~')
    if sys.platform == 'win32':
        base = os.environ.get('LOCALAPPDATA') or os.path.join(home, 'AppData', 'Local')
    elif sys.platform == 'darwin':
        base = os.path.join(home, 'Library', 'Application Support')
    else:
        base = os.environ.get('XDG_DATA_HOME') or os.path.join(home, '.local', 'share')
    return os.path.join(base, 'ZETA')


DB_PATH = os.path.join(_data_dir(), 'zeta.db')


def _read_version():
    version_path = os.path.join(BASE_DIR, 'VERSION')
    try:
        with open(version_path, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return '0.0.0'


APP_VERSION = _read_version()


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_db() as conn:
        with open(os.path.join(BASE_DIR, 'database', 'schema.sql'), encoding='utf-8') as f:
            conn.executescript(f.read())
        conn.commit()
        empty = not conn.execute('SELECT COUNT(*) as c FROM airfoils').fetchone()['c']
    if empty:
        from database.seed import seed
        seed(DB_PATH)

init_db()

@app.route('/')
def index():
    return send_from_directory(os.path.join(BASE_DIR, 'templates'), 'index.html')

@app.route('/api/airfoils')
def get_airfoils():
    with get_db() as conn:
        airfoils = conn.execute(
            'SELECT id, name, code, max_camber, max_camber_position, max_thickness, description FROM airfoils'
        ).fetchall()
    return jsonify([dict(a) for a in airfoils])

@app.route('/api/airfoil/<int:airfoil_id>')
def get_airfoil(airfoil_id):
    with get_db() as conn:
        airfoil = conn.execute('SELECT * FROM airfoils WHERE id=?', (airfoil_id,)).fetchone()
        coords = conn.execute(
            'SELECT x, y_upper, y_lower FROM airfoil_coordinates WHERE airfoil_id=? ORDER BY rowid',
            (airfoil_id,)
        ).fetchall()
    if not airfoil:
        return jsonify({'error': 'Airfoil not found'}), 404
    result = dict(airfoil)
    result['coordinates'] = [dict(c) for c in coords]
    return jsonify(result)


@app.route('/api/manufacturing', methods=['POST'])
def api_manufacturing():
    from backend.manufacturing import generate, preview, package, ManufacturingError
    if request.content_length and request.content_length > 8_000_000:
        return jsonify(error='Model verisi çok büyük.'), 413
    try:
        parts, manifest, rings = generate(request.get_json())
        if request.args.get('mode') == 'zip':
            content = package(parts, manifest, rings, request.args.get('part', 'all'))
            return Response(content, mimetype='application/zip', headers={'Content-Disposition': 'attachment; filename=zeta_montajli_stl.zip'})
        return jsonify(preview(parts, manifest))
    except (ManufacturingError, ValueError, KeyError, TypeError, OverflowError) as e:
        return jsonify(error=str(e)), 400

@app.route('/api/calculate', methods=['POST'])
def api_calculate():
    data = request.get_json()
    wingspan = float(data.get('wingspan', 1.5))
    weight = float(data.get('weight', 2.5))
    airfoil_code = data.get('airfoil_code', '2412')
    wing_position = data.get('wing_position', 'mid')
    tail_type = data.get('tail_type', 'conventional')
    geom = calculate_geometry(wingspan, weight, airfoil_code,
                              wing_position, tail_type,
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
                              fuse_type=data.get('fuse_type', 'conventional'),
                              man_fuse_length=data.get('man_fuse_length'),
                              man_fuse_width=data.get('man_fuse_width'),
                              airframe=data.get('airframe', 'standard'),
                               )
    cg_pct = data.get('cg_percent')
    if cg_pct is not None:
        geom['cg_position'] = round(float(cg_pct) / 100.0 * geom['mac'], 3)
    return jsonify(geom)

@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    data = request.get_json()
    geom = data.get('geometry', {})
    airfoil_code = data.get('airfoil_code', '2412')
    Re = float(data.get('reynolds_number', 200000))
    max_alpha = float(data.get('max_alpha', 20))
    props = get_airfoil_properties(airfoil_code, Re=Re)
    polars = calculate_polars(geom, props, max_alpha=max_alpha)
    polars['Reynolds'] = int(Re)
    polars['cd_0'] = round(props['cd_0'], 5)
    return jsonify(polars)

@app.route('/api/stability', methods=['POST'])
def api_stability():
    data = request.get_json()
    geom = data.get('geometry', {})
    airfoil_code = data.get('airfoil_code', '2412')
    tail_airfoil_code = data.get('tail_airfoil_code', '0012')
    Re = float(data.get('reynolds_number', 200000))
    props = get_airfoil_properties(airfoil_code, Re=Re)
    tail_props = get_airfoil_properties(tail_airfoil_code, Re=Re)
    power_available = None
    if data.get('motor_power') is not None:
        power_available = float(data['motor_power']) * float(data.get('prop_efficiency', 0.6))
    result = flight_test(geom, props, tail_props, power_available=power_available)
    result['Reynolds'] = int(Re)
    return jsonify(result)

@app.route('/api/mission', methods=['POST'])
def api_mission():
    data = request.get_json()
    props = get_airfoil_properties(data.get('airfoil_code', '2412'),
                                   Re=float(data.get('reynolds_number', 200000)))
    result = mission_performance(
        data.get('geometry', {}), props,
        motor_power=float(data.get('motor_power', 0)),
        battery_wh=float(data.get('battery_wh', 0)),
        prop_efficiency=float(data.get('prop_efficiency', 0.6)),
        n_limit=float(data.get('n_limit', 4.0)),
        avionics_power=float(data.get('avionics_power', 0)),
        targets=data.get('targets'),
    )
    return jsonify(result)

@app.route('/api/airfoil_props/<code>')
def api_airfoil_props(code):
    Re = request.args.get('Re', 200000, type=float)
    props = get_airfoil_properties(code, Re=Re)
    return jsonify(props)

@app.route('/api/version')
def api_version():
    return jsonify({'version': APP_VERSION, 'name': APP_NAME})


# ─── Masaüstü modu: tarayıcı sekmesi kapanınca sunucu da kapanır ───
# Paketlenmiş uygulamanın penceresi ya da konsolu olmadığı için, sayfa düzenli aralıkla
# yoklama gönderir; yoklama kesilirse süreç kendini sonlandırır.
DESKTOP_MODE = False
HEARTBEAT_TIMEOUT = 150   # arka plandaki sekmelerde tarayıcı zamanlayıcıları dakikada bire düşebilir
CLOSE_GRACE = 6           # sayfa yenilemede yeni sayfanın yoklaması için tanınan süre
FIRST_CONTACT_TIMEOUT = 300
_presence = {'started': time.monotonic(), 'seen': None, 'closing': None}


@app.route('/api/heartbeat', methods=['POST'])
def api_heartbeat():
    _presence['seen'] = time.monotonic()
    _presence['closing'] = None
    return jsonify({'desktop': DESKTOP_MODE})


@app.route('/api/closing', methods=['POST'])
def api_closing():
    _presence['closing'] = time.monotonic()
    return '', 204


def _should_exit(now):
    seen, closing = _presence['seen'], _presence['closing']
    if seen is None:
        return now - _presence['started'] > FIRST_CONTACT_TIMEOUT
    if closing is not None and now - closing > CLOSE_GRACE:
        return True
    return now - seen > HEARTBEAT_TIMEOUT


def _watchdog():
    while True:
        time.sleep(1)
        if _should_exit(time.monotonic()):
            os._exit(0)


@app.route('/healthz')
def healthz():
    return 'ok', 200

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory(os.path.join(BASE_DIR, 'static'), path)

def _free_port(host, preferred):
    """Tercih edilen port doluysa (ör. macOS'ta 5000'i AirPlay kullanır) sonraki boş portu bulur."""
    import socket
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex((host, port)) != 0:
                return port
    return preferred


def _running_instance(host, port):
    """Portta zaten bir ZETA çalışıyorsa adresini döner."""
    import json
    import urllib.request
    url = f'http://{host}:{port}'
    try:
        with urllib.request.urlopen(url + '/api/version', timeout=0.5) as res:
            if json.load(res).get('name') == APP_NAME:
                return url
    except Exception:
        pass
    return None


def main():
    global DESKTOP_MODE
    import argparse
    import webbrowser

    parser = argparse.ArgumentParser(description='ZETA uçak tasarım aracını başlatır.')
    parser.add_argument('--host', default=os.environ.get('ZETA_HOST', '127.0.0.1'),
                        help='Dinlenecek adres (ağdan erişim için 0.0.0.0)')
    parser.add_argument('--port', type=int, default=int(os.environ.get('ZETA_PORT', 5000)))
    parser.add_argument('--no-browser', action='store_true', help='Tarayıcıyı otomatik açma')
    parser.add_argument('--desktop', action=argparse.BooleanOptionalAction, default=FROZEN,
                        help='Tarayıcı sekmesi kapanınca sunucuyu da kapat (paketlenmiş uygulamada varsayılan)')
    parser.add_argument('--version', action='version', version=f'ZETA {APP_VERSION}')
    args = parser.parse_args()

    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    # Debug modunda reloader süreci yeniden başlatır; port ve tarayıcı yalnızca ilk süreçte seçilir
    reloader_child = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    probe_host = '127.0.0.1' if args.host == '0.0.0.0' else args.host

    # Uygulama ikinci kez açılırsa yeni sunucu başlatmak yerine çalışan kopyaya gidilir
    if args.desktop and not reloader_child:
        existing = _running_instance(probe_host, args.port)
        if existing:
            if not args.no_browser:
                webbrowser.open(existing)
            return

    port = args.port if reloader_child else _free_port(probe_host, args.port)
    url = f'http://{probe_host}:{port}'

    if not reloader_child:
        print(f'ZETA v{APP_VERSION} çalışıyor: {url}  (durdurmak için Ctrl+C)')
        if not args.no_browser:
            threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    if args.desktop:
        DESKTOP_MODE = True
        threading.Thread(target=_watchdog, daemon=True).start()
    app.run(debug=debug, host=args.host, port=port)


if __name__ == '__main__':
    main()
