CREATE TABLE IF NOT EXISTS airfoils (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'NACA 4-digit',
    max_camber REAL NOT NULL,
    max_camber_position REAL NOT NULL,
    max_thickness REAL NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS airfoil_coordinates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    airfoil_id INTEGER NOT NULL,
    x REAL NOT NULL,
    y_upper REAL NOT NULL,
    y_lower REAL NOT NULL,
    FOREIGN KEY (airfoil_id) REFERENCES airfoils(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Proje',
    wingspan REAL,
    weight REAL,
    airfoil_id INTEGER,
    wing_position TEXT DEFAULT 'mid',
    tail_type TEXT DEFAULT 'conventional',
    wing_junction TEXT DEFAULT 'through',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (airfoil_id) REFERENCES airfoils(id)
);
