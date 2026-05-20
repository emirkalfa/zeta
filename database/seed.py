import sqlite3, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zeta.db')

def naca_4_digit_coordinates(code, n=150):
    m = int(code[0]) / 100.0
    p = int(code[1]) / 10.0
    t = int(code[2:4]) / 100.0

    beta = np.linspace(0, np.pi, n // 2 + 1)
    xc = (1 - np.cos(beta)) / 2.0

    yt = 5 * t * (0.2969 * np.sqrt(xc) - 0.1260 * xc - 0.3516 * xc**2 + 0.2843 * xc**3 - 0.1015 * xc**4)

    yc = np.zeros_like(xc)
    dyc_dx = np.zeros_like(xc)

    if m > 0 and p > 0:
        lower = xc <= p
        upper = xc > p
        yc[lower] = (m / p**2) * (2 * p * xc[lower] - xc[lower]**2)
        dyc_dx[lower] = (2 * m / p**2) * (p - xc[lower])
        yc[upper] = (m / (1 - p)**2) * (1 - 2 * p + 2 * p * xc[upper] - xc[upper]**2)
        dyc_dx[upper] = (2 * m / (1 - p)**2) * (p - xc[upper])

    theta = np.arctan(dyc_dx)
    yu = yc + yt * np.cos(theta)
    yl = yc - yt * np.cos(theta)
    xu = xc - yt * np.sin(theta)
    xl = xc + yt * np.sin(theta)

    coords = []
    for i in range(len(xc)):
        coords.append((round(xu[i], 6), round(yu[i], 6)))
    for i in range(len(xc) - 1, -1, -1):
        coords.append((round(xl[i], 6), round(yl[i], 6)))

    return coords

def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")

    airfoils = [
        ('NACA 0012', '0012', 0.0, 0.0, 12),
        ('NACA 2412', '2412', 2.0, 40.0, 12),
        ('NACA 4412', '4412', 4.0, 40.0, 12),
        ('NACA 2415', '2415', 2.0, 40.0, 15),
        ('NACA 0015', '0015', 0.0, 0.0, 15),
        ('NACA 4415', '4415', 4.0, 40.0, 15),
        ('NACA 23012', '23012', 2.0, 30.0, 12),
        ('NACA 6412', '6412', 6.0, 50.0, 12),
    ]

    for name, code, camber, camber_pos, thickness in airfoils:
        desc = f"{name}: M={camber}%, P={camber_pos}%, T={thickness}%"
        conn.execute(
            'INSERT OR IGNORE INTO airfoils (name, code, max_camber, max_camber_position, max_thickness, description) VALUES (?,?,?,?,?,?)',
            (name, code, camber / 100.0, camber_pos / 100.0, thickness / 100.0, desc)
        )

    conn.commit()

    for name, code, _, _, _ in airfoils:
        row = conn.execute('SELECT id FROM airfoils WHERE code=?', (code,)).fetchone()
        if not row:
            continue
        aid = row['id']
        existing = conn.execute('SELECT COUNT(*) as cnt FROM airfoil_coordinates WHERE airfoil_id=?', (aid,)).fetchone()['cnt']
        if existing > 0:
            continue

        coords = naca_4_digit_coordinates(code)
        for x, y in coords:
            y_u = max(0, y) if y > 0 else 0
            y_l = min(0, y) if y < 0 else 0
            conn.execute(
                'INSERT INTO airfoil_coordinates (airfoil_id, x, y_upper, y_lower) VALUES (?,?,?,?)',
                (aid, x, y_u, y_l)
            )

    conn.commit()
    conn.close()
    print("✅ Veritabanı başarıyla dolduruldu!")

if __name__ == '__main__':
    seed()
